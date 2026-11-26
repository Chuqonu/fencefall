// Wave director. Schedules fence-only enemies across about 13 minutes of spawns.
// The boss still has to walk and die after the last spawn, so a cleared run lands
// near 14 minutes of active simulation. Planning pauses are not part of this clock.
//
// state.expedition selects a sortie schedule. The watch sortie uses PHASES.
// A missing expedition or an unknown id uses that same campaign schedule.
//
// This module does not set victory or defeat, does not award XP, and does not call
// random() or uid(). Spawn positions and difficulty health/speed/damage belong to
// spawnEnemy. Difficulty count is applied here, with a fractional remainder so
// 0.9 / 1.1 / 1.2 do not pile up on rounding. The opening pack is exact: four ash
// shamblers are worth 8 XP on every difficulty, matching the starting nextDraftXp.
//
// director.done flips only after the last queued campaign spawn has been handed to
// spawnEnemy. Summons created by a living boss are not campaign spawns; they keep
// happening after done until that boss is dead. Endless play never sets done.
// director.hasBoss is true when the current wave's groups include a boss. It is
// copied from that wave in the existing schedule and does not change counts,
// timings, kinds, or difficulty multipliers. Endless play keeps the same flag
// for the endless wave that is current.
// director.playerHint is the current wave's bilingual hint {en, zh} when that
// hint exists. Each update copies it from the existing schedule. The copy does
// not change counts, timings, kinds, or difficulty multipliers. Endless play
// keeps the hint of the endless wave that is current. A wave with no hint
// leaves playerHint unchanged.
// director.nextHint is the next campaign wave's bilingual hint {en, zh} when
// that wave is still waiting on the schedule. Each update copies it from that
// wave. The copy does not change counts, timings, kinds, or difficulty
// multipliers. Endless waves are not campaign waves. When no later campaign
// wave exists, nextHint is null. director.playerHint stays the current hint.
//
// Private serializable state lives on state.systems.waves:
//   countRemainder, summonRemainder, waveStartedAt,
//   endlessNext, endlessWave, doneEmitted, current {id,name,hint,intro,boss}
// Boss bodies may gain enraged (boolean) and summonAt (absolute simulation time
// of the next call). Save both. dt is accepted and ignored: the lead advances
// state.time before this call, and spawns/summons key off that clock so a large
// step cannot mint extra calls.
//
// Integration: call updateWaves after time/tick advance and before movement.
// Do not multiply dt by speed here; state.time is already simulation time.
// movement.js must not import this file (that cycle would hide spawnEnemy).

import {DIFFICULTIES, STEP, emit} from '../shared.js';
import {ENEMIES} from '../data/enemies.js';
import {EXPEDITIONS} from '../data/expeditions.js';
import {spawnEnemy} from './movement.js';

const INTRO_HINTS = {
  shambler: {
    en: 'Ash shamblers are crossing the field. Defeat these four to open the first draft.',
    zh: '灰烬蹒者正在过场。击倒这四只就能拿到第一次整备。',
  },
  runner: {
    en: 'Wire runners are in the line. They reach the fence early, so shoot them first.',
    zh: '线驰者混进了队列。它们会更早贴上栅栏，优先打掉。',
  },
  swarm: {
    en: 'Dust gnawers arrive in bunches. One is nothing; the bunch chews the fence.',
    zh: '尘啮成群出现。一只不足为惧，一群就会啃栅栏。',
  },
  spitter: {
    en: 'Sap spitters are fragile and bite the fence in quick hits once they arrive.',
    zh: '腐浆喷者很脆，一旦抵达就会快速连咬栅栏。',
  },
  armored: {
    en: 'Plate walkers shrug off more than half of each hit. Focus them down.',
    zh: '板甲行者能挡下每次攻击的一半多。集火拆掉它们。',
  },
  brute: {
    en: 'Gate brutes are slow, huge, and hit the fence very hard.',
    zh: '闸门蛮兽缓慢、巨大，对栅栏的打击非常重。',
  },
  boss: {
    en: 'A Crown Breach calls dust gnawers while alive. Half health only enrages it. It only attacks the fence.',
    zh: '冠裂兽存活期间都会召唤尘啮。半血只会让它狂暴。它只攻击栅栏。',
  },
  leaper: {
    en: 'Ash leapers can be shot while they crouch, then they jump. They only bite the fence.',
    zh: '灰跃者蹲下时才能被打中，然后向前跳。它们只啃栅栏。',
  },
  splitter: {
    en: 'Crack broods release two dust gnawers when they die.',
    zh: '裂巢死后会放出两只尘啮。',
  },
  mender: {
    en: 'Ash menders heal the most wounded ally. They do not heal themselves.',
    zh: '烬补者会治疗伤得最重的同伴，不会治疗自己。',
  },
  shade: {
    en: 'Fence shades are solid only briefly. While faded they cannot be shot, but they still walk and bite.',
    zh: '栅影只短暂凝实。淡出时无法被射击，但仍会走并啃栅栏。',
  },
  banner: {
    en: 'A standard wretch triples the pace of enemies near it. Kill it before that pack arrives.',
    zh: '旗孽会让附近的敌人变为三倍速。在那队人抵达前打掉它。',
  },
  warden: {
    en: 'An ash warden weakens hits on a nearby ally. It is not shielded itself. Kill it first.',
    zh: '烬卫会减弱对附近同伴的打击。它自己没有这层护盾。先打掉它。',
  },
  charge: {
    en: 'A cinder charge bites once at the fence, then the fuse burns. Kill it before the blast.',
    zh: '烬爆贴上栅栏后先啃一口，然后引线燃烧。爆炸前打掉它。',
  },
  hush: {
    en: 'While an ash hush is on the fence, defenders recharge more slowly. Kill it to restore the board.',
    zh: '烬寂贴在栅栏上时，防守者充能变慢。打掉它，阵列就会恢复。',
  },
};

