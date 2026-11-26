// Mission state machines: cargo drops, ordered ring gates, the eight-second storm photo hold,
// landings and scoring. Each mission is a different verb, not a different label.

import * as THREE from '../vendor/three.module.min.js';
import { METERS_PER_NM, WORLD } from './config.js';
import { GULLWING_THRESHOLD_27, heightAt } from './terrain.js';
import { makeResult, scoreTouchdown } from './landing-score.js';
import { clamp, formatClock, formatDuration, headingFromDirection } from './math-utils.js';

const tempTarget = new THREE.Vector3();

function medallionFor(score, gold, silver, bronze) {
  if (score >= gold) return 'gold';
  if (score >= silver) return 'silver';
  if (score >= bronze) return 'bronze';
  return null;
}

export class MissionManager {
  constructor({ flight, worldProps, gameState }) {
    this.flight = flight;
    this.worldProps = worldProps;
    this.gameState = gameState;
    this.active = null;
    this.missionById = new Map();
  }

  start(missionDef) {
    this.worldProps.resetRings();
    this.worldProps.setBeacons([]);
    this.worldProps.beaconGroup.clear();
    this.flight.reset({
      x: missionDef.start.x,
      z: missionDef.start.z,
      heading: missionDef.start.heading,
      fuel: missionDef.start.fuel,
      flaps: missionDef.start.flaps,
      gearDown: missionDef.start.gearDown,
      cargoWeight: missionDef.start.cargoWeight,
      throttle: 0,
    });
    if (missionDef.start.air) {
      this.flight.setAirborneState({
        x: missionDef.start.x,
        z: missionDef.start.z,
        altFt: missionDef.start.altFt,
        heading: missionDef.start.heading,
        speedKts: missionDef.start.speedKts,
        pitchDeg: 2.5,
        bankDeg: 0,
        throttle: 0.78,
        fuel: missionDef.start.fuel,
        gearDown: missionDef.start.gearDown,
        flaps: missionDef.start.flaps,
        cargoWeight: 0,
      });
    }
    this.active = {
      def: missionDef,
      id: missionDef.id,
      title: missionDef.title,
      elapsed: 0,
      clockRunning: Boolean(missionDef.start.air),
      hasTakenOff: Boolean(missionDef.start.air),
      status: 'flying',
      cargo: 0,
      ringIndex: 0,
      hold: 0,
      photoDone: false,
      stage: '',
      objective: missionDef.objective,
      pips: '',
      target: null,
      targetLabel: '',
      landingTimer: 0,
      failTimer: 0,
      failReason: '',
      result: null,
      medallion: null,
      nextStrike: 7,
      stageOverride: null,
      startedAt: 0,
    };
    this.gameState.missionId = missionDef.id;
    this.gameState.mission = this.active;
    this.gameState.results = null;
    this.gameState.radio = [];
    if (missionDef.cargo) {
      this.worldProps.setBeacons(
        missionDef.cargo.map((drop) => ({ x: drop.x, z: drop.z, y: heightAt(drop.x, drop.z) })),
        0xe2603f,
      );
    }
    if (missionDef.photo) {
      this.worldProps.setPhotoZone({ x: missionDef.photo.x, z: missionDef.photo.z }, missionDef.photo.radius);
    }
    this.updateTarget();
    this.updateLabels();
    this.initialRadio(missionDef);
    return this.active;
  }

  initialRadio(missionDef) {
    const gs = this.gameState;
    if (missionDef.id === 'first-light') {
      gs.addRadio('Kestrel Two, Cinder Tower. Three crates aboard. Cleared for take-off, runway zero-nine.', 'CINDER TOWER', 9);
      gs.addRadio('Follow the orange beacons down the coast, then Gullwing Station.', 'CINDER TOWER', 9);
    } else if (missionDef.id === 'narrows') {
      gs.addRadio('Narrows gate at your twelve. Six rings, no second chances.', 'CINDER TOWER', 8);
      gs.addRadio('Clock is live, Kestrel. Fly clean.', 'RACE CONTROL', 8);
    } else if (missionDef.id === 'lantern-watch') {
      gs.addRadio('Kestrel Two, the front is moving south faster than forecast.', 'CINDER TOWER', 9);
      gs.addRadio('Reach the Lantern Reef beacon, hold for the photo, then get home.', 'CINDER TOWER', 9);
    } else {
      gs.addRadio('Cinder Tower to Kestrel Two. The Reach is yours. Have fun.', 'CINDER TOWER', 8);
    }
  }

