import { ipcMain, net } from 'electron';

import {
  CommunityAction, CommunityIpc, CommunityKind, type CommunityRequest, type CommunityResponse, type CommunitySource, type CommunityUploadResult,
} from '../../shared/community/constants';
import { communityBundleId, connectorTemplate, packageCommunitySkills } from '../libs/communityBundle';
import { getServerApiBaseUrl } from '../libs/endpoints';
import type { McpServerRecord } from '../mcp/mcpStore';
import type { SkillRecord } from '../skills/skillManager';

export function resolveCommunityRoute(request: CommunityRequest): { path: string; method: string } {
  if (request.action === CommunityAction.List) return { path: '/api/community/mine', method: 'GET' };
  if (request.action === CommunityAction.Submit) return { path: '/api/community/submissions', method: 'POST' };
  if (!request.id || !/^[a-f0-9-]{36}$/.test(request.id)) throw new Error('Invalid submission ID');
  const base = `/api/community/submissions/${request.id}`;
  switch (request.action) {
    case CommunityAction.Update: return { path: base, method: 'PUT' };
    case CommunityAction.Withdraw: return { path: base, method: 'DELETE' };
    case CommunityAction.History: return { path: `${base}/history`, method: 'GET' };
    default: throw new Error('Unsupported community action');
  }
}

export function registerCommunityHandlers(options: {
  getToken: () => string | null | undefined;
  getSkills: () => SkillRecord[];
  getConnectors: () => McpServerRecord[];
}): void {
  ipcMain.handle(CommunityIpc.Sources, (_event, kind: CommunityKind): { success: boolean; sources: CommunitySource[] } => {
    if (kind === CommunityKind.Connector) {
      return { success: true, sources: options.getConnectors().filter(source => !source.isBuiltIn).map(source => ({
        id: source.id, name: source.name, description: source.description, version: '1.0.0', connector: connectorTemplate(source),
      })) };
    }
    if (kind !== CommunityKind.Skill && kind !== CommunityKind.Expert) return { success: false, sources: [] };
    return { success: true, sources: options.getSkills().filter(skill => !skill.isBuiltIn).map(skill => ({
      id: skill.id, bundleId: communityBundleId(skill.id), name: skill.name, description: skill.description,
      version: /^\d+\.\d+\.\d+$/.test(skill.version || '') ? skill.version! : '1.0.0',
    })) };
  });
  ipcMain.handle(CommunityIpc.Request, async (_event, request: CommunityRequest): Promise<CommunityResponse> => {
    try {
      const token = options.getToken();
      if (!token) return { success: false, status: 401 };
      const route = resolveCommunityRoute(request);
      const response = await net.fetch(`${getServerApiBaseUrl()}${route.path}`, {
        method: route.method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: route.method === 'POST' || route.method === 'PUT' ? JSON.stringify(request.body) : undefined,
        signal: AbortSignal.timeout(30000),
        redirect: 'error',
      });
      if (!response.ok) {
        const error = await response.json().catch((): null => null) as { error?: string } | null;
        return { success: false, status: response.status, error: error?.error };
      }
      return { success: true, data: await response.json() as CommunityResponse['data'] };
    } catch (error) {
      console.warn('[Community] request failed:', error);
      return { success: false };
    }
  });

  // The renderer selects installed skill IDs. Resolve their paths here and
  // automatically build the upload; never accept renderer supplied file paths.
  ipcMain.handle(CommunityIpc.Upload, async (_event, ids: string[]): Promise<CommunityUploadResult> => {
    try {
      const token = options.getToken();
      if (!token) return { success: false, status: 401 };
      if (!Array.isArray(ids) || !ids.length || ids.length > 30 || new Set(ids).size !== ids.length) return { success: false };
      const installed = options.getSkills().filter(skill => !skill.isBuiltIn);
      const skills = ids.map(id => installed.find(skill => skill.id === id));
      if (skills.some(skill => !skill)) return { success: false };
      const content = await packageCommunitySkills(skills.filter((skill): skill is SkillRecord => Boolean(skill)).map(skill => ({ id: communityBundleId(skill.id), skillPath: skill.skillPath })));
      const response = await net.fetch(`${getServerApiBaseUrl()}/api/community/uploads`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
        body: new Uint8Array(content).buffer, signal: AbortSignal.timeout(120000), redirect: 'error',
      });
      const data = await response.json().catch((): null => null) as { id?: string; size?: number; error?: string } | null;
      if (!response.ok || !data?.id) return { success: false, status: response.status, error: data?.error };
      return { success: true, id: data.id, size: data.size };
    } catch (error) {
      console.warn('[Community] upload failed:', error);
      return { success: false };
    }
  });
}
