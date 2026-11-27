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
      en: 'The common body: ordinary pace and health, no armor, and a steady bite on the shared fence.',
      zh: '最常见的敌人：步速与生命都普通，没有护甲，以稳定的节奏啃咬共享栅栏。',
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
      en: 'The fastest body. Thin health, a light bite, and it reaches the shared fence well ahead of the ash shamblers, so shoot it early.',
      zh: '最快的敌人。生命很薄、啃咬很轻，会远早于灰烬蹒者贴上共享栅栏，需要提前打掉。',
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
      en: 'Huge and slow. Each bite tears a deep chunk from the shared fence, and its long health takes a focused fight.',
      zh: '体型巨大、步速很慢。每一口都从共享栅栏撕下很深的一块，厚实的生命需要长时间集火。',
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
      en: 'Thick plate sheds a bit more than half of every hit. It walks up and keeps biting the shared fence until that plate is focused down.',
      zh: '厚甲会挡下略多于一半的每一击。它走向共享栅栏并持续啃咬，直到这层甲被集火拆掉。',
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
      en: 'Stops 135 px from the fence and spits acid. Set Priority targeting to focus it down early.',
      zh: '在距防线 135 像素处停步喷酸，可用「高危」索敌优先集火清理。',
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
      en: 'Tiny and weak alone, with a small bite. They arrive in bunches and smother the shared fence by numbers.',
      zh: '单只又小又弱，啃咬也很轻。它们成群涌来，靠数量淹没共享栅栏。',
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
      en: 'Boss. At or below half (0.5) of its maximum health it enrages, moving faster and striking the shared fence harder and more often. It periodically calls weaker dust gnawers. It attacks only the fence.',
      zh: '首领。生命降至最大生命的一半（0.5）或以下时会狂暴，移动更快，对共享栅栏的打击更重、更密，并周期性召唤较弱的尘啮。它只攻击栅栏。',
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
      en: 'Crouches briefly then leaps forward. Frost slow and Lightning stun break its charge.',
      zh: '短暂蹲伏后向前扑跃，寒霜减速与电弧麻痹可有效打断其突进。',
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
      en: 'On death it releases two dust gnawers. It only bites the shared fence.',
      zh: '死后放出两只尘啮。它只啃共享栅栏。',
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
      en: 'Heals the most wounded enemy within range. It does not heal itself. It only bites the shared fence.',
      zh: '治疗射程内伤得最重的敌人，不治疗自己。它只啃共享栅栏。',
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
    name: {en: 'Fence Shade', zh: '栅影'},
    description: {
      en: 'Fades every 1.4 s to dodge direct hits. Poison clouds and burning areas still hurt it while faded.',
      zh: '每 1.4 秒虚化规避直射，毒雾与持续灼烧在虚化期间依然生效。',
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
      en: 'While it lives, nearby enemies move three times as fast. It does not hurry itself. Kill it before the pack arrives. It only bites the shared fence.',
      zh: '它存活时，附近的敌人变为三倍速。它不会加快自己。在那队人抵达前打掉它。它只啃共享栅栏。',
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
      en: 'Hits on one nearby ally are weaker while it lives. The warden itself is not shielded. Kill it first. It only bites the shared fence.',
      zh: '它存活时，附近一名同伴受到的打击会变弱。烬卫自己没有这层护盾。先打掉它。它只啃共享栅栏。',
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
    name: {en: 'Cinder Charge', zh: '烬爆'},
    description: {
      en: 'Once it reaches the shared fence it bites once and lights a fuse. Kill it before the fuse ends. Otherwise it blows one heavy hole in the fence and dies.',
      zh: '贴上共享栅栏后先啃一口并点燃引线。引线燃尽前打掉它。否则它会在栅栏上炸开一个大口然后死去。',
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
      en: 'Light bites. While it is on the shared fence, every defender recharges more slowly. Kill it and the board fires at full speed again.',
      zh: '啃咬很轻。它贴在共享栅栏上时，所有防守者的充能都会变慢。打掉它，阵列就会恢复全速。',
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