  currentSnapshot() {
    return this.active;
  }

  updateTarget() {
    const active = this.active;
    if (!active) return;
    const state = this.flight.state;
    if (active.id === 'first-light') {
      if (active.cargo < active.def.cargo.length) {
        const drop = active.def.cargo[active.cargo];
        active.target = new THREE.Vector3(drop.x, heightAt(drop.x, drop.z) + 24, drop.z);
        active.targetLabel = drop.label;
      } else if (!active.def.cargo) {
        active.target = null;
      } else {
        active.target = new THREE.Vector3(active.def.destination.x, active.def.destination.y + 8, active.def.destination.z);
        active.targetLabel = 'GULLWING STATION';
      }
    } else if (active.id === 'narrows') {
      const ring = this.worldProps.rings[active.ringIndex];
      active.target = ring ? ring.group.position.clone() : null;
      active.targetLabel = ring ? `RING ${active.ringIndex + 1}` : 'FINISH';
    } else if (active.id === 'lantern-watch') {
      if (!active.photoDone) {
        active.target = new THREE.Vector3(active.def.photo.x, 92, active.def.photo.z);
        active.targetLabel = 'LANTERN BEACON';
      } else {
        active.target = new THREE.Vector3(active.def.destination.x, active.def.destination.y + 12, active.def.destination.z);
        active.targetLabel = 'CINDER CAY';
      }
    } else {
      active.target = null;
      active.targetLabel = '';
    }
    if (active.target) {
      active.distanceNm = Math.hypot(active.target.x - state.position.x, active.target.z - state.position.z) / METERS_PER_NM;
      active.bearing = headingFromDirection(active.target.x - state.position.x, active.target.z - state.position.z);
    } else {
      active.distanceNm = 0;
      active.bearing = state.heading;
    }
  }

  updateLabels() {
    const active = this.active;
    if (!active) return;
    const state = this.flight.state;
    const airborne = !state.onGround || active.hasTakenOff;
    if (active.id === 'first-light') {
      active.pips = `CARGO ${active.cargo}/3`;
      if (!active.hasTakenOff) {
        active.stage = 'DEPART — RWY 09 CINDER CAY';
        active.objective = 'TAKE OFF — CLIMB EAST, FOLLOW THE COAST';
      } else if (active.cargo < 3) {
        active.stage = `COASTAL DROP ${active.cargo + 1} OF 3`;
        active.objective = `FLY THE ORANGE BEACON — DROP CRATE ${active.cargo + 1}`;
      } else if (state.onGround && state.iasKts < 60) {
        active.stage = 'ROLLOUT — GULLWING STATION';
        active.objective = 'BRING THE KESTREL TO A STOP';
      } else {
        active.stage = 'FINAL — RWY 27 GULLWING';
        active.objective = 'LAND AT GULLWING STATION';
      }
      void airborne;
    } else if (active.id === 'narrows') {
      active.pips = `RING ${clamp(active.ringIndex + 1, 1, 6)}/6`;
      active.stage = active.ringIndex < 6 ? `RING ${active.ringIndex + 1} OF 6` : 'COURSE CLEAR';
      active.objective = active.ringIndex < 6 ? 'THREAD THE CORAL RING — STAY LOW' : 'COURSE COMPLETE';
    } else if (active.id === 'lantern-watch') {
      if (!active.photoDone) {
        const hold = Math.min(active.def.photo.hold, active.hold);
        active.pips = `RECON 00:${String(Math.floor(hold)).padStart(2, '0')}`;
        if (active.hold > 0) {
          active.stage = 'PHOTO RUN — HOLD STEADY';
          active.objective = 'KEEP THE BEACON IN THE ZONE';
        } else {
          active.stage = 'STORM RECON — LANTERN REEF';
          active.objective = 'REACH THE LANTERN BEACON IN THE STORM';
        }
      } else if (state.onGround) {
        active.pips = 'RECON COMPLETE';
        active.stage = 'ROLLOUT — CINDER CAY';
        active.objective = 'BRING THE KESTREL TO A STOP';
      } else {
        active.pips = 'RECON COMPLETE';
        active.stage = 'RETURN — RWY 09 CINDER CAY';
        active.objective = 'LAND AT CINDER CAY';
      }
    } else {
      active.pips = 'FREE FLIGHT';
      active.stage = 'CINDER REACH';
      active.objective = 'EXPLORE THE ISLANDS — LAND ANYWHERE PAVED';
    }
    if (active.stageOverride) {
      active.stage = active.stageOverride.stage ?? active.stage;
      active.objective = active.stageOverride.objective ?? active.objective;
      active.pips = active.stageOverride.pips ?? active.pips;
    }
  }

