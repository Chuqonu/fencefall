/**
 * Fencefall v5 — PvZ2-Style Sharp Cel-Shaded Vector Zombies (All 15 Species).
 *
 * Bottom-center anchor (x, y) grounds each zombie's feet and contact shadow.
 * Drawn directly at native high-DPI resolution with bold cartoon ink outlines,
 * multi-tone cel gradients, expressive PvZ2 faces/eyes/teeth, smooth continuous
 * 60fps skeletal motion (stride, bob, reach, bite lunge, squash-and-stretch on hit),
 * and signature animated props per species.
 */

const INK = '#12181e';

const SIZES = Object.freeze({
  shambler: Object.freeze({width: 24, height: 30}),
  runner: Object.freeze({width: 18, height: 24}),
  brute: Object.freeze({width: 38, height: 44}),
  armored: Object.freeze({width: 28, height: 34}),
  spitter: Object.freeze({width: 26, height: 30}),
  swarm: Object.freeze({width: 16, height: 18}),
  boss: Object.freeze({width: 56, height: 62}),
  leaper: Object.freeze({width: 24, height: 30}),
  splitter: Object.freeze({width: 28, height: 28}),
  mender: Object.freeze({width: 26, height: 32}),
  shade: Object.freeze({width: 22, height: 32}),
  banner: Object.freeze({width: 30, height: 38}),
  warden: Object.freeze({width: 28, height: 34}),
  charge: Object.freeze({width: 24, height: 30}),
  hush: Object.freeze({width: 24, height: 32}),
});

export function enemySize(enemy) {
  const kind = enemy && typeof enemy.kind === 'string' ? enemy.kind : 'shambler';
  return SIZES[kind] || SIZES.shambler;
}

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.ellipse === 'function'
    && typeof ctx.createLinearGradient === 'function'
  );
}

function seedFrom(enemy) {
  if (Number.isFinite(enemy?.driftPhase)) return enemy.driftPhase * 3.1;
  const id = String(enemy?.id || '0');
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 628) / 100;
}

