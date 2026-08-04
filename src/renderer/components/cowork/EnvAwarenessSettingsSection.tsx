import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';

interface EnvAwarenessSettingsSectionProps {
  envAwarenessEnabled: boolean;
  envTimeEnabled: boolean;
  envWeatherEnabled: boolean;
  envWeatherCity: string;
  envSystemStatusEnabled: boolean;
  envCalendarEnabled: boolean;
  onEnvAwarenessEnabledChange: (value: boolean) => void;
  onEnvTimeEnabledChange: (value: boolean) => void;
  onEnvWeatherEnabledChange: (value: boolean) => void;
  onEnvWeatherCityChange: (value: string) => void;
  onEnvSystemStatusEnabledChange: (value: boolean) => void;
  onEnvCalendarEnabledChange: (value: boolean) => void;
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

const EnvAwarenessSettingsSection: React.FC<EnvAwarenessSettingsSectionProps> = ({
  envAwarenessEnabled,
  envTimeEnabled,
  envWeatherEnabled,
  envWeatherCity,
  envSystemStatusEnabled,
  envCalendarEnabled,
  onEnvAwarenessEnabledChange,
  onEnvTimeEnabledChange,
  onEnvWeatherEnabledChange,
  onEnvWeatherCityChange,
  onEnvSystemStatusEnabledChange,
  onEnvCalendarEnabledChange,
}) => {
  const [showEnvDetails, setShowEnvDetails] = useState(false);

  return (
    <div className="space-y-4">
      {/* Environment Awareness */}
      <div className="space-y-3 rounded-xl border px-4 py-4 border-border">
        <ToggleSwitch
          checked={envAwarenessEnabled}
          label={i18nService.t('envAwarenessEnabled')}
          description={i18nService.t('envAwarenessEnabledHint')}
          onChange={onEnvAwarenessEnabledChange}
        />
        {envAwarenessEnabled && (
          <div className="pt-2 space-y-3">
            <button
              type="button"
              onClick={() => setShowEnvDetails(!showEnvDetails)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {showEnvDetails
                ? i18nService.t('envDetailsHide')
                : i18nService.t('envDetailsShow')}
            </button>
            {showEnvDetails && (
              <div className="space-y-3 pt-1">
                <ToggleSwitch
                  checked={envTimeEnabled}
                  label={i18nService.t('envTimeEnabled')}
                  onChange={onEnvTimeEnabledChange}
                />
                <ToggleSwitch
                  checked={envWeatherEnabled}
                  label={i18nService.t('envWeatherEnabled')}
                  onChange={onEnvWeatherEnabledChange}
                />
                {envWeatherEnabled && (
                  <div className="pl-2">
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {i18nService.t('envWeatherCity')}
                    </label>
                    <input
                      type="text"
                      value={envWeatherCity}
                      onChange={(e) => onEnvWeatherCityChange(e.target.value)}
                      placeholder="Beijing"
                      className="w-full rounded-lg border px-3 py-2 text-sm border-border bg-surface"
                    />
                  </div>
                )}
                <ToggleSwitch
                  checked={envSystemStatusEnabled}
                  label={i18nService.t('envSystemStatusEnabled')}
                  onChange={onEnvSystemStatusEnabledChange}
                />
                <ToggleSwitch
                  checked={envCalendarEnabled}
                  label={i18nService.t('envCalendarEnabled')}
                  onChange={onEnvCalendarEnabledChange}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EnvAwarenessSettingsSection;
