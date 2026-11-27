// 20-Stage Campaign ("向僵尸开炮" linear stage progression: stage_1 .. stage_20).
export const TOTAL_STAGES = 20;

export const CHAPTERS = Object.freeze([
  { id: 1, range: [1, 5], name: { en: 'Ch.1 Wasteland Line', zh: '第一章 · 荒原防线' } },
  { id: 2, range: [6, 10], name: { en: 'Ch.2 Ruined Siege', zh: '第二章 · 废土围城' } },
  { id: 3, range: [11, 15], name: { en: 'Ch.3 Scorched Front', zh: '第三章 · 焦土决战' } },
  { id: 4, range: [16, 20], name: { en: 'Ch.4 Final Bastion', zh: '第四章 · 终末壁垒' } },
]);

const pack = (kind, count, interval, healthScale = 1, delay = 0) => ({ kind, count, interval, healthScale, delay });
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
    // 1. Opening wave at 0.5s: immediate mowing action, streams through ~4.5s right into Wave 2 at 4.0s
    phase(
      `s${s}-open`, 0.5, 1.5, 1,
      n(`Stage ${s} · Vanguard`, `第 ${s} 关 · 前锋尸潮`),
      [
        pack('swarm', Math.round(swarmCount * 0.7), 0.42, h(0.42), 0),
        pack('shambler', 5, 0.85, h(0.38), 0.4),
      ]
    ),
    // 2. Early wave (4s - 60s, every 8s): starts BEFORE Wave 1 clears; each wave streams ~8.6s so waves overlap continuously
    phase(
      `s${s}-rush`, 4, 60, 8,
      n('Rising Tide', '尸潮涌动'),
      [
        pack('swarm', Math.max(8, Math.round(swarmCount * 0.82)), 0.72, h(0.56), 0),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 0.8) : primary === 'runner' ? 4 : 3, primary === 'swarm' ? 0.65 : 2.1, h(0.62), 1.3),
        pack(secondary, secondary === 'runner' || secondary === 'swarm' ? 3 : 2, 2.6, h(0.68), 3.2),
      ],
      s >= 4
    ),
    // 3. First Horde Surge (60s - 124s, every 8s): zero phase gap, dense overlapping mowing action
    phase(
      `s${s}-surge`, 60, 124, 8,
      n('First Surge', '第一波尸潮'),
      [
        pack('swarm', Math.round(swarmCount * 1.05), 0.56, h(0.72), 0),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 0.95) : 4, primary === 'swarm' ? 0.55 : 1.9, h(0.78), 1.1),
        pack(elite, elite === 'brute' ? 2 : 3, 2.5, h(0.82), 2.7),
        ...(support ? [pack(support, support === 'banner' || support === 'hush' ? 1 : 2, 2.8, h(0.8), 4.0)] : []),
      ],
      true
    ),
    // 4. Mid-Stage Steel Clash (124s - 188s, every 8s): seamless handover from Surge
    phase(
      `s${s}-clash`, 124, 188, 8,
      n('Steel Clash', '中段激战'),
      [
        pack('swarm', Math.round(swarmCount * 1.15), 0.52, h(0.86), 0),
        pack(secondary, secondary === 'runner' ? 5 : 3, secondary === 'runner' ? 1.6 : 2.3, h(0.92), 1.0),
        pack(elite, elite === 'brute' ? 2 : 3, 2.5, h(0.96), 2.5),
        ...(support ? [pack(support, support === 'hush' ? 1 : 2, 2.7, h(0.94), 3.9)] : []),
      ],
      false
    ),
  ];

  // Optional Mid-Stage Vanguard Mini-Boss on Boss / Late Stages (5, 10, 15, 19, 20)
  if (vanguardScale > 0) {
    phases.push(
      phase(
        `s${s}-vanguard`, 152, 153, 1,
        n('Vanguard Boss', '先锋巨兽'),
        [
          pack('boss', 1, 0, roundScale(vanguardScale), 0),
          pack('swarm', Math.round(swarmCount * 1.0), 0.46, h(0.9), 0.4),
          pack(secondary, 4, 1.5, h(0.96), 1.2),
        ],
        true
      )
    );
  }

  // 5. Crimson Storm (188s - 244s, every 8s): intense nonstop bullet-storm spectacle
  phases.push(
    phase(
      `s${s}-storm`, 188, 244, 8,
      n('Crimson Storm', '赤潮狂攻'),
      [
        pack('swarm', Math.round(swarmCount * 1.28), 0.46, h(0.98), 0),
        pack(primary, primary === 'swarm' ? Math.round(swarmCount * 1.1) : 5, primary === 'swarm' ? 0.48 : 1.65, h(1.04), 0.8),
        pack(elite, elite === 'brute' ? 2 : 3, 2.3, h(1.1), 2.3),
        ...(support ? [pack(support, support === 'hush' ? 1 : 2, 2.6, h(1.05), 3.7)] : []),
      ],
      true
    )
  );

  // 6. Final Siege Buildup (244s - 284s, every 8s): unbroken pressure right into Boss / Finale
  phases.push(
    phase(
      `s${s}-siege`, 244, 284, 8,
      n('Last Stand', '死守防线'),
      [
        pack('swarm', Math.round(swarmCount * 1.4), 0.42, h(1.02), 0),
        pack(secondary, secondary === 'runner' ? 6 : 4, secondary === 'runner' ? 1.35 : 2.0, h(1.06), 0.8),
        pack(elite, elite === 'brute' ? 3 : 4, 2.0, h(1.12), 1.8),
        ...(support ? [pack(support, 2, 2.5, h(1.06), 3.5)] : []),
      ],
      true
    )
  );

  // 7. Stage Finale (Boss or Final Assault at 284s -> overlaps Siege tail, ~5 min total clear)
  if (bossScale > 0) {
    phases.push(
      phase(
        `s${s}-boss`, 284, 285, 1,
        n('Boss Siege', '首领压境'),
        [
          pack('boss', 1, 0, roundScale(bossScale), 0),
          pack('swarm', Math.round(swarmCount * 1.7), 0.42, h(0.96), 0.3),
          pack(elite, 3, 2.2, h(1.08), 1.5),
          ...(support ? [pack(support, 2, 2.4, h(1.02), 2.5)] : []),
        ],
        true
      )
    );
  } else {
    phases.push(
      phase(
        `s${s}-finale`, 284, 285, 1,
        n('Final Assault', '终局总攻'),
        [
          pack('swarm', Math.round(swarmCount * 1.9), 0.38, h(1.04), 0),
          pack(elite, elite === 'brute' ? 4 : 5, 1.8, h(1.15), 0.9),
          pack(secondary, secondary === 'runner' ? 8 : 4, 1.25, h(1.08), 0.5),
          ...(support ? [pack(support, 2, 2.2, h(1.06), 2.2)] : []),
        ],
        true
      )
    );
  }
  return phases;
}

