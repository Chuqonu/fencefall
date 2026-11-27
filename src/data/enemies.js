// Enemy catalog for Fencefall. Keys are the simulation kinds, base bodies and specials.
// Names and descriptions are player-facing; combat numbers are the Normal base.
//
// spawnEnemy (src/systems/movement.js) applies difficulty exactly once:
//   healthScale = overrides.healthScale ?? 1
//   if overrides.maxHp is finite, maxHp is that absolute value and hp is overrides.hp ?? maxHp
//   else if overrides.hp is finite, hp and maxHp are that absolute value
//   else hp = maxHp = row.hp * difficulty.health * healthScale
//   speed = row.speed * difficulty.speed
//   damage = row.damage * difficulty.damage
//   copy radius, attackInterval, xp, armor (do not difficulty-scale these)
// Absolute hp/maxHp overrides are final so tests can pin a body. healthScale is
// how this director weakens the mid-run boss and boss-called swarms without a second
// difficulty multiply. x/y overrides skip the Gaussian spawn when provided.
//
// damage is fence damage per completed attack, not damage per second.
// speed is logical px/s. Movement and combat must read enemy.speed, enemy.damage
// and enemy.attackInterval live: the wave director multiplies them once on enrage.
// armor is a fraction in [0, 0.8] removed from incoming hits.
// Specials append one mechanic object after armor: leap, split, mend, phase, banner, ward, charge, or hush.
// Enemies stop with center y <= fenceY - radius and never damage defenders.
// xp is awarded once on kill. Four ash shamblers are 8 xp, the opening draft threshold.