  update(dt) {
    const active = this.active;
    if (!active) return;
    const state = this.flight.state;
    const gs = this.gameState;
    if (active.status !== 'flying') return;

    if (state.crashed) {
      active.failTimer += dt;
      active.failReason = state.crashReason || 'Aircraft lost';
      if (active.failTimer > 1.5) this.finish(false, active.failReason);
      gs.updateRadio(dt);
      return;
    }

    if (!state.onGround && !active.hasTakenOff) {
      active.hasTakenOff = true;
      active.clockRunning = true;
      gs.addRadio('Positive rate. Gear up when ready, Kestrel.', 'CINDER TOWER', 5);
    }
    if (active.clockRunning) active.elapsed += dt;

    if (active.id === 'first-light') this.updateFirstLight(dt);
    else if (active.id === 'narrows') this.updateNarrows(dt);
    else if (active.id === 'lantern-watch') this.updateLanternWatch(dt);
    else this.updateFreeFlight(dt);
    this.updateTarget();
    this.updateLabels();
    gs.updateRadio(dt);
  }

  updateFirstLight(dt) {
    const active = this.active;
    const state = this.flight.state;
    const gs = this.gameState;
    if (!active.hasTakenOff) return;
    if (active.cargo < active.def.cargo.length) {
      const drop = active.def.cargo[active.cargo];
      const horizontal = Math.hypot(state.position.x - drop.x, state.position.z - drop.z);
      if (horizontal < 260 && state.altFt > 15) {
        active.cargo += 1;
        state.cargoWeight = Math.max(0, 240 - active.cargo * 80);
        gs.addRadio(drop.radio, 'CINDER TOWER', 7);
        const remaining = active.def.cargo.slice(active.cargo);
        this.worldProps.setBeacons(remaining.map((point) => ({ x: point.x, z: point.z, y: heightAt(point.x, point.z) })), 0xe2603f);
      }
    }
    const airport = this.flight.getAirport();
    if (state.onGround && airport?.id === 'gullwing') {
      if (active.cargo >= 3) {
        active.landingTimer += dt;
        if (active.landingTimer > 1.4) this.completeFirstLight(airport);
      } else if (active.lastTouchdown) {
        active.landingTimer += dt;
        if (active.landingTimer > 1.2) this.finish(false, `Cargo incomplete — ${active.cargo} of 3 crates delivered`);
      }
    } else if (active.clockRunning) {
      active.landingTimer = Math.max(0, active.landingTimer - dt);
    }
    if (active.def.timeLimit && active.elapsed > active.def.timeLimit) {
      this.finish(false, 'Daylight lost — cargo route closed');
    }
  }

