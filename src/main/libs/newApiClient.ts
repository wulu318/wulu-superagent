/**
 * WULU Cloud & NewAPI Backend Client
 *
 * Two modes:
 * 1. Cloud Mode — Login to WULU Backend (ai.005656.xyz) for subscription, quota, memory sync
 * 2. Offline Mode — Direct NewAPI API Key, no login required
 */

import http from 'http';
import https from 'https';

import { getServerApiBaseUrl } from './endpoints';

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

export interface WuluCloudPlan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  quotaMonthly: number;
  features: Record<string, unknown>;
  modelAccess: string[];
  maxContextTokens: number;
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

function makeRequest(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise<string>((resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
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
    const response = JSON.parse(raw);
    const data = response.data ?? response;

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
      fetchQuota(config).catch((): null => null),
      fetchModels(config).catch((): NewAPIModel[] => []),
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

const WULU_CLOUD_BASE_URL = (): string => getServerApiBaseUrl();

export async function wuluCloudSendVerificationCode(input: { email: string }): Promise<{ success: boolean; expiresIn?: number; code?: string; error?: string }> {
  try {
    const raw = await makePostRequest(`${WULU_CLOUD_BASE_URL()}/api/auth/verification/send`, input);
    const data = JSON.parse(raw);
    return data.success ? data : { success: false, error: data.error || 'Failed to send verification code' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

export async function wuluCloudGetPlans(): Promise<{ success: boolean; plans?: WuluCloudPlan[]; error?: string }> {
  try {
    const raw = await makeRequest(`${WULU_CLOUD_BASE_URL()}/api/plans`, { 'Content-Type': 'application/json' });
    const response = JSON.parse(raw);
    const data = response.data ?? response;
    if (!Array.isArray(data)) return { success: false, error: data.error || 'Failed to load plans' };
    return { success: true, plans: data.map((plan: any) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description || '',
      priceMonthly: Number(plan.price_monthly) || 0,
      priceYearly: Number(plan.price_yearly) || 0,
      quotaMonthly: Number(plan.quota_monthly) || 0,
      features: plan.features || {},
      modelAccess: plan.modelAccess || [],
      maxContextTokens: Number(plan.max_context_tokens) || 4096,
    })) };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

/** WULU Cloud: Register a new account */
export async function wuluCloudRegister(input: {
  email: string;
  password: string;
  verificationCode: string;
  displayName?: string;
}): Promise<WuluCloudRegisterResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL()}/api/auth/register`;
    const raw = await makePostRequest(url, {
      email: input.email,
      password: input.password,
      verificationCode: input.verificationCode,
      displayName: input.displayName || '',
    });
    const response = JSON.parse(raw);
    const data = response.data ?? response;
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
    const url = `${WULU_CLOUD_BASE_URL()}/api/auth/login`;
    const raw = await makePostRequest(url, {
      email: input.email,
      password: input.password,
    });
    const response = JSON.parse(raw);
    const data = response.data ?? response;
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
    const url = `${WULU_CLOUD_BASE_URL()}/api/auth/me`;
    const raw = await makeRequest(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const data = JSON.parse(raw);
    const user = data.data ?? data;
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName || '',
        role: user.role || 'user',
        planId: user.planId || null,
        quotaRemaining: user.quotaRemaining ?? user.quota?.remaining ?? 0,
        quotaTotal: user.quotaTotal ?? user.quota?.total ?? 0,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch profile' };
  }
}

/** WULU Cloud: Get subscription info */
export async function wuluCloudGetSubscription(token: string): Promise<WuluCloudSubscriptionResult> {
  try {
    const url = `${WULU_CLOUD_BASE_URL()}/api/plans/my-subscription`;
    const raw = await makeRequest(url, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const envelope = JSON.parse(raw);
    const data = envelope.data ?? envelope;
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
    const url = `${WULU_CLOUD_BASE_URL()}/api/auth/refresh`;
    const raw = await makePostRequest(url, {}, { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' });
    const response = JSON.parse(raw);
    const data = response.data ?? response;
    if (data.token) {
      return { success: true, token: data.token };
    }
    return { success: false, error: data.error || 'Token refresh failed' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

async function wuluCloudAuthorizedRequest<T>(token: string, path: string, method = 'GET', body?: Record<string, unknown>): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const url = `${WULU_CLOUD_BASE_URL()}${path}`;
    const raw = await makeAuthorizedRequest(url, method, token, body);
    const data = JSON.parse(raw);
    if (data.error || data.code && data.code !== 0) return { success: false, error: data.error || data.message || 'Request failed' };
    return { success: true, data: (data.data ?? data) as T };
  } catch (err: any) {
    return { success: false, error: err.message || 'Connection failed' };
  }
}

export async function wuluCloudGetUsage(token: string, period: '7d' | '30d' | '90d' = '7d') {
  return wuluCloudAuthorizedRequest<{ period: string; daily: Array<Record<string, unknown>>; models: Array<Record<string, unknown>> }>(token, `/api/user/usage?period=${period}`);
}

export async function wuluCloudListMemory(token: string, limit = 50, offset = 0) {
  return wuluCloudAuthorizedRequest<Array<Record<string, unknown>>>(token, `/api/memory/entries?limit=${limit}&offset=${offset}`);
}

export async function wuluCloudCreateMemory(token: string, content: string, layer = 'working', tags: string[] = []) {
  return wuluCloudAuthorizedRequest<Record<string, unknown>>(token, '/api/memory/entries', 'POST', { content, layer, tags });
}

export async function wuluCloudUpdateMemory(token: string, id: string, content: string, layer?: string, tags?: string[]) {
  return wuluCloudAuthorizedRequest<Record<string, unknown>>(token, `/api/memory/entries/${encodeURIComponent(id)}`, 'PUT', { content, layer, tags });
}

export async function wuluCloudDeleteMemory(token: string, id: string) {
  return wuluCloudAuthorizedRequest<Record<string, unknown>>(token, `/api/memory/entries/${encodeURIComponent(id)}`, 'DELETE');
}

function makeAuthorizedRequest(url: string, method: string, token: string, body?: Record<string, unknown>): Promise<string> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const mod = urlObj.protocol === 'https:' ? https : http;
    const bodyStr = body && method !== 'GET' && method !== 'DELETE' ? JSON.stringify(body) : '';
    const req = mod.request(urlObj, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': String(Buffer.byteLength(bodyStr)) } : {}),
      },
      timeout: 10000,
    }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const result = Buffer.concat(chunks).toString('utf-8');
        if ((res.statusCode || 500) >= 400) {
          try { reject(new Error(JSON.parse(result).error || `HTTP ${res.statusCode}`)); }
          catch { reject(new Error(`HTTP ${res.statusCode}`)); }
          return;
        }
        resolve(result);
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── HTTP POST helper ─────────────────────────────────────────────────────────

function makePostRequest(url: string, body: Record<string, unknown>, headers?: Record<string, string>): Promise<string> {
  return new Promise<string>((resolve: (value: string) => void, reject: (reason?: unknown) => void) => {
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
