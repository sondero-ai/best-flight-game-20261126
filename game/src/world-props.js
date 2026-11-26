// Hand-built landmarks and scatter for the Cinder Reach: marked runways, airfield clutter,
// lighthouses, canyon rings and arches, the cargo ship, palms and rocks.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { AIRPORTS, heightAt, slopeAt } from './terrain.js';
import { Rng } from './rng.js';
import { clamp, smoothstep } from './math-utils.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,248,222,0.95)');
  gradient.addColorStop(0.25, 'rgba(255,226,160,0.58)');
  gradient.addColorStop(1, 'rgba(255,196,110,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeNumberTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 144);
  ctx.font = '900 112px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(36,42,38,0.9)';
  ctx.lineWidth = 12;
  ctx.strokeText(label, 128, 78);
  ctx.fillStyle = '#f7f1df';
  ctx.fillText(label, 128, 78);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function makeStreakTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, 'rgba(255,255,244,0.15)');
  gradient.addColorStop(0.35, 'rgba(255,255,244,0.9)');
  gradient.addColorStop(1, 'rgba(255,255,244,0.2)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function flatBox(width, height, depth, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addMark(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

function buildRunway(airport, group, glowTexture, lightMeshes) {
  const half = airport.length / 2;
  const width = airport.width;
  const y = airport.elevation;
  const asphalt = new THREE.MeshLambertMaterial({ color: 0x7a7d72, emissive: 0x25281f, emissiveIntensity: 0.4 });
  const paint = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const shoulder = new THREE.MeshLambertMaterial({ color: 0x8a7d68 });
  const runwayBase = new THREE.Mesh(new THREE.BoxGeometry(airport.length + 90, 1.1, width + 22), shoulder);
  runwayBase.position.set(airport.centerX, y - 0.55, airport.centerZ);
  runwayBase.receiveShadow = true;
  runwayBase.castShadow = true;
  group.add(runwayBase);

  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(airport.length, width), asphalt);
  tarmac.rotation.x = -Math.PI / 2;
  tarmac.position.set(airport.centerX, y + 0.09, airport.centerZ);
  tarmac.receiveShadow = true;
  group.add(tarmac);

  const lineGeometry = new THREE.BoxGeometry(airport.length - 30, 0.1, 1.45);
  const left = addMark(new THREE.Mesh(lineGeometry, paint), airport.centerX, y + 0.16, airport.centerZ - width / 2 + 1.7);
  const right = addMark(new THREE.Mesh(lineGeometry, paint), airport.centerX, y + 0.16, airport.centerZ + width / 2 - 1.7);
  group.add(left, right);

  const dashGeometry = new THREE.BoxGeometry(17, 0.12, 1.3);
  for (let x = airport.centerX - half + 24; x < airport.centerX + half - 20; x += 36) {
    const dash = new THREE.Mesh(dashGeometry, paint);
    dash.position.set(x, y + 0.17, airport.centerZ);
    group.add(dash);
  }

  const barGeometry = new THREE.BoxGeometry(16, 0.12, 2.1);
  for (const [heading, threshold] of Object.entries(airport.thresholds)) {
    const dir = Number(heading) === 90 ? 1 : -1;
    const baseX = threshold.x;
    for (let i = 0; i < 8; i += 1) {
      const zOff = (i - 3.5) * 3.3;
      const bar = new THREE.Mesh(barGeometry, paint);
      bar.position.set(baseX + dir * 19, y + 0.17, airport.centerZ + zOff);
      group.add(bar);
    }
    for (let i = 0; i < 4; i += 1) {
      const aim = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 2.3), paint);
      aim.position.set(baseX + dir * (120 + i * 4.2), y + 0.17, airport.centerZ - 8 + i * 5.3);
      group.add(aim);
    }
    const number = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 24),
      new THREE.MeshBasicMaterial({ map: makeNumberTexture(threshold.label), transparent: true, depthWrite: false }),
    );
    number.rotation.x = -Math.PI / 2;
    number.rotation.z = Number(heading) === 90 ? -Math.PI / 2 : Math.PI / 2;
    number.position.set(baseX + dir * 55, y + 0.3, airport.centerZ);
    group.add(number);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 7),
      new THREE.MeshBasicMaterial({ map: makeNumberTexture(threshold.label), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    sign.position.set(baseX + dir * 65, y + 4.2, airport.centerZ + width / 2 + 7);
    sign.rotation.y = Number(heading) === 90 ? -Math.PI / 2 : Math.PI / 2;
    group.add(sign);
  }

  // Edge lights and their additive halos.
  const lightGeometry = new THREE.SphereGeometry(0.42, 5, 4);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8b0 });
  const step = 48;
  for (let x = airport.centerX - half; x <= airport.centerX + half; x += step) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeometry, lightMaterial);
      lamp.position.set(x, y + 0.7, airport.centerZ + side * (width / 2 + 1.2));
      group.add(lamp);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffe4ac, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.88 }));
      glow.position.copy(lamp.position);
      glow.scale.setScalar(9.5);
      glow.userData.screenPx = 11;
      glow.userData.baseOpacity = 0.88;
      group.add(glow);
      lightMeshes.push(glow);
    }
  }
  // Raised centreline lights read as the runway's dotted spine from a shallow final approach.
  for (let x = airport.centerX - half + 32; x <= airport.centerX + half - 30; x += 54) {
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xfff4d2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.72 }));
    light.position.set(x, y + 0.65, airport.centerZ);
    light.scale.setScalar(6.2);
    light.userData.screenPx = 7;
    light.userData.baseOpacity = 0.72;
    group.add(light);
    lightMeshes.push(light);
  }
  // Green threshold bars at both ends, on short posts.
  for (const [heading, threshold] of Object.entries(airport.thresholds)) {
    const dir = Number(heading) === 90 ? 1 : -1;
    for (let i = 0; i < 6; i += 1) {
      const z = airport.centerZ + (i - 2.5) * (width / 5.4);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 4), lightMaterial);
      post.position.set(threshold.x + dir * 1.2, y + 0.8, z);
      group.add(post);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0x62f0a4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
      glow.position.set(threshold.x + dir * 1.2, y + 1.7, z);
      glow.scale.setScalar(7);
      glow.userData.screenPx = 9;
      glow.userData.baseOpacity = 0.75;
      group.add(glow);
      lightMeshes.push(glow);
    }
  }

  // PAPI: two white and two red cells sit to the left of each threshold.
  for (let i = 0; i < 4; i += 1) {
    const color = i < 2 ? 0xfff2cf : 0xe2603f;
    const cell = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 1.5), new THREE.MeshBasicMaterial({ color }));
    cell.position.set(airport.centerX - half + 32 + i * 2.3, y + 0.7, airport.centerZ + width / 2 + 8);
    group.add(cell);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
    glow.position.copy(cell.position).y += 0.3;
    glow.scale.setScalar(10);
    glow.userData.screenPx = 11;
    glow.userData.baseOpacity = 0.9;
    group.add(glow);
    lightMeshes.push(glow);
  }

  // Sequenced approach lights leading to the active threshold. Over the Cinder lagoon these read
  // as a warm dotted avenue from the final approach.
  const approach = new THREE.Group();
  const approachDir = airport.heading === 270 ? 1 : -1;
  const approachThreshold = airport.heading === 270 ? airport.thresholds[27] : airport.thresholds[9];
  for (let i = 0; i < 9; i += 1) {
    const x = approachThreshold.x + approachDir * (62 + i * 72);
    const base = Math.max(0.4, heightAt(x, airport.centerZ));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 6, 4), lightMaterial);
    pole.position.set(x, base + 3, airport.centerZ);
    approach.add(pole);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: i % 3 === 0 ? 0xfff6d8 : 0xffd391, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95 }));
    glow.position.set(x, base + 6.4, airport.centerZ);
    glow.scale.setScalar(16);
    glow.userData.screenPx = 14;
    glow.userData.baseOpacity = 0.95;
    approach.add(glow);
    lightMeshes.push(glow);
  }
  group.add(approach);
}

