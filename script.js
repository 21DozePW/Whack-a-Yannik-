(() => {
  const HOLES = 9;
  const GAME_DURATION = 30;
  const COMBO_WINDOW_MS = 1400;

  const DIFFICULTY = {
    easy:   { upMin: 900, upMax: 1500, gapMin: 500, gapMax: 1000, multi: 1 },
    normal: { upMin: 700, upMax: 1200, gapMin: 350, gapMax: 800,  multi: 2 },
    hard:   { upMin: 500, upMax: 900,  gapMin: 200, gapMax: 500,  multi: 2 },
    insane: { upMin: 350, upMax: 650,  gapMin: 100, gapMax: 300,  multi: 3 },
  };

  const board = document.getElementById('board');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const comboEl = document.getElementById('combo');
  const startBtn = document.getElementById('startBtn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl = document.getElementById('finalBest');
  const playAgainBtn = document.getElementById('playAgainBtn');
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
  let useMoleImage = true;
  let difficulty = 'normal';

  const BEST_KEY = 'whackYannikBest';
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = best;

  const probe = new Image();
  probe.onload = () => { useMoleImage = true; refreshMoleArt(); };
  probe.onerror = () => { useMoleImage = false; refreshMoleArt(); };
  probe.src = 'mole.png';

  function refreshMoleArt() {
    document.querySelectorAll('.mole').forEach(m => {
      m.classList.toggle('fallback', !useMoleImage);
    });
  }

  function buildBoard() {
    board.innerHTML = '';
    holes = [];
    for (let i = 0; i < HOLES; i++) {
      const hole = document.createElement('div');
      hole.className = 'hole';
      hole.dataset.index = i;
      hole.setAttribute('role', 'button');
      hole.setAttribute('aria-label', `Hole ${i + 1}`);

      const mole = document.createElement('div');
      mole.className = 'mole' + (useMoleImage ? '' : ' fallback');
      hole.appendChild(mole);

      hole.addEventListener('pointerdown', (e) => onWhack(e, i));
      board.appendChild(hole);
      holes.push({ el: hole, mole, up: false, whacked: false, hideTimer: null });
    }
  }

  function setScore(v) {
    score = v;
    scoreEl.textContent = score;
  }

  function setTime(v) {
    timeLeft = v;
    timeEl.textContent = timeLeft;
  }

  function setCombo(v) {
    combo = v;
    comboEl.textContent = `×${combo}`;
  }

  function popUp(idx, durationMs) {
    const h = holes[idx];
    if (!h || h.up) return;
    h.up = true;
    h.whacked = false;
    h.el.classList.add('up');
    h.el.classList.remove('whacked');

    h.hideTimer = setTimeout(() => {
      if (h.up && !h.whacked) {
        h.up = false;
        h.el.classList.remove('up');
      }
    }, durationMs);
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickHoles(n) {
    const available = holes
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => !h.up)
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
    picks.forEach(i => popUp(i, randInt(cfg.upMin, cfg.upMax)));
    scheduleTimer = setTimeout(scheduleNext, randInt(cfg.gapMin, cfg.gapMax));
  }

  function onWhack(e, idx) {
    if (!running) return;
    const h = holes[idx];
    if (!h || !h.up || h.whacked) return;
    h.whacked = true;
    h.up = false;
    h.el.classList.add('whacked');
    h.el.classList.remove('up');
    if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }

    const now = performance.now();
    if (now - lastHitAt < COMBO_WINDOW_MS) {
      setCombo(Math.min(combo + 1, 9));
    } else {
      setCombo(1);
    }
    lastHitAt = now;

    const points = combo;
    setScore(score + points);
    spawnPopup(h.el, `+${points}${combo > 1 ? ` ×${combo}` : ''}`);

    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => setCombo(1), COMBO_WINDOW_MS);

    document.body.classList.remove('flash');
    void document.body.offsetWidth;
    document.body.classList.add('flash');
    setTimeout(() => document.body.classList.remove('flash'), 250);

    setTimeout(() => h.el.classList.remove('whacked'), 280);
  }

  function spawnPopup(parent, text) {
    const p = document.createElement('div');
    p.className = 'score-popup';
    p.textContent = text;
    parent.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }

  function tick() {
    if (!running) return;
    setTime(timeLeft - 1);
    if (timeLeft <= 0) {
      endGame();
      return;
    }
    tickTimer = setTimeout(tick, 1000);
  }

  function startGame() {
    cleanupTimers();
    holes.forEach(h => {
      h.up = false;
      h.whacked = false;
      h.el.classList.remove('up', 'whacked');
    });
    setScore(0);
    setCombo(1);
    lastHitAt = 0;
    setTime(GAME_DURATION);
    running = true;
    startBtn.disabled = true;
    segButtons.forEach(b => b.disabled = true);
    overlay.classList.add('hidden');

    tickTimer = setTimeout(tick, 1000);
    scheduleTimer = setTimeout(scheduleNext, 400);
  }

  function endGame() {
    running = false;
    cleanupTimers();
    holes.forEach(h => {
      h.up = false;
      h.el.classList.remove('up');
    });
    startBtn.disabled = false;
    segButtons.forEach(b => b.disabled = false);

    const isNewBest = score > best;
    if (isNewBest) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
      overlayTitle.textContent = 'New High Score';
      overlayMessage.textContent = 'You whacked more Yanniks than ever before.';
    } else {
      overlayTitle.textContent = 'Game Over';
      overlayMessage.textContent = score === 0
        ? 'Yannik got away. Try again.'
        : 'Nice run. Can you beat your best?';
    }
    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;
    overlay.classList.remove('hidden');
  }

  function cleanupTimers() {
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
    if (comboTimer) { clearTimeout(comboTimer); comboTimer = null; }
    holes.forEach(h => {
      if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }
    });
  }

  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (running) return;
      difficulty = btn.dataset.diff;
      segButtons.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    });
  });

  startBtn.addEventListener('click', startGame);
  playAgainBtn.addEventListener('click', startGame);

  buildBoard();
})();