export const ENEMIES = {
  shambler: {
    name: {en: 'Ash Shambler', zh: '灰烬蹒者'},
    description: {
      en: 'Standard frontline zombie with steady speed and no armor, chewing steadily at the wall.',
      zh: '最常见的普通僵尸：步速和血量适中，没有护甲，贴墙后持续啃咬城墙。',
    },
    role: {en: 'Grunt', zh: '步兵'},
    threat: 1,
    hp: 52,
    speed: 30,
    radius: 13,
    damage: 7,
    attackInterval: 1.25,
    xp: 1,
    armor: 0,
  },
  runner: {
    name: {en: 'Wire Runner', zh: '线驰者'},
    description: {
      en: 'Fast sprinter with thin health that rushes the wall ahead of the horde.',
      zh: '移动极快的突进僵尸，血量薄但会抢先冲到城墙前，适合用减速或速射拦截。',
    },
    role: {en: 'Raider', zh: '突进'},
    threat: 2,
    hp: 32,
    speed: 62,
    radius: 11,
    damage: 5,
    attackInterval: 0.9,
    xp: 1,
    armor: 0,
  },
  brute: {
    name: {en: 'Gate Brute', zh: '闸门蛮兽'},
    description: {
      en: 'Huge and slow siege zombie with high health and heavy wall slams.',
      zh: '体型巨大的重型攻城僵尸，移速慢但血量厚实，每一击都能重创城墙。',
    },
    role: {en: 'Siege', zh: '攻城'},
    threat: 5,
    hp: 560,
    speed: 19,
    radius: 20,
    damage: 26,
    attackInterval: 1.65,
    xp: 6,
    armor: 0.15,
  },
  armored: {
    name: {en: 'Plate Walker', zh: '板甲行者'},
    description: {
      en: 'Heavy armor blocks over half of incoming damage. Use Armor Pierce or elemental burns.',
      zh: '身披厚重铁甲，能减免一半以上伤害，用穿甲弹芯或燃烧火海可快速熔化。',
    },
    role: {en: 'Bulwark', zh: '重甲'},
    threat: 4,
    hp: 165,
    speed: 25,
    radius: 15,
    damage: 11,
    attackInterval: 1.4,
    xp: 3,
    armor: 0.55,
  },
  spitter: {
    priority:true,
    attackRange:135, projectileSpeed:190,
    name: {en: 'Sap Spitter', zh: '腐浆喷者'},
    description: {
      en: 'Stops 135 px from the wall and spits acid. Switch Priority targeting to drop it early.',
      zh: '在距城墙 135 像素处停步喷酸，切「高危」索敌可优先将其点杀。',
    },
    role: {en: 'Sapper', zh: '工兵'},
    threat: 3,
    hp: 52,
    speed: 30,
    radius: 12,
    damage: 7,
    attackInterval: 0.55,
    xp: 3,
    armor: 0,
  },
  swarm: {
    name: {en: 'Dust Gnawer', zh: '尘啮'},
    description: {
      en: 'Tiny and fragile alone, but arrives in huge packs to overwhelm the wall.',
      zh: '单只脆弱矮小，但会成群结队涌来，靠燃油火海与分裂弹幕割草极爽。',
    },
    role: {en: 'Swarm', zh: '虫群'},
    threat: 1,
    hp: 14,
    speed: 52,
    radius: 8,
    damage: 2.5,
    attackInterval: 1.05,
    xp: 1,
    armor: 0,
  },
  boss: {
    statusResist:{slow:0.5,stun:0.65},
    name: {en: 'Crown Breach', zh: '冠裂兽'},
    description: {
      en: 'Boss. At or below half (0.5) of its maximum health it enrages, moving faster and striking the wall harder while summoning dust gnawers.',
      zh: '首领。生命降至最大生命的一半（0.5）或以下时会狂暴，移速加快、重击城墙更凶猛，并定时召唤尘啮。',
    },
    role: {en: 'Boss', zh: '首领'},
    threat: 7,
    hp: 3600,
    speed: 16,
    radius: 26,
    damage: 28,
    attackInterval: 1.2,
    xp: 30,
    armor: 0.2,
    // Read by updateWaves. Not a status type and not defender damage.
    enrage: {threshold: 0.5, speedScale: 1.18, damageScale: 1.55, intervalScale: 0.85},
    summon: {kind: 'swarm', count: 2, interval: 7.5, healthScale: 0.85, maxLiving: 12},
  },
  leaper: {
    name: {en: 'Ash Leaper', zh: '灰跃者'},
    description: {
      en: 'Crouches briefly then vaults toward the wall. Frost slow and EM lightning break its jump.',
      zh: '短暂蹲伏后向前扑跃直逼城墙，急冻减速与电磁麻痹可有效打断其突袭。',
    },
    role: {en: 'Leaper', zh: '跃袭'},
    threat: 3,
    hp: 96,
    speed: 32,
    radius: 12,
    damage: 9,
    attackInterval: 1.15,
    xp: 3,
    armor: 0,
    leap: {every: 3.6, windup: 0.85, distance: 78},
  },
  splitter: {
    name: {en: 'Crack Brood', zh: '裂巢'},
    description: {
      en: 'Bursts into two dust gnawers when killed. Area fire and ice skills clean them up fast.',
      zh: '死亡后会分裂出两只尘啮，配合火海与范围自动技能一网打尽。',
    },
    role: {en: 'Brood', zh: '裂变'},
    threat: 4,
    hp: 480,
    speed: 24,
    radius: 14,
    damage: 8,
    attackInterval: 1.3,
    xp: 4,
    armor: 0.1,
    split: {kind: 'swarm', count: 2, healthScale: 6},
  },
  mender: {
    priority:true,
    name: {en: 'Ash Mender', zh: '烬补者'},
    description: {
      en: 'Heals the most wounded zombie nearby (never itself). Snipe it early with Priority targeting.',
      zh: '持续治疗附近受伤最重的僵尸（不治自己），建议切「高危」优先击杀。',
    },
    role: {en: 'Mender', zh: '治疗'},
    threat: 4,
    hp: 120,
    speed: 18,
    radius: 13,
    damage: 5,
    attackInterval: 1.5,
    xp: 4,
    armor: 0,
    mend: {every: 1.8, amount: 46, range: 110},
  },
  shade: {
    name: {en: 'Wall Shade', zh: '幽影'},
    description: {
      en: 'Phases every 1.4s to dodge direct bullets. Napalm fire seas and burn still hurt it.',
      zh: '每 1.4 秒虚化躲避直射子弹，但火海与持续灼烧在虚化期间依然有效。',
    },
    role: {en: 'Shade', zh: '虚化'},
    threat: 3,
    hp: 120,
    speed: 34,
    radius: 11,
    damage: 7,
    attackInterval: 1.05,
    xp: 3,
    armor: 0,
    phase: {open: 1.4, shut: 1.4},
  },
  banner: {
    priority:true,
    name: {en: 'Standard Wretch', zh: '旗孽'},
    description: {
      en: 'Drastically speeds up nearby zombies while alive. Take out the flag-bearer first!',
      zh: '存活时让周围尸群疯狂加速冲锋，务必优先点杀旗手阻止尸潮撞墙！',
    },
    role: {en: 'Banner', zh: '旗手'},
    threat: 4,
    hp: 260,
    speed: 20,
    radius: 14,
    damage: 7,
    attackInterval: 1.35,
    xp: 5,
    armor: 0.1,
    banner: {range: 110, haste: 0.75},
  },
  warden: {
    priority:true,
    name: {en: 'Ash Warden', zh: '烬卫'},
    description: {
      en: 'Projects a damage-reducing shield onto a nearby ally (not itself). Drop the warden first.',
      zh: '为附近一名同伴提供强力减伤护盾（自己无盾），先打掉它瓦解防线。',
    },
    role: {en: 'Ward', zh: '护卫'},
    threat: 4,
    hp: 240,
    speed: 24,
    radius: 15,
    damage: 9,
    attackInterval: 1.35,
    xp: 5,
    armor: 0.08,
    ward: {range: 92, reduction: 0.4},
  },
  charge: {
    priority:true,
    name: {en: 'Cinder Charge', zh: '烬爆者'},
    description: {
      en: 'Lights an explosive fuse upon reaching the wall. Kill or knock it back before detonation!',
      zh: '贴近城墙后点燃引线，倒计时结束会炸出巨额伤害，务必在爆炸前击杀或震退！',
    },
    role: {en: 'Charge', zh: '爆弹'},
    threat: 4,
    hp: 640,
    speed: 40,
    radius: 12,
    damage: 6,
    attackInterval: 1.1,
    xp: 4,
    armor: 0,
    charge: {gap: 110, windup: 1.45, damage: 36},
  },
  hush: {
    priority:true,
    name: {en: 'Ash Hush', zh: '烬寂'},
    description: {
      en: 'Slows your reload speed while clamped to the wall. Clear it swiftly to keep full fire rate.',
      zh: '贴墙时会拖慢枪手攻速与技能充能，尽快击杀以恢复全速倾泻火力。',
    },
    role: {en: 'Hush', zh: '静场'},
    threat: 4,
    hp: 480,
    speed: 36,
    radius: 13,
    damage: 5,
    attackInterval: 1.2,
    xp: 4,
    armor: 0,
    hush: {factor: 0.75},
  },
};

const KINDS = Object.keys(ENEMIES);
for (const kind of KINDS) {
  const row = ENEMIES[kind];
  const stats = ['hp', 'speed', 'radius', 'damage', 'attackInterval', 'xp', 'armor', 'threat'];
  for (const key of stats) {
    if (!Number.isFinite(row[key])) throw new Error(`ENEMIES.${kind}.${key} is not finite`);
  }
  if (row.armor < 0 || row.armor > 0.8) throw new Error(`ENEMIES.${kind}.armor out of range`);
  if (!row.name?.en || !row.name?.zh || !row.description?.en || !row.description?.zh) {
    throw new Error(`ENEMIES.${kind} is missing bilingual text`);
  }
  freezeDeep(row);
}
freezeDeep(ENEMIES);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}
