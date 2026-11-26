// Sky, sun and weather. Presets key the same world to golden hour, midday, late afternoon and
// the blue dusk used by the screenshots; the northern storm wall is real geometry, not a backdrop.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { Rng } from './rng.js';

const PRESETS = {
  golden: {
    zenith: 0x4f8fa2,
    horizon: 0xffcf9e,
    lower: 0xf4b982,
    sun: 0xffe0b0,
    sunDir: new THREE.Vector3(-0.78, 0.27, 0.28),
    sunIntensity: 3.1,
    hemiSky: 0xffdfb9,
    hemiGround: 0x4a5a42,
    hemiIntensity: 0.72,
    fog: 0xf0c79f,
    fogDensity: 0.000072,
    exposure: 1.08,
    cloud: 0xf7e6cc,
    stormCloud: 0x5a666b,
    bird: 0x2f3836,
  },
  midday: {
    zenith: 0x2f6f8f,
    horizon: 0xd9ecd9,
    lower: 0xaed7cf,
    sun: 0xfff6dc,
    sunDir: new THREE.Vector3(0.4, 0.8, 0.34),
    sunIntensity: 3.35,
    hemiSky: 0xdcefe9,
    hemiGround: 0x586b46,
    hemiIntensity: 0.82,
    fog: 0xc4ded4,
    fogDensity: 0.000055,
    exposure: 1.0,
    cloud: 0xfff8e6,
    stormCloud: 0x6d797b,
    bird: 0x35413e,
  },
  afternoon: {
    zenith: 0x356f87,
    horizon: 0xf6c68f,
    lower: 0xe8ad7b,
    sun: 0xffd49b,
    sunDir: new THREE.Vector3(-0.6, 0.34, -0.35),
    sunIntensity: 3.0,
    hemiSky: 0xf6d7af,
    hemiGround: 0x485a42,
    hemiIntensity: 0.66,
    fog: 0xdfb891,
    fogDensity: 0.000074,
    exposure: 1.05,
    cloud: 0xf5e3c9,
    stormCloud: 0x4c5a60,
    bird: 0x2c3532,
  },
  dusk: {
    zenith: 0x203a58,
    horizon: 0xe79472,
    lower: 0x8d6f76,
    sun: 0xffc39d,
    sunDir: new THREE.Vector3(-0.9, 0.055, 0.36),
    sunIntensity: 1.45,
    hemiSky: 0x8da2b8,
    hemiGround: 0x38404b,
    hemiIntensity: 0.5,
    fog: 0x8b8795,
    fogDensity: 0.000085,
    exposure: 1.14,
    cloud: 0xd7a58f,
    stormCloud: 0x3a4653,
    bird: 0x263037,
  },
  storm: {
    zenith: 0x2c3e48,
    horizon: 0x869496,
    lower: 0x5a6667,
    sun: 0xd9d4c0,
    sunDir: new THREE.Vector3(-0.25, 0.4, -0.4),
    sunIntensity: 1.15,
    hemiSky: 0x96a6a9,
    hemiGround: 0x39453e,
    hemiIntensity: 0.55,
    fog: 0x7a8989,
    fogDensity: 0.00016,
    exposure: 0.94,
    cloud: 0x9aa2a0,
    stormCloud: 0x39464d,
    bird: 0x272f31,
  },
};

const CLOUD_GEOMETRY = new THREE.SphereGeometry(1, 9, 6);

