# Browser acceptance — 2026-11-14

This records executed integration checks, replacing the scaffold-only checklist. The test browser was the local in-app Chromium browser. Phone checks used CSS viewport resizing, not a physical device.

## Passed

- 59 Node tests: movement, centered bounded spawning, cross-column geometric targeting, fence-only damage, fixed time steps at all three speeds, pause, terminal states, hero protection, merges, drafts, purchases, settlement, storage validation, and controller reload.
- Source browser: first draft appeared naturally after about 22 simulated seconds, with exactly three choices. Tower placement, placement cancel back to the same offer, passive hero upgrades, and Chinese/English switching preserved the run.
- Mixed merge: preview became visible; cancel kept both towers; confirm produced Wildfire and consumed only the source. The hero remained independent.
- Reload: a valid paused saved battle was available through Continue and restored its units and time.
- Damaged import: malformed JSON preserved the complete exported save byte-for-byte.
- Progression UI: imported a save from an actual automated Easy victory (seed12,13:48,367kills,146currency). Bought/equipped Splinter Bow65 and Fence Nails45, then bought Deep Roots35. Wallet became1 and remained1 after reload. A new Normal run began with642 fence HP (600+30+12).
- Phone390×844: compact draft cards fit; battlefield grew from146×259 to 340×604 in the final compact layout after details moved into an optional drawer. No horizontal page overflow.
- Phone320×844: compact draft cards fit without horizontal page overflow. The battlefield measured320×569; main controls had44px minimum height. Details opened and closed through ordinary clicks at both phone widths.

## Balance evidence

Held-out seeded policy simulations (12,25,68,99,123,365,2026,8080): Easy greedy8/8 victories, Easy aggressive8/8, Normal aggressive6/8, Normal greedy0/8. Victories completed around820–835 simulated seconds. No simulation errors. These are automated policies, not estimates of human win rates. Normal rewards coherent damage builds; Hard and Nightmare have not been calibrated with human play.

## Fixes found by browser checks

- Merge preview was rendered into a hidden overlay.
- Reloaded saves existed but Continue could not see them.
- Selected-defender details reduced the mobile battlefield to an unreadable size.
- Heavy Draw mislabeled critical damage as critical chance.
- Import errors and the merge-preview message exposed internal reason names.

## Latest checkpoint checks

- `npm test`:59 passed; `npm run build`:26 modules, no warnings, no dependencies.
- Standalone build served at `http://127.0.0.1:4174/`:new run starts, automatic combat advances, pause works, no browser console errors observed.
- Live save audit:49,298 frames/decision states through a Normal aggressive victory and29,631 through a Normal control defeat all exported successfully (78,929 total). Fixed negative floating-point DOT remainders and projectile bounds that disagreed with combat culling; two regression tests cover these failures.
- Further enemy art polishing and recursive improvement were handed to Cursor at the user's request. Later commits need their own checks; this record does not certify future changes.

## Limits

No physical phone or Safari session was available in this pass. Browser storage is local to the browser and origin; use save export/import to transfer progress. Enjoyment and long-term balance still need player feedback. The private repository is uploaded; public hosting and GitHub Actions are not enabled.
