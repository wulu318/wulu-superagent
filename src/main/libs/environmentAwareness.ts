/* eslint-disable simple-import-sort/imports */
/**
 * WULU Environment Awareness Engine
 *
 * Collects environmental context (time, weather, system status, calendar)
 * and formats it for injection into the agent's system prompt.
 */

import https from 'https';
import os from 'os';

import { getPendingFutureMessages, type EnvironmentSnapshot } from './advancedMemory';

// ── Solar terms ──────────────────────────────────────────────────────────────

const SOLAR_TERMS_2026: [string, string][] = [
  ['01-05', '小寒'], ['01-20', '大寒'], ['02-04', '立春'], ['02-19', '雨水'],
  ['03-06', '惊蛰'], ['03-21', '春分'], ['04-05', '清明'], ['04-20', '谷雨'],
  ['05-06', '立夏'], ['05-21', '小满'], ['06-05', '芒种'], ['06-21', '夏至'],
  ['07-07', '小暑'], ['07-23', '大暑'], ['08-07', '立秋'], ['08-23', '处暑'],
  ['09-07', '白露'], ['09-23', '秋分'], ['10-08', '寒露'], ['10-23', '霜降'],
  ['11-07', '立冬'], ['11-22', '小雪'], ['12-07', '大雪'], ['12-22', '冬至'],
];

function getSolarTerm(date: Date): string | undefined {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let current: string | undefined;
  for (const [termDate, termName] of SOLAR_TERMS_2026) {
    if (mmdd >= termDate) current = termName;
    if (mmdd < termDate) break;
  }
  return current;
}

// ── Weekday ─────────────────────────────────────────────────────────────────

const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// ── System status ───────────────────────────────────────────────────────────

function getSystemStatus(): { cpuPercent: number; memoryPercent: number; diskFreeGB: number } {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

  // CPU usage approximation (load average on *nix, fallback on Windows)
  let cpuPercent = 0;
  const loadAvg = os.loadavg();
  if (loadAvg.length > 0) {
    cpuPercent = Math.min(100, Math.round((loadAvg[0] / os.cpus().length) * 100));
  }

  return { cpuPercent, memoryPercent, diskFreeGB: 0 };
}

// ── Weather ──────────────────────────────────────────────────────────────────

interface WeatherResult {
  city: string;
  temperature: number;
  description: string;
}

export async function fetchWeather(city: string): Promise<WeatherResult | null> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const result = await new Promise<Buffer>((resolve, reject) => {
      https.get(url, { timeout: 5000 }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    const data = JSON.parse(result.toString('utf-8'));
    const current = data.current_condition?.[0];
    if (!current) return null;

    return {
      city,
      temperature: parseInt(current.temp_C, 10),
      description: current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || 'unknown',
    };
  } catch {
    return null;
  }
}

// ── Time ago formatting ─────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

// ── Main: Build environment snapshot ─────────────────────────────────────────

export function buildEnvironmentSnapshot(
  options: {
    includeTime?: boolean;
    includeWeather?: boolean;
    includeSystem?: boolean;
    includeCalendar?: boolean;
    weatherCity?: string;
    workspaceDir?: string;
    lastConversationTimestamp?: number;
  } = {},
): EnvironmentSnapshot {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const weekday = WEEKDAYS_ZH[now.getDay()];
  const time = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const solarTerm = getSolarTerm(now);

  const snapshot: EnvironmentSnapshot = {
    timestamp: now.getTime(),
    date,
    weekday,
    time,
    solarTerm,
    pendingFutureMessages: 0,
  };

  if (options.includeSystem) {
    snapshot.systemStatus = getSystemStatus();
  }

  if (options.includeCalendar && options.workspaceDir) {
    try {
      const messages = getPendingFutureMessages(options.workspaceDir);
      snapshot.pendingFutureMessages = messages.length;
    } catch {
      snapshot.pendingFutureMessages = 0;
    }
  }

  if (options.lastConversationTimestamp) {
    snapshot.lastConversationAgo = formatTimeAgo(options.lastConversationTimestamp);
  }

  return snapshot;
}

/** Build async parts (weather) and return full snapshot */
export async function buildFullEnvironmentSnapshot(
  options: {
    includeTime?: boolean;
    includeWeather?: boolean;
    includeSystem?: boolean;
    includeCalendar?: boolean;
    weatherCity?: string;
    workspaceDir?: string;
    lastConversationTimestamp?: number;
  } = {},
): Promise<EnvironmentSnapshot> {
  const snapshot = buildEnvironmentSnapshot(options);

  if (options.includeWeather && options.weatherCity) {
    snapshot.weather = await fetchWeather(options.weatherCity) || undefined;
  }

  return snapshot;
}

// ── Format snapshot for injection into system prompt ──────────────────────────

export function formatEnvironmentForPrompt(snapshot: EnvironmentSnapshot): string {
  const lines: string[] = ['[环境感知]'];

  if (snapshot.solarTerm) {
    lines.push(`当前时间：${snapshot.date} ${snapshot.weekday} ${snapshot.time} | 节气：${snapshot.solarTerm}`);
  } else {
    lines.push(`当前时间：${snapshot.date} ${snapshot.weekday} ${snapshot.time}`);
  }

  if (snapshot.weather) {
    lines.push(`天气：${snapshot.weather.city} ${snapshot.weather.temperature}°C ${snapshot.weather.description}`);
  }

  if (snapshot.systemStatus) {
    const s = snapshot.systemStatus;
    lines.push(`系统状态：CPU ${s.cpuPercent}% | 内存 ${s.memoryPercent}%`);
  }

  if (snapshot.pendingFutureMessages > 0) {
    lines.push(`待办提醒：${snapshot.pendingFutureMessages} 条待送达的未来留言`);
  }

  if (snapshot.lastConversationAgo) {
    lines.push(`上次对话：${snapshot.lastConversationAgo}`);
  }

  return lines.join('\n');
}