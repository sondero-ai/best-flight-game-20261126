// The Cinder Reach archipelago. One deterministic height field feeds the visual mesh, water
// depth, aircraft collision, prop placement and the minimap, so every system agrees on the world.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { createNoise2D, mulberry32 } from './rng.js';
import { clamp, ellipseMask, gaussian2d, lerp, smoothstep } from './math-utils.js';

const noise = createNoise2D(WORLD.seed);

export const AIRPORTS = {
  cinder: {
    id: 'cinder',
    name: 'Cinder Cay',
    code: 'CCY',
    elevation: WORLD.runway.elevation,
    centerX: WORLD.runway.centerX,
    centerZ: WORLD.runway.centerZ,
    length: WORLD.runway.length,
    width: WORLD.runway.width,
    heading: 90,
    thresholds: {
      9: { x: -450, z: 0, heading: 90, label: '09' },
      27: { x: 450, z: 0, heading: 270, label: '27' },
    },
  },
  gullwing: {
    id: 'gullwing',
    name: 'Gullwing Station',
    code: 'GWS',
    elevation: WORLD.gullwing.elevation,
    centerX: WORLD.gullwing.centerX,
    centerZ: WORLD.gullwing.centerZ,
    length: WORLD.gullwing.length,
    width: WORLD.gullwing.width,
    heading: 270,
    thresholds: {
      27: { x: -40, z: -2700, heading: 270, label: '27' },
      9: { x: -860, z: -2700, heading: 90, label: '09' },
    },
  },
};

export const CINDER_THRESHOLD_09 = new THREE.Vector3(-450, 42, 0);
export const GULLWING_THRESHOLD_27 = new THREE.Vector3(-40, 82, -2700);

function cinderLand(x, z) {
  const m = ellipseMask(x, z, WORLD.cinder.x, WORLD.cinder.z, WORLD.cinder.rx, WORLD.cinder.rz, 0.13);
  if (m <= 0) return -40;
  const northRidge = gaussian2d(x, z, 260, -540, 620, 300) * 150;
  const volcano = gaussian2d(x, z, 660, 610, 430, 350) * 210;
  const westHead = gaussian2d(x, z, -1080, 760, 330, 250) * 38;
  const eastRise = gaussian2d(x, z, 790, -80, 470, 380) * 55;
  const hills = northRidge + volcano + westHead + eastRise;
  const detail = noise.fbm(x * 0.0019, z * 0.0019, 4) * 11 + noise.fbm(x * 0.007, z * 0.007, 2) * 2.4;
  return 42 + (hills + detail) * m;
}

function gullwingLand(x, z) {
  const m = ellipseMask(x, z, WORLD.northIsland.x, WORLD.northIsland.z, WORLD.northIsland.rx, WORLD.northIsland.rz, 0.12);
  if (m <= 0) return -45;
  const volcano = gaussian2d(x, z, -900, -3020, 520, 390) * 235;
  const eastBluff = gaussian2d(x, z, 170, -2520, 240, 200) * 46;
  const detail = noise.fbm(x * 0.0024 + 11, z * 0.0024 - 7, 4) * 12;
  return 82 + (volcano + eastBluff + detail) * m;
}

function narrowsLand(x, z) {
  const northM = ellipseMask(x, z, WORLD.narrowsNorth.x, WORLD.narrowsNorth.z, WORLD.narrowsNorth.rx, WORLD.narrowsNorth.rz, 0.08);
  const southM = ellipseMask(x, z, WORLD.narrowsSouth.x, WORLD.narrowsSouth.z, WORLD.narrowsSouth.rx, WORLD.narrowsSouth.rz, 0.08);
  let height = -35;
  if (northM > 0) {
    const crags = noise.ridged(x * 0.0034, z * 0.0034, 4) * 135;
    const broad = noise.fbm(x * 0.0016, z * 0.0016, 3) * 45;
    height = lerp(height, 138 + crags + broad + gaussian2d(x, z, 2200, -480, 500, 230) * 105, northM);
  }
  if (southM > 0) {
    const crags = noise.ridged(x * 0.0038 + 4, z * 0.0038 + 2, 4) * 110;
    const broad = noise.fbm(x * 0.0017 - 3, z * 0.0017, 3) * 38;
    height = lerp(height, 120 + crags + broad + gaussian2d(x, z, 2400, 500, 420, 200) * 90, southM);
  }
  return height;
}

