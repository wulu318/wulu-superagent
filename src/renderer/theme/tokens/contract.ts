/**
 * Token Contract — defines all semantic variables a theme must provide.
 *
 * Naming: --Wulu-{category}-{name}
 * Convention: shadcn/ui background/foreground pairing + Radix 12-step gray scale
 *
 * Every theme (ThemeDefinition.tokens) must supply a value for each key.
 */
export const TOKEN_CONTRACT = {
  // ── Brand ──
  'primary':            '--Wulu-primary',
  'primary-foreground': '--Wulu-primary-foreground',
  'primary-hover':      '--Wulu-primary-hover',
  'primary-muted':      '--Wulu-primary-muted',

  // ── Accent ──
  'accent':             '--Wulu-accent',
  'accent-foreground':  '--Wulu-accent-foreground',

  // ── Surface / Background ──
  'background':         '--Wulu-background',
  'foreground':         '--Wulu-foreground',
  'surface':            '--Wulu-surface',
  'surface-foreground': '--Wulu-surface-foreground',
  'surface-raised':     '--Wulu-surface-raised',
  'surface-overlay':    '--Wulu-surface-overlay',

  // ── Chat bubbles ──
  'chat-user':              '--Wulu-chat-user',
  'chat-user-foreground':   '--Wulu-chat-user-foreground',
  'chat-bot':               '--Wulu-chat-bot',
  'chat-bot-foreground':    '--Wulu-chat-bot-foreground',

  // ── Text hierarchy ──
  'text-primary':       '--Wulu-text-primary',
  'text-secondary':     '--Wulu-text-secondary',
  'text-muted':         '--Wulu-text-muted',

  // ── Borders ──
  'border':             '--Wulu-border',
  'border-subtle':      '--Wulu-border-subtle',
  'input-border':       '--Wulu-input-border',

  // ── Scrollbar ──
  'scroll-thumb':       '--Wulu-scroll-thumb',
  'scroll-thumb-hover': '--Wulu-scroll-thumb-hover',

  // ── Decorative gradients ──
  'gradient-1':         '--Wulu-gradient-1',
  'gradient-2':         '--Wulu-gradient-2',

  // ── Status ──
  'destructive':            '--Wulu-destructive',
  'destructive-foreground': '--Wulu-destructive-foreground',
  'success':                '--Wulu-success',
  'warning':                '--Wulu-warning',

  // ── Gray scale 11 steps (gray-1=lightest → gray-11=darkest, all themes) ──
  'gray-1':  '--Wulu-gray-1',
  'gray-2':  '--Wulu-gray-2',
  'gray-3':  '--Wulu-gray-3',
  'gray-4':  '--Wulu-gray-4',
  'gray-5':  '--Wulu-gray-5',
  'gray-6':  '--Wulu-gray-6',
  'gray-7':  '--Wulu-gray-7',
  'gray-8':  '--Wulu-gray-8',
  'gray-9':  '--Wulu-gray-9',
  'gray-10': '--Wulu-gray-10',
  'gray-11': '--Wulu-gray-11',

  // ── Radius ──
  'radius':  '--Wulu-radius',
} as const;

export type TokenName = keyof typeof TOKEN_CONTRACT;
export type CSSVarName = (typeof TOKEN_CONTRACT)[TokenName];

/** All token keys as an array */
export const TOKEN_NAMES = Object.keys(TOKEN_CONTRACT) as TokenName[];