function buildAirfieldBuildings(airport, group) {
  const y = airport.elevation;
  const cream = new THREE.MeshLambertMaterial({ color: PALETTE.cream });
  const teal = new THREE.MeshLambertMaterial({ color: PALETTE.teal });
  const coral = new THREE.MeshLambertMaterial({ color: PALETTE.coral });
  const ink = new THREE.MeshLambertMaterial({ color: PALETTE.ink });
  const isCinder = airport.id === 'cinder';
  const dir = isCinder ? 1 : -1;
  const baseX = isCinder ? -80 : -520;
  const baseZ = airport.centerZ + (isCinder ? 78 : 84);

  const apron = new THREE.Mesh(new THREE.PlaneGeometry(250, 72), new THREE.MeshLambertMaterial({ color: 0x77776a }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(baseX, y + 0.13, baseZ - 20);
  apron.receiveShadow = true;
  group.add(apron);

  const hangar = new THREE.Group();
  const body = flatBox(58, 17, 34, cream);
  body.position.y = 8.5;
  hangar.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 58, 8, 1, false, 0, Math.PI), teal);
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 17;
  roof.scale.z = 0.9;
  roof.castShadow = true;
  hangar.add(roof);
  const door = flatBox(1, 12, 25, ink);
  door.position.set(-29.3, 6.2, 0);
  hangar.add(door);
  hangar.position.set(baseX + dir * 20, y, baseZ + 10);
  group.add(hangar);

  const tower = new THREE.Group();
  const base = flatBox(15, 7, 15, cream);
  base.position.y = 3.5;
  tower.add(base);
  const shaft = flatBox(8, 19, 8, cream);
  shaft.position.y = 16;
  tower.add(shaft);
  const cabin = flatBox(12, 6, 12, teal);
  cabin.position.y = 28;
  tower.add(cabin);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(12.5, 2.8, 10.6), new THREE.MeshBasicMaterial({ color: 0x9fd8d0 }));
  glass.position.y = 28.3;
  tower.add(glass);
  const roofTower = new THREE.Mesh(new THREE.ConeGeometry(8, 3, 4), coral);
  roofTower.rotation.y = Math.PI / 4;
  roofTower.position.y = 32.5;
  tower.add(roofTower);
  tower.position.set(baseX + dir * 105, y, baseZ - 15);
  group.add(tower);

  const tankMaterial = new THREE.MeshLambertMaterial({ color: 0xd9c2a0 });
  for (let i = 0; i < 2; i += 1) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 12, 10), tankMaterial);
    tank.position.set(baseX - dir * 60, y + 6, baseZ + 30 + i * 18);
    tank.castShadow = true;
    tank.receiveShadow = true;
    group.add(tank);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), tankMaterial);
    cap.position.copy(tank.position).y += 6;
    group.add(cap);
  }

  const crateMaterial = new THREE.MeshLambertMaterial({ color: 0xb6864f });
  for (let i = 0; i < 7; i += 1) {
    const crate = flatBox(3.6 + (i % 2), 2.8, 3.1, crateMaterial);
    crate.position.set(baseX + dir * (60 + (i % 4) * 5), y + 1.4 + (i > 3 ? 2.8 : 0), baseZ + 22 - (i % 3) * 4);
    crate.rotation.y = i * 0.36;
    group.add(crate);
  }

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 11, 5), ink);
  pole.position.set(airport.thresholds[isCinder ? 9 : 27].x + (isCinder ? 30 : -30), y + 5.5, airport.centerZ + 26);
  group.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.8, 6.5, 8, 1, true), coral);
  sock.rotation.z = -Math.PI / 2;
  sock.rotation.y = isCinder ? 0.4 : 2.5;
  sock.position.set(pole.position.x + 3.2, y + 10, pole.position.z);
  group.add(sock);

  if (!isCinder) {
    const mast = new THREE.Group();
    const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 40, 5), new THREE.MeshLambertMaterial({ color: 0xc7b9a1 }));
    mastPole.position.y = 20;
    mast.add(mastPole);
    for (let i = 0; i < 4; i += 1) {
      const spar = new THREE.Mesh(new THREE.BoxGeometry(10 - i * 1.5, 0.35, 0.35), ink);
      spar.position.y = 12 + i * 7;
      mast.add(spar);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 5), new THREE.MeshBasicMaterial({ color: 0xe2603f }));
    beacon.position.y = 40.5;
    mast.add(beacon);
    mast.position.set(airport.centerX - 180, y, airport.centerZ - 36);
    group.add(mast);
  }
}

