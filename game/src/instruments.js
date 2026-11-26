// The Kestrel's cockpit panel. One 1280 x 238 canvas, drawn every frame from real flight state:
// attitude, airspeed, altimeter, VSI, turn coordinator, compass, RPM, fuel, trim, radios and yoke.

import { clamp, formatClock, wrapHeading } from './math-utils.js';

const INK = '#1c2526';
const CREAM = '#f0e5cc';
const PAPER = '#e7dcc3';
const TEAL = '#177a7e';
const CORAL = '#d95b3b';
const MUSTARD = '#d9a441';
const AMBER = '#ffcf82';
const BEZEL = '#101819';
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
const SANS = '"Segoe UI", system-ui, sans-serif';

function pathRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function bezel(ctx, cx, cy, r) {
  const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
  gradient.addColorStop(0, '#3d4744');
  gradient.addColorStop(0.72, '#202a29');
  gradient.addColorStop(1, '#0b1112');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#758075';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
  ctx.stroke();
  const face = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.34, 2, cx, cy, r);
  face.addColorStop(0, '#f6ecd6');
  face.addColorStop(1, '#d9cbb0');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,37,38,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.stroke();
}

function label(ctx, text, x, y, options = {}) {
  ctx.save();
  ctx.fillStyle = options.color ?? INK;
  ctx.font = `${options.weight ?? 600} ${options.size ?? 11}px ${options.mono ? MONO : SANS}`;
  ctx.textAlign = options.align ?? 'center';
  ctx.textBaseline = options.baseline ?? 'middle';
  ctx.letterSpacing = options.spacing ?? '1px';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function dialTicks(ctx, cx, cy, r, fromDeg, toDeg, count, majorEvery = 1) {
  ctx.save();
  ctx.strokeStyle = 'rgba(28,37,38,0.78)';
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const angle = ((fromDeg + (toDeg - fromDeg) * t) * Math.PI) / 180;
    const major = i % majorEvery === 0;
    const inner = r - (major ? 12 : 7);
    ctx.lineWidth = major ? 1.7 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * (r - 3), cy + Math.sin(angle) * (r - 3));
    ctx.stroke();
  }
  ctx.restore();
}

