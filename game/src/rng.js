// Deterministic randomness and smooth value noise. The archipelago is rebuilt identically on
// every load from WORLD.seed, including prop scatter, clouds and ring placement.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  range(min, max) {
    return min + (max - min) * this.next();
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

export function createNoise2D(seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const perm = new Uint8Array(512);
  const source = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [source[i], source[j]] = [source[j], source[i]];
  }
  for (let i = 0; i < 512; i += 1) perm[i] = source[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;

  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    return top + (bottom - top) * v;
  }

  function fbm(x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i += 1) {
      sum += (noise(fx, fy) * 2 - 1) * amp;
      norm += amp;
      amp *= gain;
      fx *= lacunarity;
      fy *= lacunarity;
    }
    return sum / norm;
  }

  function ridged(x, y, octaves = 4) {
    let sum = 0;
    let amp = 0.55;
    let fx = x;
    let fy = y;
    for (let i = 0; i < octaves; i += 1) {
      const n = 1 - Math.abs(noise(fx, fy) * 2 - 1);
      sum += n * n * amp;
      amp *= 0.5;
      fx *= 2.03;
      fy *= 2.03;
    }
    return sum;
  }

  return { noise, fbm, ridged };
}
