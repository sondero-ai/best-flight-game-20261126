// The fixed 1280 x 720 HUD. Every number is written from the live flight state: tapes, systems,
// mission card, radio, target diamond, warning stack and the cockpit panel.

import * as THREE from '../vendor/three.module.min.js';
import { STAGE_HEIGHT, STAGE_WIDTH, CSS } from './config.js';
import { headingDelta, clamp, formatClock, wrapHeading } from './math-utils.js';
import { InstrumentPanel } from './instruments.js';
import { Minimap } from './minimap.js';

const MONO = CSS.mono;
const SANS = CSS.sans;
const PAPER = '#f4ebd9';
const INK = '#1c2526';
const CORAL = '#d65337';
const TEAL = '#177a7e';
const MUSTARD = '#b78725';

function setText(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function formatAlt(alt) {
  return alt >= 100 ? Math.round(alt / 10) * 10 : Math.max(0, Math.round(alt));
}

function formatDistance(nm) {
  if (!Number.isFinite(nm) || nm <= 0) return '—';
  return nm < 10 ? `${nm.toFixed(1)} NM` : `${Math.round(nm)} NM`;
}

function padHeading(value) {
  return String(Math.round(wrapHeading(value)) % 360).padStart(3, '0');
}

function panel(ctx, x, y, w, h, radius, fill = 'rgba(244,235,217,0.94)') {
  ctx.save();
  ctx.shadowColor = 'rgba(15,25,26,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(28,37,38,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,235,0.65)';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, Math.max(1, radius - 2));
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color ?? INK;
  ctx.font = `${options.weight ?? 600} ${options.size ?? 11}px ${options.mono ? MONO : SANS}`;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = options.baseline ?? 'middle';
  ctx.letterSpacing = options.spacing ?? '0px';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export class Hud {
  constructor(root) {
    this.root = root;
    this.root.innerHTML = `
      <div class="hud-radio paper-panel" id="radioLog">
        <div class="radio-head"><span class="radio-dot"></span><span>RADIO · CINDER TOWER</span><span class="radio-freq">118.30</span></div>
        <div class="radio-lines">
          <div class="radio-line"></div>
          <div class="radio-line"></div>
          <div class="radio-line"></div>
        </div>
      </div>
      <div class="hud-ident">
        <div class="ident-reg">KC-02</div>
        <div class="ident-meta"><span id="windReadout">WIND 240/04</span><span class="ident-sep">·</span><span id="hudClock">T+ 00:00</span></div>
      </div>
      <canvas class="heading-tape" id="headingTape" width="560" height="66"></canvas>
      <div class="tape speed-tape" id="speedTapeWrap">
        <canvas id="speedTape" width="164" height="316"></canvas>
      </div>
      <div class="tape alt-tape" id="altTapeWrap">
        <canvas id="altTape" width="164" height="316"></canvas>
      </div>
      <div class="systems-card paper-panel" id="systemsCard">
        <div class="systems-head"><span>SYSTEMS</span><span class="systems-state" id="systemsState">NORMAL</span></div>
        <div class="system-row">
          <span class="sys-label">THROTTLE</span>
          <span class="sys-bar throttle-bar"><i id="throttleFill"></i></span>
          <span class="sys-value mono" id="throttleValue">45%</span>
        </div>
        <div class="system-row">
          <span class="sys-label">FUEL</span>
          <span class="sys-bar fuel-bar"><i id="fuelFill"></i></span>
          <span class="sys-value mono" id="fuelValue">68% · 12M</span>
        </div>
        <div class="system-row damage-row">
          <span class="sys-label">AIRFRAME</span>
          <span class="damage-segments" id="damageSegments"></span>
          <span class="sys-value mono" id="damageValue">0%</span>
        </div>
        <div class="chip-row">
          <span class="chip" id="gearChip">GEAR DOWN</span>
          <span class="chip" id="flapsChip">FLAPS 1</span>
          <span class="chip" id="rpmChip">RPM 2140</span>
        </div>
      </div>
      <div class="mission-card paper-panel" id="missionCard">
        <div class="mission-top">
          <span class="mission-title" id="missionTitle">FIRST LIGHT RUN</span>
          <span class="mission-time mono" id="missionTime">00:00.0</span>
        </div>
        <div class="mission-stage" id="missionStage">DEPART — RWY 09 CINDER CAY</div>
        <div class="mission-objective" id="missionObjective">TAKE OFF — CLIMB EAST</div>
        <div class="mission-bottom">
          <span class="mission-pips" id="missionPips">CARGO 0/3</span>
          <span class="mission-target mono" id="missionTarget">1.2 NM · 072°</span>
        </div>
      </div>
      <div class="minimap-wrap paper-panel" id="minimapWrap">
        <canvas id="minimap" width="240" height="240"></canvas>
        <div class="minimap-caption"><span>NAV</span><span>4 NM</span></div>
      </div>
      <div class="warnings" id="warnings"></div>
      <div class="target-marker" id="targetMarker">
        <div class="target-diamond"></div>
        <div class="target-label"><strong id="targetDistance">1.2 NM</strong><span id="targetName">RWY 09</span></div>
      </div>
      <div class="flight-marker" id="flightMarker"><span></span></div>
      <div class="reticle">
        <div class="reticle-ring"></div>
        <div class="reticle-wing left"></div>
        <div class="reticle-wing right"></div>
        <div class="reticle-tail"></div>
      </div>
      <div class="hud-hint" id="hudHint"></div>
      <div class="cockpit-frame">
        <i class="pillar left"></i><i class="pillar right"></i><i class="sill"></i><i class="roof"></i>
      </div>
      <div class="instrument-wrap" id="instrumentWrap">
        <canvas id="cockpitPanel" width="1280" height="238"></canvas>
        <div class="panel-glass"></div>
      </div>
      <div class="map-overlay" id="mapOverlay">
        <div class="map-panel">
          <div class="map-head"><span>CINDER REACH — NAVIGATION</span><span>M TO CLOSE</span></div>
          <canvas id="fullMap" width="860" height="560"></canvas>
          <div class="map-foot"><span id="mapBest">BEST —</span><span id="mapMission">FREE FLIGHT</span></div>
        </div>
      </div>
    `;
    this.radio = [...root.querySelectorAll('.radio-line')];
    this.headingCanvas = root.querySelector('#headingTape');
    this.headingCtx = this.headingCanvas.getContext('2d');
    this.speedCanvas = root.querySelector('#speedTape');
    this.speedCtx = this.speedCanvas.getContext('2d');
    this.altCanvas = root.querySelector('#altTape');
    this.altCtx = this.altCanvas.getContext('2d');
    this.systems = {
      state: root.querySelector('#systemsState'),
      throttle: root.querySelector('#throttleFill'),
      throttleValue: root.querySelector('#throttleValue'),
      fuel: root.querySelector('#fuelFill'),
      fuelValue: root.querySelector('#fuelValue'),
      damage: root.querySelector('#damageSegments'),
      damageValue: root.querySelector('#damageValue'),
      gear: root.querySelector('#gearChip'),
      flaps: root.querySelector('#flapsChip'),
      rpm: root.querySelector('#rpmChip'),
    };
    this.damageSegments = [];
    for (let i = 0; i < 10; i += 1) {
      const segment = document.createElement('i');
      this.systems.damage.appendChild(segment);
      this.damageSegments.push(segment);
    }
    this.mission = {
      title: root.querySelector('#missionTitle'),
      time: root.querySelector('#missionTime'),
      stage: root.querySelector('#missionStage'),
      objective: root.querySelector('#missionObjective'),
      pips: root.querySelector('#missionPips'),
      target: root.querySelector('#missionTarget'),
    };
    this.wind = root.querySelector('#windReadout');
    this.clock = root.querySelector('#hudClock');
    this.targetMarker = root.querySelector('#targetMarker');
    this.targetDistance = root.querySelector('#targetDistance');
    this.targetName = root.querySelector('#targetName');
    this.flightMarker = root.querySelector('#flightMarker');
    this.warnings = root.querySelector('#warnings');
    this.hint = root.querySelector('#hudHint');
    this.minimap = new Minimap(root.querySelector('#minimap'));
    this.mapOverlay = root.querySelector('#mapOverlay');
    this.fullMap = root.querySelector('#fullMap');
    this.mapBest = root.querySelector('#mapBest');
    this.mapMission = root.querySelector('#mapMission');
    this.panel = new InstrumentPanel(root.querySelector('#cockpitPanel'));
    this.panelCanvas = root.querySelector('#cockpitPanel');
    this.instrumentWrap = root.querySelector('#instrumentWrap');
    this.gs = null;
    this.cockpit = false;
    this.mapOpen = false;
    this.time = 0;
    this.warningTimer = 0;
    this.lastWarningSignature = '';
    this.visible = false;
    this.root.classList.add('hud-hidden');
    this.temp = new THREE.Vector3();
    this.cameraSpace = new THREE.Vector3();
    this.cameraForward = new THREE.Vector3();
    this.cameraRight = new THREE.Vector3();
    this.cameraUp = new THREE.Vector3();
    this.setCockpit(false);
  }

  setGameState(gameState) {
    this.gs = gameState;
  }

  setVisible(visible) {
    this.visible = visible;
    this.root.classList.toggle('hud-hidden', !visible);
  }

  setCockpit(cockpit) {
    this.cockpit = cockpit;
    this.root.classList.toggle('cockpit-ui', cockpit);
    this.instrumentWrap.style.display = cockpit ? 'block' : 'none';
  }

  setMap(open) {
    this.mapOpen = open;
    this.mapOverlay.classList.toggle('open', open);
    this.mapOverlay.style.display = open ? 'flex' : 'none';
  }

  drawHeadingTape(state, active, dt) {
    const ctx = this.headingCtx;
    const w = this.headingCanvas.width;
    const h = this.headingCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.shadowColor = 'rgba(12,20,20,0.4)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(244,235,217,0.94)';
    ctx.beginPath();
    ctx.roundRect(0, 9, w, 50, 6);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(28,37,38,0.34)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 9.5, w - 1, 49);
    ctx.fillStyle = 'rgba(23,122,126,0.18)';
    ctx.fillRect(0, 9, w, 7);
    const heading = wrapHeading(state.heading ?? 0);
    const bearing = active?.bearing ?? heading;
    const pixelsPerDegree = 5.4;
    ctx.save();
    ctx.translate(w / 2, 48);
    for (let delta = -55; delta <= 55; delta += 5) {
      const absolute = Math.round(heading / 5) * 5 + delta;
      const x = (absolute - heading) * pixelsPerDegree;
      if (Math.abs(x) > w / 2 - 10) continue;
      const cardinal = ((absolute % 360) + 360) % 360;
      const major = cardinal % 10 === 0;
      ctx.strokeStyle = major ? 'rgba(28,37,38,0.8)' : 'rgba(28,37,38,0.45)';
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, major ? -10 : -5);
      ctx.stroke();
      if (major && Math.abs(x) > 66) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        label(ctx, names[cardinal] ?? String(cardinal).padStart(3, '0'), x, -19, {
          size: names[cardinal] ? 12 : 9,
          weight: names[cardinal] ? 800 : 600,
          mono: !names[cardinal],
          color: names[cardinal] === 'N' ? CORAL : 'rgba(28,37,38,0.62)',
        });
      }
    }
    const bearingDelta = headingDelta(heading, bearing) * pixelsPerDegree;
    if (Math.abs(bearingDelta) < w / 2 - 14) {
      ctx.fillStyle = MUSTARD;
      ctx.beginPath();
      ctx.moveTo(bearingDelta, -28);
      ctx.lineTo(bearingDelta - 5, -36);
      ctx.lineTo(bearingDelta + 5, -36);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    const boxWidth = 112;
    const boxX = w / 2 - boxWidth / 2;
    ctx.fillStyle = 'rgba(28,37,38,0.94)';
    ctx.beginPath();
    ctx.roundRect(boxX, 11, boxWidth, 32, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,195,0.45)';
    ctx.stroke();
    label(ctx, `${padHeading(heading)}°`, w / 2, 29, { size: 24, weight: 800, mono: true, color: PAPER });
    label(ctx, 'HDG', 14, 16, { size: 8, weight: 700, align: 'left', spacing: '1.5px', color: 'rgba(28,37,38,0.52)' });
    label(ctx, 'MAG', w - 14, 16, { size: 8, weight: 600, align: 'right', spacing: '1.5px', color: 'rgba(28,37,38,0.52)' });
    void dt;
  }

  drawSpeedTape(state) {
    const ctx = this.speedCtx;
    const w = this.speedCanvas.width;
    const h = this.speedCanvas.height;
    ctx.clearRect(0, 0, w, h);
    panel(ctx, 0, 0, w, h, 8);
    ctx.fillStyle = 'rgba(23,122,126,0.1)';
    ctx.fillRect(0, 0, w, 32);
    label(ctx, 'IAS', 12, 16, { size: 11, weight: 700, align: 'left', spacing: '1.5px', color: TEAL });
    label(ctx, 'KTS', w - 12, 16, { size: 9, weight: 600, align: 'right', color: 'rgba(28,37,38,0.55)' });
    const ias = clamp(state.iasKts ?? 0, 0, 220);
    const pixelsPerKt = 3.0;
    const centerY = 170;
    const top = 42;
    const bottom = h - 24;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, w, bottom - top);
    ctx.clip();
    for (let speed = 0; speed <= 220; speed += 5) {
      const y = centerY - (speed - ias) * pixelsPerKt;
      if (y < top - 8 || y > bottom + 8) continue;
      const major = speed % 20 === 0;
      ctx.strokeStyle = speed <= 55 ? 'rgba(214,83,55,0.65)' : major ? 'rgba(28,37,38,0.75)' : 'rgba(28,37,38,0.35)';
      ctx.lineWidth = major ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(w - 23, y);
      ctx.lineTo(w - (major ? 8 : 15), y);
      ctx.stroke();
      if (major) {
        label(ctx, String(speed), w - 29, y, { size: 15, mono: true, weight: 600, align: 'right', color: speed <= 55 ? CORAL : INK });
      }
    }
    const stallY = centerY - (55 - ias) * pixelsPerKt;
    if (stallY > top && stallY < bottom) {
      ctx.strokeStyle = 'rgba(214,83,55,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(10, stallY);
      ctx.lineTo(w - 8, stallY);
      ctx.stroke();
      label(ctx, 'STALL', 14, stallY - 10, { size: 8, weight: 800, align: 'left', color: CORAL });
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(28,37,38,0.94)';
    ctx.beginPath();
    ctx.roundRect(10, centerY - 31, w - 20, 56, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,222,165,0.55)';
    ctx.stroke();
    label(ctx, String(Math.round(ias)), w / 2 + 5, centerY - 5, { size: 38, weight: 800, mono: true, color: PAPER });
    label(ctx, 'KNOTS', w / 2, centerY + 16, { size: 8, weight: 600, spacing: '2px', color: 'rgba(246,238,220,0.65)' });
    ctx.fillStyle = MUSTARD;
    ctx.beginPath();
    ctx.moveTo(2, centerY);
    ctx.lineTo(9, centerY - 6);
    ctx.lineTo(9, centerY + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(28,37,38,0.45)';
    ctx.fillRect(0, bottom, w, 1);
  }

  drawAltTape(state) {
    const ctx = this.altCtx;
    const w = this.altCanvas.width;
    const h = this.altCanvas.height;
    ctx.clearRect(0, 0, w, h);
    panel(ctx, 0, 0, w, h, 8);
    ctx.fillStyle = 'rgba(23,122,126,0.1)';
    ctx.fillRect(0, 0, w, 32);
    label(ctx, 'ALT', 12, 16, { size: 11, weight: 700, align: 'left', spacing: '1.5px', color: TEAL });
    label(ctx, 'FT', w - 12, 16, { size: 9, weight: 600, align: 'right', color: 'rgba(28,37,38,0.55)' });
    const alt = Math.max(0, state.altFt ?? 0);
    const step = alt > 900 ? 200 : 100;
    const pixelsPerFt = alt > 900 ? 0.2 : 0.37;
    const centerY = 170;
    const top = 42;
    const bottom = h - 24;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, w, bottom - top);
    ctx.clip();
    const base = Math.floor(alt / step) * step;
    for (let value = base - step * 15; value <= base + step * 15; value += step) {
      if (value < 0) continue;
      const y = centerY - (value - alt) * pixelsPerFt;
      if (y < top - 8 || y > bottom + 8) continue;
      ctx.strokeStyle = 'rgba(28,37,38,0.7)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(24, y);
      ctx.stroke();
      label(ctx, String(value), 29, y, { size: 13, mono: true, weight: 600, align: 'left', color: INK });
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(28,37,38,0.94)';
    ctx.beginPath();
    ctx.roundRect(10, centerY - 31, w - 20, 56, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,222,165,0.55)';
    ctx.stroke();
    label(ctx, String(formatAlt(alt)), w / 2 + 5, centerY - 5, { size: 36, weight: 800, mono: true, color: PAPER });
    label(ctx, 'FEET', w / 2, centerY + 16, { size: 8, weight: 600, spacing: '2px', color: 'rgba(246,238,220,0.65)' });
    ctx.fillStyle = MUSTARD;
    ctx.beginPath();
    ctx.moveTo(w - 2, centerY);
    ctx.lineTo(w - 9, centerY - 6);
    ctx.lineTo(w - 9, centerY + 6);
    ctx.closePath();
    ctx.fill();
    // VSI needle on the inner edge.
    const vs = clamp(state.vsFpm ?? 0, -2000, 2000);
    const vsX = w - 15;
    const vsHeight = 102;
    const vsTop = 58;
    ctx.strokeStyle = 'rgba(28,37,38,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(vsX, vsTop);
    ctx.lineTo(vsX, vsTop + vsHeight);
    ctx.moveTo(vsX - 4, vsTop);
    ctx.lineTo(vsX + 4, vsTop);
    ctx.moveTo(vsX - 4, vsTop + vsHeight / 2);
    ctx.lineTo(vsX + 4, vsTop + vsHeight / 2);
    ctx.moveTo(vsX - 4, vsTop + vsHeight);
    ctx.lineTo(vsX + 4, vsTop + vsHeight);
    ctx.stroke();
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vsX - 5, vsTop + vsHeight / 2);
    ctx.lineTo(vsX + 5, vsTop + vsHeight / 2 - (vs / 2000) * (vsHeight / 2));
    ctx.stroke();
    label(ctx, 'VSI', vsX, vsTop - 8, { size: 8, weight: 700, color: 'rgba(28,37,38,0.55)' });
    ctx.fillStyle = 'rgba(28,37,38,0.45)';
    ctx.fillRect(0, bottom, w, 1);
  }

  updateSystems(state) {
    const s = this.systems;
    const throttle = clamp(state.throttle ?? 0, 0, 1);
    s.throttle.style.width = `${throttle * 100}%`;
    setText(s.throttleValue, `${Math.round(throttle * 100)}%`);
    const fuel = clamp(state.fuel ?? 0, 0, 100);
    s.fuel.style.width = `${fuel}%`;
    s.fuel.style.background = fuel < 14 ? CORAL : undefined;
    setText(s.fuelValue, `${Math.round(fuel)}% · ${Math.max(0, Math.round(state.fuelMinutes ?? 0))}M`);
    const damage = clamp(state.damage ?? 0, 0, 100);
    const filled = Math.ceil(damage / 10);
    this.damageSegments.forEach((segment, index) => {
      segment.classList.toggle('on', index < filled);
      segment.classList.toggle('heavy', index < filled && damage > 55);
    });
    setText(s.damageValue, `${Math.round(damage)}%`);
    setText(s.gear, state.gearDown ? 'GEAR DOWN' : 'GEAR UP');
    s.gear.classList.toggle('warning', false);
    setText(s.flaps, `FLAPS ${state.flaps ?? 0}`);
    setText(s.rpm, `RPM ${Math.round((state.rpm ?? 0) / 10) * 10}`);
    const stateText = state.crashed ? 'FAILED' : state.engineSputter ? 'SPUTTER' : state.stalled ? 'STALL' : damage > 40 ? 'CAUTION' : 'NORMAL';
    setText(s.state, stateText);
    s.state.classList.toggle('warning', stateText !== 'NORMAL');
  }

  updateMission(active, state) {
    const m = this.mission;
    if (!active) {
      setText(m.title, 'FREE FLIGHT');
      setText(m.stage, 'CINDER REACH');
      setText(m.objective, 'EXPLORE THE ISLANDS');
      setText(m.pips, 'NO SCHEDULE');
      setText(m.target, '—');
      setText(m.time, 'T+ 00:00');
      return;
    }
    setText(m.title, active.title ?? 'FREE FLIGHT');
    setText(m.stage, active.stage ?? '');
    setText(m.objective, active.objective ?? '');
    setText(m.pips, active.pips ?? '');
    const bearing = active.target ? active.bearing : state.heading;
    setText(m.target, active.target ? `${formatDistance(active.distanceNm)} · ${padHeading(bearing)}°` : '—');
    setText(m.time, active.clockRunning ? formatClock(active.elapsed ?? 0) : 'T+ 00:00');
  }

  updateRadio(radio) {
    const messages = radio.slice(-3);
    for (let i = 0; i < this.radio.length; i += 1) {
      const line = this.radio[i];
      const message = messages[i];
      line.classList.toggle('empty', !message);
      line.textContent = message ? message.text : '';
      line.classList.toggle('fresh', Boolean(message && message.age < 1.2));
    }
  }

  updateWarnings(state, active) {
    const warnings = [];
    if (state.crashed) warnings.push('AIRCRAFT LOST');
    else {
      if (state.stalled) warnings.push('STALL');
      if (state.altFt < 170 && state.vsFpm < -800 && !state.onGround) warnings.push('PULL UP');
      if (state.fuel < 14) warnings.push('FUEL LOW');
      if (state.damage > 55) warnings.push('DAMAGE');
      if (state.overspeed) warnings.push('OVERSPEED');
    }
    const signature = warnings.join('|');
    if (signature !== this.lastWarningSignature) {
      this.lastWarningSignature = signature;
      this.warnings.innerHTML = warnings.map((warning) => `<div class="warning">${warning}</div>`).join('');
    }
    if (warnings.length && active?.id === 'narrows' && state.altFt < 120) {
      // Low-level racing is expected; do not crowd it with a PULL UP unless descending rapidly.
    }
  }

  targetScreenPosition(state, active, camera) {
    if (!active?.target) return null;
    this.temp.copy(active.target);
    this.cameraSpace.copy(this.temp).applyMatrix4(camera.matrixWorldInverse);
    camera.getWorldDirection(this.cameraForward);
    this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const toTarget = new THREE.Vector3().subVectors(this.temp, camera.position).normalize();
    const behind = toTarget.dot(this.cameraForward) < 0.1;
    const p = this.temp.clone().project(camera);
    let x = (p.x * 0.5 + 0.5) * STAGE_WIDTH;
    let y = (-p.y * 0.5 + 0.5) * STAGE_HEIGHT;
    let offscreen = behind || x < 100 || x > STAGE_WIDTH - 90 || y < 92 || y > STAGE_HEIGHT - 225;
    if (behind) {
      const bearing = active.bearing ?? state.heading;
      const delta = (headingDelta(state.heading, bearing) * Math.PI) / 180;
      x = STAGE_WIDTH / 2 + Math.sin(delta) * 400;
      y = STAGE_HEIGHT / 2 - Math.cos(delta) * 280;
      offscreen = true;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, behind, offscreen };
  }

  updateTargetMarker(state, active, camera) {
    const marker = this.targetMarker;
    if (!active?.target) {
      marker.style.display = 'none';
      return;
    }
    marker.style.display = 'block';
    const position = this.targetScreenPosition(state, active, camera);
    if (!position) {
      marker.style.display = 'none';
      return;
    }
    const margin = 80;
    let x = clamp(position.x, margin, STAGE_WIDTH - margin);
    let y = clamp(position.y, 92, STAGE_HEIGHT - 230);
    const angle = Math.atan2(y - STAGE_HEIGHT / 2, x - STAGE_WIDTH / 2);
    const offscreen = position.offscreen;
    if (offscreen) {
      const radiusX = STAGE_WIDTH / 2 - 112;
      const radiusY = STAGE_HEIGHT / 2 - 162;
      x = STAGE_WIDTH / 2 + Math.cos(angle) * radiusX;
      y = STAGE_HEIGHT / 2 + Math.sin(angle) * radiusY;
    }
    marker.classList.toggle('offscreen', offscreen);
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.style.setProperty('--arrow-angle', `${angle}rad`);
    setText(this.targetDistance, formatDistance(active.distanceNm));
    setText(this.targetName, active.targetLabel ?? 'TARGET');
    this.updateFlightMarker(state, camera);
  }

  updateFlightMarker(state, camera) {
    if (state.velocity.lengthSq() < 4) {
      this.flightMarker.style.display = 'none';
      return;
    }
    const ahead = state.position.clone().addScaledVector(state.velocity.clone().normalize(), 420);
    const p = ahead.project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) {
      this.flightMarker.style.display = 'none';
      return;
    }
    this.flightMarker.style.display = 'block';
    this.flightMarker.style.left = `${(p.x * 0.5 + 0.5) * STAGE_WIDTH}px`;
    this.flightMarker.style.top = `${(-p.y * 0.5 + 0.5) * STAGE_HEIGHT}px`;
  }

  updateFullMap(state, active) {
    if (!this.mapOpen) return;
    this.minimap.renderFull(this.fullMap, state, active);
    setText(this.mapMission, active?.title ?? 'FREE FLIGHT');
    const best = this.gs?.getBest(active?.id);
    setText(this.mapBest, best ? `BEST ${best.score.toLocaleString('en-US')}${best.medal ? ` · ${best.medal.toUpperCase()}` : ''}` : 'BEST —');
  }

  update(dt, session) {
    if (!this.visible) return;
    this.time += dt;
    const { state, active, camera, gameState } = session;
    this.gs = gameState;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    this.drawHeadingTape(state, active, dt);
    this.drawSpeedTape(state);
    this.drawAltTape(state);
    this.updateSystems(state);
    this.updateMission(active, state);
    this.updateRadio(gameState?.radio ?? []);
    this.updateWarnings(state, active);
    this.updateTargetMarker(state, active, camera);
    setText(this.wind, `WIND ${String(240 + Math.round(Math.sin(this.time * 0.1) * 8)).padStart(3, '0')}/04`);
    setText(this.clock, active?.clockRunning ? `T+ ${formatClock(active.elapsed ?? 0)}` : 'STANDBY');
    this.minimap.render(state, active);
    if (this.cockpit) {
      this.panel.render(
        {
          ...state,
          missionTime: active?.elapsed ?? 0,
          targetBearing: active?.bearing ?? state.heading,
          trim: clamp((state.pitchDeg ?? 0) / 20, -1, 1),
        },
        active,
      );
    }
    this.updateFullMap(state, active);
    setText(this.hint, gameState?.hint ?? '');
    this.hint.style.opacity = gameState?.hint ? '1' : '0';
  }
}
