// Shallow-water ocean. Bathymetry sampled from the terrain drives the deep-to-turquoise gradient
// and the foam line; the shader adds slow swell, sparkle and a warm low-sun reflection.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { heightAt } from './terrain.js';
import { clamp01, smoothstep } from './math-utils.js';

export function createOcean() {
  const geometry = new THREE.PlaneGeometry(WORLD.size, WORLD.size, 210, 210);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const depths = new Float32Array(position.count);
  const colors = new Float32Array(position.count * 3);
  const deep = new THREE.Color(PALETTE.seaDeep);
  const shallow = new THREE.Color(PALETTE.seaShallow);
  const foam = new THREE.Color(PALETTE.foam);
  const temp = new THREE.Color();
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const floor = heightAt(x, z);
    const depth = Math.max(0, -floor);
    depths[i] = depth;
    const shore = 1 - smoothstep(0.9, 24, depth);
    const mid = 1 - smoothstep(5, 58, depth);
    temp.copy(deep).lerp(shallow, mid * 0.86);
    temp.lerp(foam, shore * 0.48);
    colors[i * 3] = temp.r;
    colors[i * 3 + 1] = temp.g;
    colors[i * 3 + 2] = temp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSunDirection: { value: new THREE.Vector3(-0.4, 0.36, -0.84).normalize() },
    uSunColor: { value: new THREE.Color(PALETTE.sun) },
    uHorizonColor: { value: new THREE.Color(PALETTE.skyHorizon) },
    uFoamColor: { value: new THREE.Color(PALETTE.foam) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexColors: true,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float aDepth;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vWave;
      uniform float uTime;
      void main() {
        vec3 p = position;
        float swell = sin(p.x * 0.026 + uTime * 0.72) * 0.32 +
                      cos(p.z * 0.031 - uTime * 0.54) * 0.25 +
                      sin((p.x + p.z) * 0.061 + uTime * 1.17) * 0.1;
        float inshore = smoothstep(0.0, 7.0, aDepth);
        p.y += swell * (0.28 + inshore * 0.55);
        vWave = swell;
        vDepth = aDepth;
        vColor = color;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying float vDepth;
      varying float vWave;
      uniform float uTime;
      uniform vec3 uSunDirection;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uFoamColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        float time = uTime;
        float dx = cos(vWorld.x * 0.026 + time * 0.72) * 0.0083;
        float dz = -sin(vWorld.z * 0.031 - time * 0.54) * 0.0078;
        dx += cos((vWorld.x + vWorld.z) * 0.061 + time * 1.17) * 0.0042;
        vec3 normal = normalize(vec3(-dx, 1.0, -dz + 0.002));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 sunDir = normalize(uSunDirection);
        vec3 base = vColor;

        float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
        base = mix(base, uHorizonColor * 0.55, fresnel * 0.42);

        float sparkleNoise = noise2(vWorld.xz * 0.22 + vec2(time * 0.3, -time * 0.21));
        vec3 halfDir = normalize(sunDir + viewDir);
        float glint = pow(max(dot(normal, halfDir), 0.0), 220.0);
        float glitter = smoothstep(0.82, 1.0, sparkleNoise) * pow(max(dot(normal, halfDir), 0.0), 42.0);
        base += uSunColor * (glint * 1.35 + glitter * 0.45);

        float shore = 1.0 - smoothstep(0.6, 9.0, vDepth);
        float band = noise2(vWorld.xz * 0.12 + vec2(time * 0.14, time * 0.1));
        float foam = smoothstep(0.62, 0.88, shore * (0.58 + band * 0.55));
        foam += smoothstep(0.93, 1.0, band) * smoothstep(1.0, 4.0, vDepth) * (1.0 - smoothstep(4.0, 9.0, vDepth)) * 0.35;
        foam = clamp(foam, 0.0, 0.8);
        base = mix(base, uFoamColor, foam * 0.78);

        float distanceToCamera = length(cameraPosition - vWorld);
        float haze = smoothstep(1600.0, 5200.0, distanceToCamera);
        base = mix(base, uHorizonColor * 0.86, haze * 0.62);
        gl_FragColor = vec4(base, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Cinder Reach ocean';
  mesh.position.y = WORLD.seaLevel + 0.32;
  mesh.receiveShadow = false;

  let elapsed = 0;
  return {
    mesh,
    uniforms,
    update(dt) {
      elapsed += dt;
      uniforms.uTime.value = elapsed;
    },
    setSun(direction, color) {
      uniforms.uSunDirection.value.copy(direction).normalize();
      if (color !== undefined) uniforms.uSunColor.value.set(color);
    },
    setTime(seconds) {
      elapsed = seconds;
      uniforms.uTime.value = seconds;
    },
    isWaterAt(x, z) {
      return heightAt(x, z) < WORLD.seaLevel + 0.2;
    },
  };
}