function buildLighthouse(group, glowTexture, x, z, opts = {}) {
  const baseY = heightAt(x, z);
  const height = opts.height ?? 30;
  const g = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ color: PALETTE.cream });
  const coral = new THREE.MeshLambertMaterial({ color: PALETTE.coral });
  const ink = new THREE.MeshLambertMaterial({ color: PALETTE.ink });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4.2, height, 10), cream);
  tower.position.y = height / 2;
  tower.castShadow = true;
  tower.receiveShadow = true;
  g.add(tower);
  for (let i = 0; i < 2; i += 1) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - i * 0.45, 3.65 - i * 0.45, 4.2, 10), coral);
    band.position.y = height * (0.42 + i * 0.23);
    band.castShadow = true;
    g.add(band);
  }
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1.2, 10), ink);
  gallery.position.y = height - 1;
  g.add(gallery);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 4.5, 8), new THREE.MeshBasicMaterial({ color: 0xffe3a0 }));
  lantern.position.y = height + 1.8;
  g.add(lantern);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.4, 3, 8), coral);
  roof.position.y = height + 5.5;
  g.add(roof);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xffdf9a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
  glow.scale.setScalar(17);
  glow.position.y = height + 1.8;
  g.add(glow);
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffe4a8,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(18, 140, 12, 1, true), beamMaterial);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(70, height + 2, 0);
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 0;
  beamPivot.add(beam);
  g.add(beamPivot);
  const light = new THREE.PointLight(0xffd797, 220, 260, 2);
  light.position.y = height + 2;
  g.add(light);
  g.position.set(x, baseY, z);
  g.userData.beamPivot = beamPivot;
  g.userData.beamMaterial = beamMaterial;
  group.add(g);
  return g;
}

