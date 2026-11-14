# Fencefall parallel development contract v1

This is a coordination checkpoint, NOT a completed game. `GAME_BRIEF.md` is the authoritative user design. All workers use Grok 4.7 Extra High (`xhigh`). Workers own only their assigned files. The lead integrator owns `src/shared.js`, `src/state.js`, `src/engine.js`, `src/boot.js`, `index.html`, `package.json`, the initial smoke test, and the integration of all returned work. Never overwrite another worker's files. The source snapshot supplied with an assignment is authoritative; no external project access is needed.

## Shared runtime

Browser ES modules, no framework or runtime dependencies. Node built-in test runner. Original assets generated locally in canvas or embedded data. All state is plain JSON-serializable data; no DOM, functions, class instances, Set/Map or live media objects in run/profile. Core modules must import in Node without a DOM. Visual modules must not access the DOM at import time. No external network, API, analytics or accounts at runtime.

Frozen shared exports in `src/shared.js`: `CONTRACT_VERSION=1`, `STEP=1/60`, `ARENA`, `DIFFICULTIES`, `BASE_TYPES`, `clamp(n,min,max)`, `distance({x,y},{x,y})`, `clone(value)`, `random(state)`, `uid(state,prefix)`, `emit(state,type,data)`, `slotGeometry(index)`, `hitSlot(x,y)`, `unitPosition(state,unitId)`, `canPlan(state)`, `createUnit(state,type,rank,kind)`. Use the supplied `random(state)` for all gameplay randomness. Rendering must never advance gameplay RNG. `createUnit` assigns a new id and plain initial unit fields; callers set additional metadata explicitly.

Geometry: 360×640 logical pixels. Spawn y=-16, enemy center x inside [14,346]. Fence y=450. Slot centers x=36+72*column, front row y=508, rear row y=592. Each slot is 64×72. Index 0–4 front, 5–9 rear. Hero starts in slot 7. Enemies stop with center y<=fenceY-radius and attack the shared fence. No lanes and no direct attacks on defenders. Every tower range is measured from its actual slot center. Back-row towers need sufficient range to reach the field. Default spawn mean=180, sigma≈60 with rejection sampling rather than boundary pileups. Lateral motion is small, smooth and bounded.

`DIFFICULTIES` contains easy/normal/hard/nightmare with health/speed/damage/count/reward/fence multipliers, bilingual names. Use these shared values; do not create a competing difficulty table.

## Run and profile shapes

`createRun({seed,difficulty,profile,runId})` and `createProfile(language)` are in `src/state.js`, re-exported by `src/engine.js`. Read the actual files in your supplied snapshot.

Run fields: `version,runId,seed,rng,nextId,time,tick,accumulator,phase,paused,hiddenPaused,speed,difficulty,wave,waveTime,director,kills,xp,nextDraftXp,draftLevel,fence,slots,enemies,projectiles,clouds,events,draft,pendingUnit,profileSnapshot,settlement,stats,initialized,endless`. Add optional serializable fields only within your domain and document them. Prefer `state.systems[domain]` for private subsystem state (create it lazily). Do not rename shared fields.

