// Kestrel Courier boot and glue: build the Cinder Reach, run the fixed-step loop, route input
// and menus, and expose a small QA surface for deterministic screenshots and smoke tests.

import * as THREE from '../vendor/three.module.min.js';
import { FIXED_STEP, STAGE_HEIGHT, STAGE_WIDTH, VERSION, WORLD } from './config.js';
import { createTerrain } from './terrain.js';
import { createOcean } from './ocean.js';
import { SkySystem } from './sky.js';
import { WorldProps } from './world-props.js';
import { createAircraftVisual } from './aircraft.js';
import { EffectsSystem } from './effects.js';
import { GameState } from './game-state.js';
import { MissionManager } from './missions.js';
import { MISSIONS, NARROWS_RINGS, missionById } from './mission-catalog.js';
import { CameraRig } from './camera-rig.js';
import { Hud } from './hud.js';
import { Screens } from './screens.js';
import { AudioEngine } from './audio-engine.js';
import { Input } from './input.js';
import { applyShot } from './shots.js';
import { clamp, formatClock } from './math-utils.js';

const stage = document.querySelector('#stage');
const canvas = document.querySelector('#scene');
const hudRoot = document.querySelector('#hud');
const screensRoot = document.querySelector('#screens');
const errorBox = document.querySelector('#bootError');
const params = new URLSearchParams(globalThis.location.search);
const shotName = params.get('shot');
const shotMode = Boolean(shotName);
const skipTitle = params.has('skipTitle');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
} catch (error) {
  if (errorBox) {
    errorBox.style.display = 'flex';
    errorBox.textContent = 'This browser could not create a WebGL context for Kestrel Courier.';
  }
  throw error;
}
renderer.setPixelRatio(1);
renderer.setSize(STAGE_WIDTH, STAGE_HEIGHT, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = true;

const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = true;
const camera = new THREE.PerspectiveCamera(52, STAGE_WIDTH / STAGE_HEIGHT, 0.12, 16000);
camera.position.set(600, 180, 900);

const terrain = createTerrain();
scene.add(terrain.group);
const ocean = createOcean();
scene.add(ocean.mesh);
const sky = new SkySystem(scene, renderer);
const worldProps = new WorldProps(scene, NARROWS_RINGS);
const aircraft = createAircraftVisual();
scene.add(aircraft.group);
const effects = new EffectsSystem(scene, camera);

const gameState = new GameState();
const flight = gameState.flight;
const missionManager = new MissionManager({ flight, worldProps, gameState });
const cameraRig = new CameraRig(camera);
const hud = new Hud(hudRoot);
hud.setGameState(gameState);
const audio = new AudioEngine();
const screens = new Screens(screensRoot, {
  onEnterTitle: () => enterMissionSelect(),
  onSelectMission: (id) => startMission(id),
  onMute: () => toggleMute(),
  onTitle: () => showTitle(),
  onResume: () => resumeFlight(),
  onRestart: () => restartMission(),
  onQuit: () => enterMissionSelect(),
  onRetry: () => restartMission(),
});

let inputThrottle = 0;
let mode = 'title';
let accumulator = 0;
let lastFrame = performance.now();
let shotFrozen = false;
let shotFrames = 0;
let shotReadySent = false;
let resultsShown = false;
let elapsedSession = 0;
const weatherWind = new THREE.Vector3();
const flightEnvironment = { wind: weatherWind, turbulence: 0 };
const menuModes = new Set(['title', 'select', 'paused', 'results', 'controls']);

const input = new Input(stage, {
  onKeyDown: handleKeyDown,
  onLook: handleLook,
  onWheel: handleWheel,
});
if (shotMode) input.enabled = false;

screens.updateMute(gameState.muted);
fitStage();
window.addEventListener('resize', fitStage);

function fitStage() {
  const scale = Math.min(globalThis.innerWidth / STAGE_WIDTH, globalThis.innerHeight / STAGE_HEIGHT);
  stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function ensureAudio() {
  if (shotMode) return;
  audio.init();
  audio.setMuted(gameState.muted);
}

function enterMissionSelect() {
  ensureAudio();
  showTitleWorld();
  mode = 'select';
  gameState.setMode('select');
  screens.showSelect(gameState.bests);
  input.clear();
}

function showTitle() {
  ensureAudio();
  showTitleWorld();
  mode = 'title';
  gameState.setMode('title');
  screens.showTitle(gameState.bests);
  input.clear();
}

function showTitleWorld() {
  gameState.missionId = null;
  gameState.mission = null;
  gameState.results = null;
  missionManager.active = null;
  flight.reset({ x: -260, z: 0, heading: 90, fuel: 100, flaps: 0, gearDown: true, throttle: 0, rpm: 650 });
  worldProps.resetRings();
  worldProps.setBeacons([]);
  worldProps.beaconGroup.clear();
  worldProps.setNightFactor(0.18);
  sky.setPreset('golden');
  effects.setRain(0);
  effects.lastTouchdown = null;
  hud.setVisible(false);
  hud.setCockpit(false);
  hud.setMap(false);
  screens.hideCompactResult();
  gameState.showMap = false;
  cameraRig.setMode('title');
  cameraRig.initialised = false;
  inputThrottle = 0;
  audio.setMuted(gameState.muted);
  syncParkedAircraft();
}

function syncParkedAircraft() {
  aircraft.group.position.copy(flight.state.position);
  aircraft.group.quaternion.copy(flight.state.quaternion);
  aircraft.update(0.016, { ...flight.state, cockpitView: false }, { pitch: 0, roll: 0, yaw: 0 });
  sky.focus(flight.state.position);
}

function startMission(missionId) {
  ensureAudio();
  const definition = missionById(missionId);
  if (!definition) return false;
  missionManager.start(definition);
  mode = 'flight';
  resultsShown = false;
  gameState.setMode('flight');
  gameState.results = null;
  gameState.showMap = false;
  gameState.cameraMode = 'chase';
  gameState.addRadio('Kestrel Two, cleared for the sortie. Fly the aeroplane.', 'CINDER TOWER', 5);
  screens.hideAll();
  screens.hideCompactResult();
  hud.setVisible(true);
  hud.setCockpit(false);
  hud.setMap(false);
  cameraRig.setMode('chase');
  cameraRig.configureCinematic(null);
  cameraRig.initialised = false;
  sky.setPreset(definition.weather);
  const night = definition.weather === 'dusk' ? 0.85 : definition.weather === 'storm' ? 0.35 : definition.weather === 'midday' ? 0.02 : 0.14;
  worldProps.setNightFactor(night);
  effects.setRain(definition.weather === 'storm' ? 0.65 : 0);
  effects.lastTouchdown = null;
  input.clear();
  inputThrottle = definition.start.air ? flight.state.throttle : 0;
  flight.setControl('throttle', inputThrottle);
  flight.setControl('pitch', 0);
  flight.setControl('roll', 0);
  flight.setControl('yaw', 0);
  gameState.setHint(definition.start.air ? 'TARGET AHEAD — A/D BANK · W/S PITCH · SHIFT THROTTLE' : 'SHIFT THROTTLE · W/S PITCH · Q/E RUDDER · G GEAR', 7);
  aircraft.group.position.copy(flight.state.position);
  aircraft.group.quaternion.copy(flight.state.quaternion);
  cameraRig.update(1 / 60, flight.state, { turbulence: 0 });
  updateAircraft(1 / 60, false);
  sky.focus(flight.state.position);
  renderer.render(scene, camera);
  return true;
}

function restartMission() {
  if (shotMode) return;
  const id = missionManager.active?.id ?? gameState.missionId ?? screens.selectedMission().id;
  startMission(id);
}

function resumeFlight() {
  if (mode !== 'paused') return;
  mode = 'flight';
  gameState.setMode('flight');
  screens.hideAll();
  hud.setVisible(true);
  input.clear();
  inputThrottle = flight.state.throttle;
}

function pauseFlight() {
  if (mode !== 'flight') return;
  mode = 'paused';
  gameState.setMode('paused');
  input.clear();
  screens.showPause();
}

function toggleMute() {
  ensureAudio();
  const muted = gameState.toggleMute();
  audio.setMuted(muted);
  screens.updateMute(muted);
  gameState.setHint(muted ? 'SOUND MUTED' : 'SOUND ON', 2);
}

function toggleCamera() {
  const next = cameraRig.toggleMode();
  gameState.cameraMode = next;
  hud.setCockpit(next === 'cockpit');
  gameState.setHint(next === 'cockpit' ? 'COCKPIT VIEW · RIGHT-DRAG TO LOOK' : 'CHASE VIEW', 2.5);
}

function toggleMap() {
  gameState.showMap = !gameState.showMap;
  hud.setMap(gameState.showMap);
  input.clear();
  if (gameState.showMap) gameState.setHint('NAVIGATION MAP — M TO CLOSE', 2);
}

function handleLook(dx, dy) {
  if (mode === 'flight' && !gameState.showMap) cameraRig.addLook(dx, dy);
}

function handleWheel(direction) {
  if (mode !== 'flight' || gameState.showMap) return;
  inputThrottle = clamp(inputThrottle - direction * 0.04, 0, 1);
  gameState.setHint(`THROTTLE ${Math.round(inputThrottle * 100)}%`, 1.4);
}

function handleKeyDown(event) {
  if (shotMode) return true;
  ensureAudio();
  if (menuModes.has(mode)) {
    const consumed = screens.handleKey(event);
    if (consumed) return true;
  }
  if (mode === 'flight') {
    if (event.code === 'Escape') {
      if (gameState.showMap) {
        toggleMap();
      } else {
        pauseFlight();
      }
      return true;
    }
    if (event.repeat) return false;
    if (event.code === 'KeyC') {
      toggleCamera();
      return true;
    }
    if (event.code === 'KeyM') {
      toggleMap();
      return true;
    }
    if (event.code === 'KeyG') {
      if (flight.state.onGround) {
        gameState.setHint('GEAR LEVER LOCKED ON THE GROUND', 1.8);
      } else {
        const changed = flight.toggleGear();
        if (changed) audio.radio();
        gameState.setHint(flight.state.gearDown ? 'GEAR DOWN' : 'GEAR UP', 1.6);
      }
      return true;
    }
    if (event.code === 'KeyF') {
      flight.cycleFlaps();
      audio.radio();
      gameState.setHint(`FLAPS ${flight.state.flaps}`, 1.5);
      return true;
    }
    if (event.code === 'KeyR') {
      restartMission();
      return true;
    }
    if (event.code === 'KeyB') return true;
  }
  if (mode === 'paused' && event.code === 'Escape') {
    resumeFlight();
    return true;
  }
  return false;
}

function weatherEnvironment() {
  const def = missionManager.active?.def;
  const weather = def?.weather ?? 'golden';
  const z = flight.state.position.z;
  let turbulence = 0;
  let rain = 0;
  weatherWind.set(0, 0, 0);
  if (weather === 'storm') {
    const front = clamp((WORLD.stormLineZ + 1000 - z) / 2000, 0, 1);
    turbulence = 0.14 + front * 0.7;
    rain = 0.25 + front * 0.62;
    weatherWind.set(4 + front * 11, 0, -1.5 - front * 4);
  } else if (weather === 'dusk') {
    turbulence = 0.08;
    rain = 0.08;
  }
  flightEnvironment.turbulence = turbulence;
  return { wind: weatherWind, turbulence, rain };
}

function applyPlayerControls() {
  flight.setControl('pitch', input.pitch);
  flight.setControl('roll', input.roll);
  flight.setControl('yaw', input.yaw);
  flight.setControl('brakes', input.brakes);
  if (input.throttleDelta !== 0) {
    inputThrottle = clamp(inputThrottle + input.throttleDelta * 0.55 * FIXED_STEP, 0, 1);
  }
  flight.setControl('throttle', inputThrottle);
}

function updateAircraft(dt, cockpitView) {
  aircraft.group.position.copy(flight.state.position);
  aircraft.group.quaternion.copy(flight.state.quaternion);
  aircraft.update(dt, { ...flight.state, cockpitView }, flight.controls);
}

function syncWorld(dt, environment) {
  sky.focus(flight.state.position);
  sky.update(dt, camera.position);
  ocean.setSun(sky.sunDirection, sky.sun.color);
  ocean.update(dt);
  worldProps.update(dt, flight.state.position, camera.position);
  effects.setRain(environment?.rain ?? 0);
  effects.update(dt, flight.state, { rain: environment?.rain ?? 0 });
}

function stepFlight(dt) {
  applyPlayerControls();
  const environment = weatherEnvironment();
  flight.update(dt, environment);
  if (!shotMode) missionManager.update(dt);
  gameState.updateRadio(dt);
  updateAircraft(dt, cameraRig.mode === 'cockpit');
  cameraRig.update(dt, flight.state, { turbulence: environment.turbulence, speed: flight.state.iasKts });
  syncWorld(dt, environment);
  audio.update(flight.state, dt);
  if (gameState.mode === 'results' && !resultsShown) presentResults();
}

function presentResults() {
  resultsShown = true;
  mode = 'results';
  input.clear();
  hud.setVisible(false);
  screens.showResults(gameState.results);
  if (gameState.results?.success) audio.success();
  else audio.failure();
}

function updateTitleScene(dt) {
  flight.state.rpm = 600 + Math.sin(elapsedSession * 0.7) * 25;
  updateAircraft(dt, false);
  cameraRig.update(dt, flight.state, { turbulence: 0 });
  sky.focus(flight.state.position);
  sky.update(dt, camera.position);
  ocean.setSun(sky.sunDirection, sky.sun.color);
  ocean.update(dt);
  worldProps.update(dt, flight.state.position, camera.position);
  effects.update(dt, flight.state, { rain: 0 });
  audio.update(flight.state, dt);
}

function updateFrozenScene(dt) {
  // Paused and result screens leave the airframe where it stopped, but the world keeps breathing.
  sky.update(dt * 0.25, camera.position);
  ocean.update(dt * 0.25);
  cameraRig.update(dt * 0.12, flight.state, { turbulence: 0 });
  worldProps.update(dt * 0.25, flight.state.position, camera.position);
  effects.update(dt * 0.2, flight.state, { rain: 0 });
}

function updateHud(dt) {
  if (!hud.visible) return;
  hud.update(dt, {
    state: flight.state,
    active: missionManager.active,
    camera,
    gameState,
  });
}

function renderFrame(now) {
  requestAnimationFrame(renderFrame);
  const raw = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (shotMode && shotFrozen) {
    renderer.render(scene, camera);
    shotFrames += 1;
    if (shotFrames >= 3 && !shotReadySent) {
      shotReadySent = true;
      globalThis.__shotReady = true;
    }
    return;
  }
  elapsedSession += raw;
  if (mode === 'flight' && !gameState.showMap) {
    accumulator += raw;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5 && mode === 'flight') {
      stepFlight(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
      if (mode !== 'flight') break;
    }
    if (steps === 0) {
      updateAircraft(raw, cameraRig.mode === 'cockpit');
      cameraRig.update(raw, flight.state, { turbulence: weatherEnvironment().turbulence });
    }
  } else if (mode === 'title' || mode === 'select') {
    updateTitleScene(raw);
  } else {
    accumulator = 0;
    updateFrozenScene(raw);
  }
  updateHud(raw);
  renderer.render(scene, camera);
  if (shotMode) {
    shotFrames += 1;
    if (shotFrames >= 3 && !shotReadySent) {
      shotReadySent = true;
      globalThis.__shotReady = true;
    }
  }
}

function installQa() {
  const qa = {
    startMission(id) {
      if (!MISSIONS.some((mission) => mission.id === id)) return false;
      const started = startMission(id);
      gameState.setHint(`SORTIE ${missionById(id).title} — GO`, 3);
      return started;
    },
    setControl(name, value) {
      if (name === 'throttle') {
        inputThrottle = clamp(Number(value), 0, 1);
      }
      flight.setControl(name, value);
      return true;
    },
    step(seconds = 1) {
      const steps = Math.min(1200, Math.max(1, Math.round(seconds / FIXED_STEP)));
      const environment = weatherEnvironment();
      for (let i = 0; i < steps; i += 1) {
        flight.update(FIXED_STEP, environment);
        if (!shotMode) missionManager.update(FIXED_STEP);
        gameState.updateRadio(FIXED_STEP);
      }
      updateAircraft(0.016, cameraRig.mode === 'cockpit');
      cameraRig.update(0.016, flight.state, { turbulence: environment.turbulence });
      updateHud(0.016);
      if (gameState.mode === 'results' && !resultsShown) presentResults();
      return flight.snapshot();
    },
    setCamera(next) {
      cameraRig.setMode(next === 'cockpit' ? 'cockpit' : 'chase');
      gameState.cameraMode = cameraRig.mode;
      hud.setCockpit(cameraRig.mode === 'cockpit');
      updateAircraft(0.016, cameraRig.mode === 'cockpit');
      return cameraRig.mode;
    },
    shot(name) {
      const result = applyShot(name, ctx);
      shotFrozen = Boolean(result.frozen);
      shotFrames = 0;
      shotReadySent = false;
      globalThis.__shotReady = false;
      return true;
    },
    hideAircraft() {
      aircraft.group.visible = false;
      return true;
    },
    hideChildren(start, end) {
      aircraft.group.children.slice(start, end).forEach((child) => { child.visible = false; });
      return aircraft.group.children.length;
    },
    hidePart(name) {
      const parts = { wing: aircraft.wing, windscreen: aircraft.windscreen, canopy: aircraft.canopy, prop: aircraft.prop, fuselage: aircraft.group.getObjectByName('fuselage') };
      if (parts[name]) parts[name].visible = false;
      return Boolean(parts[name]);
    },
    debugCamera(px, py, pz, tx, ty, tz, fov = 56) {
      camera.position.set(px, py, pz);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.lookAt(tx, ty, tz);
      camera.updateMatrixWorld();
      renderer.render(scene, camera);
      return { position: camera.position.toArray(), fov: camera.fov };
    },
    snapshot() {
      const active = missionManager.active;
      return {
        mode,
        camera: cameraRig.mode,
        state: flight.snapshot(),
        mission: active
          ? {
              id: active.id,
              title: active.title,
              stage: active.stage,
              objective: active.objective,
              pips: active.pips,
              elapsed: active.elapsed,
              cargo: active.cargo,
              ringIndex: active.ringIndex,
              hold: active.hold,
              photoDone: active.photoDone,
              status: active.status,
              distanceNm: active.distanceNm,
              bearing: active.bearing,
              target: active.target ? { x: active.target.x, y: active.target.y, z: active.target.z } : null,
            }
          : null,
        results: gameState.results,
        radio: gameState.radio.map((message) => ({ source: message.source, text: message.text, age: message.age })),
      };
    },
  };

  const ctx = {
    gameState,
    flight,
    missionManager,
    cameraRig,
    hud,
    screens,
    sky,
    ocean,
    worldProps,
    effects,
    aircraft,
    camera,
    renderer,
  };

  Object.defineProperty(globalThis, '__kestrel', {
    value: Object.freeze({
      version: VERSION,
      ready: true,
      get state() {
        return Object.freeze(flight.snapshot());
      },
      get mission() {
        const active = missionManager.active;
        if (!active) return null;
        return Object.freeze({
          id: active.id,
          title: active.title,
          stage: active.stage,
          objective: active.objective,
          pips: active.pips,
          status: active.status,
          elapsed: active.elapsed,
          cargo: active.cargo,
          ringIndex: active.ringIndex,
          photoDone: active.photoDone,
          distanceNm: active.distanceNm,
          bearing: active.bearing,
        });
      },
      get camera() {
        return cameraRig.mode;
      },
      get mode() {
        return mode;
      },
      get muted() {
        return gameState.muted;
      },
      qa,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  void formatClock;
}

function boot() {
  globalThis.__shotReady = false;
  if (shotMode) {
    document.body.classList.add('shot-mode');
    input.enabled = false;
    screens.hideAll();
    hud.setVisible(false);
    globalThis.__kestrel = null;
    const result = applyShot(shotName, {
      gameState,
      flight,
      missionManager,
      cameraRig,
      hud,
      screens,
      sky,
      ocean,
      worldProps,
      effects,
      aircraft,
      camera,
      renderer,
    });
    shotFrozen = Boolean(result.frozen);
    installQa();
    if (shotName === 'title') {
      mode = 'title';
      gameState.setMode('title');
    } else {
      mode = 'flight';
      gameState.setMode('flight');
    }
    camera.updateMatrixWorld();
    updateHud(0.016);
    renderer.render(scene, camera);
    requestAnimationFrame(renderFrame);
    return;
  }
  installQa();
  if (skipTitle) {
    enterMissionSelect();
  } else {
    showTitle();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(renderFrame);
}

function setControlHint() {
  gameState.setHint(`${formatClock(missionManager.active?.elapsed ?? 0)} · ALT ${Math.round(flight.state.altFt)} FT`, 0.8);
}

void setControlHint;
boot();
