// The Kestrel K-2: a procedural bush plane in cream and teal. Every surface is authored here;
// ailerons, elevator, rudder, flaps, gear and the propeller respond to the flight state.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';
import { clamp } from './math-utils.js';

const MAT = {};
function material(key, color, options = {}) {
  if (!MAT[key]) {
    MAT[key] = new THREE.MeshLambertMaterial({ color, flatShading: true, ...options });
  }
  return MAT[key];
}

function cylinderBetween(start, end, radius, mat, segments = 6) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.copy(start).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

function buildFuselage(cream, ink) {
  const sections = [
    { z: -3.5, r: 0.34 },
    { z: -2.9, r: 0.62 },
    { z: -1.7, r: 0.77 },
    { z: -0.2, r: 0.8 },
    { z: 1.2, r: 0.66 },
    { z: 2.5, r: 0.38 },
    { z: 3.25, r: 0.13 },
  ];
  const radial = 10;
  const positions = [];
  const indices = [];
  for (const section of sections) {
    for (let i = 0; i < radial; i += 1) {
      const angle = (i / radial) * Math.PI * 2;
      positions.push(Math.cos(angle) * section.r, Math.sin(angle) * section.r + 0.08, section.z);
    }
  }
  for (let s = 0; s < sections.length - 1; s += 1) {
    for (let i = 0; i < radial; i += 1) {
      const a = s * radial + i;
      const b = s * radial + ((i + 1) % radial);
      const c = (s + 1) * radial + i;
      const d = (s + 1) * radial + ((i + 1) % radial);
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, cream);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'fuselage';
  const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.63, 0.62, 10), cream);
  cowl.rotation.x = Math.PI / 2;
  cowl.position.set(0, 0.05, -3.62);
  cowl.castShadow = true;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.35, 10), ink);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.05, -3.35);
  return { mesh, cowl, ring };
}

function buildWing(teal, cream, coral, ink) {
  const group = new THREE.Group();
  const span = 11.4;
  const rootChord = 1.9;
  const tipChord = 1.15;
  const thickness = 0.16;
  const positions = [];
  const indices = [];
  const half = span / 2;
  // A simple tapered, very slightly swept high wing.
  const outline = [
    [-half, 0.12, -0.62],
    [-half, 0.12, 0.52],
    [-1.0, 0.2, 0.95],
    [1.0, 0.2, 0.95],
    [half, 0.12, 0.52],
    [half, 0.12, -0.62],
    [-1.0, 0.2, -0.85],
    [1.0, 0.2, -0.85],
  ];
  for (const p of outline) positions.push(...p);
  for (const p of outline) positions.push(p[0], p[1] - thickness, p[2]);
  const upper = [4, 3, 2, 2, 1, 0];
  const lower = [5, 6, 7, 7, 8, 9];
  indices.push(...upper, ...lower);
  for (let i = 0; i < 8; i += 1) {
    const next = (i + 1) % 8;
    indices.push(i, 8 + i, next, next, 8 + i, 8 + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const wing = new THREE.Mesh(geometry, teal);
  wing.position.set(0, 1.03, 0.08);
  wing.castShadow = true;
  wing.receiveShadow = true;
  group.add(wing);

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, tipChord + 0.08), coral);
    tip.position.set(side * (half - 0.3), 1.03, 0.04);
    tip.castShadow = true;
    group.add(tip);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.115, 6, 5), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xf04b3e : 0x55e08c }));
    nav.position.set(side * (half + 0.16), 1.03, 0.18);
    group.add(nav);
    const strut = cylinderBetween(
      new THREE.Vector3(side * 1.2, -0.5, 0.3),
      new THREE.Vector3(side * 3.2, 0.99, 0.15),
      0.06,
      ink,
      5,
    );
    group.add(strut);
    const rearStrut = cylinderBetween(
      new THREE.Vector3(side * 1.15, -0.46, 0.45),
      new THREE.Vector3(side * 2.7, 0.98, 0.62),
      0.045,
      ink,
      5,
    );
    group.add(rearStrut);
    const aileronGeo = new THREE.BoxGeometry(2.1, 0.1, 0.52);
    const hinge = new THREE.Group();
    hinge.position.set(side * (half - 1.65), 1.0, 0.9);
    const aileron = new THREE.Mesh(aileronGeo, cream);
    aileron.position.z = 0.22;
    aileron.castShadow = true;
    hinge.add(aileron);
    hinge.userData.side = side;
    group.add(hinge);
    group.userData[side < 0 ? 'leftAileron' : 'rightAileron'] = hinge;
  }
  return group;
}

