// Arcade flight dynamics for the Kestrel. Lift follows speed and angle of attack, drag combines
// parasite and induced terms, controls lose authority at low speed, and every touchdown is logged
// for the landing judge. Ground, water and terrain outcomes are resolved here.

import * as THREE from '../vendor/three.module.min.js';
import { FLIGHT } from './config.js';
import { airportAt, referenceSurfaceAt, surfaceHeightAt } from './terrain.js';
import { clamp, damp, degrees, headingFromDirection, wrapHeading } from './math-utils.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);
const GEAR_HEIGHT = 1.48;

const tempForward = new THREE.Vector3();
const tempUp = new THREE.Vector3();
const tempRight = new THREE.Vector3();
const tempLocalVelocity = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempForce = new THREE.Vector3();
const tempAxis = new THREE.Vector3();
const tempVec = new THREE.Vector3();

function quaternionFromHeading(heading, pitch = 0, bank = 0) {
  const quaternion = new THREE.Quaternion().setFromAxisAngle(UP, (-heading * Math.PI) / 180);
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(RIGHT, pitch));
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, bank));
  return quaternion.normalize();
}

export class FlightModel {
  constructor() {
    this.time = 0;
    this.state = {
      position: new THREE.Vector3(-450, 43.5, 0),
      velocity: new THREE.Vector3(),
      quaternion: quaternionFromHeading(90),
      heading: 90,
      pitchDeg: 0,
      bankDeg: 0,
      iasKts: 0,
      altFt: 0,
      aglFt: 0,
      vsFpm: 0,
      throttle: 0,
      fuel: 100,
      fuelMinutes: 60,
      damage: 0,
      gearDown: true,
      flaps: 1,
      rpm: 600,
      stalled: false,
      stallWarning: false,
      gLoad: 1,
      onGround: true,
      crashed: false,
      crashReason: '',
      overspeed: false,
      cargoWeight: 0,
      engineSputter: false,
      windKts: 0,
      scoreDistance: 0,
      lastTouchdown: null,
    };
    this.controls = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: 0,
      gearDown: true,
      flaps: 1,
      brakes: false,
    };
    this.lastTouchdown = null;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
    this.liftMagnitude = 0;
    this.touchdownCooldown = 0;
    this.airborneTime = 0;
  }

  reset(options = {}) {
    const x = options.x ?? -360;
    const z = options.z ?? 0;
    const heading = options.heading ?? 90;
    const airport = airportAt(x, z);
    const surface = airport ? airport.elevation : surfaceHeightAt(x, z);
    this.state.position.set(x, surface + GEAR_HEIGHT, z);
    this.state.velocity.set(0, 0, 0);
    this.state.quaternion.copy(quaternionFromHeading(heading));
    this.state.heading = heading;
    this.state.pitchDeg = 0;
    this.state.bankDeg = 0;
    this.state.throttle = options.throttle ?? 0;
    this.state.fuel = options.fuel ?? 100;
    this.state.damage = options.damage ?? 0;
    this.state.gearDown = options.gearDown ?? true;
    this.state.flaps = options.flaps ?? 1;
    this.state.rpm = options.rpm ?? 600;
    this.state.onGround = true;
    this.state.crashed = false;
    this.state.crashReason = '';
    this.state.lastTouchdown = null;
    this.state.cargoWeight = options.cargoWeight ?? 0;
    this.state.iasKts = 0;
    this.state.altFt = 0;
    this.state.vsFpm = 0;
    this.state.stalled = false;
    this.state.stallWarning = false;
    this.state.gLoad = 1;
    this.controls.pitch = 0;
    this.controls.roll = 0;
    this.controls.yaw = 0;
    this.controls.throttle = this.state.throttle;
    this.controls.gearDown = this.state.gearDown;
    this.controls.flaps = this.state.flaps;
    this.controls.brakes = false;
    this.lastTouchdown = null;
    this.airborneTime = 0;
    this.touchdownCooldown = 0;
    this.updateOrientationVectors();
    this.updateMetrics(surface);
  }

  setControl(name, value) {
    if (name === 'throttle') {
      this.controls.throttle = clamp(value, 0, 1);
      this.state.throttle = this.controls.throttle;
      return;
    }
    if (name === 'gearDown') {
      this.controls.gearDown = Boolean(value);
      this.state.gearDown = Boolean(value);
      return;
    }
    if (name === 'flaps') {
      this.controls.flaps = clamp(Math.round(value), 0, 2);
      this.state.flaps = this.controls.flaps;
      return;
    }
    if (name === 'brakes') {
      this.controls.brakes = Boolean(value);
      return;
    }
    if (name in this.controls) this.controls[name] = clamp(value, -1, 1);
  }

  toggleGear() {
    if (this.state.onGround) return false;
    this.state.gearDown = !this.state.gearDown;
    this.controls.gearDown = this.state.gearDown;
    return true;
  }

  cycleFlaps() {
    this.state.flaps = (this.state.flaps + 1) % 3;
    this.controls.flaps = this.state.flaps;
    return this.state.flaps;
  }

  // Stage a physically consistent airborne state. Used by deterministic screenshots and QA.
  setAirborneState(options) {
    const surface = referenceSurfaceAt(options.x, options.z);
    const altitude = (options.altFt ?? 500) / 3.28084;
    const heading = options.heading ?? 90;
    const pitch = options.pitchDeg ?? 4;
    const bank = options.bankDeg ?? 0;
    this.state.position.set(options.x, surface + GEAR_HEIGHT + altitude, options.z);
    this.state.quaternion.copy(quaternionFromHeading(heading, (pitch * Math.PI) / 180, (bank * Math.PI) / 180));
    const speed = (options.speedKts ?? 110) / 1.94384;
    const direction = new THREE.Vector3(
      Math.sin((heading * Math.PI) / 180),
      0,
      -Math.cos((heading * Math.PI) / 180),
    );
    this.state.velocity.copy(direction.multiplyScalar(speed));
    this.state.velocity.y = (options.verticalSpeedFpm ?? 0) / 196.85;
    this.state.onGround = false;
    this.state.crashed = false;
    this.state.crashReason = '';
    this.state.fuel = options.fuel ?? this.state.fuel;
    this.state.damage = options.damage ?? this.state.damage;
    this.state.gearDown = options.gearDown ?? true;
    this.state.flaps = options.flaps ?? 0;
    this.state.throttle = options.throttle ?? 0.5;
    this.state.cargoWeight = options.cargoWeight ?? 0;
    this.controls = {
      pitch: 0,
      roll: 0,
      yaw: 0,
      throttle: this.state.throttle,
      gearDown: this.state.gearDown,
      flaps: this.state.flaps,
      brakes: false,
    };
    this.airborneTime = 0;
    this.lastTouchdown = null;
    this.updateOrientationVectors();
    this.state.iasKts = this.state.velocity.length() * 1.94384;
    this.state.altFt = altitude * 3.28084;
    this.state.aglFt = this.state.altFt;
    this.state.vsFpm = this.state.velocity.y * 196.85;
  }

  setPose(position, quaternion, velocity) {
    this.state.position.copy(position);
    this.state.quaternion.copy(quaternion);
    this.state.velocity.copy(velocity);
    this.state.onGround = false;
    this.state.crashed = false;
    this.state.crashReason = '';
    this.state.lastTouchdown = null;
    this.updateOrientationVectors();
  }

  updateOrientationVectors() {
    this.forward.copy(FORWARD).applyQuaternion(this.state.quaternion);
    this.up.copy(UP).applyQuaternion(this.state.quaternion);
    this.right.copy(RIGHT).applyQuaternion(this.state.quaternion);
  }

  applyLocalRotation(axis, radians) {
    tempQuat.setFromAxisAngle(axis, radians);
    this.state.quaternion.multiply(tempQuat).normalize();
  }

  update(dt, environment = {}) {
    if (this.state.crashed) {
      this.state.velocity.multiplyScalar(Math.exp(-2.5 * dt));
      this.state.position.addScaledVector(this.state.velocity, dt);
      this.updateOrientationVectors();
      this.updateMetrics(surfaceHeightAt(this.state.position.x, this.state.position.z));
      return;
    }
    this.time += dt;
    this.touchdownCooldown = Math.max(0, this.touchdownCooldown - dt);
    this.state.throttle = damp(this.state.throttle, this.controls.throttle, 8, dt);

    const state = this.state;
    const controls = this.controls;
    const fuelAvailable = state.fuel > 0.02;
    const effectiveMass = FLIGHT.mass + state.cargoWeight;
    this.updateOrientationVectors();

    let speed = state.velocity.length();
    if (speed < 0.25) speed = 0;
    const authority = clamp(speed / 38, 0.18, 1.3);
    const onGround = state.onGround;
    const stall = !onGround && (speed < FLIGHT.stallSpeed + 3.5 || this.angleOfAttack() > 0.33);
    state.stalled = stall;
    state.stallWarning = !onGround && (speed < FLIGHT.stallSpeed + 8 || this.angleOfAttack() > 0.28);

    // Pilot controls rotate the airframe; the same rates read back as pitch, bank and heading.
    const pitchAuthority = onGround ? clamp((speed - 8) / 22, 0.1, 0.75) : authority;
    const rollAuthority = onGround ? 0 : authority;
    const yawAuthority = onGround ? clamp(0.25 + speed / 26, 0.25, 1.2) : clamp(speed / 42, 0.25, 1.05);
    const stallBuffet = stall ? Math.sin(this.time * 22.5) * 0.055 : 0;
    this.applyLocalRotation(tempAxis.copy(RIGHT), (controls.pitch * 1.05 * pitchAuthority + stallBuffet - (stall ? 0.18 : 0)) * dt);
    this.applyLocalRotation(tempAxis.copy(FORWARD), (controls.roll * 1.95 * rollAuthority) * dt);
    this.applyLocalRotation(tempAxis.copy(UP), (controls.yaw * 0.62 * yawAuthority + Math.sin(this.time * 0.8) * 0.0006) * dt);

    // Turbulence buffets the airframe in the storm.
    const turbulence = environment.turbulence ?? 0;
    if (turbulence > 0 && !onGround) {
      const t = this.time;
      const gustPitch = (Math.sin(t * 3.1) + Math.sin(t * 7.7 + 1.2)) * 0.22 * turbulence;
      const gustRoll = (Math.sin(t * 2.6 + 0.7) + Math.sin(t * 9.1)) * 0.3 * turbulence;
      this.applyLocalRotation(tempAxis.copy(RIGHT), gustPitch * dt);
      this.applyLocalRotation(tempAxis.copy(FORWARD), gustRoll * dt);
    }

    // On the ground the aircraft settles toward a level attitude when the stick is released.
    if (onGround) {
      this.updateOrientationVectors();
      if (Math.abs(controls.pitch) < 0.08) {
        const pitchAngle = Math.asin(clamp(this.forward.y, -1, 1));
        this.applyLocalRotation(tempAxis.copy(RIGHT), -pitchAngle * 3.4 * dt);
      }
      const bankAngle = Math.atan2(this.right.y, Math.max(0.05, this.up.y));
      this.applyLocalRotation(tempAxis.copy(FORWARD), -bankAngle * 2.8 * dt);
      if (Math.abs(controls.roll) < 0.05) {
        const lateralBank = Math.atan2(this.right.y, this.up.y);
        this.applyLocalRotation(tempAxis.copy(FORWARD), -lateralBank * 2.1 * dt);
      }
    }
    this.updateOrientationVectors();

    // A banked wing describes a coordinated turn. The lift vector curves the flight path; the
    // airframe yaws with it at the standard rate so nose and velocity stay together.
    if (!onGround && speed > 8) {
      const bankNow = Math.atan2(-this.right.y, Math.max(0.05, this.up.y));
      const turnRate = (FLIGHT.gravity * Math.tan(clamp(bankNow, -1.25, 1.25))) / Math.max(18, speed);
      this.applyLocalRotation(tempAxis.copy(UP), -turnRate * dt);
    }
    this.updateOrientationVectors();

    // Engine.
    const engineEfficiency = (1 - state.damage * 0.0045) * (fuelAvailable ? 1 : 0);
    state.engineSputter = state.damage > 52 && fuelAvailable;
    const sputter = state.engineSputter ? 0.66 + 0.34 * Math.max(0, Math.sin(this.time * 13.3) * Math.sin(this.time * 4.1)) : 1;
    const thrust = state.throttle * FLIGHT.maxThrust * engineEfficiency * sputter;
    const targetRpm = fuelAvailable ? 650 + state.throttle * 1980 : 0;
    state.rpm = damp(state.rpm, targetRpm * sputter, 3.2, dt);
    const burn = FLIGHT.idleBurn + FLIGHT.fullBurn * state.throttle;
    state.fuel = Math.max(0, state.fuel - burn * dt);
    state.fuelMinutes = state.fuel / Math.max(0.001, burn * 60);

    const airport = airportAt(state.position.x, state.position.z);
    const surface = referenceSurfaceAt(state.position.x, state.position.z);
    const wheelY = state.position.y - GEAR_HEIGHT;
    state.altFt = Math.max(0, (wheelY - surface) * 3.28084);
    state.aglFt = state.altFt;
    const groundEffect = !onGround && state.altFt < 34 ? (1 - state.altFt / 34) * 0.14 : 0;
    const aoa = this.angleOfAttack();
    const flaps = state.flaps | 0;
    const flapLift = flaps * 0.085;
    let cl = 0.055 + 4.35 * aoa + flapLift + groundEffect;
    const criticalAoA = 0.295;
    if (aoa > criticalAoA) cl = 1.28 + flapLift - (aoa - criticalAoA) * 2.4;
    cl = clamp(cl, -0.15, 1.55);
    if (stall) cl = Math.min(cl, 0.74);
    const airspeed = Math.max(speed, 0.001);
    const q = 0.5 * 1.225 * airspeed * airspeed;
    this.liftMagnitude = onGround ? 0 : q * FLIGHT.wingArea * cl;
    const liftForce = this.liftMagnitude;
    tempForce.set(0, -FLIGHT.gravity * effectiveMass, 0);
    tempForce.addScaledVector(this.forward, thrust);
    // Lift acts along the airframe's up axis.
    tempForce.addScaledVector(this.up, liftForce);
    // Drag: parasite + induced + gear + flaps, opposed to relative motion.
    const inducedFactor = 0.052 * (1 - groundEffect * 2.1);
    const cd = 0.046 + cl * cl * inducedFactor + (state.gearDown ? FLIGHT.gearDrag : 0.002) + flaps * FLIGHT.flapDrag;
    const drag = q * FLIGHT.wingArea * cd;
    if (speed > 0.15) tempForce.addScaledVector(tempVec.copy(state.velocity).normalize(), -drag);
    // Wind drift and turbulence kick.
    const wind = environment.wind;
    if (wind) tempForce.addScaledVector(wind, 0.55 * effectiveMass / 100);
    if (!onGround && turbulence > 0) {
      tempForce.x += Math.sin(this.time * 2.3) * turbulence * 1500;
      tempForce.z += Math.cos(this.time * 1.9) * turbulence * 1500;
      tempForce.y += Math.sin(this.time * 4.7) * turbulence * 900;
    }

    if (!onGround) {
      const ax = tempForce.x / effectiveMass;
      const ay = tempForce.y / effectiveMass;
      const az = tempForce.z / effectiveMass;
      state.velocity.x += ax * dt;
      state.velocity.y += ay * dt;
      state.velocity.z += az * dt;
      state.gLoad = clamp((liftForce / (effectiveMass * FLIGHT.gravity)) * (this.up.y || 1), 0.05, 9);
      state.position.addScaledVector(state.velocity, dt);
      this.airborneTime += dt;
    } else {
      // Ground roll: thrust along the runway, rolling friction and brakes.
      this.updateOrientationVectors();
      const groundDirection = tempVec.set(this.forward.x, 0, this.forward.z);
      if (groundDirection.lengthSq() < 0.01) groundDirection.set(0, 0, -1);
      groundDirection.normalize();
      const along = state.velocity.dot(groundDirection);
      let groundSpeed = along;
      const rollingFriction = FLIGHT.surfaceFriction * 12.5;
      const brakeFriction = controls.brakes ? FLIGHT.brakeFriction * 55 : 0;
      const directionSign = Math.sign(groundSpeed) || 0;
      const groundDrag = q * FLIGHT.wingArea * 0.06 + directionSign * rollingFriction + directionSign * brakeFriction;
      groundSpeed += ((thrust - groundDrag) / effectiveMass) * dt;
      if (state.throttle < 0.02 && Math.abs(groundSpeed) < 1.2) groundSpeed = 0;
      state.velocity.set(groundDirection.x * groundSpeed, 0, groundDirection.z * groundSpeed);
      if (Math.abs(groundSpeed) > FLIGHT.rotateSpeed && thrust > FLIGHT.maxThrust * 0.35) {
        state.velocity.y = Math.max(state.velocity.y, 0.65);
        state.onGround = false;
        state.position.y += 0.02;
      } else {
        state.position.y = surface + GEAR_HEIGHT;
        state.velocity.y = 0;
      }
      this.airborneTime = 0;
    }

    // Water and terrain collision.
    this.updateOrientationVectors();
    const postSurface = surfaceHeightAt(state.position.x, state.position.z);
    const postReference = referenceSurfaceAt(state.position.x, state.position.z);
    const postGround = airportAt(state.position.x, state.position.z);
    const undercarriage = state.position.y - GEAR_HEIGHT;
    if (postSurface < 0.35) {
      if (undercarriage < 0.4) this.crash('ditch', 'Seawater impact');
    } else if (undercarriage <= postSurface + 0.06) {
      if (!postGround) {
        this.crash('terrain', 'Terrain impact outside the airstrip');
      } else if (!state.onGround) {
        this.touchdown(postGround, state.velocity.y, postSurface);
      }
    }
    if (state.position.y > 4300) {
      state.position.y = 4300;
      state.velocity.y = Math.min(0, state.velocity.y);
    }
    const half = 5200;
    if (Math.abs(state.position.x) > half || Math.abs(state.position.z) > half) {
      state.position.x = clamp(state.position.x, -half, half);
      state.position.z = clamp(state.position.z, -half, half);
      state.velocity.multiplyScalar(0.4);
    }
    state.overspeed = state.iasKts > 186;
    if (state.overspeed) this.addDamage(9 * dt, 'overspeed');
    this.updateOrientationVectors();
    state.heading = headingFromDirection(this.forward.x, this.forward.z);
    state.pitchDeg = degrees(Math.asin(clamp(this.forward.y, -1, 1)));
    state.bankDeg = degrees(Math.atan2(-this.right.y, Math.max(0.05, this.up.y)));
    state.iasKts = state.velocity.length() * 1.94384;
    state.altFt = Math.max(0, (state.position.y - GEAR_HEIGHT - postReference) * 3.28084);
    state.aglFt = state.altFt;
    state.vsFpm = state.velocity.y * 196.85;
    state.windKts = environment.wind ? environment.wind.length() * 1.94384 : 0;
  }

  angleOfAttack() {
    const inv = tempQuat.copy(this.state.quaternion).invert();
    tempLocalVelocity.copy(this.state.velocity).applyQuaternion(inv);
    const forwardComponent = -tempLocalVelocity.z;
    const verticalComponent = -tempLocalVelocity.y;
    if (Math.abs(forwardComponent) < 0.2) return 0;
    return Math.atan2(verticalComponent, Math.max(0.2, Math.abs(forwardComponent)));
  }

  updateMetrics(surface) {
    const state = this.state;
    this.updateOrientationVectors();
    state.heading = headingFromDirection(this.forward.x, this.forward.z);
    state.pitchDeg = degrees(Math.asin(clamp(this.forward.y, -1, 1)));
    state.bankDeg = degrees(Math.atan2(-this.right.y, Math.max(0.05, this.up.y)));
    state.iasKts = state.velocity.length() * 1.94384;
    state.altFt = Math.max(0, (state.position.y - GEAR_HEIGHT - surface) * 3.28084);
    state.aglFt = state.altFt;
    state.vsFpm = state.velocity.y * 196.85;
    const burn = FLIGHT.idleBurn + FLIGHT.fullBurn * state.throttle;
    state.fuelMinutes = state.fuel / Math.max(0.001, burn * 60);
  }

  touchdown(airport, verticalSpeed, surface) {
    const state = this.state;
    if (this.touchdownCooldown > 0) {
      state.position.y = surface + GEAR_HEIGHT;
      state.velocity.y = 0;
      state.onGround = true;
      return;
    }
    const sinkRate = Math.max(0, -verticalSpeed);
    const bank = Math.abs(state.bankDeg);
    const centerline = Math.abs(state.position.z - airport.centerZ);
    const headingError = Math.abs(((state.heading - airport.heading + 540) % 360) - 180);
    const gearPenalty = state.gearDown ? 0 : 1;
    const data = {
      verticalSpeed: sinkRate,
      bank,
      centerline,
      headingError,
      runway: airport.name,
      runwayHeading: airport.heading,
      smoothness: clamp(1 - sinkRate / 5.5, 0, 1),
      at: this.time,
      gearDown: state.gearDown,
    };
    state.lastTouchdown = data;
    this.lastTouchdown = data;
    state.position.y = surface + GEAR_HEIGHT;
    state.velocity.y = 0;
    state.onGround = true;
    this.touchdownCooldown = 0.8;
    if (!state.gearDown) {
      state.damage = clamp(state.damage + 58 + sinkRate * 7, 0, 100);
      this.crash('belly', 'Gear-up landing');
      return;
    }
    if (sinkRate > 7.4 || bank > 16 || headingError > 55) {
      this.crash('hard-landing', sinkRate > 7.4 ? 'Hard landing' : 'Loss of control on touchdown');
      return;
    }
    if (sinkRate > 2.3) {
      state.damage = clamp(state.damage + (sinkRate - 2.3) * 10.5 + centerline * 0.22, 0, 100);
      if (state.damage >= 100) this.crash('landing-damage', 'Airframe destroyed on landing');
    }
  }

  crash(kind, reason) {
    if (this.state.crashed) return;
    this.state.crashed = true;
    this.state.crashReason = reason;
    this.state.damage = 100;
    this.state.stalled = false;
    this.state.velocity.multiplyScalar(0.06);
    this.state.onGround = true;
    this.state.lastTouchdown = null;
  }

  addDamage(amount) {
    this.state.damage = clamp(this.state.damage + amount, 0, 100);
    if (this.state.damage >= 100) this.crash('damage', 'Airframe failure');
  }

  getSurfaceHeight() {
    return surfaceHeightAt(this.state.position.x, this.state.position.z);
  }

  getAirport() {
    return airportAt(this.state.position.x, this.state.position.z);
  }

  snapshot() {
    const s = this.state;
    return {
      x: s.position.x,
      y: s.position.y,
      z: s.position.z,
      heading: s.heading,
      iasKts: s.iasKts,
      altFt: s.altFt,
      vsFpm: s.vsFpm,
      throttle: s.throttle,
      fuel: s.fuel,
      damage: s.damage,
      gearDown: s.gearDown,
      flaps: s.flaps,
      rpm: s.rpm,
      stalled: s.stalled,
      onGround: s.onGround,
      crashed: s.crashed,
      crashReason: s.crashReason,
      bankDeg: s.bankDeg,
      pitchDeg: s.pitchDeg,
      gLoad: s.gLoad,
      lastTouchdown: this.lastTouchdown,
    };
  }
}

export { GEAR_HEIGHT, quaternionFromHeading };
