import React, { useEffect, useRef, useState } from 'react';
import { Camera, Compass, RotateCcw } from 'lucide-react';
import {
  formatMeasurement,
  GroundPoint,
  isAimValidForGround,
  PerformanceTier,
  projectWorldPointToScreen,
  calculateDistanceBetween,
} from '../utils/measurement';

interface ViewfinderCanvasProps {
  tier: PerformanceTier;
  phoneHeightCm: number;
  focalLengthMm: number;
  tiltFromNadirDeg: number;
  azimuthDeg: number;
  onAimChange: (tiltDeg: number, azimuthDeg: number) => void;
  pointA: GroundPoint | null;
  pointB: GroundPoint | null;
  liveAimPoint: GroundPoint | null;
  useArCore: boolean;
  isArCoreSupported: boolean;
}

export const ViewfinderCanvas: React.FC<ViewfinderCanvasProps> = ({
  tier,
  phoneHeightCm,
  focalLengthMm,
  tiltFromNadirDeg,
  azimuthDeg,
  onAimChange,
  pointA,
  pointB,
  liveAimPoint,
  useArCore,
  isArCoreSupported,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; tilt: number; az: number } | null>(null);

  const aimValid = isAimValidForGround(tiltFromNadirDeg);

  // Obsługa rzeczywistej kamery (getUserMedia) z bezpiecznym fallbackiem do symulatora
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function startCamera() {
      if (!cameraActive) {
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Przeglądarka nie udostępnia API kamery. Aktywny podgląd czujników.');
        setCameraActive(false);
        return;
      }
      try {
        setCameraError(null);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError('Brak dostępu do kamery. Używany jest interaktywny podgląd 3D.');
        setCameraActive(false);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraActive]);

  // Obsługa klawiatury do precyzyjnego celowania na desktopie
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
        return;
      }
      const step = e.shiftKey ? 4 : 1.5;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        onAimChange(Math.min(88, tiltFromNadirDeg + step), azimuthDeg);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        onAimChange(Math.max(5, tiltFromNadirDeg - step), azimuthDeg);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onAimChange(tiltFromNadirDeg, (azimuthDeg - step + 360) % 360);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onAimChange(tiltFromNadirDeg, (azimuthDeg + step) % 360);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tiltFromNadirDeg, azimuthDeg, onAimChange]);

  // Renderowanie siatki podłogi 3D, markerów Punkt A / Punkt B, linii pomiarowej oraz celownika
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(240, Math.floor(rect.height));
    const dpr = tier === 'LITE' ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Tło symulowanego pokoju (tylko gdy kamera na żywo jest wyłączona)
    if (!cameraActive) {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#0F172A');
      bgGrad.addColorStop(0.55, '#1E293B');
      bgGrad.addColorStop(1, '#0B1120');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Rysujemy siatkę podłogi (kratka co 0.5m) rzutowaną perspektywicznie 3D
      ctx.lineWidth = 1;
      const gridRange = 8; // +/- 8 metrów
      const step = 1.0; // co 1 metr

      const drawFloorSegment = (x1: number, z1: number, x2: number, z2: number, major: boolean) => {
        const p1 = projectWorldPointToScreen(
          { xMeters: x1, zMeters: z1 },
          phoneHeightCm,
          tiltFromNadirDeg,
          azimuthDeg,
          focalLengthMm,
          width,
          height
        );
        const p2 = projectWorldPointToScreen(
          { xMeters: x2, zMeters: z2 },
          phoneHeightCm,
          tiltFromNadirDeg,
          azimuthDeg,
          focalLengthMm,
          width,
          height
        );
        if (!p1.inFront || !p2.inFront) return;
        ctx.strokeStyle = major ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.13)';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      };

      for (let gx = -gridRange; gx <= gridRange; gx += step) {
        for (let gz = -gridRange; gz < gridRange; gz += 1) {
          drawFloorSegment(gx, gz, gx, gz + 1, gx === 0);
        }
      }
      for (let gz = -gridRange; gz <= gridRange; gz += step) {
        for (let gx = -gridRange; gx < gridRange; gx += 1) {
          drawFloorSegment(gx, gz, gx + 1, gz, gz === 0);
        }
      }

      // Obrys wzorcowego stołu / płyty testowej (1.2m x 0.8m przed użytkownikiem) dla łatwej oceny skali
      const boxCorners = [
        { xMeters: 1.5, zMeters: -0.4 },
        { xMeters: 2.7, zMeters: -0.4 },
        { xMeters: 2.7, zMeters: 0.4 },
        { xMeters: 1.5, zMeters: 0.4 },
      ];
      const projectedCorners = boxCorners.map((c) =>
        projectWorldPointToScreen(c, phoneHeightCm, tiltFromNadirDeg, azimuthDeg, focalLengthMm, width, height)
      );
      if (projectedCorners.every((c) => c.inFront)) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(projectedCorners[0].x, projectedCorners[0].y);
        for (let i = 1; i < projectedCorners.length; i++) {
          ctx.lineTo(projectedCorners[i].x, projectedCorners[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 2. Linia pomiaru A -> B lub A -> Celownik
    const screenA = pointA
      ? projectWorldPointToScreen(pointA, phoneHeightCm, tiltFromNadirDeg, azimuthDeg, focalLengthMm, width, height)
      : null;
    const targetPoint = pointB ?? liveAimPoint;
    const screenTarget = targetPoint
      ? projectWorldPointToScreen(targetPoint, phoneHeightCm, tiltFromNadirDeg, azimuthDeg, focalLengthMm, width, height)
      : null;

    if (pointA && targetPoint && screenA?.inFront && screenTarget?.inFront) {
      ctx.save();
      ctx.strokeStyle = pointB ? '#F59E0B' : '#38BDF8';
      ctx.lineWidth = tier === 'LITE' ? 2.5 : 3;
      if (!pointB) {
        ctx.setLineDash([8, 6]);
      }
      ctx.beginPath();
      ctx.moveTo(screenA.x, screenA.y);
      ctx.lineTo(screenTarget.x, screenTarget.y);
      ctx.stroke();
      ctx.restore();

      const segDist = calculateDistanceBetween(pointA, targetPoint);
      const { metersLabel, cmLabel } = formatMeasurement(segDist);
      const midX = (screenA.x + screenTarget.x) / 2;
      const midY = (screenA.y + screenTarget.y) / 2;
      const badgeText = `${metersLabel} (${cmLabel})`;

      ctx.font = '600 13px "JetBrains Mono", monospace';
      const textWidth = ctx.measureText(badgeText).width;
      const boxW = textWidth + 18;
      const boxH = 28;
      // Odsunięcie etykiety powyżej celownika i punktu B, aby nie zasłaniała znaczników
      const badgeCenterY = Math.min(midY, screenTarget.y - 44) - boxH / 2;
      const clampedBadgeY = Math.max(56 + boxH / 2, badgeCenterY);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = pointB ? '#F59E0B' : '#38BDF8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(midX - boxW / 2, clampedBadgeY - boxH / 2, boxW, boxH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, midX, clampedBadgeY);
    }

    // 3. Punkty A i B na podłożu
    const drawPin = (screen: { x: number; y: number; inFront: boolean } | null, label: string, fill: string) => {
      if (!screen || !screen.inFront) return;
      ctx.save();
      ctx.fillStyle = fill;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '700 12px "Outfit", sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, screen.x, screen.y);
      ctx.restore();
    };

    drawPin(screenA, 'A', '#2563EB');
    if (pointB) {
      drawPin(screenTarget, 'B', '#D97706');
    }

    // 4. Celownik na środku ekranu (dostosowany do PerformanceTier)
    const cx = width / 2;
    const cy = height / 2;
    const reticleColor = !aimValid ? '#F59E0B' : pointA && !pointB ? '#38BDF8' : '#FFFFFF';
    const radius = tier === 'ULTRA' ? 26 : 18;
    const arm = 12;

    ctx.save();
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // W trybie ULTRA (API 37+) dodatkowy pierścień stabilizacji i podziałka kątowa
    if (tier === 'ULTRA') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 10, -Math.PI * 0.25, Math.PI * 0.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 10, Math.PI * 0.75, Math.PI * 1.25);
      ctx.stroke();
    }

    ctx.fillStyle = reticleColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - radius - arm, cy);
    ctx.lineTo(cx - radius + 4, cy);
    ctx.moveTo(cx + radius - 4, cy);
    ctx.lineTo(cx + radius + arm, cy);
    ctx.moveTo(cx, cy - radius - arm);
    ctx.lineTo(cx, cy - radius + 4);
    ctx.moveTo(cx, cy + radius - 4);
    ctx.lineTo(cx, cy + radius + arm);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }, [
    tier,
    phoneHeightCm,
    focalLengthMm,
    tiltFromNadirDeg,
    azimuthDeg,
    pointA,
    pointB,
    liveAimPoint,
    cameraActive,
    aimValid,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tilt: tiltFromNadirDeg,
      az: azimuthDeg,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const nextAz = (dragStartRef.current.az - dx * 0.18 + 360) % 360;
    const nextTilt = Math.max(5, Math.min(88, dragStartRef.current.tilt + dy * 0.16));
    onAimChange(nextTilt, nextAz);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-[320px] sm:h-[440px] lg:h-[520px] rounded-2xl overflow-hidden select-none bg-slate-950 border border-slate-200 dark:border-slate-800 ${
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      data-testid="viewfinder-viewport"
      data-aim-valid={aimValid ? 'true' : 'false'}
      data-has-a={pointA ? 'true' : 'false'}
      data-has-b={pointB ? 'true' : 'false'}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
      />

      <canvas
        ref={canvasRef}
        data-testid="viewfinder-canvas"
        className="absolute inset-0 w-full h-full"
      />

      {/* Górna belka na podglądzie */}
      <div className="absolute top-0 inset-x-0 flex items-center justify-between gap-3 px-4 py-3 bg-gradient-to-b from-slate-950/85 via-slate-950/45 to-transparent pointer-events-none">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-200 font-mono-num">
          <span className="font-semibold text-white">Tryb {tier}</span>
          <span aria-hidden="true">·</span>
          <span>H: {phoneHeightCm} cm</span>
          <span aria-hidden="true">·</span>
          <span>Pochylenie: {tiltFromNadirDeg.toFixed(1)}°</span>
          {tier !== 'LITE' && (
            <>
              <span aria-hidden="true">·</span>
              <span>Azymut: {azimuthDeg.toFixed(0)}°</span>
              <span aria-hidden="true">·</span>
              <span>
                {useArCore && isArCoreSupported ? 'ARCore + Czujniki' : 'Czujniki (bez LiDAR)'}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAimChange(55, 0);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium bg-slate-900/80 text-slate-100 border border-slate-700 hover:bg-slate-800 whitespace-nowrap"
            title="Wycentruj widok"
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Centruj</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCameraActive((prev) => !prev);
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-medium border whitespace-nowrap ${
              cameraActive
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900/80 text-slate-100 border-slate-700 hover:bg-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{cameraActive ? 'Wyłącz kamerę' : 'Kamera na żywo'}</span>
          </button>
        </div>
      </div>

      {/* Komunikat walidacji lub błędu kamery */}
      {(!aimValid || cameraError) && (
        <div className="absolute bottom-14 inset-x-4 flex justify-center pointer-events-none">
          <div className="px-3.5 py-2 rounded-lg bg-slate-950/90 border border-amber-500/60 text-amber-300 text-xs font-medium text-center">
            {!aimValid
              ? 'Skieruj celownik niżej na podłogę lub powierzchnię pomiarową (kąt < 86°)'
              : cameraError}
          </div>
        </div>
      )}

      {/* Podpowiedź obsługi na dole podglądu */}
      <div className="absolute bottom-2.5 inset-x-4 flex items-center justify-between text-[11px] text-slate-300/90 pointer-events-none">
        <span>Przeciągnij podgląd lub użyj strzałek, aby wycelować</span>
        {tier === 'ULTRA' && (
          <span className="font-mono-num text-sky-300">API 37 · Stabilizacja {focalLengthMm} mm</span>
        )}
      </div>

      {/* Szybki przycisk resetu widoku gdy poza zakresem */}
      {!aimValid && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAimChange(55, azimuthDeg);
          }}
          className="absolute top-14 right-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-500"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Pochyl w dół</span>
        </button>
      )}
    </div>
  );
};