function buildCargoShip(group) {
  const ship = new THREE.Group();
  const hullMat = new THREE.MeshLambertMaterial({ color: 0x22424c });
  const rustMat = new THREE.MeshLambertMaterial({ color: 0x9a4a39 });
  const deckMat = new THREE.MeshLambertMaterial({ color: 0xc8b59a });
  const hull = flatBox(88, 8, 18, hullMat);
  hull.position.y = 1;
  ship.add(hull);
  const bow = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 18, 4, 1, false), hullMat);
  bow.rotation.x = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 0.55, 1);
  bow.position.set(-48, 0, 0);
  ship.add(bow);
  const deck = flatBox(82, 1.2, 17, deckMat);
  deck.position.y = 5.2;
  ship.add(deck);
  const containerColors = [PALETTE.coral, PALETTE.teal, PALETTE.mustard, PALETTE.cream];
  let index = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const container = flatBox(9.2, 5.4, 6.2, new THREE.MeshLambertMaterial({ color: containerColors[index % 4] }));
      container.position.set(-26 + col * 10.2, 8.8 + row * 5.4, -4.8 + (col % 2) * 1.2);
      container.rotation.y = 0.02 * (index % 3);
      ship.add(container);
      index += 1;
    }
  }
  const bridge = flatBox(13, 16, 15, deckMat);
  bridge.position.set(32, 13, 0);
  ship.add(bridge);
  const bridgeGlass = new THREE.Mesh(new THREE.BoxGeometry(13.4, 3, 12.8), new THREE.MeshBasicMaterial({ color: 0x8ac6c5 }));
  bridgeGlass.position.set(32, 19, 0);
  ship.add(bridgeGlass);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.3, 10, 8), rustMat);
  funnel.position.set(40, 25, 0);
  ship.add(funnel);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 18, 4), new THREE.MeshLambertMaterial({ color: 0x30393b }));
  mast.position.set(22, 24, 0);
  ship.add(mast);
  const stackSmoke = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshLambertMaterial({ color: 0x8d8c83, transparent: true, opacity: 0.45 }));
    puff.position.set(38 + i * 2.4, 30 + i * 3.6, 0);
    puff.scale.setScalar(1 + i * 0.45);
    stackSmoke.add(puff);
  }
  ship.add(stackSmoke);

  const wakeMaterial = new THREE.MeshBasicMaterial({ color: 0xf5efe1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });
  const wakeGeometry = new THREE.BufferGeometry();
  wakeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-40, 0, 0, -190, 0, -22, -190, 0, 22, -40, 0, -40, -150, 0, 0, -40, 0, 40], 3));
  const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
  wake.position.y = 0.5;
  ship.add(wake);
  ship.userData.smoke = stackSmoke;
  ship.position.set(2180, 0.4, 200);
  ship.scale.setScalar(1.15);
  group.add(ship);
  return ship;
}

