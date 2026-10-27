// ============================================================
//  JAGOKUIS - CLIENT (browser)
//  Berkomunikasi dengan server lewat WebSocket (pesan JSON)
// ============================================================
(() => {
  const $ = (id) => document.getElementById(id);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`);

  const me = { name: null, avatar: null, color: null, isHost: false, score: 0, streak: 0 };
  let avatars = [];
  let taken = [];
  let chosen = null;
  let joined = false;
  let gameState = 'lobby';
  let players = [];
  let selected = null;
  let timerId = null;
  let totalQuestions = 8;

  const send = (obj) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  // Membuat elemen dengan aman (textContent, bukan innerHTML -> anti XSS)
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Elemen avatar pemain (karakter + warna unik)
  function avatarEl(p, size, withCrown) {
    const a = el('div', 'avatar ' + size);
    a.style.setProperty('--pc', p.color);
    a.append(el('span', '', p.avatar));
    if (withCrown && p.isHost) a.append(el('div', 'crown', '👑'));
    return a;
  }

  function streakEl(n) {
    return n >= 2 ? el('span', 'streak', '🔥' + n) : null;
  }

  // ---------- Suara (Web Audio, tanpa file) ----------
  let audioCtx = null;
  let muted = false;
  function beep(freq, dur = 0.12, type = 'sine', vol = 0.07, delay = 0) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime + delay;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + dur);
    } catch (e) { /* suara tidak wajib */ }
  }
  const sfx = {
    join: () => { beep(523, 0.1); beep(784, 0.16, 'sine', 0.07, 0.1); },
    start: () => { [392, 523, 659].forEach((f, i) => beep(f, 0.14, 'triangle', 0.08, i * 0.1)); },
    correct: () => { beep(660, 0.1); beep(880, 0.2, 'sine', 0.08, 0.1); },
    wrong: () => beep(170, 0.3, 'sawtooth', 0.05),
    tick: () => beep(980, 0.04, 'square', 0.025),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.08, i * 0.13)); },
  };

  // ---------- Confetti (canvas) ----------
  function confetti() {
    const cv = $('confetti');
    const ctx = cv.getContext('2d');
    cv.width = innerWidth;
    cv.height = innerHeight;
    const colors = ['#ff5470', '#4da3ff', '#ffb830', '#2ee59d', '#a77bff', '#22d3ee', '#ff4fa3'];
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * cv.width,
      y: -20 - Math.random() * cv.height * 0.6,
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
      c: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 4,
      vx: -1.5 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
    }));
    const end = Date.now() + 5000;
    (function frame() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (Date.now() < end) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  // ---------- Tampilan umum ----------
  const VIEWS = ['lobby', 'getready', 'question', 'final'];
  function showView(name) {
    VIEWS.forEach((v) => ($('view-' + v).hidden = v !== name));
  }

  function setConn(online) {
    $('conn').className = 'conn ' + (online ? 'online' : 'offline');
    $('conn-text').textContent = online ? 'Terhubung' : 'Terputus';
  }

  function addChat(kind, who, text) {
    const log = $('chat-log');
    let row;
    if (kind === 'sys') {
      row = el('div', 'sys', text);
    } else {
      const p = players.find((x) => x.name === who);
      row = el('div', 'msg' + (kind === 'mine' ? ' mine' : ''));
      row.append(el('b', '', (p ? p.avatar + ' ' : '') + who + ': '), document.createTextNode(text));
    }
    log.append(row);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- Join: pilih karakter ----------
  function renderPicker() {
    const grid = $('avatar-grid');
    grid.replaceChildren();
    if (chosen === null || taken.includes(chosen)) {
      chosen = avatars.find((a) => !taken.includes(a)) || null;
    }
    avatars.forEach((a) => {
      const b = el('button', 'pick' + (a === chosen ? ' on' : ''), a);
      b.type = 'button';
      b.disabled = taken.includes(a);
      b.addEventListener('click', () => {
        chosen = a;
        renderPicker();
      });
      grid.append(b);
    });
    $('preview-avatar').firstChild.textContent = chosen || '❔';
  }

  $('name-input').addEventListener('input', (e) => {
    $('preview-name').textContent = e.target.value.trim() || 'Namamu';
  });

  // ---------- Render pemain ----------
  function renderMeCard() {
    const c = $('me-card');
    c.replaceChildren();
    c.style.display = me.name ? '' : 'none';
    if (!me.name) return;
    c.append(avatarEl({ avatar: me.avatar, color: me.color, isHost: me.isHost }, 'lg', true));
    const info = el('div', 'me-info');
    const name = el('div', 'me-name', me.name);
    info.append(name);
    const role = el('div', 'me-role', me.isHost ? 'Host ruangan' : 'Pemain');
    info.append(role);
    const sk = streakEl(me.streak);
    if (sk) info.append(sk);
    c.append(info);
    const sc = el('div', 'me-score');
    sc.append(el('b', '', String(me.score)), el('small', '', 'poin'));
    c.append(sc);
  }

  function renderPlayers() {
    const list = $('player-list');
    list.replaceChildren();
    [...players].sort((a, b) => b.score - a.score).forEach((p) => {
      const li = el('li', p.name === me.name ? 'me' : '');
      li.style.setProperty('--pc', p.color);
      li.append(avatarEl(p, 'sm', false));
      const info = el('span', 'pinfo');
      info.append(el('b', '', (p.isHost ? '👑 ' : '') + p.name));
      const sk = streakEl(p.streak);
      if (sk) info.append(sk);
      if (gameState === 'question' && p.answered) info.append(el('span', 'tick', '✓'));
      li.append(info, el('span', 'pscore', String(p.score)));
      list.append(li);
    });
    $('player-count').textContent = players.length;
  }

  function renderLobby() {
    const tiles = $('lobby-tiles');
    tiles.replaceChildren();
    players.forEach((p) => {
      const t = el('div', 'tile' + (p.name === me.name ? ' me' : ''));
      t.append(avatarEl(p, 'lg', true), el('div', 'tname', p.name));
      tiles.append(t);
    });
    const canStart = me.isHost && gameState === 'lobby';
    $('start-btn').hidden = !canStart;
    $('again-btn').hidden = !canStart;
    $('wait-host').hidden = me.isHost || gameState !== 'lobby';
    $('again-wait').hidden = me.isHost;
    $('lobby-title').textContent = players.length > 1 ? `${players.length} pemain siap bertanding!` : 'Menunggu pemain lain...';
    $('lobby-text').textContent = me.isHost
      ? 'Kamu adalah host 👑 Mulai jika semua pemain sudah masuk.'
      : 'Menunggu host memulai permainan...';
  }

  function renderBoard(container, board) {
    container.replaceChildren();
    const max = Math.max(1, ...board.map((b) => b.score));
    const medals = ['🥇', '🥈', '🥉'];
    board.forEach((b, i) => {
      const row = el('div', 'board-row' + (b.name === me.name ? ' me' : ''));
      row.style.setProperty('--pc', b.color);
      row.style.animationDelay = i * 0.06 + 's';
      row.append(el('span', 'rank', medals[i] || String(i + 1)));
      row.append(avatarEl(b, 'sm', false));

      const who = el('div', 'who');
      const name = el('div', 'name');
      name.append(el('b', '', b.name));
      const sk = streakEl(b.streak);
      if (sk) name.append(sk);
      const bar = el('div', 'bar');
      const fill = document.createElement('i');
      bar.append(fill);
      who.append(name, bar);
      row.append(who);

      if (b.gained !== undefined) {
        row.append(el('span', 'gain' + (b.gained > 0 ? ' plus' : ''), b.gained > 0 ? '+' + b.gained : '0'));
      } else {
        row.append(el('span', ''));
      }
      row.append(el('span', 'score', String(b.score)));
      container.append(row);
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = (b.score / max) * 100 + '%')));
    });
  }

  function renderProgress(number) {
    const box = $('q-progress');
    box.replaceChildren();
    for (let i = 1; i <= totalQuestions; i++) {
      box.append(el('i', i < number ? 'done' : i === number ? 'now' : ''));
    }
  }

  // ---------- Timer ----------
  const CIRC = 119.38;
  function startTimer(seconds) {
    stopTimer();
    const end = Date.now() + seconds * 1000;
    const ring = document.querySelector('.ring');
    const fg = $('ring-fg');
    const text = $('timer-text');
    let lastSec = -1;
    const tick = () => {
      const left = Math.max(0, end - Date.now());
      fg.style.strokeDashoffset = String(CIRC * (1 - left / (seconds * 1000)));
      const sec = Math.ceil(left / 1000);
      text.textContent = sec;
      const danger = left <= 5000;
      ring.classList.toggle('danger', danger);
      if (danger && sec !== lastSec && sec > 0 && selected === null) sfx.tick();
      lastSec = sec;
      if (left <= 0) stopTimer();
    };
    tick();
    timerId = setInterval(tick, 100);
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  // ---------- Pesan dari server ----------
  function handleServerMessage(msg) {
    switch (msg.type) {
      case 'hello':
        avatars = msg.avatars;
        taken = msg.taken;
        if (!joined) renderPicker();
        break;

      case 'welcome':
        joined = true;
        Object.assign(me, { name: msg.name, avatar: msg.avatar, color: msg.color });
        $('screen-join').hidden = true;
        $('screen-game').hidden = false;
        $('share-url').textContent = location.origin;
        showView('lobby');
        renderMeCard();
        addChat('sys', '', `Kamu bergabung sebagai ${me.avatar} ${me.name}.`);
        sfx.join();
        break;

      case 'players': {
        players = msg.players;
        gameState = msg.state;
        const self = players.find((p) => p.name === me.name);
        if (self) {
          me.isHost = self.isHost;
          me.score = self.score;
          me.streak = self.streak;
        }
        renderPlayers();
        renderMeCard();
        renderLobby();
        break;
      }

      case 'info':
        addChat('sys', '', msg.text);
        break;

      case 'chat':
        addChat('other', msg.from, msg.text);
        break;

      case 'gameStart':
        totalQuestions = msg.total;
        showView('getready');
        sfx.start();
        break;

      case 'question': {
        selected = null;
        totalQuestions = msg.total;
        showView('question');
        $('q-number').textContent = `Soal ${msg.number}/${msg.total}`;
        renderProgress(msg.number);
        $('q-text').textContent = msg.text;
        $('q-status').textContent = 'Pilih jawabanmu secepat mungkin! (bisa tekan A/B/C/D)';
        $('result-box').hidden = true;

        const box = $('options');
        box.replaceChildren();
        msg.options.forEach((opt, i) => {
          const b = el('button', 'option');
          b.type = 'button';
          b.append(el('span', 'letter', 'ABCD'[i]), el('span', '', opt));
          b.addEventListener('click', () => {
            if (selected !== null) return;
            selected = i;
            b.classList.add('selected');
            box.querySelectorAll('.option').forEach((x) => (x.disabled = true));
            send({ type: 'answer', choice: 'ABCD'[i] });
            beep(440, 0.06, 'triangle');
          });
          box.append(b);
        });
        startTimer(msg.timeLimit);
        break;
      }

      case 'answered':
        $('q-status').textContent = 'Jawaban terkirim! Menunggu pemain lain...';
        break;

      case 'result': {
        stopTimer();
        document.querySelector('.ring').classList.remove('danger');
        $('options').querySelectorAll('.option').forEach((b, i) => {
          b.disabled = true;
          b.classList.remove('selected');
          if (i === msg.correctIndex) b.classList.add('correct');
          else if (i === selected) b.classList.add('wrong');
          else b.classList.add('dim');
        });
        $('q-status').textContent = '';

        const verdict = $('result-verdict');
        if (!msg.answered) {
          verdict.textContent = '⏰ Waktu habis';
          verdict.className = 'verdict bad';
          sfx.wrong();
        } else if (msg.correct) {
          verdict.textContent = '✔ Benar!';
          verdict.className = 'verdict good';
          sfx.correct();
        } else {
          verdict.textContent = '✘ Salah';
          verdict.className = 'verdict bad';
          sfx.wrong();
        }
        $('result-combo').textContent =
          msg.combo > 0 ? `🔥 Combo x${msg.streak}: bonus +${msg.combo} poin` : '';
        $('result-points').textContent = msg.gained > 0 ? `+${msg.gained}` : '+0';
        $('result-correct').textContent = `Jawaban benar: ${'ABCD'[msg.correctIndex]}) ${msg.correctText}`;
        $('result-explain').textContent = msg.explanation;
        $('result-next').textContent = msg.isLast ? 'Menghitung hasil akhir...' : 'Soal berikutnya segera muncul...';
        renderBoard($('result-board'), msg.scoreboard);
        $('result-box').hidden = false;
        $('result-box').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        break;
      }

      case 'final': {
        stopTimer();
        showView('final');
        const board = msg.scoreboard;

        const podium = $('podium');
        podium.replaceChildren();
        [1, 0, 2].forEach((idx) => { // tampil: juara 2, 1, 3
          const p = board[idx];
          if (!p) return;
          const pod = el('div', 'pod p' + (idx + 1));
          pod.append(avatarEl(p, idx === 0 ? 'xl' : 'lg', false));
          pod.append(el('div', 'pname', p.name), el('div', 'pscore', p.score + ' poin'));
          pod.append(el('div', 'block', ['🥇', '🥈', '🥉'][idx]));
          podium.append(pod);
        });

        const rank = board.findIndex((b) => b.name === me.name) + 1;
        $('final-me').textContent = rank === 1
          ? 'Kamu juara 1! Memang paling jago 👑'
          : `Kamu di peringkat ${rank} dari ${board.length} pemain.`;
        renderBoard($('final-board'), board.map((b) => ({ ...b, gained: undefined })));
        renderLobby();
        sfx.win();
        confetti();
        break;
      }

      case 'error':
        if (!joined) {
          $('join-error').textContent = msg.text;
          $('join-btn').disabled = false;
        } else {
          addChat('sys', '', '⚠ ' + msg.text);
        }
        break;
    }
  }

  // ---------- Koneksi WebSocket ----------
  ws.addEventListener('open', () => setConn(true));
  ws.addEventListener('close', () => {
    setConn(false);
    stopTimer();
    $('overlay').hidden = false;
  });
  ws.addEventListener('message', (e) => {
    try {
      handleServerMessage(JSON.parse(e.data));
    } catch (err) {
      console.error('Pesan tidak valid', err);
    }
  });

  // ---------- Event UI ----------
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name-input').value.trim();
    if (!name || !chosen) return;
    $('join-error').textContent = '';
    $('join-btn').disabled = true;
    send({ type: 'join', name, avatar: chosen });
  });

  $('start-btn').addEventListener('click', () => send({ type: 'start' }));
  $('again-btn').addEventListener('click', () => send({ type: 'start' }));

  $('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('chat-input').value.trim();
    if (!text) return;
    send({ type: 'chat', text });
    addChat('mine', me.name, text);
    $('chat-input').value = '';
  });

  $('mute-btn').addEventListener('click', () => {
    muted = !muted;
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
  });

  // Pintasan keyboard: A-D / 1-4 untuk menjawab
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || $('view-question').hidden || selected !== null) return;
    const idx = 'abcd'.indexOf(e.key.toLowerCase());
    const n = idx !== -1 ? idx : parseInt(e.key, 10) - 1;
    const btns = $('options').querySelectorAll('.option');
    if (btns[n] && !btns[n].disabled) btns[n].click();
  });
})();
