/**
 * Tailwind CSS v3 plugin — bridges --Wulu-* CSS variables into Tailwind utility classes.
 *
 * Usage in tailwind.config.js:
 *   plugins: [require('./src/renderer/theme/tailwind/plugin.cjs')]
 *
 * Provides: bg-background, text-foreground, bg-primary, border-border, etc.
 * Also provides legacy claude.* aliases for backward compatibility.
 *
 * Colors are wrapped in color-mix() with the <alpha-value> placeholder so that
 * Tailwind opacity modifiers (e.g. text-foreground/90, bg-surface-raised/30)
 * generate working CSS. Without this, var()-based colors silently drop any
 * class that uses an opacity modifier.
 */
const plugin = require('tailwindcss/plugin');

const withAlpha = (variable) =>
  `color-mix(in srgb, var(${variable}) calc(<alpha-value> * 100%), transparent)`;

module.exports = plugin(function () {
  // The plugin itself is a no-op; we only extend the theme below.
}, {
  theme: {
    extend: {
      colors: {
        // === Semantic theme colors (driven by CSS variables) ===
        background:    withAlpha('--Wulu-background'),
        foreground:    withAlpha('--Wulu-foreground'),
        primary: {
          DEFAULT:     withAlpha('--Wulu-primary'),
          foreground:  withAlpha('--Wulu-primary-foreground'),
          hover:       withAlpha('--Wulu-primary-hover'),
          muted:       withAlpha('--Wulu-primary-muted'),
          dark:        withAlpha('--Wulu-primary-hover'),  // backward compat alias
        },
        accent: {
          DEFAULT:     withAlpha('--Wulu-accent'),
          foreground:  withAlpha('--Wulu-accent-foreground'),
        },
        surface: {
          DEFAULT:     withAlpha('--Wulu-surface'),
          foreground:  withAlpha('--Wulu-surface-foreground'),
          raised:      withAlpha('--Wulu-surface-raised'),
          overlay:     withAlpha('--Wulu-surface-overlay'),
          inset:       withAlpha('--Wulu-surface-raised'),  // alias
        },
        border: {
          DEFAULT:     withAlpha('--Wulu-border'),
          subtle:      withAlpha('--Wulu-border-subtle'),
          input:       withAlpha('--Wulu-input-border'),
        },
        muted:         withAlpha('--Wulu-text-muted'),
        destructive: {
          DEFAULT:     withAlpha('--Wulu-destructive'),
          foreground:  withAlpha('--Wulu-destructive-foreground'),
        },
        success:       withAlpha('--Wulu-success'),
        warning:       withAlpha('--Wulu-warning'),

        // === Legacy claude.* aliases (map to --Wulu-* for backward compat) ===
        claude: {
          bg:                withAlpha('--Wulu-background'),
          surface:           withAlpha('--Wulu-surface'),
          surfaceHover:      withAlpha('--Wulu-surface-raised'),
          surfaceMuted:      withAlpha('--Wulu-surface-raised'),
          surfaceInset:      withAlpha('--Wulu-surface-raised'),
          border:            withAlpha('--Wulu-border'),
          borderLight:       withAlpha('--Wulu-border-subtle'),
          text:              withAlpha('--Wulu-text-primary'),
          textSecondary:     withAlpha('--Wulu-text-secondary'),
          // dark.* aliases point to the same vars — theme handles light/dark
          darkBg:            withAlpha('--Wulu-background'),
          darkSurface:       withAlpha('--Wulu-surface'),
          darkSurfaceHover:  withAlpha('--Wulu-surface-raised'),
          darkSurfaceMuted:  withAlpha('--Wulu-surface-raised'),
          darkSurfaceInset:  withAlpha('--Wulu-surface-raised'),
          darkBorder:        withAlpha('--Wulu-border'),
          darkBorderLight:   withAlpha('--Wulu-border-subtle'),
          darkText:          withAlpha('--Wulu-text-primary'),
          darkTextSecondary: withAlpha('--Wulu-text-secondary'),
          // Accent
          accent:            withAlpha('--Wulu-primary'),
          accentHover:       withAlpha('--Wulu-primary-hover'),
          accentLight:       withAlpha('--Wulu-primary'),
          accentMuted:       withAlpha('--Wulu-primary-muted'),
        },
        secondary: {
          DEFAULT: withAlpha('--Wulu-text-secondary'),
          dark:    withAlpha('--Wulu-border'),
        },
      },
      borderRadius: {
        theme: 'var(--Wulu-radius)',
      },
    },
  },
});
