// Weather and aircraft effects. Rain is a camera-local streak field, smoke and spray are one
// instanced particle pool, and soft wingtip trails appear only when the wing is working hard.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { Rng } from './rng.js';
import { surfaceHeightAt } from './terrain.js';
import { clamp } from './math-utils.js';

const PARTICLE_COUNT = 150;
const RAIN_COUNT = 900;
const TRAIL_POINTS = 44;

export class EffectsSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'weather and effects';
    scene.add(this.group);
    this.time = 0;
    this.rng = new Rng(WORLD.seed ^ 0xefec75);
    this.rainIntensity = 0;
    this.lastTouchdown = null;
    this.smokeTimer = 0;
    this.dustTimer = 0;
    this.sprayTimer = 0;
    this.flash = 0;
    this.particles = [];
    this.buildParticles();
    this.buildRain();
    this.buildTrails();
    this.buildStormBolts();
    this.buildShadow();
  }

  buildShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(10,20,20,0.8)');
    gradient.addColorStop(0.55, 'rgba(10,20,20,0.38)');
    gradient.addColorStop(1, 'rgba(10,20,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.3, depthWrite: false });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
    this.shadow.renderOrder = 2;
    this.shadow.frustumCulled = false;
    this.group.add(this.shadow);
  }

  updateShadow(state) {
    const ground = Math.max(0.55, surfaceHeightAt(state.position.x, state.position.z) + 0.18);
    const altitude = Math.max(0, state.position.y - 1.48 - ground);
    this.shadow.position.set(state.position.x, ground, state.position.z);
    this.shadow.rotation.y = -(state.heading * Math.PI) / 180;
    const size = 15 + Math.min(26, altitude * 0.1);
    this.shadow.scale.set(size, 1, size * 0.72);
    this.shadow.material.opacity = clamp(0.42 - altitude * 0.0006, 0.14, 0.42);
    this.shadow.visible = !state.crashed || altitude < 5;
  }

  buildParticles() {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.name = 'smoke spray and dust';
    const matrix = new THREE.Matrix4().makeScale(0.001, 0.001, 0.001);
    const color = new THREE.Color(0xffffff);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      this.particles.push({ life: 0, maxLife: 1, position: new THREE.Vector3(), velocity: new THREE.Vector3(), size: 1, color });
      this.particleMesh.setMatrixAt(i, matrix);
      this.particleMesh.setColorAt(i, color);
    }
    this.group.add(this.particleMesh);
    this.tempMatrix = new THREE.Matrix4();
    this.tempColor = new THREE.Color();
  }

  buildRain() {
    this.rainDrops = [];
    const positions = new Float32Array(RAIN_COUNT * 6);
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      this.rainDrops.push({
        x: this.rng.range(-60, 60),
        y: this.rng.range(-8, 60),
        z: this.rng.range(-60, 60),
        speed: this.rng.range(24, 38),
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xdce6df,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(geometry, material);
    this.rain.name = 'rain streaks';
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.group.add(this.rain);
  }

  buildTrails() {
    this.trails = [];
    for (let side = -1; side <= 1; side += 2) {
      const positions = new Float32Array(TRAIL_POINTS * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: 0xfff2d8,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.userData.side = side;
      line.userData.history = Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3());
      line.userData.initialised = false;
      this.group.add(line);
      this.trails.push(line);
    }
  }

  buildStormBolts() {
    const boltGroup = new THREE.Group();
    const material = new THREE.LineBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = [
      [-900, 610, -3380], [-820, 520, -3380], [-850, 470, -3380], [-720, 380, -3380], [-760, 320, -3380], [-640, 220, -3380],
      [720, 700, -3420], [650, 590, -3420], [690, 520, -3420], [590, 420, -3420], [620, 350, -3420], [540, 260, -3420],
    ];
    for (let i = 0; i < 2; i += 1) {
      const slice = points.slice(i * 6, i * 6 + 6);
      const geometry = new THREE.BufferGeometry().setFromPoints(slice.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const line = new THREE.Line(geometry, material);
      boltGroup.add(line);
    }
    this.boltMaterial = material;
    this.group.add(boltGroup);
  }

  spawnParticle(position, velocity, size, color, life = 2.2) {
    let particle = this.particles.find((item) => item.life <= 0);
    if (!particle) particle = this.particles.reduce((a, b) => (a.life < b.life ? a : b));
    particle.life = life;
    particle.maxLife = life;
    particle.position.copy(position);
    particle.velocity.copy(velocity);
    particle.size = size;
    particle.color.set(color);
  }

  emitSmoke(dt, state) {
    if (state.crashed) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.045;
        for (let i = 0; i < 3; i += 1) {
          this.spawnParticle(
            state.position,
            new THREE.Vector3(this.rng.range(-5, 5), this.rng.range(2, 9), this.rng.range(-5, 5)),
            this.rng.range(2.5, 6.5),
            this.rng.chance(0.25) ? 0xe2603f : 0x2b2f2e,
            2.8,
          );
        }
      }
      return;
    }
    if (state.damage > 48) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.24 - clamp((state.damage - 48) / 100, 0, 0.16);
        this.spawnParticle(
          state.position,
          new THREE.Vector3(this.rng.range(-1.4, 1.4), this.rng.range(1, 3), this.rng.range(-1.4, 1.4)),
          1.4 + state.damage * 0.018,
          state.damage > 80 ? 0x363b39 : 0x8a9189,
          1.8,
        );
      }
    }
  }

  emitGroundSpray(dt, state) {
    if (state.crashed) return;
    const ground = surfaceHeightAt(state.position.x, state.position.z);
    if (state.onGround && state.throttle > 0.12 && state.iasKts > 8) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.22;
        const p = state.position.clone();
        p.x += this.rng.range(-3, 3) - this.forward(state).x * 2;
        p.z += this.rng.range(-3, 3) - this.forward(state).z * 2;
        p.y = ground + 0.6;
        this.spawnParticle(p, new THREE.Vector3(this.rng.range(-2, 2), 1.6, this.rng.range(-2, 2)), this.rng.range(0.8, 2.1), 0xd7c4a2, 1.1);
      }
    }
    if (state.aglFt < 55 && state.aglFt > 0.3 && ground < 0.4) {
      this.sprayTimer -= dt;
      if (this.sprayTimer <= 0 && state.iasKts > 18) {
        this.sprayTimer = 0.12;
        const p = state.position.clone();
        p.y = 1.1;
        p.x += this.rng.range(-4, 4);
        p.z += this.rng.range(-4, 4);
        this.spawnParticle(p, new THREE.Vector3(this.rng.range(-1, 1), this.rng.range(2, 5), this.rng.range(-1, 1)), this.rng.range(1.5, 3.8), 0xd6eee4, 1.3);
      }
    }
  }

  forward(state) {
    return { x: state.velocity.x, z: state.velocity.z };
  }

  handleTouchdown(state) {
    if (state.lastTouchdown && state.lastTouchdown !== this.lastTouchdown) {
      this.lastTouchdown = state.lastTouchdown;
      const p = state.position.clone();
      p.y -= 1.2;
      for (let i = 0; i < 14; i += 1) {
        this.spawnParticle(
          p,
          new THREE.Vector3(this.rng.range(-8, 8), this.rng.range(0.5, 4), this.rng.range(-8, 8)),
          this.rng.range(0.7, 2.3),
          this.rng.chance(0.3) ? 0x8f8e84 : 0xe8dcc5,
          1.8,
        );
      }
    }
  }

  updateParticles(dt) {
    let needsUpdate = false;
    this.particles.forEach((particle, index) => {
      if (particle.life > 0) {
        particle.life -= dt;
        particle.position.addScaledVector(particle.velocity, dt);
        particle.velocity.y += 0.5 * dt;
        particle.velocity.multiplyScalar(1 - 0.45 * dt);
        const factor = Math.max(0.001, particle.life / particle.maxLife);
        const size = particle.size * (1.2 - factor * 0.3);
        this.tempMatrix.compose(particle.position, new THREE.Quaternion(), new THREE.Vector3(size, size, size));
        this.particleMesh.setMatrixAt(index, this.tempMatrix);
        this.tempColor.copy(particle.color).multiplyScalar(0.7 + factor * 0.4);
        this.particleMesh.setColorAt(index, this.tempColor);
        needsUpdate = true;
      } else if (particle.life > -10) {
        particle.life = -11;
        this.tempMatrix.makeScale(0.001, 0.001, 0.001);
        this.particleMesh.setMatrixAt(index, this.tempMatrix);
        needsUpdate = true;
      }
    });
    if (needsUpdate) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  updateTrails(dt, state) {
    const active = !state.onGround && !state.crashed && state.gLoad > 1.28 && state.iasKts > 110;
    for (const line of this.trails) {
      const history = line.userData.history;
      const side = line.userData.side;
      const local = new THREE.Vector3(side * 5.35, 1.03, 0.7).applyQuaternion(state.quaternion).add(state.position);
      if (!line.userData.initialised || !active) {
        for (const point of history) point.copy(local);
        line.userData.initialised = true;
      } else {
        const last = history[history.length - 1];
        if (last.distanceToSquared(local) > 0.25) {
          history.shift();
          history.push(local.clone());
        }
      }
      const positions = line.geometry.attributes.position.array;
      history.forEach((point, i) => {
        positions[i * 3] = point.x;
        positions[i * 3 + 1] = point.y;
        positions[i * 3 + 2] = point.z;
      });
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.setDrawRange(0, TRAIL_POINTS);
      line.material.opacity = active ? clamp((state.gLoad - 1.2) * 0.25, 0, 0.28) : 0;
    }
  }

  updateRain(dt) {
    const intensity = this.rainIntensity;
    this.rain.visible = intensity > 0.02;
    if (!this.rain.visible) return;
    this.rain.material.opacity = 0.12 + intensity * 0.28;
    const cameraPosition = this.camera.position;
    const positions = this.rain.geometry.attributes.position.array;
    const windX = 3.2;
    const draw = Math.floor(RAIN_COUNT * clamp(intensity, 0.1, 1));
    for (let i = 0; i < RAIN_COUNT; i += 1) {
      const drop = this.rainDrops[i];
      drop.y -= drop.speed * dt;
      drop.x += windX * dt;
      if (drop.y < -20) {
        drop.y = 65 + this.rng.range(0, 20);
        drop.x = this.rng.range(-65, 65);
        drop.z = this.rng.range(-65, 65);
      }
      if (drop.x > 70) drop.x -= 140;
      const x = cameraPosition.x + drop.x;
      const y = cameraPosition.y + drop.y;
      const z = cameraPosition.z + drop.z;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x - windX * 0.035;
      positions[i * 6 + 4] = y - 1.9;
      positions[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.geometry.setDrawRange(0, draw * 2);
  }

  updateStormItems(dt) {
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.rainIntensity > 0.2 && this.time - this.lastFlash > 6.5) {
      this.lastFlash = this.time;
      this.flash = 1;
    }
    this.boltMaterial.opacity = 0.28 + this.flash * 0.7;
  }

  setRain(intensity) {
    this.rainIntensity = clamp(intensity, 0, 1);
    if (this.rainIntensity <= 0.02) this.rain.visible = false;
  }

  update(dt, state, options = {}) {
    this.time += dt;
    if (this.lastFlash === undefined) this.lastFlash = 0;
    this.handleTouchdown(state);
    this.emitSmoke(dt, state);
    this.emitGroundSpray(dt, state);
    this.updateParticles(dt);
    this.updateTrails(dt, state);
    this.updateShadow(state);
    this.updateRain(dt);
    if (options.rain !== undefined) this.rainIntensity = clamp(options.rain, 0, 1);
    this.updateStormItems(dt);
  }
}
