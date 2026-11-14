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
      en: 'Slow walker with ordinary health and a steady bite on the shared fence.',
      zh: '步速缓慢、生命普通，会持续啃咬共享栅栏。',
    },
    role: {en: 'Walker', zh: '步兵'},
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
      en: 'Thin and fast. It reaches the fence well ahead of the walkers and must be shot early.',
      zh: '身板薄、速度高，会比步兵更早贴上栅栏，需要提前集火。',
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
      en: 'Huge and slow. Each hit tears the fence, and its health takes a long focused fight.',
      zh: '体型巨大、接近缓慢。每一击都重创栅栏，需要长时间集火才能倒下。',
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
      en: 'Thick plate sheds a bit more than half of every hit. Left alone, it sits on the fence.',
      zh: '厚甲会挡下略多于一半的伤害。放着不管，它就会一直砸栅栏。',
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
      en: 'Fragile body, rapid fence bites. It dies quickly, but it chews hard once it arrives.',
      zh: '身体脆弱，却会高频啃咬栅栏。死得快，一旦抵达伤害却很高。',
    },
    role: {en: 'Sapper', zh: '蚀篱'},
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
      en: 'Tiny and weak alone. They arrive in bunches and smother the fence by numbers.',
      zh: '单只又小又弱。它们成群涌来，靠数量淹没栅栏。',
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
      en: 'Boss. Below half health it enrages, moving and hitting harder. It periodically calls dust gnawers. It attacks only the fence.',
      zh: '首领。生命低于一半时会狂暴，移动和攻击都更猛，并周期性召唤尘啮。它只攻击栅栏。',
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
