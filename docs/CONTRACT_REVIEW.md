# Fencefall contract review (worker 24)

Pre-integration review of this checkpoint against `CONTRACT.md` and `GAME_BRIEF.md`. The playable game is not assembled. This document records scaffold facts, missing semantics, and lead fixes. It does not certify balance, browser play, or a finished build.

## Method

Read in this workspace: `CONTRACT.md`, `GAME_BRIEF.md`, `src/shared.js`, `src/state.js`, `src/engine.js`, `src/boot.js`, `src/styles.css`, `index.html`, `package.json`, `tests/smoke.test.mjs`, `scripts/serve.mjs`.

`node --check` passed for `src/shared.js`, `src/state.js`, `src/engine.js`, and `src/boot.js`. A local Node probe imported `createRun`, `createProfile`, `advance`, `setSpeed`, `exportRun`, `emit`, `canPlan`, `slotGeometry`, `hitSlot`, `distance`, `random`, and `DIFFICULTIES`. No browser, preview server, GitHub, or worker module was executed. Domain files are absent on purpose; hazards below that name those files are integration risks, not observed runtime failures.

## What this checkpoint actually contains

Present and lead-owned: `src/shared.js`, `src/state.js`, `src/engine.js`, `src/boot.js`, `index.html`, `package.json`, `tests/smoke.test.mjs`. Also present: `src/styles.css` (worker 16 will replace it), `scripts/serve.mjs`.

Absent, so untested here: `src/systems/*`, `src/data/*`, `src/render/*`, `src/ui/*`, `src/i18n.js`, `src/audio.js`, `src/storage.js`, `tests/simulation.test.mjs`, `tests/progression.test.mjs`, `scripts/balance.mjs`, `scripts/build.mjs`, `.github/workflows/ci.yml`, `README.md`, `docs/BALANCE_METHOD.md`, `docs/DELIVERY.md`, `package-lock.json`, `.gitignore`.

`package.json` already calls `node scripts/build.mjs`. That file is not in the snapshot. `npm test` currently matches only `tests/smoke.test.mjs`.

The scaffold boot is a placeholder rectangle field. `CONTRACT.md` says the placeholder shell is not acceptance.

## Observed scaffold facts

### Geometry is consistent and leaves a real rear-range floor

`slotGeometry` matches the contract. Probed centers:

| Index | Row | Center | Box top–bottom |
| --- | --- | --- | --- |
| 0–4 | front | y=508, x=36+72·col | top 472, bottom 544 |
| 5–9 | rear | y=592, x=36+72·col | top 556, bottom 628 |
| 7 | rear center | (180, 592) | hero spawn slot |

Probed distances from slot centers to the fence line `y=450`:

- Rear center to fence: **142 px**.
- Front center to fence: **58 px**.
- Rear center to a stopped enemy at `(180, 438)` (radius 12): **154 px**.
- Rear center to a stopped enemy at `(14, 438)`: **≈226.4 px**.
- Front center to that edge enemy: **≈180.2 px**.
- Rear center to front center: **84 px**. Neighboring front slot: **≈110.6 px**. Far front corner: **≈166.7 px**.
- Slot 0 to slot 9: **300 px**.
- Horizontal gutter between slots: **8 px**. Vertical gap between rows: **12 px**. `hitSlot` on the gutter returns **-1**.

Enemy centers are specified to stop at `y <= fenceY - radius`, so bodies stay above the fence line and never enter slot boxes (front top is 472). That supports fence-only attacks if combat does not invent defender HP.

`src/boot.js` paints the fence as a 12 px bar from y=450 to y=462. Front slots start at 472. There is a 10 px band between that bar and the slots. World art should paint the ground through that band so the fence still reads as immediately in front of the defenders.

Rank must not be the thing that makes rear towers useful. A rear range of 142 px or less never crosses the fence line. Lead should reject catalog rows below these floors:

- Hero and rear-usable towers: range **≥ 210** (from slot 7 this reaches most of the center-weighted stop line; the extreme x=14 / x=346 edges stay outside and that is acceptable).
- Front towers: range **≥ 100** in-column, **≥ 180** if the tower is meant to cover the fence width.
- Support aura **120** covers the same column and neighbors. Aura **180** from rear center covers the whole defender block (far corner is 167). Values above that are global and should be capped in combat.

### `DIFFICULTIES.fence` is absolute HP

Contract prose calls fence a multiplier. `createRun` assigns `DIFFICULTIES[difficulty].fence` directly to `fence.hp` and `fence.maxHp`. Probed normal fence value is **600**. The table is:

