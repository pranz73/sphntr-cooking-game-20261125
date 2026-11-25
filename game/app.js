'use strict';

// Warung Senja — warung kaki lima di waktu senja.
// Rakit hidangan dari bahan di konter, sajikan sebelum kesabaran pelanggan habis.

const INGREDIENTS = [
  { id: 'nasi', label: 'Nasi', key: '1' },
  { id: 'mie', label: 'Mie', key: '2' },
  { id: 'ayam', label: 'Ayam', key: '3' },
  { id: 'telur', label: 'Telur', key: '4' },
  { id: 'kecap', label: 'Kecap', key: '5' },
  { id: 'sambal', label: 'Sambal', key: '6' },
  { id: 'bawang', label: 'Bawang', key: '7' },
  { id: 'sate', label: 'Tusuk Sate', key: '8' },
  { id: 'teh', label: 'Teh', key: '9' },
  { id: 'gula', label: 'Gula', key: '0' },
  { id: 'es', label: 'Es Batu', key: 'q' },
];

const DISHES = [
  { id: 'nasgor', label: 'Nasi Goreng Senja', price: 15000, recipe: ['nasi', 'telur', 'kecap', 'bawang'] },
  { id: 'mieayam', label: 'Mie Ayam Senja', price: 14000, recipe: ['mie', 'ayam', 'bawang', 'sambal'] },
  { id: 'sateayam', label: 'Sate Ayam', price: 18000, recipe: ['ayam', 'sate', 'kecap', 'sambal'] },
  { id: 'esteh', label: 'Es Teh Manis', price: 8000, recipe: ['teh', 'gula', 'es'] },
];

const NAMES = ['Bu Ratna', 'Pak Budi', 'Mbak Sari', 'Mas Joko', 'Dek Ani', 'Pak Slamet', 'Bu Dewi', 'Kak Rina'];
const SHIFT_SECONDS = 180;
const PATIENCE_SECONDS = 32;
const MAX_CUSTOMERS = 3;
const SPAWN_EVERY_MS = 9000;

const state = {
  running: false,
  timeLeft: SHIFT_SECONDS,
  coins: 0,
  combo: 1,
  bestCombo: 1,
  served: 0,
  customers: [],
  selectedId: null,
  plate: new Set(),
  nextCustomer: 1,
  spawnInMs: 0,
};

let audioCtx = null;
let timerId = null;

const $ = (id) => document.getElementById(id);

function dishById(id) { return DISHES.find((d) => d.id === id); }
function customerById(id) { return state.customers.find((c) => c.id === id); }
function ingLabel(id) { const ing = INGREDIENTS.find((i) => i.id === id); return ing ? ing.label : id; }

function blip(freq, dur) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) { /* suara opsional; game tetap jalan tanpa audio */ }
}

function setMessage(text) { $('message').textContent = text; }

function spawnCustomer(prefill) {
  if (state.customers.length >= MAX_CUSTOMERS) return null;
  const dish = DISHES[Math.floor(Math.random() * DISHES.length)];
  const c = {
    id: state.nextCustomer++,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    dishId: dish.id,
    patience: PATIENCE_SECONDS,
  };
  state.customers.push(c);
  if (!state.selectedId) state.selectedId = c.id;
  if (prefill) {
    state.selectedId = c.id;
    dish.recipe.forEach((ing) => state.plate.add(ing));
  }
  return c;
}

function removeCustomer(id) {
  state.customers = state.customers.filter((c) => c.id !== id);
  if (state.selectedId === id) {
    state.selectedId = state.customers.length ? state.customers[0].id : null;
  }
}

function selectCustomer(id) {
  if (!customerById(id)) return;
  state.selectedId = id;
  state.plate.clear();
  blip(440, 0.06);
  render();
}

function toggleIngredient(id) {
  if (!state.running || !state.selectedId) return;
  if (state.plate.has(id)) state.plate.delete(id);
  else state.plate.add(id);
  blip(520, 0.05);
  render();
}

function serve() {
  if (!state.running || !state.selectedId || state.plate.size === 0) return;
  const c = customerById(state.selectedId);
  if (!c) return;
  const dish = dishById(c.dishId);
  const plate = [...state.plate].sort();
  const recipe = [...dish.recipe].sort();
  const correct = plate.length === recipe.length && plate.every((v, i) => v === recipe[i]);
  if (correct) {
    const earned = dish.price * state.combo;
    state.coins += earned;
    state.served += 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    setMessage(`Benar! ${dish.label} tersaji, +Rp${earned.toLocaleString('id-ID')}. Kombo naik ke x${state.combo + 1}.`);
    blip(660, 0.12);
    setTimeout(() => blip(880, 0.15), 120);
    state.combo += 1;
  } else {
    state.combo = 1;
    setMessage(`Salah racikan — ${c.name} pulang kecewa. Kombo putus.`);
    blip(160, 0.25);
  }
  removeCustomer(c.id);
  state.plate.clear();
  render();
}

function endShift() {
  state.running = false;
  clearInterval(timerId);
  timerId = null;
  $('endStats').textContent =
    `Pendapatan Rp${state.coins.toLocaleString('id-ID')} · ` +
    `${state.served} hidangan tersaji · kombo terbaik x${state.bestCombo}.`;
  $('endOverlay').classList.remove('hidden');
  blip(523, 0.15);
  setTimeout(() => blip(784, 0.2), 150);
}

