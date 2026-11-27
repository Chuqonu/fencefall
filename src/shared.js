export const CONTRACT_VERSION = 3;
export const STEP = 1 / 60;
export const ARENA = Object.freeze({
  width: 360,
  height: 640,
  spawnY: -16,
  enemyMinX: 14,
  enemyMaxX: 346,
  fenceY: 512,
  rows: 2,
  cols: 5,
  slotWidth: 48,
  slotHeight: 48,
  pitch: 48,
  sideMargin: 60,
  frontY: 560,
  backY: 612
});
function freezeDifficulty(row) { Object.freeze(row.name); return Object.freeze(row); }
export const DIFFICULTIES = Object.freeze({
  easy: freezeDifficulty({name: {en: 'Easy', zh: '轻松'}, health: 0.8, speed: 0.9, damage: 0.75, count: 0.9, reward: 1, fence: 650}),
  normal: freezeDifficulty({name: {en: 'Normal', zh: '标准'}, health: 1, speed: 1, damage: 1, count: 1, reward: 1.4, fence: 600}),
  hard: freezeDifficulty({name: {en: 'Hard', zh: '困难'}, health: 1.3, speed: 1.08, damage: 1.25, count: 1.1, reward: 1.9, fence: 570}),
  nightmare: freezeDifficulty({name: {en: 'Nightmare', zh: '噩梦'}, health: 1.65, speed: 1.15, damage: 1.5, count: 1.2, reward: 2.5, fence: 540})
});
export const BASE_TYPES = Object.freeze(['bolt', 'fire', 'frost', 'lightning', 'poison', 'support']);
export const AUTO_DEPLOY_ORDER = Object.freeze([1, 3, 0, 4, 7, 6, 8, 5, 9, 2]);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clone = (value) => JSON.parse(JSON.stringify(value));
export function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function uid(state, prefix = 'e') { return `${prefix}${state.nextId++}`; }
export function emit(state, type, data = {}) {
  if (!Array.isArray(state.events)) state.events = [];
  const event = {...data, type, time: state.time};
  state.events.push(event);
  if (state.events.length > 400) {
    const kept = state.events.slice(-399);
    const prior = state.events.find((item) => item && (item.type === 'victory' || item.type === 'defeat' || item.type === 'draft'));
    if (prior && prior !== event && !kept.includes(prior)) kept.unshift(prior);
    state.events = kept;
  }
}
export function slotGeometry(index) {
  const col = index % ARENA.cols;
  const row = Math.floor(index / ARENA.cols);
  const x = ARENA.sideMargin + ARENA.slotWidth / 2 + ARENA.pitch * col;
  const y = row ? ARENA.backY : ARENA.frontY;
  return {
    index,
    row,
    col,
    x,
    y,
    left: x - ARENA.slotWidth / 2,
    top: y - ARENA.slotHeight / 2,
    width: ARENA.slotWidth,
    height: ARENA.slotHeight
  };
}
export function hitSlot(x, y) {
  const count = ARENA.rows * ARENA.cols;
  for (let i = 0; i < count; i++) {
    const s = slotGeometry(i);
    if (x >= s.left && x < s.left + s.width && y >= s.top && y < s.top + s.height) return i;
  }
  return -1;
}
export function unitPosition(state, id) {
  const slot = state.slots.find((s) => s.unit?.id === id);
  return slot ? {x: slot.x, y: slot.y} : null;
}
export function canPlan(state) {
  if (!state || state.phase === 'victory' || state.phase === 'defeat') return false;
  if (state.phase === 'draft' || state.paused === true) return true;
  return state.phase === 'playing' && state.hiddenPaused !== true;
}
export const TARGET_MODES = Object.freeze(['foremost', 'priority', 'strongest', 'weakest']);
const defaultModes = {lightning: 'priority', support: 'priority', poison: 'strongest'};
export function createUnit(state, type = 'bolt', rank = 1, kind = type === 'hero' ? 'hero' : 'tower') {
  return {
    id: uid(state, 'u'),
    kind,
    type,
    rank,
    upgrades: {},
    cooldown: 0,
    kills: 0,
    targeting: defaultModes[type] || 'foremost'
  };
}