- phase: `playing | draft | placing | victory | defeat`. Menu screens live in UI, not run.phase. User pause and hidden pause are separate booleans. No simulation while phase is not playing or either pause flag is true.
- `fence:{hp,maxHp}`. Lose at hp<=0, clamp to zero. Defenders have no health.
- `slots:[{index,row,col,x,y,left,top,width,height,unit:null|Unit}]`, exactly ten.
- Unit: `{id,kind:'hero'|'tower'|'hybrid',type,rank,upgrades:{},cooldown,kills}`. Hero type `hero`. Base tower types exactly `bolt,fire,frost,lightning,poison,support`. Hybrid type is a recipe id. Hero is never merged, replaced or sold. Base/hybrid rank 1–4.
- Enemy: `{id,kind,x,y,hp,maxHp,speed,radius,damage,attackInterval,attackCooldown,xp,armor,driftPhase,driftVelocity,statuses:[],attacking:false,dead:false}`. Additional fields documented by enemy system. `dead` protects against multiple kill credit. All numeric fields finite.
- Status: `{type,power,remaining,sourceId,stacks?,tickTimer?}`. Supported types burn, poison, slow, stun, brittle; details owned by status worker. Slow power is remaining speed factor, e.g. 0.65, not percentage reduction. Update and expiry use simulation time.
- Projectile: `{id,sourceId,targetId,x,y,speed,damage,crit,tags:[],splash:0,chain:0,chainRange:70,pierce:0,visited:[],life:3}` plus optional serializable effect definitions. Hit semantics owned by combat. Projectiles must not skip collision at 3x.
- `director:{nextWave:0,queue:[],done:false}`, wave is number of started wave. `time` is seconds of active simulation. `waveTime` is domain owned. No real wall time in game rules.
- `draft:null|{options:[Option,Option,Option]}`, option `{id,kind:'tower'|'hero_upgrade',type?:baseType,upgradeId?:string,replace?:boolean}`. `pendingUnit` is null or `{unit:Unit,replace:boolean}`. Optional card fields must be serializable. No active ability choices.
- `stats:{damage,fenceDamage,merges,crits}`. Kills and XP are separate run fields. `events` is transient presentation queue, never a source of gameplay truth.
- `settlement:null|{runId,currency,difficulty,result,time,kills,wave}`. Settlement is immutable after first award. UI displays actual result, not guessed reward.

Profile: `{version:1,currency:0,equipmentOwned:[],equipped:{weapon:null,charm:null,armor:null},permanent:{damage:0,haste:0,vitality:0},settledRuns:[],best:{},settings:{language:'en'|'zh',sound:false,reducedMotion:false,difficulty:'normal'}}`. Additional bounded/versioned metadata allowed. Run copies the profile into profileSnapshot at start. Changing settings must not reset a run. Permanent power is bounded; Normal must be playable without it. No duplicate rewards on reload. Zero-time abandon gives zero.

## Stats, data and localization

UnitStats fields: `{damage,interval,range,critChance,critMultiplier,projectileSpeed,splash,chain,chainRange,pierce,burn?,slow?,poison?,aura?,mechanics:[]}`. `interval` seconds; range logical pixels. Defaults: critChance=0, critMultiplier=1.75, projectileSpeed=300, splash=0,chain=0,chainRange=70,pierce=0. Burn `{dps,duration}`; slow `{factor,duration}`; poison `{dps,duration,maxStacks}`; aura `{range,damage,haste}` where damage/haste are fractional additive bonuses, capped in combat. Towers without effects omit them. Synergy mechanics must be explicit and documented, not arbitrary strings with no implementation.

Bilingual content data always uses `name:{en,zh},description:{en,zh}`. UI uses `api.t(key,vars)` for interface strings and `localize(value,language)` for content. Language codes are en and zh. Do not infer language from unrelated personal files.

## Required worker module APIs and ownership

### 01 spawn/movement — `src/systems/movement.js`
Export `sampleSpawnX(state,mean=180,sigma=60)`, `spawnEnemy(state,kind,overrides={})` (returns and appends Enemy), `updateMovement(state,dt)`. Import ENEMIES and shared helpers. Use difficulty HP/speed/damage once. Spawn overrides may specify x/y/hp/maxHp/healthScale for director/tests. No kill/reward handling. Use bounded smooth drift, stop at fence. Dead/stunned enemies do not move. Slow factors applied without mutating permanent speed.

### 02 combat — `src/systems/combat.js`
Export `updateCombat(state,dt)`, `damageEnemy(state,enemy,amount,options={})`, `killEnemy(state,enemy,sourceId)`. Import getUnitStats and applyStatus. Handles automatic cross-column target acquisition, projectiles/chain/splash/pierce, crits, aura caps and fence attacks. `damageEnemy` options include sourceId,type,crit; armor is a fractional reduction bounded [0,0.8]. Kill credits and XP happen exactly once. Enemy xp comes from data. Removal of dead enemies may happen here or engine cleanup, but not twice. `damageEnemy` must be usable as a callback by status effects. Don't import engine.js or waves/drafts. Do not advance state.time/tick.

