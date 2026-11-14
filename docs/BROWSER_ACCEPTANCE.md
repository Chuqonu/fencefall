# Fencefall browser acceptance checklist

Status: **not run**. This is the pre-integration checklist for the lead. Worker 24 reviewed the contract and the scaffold only. No preview server, desktop session, 390×844 session, or 320 px session was opened. Do not copy these boxes into a QA report as passes.

Fill `Result` with `pass`, `fail`, or `blocked` after a real browser session. Attach the build id, commit, viewport, language, and console transcript. A CSS-pixel resize is not a physical-phone test. Say which one was done.

Related review: `docs/CONTRACT_REVIEW.md`.

## Session header

| Field | Record |
| --- | --- |
| Date | |
| Commit | |
| URL | scaffold server default is `http://127.0.0.1:4173/` via `node scripts/serve.mjs`; record the URL actually used |
| Entry file | `index.html` or `dist/index.html` |
| Browser and version | |
| Device class | desktop resize / phone emulation / physical device |
| `node --check` and `npm test` | command and outcome |
| Console errors before play | |

The current `src/boot.js` placeholder (colored rectangles, English status line, clock only) is not a pass for any row below. Acceptance starts after shell, renderer, simulation, and UI are wired.

## Viewports

Measure the canvas element and at least one primary button in each viewport. Portrait field stays 360×640 logical pixels. Touch targets are at least 44×44 CSS pixels. No horizontal page scroll. Text does not overflow cards. The 8 px logical slot gutters are easy to miss; pointer conversion must still feel reliable.

| Viewport | What to look at | Result | Notes |
| --- | --- | --- | --- |
| Desktop ≥ 1280×800 | Column centered, canvas crisp, panels beside or below the field, keyboard focus visible | | |
| 390×844 | Full HUD, draft cards, and bottom controls visible without a hover-only control | | |
| 320×700 (or any 320-wide portrait) | Long Chinese labels fit, 44 px targets, no clipped merge confirm | | |
| Short landscape, about 844×390 | Field usable by scroll or scale; no orientation lock required | | |
| Device pixel ratio 2 if available | Slots and sprites stay sharp; canvas backing store is not reset every frame | | |

Scaffold note, not a pass: current CSS pads `main` by 16 px and caps the column at 440 px. At 320 px content width the canvas is about 288 px wide (scale 0.8), so a slot is about 51×58 CSS pixels. Re-measure after worker 16 replaces `src/styles.css`.

## Language

Start once with the browser locale set to `zh-CN` and once with `en-US`. `createProfile` only stores `zh` for the exact string `zh`. `zh-CN` currently becomes English unless boot normalizes the prefix. Record which language the menu actually opens in.

| Check | en | zh | Result |
| --- | --- | --- | --- |
| `document.documentElement.lang` matches the UI | | | |
| Menu, battle HUD, draft, placing, merge, codex, armory, settings, howto, results | | | |
| Difficulty names match the shared table (Easy/轻松, Normal/标准, Hard/困难, Nightmare/噩梦) | | | |
| Tower, hero upgrade, recipe, equipment, and enemy names come from catalogs | | | |
| Errors and reason codes are translated, not raw `noRecipe` / `heroProtected` | | | |
| Numbers use `formatNumber` (grouping, no `undefined`) | | | |
| Switch language during a paused run: same `runId`, `time`, `rng`, slots, XP, and draft options | | | |
| Reload keeps the chosen language | | | |
| No English sentence left on the Chinese results and howto screens | | | |

## New run and the first minute

| Check | Result | Notes |
| --- | --- | --- |
| Play asks for difficulty and shows the reward multiplier from `DIFFICULTIES` | | |
| Optional seed is stored; a blank seed does not silently reuse 123456 for every real run | | |
| Battlefield is portrait. Enemies enter from the top. Exactly two rows of five slots | | |
| Exactly one hero, rear center on a new run, marked non-mergeable | | |
| No second tower and no active ability button | | |
| Fence reads as the shared barrier in front of both rows | | |
| Hero fires on its own at threats in geometric range, including off-column | | |
| Range circle appears only for the selected defender | | |
| First draft opens after meaningful play, aimed at 20–40 s of 1× sim time, with an XP indicator | | |
| The draft offers exactly three distinct, completable choices | | |
| Simulation is frozen on the draft (`time` unchanged over a wall-clock wait) | | |

