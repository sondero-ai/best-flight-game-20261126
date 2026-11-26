// Session state above the airframe: current screen, radio log, camera choice, mute and the
// best scores saved between visits. Storage is best-effort and guarded.

import { FlightModel } from './flight-model.js';

const STORAGE_KEY = 'kestrel-courier-bests-v1';
const MEDAL_RANK = { none: 0, bronze: 1, silver: 2, gold: 3 };

function loadBests() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export class GameState {
  constructor() {
    this.mode = 'title';
    this.previousMode = 'title';
    this.missionId = null;
    this.flight = new FlightModel();
    this.radio = [];
    this.radioSequence = 0;
    this.muted = false;
    this.cameraMode = 'chase';
    this.showMap = false;
    this.results = null;
    this.mission = null;
    this.bests = loadBests();
    this.sessionStart = 0;
    this.pointer = { x: 640, y: 360, inside: false };
    this.hint = '';
    this.hintTimer = 0;
  }

  setMode(mode) {
    if (mode !== this.mode) this.previousMode = this.mode;
    this.mode = mode;
  }

  addRadio(text, source = 'CINDER TOWER', ttl = 8) {
    this.radio.push({
      id: ++this.radioSequence,
      source,
      text,
      age: 0,
      ttl,
    });
    if (this.radio.length > 6) this.radio.shift();
  }

  updateRadio(dt) {
    for (const message of this.radio) message.age += dt;
    this.radio = this.radio.filter((message) => message.age < message.ttl);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint = '';
    }
  }

  setHint(text, seconds = 3) {
    this.hint = text;
    this.hintTimer = seconds;
  }

  getBest(missionId) {
    return this.bests[missionId] ?? null;
  }

  recordBest(missionId, score, medal = null, detail = {}) {
    const previous = this.bests[missionId];
    const previousRank = MEDAL_RANK[previous?.medal ?? 'none'] ?? 0;
    const newRank = MEDAL_RANK[medal ?? 'none'] ?? 0;
    const better = !previous || score > (previous.score ?? 0) || newRank > previousRank;
    if (!better) return false;
    this.bests[missionId] = {
      score: Math.round(score),
      medal,
      time: detail.time ?? null,
      at: null,
    };
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.bests));
    } catch {
      // Private browsing or a blocked storage partition: bests simply last for the session.
    }
    return true;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}

export { STORAGE_KEY };
