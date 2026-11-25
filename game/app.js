// Warung Senja — an original dusk-stall cooking game.
// You run a small Indonesian street-food stall at dusk. Customers order from
// the board, you build their dish from ingredients on the counter, and you
// serve it before their patience runs out. All art is drawn in code; all
// sounds are synthesized with WebAudio. No network, no external assets.

'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960;
const H = 600;

// ---------------------------------------------------------------------------
// Data: ingredients and dishes. Every dish is a set of ingredient ids.
// ---------------------------------------------------------------------------
const INGREDIENTS = [
  { id: 'nasi',   name: 'Nasi',   short: 'NS', key: '1', color: '#f2ead8' },
  { id: 'mie',    name: 'Mie',    short: 'MI', key: '2', color: '#f5c04e' },
  { id: 'ayam',   name: 'Ayam',   short: 'AY', key: '3', color: '#d97b4f' },
  { id: 'telur',  name: 'Telur',  short: 'TE', key: '4', color: '#ffe9a8' },
  { id: 'cabai',  name: 'Cabai',  short: 'CA', key: '5', color: '#d9382b' },
  { id: 'sayur',  name: 'Sayur',  short: 'SA', key: '6', color: '#58b368' },
  { id: 'sate',   name: 'Sate',   short: 'ST', key: '7', color: '#a0663a' },
  { id: 'teh',    name: 'Teh',    short: 'TH', key: '8', color: '#b4762a' },
  { id: 'gula',   name: 'Gula',   short: 'GU', key: '9', color: '#ffffff' },
  { id: 'es',     name: 'Es',     short: 'ES', key: '0', color: '#a8d8ea' },
];

const DISHES = [
  {
    id: 'nasgor', name: 'Nasi Goreng Senja', price: 100,
    recipe: ['nasi', 'telur', 'cabai', 'ayam'], color: '#e2703a',
  },
  {
    id: 'mieayam', name: 'Mie Ayam Senja', price: 90,
    recipe: ['mie', 'ayam', 'sayur'], color: '#f5c04e',
  },
  {
    id: 'sate', name: 'Sate Ayam', price: 110,
    recipe: ['sate', 'ayam', 'cabai'], color: '#a0663a',
  },
  {
    id: 'esteh', name: 'Es Teh Manis', price: 60,
    recipe: ['teh', 'gula', 'es'], color: '#b4762a',
  },
];

const ING = {};
for (const ing of INGREDIENTS) ING[ing.id] = ing;
const DISH = {};
for (const dish of DISHES) DISH[dish.id] = dish;

const SHIFT_SECONDS = 180;      // one shift lasts 3 minutes
const ORDER_PATIENCE = 45;      // seconds before a customer walks away
const MAX_ORDERS = 3;           // tickets on the board at once
const SPAWN_EVERY = 12;         // seconds between new orders

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  screen: 'title',               // 'title' | 'playing' | 'results'
  timeLeft: SHIFT_SECONDS,
  score: 0,
  served: 0,
  bestCombo: 0,
  combo: 0,
  orders: [],                    // {id, dishId, patience, max}
  plate: [],                     // ingredient ids on the plate
  nextOrderId: 1,
  spawnIn: 4,
  message: '',                   // floating feedback text
  messageAt: 0,
  messageColor: '#ffe9a8',
  startedAt: 0,
};

function now() { return performance.now() / 1000; }

function resetGame() {
  state.screen = 'playing';
  state.timeLeft = SHIFT_SECONDS;
  state.score = 0;
  state.served = 0;
  state.bestCombo = 0;
  state.combo = 0;
  state.orders = [];
  state.plate = [];
  state.nextOrderId = 1;
  state.spawnIn = 4;
  state.message = '';
  state.startedAt = now();
}

function spawnOrder(dishId) {
  const pick = dishId || DISHES[Math.floor(Math.random() * DISHES.length)].id;
  state.orders.push({
    id: state.nextOrderId++,
    dishId: pick,
    patience: ORDER_PATIENCE,
    max: ORDER_PATIENCE,
  });
}

function dishMatchesPlate(dishId) {
  const recipe = DISH[dishId].recipe.slice().sort().join(',');
  const plate = state.plate.slice().sort().join(',');
  return recipe === plate;
}

function plateMatchesAnyOrder() {
  return state.orders.find((o) => dishMatchesPlate(o.dishId)) || null;
}

