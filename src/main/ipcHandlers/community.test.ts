import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CommunityAction, CommunityIpc, CommunityKind, type CommunityRequest } from '../../shared/community/constants';
import type { McpServerRecord } from '../mcp/mcpStore';
import type { SkillRecord } from '../skills/skillManager';
import { registerCommunityHandlers, resolveCommunityRoute } from './community';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(), fetch: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: unknown[]) => unknown) => electron.handlers.set(channel, handler) },
  net: { fetch: electron.fetch },
}));
let temp: string;
let skills: SkillRecord[];
let connectors: McpServerRecord[];
function register(token: string | null = 'private-main-session') {
  registerCommunityHandlers({ getToken: () => token, getSkills: () => skills, getConnectors: () => connectors });
}
beforeEach(() => {
  vi.clearAllMocks(); electron.handlers.clear(); connectors = [];
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wulu-community-ipc-'));
  const skillPath = path.join(temp, 'SKILL.md'); fs.writeFileSync(skillPath, '---\nname: writer\ndescription: Write documents\n---\nHelp write documents.');
  skills = [{ id: 'writer', name: 'Writer', description: 'Write documents', enabled: true, isOfficial: false, isBuiltIn: false, updatedAt: 1, prompt: '', skillPath, version: '1.0.0', source: 'local' }];
});
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

describe('automatic community publishing IPC', () => {
  test('rejects administrative actions and arbitrary endpoint paths', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(resolveCommunityRoute({ action: CommunityAction.List })).toEqual({ path: '/api/community/mine', method: 'GET' });
    expect(() => resolveCommunityRoute({ action: CommunityAction.Withdraw, id: '../review' })).toThrow();
    expect(() => resolveCommunityRoute({ action: 'approve', id } as unknown as CommunityRequest)).toThrow('Unsupported');
  });
  test('returns shareable capabilities without paths or connector secret values', async () => {
    skills.push({ ...skills[0], id: 'builtin', isBuiltIn: true });
    connectors.push({ id: 'service', name: 'Service', description: '', enabled: true, transportType: 'stdio', command: 'npx', args: ['mcp-service'], env: { API_KEY: 'personal-secret' }, isBuiltIn: false, createdAt: 1, updatedAt: 1 });
    register();
    const result = await electron.handlers.get(CommunityIpc.Sources)!({}, CommunityKind.Skill);
    expect(result).toMatchObject({ sources: [{ id: 'writer' }] });
    expect(JSON.stringify(result)).not.toContain(temp);
    const templates = await electron.handlers.get(CommunityIpc.Sources)!({}, CommunityKind.Connector);
    expect(JSON.stringify(templates)).toContain('API_KEY');
    expect(JSON.stringify(templates)).not.toContain('personal-secret');
  });
  test('uses the current main process login without returning its token', async () => {
    register(); electron.fetch.mockResolvedValue(new Response(JSON.stringify({ items: [] })));
    const result = await electron.handlers.get(CommunityIpc.Request)!({}, { action: CommunityAction.List });
    expect(electron.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/community/mine'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer private-main-session' }) }));
    expect(result).toEqual({ success: true, data: { items: [] } });
  });
  test('automatically packages a selected installed skill and uploads it', async () => {
    register(); electron.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'upload-id', size: 100 }), { status: 201 }));
    const result = await electron.handlers.get(CommunityIpc.Upload)!({}, ['writer']);
    expect(result).toMatchObject({ success: true, id: 'upload-id' });
    const body = Buffer.from(electron.fetch.mock.calls[0][1].body as ArrayBuffer);
    expect(body.subarray(0, 2).toString()).toBe('PK');
  });
  test('does not accept filesystem paths, unknown or built-in IDs for packaging', async () => {
    skills.push({ ...skills[0], id: 'builtin', isBuiltIn: true }); register();
    for (const ids of [['/private/file'], ['missing'], ['builtin'], [], ['writer', 'writer']]) {
      expect(await electron.handlers.get(CommunityIpc.Upload)!({}, ids)).toEqual({ success: false });
    }
    expect(electron.fetch).not.toHaveBeenCalled();
  });
  test('requires login before packaging and network operations', async () => {
    register(null);
    expect(await electron.handlers.get(CommunityIpc.Upload)!({}, ['writer'])).toEqual({ success: false, status: 401 });
    expect(await electron.handlers.get(CommunityIpc.Request)!({}, { action: CommunityAction.List })).toMatchObject({ status: 401 });
    expect(electron.fetch).not.toHaveBeenCalled();
  });
});