function needle(ctx, cx, cy, angleDeg, length, width = 2.3, color = INK) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-length * 0.18, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, width + 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function digital(ctx, text, cx, cy, size = 17, color = INK) {
  ctx.save();
  ctx.fillStyle = '#202a27';
  pathRoundRect(ctx, cx - 27, cy - 10, 54, 19, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,215,156,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color === INK ? '#f6dda4' : color;
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

function drawAttitude(ctx, state) {
  const x = 214;
  const y = 24;
  const w = 226;
  const h = 138;
  ctx.save();
  pathRoundRect(ctx, x, y, w, h, 7);
  ctx.fillStyle = BEZEL;
  ctx.fill();
  ctx.strokeStyle = '#7f897e';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  pathRoundRect(ctx, x + 8, y + 8, w - 16, h - 16, 5);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-clamp(state.bankDeg ?? 0, -60, 60) * Math.PI) / 180);
  const pitchShift = clamp(state.pitchDeg ?? 0, -35, 35) * 1.75;
  const sky = ctx.createLinearGradient(0, -h, 0, 0);
  sky.addColorStop(0, '#275f7c');
  sky.addColorStop(1, '#7cb5be');
  ctx.fillStyle = sky;
  ctx.fillRect(-w, -h * 2 + pitchShift, w * 2, h * 2);
  const ground = ctx.createLinearGradient(0, 0, 0, h);
  ground.addColorStop(0, '#7c8f58');
  ground.addColorStop(1, '#3f583d');
  ctx.fillStyle = ground;
  ctx.fillRect(-w, pitchShift, w * 2, h * 2);
  ctx.strokeStyle = '#fff3d5';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-w, pitchShift);
  ctx.lineTo(w, pitchShift);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,243,213,0.65)';
  ctx.lineWidth = 1;
  for (let p = -20; p <= 20; p += 5) {
    if (p === 0) continue;
    const py = pitchShift - p * 1.75;
    const half = p % 10 === 0 ? 32 : 17;
    ctx.beginPath();
    ctx.moveTo(-half, py);
    ctx.lineTo(half, py);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed amber aircraft reference.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.strokeStyle = '#ffd58a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-42, 0);
  ctx.lineTo(-16, 0);
  ctx.lineTo(-8, 9);
  ctx.moveTo(42, 0);
  ctx.lineTo(16, 0);
  ctx.lineTo(8, 9);
  ctx.stroke();
  ctx.fillStyle = '#ffd58a';
  ctx.beginPath();
  ctx.arc(0, 0, 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Bank scale.
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.strokeStyle = 'rgba(240,229,204,0.8)';
  ctx.lineWidth = 1.1;
  for (const angle of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const rad = ((angle - 90) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(Math.cos(rad) * 84, Math.sin(rad) * 84);
    ctx.lineTo(Math.cos(rad) * (Math.abs(angle) % 30 === 0 ? 72 : 78), Math.sin(rad) * (Math.abs(angle) % 30 === 0 ? 72 : 78));
    ctx.stroke();
  }
  const bankRad = (((state.bankDeg ?? 0) - 90) * Math.PI) / 180;
  ctx.fillStyle = CORAL;
  ctx.beginPath();
  ctx.moveTo(Math.cos(bankRad) * 63, Math.sin(bankRad) * 63);
  ctx.lineTo(Math.cos(bankRad - 0.06) * 73, Math.sin(bankRad - 0.06) * 73);
  ctx.lineTo(Math.cos(bankRad + 0.06) * 73, Math.sin(bankRad + 0.06) * 73);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  label(ctx, 'ATTITUDE', x + w / 2, y + h - 8, { size: 10, spacing: '1.6px', color: 'rgba(240,229,204,0.7)' });
  label(ctx, `${(state.pitchDeg ?? 0).toFixed(0)}° PITCH`, x + 34, y + 15, { size: 9, mono: true, color: 'rgba(240,229,204,0.75)' });
}

function drawAirspeed(ctx, state) {
  const cx = 511;
  const cy = 94;
  const r = 54;
  bezel(ctx, cx, cy, r);
  dialTicks(ctx, cx, cy, r, 135, 405, 40, 5);
  const speeds = [40, 60, 80, 100, 120, 140, 160, 180, 200];
  speeds.forEach((speed, i) => {
    const angle = ((135 + (270 * i) / (speeds.length - 1)) * Math.PI) / 180;
    label(ctx, String(speed), cx + Math.cos(angle) * (r - 24), cy + Math.sin(angle) * (r - 24), { size: 9, mono: true, color: INK });
  });
  const speed = clamp(state.iasKts ?? 0, 0, 200);
  needle(ctx, cx, cy, 135 + (270 * speed) / 200, r - 14, 2.6, INK);
  digital(ctx, `${Math.round(speed)}`, cx, cy + 22, 16);
  label(ctx, 'KNOTS', cx, cy + 38, { size: 8.5, spacing: '1.4px' });
  label(ctx, 'AIRSPEED', cx, 22, { size: 10, spacing: '1.8px' });
  if (state.stalled) label(ctx, 'STALL', cx, cy - 31, { size: 10, color: CORAL, weight: 800 });
}

function drawAltimeter(ctx, state) {
  const cx = 636;
  const cy = 94;
  const r = 54;
  bezel(ctx, cx, cy, r);
  dialTicks(ctx, cx, cy, r, 135, 405, 50, 5);
  for (let i = 0; i < 10; i += 1) {
    const angle = ((135 + (270 * i) / 10) * Math.PI) / 180;
    label(ctx, String(i), cx + Math.cos(angle) * (r - 22), cy + Math.sin(angle) * (r - 22), { size: 10, mono: true });
  }
  const alt = Math.max(0, state.altFt ?? 0);
  const angle = 135 + ((alt % 10000) / 10000) * 270;
  needle(ctx, cx, cy, angle, r - 13, 2.5, INK);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.fillStyle = CORAL;
  ctx.fillRect(r - 20, -1.8, 10, 3.6);
  ctx.restore();
  digital(ctx, `${Math.round(alt)}`, cx, cy + 24, 15);
  label(ctx, 'FEET', cx, cy + 39, { size: 8.5, spacing: '1.4px' });
  label(ctx, 'ALTIMETER', cx, 22, { size: 10, spacing: '1.7px' });
}

function drawVsi(ctx, state) {
  const cx = 742;
  const cy = 94;
  const r = 43;
  bezel(ctx, cx, cy, r);
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  for (let i = 0; i <= 8; i += 1) {
    const angle = ((120 + (300 * i) / 8) * Math.PI) / 180;
    const inner = i % 2 === 0 ? r - 15 : r - 8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * (r - 3), cy + Math.sin(angle) * (r - 3));
    ctx.stroke();
  }
  ctx.restore();
  const vs = clamp(state.vsFpm ?? 0, -2000, 2000);
  const vsAngle = ((120 + 150 - (vs / 2000) * 150 + 360) % 360) - 120;
  needle(ctx, cx, cy, vs < 0 ? 210 + (-vs / 2000) * 150 : 210 - (vs / 2000) * 150, r - 10, 2.2);
  void vsAngle;
  label(ctx, 'UP', cx, cy - 22, { size: 8 });
  label(ctx, 'DN', cx, cy + 25, { size: 8 });
  digital(ctx, `${Math.round(vs / 50) * 50}`, cx, cy + 12, 10);
  label(ctx, 'V/S FPM', cx, 28, { size: 9, spacing: '1.2px' });
}

function drawTurn(ctx, state) {
  const x = 795;
  const y = 52;
  const w = 104;
  const h = 88;
  ctx.save();
  pathRoundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = BEZEL;
  ctx.fill();
  ctx.strokeStyle = '#7f897e';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  pathRoundRect(ctx, x + 7, y + 7, w - 14, h - 14, 4);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x + w / 2, y + 35);
  ctx.rotate((clamp(state.bankDeg ?? 0, -45, 45) * Math.PI) / 180);
  ctx.fillStyle = '#3f5f5d';
  ctx.beginPath();
  ctx.moveTo(-38, 0);
  ctx.lineTo(0, -10);
  ctx.lineTo(38, 0);
  ctx.lineTo(38, 5);
  ctx.lineTo(0, -4);
  ctx.lineTo(-38, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = CREAM;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0.15, Math.PI - 0.15);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = '#e5dcc8';
  pathRoundRect(ctx, x + 18, y + 58, w - 36, 15, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,37,38,0.4)';
  ctx.stroke();
  const slip = clamp((state.bankDeg ?? 0) / 30, -1, 1) * 26;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(x + w / 2 + slip, y + 65.5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  label(ctx, 'TURN COORDINATOR', x + w / 2, y + h - 5, { size: 7.2, spacing: '0.4px' });
}

function drawCompass(ctx, state) {
  const cx = 955;
  const cy = 94;
  const r = 54;
  bezel(ctx, cx, cy, r);
  const heading = wrapHeading(state.heading ?? 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-heading * Math.PI) / 180);
  ctx.strokeStyle = 'rgba(28,37,38,0.75)';
  for (let i = 0; i < 36; i += 1) {
    const angle = (i / 36) * Math.PI * 2;
    const inner = i % 9 === 0 ? r - 19 : i % 3 === 0 ? r - 12 : r - 7;
    ctx.lineWidth = i % 9 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * (r - 2), Math.sin(angle) * (r - 2));
    ctx.stroke();
  }
  const cardinal = [
    ['N', 0],
    ['E', 90],
    ['S', 180],
    ['W', 270],
  ];
  for (const [text, deg] of cardinal) {
    const angle = ((deg - 90) * Math.PI) / 180;
    label(ctx, text, Math.cos(angle) * (r - 31), Math.sin(angle) * (r - 31), { size: 11, weight: 800, color: text === 'N' ? CORAL : INK });
  }
  ctx.restore();
  const targetBug = ((state.targetBearing ?? heading) - heading) * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(targetBug);
  ctx.fillStyle = MUSTARD;
  ctx.beginPath();
  ctx.moveTo(0, -r + 7);
  ctx.lineTo(-4, -r + 15);
  ctx.lineTo(4, -r + 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.lineTo(-14, -8);
  ctx.moveTo(4, 0);
  ctx.lineTo(14, -8);
  ctx.stroke();
  ctx.restore();
  digital(ctx, `${String(Math.round(heading)).padStart(3, '0')}°`, cx, cy + 27, 14);
  label(ctx, 'HEADING', cx, 22, { size: 10, spacing: '1.8px' });
}