// Hand-tunable campaign. `from`/`until`/`every` are simulation seconds.
// A phase without `rotate` repeats `groups`. `rotate` cycles group lists.
// Group: kind, count, interval seconds, optional delay, exact (skip count scaling),
// optional healthScale (passed through to spawnEnemy, still multiplied by difficulty health).
const PHASES = [
  {
    id: 'ash',
    from: 1,
    until: 2,
    every: 30,
    name: {en: 'First ash', zh: '初烬'},
    groups: [{kind: 'shambler', count: 4, interval: 3, exact: true}],
  },
  {
    id: 'line',
    from: 16,
    until: 64,
    every: 9,
    name: {en: 'Ash line', zh: '灰线'},
    groups: [
      {kind: 'shambler', count: 2, interval: 5},
      {kind: 'runner', count: 2, interval: 4, delay: 2},
    ],
  },
  {
    id: 'dust',
    from: 66,
    until: 140,
    every: 10,
    name: {en: 'Dust', zh: '尘群'},
    groups: [
      {kind: 'swarm', count: 4, interval: 1.5},
      {kind: 'shambler', count: 2, interval: 4, delay: 2},
    ],
  },
  {
    id: 'sap',
    from: 146,
    until: 232,
    every: 11,
    name: {en: 'Sap', zh: '腐浆'},
    groups: [
      {kind: 'spitter', count: 2, interval: 6},
      {kind: 'runner', count: 2, interval: 5, delay: 2},
      {kind: 'swarm', count: 2, interval: 3, delay: 1},
    ],
  },
  {
    id: 'leap-in',
    from: 200,
    until: 201,
    every: 30,
    name: {en: 'Leap ash', zh: '灰跃'},
    groups: [
      {kind: 'leaper', count: 3, interval: 1.2},
      {kind: 'shambler', count: 2, interval: 1.2, delay: 0.8},
    ],
  },
  {
    id: 'plate',
    from: 234,
    until: 330,
    every: 14,
    name: {en: 'Plate', zh: '板甲'},
    groups: [
      {kind: 'armored', count: 2, interval: 8},
      {kind: 'swarm', count: 3, interval: 2.5, delay: 1},
      {kind: 'runner', count: 2, interval: 6, delay: 4},
    ],
  },
  {
    id: 'shade-in',
    from: 260,
    until: 261,
    every: 30,
    name: {en: 'Shade hour', zh: '栅影'},
    groups: [
      {kind: 'shade', count: 2, interval: 1.6},
      {kind: 'runner', count: 2, interval: 1.2, delay: 1},
    ],
  },
  {
    id: 'banner-in',
    from: 310,
    until: 311,
    every: 30,
    name: {en: 'Standard', zh: '旗帜'},
    groups: [
      {kind: 'banner', count: 1, interval: 0},
      {kind: 'shambler', count: 3, interval: 1, delay: 0.6},
    ],
  },
  {
    id: 'brute',
    from: 332,
    until: 333,
    every: 10,
    name: {en: 'The gate', zh: '闸门'},
    groups: [
      {kind: 'brute', count: 2, interval: 2, exact: true},
      {kind: 'shambler', count: 3, interval: 1.2, delay: 0.6},
    ],
  },
  {
    id: 'maul',
    from: 340,
    until: 456,
    every: 16,
    name: {en: 'Maul', zh: '重压'},
    rotate: [
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'swarm', count: 3, interval: 5, delay: 2},
      ],
      [
        {kind: 'spitter', count: 2, interval: 7},
        {kind: 'armored', count: 2, interval: 8, delay: 3},
        {kind: 'runner', count: 2, interval: 6, delay: 2},
      ],
      [
        {kind: 'splitter', count: 2, interval: 2.4},
        {kind: 'swarm', count: 3, interval: 2.5, delay: 1},
        {kind: 'runner', count: 2, interval: 6, delay: 3},
      ],
    ],
  },
  {
    id: 'ward-in',
    from: 400,
    until: 401,
    every: 30,
    name: {en: 'Ash ward', zh: '烬卫'},
    hint: {
      en: 'An ash warden weakens hits on a nearby ally. It is not shielded itself. Kill it first.',
      zh: '烬卫会减弱对附近同伴的打击。它自己没有这层护盾。先打掉它。',
    },
    groups: [
      {kind: 'warden', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 3, interval: 0.8, delay: 0.4, exact: true},
    ],
  },
  {
    id: 'charge-in',
    from: 430,
    until: 431,
    every: 30,
    name: {en: 'Cinder', zh: '烬爆'},
    hint: {
      en: 'A cinder charge bites once at the fence, then the fuse burns. Kill it before the blast.',
      zh: '烬爆贴上栅栏后先啃一口，然后引线燃烧。爆炸前打掉它。',
    },
    groups: [
      {kind: 'charge', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 2, interval: 0.8, delay: 0.5, exact: true},
    ],
  },
  {
    id: 'lesser',
    from: 456,
    until: 457,
    every: 10,
    name: {en: 'Lesser crown', zh: '次冠'},
    hint: {
      en: 'A lesser Crown Breach calls dust gnawers while alive. Half health only enrages it. The push resumes after.',
      zh: '较弱的冠裂兽存活期间都会召唤尘啮。半血只会让它狂暴。之后攻势还会继续。',
    },
    groups: [
      {kind: 'armored', count: 2, interval: 1.4},
      {kind: 'swarm', count: 4, interval: 0.4, delay: 0.4},
      {kind: 'runner', count: 2, interval: 1.2, delay: 1.6},
      {kind: 'boss', count: 1, interval: 0, delay: 4.8, exact: true, healthScale: 0.36},
    ],
  },
  {
    id: 'hush-in',
    from: 490,
    until: 491,
    every: 30,
    name: {en: 'Ash hush', zh: '烬寂'},
    hint: {
      en: 'While an ash hush is on the fence, defenders recharge more slowly. Kill it to restore the board.',
      zh: '烬寂贴在栅栏上时，防守者充能变慢。打掉它，阵列就会恢复。',
    },
    groups: [
      {kind: 'hush', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 3, interval: 0.7, delay: 0.4, exact: true},
    ],
  },
  {
    id: 'press',
    from: 520,
    until: 652,
    every: 16,
    name: {en: 'Press', zh: '进逼'},
    rotate: [
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'spitter', count: 2, interval: 6, delay: 4},
        {kind: 'swarm', count: 3, interval: 4, delay: 2},
      ],
      [
        {kind: 'armored', count: 2, interval: 12},
        {kind: 'leaper', count: 2, interval: 6, delay: 2},
        {kind: 'shade', count: 2, interval: 6, delay: 4},
      ],
      [
        {kind: 'swarm', count: 4, interval: 3.5},
        {kind: 'runner', count: 2, interval: 8, delay: 2},
        {kind: 'spitter', count: 2, interval: 7, delay: 5},
      ],
    ],
  },
  {
    id: 'siege',
    from: 654,
    until: 772,
    every: 16,
    name: {en: 'Siege', zh: '围攻'},
    rotate: [
      [
        {kind: 'armored', count: 2, interval: 12},
        {kind: 'mender', count: 1, interval: 0, delay: 1.2},
        {kind: 'swarm', count: 3, interval: 3.5, delay: 1},
      ],
      [
        {kind: 'brute', count: 2, interval: 12},
        {kind: 'runner', count: 2, interval: 7, delay: 3},
        {kind: 'swarm', count: 3, interval: 4, delay: 2},
      ],
      [
        {kind: 'splitter', count: 2, interval: 3, delay: 1},
        {kind: 'banner', count: 1, interval: 0, delay: 2},
        {kind: 'runner', count: 2, interval: 8, delay: 4},
      ],
    ],
  },
  {
    id: 'crown',
    from: 780,
    until: 781,
    every: 20,
    name: {en: 'Crown Breach', zh: '冠裂'},
    hint: {
      en: 'Last foe: Crown Breach calls dust gnawers while alive. Half health only enrages it. Clear the field to win.',
      zh: '最后一头冠裂兽存活期间都会召唤尘啮。半血只会让它狂暴。清场即可获胜。',
    },
    groups: [
      {kind: 'armored', count: 3, interval: 1.2},
      {kind: 'swarm', count: 5, interval: 0.35, delay: 0.35},
      {kind: 'spitter', count: 2, interval: 1.2, delay: 1.8},
      {kind: 'boss', count: 1, interval: 0, delay: 4.5, exact: true},
    ],
  },
];

