import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDistanceBetween,
  formatMeasurement,
  projectGroundPoint,
  projectWorldPointToScreen,
  resolvePerformanceTier,
  shortestAngleDiffDeg,
} from './measurement';

test('resolvePerformanceTier assigns LITE for low API or low RAM (< 3 GB)', () => {
  assert.equal(resolvePerformanceTier(21, 4.0), 'LITE');
  assert.equal(resolvePerformanceTier(28, 8.0), 'LITE');
  assert.equal(resolvePerformanceTier(29, 2.0), 'LITE'); // Samsung Galaxy A02
  assert.equal(resolvePerformanceTier(37, 2.5), 'LITE');
});

test('resolvePerformanceTier assigns STANDARD for API 29..36 with >= 3 GB RAM', () => {
  assert.equal(resolvePerformanceTier(29, 3.0), 'STANDARD');
  assert.equal(resolvePerformanceTier(34, 6.0), 'STANDARD'); // Samsung Galaxy A52
  assert.equal(resolvePerformanceTier(36, 8.0), 'STANDARD');
});

test('resolvePerformanceTier assigns ULTRA for API 37+ with >= 3 GB RAM', () => {
  assert.equal(resolvePerformanceTier(37, 4.0), 'ULTRA');
  assert.equal(resolvePerformanceTier(38, 12.0), 'ULTRA');
});

test('projectGroundPoint computes exact distance at 45 degrees tilt', () => {
  const pt = projectGroundPoint(150, 45, 0);
  assert.ok(pt);
  assert.ok(Math.abs(pt.horizontalDistanceMeters - 1.5) < 1e-6);
  assert.ok(Math.abs(pt.xMeters - 1.5) < 1e-6);
  assert.ok(Math.abs(pt.zMeters) < 1e-6);
});

test('projectGroundPoint rejects above-horizon or straight-down invalid angles', () => {
  assert.equal(projectGroundPoint(140, 88, 0), null);
  assert.equal(projectGroundPoint(140, 0.5, 0), null);
  assert.equal(projectGroundPoint(10, 45, 0), null);
});

test('calculateDistanceBetween computes right-triangle distance accurately', () => {
  // 3m along +X (az=0), 4m along +Z (az=90) -> distance must be 5m
  const tiltA = (Math.atan(3 / 1.5) * 180) / Math.PI;
  const tiltB = (Math.atan(4 / 1.5) * 180) / Math.PI;
  const pointA = projectGroundPoint(150, tiltA, 0);
  const pointB = projectGroundPoint(150, tiltB, 90);
  assert.ok(pointA && pointB);
  const dist = calculateDistanceBetween(pointA, pointB);
  assert.ok(Math.abs(dist - 5.0) < 1e-5);
});

test('projectWorldPointToScreen projects aimed ground point to exact center of viewport', () => {
  const aim = projectGroundPoint(140, 55, 25);
  assert.ok(aim);
  const screen = projectWorldPointToScreen(aim, 140, 55, 25, 26, 800, 600);
  assert.equal(screen.inFront, true);
  assert.ok(Math.abs(screen.x - 400) < 1e-4);
  assert.ok(Math.abs(screen.y - 300) < 1e-4);
});

test('formatMeasurement and shortestAngleDiffDeg format cleanly', () => {
  const formatted = formatMeasurement(1.846);
  assert.equal(formatted.metersLabel, '1.85 m');
  assert.equal(formatted.cmLabel, '185 cm');
  assert.equal(formatted.cmValue, 185);
  assert.equal(shortestAngleDiffDeg(350, 10), 20);
});
