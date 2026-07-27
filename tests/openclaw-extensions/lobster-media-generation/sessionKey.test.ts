import { describe, expect, test } from 'vitest';

import { iswuluDesktopSessionKey } from '../../../openclaw-extensions/Wulu-media-generation/sessionKey';

describe('Wulu-media-generation session key gating', () => {
  test('allows main agent desktop sessions', () => {
    expect(iswuluDesktopSessionKey('agent:main:wulu:session-1')).toBe(true);
  });

  test('allows non-main agent desktop sessions', () => {
    expect(iswuluDesktopSessionKey('agent:creative-agent:wulu:session-2')).toBe(true);
  });

  test('allows materialized subagent child sessions', () => {
    expect(iswuluDesktopSessionKey('agent:creative-agent:subagent:run-1')).toBe(true);
  });

  test('allows legacy desktop sessions', () => {
    expect(iswuluDesktopSessionKey('wulu:session-3')).toBe(true);
  });

  test('rejects channel and malformed session keys', () => {
    expect(iswuluDesktopSessionKey('agent:creative-agent:dingtalk-connector:direct:user-1')).toBe(false);
    expect(iswuluDesktopSessionKey('')).toBe(false);
    expect(iswuluDesktopSessionKey('agent::wulu:session-4')).toBe(false);
    expect(iswuluDesktopSessionKey('agent:creative-agent:wulu:')).toBe(false);
    expect(iswuluDesktopSessionKey('agent:creative-agent')).toBe(false);
  });
});
