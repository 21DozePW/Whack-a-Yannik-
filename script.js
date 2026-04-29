(() => {
  const HOLES = 9;
  const GAME_DURATION = 30;
  const COMBO_WINDOW_MS = 1400;
  const AUTO_RESTART_SECONDS = 5;
  const TIME_WARNING = 10;
  const PENALTY = 5;
  const PEDRO_REACTION_MS = 520;
  const OLIVER_REACTION_MS = 1100;
  const TOBI_REACTION_MS = 700;
  const TOBI_BASE = 15;
  const TOBI_MAX = 45;

  const ART = {
    pedroIdle:      'pedro-smile.png',
    pedroSurprised: 'pedro-surprised.png',
    oliverIdle:     'oliver-smile.png',
    oliverFrown:    'oliver-frown.png',
    tobiIdle:       'tobi-smile.png',
    tobiShades:     'tobi-shades.png',
  };

  // Base "multi" = max simultaneous pop-ups; oliver = chance per pop;
  // tobi = chance per pop (independent, applied first); upMin/upMax
  // = visible duration; gapMin/gapMax = inter-pop interval.
  const DIFFICULTY = {
    easy:   { upMin: 900, upMax: 1500, gapMin: 500, gapMax: 1000, multi: 1, oliver: 0.15, tobi: 0.05 },
    normal: { upMin: 700, upMax: 1200, gapMin: 350, gapMax: 800,  multi: 2, oliver: 0.22, tobi: 0.07 },
    hard:   { upMin: 500, upMax: 900,  gapMin: 200, gapMax: 500,  multi: 2, oliver: 0.28, tobi: 0.08 },
    insane: { upMin: 350, upMax: 650,  gapMin: 100, gapMax: 300,  multi: 3, oliver: 0.34, tobi: 0.10 },
  };

  const board = document.getElementById('board');
  if (!board) return;

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

  const BEST_KEY = 'whackBjssBest';
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (bestEl) bestEl.textContent = best;

  Object.values(ART).forEach(src => { const i = new Image(); i.src = src; });

  // ---- Supabase scoreboard ----
  const SUPABASE_URL = 'https://ihbdooybrtwisqtirwqn.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_yVp_NBi-l2kP2fWZHJobkA_YfL-T482';
  const NAME_KEY = 'whackBjssName';

  const submitForm   = document.getElementById('overlaySubmit');
  const playerName   = document.getElementById('playerName');
  const submitBtn    = document.getElementById('submitScoreBtn');
  const submitStatus = document.getElementById('submitStatus');
  const lbListEl     = document.getElementById('leaderboardList');
  const lbTierBtns   = Array.from(document.querySelectorAll('.lb-tier-btn'));

  let supa = null;
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try { supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
    catch (e) { supa = null; }
  }

  let scoreSubmitted = false;
  let lbTier = 'all';

  if (playerName) {
    const saved = localStorage.getItem(NAME_KEY);
    if (saved) playerName.value = saved;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }
  function timeAgo(iso) {
    const d = new Date(iso);
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return d.toLocaleDateString();
  }

  function renderLeaderboard(rows) {
    if (!lbListEl) return;
    if (!rows || rows.length === 0) {
      lbListEl.innerHTML = `<li class="leaderboard-empty">No scores yet — be the first.</li>`;
      return;
    }
    lbListEl.innerHTML = rows.map((r, i) => `
      <li class="lb-row">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHtml(r.name)}</span>
        <span class="lb-tier lb-tier-${escapeHtml(r.tier)}">${escapeHtml(r.tier)}</span>
        <span class="lb-score">${Number(r.score).toLocaleString()}</span>
        <span class="lb-time">${timeAgo(r.created_at)}</span>
      </li>
    `).join('');
  }

  async function refreshLeaderboard() {
    if (!supa || !lbListEl) {
      if (lbListEl) lbListEl.innerHTML = `<li class="leaderboard-empty">Leaderboard unavailable.</li>`;
      return;
    }
    lbListEl.innerHTML = `<li class="leaderboard-empty">Loading…</li>`;
    let q = supa
      .from('scores')
      .select('name, score, tier, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    if (lbTier !== 'all') q = q.eq('tier', lbTier);
    const { data, error } = await q;
    if (error) {
      lbListEl.innerHTML = `<li class="leaderboard-empty">Couldn't load scores.</li>`;
      return;
    }
    renderLeaderboard(data);
  }

  async function submitScoreToServer() {
    if (!supa) {
      if (submitStatus) submitStatus.textContent = 'Scoreboard offline.';
      return;
    }
    if (scoreSubmitted) return;
    const name = (playerName && playerName.value || '').trim();
    if (!name) {
      if (submitStatus) submitStatus.textContent = 'Please enter a name.';
      if (playerName) playerName.focus();
      return;
    }
    if (score <= 0) {
      if (submitStatus) submitStatus.textContent = 'Score must be greater than zero.';
      return;
    }

    localStorage.setItem(NAME_KEY, name);
    if (submitBtn) submitBtn.disabled = true;
    if (submitStatus) submitStatus.textContent = 'Saving…';

    const { error } = await supa.from('scores').insert({ name, score, tier: difficulty });
    if (error) {
      if (submitStatus) submitStatus.textContent = 'Could not save: ' + (error.message || 'unknown error');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    scoreSubmitted = true;
    if (submitStatus) submitStatus.textContent = 'Saved to the ledger.';
    if (submitForm) submitForm.classList.add('saved');
    refreshLeaderboard();
  }

  if (submitForm) {
    submitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitScoreToServer();
    });
  }

  lbTierBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const t = btn.dataset.lbTier;
      if (t === lbTier) return;
      lbTier = t;
      lbTierBtns.forEach(b => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      refreshLeaderboard();
    });
  });

  // Initial load
  if (supa && lbListEl) refreshLeaderboard();

  // ---- Audio (synthesised via Web Audio API; no asset files) ----
  const audio = (() => {
    let ctx = null;
    const AC = window.AudioContext || window.webkitAudioContext;
    function ensure() {
      if (!AC) return null;
      if (!ctx) { try { ctx = new AC(); } catch (e) { return null; } }
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      return ctx;
    }
    function tone({ freq, freqEnd, type = 'sine', start = 0, attack = 0.004, decay = 0.18, peak = 0.3, dest }) {
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + start;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (freqEnd && freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + attack + decay);
      }
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + attack + decay);
      osc.connect(g).connect(dest || c.destination);
      osc.start(t0);
      osc.stop(t0 + attack + decay + 0.05);
    }

    // Pedro: cash register cha-ching — two stacked metallic chimes
    function cashRegister() {
      [0, 0.07].forEach((s, i) => {
        const f1 = i === 0 ? 1200 : 1800;
        const f2 = i === 0 ? 1600 : 2400;
        tone({ freq: f1, type: 'triangle', start: s, attack: 0.002, decay: 0.22, peak: 0.32 });
        tone({ freq: f2, type: 'triangle', start: s, attack: 0.002, decay: 0.18, peak: 0.20 });
        tone({ freq: f1 * 2, type: 'sine', start: s, attack: 0.002, decay: 0.10, peak: 0.10 });
      });
    }

    // Tobi: short bright Christmas bell — three quick chimes
    function bell() {
      [0, 0.07, 0.14].forEach((s, i) => {
        const base = 2400 + i * 240;
        tone({ freq: base, type: 'sine', start: s, attack: 0.001, decay: 0.18, peak: 0.30 });
        tone({ freq: base * 1.5, type: 'sine', start: s, attack: 0.001, decay: 0.12, peak: 0.16 });
        tone({ freq: base * 2, type: 'sine', start: s, attack: 0.001, decay: 0.08, peak: 0.08 });
      });
    }

    // Oliver: descending "baaaahhh" buzzer
    function buzzer() {
      tone({ freq: 230, freqEnd: 110, type: 'sawtooth', start: 0, attack: 0.008, decay: 0.45, peak: 0.28 });
      tone({ freq: 115, freqEnd: 70,  type: 'square',   start: 0, attack: 0.008, decay: 0.45, peak: 0.16 });
    }

    return { cashRegister, bell, buzzer, ensure };
  })();

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
      character.dataset.kind = 'pedro';

      const img = document.createElement('img');
      img.className = 'character-img';
      img.src = ART.pedroIdle;
      img.alt = '';
      img.draggable = false;
      character.appendChild(img);

      hole.appendChild(character);
      hole.addEventListener('pointerdown', () => onWhack(i));
      board.appendChild(hole);

      holes.push({
        el: hole,
        character,
        img,
        kind: 'pedro',
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
    h.img.src =
      kind === 'oliver' ? ART.oliverIdle :
      kind === 'tobi'   ? ART.tobiIdle   :
                          ART.pedroIdle;
    h.el.classList.remove('whacked', 'penalty', 'oliver-active', 'tobi-active', 'bonus');
    h.el.classList.add('up');
    if (kind === 'oliver') h.el.classList.add('oliver-active');
    if (kind === 'tobi')   h.el.classList.add('tobi-active');

    h.hideTimer = setTimeout(() => {
      if (h.up && !h.whacked) {
        h.up = false;
        h.el.classList.remove('up', 'oliver-active', 'tobi-active');
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

  function rollKind(cfg) {
    const r = Math.random();
    if (r < cfg.tobi) return 'tobi';
    if (r < cfg.tobi + cfg.oliver) return 'oliver';
    return 'pedro';
  }

  function scheduleNext() {
    if (!running) return;
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    const count = randInt(1, cfg.multi);
    const picks = pickHoles(count);
    picks.forEach(i => {
      const kind = rollKind(cfg);
      const dur = kind === 'tobi'
        ? randInt(Math.max(280, cfg.upMin - 250), Math.max(550, cfg.upMax - 350))
        : randInt(cfg.upMin, cfg.upMax);
      popUp(i, dur, kind);
    });
    scheduleTimer = setTimeout(scheduleNext, randInt(cfg.gapMin, cfg.gapMax));
  }

  function onWhack(idx) {
    if (!running) return;
    const h = holes[idx];
    if (!h || !h.up || h.whacked || h.locked) return;

    h.whacked = true;
    h.locked = true;
    if (h.hideTimer) { clearTimeout(h.hideTimer); h.hideTimer = null; }

    if (h.kind === 'oliver')      handleOliverHit(h);
    else if (h.kind === 'tobi')   handleTobiHit(h);
    else                          handlePedroHit(h);
  }

  function clearHoleAfterReaction(h, holdMs) {
    if (h.reactionTimer) clearTimeout(h.reactionTimer);
    if (h.retreatTimer) clearTimeout(h.retreatTimer);

    h.reactionTimer = setTimeout(() => {
      h.el.classList.remove('up', 'oliver-active', 'tobi-active');
      h.retreatTimer = setTimeout(() => {
        h.el.classList.remove('whacked', 'penalty', 'bonus');
        h.up = false;
        h.locked = false;
        h.kind = 'pedro';
        h.character.dataset.kind = 'pedro';
        h.img.src = ART.pedroIdle;
      }, 320);
    }, holdMs);
  }

  function bumpCombo(now) {
    if (now - lastHitAt < COMBO_WINDOW_MS) {
      setCombo(Math.min(combo + 1, 9));
    } else {
      setCombo(1);
    }
    lastHitAt = now;
    if (comboTimer) clearTimeout(comboTimer);
    comboTimer = setTimeout(() => setCombo(1), COMBO_WINDOW_MS);
  }

  function handlePedroHit(h) {
    h.img.src = ART.pedroSurprised;
    h.el.classList.add('whacked');

    bumpCombo(performance.now());
    const points = combo;
    setScore(score + points);
    spawnPopup(h.el, `+${points}${combo > 1 ? `  ×${combo}` : ''}`);

    audio.cashRegister();
    flashScreen('good');
    clearHoleAfterReaction(h, PEDRO_REACTION_MS);
  }

  function handleTobiHit(h) {
    h.img.src = ART.tobiShades;
    h.el.classList.add('whacked', 'bonus');

    bumpCombo(performance.now());
    const points = Math.min(TOBI_MAX, TOBI_BASE * combo);
    setScore(score + points);
    spawnPopup(h.el, `+${points}  Tobi!`, false, true);

    audio.bell();
    flashScreen('bonus');
    clearHoleAfterReaction(h, TOBI_REACTION_MS);
  }

  function handleOliverHit(h) {
    h.img.src = ART.oliverFrown;
    h.el.classList.add('penalty');

    setScore(Math.max(0, score - PENALTY));
    setCombo(1);
    if (comboTimer) clearTimeout(comboTimer);
    lastHitAt = 0;

    spawnPopup(h.el, `−${PENALTY}`, true);
    audio.buzzer();
    flashScreen('bad');
    clearHoleAfterReaction(h, OLIVER_REACTION_MS);
  }

  function flashScreen(kind) {
    document.body.classList.remove('flash', 'penalty', 'bonus');
    void document.body.offsetWidth;
    document.body.classList.add('flash');
    if (kind === 'bad')   document.body.classList.add('penalty');
    if (kind === 'bonus') document.body.classList.add('bonus');
    setTimeout(() => document.body.classList.remove('flash', 'penalty', 'bonus'), 500);
  }

  function spawnPopup(parent, text, penalty = false, bonus = false) {
    const p = document.createElement('div');
    p.className = 'score-popup' + (penalty ? ' penalty' : '') + (bonus ? ' bonus' : '');
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
      h.kind = 'pedro';
      h.character.dataset.kind = 'pedro';
      h.img.src = ART.pedroIdle;
      h.el.classList.remove('up', 'whacked', 'penalty', 'oliver-active', 'tobi-active', 'bonus');
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
    scoreSubmitted = false;

    if (submitForm) submitForm.classList.remove('saved');
    if (submitBtn) submitBtn.disabled = false;
    if (submitStatus) submitStatus.textContent = '';

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
      h.el.classList.remove('up', 'oliver-active', 'tobi-active');
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
      overlayMessage.textContent = 'Pedro proved elusive. Another round awaits.';
    } else {
      overlayTitle.textContent = 'Round Concluded';
      overlayMessage.textContent = 'A respectable showing. Pursue the ledger.';
    }

    finalScoreEl.textContent = score;
    finalBestEl.textContent = best;

    // Show submit form only if there is a meaningful score
    if (submitForm) {
      const showForm = !abandoned && score > 0 && supa;
      submitForm.style.display = showForm ? '' : 'none';
      if (showForm && playerName && !playerName.value) {
        playerName.value = localStorage.getItem(NAME_KEY) || '';
      }
    }

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
      if (wasRunning || overlayOpen) startGame();
    });
  });

  if (startBtn) startBtn.addEventListener('click', () => { audio.ensure(); startGame(); });

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