function tick() {
  if (!state.running) return;
  state.timeLeft -= 0.25;
  state.spawnInMs -= 250;
  if (state.spawnInMs <= 0) {
    spawnCustomer(false);
    state.spawnInMs = SPAWN_EVERY_MS;
  }
  const walked = [];
  state.customers.forEach((c) => {
    c.patience -= 0.25;
    if (c.patience <= 0) walked.push(c);
  });
  walked.forEach((c) => {
    removeCustomer(c.id);
    state.combo = 1;
    state.plate.clear();
    setMessage(`${c.name} kehabisan sabar dan pergi. Kombo putus.`);
    blip(220, 0.2);
  });
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    render();
    endShift();
    return;
  }
  render();
}

function render() {
  const mins = Math.floor(state.timeLeft / 60);
  const secs = Math.floor(state.timeLeft % 60);
  $('timer').textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  $('coins').textContent = `Rp${state.coins.toLocaleString('id-ID')}`;
  $('combo').textContent = `x${state.combo}`;

  const board = $('customers');
  board.innerHTML = '';
  if (!state.customers.length) {
    board.innerHTML = '<p class="empty">Belum ada pelanggan — sebentar lagi datang.</p>';
  }
  state.customers.forEach((c) => {
    const dish = dishById(c.dishId);
    const el = document.createElement('div');
    el.className = 'customer' + (c.id === state.selectedId ? ' selected' : '');
    const pct = Math.max(0, (c.patience / PATIENCE_SECONDS) * 100);
    const secsLeft = Math.ceil(c.patience);
    el.innerHTML =
      `<div class="who">${c.name}</div>` +
      `<div class="order">${dish.label} — ${dish.recipe.map(ingLabel).join(', ')}</div>` +
      `<div class="patience${pct < 35 ? ' low' : ''}"><i style="width:${pct}%"></i></div>` +
      `<div style="font-size:13px; margin-top:4px;">${secsLeft} detik lagi${secsLeft <= 10 ? ' — hampir pergi!' : ''}</div>`;
    el.addEventListener('click', () => selectCustomer(c.id));
    board.appendChild(el);
  });

  const selected = state.selectedId ? customerById(state.selectedId) : null;
  $('plateName').textContent = selected ? dishById(selected.dishId).label : '—';
  const plateEl = $('plate');
  plateEl.innerHTML = '';
  if (!state.plate.size) {
    plateEl.innerHTML = '<span class="empty">Piring kosong — klik bahan di bawah.</span>';
  }
  [...state.plate].forEach((id) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = ingLabel(id) + ' ×';
    chip.title = 'Klik untuk mengeluarkan';
    chip.addEventListener('click', () => toggleIngredient(id));
    plateEl.appendChild(chip);
  });

  const ingEl = $('ingredients');
  ingEl.innerHTML = '';
  INGREDIENTS.forEach((ing) => {
    const btn = document.createElement('button');
    btn.className = 'ing' + (state.plate.has(ing.id) ? ' in-plate' : '');
    btn.textContent = `${ing.label} [${ing.key.toUpperCase()}]`;
    btn.addEventListener('click', () => toggleIngredient(ing.id));
    ingEl.appendChild(btn);
  });

  $('serveBtn').disabled = !state.running || !state.selectedId || state.plate.size === 0;
}

function startShift() {
  state.running = true;
  state.timeLeft = SHIFT_SECONDS;
  state.coins = 0;
  state.combo = 1;
  state.bestCombo = 1;
  state.served = 0;
  state.customers = [];
  state.selectedId = null;
  state.plate.clear();
  state.nextCustomer = 1;
  state.spawnInMs = SPAWN_EVERY_MS;
  $('startOverlay').classList.add('hidden');
  $('endOverlay').classList.add('hidden');
  setMessage('Shift dimulai — layani pelanggan pertama!');
  blip(523, 0.1);
  if (timerId) clearInterval(timerId);
  timerId = setInterval(tick, 250);
  render();
}

function applyShot() {
  const shot = new URLSearchParams(window.location.search).get('shot');
  if (shot === 'play') {
    startShift();
    spawnCustomer(false);
    spawnCustomer(false);
    render();
  } else if (shot === 'serve') {
    startShift();
    spawnCustomer(true);
    render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('startBtn').addEventListener('click', () => { startShift(); spawnCustomer(false); render(); });
  $('againBtn').addEventListener('click', () => window.location.reload());
  $('serveBtn').addEventListener('click', serve);
  document.addEventListener('keydown', (ev) => {
    if (!state.running) {
      if ((ev.key === 'Enter' || ev.key === ' ') && !$('startOverlay').classList.contains('hidden')) {
        startShift(); spawnCustomer(false); render();
      }
      return;
    }
    const ing = INGREDIENTS.find((i) => i.key === ev.key.toLowerCase());
    if (ing) { toggleIngredient(ing.id); return; }
    if (ev.key === 'Enter') { serve(); return; }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      if (!state.customers.length) return;
      const idx = state.customers.findIndex((c) => c.id === state.selectedId);
      const next = ev.key === 'ArrowRight'
        ? state.customers[(idx + 1) % state.customers.length]
        : state.customers[(idx - 1 + state.customers.length) % state.customers.length];
      selectCustomer(next.id);
    }
  });
  render();
  applyShot();
});

// Pegangan untuk pengujian headless: capture dan play-through bisa menggerakkan game lewat sini.
window.__warung = {
  state,
  DISHES,
  INGREDIENTS,
  start: () => { startShift(); spawnCustomer(false); render(); },
  toggle: toggleIngredient,
  serve,
  select: selectCustomer,
};
