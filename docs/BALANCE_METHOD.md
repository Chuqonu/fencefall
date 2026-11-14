# Balance method

This note describes the seeded auto-player in `scripts/balance.mjs`. The script is the measurement tool. A report it writes is a sample of that tool on the current build. It is not a hand-filled result and it is not a fun rating.

`POLICY_INFO` in the script is the executed configuration. If a weight or threshold here drifts from that object, the script wins.

## What a run is

`simulateRun({ seed, difficulty, maxTime, policy })` builds a fresh profile, starts one run, and plays it with legal actions only:

- `createRun`, `setSpeed(1)`, `step` / `advance`
- `chooseDraft`, `placePending`, `cancelPlacement`
- `previewMerge`, `mergeUnits`
- `settleRun` once after victory or defeat, then once more to record whether currency changes

The default profile is `createProfile('en')`: no equipment and no permanent ranks. That is the measurement for “Normal is playable without a grind.” Pass `profile` to study meta power. The object is cloned unless `mutateProfile: true`.

The policy never calls `random(state)`, never grants XP, currency, or towers, and never sets victory because the clock ran out. Draft, placement, and merge failures leave the run in place and try a different legal action. Hero merges are not executed. If `previewMerge` reports a hero pair as legal, the run records that and still refuses to apply it.

Planning pauses call `canPlan`. There is no shared `moveUnit` export in this checkpoint. While planning is legal, the harness swaps two slot units itself, or calls `engine.moveUnit` / `relocateUnit` / `moveSlot` / `swapUnits` when one of those exists. The swap does not touch `rng` or `nextId`. The hero stays in its starting slot. Reposition only moves a tower into an empty slot when that slot reaches at least eight more sampled threat points.

## How to run

From the repository root:

```bash
node scripts/balance.mjs
node scripts/balance.mjs --quick
node scripts/balance.mjs --seeds 1001,1002,1003 --difficulties easy,normal,hard --policies greedy,random --max-time 1200
node scripts/balance.mjs --policies greedy,aggressive,control,random --difficulties nightmare --max-time 1200
```

The default matrix is seeds `1001,1002,1003`, difficulties `easy`, `normal`, `hard`, and policies `greedy` and `random`, capped at 1200 active seconds. `--quick` is a 90 second wiring smoke on Easy and Normal for seed 1001 with `greedy` only. Do not read a quick report as a difficulty result.

The CLI writes the actual rows to `artifacts/balance-report.json` and a table to `artifacts/balance-report.md`. `summarizeRuns(runs)` rebuilds the aggregates from those rows.

Bounds, per run: `maxTime` active seconds and `maxSteps` ticks (default `ceil(maxTime / STEP) + 30`). The driver uses one fixed `STEP` (`1/60` s) at speed 1. It does not use the 3x path, so this harness is not the speed-invariance test.

## Driver

Auto mode reads `src/engine.js` and picks one clock:

| Mode | When | What advances one tick |
| --- | --- | --- |
| `harness` | `step` and `advance` do not contain at least three of `updateWaves`, `updateMovement`, `updateCombat`, `updateStatuses`, `updateDrafts` | `step(STEP)`, then those systems in that order |
| `engine-step` | those names are inside `function step` | `step(STEP)` only |
| `engine-advance` | those names are inside `function advance` but not `step` | `advance(STEP)` only, after `accumulator` is zeroed |

This checkpoint’s scaffold `step` / `advance` only move `time` and `tick`, so auto mode is `harness`.

Harness order after the clock tick:

1. `updateWaves(state, STEP)`
2. `updateMovement(state, STEP)`
3. `updateStatuses(state, STEP, damageEnemy)`
4. `updateCombat(state, STEP)`
5. Remove enemies whose `dead` flag is true. Enemies with `hp <= 0` and `dead !== true` stay in the list.
6. If fence HP is not positive, clamp it to 0 and set `defeat`.
7. If `director.done` is true, no enemy has `hp > 0`, and `projectiles` and `clouds` are empty, set `victory` unless `endless` is set.
8. If the phase is still `playing`, `updateDrafts(state)`.

