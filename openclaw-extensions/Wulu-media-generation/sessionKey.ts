const LEGACY_wulu_SESSION_PREFIX = 'wulu:';
const AGENT_SESSION_PREFIX = 'agent:';
const wulu_SESSION_MARKER = 'wulu';
const SUBAGENT_SESSION_MARKER = 'subagent';

export function iswuluDesktopSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = (sessionKey ?? '').trim();
  if (!raw) return false;

  if (raw.startsWith(LEGACY_wulu_SESSION_PREFIX)) {
    return raw.slice(LEGACY_wulu_SESSION_PREFIX.length).trim().length > 0;
  }

  if (!raw.startsWith(AGENT_SESSION_PREFIX)) {
    return false;
  }

  const parts = raw.split(':');
  if (parts.length < 4 || parts[0] !== 'agent') {
    return false;
  }

  const agentId = parts[1]?.trim() ?? '';
  const source = parts[2]?.trim() ?? '';
  const sessionId = parts.slice(3).join(':').trim();
  // The desktop app builds managed session keys as `agent:{agentId}:WULU:{sessionId}`
  // (uppercase marker, see src/main/libs/openclawChannelSessionSync.ts). Compare
  // case-insensitively so this plugin registers tools for desktop sessions.
  const normalizedSource = source.toLowerCase();
  return agentId.length > 0
    && sessionId.length > 0
    && (normalizedSource === wulu_SESSION_MARKER || source === SUBAGENT_SESSION_MARKER);
}