function drawRpm(ctx, state) {
  const cx = 1080;
  const cy = 91;
  const r = 44;
  bezel(ctx, cx, cy, r);
  ctx.save();
  ctx.strokeStyle = 'rgba(28,37,38,0.75)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 30; i += 1) {
    const angle = ((140 + (260 * i) / 30) * Math.PI) / 180;
    const inner = i % 5 === 0 ? r - 12 : r - 7;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * (r - 2), cy + Math.sin(angle) * (r - 2));
    if (i === 25) ctx.strokeStyle = TEAL; else if (i > 27) ctx.strokeStyle = CORAL; else ctx.strokeStyle = 'rgba(28,37,38,0.7)';
    ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i <= 30; i += 5) {
    const angle = ((140 + (260 * i) / 30) * Math.PI) / 180;
    label(ctx, (i / 10).toFixed(0), cx + Math.cos(angle) * (r - 22), cy + Math.sin(angle) * (r - 22), { size: 8.5, mono: true });
  }
  const rpm = clamp(state.rpm ?? 0, 0, 3000);
  needle(ctx, cx, cy, 140 + (260 * rpm) / 3000, r - 12, 2.1);
  digital(ctx, `${Math.round(rpm / 10) * 10}`, cx, cy + 23, 10);
  label(ctx, 'RPM', cx, 23, { size: 9, spacing: '1.4px' });
}

