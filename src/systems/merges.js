// Merge planning. previewMerge is pure; mergeUnits is the only mutation.
// Merges are legal only while canPlan(state) is true (paused, or phase draft).
// The source slot is consumed and the target slot receives the result.
import { BASE_TYPES, canPlan, createUnit, emit } from '../shared.js';
import { HYBRID_RANK_MAX, findRecipe, getRecipe, isRecipeId } from '../data/recipes.js';
import { TOWERS } from '../data/towers.js';
import { t } from '../i18n.js';

export const PREVIEW_UNIT_ID = 'preview';

const BASE_LABELS = Object.freeze({
  bolt: Object.freeze({ en: 'Bolt', zh: '弩箭' }),
  fire: Object.freeze({ en: 'Fire', zh: '火焰' }),
  frost: Object.freeze({ en: 'Frost', zh: '冰霜' }),
  lightning: Object.freeze({ en: 'Lightning', zh: '闪电' }),
  poison: Object.freeze({ en: 'Poison', zh: '毒素' }),
  support: Object.freeze({ en: 'Support', zh: '支援' }),
});

// Reason codes stay stable. Each catalog key is the player-facing reason.
// empty_slot uses missingUnit, the line for two occupied slots.
const REASON_KEYS = Object.freeze({
  not_planning: 'notPlanning',
  invalid_slot: 'invalidSlot',
  same_slot: 'sameSlot',
  empty_slot: 'missingUnit',
  hero_protected: 'heroProtected',
  rank_mismatch: 'rankMismatch',
  rank_cap: 'maxRank',
  hybrid_locked: 'hybridMix',
  no_recipe: 'noRecipe',
  invalid_merge: 'invalidMerge',
});

// Sentence after the reason. A failed preview leads with the catalog reason.
const REASON_DETAIL = Object.freeze({
  not_planning: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  invalid_slot: Object.freeze({ en: 'Choose a slot in the two rows of five.', zh: '请选择两排五格中的格子。' }),
  same_slot: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  empty_slot: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  hero_protected: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
  rank_mismatch: Object.freeze({ en: 'Unequal ranks stay as they are.', zh: '不同阶会原样保留。' }),
  rank_cap: Object.freeze({ en: 'Same-type merges stop at rank 4.', zh: '同型合成到 4 阶为止。' }),
  hybrid_locked: Object.freeze({ en: 'A different type stays as it is.', zh: '不同的类型会原样保留。' }),
  no_recipe: Object.freeze({ en: 'Both units stay.', zh: '双方都保留。' }),
  invalid_merge: Object.freeze({ en: 'Nothing was changed.', zh: '没有改动。' }),
});

function reasonLead(key) {
  const en = t('en', key).trim();
  const zh = t('zh', key).trim();
  return {
    en: /[.!?]$/.test(en) ? en : `${en}.`,
    zh: /[。！？]$/.test(zh) ? zh : `${zh}。`,
  };
}

function reasonCopy(code) {
  const lead = reasonLead(REASON_KEYS[code]);
  const detail = REASON_DETAIL[code];
  return Object.freeze({
    en: `${lead.en} ${detail.en}`,
    zh: `${lead.zh}${detail.zh}`,
  });
}

// Stable reason codes. Preview description leads with that player-facing reason.
export const MERGE_REASONS = Object.freeze({
  not_planning: reasonCopy('not_planning'),
  invalid_slot: reasonCopy('invalid_slot'),
  same_slot: reasonCopy('same_slot'),
  empty_slot: reasonCopy('empty_slot'),
  hero_protected: reasonCopy('hero_protected'),
  rank_mismatch: reasonCopy('rank_mismatch'),
  rank_cap: reasonCopy('rank_cap'),
  hybrid_locked: reasonCopy('hybrid_locked'),
  no_recipe: reasonCopy('no_recipe'),
  invalid_merge: reasonCopy('invalid_merge'),
});

function textOf(entry) {
  return { en: entry.en, zh: entry.zh };
}

function fail(reason) {
  return { ok: false, reason, description: textOf(MERGE_REASONS[reason] || MERGE_REASONS.invalid_merge) };
}

function isSlotIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 10;
}

function validRank(unit) {
  return Number.isInteger(unit?.rank) && unit.rank >= 1 && unit.rank <= HYBRID_RANK_MAX;
}

function classify(unit) {
  if (!unit || typeof unit.type !== 'string') return 'invalid';
  if (unit.kind === 'hero' || unit.type === 'hero') return 'hero';
  if (unit.kind === 'hybrid' || isRecipeId(unit.type)) return isRecipeId(unit.type) ? 'hybrid' : 'invalid';
  if (BASE_TYPES.includes(unit.type)) return 'base';
  return 'invalid';
}