function makePalmGeometry() {
  const positions = [];
  const centers = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const baseX = Math.cos(angle) * 0.75;
    const baseZ = Math.sin(angle) * 0.75;
    const tipX = Math.cos(angle) * 5.4;
    const tipZ = Math.sin(angle) * 5.4;
    const midX = Math.cos(angle) * 3.1;
    const midZ = Math.sin(angle) * 3.1;
    positions.push(baseX, 0, baseZ, midX, 0.9, midZ, tipX, -0.8, tipZ);
    positions.push(baseX + 0.7, 0, baseZ, tipX, -0.8, tipZ, midX, 0.9, midZ);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildPalms(group) {
  const rng = new Rng(WORLD.seed ^ 0xa1b2c3);
  const places = [];
  for (let i = 0; i < 1700 && places.length < 250; i += 1) {
    const x = rng.range(-3400, 3400);
    const z = rng.range(-3300, 2600);
    const h = heightAt(x, z);
    if (h < 1.4 || h > 46) continue;
    if (slopeAt(x, z) > 0.35) continue;
    if (Math.abs(z) < 65 && Math.abs(x) < 590) continue;
    if (Math.abs(z + 2700) < 60 && x > -950 && x < 40) continue;
    places.push({ x, z, h, scale: rng.range(0.75, 1.35), rot: rng.range(0, Math.PI * 2) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.42, 7, 5);
  trunkGeo.translate(0, 3.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8c6b48, flatShading: true });
  const frondGeo = makePalmGeometry();
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f724b, flatShading: true, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, places.length);
  const crowns = new THREE.InstancedMesh(frondGeo, frondMat, places.length);
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  crowns.castShadow = true;
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  places.forEach((p, index) => {
    quat.setFromAxisAngle(Y_AXIS, p.rot);
    scale.setScalar(p.scale);
    matrix.compose(new THREE.Vector3(p.x, p.h, p.z), quat, scale);
    trunks.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(p.x, p.h + 6.9 * p.scale, p.z), quat, scale);
    crowns.setMatrixAt(index, matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.name = 'palm trunks';
  crowns.name = 'palm crowns';
  group.add(trunks, crowns);
}

function buildScatter(group) {
  const rng = new Rng(WORLD.seed ^ 0x77cafe);
  const rocks = [];
  const bushes = [];
  for (let i = 0; i < 2400 && rocks.length < 190; i += 1) {
    const x = rng.range(-4300, 4300);
    const z = rng.range(-3500, 3300);
    const h = heightAt(x, z);
    if (h < 3 || h > 260) continue;
    if (Math.abs(z) < 60 && Math.abs(x) < 560) continue;
    if (slopeAt(x, z) > 0.7) continue;
    rocks.push({ x, z, h, s: rng.range(1.3, 7.5), rot: rng.range(0, 6.28) });
  }
  for (let i = 0; i < 1600 && bushes.length < 190; i += 1) {
    const x = rng.range(-3000, 3200);
    const z = rng.range(-3100, 2400);
    const h = heightAt(x, z);
    if (h < 2 || h > 90) continue;
    if (slopeAt(x, z) > 0.5) continue;
    if (Math.abs(z) < 70 && Math.abs(x) < 580) continue;
    bushes.push({ x, z, h, s: rng.range(1.1, 3.6), rot: rng.range(0, 6.28) });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock, flatShading: true });
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  const bushMat = new THREE.MeshLambertMaterial({ color: 0x537a4d, flatShading: true });
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  bushMesh.castShadow = true;
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  rocks.forEach((r, i) => {
    quat.setFromAxisAngle(Y_AXIS, r.rot);
    matrix.compose(new THREE.Vector3(r.x, r.h + r.s * 0.3, r.z), quat, new THREE.Vector3(r.s, r.s * rng.range(0.45, 0.9), r.s * rng.range(0.7, 1.2)));
    rockMesh.setMatrixAt(i, matrix);
  });
  bushes.forEach((b, i) => {
    quat.setFromAxisAngle(Y_AXIS, b.rot);
    matrix.compose(new THREE.Vector3(b.x, b.h + b.s * 0.4, b.z), quat, new THREE.Vector3(b.s, b.s * 0.65, b.s));
    bushMesh.setMatrixAt(i, matrix);
  });
  rockMesh.instanceMatrix.needsUpdate = true;
  bushMesh.instanceMatrix.needsUpdate = true;
  rockMesh.name = 'rock scatter';
  bushMesh.name = 'shrub scatter';
  group.add(rockMesh, bushMesh);
}

function buildArch(group, x, z, radius) {
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x9b836b, flatShading: true });
  const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 13, 5, 20, Math.PI), rockMat);
  arch.rotation.y = Math.PI / 2;
  arch.position.set(x, 3, z);
  arch.castShadow = true;
  arch.receiveShadow = true;
  group.add(arch);
  for (const side of [-1, 1]) {
    const buttress = new THREE.Mesh(new THREE.DodecahedronGeometry(30, 0), new THREE.MeshLambertMaterial({ color: 0x907b65, flatShading: true }));
    buttress.position.set(x, 12, z + side * radius);
    buttress.scale.set(1.2, 1.4, 1.0);
    buttress.castShadow = true;
    group.add(buttress);
  }
}

