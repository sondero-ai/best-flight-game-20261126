// The four ways to fly the Cinder Reach. Pure data: starts, targets, ring gates and score tables
// that the mission manager and the world builder both read.

import { GULLWING_THRESHOLD_27 } from './terrain.js';

export const NARROWS_RINGS = [
  { x: 1000, z: 80, y: 78, dirX: 1, dirZ: -0.04 },
  { x: 1330, z: 62, y: 70, dirX: 1, dirZ: 0.08 },
  { x: 1660, z: 92, y: 66, dirX: 1, dirZ: 0.1 },
  { x: 1990, z: 118, y: 60, dirX: 1, dirZ: 0.04 },
  { x: 2320, z: 96, y: 55, dirX: 1, dirZ: -0.08 },
  { x: 2650, z: 64, y: 51, dirX: 1, dirZ: -0.12 },
];

export const CARGO_DROPS = [
  { x: 930, z: 430, label: 'HERON COVE', radio: 'Crate one away. Two still aboard.' },
  { x: 1400, z: -560, label: 'SALT SPIT', radio: 'Crate two away. One crate left.' },
  { x: 430, z: -1940, label: 'GULLWING APPROACH', radio: 'Last crate away. Gullwing, here we come.' },
];

export const MISSIONS = [
  {
    id: 'first-light',
    title: 'FIRST LIGHT RUN',
    kicker: 'CARGO DELIVERY',
    short: 'Three crates. One island chain. Deliver before the light goes.',
    description: 'Lift three crates from Cinder Cay, follow the coast beacons and set down at Gullwing Station. Cargo weight makes every climb a decision.',
    objective: 'Drop the three cargo crates, then land at Gullwing Station.',
    distanceNm: 13.3,
    estimate: '6 MIN',
    tone: 'coral',
    weather: 'golden',
    start: { x: -410, z: 0, heading: 90, fuel: 92, flaps: 1, gearDown: true, cargoWeight: 240 },
    cargo: CARGO_DROPS,
    destination: GULLWING_THRESHOLD_27,
    destinationRunway: '27',
    timeLimit: 480,
    reward: 400,
  },
  {
    id: 'narrows',
    title: 'THE NARROWS',
    kicker: 'RING RACE',
    short: 'Six coral gates through a volcanic canyon. Keep the wings level and the clock honest.',
    description: 'Thread six coral rings down the Narrows and out over Lantern Reef. Bronze, silver and gold times are posted; the canyon does not negotiate.',
    objective: 'Pass all six rings in order before the clock runs out.',
    distanceNm: 3.9,
    estimate: '90 SEC',
    tone: 'teal',
    weather: 'afternoon',
    start: { x: 760, z: 86, altFt: 340, heading: 90, speedKts: 128, fuel: 78, flaps: 0, gearDown: false, air: true },
    rings: NARROWS_RINGS,
    timeLimit: 90,
    medals: { gold: 38, silver: 50, bronze: 66 },
    reward: 500,
  },
  {
    id: 'lantern-watch',
    title: 'LANTERN WATCH',
    kicker: 'STORM RECON',
    short: 'Photograph the Lantern Reef beacon inside the storm wall, then bring the Kestrel home.',
    description: 'Climb north into the front, reach the lighthouse above Lantern Reef and hold the photo zone for eight seconds. Turbulence, rain and crosswind are part of the job.',
    objective: 'Hold in the beacon zone for 8 seconds, then return to Cinder Cay.',
    distanceNm: 18.0,
    estimate: '8 MIN',
    tone: 'ink',
    weather: 'storm',
    start: { x: -410, z: 0, heading: 90, fuel: 100, flaps: 1, gearDown: true, cargoWeight: 60 },
    photo: { x: 760, z: -3060, y: 46, radius: 260, hold: 8 },
    destination: { x: -450, y: 42, z: 0 },
    timeLimit: 600,
    reward: 450,
  },
  {
    id: 'free-flight',
    title: 'FREE FLIGHT',
    kicker: 'NO SCHEDULE',
    short: 'The whole archipelago is yours. Take the Kestrel up and see where the wind goes.',
    description: 'No timers, no cargo, no examiner. Fly the coast, practise landings at Cinder Cay and Gullwing Station, or go and find the storm.',
    objective: 'Explore the Cinder Reach at your own pace.',
    distanceNm: 0,
    estimate: 'OPEN',
    tone: 'mustard',
    weather: 'golden',
    start: { x: -410, z: 0, heading: 90, fuel: 100, flaps: 1, gearDown: true, cargoWeight: 0 },
    timeLimit: 0,
  },
];

export function missionById(id) {
  return MISSIONS.find((mission) => mission.id === id) ?? MISSIONS[0];
}