function drawFuel(ctx, state) {
  const cx = 1190;
  const cy = 91;
  const r = 38;
  bezel(ctx, cx, cy, r);
  ctx.save();
  ctx.strokeStyle = 'rgba(28,37,38,0.8)';
  for (let i = 0; i <= 8; i += 1) {
    const angle = ((135 + (270 * i) / 8) * Math.PI) / 180;
    ctx.lineWidth = i % 2 === 0 ? 1.7 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * (r - 11), cy + Math.sin(angle) * (r - 11));
    ctx.lineTo(cx + Math.cos(angle) * (r - 2), cy + Math.sin(angle) * (r - 2));
    ctx.stroke();
  }
  ctx.restore();
  const fuel = clamp(state.fuel ?? 0, 0, 100);
  needle(ctx, cx, cy, 135 + (270 * fuel) / 100, r - 10, 2);
  label(ctx, 'E', cx - 24, cy + 16, { size: 8 });
  label(ctx, 'F', cx + 24, cy + 16, { size: 8 });
  digital(ctx, `${Math.round(fuel)}`, cx, cy + 16, 9);
  label(ctx, 'FUEL', cx, 29, { size: 8.5, spacing: '1.2px' });
  label(ctx, `${Math.round(state.fuelMinutes ?? 0)} MIN`, cx, 47, { size: 7.5, color: CORAL });
}

