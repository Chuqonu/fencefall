/**
 * Fencefall v5 — PvZ2-Style Sharp Cel-Shaded Wall Gunner (Hero) Vector Renderer.
 *
 * Bottom-center anchor (x, y) places the Gunner's boots & contact shadow right on
 * the central Commander Gunnery Platform. Supports smooth continuous breathing,
 * fluttering crimson scarf, 360° articulated weapon tracking (`options.aimAngle`),
 * spring kickback (`options.recoil`), starburst muzzle flash, and live visual weapon
 * evolutions as Gun Mods & Auto Skills are unlocked.
 */

const HERO_W = 50;
const HERO_H = 54;
const INK = '#11171d';

function isRichCtx(ctx) {
  return Boolean(
    ctx
    && typeof ctx.beginPath === 'function'
    && typeof ctx.arc === 'function'
    && typeof ctx.ellipse === 'function'
    && typeof ctx.createLinearGradient === 'function'
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

export function defenderSize(unit) {
  if (unit && (unit.kind === 'hero' || unit.type === 'hero')) {
    return {width: HERO_W, height: HERO_H};
  }
  return {width: 40, height: 40};
}

function drawMuzzleStar(ctx, x, y, radius, tint) {
  ctx.save();
  ctx.translate(x, y);
  // Outer luminous burst
  const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, radius * 1.45);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.42, tint);
  glow.addColorStop(1, 'rgba(255, 190, 70, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
  ctx.fill();

  // Sharp PvZ2 cartoon 6-point starburst
  ctx.beginPath();
  const spikes = 6;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const a = (i * Math.PI) / spikes;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff9d8';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

function drawHeroGunner(ctx, unit, x, y, opts) {
  const time = Number.isFinite(opts.time) ? opts.time : 0;
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const flash = Number.isFinite(opts.flash) && opts.flash > 0 ? Math.min(1, opts.flash) : 0;
  const recoil = Number.isFinite(opts.recoil) ? Math.max(0, Math.min(1, opts.recoil)) : 0;
  const aimAngle = Number.isFinite(opts.aimAngle) ? opts.aimAngle : -Math.PI / 2;
  const upg = (opts.upgrades && typeof opts.upgrades === 'object') ? opts.upgrades : (unit.upgrades || {});

  const hasMulti = (upg.volley || 0) > 0 || (upg.split_shot || 0) > 0;
  const hasFire = (upg.shrapnel || 0) > 0 || (upg.napalm || 0) > 0;
  const hasFrost = (upg.frostbite || 0) > 0 || (upg.cryo_barrage || 0) > 0;
  const hasArc = (upg.ricochet || 0) > 0 || (upg.orbital_beam || 0) > 0;
  const totalLevels = Object.values(upg).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const eliteTrim = totalLevels >= 6;

  const bob = Math.sin(time * 3.4) * 1.3;
  const sway = Math.cos(time * 2.1) * 0.6;
  const aimCos = Math.cos(aimAngle);
  const aimSin = Math.sin(aimAngle);
  const kickX = -aimCos * recoil * 3.6;
  const kickY = -aimSin * recoil * 2.4;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // 1. Soft Ground Contact Shadow
  ctx.fillStyle = 'rgba(6, 10, 14, 0.52)';
  ctx.beginPath();
  ctx.ellipse(0, -3, 18, 7.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle Hero Commander Aura when heavily upgraded
  if (totalLevels >= 4) {
    const auraAlpha = 0.14 + 0.08 * Math.sin(time * 4.2);
    const auraColor = hasArc ? `rgba(96, 236, 255, ${auraAlpha})`
      : hasFire ? `rgba(255, 138, 56, ${auraAlpha})`
      : hasFrost ? `rgba(128, 232, 255, ${auraAlpha})`
      : `rgba(248, 206, 94, ${auraAlpha})`;
    ctx.strokeStyle = auraColor;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, -3, 21.5, 8.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 2. Fluttering Crimson Commander Scarf (behind torso)
  const wave1 = Math.sin(time * 5.6) * 3.2;
  const wave2 = Math.cos(time * 6.8) * 2.6;
  ctx.save();
  ctx.translate(kickX * 0.5, bob * 0.8 + kickY * 0.5);
  const scarfGrad = ctx.createLinearGradient(-16, -24, -22, -6);
  scarfGrad.addColorStop(0, '#e8464c');
  scarfGrad.addColorStop(1, '#981e28');
  ctx.fillStyle = scarfGrad;
  ctx.beginPath();
  ctx.moveTo(-6, -25);
  ctx.quadraticCurveTo(-15 + wave1 * 0.5, -21, -21 + wave1, -12 + wave2 * 0.5);
  ctx.lineTo(-15 + wave2, -9 + wave1 * 0.3);
  ctx.quadraticCurveTo(-10, -16, -3, -21);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();

  // 3. Sturdy Armored Tactical Boots & Legs
  for (const side of [-1, 1]) {
    const lx = side * 6.5;
    // Armored shin + boot
    const bootGrad = ctx.createLinearGradient(lx - 4, -15, lx + 4, -3);
    bootGrad.addColorStop(0, '#465866');
    bootGrad.addColorStop(1, '#1e2830');
    rRect(ctx, lx - 4.4, -14.5, 8.8, 11.5, 3.2);
    ctx.fillStyle = bootGrad;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();

    // Brass knee-pad highlight
    ctx.fillStyle = eliteTrim ? '#f4cc62' : '#7b92a2';
    rRect(ctx, lx - 3, -13.2, 6, 3.6, 1.5);
    ctx.fill();
  }

  // 4. Torso Armor & Brass Shoulder Pauldrons
  ctx.save();
  ctx.translate(sway + kickX * 0.7, bob + kickY * 0.7);

  // Chest cuirass (3-tone cel shaded steel blue)
  const torsoGrad = ctx.createLinearGradient(-12, -31, 12, -13);
  torsoGrad.addColorStop(0, '#4e7898');
  torsoGrad.addColorStop(0.55, '#2b4a62');
  torsoGrad.addColorStop(1, '#182b3a');
  rRect(ctx, -11.5, -30, 23, 18.5, 6);
  ctx.fillStyle = torsoGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.0;
  ctx.stroke();

  // Tactical Utility Belt & Brass Buckle
  ctx.fillStyle = '#3b2c20';
  ctx.fillRect(-10.5, -16, 21, 4.2);
  ctx.fillStyle = '#f4cb62';
  rRect(ctx, -3.5, -16.4, 7, 5, 1.4);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Glowing chest power core (reflects strongest Auto Skill element!)
  const coreColor = hasArc ? '#62f2ff' : hasFire ? '#ff7c34' : hasFrost ? '#86eeff' : '#f8d264';
  ctx.fillStyle = '#121d24';
  ctx.beginPath();
  ctx.arc(0, -22.5, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(0, -22.5, 2.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-0.8, -23.3, 1.0, 0, Math.PI * 2);
  ctx.fill();

  // Left & Right Gold/Brass Shoulder Pauldrons
  for (const side of [-1, 1]) {
    const px = side * 12.2;
    const py = -25.5;
    const pGrad = ctx.createLinearGradient(px - 4, py - 5, px + 4, py + 5);
    pGrad.addColorStop(0, '#fae08a');
    pGrad.addColorStop(0.5, '#d69c36');
    pGrad.addColorStop(1, '#7c5116');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.ellipse(px, py, 5.2, 6.2, side * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.9;
    ctx.stroke();
    // Specular rim dot
    ctx.fillStyle = 'rgba(255, 252, 232, 0.72)';
    ctx.beginPath();
    ctx.ellipse(px - side * 1.2, py - 2.2, 1.8, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crimson Neck Scarf Collar
  rRect(ctx, -8.5, -31.5, 17, 5, 2.5);
  ctx.fillStyle = '#d93d44';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 5. Oversized Expressive PvZ2-Style Combat Helmet & Glowing Visor
  const headX = aimCos * 1.6;
  const headY = -39.5 + aimSin * 0.8;

  // Helmet Dome (glossy cel-shaded tactical steel-blue with warm gold brow trim)
  const helmGrad = ctx.createRadialGradient(headX - 4, headY - 5, 2, headX, headY, 13.5);
  helmGrad.addColorStop(0, '#78a8c8');
  helmGrad.addColorStop(0.55, '#3b6482');
  helmGrad.addColorStop(1, '#1c3346');
  ctx.fillStyle = helmGrad;
  ctx.beginPath();
  ctx.arc(headX, headY, 11.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.1;
  ctx.stroke();

  // Golden Helmet Crest Stripe
  ctx.fillStyle = '#f6cf66';
  ctx.beginPath();
  ctx.moveTo(headX - 2.6, headY - 11.2);
  ctx.lineTo(headX + 2.6, headY - 11.2);
  ctx.lineTo(headX + 1.8, headY - 3.5);
  ctx.lineTo(headX - 1.8, headY - 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.stroke();

  // Glossy Specular Highlight on Helmet Crown
  ctx.fillStyle = 'rgba(235, 250, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(headX - 4.8, headY - 5.2, 3.2, 1.7, -0.55, 0, Math.PI * 2);
  ctx.fill();

  // Tactical Glowing Visor Goggles (points subtly toward aim direction!)
  const visorX = headX + aimCos * 2.2;
  const visorY = headY - 0.5 + aimSin * 1.4;
  rRect(ctx, visorX - 7.8, visorY - 3.4, 15.6, 6.8, 3.2);
  const vGrad = ctx.createLinearGradient(visorX - 7, visorY - 3, visorX + 7, visorY + 3);
  vGrad.addColorStop(0, '#9cf8ff');
  vGrad.addColorStop(0.5, '#38c8ec');
  vGrad.addColorStop(1, '#166e92');
  ctx.fillStyle = vGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Visor diagonal glossy glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.moveTo(visorX - 4.8, visorY - 2.2);
  ctx.lineTo(visorX - 1.8, visorY - 2.2);
  ctx.lineTo(visorX - 3.5, visorY + 2.1);
  ctx.lineTo(visorX - 6.0, visorY + 2.1);
  ctx.closePath();
  ctx.fill();

  // 6. ARTICULATED ROTATING HEAVY ASSAULT CANNON / RAILGUN
  ctx.save();
  ctx.translate(6.5, -23.5);
  ctx.rotate(aimAngle);
  const gunBack = -recoil * 5.2;

  // Heavy Assault Rifle / Railgun Receiver Body
  const recGrad = ctx.createLinearGradient(gunBack - 4, -5.5, gunBack - 4, 5.5);
  recGrad.addColorStop(0, '#96aebc');
  recGrad.addColorStop(0.45, '#526876');
  recGrad.addColorStop(1, '#243038');
  rRect(ctx, gunBack - 6, -5.2, 22, 10.4, 3);
  ctx.fillStyle = recGrad;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.9;
  ctx.stroke();

  // Brass / Gold tactical receiver rail
  ctx.fillStyle = '#f2c862';
  ctx.fillRect(gunBack - 2, -4.4, 13, 2.2);

  // Extended Gun Barrel(s) — evolves visually with Volley/Split!
  const barrelLen = hasMulti ? 26 : 24;
  if (hasMulti) {
    // Twin heavy barrels
    for (const by of [-3.3, 1.1]) {
      rRect(ctx, gunBack + 12, by, barrelLen - 10, 3.0, 1.2);
      ctx.fillStyle = '#6c8492';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    // Sleek single heavy rail barrel
    rRect(ctx, gunBack + 12, -2.5, barrelLen - 10, 5.0, 1.5);
    ctx.fillStyle = '#738b9a';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Elemental Evolution Visual Attachments on the Cannon!
  if (hasFire) {
    // Glowing orange thermal cooling vents
    ctx.fillStyle = '#ff7228';
    ctx.fillRect(gunBack + 14, -1.2, 7, 2.4);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(gunBack + 15.5, -0.6, 4, 1.2);
  }
  if (hasFrost) {
    // Gleaming cyan cryo fins flanking barrel
    ctx.fillStyle = '#7ceeff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(gunBack + 13, -4.8);
    ctx.lineTo(gunBack + 21, -7.2);
    ctx.lineTo(gunBack + 20, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gunBack + 13, 4.8);
    ctx.lineTo(gunBack + 21, 7.2);
    ctx.lineTo(gunBack + 20, 3.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (hasArc) {
    // Electric cyan/gold rail coils near muzzle
    ctx.strokeStyle = '#62f2ff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(gunBack + 18, -4.5);
    ctx.lineTo(gunBack + 24, -4.5);
    ctx.moveTo(gunBack + 18, 4.5);
    ctx.lineTo(gunBack + 24, 4.5);
    ctx.stroke();
  }

  // Heavy Muzzle Brake Tip
  rRect(ctx, gunBack + barrelLen, -3.8, 4.5, 7.6, 1.4);
  ctx.fillStyle = '#2d3a42';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Armored Glove Gripping the Gun
  ctx.fillStyle = '#d49a38';
  ctx.beginPath();
  ctx.arc(gunBack + 2, 3.2, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Crisp Cartoon Muzzle Flash Starburst on Shot!
  if (recoil > 0.25) {
    const flashSize = 9 + recoil * 9;
    const flashTint = hasFire ? '#ff7c32' : hasFrost ? '#7aefff' : hasArc ? '#ffe858' : '#ffb848';
    drawMuzzleStar(ctx, gunBack + barrelLen + 7, 0, flashSize, flashTint);
  }

  ctx.restore(); // end gun rotation
  ctx.restore(); // end torso bob

  // Subtle warm radial muzzle bounce glow
  if (flash > 0.05) {
    ctx.save();
    const glow = ctx.createRadialGradient(0, -28, 2, 0, -28, 22);
    glow.addColorStop(0, `rgba(255, 244, 198, ${(flash * 0.28).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(255, 244, 198, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -28, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/** Crisp vector fallback if a legacy tower unit is ever drawn directly by a test. */
function drawLegacyTurret(ctx, unit, x, y, opts) {
  const scale = Number.isFinite(opts.scale) && opts.scale > 0 ? opts.scale : 1;
  const type = String(unit.type || 'bolt').toLowerCase();
  const colorMap = {
    bolt: '#f2d56a',
    fire: '#ff6c30',
    frost: '#7ce8ff',
    lightning: '#ffe14a',
    poison: '#7dce6a',
    support: '#68d8c4',
  };
  const accent = colorMap[type] || '#f0cb72';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(0, -3, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  rRect(ctx, -12, -26, 24, 22, 6);
  ctx.fillStyle = '#334652';
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -16, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawDefender(ctx, unit, x, y, options = {}) {
  if (!ctx || !unit || typeof unit !== 'object') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const opts = options || {};

  if (!isRichCtx(ctx)) {
    const sz = defenderSize(unit);
    ctx.save?.();
    ctx.fillStyle = '#f0cb72';
    ctx.fillRect?.(Math.round(x - sz.width / 2), Math.round(y - sz.height), sz.width, sz.height);
    ctx.restore?.();
    return;
  }

  if (unit.kind === 'hero' || unit.type === 'hero') {
    drawHeroGunner(ctx, unit, x, y, opts);
  } else {
    drawLegacyTurret(ctx, unit, x, y, opts);
  }
}
