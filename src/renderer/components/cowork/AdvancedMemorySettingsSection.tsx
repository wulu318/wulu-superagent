import React from 'react';

import { i18nService } from '../../services/i18n';

interface AdvancedMemorySettingsSectionProps {
  advancedMemoryEnabled: boolean;
  layeredMemoryEnabled: boolean;
  tagAssociationEnabled: boolean;
  tagAssociationDepth: number;
  proactiveDiaryEnabled: boolean;
  diaryAutoTag: boolean;
  futureMessageEnabled: boolean;
  onAdvancedMemoryEnabledChange: (value: boolean) => void;
  onLayeredMemoryEnabledChange: (value: boolean) => void;
  onTagAssociationEnabledChange: (value: boolean) => void;
  onTagAssociationDepthChange: (value: number) => void;
  onProactiveDiaryEnabledChange: (value: boolean) => void;
  onDiaryAutoTagChange: (value: boolean) => void;
  onFutureMessageEnabledChange: (value: boolean) => void;
}

const ToggleSwitch: React.FC<{
  checked: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}> = ({ checked, label, description, disabled, onChange }) => (
  <div className="flex items-center justify-between gap-4">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">{label}</div>
      {description && <div className="text-xs text-secondary mt-0.5">{description}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${checked ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

const AdvancedMemorySettingsSection: React.FC<AdvancedMemorySettingsSectionProps> = ({
  advancedMemoryEnabled,
  layeredMemoryEnabled,
  tagAssociationEnabled,
  tagAssociationDepth,
  proactiveDiaryEnabled,
  diaryAutoTag,
  futureMessageEnabled,
  onAdvancedMemoryEnabledChange,
  onLayeredMemoryEnabledChange,
  onTagAssociationEnabledChange,
  onTagAssociationDepthChange,
  onProactiveDiaryEnabledChange,
  onDiaryAutoTagChange,
  onFutureMessageEnabledChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Master Switch */}
      <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
        <ToggleSwitch
          checked={advancedMemoryEnabled}
          label={i18nService.t('advancedMemoryEnabled')}
          description={i18nService.t('advancedMemoryEnabledHint')}
          onChange={onAdvancedMemoryEnabledChange}
        />
      </div>

      {advancedMemoryEnabled && (
        <>
          {/* Layered Memory */}
          <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
            <ToggleSwitch
              checked={layeredMemoryEnabled}
              label={i18nService.t('layeredMemoryEnabled')}
              description={i18nService.t('layeredMemoryEnabledHint')}
              onChange={onLayeredMemoryEnabledChange}
            />
          </div>

          {/* Tag Association */}
          <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
            <ToggleSwitch
              checked={tagAssociationEnabled}
              label={i18nService.t('tagAssociationEnabled')}
              description={i18nService.t('tagAssociationEnabledHint')}
              onChange={onTagAssociationEnabledChange}
            />
            {tagAssociationEnabled && (
              <div className="pt-2">
                <label className="block text-xs font-medium text-foreground mb-1">
                  {i18nService.t('tagAssociationDepth')}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={tagAssociationDepth}
                    onChange={(e) => onTagAssociationDepthChange(Number(e.target.value))}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 dark:bg-gray-700 accent-primary"
                  />
                  <span className="text-sm font-mono text-foreground min-w-[2rem] text-center">
                    {tagAssociationDepth}
                  </span>
                </div>
                <div className="text-xs text-secondary mt-1">
                  {i18nService.t('tagAssociationDepthHint')}
                </div>
              </div>
            )}
          </div>

          {/* Proactive Diary */}
          <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
            <ToggleSwitch
              checked={proactiveDiaryEnabled}
              label={i18nService.t('proactiveDiaryEnabled')}
              description={i18nService.t('proactiveDiaryEnabledHint')}
              onChange={onProactiveDiaryEnabledChange}
            />
            {proactiveDiaryEnabled && (
              <div className="pt-2">
                <ToggleSwitch
                  checked={diaryAutoTag}
                  label={i18nService.t('diaryAutoTag')}
                  description={i18nService.t('diaryAutoTagHint')}
                  onChange={onDiaryAutoTagChange}
                />
              </div>
            )}
          </div>

          {/* Future Message */}
          <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
            <ToggleSwitch
              checked={futureMessageEnabled}
              label={i18nService.t('futureMessageEnabled')}
              description={i18nService.t('futureMessageEnabledHint')}
              onChange={onFutureMessageEnabledChange}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AdvancedMemorySettingsSection;