Domain updaters must not add to `state.time` or `state.tick`. The harness applies each updater once. In engine modes it applies none of them, so a lead who also calls them inside `step` does not get double damage or double XP.

If auto mode is `harness` and `step` already changes domain fields (`rng`, enemies, XP, wave, fence, and the other fields in the stamp), the run stops with `drive-mode conflict` instead of publishing a double-ticked sample. Rerun with `--drive engine` or `--drive engine-advance`.

`--drive harness` forces the extra system calls even when `engine.js` names them. Use that only when those names are comments. `--drive engine` forces `engine-step` when the file scan still says `harness`.

Victory is not awarded on a timeout. A timeout with `directorDone` and zero living enemies is the alert `schedule-complete-still-playing`: the schedule finished and nobody set victory. Waiting for empty `projectiles` and `clouds` avoids closing the run on an in-flight fence hit. A cloud or projectile that never clears will hold the phase at `playing` until the cap and raise that alert.

The harness leaves `state.initialized` false. It does not re-apply profile bonuses each tick. Combat and `getUnitStats` / `getHeroStats` are expected to read `profileSnapshot` or bonuses the lead applied once. `startingBonuses` in the result is `getProfileBonuses` on the starting profile.

## Policies

All scored policies share the same placement ruler. Threat samples sit on three lines above the fence (`fenceY - 20`, `fenceY - 70`, `fenceY - 130`) at x = 180, 150, 210, 110, 250, 70, 290. A slot’s score counts samples inside the unit’s listed range, then adds a small center-column bonus. Front row gains a small bonus for non-support units. Support, or any unit whose stats include `aura`, gains a small back-row bonus. A slot that hits nothing is heavily penalized. The hero slot is never a placement or merge target.

Draft scores:

- First copy of a base type scores higher than a duplicate. Weights scale that score.
- A `replace` card scores lower while an empty slot exists, and higher on a full board.
- A hero upgrade scores higher when two or fewer slots are empty, and much higher on a full board when it is not a replace card.
- Known `HERO_UPGRADES[id]` caps reject an upgrade that is already capped. Numeric `effect` / `stat` / `stats` / `bonus` fields add damage, haste, range, crit, and fence. If the catalog entry has no numbers, the id string is matched against damage, haste, range, crit, and fence words.
- Kinds other than `tower` and `hero_upgrade` are ignored.

Merge scores use `previewMerge` only. Same-type rank-ups are preferred while a third copy exists, and delayed while the only pair is rank 1 and two or more slots are empty. Hybrid score comes from the recipe’s listed damage, interval, splash, chain, pierce, burn, poison, slow, and aura. `aggressive` adds extra value for damage, chain, and splash. `control` adds extra value for slow, poison, and aura. `keepCoverage` subtracts a large penalty for spending the last copy of a type. A full board adds a bonus so a merge can open a slot. Equal scores keep the lower source index, then the lower target index.

Thresholds are the minimum merge score the policy will confirm. `atLeast4Empty` applies at 4 or more empty slots, `atLeast2Empty` at 2 or 3, `oneEmpty` at 1, and `noneEmpty` at 0.

| Policy | Plan interval | Merges per plan | Empty ≥4 / ≥2 / 1 / 0 | Role bias |
| --- | --- | --- | --- | --- |
| `greedy` | 30s | 3 | 60 / 42 / 24 / 12 | even, slight bolt and lightning lean; keeps last copies |
| `aggressive` | 20s | 4 | 28 / 16 / 8 / 8 | bolt, fire, lightning; hybrids and early merges |
| `control` | 40s | 2 | 70 / 48 / 36 / 18 | frost, poison, support; keeps last copies |
| `random` | 30s | 1 roll at 35% | n/a | uniform legal draft and slot; no reposition |