const ENDLESS_PATTERNS = [
  {
    name: {en: 'Unending ash', zh: '无尽灰烬'},
    groups: [
      {kind: 'shambler', count: 4, interval: 1.6},
      {kind: 'runner', count: 2, interval: 2, delay: 1},
    ],
  },
  {
    name: {en: 'Unending dust', zh: '无尽尘群'},
    groups: [
      {kind: 'swarm', count: 6, interval: 0.4},
      {kind: 'spitter', count: 2, interval: 2, delay: 1},
    ],
  },
  {
    name: {en: 'Unending plate', zh: '无尽板甲'},
    groups: [
      {kind: 'armored', count: 3, interval: 2},
      {kind: 'brute', count: 2, interval: 0, delay: 2},
      {kind: 'swarm', count: 3, interval: 0.8, delay: 0.4},
    ],
  },
  {
    name: {en: 'Unending sap', zh: '无尽腐浆'},
    groups: [
      {kind: 'spitter', count: 3, interval: 1.4},
      {kind: 'runner', count: 3, interval: 1.2, delay: 0.6},
    ],
  },
  {
    name: {en: 'Unending crown', zh: '无尽冠裂'},
    groups: [
      {kind: 'armored', count: 2, interval: 1.5},
      {kind: 'swarm', count: 4, interval: 0.45, delay: 0.4},
      {kind: 'boss', count: 1, interval: 0, delay: 2, exact: true},
    ],
  },
  {
    name: {en: 'Unending brood', zh: '无尽裂巢'},
    groups: [
      {kind: 'splitter', count: 2, interval: 2},
      {kind: 'swarm', count: 4, interval: 0.45, delay: 0.4},
      {kind: 'shade', count: 1, interval: 0, delay: 1.6},
    ],
  },
  {
    name: {en: 'Unending standard', zh: '无尽旗帜'},
    groups: [
      {kind: 'banner', count: 1, interval: 0},
      {kind: 'leaper', count: 2, interval: 1.6, delay: 0.8},
      {kind: 'mender', count: 1, interval: 0, delay: 1.4},
      {kind: 'armored', count: 1, interval: 0, delay: 2.4},
    ],
  },
  {
    name: {en: 'Unending ward', zh: '无尽烬卫'},
    groups: [
      {kind: 'warden', count: 1, interval: 0, exact: true},
      {kind: 'armored', count: 2, interval: 1.6, delay: 0.4},
      {kind: 'shambler', count: 3, interval: 0.7, delay: 0.8},
    ],
  },
  {
    name: {en: 'Unending fuse', zh: '无尽引线'},
    groups: [
      {kind: 'charge', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 3, interval: 0.8, delay: 0.5},
      {kind: 'runner', count: 1, interval: 0, delay: 1.2},
    ],
  },
  {
    name: {en: 'Unending hush', zh: '无尽静场'},
    groups: [
      {kind: 'hush', count: 1, interval: 0, exact: true},
      {kind: 'shambler', count: 4, interval: 0.7},
    ],
  },
];

