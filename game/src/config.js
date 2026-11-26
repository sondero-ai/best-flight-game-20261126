// Shared tuning and art direction for Kestrel Courier. One place for the palette, the shape of
// the Cinder Reach archipelago and the numbers that make the Kestrel fly.

export const VERSION = '1.0.0';
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
export const FIXED_STEP = 1 / 60;
// The Reach is a compact arcade archipelago; its nautical mile is compressed so a 1.2 NM
// final still puts the runway large enough to read on screen.
export const METERS_PER_NM = 420;

export const PALETTE = {
  seaDeep: 0x0f5e6e,
  seaShallow: 0x39b7b0,
  foam: 0xf3ead6,
  sage: 0x7d9b5a,
  jungle: 0x3f6b4a,
  sand: 0xe8c48f,
  cliff: 0xd9c2a0,
  rock: 0x8b8070,
  skyHorizon: 0xffd7a0,
  skyZenith: 0x2f6f8f,
  sun: 0xfff1c9,
  cream: 0xf2e7d0,
  teal: 0x1f7f86,
  coral: 0xe2603f,
  ink: 0x1c2526,
  mustard: 0xd9a441,
  asphalt: 0x4d5350,
  storm: 0x3c4a52,
  stormDark: 0x222e36,
  grassLight: 0x9caf6c,
  foamWarm: 0xf6ddba,
};

export const CSS = {
  paper: 'rgba(246,238,220,0.92)',
  paperSolid: '#f6eedc',
  ink: '#1c2526',
  coral: '#e2603f',
  teal: '#177a7e',
  mustard: '#d9a441',
  muted: 'rgba(28,37,38,0.64)',
  mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  sans: '"Segoe UI", system-ui, sans-serif',
};

export const WORLD = {
  seaLevel: 0,
  size: 11000,
  terrainSegments: 240,
  seed: 0x4b45_5354,
  runway: {
    centerX: 0,
    centerZ: 0,
    elevation: 42,
    length: 900,
    width: 34,
    heading: 90,
  },
  gullwing: {
    centerX: -450,
    centerZ: -2700,
    elevation: 82,
    length: 820,
    width: 24,
    heading: 270,
    runwayCenterX: -450,
  },
  cinder: { x: 600, z: 150, rx: 1050, rz: 980, base: 42 },
  northIsland: { x: -500, z: -2700, rx: 1150, rz: 780, base: 82 },
  narrowsNorth: { x: 1650, z: -360, rx: 1750, rz: 330, height: 205 },
  narrowsSouth: { x: 1650, z: 450, rx: 1500, rz: 280, height: 175 },
  lanternReef: { x: 1600, z: -2050, rx: 650, rz: 440 },
  stormLineZ: -3400,
};

export const FLIGHT = {
  mass: 1180,
  wingArea: 16.2,
  maxThrust: 7200,
  stallSpeed: 24,
  rotateSpeed: 27.5,
  bestClimbSpeed: 36,
  vne: 96,
  maxPitchRate: 1.15,
  maxRollRate: 2.0,
  maxYawRate: 0.65,
  fuelCapacity: 100,
  idleBurn: 0.008,
  fullBurn: 0.063,
  gravity: 9.81,
  takeoffHeading: 90,
  surfaceFriction: 0.55,
  brakeFriction: 1.5,
  gearDrag: 0.018,
  flapDrag: 0.028,
};

export const CAMERA = {
  fov: 52,
  chaseDistance: 27,
  chaseHeight: 5.2,
  chaseSide: 1.0,
  lookAhead: 15,
  cockpitEye: [0, 1.34, -0.35],
};

export const MISSION_IDS = ['first-light', 'narrows', 'lantern-watch', 'free-flight'];

export function terrainEpoch() {
  return { warm: 0xffcb8e, sky: 0x7fc5c9, ambience: 0.58 };
}