`greedy` and `random` are the default pair: one structured heuristic and one weak legal player. A gap between them on the same difficulty is heuristic strength. A gap between difficulties on the same policy is schedule and stat pressure. `aggressive` and `control` are optional extra heuristics, not extra difficulty levels.

Planning also runs at the start of each draft, before the card is chosen, so a full board can merge a slot open. The timed pause is skipped when a draft just planned at that same timestamp.

The policy RNG is a separate mulberry32 stream seeded from the run seed, difficulty, and policy name. Tie-breaks on the scored policies do not use it.

## Metrics

| Field | Meaning |
| --- | --- |
| `outcome` | `victory`, `defeat`, `timeout`, `stalemate`, or `error` |
| `win` / `loss` | Victory or defeat from the rules above |
| `survived` | Fence HP is still positive and the run did not throw |
| `activeTime` / `time` | `state.time` in seconds. Planning does not add to it |
| `deadTime` / `deadShare` | Active seconds with no living enemy, and that share of `activeTime` |
| `combatTime` | Active seconds where a living enemy was visible before or after the tick |
| `stalledCombatTime` | After 3 continuous seconds of living enemies with no damage gain and no fence loss, further seconds in that stretch |
| `fenceHp`, `fenceRatio` | Raw fence HP and HP / max HP. Negative HP is left visible |
| `damage`, `fenceDamage`, `kills`, `merges`, `crits` | Run counters, not estimates |
| `towerMix`, `roster` | Final board. `listed` stats are catalog reads, not damage dealt |
| `currency` | Profile currency after the first `settleRun`, minus the starting value. Unresolved runs stay 0 and `settled: false` |
| `rewardIdempotent` | False when a second `settleRun` changes currency |
| `firstDraftTime` | Active time when the first draft opened |
| `checkpoints` | Fence, kills, wave, damage, and living enemies every 60 active seconds |
| `decisions` | Drafts, placements, merges, hero upgrades, cancels, moves, and failures |
| `notes` | Integration defects the actions revealed, such as a mutating preview or a hero pair preview |

`summarizeRuns` averages every run except `error`. `meanResolvedTime` uses victory and defeat only. `meanCurrency` uses settled runs only. Timeouts sit on the cap, so `meanActiveTime` moves toward `maxTime` when runs do not finish. Win rate uses non-error runs as the denominator.

Computed alerts, when the rows support them:

- `no-combat`: no damage, no kills, and no wave. The systems did not play.
- `easy-collapsed`: every Easy run is a defeat and mean active time is under 2 minutes.
- `early-victory`: a win before 600 active seconds (under the 10 minute floor).
- `schedule-complete-still-playing`: timeout, director done, no living enemies.
- `reward-repeat-paid`: the second settle changed currency.
- `preview-mutated`: `previewMerge` changed the run. That run is an error, not a sample.
- `high-dead-time`: a difficulty’s mean empty-field share is above 0.4 after more than a minute.
- `combat-stalled`: more than 20 seconds of the stalled-combat definition.
- `all-error`: every run threw.

## How to read the target

The brief asks for about 12–16 minutes of active simulation, inside a 10–20 minute run at 1x. Planning time sits outside `state.time`, so a human session can run longer than `activeTime`.

Use the same policy when comparing Easy, Normal, and Hard. Use the same difficulty when comparing `greedy` with `random`. A `greedy` win and a `random` loss on the same seed means this heuristic found a line, not that every player will. A win before 10 minutes is shorter than the requested run. A timeout at 1200 seconds with `directorDone: false` means the cap arrived before the schedule ended, or spawns stalled. It is not a survival grade.

`--quick` and any `maxTime` below 600 seconds cannot confirm the duration target.

## Settlement