export const WAVES = freezeDeep(buildWaves(PHASES));

const EXPEDITION_WAVES = {};
for (const id of Object.keys(EXPEDITIONS)) {
  const phases = EXPEDITIONS[id] && EXPEDITIONS[id].phases;
  if (Array.isArray(phases) && phases.length) EXPEDITION_WAVES[id] = freezeDeep(buildWaves(phases));
}

function activeSchedule(state) {
  const id = state && typeof state.expedition === 'string' ? state.expedition : '';
  return EXPEDITION_WAVES[id] || WAVES;
}

const SCHEDULE_END = lastSpawnTime(WAVES);

export function updateWaves(state, dt = 0) {
  // state.time is the clock. dt stays in the signature for the lead's fixed step.
  void dt;
  if (!isSimulating(state)) return state;
  const director = ensureDirector(state);
  const sys = ensureWaves(state);
  if (!Array.isArray(state.events)) state.events = [];
  if (state.endless && director.done) director.done = false;
  const waves = activeSchedule(state);

  while (director.nextWave < waves.length && state.time + 1e-6 >= waves[director.nextWave].start) {
    const wave = waves[director.nextWave];
    enqueueWave(state, sys, wave);
    director.nextWave += 1;
    state.wave = director.nextWave;
    sys.waveStartedAt = state.time;
    sys.current = snapshotWave(wave);
    emit(state, 'wave_start', {
      wave: state.wave,
      id: wave.id,
      name: {en: wave.name.en, zh: wave.name.zh},
      hint: {en: wave.hint.en, zh: wave.hint.zh},
      intro: wave.intro,
    });
  }

  spawnDue(state);

  if (director.nextWave >= waves.length && director.queue.length === 0) {
    if (state.endless) {
      director.done = false;
      pumpEndless(state, sys);
      spawnDue(state);
    } else if (!director.done) {
      director.done = true;
      if (!sys.doneEmitted) {
        sys.doneEmitted = true;
        emit(state, 'waves_complete', {wave: state.wave, time: state.time});
      }
    } else if (!sys.doneEmitted) {
      sys.doneEmitted = true;
      emit(state, 'waves_complete', {wave: state.wave, time: state.time});
    }
  }

  syncBossFlag(state, director, sys);
  syncPlayerHint(state, director, sys);
  syncNextHint(state, director);
  updateBosses(state, sys);
  noteBossApproach(state, director);
  state.waveTime = sys.waveStartedAt == null ? 0 : Math.max(0, state.time - sys.waveStartedAt);
  return state;
}