function drawTrim(ctx, state) {
  const x = 181;
  const y = 36;
  ctx.save();
  ctx.fillStyle = '#d9cdb3';
  pathRoundRect(ctx, x, y, 21, 122, 5);
  ctx.fill();
  ctx.strokeStyle = BEZEL;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = 'rgba(28,37,38,0.25)';
  pathRoundRect(ctx, x + 7, y + 12, 7, 96, 3);
  ctx.fill();
  const trim = clamp(state.trim ?? 0, -1, 1);
  const knobY = y + 60 - trim * 42;
  ctx.fillStyle = CORAL;
  pathRoundRect(ctx, x - 4, knobY - 5, 29, 10, 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `700 7px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText('T', x + 10, y + 9);
  ctx.fillText('R', x + 10, y + 119);
  ctx.restore();
  label(ctx, 'TRIM', x + 10, y + 132, { size: 7.5 });
}

function drawYoke(ctx) {
  ctx.save();
  // Column and wheel.
  ctx.strokeStyle = '#252d2b';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(87, 150);
  ctx.lineTo(87, 195);
  ctx.stroke();
  ctx.strokeStyle = '#d7cbb1';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.arc(87, 104, 48, Math.PI * 0.68, Math.PI * 2.32, false);
  ctx.stroke();
  ctx.strokeStyle = '#1b2322';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(87, 104, 48, Math.PI * 0.68, Math.PI * 2.32, false);
  ctx.stroke();
  ctx.fillStyle = '#c9bda4';
  pathRoundRect(ctx, 66, 103, 42, 42, 8);
  ctx.fill();
  ctx.strokeStyle = '#313a37';
  ctx.stroke();
  ctx.fillStyle = TEAL;
  ctx.beginPath();
  ctx.arc(87, 122, 5.5, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, 'KESTREL', 87, 137, { size: 6.5, color: '#36413d' });
  ctx.restore();
  label(ctx, 'CONTROL', 87, 32, { size: 8, spacing: '1.6px', color: 'rgba(240,229,204,0.7)' });
}

function drawRadioStack(ctx, state) {
  const x = 836;
  const y = 165;
  const w = 416;
  const h = 60;
  ctx.save();
  pathRoundRect(ctx, x, y, w, h, 4);
  ctx.fillStyle = '#0f1617';
  ctx.fill();
  ctx.strokeStyle = 'rgba(224,210,182,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const cells = [
    ['COM1', '118.30'],
    ['COM2', '121.90'],
    ['NAV1', '110.30'],
    ['XPDR', '4702'],
  ];
  cells.forEach(([key, value], i) => {
    const cx = x + 8 + i * 102;
    ctx.fillStyle = '#1c2727';
    pathRoundRect(ctx, cx, y + 7, 94, 28, 2);
    ctx.fill();
    label(ctx, key, cx + 8, y + 14, { size: 7.5, align: 'left', color: 'rgba(230,218,193,0.65)' });
    ctx.save();
    ctx.fillStyle = i === 3 ? '#d6b66c' : AMBER;
    ctx.font = `700 13px ${MONO}`;
    ctx.textAlign = 'right';
    ctx.fillText(value, cx + 87, y + 29);
    ctx.restore();
  });
  label(ctx, 'RADIO STACK · KESTREL TWO', x + 8, y + 47, { size: 8, align: 'left', spacing: '1.3px', color: 'rgba(230,218,193,0.6)' });
  const fuel = Math.round(state.fuel ?? 0);
  label(ctx, `FUEL ${fuel}%   OIL 62 PSI   VOLTS 13.8`, x + w - 12, y + 47, { size: 8, align: 'right', mono: true, color: 'rgba(230,218,193,0.7)' });
  ctx.restore();
}

export class InstrumentPanel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = canvas.width;
    this.height = canvas.height;
    this.time = 0;
  }

  drawPanelBase(ctx, state) {
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#2c3531');
    gradient.addColorStop(0.12, '#222b29');
    gradient.addColorStop(1, '#111818');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(255,220,160,0.055)';
    ctx.fillRect(0, 0, this.width, 46);
    ctx.strokeStyle = 'rgba(239,218,174,0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(this.width, 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 47);
    ctx.lineTo(this.width, 47);
    ctx.stroke();
    for (let x = 22; x < this.width; x += 64) {
      for (const y of [13, this.height - 13]) {
        ctx.fillStyle = '#4a5751';
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,202,190,0.35)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x - 1.2, y);
        ctx.lineTo(x + 1.2, y);
        ctx.stroke();
      }
    }
    // Warm instrument backlight glow.
    for (const [x, y, r] of [[325, 92, 130], [600, 98, 130], [956, 96, 115], [1082, 92, 80], [1192, 92, 66]]) {
      const lamp = ctx.createRadialGradient(x, y, 4, x, y, r);
      lamp.addColorStop(0, 'rgba(255,199,116,0.12)');
      lamp.addColorStop(1, 'rgba(255,185,90,0)');
      ctx.fillStyle = lamp;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    label(ctx, 'KESTREL K-2', 640, 18, { size: 11, weight: 800, spacing: '4px', color: 'rgba(242,231,208,0.7)' });
    label(ctx, 'KC-02  ·  CINDER REACH AIR SERVICE', 640, 32, { size: 7.5, spacing: '2px', color: 'rgba(242,231,208,0.4)' });
    ctx.restore();
    label(ctx, 'INSTRUMENT PANEL — DO NOT OBSCURE', 640, 229, { size: 7, spacing: '1.5px', color: 'rgba(242,231,208,0.25)' });
    const fuel = Math.round(state.fuel ?? 0);
    const mins = Math.round(state.fuelMinutes ?? 0);
    label(ctx, `ENDURANCE ${mins} MIN · FUEL ${fuel}%`, 616, 199, { size: 8, mono: true, color: 'rgba(242,231,208,0.55)' });
    label(ctx, `MISSION TIME ${formatClock(state.missionTime ?? 0)}`, 616, 213, { size: 8, mono: true, color: 'rgba(242,231,208,0.45)' });
  }

  render(state, active) {
    this.time += 1 / 60;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawPanelBase(ctx, state);
    drawAttitude(ctx, state);
    drawAirspeed(ctx, state);
    drawAltimeter(ctx, state);
    drawVsi(ctx, state);
    drawTurn(ctx, state);
    drawCompass(ctx, state);
    drawRpm(ctx, state);
    drawFuel(ctx, state);
    drawTrim(ctx, state);
    drawYoke(ctx);
    drawRadioStack(ctx, state);
    void active;
  }
}
