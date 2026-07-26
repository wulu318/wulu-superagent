import { describe, expect, test } from 'vitest';

import { isWULUDesktopSessionKey } from '../../../openclaw-extensions/Wulu-media-generation/sessionKey';

describe('Wulu-media-generation session key gating', () => {
  test('allows main agent desktop sessions', () => {
    expect(isWULUDesktopSessionKey('agent:main:WULU:session-1')).toBe(true);
  });

  test('allows non-main agent desktop sessions', () => {
    expect(isWULUDesktopSessionKey('agent:creative-agent:WULU:session-2')).toBe(true);
  });

  test('allows materialized subagent child sessions', () => {
    expect(isWULUDesktopSessionKey('agent:creative-agent:subagent:run-1')).toBe(true);
  });

  test('allows legacy desktop sessions', () => {
    expect(isWULUDesktopSessionKey('WULU:session-3')).toBe(true);
  });

  test('rejects channel and malformed session keys', () => {
    expect(isWULUDesktopSessionKey('agent:creative-agent:dingtalk-connector:direct:user-1')).toBe(false);
    expect(isWULUDesktopSessionKey('')).toBe(false);
    expect(isWULUDesktopSessionKey('agent::WULU:session-4')).toBe(false);
    expect(isWULUDesktopSessionKey('agent:creative-agent:WULU:')).toBe(false);
    expect(isWULUDesktopSessionKey('agent:creative-agent')).toBe(false);
  });
});
