import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import buildGradleRaw from '../../android/app/build.gradle.kts?raw';
import settingsGradleRaw from '../../android/settings.gradle.kts?raw';
import manifestRaw from '../../android/app/src/main/AndroidManifest.xml?raw';
import capabilityManagerRaw from '../../android/app/src/main/java/com/distancemeter/app/DeviceCapabilityManager.kt?raw';
import sensorCalculatorRaw from '../../android/app/src/main/java/com/distancemeter/app/SensorDistanceCalculator.kt?raw';
import mainActivityRaw from '../../android/app/src/main/java/com/distancemeter/app/MainActivity.kt?raw';
import { PerformanceTier } from '../utils/measurement';

interface CodeFile {
  id: string;
  filename: string;
  path: string;
  language: string;
  summary: string;
  content: string;
}

const CODE_FILES: CodeFile[] = [
  {
    id: 'capability',
    filename: 'DeviceCapabilityManager.kt',
    path: 'android/app/src/main/java/com/distancemeter/app/DeviceCapabilityManager.kt',
    language: 'Kotlin',
    summary: 'Wykrywanie SDK_INT oraz RAM (ActivityManager.MemoryInfo) i przypisanie LITE / STANDARD / ULTRA.',
    content: capabilityManagerRaw,
  },
  {
    id: 'main',
    filename: 'MainActivity.kt',
    path: 'android/app/src/main/java/com/distancemeter/app/MainActivity.kt',
    language: 'Kotlin + Jetpack Compose',
    summary: 'Ekran główny w Jetpack Compose z podglądem CameraX, dynamicznym UI dla LITE/STANDARD/ULTRA i @RequiresApi(37).',
    content: mainActivityRaw,
  },
  {
    id: 'sensor',
    filename: 'SensorDistanceCalculator.kt',
    path: 'android/app/src/main/java/com/distancemeter/app/SensorDistanceCalculator.kt',
    language: 'Kotlin + SensorManager',
    summary: 'Systemowy SensorManager (akcelerometr do pomiaru kąta pochylenia + opcjonalny magnetometr/wektor rotacji) i trygonometria A→B.',
    content: sensorCalculatorRaw,
  },
  {
    id: 'gradle',
    filename: 'build.gradle.kts',
    path: 'android/app/build.gradle.kts',
    language: 'Gradle Kotlin DSL',
    summary: 'Konfiguracja minSdk = 21, compileSdk = 37, targetSdk = 36 oraz zależności CameraX i Compose.',
    content: buildGradleRaw,
  },
  {
    id: 'manifest',
    filename: 'AndroidManifest.xml',
    path: 'android/app/src/main/AndroidManifest.xml',
    language: 'XML',
    summary: 'Uprawnienie kamery oraz com.google.ar.core ustawione jako optional (działa bezbłędnie na budżetowych modelach).',
    content: manifestRaw,
  },
  {
    id: 'settings',
    filename: 'settings.gradle.kts',
    path: 'android/settings.gradle.kts',
    language: 'Gradle Kotlin DSL',
    summary: 'Konfiguracja repozytoriów projektu Android Studio (Google, Maven Central) i modułu :app.',
    content: settingsGradleRaw,
  },
];

interface CodeExplorerProps {
  tier: PerformanceTier;
}

export const CodeExplorer: React.FC<CodeExplorerProps> = ({ tier }) => {
  const [selectedId, setSelectedId] = useState<string>(CODE_FILES[0].id);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeFile = CODE_FILES.find((f) => f.id === selectedId) ?? CODE_FILES[0];
  const isLite = tier === 'LITE';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopiedId(activeFile.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      setCopiedId(null);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = activeFile.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6" aria-label="Kod źródłowy Kotlin i Jetpack Compose">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Natywny kod Android: Kotlin, Jetpack Compose, CameraX i SensorManager
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-3xl">
            Kompletna architektura gotowa do wklejenia w Android Studio (minSdk 21, compileSdk 37, targetSdk 36), bez placeholderów i z pełną obsługą akcelerometru.
          </p>
        </div>
      </div>

      {/* Wybór pliku */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pliki źródłowe Kotlin">
        {CODE_FILES.map((file) => {
          const isActive = file.id === activeFile.id;
          return (
            <button
              key={file.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setSelectedId(file.id)}
              className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-medium border whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {file.filename}
            </button>
          );
        })}
      </div>

      {/* Okno podglądu kodu */}
      <div
        className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden ${
          isLite ? 'shadow-none' : 'shadow-sm'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono-num text-sm font-semibold text-slate-900 dark:text-white break-all">
                {activeFile.path}
              </span>
              <span aria-hidden="true" className="text-slate-400">·</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{activeFile.language}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{activeFile.summary}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 whitespace-nowrap"
            >
              {copiedId === activeFile.id ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span>Skopiowano</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  <span>Kopiuj kod</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-slate-900 dark:bg-blue-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-blue-700 whitespace-nowrap"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Pobierz</span>
            </button>
          </div>
        </div>

        <pre className="p-5 overflow-x-auto text-xs leading-relaxed font-mono-num bg-slate-950 text-slate-100 max-h-[580px]">
          <code>{activeFile.content}</code>
        </pre>
      </div>
    </section>
  );
};