function reefLand(x, z) {
  const reef = ellipseMask(x, z, WORLD.lanternReef.x, WORLD.lanternReef.z, WORLD.lanternReef.rx, WORLD.lanternReef.rz, 0.35);
  let height = -34;
  if (reef > 0) {
    const shelf = -3.5 + noise.fbm(x * 0.006, z * 0.006, 3) * 4.2;
    height = lerp(height, shelf, reef);
    const cays =
      gaussian2d(x, z, 1450, -2080, 150, 95) * 11 +
      gaussian2d(x, z, 1810, -1960, 115, 80) * 8 +
      gaussian2d(x, z, 1980, -2300, 170, 95) * 6;
    height += cays;
  }
  return height;
}

function stormIslet(x, z) {
  const m = ellipseMask(x, z, 760, -3060, 190, 145, 0.22);
  if (m <= 0) return -44;
  const spike = noise.ridged(x * 0.012, z * 0.012, 3) * 24;
  return lerp(-44, 22 + spike, m);
}

function applyRunwayFlatten(x, z, height) {
  const cinder = AIRPORTS.cinder;
  const inCX = Math.abs(x - cinder.centerX) < cinder.length / 2 + 125;
  const inCZ = Math.abs(z - cinder.centerZ) < 115;
  if (inCX && inCZ) {
    const edgeZ = 1 - smoothstep(64, 115, Math.abs(z - cinder.centerZ));
    const edgeX = 1 - smoothstep(cinder.length / 2 + 50, cinder.length / 2 + 125, Math.abs(x - cinder.centerX));
    const blend = Math.min(edgeZ, edgeX);
    height = lerp(height, cinder.elevation - 1.05, blend);
  }
  const gull = AIRPORTS.gullwing;
  const inGX = Math.abs(x - gull.centerX) < gull.length / 2 + 110;
  const inGZ = Math.abs(z - gull.centerZ) < 100;
  if (inGX && inGZ) {
    const edgeZ = 1 - smoothstep(58, 100, Math.abs(z - gull.centerZ));
    const edgeX = 1 - smoothstep(gull.length / 2 + 40, gull.length / 2 + 110, Math.abs(x - gull.centerX));
    const blend = Math.min(edgeZ, edgeX);
    height = lerp(height, gull.elevation - 1.05, blend);
  }
  return height;
}

// The canonical world height. Land above 0, sea floor below. Values in metres.
export function heightAt(x, z) {
  let height = -42;
  const cinder = cinderLand(x, z);
  if (cinder > height) height = cinder;
  const gull = gullwingLand(x, z);
  if (gull > height) height = gull;
  const narrow = narrowsLand(x, z);
  if (narrow > height) height = narrow;
  const reef = reefLand(x, z);
  if (reef > height) height = reef;
  const islet = stormIslet(x, z);
  if (islet > height) height = islet;

  // A tidal channel cuts through Cinder's east shoulder and runs between the Narrows,
  // so the ring course threads water rather than dry grass.
  const channelX = smoothstep(860, 980, x) * (1 - smoothstep(3000, 3400, x));
  const channelZ = 1 - smoothstep(195, 335, Math.abs(z - (90 + Math.sin(x * 0.0032) * 45)));
  const channel = channelX * channelZ;
  if (channel > 0) height = lerp(height, -10, channel * 0.94);

  // Broad shallow shelves make the lagoon readable as turquoise rather than open ocean.
  if (height < 1.5) {
    const lagoon =
      gaussian2d(x, z, -1770, 680, 770, 620) * 0.85 +
      gaussian2d(x, z, 1550, 60, 1200, 450) * 0.8 +
      gaussian2d(x, z, 1700, -2080, 680, 450) * 0.65 +
      gaussian2d(x, z, -250, -1480, 780, 430) * 0.55;
    height = lerp(height, -4.5, clamp(lagoon, 0, 0.9));
  }
  height = applyRunwayFlatten(x, z, height);
  return height;
}

