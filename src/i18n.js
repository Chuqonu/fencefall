/**
 * Fencefall / 最后一道防线 — player-facing strings.
 *
 * Language codes are only "en" and "zh" (Simplified Chinese). Catalog names and
 * descriptions (towers, enemies, recipes, equipment, hero upgrades, difficulty
 * names) stay on those objects as {en, zh}. Pass them through localize().
 * This table is interface chrome, tutorials, stat labels, and action reasons.
 *
 * Glossary: the fence is 栅栏. A draft is 整备. The three-choice prompt is 三选一.
 * Rank is 阶; an upgrade level is 级. Board slots are 格子, and a payout is 报酬.
 *
 *   t(language, key, vars)          module lookup. Language is the first argument.
 *   api.t(key, vars)                controller wrapper; do not swap these call styles.
 *   localize(value, language)       pick a bilingual content string.
 *   formatNumber(value, language)   grouped number, or "—" when the value is not finite.
 *   formatDuration(seconds, language)  fight clock, e.g. 12m 05s / 12分05秒.
 *   defaultLanguage(locale?)        zh* → zh, otherwise en. Reads navigator only when called.
 *   normalizeLanguage(language)     collapse any locale tag to "en" or "zh".
 *
 * Unknown keys return the key string, never undefined. Placeholders are {token}.
 * A missing placeholder is left as written. Numeric vars are formatted. Vars that
 * are {en, zh} objects are localized. Percent text should be passed as a string
 * such as "5%"; a raw fraction is only grouped, not converted to a percent.
 *
 * Action toasts can call t(language, reason). Prefer these reason codes:
 * heroProtected, invalidMerge, notPlanning, sameSlot, invalidSlot, emptySlot,
 * reasonEmpty, rankMismatch, noRecipe, maxRank, hybridMix, missingUnit, occupied,
 * replaceRequired, invalidChoice, noDraft, notPlacing, noPending, fullBoard,
 * insufficientCurrency, maxLevel, alreadyOwned, notOwned, alreadyEquipped,
 * wrongSlot, unknownItem, unknownUpgrade, alreadySettled, freshAbandon,
 * notFinished, corruptSave, invalidSave, versionMismatch, tooLarge,
 * quotaExceeded, storageUnavailable, importEmpty.
 */