### 03 effects — `src/systems/status.js`
Export `applyStatus(enemy,status)`, `updateStatuses(state,dt,damageCallback)`, `getSpeedFactor(enemy)`. Callback signature matches damageEnemy(state,enemy,amount,options). Do not import combat (avoid cycle). Stack/refresh rules bounded and documented. Resolve DOT ticks proportionally or fixed cadence with accumulated dt; handle large steps and death safely. Emit meaningful status events when appropriate.

### 04 enemies/waves — `src/data/enemies.js`, `src/systems/waves.js`
ENEMIES is a record keyed shambler/runner/brute/armored/spitter/swarm/boss with Enemy base stats and bilingual names/descriptions. Export ENEMIES. Waves exports `updateWaves(state,dt)`, `getWaveInfo(state)`, `WAVES` (hand-tunable schedule). Import spawnEnemy and shared difficulties. Aim 12–16 minutes at 1x with continuous meaningful pressure; early first draft about20–40s. `director.done` only after final scheduled spawn. Victory decided by engine when done and no live enemies. Boss mechanics automatic and compatible with combat; no defender damage. Do not set victory prematurely.

### 05 hero — `src/systems/hero.js`
Export `HERO_UPGRADES` record (bilingual metadata, cap, stat effect), `getHeroStats(unit,state)`, `applyHeroUpgrade(state,id)` returning `{ok,reason?}`. Import getProfileBonuses from progression, shared helpers. At least six bounded run upgrades. Hero range must reach from rear center; baseline can survive first wave unaided. No active abilities. Applying upgrades only affects hero; do not pay/remove draft XP here.

### 06 tower catalog — `src/data/towers.js`
Export TOWERS record keyed six BASE_TYPES, each bilingual metadata and UnitStats in `stats`; `getUnitStats(unit,state)`. Hero delegates getHeroStats, hybrid reads RECIPES. Rank scales bounded; range remains useful across both rows. Import recipes and hero only, not combat. Stats must be finite and not mutate catalog/unit. Explain support targeting/aura. No random data initialization.

### 07 merging — `src/data/recipes.js`, `src/systems/merges.js`
RECIPES is an array of `{id,parents:[baseType,baseType],name,description,stats:UnitStats}`. At least8 true hybrid mechanics implemented by common stats/status schema; proposed special mechanics must specify integration hooks. Export RECIPES. Merges exports `previewMerge(state,fromIndex,toIndex)` returning `{ok,reason?,result?:Unit,description?:{en,zh}}` without mutation and `mergeUnits(state,fromIndex,toIndex)` returning `{ok,reason?,unit?}`. Same type and equal rank yields rank+1 up to4, including identical hybrids. Mixed base types require equal rank and a recipe, produce hybrid at that rank. No hybrid-to-different-type mixing. Hero always forbidden. Can merge only canPlan(state), distinct valid occupied slots. Successful merge consumes source, replaces target, increments stats.merges and emits merge. Invalid/cancel does nothing, including RNG/id counters (preview must not allocate uid). In preview use a placeholder id; apply allocates actual id transactionally.

### 08 drafts — `src/systems/drafts.js`
Export `generateDraft(state)` returning exactly3 distinct valid options, `updateDrafts(state)`, `chooseDraft(state,index)`, `placePending(state,slotIndex,{replace=false}={})`, `cancelPlacement(state)`. Return action `{ok,reason?}`. Import hero,TOWERS,shared. XP accumulates on kills; updateDrafts opens a paused phase when threshold reached, consumes threshold once, increments level and grows threshold. Caps and full board cannot create a dead end. Hero upgrades apply and return playing. Tower choice transitions placing; placement is tap-to-place. Replacement requires explicit flag and never replaces hero; UI must preview/confirm. Cancel returns to same draft with options intact. Draft/placing freeze simulation. A full board may give3 valid hero upgrades, or explicit safe replacement cards if capped. No free duplicate rewards through cancellation.

