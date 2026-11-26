import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_TYPES} from '../src/shared.js';
import {RECIPES, findRecipe} from '../src/data/recipes.js';

function unorderedPairs(types) {
  const pairs = [];
  for (let left = 0; left < types.length; left += 1) {
    for (let right = left + 1; right < types.length; right += 1) {
      pairs.push([types[left], types[right]]);
    }
  }
  return pairs;
}

function parentKey(parents) {
  return [...parents].sort().join('+');
}

test('every unordered pair of different base types has exactly one recipe', () => {
  assert.ok(BASE_TYPES.length >= 2);
  assert.equal(new Set(BASE_TYPES).size, BASE_TYPES.length);
  assert.equal(BASE_TYPES.includes('hero'), false);

  const expected = unorderedPairs(BASE_TYPES.filter(type => type !== 'harvest'));
  for (const type of BASE_TYPES) assert.equal(findRecipe('harvest',type),null);
  assert.equal(expected.length, 15);
  assert.equal(RECIPES.length, expected.length);

  const byPair = new Map();
  for (const recipe of RECIPES) {
    assert.equal(Array.isArray(recipe.parents), true, `${recipe.id} parents`);
    assert.equal(recipe.parents.length, 2, `${recipe.id} must have two parents`);
    const [left, right] = recipe.parents;
    assert.notEqual(left, right, `${recipe.id} parents must differ`);
    assert.ok(BASE_TYPES.includes(left), `${recipe.id} parent ${left} is not a base type`);
    assert.ok(BASE_TYPES.includes(right), `${recipe.id} parent ${right} is not a base type`);
    const key = parentKey(recipe.parents);
    assert.equal(byPair.has(key), false, `more than one recipe for ${key}`);
    byPair.set(key, recipe);
  }

  for (const [left, right] of expected) {
    const key = parentKey([left, right]);
    const recipe = byPair.get(key);
    assert.ok(recipe, `missing recipe for ${key}`);
    const forward = findRecipe(left, right);
    const reverse = findRecipe(right, left);
    assert.equal(forward?.id, recipe.id, `findRecipe(${left}, ${right})`);
    assert.equal(reverse?.id, recipe.id, `findRecipe(${right}, ${left})`);
    assert.equal(forward, reverse);
    assert.equal(findRecipe(left, left), null);
    assert.equal(findRecipe(right, right), null);
  }

  assert.equal(byPair.size, expected.length);
});

test('recipe ids are unique', () => {
  const ids = RECIPES.map(recipe => recipe.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
    assert.ok(id.trim().length > 0);
    assert.notEqual(id, 'hero');
    assert.equal(BASE_TYPES.includes(id), false, `${id} collides with a base type`);
  }
});

test('no recipe uses the hero as a parent', () => {
  for (const recipe of RECIPES) {
    assert.equal(recipe.parents.includes('hero'), false, `${recipe.id} lists hero as a parent`);
  }
  for (const type of [...BASE_TYPES, 'hero']) {
    assert.equal(findRecipe('hero', type), null);
    assert.equal(findRecipe(type, 'hero'), null);
  }
});
