import React from 'react';
import { X } from 'lucide-react';
import {
  DEVICE_PRESETS,
  DevicePreset,
  PerformanceTier,
  resolvePerformanceTier,
} from '../utils/measurement';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  phoneHeightCm: number;
  onPhoneHeightChange: (cm: number) => void;
  focalLengthMm: number;
  onFocalLengthChange: (mm: number) => void;
  selectedPreset: DevicePreset;
  onSelectPreset: (preset: DevicePreset) => void;
  tierOverride: 'AUTO' | PerformanceTier;
  onTierOverrideChange: (mode: 'AUTO' | PerformanceTier) => void;
  useArCore: boolean;
  onUseArCoreChange: (enabled: boolean) => void;
  activeTier: PerformanceTier;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  phoneHeightCm,
  onPhoneHeightChange,
  focalLengthMm,
  onFocalLengthChange,
  selectedPreset,
  onSelectPreset,
  tierOverride,
  onTierOverrideChange,
  useArCore,
  onUseArCoreChange,
  activeTier,
}) => {
  if (!isOpen) return null;

  const isLite = activeTier === 'LITE';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div
        className={`w-full max-w-lg rounded-2xl border p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 ${
          isLite ? 'shadow-none' : 'shadow-xl'
        }`}
      >
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="settings-dialog-title" className="text-lg font-semibold">
              Ustawienia kalibracji i urządzenia
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Aktywny tryb: {activeTier} · {selectedPreset.androidVersionLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij ustawienia"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 py-5">
          {/* Wysokość trzymania telefonu */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="height-slider" className="text-sm font-medium">
                Wysokość trzymania telefonu
              </label>
              <span className="font-mono-num text-sm font-semibold text-blue-600 dark:text-blue-400">
                {phoneHeightCm} cm ({(phoneHeightCm / 100).toFixed(2)} m)
              </span>
            </div>
            <input
              id="height-slider"
              type="range"
              min={60}
              max={220}
              step={1}
              value={phoneHeightCm}
              onChange={(e) => onPhoneHeightChange(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { label: '110 cm (siedząc)', value: 110 },
                { label: '140 cm (w dłoni)', value: 140 },
                { label: '165 cm (wysokość oczu)', value: 165 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => onPhoneHeightChange(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap ${
                    phoneHeightCm === preset.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Model telefonu / symulacja parametrów Androida */}
          <div>
            <label htmlFor="device-preset-select" className="block text-sm font-medium mb-2">
              Profil urządzenia (symulacja DeviceCapabilityManager)
            </label>
            <select
              id="device-preset-select"
              value={selectedPreset.id}
              onChange={(e) => {
                const found = DEVICE_PRESETS.find((p) => p.id === e.target.value);
                if (found) onSelectPreset(found);
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {DEVICE_PRESETS.map((preset) => {
                const autoTier = resolvePerformanceTier(preset.apiLevel, preset.totalRamGb);
                return (
                  <option key={preset.id} value={preset.id}>
                    {preset.name} — {autoTier} (API {preset.apiLevel}, {preset.totalRamGb} GB RAM)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Poziom wydajności (Progressive Enhancement) */}
          <div>
            <span className="block text-sm font-medium mb-2">
              Poziom wydajności (PerformanceTier)
            </span>
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              {(['AUTO', 'LITE', 'STANDARD', 'ULTRA'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onTierOverrideChange(mode)}
                  className={`py-2 px-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                    tierOverride === mode
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {mode === 'AUTO' ? 'Auto' : mode}
                </button>
              ))}
            </div>
          </div>

          {/* Ogniskowa i ARCore (ukryte w trybie LITE zgodnie z Progressive Enhancement) */}
          {!isLite ? (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="focal-slider" className="text-sm font-medium">
                    Ekwiwalent ogniskowej obiektywu
                  </label>
                  <span className="font-mono-num text-sm font-semibold">
                    {focalLengthMm} mm
                  </span>
                </div>
                <input
                  id="focal-slider"
                  type="range"
                  min={18}
                  max={50}
                  step={1}
                  value={focalLengthMm}
                  onChange={(e) => onFocalLengthChange(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <div className="text-sm font-medium">ARCore (opcjonalny)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedPreset.isArCoreSupported
                      ? 'Urządzenie wspiera ARCore — można użyć wspomagania głębi.'
                      : 'Urządzenie nie wspiera ARCore — działa bezbłędnie na czujnikach.'}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={useArCore && selectedPreset.isArCoreSupported}
                  disabled={!selectedPreset.isArCoreSupported}
                  onClick={() => onUseArCoreChange(!useArCore)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border ${
                    !selectedPreset.isArCoreSupported
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed'
                      : useArCore
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  {!selectedPreset.isArCoreSupported
                    ? 'Niedostępne'
                    : useArCore
                    ? 'Włączony'
                    : 'Wyłączony'}
                </button>
              </div>
            </>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300">
              Tryb LITE: zaawansowana regulacja ogniskowej, cienie oraz opcje ARCore są ukryte, aby zapewnić maksymalną płynność na starszych lub budżetowych telefonach.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 whitespace-nowrap"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );
};
