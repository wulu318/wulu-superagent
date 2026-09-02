const LEGACY_wulu_SESSION_PREFIX = 'wulu:';
const AGENT_SESSION_PREFIX = 'agent:';
const wulu_SESSION_MARKER = 'wulu';
const SUBAGENT_SESSION_MARKER = 'subagent';

export function isAskUserQuestionCandidateSessionKey(sessionKey: string | undefined | null): boolean {
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
  const rest = parts.slice(3).join(':').trim();
  if (!agentId || !rest) {
    return false;
  }

  // The desktop app builds managed session keys as `agent:{agentId}:WULU:{sessionId}`
  // (uppercase marker, see src/main/libs/openclawChannelSessionSync.ts), while this
  // plugin historically matched the lowercase `wulu` marker. Compare case-insensitively
  // so the AskUserQuestion tool registers for desktop sessions in both formats.
  const normalizedSource = source.toLowerCase();
  return normalizedSource === wulu_SESSION_MARKER || source === SUBAGENT_SESSION_MARKER;
}