const ROWS = [
  // Brand and navigation
  ['title', 'Fencefall', '最后一道防线'],
  ['titleLockup', 'Fencefall · 最后一道防线', 'Fencefall · 最后一道防线'],
  ['subtitle', 'One fence. Ten slots. No lanes.', '一道栅栏，十个格子，没有分路。'],
  ['tagline', 'Plan, draft, and merge. The towers do the fighting.', '布阵、整备、合成。战斗交给防御塔。'],
  ['play', 'Play', '开始'],
  ['playHint', 'Start a new fight', '开始一场新的战斗'],
  ['continue', 'Continue', '继续'],
  ['continueHint', 'Resume the saved fight', '继续已保存的战斗'],
  ['restart', 'Restart', '重开'],
  ['back', 'Back', '返回'],
  ['backToBattle', 'Back to battle', '返回战斗'],
  ['close', 'Close', '关闭'],
  ['confirm', 'Confirm', '确认'],
  ['cancel', 'Cancel', '取消'],
  ['ok', 'OK', '确定'],
  ['yes', 'Yes', '是'],
  ['no', 'No', '否'],
  ['menu', 'Menu', '菜单'],
  ['battle', 'Battle', '战斗'],
  ['newRun', 'New run', '新对局'],
  ['abandon', 'Abandon', '放弃'],
  ['loading', 'Loading', '加载中'],
  ['loadingGame', 'Raising the fence…', '正在架起栅栏…'],
  ['save', 'Save', '保存'],
  ['saved', 'Saved', '已保存'],
  ['version', 'Version', '版本'],
  ['versionValue', 'Version {version}', '版本 {version}'],
  ['seed', 'Seed', '种子'],
  ['seedValue', 'Seed {seed}', '种子 {seed}'],
  ['randomSeed', 'Random seed', '随机种子'],
  ['copy', 'Copy', '复制'],
  ['copied', 'Copied', '已复制'],
  ['and', 'and', '和'],
  ['or', 'or', '或'],
  ['all', 'All', '全部'],
  ['search', 'Search', '搜索'],
  ['clear', 'Clear', '清除'],
  ['none', 'None', '无'],
  ['unknown', 'Unknown', '未知'],
  ['choose', 'Choose', '选定'],

  // HUD
  ['pause', 'Pause', '暂停'],
  ['resume', 'Resume', '恢复'],
  ['paused', 'Paused', '已暂停'],
  ['pausedHidden', 'Paused while this page is hidden', '页面已隐藏，战斗暂停'],
  ['pausedHiddenBody', 'The fight is stopped. A pause you turned on stays on when you come back.', '战斗已停止。你打开的暂停在回到页面后仍然保留。'],
  ['planning', 'Planning', '布阵'],
  ['planningHint', 'Planning is open. The fight is frozen.', '正在布阵，战斗已冻结。'],
  ['playing', 'Fighting', '战斗中'],
  ['speed', 'Speed', '速度'],
  ['speed1', '1×', '1×'],
  ['speed15', '1.5×', '1.5×'],
  ['speed3', '3×', '3×'],
  ['speedValue', '{value}×', '{value}×'],
  ['speedHint', '1×, 1.5×, and 3× share the same fight clock.', '1×、1.5× 和 3× 共用同一个战斗时钟。'],
  ['speedWhilePaused', 'The new speed is used when the fight is moving.', '新的速度会在战斗继续推进时生效。'],
  ['fence', 'Fence', '栅栏'],
  ['fenceHp', 'Fence {current}/{max}', '栅栏 {current}/{max}'],
  ['fenceDanger', 'Fence is failing', '栅栏岌岌可危'],
  ['fenceSafe', 'Fence is holding', '栅栏仍然稳固'],
  ['wave', 'Wave', '波次'],
  ['waveNumber', 'Wave {wave}', '第 {wave} 波'],
  ['waveIncoming', 'Incoming', '即将到来'],
  ['bossWarning', 'Boss approaching', '首领接近'],
  ['finalWave', 'Final wave', '最后一波'],
  ['nextWave', 'Next wave', '下一波'],
  ['wavesSpawned', 'All waves have spawned', '各波敌人已出场'],
  ['wavesStarted', 'Waves started', '已开始波次'],
  ['clearRemaining', 'Defeat the enemies still on the field', '击败场上剩余的敌人'],
  ['xp', 'XP', '经验'],
  ['experience', 'Experience', '经验'],
  ['xpProgress', 'XP {current}/{next}', '经验 {current}/{next}'],
  ['nextDraft', 'Next draft', '下次整备'],
  ['draftLevel', 'Draft {level}', '第 {level} 次整备'],
  ['kills', 'Kills', '击杀'],
  ['killsValue', 'Kills {count}', '击杀 {count}'],
  ['kill', 'Kill', '击杀'],
  ['time', 'Time', '时间'],
  ['activeTime', 'Fight time', '战斗时间'],
  ['timeHint', 'This clock counts the fight only. Drafts and menus do not add time.', '这个时间只计算战斗。整备和菜单不计入。'],
  ['enemy', 'Enemy', '敌人'],
  ['enemies', 'Enemies', '敌人'],
  ['enemyCount', 'Enemies {count}', '敌人 {count}'],
  ['boss', 'Boss', '首领'],
  ['shot', 'Shot', '射击'],
  ['hit', 'Hit', '命中'],
  ['fence_hit', 'Fence hit', '栅栏受击'],
  ['ui', 'Notice', '提示'],

  // Difficulty
  ['difficulty', 'Difficulty', '难度'],
  ['easy', 'Easy', '轻松'],
  ['normal', 'Normal', '标准'],
  ['hard', 'Hard', '困难'],
  ['nightmare', 'Nightmare', '噩梦'],
  ['rewardMultiplier', 'Reward multiplier', '报酬倍率'],
  ['rewardMultiplierValue', '×{value}', '×{value}'],
  ['rewardLine', 'Reward ×{value}', '报酬 ×{value}'],
  ['timesValue', '×{value}', '×{value}'],
  ['percentValue', '{value}%', '{value}%'],
  ['higherDifficultyPays', 'Higher difficulties pay more.', '难度越高，报酬越多。'],
  ['difficultyHint', 'Harder fights pay a higher multiplier.', '战斗越难，报酬倍率越高。'],
  ['difficultyEasyHint', 'Softer enemies and a baseline reward.', '敌人更温和，报酬为基准。'],
  ['difficultyNormalHint', 'The intended fight, with a higher reward.', '预定难度，报酬更高。'],
  ['difficultyHardHint', 'Stronger enemies and a larger reward.', '敌人更强，报酬更大。'],
  ['difficultyNightmareHint', 'The hardest fight and the largest reward.', '最艰苦的战斗，报酬最高。'],
  ['startDifficulty', 'Play on {difficulty}', '以{difficulty}开始'],

  // Settings and language. 中 / EN are the persistent switch labels.
  ['settings', 'Settings', '设置'],
  ['language', 'Language', '语言'],
  ['languageZh', '中文', '中文'],
  ['languageEn', 'English', 'English'],
  ['langZh', '中', '中'],
  ['langEn', 'EN', 'EN'],
  ['languageCurrent', 'Language: {language}', '语言：{language}'],
  ['languageHint', 'You can change language during a run. Progress stays.', '对局中可以切换语言，进度会保留。'],
  ['sound', 'Sound', '声音'],
  ['soundOn', 'Sound on', '声音开'],
  ['soundOff', 'Sound off', '声音关'],
  ['soundHint', 'Sound starts off. The first tap turns on audio for this browser.', '声音默认关闭。在此浏览器中第一次点按后才会打开音频。'],
  ['reducedMotion', 'Reduced motion', '减少动效'],
  ['reducedMotionOn', 'Reduced motion on', '减少动效：开'],
  ['reducedMotionOff', 'Reduced motion off', '减少动效：关'],
  ['reducedMotionHint', 'Cuts extra flashes, shakes, and motion.', '减少额外的闪光、震动和动态。'],

  // Draft, placement, movement
  ['draft', 'Draft', '整备'],
  ['draftTitle', 'Draft', '整备'],
  ['chooseOneOfThree', 'Choose one of three', '三选一'],
  ['draftOnField', 'Already on the field', '场上已有'],
  ['draftNewType', 'Not on the field yet', '场上还没有'],
  ['chooseUpgrade', 'Choose an upgrade', '选择升级'],
  ['chooseSlot', 'Choose a slot', '选择格子'],
  ['chooseTower', 'Add {name}', '加入{name}'],
  ['chooseHeroUpgrade', 'Hero: {name}', '英雄：{name}'],
  ['chooseReplace', 'Replace a tower with {name}', '用{name}替换一座塔'],
  ['immediateEffect', 'Takes effect now', '立即生效'],
  ['cancelPlacement', 'Cancel placement', '取消放置'],
  ['placementCanceled', 'Placement canceled. The three choices are unchanged.', '已取消放置，三个选项没有变化。'],
  ['placing', 'Placing', '放置中'],
  ['placingTitle', 'Place the tower', '放置防御塔'],
  ['placingHint', 'Empty slots are open. Replacing a tower needs confirmation. The hero cannot be replaced.', '空位可以直接放置。替换防御塔需要确认。英雄不能被替换。'],
  ['tapToPlace', 'Tap a slot to place', '点一个格子来放置'],
  ['tapToMove', 'Tap a destination slot', '点一个目标格子'],
  ['fullBoard', 'The board is full', '格子已满'],
  ['fullBoardHint', 'Upgrade the hero, or replace a tower.', '可以升级英雄，或替换一座塔。'],
  ['emptySlot', 'Empty slot', '空位'],
  ['select', 'Select', '选择'],
  ['details', 'Details', '详情'],
  ['hideDetails', 'Hide details', '收起详情'],
  ['selected', 'Selected', '已选中'],
  ['selectedUnit', 'Selected unit', '当前单位'],
  ['selectToInspect', 'Select a defender to see its stats', '选中防守者以查看能力'],
  ['noSelection', 'Nothing selected', '未选择'],
  ['clearSelection', 'Clear selection', '取消选择'],
  ['place', 'Place', '放置'],
  ['move', 'Move', '移动'],
  ['moveHere', 'Move here', '移到这里'],
  ['swap', 'Swap', '对调'],
  ['moved', 'Moved', '已移动'],
  ['swapped', 'Swapped', '已对调'],
  ['frontRow', 'Front row', '前排'],
  ['rearRow', 'Rear row', '后排'],
  ['slotNumber', 'Slot {index}', '格子 {index}'],
  ['sourceSlot', 'Source slot', '来源格子'],
  ['targetSlot', 'Target slot', '目标格子'],
  ['occupied', 'That slot is occupied', '这个格子已有单位'],
  ['slotOccupied', 'That slot is occupied', '这个格子已有单位'],
  ['tower', 'Tower', '防御塔'],
  ['towers', 'Towers', '防御塔'],
  ['hero', 'Hero', '英雄'],
  ['hybrid', 'Hybrid', '混合'],
  ['hero_upgrade', 'Hero upgrade', '英雄升级'],
  ['heroUpgrades', 'Hero upgrades', '英雄升级'],
  ['runUpgrades', 'This run', '本局强化'],
  ['nonMergeable', 'Cannot merge', '不可合成'],
  ['autoAttack', 'Attacks on its own', '自动攻击'],
  ['noActiveAbility', 'No active skill', '没有主动技能'],
  ['notControlled', 'Not controlled by hand', '不能手动操纵'],
  ['replace', 'Replace', '替换'],
  ['replaceConfirm', 'Replace this tower?', '替换这座塔？'],
  ['replaceConfirmBody', 'The tower in this slot is removed. The hero cannot be replaced.', '此格的防御塔会被移除。英雄不能被替换。'],
  ['replaceKeep', 'Keep current tower', '保留现有的塔'],
  ['unknownUnit', 'Unknown unit', '未知单位'],
  ['unknownEnemy', 'Unknown enemy', '未知敌人'],

  // Merge
  ['merge', 'Merge', '合成'],
  ['mergePreview', 'Preview merge', '合成预览'],
  ['mergeConfirm', 'Confirm merge', '确认合成'],
  ['mergeCancel', 'Cancel merge', '取消合成'],
  ['mergeResult', 'Result', '结果'],
  ['heroProtected', 'The hero cannot be merged or replaced', '英雄不能合成，也不能被替换'],
  ['invalidMerge', 'These units cannot merge', '这些单位无法合成'],
  ['sameTypeResult', 'Same type, rank {rank}', '同种，{rank} 阶'],
  ['hybridResult', 'Hybrid: {name}', '混合：{name}'],
  ['ingredientPair', '{left} + {right}', '{left} + {right}'],
  ['resultRank', 'Result rank {rank}', '结果 {rank} 阶'],
  ['previewSafe', 'Preview only. The board has not changed.', '只是预览，棋盘还没有变化。'],
  ['confirmToMerge', 'Confirm to merge. Cancel keeps both units.', '确认后才会合成。取消则双方都保留。'],
  ['unitsPreserved', 'Both units were kept', '双方单位都已保留'],
  ['consumesSource', 'The first unit is consumed', '第一座单位会被消耗'],
  ['recipes', 'Recipes', '配方'],
  ['ingredients', 'Ingredients', '材料'],
  ['effect', 'Effect', '效果'],
  ['baseTowers', 'Base towers', '基础塔'],
  ['hybrids', 'Hybrids', '混合塔'],
  ['rank', 'Rank', '阶'],
  ['rankValue', 'Rank {rank}', '{rank} 阶'],
  ['rankCap', 'Ranks run from 1 to 4', '阶数从 1 到 4'],
  ['equalRank', 'Requires equal rank', '需要相同阶数'],
  ['maxRank', 'Already at max rank', '已经达到最高阶'],
  ['notPlanning', 'Pause or open a draft before you move or merge', '请先暂停或进入整备，再移动或合成'],
  ['planningRequired', 'Pause or open a draft before you move or merge', '请先暂停或进入整备，再移动或合成'],
  ['cannotMoveDuringFight', 'You can move units during planning', '战斗进行时不能移动，请先布阵'],
  ['sameSlot', 'Choose two different slots', '请选择两个不同的格子'],
  ['invalidSlot', 'That slot is not on the board', '没有这个格子'],
  ['missingUnit', 'Choose two occupied slots', '请选择两个有单位的格子'],
  ['reasonEmpty', 'That slot is empty', '这个格子是空的'],
  ['emptySource', 'The first slot is empty', '第一个格子是空的'],
  ['emptyTarget', 'The second slot is empty', '第二个格子是空的'],
  ['rankMismatch', 'Both units must be the same rank', '两座单位必须同阶'],
  ['noRecipe', 'No recipe matches this pair', '没有符合这对组合的配方'],
  ['hybridMix', 'A hybrid merges only with the same hybrid', '混合单位只能与相同的混合单位合成'],
  ['hybridMismatch', 'A hybrid merges only with the same hybrid', '混合单位只能与相同的混合单位合成'],
  ['kindMismatch', 'These units cannot combine', '这些单位不能组合'],
  ['incompatible', 'This pair is not compatible', '这个组合不兼容'],
  ['heroSlot', 'The hero occupies this slot', '英雄在这个格子里'],
  ['replaceRequired', 'Confirm replacement to use an occupied slot', '要占用已有格子，需要确认替换'],
  ['invalidChoice', 'That choice is not available', '没有这个选项'],
  ['noDraft', 'There is no draft right now', '当前没有整备'],
  ['notPlacing', 'There is nothing to place', '当前没有要放置的单位'],
  ['noPending', 'There is nothing waiting to place', '没有等待放置的单位'],

  // Combat stats. Keys match UnitStats fields and status type ids where noted.
  ['damage', 'Damage', '伤害'],
  ['range', 'Range', '射程'],
  ['attackSpeed', 'Attack speed', '攻速'],
  ['crit', 'Crit', '暴击'],
  ['critChance', 'Crit chance', '暴击率'],
  ['critMultiplier', 'Crit multiplier', '暴击倍率'],
  ['interval', 'Interval', '间隔'],
  ['projectileSpeed', 'Projectile speed', '弹速'],
  ['splash', 'Splash', '溅射'],
  ['chain', 'Chain', '连锁'],
  ['chainRange', 'Chain range', '连锁范围'],
  ['pierce', 'Pierce', '穿透'],
  ['burn', 'Burn', '燃烧'],
  ['poison', 'Poison', '中毒'],
  ['slow', 'Slow', '减速'],
  ['stun', 'Stun', '眩晕'],
  ['brittle', 'Brittle', '易伤'],
  ['aura', 'Aura', '光环'],
  ['support', 'Support', '支援'],
  ['haste', 'Haste', '急速'],
  ['vitality', 'Fence HP', '栅栏生命'],
  ['status', 'Status', '状态'],
  ['statuses', 'Statuses', '状态'],
  ['duration', 'Duration', '持续'],
  ['stacks', 'Stacks', '层数'],
  ['dps', 'Damage per second', '每秒伤害'],
  ['factor', 'Speed factor', '速度系数'],
  ['mechanics', 'Mechanics', '机制'],
  ['statDamage', 'Damage {value}', '伤害 {value}'],
  ['statRange', 'Range {value}', '射程 {value}'],
  ['statInterval', 'Every {value}s', '每 {value} 秒'],
  ['statCrit', 'Crit {chance} ×{multiplier}', '暴击 {chance} ×{multiplier}'],
  ['statProjectile', 'Shot speed {value}', '弹速 {value}'],
  ['statSplash', 'Splash {value}', '溅射 {value}'],
  ['statChain', 'Chain {count}', '连锁 {count}'],
  ['statPierce', 'Pierce {count}', '穿透 {count}'],
  ['slowFactor', 'Moves at {value}', '移速变为 {value}'],
  ['auraDamage', 'Damage bonus', '伤害加成'],
  ['auraHaste', 'Attack speed bonus', '攻速加成'],
  ['auraRange', 'Aura range', '光环范围'],

  // Armory and permanent meta
  ['armory', 'Armory', '军械库'],
  ['codex', 'Codex', '图鉴'],
  ['currency', 'Currency', '货币'],
  ['currencyAmount', 'Currency {amount}', '货币 {amount}'],
  ['buy', 'Buy', '购买'],
  ['equip', 'Equip', '装备'],
  ['equipped', 'Equipped', '已装备'],
  ['owned', 'Owned', '已拥有'],
  ['upgrade', 'Upgrade', '升级'],
  ['upgraded', 'Upgraded', '已升级'],
  ['purchased', 'Purchased', '已购买'],
  ['cost', 'Cost', '花费'],
  ['costValue', 'Cost {cost}', '花费 {cost}'],
  ['level', 'Level', '等级'],
  ['levelValue', 'Level {level}', '{level} 级'],
  ['levelOf', 'Level {level}/{max}', '{level} / {max} 级'],
  ['maxLevel', 'Max level', '已满级'],
  ['insufficientCurrency', 'Not enough currency', '货币不足'],
  ['locked', 'Locked', '未解锁'],
  ['weapon', 'Weapon', '武器'],
  ['charm', 'Charm', '护符'],
  ['armor', 'Armor', '护甲'],
  ['equipment', 'Equipment', '装备'],
  ['permanent', 'Permanent upgrades', '永久升级'],
  ['permanentUpgrades', 'Permanent upgrades', '永久升级'],
  ['headStart', 'Head start', '开局优势'],
  ['bonus', 'Bonus', '加成'],
  ['currentBonuses', 'Current bonuses', '当前加成'],
  ['bonusDamage', 'Damage +{value}', '伤害 +{value}'],
  ['bonusHaste', 'Attack speed +{value}', '攻速 +{value}'],
  ['bonusRange', 'Range +{value}', '射程 +{value}'],
  ['bonusCritChance', 'Crit chance +{value}', '暴击率 +{value}'],
  ['bonusFence', 'Fence +{value}', '栅栏 +{value}'],
  ['bonusReward', 'Rewards +{value}', '报酬 +{value}'],
  ['noneEquipped', 'Nothing equipped', '未装备'],
  ['unequip', 'Unequip', '卸下'],
  ['noEquipment', 'No equipment yet', '还没有装备'],
  ['noUpgrades', 'No permanent upgrades yet', '还没有永久升级'],
  ['notOwned', 'Not owned yet', '尚未拥有'],
  ['alreadyOwned', 'Already owned', '已经拥有'],
  ['alreadyEquipped', 'Already equipped', '已经装备'],
  ['wrongSlot', 'That item does not fit this slot', '这件物品不能装在这个位置'],
  ['unknownItem', 'Unknown item', '未知物品'],
  ['unknownUpgrade', 'Unknown upgrade', '未知升级'],
  ['profile', 'Profile', '档案'],
  ['best', 'Best runs', '最佳记录'],
  ['noBest', 'No settled runs yet', '还没有结算过的对局'],
  ['bestWave', 'Best wave', '最高波次'],
  ['bestKills', 'Best kills', '最高击杀'],
  ['bestLine', 'Best · wave {wave} · {kills} kills', '最佳 · 第 {wave} 波 · 击杀 {kills}'],
  ['runsSettled', 'Settled runs', '已结算局数'],
  ['newRecord', 'New record', '新纪录'],

  // Results
  ['results', 'Results', '结算'],
  ['victory', 'Victory', '胜利'],
  ['defeat', 'Defeat', '失败'],
  ['abandoned', 'Abandoned', '已放弃'],
  ['runComplete', 'Run complete', '本局结束'],
  ['resultSummary', '{result} · {difficulty}', '{result} · {difficulty}'],
  ['victoryBody', 'The fence held. The reward is saved once.', '栅栏守住了。报酬只保存一次。'],
  ['defeatBody', 'The fence fell. Progress can still pay once.', '栅栏倒下了。已有的进度仍会结算一次。'],
  ['earned', 'Earned', '获得'],
  ['earnedAmount', 'Earned {amount}', '获得 {amount}'],
  ['damageDealt', 'Damage dealt', '造成伤害'],
  ['mergesMade', 'Merges made', '合成次数'],
  ['critsLanded', 'Critical hits', '暴击次数'],
  ['fenceDamageTaken', 'Fence damage taken', '栅栏承受伤害'],
  ['noReward', 'No reward', '没有报酬'],
  ['freshAbandon', 'This run is too short to earn a reward', '本局太短，没有报酬'],
  ['alreadySettled', 'This run was already rewarded', '本局报酬已经发过'],
  ['notFinished', 'This run is not ready to settle', '本局还不能结算'],
  ['noDoublePay', 'Each run pays at most once.', '每局最多发放一次。'],
  ['rewardRule', 'Higher difficulties multiply this reward.', '更高难度会提高这笔报酬。'],
  ['playAgain', 'Play again', '再来一局'],
  ['returnMenu', 'Main menu', '主菜单'],
  ['endless', 'Endless', '无尽'],
  ['endlessOffer', 'Enter endless? The victory reward is already saved.', '进入无尽？胜利报酬已经保存。'],
  ['endlessEnter', 'Enter endless', '进入无尽'],
  ['endlessStay', 'Not now', '暂不进入'],
  ['endlessNote', 'Endless does not pay the main reward again.', '无尽不会再次发放主线报酬。'],

  // Save, import, confirmations
  ['exportSave', 'Export save', '导出存档'],
  ['importSave', 'Import save', '导入存档'],
  ['importError', 'That save could not be imported', '无法导入这份存档'],
  ['invalid_json', 'That text is not valid save data. The current save was kept.', '这段文字不是有效的存档。当前存档已保留。'],
  ['invalid_format', 'That file is not a Fencefall save. The current save was kept.', '这不是最后一道防线的存档。当前存档已保留。'],
  ['invalid_version', 'That save is from another version. The current save was kept.', '这份存档的版本不同。当前存档已保留。'],
  ['invalid_profile', 'The profile in that save is not valid. The current save was kept.', '存档里的档案无效。当前存档已保留。'],
  ['invalid_run', 'The battle in that save is not valid. The current save was kept.', '存档里的对局无效。当前存档已保留。'],
  ['invalid_bounds', 'That save has a number outside the allowed range. The current save was kept.', '存档里有超出允许范围的数字。当前存档已保留。'],
  ['invalid_enum', 'That save has an unknown setting. The current save was kept.', '存档里有无法识别的设置。当前存档已保留。'],
  ['invalid_hero', 'That save does not contain exactly one hero. The current save was kept.', '存档里不是恰好一名英雄。当前存档已保留。'],
  ['invalid_slots', 'That save does not have the ten defender slots. The current save was kept.', '存档里没有十个防守格。当前存档已保留。'],
  ['invalid_settlement', 'That save has an invalid result. The current save was kept.', '存档里的结算无效。当前存档已保留。'],
  ['storage_unavailable', 'Storage is not available. The current save was kept.', '无法使用本地存储。当前存档已保留。'],
  ['too_large', 'That save is too large. The current save was kept.', '这份存档太大。当前存档已保留。'],
  ['quota', 'Storage is full. The current save was kept.', '存储空间已满。当前存档已保留。'],
  ['importSuccess', 'Save imported', '存档已导入'],
  ['noSave', 'No saved run', '没有已保存的对局'],
  ['saveFailed', 'Could not save', '保存失败'],
  ['saveData', 'Save data', '存档数据'],
  ['pasteHere', 'Paste save data here', '在此粘贴存档数据'],
  ['exportHint', 'Copy this backup and store it somewhere safe.', '复制这份备份，并另行保管。'],
  ['importHint', 'Paste a backup exported from this game.', '粘贴从本游戏导出的备份。'],
  ['importEmpty', 'Paste save data first', '请先粘贴存档数据'],
  ['confirmImport', 'Importing replaces the profile and saved run on this device.', '导入会替换此设备上的档案和已保存对局。'],
  ['confirmRestart', 'Restart and clear this fight?', '重开并清除这场战斗？'],
  ['confirmNewRun', 'Start a new run and clear the saved fight?', '开始新对局，并清除已保存的战斗？'],
  ['abandonConfirm', 'Abandon this run?', '放弃本局？'],
  ['abandonDetail', 'Leaving before 30 seconds and 3 kills earns nothing. A finished victory or defeat pays once.', '不足 30 秒且击杀少于 3 就离开，没有报酬。胜利或失败结算后只发放一次。'],
  ['corruptSave', 'This save is damaged', '这份存档已损坏'],
  ['invalidSave', 'This save is not valid', '这份存档无效'],
  ['invalid', 'Not valid', '无效'],
  ['versionMismatch', 'This save is from another version', '这份存档的版本不同'],
  ['tooLarge', 'That save is too large', '这份存档太大'],
  ['quotaExceeded', 'Storage is full', '存储空间已满'],
  ['storageUnavailable', 'Storage is not available', '无法使用本地存储'],
  ['errorGeneric', 'Something went wrong', '出了点问题'],
  ['unknownReason', 'That action is not available', '现在不能这么做'],
  ['tryAgain', 'Try again', '再试一次'],

  // How to play. Bodies are the help* keys; titles can reuse the short labels.
  ['howto', 'How to play', '怎么玩'],
  ['howtoLead', 'You decide what is built. The fight plays itself.', '建造由你决定，战斗自动进行。'],
  ['helpOverview', 'Enemies enter from the top and move toward one shared fence. You plan, draft, and merge. The hero and towers attack on their own.', '敌人从上方进入，朝同一道栅栏前进。你负责布阵、整备和合成。英雄与防御塔会自动攻击。'],
  ['helpPlacement', 'Tap a defender, then tap the slot you want. You can move units only while paused or while a draft is open. Empty slots can take a unit. Moving the hero only changes its place.', '点一名防守者，再点目标格子。只有在暂停或整备期间才能移动。空位可以放入单位。移动英雄只改变位置。'],
  ['helpMerge', 'While planning, choose two different occupied slots and preview the result. The same type and rank rise by one rank, up to rank 4. Different base types of equal rank become that recipe\'s hybrid. A hybrid merges only with the same hybrid. The hero never merges. Cancel, or an invalid pair, keeps both units.', '布阵时选择两个不同的已占用格子，并先预览结果。同种同阶会升 1 阶，最高 4 阶。不同的基础塔在同阶时会变成配方对应的混合单位。混合单位只能与相同的混合单位合成。英雄永不合成。取消或组合无效时，双方都会保留。'],
  ['helpDraft', 'Kills grant XP. At the threshold the fight pauses and you get exactly three choices: a new tower or a hero upgrade. A tower is placed with a second tap. On a full board you can still upgrade the hero or replace a tower. Canceling placement keeps those same three choices. Nothing is granted twice.', '击杀会获得经验。达到阈值时战斗暂停并进入整备，给出三选一：新的防御塔，或英雄升级。选塔之后，再点一个格子即可放置。格子占满时，仍可升级英雄或替换一座防御塔。取消放置会保留原来的三选一，不会因此多得一次。'],
  ['helpFence', 'Enemies attack only the shared fence. Defenders have no health. If fence HP reaches zero, the run is lost.', '敌人只攻击共用栅栏。防守者没有生命值。栅栏生命归零，本局失败。'],
  ['helpRange', 'A defender fires at any enemy inside its circle, including enemies outside its column. Select a unit to see that circle. Rear-row ranges reach the field in front of the fence.', '防守者会攻击圆圈内的任意敌人，包括其他列的敌人。选中单位即可看到这个圆。后排的射程能够打到栅栏前方。'],
  ['helpSpeed', 'Speeds are 1×, 1.5×, and 3×. They share one simulation clock, so attacks, status timers, and rewards are not sped past that clock or skipped. Pause stops the fight. Hiding the page stops it too. If you paused yourself, that pause remains when you return.', '速度有 1×、1.5× 和 3×。它们共用一个模拟时钟，攻击、状态时间和报酬不会超出这个时钟，也不会被跳过。暂停会停止战斗。隐藏页面也会停止。如果你亲手暂停，回到页面后暂停仍然保留。'],
  ['helpHero', 'The run starts with one hero in the rear center, and no other towers. The hero fights automatically, never merges, and cannot be sold or replaced.', '每局开始时，后排中央只有一名英雄，没有其他防御塔。英雄自动战斗，不能合成、出售或替换。'],
  ['helpRewards', 'Victory and defeat pay currency once. Abandoning a fresh run before 30 seconds and 3 kills pays nothing. Higher difficulties multiply the reward. Reloading does not pay again.', '胜利和失败都会发放一次货币。不足 30 秒且击杀少于 3 就放弃，没有报酬。难度越高，报酬倍率越高。重新加载不会再次发放。'],
  ['helpEquipment', 'Currency buys equipment and permanent hero upgrades. Bonuses are bounded and give a head start. Normal is playable without them. Purchases apply to later runs. This fight keeps the bonuses it started with.', '货币可以购买装备和英雄的永久升级。加成有上限，只提供开局优势。不买它们也能游玩标准难度。购买从之后的对局生效。这一局仍使用开局时的加成。'],
  ['helpLanguage', 'Use 中 / EN at any time. Switching language keeps the current run, board, and rewards.', '可以随时使用中 / EN。切换语言会保留当前对局、棋盘和报酬。'],
  ['helpLanes', 'There are no lanes. Enemies appear more often near the middle, then drift sideways a little, and stay inside the field.', '没有分路。敌人更常在中间出现，随后略微横向漂移，并始终留在场地内。'],
  ['helpWin', 'Clear the scheduled waves to win. You can keep going in endless afterward. If the fence falls first, the run is a defeat.', '清完排定的波次即胜利。之后可以进入无尽。若栅栏先倒下，本局失败。'],
  ['helpBoss', 'Bosses arrive on the wave schedule. They still attack only the fence. Their names and traits are in the codex.', '首领会按波次时间表出现，同样只攻击栅栏。名字和特点可以在图鉴中查看。'],
  ['helpSave', 'This browser stores the profile and one paused run. Export a backup or import one. A damaged file does not replace a valid save. Opening a saved run starts paused.', '此浏览器会保存档案和一局暂停中的战斗。可以导出或导入备份。损坏的文件不会覆盖有效存档。打开已保存的对局时，会先处于暂停。'],
  ['helpSameType', 'Two units of the same type and the same rank become one unit of the next rank, up to rank 4. Stats grow. The role stays the same.', '两座种类相同、阶数相同的单位会合成下一阶，最高 4 阶。能力提高，职能不变。'],
  ['helpHybrid', 'Two different base towers of equal rank become the hybrid named in the recipe. Read the result before you confirm. Hybrids do not mix with a different type.', '两座不同的基础塔在同阶时，会变成配方里的混合单位。确认前请先看结果。混合单位不能再与另一种类混合。'],
  ['helpStatuses', 'Burn, poison, slow, stun, and brittle appear on the enemy. Slow changes how fast that enemy moves right now, not its base speed. Damage over time stops if the enemy dies.', '燃烧、中毒、减速、眩晕和易伤会显示在敌人身上。减速改变的是它此刻的移动速度，而不是基础速度。敌人死亡后，持续伤害会停止。'],
  ['helpDifficulty', 'Easy, Normal, Hard, and Nightmare change enemy health, speed, damage, numbers, fence HP, and the reward multiplier.', '轻松、标准、困难和噩梦会改变敌人的生命、速度、伤害和数量，以及栅栏生命和报酬倍率。'],
  ['helpReplace', 'Replacing a tower asks for confirmation and removes that tower. The hero\'s slot always refuses a replacement.', '替换防御塔前会要求确认，并移除那座塔。英雄所在的格子始终不能替换。'],
  ['helpSupport', 'Support towers still fire on their own. Their aura boosts allies inside its range. The bonus is capped.', '支援塔自己也会攻击。它们的光环会强化范围内的友军，加成有上限。'],
  ['helpCrit', 'A critical hit deals multiplied damage and shows a clear impact. Chance and multiplier are listed on the unit.', '暴击造成倍率伤害，并有清楚的命中反馈。暴击率和倍率写在单位面板上。'],
  ['helpTouch', 'Buttons are large enough to tap. Choose a slot on the field, then confirm in the panel. Essential actions are not hidden behind hover.', '按钮足够大，便于点按。先在场上选择格子，再在面板中确认。关键操作不需要靠悬停才能找到。'],
  ['helpEndless', 'Endless is offered only after the main waves are cleared and victory is settled. It does not pay the main reward a second time.', '只有清完主要波次并结算胜利之后，才会提供无尽。它不会把主线报酬再发一次。'],

  // Accessibility labels
  ['ariaBattlefield', 'Battlefield', '战场'],
  ['ariaFence', 'Shared fence', '共用栅栏'],
  ['ariaSlot', 'Defender slot {index}', '防守格子 {index}'],
  ['ariaPause', 'Pause the fight', '暂停战斗'],
  ['ariaResume', 'Resume the fight', '恢复战斗'],
  ['ariaSpeed', 'Game speed', '游戏速度'],
  ['ariaSpeed1', 'Set speed to 1×', '速度设为 1×'],
  ['ariaSpeed15', 'Set speed to 1.5×', '速度设为 1.5×'],
  ['ariaSpeed3', 'Set speed to 3×', '速度设为 3×'],
  ['ariaLanguage', 'Language', '语言'],
  ['ariaDialog', 'Dialog', '对话框'],

  // Keys the panels already look up. These replace local fallbacks.
  ['armoryIntro', 'Settled runs pay currency for equipment and permanent hero upgrades. Bonuses stay bounded, and Normal remains playable without them.', '已结算的对局提供货币，用于购买装备和永久英雄升级。加成有上限，标准难度不依赖它们也能游玩。'],
  ['bonuses', 'Current bonuses', '当前加成'],
  ['rewardBonusNote', 'The reward bonus is applied when a run is settled, along with the difficulty multiplier. Results show the currency actually awarded.', '报酬加成在对局结算时与难度倍率一起结算。结算画面显示实际获得的货币。'],
  ['equipReplaces', 'Choosing another item for the same slot replaces the equipped one.', '为同一位置选择另一件装备时，会替换当前装备。'],
  ['codexRankNote', 'Listed tower and recipe numbers are the catalog stats. Rank raises a unit from 1 to 4 without changing its identity.', '列出的防御塔与配方数值来自图鉴。阶数会把单位从 1 阶提升到最高 4 阶，种类保持不变。'],
  ['codexReady', 'Both parents are on the field', '两种材料都在场上'],
  ['codexWaiting', 'Build both parents first', '先放好两种材料'],
  ['settingsKeepRun', 'Language, sound, motion, and difficulty choices keep the current run.', '语言、声音、动效和难度的更改都会保留当前对局。'],
  ['difficultyNextRun', 'The highlighted difficulty is used the next time you start a run.', '高亮的难度会在下一局开始时使用。'],
  ['difficultyRewards', 'Higher difficulties increase enemy pressure and the reward multiplier.', '更高的难度会提高敌人压力和报酬倍率。'],
  ['helpRole', 'You plan, build, and decide. Towers and the hero attack on their own. There are no active combat abilities and no direct hero control.', '你负责布阵、建造和抉择。防御塔与英雄会自动攻击。没有主动战斗技能，也不能直接操纵英雄作战。'],
  ['helpAura', 'A support aura boosts nearby defenders. Its damage and haste bonuses are fractional and combat caps them.', '支援光环强化附近的防守者。其中的伤害和攻速是比例加成，战斗中会限制上限。'],
  ['helpBoard', 'Enemies move down toward a fence. Behind it are two rows of five slots. The hero begins in the rear center.', '敌人向下接近栅栏。栅栏后是两行，每行五个格子。英雄从后排正中开始。'],
  ['helpRows', 'Front row, then rear row. The marked slot is the hero’s starting slot.', '上方是前排，下方是后排。标出的格子是英雄的起始位置。'],
  ['enemyApproach', 'Enemies approach from above.', '敌人从上方接近。'],
  ['enemyFenceOnly', 'This enemy attacks the fence only.', '这种敌人只攻击栅栏。'],
  ['fenceDamage', 'Fence damage', '栅栏承受伤害'],
  ['health', 'Health', '生命'],
  ['saveHelp', 'Export creates a JSON save of the profile and run. Import replaces them only when the file is valid. An invalid file keeps the current save.', '导出会生成包含档案和对局的 JSON 存档。只有文件有效时，导入才会替换它们。无效文件会保留当前存档。'],
  ['copySave', 'Copy save', '复制存档'],
  ['copyUnavailable', 'Select the save text to copy it.', '请选中存档文本进行复制。'],
  ['noOutcome', 'This run has no settled outcome yet.', '这局还没有结算结果。'],
  ['settlementPending', 'The reward appears here after the run is settled.', '本局结算后才会显示报酬。'],
  ['on', 'On', '开启'],
  ['off', 'Off', '关闭'],
  ['unavailable', 'Not available', '暂不可用'],
  ['missing', 'Still waiting', '还在等待'],
  ['invalidProfile', 'That profile is not valid', '这份档案无效'],
  ['error', 'Something went wrong', '出了点问题'],
  ['bad-phase', 'Not available right now', '现在不能这么做'],
  ['bad-speed', 'Speed stays at 1×, 1.5×, or 3×', '速度只能是 1×、1.5× 或 3×'],
  ['bad-language', 'Language is English or Chinese', '语言只能是中文或英文'],
  ['bad-screen', 'Unknown screen', '未知界面'],
  ['unknown-action', 'Unknown action', '未知操作'],
  ['backRow', 'Rear row', '后排'],
  ['critDamage', 'Crit damage', '暴击伤害'],
  ['projectile', 'Projectile speed', '弹速'],
  ['pauseToPlan', 'Pause to move defenders or merge towers.', '暂停后才能移动防守者或合成防御塔。'],
  ['planningLocked', 'The fight is running. Pause to move or merge.', '战斗进行中。暂停后才能移动或合成。'],
  ['noMergePartner', 'A merge needs two towers. The hero stays independent.', '合成需要两座防御塔。英雄保持独立。'],
  ['heroNoMerge', 'The hero stays independent. Move the hero during planning. Merges and replacement leave the hero in place.', '英雄保持独立。布阵时可以移动英雄。合成和替换都不会动英雄。'],
  ['placeHint', 'Choose an empty slot. Occupied towers stay unless this card is a replacement.', '选择一个空位。已有的防御塔会留下，除非这张卡是替换。'],
  ['replaceHeroSafe', 'Choose the tower to replace. The hero stays in place.', '选择要替换的防御塔。英雄会留在原位。'],
  ['confirmReplaceBody', 'The tower in this slot will be removed.', '这个格子上的防御塔会被移除。'],
  ['statsUnavailable', 'Stats will appear when the catalog is ready.', '图鉴就绪后会显示属性。'],
  ['emptySelection', 'Select a slot to see its stats.', '选择一个格子以查看属性。'],
  ['sameTypeMerge', 'Same type and rank combine into the next rank.', '相同种类且阶数相同，会升到下一阶。'],
  ['hybridMerge', 'This pair becomes the hybrid below.', '这一对会变成下面的混合单位。'],
  ['maxRankNote', 'Rank 4 can form a hybrid with a different rank-4 base tower when a recipe exists.', '4 阶可以与另一座 4 阶的不同基础塔按配方合成混合单位。'],
  ['supportNote', 'Support range is a circle from this slot. Aura bonuses reach defenders inside that circle. Attacks use the same geometric range.', '支援范围以这个格子为圆心。光环加成覆盖圆内的防守者。攻击也按这个几何距离判定。'],
  ['youGain', 'Result', '结果'],
  ['currentStats', 'Stats', '属性'],
  ['mergeReview', 'Review the merge, then confirm or cancel. Both units stay if you cancel.', '先查看合成结果，再确认或取消。取消会保留双方。'],
  ['lostOnReplace', 'Removed tower', '被移除的防御塔'],
  ['chooseEmpty', 'Empty slots are ready for placement.', '空位可以直接放置。'],
  ['heroStays', 'The hero stays on the board.', '英雄会留在场上。'],
  ['noValidTarget', 'No legal merge is available from this tower.', '这座防御塔目前没有合法的合成对象。'],
  ['moveHint', 'Choose a destination. An occupied slot swaps places.', '选择目标格子。已占用的格子会对调。'],
  ['mergeHint', 'Choose a tower of equal rank. The preview explains the result before you confirm.', '选择一座同阶防御塔。确认前会显示合成结果。'],
  ['sourceHint', 'Choose the defender to move.', '选择要移动的防守者。'],
  ['mergeSourceHint', 'Choose the first tower. The hero is not a merge ingredient.', '选择第一座防御塔。英雄不能作为合成材料。'],
  ['buildPanelLabel', 'Build, draft, and merge', '构筑、整备与合成'],
  ['kindTower', 'Tower', '防御塔'],
  ['no_draft', 'There is no draft right now', '当前没有整备'],
  ['no_options', 'There is no draft right now', '当前没有整备'],
  ['not_placing', 'There is nothing to place', '当前没有要放置的单位'],
  ['not_playing', 'The fight is not running', '当前不在战斗中'],
  ['not_ready', 'Not enough XP for a draft yet', '经验还不够，还不能整备'],
  ['already_placing', 'Finish placing the current tower first', '请先放好当前的防御塔'],
  ['busy', 'A draft is already open', '整备已经打开'],
  ['bad_index', 'That choice is not available', '没有这个选项'],
  ['bad_option', 'That choice is not available', '没有这个选项'],
  ['upgrade_failed', 'That upgrade could not be applied', '这次升级没有生效'],
  ['unknown_tower', 'Unknown tower', '未知防御塔'],
  ['replace_not_offered', 'This choice cannot replace a tower', '这个选项不能替换防御塔'],
  ['no_slot', 'The board is full', '格子已满'],
  ['draft_missing', 'That draft is no longer available', '这次整备已经不在了'],
  ['unknown_upgrade', 'Unknown upgrade', '未知升级'],
  ['upgrade_capped', 'Already at max level', '已经达到最高级'],
  ['no_hero', 'The hero is missing', '场上没有英雄'],
  ['invalid_state', 'That action is not available', '现在不能这么做']
];

