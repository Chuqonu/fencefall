import test from 'node:test';
import assert from 'node:assert/strict';
import {createUnit} from '../src/shared.js';
import {createRun} from '../src/state.js';
import {RECIPES} from '../src/data/recipes.js';
import {TOWERS} from '../src/data/towers.js';
import {previewMerge} from '../src/systems/merges.js';

const MAX_CHARS = 160;
const HYBRID_RANK = 2;
const SOURCE = 0;
const TARGET = 1;

function characterCount(text) {
  return Array.from(text).length;
}

function pausedRun(runId) {
  const state = createRun({seed: 27, difficulty: 'normal', runId});
  state.phase = 'playing';
  state.paused = true;
  return state;
}

function place(state, index, type, rank, kind = 'tower') {
  state.slots[index].unit = createUnit(state, type, rank, kind);
}

function boardSnapshot(state) {
  return {
    slots: state.slots,
    units: state.slots.map(slot => slot.unit),
    unitText: state.slots.map(slot => JSON.stringify(slot.unit)),
    nextId: state.nextId,
    rng: state.rng
  };
}

function purityProblems(state, before, label) {
  const problems = [];
  if (state.slots !== before.slots) problems.push(`${label}: slots array changed`);
  before.units.forEach((unit, index) => {
    if (state.slots[index].unit !== unit) problems.push(`${label}: slot ${index} unit changed`);
    if (JSON.stringify(state.slots[index].unit) !== before.unitText[index]) {
      problems.push(`${label}: slot ${index} contents changed`);
    }
  });
  if (state.nextId !== before.nextId) problems.push(`${label}: nextId changed from ${before.nextId} to ${state.nextId}`);
  if (state.rng !== before.rng) problems.push(`${label}: rng changed from ${before.rng} to ${state.rng}`);
  return problems;
}

function includesRank(text, rank) {
  return new RegExp(`(?:^|\\D)${rank}(?:\\D|$)`).test(text);
}

function blurbProblems(description, name, rank, label) {
  const problems = [];
  const en = description?.en;
  const zh = description?.zh;
  if (typeof en !== 'string' || en.trim() === '') problems.push(`${label}: English description missing`);
  if (typeof zh !== 'string' || zh.trim() === '') problems.push(`${label}: Chinese description missing`);
  if (typeof en !== 'string' || typeof zh !== 'string') return problems;
  if (en === zh) problems.push(`${label}: description is not bilingual`);
  const enCount = characterCount(en);
  const zhCount = characterCount(zh);
  if (enCount > MAX_CHARS) problems.push(`${label}: English is ${enCount} characters`);
  if (zhCount > MAX_CHARS) problems.push(`${label}: Chinese is ${zhCount} characters`);
  if (!en.includes(name.en)) problems.push(`${label}: English omits result name ${name.en}`);
  if (!zh.includes(name.zh)) problems.push(`${label}: Chinese omits result name ${name.zh}`);
  if (!includesRank(en, rank)) problems.push(`${label}: English omits rank ${rank}`);
  if (!includesRank(zh, rank)) problems.push(`${label}: Chinese omits rank ${rank}`);
  return problems;
}

test('every paused recipe preview names the hybrid within 160 characters', () => {
  assert.ok(Array.isArray(RECIPES) && RECIPES.length >= 8);
  const problems = [];
  for (const recipe of RECIPES) {
    const label = recipe.id;
    const state = pausedRun(`merge-blurb-${label}`);
    assert.equal(state.paused, true, label);
    const [left, right] = recipe.parents;
    place(state, SOURCE, left, HYBRID_RANK, 'tower');
    place(state, TARGET, right, HYBRID_RANK, 'tower');
    const before = boardSnapshot(state);
    const preview = previewMerge(state, SOURCE, TARGET);
    if (preview.ok !== true) problems.push(`${label}: preview failed (${preview.reason})`);
    if (preview.result?.type !== recipe.id) problems.push(`${label}: result type ${preview.result?.type}`);
    if (preview.result?.kind !== 'hybrid') problems.push(`${label}: result kind ${preview.result?.kind}`);
    if (preview.result?.rank !== HYBRID_RANK) problems.push(`${label}: result rank ${preview.result?.rank}`);
    problems.push(...blurbProblems(preview.description, recipe.name, HYBRID_RANK, label));
    for (const lang of ['en','zh']) {
      assert.ok(recipe.description[lang].trim().length>0);
      assert.notEqual(preview.description[lang],recipe.description[lang]);
    }
    problems.push(...purityProblems(state, before, label));
  }
  assert.deepEqual(problems, []);
});

test('a paused same-type rank-up names the result and its new rank within 160 characters', () => {
  const type = 'bolt';
  const name = TOWERS[type].name;
  const state = pausedRun('merge-blurb-same-type');
  assert.equal(state.paused, true);
  place(state, SOURCE, type, 1, 'tower');
  place(state, TARGET, type, 1, 'tower');
  const before = boardSnapshot(state);
  const preview = previewMerge(state, SOURCE, TARGET);
  const problems = [];
  if (preview.ok !== true) problems.push(`same-type: preview failed (${preview.reason})`);
  if (preview.result?.type !== type) problems.push(`same-type: result type ${preview.result?.type}`);
  if (preview.result?.kind !== 'tower') problems.push(`same-type: result kind ${preview.result?.kind}`);
  if (preview.result?.rank !== 2) problems.push(`same-type: result rank ${preview.result?.rank}`);
  problems.push(...blurbProblems(preview.description, name, 2, 'same-type'));
  problems.push(...purityProblems(state, before, 'same-type'));
  assert.deepEqual(problems, []);
});
