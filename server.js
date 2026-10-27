// ============================================================
//  JAGOKUIS - SERVER
//  HTTP (menyajikan halaman web) + WebSocket (komunikasi real-time)
//
//  Protokol: setiap pesan adalah 1 objek JSON (satu frame WebSocket).
// ============================================================
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { WebSocketServer } = require("ws");
const QUESTION_BANK = require("./questions");

// ---------- Konfigurasi ----------
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = "0.0.0.0"; // agar bisa diakses dari laptop/HP lain
const PUBLIC_DIR = path.join(__dirname, "public");
const TIME_LIMIT = 15; // detik per soal
const QUESTIONS_PER_GAME = 8;
const BASE_POINT = 100; // poin dasar jawaban benar
const MAX_SPEED_BONUS = 50; // bonus kecepatan
const COMBO_STEP = 10; // bonus per level combo (jawaban benar beruntun)
const MAX_COMBO_BONUS = 30;
const RESULT_DELAY = parseInt(process.env.RESULT_DELAY_MS, 10) || 6000;

// Karakter dan warna pemain (maksimal pemain = jumlah karakter)
const AVATARS = [
  "🦊",
  "🐼",
  "🦁",
  "🐯",
  "🐸",
  "🐙",
  "🦄",
  "🐧",
  "🦉",
  "🐲",
  "🐵",
  "🦖",
];
const COLORS = [
  "#ff5470",
  "#4da3ff",
  "#ffb830",
  "#2ee59d",
  "#a77bff",
  "#ff8a3d",
  "#22d3ee",
  "#ff4fa3",
  "#9be15d",
  "#f4d03f",
  "#7c8cff",
  "#ff7a7a",
];
const MAX_PLAYERS = AVATARS.length;

// ---------- HTTP server (file statis) ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const httpServer = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad request");
  }
  if (urlPath === "/") urlPath = "/index.html";

  // Cegah akses di luar folder public (path traversal)
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 - Halaman tidak ditemukan");
    }
    const type = MIME[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

// ---------- WebSocket server ----------
const wss = new WebSocketServer({ server: httpServer, maxPayload: 10 * 1024 });

// ---------- State permainan ----------
// ws -> { name, avatar, color, score, answered, gained, combo, streak, correct }
const players = new Map();
let host = null;
let state = "lobby"; // 'lobby' | 'question' | 'between'
let questions = [];
let current = -1;
let timer = null;
let questionStart = 0;

// ---------- Fungsi bantu ----------
function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, except = null) {
  for (const ws of players.keys()) {
    if (ws !== except) send(ws, obj);
  }
}

const info = (text) => ({ type: "info", text });

function publicPlayer(ws, p) {
  return {
    name: p.name,
    avatar: p.avatar,
    color: p.color,
    score: p.score,
    streak: p.streak,
    isHost: ws === host,
    answered: p.answered,
  };
}

function scoreboard() {
  return [...players.values()]
    .map((p) => ({
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      score: p.score,
      gained: p.gained,
      streak: p.streak,
      answered: p.answered,
      correct: p.correct,
    }))
    .sort((a, b) => b.score - a.score);
}

// Daftar pemain terbaru, dikirim ke semua pemain
function pushPlayers() {
  broadcast({
    type: "players",
    state,
    players: [...players.entries()].map(([ws, p]) => publicPlayer(ws, p)),
  });
}

// Karakter yang sudah dipakai, dikirim ke semua koneksi (termasuk yang belum join)
function pushTaken() {
  const taken = [...players.values()].map((p) => p.avatar);
  for (const ws of wss.clients) {
    if (!players.has(ws)) send(ws, { type: "hello", avatars: AVATARS, taken });
  }
}