export function getWaveInfo(state) {
  const director = state?.director && typeof state.director === 'object'
    ? state.director
    : {nextWave: 0, queue: [], done: false};
  const queue = Array.isArray(director.queue) ? director.queue : [];
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const time = Number.isFinite(state?.time) ? state.time : 0;
  const stored = state?.systems?.waves?.current || null;
  const waves = activeSchedule(state);
  const catalogCurrent = started > 0 ? waves[Math.min(started, waves.length) - 1] : null;
  const current = stored || catalogCurrent;
  const upcomingWave = started >= 0 && started < waves.length ? waves[started] : null;
  const mult = countMultiplier(state);
  const incoming = {};
  let nextSpawnIn = null;
  for (const item of queue) {
    if (!item || typeof item.kind !== 'string') continue;
    incoming[item.kind] = (incoming[item.kind] || 0) + 1;
    if (Number.isFinite(item.time)) {
      const wait = Math.max(0, item.time - time);
      if (nextSpawnIn == null || wait < nextSpawnIn) nextSpawnIn = wait;
    }
  }
  const live = {};
  let bossAlive = false;
  let living = 0;
  for (const enemy of state?.enemies || []) {
    if (!isLive(enemy)) continue;
    living += 1;
    const kind = enemy.kind || 'unknown';
    live[kind] = (live[kind] || 0) + 1;
    if (kind === 'boss' || ENEMIES[kind]?.enrage) bossAlive = true;
  }
  let nextIn = 0;
  if (upcomingWave) nextIn = Math.max(0, upcomingWave.start - time);
  else if (state?.endless) {
    const at = state?.systems?.waves?.endlessNext;
    if (Number.isFinite(at)) nextIn = Math.max(0, at - time);
  }
  const quiet = {
    en: 'The fence is quiet. Ash shamblers will crest the field in a moment.',
    zh: '栅栏还安静。灰烬蹒者马上就会出现在场上。',
  };
  const name = current?.name || {en: 'Before the ash', zh: '灰烬未至'};
  const hint = current?.hint || quiet;
  return {
    wave: Number.isFinite(state?.wave) ? state.wave : 0,
    total: waves.length,
    done: !!director.done,
    endless: !!state?.endless,
    id: current?.id || null,
    name: {en: name.en, zh: name.zh},
    hint: {en: hint.en, zh: hint.zh},
    intro: current?.intro || null,
    nextId: upcomingWave?.id || null,
    nextName: upcomingWave ? {en: upcomingWave.name.en, zh: upcomingWave.name.zh} : null,
    nextHint: upcomingWave ? {en: upcomingWave.hint.en, zh: upcomingWave.hint.zh} : null,
    nextIn,
    nextSpawnIn,
    waveTime: Number.isFinite(state?.waveTime) ? state.waveTime : 0,
    time,
    queued: queue.length,
    incoming,
    live,
    living,
    upcoming: upcomingWave ? peekGroups(upcomingWave, mult, state?.systems?.waves?.countRemainder || 0) : [],
    countMultiplier: mult,
    finalSpawn: waves === WAVES ? SCHEDULE_END : lastSpawnTime(waves),
    bossAlive,
    hasBoss: readHasBoss(state, director),
    progress: campaignProgress(state, director, time),
  };
}

function campaignProgress(state, director, time) {
  const waves = activeSchedule(state);
  const index = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (index <= 0 || waves.length === 0) return 0;
  const current = waves[Math.min(index, waves.length) - 1];
  if (!current || !Number.isFinite(current.start)) return 0;
  const next = index < waves.length ? waves[index] : null;
  const end = next && Number.isFinite(next.start) ? next.start : current.start + 30;
  const span = Math.max(1e-6, end - current.start);
  const raw = (time - current.start) / span;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(1, raw));
}

function buildWaves(phases) {
  const waves = [];
  const seen = new Set();
  for (const phase of phases) {
    const patterns = phase.rotate || [phase.groups];
    for (const groups of patterns) {
      for (const group of groups) {
        if (!ENEMIES[group.kind]) throw new Error(`Unknown wave kind ${group.kind}`);
      }
    }
    const every = phase.every > 0 ? phase.every : 1;
    const limit = Math.floor((phase.until - phase.from - 1e-9) / every) + 1;
    for (let i = 0; i < limit; i++) {
      const start = quantize(phase.from + i * every);
      if (start >= phase.until - 1e-9) break;
      const groups = cloneGroups(patterns[i % patterns.length]);
      let intro = null;
      for (const group of groups) {
        if (!seen.has(group.kind)) {
          seen.add(group.kind);
          if (!intro) intro = group.kind;
        }
      }
      const hint = (i === 0 && phase.hint) || (intro && INTRO_HINTS[intro]) || autoHint(groups);
      waves.push({
        id: `${phase.id}-${i + 1}`,
        start,
        name: {en: phase.name.en, zh: phase.name.zh},
        hint: {en: hint.en, zh: hint.zh},
        groups,
        intro,
        boss: groups.some(group => group.kind === 'boss'),
      });
    }
  }
  waves.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return waves;
}

function cloneGroups(groups) {
  return groups.map(group => {
    const copy = {
      kind: group.kind,
      count: group.count,
      interval: group.interval || 0,
      delay: group.delay || 0,
      exact: !!group.exact,
    };
    if (Number.isFinite(group.healthScale)) copy.healthScale = group.healthScale;
    return copy;
  });
}

function autoHint(groups) {
  const kinds = [];
  for (const group of groups) if (!kinds.includes(group.kind)) kinds.push(group.kind);
  const en = kinds.map(kind => ENEMIES[kind].name.en).join(', ');
  const zh = kinds.map(kind => ENEMIES[kind].name.zh).join('、');
  return {en: `${en} advance on the fence.`, zh: `${zh}正向栅栏推进。`};
}

function lastSpawnTime(waves) {
  let end = 0;
  for (const wave of waves) {
    for (const group of wave.groups) {
      const count = Math.floor(Number(group.count) || 0);
      if (count <= 0) continue;
      const time = quantize(wave.start + (group.delay || 0) + (count - 1) * (group.interval || 0));
      if (time > end) end = time;
    }
  }
  return end;
}