## Place, select, move

| Check | Result | Notes |
| --- | --- | --- |
| Choosing a tower enters placing and does not simulate | | |
| Tap an empty slot places the pending unit | | |
| Tap the hero slot does not replace the hero | | |
| Cancel returns to the same three options and does not grant XP or a new draft | | |
| After placement, select then move during pause: tap source, tap destination | | |
| Move into an empty slot and swap with another tower both keep every unit | | |
| Hero can move and remains a hero | | |
| Unpaused playing does not move or merge units | | |
| Pointer outside the field does not change selection (`hitSlot` -1) | | |
| Drag is optional; the tap path is enough on touch | | |

## Merge, preview, cancel, full board

| Check | Result | Notes |
| --- | --- | --- |
| Pause or draft, choose two equal-rank same-type towers, preview shows rank+1 and the new stats | | |
| Cancel leaves both towers, `stats.merges`, and ids unchanged | | |
| Confirm consumes the source, upgrades the target, and shows feedback | | |
| Different base types with a recipe preview the hybrid before confirm | | |
| Unknown pair explains incompatibility and leaves both units | | |
| Hero merge is refused with the protected-hero message | | |
| Rank 4 same-type pair is refused and kept | | |
| Unequal ranks are refused and kept | | |
| Hybrid plus a different type is refused and kept | | |
| Two hybrids of the same recipe and rank can rank up | | |
| Fill all 10 slots. The next draft still has three legal choices: hero upgrades and/or explicit replace cards | | |
| Replace asks for confirmation, can overwrite a normal tower, and cannot overwrite the hero | | |
| A legal same-type merge from the full-board draft frees a slot without rerolling the three cards | | |
| Codex lists the six base roles and at least eight mixed recipes with real effect text | | |

## Speeds, pause, and hidden tab

Speed must change how fast sim time advances, not the damage per tick. Compare the HUD clock.

| Check | Result | Notes |
| --- | --- | --- |
| 1×, 1.5×, and 3× are the only speeds; an illegal value does not stick | | |
| Same seed run to the same sim timestamp at 1× and 3×: fence HP, kills, and XP agree within a step of drift | | |
| 3× does not skip obvious projectile hits or fence hits | | |
| User pause freezes `time`; resume continues | | |
| Draft, placing, victory, and defeat stay frozen at every speed | | |
| Hide the tab for several seconds. Sim time does not jump on return | | |
| Return leaves a deliberate resume control (`pausedHidden`). It does not continue by itself | | |
| If the run was already user-paused, hiding and showing does not clear that pause | | |
| Opening codex, armory, settings, or howto freezes a playing run | | |
| Closing that screen does not silently resume | | |

`advance(state, 10)` on the scaffold simulates 0.25 s at 1×, not 10 s. A HUD that jumps by minutes after a short stall is a defect. A HUD that fails to move at 3× is also a defect.

## Lose, win, rewards, equipment

| Check | Result | Notes |
| --- | --- | --- |
| Fence HP reaches 0 and clamps there. Phase becomes defeat. Defenders have no health | | |
| Results show the settlement currency, difficulty, time, kills, and wave from the run, not a second formula | | |
| Victory after the scheduled waves, with no live enemies, shows a larger reward than a comparable defeat | | |
| Higher difficulty shows a higher multiplier and pays more for the same outcome | | |
| Reload on the results screen does not add currency again | | |
| A second visit to results does not add currency again | | |
| Abandon of a fresh run (`time < 30` and `kills < 3`) adds 0 | | |
| Restart does not pay a defeat reward | | |
| Armory prices, owned state, and equip slots match the profile after refresh | | |
| Buying with too little currency fails and keeps the balance | | |
| Permanent upgrades stop at their cap | | |
| A Normal run is startable with no purchases | | |
| Endless, if shown, does not pay a second settlement on later death | | |

