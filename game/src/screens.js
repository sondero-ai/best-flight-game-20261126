// Title, sortie select, pause, results and the in-flight compact result card. Screens are DOM
// overlays aligned to the fixed stage; buttons and cards call back into the app controller.

import { MISSIONS } from './mission-catalog.js';
import { formatClock } from './math-utils.js';

const MEDAL_LABEL = { gold: 'GOLD', silver: 'SILVER', bronze: 'BRONZE' };

function medalMarkup(medal) {
  if (!medal) return '';
  return `<span class="medal-mark ${medal}"><span></span></span><span class="medal-text">${MEDAL_LABEL[medal] ?? medal.toUpperCase()}</span>`;
}

function bestMarkup(best) {
  if (!best) return '<span class="best-empty">NO RECORD</span>';
  const bestTime = best.time ? ` · ${formatClock(best.time)}` : '';
  return `${medalMarkup(best.medal)}<span class="best-score">${Number(best.score).toLocaleString('en-US')}</span><span class="best-time">${bestTime}</span>`;
}

export class Screens {
  constructor(root, callbacks = {}) {
    this.root = root;
    this.callbacks = callbacks;
    this.selectedIndex = 0;
    this.lastResult = null;
    this.compactResultData = null;
    this.root.innerHTML = `
      <section class="screen title-screen" id="screenTitle">
        <div class="title-wash"></div>
        <header class="screen-top title-top">
          <div class="brand-lockup"><span class="brand-wing"></span><span>CINDER REACH AIR SERVICE</span></div>
          <div class="top-actions">
            <button class="text-button" data-action="mute" id="titleMute">SOUND ON</button>
            <button class="text-button" data-action="controls">CONTROLS</button>
          </div>
        </header>
        <div class="title-copy">
          <div class="eyebrow"><span class="eyebrow-rule"></span>AN ISLAND FLIGHT STORY</div>
          <h1 class="game-title"><span>KESTREL</span><span class="title-courier">COURIER</span></h1>
          <div class="title-rule"><span></span><em>SKYWARD ISLES</em><span></span></div>
          <p class="title-pitch">Three crates over the coast. Six rings through the Narrows. One lighthouse inside the storm. The Kestrel K-2 is waiting on runway zero-nine.</p>
          <button class="cta-primary" data-action="enter-title"><span class="cta-key">ENTER</span><span class="cta-label">PRESS ENTER TO FLY</span><i></i></button>
          <div class="title-controls-line"><span>W/S PITCH</span><span>A/D ROLL</span><span>Q/E RUDDER</span><span>SHIFT THROTTLE</span><span>C CAMERA</span></div>
        </div>
        <div class="title-stamp">
          <div class="stamp-route"><span>CCY</span><i></i><span>GWS</span><i></i><span>LTR</span></div>
          <div class="stamp-caption">CINDER CAY · GULLWING · LANTERN REEF</div>
        </div>
        <footer class="screen-bottom title-bottom">
          <span>KESTREL K-2 · REG. KC-02 · BUSH CONFIGURATION</span>
          <span>AN ORIGINAL ARCADE FLIGHT GAME</span>
        </footer>
      </section>

      <section class="screen select-screen" id="screenSelect">
        <header class="screen-top select-top">
          <div class="brand-lockup"><span class="brand-wing"></span><span>CINDER REACH AIR SERVICE</span></div>
          <div class="top-actions">
            <button class="text-button" data-action="back-title">TITLE</button>
            <button class="text-button" data-action="mute" id="selectMute">SOUND ON</button>
            <button class="text-button" data-action="controls">CONTROLS</button>
          </div>
        </header>
        <div class="select-heading">
          <div>
            <div class="eyebrow"><span class="eyebrow-rule"></span>DISPATCH BOARD</div>
            <h2>CHOOSE YOUR SORTIE</h2>
          </div>
          <p>One aeroplane, four ways to fly. Every landing is judged; every storm is earned.</p>
        </div>
        <div class="mission-grid" id="missionGrid"></div>
        <footer class="screen-bottom select-bottom">
          <span>◀ ▶ SELECT · ENTER ACCEPT · M SOUND</span>
          <span id="selectBestLine">LOCAL RECORDS SAVED ON THIS MACHINE</span>
        </footer>
      </section>

      <section class="screen pause-screen" id="screenPause">
        <div class="pause-card">
          <div class="pause-top"><span class="eyebrow"><span class="eyebrow-rule"></span>FLIGHT SUSPENDED</span><span class="pause-reg">KC-02</span></div>
          <h2>PAUSED</h2>
          <div class="pause-rule"></div>
          <div class="controls-grid">
            <div><kbd>W</kbd><kbd>S</kbd><span>Pitch</span></div>
            <div><kbd>A</kbd><kbd>D</kbd><span>Roll</span></div>
            <div><kbd>Q</kbd><kbd>E</kbd><span>Rudder</span></div>
            <div><kbd>SHIFT</kbd><kbd>CTRL</kbd><span>Throttle</span></div>
            <div><kbd>G</kbd><span>Landing gear</span></div>
            <div><kbd>F</kbd><span>Flaps</span></div>
            <div><kbd>B</kbd><span>Wheel brakes</span></div>
            <div><kbd>C</kbd><span>Chase / cockpit</span></div>
            <div><kbd>M</kbd><span>Navigation map</span></div>
            <div><kbd>R</kbd><span>Restart sortie</span></div>
            <div><kbd>ESC</kbd><span>Resume flight</span></div>
            <div><kbd>WHEEL</kbd><span>Throttle trim</span></div>
          </div>
          <div class="pause-buttons">
            <button class="solid-button" data-action="resume">RESUME FLIGHT</button>
            <button class="line-button" data-action="restart">RESTART</button>
            <button class="line-button" data-action="quit">MISSION SELECT</button>
          </div>
          <p class="pause-note">Right-drag to look around. Use the wheel or Shift / Ctrl for throttle. The Kestrel stalls below 52 knots.</p>
        </div>
      </section>

      <section class="screen results-screen" id="screenResults">
        <div class="results-card" id="resultsCard"></div>
      </section>

      <section class="screen controls-screen" id="screenControls">
        <div class="pause-card controls-card">
          <div class="pause-top"><span class="eyebrow"><span class="eyebrow-rule"></span>PILOT NOTES</span><span class="pause-reg">K-2</span></div>
          <h2>FLYING THE KESTREL</h2>
          <div class="pause-rule"></div>
          <div class="controls-prose">
            <div><h3>Take-off</h3><p>Release brakes, run the throttle to full and keep straight with Q/E. Set flaps 1 and ease back on the stick above 55 knots.</p></div>
            <div><h3>Landing</h3><p>Gear down, flaps 2, aim to cross the threshold at 70–75 knots. Grease the touchdown for the biggest score.</p></div>
            <div><h3>Storm</h3><p>In the northern front, expect turbulence, rain and crosswind. Hold the beacon zone for eight seconds, then fly home.</p></div>
          </div>
          <div class="controls-grid compact">
            <div><kbd>W</kbd><kbd>S</kbd><span>Pitch</span></div>
            <div><kbd>A</kbd><kbd>D</kbd><span>Roll</span></div>
            <div><kbd>Q</kbd><kbd>E</kbd><span>Rudder</span></div>
            <div><kbd>SHIFT</kbd><kbd>CTRL</kbd><span>Throttle</span></div>
            <div><kbd>G</kbd><span>Gear</span></div>
            <div><kbd>F</kbd><span>Flaps</span></div>
            <div><kbd>B</kbd><span>Brakes</span></div>
            <div><kbd>C</kbd><span>Camera</span></div>
            <div><kbd>M</kbd><span>Map</span></div>
            <div><kbd>ESC</kbd><span>Pause</span></div>
            <div><kbd>R</kbd><span>Restart</span></div>
            <div><kbd>RIGHT DRAG</kbd><span>Look</span></div>
          </div>
          <div class="pause-buttons">
            <button class="solid-button" data-action="close-controls">BACK</button>
          </div>
        </div>
      </section>

      <div class="compact-result" id="compactResult"></div>
    `;
    this.screenTitle = root.querySelector('#screenTitle');
    this.screenSelect = root.querySelector('#screenSelect');
    this.screenPause = root.querySelector('#screenPause');
    this.screenResults = root.querySelector('#screenResults');
    this.screenControls = root.querySelector('#screenControls');
    this.missionGrid = root.querySelector('#missionGrid');
    this.resultsCard = root.querySelector('#resultsCard');
    this.compactResult = root.querySelector('#compactResult');
    this.selectBestLine = root.querySelector('#selectBestLine');
    this.controlsReturn = 'title';
    this.buildCards();
    this.bindEvents();
    this.hideAll();
  }

