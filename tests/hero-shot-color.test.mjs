import test from 'node:test';
import assert from 'node:assert/strict';
import {projectileColors} from '../src/render/renderer.js';

const HERO = {main: '#c44a56', core: '#fff0c0', edge: '#3c1018'};

test('a hero shot uses crimson instead of the Rivet bolt', () => {
  const ink = projectileColors({tags: ['hero', 'hero'], towerType: 'hero', x: 180, y: 200});
  assert.equal(ink.kind, 'hero');
  assert.deepEqual({main: ink.main, core: ink.core, edge: ink.edge}, HERO);
  assert.notEqual(ink.main, '#f2d56a');
});

test('barbed quills keep the hero body and leave the poison color as an accent', () => {
  const ink = projectileColors({tags: ['hero', 'hero', 'poison'], towerType: 'hero', x: 180, y: 200});
  assert.equal(ink.kind, 'hero');
  assert.equal(ink.main, HERO.main);
  assert.notEqual(ink.main, '#6aaa3a');
});

test('tower shots keep their own colors', () => {
  assert.equal(projectileColors({tags: ['bolt'], towerType: 'bolt'}).main, '#f2d56a');
  assert.equal(projectileColors({tags: ['fire'], towerType: 'fire'}).main, '#e25a2a');
  assert.equal(projectileColors({tags: ['poison'], towerType: 'poison'}).main, '#6aaa3a');
  assert.equal(projectileColors({tags: ['frost'], towerType: 'frost'}).main, '#9ed8ea');
  assert.equal(projectileColors({tags: ['lightning'], towerType: 'lightning'}).main, '#ffe14a');
  assert.equal(projectileColors({tags: ['support'], towerType: 'support'}).main, '#f0d78a');
});