| Id | Health | Speed | Damage | Count | Reward | Fence HP | Names |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 0.8 | 0.9 | 0.75 | 0.9 | 1 | 650 | Easy / 轻松 |
| normal | 1 | 1 | 1 | 1 | 1.4 | 600 | Normal / 标准 |
| hard | 1.3 | 1.08 | 1.25 | 1.1 | 1.9 | 570 | Hard / 困难 |
| nightmare | 1.65 | 1.15 | 1.5 | 1.2 | 2.5 | 540 | Nightmare / 噩梦 |

Treat `fence` as absolute HP. Treat `health`, `speed`, `damage`, `count`, and `reward` as dimensionless multipliers. Do not multiply fence by 600 again. `getProfileBonuses().fence` is extra pixels on top of this absolute value, applied once (see profile init below).

`Object.freeze(DIFFICULTIES)` does not freeze nested records. Probed `Object.isFrozen(DIFFICULTIES.easy) === false`. A worker can mutate `DIFFICULTIES.easy.health` for every later caller. Lead fix in `src/shared.js`: deep-freeze `ARENA`, each difficulty, each `name`, and `BASE_TYPES` contents (already a frozen array of strings).

There is no second difficulty table. i18n keys `easy` / `normal` / `hard` / `nightmare` must match these names or the UI will disagree with `localize(DIFFICULTIES[id].name)`.

### `emit` lets payload fields replace the event name

`src/shared.js` pushes `{type, time: state.time, ...data}`. The probe called `emit(state, 'hit', {type:'burn', time:999, x:1})` and stored `{type:'burn', time:999, x:1}`.

Combat's `damageEnemy` options include `type`. The natural call `emit(state, 'hit', {type: options.type, damage, x, y})` stores a burn/bolt event that audio will not recognize. Audio and VFX listen for `shot`, `hit`, `kill`, `fence_hit`, `merge`, `draft`, `victory`, `defeat`, and `ui`.

Lead fix in `src/shared.js`:

```js
state.events.push({...data, type, time: state.time});
```

Emitters still must not put gameplay meaning in `type` or `time`. Use `towerType`, `statusType`, and `damageType`. The 400-event trim keeps the newest events and drops the oldest. `advance` can run 45 steps in one frame at 3× (probe below). A once-per-frame `takeEvents` can lose an earlier `victory` or `draft` event. Lead should either drain events at the end of each `step` into a frame queue, or reserve terminal event types when trimming. Gameplay must not read `state.events`.

### Clock cap is real and will fool headless callers

`advance` adds `min(realDt, 0.25) * state.speed` and then runs at most 90 steps of `STEP` (1/60). Probe on a fresh run:

| Call | Result |
| --- | --- |
| `advance(state, 1)` at 1× | tick 15, time 0.25, accumulator 0 |
| `advance(state, 10)` at 1× | tick 15, time 0.25, accumulator 0 |
| `advance(state, 1)` at 1.5× | tick 22, time ≈0.366667, accumulator ≈0.00833333 |
| `advance(state, 1)` at 3× | tick 45, time 0.75, accumulator 0 |

`advance(state, largeNumber)` does not simulate that many seconds. The 90-step cap is unreachable while speed stays in `{1, 1.5, 3}` and the wall cap stays 0.25 (maximum 45 steps). It becomes active if a caller pre-multiplies delta by speed. Callers pass wall-clock seconds only.

At 1.5× the 0.25 s chunk is 0.375 sim seconds, which is 22.5 steps. Remainder stays in `accumulator` (half a step). Invariance checks should compare equal `tick` counts, or the same state object fed equal sim time, and allow a one-step accumulator remainder. Do not require `accumulator === 0` after an arbitrary 1.5× slice.

`setSpeed` ignores values other than 1, 1.5, and 3. The smoke test locks this: `advance(STEP)` once yields tick 1; after `setSpeed(3)`, `advance(STEP)` yields tick 4; `setSpeed(2)` leaves speed at 3. `advance` itself does not re-validate `state.speed`. A corrupt save with `speed: 100` would multiply the wall cap until the 90-step ceiling drops time. `loadRun` must allow only 1, 1.5, and 3.

While `phase !== 'playing'` or either pause flag is set, `advance` zeros `accumulator` and returns. Partial steps are discarded. Smoke covers user pause. It does not cover `hiddenPaused` or `phase: 'draft'`.

Inside the while loop, `step`'s early return still consumes one `STEP` of accumulator. The loop breaks only when `phase !== 'playing'`. Setting `paused` or `hiddenPaused` in the middle of `step` burns the rest of the frame as empty steps. Domain systems should not write those flags to mean "stop this frame"; the engine guard is the stop switch. Draft and placing freeze by `phase`, not by `paused`.

`step` adds `dt` to `state.time` and increments `tick` before any system runs. Systems must not add time again. With the current scaffold, `step` does not call systems yet. Lead owns that wiring.

Recommended body of `step` after the existing guard:

