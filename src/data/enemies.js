// Enemy catalog for Fencefall. Keys are the simulation kinds.
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
    hp: 80,
    speed: 28,
    radius: 13,
    damage: 8,
    attackInterval: 1.25,
    xp: 2,
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
    hp: 46,
    speed: 58,
    radius: 11,
    damage: 6,
    attackInterval: 0.9,
    xp: 2,
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
    hp: 680,
    speed: 18,
    radius: 20,
    damage: 28,
    attackInterval: 1.65,
    xp: 7,
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
    hp: 210,
    speed: 24,
    radius: 15,
    damage: 11,
    attackInterval: 1.4,
    xp: 4,
    armor: 0.55,
  },
  spitter: {
    name: {en: 'Sap Spitter', zh: '腐浆喷者'},
    description: {
      en: 'Fragile, with the shortest pause between bites. Each bite on the shared fence is light, and the danger is how fast those bites stack once it arrives.',
      zh: '身体脆弱，啃咬间隔最短。对共享栅栏的每一口都很轻，威胁在于抵达之后轻咬叠得很快。',
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
    hp: 18,
    speed: 50,
    radius: 8,
    damage: 3,
    attackInterval: 1.05,
    xp: 1,
    armor: 0,
  },
  boss: {
    name: {en: 'Crown Breach', zh: '冠裂兽'},
    description: {
      en: 'Boss. At or below 0.5 of its maximum health it enrages, moving faster and striking the shared fence harder and more often. It periodically calls weaker dust gnawers. It attacks only the fence.',
      zh: '首领。生命降至最大生命的 0.5 或以下时会狂暴，移动更快，对共享栅栏的打击更重、更密，并周期性召唤较弱的尘啮。它只攻击栅栏。',
    },
    role: {en: 'Boss', zh: '首领'},
    threat: 7,
    hp: 3000,
    speed: 16,
    radius: 26,
    damage: 26,
    attackInterval: 1.2,
    xp: 36,
    armor: 0.2,
    // Read by updateWaves. Not a status type and not defender damage.
    enrage: {threshold: 0.5, speedScale: 1.18, damageScale: 1.55, intervalScale: 0.85},
    summon: {kind: 'swarm', count: 2, interval: 7.5, healthScale: 0.85, maxLiving: 12},
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