## Save cycle

| Check | Result | Notes |
| --- | --- | --- |
| Pause mid-run, reload, Continue: same seed, tick-equivalent board, XP, draft, and RNG stream; run starts paused | | |
| Language, sound, and reduced motion survive reload and do not reset the run | | |
| Export produces JSON the user can see. Import of that JSON restores profile and run | | |
| Import of `{`, a huge string, a run with two heroes, a run with 9 slots, and `speed: 2` fails | | |
| A failed import leaves the previous profile currency and run untouched | | |
| No account, network API, or remote asset request in the network panel | | |

## Audio, motion, and combat readability

| Check | Result | Notes |
| --- | --- | --- |
| First load is silent | | |
| Sound toggle is visible. Audio starts only after a click or tap, then respects the toggle | | |
| Shot, hit, crit, kill, fence hit, merge, draft, victory, and defeat are distinguishable or intentionally quiet | | |
| Reduced motion stops nonessential screen shake and looping decoration | | |
| Projectiles, crits, and deaths are readable at 1× and still bounded at 3× | | |
| Sprites are original pixel art for the hero, six towers, hybrids, and seven enemy types. The boss is larger | | |
| No external image or music URL | | |

## Console, performance, accessibility

Watch the console from load through one draft, one merge cancel, one speed change, one hide/show, and results.

| Check | Result | Notes |
| --- | --- | --- |
| No uncaught exception | | |
| No missing-module 404 for the entry being tested | | |
| No persistent `NaN` in the HUD | | |
| Canvas element identity is stable across frames | | |
| DOM panels are not rebuilt on every animation frame | | |
| At 3× for about a minute, particle count stays bounded and the tab stays responsive | | |
| Buttons expose accessible names. The canvas has a name | | |
| Focus order reaches play, pause, speed, language, merge confirm, and cancel | | |
| Keyboard shortcuts only fire existing actions (pause, speed, cancel). They are not required for touch | | |
| Essential actions work without hover | | |
| Contrast of HUD text on the field is readable in both languages | | |
| 200% browser zoom at 320 px width still reaches confirm and cancel | | |

## Suggested manual script

Use one seed and record it.

1. Locale `zh-CN`, viewport 390×844. Confirm the menu language. Start Normal. Note sim time and XP when the first draft opens.
2. Choose a tower, cancel, confirm the same three cards, then place it. Switch to English. Confirm the run clock did not reset.
3. Pause, move the hero, move the tower back. Preview a merge and cancel. Set 3×, then 1×.
4. Hide the tab for 10 s. Confirm sim time and that resume is manual.
5. Resize to 320 px wide. Open codex and armory. Buy or fail a purchase on purpose.
6. On desktop, finish by losing or by spawning a victory in a test hook the build already has. Record settlement. Reload and record currency again.
7. Export, corrupt the text, import, confirm the good save remains. Import the original export.
8. Repeat only the overflow and 44 px checks in landscape.

## Fail conditions

Any one of these fails the build even if the rest pass:

- More or fewer than 10 slots, or a second hero, or a hero that merges or is replaced.
- Enemies damage defenders, or a lane-locked tower ignores an in-range enemy in another column.
- Draft, pause, or a hidden tab keeps simulating.
- Showing the tab resumes without a control.
- Merge cancel or a failed place deletes a unit.
- Full board offers a card that cannot be placed, merged, or used as an explicit replace.
- Reward increases on reload or on immediate abandon.
- Language switch or settings change starts a new run.
- Console exception during the script, or a raw `undefined` string in either language.
- A required control is hover-only or under 44 px at 320 CSS pixels.

## Out of scope for this document

Fun, exact difficulty tuning, and physical-device certification stay in the balance notes and a later device pass. Worker 24 did not execute this checklist. A completed table belongs in the lead QA notes after the browser session, with failures linked back to the file that owns the behavior.
