// Campaign, sortie and endless schedules advance exclusively on simulation time.
import {DIFFICULTIES, STEP, emit} from '../shared.js';
import {ENEMIES} from '../data/enemies.js';
import {EXPEDITIONS} from '../data/expeditions.js';
import {spawnEnemy} from './movement.js';

const INTRO_HINTS = {
  shambler: {
    en: 'Ash shamblers are crossing the field. Defeat these six to open the first upgrade.',
    zh: '灰烬蹒者正在逼近城墙。击倒 6 只即可触发首次升级选卡！',
  },
  runner: {
    en: 'Wire runners are in the line. They reach the wall early, so drop them fast.',
    zh: '线驰者混进了尸潮。它们移动很快会先贴近城墙，优先清理。',
  },
  swarm: {
    en: 'Dust gnawers arrive in bunches. Area skills sweep them away cleanly.',
    zh: '尘啮成群涌来，靠火海和范围自动技能一波清场！',
  },
  spitter: {
    en: 'Stops 135 px from the wall and spits acid. Set Priority targeting to drop it fast.',
    zh: '腐浆喷者会在中距离停步喷酸，切「高危」索敌优先集火清理。',
  },
  armored: {
    en: 'Plate walkers block over half of each hit. Armor Pierce and burns melt them.',
    zh: '板甲行者护甲极厚，用穿甲弹芯或燃烧伤害快速击穿。',
  },
  brute: {
    en: 'Gate brutes are slow, huge, and slam the wall very hard.',
    zh: '闸门蛮兽体型巨大，贴墙后每次重击都会大幅损耗城墙血量。',
  },
  boss: {
    en: 'Crown Breach summons dust gnawers and enrages at half HP. Focus all firepower!',
    zh: '冠裂兽会不断召唤尘啮，半血后狂暴！集中所有火力与激光柱击溃它。',
  },
  leaper: {
    en: 'Crouches briefly then vaults forward. Frost slow and EM lightning stop its leap.',
    zh: '灰跃者蹲伏后会向前扑跃，急冻减速与电磁麻痹可有效打断其突袭。',
  },
  splitter: {
    en: 'Crack broods burst into two dust gnawers when killed.',
    zh: '裂巢阵亡后会分裂出两只尘啮，注意用范围火力清扫。',
  },
  mender: {
    en: 'Ash menders heal wounded allies nearby. Take them out early.',
    zh: '烬补者会持续治疗周围重伤僵尸，建议优先点杀。',
  },
  shade: {
    en: 'Phases every 1.4s to dodge direct bullets. Fire sea and burn still hurt it.',
    zh: '幽影每 1.4 秒虚化躲避直射，火海与持续灼烧在虚化期间依然有效。',
  },
  banner: {
    en: 'Standard wretches accelerate nearby zombies. Snipe the flag-bearer first!',
    zh: '旗孽会让周围尸群疯狂加速冲锋，务必优先点杀旗手！',
  },
  warden: {
    en: 'Ash wardens shield a nearby ally. Kill the warden first to break the shield.',
    zh: '烬卫会为附近同伴施加减伤护盾，先打掉它瓦解防御。',
  },
  charge: {
    en: 'Cinder charges light an explosive fuse at the wall. Kill them before the blast!',
    zh: '烬爆者贴墙后会点燃自爆引线，务必在爆炸前击杀或震退！',
  },
  hush: {
    en: 'While Ash Hush clamps to the wall, your fire rate drops. Clear it quickly!',
    zh: '烬寂贴墙时会拖慢攻速与技能充能，尽快将其击杀恢复火力！',
  },
};