1. `state.time += dt`; `state.tick += 1`.
2. `updateWaves(state, dt)`.
3. `updateMovement(state, dt)`.
4. `updateStatuses(state, dt, damageEnemy)`.
5. `updateCombat(state, dt)`.
6. Engine cleanup once: remove enemies with `dead` or `hp <= 0`; remove projectiles with `life <= 0`; remove expired clouds if that schema exists.
7. Clamp `fence.hp` to `[0, maxHp]`. If `fence.hp <= 0`, set `phase = 'defeat'`.
8. Else if `!state.endless && director.done && director.queue.length === 0 && no living enemy`, set `phase = 'victory'`.
9. If `phase === 'playing'`, `updateDrafts(state)` once.
10. Do not settle currency inside `step`. The controller settles once when phase first becomes victory or defeat, then saves.

Victory and defeat are engine-owned. Waves set `director.done` only after the last scheduled enemy has actually spawned. Combat does not set `phase`. A killing blow that also crosses draft XP resolves as victory or defeat first, so `updateDrafts` does not open a draft on the finishing step.

Living enemy means `!dead && hp > 0`. Leftover projectiles do not block victory. `endless === true` skips the victory transition. Settlement of the main victory should already be stored before endless starts, and a later endless death must not pay again (`settlement` is immutable).

### `canPlan` disagrees with placing and with terminal phases

Probed `canPlan`:

| Phase | paused false | paused true |
| --- | --- | --- |
| playing | false | true |
| draft | true | true |
| placing | false | true |
| victory | false | true |
| defeat | false | true |

`hiddenPaused` is not part of the predicate. Hiding the tab does not open planning. That part matches the contract.

Merges are legal during user pause and during `phase === 'draft'`, and illegal during unpaused placing. That last part is a useful accident: placement and merge do not run at once unless something also sets `paused`. It is unsafe on victory and defeat: a results screen that leaves `paused === true` still reports `canPlan`. `mergeUnits` would then mutate a finished run if the UI called it.

Lead fix in `src/shared.js`:

```js
export function canPlan(state) {
  if (!state || state.phase === 'placing' || state.phase === 'victory' || state.phase === 'defeat') return false;
  return state.paused === true || state.phase === 'draft';
}
```

Do not treat `hiddenPaused` as planning. Draft code must not set `paused` merely to freeze time. `chooseDraft` for a hero upgrade returns to `playing`; a leftover `paused` flag would soft-lock the run because `step` stays idle.

### Run factory facts workers will trip on

Probed `createRun({runId, seed:1})`:

- Hero is `slots[7].unit` with `id === 'u1'`, `kind === 'hero'`, `type === 'hero'`, `rank === 1`, `nextId === 2`.
- `initialized === false`. Nothing in the scaffold sets it true. Fence HP does not include equipment or vitality.
- Default seed is `123456` when `start` omits `seed`. Every such run is the same simulation. The menu action should pass `seed >>> 0` from `crypto.getRandomValues` or an equivalent 32-bit value, and store that seed on the run.
- `seed >>> 0` maps `NaN` to 0 and truncates floats. Persistence should reject non-integer seeds instead of silently repairing them.
- Omitted `runId` uses `Date.now()` plus `crypto.randomUUID()` or `Math.random()`. That id is not gameplay RNG. Tests and balance must pass `runId` or snapshots never match. Do not draw gameplay numbers from `Math.random`.
- Unknown `difficulty` becomes `'normal'`.
- `createProfile('zh')` stores `zh`. Probed `createProfile('zh-CN')` stores **`en`**. Browser locales `zh-CN`, `zh-Hans`, and `zh-TW` need a prefix check before `createProfile`. Final boot must do that. Current `src/boot.js` calls `createRun()` with the default English profile and ignores `navigator.language`.
- `profileSnapshot` is a deep JSON clone. The smoke test locks currency isolation. Settings changes belong on the live profile. Stat bonuses belong on the snapshot taken at `createRun`.
- `nextDraftXp` is **8** and workers cannot edit `state.js`. The first draft opens when `state.xp >= 8`, not when the clock hits 20 s. Waves must make about 8 XP of kills land in the 20–40 s window. Later thresholds are the drafts worker's growth rule.
- `createUnit(state, recipeId)` sets `kind: 'tower'` because only `type === 'hero'` becomes a hero. Hybrids have to pass the fourth argument: `createUnit(state, recipeId, rank, 'hybrid')`. `getUnitStats` should also treat a type that matches `RECIPES` as a hybrid if `kind` was left wrong, and return finite stats.
- Hero identity is "exactly one `kind: 'hero'` anywhere in the ten slots" after the run starts. Only a brand-new run guarantees slot 7. Move can place the hero elsewhere. Systems search slots; they must not hard-wire index 7.
- `best` is `{}`. UI should tolerate missing `best.wave` until `settleRun` defines it.
- `clouds` is an empty array with no owner and no element schema.

