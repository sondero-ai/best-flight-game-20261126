# Kestrel Courier

[![make.fun best flight game](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun rank](https://make.fun/badge/best-flight-game-20261126-0057/sondero-ai/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![make.fun reward](https://make.fun/badge/best-flight-game-20261126-0057/sondero-ai/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

**Kestrel Courier: Skyward Isles** is a stylized island arcade flight game. You fly a cream-and-teal Kestrel K-2 bush plane out of Cinder Cay: lift three crates down the coast to Gullwing Station, thread six coral gates through the Narrows, or hold a photo orbit beside the Lantern Reef lighthouse while a storm closes in. Every sortie ends with a judged landing, and every crash ends with a reason and a retry.

Built for [make.fun's best flight game bounty](https://make.fun/bounty/best-flight-game-20261126-0057). No build step, no network calls at runtime, no external assets: the whole archipelago, aircraft, HUD, instruments and sounds are generated in the browser from local ES modules and the vendored three.js build.

## Features

- Arcade flight model with lift, drag, stall, ground effect, coordinated bank turns, flaps, gear, wheel brakes, wind, turbulence, fuel burn and airframe damage.
- Three hand-built missions plus free flight: **First Light Run** (cargo), **The Narrows** (six-ring race), **Lantern Watch** (storm photo and return) and **Free Flight**.
- Chase and cockpit cameras, a lit cockpit instrument panel, heading/speed/altitude tapes, mission card, radio, target diamond, warnings, circular navigation map and a title/select/pause/results flow.
- Landing scoring for smoothness, centreline, bank, heading and grease, with gold/silver/bronze medals and locally saved bests.
- Procedural Cinder Reach: Cinder Cay and its lagoon, the Narrows canyon and tidal channel, Lantern Reef, Gullwing Station, lighthouses, cargo ship and wake, palms, arches, waterfalls, buoys and a storm wall.
- Deterministic staged screenshot scenes (`?shot=cover`, `cockpit`, `rings`, `landing`) used by `tools/capture.mjs`.

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Pitch |
| `A` / `D` | Roll |
| `Q` / `E` | Rudder |
| `Shift` / `Ctrl` | Throttle up / down |
| Mouse wheel | Throttle trim |
| `G` | Landing gear |
| `F` | Flaps |
| `B` | Wheel brakes |
| `C` | Chase / cockpit camera |
| `M` | Navigation map |
| `R` | Restart sortie |
| `Esc` | Pause / resume |
| Right-drag | Look around |
| `Enter` | Confirm / retry |

Take off by releasing the brakes (`B`), opening the throttle with `Shift`, keeping straight with `Q`/`E`, then easing back above 55 knots. To land, gear down, flaps 2, cross the threshold at 70–75 knots and flare gently.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080>. Any static file server works; `game/index.html` is the entry point.

## Hand-in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` into the output directory, refuses symlinks or special files, checks the scorer caps, and writes `dossier.json` with the vendored `buildDossier`. Two runs write identical bytes.

## Tests and capture

```sh
node tools/smoke.mjs
node tools/capture.mjs
```

`tools/smoke.mjs` boots the game in headless Chrome, drives real keyboard events through the Chrome DevTools Protocol, checks fuel burn, the crash/results path and every `?shot=` scene, and fails on console errors or non-localhost requests. `tools/capture.mjs` serves the game, opens each staged scene, captures a 1280×720 JPEG under 256 KiB and rewrites `screenshots/`.

## Screenshots

1. `screenshots/1-cover.jpg` — final approach to Cinder Cay runway 09 at golden hour: Kestrel banked, gear and flaps down, PAPI and threshold lights ahead.
2. `screenshots/2-cockpit.jpg` — pilot-eye view in the Narrows, ring 2 of 6, full lit instrument panel, two coral rings and a waterfall.
3. `screenshots/3-rings.jpg` — chase view of ring 4 of 6, Kestrel banked hard over the tidal channel, cargo ship and wake below, arches and palms.
4. `screenshots/4-landing.jpg` — dusk flare at Gullwing Station runway 27, lighthouse beam and storm clouds, compact mission-complete card.

## Layout

- `game/index.html`, `game/styles.css` — page shell and HUD/screen styling.
- `game/src/config.js`, `terrain.js`, `ocean.js`, `sky.js`, `world-props.js` — world generation and set dressing.
- `game/src/aircraft.js`, `flight-model.js`, `camera-rig.js` — the Kestrel and how it flies.
- `game/src/hud.js`, `instruments.js`, `minimap.js`, `screens.js`, `input.js`, `audio-engine.js` — interface and feedback.
- `game/src/mission-catalog.js`, `missions.js`, `landing-score.js`, `game-state.js` — sortie rules and scoring.
- `game/src/shots.js`, `tools/capture.mjs` — deterministic screenshot staging.
- `main.ts`, `vendor/makefun-game.ts` — hand-in and dossier.

`vendor/makefun-game.ts` is the kit's file and is unchanged. The only third-party runtime file is `game/vendor/three.module.min.js` (official three.js 0.170.0).

Licensed under the MIT license in `LICENSE`.
