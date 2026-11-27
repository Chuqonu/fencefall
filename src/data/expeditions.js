// 20-Stage Campaign ("向僵尸开炮" linear stage progression: stage_1 .. stage_20).
export const TOTAL_STAGES = 20;

export const CHAPTERS = Object.freeze([
  { id: 1, range: [1, 5], name: { en: 'Ch.1 Wasteland Line', zh: '第一章 · 荒原防线' } },
  { id: 2, range: [6, 10], name: { en: 'Ch.2 Ruined Siege', zh: '第二章 · 废土围城' } },
  { id: 3, range: [11, 15], name: { en: 'Ch.3 Scorched Front', zh: '第三章 · 焦土决战' } },
  { id: 4, range: [16, 20], name: { en: 'Ch.4 Final Bastion', zh: '第四章 · 终末壁垒' } },
]);

const pack = (kind, count, interval, healthScale = 1) => ({ kind, count, interval, healthScale });
const phase = (id, from, until, every, name, groups, horde = false) => ({ id, from, until, every, name, groups, horde });

// Stage blueprint tuples:
// [stageNum, enShort, zhShort, focusEn, focusZh, summaryEn, summaryZh, hpScale, enemies, buildPhases]
function roundScale(v) {
  return Math.round(v * 100) / 100;
}

function makeStandardPhases(s, hp, opts) {
  const {
    primary = 'shambler',
    secondary = 'runner',
    elite = 'armored',
    support = null,
    bossScale = 0,
    vanguardScale = 0,
    swarmCount = 14,
  } = opts;
  const n = (en, zh) => ({ en, zh });
  const h = (mult) => roundScale(hp * mult);
  const phases = [
    // Opening wave at 0.5s: immediate mowing action + quick first draft
    phase(
      `s${s}-open`, 0.5, 1.5, 1,
      n(`Stage ${s} · Vanguard`, `第 ${s} 关 · 前锋尸潮`),
      [
        pack('swarm', Math.round(swarmCount * 0.65), 0.24, h(0.55)),
        pack('shambler', 5, 0.55, h(0.45)),
      ]
    ),
    // Early pressure (12s - 52s)
    phase(
      `s${s}-rush`, 12, 52, 10,
      n('Rising Tide', '尸潮涌动'),
      [
        pack('swarm', swarmCount, 0.3, h(0.75)),
        pack(primary, primary === 'swarm' ? swarmCount : primary === 'runner' ? 5 : 4, primary === 'swarm' ? 0.25 : 1.2, h(0.85)),
        pack(secondary, secondary === 'runner' || secondary === 'swarm' ? 4 : 2, 1.8, h(0.9)),
      ],
      s >= 4
    ),
    // Mid-stage escalation (55s - 105s)
    phase(
      `s${s}-clash`, 55, 105, 10,
      n('Steel Clash', '防线激战'),
      [
        pack('swarm', Math.round(swarmCount * 1.3), 0.22, h(0.9)),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 1.2) : 5, 1.0, h(1.0)),
        pack(elite, elite === 'brute' ? 2 : 3, 2.2, h(1.05)),
        ...(support ? [pack(support, support === 'banner' || support === 'hush' ? 1 : 2, 2.4, h(1.0))] : []),
      ],
      true
    ),
  ];

  // Optional Vanguard Mini-Boss on Stages 15, 19, 20
  if (vanguardScale > 0) {
    phases.push(
      phase(
        `s${s}-vanguard`, 107, 108, 1,
        n('Vanguard Boss', '先锋巨兽'),
        [
          pack('boss', 1, 0, roundScale(vanguardScale)),
          pack('swarm', Math.round(swarmCount * 1.1), 0.22, h(0.9)),
          pack(secondary, 4, 1.2, h(1.0)),
        ],
        true
      )
    );
  }

  // Late storm (110s - 152s)
  phases.push(
    phase(
      `s${s}-storm`, 110, 152, 10,
      n('Crimson Storm', '赤潮狂攻'),
      [
        pack('swarm', Math.round(swarmCount * 1.5), 0.18, h(1.0)),
        pack(secondary, secondary === 'runner' ? 7 : 3, 1.1, h(1.05)),
        pack(elite, elite === 'brute' ? 2 : 4, 1.9, h(1.12)),
        ...(support ? [pack(support, support === 'hush' ? 1 : 2, 2.2, h(1.08))] : []),
      ],
      true
    )
  );

  // Stage Finale (Boss or Final Wave at 156s)
  if (bossScale > 0) {
    phases.push(
      phase(
        `s${s}-boss`, 156, 157, 1,
        n('Boss Siege', '首领压境'),
        [
          pack('boss', 1, 0, roundScale(bossScale)),
          pack('swarm', Math.round(swarmCount * 1.6), 0.18, h(0.95)),
          pack(elite, 2, 2.2, h(1.05)),
          ...(support ? [pack(support, 2, 2.0, h(1.0))] : []),
        ],
        true
      )
    );
  } else {
    phases.push(
      phase(
        `s${s}-finale`, 156, 157, 1,
        n('Final Assault', '终局总攻'),
        [
          pack('swarm', Math.round(swarmCount * 1.8), 0.16, h(1.02)),
          pack(elite, elite === 'brute' ? 3 : 5, 1.4, h(1.15)),
          pack(secondary, secondary === 'runner' ? 8 : 4, 0.9, h(1.08)),
          ...(support ? [pack(support, 2, 1.8, h(1.05))] : []),
        ],
        true
      )
    );
  }
  return phases;
}