function buildSkyDome() {
  const geometry = new THREE.SphereGeometry(8500, 32, 20);
  const uniforms = {
    uZenith: { value: new THREE.Color(PRESETS.golden.zenith) },
    uHorizon: { value: new THREE.Color(PRESETS.golden.horizon) },
    uLower: { value: new THREE.Color(PRESETS.golden.lower) },
    uSunColor: { value: new THREE.Color(PRESETS.golden.sun) },
    uSunDir: { value: PRESETS.golden.sunDir.clone() },
    uStorm: { value: 0 },
    uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 world = modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vDir;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uLower;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uStorm;
      uniform float uTime;
      void main() {
        vec3 dir = normalize(vDir);
        float up = max(dir.y, 0.0);
        float band = pow(clamp(up / 0.38, 0.0, 1.0), 0.62);
        vec3 color = mix(uHorizon, uZenith, band);
        float low = 1.0 - smoothstep(-0.18, 0.0, dir.y);
        color = mix(color, uLower, low * 0.8);
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float disc = smoothstep(0.9992, 0.99972, sunDot);
        float halo = pow(sunDot, 14.0) * 0.26 + pow(sunDot, 120.0) * 0.5;
        float horizonGlow = pow(1.0 - up, 7.0) * pow(max(sunDot, 0.0), 1.4) * 0.24;
        color += uSunColor * (disc * 1.55 + halo + horizonGlow);
        vec3 warm = vec3(1.0, 0.58, 0.32);
        color = mix(color, warm * 0.6 + color * 0.5, uStorm * 0.18);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky dome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -20;
  return { mesh, uniforms };
}

function cloudPuffMatrix(target, x, y, z, sx, sy, sz, ry) {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  target.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(sx, sy, sz));
}

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'sky and weather';
    scene.add(this.group);
    this.time = 0;
    this.flash = 0;
    this.presetName = 'golden';
    this.tempMatrix = new THREE.Matrix4();
    this.rng = new Rng(WORLD.seed ^ 0x5c10d);
    this.birds = [];

    const dome = buildSkyDome();
    this.dome = dome.mesh;
    this.domeUniforms = dome.uniforms;
    this.group.add(this.dome);

    this.glow = new THREE.PointLight(0xffd8a0, 0, 900, 1.7);
    this.group.add(this.glow);

    this.hemi = new THREE.HemisphereLight(0xffdfb9, 0x4a5a42, 0.72);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe0b0, 3.1);
    this.sun.name = 'sun';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 1600;
    this.sun.shadow.camera.left = -230;
    this.sun.shadow.camera.right = 230;
    this.sun.shadow.camera.top = 230;
    this.sun.shadow.camera.bottom = -230;
    this.sun.shadow.bias = -0.0007;
    this.sun.shadow.normalBias = 2.4;
    this.sunTarget = new THREE.Object3D();
    this.group.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.ambient = new THREE.AmbientLight(0xffebd0, 0.16);
    this.group.add(this.ambient);

    scene.fog = new THREE.FogExp2(PRESETS.golden.fog, PRESETS.golden.fogDensity);

    this.buildClouds();
    this.buildStormWall();
    this.buildBirds();
    this.setPreset('golden');
  }

  buildClouds() {
    const puffs = [];
    const clusters = 42;
    for (let c = 0; c < clusters; c += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(1600, 5200);
      const cx = Math.cos(angle) * radius - 200;
      const cz = Math.sin(angle) * radius - 600;
      const cy = this.rng.range(330, 620);
      const size = this.rng.range(0.65, 1.75);
      const count = this.rng.int(4, 8);
      for (let p = 0; p < count; p += 1) {
        puffs.push({
          x: cx + this.rng.range(-1.6, 1.6) * 70 * size,
          y: cy + this.rng.range(-0.12, 0.34) * 60 * size,
          z: cz + this.rng.range(-1.1, 1.1) * 45 * size,
          sx: this.rng.range(38, 78) * size,
          sy: this.rng.range(22, 38) * size,
          sz: this.rng.range(32, 58) * size,
          ry: this.rng.range(0, Math.PI),
        });
      }
    }
    const material = new THREE.MeshLambertMaterial({
      color: PRESETS.golden.cloud,
      emissive: 0x6b6256,
      emissiveIntensity: 0.22,
    });
    const mesh = new THREE.InstancedMesh(CLOUD_GEOMETRY, material, puffs.length);
    mesh.name = 'fair weather cumulus';
    puffs.forEach((puff, index) => {
      cloudPuffMatrix(this.tempMatrix, puff.x, puff.y, puff.z, puff.sx, puff.sy, puff.sz, puff.ry);
      mesh.setMatrixAt(index, this.tempMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.cloudMaterial = material;
    this.clouds = mesh;
    this.group.add(mesh);
  }

  buildStormWall() {
    const puffs = [];
    for (let row = 0; row < 4; row += 1) {
      for (let i = 0; i < 34; i += 1) {
        const x = -5200 + (i / 33) * 10400 + this.rng.range(-120, 120);
        const z = WORLD.stormLineZ - row * 240 + this.rng.range(-160, 120);
        const y = 230 + row * 105 + this.rng.range(-50, 80);
        const size = this.rng.range(1.0, 2.1) * (1 + row * 0.12);
        puffs.push({
          x,
          y,
          z,
          sx: this.rng.range(150, 270) * size,
          sy: this.rng.range(90, 160) * size,
          sz: this.rng.range(100, 170) * size,
          ry: this.rng.range(0, Math.PI),
        });
      }
    }
    // A few lower, ragged cells give the wall a dark underside.
    for (let i = 0; i < 26; i += 1) {
      puffs.push({
        x: -4400 + i * 340 + this.rng.range(-100, 100),
        y: 140 + this.rng.range(0, 85),
        z: WORLD.stormLineZ + 260 + this.rng.range(-80, 120),
        sx: this.rng.range(140, 250),
        sy: this.rng.range(55, 100),
        sz: this.rng.range(90, 155),
        ry: this.rng.range(0, Math.PI),
      });
    }
    const material = new THREE.MeshLambertMaterial({
      color: PRESETS.golden.stormCloud,
      flatShading: true,
      emissive: 0x151c20,
      emissiveIntensity: 0.35,
    });
    const mesh = new THREE.InstancedMesh(CLOUD_GEOMETRY, material, puffs.length);
    mesh.name = 'northern storm wall';
    puffs.forEach((puff, index) => {
      cloudPuffMatrix(this.tempMatrix, puff.x, puff.y, puff.z, puff.sx, puff.sy, puff.sz, puff.ry);
      mesh.setMatrixAt(index, this.tempMatrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.stormMaterial = material;
    this.stormWall = mesh;
    this.group.add(mesh);
  }

  buildBirds() {
    const birdGeometry = new THREE.BufferGeometry();
    birdGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1.1, 0, 0.2, 0, 0.2, 0, -0.35, 0.1, 0.08, 0.35, 0.1, 0.08, 0, 0.2, 0, 1.1, 0, 0.2], 3),
    );
    const material = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.DoubleSide });
    this.birdMaterial = material;
    for (let i = 0; i < 11; i += 1) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(birdGeometry, material);
      mesh.scale.setScalar(this.rng.range(1.1, 2.0));
      pivot.add(mesh);
      const radius = this.rng.range(35, 95);
      pivot.userData = {
        radius,
        speed: this.rng.range(0.08, 0.18) * (this.rng.chance(0.5) ? 1 : -1),
        phase: this.rng.range(0, Math.PI * 2),
        height: this.rng.range(75, 150),
        centerX: this.rng.range(-900, 400),
        centerZ: this.rng.range(-500, 800),
      };
      this.birds.push(pivot);
      this.group.add(pivot);
    }
  }

  setPreset(name) {
    const preset = PRESETS[name] ?? PRESETS.golden;
    this.presetName = name;
    this.preset = preset;
    this.domeUniforms.uZenith.value.set(preset.zenith);
    this.domeUniforms.uHorizon.value.set(preset.horizon);
    this.domeUniforms.uLower.value.set(preset.lower);
    this.domeUniforms.uSunColor.value.set(preset.sun);
    this.domeUniforms.uSunDir.value.copy(preset.sunDir).normalize();
    this.domeUniforms.uStorm.value = name === 'storm' ? 1 : name === 'dusk' ? 0.35 : 0.12;
    this.sun.color.set(preset.sun);
    this.sun.intensity = preset.sunIntensity;
    this.hemi.color.set(preset.hemiSky);
    this.hemi.groundColor.set(preset.hemiGround);
    this.hemi.intensity = preset.hemiIntensity;
    this.ambient.intensity = 0.11 + preset.hemiIntensity * 0.09;
    this.scene.fog.color.set(preset.fog);
    this.scene.fog.density = preset.fogDensity;
    this.renderer.toneMappingExposure = preset.exposure;
    this.cloudMaterial.color.set(preset.cloud);
    this.stormMaterial.color.set(preset.stormCloud);
    this.stormWall.visible = name !== 'golden' && name !== 'midday';
    this.birdMaterial.color.set(preset.bird);
    this.sunDirection = preset.sunDir.clone().normalize();
    this.glow.color.set(preset.sun);
    this.glow.intensity = name === 'dusk' ? 3200 : 0;
  }

  focus(position) {
    this.sunTarget.position.copy(position);
    this.sunTarget.updateMatrixWorld();
    this.sun.position.copy(position).addScaledVector(this.sunDirection, 900);
    this.sun.position.y += 80;
    this.sun.updateMatrixWorld();
  }

  // Rolling bird flocks: a small moving detail that sells the scale of the coast.
  updateBirds(dt) {
    for (const bird of this.birds) {
      const data = bird.userData;
      const angle = this.time * data.speed + data.phase;
      bird.position.set(
        data.centerX + Math.cos(angle) * data.radius,
        data.height + Math.sin(this.time * 0.7 + data.phase) * 5,
        data.centerZ + Math.sin(angle) * data.radius * 0.7,
      );
      bird.rotation.y = -angle + (data.speed > 0 ? Math.PI : 0);
      const bank = Math.sin(this.time * 2.4 + data.phase) * 0.22;
      bird.rotation.z = bank;
    }
  }

  update(dt, cameraPosition) {
    this.time += dt;
    this.domeUniforms.uTime.value = this.time;
    this.updateBirds(dt);
    if (cameraPosition) {
      this.dome.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
    this.flash = Math.max(0, this.flash - dt * 3.4);
    const gust = Math.sin(this.time * 0.6) * 0.06;
    this.sun.intensity = this.preset.sunIntensity + gust;
    if (this.presetName === 'storm') {
      const pulse = Math.sin(this.time * 7.3) * Math.sin(this.time * 2.1);
      this.sun.intensity = this.preset.sunIntensity + Math.max(0, pulse) * 0.25;
    }
  }

  isStorm(x, z) {
    return z < WORLD.stormLineZ + 900;
  }
}

export { PRESETS };
