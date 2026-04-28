(() => {
  const HOLES = 9;
  const GAME_DURATION = 30;
  const COMBO_WINDOW_MS = 1400;
  const AUTO_RESTART_SECONDS = 5;
  const TIME_WARNING = 10;
  const PENALTY = 5;
  const YANNIK_REACTION_MS = 520;
  const OLIVER_REACTION_MS = 1100;

  const ART = {
    yannikIdle:      'yannik-smile.png',
    yannikSurprised: 'yannik-surprised.png',
    oliverIdle:      'oliver-smile.png',
    oliverFrown:     'oliver-frown.png',
  };

  const DIFFICULTY = {
    easy:   { upMin: 900, upMax: 1500, gapMin: 500, gapMax: 1000, multi: 1, oliver: 0.15 },
    normal: { upMin: 700, upMax: 1200, gapMin: 350, gapMax: 800,  multi: 2, oliver: 0.22 },
    hard:   { upMin: 500, upMax: 900,  gapMin: 200, gapMax: 500,  multi: 2, oliver: 0.28 },
    insane: { upMin: 350, upMax: 650,  gapMin: 100, gapMax: 300,  multi: 3, oliver: 0.34 },
  };

  const board = document.getElementById('board');
  if (!board) return; // landing page has no board

  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const timeMetric = timeEl ? timeEl.closest('.metric') : null;
  const bestEl = document.getElementById('best');
  const comboEl = document.getElementById('combo');
  const startBtn = document.getElementById('startBtn');
  const startBtnLabel = startBtn ? startBtn.querySelector('.btn-label') : null;
  const quitBtn = document.getElementById('quitBtn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const cancelAutoBtn = document.getElementById('cancelAutoBtn');
  const countdownEl = document.getElementById('countdown');
  const segButtons = Array.from(document.querySelectorAll('.seg-btn'));

  let holes = [];
  let score = 0;
  let combo = 1;
  let comboTimer = null;
  let lastHitAt = 0;
  let timeLeft = GAME_DURATION;
  let running = false;
  let tickTimer = null;
  let scheduleTimer = null;
  let countdownTimer = null;
  let countdownLeft = 0;
  let difficulty = 'normal';

  const BEST_KEY = 'whackYannikBest';
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (bestEl) bestEl.textContent = best;

  Object.values(ART).forEach(src => { const i = new Image(); i.src = src; });

  function buildBoard() {
    board.innerHTML = '';
    holes = [];
    for (let i = 0; i < HOLES; i++) {
      const hole = document.createElement('div');
      hole.className = 'hole';
      hole.dataset.index = i;
      hole.setAttribute('role', 'button');
      hole.setAttribute('aria-label', `Hole ${i + 1}`);

      const character = document.createElement('div');
      character.className = 'character';
      character.dataset.kind = 'yannik';

      const img = document.createElement('img');
      img.className = 'character-img';
      img.src = ART.yannikIdle;
      img.alt = '';
      img.draggable = false;
      character.appendChild(img);

      hole.appendChild(character);
      hole.addEventListener('pointerdown', (e) => onWhack(e, i));
      board.appendChild(hole);

      holes.push({
        el: hole,
        character,
        img,
        kind: 'yannik',
        up: false,
        whacked: false,
        locked: false,
        hideTimer: null,
        reactionTimer: null,
        retreatTimer: null,
      });
    }
  }

  function setScore(v) { score = v; if (scoreEl) scoreEl.textContent = score; }
  function setCombo(v) { combo = v; if (comboEl) comboEl.textContent = `×${combo}`; }
  function setTime(v) {
    timeLeft = v;
    if (timeEl) timeEl.textContent = timeLeft;
    if (timeMetric) timeMetric.classList.toggle('warning', timeLeft <= TIME_WARNING);
  }

  function popUp(idx, durationMs, kind) {
    const h = holes[idx];
    if (!h || h.up || h.locked) return;
    h.up = true;
    h.whacked = false;
    h.kind = kind;
    h.character.dataset.kind = kind;
    h.img.src = kind === 'oliver' ? ART.oliverIdle : ART.yannikIdle;
    h.el.classList.add('up');
    h.el.classList.remove('whacked', 'penalty', 'oliver-active');
    if (kind === 'oliver') h.el.classList.add('oliver-active');

    h.hideTimer = setTimeout(() => {
      if (h.up && !h.whacked) {
        h.up = false;
        h.el.classList.remove('up', 'oliver-active');
      }
    }, durationMs);
  }

  function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

  function pickHoles(n) {
    const available = holes
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => !h.up && !h.locked)
      .map(({ i }) => i);
    const picks = [];
    while (picks.length < n && available.length) {
      const idx = available.splice(randInt(0, available.length - 1), 1)[0];
      picks.push(idx);
    }
    return picks;
  }

  function scheduleNext() {
    if (!running) return;
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    const count = randInt(1, cfg.multi);
    const picks = pickHoles(count);
    picks.forEach(i => {
      const kind = Math.random() < cfg.oliver ? 'oliver' : 'yannik';
      popUp(i, randInt(cfg.upMin, cfg.upMax), kind);
    });
    scheduleTimer = setTimeout(scheduleNext, randInt(cfg.gapMin, cfg.gapMax));
  }

  function onWhack(e, idx) {
    if (!running) return;
    const h = holes[idx];
    if (!h || !h.up || h.whacked || h.locked) return;

    h.whacked = true;
    h.locked = true;
    if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }

    if (h.kind === 'oliver') {
      handleOliverHit(h);
    } else {
      handleYannikHit(h);
    }
  }

  function clearHoleAfterReaction(h, holdMs) {
    if (h.reactionTimer) clearTimeout(h.reactionTimer);
    if (h.retreatTimer) clearTimeout(h.retreatTimer);

    // Hold the reaction image visible (character stays at "up" position).
    h.reactionTimer = setTimeout(() => {
      h.el.classList.remove('up', 'oliver-active');
      // Character now retreats via the default bottom transition.
      // After retreat finishes, reset state and image.
      h.retreatTimer = setTimeout(() => {
        h.el.classList.remove('whacked', 'penalty');
        h.up = false;
        h.locked = false;
        h.kind = 'yannik';
        h.character.dataset.kind = 'yannik';
        h.img.src = ART.yannikIdle;
      }, 320);
    }, holdMs);
  }

  function handleYannikHit(h) {
    h.img.src = ART.yannikSurprised;
    h.el.classList.add('whacked');

    const now = performance.now();
    if (now - lastHitAt < COMBO_WINDOW_MS) {
      setCombo(Math.min(combo + 1, 9));
    } else {
      setCombo(1);
    }
    lastHitAt = now;

    const points = combo;
    setScore(score + points);
    spawnPopup(h.el, `+${points}${combo > 1 ? `  ×${combo}` : ''}`);

    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => setCombo(1), COMBO_WINDOW_MS);

    flashScreen(false);
    clearHoleAfterReaction(h, YANNIK_REACTION_MS);
  }

  function handleOliverHit(h) {
    h.img.src = ART.oliverFrown;
    h.el.classList.add('penalty');

    setScore(Math.max(0, score - PENALTY));
    setCombo(1);
    if (comboTimer) clearTimeout(comboTimer);
    lastHitAt = 0;

    spawnPopup(h.el, `−${PENALTY}`, true);
    flashScreen(true);
    clearHoleAfterReaction(h, OLIVER_REACTION_MS);
  }

  function flashScreen(penalty) {
    document.body.classList.remove('flash', 'penalty');
    void document.body.offsetWidth;
    document.body.classList.add('flash');
    if (penalty) document.body.classList.add('penalty');
    setTimeout(() => document.body.classList.remove('flash', 'penalty'), 500);
  }

  function spawnPopup(parent, text, penalty = false) {
    const p = document.createElement('div');
    p.className = 'score-popup' + (penalty ? ' penalty' : '');
    p.textContent = text;
    parent.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }

  function tick() {
    if (!running) return;
    setTime(timeLeft - 1);
    if (timeLeft <= 0) {
      endGame({ abandoned: false });
      return;
    }
    tickTimer = setTimeout(tick, 1000);
  }

  function clearBoardState() {
    holes.forEach(h => {
      h.up = false;
      h.whacked = false;
      h.locked = false;
      h.kind = 'yannik';
      h.character.dataset.kind = 'yannik';
      h.img.src = ART.yannikIdle;
      h.el.classList.remove('up', 'whacked', 'penalty', 'oliver-active');
      if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }
      if (h.reactionTimer) { clearTimeout(h.reactionTimer); h.reactionTimer = null; }
      if (h.retreatTimer) { clearTimeout(h.retreatTimer); h.retreatTimer = null; }
    });
  }

  function startGame() {
    cancelAutoRestart();
    cleanupTimers();
    clearBoardState();
    if (overlay) overlay.classList.add('hidden');

    setScore(0);
    setCombo(1);
    lastHitAt = 0;
    setTime(GAME_DURATION);
    running = true;

    if (startBtnLabel) startBtnLabel.textContent = 'Restart Round';
    if (quitBtn) quitBtn.classList.remove('hidden');

    tickTimer = setTimeout(tick, 1000);
    scheduleTimer = setTimeout(scheduleNext, 400);
  }

  function endGame({ abandoned }) {
    running = false;
    cleanupTimers();
    holes.forEach(h => {
      h.up = false;
      h.locked = false;
      h.el.classList.remove('up', 'oliver-active');
    });

    if (startBtnLabel) startBtnLabel.textContent = 'Begin Round';
    if (quitBtn) quitBtn.classList.add('hidden');

    const isNewBest = !abandoned && score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      if (bestEl) bestEl.textContent = best;
    }

    if (!overlay) return;

    if (abandoned) {
      overlayTitle.textContent = 'Round Surrendered';
      overlayMessage.textContent = 'A new round will commence shortly.';
    } else if (isNewBest) {
      overlayTitle.textContent = 'A New Personal Best';
      overlayMessage.textContent = 'A composed and accomplished performance.';
    } else if (score === 0) {
      overlayTitle.textContent = 'Round Concluded';
      overlayMessage.textContent = 'Yannik proved elusive. Another round awaits.';
    } else {
      overlayTitle.textContent = 'Round Concluded';
      overlayMessage.textContent = 'A respectable showing. Pursue the ledger.';
    }

    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    overlay.classList.remove('hidden');

    startAutoRestart();
  }

  function startAutoRestart() {
    cancelAutoRestart();
    if (cancelAutoBtn) {
      cancelAutoBtn.textContent = 'Hold';
      cancelAutoBtn.disabled = false;
    }
    countdownLeft = AUTO_RESTART_SECONDS;
    if (countdownEl) countdownEl.textContent = countdownLeft;
    countdownTimer = setInterval(() => {
      countdownLeft -= 1;
      if (countdownEl) countdownEl.textContent = countdownLeft;
      if (countdownLeft <= 0) {
        cancelAutoRestart();
        startGame();
      }
    }, 1000);
  }

  function cancelAutoRestart() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function cleanupTimers() {
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
    if (comboTimer) { clearTimeout(comboTimer); comboTimer = null; }
    holes.forEach(h => {
      if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }
      if (h.reactionTimer) { clearTimeout(h.reactionTimer); h.reactionTimer = null; }
      if (h.retreatTimer) { clearTimeout(h.retreatTimer); h.retreatTimer = null; }
    });
  }

  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.diff === difficulty && !running && (!overlay || overlay.classList.contains('hidden'))) return;
      const wasRunning = running;
      const overlayOpen = overlay && !overlay.classList.contains('hidden');
      difficulty = btn.dataset.diff;
      segButtons.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      if (wasRunning || overlayOpen) {
        startGame();
      }
    });
  });

  if (startBtn) startBtn.addEventListener('click', () => startGame());

  if (quitBtn) quitBtn.addEventListener('click', () => {
    if (!running) return;
    endGame({ abandoned: true });
  });

  if (playAgainBtn) playAgainBtn.addEventListener('click', () => startGame());

  if (cancelAutoBtn) cancelAutoBtn.addEventListener('click', () => {
    if (countdownTimer) {
      cancelAutoRestart();
      cancelAutoBtn.textContent = 'Held';
      cancelAutoBtn.disabled = true;
      if (countdownEl) countdownEl.textContent = '–';
    }
  });

  buildBoard();
})();
