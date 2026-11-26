// Navigation display. The island silhouettes are sampled once from the same height field that
// builds the world; the route, rings, runways, photo zone and aircraft arrow are live.

import { WORLD } from './config.js';
import { AIRPORTS, heightAt } from './terrain.js';
import { clamp, headingFromDirection, wrapHeading } from './math-utils.js';

const MAP_SIZE = 240;
const CSS = {
  sea: [150, 194, 188],
  shelf: [188, 218, 208],
  sand: [230, 203, 159],
  land: [125, 155, 90],
  hill: [101, 128, 78],
  rock: [188, 167, 133],
  ink: '#1c2526',
  coral: '#e2603f',
  mustard: '#d9a441',
  paper: '#f4ebd9',
  teal: '#177a7e',
};

function sampleMapPixel(x, z) {
  const h = heightAt(x, z);
  if (h < -12) return CSS.sea;
  if (h < 0.4) return CSS.shelf;
  if (h < 3.2) return CSS.sand;
  if (h < 95) return h > 55 ? CSS.hill : CSS.land;
  return CSS.rock;
}

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = canvas.width;
    this.map = null;
    this.lastRender = 0;
    this.buildMap();
  }

  buildMap() {
    const map = document.createElement('canvas');
    map.width = MAP_SIZE;
    map.height = MAP_SIZE;
    const ctx = map.getContext('2d');
    const image = ctx.createImageData(MAP_SIZE, MAP_SIZE);
    for (let py = 0; py < MAP_SIZE; py += 1) {
      for (let px = 0; px < MAP_SIZE; px += 1) {
        const x = -WORLD.size / 2 + (px / (MAP_SIZE - 1)) * WORLD.size;
        const z = -WORLD.size / 2 + (py / (MAP_SIZE - 1)) * WORLD.size;
        const color = sampleMapPixel(x, z);
        const index = (py * MAP_SIZE + px) * 4;
        image.data[index] = color[0];
        image.data[index + 1] = color[1];
        image.data[index + 2] = color[2];
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.map = map;
  }

  worldToMap(x, z) {
    return {
      x: ((x + WORLD.size / 2) / WORLD.size) * MAP_SIZE,
      y: ((z + WORLD.size / 2) / WORLD.size) * MAP_SIZE,
    };
  }

  drawAirports(ctx, state, range, centerX, centerZ, size) {
    for (const airport of Object.values(AIRPORTS)) {
      const dx = airport.centerX - centerX;
      const dz = airport.centerZ - centerZ;
      if (Math.abs(dx) > range * 1.2 || Math.abs(dz) > range * 1.2) continue;
      const x = size / 2 + (dx / range) * (size / 2);
      const y = size / 2 + (dz / range) * (size / 2);
      const angle = Math.atan2(
        (airport.thresholds[airport.heading === 90 ? 9 : 27].z - airport.centerZ) || 0,
        (airport.thresholds[airport.heading === 90 ? 9 : 27].x - airport.centerX) || 1,
      );
      const runwayLength = Math.max(10, (airport.length / range) * (size / 2));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = CSS.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-runwayLength / 2, 0);
      ctx.lineTo(runwayLength / 2, 0);
      ctx.stroke();
      ctx.strokeStyle = CSS.paper;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-runwayLength / 2, 0);
      ctx.lineTo(runwayLength / 2, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawRing(ctx, x, z, centerX, centerZ, range, size, active) {
    const dx = x - centerX;
    const dz = z - centerZ;
    if (Math.abs(dx) > range || Math.abs(dz) > range) return;
    const px = size / 2 + (dx / range) * (size / 2);
    const py = size / 2 + (dz / range) * (size / 2);
    ctx.strokeStyle = active ? CSS.coral : 'rgba(226,96,63,0.45)';
    ctx.lineWidth = active ? 2.3 : 1.3;
    ctx.beginPath();
    ctx.arc(px, py, active ? 4 : 3, 0, Math.PI * 2);
    ctx.stroke();
    if (active) {
      ctx.fillStyle = CSS.coral;
      ctx.beginPath();
      ctx.arc(px, py, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  render(state, active, force = false) {
    const now = performance.now();
    if (!force && now - this.lastRender < 90) return;
    this.lastRender = now;
    const ctx = this.ctx;
    const s = this.size;
    const center = s / 2;
    const radius = s / 2 - 5;
    const range = 1700;
    const cx = state.position.x;
    const cz = state.position.z;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#9bc8c1';
    ctx.fillRect(0, 0, s, s);
    const mapScale = s / (range * 2);
    const px = ((cx + WORLD.size / 2) / WORLD.size) * MAP_SIZE;
    const py = ((cz + WORLD.size / 2) / WORLD.size) * MAP_SIZE;
    const sw = (range * 2 * MAP_SIZE) / WORLD.size;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    try {
      ctx.drawImage(this.map, px - sw / 2, py - sw / 2, sw, sw, 0, 0, s, s);
    } catch {
      // The local window can extend beyond the world map at the edges; the base sea still shows.
    }
    ctx.restore();
    ctx.globalAlpha = 0.1;
    ctx.strokeStyle = CSS.ink;
    ctx.lineWidth = 0.7;
    for (let ring = 1; ring <= 2; ring += 1) {
      ctx.beginPath();
      ctx.arc(center, center, (radius / 3) * ring, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center, center + radius);
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.drawAirports(ctx, state, range, cx, cz, s);
    if (active?.def?.rings) {
      active.def.rings.forEach((ring, index) => this.drawRing(ctx, ring.x, ring.z, cx, cz, range, s, index === active.ringIndex));
    }
    if (active?.def?.cargo) {
      active.def.cargo.forEach((drop, index) => {
        const dx = drop.x - cx;
        const dz = drop.z - cz;
        if (Math.abs(dx) > range || Math.abs(dz) > range) return;
        const x = center + (dx / range) * center;
        const y = center + (dz / range) * center;
        ctx.fillStyle = index < (active.cargo ?? 0) ? 'rgba(246,238,220,0.45)' : CSS.mustard;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (active?.target) {
      const dx = active.target.x - cx;
      const dz = active.target.z - cz;
      const x = clamp(center + (dx / range) * center, 12, s - 12);
      const y = clamp(center + (dz / range) * center, 12, s - 12);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(217,164,65,0.95)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = CSS.coral;
      ctx.lineWidth = 2;
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
    }
    // Aircraft arrow, always at the centre.
    const heading = wrapHeading(state.heading ?? 0);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((heading * Math.PI) / 180);
    ctx.fillStyle = CSS.paper;
    ctx.strokeStyle = CSS.ink;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    // Bezel and north marker.
    ctx.save();
    ctx.strokeStyle = 'rgba(20,30,30,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CSS.paper;
    ctx.strokeStyle = CSS.ink;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(center, 12, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = CSS.ink;
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', center, 12.5);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = CSS.coral;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(center, 12, 4, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    void mapScale;
  }

  renderFull(canvas, state, active) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#102022';
    ctx.fillRect(0, 0, w, h);
    const pad = 36;
    const size = Math.min(w - pad * 2, h - pad * 2);
    const ox = (w - size) / 2;
    const oy = (h - size) / 2;
    ctx.drawImage(this.map, 0, 0, MAP_SIZE, MAP_SIZE, ox, oy, size, size);
    const range = WORLD.size / 2;
    const cx = 0;
    const cz = 0;
    const worldToCanvas = (x, z) => ({
      x: ox + ((x - cx + range) / (range * 2)) * size,
      y: oy + ((z - cz + range) / (range * 2)) * size,
    });
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = CSS.paper;
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i += 1) {
      const p = (i / 6) * size;
      ctx.beginPath();
      ctx.moveTo(ox + p, oy);
      ctx.lineTo(ox + p, oy + size);
      ctx.moveTo(ox, oy + p);
      ctx.lineTo(ox + size, oy + p);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const airport of Object.values(AIRPORTS)) {
      const p = worldToCanvas(airport.centerX, airport.centerZ);
      const angle = airport.heading === 90 ? 0 : Math.PI;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.strokeStyle = CSS.paper;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = CSS.paper;
      ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(airport.name.toUpperCase(), p.x + 15, p.y + 4);
    }
    if (active?.def?.rings) {
      active.def.rings.forEach((ring, index) => {
        const p = worldToCanvas(ring.x, ring.z);
        ctx.strokeStyle = index === active.ringIndex ? CSS.coral : 'rgba(226,96,63,0.55)';
        ctx.lineWidth = index === active.ringIndex ? 3 : 1.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, index === active.ringIndex ? 9 : 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = CSS.paper;
        ctx.font = '700 10px ui-monospace, Consolas, monospace';
        ctx.fillText(String(index + 1), p.x + 10, p.y - 7);
      });
    }
    const statePos = worldToCanvas(state.position.x, state.position.z);
    const heading = wrapHeading(state.heading ?? 0);
    ctx.save();
    ctx.translate(statePos.x, statePos.y);
    ctx.rotate((heading * Math.PI) / 180);
    ctx.fillStyle = CSS.mustard;
    ctx.strokeStyle = CSS.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(10, 12);
    ctx.lineTo(0, 6);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (active?.target) {
      const p = worldToCanvas(active.target.x, active.target.z);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = CSS.coral;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      ctx.strokeStyle = 'rgba(217,164,65,0.8)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(statePos.x, statePos.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Compass rose.
    ctx.save();
    ctx.translate(ox + size - 64, oy + 64);
    ctx.strokeStyle = 'rgba(244,235,217,0.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = CSS.paper;
    ctx.font = '700 16px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -24);
    ctx.beginPath();
    ctx.fillStyle = CSS.coral;
    ctx.moveTo(0, -33);
    ctx.lineTo(-5, -23);
    ctx.lineTo(5, -23);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(244,235,217,0.38)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, size, size);
    ctx.fillStyle = 'rgba(16,32,34,0.72)';
    ctx.fillRect(ox, oy + size - 34, size, 34);
    ctx.fillStyle = CSS.paper;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`CINDER REACH · ${active?.title ?? 'FREE FLIGHT'} · NORTH UP`, ox + 14, oy + size - 13);
    const bearing = active?.target ? headingFromDirection(active.target.x - state.position.x, active.target.z - state.position.z) : state.heading;
    ctx.textAlign = 'right';
    ctx.fillText(`HDG ${String(Math.round(wrapHeading(state.heading ?? 0))).padStart(3, '0')}°   TGT ${String(Math.round(bearing)).padStart(3, '0')}°`, ox + size - 14, oy + size - 13);
  }
}