function buildWaterfall(group, x, z, height) {
  const texture = makeStreakTexture();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 2);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(14, height), material);
  fall.position.set(x, height / 2 + 2, z);
  fall.rotation.y = Math.PI / 2;
  fall.userData.texture = texture;
  group.add(fall);
  const mist = new THREE.Mesh(
    new THREE.ConeGeometry(17, 15, 7, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8f3e6, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  mist.position.set(x, 6, z + 2);
  group.add(mist);
  return fall;
}

function buildBuoys(group, glowTexture) {
  const positions = [
    [-1530, 520, 0xe2603f],
    [-1460, 880, 0x3f8a5c],
    [1880, -2050, 0xe2603f],
    [1890, -2220, 0x3f8a5c],
    [2680, 250, 0xe2603f],
    [2710, 380, 0x3f8a5c],
  ];
  for (const [x, z, color] of positions) {
    const buoy = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 3.4, 7), new THREE.MeshLambertMaterial({ color: 0xd9d4c3 }));
    body.position.y = 1.7;
    buoy.add(body);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), new THREE.MeshLambertMaterial({ color }));
    top.position.y = 4.6;
    buoy.add(top);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
    glow.position.y = 6.1;
    glow.scale.setScalar(4.5);
    buoy.add(glow);
    buoy.position.set(x, 0.2, z);
    group.add(buoy);
  }
}