export function slopeAt(x, z) {
  const d = 24;
  const dx = (heightAt(x + d, z) - heightAt(x - d, z)) / (2 * d);
  const dz = (heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d);
  return Math.hypot(dx, dz);
}

export function isOverWater(x, z) {
  return heightAt(x, z) < 0.4;
}

export function airportAt(x, z) {
  for (const airport of Object.values(AIRPORTS)) {
    const halfL = airport.length / 2;
    const halfW = airport.width / 2;
    if (Math.abs(x - airport.centerX) <= halfL && Math.abs(z - airport.centerZ) <= halfW) return airport;
  }
  return null;
}

export function isOnPavement(x, z) {
  return airportAt(x, z) !== null;
}

// Surface the wheels touch: flatten strip, then terrain.
export function surfaceHeightAt(x, z) {
  const airport = airportAt(x, z);
  if (airport) return airport.elevation;
  return heightAt(x, z);
}

// Radio-altitude reference: sea level over water, ground elsewhere, runway pavement on strips.
export function referenceSurfaceAt(x, z) {
  const airport = airportAt(x, z);
  if (airport) return airport.elevation;
  return Math.max(0, heightAt(x, z));
}

export function runwayHeadingAt(x, z) {
  const airport = airportAt(x, z);
  return airport ? airport.heading : null;
}

// A compact colour picker shared by the terrain and minimap.
const colorCache = new Map();
function terrainColor(height, slope, jitter, tint) {
  const c = new THREE.Color();
  const sand = new THREE.Color(PALETTE.sand);
  const sage = new THREE.Color(PALETTE.sage);
  const jungle = new THREE.Color(PALETTE.jungle);
  const rock = new THREE.Color(PALETTE.rock);
  const cliff = new THREE.Color(PALETTE.cliff);
  const light = new THREE.Color(PALETTE.grassLight);
  if (height < 2.2) {
    c.copy(sand).lerp(new THREE.Color(PALETTE.foamWarm), jitter * 0.3);
  } else if (height < 7.5 && slope < 0.45) {
    c.copy(sand).lerp(sage, smoothstep(3.5, 9, height) * 0.4);
  } else if (height > 258) {
    c.copy(rock).lerp(cliff, 0.35 + jitter * 0.25);
  } else {
    c.copy(sage).lerp(jungle, clamp(jitter * 0.7 + height / 300, 0, 0.72));
    if (tint > 0.6) c.lerp(light, 0.24);
    if (height > 120) c.lerp(rock, smoothstep(120, 210, height) * 0.5);
    if (slope > 0.9) c.lerp(rock, smoothstep(0.9, 1.6, slope) * 0.42);
  }
  if (slope > 1.5) c.lerp(cliff, 0.16);
  return c;
}

export class Terrain {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Cinder Reach terrain';
    this.mesh = this.buildMesh();
    this.group.add(this.mesh);
    this.boundary = WORLD.size / 2 - 120;
  }

  buildMesh() {
    const segments = WORLD.terrainSegments;
    const geometry = new THREE.PlaneGeometry(WORLD.size, WORLD.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const rng = mulberry32(WORLD.seed ^ 0x51f15e);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const h = heightAt(x, z);
      position.setY(i, h);
      const slope = slopeAt(x, z);
      const jitter = rng();
      const tint = noise.fbm(x * 0.012, z * 0.012, 2) * 0.5 + 0.5;
      color.copy(terrainColor(h, slope, jitter, tint));
      color.offsetHSL((jitter - 0.5) * 0.012, (tint - 0.5) * 0.05, (jitter - 0.5) * 0.035);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'archipelago';
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  height(x, z) {
    return heightAt(x, z);
  }

  isWater(x, z) {
    return heightAt(x, z) < 0.4;
  }

  isRunway(x, z) {
    return airportAt(x, z) !== null;
  }
}

export function createTerrain() {
  return new Terrain();
}