function freeColor() {
  const used = new Set([...players.values()].map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[0];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function log(text) {
  console.log(`[${new Date().toLocaleTimeString("id-ID")}] ${text}`);
}

// ---------- Alur permainan ----------
function startGame() {
  questions = shuffle(QUESTION_BANK).slice(0, QUESTIONS_PER_GAME);
  current = -1;
  for (const p of players.values()) {
    p.score = 0;
    p.streak = 0;
    p.gained = 0;
    p.combo = 0;
    p.answered = false;
    p.correct = false;
  }
  state = "between";
  broadcast({ type: "gameStart", total: questions.length });
  pushPlayers();
  log(`Game dimulai dengan ${players.size} pemain`);
  timer = setTimeout(nextQuestion, 2500);
}

function nextQuestion() {
  current++;
  if (current >= questions.length) return endGame();

  const q = questions[current];
  for (const p of players.values()) {
    p.answered = false;
    p.correct = false;
    p.gained = 0;
    p.combo = 0;
  }

  state = "question";
  questionStart = Date.now();
  broadcast({
    type: "question",
    number: current + 1,
    total: questions.length,
    text: q.text,
    options: q.options,
    timeLimit: TIME_LIMIT,
  });
  pushPlayers();
  timer = setTimeout(finishRound, TIME_LIMIT * 1000);
}

function finishRound() {
  if (state !== "question") return;
  clearTimeout(timer);
  state = "between";

  // Pemain yang tidak menjawab: combo terputus
  for (const p of players.values()) {
    if (!p.answered) p.streak = 0;
  }

  const q = questions[current];
  const board = scoreboard();
  for (const [ws, p] of players) {
    send(ws, {
      type: "result",
      correctIndex: q.answer,
      correctText: q.options[q.answer],
      explanation: q.explanation,
      answered: p.answered,
      correct: p.correct,
      gained: p.gained,
      combo: p.combo,
      streak: p.streak,
      score: p.score,
      isLast: current === questions.length - 1,
      scoreboard: board,
    });
  }
  pushPlayers();
  timer = setTimeout(nextQuestion, RESULT_DELAY);
}

function endGame() {
  const board = scoreboard();
  state = "lobby";
  current = -1;
  timer = null;
  broadcast({ type: "final", scoreboard: board });
  pushPlayers();
  log(`Game selesai. Juara: ${board[0] ? board[0].name : "-"}`);
}

function resetGame() {
  clearTimeout(timer);
  timer = null;
  state = "lobby";
  current = -1;
}

function handleAnswer(ws, player, choice) {
  if (state !== "question") return send(ws, info("Belum ada soal yang aktif."));
  if (player.answered) return send(ws, info("Kamu sudah menjawab soal ini."));

  const q = questions[current];
  const raw = String(choice).trim().toUpperCase();
  let index = "ABCD".indexOf(raw);
  if (index === -1) index = parseInt(raw, 10) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= q.options.length) {
    return send(ws, info("Pilihan tidak valid."));
  }

  player.answered = true;
  const elapsed = Date.now() - questionStart;

  if (index === q.answer) {
    player.correct = true;
    player.streak += 1;
    const ratio = Math.max(0, 1 - elapsed / (TIME_LIMIT * 1000));
    const speed = Math.round(MAX_SPEED_BONUS * ratio);
    player.combo = Math.min(MAX_COMBO_BONUS, (player.streak - 1) * COMBO_STEP);
    player.gained = BASE_POINT + speed + player.combo;
    player.score += player.gained;
  } else {
    player.streak = 0;
  }

  send(ws, { type: "answered", index });
  pushPlayers();

  if ([...players.values()].every((p) => p.answered)) finishRound();
}

// ---------- Penanganan pesan dari client ----------
function handleMessage(ws, msg) {
  let player = players.get(ws);

  // Pemain wajib join dulu
  if (!player) {
    if (msg.type !== "join") {
      return send(ws, { type: "error", text: 'Kirim "join" terlebih dahulu.' });
    }
    const name = String(msg.name || "")
      .trim()
      .slice(0, 15);
    if (name === "") {
      return send(ws, { type: "error", text: "Nama tidak boleh kosong." });
    }
    if (
      [...players.values()].some(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return send(ws, { type: "error", text: `Nama "${name}" sudah dipakai.` });
    }
    if (state !== "lobby") {
      return send(ws, {
        type: "error",
        text: "Permainan sedang berjalan. Coba lagi setelah selesai.",
      });
    }
    if (players.size >= MAX_PLAYERS) {
      return send(ws, { type: "error", text: "Ruangan penuh." });
    }
    if (!AVATARS.includes(msg.avatar)) {
      return send(ws, {
        type: "error",
        text: "Pilih karakter terlebih dahulu.",
      });
    }
    if ([...players.values()].some((p) => p.avatar === msg.avatar)) {
      pushTaken();
      return send(ws, {
        type: "error",
        text: "Karakter itu sudah dipilih pemain lain.",
      });
    }

    player = {
      name,
      avatar: msg.avatar,
      color: freeColor(),
      score: 0,
      answered: false,
      gained: 0,
      combo: 0,
      streak: 0,
      correct: false,
    };
    players.set(ws, player);
    if (!host) host = ws;

    send(ws, {
      type: "welcome",
      name,
      avatar: player.avatar,
      color: player.color,
    });
    broadcast(info(`${player.avatar} ${name} bergabung ke ruangan.`), ws);
    pushPlayers();
    pushTaken();
    log(`"${name}" ${player.avatar} bergabung (${players.size} pemain)`);
    return;
  }

  switch (msg.type) {
    case "start":
      if (ws !== host)
        return send(ws, info("Hanya host yang boleh memulai permainan."));
      if (state !== "lobby") return send(ws, info("Permainan sudah berjalan."));
      return startGame();

    case "answer":
      return handleAnswer(ws, player, msg.choice);

    case "chat": {
      const text = String(msg.text || "")
        .trim()
        .slice(0, 200);
      if (text === "") return send(ws, info("Pesan kosong ditolak."));
      return broadcast({ type: "chat", from: player.name, text }, ws);
    }

    default:
      return send(ws, info(`Perintah tidak dikenal: ${msg.type}`));
  }
}

wss.on("connection", (ws, req) => {
  const address = req.socket.remoteAddress;
  log(`Koneksi baru dari ${address}`);
  send(ws, {
    type: "hello",
    avatars: AVATARS,
    taken: [...players.values()].map((p) => p.avatar),
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) {
      return send(ws, {
        type: "error",
        text: "Format pesan bukan JSON yang valid.",
      });
    }
    if (typeof msg !== "object" || msg === null) return;
    handleMessage(ws, msg);
  });

  ws.on("close", () => {
    const player = players.get(ws);
    if (!player) return;

    players.delete(ws);
    log(`"${player.name}" keluar (${players.size} pemain)`);

    if (host === ws) {
      host = players.size > 0 ? players.keys().next().value : null;
      if (host) send(host, info("Kamu sekarang menjadi host 👑"));
    }

    pushTaken();
    if (players.size === 0) {
      resetGame();
      return;
    }
    broadcast(info(`${player.avatar} ${player.name} keluar dari ruangan.`));
    pushPlayers();

    if (
      state === "question" &&
      [...players.values()].every((p) => p.answered)
    ) {
      finishRound();
    }
  });

  ws.on("error", (err) => log(`Error ${address}: ${err.message}`));
});

httpServer.on("error", (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

httpServer.listen(PORT, HOST, () => {
  console.log("==============================================");
  console.log("  JAGOKUIS - SERVER");
  console.log(`  Buka di browser: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) {
        console.log(`  Dari perangkat lain: http://${i.address}:${PORT}`);
      }
    }
  }
  console.log("  (Ctrl+C untuk berhenti)");
  console.log("==============================================");
});
