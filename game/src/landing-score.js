// Touchdown judging. Sink rate carries the most weight, then centreline, bank and heading, with
// a grease bonus for a genuinely smooth arrival.

import { clamp } from './math-utils.js';

export function scoreTouchdown(touchdown) {
  if (!touchdown) {
    return {
      rows: [],
      landingScore: 0,
      total: 0,
      grade: 'NO DATA',
      smooth: 0,
      centerline: 0,
      bank: 0,
      heading: 0,
    };
  }
  const sink = touchdown.verticalSpeed ?? 0;
  const bank = touchdown.bank ?? 0;
  const offset = touchdown.centerline ?? 0;
  const headingError = touchdown.headingError ?? 0;
  const smooth = Math.round((1 - clamp(sink / 4.6, 0, 1)) * 250);
  const centerline = Math.round((1 - clamp(offset / 15, 0, 1)) * 150);
  const bankScore = Math.round((1 - clamp(bank / 13, 0, 1)) * 80);
  const heading = Math.round((1 - clamp(headingError / 38, 0, 1)) * 60);
  let grease = 0;
  if (sink < 0.85 && bank < 1.5 && offset < 2.5) grease = 120;
  const landingScore = smooth + centerline + bankScore + heading + grease;
  const rows = [
    { label: sink < 1.7 ? 'SMOOTH LANDING' : 'FIRM LANDING', value: smooth + bankScore + heading },
    { label: `CENTRELINE ${offset.toFixed(1)} M`, value: centerline },
  ];
  if (grease) rows.push({ label: 'GREASE TRAP BONUS', value: grease });
  return {
    rows,
    landingScore,
    total: landingScore,
    grade: landingScore > 520 ? 'GREASED' : landingScore > 380 ? 'CLEAN' : landingScore > 230 ? 'ACCEPTABLE' : 'ROUGH',
    smooth,
    centerline,
    bank: bankScore,
    heading,
  };
}

export function formatScore(value) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

export function makeResult({ title, success, rows, total, medal, note }) {
  return {
    title,
    success,
    rows,
    total: Math.round(total),
    medal: medal ?? null,
    note: note ?? '',
  };
}
