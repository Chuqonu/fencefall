/**
 * Fencefall v5 — PvZ2-Style Sharp HD Vector Battlefield Backdrop (360×640 logical space).
 *
 * Rendered directly at native device pixel ratio (2×/3× Retina) with smooth gradients,
 * bold dark ink outlines, warm spotlight cones, progressive steel wall damage, glowing
 * energy wall shield, and a dramatic Central Commander Gunnery Platform framing the
 * permanently anchored solo Wall Gunner. ZERO 2×5 grid drawn.
 */
import {ARENA} from '../shared.js';

const W = ARENA.width;
const H = ARENA.height;
const FENCE_Y = ARENA.fenceY; // 512

const STARS = Object.freeze([
  [22, 10, 1.3, false], [58, 16, 1.1, false], [92, 8, 1.5, true],
  [136, 14, 1.0, false], [178, 7, 1.2, false], [218, 15, 1.5, true],
  [254, 9, 1.1, false], [326, 12, 1.2, false], [346, 7, 1.0, false],
  [40, 26, 0.9, false], [156, 24, 0.9, false], [272, 22, 1.0, false],
]);

const SCRUBS = Object.freeze([
  [12, 118, 1.0], [18, 198, 0.85], [10, 278, 1.1], [16, 356, 0.95], [13, 434, 1.05],
  [348, 134, 0.95], [343, 218, 1.1], [350, 304, 0.9], [344, 386, 1.0], [348, 450, 0.85],
]);

const CRACKS = Object.freeze([
  [[62, 118], [76, 130], [70, 144], [84, 152]],
  [[264, 164], [250, 178], [262, 194], [248, 206]],
  [[112, 248], [126, 258], [120, 274], [134, 284]],
  [[282, 312], [268, 326], [276, 342]],
  [[88, 378], [102, 392], [96, 408], [110, 418]],
  [[234, 416], [248, 428], [240, 444]],
]);

const PEBBLES = Object.freeze([
  [44, 102, 3.2, 2.0], [312, 124, 3.8, 2.2], [52, 178, 2.6, 1.7], [306, 202, 3.0, 1.9],
  [40, 260, 3.6, 2.1], [318, 282, 2.8, 1.8], [48, 342, 3.1, 2.0], [308, 366, 3.5, 2.2],
  [54, 424, 2.9, 1.8], [304, 442, 3.4, 2.0], [132, 196, 2.4, 1.5], [228, 276, 2.6, 1.6],
  [144, 352, 2.2, 1.4], [216, 398, 2.5, 1.5],
]);

const SCORCH_MARKS = Object.freeze([
  [104, 174, 18, 10], [246, 238, 22, 12], [148, 322, 20, 11], [266, 386, 19, 10],
]);

const SKID_MARKS = Object.freeze([
  [124, 126, 128, 184], [134, 126, 138, 184],
  [218, 286, 224, 352], [228, 286, 234, 352],
]);

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.createLinearGradient === 'function'
    && typeof ctx.createRadialGradient === 'function'
  );
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

function fenceRatio(state) {
  const fence = state && state.fence;
  const max = fence && fence.maxHp;
  const hp = fence && fence.hp;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(hp)) return 1;
  if (hp <= 0) return 0;
  if (hp >= max) return 1;
  return hp / max;
}

function directorHasBoss(state) {
  return Boolean(state && state.director && state.director.hasBoss === true);
}

function heroUpgrades(state) {
  const slots = state?.slots;
  if (!Array.isArray(slots)) return {};
  for (const s of slots) {
    if (s?.unit && (s.unit.kind === 'hero' || s.unit.type === 'hero')) {
      return s.unit.upgrades || {};
    }
  }
  return {};
}