`random(state)` is a mulberry32-style uint32 generator. It returns `word / 4294967296`, so the range is `[0, 1)`. A 100000-draw probe from seed 0 did not observe an exact 0. Box-Muller in `sampleSpawnX` must still guard `u <= 0` before `Math.log`, because a 0 draw is in range and `log(0)` poisons spawn x. Rendering, merge preview, and UI must not call `random`.

`clone` is JSON round-trip. `NaN` and `Infinity` become `null`, `undefined` fields disappear, and `-0` becomes `0`. `exportRun` uses it and then clears `events` and `accumulator` on the copy. The probe confirmed the source keeps its events. Persistence should use that behavior and still reject non-finite numbers rather than relying on `null` coercion.

### Boot resumes on visibility by itself

`src/boot.js` sets `state.hiddenPaused = document.hidden` on `visibilitychange` and resets the frame timestamp. Showing the tab clears `hiddenPaused` and the next frame simulates. Explicit `paused` is left alone, so this scaffold does keep "autopause must not erase an explicit pause." It does not implement the brief's deliberate resume.

Lead boot, when it replaces this file, should:

- On hide: set `hiddenPaused = true` only.
- On show: leave `hiddenPaused` true, avoid a catch-up spike (the existing `last = now` behavior), and show `pausedHidden` until `act('resume')`.
- `pause` sets `paused = true` only.
- `resume` clears both `paused` and `hiddenPaused`.
- Opening menu, armory, codex, settings, or howto while `phase === 'playing'` sets `paused = true`. Returning to the battle screen does not auto-resume.

The scaffold also rewrites `#status` every animation frame and never calls `takeEvents`. Final shell renders DOM on state changes, not on every frame. Canvas draw stays on the frame loop.

### Styles, package, and unowned files

`src/styles.css` sets `button { min-height: 44px }`, a 440 px column, and a pixelated canvas. It does not define `.btn`, `.btn-primary`, `.panel`, `.card`, `.grid`, `.muted`, or `.badge`. Worker 16 owns this file and must add those classes. At a 320 px viewport the current `main` padding is 32 px, so the canvas lays out near 288 px wide (scale 0.8). A 64×72 slot is then about 51×58 CSS pixels. Gutters stay near 6 px and `hitSlot` misses them.

`index.html` hardcodes `lang="en"`. The language action should set `document.documentElement.lang` to `zh` or `en` without rebuilding the canvas.

`scripts/serve.mjs` listens on `127.0.0.1` and `PORT` or 4173. This review did not start it.

Nobody owns `.gitignore`. Lead should add one before the first commit: `node_modules/`, logs, browser-test profiles, `.env`, auth files, machine paths, and local save exports. The brief asks to commit a playable build, so `dist/` is a lead choice, not an implicit ignore.

Worker 23 may need `esbuild` as a devDependency and cannot edit `package.json`. There is no lockfile. `npm ci` fails until the lead generates one. CI should not claim a green build until `scripts/build.mjs` exists.

## Missing semantics to lock before wiring workers

These are not bugs observed in domain code. They are holes where two correct-looking workers will disagree. Preferred resolution is for the lead to follow this section if the returned modules differ.

### One stat path

`getUnitStats(unit, state)` returns a new object every call. It does not return catalog or recipe objects, and it does not mutate `unit` or the catalog.

- Hero (`kind === 'hero'` or `type === 'hero'`): delegate to `getHeroStats(unit, state)`.
- Hybrid (`kind === 'hybrid'` or type found in `RECIPES`): copy that recipe's rank-1 stats, then apply rank scale.
- Base type: copy `TOWERS[type].stats`, then apply rank scale.
- Unknown: finite fallback (damage 0, interval 1, range 0) and no throw.

Rank scale, applied in this one function:

- `damage`, burn/poison `dps`: multiply by `1 + 0.55 * (rank - 1)`.
- `interval`: divide by `1 + 0.12 * (rank - 1)`, then clamp to a minimum of 0.25 s.
- `range`, projectile speed, and status durations: unchanged.
- Aura fractions: multiply by `1 + 0.25 * (rank - 1)`, then combat caps.
- Rank outside 1–4 is clamped to that range for towers and hybrids. Hero rank stays 1. Hero growth lives in `unit.upgrades[id]`.

Profile combat bonuses come from `getProfileBonuses(state.profileSnapshot)` inside hero/tower stat code, every call, without writing the snapshot. Suggested post-sum caps so equipment plus permanent levels cannot exceed them: damage `+0.40`, haste `+0.50`, crit chance `+0.25` absolute, range `+40` px, fence `+80` HP, reward `+0.25`. Haste means `interval / (1 + haste)`, never `interval * (1 - haste)`.