function buildWreck(group) {
  const hull = new THREE.Mesh(new THREE.BoxGeometry(52, 7, 14), new THREE.MeshLambertMaterial({ color: 0x58594f }));
  hull.position.set(1540, 2, -1880);
  hull.rotation.set(0.16, 0.5, 0.35);
  hull.castShadow = true;
  group.add(hull);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(3, 18, 3), new THREE.MeshLambertMaterial({ color: 0x746b55 }));
  rib.position.set(1550, 8, -1878);
  rib.rotation.z = 0.5;
  group.add(rib);
}

export class WorldProps {
  constructor(scene, ringData) {
    this.group = new THREE.Group();
    this.group.name = 'Cinder Reach landmarks';
    scene.add(this.group);
    this.glowTexture = makeGlowTexture();
    this.lights = [];
    this.rings = [];
    this.beamGroups = [];
    this.waterfalls = [];
    this.nightFactor = 0;
    this.time = 0;

    for (const airport of Object.values(AIRPORTS)) {
      const airfield = new THREE.Group();
      buildRunway(airport, airfield, this.glowTexture, this.lights);
      buildAirfieldBuildings(airport, airfield);
      this.group.add(airfield);
    }

    this.lighthouse = buildLighthouse(this.group, this.glowTexture, -450, -2520, { height: 48 });
    this.beamGroups.push(this.lighthouse);
    this.reefLighthouse = buildLighthouse(this.group, this.glowTexture, 760, -3060, { height: 45 });
    this.beamGroups.push(this.reefLighthouse);

    this.ship = buildCargoShip(this.group);
    buildPalms(this.group);
    buildScatter(this.group);
    buildBuoys(this.group, this.glowTexture);
    buildWreck(this.group);
    buildArch(this.group, 1480, 74, 118);
    buildArch(this.group, 2510, 88, 108);
    this.waterfalls.push(buildWaterfall(this.group, 1450, -135, 158));
    this.waterfalls.push(buildWaterfall(this.group, 1760, 250, 150));
    this.ringData = ringData;
    this.buildRings(ringData);
    this.beaconGroup = new THREE.Group();
    this.beaconGroup.name = 'mission beacons';
    this.group.add(this.beaconGroup);
  }

  setBeacons(points = [], color = 0xe2603f) {
    while (this.beaconGroup.children.length) {
      const child = this.beaconGroup.children.pop();
      child.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
    }
    for (const point of points) {
      const baseY = point.y ?? heightAt(point.x, point.z);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 7.5, 380, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.17,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.set(point.x, baseY + 190, point.z);
      this.beaconGroup.add(beam);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(20, 1.0, 4, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd7a0, transparent: true, opacity: 0.9 }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(point.x, baseY + 18, point.z);
      this.beaconGroup.add(ring);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0xffc17d, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
      glow.position.set(point.x, baseY + 20, point.z);
      glow.scale.setScalar(30);
      this.beaconGroup.add(glow);
    }
  }

