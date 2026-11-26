// Camera behaviour. The chase rig springs behind the aircraft and refuses to enter terrain; the
// cockpit sits at the pilot's eye; the title camera makes a slow, low orbit of the parked Kestrel.

import * as THREE from '../vendor/three.module.min.js';
import { CAMERA } from './config.js';
import { surfaceHeightAt } from './terrain.js';
import { clamp, damp } from './math-utils.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const localEye = new THREE.Vector3();
const desiredPosition = new THREE.Vector3();
const desiredLook = new THREE.Vector3();
const temp = new THREE.Vector3();

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.time = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.shake = 0;
    this.fov = CAMERA.fov;
    this.smoothPosition = new THREE.Vector3(700, 220, 900);
    this.smoothLook = new THREE.Vector3(0, 40, 0);
    this.initialised = false;
    this.cinematic = null;
    this.titleAngle = 2.3;
  }

  setMode(mode) {
    this.mode = mode;
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  toggleMode() {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase';
    this.lookYaw = 0;
    this.lookPitch = 0;
    return this.mode;
  }

  addLook(dx, dy) {
    this.lookYaw = clamp(this.lookYaw - dx * 0.0032, -1.5, 1.5);
    this.lookPitch = clamp(this.lookPitch - dy * 0.0025, -0.65, 0.65);
  }

  resetLook() {
    this.lookYaw = 0;
    this.lookPitch = 0;
  }

  configureCinematic(options) {
    this.cinematic = options ? { ...options } : null;
  }

  update(dt, state, options = {}) {
    this.time += dt;
    const turbulence = options.turbulence ?? 0;
    const stall = state.stalled ? 1 : 0;
    const targetShake = turbulence * 0.38 + stall * 0.24;
    this.shake = damp(this.shake, targetShake, 4, dt);
    const shakeX = Math.sin(this.time * 23) * 0.09 * this.shake;
    const shakeY = Math.sin(this.time * 19 + 1.4) * 0.11 * this.shake;
    const planePosition = state.position;
    const quaternion = state.quaternion;

    if (options.forceOrbit || this.mode === 'title') {
      this.updateOrbit(dt, planePosition, options);
      return;
    }
    if (this.mode === 'cockpit') {
      this.updateCockpit(dt, planePosition, quaternion, shakeX, shakeY);
      return;
    }
    this.updateChase(dt, planePosition, quaternion, shakeX, shakeY, options, state);
  }

  updateOrbit(dt, planePosition, options) {
    this.titleAngle += dt * (options.orbitSpeed ?? 0.085);
    const radius = options.orbitRadius ?? 23;
    const height = options.orbitHeight ?? 5.2;
    const angle = this.titleAngle;
    desiredPosition.set(
      planePosition.x + Math.cos(angle) * radius,
      planePosition.y + height + Math.sin(angle * 1.7) * 1.3,
      planePosition.z + Math.sin(angle) * radius,
    );
    desiredLook.copy(planePosition).addScaledVector(WORLD_UP, 0.8);
    desiredLook.x += Math.cos(angle + 0.9) * 1.4;
    if (!this.initialised) {
      this.smoothPosition.copy(desiredPosition);
      this.smoothLook.copy(desiredLook);
      this.initialised = true;
    }
    this.smoothPosition.lerp(desiredPosition, 1 - Math.exp(-2.8 * dt));
    this.smoothLook.lerp(desiredLook, 1 - Math.exp(-4.2 * dt));
    this.camera.position.copy(this.smoothPosition);
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.smoothLook);
    this.setFov(46, dt);
  }

  updateChase(dt, planePosition, quaternion, shakeX, shakeY, options, state) {
    const forward = temp.set(0, 0, -1).applyQuaternion(quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const speed = (state.iasKts ?? 110) / 1.94384;
    const distance = CAMERA.chaseDistance + clamp(speed * 0.04, 0, 5);
    const side = CAMERA.chaseSide;
    const cinematic = this.cinematic;
    if (cinematic) {
      desiredPosition
        .copy(planePosition)
        .addScaledVector(forward, -cinematic.distance)
        .addScaledVector(right, cinematic.side)
        .addScaledVector(WORLD_UP, cinematic.height);
      desiredLook
        .copy(planePosition)
        .addScaledVector(forward, cinematic.lookAhead)
        .addScaledVector(right, cinematic.lookSide ?? 0)
        .addScaledVector(WORLD_UP, cinematic.lookHeight ?? 0);
    } else {
      desiredPosition
        .copy(planePosition)
        .addScaledVector(forward, -distance)
        .addScaledVector(right, side)
        .addScaledVector(WORLD_UP, CAMERA.chaseHeight);
      desiredLook
        .copy(planePosition)
        .addScaledVector(forward, CAMERA.lookAhead)
        .addScaledVector(WORLD_UP, 1.1)
        .addScaledVector(right, 0.25);
    }
    const ground = Math.max(0.7, surfaceHeightAt(desiredPosition.x, desiredPosition.z)) + 3.2;
    if (desiredPosition.y < ground) desiredPosition.y = ground;
    if (!this.initialised) {
      this.smoothPosition.copy(desiredPosition);
      this.smoothLook.copy(desiredLook);
      this.initialised = true;
    }
    const posLambda = cinematic ? 7.5 : 5.4;
    const lookLambda = cinematic ? 7.5 : 7.2;
    this.smoothPosition.lerp(desiredPosition, 1 - Math.exp(-posLambda * dt));
    this.smoothLook.lerp(desiredLook, 1 - Math.exp(-lookLambda * dt));
    const smoothGround = Math.max(0.7, surfaceHeightAt(this.smoothPosition.x, this.smoothPosition.z)) + 2.3;
    if (this.smoothPosition.y < smoothGround) this.smoothPosition.y = smoothGround;
    this.camera.position.copy(this.smoothPosition);
    this.camera.position.x += shakeX;
    this.camera.position.y += shakeY;
    const upMix = new THREE.Vector3().copy(WORLD_UP).lerp(up, 0.16).normalize();
    this.camera.up.copy(upMix);
    this.camera.lookAt(this.smoothLook);
    this.setFov(cinematic?.fov ?? (CAMERA.fov + clamp(speed * 0.03, 0, 4)), dt);
    this.lastSpeed = speed;
  }

  updateCockpit(dt, planePosition, quaternion, shakeX, shakeY) {
    localEye.set(...CAMERA.cockpitEye);
    localEye.applyQuaternion(quaternion);
    desiredPosition.copy(planePosition).add(localEye);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, this.lookYaw);
    const pitchAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(pitchAxis, this.lookPitch);
    const lookDirection = new THREE.Vector3(0, -0.2, -40).applyQuaternion(quaternion).applyQuaternion(yawQuat).applyQuaternion(pitchQuat);
    desiredLook.copy(desiredPosition).add(lookDirection);
    if (!this.initialised) {
      this.smoothPosition.copy(desiredPosition);
      this.smoothLook.copy(desiredLook);
      this.initialised = true;
    }
    this.smoothPosition.lerp(desiredPosition, 1 - Math.exp(-18 * dt));
    this.smoothLook.lerp(desiredLook, 1 - Math.exp(-18 * dt));
    this.camera.position.copy(this.smoothPosition);
    this.camera.position.x += shakeX * 0.45;
    this.camera.position.y += shakeY * 0.45;
    this.camera.up.copy(WORLD_UP);
    this.camera.lookAt(this.smoothLook);
    this.setFov(57, dt);
  }

  setFov(target, dt) {
    this.fov = damp(this.fov, target, 3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