Fence pixels are not applied inside `getUnitStats`. Lead init, once, when `initialized !== true`:

```js
const bonus = getProfileBonuses(state.profileSnapshot);
state.fence.maxHp += bonus.fence;
state.fence.hp += bonus.fence;
state.initialized = true;
```

`loadRun` of an already initialized run must not do this again. Reward fraction is applied only inside `settleRun`.

Combat aura cap, separate from profile haste: summed ally aura damage bonus ≤ `+0.50`, summed aura haste ≤ `+0.50`, applied when the shot is fired. A tower does not receive its own aura. Support with `damage <= 0` does not spawn a projectile; the aura is passive around the support slot and uses `aura.range` from that slot center. Support with `damage > 0` uses the normal enemy targeting path.

### Damage, status, and projectiles

`damageEnemy(state, enemy, amount, options)`:

- Return immediately if `!enemy || enemy.dead || enemy.hp <= 0`.
- `amount` is already the rolled hit, including crit multiplier. `options.crit` is recorded and must not multiply again.
- Armor fraction is `clamp(enemy.armor, 0, 0.8)`. Brittle is not negative armor; that would die in the clamp.
- Brittle multiplier is the max active brittle `power` (default 1, cap 1.6).
- `actual = amount * (1 - armor) * brittle`.
- Subtract from `hp`, add `actual` to `stats.damage`, increment `stats.crits` when `options.crit` is true.
- If `hp <= 0`, call `killEnemy` once.

`killEnemy` sets `enemy.dead = true` before XP. Then, once: `state.kills += 1`, `state.xp += finite enemy.xp`, source unit `kills += 1` when that id is on the board, `emit(state, 'kill', {x, y, sourceId, towerType})`. It does not remove the enemy from the array and it does not open a draft. A second call is a no-op. Cleanup is only in the engine step, so status death and projectile death cannot double-remove.

Status rules for `src/systems/status.js`:

- `slow.factor` and status `power` for slow are the remaining speed multiplier, such as `0.65`. They are not "percent slowed."
- `getSpeedFactor`: `0` if any stun has `remaining > 0`, otherwise the minimum slow power, otherwise `1`. Do not multiply slows and do not write `enemy.speed`.
- Reapplying slow or burn refreshes `remaining` to the max of current and new. Burn `power` becomes `max(dps)`.
- Poison adds one stack up to `maxStacks`, refreshes duration, and keeps `power` as per-stack dps.
- Stun and brittle refresh duration. Brittle `power` is the damage-taken multiplier.
- DOT uses `tickTimer` accumulated in sim seconds and calls `damageCallback(state, enemy, dps * stacks * dtChunk, {sourceId, damageType, crit:false})`. Stop further ticks when the callback kills the enemy. Large `dt` is safe because the callback is idempotent after death.
- Stun freezes movement, drift, and attack cooldown. Slow scales movement and drift only.
- Do not import `src/systems/combat.js`. The engine passes `damageEnemy`.

Optional effect fields that fit the existing schema, if a hybrid needs them:

- `stun: {chance, duration}` with chance in `[0, 1]`.
- `brittle: {amp, duration}` with `amp` stored as status power.

`mechanics[]` is a display list derived from which fields exist. Combat ignores unknown strings. A hybrid whose only difference is a new string fails the "real mechanic" rule.

Projectile `life` is **seconds**, decremented by `dt`, starting at 3. Hits use a swept segment against enemy radius so a fast shot cannot tunnel between fixed 1/60 steps. Default speed 300 px/s is 5 px per step. Speeds above about 1000 px/s need the sweep even more. Pierce continues along the segment. Chain jumps to the nearest living enemy within `chainRange` that is not in `visited`, at most `chain` times. Splash damages other living enemies within `splash` and does not spawn new chains. Crit is rolled once per shot with `random(state)`. Tower iteration order is slots 0 through 9 so the crit stream stays stable.

Movement drift should be a smooth function of `driftPhase`, `driftVelocity`, and `dt`, with at most one `random(state)` call when the enemy spawns. A new random call every step changes later crit rolls and makes the path look like columns. Dead or stunned enemies do not move. X stays inside `[ARENA.enemyMinX, ARENA.enemyMaxX]` by steering, not by snapping to `36 + 72 * col`.

`sampleSpawnX` rejection-samples a Gaussian with `random(state)` only, default mean 180 and sigma 60, accepting only `[14, 346]`. On a failed `log` guard or after a bounded number of rejects, return the mean. Do not clamp a raw Gaussian onto the edges.

Spawn scaling, once:

1. Start from `ENEMIES[kind]`.
2. Multiply HP, speed, and damage by the difficulty multipliers once.
3. Apply `overrides.healthScale` if provided.
4. `overrides.hp` / `maxHp` / `x` / `y` replace those fields absolutely for tests and scripted spawns.
5. Combat and movement then trust the enemy record and do not multiply difficulty again.

`count` is not an integer. Spawn copies should use a remainder accumulator (`floor(baseCount * count + acc)`), not `Math.random()` and not an extra `random(state)` roll. Same-seed runs on different difficulties are allowed to diverge.

Spitter and boss attacks damage the fence only. Boss adds, if any, are spawned from the wave system by inspecting living bosses, not from combat and waves both. `state.clouds[]`, if used for poison ground, is ticked only by `updateStatuses`. Suggested element: `{id, type, x, y, radius, dps, remaining, sourceId}`. If nobody documents clouds, leave the array empty.

Fence hits add to `stats.fenceDamage`, clamp HP at 0, and emit `fence_hit`. They do not go through `damageEnemy`.

### Event names

Emit these shapes after the `emit` spread fix. Extra unknown events are ignored by audio and VFX.

| type | Fields |
| --- | --- |
| `shot` | `x`, `y`, `sourceId`, `towerType` |
| `hit` | `x`, `y`, `damage`, `crit`, `targetId`, `towerType` |
| `kill` | `x`, `y`, `sourceId`, `towerType` |
| `fence_hit` | `x`, `y`, `damage` |
| `merge` | `x`, `y`, `towerType`, `rank` |
| `draft` | `level` |
| `victory` | `runId` |
| `defeat` | `runId` |
| `ui` | optional `x`, `y` |

Status pulses may emit `hit` with `towerType` set to the status name, or be dropped. Do not emit a second XP event. VFX `update(simDt)` runs once per animation frame for the steps actually simulated. Audio plays at most about 8 new voices per frame and prefers crit, merge, fence, victory, and defeat. `unlock()` runs inside the pointer or key gesture, not in `requestAnimationFrame`. Sound stays off until `profile.settings.sound` is true.

### Merges

`previewMerge` is pure. It uses `id: 'preview'` and does not change `nextId`, `rng`, slots, `stats.merges`, or events.

`mergeUnits` runs only when `canPlan(state)`, indexes differ, both slots exist, and both are occupied. Hero on either side returns `heroProtected` and changes nothing. Same type and equal rank, including two hybrids of the same recipe id, yields `rank + 1` up to 4. Rank 4 returns `maxRank`. Unequal ranks return `rankMismatch`. Different base types require equal rank and an unordered recipe match (`parents` sorted). Missing recipe returns `noRecipe`. A hybrid plus anything of a different type returns `noRecipe`. Success consumes the source slot, writes the new unit onto the target slot with a real `uid`, increments `stats.merges`, and emits `merge`.

`mergeCancel` is UI-only. It clears `getUI().mergeFrom` and `mergePreview`. It does not call `mergeUnits`.

`move({from, to})` is a swap or a move into an empty slot during `canPlan`. It never deletes a unit and never turns a hero into a tower. It is not a merge.

### Drafts

`updateDrafts` is called only by the engine, and only when phase is still `playing`. XP is added only in `killEnemy`. When `xp >= nextDraftXp` and `draft == null`, one transition happens: `phase = 'draft'`, `draftLevel += 1`, grow `nextDraftXp`, `draft = {options: generateDraft(state)}`, emit `draft`. Do not set `paused`.

`generateDraft` returns three distinct valid options. Distinct means different upgrade ids or different tower types, and a replace card is not a duplicate of a normal placement of the same type if both would be useless. With empty slots, prefer real placements and uncapped hero upgrades. With a full board, offer uncapped hero upgrades and `replace: true` tower cards. If hero upgrades are capped, three different replace cards are the legal board. Never offer a placement that cannot be completed, and never offer a capped upgrade.

Suggested growth that keeps the frozen first threshold: `nextDraftXp += 6 + 2 * draftLevel` after the level increment. Lead may retune with the wave XP table. Do not change the initial 8 except in `src/state.js`.

`chooseDraft` hero upgrade: `applyHeroUpgrade` only. On `ok`, `phase = 'playing'` and `draft = null`. On failure, stay in the draft. This function does not spend currency and does not change XP.

`chooseDraft` tower: `phase = 'placing'`, `pendingUnit = {unit: createUnit(...), replace: !!option.replace}`. Cancel: `pendingUnit = null`, `phase = 'draft'`, same `draft` object, no new `generateDraft`, no XP refund. Place: empty slot accepts the unit; `replace: true` may overwrite a non-hero; a hero slot returns `heroProtected` and keeps the pending unit; success clears draft and pending and sets `playing`.

### Economy

`settleRun` pays victory and organic defeat only.