  updateNarrows(dt) {
    const active = this.active;
    const state = this.flight.state;
    const ring = this.worldProps.rings[active.ringIndex];
    if (ring) {
      const distance = state.position.distanceTo(ring.group.position);
      if (distance < 27) {
        this.worldProps.setCollected(active.ringIndex, true);
        active.ringIndex += 1;
        const messages = ['Gate one. Clean.', 'Gate two. Keep it tight.', 'Three. The canyon opens.', 'Four. Watch the reef.', 'Five. One to go.', 'Six — course clear!'];
        this.gameState.addRadio(messages[Math.min(5, active.ringIndex - 1)], 'RACE CONTROL', 3.4);
        if (active.ringIndex >= 6) {
          this.completeNarrows();
          return;
        }
      }
    }
    if (active.def.timeLimit && active.elapsed > active.def.timeLimit) {
      this.finish(false, 'Clock expired — the gate closed');
    }
  }

  updateLanternWatch(dt) {
    const active = this.active;
    const state = this.flight.state;
    const gs = this.gameState;
    if (!active.hasTakenOff) return;
    if (!active.photoDone) {
      const photo = active.def.photo;
      const horizontal = Math.hypot(state.position.x - photo.x, state.position.z - photo.z);
      const inZone = horizontal < photo.radius && state.altFt > 35;
      if (inZone) {
        active.hold = Math.min(photo.hold, active.hold + dt);
        if (Math.floor(active.hold) === 1 && !active.holdCalled) {
          active.holdCalled = true;
          gs.addRadio('Beacon in frame. Hold it steady through the gust.', 'RECON CONTROL', 5);
        }
        if (active.hold >= photo.hold) {
          active.photoDone = true;
          gs.addRadio('Photo captured. Lantern Watch complete — get yourself home.', 'RECON CONTROL', 9);
        }
      } else {
        active.hold = Math.max(0, active.hold - dt * 1.8);
        if (active.hold === 0) active.holdCalled = false;
      }
      if (state.position.z < WORLD.stormLineZ + 900) {
        if (active.elapsed > active.nextStrike) {
          active.nextStrike += 6.5;
          this.flight.addDamage(1.8);
          gs.addRadio('Lightning close. Airframe taking a beating.', 'KESTREL TWO', 4);
        }
      }
    }
    const airport = this.flight.getAirport();
    if (active.photoDone && state.onGround && airport?.id === 'cinder') {
      active.landingTimer += dt;
      if (active.landingTimer > 1.3) this.completeLanternWatch(airport);
    }
    if (active.def.timeLimit && active.elapsed > active.def.timeLimit) {
      this.finish(false, 'Sortie window closed — return to base');
    }
  }

  updateFreeFlight() {
    const state = this.flight.state;
    if (state.crashed && this.active.failTimer > 1.2) this.finish(false, state.crashReason || 'Aircraft lost');
  }

  completeFirstLight(airport) {
    const active = this.active;
    const landing = scoreTouchdown(this.flight.state.lastTouchdown);
    const delivery = 400;
    const timeBonus = clamp(Math.round((450 - active.elapsed) * 2.2), 0, 300);
    const fuelBonus = Math.round(this.flight.state.fuel * 1.4);
    const rows = [
      ...landing.rows,
      { label: 'CARGO DELIVERED', value: delivery },
      { label: 'ON TIME BONUS', value: timeBonus },
      { label: 'FUEL SAVED', value: fuelBonus },
    ];
    const total = landing.landingScore + delivery + timeBonus + fuelBonus;
    const medal = medallionFor(total, 1180, 960, 760);
    this.gameState.addRadio(`${airport.name} copies, Kestrel. Three crates on the deck. Welcome home.`, 'GULLWING TOWER', 9);
    this.finish(true, 'Three crates delivered to Gullwing Station', {
      rows,
      total,
      medal,
      note: `${landing.grade} touchdown · ${formatDuration(active.elapsed)} flight time`,
    });
  }

