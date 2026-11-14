# Fencefall / 最后一道防线 — approved game direction

The user supplied the design below and explicitly authorized autonomous implementation in Cursor, a new folder/repository, and pushing the project to GitHub. This supersedes all earlier Emberline proposals. Make routine choices, implement, test, play, balance, and iterate without returning merely a plan. Do not enable additional billed usage or purchase services.

MODEL PREFERENCE: The user explicitly requires Extra High reasoning AND Fast throughout. Keep Cursor on Grok 4.7 Extra High Fast and every local worker on `grok-4.7-build-fast` with `xhigh`; do not lower reasoning or turn off Fast. Parallel independent agents are authorized, including the local Grok Build CLI using existing account allowance.

## Non-negotiable user design

- Plants vs. Zombies is a conceptual reference only. Use original names, sprites, sounds, UI and characters.
- Portrait/vertical battlefield. Enemies enter from the TOP. Defenders sit at the BOTTOM in exactly TWO ROWS of FIVE slots (10 total).
- NO enemy lanes. Spawn horizontal positions from a centered, bounded normal distribution: the middle is more likely. Enemies move toward the fence with small smooth lateral drift, remaining inside the arena.
- A fence separates enemies from defenders. Enemies attack the shared fence HP, never defenders. Fence destruction is defeat.
- Defenders acquire and attack any enemy within their actual geometric range, not just enemies in their column. Make ranges and targeting understandable.
- Sharp, detailed 2D pixel art, not large Minecraft-like blocks and not generic vector circles as the final art. Clear silhouettes, texture, animation, crisp edges and deliberate limited palettes.
- Start each run with exactly ONE independent hero and no other towers. The hero never merges. As the run progresses, present a choice of THREE options: new towers and/or hero upgrades. Pause gameplay during these decisions.
- Other towers can combine: same type for generally stronger stats, different types for explicit synergistic hybrids. Preserve the hero independently. Make results understandable before confirming a merge. Discoverable recipes and surprising strong combinations are the main replay hook.
- Target 10–20 minutes at 1x for a complete run. Offer exactly 1x, 1.5x and 3x speed controls, with game-time-correct simulation at all speeds.
- Player role: plan, build, decide, watch. NO active combat abilities and NO manually controlled hero. Towers and hero attack automatically.
- Adjustable difficulty. Higher difficulties have better reward multipliers. Persistent earned rewards buy hero equipment and/or permanent hero upgrades that give a head start in later runs.
- Play in both Mac/desktop and phone browsers, with touch-friendly controls and a responsive portrait field.
- Satisfying combat is a priority: readable projectiles, hit feedback, enemy reactions, critical hits, impactful merges, distinct tower identities, restrained screen effects, good sound options.
- Complete Chinese AND English UI. Language can be changed without losing progress.
- New folder, new Git repository, push to user's GitHub using existing connected authentication. Default repository visibility PRIVATE. Repo name `fencefall` (use a new nonconflicting suffix if already owned for unrelated work). Do not overwrite another project. No paid hosting or public deployment is requested.

## Concrete design defaults (use these unless a better implementation preserves user requirements)

- Hero occupies one of the 10 slots, initially rear-center; clearly marked non-mergeable. Allow moving units during a paused planning phase using tap-select then tap-target (drag can be optional). Empty slots permit placement. Hero movement is placement only, never active combat control.
- The fence is immediately in front of both rows. Use a compact portrait logical coordinate system that scales consistently. Define ranges so rear-row defenders can actually engage threats; do not accidentally make most of their circles unreachable.
- Seeded PRNG. Sample bounded/truncated Gaussian spawn X by rejection, not hard-clamping a Gaussian and piling enemies on edges. Small time-smoothed lateral drift must never create discrete columns. Render enough enemies to see center weighting and variation.
- First draft early (roughly 20–40 seconds of meaningful play). Maintain an explicit XP/progress indicator and a predictable route to further drafts. Each draft has exactly three valid options; avoid impossible placements and unusable choices. A full board should still allow sensible hero upgrades, same-type merges or an explicit replacement/merge flow.
- At least 6 base tower roles and 8 genuinely different mixed recipes for the first complete version (e.g. projectile, fire, frost, lightning, poison, support). Same-type merges increase rank with visible stats; mixed recipes have meaningful mechanics, not just different names/colors. Use a data-driven recipe table and an in-game codex. Explain incompatibility and preserve units on canceled/invalid merges. Pick a coherent rule for ranked ingredients and cap runaway stacking.
- Include multiple enemy roles with readable differences, boss events, a normal victory condition and optional post-victory endless mode only after the main loop works. Difficulty must alter a documented set of enemy parameters and reward multipliers.
- Design a run for approximately 12–16 minutes of active simulation at 1x; planning time can extend it. Do not create empty waiting merely to hit a duration target. Show wave/run progress and incoming threats.
- Persistent equipment and hero upgrades should give bounded advantages without making Normal require grinding. Explain costs, stat changes, equipping and reward multipliers. Prevent double payout on reload/retry and rewards for instantly abandoning a fresh run. Keep run state separate from permanent profile and settings. Provide versioned save validation and JSON import/export where useful.
- Pause when hidden; resume deliberately. Drafts, menus, defeat and victory freeze simulation correctly. Speed changes must not scale rewards or cause skipped collisions. Autopause must not erase an explicit paused state.
- Sound off initially, with a clear toggle and user-gesture-safe local synthesized effects. Reduced motion option. Buttons at least about 44px on touch screens; avoid hover-only essential interactions.
- Start in Chinese if browser locale is Chinese, otherwise English; provide persistent 中 / EN switch. Translate every player-facing screen, tutorial, draft card, equipment, merge recipe, tooltip, result and error. Use localized number formatting where appropriate.