Victory and defeat call `settleRun(profile, state)`. The reported currency is the first call’s delta. The second call must not pay again; `rewardIdempotent` records that. Timeout, stalemate, and error are not settled. The contract’s own gate still applies inside `settleRun`: a fresh abandon (`time < 30` and `kills < 3`) pays zero, and only a finalized victory or defeat should pay. Difficulty reward multipliers are whatever `settleRun` reads from shared `DIFFICULTIES`. The harness does not multiply currency itself.

`difficultyParams` copies the shared row actually used (`health`, `speed`, `damage`, `count`, `reward`, `fence`). Nightmare is in that table and can be passed to the CLI. It is omitted from the default matrix because the balance sample asked for Easy, Normal, and Hard.

## Determinism

Same seed, difficulty, policy, driver, and game code should produce the same actions and the same combat numbers. `wallMs` and the CLI `generatedAt` are observational and are allowed to change. The policy stream does not consume gameplay RNG. A preview that changes `rng` or `nextId` aborts the run.

## What this does not show

The policies see the board, the three draft cards, listed stats, and the recipe table. They do not aim shots or use an active ability. They may pause on a timer and think for free, which a rushed player might not do. They can look weak because the heuristic is narrow, or strong because it merges on a perfect schedule. Neither outcome rates fun, readability, or audio.

Simulation time near the target does not prove the waves feel continuous. `deadShare` is the empty-field signal. It is still not a playtest.

## Integration notes for this checkpoint

- `src/engine.js` in this snapshot does not call the domain updaters. Auto mode drives them from the harness. After `function step` or `function advance` contains at least three updater names, auto mode stops calling them.
- Detection looks for `function step(...) {` and `function advance(...) {`. Arrow-function steps fall through to a file-name scan and then `engine-step`, with a note.
- Domain modules are imported statically: movement, combat, status, waves (`updateWaves`, `getWaveInfo`, `WAVES`), hero (`HERO_UPGRADES`), towers (`TOWERS`, `getUnitStats`), recipes, merges, drafts, and progression (`getProfileBonuses`, `settleRun`). This worker snapshot does not contain those files yet, so the CLI cannot produce a combat report here. `node --check scripts/balance.mjs` only parses the harness.
- `chooseDraft` is expected to apply hero upgrades and to enter `placing` for towers. The harness does not call `applyHeroUpgrade` itself.
- `placePending(state, slotIndex, { replace })` is the placement action. Cancel must restore the same three options or the run can stalemate.
- `previewMerge` must not change RNG, ids, or units. `mergeUnits` is expected to consume the source, put a new id on the target, and increment `stats.merges`.
- Cleanup removes only `dead === true`. Kill credit that forgets `dead` leaves corpses in `enemies` and can keep attacking on later ticks.
- A draft that sets `paused` and then returns to `playing` without clearing it is unpaused once, and the run notes `cleared paused after a decision`. `hiddenPaused` aborts the headless run instead.
- No-combat rows mean the imported systems did not spawn or deal damage. Treat that as an integration failure, not as a balance pass.

## 中文摘要

`scripts/balance.mjs` 用固定种子自动游玩，不改写胜利、不发放经验或金币。默认策略是 `greedy`（按射程铺塔、补齐职能、棋盘满了再升英雄）和 `random`（合法选项里均匀随机）。同一策略比较轻松、标准、困难；同一难度比较两个策略。前者看关卡压力，后者看自动策略强弱，都不能当成趣味结论。

默认每局最多 1200 秒主动模拟时间（1 倍速，每步 1/60 秒）。`state.time` 不含暂停和选牌时间。目标是约 12–16 分钟的主动战斗，整体落在 10–20 分钟。超时不是胜利。`--quick` 只检查接线。

当前骨架的 `step` 只推进时钟，所以自动模式会在 `step` 之后按契约调用波次、移动、状态、战斗和选牌。引擎函数体写入这些调用之后，脚本会改由引擎单次推进，避免结算两次伤害。报告写到 `artifacts/balance-report.json`。
