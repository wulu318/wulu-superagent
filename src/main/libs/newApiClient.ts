/**
 * WULU Cloud & NewAPI Backend Client
 *
 * Two modes:
 * 1. Cloud Mode — Login to WULU Backend (ai.005656.xyz) for subscription, quota, memory sync
 * 2. Offline Mode — Direct NewAPI API Key, no login required
 */

import http from 'http';
import https from 'https';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NewAPIConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
}

// WULU Cloud config
export interface WuluCloudConfig {
  enabled: boolean;
  email: string;
  token: string; // JWT token from WULU Backend
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

// WULU Cloud login result
export interface WuluCloudLoginResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    planId: string | null;
    quotaRemaining: number;
    quotaTotal: number;
  };
  error?: string;
}

// WULU Cloud subscription info
export interface WuluCloudSubscriptionResult {
  success: boolean;
  subscription?: {
    active: boolean;
    planName?: string;
    features?: Record<string, unknown>;
    quotaMonthly?: number;
    expiresAt?: number;
  };
  error?: string;
}

// WULU Cloud register result
export interface WuluCloudRegisterResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
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

// ── WULU Cloud API ──────────────────────────────────────────────────────────

const WULU_CLOUD_BASE_URL = 'https://ai.005656.xyz';

/** WULU Cloud: Register a new account */
export async function wuluCloudRegister(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<WuluCloudRegisterResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL}/api/auth/register`;
    const raw = await makePostRequest(url, {
      email: input.email,
      password: input.password,
      displayName: input.displayName || '',
    });
    const data = JSON.parse(raw);
    if (data.token) {
      return {
        success: true,
        token: data.token,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName || '',
          role: data.user.role || 'user',
        } : undefined,
      };
    }
    return { success: false, error: data.error || 'Registration failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/** WULU Cloud: Login with email & password */
export async function wuluCloudLogin(input: {
  email: string;
  password: string;
}): Promise<WuluCloudLoginResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL}/api/auth/login`;
    const raw = await makePostRequest(url, {
      email: input.email,
      password: input.password,
    });
    const data = JSON.parse(raw);
    if (data.token) {
      return {
        success: true,
        token: data.token,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          displayName: data.user.displayName || '',
          role: data.user.role || 'user',
          planId: data.user.planId || null,
          quotaRemaining: data.user.quotaRemaining ?? 0,
          quotaTotal: data.user.quotaTotal ?? 0,
        } : undefined,
      };
    }
    return { success: false, error: data.error || 'Login failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/** WULU Cloud: Get current user profile */
export async function wuluCloudGetProfile(token: string): Promise<WuluCloudLoginResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL}/api/auth/me`;
    const raw = await makeRequest(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const data = JSON.parse(raw);
    return {
      success: true,
      user: {
        id: data.id,
        email: data.email,
        displayName: data.displayName || '',
        role: data.role || 'user',
        planId: data.planId || null,
        quotaRemaining: data.quotaRemaining ?? 0,
        quotaTotal: data.quotaTotal ?? 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch profile' };
  }
}

/** WULU Cloud: Get subscription info */
export async function wuluCloudGetSubscription(token: string): Promise<WuluCloudSubscriptionResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL}/api/plans/my-subscription`;
    const raw = await makeRequest(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const data = JSON.parse(raw);
    return {
      success: true,
      subscription: {
        active: data.active ?? false,
        planName: data.planName,
        features: data.features,
        quotaMonthly: data.quotaMonthly,
        expiresAt: data.expiresAt,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch subscription' };
  }
}

/** WULU Cloud: Refresh JWT token */
export async function wuluCloudRefreshToken(token: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const url = `${WULU_CLOUD_BASE_URL}/api/auth/refresh`;
    const raw = await makePostRequest(url, {}, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const data = JSON.parse(raw);
    if (data.token) {
      return { success: true, token: data.token };
    }
    return { success: false, error: data.error || 'Token refresh failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

// ── HTTP POST helper ─────────────────────────────────────────────────────────

function makePostRequest(url: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(body);
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(bodyStr)),
    };
    const finalHeaders = { ...defaultHeaders, ...headers };

    const req = mod.request(url, { method: 'POST', headers: finalHeaders, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        makeRequest(res.headers.location, finalHeaders).then(resolve).catch(reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}