## Technical and delivery requirements

- This folder is the only game project. Do not inspect unrelated personal files, projects, chat history or NAS.
- A maintainable small static web project with separate deterministic game logic, data, rendering, UI/state and persistence is preferred. Choose the stack yourself. Keep the core simulation runnable in headless tests and avoid unnecessary frameworks/backends.
- No account/login, analytics, external runtime API or paid service. Runtime assets must be local/original. Include source assets or generation source. Generate a portable standalone HTML build when feasible alongside normal static deployment assets.
- Produce clear README instructions, a documented game design/balance reference, and QA notes distinguishing automated tests, actual browser tests and remaining subjective tuning.
- Add a sensible .gitignore. Commit source, docs and a useful playable build; exclude dependency folders, private saves, auth files, machine-specific paths, temporary logs and browser-test profile data. No credentials in source or Git history.
- Use the existing authenticated GitHub connection/CLI to create a new private repository and push. Verify remote URL, visibility and remote commit. If authentication is blocked, finish all local work first and report the precise blocker without exposing tokens. Do not request new access scopes unless truly needed.
- Leave a local preview server running on loopback and report its URL and the main playable file when finished. Hosting the public game is not part of this authorization.

## Required iteration and acceptance checks

Do more than produce one generated draft. Work through build → automated checks → browser play → balance/polish → repeat on actual findings.

1. Deterministic simulation tests: Gaussian distribution is center-weighted and bounded; lateral movement continuous and bounded; target selection uses real range across columns; enemies attack fence only; starting roster exactly one hero; no hero merging; every defined same-type and mixed recipe works and has meaningful effects; invalid actions are non-destructive.
2. Timing tests: fixed steps, fire cadence, movement, status durations and damage approximately invariant over 1x/1.5x/3x given the same elapsed simulation time. Pause/draft/hidden stop the appropriate simulation; restart clears all timers and transient entities.
3. Progression: valid three-choice drafts, safe full-board behavior, equipment costs and effects, higher difficulty reward multipliers, single settlement of rewards, corrupt-save handling and save/resume. Test actual boundary cases, not functions asserting themselves.
4. Bilingual completeness: both languages cover all screens and dynamic content, switch during a run without resetting it, long labels fit on narrow displays.
5. Use actual browser automation to exercise the core flow: play, first draft, place, select, move, merge preview/confirm/cancel, view codex, pause, speeds, lose/win, rewards/equipment, replay. Check errors and layout at desktop and approximately 390x844 and 320px-wide phone viewports. Testing at phone sizes is not a claim of physical-device testing.
6. Run several deterministic balance simulations across difficulty/seeds/strategies. Confirm that baseline Easy is survivable and Normal offers viable builds without paid/permanent upgrades. Run time should land near the requested range; record actual results and limitations. Simulation alone does not prove fun.
7. Inspect the art and combat in motion. Replace placeholder blobs with crisp original pixel sprites, meaningful projectile identities and readable animations. Mobile placement and merging must be discoverable.
8. Fix meaningful failures and repeat the affected checks. Finish with a usable game and pushed repository, then summarize actual features and verification. Do not claim checks you did not run.

The user said: "Make cursor grind! I have almost unlimited grok usage." Treat this as permission for sustained meaningful implementation and refinement using the existing allowance, not permission to incur new purchases. The user has delegated remaining game decisions and does not want repeated routine questions.