function displayName(type) {
  const named = TOWERS[type]?.name || getRecipe(type)?.name || BASE_LABELS[type];
  if (named?.en && named?.zh) return named;
  return { en: String(type), zh: String(type) };
}

function placeholder(type, rank, kind) {
  return { id: PREVIEW_UNIT_ID, kind, type, rank, upgrades: {}, cooldown: 0, kills: 0 };
}

// The first sentence names the result and its rank. The explanation follows.
function resultLead(name, rank) {
  return {
    en: `${name.en} at rank ${rank}.`,
    zh: `${name.zh}，${rank} 阶。`,
  };
}

function sameTypeDescription(type, rank) {
  const name = displayName(type);
  const next = rank + 1;
  const lead = resultLead(name, next);
  return {
    en: `${lead.en} Two rank ${rank} ${name.en} units become one rank ${next} ${name.en}. Same-type merges raise rank by one and stop at rank ${HYBRID_RANK_MAX}. The result is placed on the target slot and the source slot is cleared.`,
    zh: `${lead.zh}两个 ${rank} 阶${name.zh}合成为一个 ${next} 阶${name.zh}。同型合成升 1 阶，到 ${HYBRID_RANK_MAX} 阶为止。结果放在目标槽，来源槽清空。`,
  };
}

function hybridDescription(entry, rank, fromType, toType) {
  const left = displayName(fromType);
  const right = displayName(toType);
  const lead = resultLead(entry.name, rank);
  return {
    en: `${lead.en} ${left.en} + ${right.en} → ${entry.name.en} (rank ${rank}). ${entry.description.en} The hybrid keeps rank ${rank}; it does not gain a free rank. Both towers are consumed and the result is placed on the target slot.`,
    zh: `${lead.zh}${left.zh}＋${right.zh} → ${entry.name.zh}（${rank} 阶）。${entry.description.zh}杂交单位保持 ${rank} 阶，不会额外升阶。两座塔都会被消耗，结果放在目标槽。`,
  };
}

function planMerge(state, fromIndex, toIndex) {
  if (!state || !Array.isArray(state.slots) || state.slots.length !== 10) return fail('invalid_merge');
  if (!canPlan(state)) return fail('not_planning');
  if (!isSlotIndex(fromIndex) || !isSlotIndex(toIndex)) return fail('invalid_slot');
  if (fromIndex === toIndex) return fail('same_slot');
  const from = state.slots[fromIndex]?.unit;
  const to = state.slots[toIndex]?.unit;
  if (!from || !to) return fail('empty_slot');
  const fromClass = classify(from);
  const toClass = classify(to);
  if (fromClass === 'hero' || toClass === 'hero') return fail('hero_protected');
  if (fromClass === 'invalid' || toClass === 'invalid' || !validRank(from) || !validRank(to)) return fail('invalid_merge');
  if (from.type === to.type) {
    if (from.rank !== to.rank) return fail('rank_mismatch');
    if (from.rank >= HYBRID_RANK_MAX) return fail('rank_cap');
    const kind = fromClass === 'hybrid' ? 'hybrid' : 'tower';
    return { ok: true, unit: placeholder(from.type, from.rank + 1, kind), description: sameTypeDescription(from.type, from.rank), parents: null };
  }
  if (fromClass === 'hybrid' || toClass === 'hybrid') return fail('hybrid_locked');
  if (from.rank !== to.rank) return fail('rank_mismatch');
  const entry = findRecipe(from.type, to.type);
  if (!entry) return fail('no_recipe');
  return { ok: true, unit: placeholder(entry.id, from.rank, 'hybrid'), description: hybridDescription(entry, from.rank, from.type, to.type), parents: entry.parents };
}

export function previewMerge(state, fromIndex, toIndex) {
  const plan = planMerge(state, fromIndex, toIndex);
  if (!plan.ok) return { ok: false, reason: plan.reason, description: plan.description };
  return { ok: true, result: plan.unit, description: plan.description };
}

export function mergeUnits(state, fromIndex, toIndex) {
  const plan = planMerge(state, fromIndex, toIndex);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  if (!state.stats || typeof state.stats !== 'object' || !Array.isArray(state.events)) return { ok: false, reason: 'invalid_merge' };
  const unit = createUnit(state, plan.unit.type, plan.unit.rank, plan.unit.kind);
  state.slots[toIndex].unit = unit;
  state.slots[fromIndex].unit = null;
  state.stats.merges = (Number.isFinite(state.stats.merges) ? state.stats.merges : 0) + 1;
  const slot = state.slots[toIndex];
  const event = {
    x: slot.x,
    y: slot.y,
    from: fromIndex,
    to: toIndex,
    sourceId: unit.id,
    towerType: unit.type,
    kind: unit.kind,
    rank: unit.rank,
  };
  if (plan.parents) event.parents = [...plan.parents];
  emit(state, 'merge', event);
  return { ok: true, unit };
}