### 09 meta — `src/systems/progression.js`
Export EQUIPMENT record with bilingual metadata, slot, cost, bonuses; PERMANENT_UPGRADES record keyed damage/haste/vitality with cap/cost/bilingual metadata; `getProfileBonuses(profile)` returns `{damage,haste,range,critChance,fence,reward}` (fractions except fence HP/range pixels); `buyEquipment(profile,id)`, `equipItem(profile,id)`, `purchasePermanent(profile,id)`, `settleRun(profile,state)`. Mutations validate and return `{ok,reason?}`; settle returns the same settlement on repeats without awarding again. Use difficulty.reward. Rewards only finalized victory/defeat; no payout for fresh abandon (time<30 and kills<3). Fair partial progress with higher difficulty multiplier. Enforce bounded cost/levels. Store settled run IDs, keep enough recent IDs to cover saved-run replay; save/settlement order documented for atomic profile+run store handling.

### 10 persistence — `src/storage.js`
Export `loadProfile(storage=globalThis.localStorage)`, `saveProfile(profile,storage)`, `loadRun(storage)`, `saveRun(state,storage)`, `clearRun(storage)`, `exportSave(profile,state)` returning JSON string, `importSave(text,storage)` returning `{ok,profile?,run?,reason?}`. Missing optional storage uses localStorage; gracefully handle unavailable/quota/corrupt data. Validate finite bounded numeric state, exactly10 slots and one hero, enum values, version and input size. Do not silently accept arbitrary objects. Preserve deterministic RNG/status/director state and domain extensions. Loading run pauses deliberately. Exclude transient events/accumulator. Avoid double reward: restore a settled profile/run consistently. No overwriting a valid save on invalid import. Use app-specific keys only.

### 11 defender art — `src/render/defenders.js`
Export `drawDefender(ctx,unit,x,y,{time=0,scale=1,flash=0}={})`, `defenderSize(unit)` returning `{width,height}`. Bottom-center anchors. Crisp original 24–40px detailed sprites, hero, six towers and hybrids with readable rank. Cache canvases lazily; no DOM at import. Handle aliases and unknown types gracefully. Canvas coordinates logical. No game state mutation/RNG.

### 12 enemy art — `src/render/enemies.js`
Export `drawEnemy(ctx,enemy,x,y,{time=0,scale=1,flash=0}={})`, `enemySize(enemy)`. Same bottom-center convention; enemy core x/y represent center so renderer offsets anchor correctly. Distinct seven enemy types, boss bigger, walk/attack/hit/death cues using time/status. Original sharp pixel sprites, no external assets. No module-load DOM.

### 13 world art — `src/render/world.js`
Export `drawWorld(ctx,state,{time=0,reducedMotion=false}={})`, `drawIcon(ctx,id,x,y,size=16)`. World covers logical360x640, clear open enemy field, layered background, fence appearance responding to health, exactly2x5 visible slots. No draw of units/enemies/projectiles (renderer owns ordering). Art readability above decoration. No state mutation.

### 14 renderer — `src/render/renderer.js`
Export `createRenderer(canvas)` returning `{draw(state,ui={}),ingestEvents(events),resize(),destroy(),pointFromClient(clientX,clientY),hitSlot(clientX,clientY)}`. ui `{selectedSlot:-1,hoverSlot:-1,settings:{reducedMotion},range:true}`. Import drawWorld,drawDefender,drawEnemy,createEffects. Logical coordinates, crisp scaling, high-DPI sizing and correct touch conversion. Draw range circle only selected defender; draw all projectile/status/HP cues. Enemy center→bottom-anchor conversion consistent. Do not mutate simulation or consume state.events directly; receive event copies. Performance bound particles. Return -1 for clicks outside slots.