function rRect(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function drawShadow(ctx, rx, ry, lift = 0) {
  ctx.fillStyle = 'rgba(8, 12, 16, 0.44)';
  ctx.beginPath();
  ctx.ellipse(0, -1.5, Math.max(3, rx - lift * 0.2), Math.max(1.5, ry - lift * 0.1), 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Expressive PvZ2 mismatched cartoon eyes + optional teeth jaw. */
function drawZombieFace(ctx, hx, hy, r, opts = {}) {
  const eyeColor = opts.eyeColor || '#fff7b8';
  const pupilColor = opts.pupilColor || '#151218';
  const bigLeft = opts.asymmetric !== false;
  const angry = opts.angry === true;
  const biting = opts.biting === true;
  const eyeSpread = r * 0.42;
  const ey = hy + r * 0.02;
  const rL = r * (bigLeft ? 0.3 : 0.25);
  const rR = r * 0.24;

  // Left & Right eyes
  for (const [ex, er] of [[hx - eyeSpread, rL], [hx + eyeSpread, rR]]) {
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.1, r * 0.14);
    ctx.stroke();

    // Pupil looking down toward the wall!
    ctx.fillStyle = pupilColor;
    ctx.beginPath();
    ctx.arc(ex, ey + er * 0.22, Math.max(0.9, er * 0.42), 0, Math.PI * 2);
    ctx.fill();
  }

  // Heavy angry brows
  if (angry || biting) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1.4, r * 0.2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hx - eyeSpread - rL, ey - rL * 0.9);
    ctx.lineTo(hx - 1, ey - rL * 0.25);
    ctx.moveTo(hx + eyeSpread + rR, ey - rR * 0.9);
    ctx.lineTo(hx + 1, ey - rR * 0.25);
    ctx.stroke();
  }

  // Mouth / Chomp jaw
  const my = hy + r * 0.5;
  const mw = r * (biting ? 0.72 : 0.56);
  const mh = r * (biting ? 0.42 : 0.22);
  ctx.fillStyle = '#3c141c';
  ctx.beginPath();
  ctx.ellipse(hx, my, mw, mh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Jagged ivory PvZ2 teeth
  ctx.fillStyle = '#fff5d6';
  const teeth = biting ? 3 : 2;
  for (let i = 0; i < teeth; i++) {
    const tx = hx - mw * 0.55 + (mw * 1.1 * i) / Math.max(1, teeth - 1);
    ctx.fillRect(tx - 1.1, my - mh * 0.8, 2.2, Math.max(1.6, mh * 0.85));
  }
}

/** Shared articulated cartoon zombie body helper for humanoid species. */
function drawHumanoidZombie(ctx, cfg) {
  const {
    stride, bob, lean, attacking,
    skinLight, skinDark, coatLight, coatDark, pantsColor,
    tieColor, headR = 7.5, torsoW = 12, torsoH = 11, armLen = 9, legH = 7.5,
    eyeColor, angry, hatFn, propBackFn, propFrontFn, headOffsetY = 0
  } = cfg;

  const biteSwing = attacking ? Math.sin(stride * 2.1) * 3.5 : 0;
  const footL = Math.sin(stride) * 3.2;
  const footR = -Math.sin(stride) * 3.2;

  drawShadow(ctx, torsoW * 0.72, 4.2);

  if (propBackFn) propBackFn();

  // Legs
  for (const [side, fy] of [[-1, footL], [1, footR]]) {
    const lx = side * (torsoW * 0.27);
    ctx.fillStyle = pantsColor;
    rRect(ctx, lx - 2.6, -legH - 1.5 + Math.min(0, fy * 0.5), 5.2, legH + 1, 2.2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Shoe
    ctx.fillStyle = '#242220';
    ctx.beginPath();
    ctx.ellipse(lx + side * 0.6, -2.0 + Math.min(0, fy * 0.45), 3.3, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Torso + Coat with bob & sway
  ctx.save();
  ctx.translate(lean, bob + (attacking ? Math.abs(biteSwing) * 0.45 : 0));

  const ty = -legH - torsoH + 1;
  const coatGrad = ctx.createLinearGradient(-torsoW / 2, ty, torsoW / 2, ty + torsoH);
  coatGrad.addColorStop(0, coatLight);
  coatGrad.addColorStop(1, coatDark);
  rRect(ctx, -torsoW / 2, ty, torsoW, torsoH, 4.2);
  ctx.fillStyle = coatGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Coat lapel highlight + tattered tie
  if (tieColor) {
    ctx.fillStyle = '#d9d4c4';
    ctx.beginPath();
    ctx.moveTo(-2.6, ty + 1);
    ctx.lineTo(2.6, ty + 1);
    ctx.lineTo(0, ty + 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = tieColor;
    ctx.beginPath();
    ctx.moveTo(-1.3, ty + 2);
    ctx.lineTo(1.3, ty + 2);
    ctx.lineTo(1.7, ty + 8.5);
    ctx.lineTo(0, ty + 10.5);
    ctx.lineTo(-1.7, ty + 8.5);
    ctx.closePath();
    ctx.fill();
  }

  // Outstretched Reaching Arms (pointing forward/down toward wall!)
  for (const side of [-1, 1]) {
    const ax = side * (torsoW * 0.52);
    const ay = ty + 3.2;
    const armBob = attacking ? biteSwing * side : Math.sin(stride + side * 1.1) * 2.2;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(side * 0.28 + armBob * 0.08);
    // Sleeve
    rRect(ctx, -2.2, -1, 4.4, armLen * 0.62, 2);
    ctx.fillStyle = coatLight;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // Zombie green hand claw
    ctx.fillStyle = skinLight;
    ctx.beginPath();
    ctx.arc(0, armLen * 0.68, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Oversized PvZ2 Cartoon Zombie Head
  const hy = ty - headR * 0.78 + headOffsetY + (attacking ? Math.abs(biteSwing) * 0.35 : 0);
  const headGrad = ctx.createRadialGradient(-headR * 0.3, hy - headR * 0.35, 1.5, 0, hy, headR * 1.15);
  headGrad.addColorStop(0, skinLight);
  headGrad.addColorStop(1, skinDark);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, hy, headR * 0.96, headR * 1.04, lean * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  // Upper-left glossy rim highlight
  ctx.fillStyle = 'rgba(240, 255, 224, 0.42)';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.38, hy - headR * 0.45, headR * 0.32, headR * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();

  drawZombieFace(ctx, 0, hy, headR, {eyeColor, angry, biting: attacking});

  if (hatFn) hatFn(0, hy, headR);
  if (propFrontFn) propFrontFn(ty, hy, headR);

  ctx.restore();
}

// =========================================================================
// INDIVIDUAL ZOMBIE PAINTERS (ALL 15 SPECIES)
// =========================================================================
function drawShambler(ctx, t, attacking) {
  const stride = t * 5.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.8,
    lean: Math.sin(stride) * 1.2,
    attacking,
    skinLight: '#9fd078',
    skinDark: '#5b8a44',
    coatLight: '#6b5748',
    coatDark: '#3f322a',
    pantsColor: '#364454',
    tieColor: '#d93d3d',
    headR: 7.4,
    torsoW: 12.5,
    torsoH: 10.5,
    armLen: 9.5,
    legH: 7.5,
    hatFn: (hx, hy, r) => {
      // Messy tufts of zombie hair
      ctx.strokeStyle = '#2b2420';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx - 2, hy - r);
      ctx.lineTo(hx - 4, hy - r - 3);
      ctx.moveTo(hx + 1, hy - r);
      ctx.lineTo(hx + 3, hy - r - 3.5);
      ctx.stroke();
    }
  });
}

function drawRunner(ctx, t, attacking) {
  const stride = t * 11.5;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -2.6,
    lean: Math.sin(stride) * 1.8,
    attacking,
    skinLight: '#b4dc78',
    skinDark: '#6c9240',
    coatLight: '#f07c2e',
    coatDark: '#a63e14',
    pantsColor: '#2a2e38',
    tieColor: null,
    headR: 6.2,
    torsoW: 10,
    torsoH: 8.8,
    armLen: 8.2,
    legH: 6.8,
    eyeColor: '#fff699',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Bright crimson runner headband with fluttering tails
      ctx.fillStyle = '#e83838';
      rRect(ctx, hx - r * 0.95, hy - r * 0.55, r * 1.9, 2.8, 1.2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const tailW = Math.sin(t * 14) * 2.5;
      ctx.strokeStyle = '#ff5448';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.8, hy - r * 0.45);
      ctx.lineTo(hx + r + 4.5, hy - r * 0.85 + tailW);
      ctx.stroke();
    }
  });
}

function drawSwarm(ctx, t, attacking) {
  const hop = Math.abs(Math.sin(t * 10.5)) * 3.4;
  drawShadow(ctx, 6.2, 2.8, hop);
  ctx.save();
  ctx.translate(0, -hop);
  // Tiny energetic PvZ2 Imp body
  const g = ctx.createRadialGradient(-2, -9, 1, 0, -8, 8.5);
  g.addColorStop(0, '#c2e874');
  g.addColorStop(1, '#689836');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -8.5, 6.4, 6.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Pointy imp ears
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#92c452';
    ctx.beginPath();
    ctx.moveTo(s * 5.2, -10);
    ctx.lineTo(s * 8.6, -12.8);
    ctx.lineTo(s * 5.8, -6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Torn tunic diaper/wrap
  ctx.fillStyle = '#8b5e3c';
  rRect(ctx, -4.5, -5.2, 9, 4.2, 1.8);
  ctx.fill();
  ctx.stroke();

  drawZombieFace(ctx, 0, -9.2, 5.4, {eyeColor: '#fff696', angry: true, biting: attacking});
  ctx.restore();
}

function drawSpitter(ctx, t, attacking) {
  const stride = t * 5.0;
  const pulse = 1 + Math.sin(t * 6.5) * 0.08 + (attacking ? 0.14 : 0);
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.6,
    lean: Math.sin(stride) * 1.0,
    attacking,
    skinLight: '#82cc64',
    skinDark: '#3c7a36',
    coatLight: '#36583e',
    coatDark: '#1d3424',
    pantsColor: '#243028',
    headR: 7.4,
    torsoW: 13.5,
    torsoH: 10.5,
    eyeColor: '#d8ff64',
    angry: true,
    propBackFn: () => {
      // Glowing swollen toxic acid sacs bulging behind shoulders
      ctx.save();
      ctx.scale(pulse, pulse);
      for (const s of [-1, 1]) {
        const sg = ctx.createRadialGradient(s * 8, -16, 1, s * 8, -15, 6);
        sg.addColorStop(0, '#e8ff82');
        sg.addColorStop(0.55, '#86e034');
        sg.addColorStop(1, '#367418');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(s * 7.8, -15.5, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      ctx.restore();
    },
    propFrontFn: (_ty, hy, r) => {
      if (attacking) {
        // Glowing acid orb charging in mouth!
        ctx.fillStyle = '#d4ff56';
        ctx.beginPath();
        ctx.arc(0, hy + r * 0.55, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3c8816';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
  });
}

function drawArmored(ctx, t, attacking) {
  const stride = t * 4.4;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#8eb872',
    skinDark: '#4f7442',
    coatLight: '#7b8c9a',
    coatDark: '#3f4c58',
    pantsColor: '#36424c',
    headR: 8.0,
    torsoW: 15,
    torsoH: 12,
    armLen: 10,
    legH: 8,
    eyeColor: '#88e8ff',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Iconic PvZ2 Glossy Steel Bucket-Helm with visor slit & metallic sheen!
      const bg = ctx.createLinearGradient(hx - r, hy - r, hx + r, hy + r * 0.3);
      bg.addColorStop(0, '#eef6fc');
      bg.addColorStop(0.45, '#9cb0be');
      bg.addColorStop(1, '#4c5e6c');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.92, hy - r * 1.15);
      ctx.lineTo(hx + r * 0.92, hy - r * 1.15);
      ctx.lineTo(hx + r * 1.12, hy + r * 0.25);
      ctx.lineTo(hx - r * 1.12, hy + r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.0;
      ctx.stroke();

      // Bucket top rim
      ctx.fillStyle = '#dce8f0';
      ctx.beginPath();
      ctx.ellipse(hx, hy - r * 1.15, r * 0.92, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Glowing eye slit cut into bucket front
      rRect(ctx, hx - 5.2, hy - 2.2, 10.4, 3.4, 1.4);
      ctx.fillStyle = '#121a20';
      ctx.fill();
      ctx.fillStyle = attacking ? '#ffe878' : '#7ae8ff';
      ctx.fillRect(hx - 3.6, hy - 1.1, 2.6, 1.4);
      ctx.fillRect(hx + 1.0, hy - 1.1, 2.6, 1.4);
    },
    propFrontFn: (ty) => {
      // Twin riveted steel shoulder pauldrons
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#b4c6d4';
        ctx.beginPath();
        ctx.ellipse(s * 8.6, ty + 3, 4.2, 4.8, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.7;
        ctx.stroke();
      }
    }
  });
}

function drawBrute(ctx, t, attacking) {
  const stride = t * 3.6;
  const stomp = Math.abs(Math.sin(stride)) * -2.2;
  const slam = attacking ? Math.sin(t * 7.5) * 6 : 0;

  drawShadow(ctx, 16.5, 6.2);

  // Huge stumpy legs
  for (const s of [-1, 1]) {
    const stepY = s * Math.sin(stride) * 2.5;
    ctx.fillStyle = '#382a34';
    rRect(ctx, s * 6.8 - 4.4, -12 + Math.min(0, stepY), 8.8, 10.5, 3);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(Math.sin(stride) * 1.3, stomp);

  // Hulking Gargantuar-style upper torso
  const tg = ctx.createRadialGradient(-5, -26, 3, 0, -22, 18);
  tg.addColorStop(0, '#c86452');
  tg.addColorStop(0.6, '#8c342e');
  tg.addColorStop(1, '#4d1a1a');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(0, -22, 15.5, 13.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Ragged iron chain strap across chest
  ctx.strokeStyle = '#9aa8b4';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(-11, -30);
  ctx.lineTo(10, -13);
  ctx.stroke();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Massive boulder fists slamming downward
  for (const s of [-1, 1]) {
    const fy = -18 + (s < 0 ? slam : -slam * 0.4);
    ctx.fillStyle = '#a4483e';
    ctx.beginPath();
    ctx.ellipse(s * 16.5, fy, 5.4, 6.8, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.1;
    ctx.stroke();
    // Iron knuckle studs
    ctx.fillStyle = '#d6e2ea';
    ctx.beginPath();
    ctx.arc(s * 16.5, fy + 3.2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Brutish small head sunk between shoulders
  const hy = -34.5;
  const hg = ctx.createRadialGradient(-2, hy - 2, 1, 0, hy, 8);
  hg.addColorStop(0, '#d88672');
  hg.addColorStop(1, '#843a32');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(0, hy, 7.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  drawZombieFace(ctx, 0, hy, 7.4, {eyeColor: '#ffea7a', angry: true, biting: attacking});
  ctx.restore();
}

function drawLeaper(ctx, t, attacking, enemy) {
  const windup = Number.isFinite(enemy?.leapTimer) && enemy.leapTimer > 0;
  const crouch = windup ? 4.5 : 0;
  const stride = t * 8.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: crouch + Math.abs(Math.sin(stride)) * -2.2,
    lean: Math.sin(stride) * 1.4,
    attacking: attacking || windup,
    skinLight: '#b6d86e',
    skinDark: '#6a8e38',
    coatLight: '#e69832',
    coatDark: '#924c14',
    pantsColor: '#3a2c1e',
    headR: 7.0,
    torsoW: 11.5,
    torsoH: 10,
    eyeColor: '#fff588',
    angry: true,
    hatFn: (hx, hy, r) => {
      // Pointed amber hunter hood
      ctx.fillStyle = '#f2a838';
      ctx.beginPath();
      ctx.moveTo(hx, hy - r - 6);
      ctx.lineTo(hx + r * 0.95, hy - r * 0.25);
      ctx.lineTo(hx - r * 0.95, hy - r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
  });
}

function drawSplitter(ctx, t, attacking) {
  const wobble = Math.sin(t * 5.8) * 1.4;
  const pulse = 1 + Math.sin(t * 7.2) * 0.06;
  drawShadow(ctx, 12.5, 4.8);
  ctx.save();
  ctx.translate(wobble, -Math.abs(Math.sin(t * 5.8)) * 1.5);
  ctx.scale(pulse, 2 - pulse);

  // Wide bulbous purple brood sac
  const g = ctx.createRadialGradient(-4, -15, 2, 0, -13, 14);
  g.addColorStop(0, '#c88ce0');
  g.addColorStop(0.55, '#7e4898');
  g.addColorStop(1, '#3e1e52');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, -13, 12.8, 11.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Glowing jagged split-line crack down center!
  ctx.strokeStyle = attacking ? '#ffe872' : '#ff98d4';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0, -23.5);
  ctx.lineTo(-2.5, -16);
  ctx.lineTo(2.4, -10.5);
  ctx.lineTo(-1.0, -3.5);
  ctx.stroke();

  // Twin twin-imp eyes peeking out of each half
  drawZombieFace(ctx, -5.2, -13, 4.0, {eyeColor: '#fff4a6', asymmetric: false, biting: attacking});
  drawZombieFace(ctx, 5.2, -13, 4.0, {eyeColor: '#fff4a6', asymmetric: false, biting: attacking});
  ctx.restore();
}

function drawMender(ctx, t, attacking) {
  const stride = t * 4.5;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#9ed68c',
    skinDark: '#4f8854',
    coatLight: '#4fa876',
    coatDark: '#245842',
    pantsColor: '#253c34',
    headR: 7.0,
    torsoW: 12,
    torsoH: 11.5,
    eyeColor: '#e8ffbe',
    hatFn: (hx, hy, r) => {
      // Field-medic cap with bright mint cross
      rRect(ctx, hx - r * 0.88, hy - r * 1.15, r * 1.76, r * 0.72, 2.8);
      ctx.fillStyle = '#e8f4ea';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = '#2dc474';
      ctx.fillRect(hx - 1.2, hy - r * 1.02, 2.4, 5.2);
      ctx.fillRect(hx - 2.6, hy - r * 0.82, 5.2, 2.2);
    },
    propFrontFn: (ty) => {
      // Glowing mint healing staff in right hand
      const glow = 0.75 + 0.25 * Math.sin(t * 7);
      ctx.strokeStyle = '#5c4228';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(9.5, ty + 14);
      ctx.lineTo(10.5, ty - 9);
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = '#7effc4';
      ctx.beginPath();
      ctx.arc(10.5, ty - 10, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#186844';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawShade(ctx, t, attacking) {
  const floatY = Math.sin(t * 4.8) * 3.0;
  const sway = Math.cos(t * 3.6) * 2.0;
  drawShadow(ctx, 7.5, 3.0, 4 + floatY);

  ctx.save();
  ctx.translate(sway, -4 + floatY);
  // Billowing translucent spectral ghost body
  const g = ctx.createLinearGradient(0, -26, 0, 2);
  g.addColorStop(0, '#96f2ff');
  g.addColorStop(0.55, '#4688b4');
  g.addColorStop(1, 'rgba(34, 58, 92, 0.25)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.bezierCurveTo(10, -24, 11, -10, 9, -1);
  ctx.lineTo(4, -4 + Math.sin(t * 8) * 2);
  ctx.lineTo(0, 1);
  ctx.lineTo(-4, -4 - Math.sin(t * 8) * 2);
  ctx.lineTo(-9, -1);
  ctx.bezierCurveTo(-11, -10, -10, -24, 0, -26);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#142636';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Twin piercing neon-cyan ghost eyes
  ctx.fillStyle = attacking ? '#ffffff' : '#c8ffff';
  ctx.beginPath();
  ctx.ellipse(-3.2, -16, 2.2, 2.8, -0.15, 0, Math.PI * 2);
  ctx.ellipse(3.2, -16, 2.2, 2.8, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBanner(ctx, t, attacking) {
  const stride = t * 5.2;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.6,
    lean: Math.sin(stride) * 1.0,
    attacking,
    skinLight: '#9ac874',
    skinDark: '#527c3e',
    coatLight: '#a62e36',
    coatDark: '#5c141c',
    pantsColor: '#2c2428',
    tieColor: '#f4c854',
    headR: 7.2,
    torsoW: 12.5,
    torsoH: 11,
    angry: true,
    propFrontFn: (ty) => {
      // Tall flagpole + Smooth Sine-Wave Fluttering Crimson War Flag!
      const px = -9.5;
      ctx.strokeStyle = '#3c2a1c';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(px, ty + 14);
      ctx.lineTo(px, ty - 18);
      ctx.stroke();
      ctx.fillStyle = '#f6cf64';
      ctx.beginPath();
      ctx.arc(px, ty - 19, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const w1 = Math.sin(t * 9.5) * 2.2;
      const w2 = Math.cos(t * 9.5) * 2.6;
      const fg = ctx.createLinearGradient(px, ty - 17, px + 18, ty - 8);
      fg.addColorStop(0, '#ff4c44');
      fg.addColorStop(1, '#a81c24');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(px + 1, ty - 17);
      ctx.quadraticCurveTo(px + 9, ty - 18 + w1, px + 18, ty - 15 + w2);
      ctx.lineTo(px + 14.5, ty - 11.5 + w2 * 0.8);
      ctx.lineTo(px + 18, ty - 8 + w2);
      ctx.quadraticCurveTo(px + 9, ty - 9 + w1, px + 1, ty - 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Gold skull dot on flag
      ctx.fillStyle = '#ffe278';
      ctx.beginPath();
      ctx.arc(px + 7.5, ty - 12.5 + w1 * 0.4, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawWarden(ctx, t, attacking) {
  const stride = t * 4.4;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.7,
    attacking,
    skinLight: '#8cb878',
    skinDark: '#486c44',
    coatLight: '#4c6684',
    coatDark: '#26384c',
    pantsColor: '#24303e',
    headR: 7.4,
    torsoW: 13.5,
    torsoH: 11.5,
    angry: true,
    propFrontFn: (ty) => {
      // Gleaming Kite Tower Shield with golden emblem in front!
      const sx = -9;
      const sy = ty + 2;
      const sg = ctx.createLinearGradient(sx - 6, sy - 6, sx + 6, sy + 10);
      sg.addColorStop(0, '#c8dce8');
      sg.addColorStop(0.5, '#648096');
      sg.addColorStop(1, '#2c3d4c');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 6);
      ctx.lineTo(sx + 7.5, sy - 2);
      ctx.lineTo(sx + 6, sy + 7.5);
      ctx.lineTo(sx, sy + 12.5);
      ctx.lineTo(sx - 6, sy + 7.5);
      ctx.lineTo(sx - 7.5, sy - 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.9;
      ctx.stroke();

      // Golden Aegis Cross on shield
      ctx.fillStyle = '#f6cc5c';
      ctx.fillRect(sx - 1.3, sy - 3, 2.6, 11);
      ctx.fillRect(sx - 4.2, sy + 0.5, 8.4, 2.4);
    }
  });
}

function drawCharge(ctx, t, attacking, enemy) {
  const lit = Number.isFinite(enemy?.chargeTimer) && enemy.chargeTimer > 0;
  const stride = t * 8.6;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -2.0,
    lean: Math.sin(stride) * 1.4,
    attacking: attacking || lit,
    skinLight: '#c48c68',
    skinDark: '#74422c',
    coatLight: '#583830',
    coatDark: '#2c1a18',
    pantsColor: '#262022',
    headR: 6.8,
    torsoW: 11.5,
    torsoH: 10,
    eyeColor: '#ffe868',
    angry: true,
    propFrontFn: (ty) => {
      // Bright Red-and-Gold Striped TNT / Cinder Barrel hugged in front!
      const blink = lit && Math.floor(t * 16) % 2 === 0;
      rRect(ctx, -6.5, ty + 2, 13, 10.5, 3);
      ctx.fillStyle = blink ? '#ffea68' : '#e63628';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#f8d24c';
      ctx.fillRect(-5.6, ty + 5.8, 11.2, 2.8);

      // Sputtering Glowing Fuse Spark!
      ctx.strokeStyle = '#d4b888';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, ty + 2);
      ctx.quadraticCurveTo(3, ty - 3, 5.5, ty - 5);
      ctx.stroke();
      const sr = (lit ? 4.4 : 2.8) + Math.sin(t * 28) * 1.1;
      ctx.fillStyle = '#fff598';
      ctx.beginPath();
      ctx.arc(5.5, ty - 5, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.arc(5.5, ty - 5, sr * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawHush(ctx, t, attacking) {
  const stride = t * 5.8;
  drawHumanoidZombie(ctx, {
    stride,
    bob: Math.abs(Math.sin(stride)) * -1.4,
    lean: Math.sin(stride) * 0.8,
    attacking,
    skinLight: '#8cc2c6',
    skinDark: '#446c74',
    coatLight: '#365c6c',
    coatDark: '#1a323e',
    pantsColor: '#1a2832',
    headR: 7.0,
    torsoW: 12,
    torsoH: 11,
    eyeColor: '#b8ffff',
    hatFn: (hx, hy, r) => {
      // Sleek curved teal hood
      ctx.fillStyle = '#2d5866';
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r * 1.06, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineTo(hx + r * 0.8, hy + 2);
      ctx.lineTo(hx - r * 0.8, hy + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    },
    propFrontFn: (ty) => {
      // Pulsing cryo-jammer ring aura around staff
      const pulse = 5.5 + Math.sin(t * 8) * 1.8;
      ctx.save();
      ctx.strokeStyle = 'rgba(130, 240, 255, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, ty + 5, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

function drawBoss(ctx, t, attacking, enemy) {
  const enraged = enemy?.enraged === true;
  const stride = t * (enraged ? 4.8 : 3.2);
  const stomp = Math.abs(Math.sin(stride)) * -3.0;
  const slam = attacking ? Math.sin(t * 8.5) * 7.5 : 0;

  // Dramatic ground shadow + blazing boss aura ring
  drawShadow(ctx, 25, 9.5);
  ctx.save();
  const auraPulse = 0.25 + 0.14 * Math.sin(t * (enraged ? 9 : 4));
  ctx.strokeStyle = enraged ? `rgba(255, 72, 34, ${auraPulse + 0.22})` : `rgba(218, 92, 168, ${auraPulse})`;
  ctx.lineWidth = enraged ? 3.5 : 2.4;
  ctx.beginPath();
  ctx.ellipse(0, -2, 27, 10.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Heavy armored legs
  for (const s of [-1, 1]) {
    const sy = s * Math.sin(stride) * 3.5;
    ctx.fillStyle = enraged ? '#46161c' : '#2e1a2c';
    rRect(ctx, s * 10 - 6, -16 + Math.min(0, sy), 12, 14, 4);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.stroke();
    // Gold/molten knee guard
    ctx.fillStyle = enraged ? '#ff7428' : '#e8bd58';
    rRect(ctx, s * 10 - 4, -14 + Math.min(0, sy), 8, 4.5, 1.5);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(Math.sin(stride) * 1.5, stomp);

  // Colossal Armored Boss Torso
  const bodyGrad = ctx.createRadialGradient(-6, -34, 4, 0, -29, 25);
  if (enraged) {
    bodyGrad.addColorStop(0, '#c83438');
    bodyGrad.addColorStop(0.6, '#7a1624');
    bodyGrad.addColorStop(1, '#320810');
  } else {
    bodyGrad.addColorStop(0, '#964478');
    bodyGrad.addColorStop(0.6, '#5c244c');
    bodyGrad.addColorStop(1, '#260c22');
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-20, -39);
  ctx.quadraticCurveTo(0, -45, 20, -39);
  ctx.lineTo(17, -14);
  ctx.quadraticCurveTo(0, -10, -17, -14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Throbbing Molten Chest Core!
  const corePulse = 1 + Math.sin(t * (enraged ? 12 : 5.5)) * 0.14;
  ctx.save();
  ctx.translate(0, -26);
  ctx.scale(corePulse, corePulse);
  const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, 9.5);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.45, enraged ? '#ffea48' : '#ff8642');
  cg.addColorStop(1, enraged ? '#ff2414' : '#c42432');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7.6, 9.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();
  ctx.restore();

  // Giant Clawed Gauntlet Arms
  for (const s of [-1, 1]) {
    const cy = -24 + (s < 0 ? slam : -slam * 0.5);
    ctx.fillStyle = enraged ? '#8a1e28' : '#6c2c56';
    ctx.beginPath();
    ctx.ellipse(s * 22, cy, 7.2, 9.2, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.3;
    ctx.stroke();
    // 3 razor claws
    ctx.fillStyle = enraged ? '#ffe062' : '#f0e2c8';
    for (const c of [-3.5, 0, 3.5]) {
      ctx.beginPath();
      ctx.moveTo(s * 22 + c - 1.5, cy + 7);
      ctx.lineTo(s * 22 + c + 1.5, cy + 7);
      ctx.lineTo(s * 22 + c, cy + 13.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Boss Head + Curved Sweeping Horns + Jagged Crown!
  const hy = -44;
  // Sweeping Obsidian/Blazing Horns
  for (const s of [-1, 1]) {
    ctx.fillStyle = enraged ? '#ff4a18' : '#2a1828';
    ctx.beginPath();
    ctx.moveTo(s * 9, hy - 3);
    ctx.quadraticCurveTo(s * 22, hy - 8, s * 20, hy - 20);
    ctx.quadraticCurveTo(s * 14, hy - 12, s * 6, hy - 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Head
  const hg = ctx.createRadialGradient(-3, hy - 3, 2, 0, hy, 12.5);
  hg.addColorStop(0, enraged ? '#d64848' : '#a85686');
  hg.addColorStop(1, enraged ? '#5e121a' : '#421636');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.ellipse(0, hy, 11.5, 10.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.3;
  ctx.stroke();

  // Jagged Golden Crown
  ctx.fillStyle = enraged ? '#ffdc32' : '#f4c85a';
  ctx.beginPath();
  ctx.moveTo(-9, hy - 7);
  ctx.lineTo(-10, hy - 16);
  ctx.lineTo(-4, hy - 11);
  ctx.lineTo(0, hy - 19);
  ctx.lineTo(4, hy - 11);
  ctx.lineTo(10, hy - 16);
  ctx.lineTo(9, hy - 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  drawZombieFace(ctx, 0, hy + 1, 10.2, {
    eyeColor: enraged ? '#ffffff' : '#ffe668',
    pupilColor: enraged ? '#ff1e00' : '#180812',
    angry: true,
    biting: attacking || enraged
  });

  ctx.restore();
}

const PAINTERS = {
  shambler: drawShambler,
  runner: drawRunner,
  brute: drawBrute,
  armored: drawArmored,
  spitter: drawSpitter,
  swarm: drawSwarm,
  boss: drawBoss,
  leaper: drawLeaper,
  splitter: drawSplitter,
  mender: drawMender,
  shade: drawShade,
  banner: drawBanner,
  warden: drawWarden,
  charge: drawCharge,
  hush: drawHush,
};

/** Bounded fallback for minimal Node mock contexts that only expose fillRect. */
function drawMinimalFallback(ctx, enemy, x, y, time, scale) {
  const sz = enemySize(enemy);
  const w = Math.max(4, Math.round(sz.width * scale));
  const h = Math.max(4, Math.round(sz.height * scale));
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h);
  const step = Math.floor((Number.isFinite(time) ? time : 0) * 6) % 2;
  const atk = enemy?.attacking === true;
  ctx.save?.();
  ctx.fillStyle = enemy?.enraged ? '#ff4422' : '#86b86a';
  ctx.fillRect(left + 1, top + 1, Math.max(2, w - 2), Math.max(2, h - 5));
  const legOff = atk ? 2 : (step ? 1 : 3);
  ctx.fillRect(left + legOff, top + h - 4, 3, 4);
  ctx.fillRect(left + Math.max(legOff, w - legOff - 3), top + h - 4, 3, 4);
  if (atk) ctx.fillRect(left + Math.floor(w / 2) - 1, top, 2, 2);
  ctx.restore?.();
}

export function drawEnemy(ctx, enemy, x, y, {time = 0, scale = 1, flash = 0} = {}) {
  if (!ctx || !enemy || typeof enemy !== 'object') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const sc = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const fl = Number.isFinite(flash) && flash > 0 ? Math.min(1, flash) : 0;

  if (!isRichCtx(ctx)) {
    drawMinimalFallback(ctx, enemy, x, y, time, sc);
    return;
  }

  const kind = typeof enemy.kind === 'string' && PAINTERS[enemy.kind] ? enemy.kind : 'shambler';
  const t = (Number.isFinite(time) ? time : 0) + seedFrom(enemy);
  const attacking = enemy.attacking === true;

  // Impact squash-and-stretch on hit!
  const sx = sc * (1 + fl * 0.14);
  const sy = sc * (1 - fl * 0.12);

  ctx.save();
  try {
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    PAINTERS[kind](ctx, t, attacking, enemy);

    // Soft radial impact flash gleam (keeps cel-shaded face crisp on hit)
    if (fl > 0.05) {
      const sz = enemySize(enemy);
      const rad = Math.max(sz.width, sz.height) * 0.56;
      const gleam = ctx.createRadialGradient(0, -sz.height * 0.52, 1, 0, -sz.height * 0.52, rad);
      gleam.addColorStop(0, `rgba(255, 255, 255, ${(fl * 0.48).toFixed(3)})`);
      gleam.addColorStop(0.65, `rgba(255, 246, 214, ${(fl * 0.16).toFixed(3)})`);
      gleam.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gleam;
      ctx.beginPath();
      ctx.arc(0, -sz.height * 0.52, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } finally {
    ctx.restore();
  }
}