// ---------------------------------------------------------------------------
// Sound: tiny synthesized blips, created only after a user gesture.
// ---------------------------------------------------------------------------
let audioCtx = null;
function beep(freq, dur, type, vol) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) { /* sound is optional; the game plays fine silent */ }
}
function soundClick() { beep(520, 0.07, 'triangle', 0.06); }
function soundServe() { beep(660, 0.1, 'sine', 0.09); setTimeout(() => beep(880, 0.14, 'sine', 0.09), 90); }
function soundBad() { beep(180, 0.18, 'sawtooth', 0.05); }
function soundTick() { beep(980, 0.05, 'square', 0.03); }

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function flash(message, color) {
  state.message = message;
  state.messageAt = now();
  state.messageColor = color || '#ffe9a8';
}

function addIngredient(id) {
  if (state.screen !== 'playing') return;
  if (state.plate.length >= 6) { flash('Piring penuh! Sajikan dulu.', '#ff9d9d'); soundBad(); return; }
  state.plate.push(id);
  soundClick();
}

function clearPlate() {
  if (state.screen !== 'playing') return;
  state.plate = [];
  soundClick();
}

function servePlate() {
  if (state.screen !== 'playing') return;
  if (state.plate.length === 0) { flash('Piring masih kosong.', '#ff9d9d'); soundBad(); return; }
  const order = plateMatchesAnyOrder();
  if (!order) {
    state.combo = 0;
    state.plate = [];
    flash('Salah racikan! Kombo putus.', '#ff9d9d');
    soundBad();
    return;
  }
  const dish = DISH[order.dishId];
  const timeBonus = Math.round(order.patience) * 2;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const mult = 1 + Math.min(state.combo - 1, 10) * 0.1;
  const gained = Math.round((dish.price + timeBonus) * mult);
  state.score += gained;
  state.served += 1;
  state.orders = state.orders.filter((o) => o.id !== order.id);
  state.plate = [];
  flash('+' + gained + '  ' + dish.name + (state.combo > 1 ? '  (kombo x' + state.combo + ')' : ''), '#ffe9a8');
  soundServe();
}

function starsFor(score, served) {
  if (served >= 12 && score >= 1800) return 3;
  if (served >= 8 && score >= 1100) return 2;
  if (served >= 4) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Update loop
// ---------------------------------------------------------------------------
let lastTs = 0;
let warnedLow = false;

function update(dt) {
  if (state.screen !== 'playing') return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 10 && !warnedLow) {
    warnedLow = true;
    soundTick();
  }
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.screen = 'results';
    return;
  }
  for (const order of state.orders) order.patience -= dt;
  const before = state.orders.length;
  state.orders = state.orders.filter((o) => {
    if (o.patience <= 0) {
      state.combo = 0;
      flash('Pelanggan pergi! Kombo putus.', '#ff9d9d');
      soundBad();
      return false;
    }
    return true;
  });
  if (state.orders.length !== before) warnedLow = false;
  state.spawnIn -= dt;
  if (state.spawnIn <= 0 && state.orders.length < MAX_ORDERS) {
    spawnOrder();
    state.spawnIn = SPAWN_EVERY;
  }
}

function loop(ts) {
  const dt = Math.min((ts - lastTs) / 1000 || 0, 0.1);
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(str, x, y, size, color, align, weight) {
  ctx.fillStyle = color || '#f5e9d0';
  ctx.font = (weight || 'bold') + ' ' + size + 'px "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function ingredientChip(ing, x, y, s) {
  rr(x, y, s, s, s * 0.18);
  ctx.fillStyle = ing.color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  text(ing.short, x + s / 2, y + s / 2 + 1, Math.round(s * 0.34), '#241a3d', 'center', 'bold');
}

function formatTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Layout (canvas 960x600)
const BOARD = { x: 16, y: 64, w: 250, h: 340 };
const PLATE = { x: 380, y: 150, w: 200, h: 150 };
const SERVE_BTN = { x: 405, y: 320, w: 150, h: 46 };
const CLEAR_BTN = { x: 405, y: 374, w: 150, h: 30 };
const COUNTER = { x: 16, y: 430, w: 928, h: 150 };
const START_BTN = { x: 380, y: 430, w: 200, h: 56 };

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2b1d4e');
  g.addColorStop(0.55, '#4a2b52');
  g.addColorStop(1, '#241a3d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // string lights (kept above the title row so they never cover text)
  ctx.fillStyle = '#ffd98a';
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 105;
    const y = 12 + Math.sin(i * 1.3) * 3;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,217,138,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(40, 10);
  ctx.quadraticCurveTo(480, 20, 920, 10);
  ctx.stroke();
  // awning stripes
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 2 ? '#e2703a' : '#f5e9d0';
    ctx.fillRect(16 + i * 78, 44, 78, 14);
  }
}

