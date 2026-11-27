/**
 * Fencefall v5 — PvZ2-Style Illustrated Cel-Shaded SVG Icon Library.
 *
 * Every skill, gun mod, core gem, gear item, permanent upgrade, hero portrait,
 * and zombie codex bust is rendered as a bold-outlined, multi-tone cel-shaded
 * mobile-game badge (`viewBox="0 0 48 48"`, zero external assets).
 *
 * Deterministic `data-paths` signature per id guarantees uniqueness across the
 * entire catalog while unique per-call `<defs>` gradient IDs prevent SVG URL
 * collisions when multiple badges share the DOM.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#10161d';
const WHITE = '#ffffff';

let gradSeq = 0;

const THEMES = Object.freeze({
  fire:     {top: '#8c2810', mid: '#48140a', bot: '#1e0806', border: '#ff8a3a', glint: '#ffd28a'},
  frost:    {top: '#186484', mid: '#0e364c', bot: '#071a26', border: '#72e8ff', glint: '#d4faff'},
  electric: {top: '#244888', mid: '#12244a', bot: '#081024', border: '#ffe458', glint: '#fff8b8'},
  gold:     {top: '#784e14', mid: '#3e270a', bot: '#1a1004', border: '#f8d062', glint: '#fff2b0'},
  crimson:  {top: '#781a2c', mid: '#3e0e18', bot: '#1c060b', border: '#ff6c74', glint: '#ffc2c8'},
  steel:    {top: '#3a566a', mid: '#1e303d', bot: '#0e1820', border: '#92c4dc', glint: '#d8f0fc'},
  emerald:  {top: '#186240', mid: '#0e3624', bot: '#071a12', border: '#6ee89e', glint: '#c6ffe0'},
  toxic:    {top: '#386416', mid: '#1e380c', bot: '#0d1a06', border: '#9ef052', glint: '#e0ffa8'},
  purple:   {top: '#542478', mid: '#2c1242', bot: '#140820', border: '#cc8aff', glint: '#ecd0ff'},
  hero:     {top: '#285882', mid: '#14304a', bot: '#0a1826', border: '#f8d264', glint: '#fff2b8'},
  zombie:   {top: '#2a4636', mid: '#172820', bot: '#0c1612', border: '#74ad86', glint: '#bfe6c8'},
  boss:     {top: '#6e142c', mid: '#3a0a18', bot: '#18040b', border: '#ff6268', glint: '#ffc0c4'},
});

const P = (d, fill = 'none', stroke = INK, width = 1.8) => ['path', {
  d, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}];
const C = (cx, cy, r, fill, stroke = INK, width = 1.8) => ['circle', {
  cx, cy, r, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
}];
const E = (cx, cy, rx, ry, fill, stroke = INK, width = 1.8, tf) => ['ellipse', {
  cx, cy, rx, ry, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  ...(tf ? {transform: tf} : {}),
}];
const R = (x, y, w, h, fill, stroke = INK, rx = 2, width = 1.8, tf) => ['rect', {
  x, y, width: w, height: h, rx, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  ...(tf ? {transform: tf} : {}),
}];
const G = (points, fill, stroke = INK, width = 1.8) => ['polygon', {
  points, fill, stroke,
  'stroke-width': stroke === 'none' ? 0 : width,
  'stroke-linejoin': 'round',
}];
const L = (x1, y1, x2, y2, stroke, width = 2) => ['line', {
  x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round',
}];

// Reusable cel-shaded bullet/shell helper angled along (cx, cy, angleDeg, len, rad, body, tip)
function bullet(cx, cy, deg, len, rad, body, tip, shine = '#fff6cc') {
  const tf = `rotate(${deg} ${cx} ${cy})`;
  const x0 = cx - len * 0.55;
  const w = len * 0.62;
  return [
    ['g', {transform: tf}, [
      // Metallic brass/steel casing
      R(x0, cy - rad, w, rad * 2, body, INK, 1.4, 1.7),
      // Pointed warhead cone
      P(`M${x0 + w - 0.5} ${cy - rad} Q${cx + len * 0.55} ${cy} ${x0 + w - 0.5} ${cy + rad} Z`, tip, INK, 1.7),
      // Specular highlight bar
      R(x0 + 2, cy - rad * 0.55, w * 0.72, rad * 0.48, shine, 'none', 0.8),
    ]],
  ];
}

// Reusable 4-point cartoon sparkle star
function star4(cx, cy, outer, inner, fill = '#fff8c4', stroke = INK, width = 1.2) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 4;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`);
  }
  return G(pts.join(' '), fill, stroke, width);
}

// Reusable 3D faceted gem base
function gemBase(ptsOuter, ptsTop, ptsLeft, ptsRight, cMain, cTop, cDark, cRim) {
  return [
    G(ptsOuter, cMain, INK, 2.2),
    G(ptsTop, cTop, 'none'),
    G(ptsLeft, cRim, 'none'),
    G(ptsRight, cDark, 'none'),
    G(ptsOuter, 'none', INK, 2.1),
    // Glossy facet corner sparkle
    star4(15, 14, 4.2, 1.4, WHITE, 'none'),
  ];
}

// Reusable PvZ2 cartoon zombie bust base (head + eyes + goofy buck teeth)
function zombieHead(cx, cy, r, skin, skinShade, eyeBg = '#fff6b0', pupil = '#141c18', mouth = '#2b1218') {
  return [
    C(cx, cy, r, skin, INK, 2.1),
    // Cheek shadow crescent
    P(`M${cx - r * 0.72} ${cy + r * 0.4} A${r * 0.92} ${r * 0.92} 0 0 0 ${cx + r * 0.82} ${cy + r * 0.1} A${r * 0.95} ${r * 0.95} 0 0 1 ${cx - r * 0.72} ${cy + r * 0.4} Z`, skinShade, 'none'),
    // Glossy forehead shine
    E(cx - r * 0.34, cy - r * 0.42, r * 0.28, r * 0.14, 'rgba(255,255,255,0.34)', 'none', 0, `rotate(-25 ${cx - r * 0.34} ${cy - r * 0.42})`),
    // Expressive mismatched PvZ2 eyes
    C(cx - r * 0.36, cy - r * 0.08, r * 0.27, eyeBg, INK, 1.5),
    C(cx + r * 0.36, cy - r * 0.06, r * 0.22, eyeBg, INK, 1.5),
    C(cx - r * 0.32, cy - r * 0.06, r * 0.11, pupil, 'none'),
    C(cx + r * 0.33, cy - r * 0.04, r * 0.09, pupil, 'none'),
    // Toothy grin
    R(cx - r * 0.44, cy + r * 0.34, r * 0.88, r * 0.32, mouth, INK, 2, 1.3),
    R(cx - r * 0.28, cy + r * 0.36, r * 0.22, r * 0.2, '#f8f4e4', 'none', 0.6),
    R(cx + r * 0.08, cy + r * 0.36, r * 0.2, r * 0.18, '#f8f4e4', 'none', 0.6),
  ];
}

// =========================================================================
// ICON DEFINITIONS: { theme, draw: () => svgParts }
// =========================================================================
const MARKS = {
  // -----------------------------------------------------------------------
  // HERO PORTRAIT (Wall Gunner)
  // -----------------------------------------------------------------------
  hero: {
    theme: 'hero',
    draw: () => [
      // Fluttering crimson commander scarf behind shoulders
      P('M12 32 Q6 36 8 42 L18 38 Z', '#d93842', INK, 1.8),
      // Armored blue torso & brass shoulder pauldrons
      R(13, 30, 22, 14, '#2f5878', INK, 5, 2),
      E(12, 34, 5.2, 6, '#e8b042', INK, 1.9),
      E(36, 34, 5.2, 6, '#e8b042', INK, 1.9),
      // Chest reactor core
      C(24, 37, 3.4, '#6cf4ff', INK, 1.4),
      // Red scarf collar
      R(15, 28, 18, 5, '#e8444c', INK, 2.5, 1.6),
      // Glossy steel-blue combat helmet
      C(24, 19, 12.2, '#467698', INK, 2.1),
      P('M21 7 H27 L26 16 H22 Z', '#f8d262', INK, 1.4),
      E(18, 13, 3.6, 1.8, 'rgba(235,250,255,0.58)', 'none', 0, 'rotate(-30 18 13)'),
      // Glowing cyan tactical visor goggles
      R(14.5, 16, 19, 7.6, '#46d8f8', INK, 3.6, 1.9),
      P('M17 17.6 H23 L20.5 21.8 H16.5 Z', 'rgba(255,255,255,0.82)', 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 6 AUTO SKILLS (自动技能)
  // -----------------------------------------------------------------------
  split_shot: {
    theme: 'fire',
    draw: () => [
      // Fiery split starburst behind impact point
      G('18,12 21,19 29,17 24,24 30,30 22,29 19,37 15,29 8,30 13,24 9,17 16,19', '#ff9832', INK, 1.5),
      G('18,17 20,21 25,21 21,24 23,29 18,26 14,29 15,24 12,21 16,21', '#fff4a8', 'none'),
      // Incoming primary glowing round (left)
      ...bullet(11, 24, 0, 12, 3.2, '#d88c2c', '#ff4c28'),
      // 3 piercing golden shrapnel sub-bullets fanning out right!
      ...bullet(33, 12, -32, 13, 2.6, '#f6c848', '#fff4b4'),
      ...bullet(36, 24, 0, 14, 2.8, '#f6c848', '#ff642c'),
      ...bullet(33, 36, 32, 13, 2.6, '#f6c848', '#fff4b4'),
    ],
  },

  ricochet: {
    theme: 'electric',
    draw: () => [
      // Glowing electric plasma aura arcs
      C(13, 33, 6.2, 'rgba(84,224,255,0.28)', '#62dcff', 1.4),
      C(35, 13, 6.2, 'rgba(84,224,255,0.28)', '#62dcff', 1.4),
      // Thick jagged cel-shaded chain lightning bolt
      G('34,6 17,22 25,23 11,42 32,25 24,24 38,11', '#ffe84a', INK, 2.1),
      G('32,10 21,21 26,22 17,36 29,26 24,25', WHITE, 'none'),
      // Spark nodes
      star4(13, 33, 4.5, 1.6, '#8cf4ff', INK, 1.1),
      star4(36, 13, 4.5, 1.6, '#fff8b8', INK, 1.1),
    ],
  },

  napalm: {
    theme: 'fire',
    draw: () => [
      // Scorching magma pool at bottom
      E(24, 38, 17, 5.2, '#e83e14', INK, 1.8),
      E(24, 38, 11, 2.8, '#ffbe3c', 'none'),
      // Roaring cartoon fire sea tongues
      P('M10 38 C7 29 12 22 16 26 C17 16 23 10 25 18 C29 12 35 18 33 26 C38 23 41 31 38 38 Z', '#ff5c1a', INK, 2.0),
      P('M15 37 C14 30 18 26 21 29 C23 22 27 21 28 28 C31 26 34 31 33 37 Z', '#ffdc52', 'none'),
      // Iconic red-and-yellow napalm fuel canister dropping in from top-left!
      ['g', {transform: 'rotate(-28 22 16)'}, [
        R(15, 9, 14, 15, '#d93226', INK, 3.2, 1.9),
        R(15, 14, 14, 4.5, '#ffd84c', INK, 0.5, 1.3),
        R(19, 6, 6, 3.5, '#7e909c', INK, 1, 1.4),
        R(17.5, 10.5, 2.5, 11, 'rgba(255,255,255,0.42)', 'none', 1),
      ]],
    ],
  },

  armored_car: {
    theme: 'steel',
    draw: () => [
      // Headlight beams
      G('14,14 9,4 19,4', 'rgba(255,242,150,0.34)', 'none'),
      G('34,14 29,4 39,4', 'rgba(255,242,150,0.34)', 'none'),
      // Heavy rubber treads
      R(8, 16, 6, 24, '#1b242a', INK, 2, 1.8),
      R(34, 16, 6, 24, '#1b242a', INK, 2, 1.8),
      // Main cel-shaded armored steel truck body
      R(13, 15, 22, 26, '#526e80', INK, 4.5, 2.0),
      R(16, 17, 16, 6, '#7b99ac', 'none', 2),
      // Glossy cyan slit windshield
      R(16, 23, 16, 6.2, '#5ce2ff', INK, 2, 1.6),
      P('M18 24.5 H24 L22 28 H17.5 Z', 'rgba(255,255,255,0.8)', 'none'),
      // Roof hatch & red tactical beacon
      C(24, 34, 4.5, '#334652', INK, 1.6),
      C(24, 34, 2.1, '#ff4d3c', 'none'),
      // Heavy V-shaped steel ram-plow with hazard stripes
      G('24,6 41,13 39,18 24,13 9,18 7,13', '#dce8f0', INK, 2.0),
      R(14, 11.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
      R(21.8, 9.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
      R(29.5, 11.5, 4.5, 2.8, '#f8cc42', 'none', 0.6),
    ],
  },

  cryo_barrage: {
    theme: 'frost',
    draw: () => [
      // Frosty burst mist at base
      E(24, 38, 15, 4.8, 'rgba(150,242,255,0.45)', '#88ecff', 1.4),
      // Left & right angled faceted ice spears
      G('10,12 18,22 18,37 10,28', '#52c8f0', INK, 1.8),
      G('10,12 15,23 15,33 11,26', '#d8fbff', 'none'),
      G('38,12 38,28 30,37 30,22', '#52c8f0', INK, 1.8),
      G('38,12 37,26 33,33 33,23', '#d8fbff', 'none'),
      // Center giant glacial ice lance
      G('24,5 30,19 24,39 18,19', '#88ecff', INK, 2.1),
      G('24,6 24,37 19.5,19', WHITE, 'none'),
      star4(24, 15, 4.2, 1.4, WHITE, 'none'),
    ],
  },

  orbital_beam: {
    theme: 'frost',
    draw: () => [
      // Outer glowing plasma column
      R(15, 10, 18, 29, 'rgba(72,226,255,0.42)', 'none', 2),
      R(18.5, 10, 11, 29, '#62e8ff', INK, 2, 1.6),
      R(21.5, 10, 5, 29, WHITE, 'none', 1),
      // Sci-fi orbital emitter ring at top
      R(12, 6, 24, 6, '#587488', INK, 3, 1.9),
      R(18, 7.5, 12, 3, '#aef8ff', 'none', 1.5),
      // Blazing concentric ground shockwave crater
      E(24, 38, 16, 5.2, '#4ad6ff', INK, 1.8),
      E(24, 38, 10, 3, WHITE, 'none'),
      // Ascending energy rings along beam
      E(24, 21, 9.5, 2.6, 'none', '#d4fbff', 1.7),
      E(24, 30, 11, 3, 'none', '#fff2a4', 1.6),
    ],
  },

  // -----------------------------------------------------------------------
  // 9 GUN MODS (枪械强化)
  // -----------------------------------------------------------------------
  volley: {
    theme: 'gold',
    draw: () => [
      // Crisp golden fan motion arcs
      P('M12 36 Q24 27 36 36', 'none', '#ffe278', 2.2),
      // 3 brass-and-crimson cartridges launching in a spread fan!
      ...bullet(13, 22, -108, 17, 3.6, '#d8962e', '#ff6438'),
      ...bullet(24, 18, -90, 19, 4.0, '#f2bd42', '#ff4c2c'),
      ...bullet(35, 22, -72, 17, 3.6, '#d8962e', '#ff6438'),
      // Small bright muzzle flash at base
      star4(24, 37, 5.8, 2.2, '#fff5a6', INK, 1.3),
    ],
  },

  strike: {
    theme: 'crimson',
    draw: () => [
      // Dramatic impact explosion burst behind shell
      G('34,10 36,16 42,15 38,20 42,26 35,25 33,31 29,25 23,25 27,20 24,14 30,15', '#ff9234', INK, 1.5),
      // Massive heavy-caliber high-explosive brass cannon shell angled diagonally!
      ['g', {transform: 'rotate(-42 23 25)'}, [
        R(7, 17.5, 20, 15, '#e8a832', INK, 2.6, 2.1),
        R(21, 17.5, 5, 15, '#d83226', INK, 0.6, 1.6),
        P('M26.5 17.5 Q42 25 26.5 32.5 Z', '#ff5432', INK, 2.1),
        R(10, 20, 13, 3.4, '#fff4b4', 'none', 1.2),
        R(5.5, 16.5, 3.6, 17, '#c67d1e', INK, 1.2, 1.6),
      ]],
    ],
  },

  cadence: {
    theme: 'gold',
    draw: () => [
      // Rapid speed streaks
      L(6, 14, 15, 14, '#ffe578', 2.2),
      L(5, 24, 13, 24, '#ffffff', 2.2),
      L(6, 34, 15, 34, '#ffe578', 2.2),
      // Sleek twin rotary gun barrels firing right
      R(9, 17, 18, 6.2, '#627c8e', INK, 2, 1.9),
      R(9, 25, 18, 6.2, '#4a6274', INK, 2, 1.9),
      R(12, 18.6, 11, 2, '#b4d0e0', 'none', 0.8),
      R(21, 15.5, 4, 17, '#d8a034', INK, 1.2, 1.6),
      // Blazing cartoon starburst muzzle flash + flying bullets
      G('28,24 33,14 34,20 43,17 37,24 43,31 34,28 33,34', '#ff9832', INK, 1.6),
      G('30,24 34,19 39,24 34,29', '#fff8c0', 'none'),
    ],
  },

  pierce: {
    theme: 'steel',
    draw: () => [
      // Cracked steel shield plate tilted on the right side
      P('M24 9 L37 13 V25 Q37 35 25 40 L21 35 L26 27 L19 24 L25 18 Z', '#6b8496', INK, 2.0),
      P('M26 12 L34 15 V24 Q34 31 26 36 L24 33 L28 26 L23 23 L27 18 Z', '#9bb5c7', 'none'),
      // Jagged breach crack & glowing energy streak
      L(6, 35, 22, 23, '#72eaff', 3.4),
      // Gleaming brass-and-steel sabot round punching straight through diagonally!
      ...bullet(24, 23, -34, 28, 4.2, '#e8b23c', '#d8f8ff', '#ffffff'),
      // Flying metallic armor shards & golden impact sparks
      G('31,8 36,6 34,12', '#ffe45e', INK, 1.2),
      G('36,33 41,31 39,37', '#ffe45e', INK, 1.2),
      star4(26, 22, 5.2, 1.8, '#fff8c0', INK, 1.1),
    ],
  },

  shrapnel: {
    theme: 'fire',
    draw: () => [
      // Roaring fiery dragon's-breath explosion cloud
      P('M9 34 C6 25 10 15 18 16 C20 8 28 6 31 14 C38 12 42 20 39 28 C42 34 36 40 28 39 C22 42 12 40 9 34 Z', '#ff5a1c', INK, 2.0),
      P('M14 33 C12 27 16 20 21 21 C23 15 28 15 30 20 C35 20 36 27 33 33 Z', '#ffd84a', 'none'),
      // Flaming incandescent bullet rocketing diagonally up-right!
      ...bullet(25, 23, -38, 22, 4.6, '#d93224', '#fff296', '#ffffff'),
      star4(37, 11, 4.5, 1.5, '#fff8c0', INK, 1.1),
    ],
  },

  frostbite: {
    theme: 'frost',
    draw: () => [
      // Crisp glowing ice snowflake backdrop
      L(24, 7, 24, 41, '#9cf4ff', 2.4),
      L(7, 24, 41, 24, '#9cf4ff', 2.4),
      L(12, 12, 36, 36, '#72e2ff', 2.0),
      L(36, 12, 12, 36, '#72e2ff', 2.0),
      // Frosted diamond cryo-core bullet angled diagonally up-right!
      ...bullet(24, 24, -40, 22, 4.6, '#349ec8', '#d4fbff', '#ffffff'),
      // Sharp crystalline icicle crown glint
      star4(14, 14, 4.2, 1.4, WHITE, INK, 1.0),
      star4(35, 34, 3.6, 1.2, '#b6f6ff', 'none'),
    ],
  },

  focus: {
    theme: 'crimson',
    draw: () => [
      // Tactical sniper scope outer ring
      C(24, 24, 14.5, 'rgba(255,70,70,0.16)', '#ff5e58', 2.4),
      C(24, 24, 9.5, 'none', '#ffd862', 1.6),
      // Crosshair ticks
      L(24, 5, 24, 13, '#ffe88a', 2.4),
      L(24, 35, 24, 43, '#ffe88a', 2.4),
      L(5, 24, 13, 24, '#ffe88a', 2.4),
      L(35, 24, 43, 24, '#ffe88a', 2.4),
      // Explosive golden-crimson critical star dead center!
      star4(24, 24, 8.2, 3.0, '#ffe652', INK, 1.6),
      C(24, 24, 2.2, '#ff3832', 'none'),
    ],
  },

  bastion: {
    theme: 'steel',
    draw: () => [
      // Glowing cyan energy wall shield arc behind battlement
      P('M7 18 Q24 6 41 18', 'none', '#6ef0ff', 3.2),
      // Heavy steel fortress wall battlement with merlons
      P('M8 40 V19 H14 V23 H20 V19 H28 V23 H34 V19 H40 V40 Z', '#6c8494', INK, 2.1),
      R(9, 25, 30, 5, '#9ab2c2', 'none', 1),
      // Yellow-and-black hazard stripe base
      R(9, 34, 30, 5, '#f6c844', INK, 1, 1.4),
      G('13,34 17,34 14,39 10,39', '#1b2228', 'none'),
      G('22,34 26,34 23,39 19,39', '#1b2228', 'none'),
      G('31,34 35,34 32,39 28,39', '#1b2228', 'none'),
      // Radiant cyan shield crest centered on the wall
      P('M24 22 L31 25 V31 Q24 37 17 31 V25 Z', '#4ed8ff', INK, 1.7),
      P('M24 24.5 L28 26.5 V30 Q24 34 20 30 V26.5 Z', '#d2faff', 'none'),
    ],
  },

  overclock: {
    theme: 'fire',
    draw: () => [
      // Blazing overdrive turbine ring
      C(24, 24, 15, '#42160c', '#ff9832', 2.4),
      C(24, 24, 11, '#8c2810', 'none'),
      // Double blazing power-up chevrons
      G('24,9 35,23 29,23 24,16 19,23 13,23', '#ffe652', INK, 1.8),
      G('24,20 35,34 29,34 24,27 19,34 13,34', '#ff6a24', INK, 1.8),
      star4(24, 12, 4.2, 1.4, WHITE, 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 6 CORE GEMS (核心宝石 — 璀璨切面 3D 宝石)
  // -----------------------------------------------------------------------
  gem_opening_drop: {
    theme: 'frost',
    draw: () => [
      ...gemBase(
        '24,6 39,15 39,33 24,42 9,33 9,15',
        '24,6 39,15 24,20 9,15',
        '9,15 24,20 24,42 9,33',
        '39,15 39,33 24,42 24,20',
        '#2c9ce0', '#8ef0ff', '#165a8a', '#42b8f4'
      ),
      // Crisp parachute + golden supply crate emblem inside gem
      P('M16 21 A8 8 0 0 1 32 21 Z', WHITE, INK, 1.5),
      L(17, 21, 22, 28, '#e8f6ff', 1.3),
      L(31, 21, 26, 28, '#e8f6ff', 1.3),
      R(19.5, 27.5, 9, 7, '#f8cc4e', INK, 1.4, 1.5),
      L(24, 28, 24, 34, '#a66214', 1.3),
    ],
  },

  gem_aegis_wall: {
    theme: 'frost',
    draw: () => [
      ...gemBase(
        '24,6 39,14 36,33 24,42 12,33 9,14',
        '24,6 39,14 24,18 9,14',
        '9,14 24,18 24,42 12,33',
        '39,14 36,33 24,42 24,18',
        '#26b6dc', '#aaf6ff', '#12607c', '#4ad4f4'
      ),
      // Armored battlement crown inside shield gem
      P('M16 30 V20 H20 V23 H22.5 V20 H25.5 V23 H28 V20 H32 V30 Z', '#fff8de', INK, 1.5),
      R(16, 31, 16, 3, '#f8cc4e', INK, 1, 1.2),
    ],
  },

  gem_pierce_core: {
    theme: 'crimson',
    draw: () => [
      ...gemBase(
        '16,7 32,7 41,16 41,32 32,41 16,41 7,32 7,16',
        '16,7 32,7 34,16 14,16',
        '7,16 14,16 14,32 7,32',
        '34,16 41,16 41,32 32,41 16,41 14,32',
        '#d93246', '#ff8c96', '#7a1222', '#ef4e60'
      ),
      // Silver piercing lance slicing diagonally across ruby gem
      ...bullet(24, 24, -45, 26, 3.6, '#d8e8f2', '#ffffff', '#ffffff'),
    ],
  },

  gem_elemental: {
    theme: 'gold',
    draw: () => [
      // Split Fire-Ruby (left) + Ice-Sapphire (right) diamond gem!
      G('24,5 40,24 24,43 8,24', '#303840', INK, 2.2),
      G('24,6 9,24 24,42', '#ff5e22', 'none'),
      G('24,6 15,24 24,20', '#ffb84a', 'none'),
      G('24,6 39,24 24,42', '#30b8f0', 'none'),
      G('24,6 33,24 24,20', '#aef6ff', 'none'),
      G('24,5 40,24 24,43 8,24', 'none', INK, 2.2),
      L(24, 6, 24, 42, INK, 1.8),
      star4(24, 24, 7.5, 2.6, '#fff8b8', INK, 1.4),
    ],
  },

  gem_shredder: {
    theme: 'crimson',
    draw: () => [
      ...gemBase(
        '24,5 39,19 34,40 24,43 14,40 9,19',
        '24,5 39,19 24,18 9,19',
        '9,19 24,18 24,43 14,40',
        '39,19 34,40 24,43 24,18',
        '#c92232', '#ff7878', '#680c18', '#e83e4c'
      ),
      // Fierce golden cross-slash blades
      G('14,17 18,14 34,31 30,34', '#ffe45a', INK, 1.5),
      G('30,14 34,17 18,34 14,31', '#ffe45a', INK, 1.5),
      C(24, 24, 3.2, WHITE, INK, 1.2),
    ],
  },

  gem_overdrive: {
    theme: 'emerald',
    draw: () => [
      ...gemBase(
        '24,6 39,15 39,33 24,42 9,33 9,15',
        '24,6 39,15 24,19 9,15',
        '9,15 24,19 24,42 9,33',
        '39,15 39,33 24,42 24,19',
        '#2ab868', '#8cf6b6', '#126438', '#44d682'
      ),
      // Blazing golden overdrive lightning bolt
      G('27,12 16,25 23,25 20,36 33,22 26,22', '#ffe84e', INK, 1.7),
      G('26,15 20,24 24,24 23,31 29,23 25,23', WHITE, 'none'),
    ],
  },

  // -----------------------------------------------------------------------
  // 9 EQUIPMENT GEAR ITEMS (军械武装装备)
  // -----------------------------------------------------------------------
  splinter_bow: {
    theme: 'gold',
    draw: () => [
      // Heavy recurve war-bow & gleaming golden arrow
      P('M16 8 C6 16 6 32 16 40', 'none', '#f2be48', 4.2),
      P('M16 8 C6 16 6 32 16 40', 'none', '#fff0a4', 1.4),
      P('M16 8 L23 24 L16 40', 'none', '#d8e4ec', 1.8),
      ...bullet(28, 24, 0, 24, 3.2, '#c88c28', '#ffe468'),
      G('34,18 42,24 34,30 36,24', '#fff29c', INK, 1.5),
    ],
  },

  kinetic_core: {
    theme: 'gold',
    draw: () => [
      // Sci-fi weapon kinetic power core
      P('M11 16 C16 8 32 8 37 16 L35 33 C30 40 18 40 13 33 Z', '#425c6e', INK, 2.1),
      R(7, 20, 6, 8, '#f0be48', INK, 1.5, 1.6),
      R(35, 20, 6, 8, '#f0be48', INK, 1.5, 1.6),
      C(24, 24, 8.2, '#162834', '#f8d262', 2.0),
      C(24, 24, 5.0, '#62ecff', 'none'),
      C(22.5, 22.5, 2.0, WHITE, 'none'),
    ],
  },

  prism_lens: {
    theme: 'frost',
    draw: () => [
      // Precision crystal scope lens
      G('24,6 38,24 24,42 10,24', '#38b4e4', INK, 2.1),
      G('24,6 38,24 24,24', '#a8f4ff', 'none'),
      G('24,6 10,24 24,24', '#62d4f8', 'none'),
      C(24, 24, 6.2, 'none', '#fff4a6', 2.0),
      L(24, 13, 24, 35, WHITE, 1.5),
      L(14, 24, 34, 24, WHITE, 1.5),
    ],
  },

  runner_charm: {
    theme: 'emerald',
    draw: () => [
      // Winged speed talisman
      P('M6 16 Q14 14 19 22 Q12 24 7 29 Q13 27 18 28 L12 34', '#8ef4c0', INK, 1.6),
      P('M42 16 Q34 14 29 22 Q36 24 41 29 Q35 27 30 28 L36 34', '#8ef4c0', INK, 1.6),
      G('24,10 33,24 24,39 15,24', '#f8cc4e', INK, 2.0),
      G('24,14 29,24 24,34 19,24', '#fff4b4', 'none'),
      C(24, 9, 3, '#ffe678', INK, 1.5),
    ],
  },

  sun_spindle: {
    theme: 'gold',
    draw: () => [
      // Radiant sun gear medallion
      G('24,5 27,12 35,8 33,16 42,18 36,24 42,30 33,32 35,40 27,36 24,43 21,36 13,40 15,32 6,30 12,24 6,18 15,16 13,8 21,12', '#f6b834', INK, 1.7),
      C(24, 24, 9.5, '#ffe468', INK, 1.8),
      C(24, 24, 4.5, '#ff7828', INK, 1.4),
      C(22.5, 22.5, 1.6, WHITE, 'none'),
    ],
  },

  bounty_seal: {
    theme: 'gold',
    draw: () => [
      // Royal bounty gold medal with crimson ribbon
      G('16,32 12,43 19,39 22,43 22,32', '#d9363e', INK, 1.6),
      G('32,32 36,43 29,39 26,43 26,32', '#d9363e', INK, 1.6),
      C(24, 21, 13.5, '#f4bc38', INK, 2.1),
      C(24, 21, 9.6, '#d6901c', '#fff0a4', 1.4),
      G('24,12 26.8,18 33,18.4 28,22.5 29.6,28.5 24,25.2 18.4,28.5 20,22.5 15,18.4 21.2,18', '#fff5b0', INK, 1.3),
    ],
  },

  fence_nails: {
    theme: 'steel',
    draw: () => [
      // Heavy spiked steel barricade plate
      R(8, 22, 32, 16, '#587080', INK, 3, 2.0),
      R(10, 24, 28, 4.5, '#9ab2c2', 'none', 1.5),
      // 3 sharp steel spikes bolted across the top
      G('14,7 19,22 9,22', '#dce8f0', INK, 1.9),
      G('24,5 29,22 19,22', '#f6fafe', INK, 1.9),
      G('34,7 39,22 29,22', '#dce8f0', INK, 1.9),
      C(14, 31, 2.4, '#f6cc52', INK, 1.2),
      C(24, 31, 2.4, '#f6cc52', INK, 1.2),
      C(34, 31, 2.4, '#f6cc52', INK, 1.2),
    ],
  },

  vanguard_kit: {
    theme: 'steel',
    draw: () => [
      // Spiked heavy riot-shield armor
      P('M24 6 L39 12 V26 Q39 36 24 42 Q9 36 9 26 V12 Z', '#4c6678', INK, 2.1),
      P('M24 10 L35 14.5 V25 Q35 33 24 37.5 Q13 33 13 25 V14.5 Z', '#7896aa', INK, 1.4),
      // Golden diagonal armored ribs & thorn spikes
      R(14, 21, 20, 5.5, '#f2c248', INK, 1.5, 1.6),
      G('6,18 10,15 10,21', '#ffe888', INK, 1.3),
      G('42,18 38,15 38,21', '#ffe888', INK, 1.3),
      C(24, 23.8, 2.2, '#4ae4ff', INK, 1.1),
    ],
  },

  surge_capacitor: {
    theme: 'frost',
    draw: () => [
      // Glowing cyan shockwave capacitor coil
      P('M8 18 Q24 6 40 18', 'none', '#8ef4ff', 3.2),
      P('M12 24 Q24 14 36 24', 'none', '#56d8ff', 2.8),
      R(13, 25, 22, 14, '#365468', INK, 3.5, 2.0),
      R(17, 28.5, 14, 7, '#64ecff', INK, 2, 1.4),
      R(19, 30, 8, 2.2, WHITE, 'none', 1),
      star4(24, 15, 4.8, 1.6, '#fff6a8', INK, 1.1),
    ],
  },

  // -----------------------------------------------------------------------
  // 4 PERMANENT ARMORY UPGRADES (永久强化)
  // -----------------------------------------------------------------------
  damage: {
    theme: 'crimson',
    draw: () => [
      // Bold crossed artillery/firepower emblem
      G('24,6 37,24 24,42 11,24', '#8c1d28', '#ff7868', 1.8),
      ...bullet(24, 24, -45, 24, 4.4, '#f2b838', '#ff4c2c'),
      star4(34, 14, 5.2, 1.8, '#fff6a6', INK, 1.2),
    ],
  },

  haste: {
    theme: 'gold',
    draw: () => [
      // Twin blazing golden speed chevrons
      G('8,11 19,11 31,24 19,37 8,37 20,24', '#ff9832', INK, 2.0),
      G('20,11 31,11 43,24 31,37 20,37 32,24', '#ffe652', INK, 2.0),
      G('24,14 29,14 38,24 29,34 24,34 33,24', '#fff8c8', 'none'),
    ],
  },

  vitality: {
    theme: 'emerald',
    draw: () => [
      // Emerald-steel fortified heart shield
      P('M24 7 L38 13 V25 Q38 35 24 41 Q10 35 10 25 V13 Z', '#32a866', INK, 2.1),
      P('M24 11 L34 15.5 V24.5 Q34 32 24 36.5 Q14 32 14 24.5 V15.5 Z', '#6ce89c', 'none'),
      // Crisp white medic/fortress cross
      R(21, 16, 6, 16, WHITE, INK, 1.5, 1.5),
      R(16, 21, 16, 6, WHITE, INK, 1.5, 1.5),
      R(21.8, 17, 4.4, 14, WHITE, 'none', 1),
    ],
  },

  economy: {
    theme: 'gold',
    draw: () => [
      // Gleaming stack of golden coins + sparkle
      E(24, 34, 13, 5.5, '#d68a18', INK, 1.9),
      E(24, 28, 13, 5.5, '#eab02c', INK, 1.9),
      E(24, 22, 13, 5.5, '#ffd84e', INK, 1.9),
      E(24, 22, 8.5, 3.0, '#fff29c', '#c87e14', 1.2),
      star4(35, 12, 5.2, 1.8, '#fff8c4', INK, 1.2),
    ],
  },

  // -----------------------------------------------------------------------
  // 15 PVZ2-STYLE CEL-SHADED ZOMBIE CODEX PORTRAITS (僵尸图鉴)
  // -----------------------------------------------------------------------
  shambler: {
    theme: 'zombie',
    draw: () => [
      // Tattered brown jacket shoulders & reaching hands
      R(12, 31, 24, 12, '#6c4d3c', INK, 5, 2.0),
      R(21, 32, 6, 10, '#c8423a', INK, 1, 1.3),
      ...zombieHead(24, 21, 12.2, '#78be62', '#4c883c'),
    ],
  },

  runner: {
    theme: 'zombie',
    draw: () => [
      // Speed streaks
      L(5, 16, 12, 16, '#ffe468', 2.2),
      L(4, 24, 11, 24, '#ffe468', 2.2),
      R(14, 32, 22, 11, '#d87028', INK, 4.5, 1.9),
      ...zombieHead(26, 21, 11.2, '#62c496', '#388e68'),
      // Iconic blazing red runner headband + fluttering tails!
      R(14.5, 13, 23, 4.2, '#e83a36', INK, 1.6, 1.6),
      P('M15 15 L6 11 L9 18 Z', '#e83a36', INK, 1.5),
    ],
  },

  brute: {
    theme: 'crimson',
    draw: () => [
      // Massive hulking juggernaut shoulders & spiked iron pauldrons
      R(6, 26, 36, 17, '#5c6648', INK, 7, 2.1),
      E(10, 31, 6.2, 6.2, '#4a5864', INK, 1.8),
      E(38, 31, 6.2, 6.2, '#4a5864', INK, 1.8),
      G('8,22 12,26 6,27', '#dce6ee', INK, 1.3),
      G('40,22 36,26 42,27', '#dce6ee', INK, 1.3),
      ...zombieHead(24, 19, 11.5, '#688c4e', '#3e5c2c', '#ffd652'),
      // Angry furrowed unibrow
      P('M16 14 L24 18 L32 14', 'none', INK, 2.8),
    ],
  },

  armored: {
    theme: 'steel',
    draw: () => [
      // Heavy steel chest plate & pauldrons
      R(10, 30, 28, 13, '#587080', INK, 5, 2.0),
      R(18, 33, 12, 6, '#8ea8b8', INK, 1.5, 1.3),
      // Iconic PvZ2 iron bucket / knight helmet!
      P('M12 28 V14 Q24 5 36 14 V28 Z', '#7890a0', INK, 2.1),
      P('M15 14 Q24 9 28 13 L25 26 H15 Z', '#a4bccb', 'none'),
      // Visor slit with glowing zombie eyes peering out
      R(15, 19, 18, 6.2, '#141c22', INK, 2, 1.5),
      C(20, 22, 2.1, '#ffe45a', 'none'),
      C(28, 22, 2.1, '#ffe45a', 'none'),
      // Gold helmet brow rivets
      C(16, 15, 1.3, '#f6cc52', 'none'),
      C(32, 15, 1.3, '#f6cc52', 'none'),
    ],
  },

  spitter: {
    theme: 'toxic',
    draw: () => [
      // Acid-stained torso
      R(13, 32, 22, 11, '#36582c', INK, 5, 1.9),
      // Bloated glowing acid-green spitter cheeks
      ...zombieHead(22, 22, 11.5, '#8ee848', '#52a424', '#ffff9e'),
      C(14, 25, 4.5, '#b6ff5a', INK, 1.6),
      C(30, 25, 4.5, '#b6ff5a', INK, 1.6),
      // Flying toxic acid globs!
      C(38, 16, 3.6, '#b8ff4e', INK, 1.5),
      C(40, 25, 2.6, '#96f03c', INK, 1.3),
      C(36, 10, 2.0, '#e6ffb4', 'none'),
    ],
  },

  swarm: {
    theme: 'zombie',
    draw: () => [
      // Cute trio of mischievous mini goblin-zombies with pointy ears!
      G('8,24 14,22 14,28', '#7cd458', INK, 1.4),
      G('40,24 34,22 34,28', '#7cd458', INK, 1.4),
      ...zombieHead(14, 30, 7.6, '#7cd458', '#4c9632'),
      ...zombieHead(34, 30, 7.6, '#7cd458', '#4c9632'),
      G('15,15 20,13 20,19', '#94e468', INK, 1.4),
      G('33,15 28,13 28,19', '#94e468', INK, 1.4),
      ...zombieHead(24, 18, 8.6, '#94e468', '#5aa43c'),
    ],
  },

  boss: {
    theme: 'boss',
    draw: () => [
      // Massive dark demon shoulders
      R(7, 30, 34, 13, '#4c1836', INK, 6, 2.1),
      // Curved obsidian boss horns
      P('M14 19 C7 15 6 8 12 6 C11 11 14 13 18 14 Z', '#2a1220', INK, 1.8),
      P('M34 19 C41 15 42 8 36 6 C37 11 34 13 30 14 Z', '#2a1220', INK, 1.8),
      // Fiery Tyrant Boss Head
      ...zombieHead(24, 24, 12.2, '#8a3468', '#52183c', '#ff4838', '#fff6a6', '#220810'),
      // Blazing golden royal boss crown
      G('13,15 16,6 21,12 24,5 27,12 32,6 35,15', '#ffd84c', INK, 1.8),
      C(24, 11, 2.0, '#ff4838', INK, 1.0),
    ],
  },

  leaper: {
    theme: 'gold',
    draw: () => [
      // Coiled golden leap arc behind jumper
      P('M8 38 Q24 6 40 24', 'none', '#ffe262', 2.8),
      G('42,26 36,24 40,19', '#ffe262', INK, 1.3),
      // Amber jumper tunic
      R(12, 32, 22, 11, '#d98a24', INK, 5, 1.9),
      ...zombieHead(23, 22, 10.8, '#8ec85a', '#568e32'),
      // Pointy orange-gold jumper cone hat!
      G('13,16 23,5 33,16', '#ff9828', INK, 1.9),
      G('17,15 23,8 25,15', '#ffd268', 'none'),
    ],
  },

  splitter: {
    theme: 'purple',
    draw: () => [
      // Glowing purple twin-core slime sphere splitting down a glowing crack!
      C(24, 24, 14.5, '#8c48d8', INK, 2.2),
      P('M24 10 A14 14 0 0 1 24 38 Z', '#682ca8', 'none'),
      // Bright electric split fissure right down the middle
      P('M24 9 L20 18 L27 24 L21 31 L25 39', 'none', '#f0c8ff', 2.8),
      // Twin mischievous eyes on each half
      R(13, 21, 5.5, 4.5, WHITE, INK, 1.5, 1.3),
      R(29.5, 21, 5.5, 4.5, WHITE, INK, 1.5, 1.3),
      C(16, 23.2, 1.5, INK, 'none'),
      C(32, 23.2, 1.5, INK, 'none'),
      // Mini split buds
      C(10, 12, 3.2, '#b87cff', INK, 1.4),
      C(38, 36, 3.2, '#b87cff', INK, 1.4),
    ],
  },

  mender: {
    theme: 'emerald',
    draw: () => [
      // Medic coat & glowing emerald heal staff orb
      R(11, 32, 22, 11, '#3e8c58', INK, 5, 1.9),
      L(37, 17, 37, 41, '#a06c38', 3.0),
      C(37, 15, 5.2, '#5effa8', INK, 1.8),
      C(35.5, 13.5, 1.8, WHITE, 'none'),
      ...zombieHead(21, 23, 10.6, '#76c268', '#468c3c'),
      // Crisp white medic nurse cap with green cross
      R(13, 8, 16, 7.2, '#f4faf6', INK, 2, 1.8),
      R(19.6, 9.5, 2.8, 4.6, '#2cc464', 'none', 0.5),
      R(18.6, 10.5, 4.8, 2.6, '#2cc464', 'none', 0.5),
    ],
  },

  shade: {
    theme: 'frost',
    draw: () => [
      // Translucent spooky cel-shaded icy-blue ghost silhouette!
      P('M12 37 V21 A12 12 0 0 1 36 21 V37 L31 33 L27 39 L24 34 L20 39 L16 33 Z', '#62b8f6', INK, 2.1),
      P('M16 19 A8 8 0 0 1 28 14 Q21 16 17 26 Z', '#c8f0ff', 'none'),
      // Glowing spectral eyes
      E(19.5, 21, 2.6, 3.4, WHITE, INK, 1.3),
      E(28.5, 21, 2.6, 3.4, WHITE, INK, 1.3),
      C(20, 21.5, 1.1, '#122640', 'none'),
      C(28, 21.5, 1.1, '#122640', 'none'),
      E(24, 27.5, 2.4, 3.0, '#183452', 'none'),
    ],
  },

  banner: {
    theme: 'crimson',
    draw: () => [
      // Waving crimson-gold war banner on staff
      L(11, 7, 11, 42, '#c89448', 3.0),
      P('M11 8 H38 L33 15 L38 22 H11 Z', '#e2343c', INK, 1.9),
      C(21, 15, 3.4, '#ffe252', INK, 1.2),
      // Officer zombie peeking beneath banner
      R(18, 34, 20, 9, '#9a282e', INK, 4, 1.8),
      ...zombieHead(28, 28, 8.6, '#76be64', '#4a883c'),
    ],
  },

  warden: {
    theme: 'steel',
    draw: () => [
      // Guard zombie peeking behind huge glowing steel heater shield
      ...zombieHead(28, 18, 9.6, '#6ea872', '#447848'),
      R(19, 28, 18, 14, '#3a4e60', INK, 4, 1.8),
      // Big fortified front heater shield with golden cross!
      P('M20 15 L33 20 V31 Q20 42 7 31 V20 Z', '#5280a8', INK, 2.1),
      P('M20 18.5 L29.5 22 V30 Q20 38 10.5 30 V22 Z', '#80bce8', 'none'),
      R(18.2, 21, 3.6, 13, '#ffe25e', INK, 1, 1.2),
      R(13.5, 25, 13, 3.6, '#ffe25e', INK, 1, 1.2),
    ],
  },

  charge: {
    theme: 'fire',
    draw: () => [
      // Sapper zombie behind big sizzling cartoon bomb!
      ...zombieHead(18, 18, 9.0, '#82ba58', '#528632'),
      // Sizzling bomb body
      C(28, 31, 9.6, '#2a323a', INK, 2.1),
      E(24.5, 27.5, 3.2, 1.8, 'rgba(255,255,255,0.42)', 'none', 0, 'rotate(-30 24.5 27.5)'),
      R(25.5, 19.5, 5, 3.8, '#6e7c86', INK, 1, 1.5),
      // Burning curved fuse + bright orange-gold spark star neatly framed inside badge
      P('M28 19.5 Q31.5 13 36 14', 'none', '#f0c478', 2.2),
      star4(36, 14, 5.6, 2.0, '#ffe44c', '#ff4c1c', 1.4),
    ],
  },

  hush: {
    theme: 'purple',
    draw: () => [
      // Hooded silence wraith projecting glowing cyan mute ring
      P('M12 40 L15 22 Q24 9 33 22 L36 40 Z', '#2a3e54', INK, 2.1),
      C(24, 22, 7.6, '#141c24', INK, 1.8),
      C(21, 21, 1.8, '#7cf4ff', 'none'),
      C(27, 21, 1.8, '#7cf4ff', 'none'),
      // Glowing cyan silence wave halo at front
      C(24, 33, 7.6, 'rgba(84,232,255,0.22)', '#74f0ff', 2.6),
      L(18.5, 33, 29.5, 33, WHITE, 2.2),
    ],
  },

  // -----------------------------------------------------------------------
  // LEGACY BASE ELEMENT ICONS (kept unique & upgraded for compatibility)
  // -----------------------------------------------------------------------
  bolt: {
    theme: 'gold',
    draw: () => [
      ...bullet(24, 24, -90, 26, 4.6, '#e8b638', '#fff4a6'),
      L(16, 40, 32, 40, '#f8d262', 2.6),
    ],
  },
  fire: {
    theme: 'fire',
    draw: () => [
      P('M24 41 C14 41 10 31 14 23 C16 26 18 19 21 15 C22 19 25 10 27 7 C29 15 33 16 35 22 C39 20 39 30 36 36 C33 40 29 41 24 41 Z', '#ff581a', INK, 2.0),
      P('M24 38 C18 38 17 31 20 26 C22 28 24 21 26 19 C28 24 31 25 31 31 C31 36 28 38 24 38 Z', '#ffe258', 'none'),
    ],
  },
  frost: {
    theme: 'frost',
    draw: () => [
      L(24, 7, 24, 41, '#9cf4ff', 3.0),
      L(7, 24, 41, 24, '#9cf4ff', 3.0),
      L(11, 11, 37, 37, '#6ce2ff', 2.4),
      L(37, 11, 11, 37, '#6ce2ff', 2.4),
      G('24,16 32,24 24,32 16,24', WHITE, INK, 1.6),
    ],
  },
  lightning: {
    theme: 'electric',
    draw: () => [
      G('29,5 13,25 22,25 17,43 36,21 26,21', '#ffe84a', INK, 2.1),
      G('27,10 18,23 24,23 21,36 31,23 25,23', WHITE, 'none'),
    ],
  },
  poison: {
    theme: 'toxic',
    draw: () => [
      P('M24 7 C24 7 38 20 38 29 A14 14 0 1 1 10 29 C10 20 24 7 24 7 Z', '#7ce644', INK, 2.1),
      C(18, 28, 3.2, '#e6ffc0', 'none'),
      C(29, 32, 2.0, '#44941c', 'none'),
    ],
  },
  support: {
    theme: 'emerald',
    draw: () => [
      L(13, 8, 13, 41, '#e8c45e', 3.2),
      P('M13 10 H38 L31 18 L38 26 H13 Z', '#6ee8c8', INK, 2.0),
      star4(23, 18, 4.4, 1.6, '#fff8c4', 'none'),
    ],
  },
};

function fallback(id) {
  let n = 0;
  const text = String(id || '');
  for (let i = 0; i < text.length; i++) n = (n + text.charCodeAt(i) * (i + 1)) % 97;
  const inset = 10 + (n % 4);
  return {
    theme: 'gold',
    draw: () => [
      G(`24,${inset} ${48 - inset},24 24,${48 - inset} ${inset},24`, '#f6cc52', INK, 2.0),
      C(24, 24, 3 + (n % 3), WHITE, INK, 1.3),
    ],
  };
}

function serializeParts(parts) {
  return parts.map(([tag, attrs, children]) => {
    const keys = Object.keys(attrs || {}).sort();
    const attrStr = keys.map((k) => `${k}=${attrs[k]}`).join(',');
    const childStr = Array.isArray(children) ? `[${serializeParts(children)}]` : '';
    return `${tag}(${attrStr})${childStr}`;
  }).join(';');
}

// Compile-time uniqueness verification across every icon in MARKS
const seen = new Map();
for (const id of Object.keys(MARKS)) {
  const entry = MARKS[id];
  const parts = entry.draw();
  if (!parts.length) throw new Error(`Fencefall icon "${id}" is blank`);
  const sig = `${entry.theme}|${serializeParts(parts)}`;
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

function appendParts(doc, parent, parts, sigOut) {
  for (const [tag, attrs, children] of parts) {
    const node = svgElement(doc, tag, attrs);
    if (Array.isArray(children)) {
      appendParts(doc, node, children, sigOut);
    }
    parent.appendChild(node);
    sigOut.push(tag + ':' + (attrs.d || attrs.points || [attrs.cx, attrs.cy, attrs.r, attrs.x, attrs.y, attrs.x1, attrs.y1].filter((v) => v != null).join(',')));
  }
}

/** Crisp cel-shaded illustrated SVG badge for any catalog id. */
export function catalogIcon(doc, id) {
  const key = typeof id === 'string' && id ? id : 'mark';
  const entry = Object.prototype.hasOwnProperty.call(MARKS, key) ? MARKS[key] : fallback(key);
  const theme = THEMES[entry.theme] || THEMES.gold;
  const parts = entry.draw();
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '-');
  const gid = `ffbg-${++gradSeq}`;

  const svg = svgElement(doc, 'svg', {
    class: 'catalog-icon',
    viewBox: '0 0 48 48',
    width: '44',
    height: '44',
    style: 'width:44px;height:44px;min-width:44px;min-height:44px;flex:0 0 44px;display:block',
    'data-icon': key,
    'data-testid': `catalog-icon-${safe}`,
    'aria-hidden': 'true',
    focusable: 'false',
  });

  // Rich radial-gradient badge backdrop (unique gradient id per render prevents DOM clashes)
  const defs = svgElement(doc, 'defs');
  const grad = svgElement(doc, 'radialGradient', {id: gid, cx: '36%', cy: '26%', r: '78%'});
  grad.appendChild(svgElement(doc, 'stop', {offset: '0%', 'stop-color': theme.top}));
  grad.appendChild(svgElement(doc, 'stop', {offset: '58%', 'stop-color': theme.mid}));
  grad.appendChild(svgElement(doc, 'stop', {offset: '100%', 'stop-color': theme.bot}));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Outer dark rim + glossy gradient rounded badge plate
  svg.appendChild(svgElement(doc, 'rect', {
    x: '1', y: '1', width: '46', height: '46', rx: '11',
    fill: '#0a1016',
  }));
  svg.appendChild(svgElement(doc, 'rect', {
    x: '2.2', y: '2.2', width: '43.6', height: '43.6', rx: '9.8',
    fill: `url(#${gid})`,
    stroke: theme.border,
    'stroke-width': '1.8',
  }));
  // Glossy mobile-game top sheen arc
  svg.appendChild(svgElement(doc, 'path', {
    d: 'M4.5 13 C4.5 7 7.5 4.5 13 4.5 H35 C40.5 4.5 43.5 7 43.5 13 V17 Q24 23 4.5 17 Z',
    fill: 'rgba(255, 255, 255, 0.13)',
  }));

  const sig = [entry.theme];
  appendParts(doc, svg, parts, sig);
  svg.setAttribute('data-paths', sig.join('|'));
  return svg;
}