- `abandon` and `restart` pay **0**, append the run id with a zero settlement, and `clearRun`. They do not use the defeat formula. Otherwise a 31-second restart farms partial defeat rewards.
- Fresh abandon (`time < 30` and `kills < 3`) is already zero under that rule.
- If `state.settlement` is non-null, return that object and do not add currency.
- If `profile.settledRuns` already contains `runId`, do not add currency. Attach the stored settlement if the run object lost it.
- Victory base: `24 + wave * 4 + kills + floor(time / 30)`. Defeat base: `floor(that progress * 0.35)`. Currency is `floor(base * difficulty.reward * (1 + rewardBonus))`.
- `best` updates on victory only. Suggested shape: `{wave, time, kills, difficulty}`.
- Results UI prints `state.settlement.currency` and `result`. It does not recompute the formula.

Save order after an in-memory settle:

1. Run object already has `settlement`. Profile already has currency and the run id.
2. `saveRun` first, then `saveProfile`.
3. On load, if the run has `settlement` and the id is missing from `settledRuns`, add currency once and append the id (profile save was the one that crashed).
4. If the id is present and the loaded run has no settlement, keep the currency and mark the run settled in memory (run save was the one that crashed).

Keep at least the last 50 settled ids. `importSave` validates the whole payload before writing. Invalid JSON, oversize text (750000 characters is a sufficient cap), wrong version, slot count other than 10, hero count other than 1, bad phase, bad speed, bad difficulty, or non-finite combat numbers leaves the previous storage untouched. Loaded runs set `paused = true`, `hiddenPaused = false`, `events = []`, `accumulator = 0`, and restore `rng`, `seed`, `nextId`, statuses, and `director`. Hero may sit on any slot. Geometry can be rebuilt with `slotGeometry(index)`.

There is no unequip action. `equip({id})` moves an owned item into its `weapon` / `charm` / `armor` slot and leaves the previous item owned. Duplicate buy returns `owned` without spending. Permanent purchase at cap returns `maxLevel` without spending. Missing currency returns `insufficientCurrency`.

### Reason strings

Workers should use these `reason` codes so i18n can map them. The UI shows `api.t(reason)` and falls back to the key. Unknown prose reasons will leak English into the Chinese UI.

`heroProtected`, `maxRank`, `rankMismatch`, `noRecipe`, `sameSlot`, `emptySlot`, `notPlanning`, `replaceRequired`, `invalidIndex`, `maxLevel`, `insufficientCurrency`, `owned`, `notOwned`, `locked`, `badVersion`, `corrupt`, `tooLarge`, `invalidPhase`, `invalidSpeed`, `invalidDifficulty`, `abandoned`.

Successful actions return `{ok: true}` and may include `unit` or `settlement`.

### UI ownership

Controller lives in lead-owned boot. Shell and build panel call `api.act` and do not both handle the same pointer.

Canvas pointer, after `renderer.hitSlot(clientX, clientY)`:

- `-1`: ignore.
- `phase === 'placing'`: `act('place', {index, replace: !!pendingUnit.replace})`.
- `getUI().mergeFrom >= 0` and a different slot: `act('mergePreview', {from, to: index})`.
- A move-from selection is set: `act('move', {from, to: index})`.
- Otherwise: `act('selectSlot', {index})`.

Build panel owns the Move, Merge, Confirm, Cancel, draft card, and replace-confirm buttons. Hero shows `heroProtected` and no merge confirm. Draft overlay stays up until the choice is placed or a hero upgrade applies. During a full-board draft, merge controls stay available because `canPlan` is true in `draft`. A merge does not reroll the three options.

`getUnitStats(...).interval` is seconds. The attack-speed label should say that, or show `1/interval` and label it as attacks per second. Pick one in `renderBuildPanel` and use it everywhere.

Actions present in the contract but easy to misread:

| Action | Lead behavior |
| --- | --- |
| `pause` | `paused = true` only |
| `resume` | clear `paused` and `hiddenPaused` |
| `speed` | `setSpeed` with 1, 1.5, or 3 |
| `language` | live `profile.settings.language`, no run reset |
| `sound` | toggle `settings.sound` and `audio.setEnabled` |
| `screen` | switch UI; non-battle screens pause a playing run |
| `start` | new run id, chosen difficulty and seed, snapshot current profile, init fence bonus |
| `restart` | zero-reward abandon of the current run, then `start` |
| `abandon` | zero-reward settlement, `clearRun`, screen `menu` |
| `exportSave` / `importSave` | storage API; UI uses `textContent` only |

Missing from the action list and required by the brief:

- `reducedMotion` toggles `profile.settings.reducedMotion`. Worker 18 has a settings control and no contracted action. Lead should accept this action. Until then, a settings write that bypasses `act` violates the UI rule.
- `difficulty` as a settings write for the next run, distinct from `start`. `start({difficulty})` should also store `profile.settings.difficulty`.
- No `save` action. Autosave profile and run from the controller after successful mutations and on hide. The i18n key `save` can label that autosave or the export control.

`Continue` loads a paused playing run onto the battle screen and waits for `resume`. A loaded victory or defeat run opens `results` and does not set `phase` back to `playing`. `noSave` when `loadRun` returns null.

### Render ownership

`drawEnemy(ctx, enemy, x, y, ...)` receives a bottom-center anchor. The renderer converts the sim center with `anchorY = enemy.y + enemySize(enemy).height / 2` and `drawEnemy` does not add radius again. Defenders use the same bottom-center convention. Feet should sit near `slot.top + slot.height - 4`, not on the slot-center point returned by `unitPosition`.

Draw order: `drawWorld`, projectiles, enemies, defenders, selected-only range circle, HP and status pips, effects. World draws neither units nor projectiles. HP bars live in the renderer; body flash lives in `drawEnemy` / `drawDefender` via `flash` and `time`. Neither path calls `random` or mutates state.

`createRenderer.resize` runs on container resize, not per frame. Backing-store size is CSS size times a capped devicePixelRatio, and the context transform maps logical 360×640. `pointFromClient` uses `getBoundingClientRect`, not a 1:1 assumption. Setting `canvas.width` every frame clears the frame and fights high-DPI.

`drawIcon` unknown ids draw a fallback and do not throw. Sprite caches are created on first draw (`OffscreenCanvas` or a late `document` lookup). Top-level `document.createElement` in a render module breaks Node if a test ever imports it. `AudioContext` is created inside `createAudio` or `unlock`, not at import.

### Import cycles

Allowed direction:

- `movement.js` → `data/enemies.js`, `shared.js`
- `status.js` → `shared.js` only
- `combat.js` → `status.js`, `data/towers.js`, `shared.js`
- `towers.js` → `recipes.js`, `hero.js`, `shared.js`
- `hero.js` → `progression.js`, `shared.js`
- `drafts.js` → `hero.js`, `towers.js`, `shared.js`
- `merges.js` → `recipes.js`, `shared.js`
- `waves.js` → `movement.js`, `shared.js`
- `progression.js` has no import from `hero.js`, `combat.js`, or `drafts.js`
- `recipes.js` and `enemies.js` are data and do not import systems
- render modules do not import `engine.js`
- UI does not import mutation functions except through `api.act`
- nobody except lead boot/engine imports `engine.js` from a system

`hero.js` must not import `getUnitStats`. `status.js` must not import `damageEnemy`.

## Smoke test is a behavior lock

`tests/smoke.test.mjs` is lead-owned. Worker 20 must not edit it. It requires all of the following to stay true:

- New run: 10 slots, five per row, one unit, `slots[7].unit.kind === 'hero'`, no enemies.
- Same seed, same `random` stream, values in `[0, 1)`.
- `hitSlot(slot.x, slot.y) === slot.index` and `hitSlot(180, 200) === -1`.
- Pause and the 1× / 3× step counts described above. Speed 2 is rejected.
- Profile currency edits do not change `profileSnapshot`. `createProfile('zh')` sticks.

Headless sim and balance code should call `step` in a loop, or call `advance` in chunks of at most 0.25 wall seconds on one state object. One `advance(state, 600)` call simulates 0.25 s at 1×.

Speed invariance means equal simulated ticks, not equal wall time. Compare positions, HP, XP, RNG, and cooldowns. Do not compare `events` if the 400 cap trimmed one run more than the other.

## Suggested reconciliation order for the lead

1. Patch `emit` spread order and `canPlan` in `src/shared.js`. Deep-freeze difficulty rows.
2. Put the step order, cleanup, victory, and defeat in `src/engine.js`. Keep `time` / `tick` ownership there.
3. Confirm stat, rank, spawn-scale, and status rules against the returned modules. One function owns each.
4. Normalize reason strings and event names at the edges if workers diverged.
5. Wire boot: locale prefix, seed, fence init, pause/hidden, single event drain, shell mount, autosave, settle-once.
6. Run smoke, then simulation and progression tests. Fix defects the tests actually show.
7. Browser checklist in `docs/BROWSER_ACCEPTANCE.md`.
8. Balance harness, then art and audio passes.
9. Add the lockfile and `esbuild` if worker 23 requires them. Build `dist/index.html`. Commit `.gitignore`. Do not treat this review as a test pass.

## What this review did not do

No domain module was imported. No browser viewport was opened. No save, sound, draft, merge, or balance run was executed. Passing `node --check` on the four scaffold modules does not mean the game runs. Worker 24 did not edit source, the contract, or another worker's files.
