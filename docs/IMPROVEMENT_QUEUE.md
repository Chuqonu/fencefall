# Improvement queue

Lead integration stays on `main`. Parallel workers use isolated snapshots and unique paths. Do not edit another owner's file in the same cycle.

## Checkpoint

Published baseline includes readable enemy sprites, the phone details drawer anchored to the battlefield, live-save validity for poison ticks and offscreen projectiles, and the coordinator's acceptance notes. Active GitHub CI is not installed; `docs/ci.example.yml` is the template.

## Cycle 2 ownership

Workers may not change `src/engine.js`, `src/boot.js`, `src/state.js`, `src/shared.js`, `src/styles.css`, or `src/ui/shell.js`. Those stay with the lead so the phone drawer and controller stay stable.

| Id | Outcome | Paths |
| --- | --- | --- |
| c2-01 | Distinct enemy silhouettes inside the fixed pixel boxes | `src/render/enemies.js` |
| c2-02 | Hybrids readable apart from their parents | `src/render/defenders.js` |
| c2-03 | Fence and field read clearly in portrait | `src/render/world.js` |
| c2-04 | Hits, shots, and impacts read at a glance | `src/render/effects.js` |
| c2-05 | Status and target cues on the existing renderer | `src/render/renderer.js` |
| c2-06 | Procedural cues for hit, merge, draft, fence, result | `src/audio.js` |
| c2-07 | Draft cards state the actual choice | `src/ui/build-panel.js` |
| c2-08 | First session can start, resume, and import | `src/ui/meta-panel.js` |
| c2-09 | Terminology consistent in English and Chinese | `src/i18n.js` |
| c2-10 | Merge preview text matches the result | `src/systems/merges.js` |
| c2-11 | Hero upgrades do what their text says | `src/systems/hero.js` |
| c2-12 | Equipment and permanents apply once | `src/systems/progression.js` |
| c2-13 | Tower blurbs match their stats | `src/data/towers.js` |
| c2-14 | Hybrid blurbs match their mechanics | `src/data/recipes.js` |
| c2-15 | Enemy roles stay readable without new lanes | `src/data/enemies.js` |
| c2-16 | Boss and wave identity without a retune | `src/systems/waves.js` |
| c2-17 | Described hybrid effects that currently do nothing | `src/systems/combat.js` |
| c2-18 | Spawn stays center-weighted and drift stays continuous | `src/systems/movement.js` |
| c2-19 | Draft offers stay three real choices | `src/systems/drafts.js` |
| c2-20 | Status ticks stay saveable | `src/systems/status.js` |
| c2-21 | Saves round-trip in more live phases | `tests/campaign-save.test.mjs` |
| c2-22 | Seeded invariants beyond the existing suite | `tests/invariants.test.mjs` |

## Integration order

Art and copy can land together. Combat, waves, drafts, hero, and progression land only after `npm test` on the integrated tree. Do not retune to force wins. Phone drawer behavior is already verified and is not in this cycle.

## Cycle 3 ownership

Baseline `a65515b`. Manifest `work/fencefall/orchestrator/batch-cycle3.json`. 21 isolated workers, model `grok-4.7-build-fast`, effort `xhigh`. Lead keeps `src/engine.js`, `src/boot.js`, `src/state.js`, and `src/shared.js`.

| Id | Outcome | Paths |
| --- | --- | --- |
| c3-01 | Chain jumps roll their own crit | `src/systems/combat.js`, `tests/hybrid-chain.test.mjs` |
| c3-02 | A draft offers a type that is not on the board | `src/systems/drafts.js`, `tests/draft-variety.test.mjs` |
| c3-03 | Fence art changes as HP falls | `src/render/world.js` |
| c3-04 | Status tint and the current wave hint | `src/render/renderer.js` |
| c3-05 | Pierce, splash, and chain look different | `src/render/effects.js` |
| c3-06 | Rank marks on defenders | `src/render/defenders.js` |
| c3-07 | Enraged boss reads on the sprite | `src/render/enemies.js` |
| c3-08 | Draft cards say whether the type is new | `src/ui/build-panel.js` |
| c3-09 | How to play in four beats | `src/ui/meta-panel.js` |
| c3-10 | Draft badge strings | `src/i18n.js` |
| c3-11 | Long HUD text does not shrink the field | `src/ui/shell.js`, `src/styles.css` |
| c3-12 | Paying more than 64 runs does not pay twice | `tests/settlement-memory.test.mjs` |
| c3-13 | Every hero upgrade changes its stat | `tests/hero-effects.test.mjs` |
| c3-14 | Spawn stays center-weighted | `tests/spawn-shape.test.mjs` |
| c3-15 | Merge text leads with the result | `src/systems/merges.js` |
| c3-16 | Hybrid text leads with the fantasy | `src/data/recipes.js` |
| c3-17 | Fence hits cut through shot noise | `src/audio.js` |
| c3-18 | Current wave hint is on the director | `src/systems/waves.js` |
| c3-19 | Poison and burn together stay saveable | `src/systems/status.js`, `tests/dual-status.test.mjs` |
| c3-20 | Tower text leads with the role | `src/data/towers.js` |
| c3-21 | Fence contact stays the only enemy damage | `tests/fence-contact.test.mjs` |

## Log

- Cycle 1 delivered the playable campaign, compact drafts, resume, phone drawer, readable enemy boxes, and the live-save fix.
- Cycle 2 ran 22 isolated Fast/xhigh workers. All 22 returned. Integrated art, audio, copy, boss-wave flag, paid-run memory, and two new test files. 66 tests passed. Held back `src/systems/combat.js`: chain jumps would re-roll crits and change seeded fights. Hero, movement, drafts, status, and the meta panel were already correct and stayed as they were.
- Cycle 3 launched at 2026-11-14 13:41 Asia/Shanghai from `a65515b`: 21 workers, manifest `batch-cycle3.json`. Chain crit is an explicit owned task because the recipes already promise it.
- First cycle 3 slice integrated while 10 workers were still running: wave hint, merge lead sentence, hybrid and tower fantasy lines, draft badge strings, boss enrage colors, rank chevrons, and four new tests. 81 tests passed. Enemy boxes unchanged.
- Second slice: draft variety, fence wear, status tint, shot shapes, draft badges, four-beat how-to-play, quieter repeated shots, fence-contact tests, and a capped HUD message that does not cover the meters. 88 tests passed. Phone battle at 390×844 stayed 340×604, and Details still receives the tap. `c3-01-chain-crit` was still running, so `src/systems/combat.js` was not touched.
