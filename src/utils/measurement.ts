export type PerformanceTier = 'LITE' | 'STANDARD' | 'ULTRA';

export interface DevicePreset {
  id: string;
  name: string;
  apiLevel: number;
  androidVersionLabel: string;
  totalRamGb: number;
  isArCoreSupported: boolean;
  hasGyroscope: boolean;
  defaultFocalLengthMm: number;
}

export interface GroundPoint {
  xMeters: number;
  zMeters: number;
  horizontalDistanceMeters: number;
  tiltFromNadirDeg: number;
  azimuthDeg: number;
}

export interface ScreenProjection {
  x: number;
  y: number;
  inFront: boolean;
  depthMeters: number;
}

export interface MeasurementRecord {
  id: string;
  label: string;
  distanceMeters: number;
  distanceCm: number;
  deltaAzimuthDeg: number;
  createdAt: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'galaxy_a02',
    name: 'Samsung Galaxy A02 (Budżetowy)',
    apiLevel: 29,
    androidVersionLabel: 'Android 10 / 2 GB RAM',
    totalRamGb: 2.0,
    isArCoreSupported: false,
    hasGyroscope: false,
    defaultFocalLengthMm: 27,
  },
  {
    id: 'legacy_android',
    name: 'Starszy Android 7.0 (API 24)',
    apiLevel: 24,
    androidVersionLabel: 'Android 7.0 / 2 GB RAM',
    totalRamGb: 2.0,
    isArCoreSupported: false,
    hasGyroscope: false,
    defaultFocalLengthMm: 28,
  },
  {
    id: 'galaxy_a52',
    name: 'Samsung Galaxy A52 (Średnia półka)',
    apiLevel: 34,
    androidVersionLabel: 'Android 14 / 6 GB RAM',
    totalRamGb: 6.0,
    isArCoreSupported: true,
    hasGyroscope: true,
    defaultFocalLengthMm: 26,
  },
  {
    id: 'android_17_ultra',
    name: 'Flagowiec Android 17 (API 37)',
    apiLevel: 37,
    androidVersionLabel: 'Android 17 / 12 GB RAM',
    totalRamGb: 12.0,
    isArCoreSupported: true,
    hasGyroscope: true,
    defaultFocalLengthMm: 24,
  },
];

export const MIN_TILT_FROM_NADIR_DEG = 2;
export const MAX_TILT_FROM_NADIR_DEG = 86;

export function resolvePerformanceTier(apiLevel: number, totalRamGb: number): PerformanceTier {
  if (apiLevel < 29 || totalRamGb < 3) {
    return 'LITE';
  }
  if (apiLevel >= 37) {
    return 'ULTRA';
  }
  return 'STANDARD';
}

export function normalizeAzimuthDeg(azimuthDeg: number): number {
  const mod = azimuthDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function shortestAngleDiffDeg(aDeg: number, bDeg: number): number {
  const diff = ((bDeg - aDeg + 540) % 360) - 180;
  return Math.abs(diff);
}

export function isAimValidForGround(tiltFromNadirDeg: number): boolean {
  return tiltFromNadirDeg >= MIN_TILT_FROM_NADIR_DEG && tiltFromNadirDeg <= MAX_TILT_FROM_NADIR_DEG;
}

export function projectGroundPoint(
  phoneHeightCm: number,
  tiltFromNadirDeg: number,
  azimuthDeg: number
): GroundPoint | null {
  if (!Number.isFinite(phoneHeightCm) || phoneHeightCm < 30) {
    return null;
  }
  if (!Number.isFinite(tiltFromNadirDeg) || !isAimValidForGround(tiltFromNadirDeg)) {
    return null;
  }

  const heightMeters = phoneHeightCm / 100;
  const tiltRad = (tiltFromNadirDeg * Math.PI) / 180;
  const normalizedAz = normalizeAzimuthDeg(azimuthDeg);
  const azRad = (normalizedAz * Math.PI) / 180;

  const horizontalDistanceMeters = heightMeters * Math.tan(tiltRad);
  const xMeters = horizontalDistanceMeters * Math.cos(azRad);
  const zMeters = horizontalDistanceMeters * Math.sin(azRad);

  return {
    xMeters,
    zMeters,
    horizontalDistanceMeters,
    tiltFromNadirDeg,
    azimuthDeg: normalizedAz,
  };
}

export function calculateDistanceBetween(a: GroundPoint, b: GroundPoint): number {
  const dx = b.xMeters - a.xMeters;
  const dz = b.zMeters - a.zMeters;
  return Math.hypot(dx, dz);
}

export function formatMeasurement(distanceMeters: number): {
  metersLabel: string;
  cmLabel: string;
  cmValue: number;
} {
  const safeMeters = Math.max(0, distanceMeters);
  const cmValue = Math.round(safeMeters * 100);
  return {
    metersLabel: `${safeMeters.toFixed(2)} m`,
    cmLabel: `${cmValue} cm`,
    cmValue,
  };
}

export function projectWorldPointToScreen(
  point: { xMeters: number; zMeters: number },
  phoneHeightCm: number,
  tiltFromNadirDeg: number,
  azimuthDeg: number,
  focalLengthMm: number,
  viewportWidth: number,
  viewportHeight: number
): ScreenProjection {
  const h = phoneHeightCm / 100;
  const tiltRad = (tiltFromNadirDeg * Math.PI) / 180;
  const azRad = (normalizeAzimuthDeg(azimuthDeg) * Math.PI) / 180;

  // Orthonormal camera basis in world space (Y is UP)
  const fx = Math.sin(tiltRad) * Math.cos(azRad);
  const fy = -Math.cos(tiltRad);
  const fz = Math.sin(tiltRad) * Math.sin(azRad);

  const rx = -Math.sin(azRad);
  const ry = 0;
  const rz = Math.cos(azRad);

  const ux = Math.cos(tiltRad) * Math.cos(azRad);
  const uy = Math.sin(tiltRad);
  const uz = Math.cos(tiltRad) * Math.sin(azRad);

  const dx = point.xMeters;
  const dy = -h;
  const dz = point.zMeters;

  const camX = dx * rx + dy * ry + dz * rz;
  const camY = dx * ux + dy * uy + dz * uz;
  const camZ = dx * fx + dy * fy + dz * fz;

  if (camZ <= 0.05) {
    return { x: -9999, y: -9999, inFront: false, depthMeters: camZ };
  }

  // 35mm full-frame equivalent horizontal focal length in pixels
  const focalPx = (focalLengthMm / 36) * viewportWidth;
  const screenX = viewportWidth / 2 + (camX / camZ) * focalPx;
  const screenY = viewportHeight / 2 - (camY / camZ) * focalPx;

  return {
    x: screenX,
    y: screenY,
    inFront: true,
    depthMeters: camZ,
  };
}