function buildTail(teal, cream, coral, ink) {
  const group = new THREE.Group();
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.13, 0.9), teal);
  stab.position.set(0, 0.18, 2.95);
  stab.castShadow = true;
  group.add(stab);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.94), coral);
    tip.position.set(side * 1.55, 0.18, 2.95);
    group.add(tip);
    const elevator = new THREE.Group();
    elevator.position.set(side * 0.9, 0.18, 3.38);
    const surface = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.44), cream);
    surface.position.z = 0.17;
    surface.castShadow = true;
    elevator.add(surface);
    group.add(elevator);
    group.userData[side < 0 ? 'leftElevator' : 'rightElevator'] = elevator;
  }
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.9, 0);
  finShape.lineTo(1.22, 1.36);
  finShape.lineTo(0.35, 1.36);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.12, bevelEnabled: false });
  finGeo.rotateY(Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, cream);
  fin.position.set(0.06, 0.2, 2.7);
  fin.castShadow = true;
  group.add(fin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.72), coral);
  stripe.position.set(0.0, 1.08, 3.2);
  group.add(stripe);
  const rudderHinge = new THREE.Group();
  rudderHinge.position.set(0, 0.25, 3.38);
  const rudderShape = new THREE.Shape();
  rudderShape.moveTo(0, 0);
  rudderShape.lineTo(0.62, 0);
  rudderShape.lineTo(0.94, 1.2);
  rudderShape.lineTo(0.36, 1.2);
  rudderShape.closePath();
  const rudderGeo = new THREE.ExtrudeGeometry(rudderShape, { depth: 0.1, bevelEnabled: false });
  rudderGeo.rotateY(Math.PI / 2);
  const rudder = new THREE.Mesh(rudderGeo, coral);
  rudder.position.set(0.04, 0.98, 0.05);
  rudder.castShadow = true;
  rudderHinge.add(rudder);
  group.add(rudderHinge);
  group.userData.rudder = rudderHinge;
  void ink;
  return group;
}

function buildGear(ink, cream) {
  const gear = new THREE.Group();
  const tireMat = new THREE.MeshLambertMaterial({ color: 0x202421, flatShading: true });
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.25, 5), ink);
    strut.position.y = -0.65;
    leg.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 10), tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.11 * side, -1.28, 0);
    wheel.castShadow = true;
    leg.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 6), cream);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    leg.add(hub);
    const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.55, 0.7), cream);
    fairing.position.set(0, -0.8, 0.05);
    leg.add(fairing);
    leg.position.set(side * 1.28, 0.38, 0.45);
    gear.add(leg);
  }
  const tailStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 4), ink);
  tailStrut.position.set(0, -0.17, 2.9);
  gear.add(tailStrut);
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.16, 8), tireMat);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.56, 2.9);
  gear.add(tailWheel);
  return gear;
}

function makePropDiscTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(40,42,38,0.05)');
  gradient.addColorStop(0.5, 'rgba(55,55,48,0.14)');
  gradient.addColorStop(0.92, 'rgba(36,38,34,0.45)');
  gradient.addColorStop(1, 'rgba(255,212,142,0.5)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeRegistrationTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 80);
  ctx.fillStyle = '#1c2526';
  ctx.font = '700 47px ui-monospace, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('KC-02', 128, 42);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildPropeller(ink, cream) {
  const hub = new THREE.Group();
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.75, 10), cream);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -0.25;
  spinner.castShadow = true;
  hub.add(spinner);
  const bladeGroup = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.45, 0.055), ink);
    blade.position.y = 0.78;
    blade.castShadow = true;
    const arm = new THREE.Group();
    arm.rotation.z = (i / 3) * Math.PI * 2;
    arm.add(blade);
    bladeGroup.add(arm);
  }
  hub.add(bladeGroup);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.72, 24),
    new THREE.MeshBasicMaterial({
      map: makePropDiscTexture(),
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  disc.position.z = -0.02;
  hub.add(disc);
  hub.position.set(0, 0.05, -3.98);
  return { group: hub, bladeGroup, disc };
}

export class AircraftVisual {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'Kestrel K-2';
    const cream = material('cream', PALETTE.cream);
    const teal = material('teal', PALETTE.teal);
    const coral = material('coral', PALETTE.coral);
    const ink = material('ink', PALETTE.ink);
    const glass = new THREE.MeshPhongMaterial({
      color: 0x214e54,
      transparent: true,
      opacity: 0.58,
      shininess: 80,
      specular: 0x9fdfe0,
      side: THREE.DoubleSide,
    });
    this.glass = glass;

    const fuselage = buildFuselage(cream, ink);
    this.group.add(fuselage.mesh, fuselage.cowl, fuselage.ring);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(1.0, 1.25, 2.0);
    canopy.position.set(0, 0.75, -0.65);
    canopy.castShadow = true;
    this.canopy = canopy;
    this.group.add(canopy);
    const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.94), cream);
    windscreen.position.set(0, 1.02, -1.32);
    windscreen.rotation.x = -0.3;
    this.windscreen = windscreen;
    this.group.add(windscreen);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.81, 0.38, 10, 1, true), coral);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(0, 0.08, 1.55);
    this.group.add(stripe);

    const registrationMaterial = new THREE.MeshBasicMaterial({ map: makeRegistrationTexture(), transparent: true, depthWrite: false });
    for (const side of [-1, 1]) {
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.47), registrationMaterial);
      decal.rotation.y = side * Math.PI / 2;
      decal.position.set(side * 0.67, 0.08, 1.7);
      this.group.add(decal);
    }

    this.wing = buildWing(teal, cream, coral, ink);
    this.group.add(this.wing);
    this.tail = buildTail(teal, cream, coral, ink);
    this.group.add(this.tail);
    this.gear = buildGear(ink, cream);
    this.group.add(this.gear);
    this.prop = buildPropeller(ink, cream);
    this.group.add(this.prop.group);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.8, 4), ink);
    antenna.position.set(0.15, 0.95, 1.3);
    this.group.add(antenna);

    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 5, 4), new THREE.MeshBasicMaterial({ color: 0xe2603f }));
    this.beacon.position.set(0.05, 1.46, 2.8);
    this.group.add(this.beacon);

    this.flaps = [];
    for (const side of [-1, 1]) {
      const flap = new THREE.Group();
      flap.position.set(side * 2.4, 0.98, 0.95);
      const surface = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.4), cream);
      surface.position.z = 0.18;
      surface.castShadow = true;
      flap.add(surface);
      this.group.add(flap);
      this.flaps.push(flap);
    }

    this.time = 0;
    this.gearDown = 1;
    this.gearVisible = true;
    this.group.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
  }

  update(dt, state, controls) {
    this.time += dt;
    const rollInput = controls.roll ?? 0;
    const pitchInput = controls.pitch ?? 0;
    const yawInput = controls.yaw ?? 0;
    const leftAil = this.wing.userData.leftAileron;
    const rightAil = this.wing.userData.rightAileron;
    leftAil.rotation.x = THREE.MathUtils.damp(leftAil.rotation.x, rollInput * 0.38, 9, dt);
    rightAil.rotation.x = THREE.MathUtils.damp(rightAil.rotation.x, -rollInput * 0.38, 9, dt);
    this.tail.userData.leftElevator.rotation.x = THREE.MathUtils.damp(this.tail.userData.leftElevator.rotation.x, -pitchInput * 0.38, 9, dt);
    this.tail.userData.rightElevator.rotation.x = this.tail.userData.leftElevator.rotation.x;
    this.tail.userData.rudder.rotation.y = THREE.MathUtils.damp(this.tail.userData.rudder.rotation.y, yawInput * 0.4, 9, dt);
    const flapAngle = (state.flaps ?? 0) * 0.36;
    for (const flap of this.flaps) flap.rotation.x = THREE.MathUtils.damp(flap.rotation.x, flapAngle, 6, dt);

    this.gearDown = THREE.MathUtils.damp(this.gearDown, state.gearDown ? 1 : 0, 5, dt);
    this.gear.visible = this.gearDown > 0.05;
    this.gear.scale.y = Math.max(0.04, this.gearDown);
    this.gear.position.y = (1 - this.gearDown) * 0.75;

    this.prop.group.rotation.z += dt * Math.max(0, state.rpm ?? 0) * 0.38;
    this.prop.disc.material.opacity = clamp(((state.rpm ?? 0) - 380) / 900, 0.08, 0.62);
    this.prop.bladeGroup.children.forEach((arm) => {
      arm.children[0].material = arm.children[0].material;
    });
    this.beacon.visible = Math.floor(this.time * 1.3) % 2 === 0 || (state.rpm ?? 0) < 100;
    this.group.visible = !state.hideAircraft;
    this.canopy.visible = !state.cockpitView;
    this.tail.visible = !state.cockpitView;
  }
}

export function createAircraftVisual() {
  return new AircraftVisual();
}
