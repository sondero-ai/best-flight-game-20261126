// Deterministic screenshot staging. Each scene launches the real mission, injects a physically
// consistent flight state, steps the fixed simulation to settle the camera, then freezes. HUD
// readouts are not written: they are drawn from the resulting state.

import * as THREE from '../vendor/three.module.min.js';
import { missionById } from './mission-catalog.js';
import { headingFromDirection } from './math-utils.js';
import { METERS_PER_NM } from './config.js';

function launch(ctx, missionId, preset, nightFactor, rain) {
  const { gameState, missionManager, sky, worldProps, effects, screens, hud, cameraRig } = ctx;
  missionManager.start(missionById(missionId));
  sky.setPreset(preset);
  worldProps.setNightFactor(nightFactor);
  effects.setRain(rain);
  gameState.mode = 'flight';
  gameState.results = null;
  gameState.showMap = false;
  gameState.radio = [];
  gameState.cameraMode = 'chase';
  screens.hideAll();
  screens.hideCompactResult();
  hud.setVisible(true);
  hud.setCockpit(false);
  hud.setMap(false);
  cameraRig.setMode('chase');
  cameraRig.configureCinematic(null);
  cameraRig.initialised = false;
  return missionManager.active;
}

function simulate(ctx, frames, options = {}) {
  const dt = 1 / 60;
  const environment = { wind: options.wind ?? null, turbulence: options.turbulence ?? 0 };
  for (let i = 0; i < frames; i += 1) {
    ctx.flight.update(dt, environment);
    ctx.cameraRig.update(dt, ctx.flight.state, { turbulence: environment.turbulence });
  }
}

function setTarget(active, vector, label) {
  active.target = vector ? new THREE.Vector3(vector.x, vector.y, vector.z) : null;
  active.targetLabel = label;
}

function refreshTargetMetrics(ctx, active) {
  const state = ctx.flight.state;
  if (!active.target) {
    active.distanceNm = 0;
    active.bearing = state.heading;
    return;
  }
  const dx = active.target.x - state.position.x;
  const dz = active.target.z - state.position.z;
  active.distanceNm = Math.hypot(dx, dz) / METERS_PER_NM;
  active.bearing = headingFromDirection(dx, dz);
}

function radio(ctx, text, source = 'CINDER TOWER') {
  ctx.gameState.radio = [
    { id: 1, source, text, age: 0.6, ttl: 10 },
  ];
}

function harmonise(ctx) {
  const { flight, cameraRig, aircraft, sky, ocean, worldProps, effects, hud, gameState, screens } = ctx;
  const state = flight.state;
  aircraft.group.position.copy(state.position);
  aircraft.group.quaternion.copy(state.quaternion);
  aircraft.update(1 / 60, { ...state, cockpitView: cameraRig.mode === 'cockpit' }, flight.controls);
  sky.focus(state.position);
  ocean.setSun(sky.sunDirection, sky.sun.color);
  ocean.setTime(34);
  worldProps.update(1 / 60, state.position, ctx.camera.position);
  effects.update(1 / 60, state, {});
  hud.update(0.016, { state, active: gameState.mission, camera: ctx.camera, gameState });
  screens.hideCompactResult();
}

function stageCover(ctx) {
  const active = launch(ctx, 'first-light', 'golden', 0.18, 0);
  ctx.worldProps.setBeacons([]);
  ctx.cameraRig.configureCinematic({ distance: 28, side: 8, height: 5.5, lookAhead: 70, lookSide: 0, lookHeight: -8, fov: 46 });
  const target = { x: -450, z: 0 };
  const bearing = 72;
  const distance = 1.4 * METERS_PER_NM;
  const x = target.x - Math.sin((bearing * Math.PI) / 180) * distance;
  const z = target.z + Math.cos((bearing * Math.PI) / 180) * distance;
  ctx.flight.setAirborneState({
    x,
    z,
    altFt: 422,
    heading: 68.5,
    pitchDeg: 4,
    bankDeg: 12,
    speedKts: 98,
    verticalSpeedFpm: 0,
    throttle: 0.45,
    flaps: 2,
    gearDown: true,
    fuel: 68,
    damage: 0,
    cargoWeight: 160,
  });
  simulate(ctx, 90);
  active.cargo = 2;
  active.hasTakenOff = true;
  active.clockRunning = true;
  active.elapsed = 151.2;
  active.stage = 'FINAL — RWY 09 CINDER CAY';
  active.objective = 'CLEARED TO LAND — WIND CALM';
  active.pips = 'CARGO 2/3';
  active.stageOverride = null;
  setTarget(active, { x: -450, y: 42, z: 0 }, 'RWY 09');
  refreshTargetMetrics(ctx, active);
  ctx.gameState.mission = active;
  radio(ctx, 'Kestrel Two, Cinder Tower. Cleared to land runway zero-nine.', 'CINDER TOWER');
  harmonise(ctx);
}

