(() => {
  const HOLES = 9;
  const GAME_DURATION = 30;

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
  const startBtn = document.getElementById('startBtn');
  const difficultySel = document.getElementById('difficulty');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayMessage = document.getElementById('overlayMessage');
  const finalScoreEl = document.getElementById('finalScore');
  const playAgainBtn = document.getElementById('playAgainBtn');

  let holes = [];
  let score = 0;
  let timeLeft = GAME_DURATION;
  let running = false;
  let tickTimer = null;
  let scheduleTimer = null;
  let useMoleImage = true;

  const BEST_KEY = 'whackYannikBest';
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = best;

  // Check if mole.png loads; if not, use CSS fallback face.
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
    const cfg = DIFFICULTY[difficultySel.value] || DIFFICULTY.normal;
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

    setScore(score + 1);
    spawnPopup(h.el, '+1');

    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    setTimeout(() => document.body.classList.remove('shake'), 200);

    setTimeout(() => h.el.classList.remove('whacked'), 250);
  }

  function spawnPopup(parent, text) {
    const p = document.createElement('div');
    p.className = 'score-popup';
    p.textContent = text;
    parent.appendChild(p);
    setTimeout(() => p.remove(), 700);
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
    setTime(GAME_DURATION);
    running = true;
    startBtn.disabled = true;
    difficultySel.disabled = true;
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
    difficultySel.disabled = false;

    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
      overlayTitle.textContent = 'New Best!';
      overlayMessage.textContent = 'You whacked more Yanniks than ever before!';
    } else {
      overlayTitle.textContent = 'Game Over';
      overlayMessage.textContent = score === 0
        ? 'Yannik got away. Try again!'
        : 'Nice whacking! Can you beat your best?';
    }
    finalScoreEl.textContent = score;
    overlay.classList.remove('hidden');
  }

  function cleanupTimers() {
    if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
    if (scheduleTimer) { clearTimeout(scheduleTimer); scheduleTimer = null; }
    holes.forEach(h => {
      if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }
    });
  }

  startBtn.addEventListener('click', startGame);
  playAgainBtn.addEventListener('click', startGame);

  buildBoard();
})();