### 15 feedback — `src/render/effects.js`, `src/audio.js`
`createEffects()` returns `{ingest(events),update(dt),draw(ctx,{reducedMotion=false}={}),clear()}`. `createAudio()` returns `{unlock(),setEnabled(boolean),playEvents(events),destroy()}`. Local Web Audio only, off by default and gesture unlock; no music downloads. Event types shot/hit/kill/fence_hit/merge/draft/victory/defeat/ui; include available x/y,damage,crit,towerType. Handle missing fields defensively. VFX must be readable and bounded, honor reduced motion. No active ability UI.

### UI action contract (16/17/18)
Supplied `api` object: `{getState(),getProfile(),t(key,vars),act(action,payload),getUI()}`. getUI returns `{screen,selectedSlot,mergeFrom,mergePreview,message}`. UI modules do not mutate run/profile. All interactions call api.act. UI may hold small ephemeral local state; main controller owns gameplay selection. API actions: start({difficulty,seed?}),resume,restart,abandon,pause,speed({value}),language({value}),sound,screen({name}),selectSlot({index}),move({from,to}),chooseDraft({index}),place({index,replace:false}),cancelPlacement,mergePreview({from,to}),mergeConfirm({from,to}),mergeCancel,buyEquipment({id}),equip({id}),upgradePermanent({id}),exportSave,importSave({text}). `screen` names menu/battle/armory/codex/settings/howto/results. Use native semantic buttons. Provide `data-action` and `data-testid` labels for tests. No inline event-handler strings and no unsafe user-string HTML.

### 16 shell — `src/ui/shell.js`, `src/styles.css`
Export `mountShell(root,api)` returning `{render(),destroy(),canvas,overlayRoot,panelRoot,menuRoot}`. Root contains permanent canvas (never recreate every frame), live HUD, field interactions and panel containers. UI render called on meaningful changes / throttled, not every animation frame. Wire canvas pointer selection to slot geometry; do not have both shell and build panel duplicate actions. Provide data-ui overlay/panel/menu containers for main to call panel renderers. CSS supports ~320px mobile and Mac, touch targets44px, landscape constraints without requiring orientation, portrait field. Shared component classes .btn,.btn-primary,.panel,.card,.grid,.muted,.badge available to other UI modules. Initially no preselected style questionnaire or irrelevant content. Add needed keyboard shortcuts that invoke existing actions, no active ability.

### 17 build UI — `src/ui/build-panel.js`
Export `renderBuildPanel(container,state,api)`. It owns selection/details panel, draft/placing screen, merge previews/confirmation/cancel. Caller can use overlayRoot for modal phase and panelRoot for ordinary inspection; render must clear irrelevant state safely. Display translated actual stats/getUnitStats, costs and recipe results. Avoid impossible actions and disabled silent dead ends. Tap-friendly move/merge buttons; hero clearly protected. Use common CSS classes; small module-local styles may be injected once with unique id. Do not overwrite full shell/canvas. Include labels for exactly3 draft choices and their immediate effects.

### 18 meta UI — `src/ui/meta-panel.js`
Export `renderMetaPanel(container,screen,state,profile,api)`. Menu, armory, codex, settings, howto, results. Import content catalogs and localization localize. Actual prices/currency/equipment effects, difficulty rewards and outcomes. Original game branding Fencefall / 最后一道防线. Chinese/English, save/import/export controls, clear Play/Continue and Restart. No active abilities; teach placement, range and merges. Common CSS components; safe DOM construction.

### 19 localization — `src/i18n.js`
Export `MESSAGES:{en:{},zh:{}}`, `t(language,key,vars={})`, `localize(value,language)`, `formatNumber(value,language)`. Placeholder interpolation {name}; unknown key returns readable key, never undefined. Provide comprehensive keys for modules; at minimum: title,subtitle,play,continue,restart,back,close,confirm,cancel,pause,resume,planning,speed,language,sound,soundOn,soundOff,reducedMotion,difficulty,easy,normal,hard,nightmare,rewardMultiplier,fence,wave,xp,kills,time,currency,hero,towers,rank,damage,range,attackSpeed,crit,select,place,move,merge,mergePreview,mergeConfirm,mergeCancel,heroProtected,invalidMerge,fullBoard,chooseUpgrade,chooseOneOfThree,chooseSlot,cancelPlacement,replace,replaceConfirm,armory,codex,settings,howto,results,victory,defeat,earned,buy,equip,equipped,owned,upgrade,cost,level,maxLevel,insufficientCurrency,locked,recipes,ingredients,effect,emptySlot,save,exportSave,importSave,importError,importSuccess,seed,newRun,abandon,abandonConfirm,pausedHidden,loading,noSave,helpPlacement,helpMerge,helpDraft,helpFence,helpRange,helpSpeed,damageDealt,mergesMade,runComplete,version. Add likely compound tutorial/explanation keys. Content catalog names/descriptions stay in catalogs, not duplicated here.