  bindEvents() {
    this.root.addEventListener('click', (event) => {
      const mission = event.target.closest('[data-mission]');
      if (mission) {
        this.selectedIndex = MISSIONS.findIndex((item) => item.id === mission.dataset.mission);
        this.refreshSelection();
        this.callbacks.onSelectMission?.(mission.dataset.mission);
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      if (action === 'enter-title') this.callbacks.onEnterTitle?.();
      else if (action === 'back-title') this.callbacks.onTitle?.();
      else if (action === 'mute') this.callbacks.onMute?.();
      else if (action === 'controls') this.showControls();
      else if (action === 'close-controls') this.closeControls();
      else if (action === 'resume') this.callbacks.onResume?.();
      else if (action === 'restart') this.callbacks.onRestart?.();
      else if (action === 'quit') this.callbacks.onQuit?.();
      else if (action === 'retry') this.callbacks.onRetry?.();
      else if (action === 'select') this.callbacks.onQuit?.();
    });
  }

  buildCards() {
    this.missionGrid.innerHTML = MISSIONS.map((mission, index) => `
      <button class="sortie-card tone-${mission.tone}" data-mission="${mission.id}" aria-label="Start ${mission.title}">
        <div class="card-art art-${mission.id}">
          <span class="card-number">0${index + 1}</span>
          <div class="art-sky"></div>
          <div class="art-island one"></div>
          <div class="art-island two"></div>
          <div class="art-sun"></div>
          <div class="art-ring a"></div>
          <div class="art-ring b"></div>
          <div class="art-storm"></div>
          <div class="art-bolt"></div>
          <div class="art-path"></div>
          <div class="art-plane"></div>
          <span class="card-kicker">${mission.kicker}</span>
        </div>
        <div class="card-body">
          <div class="card-title-row"><h3>${mission.title}</h3><span class="card-arrow">→</span></div>
          <p>${mission.short}</p>
          <div class="card-stats"><span>${mission.distanceNm ? `${mission.distanceNm} NM` : 'OPEN MAP'}</span><span>${mission.estimate}</span></div>
          <div class="card-best" data-best="${mission.id}"><span class="best-empty">NO RECORD</span></div>
        </div>
      </button>
    `).join('');
    this.cards = [...this.missionGrid.querySelectorAll('.sortie-card')];
    this.refreshSelection();
  }

  refreshBests(bests) {
    for (const mission of MISSIONS) {
      const holder = this.missionGrid.querySelector(`[data-best="${mission.id}"]`);
      if (holder) holder.innerHTML = bestMarkup(bests?.[mission.id]);
    }
    const earned = MISSIONS.filter((mission) => bests?.[mission.id]?.score).length;
    this.selectBestLine.textContent = earned ? `${earned} SORTIE${earned === 1 ? '' : 'S'} ON RECORD · LOCAL STORAGE` : 'LOCAL RECORDS SAVED ON THIS MACHINE';
  }

  refreshSelection() {
    this.cards?.forEach((card, index) => {
      card.classList.toggle('is-selected', index === this.selectedIndex);
    });
  }

  updateMute(muted) {
    for (const element of this.root.querySelectorAll('#titleMute, #selectMute')) {
      element.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    }
  }

  hideAll() {
    for (const screen of [this.screenTitle, this.screenSelect, this.screenPause, this.screenResults, this.screenControls]) {
      screen.classList.remove('is-active');
    }
    this.compactResult.classList.remove('is-visible');
    this.root.classList.remove('is-live');
  }

  activate(screen) {
    this.hideAll();
    screen.classList.add('is-active');
    this.root.classList.add('is-live');
  }

  showTitle(bests) {
    this.refreshBests(bests);
    this.activate(this.screenTitle);
  }

  showSelect(bests) {
    this.refreshBests(bests);
    this.refreshSelection();
    this.activate(this.screenSelect);
  }

  showPause() {
    this.activate(this.screenPause);
  }

  showControls() {
    this.controlsReturn = this.screenSelect.classList.contains('is-active') ? 'select' : 'title';
    this.activate(this.screenControls);
  }

  closeControls() {
    if (this.controlsReturn === 'select') this.activate(this.screenSelect);
    else this.activate(this.screenTitle);
  }

  showResults(result) {
    this.lastResult = result;
    this.activate(this.screenResults);
    const medal = result.medal ? `<div class="result-medal">${medalMarkup(result.medal)}</div>` : '';
    const rows = (result.rows ?? []).map((row) => `
      <div class="result-row"><span>${row.label}</span><span class="result-value">+${Number(row.value).toLocaleString('en-US')}</span></div>
    `).join('');
    const stamp = result.success ? 'CLEARED' : 'GROUNDED';
    this.resultsCard.innerHTML = `
      <div class="result-stamp ${result.success ? 'success' : 'failure'}">${stamp}</div>
      <div class="result-top">
        <div class="eyebrow"><span class="eyebrow-rule"></span>${result.success ? 'SORTIE CLOSED' : 'SORTIE TERMINATED'}</div>
        <span class="result-reg">KC-02</span>
      </div>
      <h2>${result.title}</h2>
      <div class="result-mission">${result.missionTitle ?? ''}<span>${result.note ? ` · ${result.note}` : ''}</span></div>
      ${medal}
      ${rows ? `<div class="result-rows">${rows}</div>` : `<div class="result-reason">${result.reason ?? 'The flight could not be completed.'}</div>`}
      ${result.total ? `<div class="result-total"><span>TOTAL</span><strong>${Number(result.total).toLocaleString('en-US')}</strong></div>` : ''}
      <div class="result-actions">
        <button class="solid-button" data-action="retry">${result.success ? 'FLY AGAIN' : 'RETRY SORTIE'}</button>
        <button class="line-button" data-action="select">MISSION SELECT</button>
      </div>
      <p class="result-foot">ENTER RETRY · ESC MISSION SELECT${result.isBest ? ' · NEW LOCAL BEST' : ''}</p>
    `;
  }

  showCompactResult(result) {
    this.compactResultData = result;
    const rows = (result.rows ?? []).slice(0, 2).map((row) => `
      <div class="compact-row"><span>${row.label}</span><strong>+${Number(row.value).toLocaleString('en-US')}</strong></div>
    `).join('');
    this.compactResult.innerHTML = `
      <div class="compact-head">
        <span class="compact-stamp">${result.success ? 'CLEARED' : 'GROUNDED'}</span>
        <span class="compact-id">LTR / 02</span>
      </div>
      <div class="compact-title">${result.title}</div>
      <div class="compact-mission">${result.missionTitle ?? 'LANTERN WATCH'}</div>
      <div class="compact-medal">${result.medal ? medalMarkup(result.medal) : ''}</div>
      <div class="compact-rows">${rows}</div>
      <div class="compact-total"><span>TOTAL</span><strong>${Number(result.total).toLocaleString('en-US')}</strong></div>
      <div class="compact-note">${result.note ?? 'All souls accounted for.'}</div>
    `;
    this.compactResult.classList.add('is-visible');
  }

  hideCompactResult() {
    this.compactResult.classList.remove('is-visible');
  }

  setSelectedMission(id) {
    const index = MISSIONS.findIndex((mission) => mission.id === id);
    if (index >= 0) {
      this.selectedIndex = index;
      this.refreshSelection();
    }
  }

  selectedMission() {
    return MISSIONS[this.selectedIndex] ?? MISSIONS[0];
  }

  handleKey(event) {
    if (this.screenSelect.classList.contains('is-active')) {
      if (event.code === 'ArrowRight' || event.code === 'ArrowDown') {
        this.selectedIndex = (this.selectedIndex + 1) % MISSIONS.length;
        this.refreshSelection();
        return true;
      }
      if (event.code === 'ArrowLeft' || event.code === 'ArrowUp') {
        this.selectedIndex = (this.selectedIndex + MISSIONS.length - 1) % MISSIONS.length;
        this.refreshSelection();
        return true;
      }
      if (event.code === 'Enter' || event.code === 'Space') {
        this.callbacks.onSelectMission?.(this.selectedMission().id);
        return true;
      }
      if (event.code === 'Escape') {
        this.callbacks.onTitle?.();
        return true;
      }
      if (event.code === 'KeyM') {
        this.callbacks.onMute?.();
        return true;
      }
    }
    if (this.screenTitle.classList.contains('is-active')) {
      if (event.code === 'Enter' || event.code === 'Space') {
        this.callbacks.onEnterTitle?.();
        return true;
      }
      if (event.code === 'KeyM') {
        this.callbacks.onMute?.();
        return true;
      }
    }
    if (this.screenPause.classList.contains('is-active')) {
      if (event.code === 'Escape' || event.code === 'Enter') {
        this.callbacks.onResume?.();
        return true;
      }
      if (event.code === 'KeyR') {
        this.callbacks.onRestart?.();
        return true;
      }
      if (event.code === 'KeyM') {
        this.callbacks.onMute?.();
        return true;
      }
    }
    if (this.screenResults.classList.contains('is-active')) {
      if (event.code === 'Enter') {
        this.callbacks.onRetry?.();
        return true;
      }
      if (event.code === 'Escape') {
        this.callbacks.onQuit?.();
        return true;
      }
      if (event.code === 'KeyM') {
        this.callbacks.onMute?.();
        return true;
      }
    }
    if (this.screenControls.classList.contains('is-active')) {
      if (event.code === 'Escape' || event.code === 'Enter') {
        this.closeControls();
        return true;
      }
    }
    return false;
  }

}
