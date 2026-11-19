import React, { useEffect, useMemo, useState } from 'react';
import { Moon, RotateCcw, Settings, Sun, Trash2 } from 'lucide-react';
import { CodeExplorer } from './components/CodeExplorer';
import { SettingsModal } from './components/SettingsModal';
import { ViewfinderCanvas } from './components/ViewfinderCanvas';
import {
  calculateDistanceBetween,
  DEVICE_PRESETS,
  DevicePreset,
  formatMeasurement,
  GroundPoint,
  MeasurementRecord,
  PerformanceTier,
  projectGroundPoint,
  resolvePerformanceTier,
  shortestAngleDiffDeg,
} from './utils/measurement';

type ActiveTab = 'meter' | 'code';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('meter');
  const [selectedPreset, setSelectedPreset] = useState<DevicePreset>(DEVICE_PRESETS[2]); // Galaxy A52 (STANDARD) domyślnie
  const [tierOverride, setTierOverride] = useState<'AUTO' | PerformanceTier>('AUTO');
  const [darkMode, setDarkMode] = useState(false);

  const [phoneHeightCm, setPhoneHeightCm] = useState(140);
  const [focalLengthMm, setFocalLengthMm] = useState(26);
  const [useArCore, setUseArCore] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [tiltFromNadirDeg, setTiltFromNadirDeg] = useState(55);
  const [azimuthDeg, setAzimuthDeg] = useState(0);
  const [pointA, setPointA] = useState<GroundPoint | null>(null);
  const [pointB, setPointB] = useState<GroundPoint | null>(null);
  const [history, setHistory] = useState<MeasurementRecord[]>([]);

  const autoTier = useMemo(
    () => resolvePerformanceTier(selectedPreset.apiLevel, selectedPreset.totalRamGb),
    [selectedPreset]
  );

  const activeTier: PerformanceTier = tierOverride === 'AUTO' ? autoTier : tierOverride;
  const isLite = activeTier === 'LITE';
  const isUltra = activeTier === 'ULTRA';

  // W trybie LITE wyłączamy Dark Mode dla maksymalnej czytelności na słabszych ekranach
  const effectiveDark = !isLite && darkMode;

  useEffect(() => {
    const root = document.documentElement;
    if (effectiveDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveDark]);

  const handleSelectPreset = (preset: DevicePreset) => {
    setSelectedPreset(preset);
    setFocalLengthMm(preset.defaultFocalLengthMm);
    setUseArCore(preset.isArCoreSupported);
  };

  const liveAimPoint = useMemo(
    () => projectGroundPoint(phoneHeightCm, tiltFromNadirDeg, azimuthDeg),
    [phoneHeightCm, tiltFromNadirDeg, azimuthDeg]
  );

  const activeDistanceMeters = useMemo(() => {
    if (pointA && pointB) {
      return calculateDistanceBetween(pointA, pointB);
    }
    if (pointA && liveAimPoint) {
      return calculateDistanceBetween(pointA, liveAimPoint);
    }
    return null;
  }, [pointA, pointB, liveAimPoint]);

  const formattedDistance = useMemo(
    () => (activeDistanceMeters !== null ? formatMeasurement(activeDistanceMeters) : null),
    [activeDistanceMeters]
  );

  const deltaAzimuth = useMemo(() => {
    if (!pointA) return 0;
    const target = pointB ?? liveAimPoint;
    if (!target) return 0;
    return shortestAngleDiffDeg(pointA.azimuthDeg, target.azimuthDeg);
  }, [pointA, pointB, liveAimPoint]);

  const handleSetPointA = () => {
    if (!liveAimPoint) return;
    setPointA(liveAimPoint);
    setPointB(null);
  };

  const handleSetPointB = () => {
    if (!pointA || !liveAimPoint) return;
    setPointB(liveAimPoint);
    const dist = calculateDistanceBetween(pointA, liveAimPoint);
    const fmt = formatMeasurement(dist);
    const record: MeasurementRecord = {
      id: `${Date.now()}`,
      label: `Pomiar #${history.length + 1}`,
      distanceMeters: dist,
      distanceCm: fmt.cmValue,
      deltaAzimuthDeg: shortestAngleDiffDeg(pointA.azimuthDeg, liveAimPoint.azimuthDeg),
      createdAt: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setHistory((prev) => [record, ...prev].slice(0, 8));
  };

  const handleReset = () => {
    setPointA(null);
    setPointB(null);
  };

  const cardClasses = isLite
    ? 'rounded-2xl border border-slate-300 bg-white text-slate-900 shadow-none'
    : 'rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm transition-colors duration-150';

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#F6F7F9] dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${
        isLite ? 'transition-none' : 'transition-colors duration-150'
      }`}
      data-tier={activeTier}
    >
      {/* Top Bar Contract: dokładnie 3 strefy, dopasowane również do 390px */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-8">
          {/* Strefa 1: Pojedyncza nazwa aplikacji */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('meter');
            }}
            className="font-display text-sm sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            Miernik Odległości
          </a>

          {/* Strefa 2: Czyste linki nawigacyjne */}
          <nav className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium" aria-label="Nawigacja główna">
            <button
              type="button"
              onClick={() => setActiveTab('meter')}
              className={`py-1.5 border-b-2 whitespace-nowrap shrink-0 ${
                activeTab === 'meter'
                  ? 'border-blue-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Miernik Live
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`py-1.5 border-b-2 whitespace-nowrap shrink-0 ${
                activeTab === 'code'
                  ? 'border-blue-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Kod Kotlin
            </button>
          </nav>

          {/* Strefa 3: Jedna główna akcja */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Ustawienia"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-4 py-2 min-h-[40px] text-xs font-semibold rounded-xl bg-slate-900 dark:bg-blue-600 text-white hover:bg-slate-800 dark:hover:bg-blue-700 whitespace-nowrap shrink-0"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Ustawienia</span>
            </button>
          </div>
        </div>
      </header>

      {/* Główna przestrzeń robocza */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'meter' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Lewa / główna kolumna: Podgląd z kamery + celownik + przyciski Punkt A / Punkt B / Reset */}
            <div className="lg:col-span-8 space-y-4">
              <ViewfinderCanvas
                tier={activeTier}
                phoneHeightCm={phoneHeightCm}
                focalLengthMm={focalLengthMm}
                tiltFromNadirDeg={tiltFromNadirDeg}
                azimuthDeg={azimuthDeg}
                onAimChange={(nextTilt, nextAz) => {
                  setTiltFromNadirDeg(nextTilt);
                  setAzimuthDeg(nextAz);
                }}
                pointA={pointA}
                pointB={pointB}
                liveAimPoint={liveAimPoint}
                useArCore={useArCore}
                isArCoreSupported={selectedPreset.isArCoreSupported}
              />

              {/* Ergonomiczny pasek akcji pod celownikiem (strefa kciuka na telefonie) */}
              <div className={`${cardClasses} p-4`}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {!pointA ? (
                    <button
                      type="button"
                      onClick={handleSetPointA}
                      disabled={!liveAimPoint}
                      className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Ustaw Punkt A
                    </button>
                  ) : !pointB ? (
                    <button
                      type="button"
                      onClick={handleSetPointB}
                      disabled={!liveAimPoint}
                      className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Ustaw Punkt B
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex-1 min-h-[48px] px-5 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 whitespace-nowrap"
                    >
                      Nowy pomiar (A → B)
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center justify-center gap-2 min-h-[48px] px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap"
                  >
                    <RotateCcw className="w-4 h-4" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Precyzyjne suwaki celowania dla testów na komputerze */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="aim-tilt-slider" className="font-medium text-slate-600 dark:text-slate-400">
                        Pochylenie kamery (od pionu)
                      </label>
                      <span className="font-mono-num font-semibold">{tiltFromNadirDeg.toFixed(1)}°</span>
                    </div>
                    <input
                      id="aim-tilt-slider"
                      type="range"
                      min={5}
                      max={88}
                      step={0.5}
                      value={tiltFromNadirDeg}
                      onChange={(e) => setTiltFromNadirDeg(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="aim-az-slider" className="font-medium text-slate-600 dark:text-slate-400">
                        Obrót w poziomie (Azymut)
                      </label>
                      <span className="font-mono-num font-semibold">{azimuthDeg.toFixed(0)}°</span>
                    </div>
                    <input
                      id="aim-az-slider"
                      type="range"
                      min={0}
                      max={359}
                      step={1}
                      value={azimuthDeg}
                      onChange={(e) => setAzimuthDeg(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Prawa kolumna: Wynik na żywo + Progressive Enhancement Tier + Historia */}
            <div className="lg:col-span-4 space-y-5">
              {/* Karta wyniku odległości */}
              <section className={`${cardClasses} p-5`} aria-label="Wynik pomiaru">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {pointB
                    ? 'Zmierzona odległość (Punkt A → Punkt B)'
                    : pointA
                    ? 'Odległość na żywo (Punkt A → celownik)'
                    : 'Dystans od telefonu do punktu celowania'}
                </div>

                {formattedDistance ? (
                  <div className="mt-2">
                    <div
                      className="font-mono-num text-4xl font-bold tracking-tight text-blue-600 dark:text-blue-400"
                      data-testid="distance-meters"
                    >
                      {formattedDistance.metersLabel}
                    </div>
                    <div
                      className="font-mono-num text-lg font-semibold text-slate-700 dark:text-slate-300 mt-1"
                      data-testid="distance-cm"
                    >
                      {formattedDistance.cmLabel}
                    </div>
                  </div>
                ) : liveAimPoint ? (
                  <div className="mt-2">
                    <div className="font-mono-num text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {formatMeasurement(liveAimPoint.horizontalDistanceMeters).metersLabel}
                    </div>
                    <div className="font-mono-num text-sm text-slate-500 dark:text-slate-400 mt-1">
                      {formatMeasurement(liveAimPoint.horizontalDistanceMeters).cmLabel} od stóp · Wyznacz Punkt A
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    Skieruj celownik niżej na podłogę, aby odczytać dystans.
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">Punkt A</div>
                    <div className="font-mono-num font-semibold mt-0.5">
                      {pointA ? `${pointA.horizontalDistanceMeters.toFixed(2)} m · ${pointA.azimuthDeg.toFixed(0)}°` : 'Nieustawiony'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {pointB ? 'Punkt B' : 'Kąt A → cel'}
                    </div>
                    <div className="font-mono-num font-semibold mt-0.5">
                      {pointB
                        ? `${pointB.horizontalDistanceMeters.toFixed(2)} m · ${pointB.azimuthDeg.toFixed(0)}°`
                        : pointA
                        ? `${deltaAzimuth.toFixed(1)}°`
                        : 'Oczekuje na A'}
                    </div>
                  </div>
                </div>
              </section>

              {/* Panel Progressive Enhancement (DeviceCapabilityManager) */}
              <section className={`${cardClasses} p-5 space-y-4`} aria-label="Progressive Enhancement">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold">Progressive Enhancement</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {selectedPreset.name} · API {selectedPreset.apiLevel} · {selectedPreset.totalRamGb.toFixed(1)} GB RAM
                    </p>
                  </div>
                  {!isLite && (
                    <button
                      type="button"
                      onClick={() => setDarkMode((d) => !d)}
                      aria-label={effectiveDark ? 'Przełącz na jasny motyw' : 'Przełącz na ciemny motyw'}
                      className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {effectiveDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Szybki przełącznik poziomów */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {(['AUTO', 'LITE', 'STANDARD', 'ULTRA'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTierOverride(mode)}
                      className={`py-1.5 px-2 text-xs font-semibold rounded-lg whitespace-nowrap ${
                        tierOverride === mode
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {mode === 'AUTO' ? 'Auto' : mode}
                    </button>
                  ))}
                </div>

                <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  {isLite && (
                    <p>
                      <strong className="text-slate-900 dark:text-white">Tryb LITE:</strong> Wyłączone cienie (0.dp), animacje i Dark Mode. Działa wyłącznie podstawowy pomiar A→B na zwykłych czujnikach.
                    </p>
                  )}
                  {activeTier === 'STANDARD' && (
                    <p>
                      <strong className="text-slate-900 dark:text-white">Tryb STANDARD:</strong> Włączone animacje, cienie kart, motyw ciemny oraz historia pomiarów i opcjonalny ARCore.
                    </p>
                  )}
                  {isUltra && (
                    <p>
                      <strong className="text-slate-900 dark:text-white">Tryb ULTRA (API 37+):</strong> Odblokowane funkcje @RequiresApi(37), rozszerzony celownik stabilizacji i pełne efekty graficzne.
                    </p>
                  )}
                </div>
              </section>

              {/* Funkcja ULTRA dostępna od API 37+ */}
              {isUltra && (
                <section
                  className="rounded-2xl border border-blue-200 dark:border-blue-900/70 bg-blue-50/70 dark:bg-blue-950/40 p-5"
                  aria-label="Funkcja Android 17 Ultra"
                >
                  <h2 className="text-sm font-semibold text-blue-950 dark:text-blue-100">
                    Moduł API 37+ (@RequiresApi(37))
                  </h2>
                  <p className="text-xs text-blue-900/80 dark:text-blue-200/80 mt-1">
                    Włączona stabilizacja optyczna celownika dla ogniskowej {focalLengthMm} mm oraz korekcja drgań kąta pochylenia.
                  </p>
                </section>
              )}

              {/* Historia pomiarów: ukrywana w trybie LITE zgodnie z Progressive Enhancement */}
              {!isLite && (
                <section className={`${cardClasses} p-5`} aria-label="Historia pomiarów">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="text-sm font-semibold">Historia pomiarów</h2>
                    {history.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHistory([])}
                        className="text-xs text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        Wyczyść
                      </button>
                    )}
                  </div>

                  {history.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Zaznacz Punkt A i Punkt B, aby zapisać wynik w historii sesji.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {history.map((item) => (
                        <li key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="font-medium text-slate-900 dark:text-white">{item.label}</div>
                            <div className="text-slate-500 dark:text-slate-400">
                              {item.createdAt} · Δ {item.deltaAzimuthDeg.toFixed(0)}°
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono-num font-semibold text-slate-900 dark:text-white">
                              {item.distanceMeters.toFixed(2)} m ({item.distanceCm} cm)
                            </span>
                            <button
                              type="button"
                              aria-label={`Usuń ${item.label}`}
                              onClick={() => setHistory((prev) => prev.filter((r) => r.id !== item.id))}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          </div>
        ) : (
          <CodeExplorer tier={activeTier} />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        phoneHeightCm={phoneHeightCm}
        onPhoneHeightChange={setPhoneHeightCm}
        focalLengthMm={focalLengthMm}
        onFocalLengthChange={setFocalLengthMm}
        selectedPreset={selectedPreset}
        onSelectPreset={handleSelectPreset}
        tierOverride={tierOverride}
        onTierOverrideChange={setTierOverride}
        useArCore={useArCore}
        onUseArCoreChange={setUseArCore}
        activeTier={activeTier}
      />
    </div>
  );
}
