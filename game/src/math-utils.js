// Small numeric helpers used by the simulation, camera, terrain and HUD. Keeping these free of
// three.js makes the flight model easy to reason about on its own.

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const clamp01 = (value) => clamp(value, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, value) => (a === b ? 0 : clamp01((value - a) / (b - a)));

export function smoothstep(edge0, edge1, value) {
  const t = invLerp(edge0, edge1, value);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, value) {
  const t = invLerp(edge0, edge1, value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Frame-rate independent exponential approach.
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export function wrapHeading(degrees) {
  let value = degrees % 360;
  if (value < 0) value += 360;
  return value;
}

export function headingDelta(from, to) {
  let delta = wrapHeading(to) - wrapHeading(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

// Compass bearings: 0 north (-Z), 90 east (+X).
export function headingFromDirection(dx, dz) {
  return wrapHeading((Math.atan2(dx, -dz) * 180) / Math.PI);
}

export function directionFromHeading(heading) {
  const radians = (heading * Math.PI) / 180;
  return { x: Math.sin(radians), z: -Math.cos(radians) };
}

export function distance2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

export function degrees(radians) {
  return (radians * 180) / Math.PI;
}

export function radians(degreesValue) {
  return (degreesValue * Math.PI) / 180;
}

export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function formatClock(seconds) {
  const tenthsTotal = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenthsTotal / 600);
  const secs = Math.floor((tenthsTotal % 600) / 10);
  const tenths = tenthsTotal % 10;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatDuration(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// An elliptical island mask. 1 inside the plateau, 0 out at sea.
export function ellipseMask(x, z, cx, cz, rx, rz, softness = 0.16) {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  return 1 - smoothstep(1 - softness, 1 + softness * 0.35, d);
}

export function gaussian2d(x, z, cx, cz, rx, rz) {
  const nx = (x - cx) / rx;
  const nz = (z - cz) / rz;
  return Math.exp(-(nx * nx + nz * nz));
}