  completeNarrows() {
    const active = this.active;
    const time = active.elapsed;
    const medal = time <= active.def.medals.gold ? 'gold' : time <= active.def.medals.silver ? 'silver' : time <= active.def.medals.bronze ? 'bronze' : null;
    const medalBonus = medal === 'gold' ? 350 : medal === 'silver' ? 220 : medal === 'bronze' ? 100 : 0;
    const timeScore = Math.round(clamp(active.def.timeLimit - time, 0, 90) * 11);
    const rows = [
      { label: 'RINGS CLEARED', value: 600 },
      { label: `TIME ${formatClock(time)}`, value: timeScore },
    ];
    if (medal) rows.push({ label: `${medal.toUpperCase()} MEDAL`, value: medalBonus });
    const total = 600 + timeScore + medalBonus;
    this.gameState.addRadio('Six gates. That is a clean run through the Narrows.', 'RACE CONTROL', 8);
    this.finish(true, medal ? `${medal.toUpperCase()} time through the Narrows` : 'Course cleared', {
      rows,
      total,
      medal,
      note: `${formatClock(time)} · GOLD ${active.def.medals.gold.toFixed(1)} · SILVER ${active.def.medals.silver.toFixed(1)} · BRONZE ${active.def.medals.bronze.toFixed(1)}`,
    });
  }

  completeLanternWatch(airport) {
    const active = this.active;
    const landing = scoreTouchdown(this.flight.state.lastTouchdown);
    const photo = 500;
    const timeBonus = clamp(Math.round((500 - active.elapsed) * 1.6), 0, 260);
    const rows = [
      ...landing.rows,
      { label: 'STORM RECON PHOTO', value: photo },
      { label: 'SORTIE TIME BONUS', value: timeBonus },
    ];
    const total = landing.landingScore + photo + timeBonus;
    const medal = medallionFor(total, 1150, 920, 720);
    this.gameState.addRadio(`${airport.name} Tower to Kestrel Two. Beacon photography received. Outstanding work.`, 'CINDER TOWER', 9);
    this.finish(true, 'Lantern Reef photographed; Kestrel recovered at Cinder Cay', {
      rows,
      total,
      medal,
      note: `${landing.grade} landing · storm damage ${Math.round(this.flight.state.damage)}%`,
    });
  }

  finish(success, reason, payout = {}) {
    const active = this.active;
    if (active.status !== 'flying') return;
    active.status = success ? 'complete' : 'failed';
    active.elapsed = Math.round(active.elapsed * 10) / 10;
    const rows = payout.rows ?? [];
    const total = payout.total ?? 0;
    const result = makeResult({
      title: success ? 'MISSION COMPLETE' : 'MISSION FAILED',
      success,
      rows,
      total,
      medal: payout.medal ?? null,
      note: payout.note ?? reason,
    });
    result.missionId = active.id;
    result.missionTitle = active.title;
    result.reason = reason;
    result.time = active.elapsed;
    result.objective = active.def.objective;
    active.result = result;
    this.gameState.results = result;
    this.gameState.setMode('results');
    if (success) {
      const isBest = this.gameState.recordBest(active.id, total, result.medal, { time: active.elapsed });
      result.isBest = isBest;
    }
    this.gameState.addRadio(success ? 'Mission complete. Nice flying, Kestrel.' : reason, 'CINDER TOWER', 9);
  }

  retry() {
    if (!this.active) return null;
    return this.start(this.active.def);
  }

  static computeTargetMetrics(active, state) {
    if (!active?.target) return { distanceNm: 0, bearing: state.heading };
    tempTarget.copy(active.target);
    const dx = tempTarget.x - state.position.x;
    const dz = tempTarget.z - state.position.z;
    return {
      distanceNm: Math.hypot(dx, dz) / METERS_PER_NM,
      bearing: headingFromDirection(dx, dz),
    };
  }
}

export { GULLWING_THRESHOLD_27 };