  setPhotoZone(point, radius = 260) {
    const baseY = heightAt(point.x, point.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 2.4, 5, 48),
      new THREE.MeshBasicMaterial({ color: 0xffd9a1, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(point.x, baseY + 12, point.z);
    this.beaconGroup.add(ring);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 300, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb85e, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    column.position.set(point.x, baseY + 160, point.z);
    this.beaconGroup.add(column);
  }

  buildRings(ringData) {
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.coral,
      emissive: 0x8f2f1c,
      emissiveIntensity: 0.7,
      roughness: 0.55,
      metalness: 0.05,
      flatShading: true,
    });
    const trimMaterial = new THREE.MeshBasicMaterial({ color: 0xffdca2 });
    for (let i = 0; i < ringData.length; i += 1) {
      const data = ringData[i];
      const group = new THREE.Group();
      const torus = new THREE.Mesh(new THREE.TorusGeometry(21, 2.1, 6, 28), ringMaterial);
      torus.castShadow = true;
      group.add(torus);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(21, 0.45, 4, 28), trimMaterial);
      trim.position.z = 1.5;
      group.add(trim);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(7, 1.4, 1.4), trimMaterial);
      marker.position.y = 23.5;
      group.add(marker);
      for (let k = 0; k < 4; k += 1) {
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture, color: 0xff9d72, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
        const angle = (k / 4) * Math.PI * 2;
        lamp.position.set(Math.cos(angle) * 21, Math.sin(angle) * 21, 2.2);
        lamp.scale.setScalar(9);
        group.add(lamp);
      }
      const direction = new THREE.Vector3(data.dirX ?? 1, 0, data.dirZ ?? 0).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, direction);
      group.quaternion.copy(quat);
      group.position.set(data.x, data.y, data.z);
      group.userData.index = i;
      group.userData.baseY = data.y;
      this.group.add(group);
      this.rings.push({ group, data, index: i, collected: false });
    }
  }

  setCollected(index, collected) {
    const ring = this.rings[index];
    if (!ring) return;
    ring.collected = collected;
    ring.group.visible = !collected;
  }

  resetRings() {
    for (const ring of this.rings) {
      ring.collected = false;
      ring.group.visible = true;
    }
  }

  setNightFactor(value) {
    this.nightFactor = clamp(value, 0, 1);
    for (const glow of this.lights) {
      const baseOpacity = glow.userData.baseOpacity ?? 0.8;
      glow.material.opacity = clamp(baseOpacity * (0.82 + this.nightFactor * 0.3), 0.1, 1);
    }
    for (const lighthouse of this.beamGroups) {
      lighthouse.userData.beamMaterial.opacity = 0.03 + this.nightFactor * 0.16;
    }
  }

  updateLightSizes(cameraPosition) {
    const focal = 760;
    for (const glow of this.lights) {
      const distance = glow.position.distanceTo(cameraPosition);
      const screenPx = glow.userData.screenPx ?? 9;
      const scale = Math.max(0.15, (screenPx * distance) / focal) * (0.94 + this.nightFactor * 0.12);
      glow.scale.setScalar(scale);
    }
  }

  // Headlight style visibility of the lighthouse beams from far away.
  update(dt, planePosition, cameraPosition = planePosition) {
    this.time += dt;
    this.updateLightSizes(cameraPosition);
    for (const ring of this.rings) {
      if (!ring.group.visible) continue;
      ring.group.position.y = ring.group.userData.baseY + Math.sin(this.time * 1.2 + ring.index) * 1.3;
      ring.group.rotateZ(dt * 0.08 * (ring.index % 2 === 0 ? 1 : -1));
    }
    for (const lighthouse of this.beamGroups) {
      lighthouse.userData.beamPivot.rotation.y = this.time * 0.55;
    }
    if (this.ship) {
      this.ship.position.x = 2180 + Math.sin(this.time * 0.035) * 110;
      this.ship.position.z = 200 + Math.cos(this.time * 0.035) * 9;
      this.ship.rotation.y = Math.sin(this.time * 0.035) * 0.03;
      this.ship.position.y = 0.4 + Math.sin(this.time * 0.8) * 0.18;
      this.ship.userData.smoke.children.forEach((puff, i) => {
        puff.position.y = 30 + i * 3.6 + Math.sin(this.time * 0.4 + i) * 1.1;
        puff.position.x = 38 + i * 2.4 + Math.sin(this.time * 0.3 + i) * 1.8;
      });
    }
    for (const fall of this.waterfalls) {
      fall.userData.texture.offset.y = -this.time * 0.5;
    }
  }

  getNearestRingDistance(position) {
    let best = Infinity;
    for (const ring of this.rings) {
      if (ring.collected) continue;
      const d = position.distanceTo(ring.group.position);
      if (d < best) best = d;
    }
    return best;
  }
}