function drawTopBar() {
  text('WARUNG SENJA', 16, 34, 22, '#ffd98a', 'left', 'bold');
  text('Skor ' + state.score, 640, 34, 20, '#f5e9d0', 'left', 'bold');
  if (state.combo > 1) text('Kombo x' + state.combo, 770, 34, 20, '#ffb347', 'left', 'bold');
  text('⏱ ' + formatTime(state.timeLeft), 880, 34, 20, state.timeLeft <= 10 ? '#ff6b6b' : '#f5e9d0', 'left', 'bold');
  // shift progress bar (below the awning so it never covers it)
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(600, 60, 344, 6, 3);
  ctx.fill();
  ctx.fillStyle = state.timeLeft <= 10 ? '#ff6b6b' : '#58b368';
  rr(600, 60, 344 * (state.timeLeft / SHIFT_SECONDS), 6, 3);
  ctx.fill();
}

function drawBoard() {
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  rr(BOARD.x, BOARD.y, BOARD.w, BOARD.h, 12);
  ctx.fill();
  ctx.strokeStyle = '#ffd98a';
  ctx.lineWidth = 2;
  ctx.stroke();
  text('PESANAN', BOARD.x + 16, BOARD.y + 24, 18, '#ffd98a', 'left', 'bold');
  if (state.orders.length === 0) {
    text('Belum ada pesanan…', BOARD.x + 16, BOARD.y + 70, 15, '#cbbd9d', 'left', 'normal');
  }
  state.orders.forEach((order, i) => {
    const dish = DISH[order.dishId];
    const y = BOARD.y + 56 + i * 100;
    const urgent = order.patience <= 12;
    ctx.fillStyle = urgent ? 'rgba(217,56,43,0.30)' : 'rgba(255,255,255,0.07)';
    rr(BOARD.x + 10, y, BOARD.w - 20, 88, 10);
    ctx.fill();
    ctx.fillStyle = dish.color;
    ctx.beginPath();
    ctx.arc(BOARD.x + 34, y + 26, 14, 0, Math.PI * 2);
    ctx.fill();
    text(dish.name, BOARD.x + 56, y + 20, 16, '#f5e9d0', 'left', 'bold');
    text('Rp' + dish.price, BOARD.x + 56, y + 42, 13, '#ffd98a', 'left', 'normal');
    dish.recipe.forEach((ingId, j) => {
      ingredientChip(ING[ingId], BOARD.x + 14 + j * 34, y + 54, 28);
    });
    const frac = Math.max(0, order.patience / order.max);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    rr(BOARD.x + 150, y + 62, 76, 10, 5);
    ctx.fill();
    ctx.fillStyle = urgent ? '#ff6b6b' : '#58b368';
    rr(BOARD.x + 150, y + 62, 76 * frac, 10, 5);
    ctx.fill();
    text(Math.ceil(order.patience) + ' dtk', BOARD.x + 150, y + 82, 12, urgent ? '#ff9d9d' : '#cbbd9d', 'left', 'normal');
  });
}