const STAGE_SPECS = [
  // Chapter 1: 荒原防线 (Stages 1-5) — Welcoming pure Solo-Gunner onboarding -> Boss 1
  {
    stage: 1, chapter: 1, hp: 0.65, xpPace: 1.05, swarmCount: 12,
    en: 'Ash Outpost', zh: '灰烬前哨',
    focusEn: 'Horde intro · Rapid upgrades', focusZh: '割草入门 · 极速成型',
    summaryEn: 'Waves of shamblers and gnawers march toward the wall. Pick Gun Mods and Auto Skills to unleash bullet storms!',
    summaryZh: '开局迎战成群蹒者与尘啮，三选一解锁枪械强化与自动技能，轻松割草！',
    enemies: ['shambler', 'swarm'],
    opts: { primary: 'shambler', secondary: 'swarm', elite: 'shambler', swarmCount: 12 },
  },
  {
    stage: 2, chapter: 1, hp: 0.78, xpPace: 1.15, swarmCount: 14,
    en: 'Broken Bridge', zh: '断桥尸群',
    focusEn: 'Fast Wire Runners', focusZh: '极速线驰突进',
    summaryEn: 'Fast Wire Runners dash straight for the wall. Frost Rounds and Rapid Fire keep them pinned down.',
    summaryZh: '高速线驰者混入尸潮直冲城墙，急冻减速弹与极速连射轻松拦截。',
    enemies: ['shambler', 'swarm', 'runner'],
    opts: { primary: 'runner', secondary: 'shambler', elite: 'runner', swarmCount: 14 },
  },
  {
    stage: 3, chapter: 1, hp: 0.92, xpPace: 1.25, swarmCount: 15,
    en: 'Acid Crossing', zh: '酸雾路口',
    focusEn: 'Ranged Sap Spitters', focusZh: '远程喷酸工兵',
    summaryEn: 'Sap Spitters halt mid-field to spit acid at the wall. Tap the Gunner to switch Priority targeting!',
    summaryZh: '腐浆喷者在中距离停步喷酸，点击枪手切「高危」优先点杀它们。',
    enemies: ['swarm', 'runner', 'spitter'],
    opts: { primary: 'spitter', secondary: 'runner', elite: 'spitter', swarmCount: 15 },
  },
  {
    stage: 4, chapter: 1, hp: 1.08, xpPace: 1.32, swarmCount: 16,
    en: 'Rusted Barricade', zh: '铁锈路障',
    focusEn: 'Armored & Gate Brutes', focusZh: '重甲板甲与蛮兽',
    summaryEn: 'Plate Walkers shrug off light shots while Gate Brutes march behind. Armor Pierce and Napalm melt them.',
    summaryZh: '板甲行者与闸门蛮兽重装压境，穿甲弹芯与燃油火海是最佳克星。',
    enemies: ['swarm', 'armored', 'brute', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', swarmCount: 16 },
  },
  {
    stage: 5, chapter: 1, hp: 1.25, xpPace: 1.35, swarmCount: 17, boss: true,
    en: 'First Crown', zh: '初代冠兽',
    focusEn: 'Chapter 1 Boss Siege', focusZh: '第一章首领决战',
    summaryEn: 'Crown Breach leads its first siege! Stack Deadeye Crit, Armor Pierce, and Orbital Laser to crush it.',
    summaryZh: '冠裂兽首次率领尸潮压境！搭配致命暴击、穿甲与高能激光柱击溃首领。',
    enemies: ['swarm', 'runner', 'armored', 'boss'],
    opts: { primary: 'runner', secondary: 'spitter', elite: 'armored', vanguardScale: 0.55, bossScale: 0.95, swarmCount: 17 },
  },

  // Chapter 2: 废土围城 (Stages 6-10) — Splitters, Leapers, Menders, Shades -> Boss 2
  {
    stage: 6, chapter: 2, hp: 1.48, xpPace: 1.45, swarmCount: 18,
    en: 'Brood Tide', zh: '裂巢涌动',
    focusEn: 'Crack Broods & Swarms', focusZh: '分裂裂巢与虫海',
    summaryEn: 'Crack Broods burst into dust gnawers on death. Napalm Fire Sea and Split Shrapnel clear crowds fast.',
    summaryZh: '裂巢阵亡后会分裂出大量尘啮，燃油火海与子母分裂弹清场极爽。',
    enemies: ['swarm', 'splitter', 'runner'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'splitter', swarmCount: 18 },
  },
  {
    stage: 7, chapter: 2, hp: 1.72, xpPace: 1.50, swarmCount: 19,
    en: 'Leaper Ambush', zh: '灰跃突袭',
    focusEn: 'Leaping Ash Packs', focusZh: '跃袭突进伏击',
    summaryEn: 'Ash Leapers crouch and vault toward the wall. Glacial Barrage and EM Chain Strike break their charge.',
    summaryZh: '灰跃者蓄力扑跃直逼城墙，干冰齐射柱与电磁连锁雷可打断突袭。',
    enemies: ['leaper', 'runner', 'swarm'],
    opts: { primary: 'leaper', secondary: 'runner', elite: 'leaper', support: 'spitter', swarmCount: 19 },
  },
  {
    stage: 8, chapter: 2, hp: 2.00, xpPace: 1.55, swarmCount: 20,
    en: 'Mender Column', zh: '烬医方阵',
    focusEn: 'Healers behind Tanks', focusZh: '治疗方阵与重盾',
    summaryEn: 'Ash Menders heal wounded Plate Walkers. Use Priority targeting or heavy AoE skills to break their line.',
    summaryZh: '烬补者在重甲后方持续回血，切「高危」索敌或自动技能群攻快速破阵。',
    enemies: ['armored', 'mender', 'spitter'],
    opts: { primary: 'armored', secondary: 'spitter', elite: 'brute', support: 'mender', swarmCount: 20 },
  },
  {
    stage: 9, chapter: 2, hp: 2.30, xpPace: 1.60, swarmCount: 20,
    en: 'Shade Corridor', zh: '幽影长廊',
    focusEn: 'Phasing Wall Shades', focusZh: '虚化幽影潜行',
    summaryEn: 'Wall Shades phase out to dodge direct bullets—Napalm Fire Sea and Flame Rounds still scorch them.',
    summaryZh: '幽影周期虚化规避直射，燃油火海与烈焰爆裂弹仍可持续灼烧击杀。',
    enemies: ['shade', 'spitter', 'leaper'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'spitter', support: 'mender', swarmCount: 20 },
  },
  {
    stage: 10, chapter: 2, hp: 2.65, xpPace: 1.62, swarmCount: 21, boss: true,
    en: 'Horde Overlord', zh: '狂潮领主',
    focusEn: 'Chapter 2 Boss Siege', focusZh: '第二章首领决战',
    summaryEn: 'An empowered Crown Breach advances with Mender and Splitter escorts. Socket Core Gems in the Armory!',
    summaryZh: '强化冠裂兽携烬补者与裂巢压境，前往军械库镶嵌核心宝石与武装全力迎战！',
    enemies: ['splitter', 'mender', 'armored', 'boss'],
    opts: { primary: 'splitter', secondary: 'leaper', elite: 'armored', support: 'mender', vanguardScale: 1.1, bossScale: 1.85, swarmCount: 21 },
  },

  // Chapter 3: 焦土决战 (Stages 11-15) — Banners, Wardens, Charges, Hush -> Double Boss 3
  {
    stage: 11, chapter: 3, hp: 3.05, xpPace: 1.70, swarmCount: 22,
    en: 'Crimson Standard', zh: '血旗冲锋',
    focusEn: 'Haste Banner Rush', focusZh: '加速旗孽冲锋',
    summaryEn: 'Standard Wretches accelerate nearby zombies. Snipe banners early and sweep lanes with Armored Sweeper!',
    summaryZh: '旗孽令周围尸群狂飙加速，优先点杀旗手并用重装装甲车碾压清路！',
    enemies: ['banner', 'runner', 'leaper', 'swarm'],
    opts: { primary: 'runner', secondary: 'leaper', elite: 'armored', support: 'banner', swarmCount: 22 },
  },
  {
    stage: 12, chapter: 3, hp: 3.50, xpPace: 1.75, swarmCount: 23,
    en: 'Aegis Phalanx', zh: '盾墙推进',
    focusEn: 'Shielded Heavy Packs', focusZh: '护盾烬卫重装阵',
    summaryEn: 'Ash Wardens shield nearby Brutes and Plate Walkers. Drop Wardens first to shatter the phalanx.',
    summaryZh: '烬卫为同伴提供强力减伤护盾，优先斩杀烬卫瓦解重装方阵。',
    enemies: ['warden', 'armored', 'brute', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 23 },
  },
  {
    stage: 13, chapter: 3, hp: 4.00, xpPace: 1.80, swarmCount: 24,
    en: 'Cinder Tunnel', zh: '爆燃矿道',
    focusEn: 'Explosive Cinder Charges', focusZh: '引线自爆烬爆者',
    summaryEn: 'Cinder Charges ignite explosive fuses right at your wall. Knockback & burst stop them before detonation!',
    summaryZh: '烬爆者贴墙点燃引线爆发巨额伤害，靠击退与高爆发在引爆前清除。',
    enemies: ['charge', 'runner', 'splitter', 'spitter'],
    opts: { primary: 'splitter', secondary: 'runner', elite: 'charge', support: 'spitter', swarmCount: 24 },
  },
  {
    stage: 14, chapter: 3, hp: 4.55, xpPace: 1.85, swarmCount: 24,
    en: 'Silent Night', zh: '寂静寒夜',
    focusEn: 'Ash Hush Jamming', focusZh: '烬寂降频干扰',
    summaryEn: 'Ash Hush slows fire rate while clamped to the wall. Pair Orbital Laser and EM Chain Strike to clear it fast!',
    summaryZh: '烬寂贴墙会拖慢攻速，搭配高能激光柱与电磁连锁雷迅速清场。',
    enemies: ['hush', 'shade', 'spitter', 'warden'],
    opts: { primary: 'shade', secondary: 'spitter', elite: 'warden', support: 'hush', swarmCount: 24 },
  },
  {
    stage: 15, chapter: 3, hp: 5.15, xpPace: 1.85, swarmCount: 25, boss: true,
    en: 'Scorched Sovereign', zh: '焦土霸主',
    focusEn: 'Vanguard + Boss Siege', focusZh: '双首领焦土决战',
    summaryEn: 'A mid-stage Vanguard Boss tests your wall before the Scorched Sovereign arrives with Wardens & Banners.',
    summaryZh: '中段先锋巨兽先声夺人，终局焦土霸主携旗孽与烬卫全面总攻！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'charge', secondary: 'banner', elite: 'warden', support: 'mender', vanguardScale: 1.7, bossScale: 3.1, swarmCount: 25 },
  },

  // Chapter 4: 终末壁垒 (Stages 16-20) — Endgame Mastery
  {
    stage: 16, chapter: 4, hp: 5.80, xpPace: 1.90, swarmCount: 25,
    en: 'Iron Deluge', zh: '钢铁洪流',
    focusEn: 'Juggernaut Armored Wave', focusZh: '重甲蛮兽钢铁洪流',
    summaryEn: 'Wall-to-wall Brutes, Armored walkers, Wardens, and Menders. Bring HP Shredder & Armor Pierce!',
    summaryZh: '蛮兽、板甲、烬卫与烬补者全重装压境，百分比斩杀宝石与穿甲显威！',
    enemies: ['brute', 'armored', 'warden', 'mender'],
    opts: { primary: 'armored', secondary: 'mender', elite: 'brute', support: 'warden', swarmCount: 25 },
  },
  {
    stage: 17, chapter: 4, hp: 6.50, xpPace: 1.95, swarmCount: 26,
    en: 'Shadow Detonation', zh: '暗影爆破',
    focusEn: 'Shades, Charges & Banners', focusZh: '幽影自爆极速突袭',
    summaryEn: 'Banner-boosted Leapers, phasing Shades, and Cinder Charges strike from every angle.',
    summaryZh: '旗孽加速的灰跃、幽影与自爆烬爆多路齐发，靠全屏自动技能压制致胜！',
    enemies: ['shade', 'charge', 'leaper', 'banner'],
    opts: { primary: 'shade', secondary: 'leaper', elite: 'charge', support: 'banner', swarmCount: 26 },
  },
  {
    stage: 18, chapter: 4, hp: 7.25, xpPace: 2.00, swarmCount: 27,
    en: 'Hushed Horde', zh: '静默尸海',
    focusEn: 'Massive Swarm & Hush', focusZh: '静默干扰无尽虫海',
    summaryEn: 'Relentless Brood splits and Spitters backed by Ash Hush jamming. Keep Auto Skills cycling non-stop!',
    summaryZh: '裂巢、喷酸与烬寂交织成铺天盖地的尸海，靠高频自动技能循环破局！',
    enemies: ['hush', 'splitter', 'swarm', 'spitter'],
    opts: { primary: 'splitter', secondary: 'spitter', elite: 'charge', support: 'hush', swarmCount: 27 },
  },
  {
    stage: 19, chapter: 4, hp: 8.10, xpPace: 2.00, swarmCount: 28,
    en: 'Eve of Dawn', zh: '破晓前夜',
    focusEn: 'All-Elite Gauntlet', focusZh: '全精英混合试炼',
    summaryEn: 'Every elite zombie role plus a Vanguard Crown Breach tests your complete build before Stage 20.',
    summaryZh: '全部精英尸种与先锋巨兽齐上阵，第 20 关终极决战前的全能检验！',
    enemies: ['banner', 'warden', 'hush', 'brute'],
    opts: { primary: 'warden', secondary: 'banner', elite: 'brute', support: 'hush', vanguardScale: 2.4, swarmCount: 28 },
  },
  {
    stage: 20, chapter: 4, hp: 9.00, xpPace: 2.05, swarmCount: 29, boss: true,
    en: 'Crown Cataclysm', zh: '终局冠裂',
    focusEn: 'Stage 20 Final Boss', focusZh: '第 20 关终极首领',
    summaryEn: 'The ultimate 20th-stage bastion defense! Conquer the Vanguard and full-power Crown Breach to master the campaign.',
    summaryZh: '前 20 关终极决战！击溃先锋巨兽与满血终局冠裂兽，荣登城墙之巅！',
    enemies: ['banner', 'warden', 'charge', 'boss'],
    opts: { primary: 'armored', secondary: 'charge', elite: 'warden', support: 'banner', vanguardScale: 2.6, bossScale: 4.5, swarmCount: 29 },
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
    minutes: 5,
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
