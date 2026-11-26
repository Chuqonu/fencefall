// Reference encounter: armored lead, two targets behind it, three nearby allies.
// Score is sustained damage plus allied damage gained or preserved by control.
export function encounterPower(s) {
  const hits = (1 + (s.pierce||0)*0.65 + (s.chain||0)*0.75 + (s.splash||0)/48) * (1+(s.multishot||0)*0.8);
  const impact = s.damage/s.interval * (1+s.critChance*(s.critMultiplier-1)) * (0.65+0.35*(s.armorPen||0));
  const dot = (s.burn?.dps||0) + (s.poison?.dps||0)*(s.poison?.maxStacks||0)*0.7;
  const reactions = 1 + (s.thermalShock||0)*0.7 + (s.poisonDetonate||0)*2 + (s.execute?0.14:0) + (s.fence_focus?0.12:0);
  const aura = s.aura ? 75*(s.aura.damage+s.aura.haste) : 0;
  const exposure = 50*(s.brittle?.power||0) + (s.slow ? 18*(1-s.slow.factor) : 0) + 18*(s.stun?.duration||0)*(s.stun?.chance||1);
  const area = (s.cloud ? 3*(s.cloud.dps+s.cloud.poison.dps*2+10) : 0) + (s.corpseExplode ? 45*s.corpseExplode.hpRatio*3 : 0);
  // Time in reach from a rear slot before fence contact; reveal recovers lost ally fire.
  const reach = (s.range - 100) / 190;
  const reveal = s.revealRadius ? 75 * 0.18 : 0;
  return reach*(hits*(impact*reactions+dot+exposure) + aura + area + (s.knockback||0)*0.5) + reveal;
}