function drawPlate() {
  text('PIRING', PLATE.x + PLATE.w / 2, PLATE.y - 16, 16, '#ffd98a', 'center', 'bold');
  ctx.fillStyle = '#f5e9d0';
  ctx.beginPath();
  ctx.ellipse(PLATE.x + PLATE.w / 2, PLATE.y + PLATE.h / 2 + 18, 96, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8dcc3';
  ctx.beginPath();
  ctx.ellipse(PLATE.x + PLATE.w / 2, PLATE.y + PLATE.h / 2 + 14, 72, 32, 0, 0, Math.PI * 2);
  ctx.fill();
  if (state.plate.length === 0) {
    text('Piring kosong', PLATE.x + PLATE.w / 2, PLATE.y + PLATE.h / 2 + 16, 14, '#8a7a5c', 'center', 'normal');
  } else {
    state.plate.forEach((ingId, i) => {
      const cols = 3;
      const x = PLATE.x + 34 + (i % cols) * 62;
      const y = PLATE.y + 22 + Math.floor(i / cols) * 52;
      ingredientChip(ING[ingId], x, y, 46);
    });
    const match = plateMatchesAnyOrder();
    if (match) {
      text('✓ Siap disajikan: ' + DISH[match.dishId].name, PLATE.x + PLATE.w / 2, PLATE.y + PLATE.h - 6, 14, '#7ddb8a', 'center', 'bold');
    }
  }
  // serve button
  const ready = plateMatchesAnyOrder() !== null;
  ctx.fillStyle = ready ? '#58b368' : '#6b5d7a';
  rr(SERVE_BTN.x, SERVE_BTN.y, SERVE_BTN.w, SERVE_BTN.h, 10);
  ctx.fill();
  text('🔔 SAJIKAN (Spasi)', SERVE_BTN.x + SERVE_BTN.w / 2, SERVE_BTN.y + SERVE_BTN.h / 2, 15, '#ffffff', 'center', 'bold');
  ctx.fillStyle = '#4a3d63';
  rr(CLEAR_BTN.x, CLEAR_BTN.y, CLEAR_BTN.w, CLEAR_BTN.h, 8);
  ctx.fill();
  text('Bersihkan (R)', CLEAR_BTN.x + CLEAR_BTN.w / 2, CLEAR_BTN.y + CLEAR_BTN.h / 2, 13, '#f5e9d0', 'center', 'bold');
}

function drawCounter() {
  ctx.fillStyle = 'rgba(20,12,40,0.72)';
  rr(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h, 12);
  ctx.fill();
  text('BAHAN DI MEJA — klik atau tekan tombol angka', COUNTER.x + 16, COUNTER.y + 22, 15, '#ffd98a', 'left', 'bold');
  INGREDIENTS.forEach((ing, i) => {
    const x = COUNTER.x + 16 + (i % 5) * 182;
    const y = COUNTER.y + 44 + Math.floor(i / 5) * 52;
    const inPlate = state.plate.includes(ing.id);
    ctx.fillStyle = inPlate ? 'rgba(88,179,104,0.35)' : 'rgba(255,255,255,0.08)';
    rr(x, y, 170, 44, 10);
    ctx.fill();
    ingredientChip(ing, x + 6, y + 6, 32);
    text(ing.name, x + 46, y + 15, 15, '#f5e9d0', 'left', 'bold');
    text('[' + ing.key + ']', x + 46, y + 32, 12, '#cbbd9d', 'left', 'normal');
  });
}

function drawMenu() {
  text('MENU MALAM INI', 640, 84, 16, '#ffd98a', 'left', 'bold');
  DISHES.forEach((dish, i) => {
    const y = 108 + i * 72;
    ctx.fillStyle = 'rgba(20,12,40,0.6)';
    rr(640, y, 304, 62, 10);
    ctx.fill();
    ctx.fillStyle = dish.color;
    ctx.beginPath();
    ctx.arc(664, y + 31, 13, 0, Math.PI * 2);
    ctx.fill();
    text(dish.name + '  ·  Rp' + dish.price, 684, y + 20, 15, '#f5e9d0', 'left', 'bold');
    dish.recipe.forEach((ingId, j) => {
      ingredientChip(ING[ingId], 684 + j * 32, y + 34, 26);
    });
  });
}

function drawMessage() {
  if (!state.message) return;
  const age = now() - state.messageAt;
  if (age > 2.2) { state.message = ''; return; }
  ctx.globalAlpha = age > 1.6 ? Math.max(0, (2.2 - age) / 0.6) : 1;
  text(state.message, W / 2, 408, 20, state.messageColor, 'center', 'bold');
  ctx.globalAlpha = 1;
}

function drawTitle() {
  ctx.fillStyle = 'rgba(10,6,24,0.55)';
  ctx.fillRect(0, 0, W, H);
  text('WARUNG SENJA', W / 2, 190, 56, '#ffd98a', 'center', 'bold');
  text('Game masak di warung kaki lima saat senja', W / 2, 240, 20, '#f5e9d0', 'center', 'normal');
  text('Bangun pesanan dari bahan di meja, sajikan sebelum pelanggan pergi.', W / 2, 268, 16, '#cbbd9d', 'center', 'normal');
  text('Satu shift: 3 menit  ·  4 hidangan  ·  10 bahan', W / 2, 296, 16, '#cbbd9d', 'center', 'normal');
  ctx.fillStyle = '#58b368';
  rr(START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 12);
  ctx.fill();
  text('▶  MULAI MASAK', START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2, 20, '#ffffff', 'center', 'bold');
  text('Klik bahan atau tekan 1–0  ·  Spasi menyajikan  ·  R membersihkan piring', W / 2, 520, 14, '#cbbd9d', 'center', 'normal');
}

function drawResults() {
  ctx.fillStyle = 'rgba(10,6,24,0.6)';
  ctx.fillRect(0, 0, W, H);
  text('SHIFT SELESAI', W / 2, 170, 44, '#ffd98a', 'center', 'bold');
  text('Skor akhir: ' + state.score, W / 2, 240, 26, '#f5e9d0', 'center', 'bold');
  text('Hidangan disajikan: ' + state.served + '   ·   Kombo terbaik: x' + state.bestCombo, W / 2, 282, 18, '#cbbd9d', 'center', 'normal');
  const stars = starsFor(state.score, state.served);
  text('★'.repeat(stars) + '☆'.repeat(3 - stars), W / 2, 330, 40, '#ffd98a', 'center', 'bold');
  text(stars === 3 ? 'Warung legenda! Pelanggan antre sampai ujung jalan.' : stars === 2 ? 'Warung ramai! Pertahankan kombo.' : stars === 1 ? 'Lumayan — latihan lagi besok senja.' : 'Warung sepi… coba lagi, juru masak!', W / 2, 380, 16, '#f5e9d0', 'center', 'normal');
  ctx.fillStyle = '#58b368';
  rr(START_BTN.x, START_BTN.y, START_BTN.w, START_BTN.h, 12);
  ctx.fill();
  text('↻  MAIN LAGI', START_BTN.x + START_BTN.w / 2, START_BTN.y + START_BTN.h / 2, 20, '#ffffff', 'center', 'bold');
}

function draw() {
  drawBackground();
  if (state.screen === 'title') { drawTitle(); return; }
  if (state.screen === 'results') { drawResults(); return; }
  drawTopBar();
  drawBoard();
  drawPlate();
  drawCounter();
  drawMenu();
  drawMessage();
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
function hitBox(box, x, y) {
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (W / rect.width),
    y: (evt.clientY - rect.top) * (H / rect.height),
  };
}

canvas.addEventListener('click', (evt) => {
  const p = canvasPos(evt);
  if (state.screen === 'title' || state.screen === 'results') {
    if (hitBox(START_BTN, p.x, p.y)) { warnedLow = false; resetGame(); }
    return;
  }
  if (hitBox(SERVE_BTN, p.x, p.y)) { servePlate(); return; }
  if (hitBox(CLEAR_BTN, p.x, p.y)) { clearPlate(); return; }
  for (let i = 0; i < INGREDIENTS.length; i++) {
    const x = COUNTER.x + 16 + (i % 5) * 182;
    const y = COUNTER.y + 44 + Math.floor(i / 5) * 52;
    if (hitBox({ x, y, w: 170, h: 44 }, p.x, p.y)) { addIngredient(INGREDIENTS[i].id); return; }
  }
});

document.addEventListener('keydown', (evt) => {
  if (state.screen === 'title' || state.screen === 'results') {
    if (evt.key === 'Enter' || evt.key === ' ') { warnedLow = false; resetGame(); }
    return;
  }
  if (evt.key === ' ') { evt.preventDefault(); servePlate(); return; }
  if (evt.key === 'r' || evt.key === 'R') { clearPlate(); return; }
  const ing = INGREDIENTS.find((g) => g.key === evt.key);
  if (ing) addIngredient(ing.id);
});

// ---------------------------------------------------------------------------
// Staged screenshots: ?shot=start | play | serve | end
// Deterministic states so screenshots are real renders of fixed moments.
// ---------------------------------------------------------------------------
function stageShot(name) {
  if (name === 'start') {
    state.screen = 'title';
  } else if (name === 'play') {
    resetGame();
    state.timeLeft = 142;
    state.score = 320;
    state.combo = 2;
    state.bestCombo = 2;
    state.orders = [
      { id: 1, dishId: 'nasgor', patience: 31, max: ORDER_PATIENCE },
      { id: 2, dishId: 'mieayam', patience: 18, max: ORDER_PATIENCE },
    ];
    state.nextOrderId = 3;
    state.plate = ['nasi', 'telur', 'cabai'];
    state.spawnIn = 8;
  } else if (name === 'serve') {
    resetGame();
    state.timeLeft = 96;
    state.score = 740;
    state.combo = 4;
    state.bestCombo = 4;
    state.orders = [
      { id: 1, dishId: 'nasgor', patience: 26, max: ORDER_PATIENCE },
      { id: 2, dishId: 'sate', patience: 38, max: ORDER_PATIENCE },
    ];
    state.nextOrderId = 3;
    state.plate = ['nasi', 'telur', 'cabai', 'ayam'];
    state.spawnIn = 6;
  } else if (name === 'end') {
    resetGame();
    state.screen = 'results';
    state.score = 2140;
    state.served = 13;
    state.bestCombo = 6;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
(function boot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (shot) {
    stageShot(shot);
  } else {
    state.screen = 'title';
  }
  // Expose a tiny handle for automated play-tests.
  window.__warung = { state, resetGame, addIngredient, servePlate, spawnOrder, DISHES, INGREDIENTS };
  requestAnimationFrame(loop);
})();