const STAGE_SPECS = [
  // Chapter 1: 荒原防线 (Stages 1-5) — Fast onboarding, escalating basics -> Boss 1
  {
    stage: 1, chapter: 1, hp: 0.56, xpPace: 0.52, swarmCount: 12,
    en: 'Ash Outpost', zh: '灰烬前哨',
    focusEn: 'Horde intro · Rapid evolutions', focusZh: '割草入门 · 极速进化',
    summaryEn: 'Dense shambler & gnawer waves kick off the defense. Level up fast and unleash auto super-weapons!',
    summaryZh: '开局迎战成群灰烬蹒者与尘啮，快速三选一成型满屏弹幕！',
    enemies: ['shambler', 'swarm'],
    opts: { primary: 'shambler', secondary: 'swarm', elite: 'shambler', swarmCount: 12 },
  },
  {
    stage: 2, chapter: 1, hp: 0.64, xpPace: 0.54, swarmCount: 14,
    en: 'Broken Bridge', zh: '断桥尸群',
    focusEn: 'Fast Wire Runners', focusZh: '极速线驰突进',
    summaryEn: 'Wire Runners sprint down the bridge toward your wall. Frost slow and rapid fire hold them back.',
    summaryZh: '高速线驰者混入尸潮直冲城墙，寒霜减速与高频火力轻松拦截。',
    enemies: ['shambler', 'swarm', 'runner'],
    opts: { primary: 'runner', secondary: 'shambler', elite: 'runner', swarmCount: 14 },
  },
  {
    stage: 3, chapter: 1, hp: 0.72, xpPace: 0.55, swarmCount: 15,
    en: 'Acid Crossing', zh: '酸雾路口',
    focusEn: 'Ranged Sap Spitters', focusZh: '远程喷酸工兵',
    summaryEn: 'Sap Spitters halt at mid-range to lob acid at the wall. Switch Priority targeting to drop them fast.',
    summaryZh: '腐浆喷者在中距离停步喷酸，可用「高危」索敌优先集火清理。',
    enemies: ['swarm', 'runner', 'spitter'],
    opts: { primary: 'spitter', secondary: 'runner', elite: 'spitter', swarmCount: 15 },
  },
  {
    stage: 4, chapter: 1, hp: 0.80, xpPace: 0.56, swarmCount: 16,
    en: 'Rusted Barricade', zh: '铁锈路障',
    focusEn: 'Armored & Gate Brutes', focusZh: '重甲板甲与蛮兽',
    summaryEn: 'Plate Walkers shrug off light hits while Gate Brutes march behind. Armor pierce & burn melt them.',
    summaryZh: '板甲行者与闸门蛮兽重装压境，穿甲弹芯与燃烧弹幕是最佳克星。',
    enemies: ['swarm', 'armored', 'brute', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', swarmCount: 16 },
  },
  {
    stage: 5, chapter: 1, hp: 0.88, xpPace: 0.54, swarmCount: 18, boss: true,
    en: 'First Crown', zh: '初代冠兽',
    focusEn: 'Chapter 1 Boss Siege', focusZh: '第一章首领决战',
    summaryEn: 'Crown Breach leads its first siege against the bastion! Bring heavy crits and orbital beams.',
    summaryZh: '冠裂兽首次率领尸潮压境！强化暴击、穿甲与全自动超武击溃首领。',
    enemies: ['swarm', 'runner', 'armored', 'boss'],
    opts: { primary: 'runner', secondary: 'spitter', elite: 'armored', bossScale: 0.48, swarmCount: 18 },
  },

  // Chapter 2: 废土围城 (Stages 6-10) — Splitters, Leapers, Menders, Shades -> Boss 2
  {
    stage: 6, chapter: 2, hp: 1.05, xpPace: 0.58, swarmCount: 18,
    en: 'Brood Tide', zh: '裂巢涌动',
    focusEn: 'Crack Broods & Swarms', focusZh: '分裂裂巢与虫海',
    summaryEn: 'Crack Broods burst into dust gnawers on death. AoE napalm and split bullets shine here.',
    summaryZh: '裂巢阵亡后会分裂出大量尘啮，燃油火海与分裂弹幕清场极爽。',
    enemies: ['swarm', 'splitter', 'runner'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'splitter', swarmCount: 18 },
  },
  {
    stage: 7, chapter: 2, hp: 1.22, xpPace: 0.60, swarmCount: 19,
    en: 'Leaper Ambush', zh: '灰跃突袭',
    focusEn: 'Leaping Ash Packs', focusZh: '跃袭突进伏击',
    summaryEn: 'Ash Leapers crouch and vault straight toward the wall. Frost chill and lightning stun break their charge.',
    summaryZh: '灰跃者蓄力扑跃直逼防线，寒霜与雷击麻痹可打断突袭节奏。',
    enemies: ['leaper', 'runner', 'swarm'],
    opts: { primary: 'leaper', secondary: 'runner', elite: 'leaper', support: 'spitter', swarmCount: 19 },
  },
  {
    stage: 8, chapter: 2, hp: 1.42, xpPace: 0.60, swarmCount: 20,
    en: 'Mender Column', zh: '烬医方阵',
    focusEn: 'Healers behind Tanks', focusZh: '治疗方阵与重盾',
    summaryEn: 'Ash Menders patch up wounded Plate Walkers. Focus Priority targets or overwhelm with AoE DPS.',
    summaryZh: '烬补者在重甲后方持续回血，切「高危」索敌或猛火压制快速破阵。',
    enemies: ['armored', 'mender', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', support: 'mender', swarmCount: 20 },
  },
  {
    stage: 9, chapter: 2, hp: 1.65, xpPace: 0.60, swarmCount: 21,
    en: 'Shade Corridor', zh: '幽影长廊',
    focusEn: 'Phasing Fence Shades', focusZh: '虚化幽影潜行',
    summaryEn: 'Fence Shades phase out to dodge direct bullets—poison clouds and burning napalm still scorch them.',
    summaryZh: '栅影周期虚化规避直射，毒雾与火海持续灼烧仍可稳定杀伤。',
    enemies: ['shade', 'spitter', 'leaper'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'spitter', support: 'mender', swarmCount: 21 },
  },
  {
    stage: 10, chapter: 2, hp: 1.90, xpPace: 0.58, swarmCount: 22, boss: true,
    en: 'Horde Overlord', zh: '狂潮领主',
    focusEn: 'Chapter 2 Boss Siege', focusZh: '第二章首领决战',
    summaryEn: 'An empowered Crown Breach advances with Mender and Splitter escorts. Upgrade your Core Gems!',
    summaryZh: '强化冠裂兽携烬补者与裂巢压境，镶嵌核心宝石与武装装备全力迎战！',
    enemies: ['splitter', 'mender', 'armored', 'boss'],
    opts: { primary: 'splitter', secondary: 'leaper', elite: 'armored', support: 'mender', bossScale: 1.05, swarmCount: 22 },
  },

  // Chapter 3: 焦土决战 (Stages 11-15) — Banners, Wardens, Charges, Hush -> Double Boss 3
  {
    stage: 11, chapter: 3, hp: 2.15, xpPace: 0.60, swarmCount: 23,
    en: 'Crimson Standard', zh: '血旗冲锋',
    focusEn: 'Haste Banner Rush', focusZh: '加速旗孽冲锋',
    summaryEn: 'Standard Wretches triple the speed of nearby zombies. Snipe banners before the rush hits!',
    summaryZh: '旗孽令周围尸群狂飙加速，优先点杀旗手阻止狂潮撞墙！',
    enemies: ['banner', 'runner', 'leaper', 'swarm'],
    opts: { primary: 'runner', secondary: 'leaper', elite: 'armored', support: 'banner', swarmCount: 23 },
  },
  {
    stage: 12, chapter: 3, hp: 2.42, xpPace: 0.60, swarmCount: 24,
    en: 'Aegis Phalanx', zh: '盾墙推进',
    focusEn: 'Shielded Heavy Packs', focusZh: '护盾烬卫重装阵',
    summaryEn: 'Ash Wardens shield nearby Brutes and Armored walkers. Cut down Wardens first to shatter the phalanx.',
    summaryZh: '烬卫为同伴提供强力减伤护盾，优先斩杀烬卫瓦解铁壁方阵。',
    enemies: ['warden', 'armored', 'brute', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 24 },
  },
  {
    stage: 13, chapter: 3, hp: 2.72, xpPace: 0.62, swarmCount: 25,
    en: 'Cinder Tunnel', zh: '爆燃矿道',
    focusEn: 'Explosive Cinder Charges', focusZh: '引线自爆烬爆者',
    summaryEn: 'Cinder Charges ignite explosive fuses right at your wall. Knockback & burst stop them before detonation!',
    summaryZh: '烬爆者贴墙点燃引线爆发巨额伤害，靠击退与爆发在引爆前清除。',
    enemies: ['charge', 'runner', 'splitter', 'spitter'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'charge', support: 'spitter', swarmCount: 25 },
  },
  {
    stage: 14, chapter: 3, hp: 3.05, xpPace: 0.62, swarmCount: 25,
    en: 'Silent Night', zh: '寂静寒夜',
    focusEn: 'Ash Hush Jamming', focusZh: '烬寂降频干扰',
    summaryEn: 'Ash Hush slows defender reload speed while clamped to the wall. Clear it swiftly to keep firing!',
    summaryZh: '烬寂贴墙会拖慢全队攻速，搭配高能射线与电弧连锁迅速清场。',
    enemies: ['hush', 'shade', 'spitter', 'warden'],
    opts: { primary: 'shade', secondary: 'spitter', elite: 'warden', support: 'hush', swarmCount: 25 },
  },
  {
    stage: 15, chapter: 3, hp: 3.40, xpPace: 0.60, swarmCount: 26, boss: true,
    en: 'Scorched Sovereign', zh: '焦土霸主',
    focusEn: 'Vanguard + Boss Siege', focusZh: '双首领焦土决战',
    summaryEn: 'A mid-stage Vanguard Boss softens the wall before the Scorched Sovereign arrives with Wardens & Banners.',
    summaryZh: '中段先锋巨兽先声夺人，终局焦土霸主携旗孽与烬卫全面总攻！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'charge', secondary: 'banner', elite: 'warden', support: 'mender', vanguardScale: 0.95, bossScale: 1.75, swarmCount: 26 },
  },

  // Chapter 4: 终末壁垒 (Stages 16-20) — Endgame Mastery
  {
    stage: 16, chapter: 4, hp: 3.80, xpPace: 0.62, swarmCount: 26,
    en: 'Iron Deluge', zh: '钢铁洪流',
    focusEn: 'Juggernaut Armored Wave', focusZh: '重甲蛮兽钢铁洪流',
    summaryEn: 'Wall-to-wall Brutes, Armored walkers, Wardens, and Menders. Bring HP Shredder & Armor Pierce!',
    summaryZh: '蛮兽、板甲、烬卫与烬补者全重装压境，百分比斩杀与穿甲显威！',
    enemies: ['brute', 'armored', 'warden', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 26 },
  },
  {
    stage: 17, chapter: 4, hp: 4.25, xpPace: 0.62, swarmCount: 27,
    en: 'Shadow Detonation', zh: '暗影爆破',
    focusEn: 'Shades, Charges & Banners', focusZh: '幽影自爆极速突袭',
    summaryEn: 'Banner-boosted Leapers, phasing Shades, and Cinder Charges strike from every lane.',
    summaryZh: '旗孽加速的灰跃、幽影与自爆烬爆多路齐发，全屏超武压制致胜！',
    enemies: ['shade', 'charge', 'leaper', 'banner'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'charge', support: 'banner', swarmCount: 27 },
  },
  {
    stage: 18, chapter: 4, hp: 4.75, xpPace: 0.62, swarmCount: 28,
    en: 'Hushed Horde', zh: '静默尸海',
    focusEn: 'Massive Swarm & Hush', focusZh: '静默干扰无尽虫海',
    summaryEn: 'Endless Brood splits and Spitters backed by Ash Hush jamming. Keep AoE super-weapons cycling!',
    summaryZh: '裂巢、喷酸与烬寂交织成铺天盖地的尸海，靠高频超武循环破局！',
    enemies: ['hush', 'splitter', 'swarm', 'spitter'],
    opts: { primary: 'splitter', secondary: 'spitter', elite: 'charge', support: 'hush', swarmCount: 28 },
  },
  {
    stage: 19, chapter: 4, hp: 5.30, xpPace: 0.60, swarmCount: 29,
    en: 'Eve of Dawn', zh: '破晓前夜',
    focusEn: 'All-Elite Gauntlet', focusZh: '全精英混合试炼',
    summaryEn: 'Every elite zombie role plus a Vanguard Crown Breach tests your complete build before Stage 20.',
    summaryZh: '全部精英尸种与先锋巨兽齐上阵，终局决战前的终极阵容检验！',
    enemies: ['banner', 'warden', 'hush', 'brute'],
    opts: { primary: 'warden', secondary: 'banner', elite: 'brute', support: 'hush', vanguardScale: 1.45, swarmCount: 29 },
  },
  {
    stage: 20, chapter: 4, hp: 5.90, xpPace: 0.58, swarmCount: 30, boss: true,
    en: 'Crown Cataclysm', zh: '终局冠裂',
    focusEn: 'Stage 20 Final Boss', focusZh: '第 20 关终极首领',
    summaryEn: 'The ultimate 20th-stage bastion defense! Conquer the Vanguard and full-power Crown Breach to master the campaign.',
    summaryZh: '前 20 关终极决战！击溃先锋巨兽与满血终局冠裂兽，荣登壁垒之巅！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'armored', secondary: 'charge', elite: 'warden', support: 'banner', vanguardScale: 1.55, bossScale: 2.65, swarmCount: 30 },
  },
];

export const STAGE_ORDER = Object.freeze(STAGE_SPECS.map((s) => `stage_${s.stage}`));
export const EXPEDITION_ORDER = STAGE_ORDER;

export const STAGES = {};
export const EXPEDITIONS = {};

for (const spec of STAGE_SPECS) {
  const id = `stage_${spec.stage}`;
  const entry = {
    id,
    stage: spec.stage,
    chapter: spec.chapter,
    boss: Boolean(spec.boss),
    minutes: 3,
    xpPace: spec.xpPace,
    firstClearBonus: 40 + (spec.stage - 1) * 10,
    shortName: { en: spec.en, zh: spec.zh },
    name: { en: `Stage ${spec.stage} · ${spec.en}`, zh: `第 ${spec.stage} 关 · ${spec.zh}` },
    focus: { en: spec.focusEn, zh: spec.focusZh },
    summary: { en: spec.summaryEn, zh: spec.summaryZh },
    enemies: spec.enemies.slice(),
    phases: makeStandardPhases(spec.stage, spec.hp, spec.opts),
  };
  STAGES[id] = entry;
  EXPEDITIONS[id] = entry;
}

export function isExpedition(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPEDITIONS, id);
}

export function stageNumber(id) {
  if (typeof id !== 'string') return 0;
  const spec = STAGES[id];
  return spec ? spec.stage : 0;
}

export function stageIdFor(num) {
  const n = Math.max(1, Math.min(TOTAL_STAGES, Math.floor(Number(num) || 1)));
  return `stage_${n}`;
}

export function nextStageId(id) {
  const n = stageNumber(id);
  if (n <= 0 || n >= TOTAL_STAGES) return null;
  return `stage_${n + 1}`;
}

export function stageClearRecord(profile, id) {
  const rec = profile?.expeditions?.[id];
  if (!rec || typeof rec !== 'object') return { clears: 0, stars: 0, bestTime: null };
  const clears = Number.isFinite(rec.clears) ? Math.max(0, Math.floor(rec.clears)) : 0;
  const stars = Number.isFinite(rec.stars) ? Math.max(0, Math.min(3, Math.floor(rec.stars))) : (clears > 0 ? 1 : 0);
  const bestTime = Number.isFinite(rec.bestTime) ? rec.bestTime : null;
  return { clears, stars, bestTime };
}

export function highestClearedStage(profile) {
  let highest = 0;
  for (let n = 1; n <= TOTAL_STAGES; n += 1) {
    if (stageClearRecord(profile, `stage_${n}`).clears > 0) highest = n;
  }
  return highest;
}

export function highestUnlockedStage(profile) {
  return Math.min(TOTAL_STAGES, highestClearedStage(profile) + 1);
}

export function highestUnlockedStageId(profile) {
  return `stage_${highestUnlockedStage(profile)}`;
}

export function isStageUnlocked(profile, id) {
  const n = stageNumber(id);
  if (n <= 0) return false;
  return n <= highestUnlockedStage(profile);
}

export function totalStarsEarned(profile) {
  let sum = 0;
  for (let n = 1; n <= TOTAL_STAGES; n += 1) {
    sum += stageClearRecord(profile, `stage_${n}`).stars;
  }
  return sum;
}

freezeDeep(STAGES);
freezeDeep(EXPEDITIONS);
freezeDeep(STAGE_ORDER);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}