function stageCockpit(ctx) {
  const active = launch(ctx, 'narrows', 'midday', 0.04, 0);
  ctx.cameraRig.setMode('cockpit');
  ctx.hud.setCockpit(true);
  ctx.flight.setAirborneState({
    x: 1040,
    z: 62,
    altFt: 260,
    heading: 90,
    pitchDeg: 1.5,
    bankDeg: 0,
    speedKts: 118,
    verticalSpeedFpm: 0,
    throttle: 0.6,
    flaps: 0,
    gearDown: false,
    fuel: 63,
    damage: 0,
  });
  simulate(ctx, 90);
  ctx.worldProps.setCollected(0, true);
  active.ringIndex = 1;
  active.hasTakenOff = true;
  active.clockRunning = true;
  active.elapsed = 47.2;
  active.stage = 'RING 2 OF 6';
  active.objective = 'THREAD THE CORAL RING — STAY LOW';
  active.pips = 'RING 2/6';
  const ring = ctx.worldProps.rings[1].group.position;
  setTarget(active, { x: ring.x, y: ring.y, z: ring.z }, 'RING 2');
  refreshTargetMetrics(ctx, active);
  ctx.gameState.mission = active;
  radio(ctx, 'Ring two in the groove. Keep it centred.', 'RACE CONTROL');
  harmonise(ctx);
}

function stageRings(ctx) {
  const active = launch(ctx, 'narrows', 'afternoon', 0.08, 0);
  ctx.cameraRig.configureCinematic({ distance: 29, side: 4.5, height: 4.8, lookAhead: 55, lookSide: 0, lookHeight: -1.5 });
  ctx.flight.setAirborneState({
    x: 1780,
    z: 100,
    altFt: 218,
    heading: 85,
    pitchDeg: 4,
    bankDeg: 35,
    speedKts: 127,
    verticalSpeedFpm: 0,
    throttle: 0.4,
    flaps: 0,
    gearDown: false,
    fuel: 61,
    damage: 3,
  });
  simulate(ctx, 90);
  for (let i = 0; i < 3; i += 1) ctx.worldProps.setCollected(i, true);
  active.ringIndex = 3;
  active.hasTakenOff = true;
  active.clockRunning = true;
  active.elapsed = 23.8;
  active.stage = 'RING 4 OF 6';
  active.objective = 'THREAD THE CORAL RING — STAY LOW';
  active.pips = 'RING 4/6';
  const ring = ctx.worldProps.rings[3].group.position;
  setTarget(active, { x: ring.x, y: ring.y, z: ring.z }, 'RING 4');
  refreshTargetMetrics(ctx, active);
  ctx.gameState.mission = active;
  radio(ctx, 'Four ahead. Watch the reef, Kestrel.', 'RACE CONTROL');
  harmonise(ctx);
}

function stageLanding(ctx) {
  const active = launch(ctx, 'lantern-watch', 'dusk', 1, 0.2);
  ctx.cameraRig.configureCinematic({ distance: 26, side: 6, height: 4.2, lookAhead: 48, lookSide: -1, lookHeight: -2.6 });
  ctx.hud.setCockpit(false);
  ctx.flight.setAirborneState({
    x: -23,
    z: -2700,
    altFt: 10,
    heading: 271,
    pitchDeg: 8,
    bankDeg: 0,
    speedKts: 76,
    verticalSpeedFpm: -180,
    throttle: 0.32,
    flaps: 2,
    gearDown: true,
    fuel: 38,
    damage: 22,
  });
  simulate(ctx, 30);
  active.photoDone = true;
  active.hasTakenOff = true;
  active.clockRunning = true;
  active.elapsed = 372.4;
  active.stage = 'FINAL — RWY 27 GULLWING';
  active.objective = 'CLEARED TO LAND';
  active.pips = 'RECON COMPLETE';
  active.stageOverride = null;
  setTarget(active, null, '');
  refreshTargetMetrics(ctx, active);
  ctx.gameState.mission = active;
  radio(ctx, 'Kestrel Two, Gullwing Tower. Cleared to land runway two-seven.', 'GULLWING TOWER');
  harmonise(ctx);
  ctx.screens.showCompactResult({
    title: 'MISSION COMPLETE',
    success: true,
    missionTitle: 'LANTERN WATCH',
    rows: [
      { label: 'SMOOTH LANDING', value: 250 },
      { label: 'CARGO DELIVERED', value: 400 },
    ],
    total: 1240,
    medal: 'gold',
    note: 'GULLWING STATION · RWY 27',
    reason: '',
  });
}

export function applyShot(name, ctx) {
  const { gameState, screens, hud, sky, effects, worldProps, cameraRig, flight } = ctx;
  if (name === 'title') {
    gameState.mode = 'title';
    gameState.results = null;
    gameState.mission = null;
    flight.reset({ x: -260, z: 0, heading: 90, fuel: 100, flaps: 0, gearDown: true, throttle: 0, rpm: 650 });
    sky.setPreset('golden');
    worldProps.setNightFactor(0.18);
    effects.setRain(0);
    hud.setVisible(false);
    screens.showTitle(gameState.bests);
    cameraRig.setMode('title');
    cameraRig.initialised = false;
    return { frozen: false };
  }
  if (name === 'cockpit') {
    stageCockpit(ctx);
    return { frozen: true };
  }
  if (name === 'rings') {
    stageRings(ctx);
    return { frozen: true };
  }
  if (name === 'landing') {
    stageLanding(ctx);
    return { frozen: true };
  }
  stageCover(ctx);
  return { frozen: true };
}