export function hasCatalogIcon(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MARKS, id);
}

const UI_PATHS = {
  battle: 'M12 2L4 6v6c0 5.5 3.4 9.6 8 11 4.6-1.4 8-5.5 8-11V6l-8-4zm0 4.2l4.5 2.3v3.5c0 3.2-1.8 5.9-4.5 7-2.7-1.1-4.5-3.8-4.5-7V8.5L12 6.2z',
  armory: 'M12 2l3 5.5L21 9l-4.5 4.2 1.2 6.3L12 16.5 6.3 19.5l1.2-6.3L3 9l6-1.5L12 2z',
  codex: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4zm3 3v10h8V7H8z',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.2 4.6l-1.7 1a6.9 6.9 0 0 1-.6 1.4l.5 1.9-1.8 1.8-1.9-.5a6.9 6.9 0 0 1-1.4.6l-1 1.7H9.7l-1-1.7a6.9 6.9 0 0 1-1.4-.6l-1.9.5-1.8-1.8.5-1.9a6.9 6.9 0 0 1-.6-1.4l-1.7-1v-2.2l1.7-1a6.9 6.9 0 0 1 .6-1.4l-.5-1.9 1.8-1.8 1.9.5a6.9 6.9 0 0 1 1.4-.6l1-1.7h2.6l1 1.7a6.9 6.9 0 0 1 1.4.6l1.9-.5 1.8 1.8-.5 1.9a6.9 6.9 0 0 1 .6 1.4l1.7 1v2.2z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm-1 2.5v7h2v-7h-2z',
  soundOn: 'M4 9v6h4l5 4V5L8 9H4zm12.5 3a3.5 3.5 0 0 0-2-3.2v6.4a3.5 3.5 0 0 0 2-3.2zm-2-7.3v2.1a5.8 5.8 0 0 1 0 10.4v2.1a7.8 7.8 0 0 0 0-14.6z',
  soundOff: 'M4 9v6h4l5 4V5L8 9H4zm12.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z',
  pause: 'M6 5h4v14H6V5zm8 0h4v14h-4V5z',
  play: 'M7 5v14l12-7L7 5z',
  menu: 'M4 6h16v2.2H4V6zm0 4.9h16v2.2H4v-2.2zm0 4.9h16V18H4v-2.2z',
  reroll: 'M17.6 6.4A7.5 7.5 0 1 0 19.3 14h-2.2a5.4 5.4 0 1 1-1.1-5.8L13.5 11H20V4.5l-2.4 1.9z',
  shield: 'M12 2L4 5.5v6c0 5.1 3.4 9.4 8 10.8 4.6-1.4 8-5.7 8-10.8v-6L12 2z',
};

export function navIcon(doc, name, size = 20) {
  const svg = svgElement(doc, 'svg', {
    class: 'ui-icon',
    viewBox: '0 0 24 24',
    width: String(size),
    height: String(size),
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.appendChild(svgElement(doc, 'path', {
    d: UI_PATHS[name] || UI_PATHS.battle,
    fill: 'currentColor',
  }));
  return svg;
}
