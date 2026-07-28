/**
 * WULU NewAPI Backend Client
 *
 * Connects to a NewAPI-compatible backend for user authentication,
 * quota management, and model listing.
 */

import http from 'http';
import https from 'https';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NewAPIConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

export interface NewAPIUserInfo {
  username: string;
  email: string;
  status: number;
  quota: number;
  usedQuota: number;
  requestCount: number;
}

export interface NewAPIQuotaInfo {
  remainQuota: number;
  usedQuota: number;
  totalQuota: number;
}

export interface NewAPIModel {
  id: string;
  object: string;
  owned_by: string;
}

export interface NewAPILoginResult {
  success: boolean;
  userInfo?: NewAPIUserInfo;
  quota?: NewAPIQuotaInfo;
  models?: NewAPIModel[];
  error?: string;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function makeRequest(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        makeRequest(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── API calls ────────────────────────────────────────────────────────────────

/** Normalize base URL (remove trailing slash) */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Fetch user info from NewAPI backend */
export async function fetchUserInfo(config: NewAPIConfig): Promise<NewAPIUserInfo> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const url = `${baseUrl}/api/user/self`;
  const headers = { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };

  const raw = await makeRequest(url, headers);
  const data = JSON.parse(raw);

  if (!data.success && data.status !== 'success') {
    throw new Error(data.message || 'Failed to fetch user info');
  }

  const d = data.data || data;
  return {
    username: d.username || d.display_name || 'unknown',
    email: d.email || '',
    status: d.status ?? 1,
    quota: d.quota ?? 0,
    usedQuota: d.used_quota ?? d.usedQuota ?? 0,
    requestCount: d.request_count ?? 0,
  };
}

/** Fetch quota info from NewAPI backend */
export async function fetchQuota(config: NewAPIConfig): Promise<NewAPIQuotaInfo> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  // Try /api/token/remain first
  try {
    const url = `${baseUrl}/api/token/remain`;
    const headers = { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };
    const raw = await makeRequest(url, headers);
    const data = JSON.parse(raw);

    if (data.success !== false) {
      const d = data.data || data;
      return {
        remainQuota: d.remain_quota ?? d.remainQuota ?? 0,
        usedQuota: d.used_quota ?? d.usedQuota ?? 0,
        totalQuota: d.total_quota ?? d.totalQuota ?? 0,
      };
    }
  } catch {
    // Fallback to user info quota
  }

  // Fallback: use user info
  const userInfo = await fetchUserInfo(config);
  return {
    remainQuota: userInfo.quota - userInfo.usedQuota,
    usedQuota: userInfo.usedQuota,
    totalQuota: userInfo.quota,
  };
}

/** Fetch available models from NewAPI backend */
export async function fetchModels(config: NewAPIConfig): Promise<NewAPIModel[]> {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const url = `${baseUrl}/v1/models`;
  const headers = { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' };

  try {
    const raw = await makeRequest(url, headers);
    const data = JSON.parse(raw);
    return data.data || [];
  } catch {
    return [];
  }
}

/** Full login validation: check API key + fetch user + quota + models */
export async function validateAndLogin(config: NewAPIConfig): Promise<NewAPILoginResult> {
  if (!config.baseUrl || !config.apiKey) {
    return { success: false, error: 'Base URL and API Key are required' };
  }

  try {
    const [userInfo, quota, models] = await Promise.all([
      fetchUserInfo(config),
      fetchQuota(config).catch(() => null),
      fetchModels(config).catch(() => []),
    ]);

    return {
      success: true,
      userInfo,
      quota: quota || undefined,
      models: models.length > 0 ? models : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Connection failed',
    };
  }
}

/** Format quota for display (NewAPI uses 1 quota = 500000 tokens typically) */
export function formatQuota(quota: number): string {
  // NewAPI quota unit: 1 quota = 500000 tokens (configurable)
  // Display as approximate USD or tokens
  if (quota >= 1000000) {
    return `$${(quota / 500000).toFixed(2)}`;
  }
  if (quota >= 1000) {
    return `${(quota / 1000).toFixed(1)}K`;
  }
  return `${quota}`;
}

/** Convert quota to approximate token count */
export function quotaToTokens(quota: number): number {
  // Standard NewAPI: 1 quota = 500000 tokens
  return quota * 500000;
}