function enqueueWave(state, sys, wave) {
  const mult = countMultiplier(state);
  const items = [];
  for (const group of wave.groups) {
    if (!ENEMIES[group.kind]) continue;
    const count = takeCount(sys, 'countRemainder', group.count, mult, group.exact);
    const interval = Math.max(0, Number(group.interval) || 0);
    const delay = Math.max(0, Number(group.delay) || 0);
    for (let i = 0; i < count; i++) {
      const item = {time: quantize(wave.start + delay + i * interval), kind: group.kind};
      if (Number.isFinite(group.healthScale) && group.healthScale > 0) item.overrides = {healthScale: group.healthScale};
      items.push(item);
    }
  }
  if (!items.length && wave.groups.length) {
    const kind = wave.groups.find(group => ENEMIES[group.kind])?.kind;
    if (kind) items.push({time: quantize(wave.start), kind});
  }
  const queue = state.director.queue;
  for (const item of items) queue.push(item);
  queue.sort((a, b) => a.time - b.time || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

function spawnDue(state) {
  const due = [];
  const keep = [];
  for (const item of state.director.queue) {
    if (!item || typeof item.kind !== 'string' || !Number.isFinite(item.time) || !ENEMIES[item.kind]) continue;
    if (state.time + 1e-6 >= item.time) due.push(item);
    else keep.push(item);
  }
  state.director.queue = keep;
  for (const item of due) {
    const spawned = spawnEnemy(state, item.kind, item.overrides || {});
    anchorSummon(spawned, item.time);
  }
}

function pumpEndless(state, sys) {
  if (sys.endlessNext == null) sys.endlessNext = quantize(state.time + 4);
  let guard = 0;
  while (state.time + 1e-6 >= sys.endlessNext && guard++ < 200) {
    const start = sys.endlessNext;
    const wave = makeEndlessWave(sys.endlessWave, start);
    enqueueWave(state, sys, wave);
    const span = groupSpan(wave.groups);
    let next = quantize(start + Math.max(12, span + 3));
    if (!(next > start)) next = quantize(start + 12);
    sys.endlessNext = next;
    sys.endlessWave += 1;
    state.wave += 1;
    sys.waveStartedAt = state.time;
    sys.current = snapshotWave(wave);
    emit(state, 'wave_start', {
      wave: state.wave,
      id: wave.id,
      name: {en: wave.name.en, zh: wave.name.zh},
      hint: {en: wave.hint.en, zh: wave.hint.zh},
      intro: null,
    });
  }
}

function makeEndlessWave(index, start) {
  const pattern = ENDLESS_PATTERNS[index % ENDLESS_PATTERNS.length];
  const loop = Math.floor(index / ENDLESS_PATTERNS.length);
  const bonus = Math.min(6, loop);
  const groups = pattern.groups.map(group => ({
    kind: group.kind,
    count: group.exact ? group.count : group.count + (group.kind === 'swarm' ? bonus : Math.min(2, bonus)),
    interval: group.interval || 0,
    delay: group.delay || 0,
    exact: !!group.exact,
    ...(Number.isFinite(group.healthScale) ? {healthScale: group.healthScale} : {}),
  }));
  if (!groups.some(group => group.kind === 'boss')) {
    if (index % 5 === 4) {
      groups.push({kind: 'boss', count: 1, interval: 0, delay: 2, exact: true, healthScale: Math.min(1.15, 0.55 + loop * 0.1)});
    }
  } else {
    for (const group of groups) {
      if (group.kind === 'boss') group.healthScale = Math.min(1.15, 0.55 + loop * 0.1);
    }
  }
  return {
    id: `endless-${index + 1}`,
    start,
    name: {en: pattern.name.en, zh: pattern.name.zh},
    hint: autoHint(groups),
    groups,
    intro: null,
    boss: groups.some(group => group.kind === 'boss'),
  };
}

function anchorSummon(enemy, spawnedAt) {
  const summon = ENEMIES[enemy?.kind]?.summon;
  if (!summon || !enemy || Number.isFinite(enemy.summonAt)) return;
  const interval = Number(summon.interval);
  if (!Number.isFinite(interval) || interval <= 0) return;
  const origin = Number.isFinite(spawnedAt) ? spawnedAt : null;
  if (origin == null) return;
  enemy.summonAt = origin + interval;
}

function updateBosses(state, sys) {
  for (const enemy of state.enemies || []) {
    if (!isLive(enemy)) continue;
    const data = ENEMIES[enemy.kind];
    if (!data) continue;
    if (data.enrage && !enemy.enraged && Number.isFinite(enemy.maxHp) && enemy.maxHp > 0 && enemy.hp / enemy.maxHp <= data.enrage.threshold) {
      applyEnrage(state, enemy, data.enrage);
    }
    if (data.summon) tickSummon(state, sys, enemy, data.summon);
  }
}

function applyEnrage(state, enemy, enrage) {
  enemy.enraged = true;
  const speedScale = finiteScale(enrage.speedScale);
  const damageScale = finiteScale(enrage.damageScale);
  const intervalScale = finiteScale(enrage.intervalScale);
  if (Number.isFinite(enemy.speed)) enemy.speed *= speedScale;
  if (Number.isFinite(enemy.damage)) enemy.damage *= damageScale;
  if (Number.isFinite(enemy.attackInterval)) enemy.attackInterval = Math.max(0.35, enemy.attackInterval * intervalScale);
  if (Number.isFinite(enemy.attackCooldown) && enemy.attackCooldown > enemy.attackInterval) enemy.attackCooldown = enemy.attackInterval;
  emit(state, 'boss_enrage', {id: enemy.id, x: enemy.x, y: enemy.y, kind: enemy.kind});
}

function tickSummon(state, sys, enemy, summon) {
  const interval = Number(summon.interval);
  if (!Number.isFinite(interval) || interval <= 0 || !ENEMIES[summon.kind]) return;
  if (!Number.isFinite(enemy.summonAt)) enemy.summonAt = state.time + interval;
  let pulses = 0;
  const cap = Number.isFinite(summon.maxLiving) ? summon.maxLiving : Infinity;
  while (state.time + 1e-6 >= enemy.summonAt && pulses < 24) {
    pulses += 1;
    enemy.summonAt += interval;
    const living = countLiving(state, summon.kind);
    if (living >= cap) continue;
    const rolled = takeCount(sys, 'summonRemainder', summon.count, countMultiplier(state), false);
    const spawnCount = Math.min(rolled, Math.max(0, cap - living));
    for (let i = 0; i < spawnCount; i++) {
      const overrides = {};
      if (Number.isFinite(summon.healthScale) && summon.healthScale > 0) overrides.healthScale = summon.healthScale;
      spawnEnemy(state, summon.kind, overrides);
    }
  }
}

function countLiving(state, kind) {
  let total = 0;
  for (const enemy of state.enemies || []) if (isLive(enemy) && enemy.kind === kind) total += 1;
  return total;
}

function peekGroups(wave, mult, remainder) {
  let rem = Number(remainder) || 0;
  const upcoming = [];
  for (const group of wave.groups) {
    const base = Math.max(0, Math.floor(Number(group.count) || 0));
    let count = base;
    if (!group.exact && base > 0) {
      const raw = base * mult + rem;
      count = Math.floor(raw + 1e-9);
      rem = raw - count;
      if (rem < 1e-9) rem = 0;
    }
    if (count > 0) upcoming.push({kind: group.kind, count, exact: !!group.exact});
  }
  if (!upcoming.length && wave.groups.length) upcoming.push({kind: wave.groups[0].kind, count: 1, exact: false});
  return upcoming;
}

function takeCount(sys, field, base, mult, exact) {
  const count = Math.max(0, Math.floor(Number(base) || 0));
  if (!count) return 0;
  if (exact) return count;
  const raw = count * mult + (Number(sys[field]) || 0);
  const taken = Math.floor(raw + 1e-9);
  let rem = raw - taken;
  if (!Number.isFinite(rem) || rem < 1e-9) rem = 0;
  sys[field] = rem;
  return taken;
}

function countMultiplier(state) {
  const row = DIFFICULTIES[state?.difficulty] || DIFFICULTIES.normal;
  const count = Number(row?.count);
  return Number.isFinite(count) && count > 0 ? count : 1;
}

function groupSpan(groups) {
  let end = 0;
  for (const group of groups) {
    const count = Math.floor(Number(group.count) || 0);
    if (count <= 0) continue;
    const time = (Number(group.delay) || 0) + (count - 1) * (Number(group.interval) || 0);
    if (time > end) end = time;
  }
  return end;
}

function waveContainsBoss(wave) {
  return Array.isArray(wave?.groups) && wave.groups.some(group => group?.kind === 'boss');
}

// Current wave comes from the active sortie schedule. Once endless waves have
// started, the flag already stored on the current snapshot is that wave.
function syncBossFlag(state, director, sys) {
  const waves = activeSchedule(state);
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= waves.length && Number(sys?.endlessWave) > 0;
  if (endlessRunning) {
    director.hasBoss = sys?.current?.boss === true;
    return;
  }
  if (started <= 0 || waves.length === 0) {
    director.hasBoss = false;
    return;
  }
  director.hasBoss = waveContainsBoss(waves[Math.min(started, waves.length) - 1]);
}

// Same current-wave choice as the boss flag. Sortie waves read the active
// schedule. Endless waves read the snapshot, which carries that wave's hint.
function syncPlayerHint(state, director, sys) {
  const waves = activeSchedule(state);
  const started = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const endlessRunning = !!state.endless && started >= waves.length && Number(sys?.endlessWave) > 0;
  const source = endlessRunning
    ? sys?.current?.hint
    : (started > 0 && waves.length > 0 ? waves[Math.min(started, waves.length) - 1]?.hint : null);
  const hint = copyHint(source);
  if (hint) director.playerHint = hint;
}

function copyHint(hint) {
  if (!hint || typeof hint !== 'object') return null;
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return null;
  return {en: hint.en, zh: hint.zh};
}

// Next wave is the active schedule at nextWave until that index leaves it.
// Same copy as playerHint. No spawn, timing, kind, or difficulty change.
function distinctHint(next, current, wave) {
  if (!current) return next;
  const sameEn = next.en.trim() === current.en.trim();
  const sameZh = next.zh.trim() === current.zh.trim();
  if (!sameEn && !sameZh) return next;
  const nameEn = wave?.name?.en || wave?.id || 'Next';
  const nameZh = wave?.name?.zh || wave?.id || '下一波';
  return {
    en: sameEn ? `${next.en} (${nameEn})` : next.en,
    zh: sameZh ? `${next.zh}（${nameZh}）` : next.zh,
  };
}

function syncNextHint(state, director) {
  const waves = activeSchedule(state);
  const index = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  if (index >= 0 && index < waves.length) {
    const hint = copyHint(waves[index]?.hint);
    if (hint) {
      director.nextHint = distinctHint(hint, director.playerHint, waves[index]);
      return;
    }
  }
  director.nextHint = null;
}

function readHasBoss(state, director) {
  if (typeof director?.hasBoss === 'boolean') return director.hasBoss;
  const stored = state?.systems?.waves?.current;
  if (typeof stored?.boss === 'boolean') return stored.boss;
  const waves = activeSchedule(state);
  const started = Number.isFinite(director?.nextWave) ? director.nextWave : 0;
  if (started <= 0 || waves.length === 0) return false;
  return waveContainsBoss(waves[Math.min(started, waves.length) - 1]);
}

const BOSS_APPROACH_SECONDS = 12;

function bossAlive(state) {
  const enemies = state?.enemies;
  if (!Array.isArray(enemies)) return false;
  return enemies.some(enemy => enemy && enemy.kind === 'boss' && enemy.dead !== true && Number(enemy.hp) > 0);
}

/** True while a boss is due within 12s, or already queued, and has not entered. */
export function bossApproaching(state) {
  if (!state || state.phase !== 'playing' || state.paused || state.hiddenPaused) return false;
  if (bossAlive(state)) return false;
  const queue = state.director?.queue;
  if (Array.isArray(queue) && queue.some(item => item && item.kind === 'boss')) return true;
  if (state.endless) return false;
  const waves = activeSchedule(state);
  const index = Number.isFinite(state.director?.nextWave) ? state.director.nextWave : 0;
  if (index < 0 || index >= waves.length) return false;
  const wave = waves[index];
  if (!waveContainsBoss(wave)) return false;
  const time = Number.isFinite(state.time) ? state.time : 0;
  const wait = Number(wave.start) - time;
  return wait >= 0 && wait <= BOSS_APPROACH_SECONDS;
}

function noteBossApproach(state, director) {
  if (state.paused || state.hiddenPaused || state.phase !== 'playing') return;
  if (!bossApproaching(state)) {
    director.approachWave = null;
    return;
  }
  if (director.approachWave) return;
  const waves = activeSchedule(state);
  const index = Number.isFinite(director.nextWave) ? director.nextWave : 0;
  const wave = index >= 0 && index < waves.length ? waves[index] : null;
  const id = wave?.id || 'queued';
  director.approachWave = id;
  emit(state, 'boss_approach', {warning: true, id, x: 180, y: 24});
}

function snapshotWave(wave) {
  return {
    id: wave.id,
    name: {en: wave.name.en, zh: wave.name.zh},
    hint: {en: wave.hint.en, zh: wave.hint.zh},
    intro: wave.intro || null,
    boss: wave?.boss === true || waveContainsBoss(wave),
  };
}

function ensureDirector(state) {
  if (!state.director || typeof state.director !== 'object' || Array.isArray(state.director)) {
    state.director = {nextWave: 0, queue: [], done: false};
  }
  if (!Array.isArray(state.director.queue)) state.director.queue = [];
  if (!Number.isFinite(state.director.nextWave) || state.director.nextWave < 0) state.director.nextWave = 0;
  if (typeof state.director.done !== 'boolean') state.director.done = false;
  return state.director;
}

function ensureWaves(state) {
  if (!state.systems || typeof state.systems !== 'object' || Array.isArray(state.systems)) state.systems = {};
  if (!state.systems.waves || typeof state.systems.waves !== 'object' || Array.isArray(state.systems.waves)) {
    state.systems.waves = {
      countRemainder: 0,
      summonRemainder: 0,
      waveStartedAt: null,
      endlessNext: null,
      endlessWave: 0,
      doneEmitted: false,
      current: null,
    };
  }
  const sys = state.systems.waves;
  if (!Number.isFinite(sys.countRemainder)) sys.countRemainder = 0;
  if (!Number.isFinite(sys.summonRemainder)) sys.summonRemainder = 0;
  if (!Number.isFinite(sys.endlessWave)) sys.endlessWave = 0;
  if (typeof sys.doneEmitted !== 'boolean') sys.doneEmitted = false;
  return sys;
}

function isSimulating(state) {
  return !!state && state.phase === 'playing' && !state.paused && !state.hiddenPaused;
}

function isLive(enemy) {
  return !!enemy && enemy.dead !== true && Number(enemy.hp) > 0;
}

function finiteScale(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function quantize(time) {
  if (!Number.isFinite(time)) return 0;
  return Math.round(time / STEP) * STEP;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}