// Hand-tunable campaign. `from`/`until`/`every` are simulation seconds.
// A phase without `rotate` repeats `groups`. `rotate` cycles group lists.
// Group: kind, count, interval seconds, optional delay, exact (skip count scaling),
// optional healthScale (passed through to spawnEnemy, still multiplied by difficulty health).
// Each formation streams for most of its window. Flag waves overlap the marching column.
function group(kind,count,interval,healthScale=1) {
  return {kind,count,interval,healthScale,exact:kind==='boss'};
}
function formation(id,en,zh,from,until,every,groups,horde=false) {
  const hints={
    first:{en:'Ash shamblers are crossing the field. Defeat these six to open the first draft.',zh:'灰烬蹒者正在过场。击倒这六只就能拿到第一次整备。'},
    vanguard:{en:'A lesser Crown Breach calls dust gnawers while alive. Half health only enrages it.',zh:'次冠兽存活期间都会召唤尘啮，半血只会让它狂暴。'},
    crown:{en:'Last foe: Crown Breach calls dust gnawers while alive. Half health only enrages it. Clear the field to win.',zh:'冠裂兽存活期间都会召唤尘啮，半血只会让它狂暴。清场即可获胜。'}
  };
  return {id,name:{en,zh},from,until,every,groups,horde,hint:hints[id]};
}
const PHASES = [
  formation('first','First ash','初烬',0.5,1.5,1,[group('shambler',6,0.65,0.42)]),
  formation('trail','Broken trail','断径',12,50,12,[group('shambler',6,1.5),group('runner',3,2.6)]),
  formation('dust','Dust cloud','尘潮',50,110,10,[group('swarm',12,0.7),group('shambler',6,1.4),group('runner',3,2)]),
  formation('flag-one','First flag','第一面战旗',110,111,1,[group('banner',1,0),group('swarm',28,0.22),group('runner',10,0.7)],true),
  formation('march','Ash march','灰烬行军',112,214,10,[group('shambler',9,0.9),group('swarm',12,0.73),group('armored',3,2.7,1.6),group('spitter',2,3,1.3)]),
  formation('vanguard','Crown vanguard','次冠先锋',215,216,1,[group('boss',1,0,0.45),group('shade',3,2),group('leaper',3,2.5)]),
  formation('breach','Breach patrol','裂隙巡队',218,295,10,[group('swarm',16,0.52),group('runner',7,1.3),group('splitter',2,3,1.4),group('mender',1,0)]),
  formation('flag-two','Black flag','第二面战旗',270,271,1,[group('banner',2,1),group('swarm',32,0.2),group('warden',2,2),group('charge',2,3)],true),
  formation('siege','Siege train','围城纵队',298,380,10,[group('swarm',16,0.5),group('shambler',8,1),group('brute',2,3,1.8),group('hush',1,0),group('leaper',2,2)]),
  formation('flag-three','Last flag','终局战旗',365,366,1,[group('banner',2,2),group('swarm',38,0.16),group('shade',6,0.85),group('charge',2,2)],true),
  formation('crown','Crown Breach','冠裂兽',380,381,1,[group('boss',1,0),group('warden',3,2),group('mender',2,1)]),
  formation('last','Last guard','末路护卫',382,421,9,[group('swarm',15,0.5),group('runner',6,1.3),group('armored',2,3),group('spitter',1,0)])
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
    const count=enqueueWave(state, sys, wave);
    director.nextWave += 1;
    state.wave = director.nextWave;
    if (wave.horde) {
      emit(state, 'wave_horde', {wave: state.wave, name: wave.name, count});
    }
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
    en: 'The wall is quiet. Zombies will crest the field in a moment.',
    zh: '城墙前一片寂静，第一波尸潮即将涌入！',
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
        horde:!!phase.horde,
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
  return {en: `${en} advance on the wall.`, zh: `${zh}正向城墙推进。`};
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

// Spawn health in the main campaign after the opening. Difficulty base health still applies.
const MAIN_PACK_HP = Object.freeze({easy:1,normal:4.43,hard:4,nightmare:6});
function enqueueWave(state, sys, wave) {
  const pressure = state.expedition==='watch' && wave.start>=65 ? MAIN_PACK_HP[state.difficulty] : 1;
  const mult = countMultiplier(state);
  const items = [];
  for (const group of wave.groups) {
    if (!ENEMIES[group.kind]) continue;
    const count = takeCount(sys, 'countRemainder', group.count, mult, group.exact);
    const interval = Math.max(0, Number(group.interval) || 0);
    const delay = Math.max(0, Number(group.delay) || 0);
    for (let i = 0; i < count; i++) {
      const item = {time: quantize(wave.start + delay + i * interval), kind: group.kind};
      item.overrides={healthScale:(group.healthScale || 1)*pressure};
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
  return items.length;
}

function spawnDue(state) {
  if (!state.director.queue.length || state.director.queue[0].time > state.time+1e-6) return;
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
    const count=enqueueWave(state, sys, wave);
    const span = groupSpan(wave.groups);
    let next = quantize(start + Math.max(12, span + 3));
    if (!(next > start)) next = quantize(start + 12);
    sys.endlessNext = next;
    sys.endlessWave += 1;
    state.wave += 1;
    if (wave.horde) {
      emit(state, 'wave_horde', {wave: state.wave, name: wave.name, count});
    }
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