// =========================================================================
// SKY, BLOOD MOON & RUINED OVERPASS HORIZON (y = 0 .. 66)
// =========================================================================
function drawSkyAndHorizon(ctx, time, reduced, hasBoss) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 68);
  if (hasBoss) {
    skyGrad.addColorStop(0, '#180710');
    skyGrad.addColorStop(0.55, '#421220');
    skyGrad.addColorStop(1, '#782428');
  } else {
    skyGrad.addColorStop(0, '#0a1524');
    skyGrad.addColorStop(0.55, '#193148');
    skyGrad.addColorStop(1, '#315460');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, 68);

  // Soft horizon atmospheric glow
  const glowGrad = ctx.createRadialGradient(W * 0.5, 58, 12, W * 0.5, 58, 210);
  if (hasBoss) {
    glowGrad.addColorStop(0, 'rgba(255, 86, 56, 0.36)');
    glowGrad.addColorStop(1, 'rgba(255, 60, 40, 0)');
  } else {
    glowGrad.addColorStop(0, 'rgba(120, 214, 210, 0.22)');
    glowGrad.addColorStop(1, 'rgba(60, 120, 140, 0)');
  }
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, W, 68);

  // Twinkling stars
  for (let i = 0; i < STARS.length; i++) {
    const [sx, sy, sr, gold] = STARS[i];
    const tw = reduced ? 0.85 : 0.45 + 0.55 * Math.sin(time * 1.8 + i * 1.7);
    ctx.save();
    ctx.globalAlpha = tw * (hasBoss ? 0.55 : 0.9);
    ctx.fillStyle = gold ? '#ffe39a' : '#d8f1ff';
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Illustrated Crescent / Blood Moon
  const mx = 296;
  const my = 20;
  const moonGlow = ctx.createRadialGradient(mx, my, 4, mx, my, 32);
  if (hasBoss) {
    moonGlow.addColorStop(0, 'rgba(255, 110, 82, 0.46)');
    moonGlow.addColorStop(1, 'rgba(255, 70, 50, 0)');
  } else {
    moonGlow.addColorStop(0, 'rgba(255, 236, 178, 0.38)');
    moonGlow.addColorStop(1, 'rgba(255, 224, 150, 0)');
  }
  ctx.fillStyle = moonGlow;
  ctx.beginPath();
  ctx.arc(mx, my, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = hasBoss ? '#ff7662' : '#fff0c4';
  ctx.beginPath();
  ctx.arc(mx, my, 9.5, 0.35 * Math.PI, 1.65 * Math.PI, false);
  ctx.quadraticCurveTo(mx - 3.2, my, mx + Math.cos(0.35 * Math.PI) * 9.5, my + Math.sin(0.35 * Math.PI) * 9.5);
  ctx.closePath();
  ctx.fill();

  // Distant Wasteland Mesas & City Ruin Silhouette
  ctx.fillStyle = hasBoss ? '#2c0d16' : '#12222d';
  ctx.beginPath();
  ctx.moveTo(0, 66);
  ctx.lineTo(0, 44);
  ctx.lineTo(24, 34);
  ctx.lineTo(48, 42);
  ctx.lineTo(66, 30);
  ctx.lineTo(84, 30);
  ctx.lineTo(94, 46);
  ctx.lineTo(132, 40);
  ctx.lineTo(154, 46);
  ctx.lineTo(192, 36);
  ctx.lineTo(222, 44);
  ctx.lineTo(254, 32);
  ctx.lineTo(278, 32);
  ctx.lineTo(294, 45);
  ctx.lineTo(324, 35);
  ctx.lineTo(360, 42);
  ctx.lineTo(360, 66);
  ctx.closePath();
  ctx.fill();

  // Subtle rim highlight along mesa ridge
  ctx.strokeStyle = hasBoss ? 'rgba(255, 118, 96, 0.35)' : 'rgba(148, 214, 218, 0.25)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Broken Highway Overpass Entrance Lip (where zombies pour onto the road)
  const lipGrad = ctx.createLinearGradient(0, 50, 0, 68);
  lipGrad.addColorStop(0, hasBoss ? '#4d2228' : '#3d5258');
  lipGrad.addColorStop(0.45, hasBoss ? '#311418' : '#26353a');
  lipGrad.addColorStop(1, '#121a1e');
  ctx.fillStyle = lipGrad;
  ctx.fillRect(0, 52, W, 14);

  // Guardrail posts & top bevel along entry cliff
  ctx.fillStyle = hasBoss ? '#99484e' : '#7ea0a6';
  ctx.fillRect(0, 52, W, 2);
  ctx.strokeStyle = '#0d1418';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, 65.5);
  ctx.lineTo(W, 65.5);
  ctx.stroke();
  for (let px = 18; px < W; px += 36) {
    ctx.fillStyle = '#1b262c';
    ctx.fillRect(px, 46, 5, 8);
    ctx.fillStyle = '#8fa9b0';
    ctx.fillRect(px + 1, 46, 3, 2);
  }

  // Drifting stylized atmospheric mist wisps
  ctx.save();
  ctx.globalAlpha = hasBoss ? 0.16 : 0.12;
  ctx.fillStyle = hasBoss ? '#ff8b78' : '#d2f0f5';
  const drift = reduced ? 0 : (time * 9) % (W + 80);
  for (let i = 0; i < 4; i++) {
    const mxp = ((i * 105 + drift) % (W + 80)) - 40;
    const myp = 20 + (i % 2) * 14;
    ctx.beginPath();
    ctx.ellipse(mxp, myp, 26, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// WASTELAND HIGHWAY BATTLEFIELD (y = 66 .. 496)
// =========================================================================
function drawHighwayField(ctx, time, reduced, hasBoss) {
  const fieldTop = 65;
  const fieldBot = FENCE_Y - 12; // 500
  const fieldH = fieldBot - fieldTop;

  // Desert sandy-slate rocky shoulders (x = 0..28 and x = 332..360)
  const shoulderGrad = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
  shoulderGrad.addColorStop(0, hasBoss ? '#312122' : '#2a3330');
  shoulderGrad.addColorStop(0.55, hasBoss ? '#3a2624' : '#323c36');
  shoulderGrad.addColorStop(1, hasBoss ? '#2c1c1a' : '#252e2a');
  ctx.fillStyle = shoulderGrad;
  ctx.fillRect(0, fieldTop, W, fieldH);

  // Main Cracked Asphalt Wasteland Highway (x = 26..334)
  const roadLeft = 26;
  const roadW = W - roadLeft * 2;
  const roadGrad = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
  roadGrad.addColorStop(0, hasBoss ? '#2c2228' : '#28363c');
  roadGrad.addColorStop(0.45, hasBoss ? '#34272d' : '#314248');
  roadGrad.addColorStop(0.88, hasBoss ? '#2e2226' : '#2b3a40');
  roadGrad.addColorStop(1, '#1e282d');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(roadLeft, fieldTop, roadW, fieldH);

  // Subtle center lighting crown on asphalt for depth
  const crownGrad = ctx.createLinearGradient(roadLeft, 0, roadLeft + roadW, 0);
  crownGrad.addColorStop(0, 'rgba(8, 14, 18, 0.34)');
  crownGrad.addColorStop(0.22, 'rgba(130, 175, 185, 0.06)');
  crownGrad.addColorStop(0.5, 'rgba(170, 215, 222, 0.11)');
  crownGrad.addColorStop(0.78, 'rgba(130, 175, 185, 0.06)');
  crownGrad.addColorStop(1, 'rgba(8, 14, 18, 0.34)');
  ctx.fillStyle = crownGrad;
  ctx.fillRect(roadLeft, fieldTop, roadW, fieldH);

  // Concrete road curbs with clean cartoon ink borders
  for (const cx of [roadLeft - 5, roadLeft + roadW - 1]) {
    ctx.fillStyle = '#536468';
    ctx.fillRect(cx, fieldTop, 6, fieldH);
    ctx.fillStyle = '#7b8f94';
    ctx.fillRect(cx + 1, fieldTop, 2, fieldH);
    ctx.strokeStyle = '#121a1e';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx, fieldTop, 6, fieldH);
    // Curb expansion joints
    ctx.fillStyle = '#1b262b';
    for (let jy = fieldTop + 26; jy < fieldBot - 10; jy += 44) {
      ctx.fillRect(cx, jy, 6, 2);
    }
  }

  // Faded painted amber highway edge lines & center dashed road stripe
  ctx.save();
  ctx.fillStyle = hasBoss ? 'rgba(235, 142, 92, 0.24)' : 'rgba(232, 194, 108, 0.22)';
  ctx.fillRect(roadLeft + 10, fieldTop + 4, 3, fieldH - 12);
  ctx.fillRect(roadLeft + roadW - 13, fieldTop + 4, 3, fieldH - 12);

  // Center dashed highway stripe
  ctx.fillStyle = hasBoss ? 'rgba(248, 168, 96, 0.26)' : 'rgba(242, 206, 114, 0.24)';
  for (let dy = fieldTop + 18; dy < fieldBot - 36; dy += 44) {
    rRect(ctx, W / 2 - 2.5, dy, 5, 22, 2);
    ctx.fill();
  }
  ctx.restore();

  // Tire skid marks
  ctx.save();
  ctx.strokeStyle = 'rgba(14, 20, 24, 0.26)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  for (const [x1, y1, x2, y2] of SKID_MARKS) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  // Subtle scorch patches & asphalt cracks
  for (const [sx, sy, rx, ry] of SCORCH_MARKS) {
    const sg = ctx.createRadialGradient(sx, sy, 1, sx, sy, rx);
    sg.addColorStop(0, 'rgba(14, 16, 18, 0.34)');
    sg.addColorStop(1, 'rgba(14, 16, 18, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(15, 22, 26, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const poly of CRACKS) {
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.stroke();
  }
  ctx.restore();

  // Pebbles along highway edges
  for (const [px, py, rx, ry] of PEBBLES) {
    ctx.fillStyle = '#182226';
    ctx.beginPath();
    ctx.ellipse(px, py + 1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a6c70';
    ctx.beginPath();
    ctx.ellipse(px, py, rx * 0.85, ry * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Animated wasteland grass tufts along outer shoulders
  for (let i = 0; i < SCRUBS.length; i++) {
    const [gx, gy, sc] = SCRUBS[i];
    const sway = reduced ? 0 : Math.sin(time * 2.1 + i * 1.4) * 2.0;
    ctx.save();
    ctx.strokeStyle = '#131d19';
    ctx.lineWidth = 3.2 * sc;
    ctx.lineCap = 'round';
    for (const [dx, h] of [[-4, 8], [0, 11], [4, 7]]) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + dx * 0.6 + sway * 0.5, gy - h * 0.55, gx + dx + sway, gy - h * sc);
      ctx.stroke();
    }
    ctx.strokeStyle = '#538a5e';
    ctx.lineWidth = 1.8 * sc;
    for (const [dx, h] of [[-4, 8], [0, 11], [4, 7]]) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.quadraticCurveTo(gx + dx * 0.6 + sway * 0.5, gy - h * 0.55, gx + dx + sway, gy - h * sc);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Painted yellow kill-zone hazard line just ahead of the steel wall
  const dangerY = FENCE_Y - 22;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#f8d260';
  for (let hx = 34; hx < W - 38; hx += 22) {
    ctx.beginPath();
    ctx.moveTo(hx, dangerY);
    ctx.lineTo(hx + 11, dangerY);
    ctx.lineTo(hx + 7, dangerY + 5);
    ctx.lineTo(hx - 4, dangerY + 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Warm twin floodlight beams illuminating the wall kill-zone (smoothly feathered to 0)
  const sweep = reduced ? 0 : Math.sin(time * 0.9) * 14;
  const beamTopY = FENCE_Y - 225;
  for (const [lx, dir] of [[86, -1], [274, 1]]) {
    const beamGrad = ctx.createLinearGradient(lx, FENCE_Y - 12, lx, beamTopY);
    beamGrad.addColorStop(0, hasBoss ? 'rgba(255, 204, 134, 0.24)' : 'rgba(255, 236, 168, 0.20)');
    beamGrad.addColorStop(0.45, hasBoss ? 'rgba(255, 166, 106, 0.09)' : 'rgba(250, 228, 152, 0.08)');
    beamGrad.addColorStop(0.85, 'rgba(255, 224, 148, 0.015)');
    beamGrad.addColorStop(1, 'rgba(255, 224, 148, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(lx - 9, FENCE_Y - 12);
    ctx.lineTo(lx + 9, FENCE_Y - 12);
    ctx.lineTo(lx + 76 + sweep * dir, beamTopY);
    ctx.lineTo(lx - 76 + sweep * dir, beamTopY);
    ctx.closePath();
    ctx.fill();
  }

  // Boss wave subtle crimson atmosphere wash across road
  if (hasBoss) {
    const pulse = reduced ? 0.14 : 0.11 + 0.05 * Math.sin(time * 2.2);
    const wash = ctx.createLinearGradient(0, fieldTop, 0, fieldBot);
    wash.addColorStop(0, `rgba(210, 44, 58, ${pulse})`);
    wash.addColorStop(1, 'rgba(180, 32, 42, 0.03)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, fieldTop, W, fieldH);
  }
}

// =========================================================================
// ILLUSTRATED ARMORED STEEL FORTRESS WALL (y = 492 .. 536)
// =========================================================================
function drawFortressWall(ctx, ratio, time, reduced) {
  const wallTop = FENCE_Y - 18; // 494
  const wallH = 38;
  const damaged = ratio <= 0.65;
  const critical = ratio <= 0.35;

  // Ground drop shadow under wall front
  const shGrad = ctx.createLinearGradient(0, wallTop - 10, 0, wallTop + 2);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
  ctx.fillStyle = shGrad;
  ctx.fillRect(0, wallTop - 10, W, 12);

  // Main beveled steel wall body
  const bodyGrad = ctx.createLinearGradient(0, wallTop, 0, wallTop + wallH);
  if (critical) {
    bodyGrad.addColorStop(0, '#967c76');
    bodyGrad.addColorStop(0.24, '#6a524d');
    bodyGrad.addColorStop(0.76, '#483532');
    bodyGrad.addColorStop(1, '#261a18');
  } else if (damaged) {
    bodyGrad.addColorStop(0, '#b8c4cc');
    bodyGrad.addColorStop(0.24, '#7d8e98');
    bodyGrad.addColorStop(0.76, '#4f5e68');
    bodyGrad.addColorStop(1, '#28323a');
  } else {
    bodyGrad.addColorStop(0, '#dce8f0');
    bodyGrad.addColorStop(0.22, '#9ab0be');
    bodyGrad.addColorStop(0.75, '#5b707e');
    bodyGrad.addColorStop(1, '#2d3b45');
  }

  ctx.fillStyle = bodyGrad;
  ctx.fillRect(0, wallTop, W, wallH);

  // Razor-wire defensive coils along top parapet
  ctx.save();
  ctx.strokeStyle = critical ? '#5a443e' : '#32424c';
  ctx.lineWidth = 1.8;
  for (let wx = 8; wx < W - 4; wx += 14) {
    ctx.beginPath();
    ctx.ellipse(wx, wallTop - 1, 7, 4.2, -0.25, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = critical ? '#a68b80' : '#d2e2ec';
  ctx.lineWidth = 0.9;
  for (let wx = 8; wx < W - 4; wx += 14) {
    ctx.beginPath();
    ctx.ellipse(wx, wallTop - 1.5, 6.2, 3.6, -0.25, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
  ctx.restore();

  // Bright beveled top armor lip
  ctx.fillStyle = critical ? '#c49d90' : '#eef7fc';
  ctx.fillRect(0, wallTop, W, 3.2);
  ctx.fillStyle = '#12191e';
  ctx.fillRect(0, wallTop + 3.2, W, 1.5);

  // Armor panel vertical seams & steel rivets
  const panelW = 36;
  for (let px = 0; px < W; px += panelW) {
    ctx.fillStyle = '#172128';
    ctx.fillRect(px, wallTop + 4, 2, wallH - 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.fillRect(px + 2, wallTop + 5, 1.2, wallH - 8);
    // Corner rivets
    for (const [rx, ry] of [[px + 6, wallTop + 9], [px + panelW - 6, wallTop + 9], [px + 6, wallTop + 21], [px + panelW - 6, wallTop + 21]]) {
      ctx.fillStyle = '#19232a';
      ctx.beginPath();
      ctx.arc(rx, ry + 0.7, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = critical ? '#a88c82' : '#d8e6ee';
      ctx.beginPath();
      ctx.arc(rx, ry, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Caution Yellow-Black Diagonal Hazard Band along lower steel girder
  const bandY = wallTop + 25;
  const bandH = 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, bandY, W, bandH);
  ctx.clip();
  ctx.fillStyle = '#1b2226';
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = critical ? '#d96b38' : damaged ? '#d8a63c' : '#f4c84c';
  for (let sx = -10; sx < W + 16; sx += 18) {
    ctx.beginPath();
    ctx.moveTo(sx, bandY + bandH);
    ctx.lineTo(sx + 8, bandY + bandH);
    ctx.lineTo(sx + 14, bandY);
    ctx.lineTo(sx + 6, bandY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#10161c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, bandY);
  ctx.lineTo(W, bandY);
  ctx.moveTo(0, bandY + bandH);
  ctx.lineTo(W, bandY + bandH);
  ctx.stroke();

  // Heavy Reinforced Steel Buttress Pylons + Floodlight Turret Lamps
  const pylons = [14, 86, 274, 346];
  for (const cx of pylons) {
    const pw = 18;
    const ph = 42;
    const px = cx - pw / 2;
    const py = wallTop - 4;
    const pg = ctx.createLinearGradient(px, py, px + pw, py);
    pg.addColorStop(0, '#3e4f5a');
    pg.addColorStop(0.45, '#9ab0be');
    pg.addColorStop(1, '#2b3740');
    rRect(ctx, px, py, pw, ph, 4);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = '#10161c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Lamp / warning beacon on inner pylons (86 & 274)
    if (cx === 86 || cx === 274) {
      const blink = critical ? (0.45 + 0.55 * Math.sin(time * 9)) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      ctx.fillStyle = critical ? '#ff4a32' : '#ffe896';
      ctx.beginPath();
      ctx.arc(cx, py + 9, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#141c22';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
    }
  }

  // Progressive Damage: Jagged Vector Cracks, Scorch & Glowing Embers
  if (damaged) {
    const cracks = [
      [[52, wallTop + 4], [58, wallTop + 14], [53, wallTop + 23]],
      [[148, wallTop + 3], [142, wallTop + 13], [150, wallTop + 24]],
      [[216, wallTop + 5], [224, wallTop + 15], [218, wallTop + 25]],
      [[308, wallTop + 4], [302, wallTop + 16], [310, wallTop + 24]],
    ];
    const shown = critical ? cracks.length : 2;
    ctx.save();
    ctx.strokeStyle = '#100c0b';
    ctx.lineWidth = critical ? 2.4 : 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < shown; i++) {
      const pts = cracks[i];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.stroke();
      if (critical) {
        ctx.strokeStyle = '#ff6a28';
        ctx.lineWidth = 1.0;
        ctx.stroke();
        ctx.strokeStyle = '#100c0b';
        ctx.lineWidth = 2.4;
      }
    }
    ctx.restore();
  }

  // Critical smoking wisps
  if (critical && !reduced) {
    for (let i = 0; i < 3; i++) {
      const sx = 64 + i * 116;
      const cycle = (time * 0.9 + i * 0.37) % 1;
      const sy = wallTop + 8 - cycle * 24;
      ctx.save();
      ctx.globalAlpha = (1 - cycle) * 0.36;
      ctx.fillStyle = '#201818';
      ctx.beginPath();
      ctx.arc(sx + Math.sin(time * 3 + i) * 4, sy, 4 + cycle * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Clean dark ink bottom outline of the steel wall
  ctx.strokeStyle = '#0e1419';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, wallTop + wallH);
  ctx.lineTo(W, wallTop + wallH);
  ctx.stroke();
}

// =========================================================================
// GLOWING ENERGY WALL SHIELD (AEGIS IMMUNITY)
// =========================================================================
function drawWallShield(ctx, count, time, reduced) {
  if (!(count > 0)) return;
  const pulse = reduced ? 0.85 : 0.72 + 0.28 * Math.sin(time * 4.2);
  const y = FENCE_Y - 22;

  ctx.save();
  // Translucent curved plasma barrier band
  const shieldGrad = ctx.createLinearGradient(0, y - 10, 0, y + 8);
  shieldGrad.addColorStop(0, 'rgba(72, 224, 255, 0)');
  shieldGrad.addColorStop(0.5, `rgba(92, 232, 255, ${0.26 * pulse})`);
  shieldGrad.addColorStop(1, 'rgba(42, 168, 220, 0.06)');
  ctx.fillStyle = shieldGrad;
  ctx.fillRect(0, y - 10, W, 18);

  // Crisp glowing energy ridge arc
  ctx.strokeStyle = `rgba(154, 246, 255, ${0.85 * pulse})`;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(6, y + 3);
  ctx.quadraticCurveTo(W / 2, y - 8, W - 6, y + 3);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 255, 255, ${0.75 * pulse})`;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(16, y + 1);
  ctx.quadraticCurveTo(W / 2, y - 7, W - 16, y + 1);
  ctx.stroke();

  // Shield Charge Pips centered above wall
  const shown = Math.min(8, Math.floor(count));
  const spacing = 12;
  const startX = W / 2 - ((shown - 1) * spacing) / 2;
  for (let i = 0; i < shown; i++) {
    const px = startX + i * spacing;
    const py = y - 6;
    ctx.fillStyle = '#0e2c3a';
    ctx.beginPath();
    ctx.moveTo(px, py - 5);
    ctx.lineTo(px + 4.5, py - 2);
    ctx.lineTo(px + 3.5, py + 3);
    ctx.lineTo(px, py + 5.5);
    ctx.lineTo(px - 3.5, py + 3);
    ctx.lineTo(px - 4.5, py - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8ef4ff';
    ctx.beginPath();
    ctx.arc(px, py, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// =========================================================================
// CENTRAL COMMANDER BASTION DECK (y = 532 .. 640) — ZERO 2×5 GRID!
// =========================================================================
function drawCommanderDeck(ctx, state, time, reduced) {
  const deckTop = FENCE_Y + 20; // 532
  const deckH = H - deckTop;

  // Heavy fortified steel-concrete bastion deck floor
  const deckGrad = ctx.createLinearGradient(0, deckTop, 0, H);
  deckGrad.addColorStop(0, '#222d34');
  deckGrad.addColorStop(0.42, '#1a242b');
  deckGrad.addColorStop(1, '#10181d');
  ctx.fillStyle = deckGrad;
  ctx.fillRect(0, deckTop, W, deckH);

  // Subtle metallic decking seams
  ctx.save();
  ctx.strokeStyle = 'rgba(130, 174, 190, 0.08)';
  ctx.lineWidth = 1;
  for (let y = deckTop + 18; y < H; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  for (let x = 45; x < W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x, deckTop);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  // Power conduits running from Center Platform to Flanking Auto-Skill Pods
  const cx = W / 2; // 180
  const cy = ARENA.frontY + 4; // 564
  const upg = heroUpgrades(state);
  const hasFire = (upg.napalm || 0) > 0 || (upg.shrapnel || 0) > 0;
  const hasFrost = (upg.cryo_barrage || 0) > 0 || (upg.frostbite || 0) > 0;
  const hasTech = (upg.orbital_beam || 0) > 0 || (upg.ricochet || 0) > 0;
  const hasCar = (upg.armored_car || 0) > 0;

  ctx.save();
  ctx.strokeStyle = '#10171d';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(74, 574);
  ctx.lineTo(cx, cy + 4);
  ctx.lineTo(286, 574);
  ctx.stroke();

  ctx.strokeStyle = '#334652';
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Animated energy pulses along conduits when Auto Skills are unlocked
  if (hasFire || hasFrost || hasTech || hasCar) {
    const glow = reduced ? 0.7 : 0.45 + 0.45 * Math.sin(time * 4.5);
    ctx.strokeStyle = hasTech ? `rgba(100, 240, 255, ${glow})` : hasFire ? `rgba(255, 140, 56, ${glow})` : `rgba(246, 206, 100, ${glow})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();

  // Decorative Flanking Auto-Skill Support Pods (Left & Right of Hero)
  for (const [px, accent, lit] of [
    [74, hasFire ? '#ff7c32' : '#f0c454', hasFire || hasCar],
    [286, hasFrost ? '#78ecff' : '#64e2ff', hasFrost || hasTech]
  ]) {
    const py = 574;
    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(px, py + 7, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Hexagonal steel launcher pad
    const padGrad = ctx.createLinearGradient(px - 18, py - 10, px + 18, py + 10);
    padGrad.addColorStop(0, '#506470');
    padGrad.addColorStop(1, '#26333c');
    rRect(ctx, px - 18, py - 10, 36, 20, 7);
    ctx.fillStyle = padGrad;
    ctx.fill();
    ctx.strokeStyle = '#0f161c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing core LED
    const pulse = reduced ? 0.85 : 0.55 + 0.45 * Math.sin(time * 3.8 + px);
    ctx.fillStyle = lit ? accent : '#394b56';
    ctx.save();
    ctx.globalAlpha = lit ? pulse : 0.65;
    ctx.beginPath();
    ctx.arc(px, py, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#12191e';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Ammo Crates tucked cleanly on outer deck flanks
  for (const [bx, by] of [[18, 564], [316, 564]]) {
    rRect(ctx, bx, by, 26, 16, 3);
    ctx.fillStyle = '#485a46';
    ctx.fill();
    ctx.strokeStyle = '#111815';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = '#6c8468';
    ctx.fillRect(bx + 2, by + 2, 22, 4);
    ctx.fillStyle = '#e8c45e';
    ctx.fillRect(bx + 10, by + 7, 6, 3);
  }

  // HEROIC CENTRAL COMMANDER GUNNERY PLATFORM (Anchors fixed center Wall Gunner!)
  const platRx = 46;
  const platRy = 22;

  // Soft golden ambient halo
  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 56);
  halo.addColorStop(0, 'rgba(246, 204, 96, 0.22)');
  halo.addColorStop(1, 'rgba(246, 204, 96, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 58, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  // Outer beveled steel base ellipse
  ctx.fillStyle = '#10171d';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 4, platRx + 2, platRy + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const outerGrad = ctx.createLinearGradient(cx, cy - platRy, cx, cy + platRy);
  outerGrad.addColorStop(0, '#6a808e');
  outerGrad.addColorStop(0.5, '#3b4c57');
  outerGrad.addColorStop(1, '#212c34');
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx, platRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0e1419';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Inner dark recessed steel deck with pulsing gold tactical ring
  ctx.fillStyle = '#1b262e';
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx - 8, platRy - 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const ringAlpha = reduced ? 0.78 : 0.58 + 0.34 * Math.sin(time * 2.8);
  ctx.save();
  ctx.strokeStyle = `rgba(248, 206, 94, ${ringAlpha})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, platRx - 7, platRy - 4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Four directional brass chevron ticks around the central platform
  ctx.fillStyle = '#f2c864';
  for (const [tx, ty] of [[cx, cy - platRy + 2], [cx, cy + platRy - 2], [cx - platRx + 5, cy], [cx + platRx - 5, cy]]) {
    ctx.beginPath();
    ctx.arc(tx, ty, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// =========================================================================
// MINIMAL-CTX FALLBACK (for unit tests with fillRect-only stubs)
// =========================================================================
function drawMinimalFallback(ctx, ratio) {
  ctx.fillStyle = '#1a2c38';
  ctx.fillRect(0, 0, W, 65);
  ctx.fillStyle = '#2a3940';
  ctx.fillRect(0, 65, W, FENCE_Y - 75);
  ctx.fillStyle = ratio > 0.35 ? '#8ca0ae' : '#6c4d48';
  ctx.fillRect(0, FENCE_Y - 12, W, 28);
  ctx.fillStyle = '#1b262e';
  ctx.fillRect(0, FENCE_Y + 16, W, H - (FENCE_Y + 16));
}

export function drawWorld(ctx, state, options) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const opts = options || {};
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const reduced = Boolean(opts.reducedMotion || opts.settings?.reducedMotion);
  const ratio = fenceRatio(state);
  const hasBoss = directorHasBoss(state);
  const wallImmunity = Number.isFinite(state?.wallImmunity) ? Math.max(0, Math.floor(state.wallImmunity)) : 0;

  if (!isRichCtx(ctx)) {
    drawMinimalFallback(ctx, ratio);
    return;
  }

  ctx.save();
  try {
    drawSkyAndHorizon(ctx, time, reduced, hasBoss);
    drawHighwayField(ctx, time, reduced, hasBoss);
    drawFortressWall(ctx, ratio, time, reduced);
    drawWallShield(ctx, wallImmunity, time, reduced);
    drawCommanderDeck(ctx, state, time, reduced);
  } finally {
    ctx.restore();
  }
}

/** Crisp vector icon drawer (kept exported for compatibility). */
export function drawIcon(ctx, id, x, y, size = 16) {
  if (!ctx || typeof ctx.fillRect !== 'function') return;
  const s = Math.max(8, Number.isFinite(size) ? size : 16);
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s * 0.38;
  const key = String(id || '').toLowerCase();

  if (!isRichCtx(ctx)) {
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect(x + 2, y + 2, Math.max(2, s - 4), Math.max(2, s - 4));
    return;
  }

  ctx.save();
  try {
    rRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, s * 0.22);
    ctx.fillStyle = '#132028';
    ctx.fill();
    ctx.strokeStyle = '#486772';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const color = key.includes('fire') || key.includes('napalm') || key.includes('burn') ? '#ff6c30'
      : key.includes('frost') || key.includes('cryo') || key.includes('slow') ? '#7ce8ff'
      : key.includes('light') || key.includes('ricochet') || key.includes('stun') ? '#ffe14a'
      : key.includes('poison') ? '#7dce6a'
      : key.includes('orbital') || key.includes('beam') ? '#54f0ff'
      : '#f0cb72';

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } finally {
    ctx.restore();
  }
}
