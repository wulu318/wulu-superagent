import './skinPresentation.css';

import React, { type CSSProperties } from 'react';

import type { SkinPresentation } from '../../../shared/skin/presentation';
import { useSkin } from '../../providers/SkinProvider';

type SkinPresentationStyle = CSSProperties & Record<`--Wulu-skin-${string}`, string>;

export const buildSkinPresentationStyle = (
  presentation: SkinPresentation,
): SkinPresentationStyle => ({
  '--Wulu-skin-canvas': presentation.palette.canvas,
  '--Wulu-skin-panel': presentation.palette.panel,
  '--Wulu-skin-panel-raised': presentation.palette.panelRaised,
  '--Wulu-skin-accent': presentation.palette.accent,
  '--Wulu-skin-accent-foreground': presentation.palette.accentForeground,
  '--Wulu-skin-accent-alt': presentation.palette.accentAlt,
  '--Wulu-skin-foreground': presentation.palette.foreground,
  '--Wulu-skin-muted': presentation.palette.muted,
  '--Wulu-skin-border': presentation.palette.border,
  '--Wulu-skin-focus-x': `${(presentation.art?.focusX ?? 0.5) * 100}%`,
  '--Wulu-skin-focus-y': `${(presentation.art?.focusY ?? 0.5) * 100}%`,
});

interface SkinPresentationScopeProps extends React.HTMLAttributes<HTMLDivElement> {
  enabled: boolean;
}

const SkinPresentationScope: React.FC<SkinPresentationScopeProps> = ({
  children,
  enabled,
  style,
  ...props
}) => {
  const { activeSkin } = useSkin();
  const presentation = enabled ? activeSkin?.presentation : undefined;

  return (
    <div
      {...props}
      data-skin-presentation={presentation?.mode}
      style={presentation ? { ...style, ...buildSkinPresentationStyle(presentation) } : style}
    >
      {children}
    </div>
  );
};

export default SkinPresentationScope;
