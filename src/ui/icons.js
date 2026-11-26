/**
 * Inline catalog marks. One drawing per id, shared by every card that shows it.
 * Gold #f0cb72, ink #f1eee2, muted #a5b8be, and the draft mechanic colors.
 * Drawn for a 44px tile. No external files.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

const GOLD = '#f0cb72';
const INK = '#f1eee2';
const MUTED = '#a5b8be';
const FIRE = '#e25b2a';
const FROST = '#9fd7e8';
const BOLT = '#f0d56a';
const CHAIN = '#f4e27a';
const POISON = '#7dce6a';
const AURA = '#8fd0c6';
const CRIT = '#e7a08a';
const PIERCE = '#d7e4ea';
const PLATE = '#1a2830';

const P = (d, stroke, width = 2.2, fill = 'none') => ['path', {
  d,
  fill,
  stroke,
  'stroke-width': width,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}];
const C = (cx, cy, r, fill, stroke = 'none', width = 2) => ['circle', {
  cx, cy, r, fill, stroke, 'stroke-width': stroke === 'none' ? 0 : width,
}];
const R = (x, y, w, h, fill, stroke = 'none', rx = 1) => ['rect', {
  x, y, width: w, height: h, rx, fill, stroke, 'stroke-width': stroke === 'none' ? 0 : 1.8,
}];
const L = (x1, y1, x2, y2, stroke, width = 2.2) => ['line', {
  x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round',
}];
const G = (points, fill, stroke = 'none', width = 1.4) => ['polygon', {
  points,
  fill,
  stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  'stroke-linejoin': 'round',
}];

function bow(x, color) {
  return [
    P(`M${x} 8 C${x - 11} 16 ${x - 11} 28 ${x} 36`, color, 2.8),
    P(`M${x} 8 L${x + 6} 22 L${x} 36`, INK, 1.6),
  ];
}

function dart(x1, x2, y, color) {
  return [
    L(x1, y, x2 - 7, y, color, 2.3),
    G(`${x2},${y} ${x2 - 7},${y - 3.5} ${x2 - 7},${y + 3.5}`, color, color, 1),
  ];
}

function nail(x, dy = 0) {
  return [
    R(x - 3.5, 8 + dy, 7, 4, GOLD, 'none', 1),
    R(x - 1.2, 11.6 + dy, 2.4, 16, INK, 'none', 0.4),
    G(`${x},${27.2 + dy} ${x - 2.7},${35 + dy} ${x + 2.7},${35 + dy}`, INK),
  ];
}

function flame(dx, dy, color, scale = 1) {
  const x = (n) => (22 + (n - 22) * scale + dx).toFixed(1);
  const y = (n) => (24 + (n - 24) * scale + dy).toFixed(1);
  return P(
    `M${x(22)} ${y(36)} C${x(14)} ${y(36)} ${x(11)} ${y(28)} ${x(14)} ${y(22)} C${x(16)} ${y(26)} ${x(17)} ${y(20)} ${x(19)} ${y(16)} C${x(21)} ${y(21)} ${x(22)} ${y(12)} ${x(24)} ${y(8)} C${x(25)} ${y(16)} ${x(28)} ${y(16)} ${x(30)} ${y(20)} C${x(34)} ${y(18)} ${x(35)} ${y(26)} ${x(33)} ${y(31)} C${x(31)} ${y(35)} ${x(27)} ${y(36)} ${x(22)} ${y(36)} Z`,
    color,
    1.2,
    color,
  );
}

const MARKS = {
  harvest: () => [
    L(22, 20, 22, 37, POISON, 2.6),
    P('M22 31 C16 30 12 26 12 23 C16 24 19 26 22 29', POISON, 1.8, POISON),
    P('M22 28 C28 27 32 23 32 20 C28 21 25 23 22 26', POISON, 1.8, POISON),
    L(22, 6, 22, 10, GOLD, 2.2),
    L(14, 9, 17, 12, GOLD, 2.2),
    L(30, 9, 27, 12, GOLD, 2.2),
    L(11, 15, 15, 15, GOLD, 2.2),
    L(33, 15, 29, 15, GOLD, 2.2),
    C(22, 15, 6.2, GOLD, INK, 1.1),
    C(22, 15, 2.5, FIRE),
  ],
  bulwark: () => [
    G('11,16 13,8 15,16', PIERCE),
    G('20,16 22,7 24,16', PIERCE),
    G('29,16 31,8 33,16', PIERCE),
    R(8, 16, 28, 18, '#5a3f28', GOLD, 2),
    L(8, 22, 36, 22, MUTED, 2.4),
    L(8, 29, 36, 29, MUTED, 2.4),
    C(13, 22, 1.3, INK),
    C(22, 22, 1.3, INK),
    C(31, 22, 1.3, INK),
  ],
  spikes: () => [
    R(7, 30, 30, 5, PLATE, MUTED, 1.5),
    G('9,30 14,13 19,30', PIERCE, MUTED, 1.2),
    G('17,30 22,10 27,30', INK, GOLD, 1.2),
    G('25,30 30,13 35,30', PIERCE, MUTED, 1.2),
  ],
  flare: () => [
    C(22, 17, 13, 'none', GOLD, 1.2),
    flame(0, -7, GOLD, 0.52),
    P('M12 22 H32 L29 29 H15 Z', GOLD, 1.6, '#4c3818'),
    L(17, 29, 13, 37, MUTED, 2.2),
    L(27, 29, 31, 37, MUTED, 2.2),
    L(22, 29, 22, 37, MUTED, 2.2),
  ],
  economy:()=>[C(22,20,12,GOLD),C(22,20,7,PLATE),L(22,14,22,26,GOLD,2)],
  bastion:()=>[R(9,15,26,20,PLATE,GOLD),L(10,14,34,14,INK,4)],
  splinter_bow: () => [
    ...bow(14, GOLD),
    ...dart(20, 37, 22, GOLD),
  ],
  kinetic_core: () => [
    P('M9 17 C14 9 30 9 35 17 L33 31 C28 37 16 37 11 31 Z', MUTED, 2, PLATE),
    L(8, 23, 12, 23, GOLD, 2),
    L(32, 23, 36, 23, GOLD, 2),
    C(22, 23, 5, 'none', GOLD, 2),
    C(22, 23, 2, GOLD),
  ],
  prism_lens: () => [
    G('22,6 33,22 22,38 11,22', '#16343c', FROST, 2),
    L(22, 12, 22, 32, INK, 1.5),
    L(16, 22, 28, 22, GOLD, 1.7),
  ],
  runner_charm: () => [
    L(22, 6, 22, 14, GOLD, 2.2),
    G('22,14 32,25 22,37 12,25', PLATE, GOLD, 2),
    P('M6 16 L11 22 L6 28', INK, 2.2),
    P('M38 16 L33 22 L38 28', INK, 2.2),
  ],
  sun_spindle: () => [
    C(22, 22, 8, 'none', GOLD, 2.3),
    C(22, 22, 2.3, GOLD),
    L(22, 5, 22, 11, MUTED, 2.2),
    L(22, 33, 22, 39, MUTED, 2.2),
    L(5, 22, 11, 22, MUTED, 2.2),
    L(33, 22, 39, 22, MUTED, 2.2),
  ],
  bounty_seal: () => [
    C(22, 22, 14, '#2a2418', GOLD, 2.3),
    C(22, 22, 10, 'none', GOLD, 1.4),
    G('22,13 25,19 32,19 26.5,23.5 28.5,30 22,26 15.5,30 17.5,23.5 12,19 19,19', GOLD),
  ],
  fence_nails: () => [
    ...nail(11),
    ...nail(22, 2),
    ...nail(33),
  ],
  vanguard_kit: () => [
    R(7, 10, 30, 9, '#2c3330', GOLD, 1.5),
    R(7, 25, 30, 9, '#2c3330', MUTED, 1.5),
    C(14, 14.5, 1.4, GOLD),
    C(30, 14.5, 1.4, GOLD),
    C(14, 29.5, 1.4, INK),
    C(30, 29.5, 1.4, INK),
    L(18, 13, 26, 13, GOLD, 1.2),
    L(18, 28, 26, 28, MUTED, 1.2),
  ],
  surge_capacitor: () => [
    P('M7 18 Q22 7 37 18 Q22 14 7 18 Z', MUTED, 1.8, PLATE),
    P('M9 27 Q22 15 35 27 Q22 23 9 27 Z', GOLD, 1.8, '#243028'),
    P('M7 36 Q22 24 37 36 Q22 32 7 36 Z', MUTED, 1.8, PLATE),
  ],
  damage: () => [
    G('22,6 35,35 22,27 9,35', '#2a2418', GOLD, 2),
    L(22, 14, 22, 25, INK, 1.7),
  ],
  haste: () => [
    P('M8 11 L22 22 L8 33', GOLD, 2.8),
    P('M20 11 L34 22 L20 33', INK, 2.8),
  ],
  vitality: () => [
    R(19, 6, 6, 8, GOLD, 'none', 1),
    P('M22 14 C12 20 7 26 6 36', GOLD, 2.5),
    P('M22 14 C32 20 37 26 38 36', GOLD, 2.5),
    P('M22 16 C16 26 14 30 11 39', MUTED, 2.2),
    P('M22 16 C28 26 32 30 35 39', MUTED, 2.2),
    L(22, 14, 22, 24, GOLD, 2.2),
  ],
  strike: () => dart(7, 38, 22, GOLD),
  cadence: () => [
    ...dart(8, 36, 11, GOLD),
    ...dart(8, 30, 22, INK),
    ...dart(8, 36, 33, GOLD),
  ],
  volley: () => [
    P('M8 31 A16 16 0 0 1 36 31', FROST, 2.3),
    L(22, 31, 22, 9, GOLD, 2.3),
    C(22, 31, 2.2, GOLD),
    C(22, 8, 2.6, 'none', FROST, 1.8),
  ],
  focus: () => [
    P('M6 22 Q22 10 38 22 Q22 34 6 22 Z', GOLD, 2.2, PLATE),
    C(22, 22, 4.4, GOLD, INK, 1.6),
    C(23.4, 21, 1.6, INK),
  ],
  shrapnel: () => [
    P('M30 7 C41 16 41 28 30 37', GOLD, 3),
    P('M30 7 L9 22 L30 37', CRIT, 2.2),
    C(9, 22, 2.4, CRIT),
  ],
  pierce: () => [
    C(14, 22, 6.5, 'none', MUTED, 2.2),
    C(29, 22, 6.5, 'none', MUTED, 2.2),
    L(4, 22, 34, 22, PIERCE, 2.5),
    G('40,22 33,18 33,26', PIERCE),
  ],
  frostbite: () => [
    L(8, 34, 33, 9, POISON, 2.5),
    L(15, 27, 10, 20, GOLD, 2.2),
    L(21, 21, 16, 14, GOLD, 2.2),
    L(27, 15, 22, 8, GOLD, 2.2),
    G('34,8 40,6 36,14', POISON),
  ],
  split_shot: () => [
    C(14, 22, 4.5, FIRE, GOLD, 1.8),
    L(18, 22, 34, 22, GOLD, 2.3),
    G('39,22 32,18.5 32,25.5', GOLD),
    L(17, 18, 32, 9, CRIT, 2.1),
    G('36,7 29,7.5 32.5,12.5', CRIT),
    L(17, 26, 32, 35, CRIT, 2.1),
    G('36,37 32.5,31.5 29,36.5', CRIT),
  ],
  ricochet: () => [
    P('M7 33 L19 11 L26 25 L37 10', FROST, 2.5),
    G('39,8 32,9 36,15', CHAIN),
    C(19, 11, 2.6, CHAIN),
    C(26, 25, 2.6, CHAIN),
  ],
  napalm: () => [
    R(16, 6, 12, 11, PLATE, GOLD, 2),
    L(16, 11, 28, 11, FIRE, 2.4),
    flame(-7, 6, FIRE, 0.56),
    flame(7, 6, GOLD, 0.52),
    P('M7 36 Q22 30 37 36', FIRE, 2.4),
  ],
  armored_car: () => [
    R(10, 14, 24, 21, '#32424c', MUTED, 2.5),
    R(7, 16, 3.5, 16, PLATE, MUTED, 1),
    R(33.5, 16, 3.5, 16, PLATE, MUTED, 1),
    R(13, 18, 18, 5, FROST, INK, 1),
    G('7,13 13,8 31,8 37,13 35,15 9,15', GOLD, INK, 1.1),
    C(14, 14, 1.5, INK),
    C(30, 14, 1.5, INK),
  ],
  cryo_barrage: () => [
    G('22,6 25,18 22,36 19,18', FROST, INK, 1.1),
    G('10,12 16,22 19,35 12,24', FROST),
    G('34,12 32,24 25,35 28,22', FROST),
    P('M9 36 Q22 30 35 36', PIERCE, 1.8),
  ],
  orbital_beam: () => [
    R(19, 4, 6, 32, FROST, 'none', 1),
    L(22, 4, 22, 36, INK, 2),
    C(22, 34, 8, 'none', FROST, 1.8),
    L(10, 34, 34, 34, GOLD, 1.8),
  ],
  gem_opening_drop: () => [
    G('22,5 36,14 36,30 22,39 8,30 8,14', '#163544', GOLD, 2),
    P('M14 20 A8 8 0 0 1 30 20', FROST, 2),
    L(14, 20, 22, 27, MUTED, 1.5),
    L(30, 20, 22, 27, MUTED, 1.5),
    R(18, 27, 8, 6, GOLD, INK, 1),
  ],
  gem_aegis_wall: () => [
    G('22,5 36,16 32,34 22,39 12,34 8,16', '#103444', FROST, 2.2),
    P('M14 25 V17 H18 V20 H21 V17 H23 V20 H26 V17 H30 V25 Z', INK, 1.5, FROST),
    L(13, 28, 31, 28, GOLD, 2),
  ],
  gem_pierce_core: () => [
    G('15,7 29,7 37,15 37,29 29,37 15,37 7,29 7,15', '#36161c', CRIT, 2),
    L(6, 36, 36, 8, PIERCE, 2.6),
    G('38,6 30,8 35,14', INK),
    C(22, 22, 3.2, GOLD),
  ],
  gem_elemental: () => [
    G('22,6 36,22 22,38 8,22', PLATE, GOLD, 2),
    G('22,9 11,22 22,35', FIRE),
    G('22,9 33,22 22,35', FROST),
    L(22, 9, 22, 35, INK, 1.4),
  ],
  gem_shredder: () => [
    G('22,5 35,22 22,39 9,22', '#3a1418', FIRE, 2.2),
    P('M14 14 L30 30 M30 14 L14 30', GOLD, 2.4),
    C(22, 22, 3, INK),
  ],
  gem_overdrive: () => [
    G('22,5 35,13 35,31 22,39 9,31 9,13', '#16382c', GOLD, 2),
    C(22, 22, 8.5, 'none', POISON, 2),
    G('24,12 17,23 22,23 20,32 28,21 23,21', GOLD),
  ],
  bolt: () => [
    G('22,5 32,18 26,18 26,34 18,34 18,18 12,18', BOLT),
    L(16, 37, 28, 37, BOLT, 2.4),
  ],
  fire: () => [flame(0, 0, FIRE, 1)],
  frost: () => [
    L(22, 6, 22, 38, FROST, 2.3),
    L(6, 22, 38, 22, FROST, 2.3),
    L(10, 10, 34, 34, FROST, 2.2),
    L(34, 10, 10, 34, FROST, 2.2),
    C(22, 22, 3.2, '#10181c', FROST, 1.8),
  ],
  lightning: () => [
    G('26,4 14,22 21,22 16,40 34,18 25,18', CHAIN),
  ],
  poison: () => [
    P('M22 6 C22 6 36 18 36 27 A14 14 0 1 1 8 27 C8 18 22 6 22 6 Z', POISON, 1.2, POISON),
    C(17, 26, 2.2, 'none', INK, 1.6),
  ],
  support: () => [
    L(12, 6, 12, 38, AURA, 2.8),
    P('M12 8 H34 L28 16 L34 24 H12 Z', AURA, 1.4, AURA),
  ],
  cinderbolt: () => [
    ...dart(6, 28, 26, BOLT),
    flame(10, -2, FIRE, 0.55),
  ],
  hailspike: () => [
    G('22,5 31,18 26,18 24,39 20,39 18,18 13,18', FROST),
  ],
  arcbolt: () => [
    P('M7 30 Q22 6 37 30', CHAIN, 2.4),
    ...dart(10, 36, 34, BOLT),
  ],
  venomspine: () => [
    L(15, 6, 15, 38, GOLD, 2.5),
    L(15, 13, 26, 10, GOLD, 2),
    L(15, 22, 28, 19, GOLD, 2),
    L(15, 31, 26, 28, GOLD, 2),
    C(33, 13, 4.2, POISON),
  ],
  watchpost: () => [
    L(11, 7, 11, 38, GOLD, 2.7),
    P('M11 9 H33 L27 16 L33 23 H11 Z', AURA, 1.3, AURA),
    C(22, 31, 4.2, 'none', BOLT, 1.8),
    C(22, 31, 1.5, BOLT),
  ],
  scald: () => [
    flame(-8, 2, FIRE, 0.62),
    L(30, 10, 30, 28, FROST, 2.2),
    L(21, 19, 39, 19, FROST, 2.2),
    P('M8 37 Q22 29 36 37', GOLD, 2),
  ],
  wildfire: () => [
    flame(-6, 2, FIRE, 0.7),
    L(26, 20, 36, 10, CHAIN, 2.3),
    G('37,9 30,9 34,16', CHAIN),
  ],
  blight: () => [
    flame(0, 0, POISON, 1),
    flame(0, 4, FIRE, 0.45),
  ],
  pyre: () => [
    C(22, 18, 12, 'none', AURA, 1.6),
    flame(0, -2, FIRE, 0.62),
    P('M8 33 H36 L32 39 H12 Z', GOLD, 1.2, GOLD),
  ],
  shatter: () => [
    G('22,6 34,14 31,22 36,32 22,38 8,32 13,22 10,14', '#16343c', FROST, 1.8),
    P('M12 30 L22 16 L15 13', CRIT, 2.3),
  ],
  miasma: () => [
    C(15, 24, 9, 'none', FROST, 2.2),
    C(28, 19, 8, 'none', POISON, 2.2),
    C(24, 31, 6, 'none', MUTED, 1.8),
  ],
  glacierward: () => [
    R(6, 14, 7, 18, FROST, 'none', 1.2),
    R(16, 7, 7, 25, FROST, 'none', 1.2),
    R(26, 14, 7, 18, FROST, 'none', 1.2),
    C(36, 33, 4.5, 'none', AURA, 1.8),
  ],
  catalyst: () => [
    G('16,6 8,18 14,18 11,30 22,15 16,15', CHAIN),
    P('M30 16 C30 16 39 24 39 30 A9 9 0 1 1 21 30 C21 24 30 16 30 16 Z', POISON, 1.1, POISON),
  ],
  relay: () => [
    C(12, 22, 6.5, 'none', AURA, 2.2),
    C(32, 22, 6.5, 'none', AURA, 2.2),
    L(18, 22, 24, 22, CHAIN, 2.3),
    G('28,22 23,18.5 23,25.5', CHAIN),
  ],
  cultivator: () => [
    C(22, 24, 13, 'none', AURA, 1.7),
    L(22, 36, 22, 16, POISON, 2.5),
    P('M22 22 C15 19 11 13 14 11 C18 15 20 18 22 18', POISON, 2.1),
    P('M22 18 C28 13 34 12 35 17 C29 18 25 19 22 21', POISON, 2.1),
    C(22, 37, 2.2, POISON),
  ],
  shambler: () => [
    C(17, 12, 5, MUTED),
    P('M14 17 L11 28 L7 38', MUTED, 3.2),
    P('M18 17 L24 28 L21 38', MUTED, 3.2),
    L(15, 22, 27, 27, MUTED, 2.6),
  ],
  runner: () => [
    C(29, 11, 4, INK),
    P('M27 15 L18 24 L11 19', INK, 2.6),
    P('M18 24 L24 37', INK, 2.6),
    P('M18 24 L31 35', INK, 2.6),
    P('M6 15 L13 17 M6 21 L15 21', GOLD, 2),
  ],
  brute: () => [
    C(22, 9, 4.2, MUTED),
    R(8, 14, 28, 16, MUTED, 'none', 5),
    L(14, 30, 11, 39, MUTED, 3.4),
    L(30, 30, 33, 39, MUTED, 3.4),
  ],
  armored: () => [
    P('M14 16 Q22 6 30 16 V21 H14 Z', MUTED, 1.4, MUTED),
    R(10, 20, 24, 12, PLATE, GOLD, 2),
    L(16, 32, 15, 39, MUTED, 2.6),
    L(28, 32, 29, 39, MUTED, 2.6),
  ],
  spitter: () => [
    C(14, 24, 8, MUTED),
    C(16, 22, 1.5, INK),
    C(26, 15, 1.7, POISON),
    C(32, 21, 2.3, POISON),
    C(36, 14, 1.4, POISON),
    C(37, 25, 1.8, GOLD),
  ],
  swarm: () => [
    C(12, 27, 6, MUTED),
    C(24, 14, 4.6, MUTED),
    C(33, 28, 5.2, MUTED),
    C(11, 26, 1.1, GOLD),
    C(23, 13, 1.1, GOLD),
    C(32, 27, 1.1, GOLD),
  ],
  boss: () => [
    P('M8 18 L13 8 L18 15 L22 5 L26 15 L31 8 L36 18 Z', GOLD, 1.2, GOLD),
    R(11, 18, 22, 14, MUTED, 'none', 3),
    L(16, 32, 14, 39, MUTED, 2.8),
    L(28, 32, 30, 39, MUTED, 2.8),
    C(18, 24, 1.4, GOLD),
    C(26, 24, 1.4, GOLD),
  ],
  leaper: () => [
    P('M8 30 Q16 34 22 28 Q28 22 36 14', GOLD, 2.4),
    C(14, 30, 4.2, FIRE),
    L(12, 34, 8, 40, FIRE, 2.4),
    L(18, 33, 22, 40, FIRE, 2.4),
  ],
  splitter: () => [
    C(22, 24, 11, MUTED),
    P('M22 12 L18 24 L24 24 L20 36', INK, 2),
    C(12, 20, 3.2, CRIT),
    C(33, 28, 3.2, CRIT),
  ],
  mender: () => [
    L(16, 38, 16, 10, POISON, 2.6),
    C(16, 8, 2.4, POISON),
    C(30, 22, 7, 'none', AURA, 2),
    L(30, 17, 30, 27, AURA, 2),
    L(25, 22, 35, 22, AURA, 2),
  ],
  shade: () => [
    P('M22 6 C16 14 14 20 16 28 C18 34 18 38 22 40 C26 38 26 34 28 28 C30 20 28 14 22 6 Z', FROST, 1.6, 'none'),
    C(19, 18, 1.3, INK),
    C(25, 18, 1.3, INK),
  ],
  banner: () => [
    L(14, 40, 14, 8, CRIT, 2.6),
    P('M14 8 H34 L30 14 L34 20 H14', GOLD, 1.4, GOLD),
    C(22, 32, 4, MUTED),
  ],
  warden: () => [
    P('M22 6 L34 14 L32 26 Q22 39 12 26 L10 14 Z', MUTED, 2.2, PLATE),
    L(22, 16, 22, 28, GOLD, 2.4),
  ],
  charge: () => [
    C(22, 24, 8, 'none', CRIT, 2.2),
    L(22, 16, 22, 8, GOLD, 2),
    C(22, 7, 1.6, GOLD),
  ],
  hush: () => [
    C(22, 22, 9, 'none', FROST, 2.2),
    L(12, 22, 32, 22, FROST, 2.4),
  ],
};

function fallback(id) {
  let n = 0;
  const text = String(id || '');
  for (let i = 0; i < text.length; i++) n = (n + text.charCodeAt(i) * (i + 1)) % 97;
  const inset = 9 + (n % 4);
  return [
    G(`22,${inset} ${44 - inset},22 22,${44 - inset} ${inset},22`, 'none', GOLD, 2),
    C(22, 22, 2 + (n % 3), INK),
  ];
}

function signature(parts) {
  return parts.map(([tag, attrs]) => {
    const keys = Object.keys(attrs).sort();
    return tag + keys.map((key) => `${key}=${attrs[key]}`).join(',');
  }).join(';');
}

const seen = new Map();
for (const id of Object.keys(MARKS)) {
  const parts = MARKS[id]();
  if (!parts.length) throw new Error(`Fencefall icon "${id}" is blank`);
  const sig = signature(parts);
  if (seen.has(sig)) throw new Error(`Fencefall icon "${id}" matches "${seen.get(sig)}"`);
  seen.set(sig, id);
}

function svgElement(doc, tag, attrs) {
  let node = null;
  if (doc && typeof doc.createElementNS === 'function') {
    try {
      node = doc.createElementNS(SVG_NS, tag);
    } catch {
      node = null;
    }
  }
  if (!node) node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

/** Decorative svg for a catalog id. The same id always draws the same mark. */
export function catalogIcon(doc, id) {
  const key = typeof id === 'string' && id ? id : 'mark';
  const draw = Object.prototype.hasOwnProperty.call(MARKS, key) ? MARKS[key] : fallback;
  const parts = draw(key);
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '-');
  const svg = svgElement(doc, 'svg', {
    class: 'catalog-icon',
    viewBox: '0 0 44 44',
    width: '44',
    height: '44',
    style: 'width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;display:block',
    'data-icon': key,
    'data-testid': `catalog-icon-${safe}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.appendChild(svgElement(doc, 'rect', {
    x: '1.5',
    y: '1.5',
    width: '41',
    height: '41',
    rx: '9',
    fill: '#10181c',
    stroke: '#3d5a54',
    'stroke-width': '1.5',
  }));
  const sig = [];
  for (const [tag, attrs] of parts) {
    svg.appendChild(svgElement(doc, tag, attrs));
    sig.push(tag + ':' + (attrs.d || attrs.points || [attrs.cx, attrs.cy, attrs.r, attrs.x, attrs.y].filter((value) => value != null).join(',')));
  }
  svg.setAttribute('data-paths', sig.join('|'));
  return svg;
}

export function hasCatalogIcon(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MARKS, id);
}
