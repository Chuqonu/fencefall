// Sorties beside the long watch. `watch` has no phases: the wave director
// keeps the existing campaign schedule for that id and for any unknown id.
// Other ids are built with the same phase shape as the campaign.
// Every sortie opens with exactly four ash shamblers so the first draft is
// still 8 XP. The signature role starts at 20s, as that pack is falling,
// so the field does not sit empty after the first draft.

export const EXPEDITION_ORDER = Object.freeze([
  'watch',
  'wires',
  'plate',
  'dust',
  'mend',
  'leap',
  'shade',
  'banner',
  'ward',
  'cinder',
  'hush',
  'gauntlet',
]);

const OPENING = {
  id: 'ash',
  from: 1,
  until: 2,
  every: 30,
  name: {en: 'First ash', zh: '初烬'},
  groups: [{kind: 'shambler', count: 4, interval: 0.8, exact: true}],
};

export const EXPEDITIONS = {
  watch: {
    id: 'watch',
    name: {en: 'The Long Watch', zh: '长夜守望'},
    summary: {
      en: 'The full campaign, about 14 minutes. The new roles join after the opening, then the Crown Breach.',
      zh: '完整战役，大约 14 分钟。开局之后新角色会加入，最后是冠裂兽。',
    },
    minutes: 14,
    focus: {en: 'Full campaign', zh: '完整战役'},
  },
  wires: {
    id: 'wires',
    name: {en: 'Wire Rush', zh: '线驰突进'},
    summary: {
      en: 'About 4 minutes. Wire runners arrive first. Ash leapers join once you have a draft.',
      zh: '大约 4 分钟。先是线驰者，整备之后灰跃者加入。',
    },
    minutes: 4,
    focus: {en: 'Runners and leapers', zh: '突进与跃袭'},
    phases: [
      OPENING,
      {
        id: 'rush',
        from: 20,
        until: 88,
        every: 10,
        name: {en: 'Wire rush', zh: '线驰'},
        hint: {
          en: 'Wire runners reach the fence early. Shoot them before the ash shamblers.',
          zh: '线驰者会更早贴上栅栏。先打它们，再管灰烬蹒者。',
        },
        groups: [
          {kind: 'runner', count: 3, interval: 1.1, healthScale: 3},
          {kind: 'shambler', count: 1, interval: 0, delay: 2},
        ],
      },
      {
        id: 'hop',
        from: 90,
        until: 158,
        every: 12,
        name: {en: 'Leaping wire', zh: '跃线'},
        hint: {
          en: 'Ash leapers can be shot while they crouch, then they jump. They only bite the fence.',
          zh: '灰跃者蹲下时才能被打中，然后向前跳。它们只啃栅栏。',
        },
        groups: [
          {kind: 'leaper', count: 2, interval: 1.8},
          {kind: 'runner', count: 2, interval: 1.2, delay: 1.4},
        ],
      },
      {
        id: 'snap',
        from: 160,
        until: 218,
        every: 14,
        name: {en: 'Snap', zh: '急咬'},
        groups: [
          {kind: 'leaper', count: 2, interval: 1.6},
          {kind: 'spitter', count: 2, interval: 1.4, delay: 1.2},
          {kind: 'runner', count: 2, interval: 1.1, delay: 2.4},
        ],
      },
    ],
  },
  plate: {
    id: 'plate',
    name: {en: 'Plate Weight', zh: '板甲重压'},
    summary: {
      en: 'About 4 minutes. Plate walkers soak hits. Gate brutes punish a fence you ignore.',
      zh: '大约 4 分钟。板甲行者很耐打，闸门蛮兽会重创被你放下的栅栏。',
    },
    minutes: 4,
    focus: {en: 'Armor and brutes', zh: '重甲与蛮兽'},
    phases: [
      OPENING,
      {
        id: 'plate',
        from: 20,
        until: 90,
        every: 20,
        name: {en: 'Plate', zh: '板甲'},
        hint: {
          en: 'Plate walkers shrug off more than half of each hit. Focus them down.',
          zh: '板甲行者能挡下每次攻击的一半多。集火拆掉它们。',
        },
        groups: [
          {kind: 'armored', count: 2, interval: 1.6},
          {kind: 'shambler', count: 2, interval: 1.2, delay: 1},
        ],
      },
      {
        id: 'weight',
        from: 100,
        until: 178,
        every: 16,
        name: {en: 'Weight', zh: '重压'},
        hint: {
          en: 'Gate brutes are slow and hit the fence very hard. Do not leave them walking.',
          zh: '闸门蛮兽很慢，但对栅栏的打击非常重。别让它们走完全程。',
        },
        groups: [
          {kind: 'brute', count: 1, interval: 0},
          {kind: 'armored', count: 1, interval: 0, delay: 2.5},
          {kind: 'swarm', count: 3, interval: 0.4, delay: 1},
        ],
      },
      {
        id: 'gate',
        from: 180,
        until: 238,
        every: 18,
        name: {en: 'The gate', zh: '闸门'},
        groups: [
          {kind: 'brute', count: 1, interval: 0},
          {kind: 'armored', count: 2, interval: 2, delay: 2},
          {kind: 'runner', count: 2, interval: 1.2, delay: 3},
        ],
      },
    ],
  },
  dust: {
    id: 'dust',
    name: {en: 'Dust Brood', zh: '尘裂'},
    summary: {
      en: 'About 4 minutes. Dust gnawers come in bunches. Crack broods split into two more when they die.',
      zh: '大约 4 分钟。尘啮成群出现。裂巢死后会裂成另外两只。',
    },
    minutes: 4,
    focus: {en: 'Swarms and splitters', zh: '虫群与裂变'},
    phases: [
      OPENING,
      {
        id: 'dust',
        from: 20,
        until: 78,
        every: 9,
        name: {en: 'Dust', zh: '尘群'},
        hint: {
          en: 'Dust gnawers are weak alone. The bunch is what chews the fence.',
          zh: '尘啮单只很弱。成群才会啃坏栅栏。',
        },
        groups: [
          {kind: 'swarm', count: 5, interval: 0.35},
          {kind: 'shambler', count: 1, interval: 0, delay: 2},
        ],
      },
      {
        id: 'brood',
        from: 80,
        until: 158,
        every: 13,
        name: {en: 'Brood', zh: '裂巢'},
        hint: {
          en: 'Crack broods release two dust gnawers when they die. Kill the gnawers before they pile up.',
          zh: '裂巢死后会放出两只尘啮。在它们叠起来之前清掉。',
        },
        groups: [
          {kind: 'splitter', count: 2, interval: 2},
          {kind: 'swarm', count: 3, interval: 0.4, delay: 1.2},
        ],
      },
      {
        id: 'spill',
        from: 160,
        until: 218,
        every: 14,
        name: {en: 'Spill', zh: '溢散'},
        groups: [
          {kind: 'splitter', count: 3, interval: 1.8},
          {kind: 'runner', count: 2, interval: 1.2, delay: 2},
          {kind: 'swarm', count: 4, interval: 0.35, delay: 0.8},
        ],
      },
    ],
  },
  mend: {
    id: 'mend',
    name: {en: 'Mender Line', zh: '修补队列'},
    summary: {
      en: 'About 4 minutes. Ash menders heal the most wounded enemy nearby. They do not heal themselves.',
      zh: '大约 4 分钟。烬补者会治疗附近伤得最重的敌人，但不会治疗自己。',
    },
    minutes: 4,
    focus: {en: 'Healers behind tanks', zh: '坦后面的治疗'},
    phases: [
      OPENING,
      {
        id: 'mend',
        from: 26,
        until: 98,
        every: 12,
        name: {en: 'Menders', zh: '修补'},
        hint: {
          en: 'Ash menders heal the most wounded ally in reach. They do not heal themselves. Kill the mender.',
          zh: '烬补者会治疗射程内伤得最重的同伴，不会治疗自己。先打烬补者。',
        },
        groups: [
          {kind: 'shambler', count: 3, interval: 1.2},
          {kind: 'mender', count: 1, interval: 0, delay: 1.6},
        ],
      },
      {
        id: 'brace',
        from: 100,
        until: 178,
        every: 16,
        name: {en: 'Brace', zh: '撑持'},
        groups: [
          {kind: 'armored', count: 1, interval: 0},
          {kind: 'mender', count: 1, interval: 0, delay: 1.4},
          {kind: 'shambler', count: 2, interval: 1.2, delay: 2.4},
        ],
      },
      {
        id: 'choir',
        from: 180,
        until: 248,
        every: 18,
        name: {en: 'Choir', zh: '合修'},
        groups: [
          {kind: 'brute', count: 1, interval: 0},
          {kind: 'mender', count: 2, interval: 1.5, delay: 1.2},
          {kind: 'armored', count: 1, interval: 0, delay: 3},
        ],
      },
    ],
  },
  leap: {
    id: 'leap',
    name: {en: 'Leap Ash', zh: '灰跃'},
    summary: {
      en: 'About 4 minutes. Shots hit ash leapers only while they crouch, then they jump.',
      zh: '大约 4 分钟。灰跃者只有蹲下时才会被打中，然后向前跳。',
    },
    minutes: 4,
    focus: {en: 'Leapers', zh: '跃袭'},
    phases: [
      OPENING,
      {
        id: 'crouch',
        from: 20,
        until: 88,
        every: 11,
        name: {en: 'Crouch', zh: '蹲跳'},
        hint: {
          en: 'Ash leapers can be shot while they crouch, then they jump. Close to the fence, they stop jumping. They only bite the fence.',
          zh: '灰跃者蹲下时才能被打中，然后向前跳。靠近栅栏后不再跳。它们只啃栅栏。',
        },
        groups: [
          {kind: 'leaper', count: 2, interval: 1.8},
          {kind: 'shambler', count: 2, interval: 1.2, delay: 1},
        ],
      },
      {
        id: 'bound',
        from: 90,
        until: 158,
        every: 12,
        name: {en: 'Bound', zh: '连跳'},
        groups: [
          {kind: 'leaper', count: 3, interval: 1.5},
          {kind: 'runner', count: 2, interval: 1.1, delay: 1.6},
        ],
      },
      {
        id: 'last-leap',
        from: 160,
        until: 218,
        every: 14,
        name: {en: 'Last leap', zh: '末跳'},
        groups: [
          {kind: 'leaper', count: 4, interval: 1.3},
          {kind: 'spitter', count: 2, interval: 1.4, delay: 2},
        ],
      },
    ],
  },
  shade: {
    id: 'shade',
    name: {en: 'Shade Hour', zh: '栅影时刻'},
    summary: {
      en: 'About 4 minutes. Fence shades are solid only briefly, and they still bite while faded.',
      zh: '大约 4 分钟。栅影只短暂凝实，淡出时仍会啃栅栏。',
    },
    minutes: 4,
    focus: {en: 'Phasing shades', zh: '虚化的栅影'},
    phases: [
      OPENING,
      {
        id: 'fade',
        from: 20,
        until: 88,
        every: 12,
        name: {en: 'Fade', zh: '淡出'},
        hint: {
          en: 'Fence shades are solid only briefly. While faded they cannot be shot, but they still walk and bite.',
          zh: '栅影只短暂凝实。淡出时无法被射击，但仍会走并啃栅栏。',
        },
        groups: [
          {kind: 'shade', count: 2, interval: 1.8},
          {kind: 'shambler', count: 2, interval: 1.2, delay: 1},
        ],
      },
      {
        id: 'hour',
        from: 90,
        until: 168,
        every: 13,
        name: {en: 'Hour', zh: '时刻'},
        groups: [
          {kind: 'shade', count: 3, interval: 1.6},
          {kind: 'runner', count: 2, interval: 1.1, delay: 1.4},
          {kind: 'spitter', count: 1, interval: 0, delay: 2.2},
        ],
      },
      {
        id: 'dusk',
        from: 170,
        until: 228,
        every: 15,
        name: {en: 'Dusk', zh: '薄暮'},
        groups: [
          {kind: 'shade', count: 3, interval: 1.5},
          {kind: 'armored', count: 1, interval: 0, delay: 2},
          {kind: 'swarm', count: 3, interval: 0.4, delay: 1},
        ],
      },
    ],
  },
  banner: {
    id: 'banner',
    name: {en: 'Wretched Standard', zh: '旗孽'},
    summary: {
      en: 'About 4 minutes. A standard wretch triples the pace of enemies near it. Kill it before that pack arrives.',
      zh: '大约 4 分钟。旗孽会让附近的敌人变为三倍速。在那队人抵达前打掉它。',
    },
    minutes: 4,
    focus: {en: 'Speed banners', zh: '加速旗帜'},
    phases: [
      OPENING,
      {
        id: 'flag',
        from: 26,
        until: 98,
        every: 13,
        name: {en: 'Standard', zh: '旗帜'},
        hint: {
          en: 'A standard wretch triples the pace of enemies near it. Kill it before that pack arrives. It only bites the fence.',
          zh: '旗孽会让附近的敌人变为三倍速。在那队人抵达前打掉它。它只啃栅栏。',
        },
        groups: [
          {kind: 'shambler', count: 8, interval: 0.55},
          {kind: 'banner', count: 1, interval: 0, delay: 0.4},
        ],
      },
      {
        id: 'march',
        from: 100,
        until: 178,
        every: 15,
        name: {en: 'March', zh: '急行'},
        groups: [
          {kind: 'runner', count: 3, interval: 1},
          {kind: 'banner', count: 1, interval: 0, delay: 0.6},
          {kind: 'armored', count: 1, interval: 0, delay: 2.4},
        ],
      },
      {
        id: 'column',
        from: 180,
        until: 248,
        every: 16,
        name: {en: 'Column', zh: '队列'},
        groups: [
          {kind: 'banner', count: 2, interval: 2},
          {kind: 'brute', count: 1, interval: 0, delay: 1.5},
          {kind: 'swarm', count: 4, interval: 0.35, delay: 0.6},
        ],
      },
    ],
  },
  ward: {
    id: 'ward',
    name: {en: 'Ash Ward', zh: '烬卫'},
    summary: {
      en: 'About 4 minutes. An ash warden weakens hits on a nearby ally until you kill the warden.',
      zh: '大约 4 分钟。烬卫会减弱对附近同伴的打击，直到你打掉它。',
    },
    minutes: 4,
    focus: {en: 'Shielded packs', zh: '护盾队列'},
    phases: [
      OPENING,
      {
        id: 'ward-line',
        from: 20,
        until: 88,
        every: 18,
        name: {en: 'Ward line', zh: '护卫线'},
        hint: {
          en: 'An ash warden weakens hits on a nearby ally. It is not shielded itself. Kill it first.',
          zh: '烬卫会减弱对附近同伴的打击。它自己没有这层护盾。先打掉它。',
        },
        groups: [
          {kind: 'warden', count: 1, interval: 0},
          {kind: 'armored', count: 1, interval: 0, delay: 0.4},
          {kind: 'shambler', count: 3, interval: 0.7, delay: 0.8},
        ],
      },
      {
        id: 'ward-pack',
        from: 90,
        until: 158,
        every: 16,
        name: {en: 'Shielded pack', zh: '护盾队'},
        groups: [
          {kind: 'warden', count: 1, interval: 0},
          {kind: 'shambler', count: 3, interval: 0.8},
          {kind: 'runner', count: 1, interval: 0, delay: 2},
        ],
      },
      {
        id: 'ward-gate',
        from: 160,
        until: 228,
        every: 18,
        name: {en: 'Gate ward', zh: '闸门烬卫'},
        groups: [
          {kind: 'warden', count: 2, interval: 2.5},
          {kind: 'armored', count: 1, interval: 0, delay: 1.2},
          {kind: 'shambler', count: 3, interval: 0.6, delay: 0.5},
        ],
      },
    ],
  },
  cinder: {
    id: 'cinder',
    name: {en: 'Cinder Line', zh: '烬爆'},
    summary: {
      en: 'About 4 minutes. A cinder charge bites once at the fence, then blows a heavy hole unless you kill it during the fuse.',
      zh: '大约 4 分钟。烬爆贴上栅栏后先啃一口，引线期间不打掉就会炸开一个大口。',
    },
    minutes: 4,
    focus: {en: 'Fuse charges', zh: '引线爆弹'},
    phases: [
      OPENING,
      {
        id: 'cinder-line',
        from: 20,
        until: 90,
        every: 18,
        name: {en: 'Cinder line', zh: '烬爆线'},
        hint: {
          en: 'A cinder charge bites once at the fence, then the fuse burns. Kill it before the blast.',
          zh: '烬爆贴上栅栏后先啃一口，然后引线燃烧。爆炸前打掉它。',
        },
        groups: [
          {kind: 'charge', count: 1, interval: 0},
          {kind: 'shambler', count: 2, interval: 0.8, delay: 0.6},
        ],
      },
      {
        id: 'cinder-pair',
        from: 92,
        until: 160,
        every: 18,
        name: {en: 'Paired fuses', zh: '双引线'},
        groups: [
          {kind: 'charge', count: 2, interval: 2.2},
          {kind: 'runner', count: 1, interval: 0, delay: 1.4},
        ],
      },
      {
        id: 'cinder-gate',
        from: 162,
        until: 230,
        every: 20,
        name: {en: 'Gate fuse', zh: '闸门引线'},
        groups: [
          {kind: 'charge', count: 2, interval: 2},
          {kind: 'armored', count: 1, interval: 0, delay: 1.4},
          {kind: 'shambler', count: 2, interval: 0.7, delay: 0.5},
        ],
      },
    ],
  },
  hush: {
    id: 'hush',
    name: {en: 'Ash Hush', zh: '烬寂'},
    summary: {
      en: 'About 4 minutes. An ash hush on the fence slows every defender\'s recharge until you kill it.',
      zh: '大约 4 分钟。烬寂贴在栅栏上时，所有防守者的充能都会变慢，直到你打掉它。',
    },
    minutes: 4,
    focus: {en: 'Slowed board', zh: '静场'},
    phases: [
      OPENING,
      {
        id: 'hush-line',
        from: 20,
        until: 90,
        every: 18,
        name: {en: 'Hush line', zh: '静场线'},
        hint: {
          en: 'While an ash hush is on the fence, defenders recharge more slowly. Kill it to restore the board.',
          zh: '烬寂贴在栅栏上时，防守者充能变慢。打掉它，阵列就会恢复。',
        },
        groups: [
          {kind: 'hush', count: 1, interval: 0},
          {kind: 'shambler', count: 3, interval: 0.7, delay: 0.5},
        ],
      },
      {
        id: 'hush-pair',
        from: 92,
        until: 160,
        every: 18,
        name: {en: 'Quiet pair', zh: '双静'},
        groups: [
          {kind: 'hush', count: 2, interval: 2.2},
          {kind: 'shambler', count: 2, interval: 0.8, delay: 0.6},
        ],
      },
      {
        id: 'hush-gate',
        from: 162,
        until: 230,
        every: 20,
        name: {en: 'Gate hush', zh: '闸门静场'},
        groups: [
          {kind: 'hush', count: 1, interval: 0},
          {kind: 'armored', count: 1, interval: 0, delay: 1.2},
          {kind: 'shambler', count: 3, interval: 0.6, delay: 0.4},
        ],
      },
    ],
  },
  gauntlet: {
    id: 'gauntlet',
    name: {en: 'Mixed Gate', zh: '混合闸门'},
    summary: {
      en: 'About 6 minutes. Every new role, then a weaker Crown Breach. Bring a board that can switch targets.',
      zh: '大约 6 分钟。新角色都会出场，最后是一只较弱的冠裂兽。需要能切换目标的阵容。',
    },
    minutes: 6,
    focus: {en: 'All roles, then a boss', zh: '全部角色，然后是首领'},
    phases: [
      OPENING,
      {
        id: 'mix-leap',
        from: 20,
        until: 68,
        every: 12,
        name: {en: 'Leaping ash', zh: '跃灰'},
        groups: [
          {kind: 'leaper', count: 2, interval: 1.6},
          {kind: 'runner', count: 2, interval: 1.1, delay: 1.2},
        ],
      },
      {
        id: 'mix-brood',
        from: 70,
        until: 128,
        every: 14,
        name: {en: 'Brood', zh: '裂巢'},
        groups: [
          {kind: 'splitter', count: 2, interval: 2},
          {kind: 'swarm', count: 3, interval: 0.4, delay: 1},
        ],
      },
      {
        id: 'mix-shade',
        from: 130,
        until: 188,
        every: 14,
        name: {en: 'Shades', zh: '栅影'},
        groups: [
          {kind: 'shade', count: 2, interval: 1.6},
          {kind: 'spitter', count: 2, interval: 1.3, delay: 1.4},
        ],
      },
      {
        id: 'mix-mend',
        from: 190,
        until: 258,
        every: 16,
        name: {en: 'Menders', zh: '修补'},
        groups: [
          {kind: 'armored', count: 2, interval: 2},
          {kind: 'mender', count: 1, interval: 0, delay: 1.2},
          {kind: 'warden', count: 1, interval: 0, delay: 1.6},
          {kind: 'banner', count: 1, interval: 0, delay: 2.2},
        ],
      },
      {
        id: 'mix-hush',
        from: 250,
        until: 251,
        every: 30,
        name: {en: 'Hush', zh: '静场'},
        hint: {
          en: 'While an ash hush is on the fence, defenders recharge more slowly. Kill it to restore the board.',
          zh: '烬寂贴在栅栏上时，防守者充能变慢。打掉它，阵列就会恢复。',
        },
        groups: [
          {kind: 'hush', count: 1, interval: 0, exact: true},
          {kind: 'shambler', count: 2, interval: 0.6, delay: 0.4, exact: true},
        ],
      },
      {
        id: 'mix-press',
        from: 260,
        until: 328,
        every: 16,
        name: {en: 'Press', zh: '进逼'},
        groups: [
          {kind: 'leaper', count: 2, interval: 1.5},
          {kind: 'charge', count: 1, interval: 0, delay: 0.8},
          {kind: 'shade', count: 2, interval: 1.6, delay: 1},
          {kind: 'splitter', count: 1, interval: 0, delay: 2},
          {kind: 'banner', count: 1, interval: 0, delay: 2.6},
        ],
      },
      {
        id: 'mix-crown',
        from: 330,
        until: 378,
        every: 48,
        name: {en: 'Lesser crown', zh: '次冠'},
        hint: {
          en: 'A lesser Crown Breach calls dust gnawers while alive. Half health only enrages it. It only attacks the fence.',
          zh: '较弱的冠裂兽存活期间都会召唤尘啮。半血只会让它狂暴。它只攻击栅栏。',
        },
        groups: [
          {kind: 'armored', count: 2, interval: 1.4},
          {kind: 'mender', count: 1, interval: 0, delay: 1},
          {kind: 'swarm', count: 4, interval: 0.35, delay: 0.4},
          {kind: 'boss', count: 1, interval: 0, delay: 3.2, exact: true, healthScale: 0.7},
        ],
      },
    ],
  },
};

export function isExpedition(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPEDITIONS, id);
}

freezeDeep(EXPEDITIONS);
freezeDeep(EXPEDITION_ORDER);

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value)) freezeDeep(value[key]);
  return Object.freeze(value);
}