function buildMessages(rows) {
  const en = Object.create(null);
  const zh = Object.create(null);
  for (const row of rows) {
    const key = row[0];
    const enText = row[1];
    const zhText = row[2];
    if (typeof key !== 'string' || key.length === 0) throw new Error('i18n key missing');
    if (Object.hasOwn(en, key)) throw new Error(`duplicate i18n key: ${key}`);
    if (typeof enText !== 'string' || typeof zhText !== 'string' || enText.length === 0 || zhText.length === 0) {
      throw new Error(`i18n text missing: ${key}`);
    }
    en[key] = enText;
    zh[key] = zhText;
  }
  return Object.freeze({
    en: Object.freeze(en),
    zh: Object.freeze(zh)
  });
}

export const MESSAGES = buildMessages(ROWS);

const NUMBER_FORMAT = Object.freeze({
  en: new Intl.NumberFormat('en-US', {maximumFractionDigits: 2, useGrouping: true}),
  zh: new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 2, useGrouping: true})
});

const PLACEHOLDER = /\{(\w+)\}/g;

/** @returns {'en'|'zh'} */
export function normalizeLanguage(language) {
  return String(language ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/**
 * Browser locale → saved language. Chinese locales use zh; everything else uses en.
 * Pass a locale string in tests. With no argument, navigator.language is read at call time.
 * @returns {'en'|'zh'}
 */
export function defaultLanguage(locale) {
  if (locale == null) {
    const nav = globalThis.navigator;
    locale = nav && typeof nav.language === 'string' ? nav.language : 'en';
  }
  return normalizeLanguage(locale);
}

function readableKey(key) {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' || typeof key === 'boolean' || typeof key === 'bigint') return String(key);
  return '';
}

function lookup(language, key) {
  const primary = MESSAGES[language];
  if (primary && Object.hasOwn(primary, key)) return primary[key];
  const other = MESSAGES[language === 'zh' ? 'en' : 'zh'];
  if (other && Object.hasOwn(other, key)) return other[key];
  return null;
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

export function formatNumber(value, language) {
  const lang = normalizeLanguage(language);
  const n = toFiniteNumber(value);
  if (!Number.isFinite(n)) return '—';
  return NUMBER_FORMAT[lang].format(Object.is(n, -0) ? 0 : n);
}

function formatVar(value, language) {
  if (value == null) return '';
  const kind = typeof value;
  if (kind === 'number') return formatNumber(value, language);
  if (kind === 'string') return value;
  if (kind === 'boolean') return t(language, value ? 'yes' : 'no');
  if (kind === 'bigint') return String(value);
  if (kind === 'object' && (Object.hasOwn(value, 'en') || Object.hasOwn(value, 'zh'))) {
    return localize(value, language);
  }
  return '';
}

export function t(language, key, vars = {}) {
  const lang = normalizeLanguage(language);
  const rawKey = readableKey(key);
  if (!rawKey) return '';
  const template = lookup(lang, rawKey);
  const text = template == null ? rawKey : template;
  if (vars == null || typeof vars !== 'object') return text;
  return text.replace(PLACEHOLDER, (match, name) => {
    if (!Object.hasOwn(vars, name) || vars[name] == null) return match;
    return formatVar(vars[name], lang);
  });
}

export function localize(value, language) {
  const lang = normalizeLanguage(language);
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value, lang) : '';
  if (typeof value === 'boolean') return t(lang, value ? 'yes' : 'no');
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (Object.hasOwn(value, lang)) {
      const preferred = value[lang];
      if (preferred != null && typeof preferred !== 'object') return localize(preferred, lang);
    }
    const fallbackLang = lang === 'zh' ? 'en' : 'zh';
    if (Object.hasOwn(value, fallbackLang)) {
      const fallback = value[fallbackLang];
      if (fallback != null && typeof fallback !== 'object') return localize(fallback, fallbackLang);
    }
  }
  return '';
}

/** Active fight time. Under an hour: "12m 05s" / "12分05秒". */
export function formatDuration(seconds, language) {
  const lang = normalizeLanguage(language);
  let total = toFiniteNumber(seconds);
  if (!Number.isFinite(total) || total < 0) total = 0;
  total = Math.floor(total);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (lang === 'zh') {
    return hours > 0 ? `${hours}小时${pad(minutes)}分${pad(secs)}秒` : `${minutes}分${pad(secs)}秒`;
  }
  return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(secs)}s` : `${minutes}m ${pad(secs)}s`;
}