### 20 simulation tests — `tests/simulation.test.mjs`
Node built-in tests using frozen and domain APIs. Validate Gaussian distribution/bounds, lateral movement, geometry cross-column targeting, fence-only attacks, one hero, status expiry/death, pause/speed invariance and restart. Real assertions and sensible deterministic thresholds; do not fabricate test results or test merely that a function exists. Do not edit engine or smoke tests.

### 21 progression tests — `tests/progression.test.mjs`
Node built-in tests for merges (preview nonmutation, hero protection, rank limits, distinct mechanics), three valid choices/full board, hero upgrade caps, equipment prices/effects, reward idempotency/difficulty, invalid imports/corrupt saves and profile/run independence. Use a fake in-memory Storage implementation. Tests expose actual defects, not assumptions contradicting contract.

### 22 balance — `scripts/balance.mjs`, `docs/BALANCE_METHOD.md`
Seeded auto-player harness consuming engine/domain actions; choose drafts, place, merge, repeat seeds across easy/normal/hard. Record survival/win, active time, damage, fence HP, tower mix, currency, dead time. Runs headlessly with bounded steps/time. No hidden game cheats or hand-filled result files. Export `simulateRun({seed,difficulty,maxTime,policy})` as reusable function. CLI writes actual report to artifacts/ when invoked. Distinguish automated-policy strength from game difficulty and fun. Full game target10–20min at1x; no proof-by-forced-victory.

### 23 packaging — `scripts/build.mjs`, `.github/workflows/ci.yml`, `README.md`, `docs/DELIVERY.md`
Static and portable standalone HTML build. May use esbuild as development dependency; report required devDependency to integrator (do not own package.json). Single bundle must inline CSS and contain all runtime assets; playable without external API. CI npm ci/test/build. Document actual commands and current capabilities, no fabricated passing tests or completed features. No public deployment or secrets. Source remains private GitHub repo. Chinese and English concise instructions. Build source paths src/boot.js,src/styles.css,index.html; output dist/index.html plus useful normal static output if needed.

### 24 independent review — `docs/CONTRACT_REVIEW.md`, `docs/BROWSER_ACCEPTANCE.md`
Review this exact checkpoint and contract for integration hazards, missing semantics and contradictory expectations; distinguish actual scaffold findings from prospective issues. Propose specific fixes, with file/API pointers. Browser checklist includes 390×844,320px,desktop, both languages, all speeds, merge preview/cancel/full board, pause/hidden/save/reward cycles, console errors, performance and accessibility. Do not claim final game tested; this is a pre-integration review. No source edits.

## Integration order and validation

Lead initializes profile bonuses once, then fixed step: advance time/tick → updateWaves → updateMovement → updateStatuses(damageEnemy) → updateCombat → cleanup → fence defeat / completed-director victory → updateDrafts if still playing. Exact ordering can be refined centrally but avoid duplicate time/XP/status ticks. UI waits for decisions, not active abilities. Events drained once by lead to renderer/audio. Persistent rewards settled and saved exactly once. `advance` uses fixed steps at1/1.5/3 with wall delta bounded for hidden tab safety.

After workers return: inspect syntax/imports/ownership, assemble core then tests, integrate renderer/UI, run meaningful browser checks, balance, fix failures, build standalone, commit and push to existing private origin. Existing placeholder shell is not acceptance. No worker may declare the entire project finished. Maintain actual QA results and limitations.
