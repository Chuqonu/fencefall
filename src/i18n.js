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
  ['invalid_mode', 'Unknown targeting mode', '无效的索敌模式'],
  ['multishot', 'Multishot', '齐射'], ['fence_focus', 'Wall focus', '城墙集火'], ['reveal', 'Reveal', '显隐'],
  ['badge.execute', 'Execute', '斩杀'], ['badge.crit', 'Crit', '暴击'], ['badge.projectile', 'Projectile', '投射'],
  ['badge.speed', 'Speed', '攻速'], ['badge.critDamage', 'Crit×', '暴伤'],
  ['badge.split', 'Split', '分裂'], ['badge.chain', 'EM', '电磁'], ['badge.napalm', 'Napalm', '火海'],
  ['badge.armored_car', 'Tank', '装甲车'], ['badge.cryo_barrage', 'Glacial', '冰柱'], ['badge.orbital_beam', 'Laser', '激光'],
  ['split_shot', 'Split Shrapnel', '子母分裂弹'],
  ['ricochet', 'EM Chain Strike', '电磁连锁雷'],
  ['napalm', 'Napalm Fire Sea', '燃油弹火海'],
  ['armored_car', 'Armored Sweeper', '重装装甲车'],
  ['cryo_barrage', 'Glacial Barrage', '干冰齐射柱'],
  ['orbital_beam', 'Orbital Laser', '高能激光柱'],
  ['overclock', 'Firepower Overclock', '火力超频'],
  ['starterPackTitle', 'Starter Supply Pack', '新手补给包'],
  ['starterPackDesc', 'Free +180 Coins + Opening Airdrop Gem (instant 3-of-1 upgrade at the start of every stage)!', '免费领 180 金币 +【开局空投宝石】（每关开局即送免费三选一），爽快起步！'],
  ['claimStarterPack', 'Claim +180 & Free Gem', '免费领取（+180金币 +开局宝石）'],
  ['starterClaimed', 'Starter Pack Claimed · Opening Gem Equipped', '新手补给已领取 · 开局空投宝石已装备'],
  ['gems', 'Core Gems', '核心宝石'],
  ['gemsIntro', 'Equip up to 3 Core Gems for wall shields, opening drops, pierce & crit shred.', '最多镶嵌 3 颗核心宝石，解锁城墙免伤、开局三选一、子弹穿透与暴击斩血。'],
  ['gemSlots', 'Equipped Slots', '已镶嵌槽位'],
  ['gemSlotEmpty', 'Empty', '空槽'],
  ['gemTierEpic', 'Epic', '史诗'],
  ['gemTierLegend', 'Legend', '传说'],
  ['openingDraft', 'Opening Airdrop', '开局免费选卡'],
  ['wallImmunity', 'Wall Shield', '城墙免伤'],
  ['heroPierce', 'Bullet Pierce', '子弹穿透'],
  ['statusDamage', 'Elemental Surge', '异常增伤'],
  ['shredPercent', 'Crit Max-HP Shred', '暴击斩血'],
  ['superweaponHaste', 'Skill Cooldown', '技能冷却'],
  ['starterWeapon', 'Starter Auto Skill', '开局赠送技能'],
  ['aegisChip', 'Shield', '免伤'],
  ['openingDropTitle', 'Opening Airdrop · Pick 1 of 3', '开局空投 · 免费三选一'],
  ['arsenalNapalm', 'Napalm', '火海'],
  ['arsenalCar', 'Sweeper', '装甲车'],
  ['arsenalCryo', 'Glacial', '干冰'],
  ['arsenalBeam', 'Laser', '激光'],
  ['arsenalEm', 'EM', '天雷'],
  ['tabBattle', 'Battle', '出击'],
  ['tabArmory', 'Armory', '军械'],
  ['tabCodex', 'Codex', '图鉴'],
  ['tabSettings', 'Settings', '设置'],
  ['armoryTabGems', 'Gems', '核心宝石'],
  ['armoryTabGear', 'Gear', '武装装备'],
  ['armoryTabUpgrades', 'Upgrades', '永久强化'],
  ['tagSuperweapon', 'Auto Skill', '自动技能'],
  ['tagHero', 'Gun Mod', '枪械强化'],
  ['tagNewTurret', 'New Turret', '新炮塔'],
  ['tagUpgradeTurret', 'Upgrade Lv.{from}→{to}', '升级 Lv.{from}→{to}'],
  ['deployNow', 'Start Defense', '开始防线'],
  ['swapHint', 'Tap below to switch target priority', '点击下方按钮切换优先攻击目标'],
  ['heroFixed', 'Gunner holds the center wall position.', '防线枪手固定驻守城墙正中。'],
  ['gunnerTitle', 'Wall Gunner', '防线枪手'],
  ['teamDamage', 'Gun damage', '枪械伤害'],
  ['teamHaste', 'Fire rate', '枪械攻速'],
  ['teamCrit', 'Crit chance', '暴击率'],
  ['freeRerolls', 'Extra rerolls', '额外刷新'],
  ['critKnockback', 'Crit knockback', '暴击击退'],
  ['surgeCharges', 'Shockwave charges', '冲击波充能'],
  ['surgePower', 'Shockwave power', '冲击波威力'],
  ['thorns', 'Wall thorns', '城墙反伤'],
  ['economy', 'War Chest', '战备补给'],
  ['stageLabel', 'Stage {n}', '第 {n} 关'],
  ['stageShort', 'S{n}', '第{n}关'],
  ['playStage', 'Start · Stage {n}', '开始游戏 · 第 {n} 关'],
  ['nextStageBtn', 'Next · Stage {n}', '下一关 · 第 {n} 关'],
  ['retryStage', 'Retry · Stage {n}', '再战第 {n} 关'],
  ['stageLocked', 'Clear Stage {prev} to unlock', '通关第 {prev} 关解锁'],
  ['allStages', 'All 20 Stages', '全部 20 关'],
  ['hideStages', 'Collapse', '收起关卡'],
  ['firstClearBonus', 'First Clear +{amount}', '首通奖励 +{amount}'],
  ['firstClearClaimed', 'First Clear Claimed', '已领首通'],
  ['featuredEnemies', 'Stage Threats', '本关僵尸'],
  ['bossBadge', 'BOSS', '首领关'],
  ['clearedOfTotal', 'Cleared {cleared}/{total}', '已通关 {cleared}/{total}'],
  ['campaignCleared', 'All 20 Stages Cleared!', '前 20 关全部通关！'],
  ['perfectWall', 'Perfect Defense ★★★', '完美守卫 ★★★'],
  ['prevStageAria', 'Previous stage', '上一关'],
  ['nextStageAria', 'Next stage', '下一关'],

  ['systems', 'Systems online', '已接入系统'],
  ['not-planning', 'Gunner stays in the center position', '枪手固定驻守城墙正中'],
  ['no-run', 'Start a stage first', '请先开始一关'],
  ['bad-slot', 'Tap the Gunner at center wall', '请点击城墙正中的枪手'],
  ['bad-choice', 'Pick one of the three upgrades', '请选择三张强化卡中的一张'],
  ['nextStats', 'After this choice', '选择之后'],
  ['draftWaiting', 'Tap any card to power up right away.', '点击任意一张强化卡，立即生效。'],
  ['cancelPick', 'Back', '返回'],
  ['attacks', 'Attacks', '攻击'],
  ['reduction', 'slow', '减速'],
  ['kindUpgrade', 'Gun Mod', '枪械强化'],
  ['slotLabel', 'Position', '位置'],
  ['hero_protected', 'The Gunner stays at the center wall.', '防线枪手始终驻守城墙正中。'],
  ['same', 'Gunner is anchored in the center.', '枪手固定在正中位置。'],
  ['same_slot', 'Gunner is anchored in the center.', '枪手固定在正中位置。'],
  ['empty', 'No unit there.', '此处没有单位。'],
  ['not_planning', 'Gunner holds the center wall position.', '枪手固定驻守城墙正中。'],
  ['phase', 'Tap the Gunner anytime to check stats or switch target priority.', '战斗中随时点击枪手可查看属性并切换优先攻击目标。'],
  ['max_rank', 'Already at max level.', '已达到满级。'],
  ['capped', 'Already at max level.', '该强化已满级。'],
  ['frost', 'Chills and slows zombies in range.', '减速范围内的僵尸。'],
  ['lightning', 'Chains lightning strikes between zombies.', '在僵尸之间弹射连锁雷击。'],
  ['execute', 'Deals heavier damage to low-HP zombies.', '对残血僵尸造成额外斩杀伤害。'],
  ['surge', 'Wave', '冲击波'],
  ['targeting', 'Target', '优先攻击'],
  ['reroll', 'Refresh', '刷新'],
  ['free', 'Free', '免费'],
  ['foremost', 'Closest', '最前'],
  ['priority', 'Specials', '高危'],
  ['strongest', 'Tankiest', '最肉'],
  ['weakest', 'Lowest HP', '残血'],
  ['selectMission', 'Stage Select', '选择关卡'],
  ['corpseExplode', 'Blast on kill', '击杀爆炸'],
  ['thermalShock', 'Thermal blast', '冰火爆破'],
  ['armorPen', 'Armor pierce', '无视护甲'],
  ['knockback', 'Knockback', '击退'],
  ['poisonDetonate', 'Acid burst', '酸液反应'],
  ['cloud', 'Fire sea', '火海'],
  ['legacyRunReset', 'Profile migrated! Start a fresh v5 stage.', '档案已自动继承，请开启全新升级的对局！'],

  // Brand and navigation
  ['title', 'Fencefall', '最后一道防线'],
  ['titleLockup', 'Fencefall · 最后一道防线', 'Fencefall · 最后一道防线'],
  ['subtitle', 'Solo Gunner · Auto-Skill Defense', '单枪死守 · 自动技能割草'],
  ['tagline', 'Hold the center wall. Upgrade your gun and unleash full-screen auto skills.', '枪手自动瞄准开火，升级三选一解锁满屏枪械强化与自动技能。'],
  ['play', 'Play', '出击'],
  ['playHint', 'Start a new stage', '开始挑战关卡'],
  ['continue', 'Continue', '继续战斗'],
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
  ['newRun', 'New stage', '新关卡'],
  ['abandon', 'Abandon', '放弃'],
  ['loading', 'Loading', '加载中'],
  ['loadingGame', 'Fortifying the wall…', '正在架设城墙防线…'],
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
  ['resume', 'Resume', '继续'],
  ['paused', 'Paused', '已暂停'],
  ['pausedHidden', 'Paused while page hidden', '切出页面已自动暂停'],
  ['pausedHiddenBody', 'Tap Resume to jump right back into the fight.', '点击继续即可无缝回到战斗。'],
  ['planning', 'Level Up', '升级选卡'],
  ['planningHint', 'Tap the Gunner to inspect gun stats or switch target priority.', '点击城墙正中的枪手可查看枪械属性或切换优先攻击目标。'],
  ['playing', 'Fighting', '战斗中'],
  ['speed', 'Speed', '倍速'],
  ['speed1', '1×', '1×'],
  ['speed15', '1.5×', '1.5×'],
  ['speed3', '3×', '3×'],
  ['speed10', '10×', '10×'],
  ['speedValue', '{value}×', '{value}×'],
  ['speedHint', '1×, 1.5×, 3×, and 10× share the exact same simulation clock.', '1×、1.5×、3×、10× 共用同一套模拟时钟，奖励一致。'],
  ['speedWhilePaused', 'Speed applies when the fight resumes.', '恢复战斗后立即生效。'],
  ['fence', 'Wall', '城墙'],
  ['fenceHp', 'Wall {current}/{max}', '城墙 {current}/{max}'],
  ['fenceBonus', 'Wall HP', '城墙血量'],
  ['fenceDanger', 'Wall Critical', '城墙危急'],
  ['fenceSafe', 'Wall Holding', '城墙稳固'],
  ['wave', 'Wave', '波次'],
  ['waveNumber', 'Wave {wave}', '第 {wave} 波'],
  ['waveIncoming', 'Incoming', '来袭'],
  ['bossWarning', 'Boss Incoming', '首领来袭'],
  ['finalWave', 'Final Wave', '最终波'],
  ['nextWave', 'Next Wave', '下一波'],
  ['wavesSpawned', 'Final horde deployed', '全部敌潮已出动'],
  ['wavesStarted', 'Waves started', '已迎战波次'],
  ['clearRemaining', 'Clear remaining zombies to win', '清空剩余尸潮即获胜'],
  ['xp', 'XP', '经验'],
  ['experience', 'Experience', '经验'],
  ['xpProgress', 'XP {current}/{next}', '经验 {current}/{next}'],
  ['nextDraft', 'Next upgrade', '下次三选一'],
  ['draftLevel', 'Lv.{level}', 'Lv.{level}'],
  ['kills', 'Kills', '击杀'],
  ['killsValue', 'Kills {count}', '击杀 {count}'],
  ['kill', 'Kill', '击杀'],
  ['time', 'Time', '耗时'],
  ['activeTime', 'Battle time', '战斗耗时'],
  ['timeHint', 'Only live battle time counts.', '仅统计实战时间。'],
  ['enemy', 'Zombie', '僵尸'],
  ['enemies', 'Zombies', '僵尸图鉴'],
  ['enemyCount', 'Zombies {count}', '僵尸 {count}'],
  ['boss', 'Boss', '首领'],
  ['shot', 'Shot', '射击'],
  ['hit', 'Hit', '命中'],
  ['fence_hit', 'Wall hit', '城墙受击'],
  ['ui', 'Notice', '提示'],

  // Difficulty
  ['difficulty', 'Difficulty', '难度'],
  ['easy', 'Easy', '轻松'],
  ['normal', 'Normal', '标准'],
  ['hard', 'Hard', '困难'],
  ['nightmare', 'Nightmare', '噩梦'],
  ['rewardMultiplier', 'Reward multiplier', '奖励倍率'],
  ['rewardMultiplierValue', '×{value}', '×{value}'],
  ['rewardLine', 'Reward ×{value}', '奖励 ×{value}'],
  ['timesValue', '×{value}', '×{value}'],
  ['percentValue', '{value}%', '{value}%'],
  ['higherDifficultyPays', 'Higher difficulties pay more.', '难度越高，奖励越多。'],
  ['difficultyHint', 'Harder fights pay a higher multiplier.', '战斗越难，奖励倍率越高。'],
  ['difficultyEasyHint', 'Softer zombies and a baseline reward.', '僵尸更温和，奖励为基准。'],
  ['difficultyNormalHint', 'The intended fight, with a higher reward.', '标准强度，奖励更高。'],
  ['difficultyHardHint', 'Stronger zombies and a larger reward.', '僵尸更强，奖励更大。'],
  ['difficultyNightmareHint', 'The hardest fight and the largest reward.', '极限强度，奖励最高。'],
  ['startDifficulty', 'Play on {difficulty}', '以{difficulty}开始'],

  // Settings and language. 中 / EN are the persistent switch labels.
  ['settings', 'Settings', '设置'],
  ['language', 'Language', '语言'],
  ['languageZh', '中文', '中文'],
  ['languageEn', 'English', 'English'],
  ['langZh', '中', '中'],
  ['langEn', 'EN', 'EN'],
  ['languageCurrent', 'Language: {language}', '语言：{language}'],
  ['languageHint', 'You can change language during a run. Progress stays.', '战斗中可随时切换语言，进度会保留。'],
  ['sound', 'Sound', '声音'],
  ['soundOn', 'Sound on', '声音开'],
  ['soundOff', 'Sound off', '声音关'],
  ['soundHint', 'Sound starts off. The first tap turns on audio for this browser.', '声音默认关闭，首次点击开启音效。'],
  ['reducedMotion', 'Reduced motion', '减少动效'],
  ['reducedMotionOn', 'Reduced motion on', '减少动效：开'],
  ['reducedMotionOff', 'Reduced motion off', '减少动效：关'],
  ['reducedMotionHint', 'Cuts extra flashes, shakes, and motion.', '减少额外的闪光、震动和粒子。'],

  // Draft & upgrades
  ['draft', 'Level Up', '升级选卡'],
  ['draftTitle', 'Level Up · Pick 1 of 3', '升级强化 · 三选一'],
  ['chooseOneOfThree', 'Level Up · Pick 1 of 3', '升级强化 · 三选一'],
  ['draftOnField', 'Active', '已激活'],
  ['draftNewType', 'New', '新解锁'],
  ['chooseUpgrade', 'Choose an upgrade', '选择强化'],
  ['chooseSlot', 'Center Wall', '城墙正中'],
  ['chooseTower', 'Add {name}', '加入{name}'],
  ['chooseHeroUpgrade', 'Gunner: {name}', '枪手：{name}'],
  ['chooseReplace', 'Replace with {name}', '替换为{name}'],
  ['immediateEffect', 'Applies right away', '立即生效'],
  ['cancelPlacement', 'Back', '返回'],
  ['placementCanceled', 'Canceled.', '已取消。'],
  ['placing', 'Ready', '准备中'],
  ['placingTitle', 'Center Wall', '城墙正中'],
  ['placingHint', 'The Gunner holds the center wall position.', '防线枪手固定驻守城墙正中。'],
  ['tapToPlace', 'Center Wall', '城墙正中'],
  ['tapToMove', 'Gunner stays centered', '枪手固定正中'],
  ['fullBoard', 'Maxed out', '已满'],
  ['fullBoardHint', 'Pick Gun Mods or Auto Skills to keep powering up.', '继续选择枪械强化与自动技能提升火力。'],
  ['emptySlot', 'Empty', '空位'],
  ['select', 'Select', '选择'],
  ['details', 'Details', '详情'],
  ['hideDetails', 'Hide details', '收起详情'],
  ['selected', 'Selected', '已选中'],
  ['selectedUnit', 'Wall Gunner', '防线枪手'],
  ['selectToInspect', 'Tap the Gunner to view stats', '点击枪手查看属性'],
  ['noSelection', 'Nothing selected', '未选择'],
  ['clearSelection', 'Close', '关闭'],
  ['place', 'Deploy', '部署'],
  ['move', 'Move', '移动'],
  ['moveHere', 'Move here', '移到这里'],
  ['swap', 'Swap', '互换'],
  ['moved', 'Moved', '已移动'],
  ['swapped', 'Swapped', '已互换'],
  ['frontRow', 'Wall Line', '城墙防线'],
  ['rearRow', 'Rear', '后排'],
  ['slotNumber', 'Position {index}', '位置 {index}'],
  ['sourceSlot', 'Source', '来源'],
  ['targetSlot', 'Target', '目标'],
  ['occupied', 'Occupied', '已有单位'],
  ['slotOccupied', 'Occupied', '已有单位'],
  ['tower', 'Turret', '炮塔'],
  ['towers', 'Turrets', '炮塔'],
  ['hero', 'Wall Gunner', '防线枪手'],
  ['hybrid', 'Hybrid', '混合'],
  ['hero_upgrade', 'Gun Mod', '枪械强化'],
  ['heroUpgrades', 'Gun Mods & Auto Skills', '枪械与技能'],
  ['runUpgrades', 'Active Upgrades', '本局强化'],
  ['nonMergeable', 'Solo Gunner', '单枪防线'],
  ['autoAttack', 'Fires automatically', '自动瞄准开火'],
  ['noActiveAbility', 'Auto Skills trigger on cooldown', '自动技能冷却即释放'],
  ['notControlled', 'Auto-aimed', '全自动瞄准'],
  ['replace', 'Replace', '替换'],
  ['replaceConfirm', 'Replace?', '替换？'],
  ['replaceConfirmBody', 'The Gunner always holds the center wall.', '枪手始终驻守城墙正中。'],
  ['replaceKeep', 'Keep', '保留'],
  ['unknownUnit', 'Unknown unit', '未知单位'],
  ['unknownEnemy', 'Unknown zombie', '未知僵尸'],

  // Legacy reason keys (kept for safe error lookup)
  ['merge', 'Merge', '合成'],
  ['mergePreview', 'Preview', '预览'],
  ['mergeConfirm', 'Confirm', '确认'],
  ['mergeCancel', 'Cancel', '取消'],
  ['mergeResult', 'Result', '结果'],
  ['heroProtected', 'The Gunner stays on the center wall.', '枪手始终驻守城墙正中。'],
  ['invalidMerge', 'Unavailable', '不可用'],
  ['sameTypeResult', 'Lv.{rank}', 'Lv.{rank}'],
  ['hybridResult', '{name}', '{name}'],
  ['ingredientPair', '{left} + {right}', '{left} + {right}'],
  ['resultRank', 'Lv.{rank}', 'Lv.{rank}'],
  ['previewSafe', 'Preview only.', '仅预览。'],
  ['confirmToMerge', 'Confirm.', '确认。'],
  ['unitsPreserved', 'Kept.', '已保留。'],
  ['consumesSource', 'Consumed.', '消耗。'],
  ['recipes', 'Recipes', '配方'],
  ['ingredients', 'Ingredients', '材料'],
  ['effect', 'Effect', '效果'],
  ['baseTowers', 'Base', '基础'],
  ['hybrids', 'Hybrid', '混合'],
  ['rank', 'Lv', '级'],
  ['rankValue', 'Lv.{rank}', 'Lv.{rank}'],
  ['rankCap', 'Max Lv.4', '最高 4 级'],
  ['equalRank', 'Same level', '同级'],
  ['maxRank', 'Already max level', '已达满级'],
  ['notPlanning', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['planningRequired', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['cannotMoveDuringFight', 'Gunner holds the center wall', '枪手固定驻守城墙正中'],
  ['sameSlot', 'Gunner stays in the center', '枪手固定驻守正中'],
  ['invalidSlot', 'Invalid position', '无效位置'],
  ['missingUnit', 'No unit', '没有单位'],
  ['reasonEmpty', 'Empty', '空位'],
  ['emptySource', 'Empty', '空位'],
  ['emptyTarget', 'Empty', '空位'],
  ['rankMismatch', 'Level mismatch', '等级不符'],
  ['noRecipe', 'Unavailable', '不可用'],
  ['hybridMix', 'Unavailable', '不可用'],
  ['hybridMismatch', 'Unavailable', '不可用'],
  ['kindMismatch', 'Unavailable', '不可用'],
  ['incompatible', 'Unavailable', '不可用'],
  ['heroSlot', 'Gunner position', '枪手位置'],
  ['replaceRequired', 'Unavailable', '不可用'],
  ['invalidChoice', 'That card is not available', '该强化卡不可用'],
  ['noDraft', 'No active upgrade pick', '当前没有升级选卡'],
  ['notPlacing', 'Nothing to place', '无需放置'],
  ['noPending', 'Nothing pending', '无待放置项'],

  // Combat stats
  ['damage', 'Damage', '伤害'],
  ['range', 'Range', '射程'],
  ['attackSpeed', 'Fire rate', '攻速'],
  ['crit', 'Crit', '暴击'],
  ['critChance', 'Crit chance', '暴击率'],
  ['critMultiplier', 'Crit damage', '暴击伤害'],
  ['interval', 'Interval', '间隔'],
  ['projectileSpeed', 'Bullet speed', '弹速'],
  ['splash', 'Blast', '溅射'],
  ['chain', 'Chain', '弹射'],
  ['chainRange', 'Chain range', '弹射范围'],
  ['pierce', 'Pierce', '穿透'],
  ['burn', 'Burn', '燃烧'],
  ['poison', 'Poison', '中毒'],
  ['slow', 'Slow', '减速'],
  ['stun', 'Stun', '麻痹'],
  ['brittle', 'Brittle', '易伤'],
  ['aura', 'Aura', '光环'],
  ['support', 'Support', '支援'],
  ['haste', 'Fire rate', '攻速'],
  ['vitality', 'Wall HP', '城墙血量'],
  ['status', 'Status', '状态'],
  ['statuses', 'Statuses', '状态'],
  ['duration', 'Duration', '持续'],
  ['stacks', 'Stacks', '层数'],
  ['dps', 'Damage per second', '每秒伤害'],
  ['factor', 'Speed factor', '移速系数'],
  ['mechanics', 'Effects', '特效'],
  ['statDamage', 'Damage {value}', '伤害 {value}'],
  ['statRange', 'Range {value}', '射程 {value}'],
  ['statInterval', 'Every {value}s', '每 {value} 秒'],
  ['statCrit', 'Crit {chance} ×{multiplier}', '暴击 {chance} ×{multiplier}'],
  ['statProjectile', 'Bullet speed {value}', '弹速 {value}'],
  ['statSplash', 'Blast {value}', '溅射 {value}'],
  ['statChain', 'Chain {count}', '弹射 {count}'],
  ['statPierce', 'Pierce {count}', '穿透 {count}'],
  ['slowFactor', 'Moves at {value}', '移速降至 {value}'],
  ['auraDamage', 'Damage bonus', '伤害加成'],
  ['auraHaste', 'Fire rate bonus', '攻速加成'],
  ['auraRange', 'Aura range', '光环范围'],

  // Armory and permanent meta
  ['armory', 'Armory', '军械库'],
  ['codex', 'Codex', '图鉴'],
  ['currency', 'Coins', '金币'],
  ['currencyAmount', 'Coins {amount}', '金币 {amount}'],
  ['buy', 'Buy', '购买'],
  ['equip', 'Equip', '装备'],
  ['equipped', 'Equipped', '已装备'],
  ['equippedBonus', 'Equipped bonus', '已装备加成'],
  ['owned', 'Owned', '已拥有'],
  ['upgrade', 'Upgrade', '升级'],
  ['upgraded', 'Upgraded', '已升级'],
  ['purchased', 'Purchased', '已购买'],
  ['cost', 'Cost', '花费'],
  ['costValue', 'Cost {cost}', '花费 {cost}'],
  ['level', 'Level', '等级'],
  ['levelValue', 'Lv.{level}', 'Lv.{level}'],
  ['levelOf', 'Lv.{level}/{max}', 'Lv.{level}/{max}'],
  ['maxLevel', 'Max level', '已满级'],
  ['maxed', 'Maxed', '已满级'],
  ['levelCap', 'Max level', '等级上限'],
  ['insufficientCurrency', 'Not enough coins', '金币不足'],
  ['locked', 'Locked', '未解锁'],
  ['weapon', 'Weapon', '枪械'],
  ['charm', 'Charm', '护符'],
  ['armor', 'Armor', '城墙装甲'],
  ['equipment', 'Gear', '武装装备'],
  ['permanent', 'Permanent upgrades', '永久强化'],
  ['permanentUpgrades', 'Permanent upgrades', '永久强化'],
  ['headStart', 'Head start', '开局优势'],
  ['bonus', 'Bonus', '加成'],
  ['currentBonuses', 'Current bonuses', '当前加成'],
  ['bonusDamage', 'Damage +{value}', '伤害 +{value}'],
  ['bonusHaste', 'Fire rate +{value}', '攻速 +{value}'],
  ['bonusRange', 'Range +{value}', '射程 +{value}'],
  ['bonusCritChance', 'Crit chance +{value}', '暴击率 +{value}'],
  ['bonusFence', 'Wall +{value}', '城墙 +{value}'],
  ['bonusReward', 'Coins +{value}', '金币 +{value}'],
  ['noneEquipped', 'Nothing equipped', '未装备'],
  ['unequip', 'Unequip', '卸下'],
  ['noEquipment', 'No gear yet', '还没有武装装备'],
  ['noUpgrades', 'No permanent upgrades yet', '还没有永久强化'],
  ['notOwned', 'Not owned yet', '尚未拥有'],
  ['alreadyOwned', 'Already owned', '已经拥有'],
  ['alreadyEquipped', 'Already equipped', '已经装备'],
  ['wrongSlot', 'Wrong gear slot', '装备部位不符'],
  ['unknownItem', 'Unknown item', '未知物品'],
  ['unknownUpgrade', 'Unknown upgrade', '未知强化'],
  ['profile', 'Profile', '档案'],
  ['best', 'Best runs', '最佳记录'],
  ['noBest', 'No settled runs yet', '还没有结算记录'],
  ['bestWave', 'Best wave', '最高波次'],
  ['bestKills', 'Best kills', '最高击杀'],
  ['bestLine', 'Best · wave {wave} · {kills} kills', '最佳 · 第 {wave} 波 · 击杀 {kills}'],
  ['runsSettled', 'Completed runs', '已结算局数'],
  ['newRecord', 'New record', '新纪录'],

  // Results
  ['results', 'Results', '战斗结算'],
  ['victory', 'Victory', '防线守住！'],
  ['defeat', 'Defeat', '城墙失守'],
  ['abandoned', 'Abandoned', '已撤离'],
  ['runComplete', 'Stage complete', '本关结束'],
  ['resultSummary', '{result} · {difficulty}', '{result} · {difficulty}'],
  ['victoryBody', 'The wall held! Your coin reward has been saved.', '城墙守住了！通关金币已入账。'],
  ['defeatBody', 'The wall fell, but you still earned coins for your progress.', '城墙倒下了，但本局进度仍会发放金币奖励。'],
  ['defeatNext', 'Visit the Armory to equip Core Gems or upgrade firepower before retrying.', '前往军械库镶嵌核心宝石或升级枪械火力，再来挑战更轻松！'],
  ['defeatNextEasy', 'Armory bonuses apply right away on your next attempt.', '军械库强化会在下一关立即生效。'],
  ['defeatBuy', 'You can buy {name} for {cost}. It applies on your next run.', '可以购买【{name}】（花费 {cost} 金币），下一关生效。'],
  ['defeatEquip', 'Equip {name} before your next run.', '下一关开始前记得装备【{name}】。'],
  ['defeatShort', 'You need {short} more coins for {name} (costs {cost}).', '再赚 {short} 金币即可解锁【{name}】（{cost} 金币）。'],
  ['abandonBody', 'You left this stage. Progress reward saved once.', '你已撤离本关，本局进度金币已结算。'],
  ['earned', 'Earned', '获得'],
  ['earnedAmount', 'Earned {amount}', '获得 {amount}'],
  ['damageDealt', 'Damage dealt', '总伤害'],
  ['mergesMade', 'Upgrades', '强化次数'],
  ['critsLanded', 'Critical hits', '暴击次数'],
  ['fenceDamageTaken', 'Wall damage taken', '城墙承伤'],
  ['noReward', 'No reward', '无金币'],
  ['freshAbandon', 'Play at least 30s or 3 kills to earn coins.', '战斗不足 30 秒且击杀少于 3 只，不发放金币。'],
  ['alreadySettled', 'Already rewarded', '本局金币已发放'],
  ['notFinished', 'Stage not finished yet', '本关尚未结束'],
  ['noDoublePay', 'Each stage attempt pays once.', '每局最多结算一次。'],
  ['rewardRule', 'First-time stage clears pay extra bonus coins.', '首次通关每一关都有额外首通金币奖励。'],
  ['playAgain', 'Play again', '再来一关'],
  ['returnMenu', 'Main menu', '返回主页'],
  ['endless', 'Endless', '无尽'],
  ['endlessOffer', 'Continue into Endless mode? Your victory reward is saved.', '继续挑战无尽模式？本关通关金币已经安全保存。'],
  ['endlessEnter', 'Enter Endless', '继续无尽模式'],
  ['endlessStay', 'Not now', '暂不进入'],
  ['endlessNote', 'Endless does not pay the stage clear reward twice.', '无尽模式不会重复发放通关奖励。'],

  // Save, import, confirmations
  ['exportSave', 'Export save', '导出存档'],
  ['importSave', 'Import save', '导入存档'],
  ['importError', 'That save could not be imported', '无法导入这份存档'],
  ['invalid_json', 'That text is not valid save data. The current save was kept.', '这段文字不是有效的存档，当前存档已保留。'],
  ['invalid_format', 'That file is not a Fencefall save. The current save was kept.', '这不是最后一道防线的存档，当前存档已保留。'],
  ['invalid_version', 'That save is from another version. The current save was kept.', '这份存档的版本不同，当前存档已保留。'],
  ['invalid_profile', 'The profile in that save is not valid. The current save was kept.', '存档里的档案无效，当前存档已保留。'],
  ['invalid_run', 'The battle in that save is not valid. The current save was kept.', '存档里的对局无效，当前存档已保留。'],
  ['invalid_bounds', 'That save has a number outside the allowed range. The current save was kept.', '存档里有超出允许范围的数字，当前存档已保留。'],
  ['invalid_enum', 'That save has an unknown setting. The current save was kept.', '存档里有无法识别的设置，当前存档已保留。'],
  ['invalid_hero', 'That save does not contain one gunner. The current save was kept.', '存档里枪手数据异常，当前存档已保留。'],
  ['invalid_slots', 'That save has invalid board data. The current save was kept.', '存档阵地数据异常，当前存档已保留。'],
  ['invalid_settlement', 'That save has an invalid result. The current save was kept.', '存档里的结算数据无效，当前存档已保留。'],
  ['storage_unavailable', 'Storage is not available. The current save was kept.', '无法使用本地存储，当前存档已保留。'],
  ['too_large', 'That save is too large. The current save was kept.', '这份存档太大，当前存档已保留。'],
  ['quota', 'Storage is full. The current save was kept.', '存储空间已满，当前存档已保留。'],
  ['importSuccess', 'Save imported', '存档已导入'],
  ['noSave', 'No saved battle', '没有已保存的对局'],
  ['saveFailed', 'Could not save', '保存失败'],
  ['saveData', 'Save backup', '存档备份'],
  ['pasteHere', 'Paste save data here', '在此粘贴存档数据'],
  ['exportHint', 'Copy this backup and keep it somewhere safe.', '复制这份存档文本即可在其他设备恢复进度。'],
  ['importHint', 'Paste a backup exported from this game.', '粘贴之前导出的存档文本即可恢复。'],
  ['importEmpty', 'Paste save data first', '请先粘贴存档数据'],
  ['confirmImport', 'Importing replaces your current save on this device.', '导入会覆盖当前设备上的存档。'],
  ['confirmRestart', 'Restart this stage from wave 1?', '重新开始本关？'],
  ['confirmNewRun', 'Start a new stage and clear the paused battle?', '开始新关卡并放弃已暂停的战斗？'],
  ['abandonConfirm', 'Abandon this stage?', '确定撤离本关？'],
  ['abandonDetail', 'Leaving before 30s and 3 kills earns no coins. Victory or defeat pays once.', '不足 30 秒且击杀少于 3 只撤离没有金币；正常结束都会结算一次。'],
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

  // How to play — crisp Pure Solo-Gunner guide
  ['howto', 'How to Play', '玩法说明'],
  ['howtoLead', 'Hold the center wall · Pick 1 of 3 · Unleash Auto Skills!', '单枪死守正中 · 升级三选一 · 满屏自动技能割草！'],
  ['helpOverview', 'Your Gunner holds the center of the steel wall and shoots incoming zombies automatically—no grid, no turret placement needed.', '防线枪手固定驻守城墙正中，自动瞄准并射杀来袭尸潮，无需摆塔或操作格子。'],
  ['helpPlacement', 'Clear 20 handcrafted stages across 4 chapters, earning 1–3 stars and first-clear bonus coins on every stage.', '按顺序闯过四大章节共 20 关，每关根据剩余城墙血量评定 1–3 星并领取首通金币。'],
  ['helpDraft', 'Kills fill the XP bar. Each level-up pauses the battle and lets you pick 1 of 3 upgrades: Gun Mods (枪械强化) or Auto Skills (自动技能).', '击杀僵尸攒经验升级，每次升级弹出三选一：直接提升主枪威力的「枪械强化」，以及冷却一到自动轰炸全场的「自动技能」。'],
  ['helpFence', 'Zombies only attack the wall. Wall Shield blocks and emergency shockwaves protect you in close calls—if Wall HP hits 0, the stage ends.', '僵尸只会攻击城墙，枪手不会阵亡。城墙免伤护盾与危急冲击波会在关键时刻护墙，城墙血量归零则失败。'],
  ['helpRange', 'Tap the Gunner anytime during battle to check live weapon stats and switch target priority (Closest / Specials / Tankiest / Lowest HP).', '战斗中随时点击城墙正中的枪手，可查看实时属性并一键切换优先攻击目标（最前 / 高危 / 最肉 / 残血）。'],
  ['helpSpeed', 'Switch freely between 1×, 1.5×, 3×, and 10× speed without affecting drops or coins.', '支持 1×、1.5×、3×、10× 四档倍速，随时加速割草且不影响任何金币奖励。'],
  ['helpHero', 'Combine Gun Mods (Multi-Volley, Armor Pierce, Flame/Frost Rounds) with Auto Skills (Napalm Fire Sea, Armored Sweeper, Glacial Barrage, Orbital Laser, EM Chain Strike, Split Shrapnel).', '自由组合齐射、穿甲、冰火子弹等「枪械强化」，与燃油火海、装甲车、干冰柱、高能激光、电磁天雷、子母分裂等「自动技能」。'],
  ['helpRewards', 'Spend coins in the Armory on Core Gems, Gear, and Permanent Upgrades. Claim the free Starter Pack on the home screen!', '通关与战败均可获得金币，去军械库镶嵌核心宝石、换武装、升永久属性。主页还可免费领新手补给包！'],
  ['helpEquipment', 'Equip up to 3 Core Gems, plus Weapon, Charm, and Wall Armor in the Armory—all bonuses apply automatically.', '在军械库最多镶嵌 3 颗核心宝石，并穿戴枪械、护符与城墙装甲，开局自动生效。'],
  ['helpLanguage', 'Switch 中 / EN anytime from the top bar without losing your run.', '随时点击顶部 中 / EN 切换中英文，保留当前进度。'],
  ['helpLanes', 'Zombies surge across the whole highway toward your fortified wall.', '尸潮铺满整条荒原公路涌向钢铁城墙。'],
  ['helpWin', 'Survive all waves and defeat the finale or Boss to clear the stage and unlock the next one!', '顶住全部波次并击溃终局尸潮或首领即可过关，自动解锁下一关！'],
  ['helpBoss', 'Bosses appear every 5 stages (Stages 5, 10, 15, 20) and enrage at 50% HP. Pair Armor Pierce, Deadeye Crit, and Orbital Laser!', '每 5 关出现首领关（第 5、10、15、20 关），首领半血狂暴，善用穿甲、暴击与高能激光柱融化它！'],
  ['helpSave', 'Progress saves automatically in your browser. Export or import JSON backups anytime in Settings.', '闯关进度自动保存在本地浏览器，随时可在设置页导出/导入备份。'],
  ['helpStatuses', 'Burn, Slow, Stun, and Brittle stack together—pair them with the Elemental Surge Gem for +25% bonus damage.', '燃烧、减速、麻痹、易伤可叠加，搭配【冰火增伤宝石】额外增伤 25%。'],
  ['helpDifficulty', 'Each stage increases zombie strength and introduces new special zombies across 4 chapters.', '20 关逐级递增强度，逐步解锁喷酸、分裂、治疗、护盾、自爆等 15 种僵尸。'],
  ['helpSupport', 'Auto Skills recharge automatically and show their cooldown progress along the bottom of the battlefield.', '所有自动技能冷却结束后自动释放，战场下方会实时显示各技能充能进度。'],
  ['helpCrit', 'Critical hits deal multiplied damage and trigger knockback and HP-shred bonuses.', '暴击造成高额倍率伤害，并可触发击退与百分比斩血特效。'],
  ['helpTouch', 'Built for one-hand mobile play: thumb-zone bottom bar, 1-tap upgrade cards, and instant target switching.', '专为手机单手优化：底部拇指操作栏、一键三选一与快捷索敌切换。'],
  ['helpEndless', 'After clearing a stage, you can optionally keep playing in Endless mode to test your maxed build!', '通关后可选择继续进入无尽模式，测试成型弹幕的极限清场爽感！'],

  // Accessibility labels
  ['ariaBattlefield', 'Battlefield', '战场'],
  ['ariaFence', 'Steel wall', '钢铁城墙'],
  ['ariaSlot', 'Wall position {index}', '城墙位置 {index}'],
  ['ariaPause', 'Pause the fight', '暂停战斗'],
  ['ariaResume', 'Resume the fight', '继续战斗'],
  ['ariaSpeed', 'Game speed', '倍速'],
  ['ariaSpeed1', 'Set speed to 1×', '速度设为 1×'],
  ['ariaSpeed15', 'Set speed to 1.5×', '速度设为 1.5×'],
  ['ariaSpeed3', 'Set speed to 3×', '速度设为 3×'],
  ['ariaSpeed10', 'Set speed to 10×', '速度设为 10×'],
  ['ariaLanguage', 'Language', '语言'],
  ['ariaDialog', 'Dialog', '对话框'],

  // Panel copy
  ['armoryIntro', 'Equip up to 3 Core Gems, gear up, and level permanent upgrades to crush tougher stages.', '镶嵌最多 3 颗核心宝石、穿戴武装并升级永久属性，轻松突破高难关卡。'],
  ['bonuses', 'Active Loadout Bonuses', '当前配置加成'],
  ['rewardBonusNote', 'Coin bonuses increase earnings at stage settlement.', '金币加成会在战斗结算时生效。'],
  ['equipReplaces', 'Equipping an item swaps it into that gear slot.', '点击装备即可直接替换当前部位武装。'],
  ['codexRankNote', 'Pick Gun Mods and Auto Skills during battle to stack levels and unlock explosive synergies.', '战斗中升级三选一可叠加「枪械强化」与「自动技能」等级，组合出满屏弹幕！'],
  ['settingsKeepRun', 'Changes apply immediately without interrupting your saved run.', '设置实时生效，不会丢失当前已保存的对局。'],
  ['difficultyNextRun', 'Applies on your next sortie.', '将在下一关出击时生效。'],
  ['difficultyRewards', 'Higher stages pay bigger first-clear coin rewards.', '越靠后的关卡首通金币奖励越丰厚。'],
  ['helpRole', 'Zero active buttons — focus on choosing Gun Mods & Auto Skills while your Gunner handles the firing.', '无需复杂走位与主动按键——专注三选一搭配枪械强化与自动技能，火力全自动倾泻。'],
  ['helpAura', 'Elemental effects combine for huge damage.', '元素异常叠加可打出巨额伤害。'],
  ['helpBoard', 'Zombies surge down the wasteland road toward your fortified steel wall.', '尸潮沿荒原公路涌向钢铁城墙，防线枪手在城墙正中迎击。'],
  ['helpRows', 'Your Gunner stays anchored at the center of the steel wall.', '防线枪手固定驻守在城墙正中炮位。'],
  ['enemyApproach', 'Approaches from top.', '从上方涌入。'],
  ['enemyFenceOnly', 'Targets the steel wall.', '仅攻击城墙。'],
  ['fenceDamage', 'Wall damage taken', '城墙承伤'],
  ['health', 'Health', '生命'],
  ['enemyHealth', 'Zombie HP', '僵尸血量'],
  ['enemySpeed', 'Zombie speed', '僵尸移速'],
  ['enemyDamage', 'Zombie damage', '僵尸伤害'],
  ['pressureCount', 'Horde size', '尸潮规模'],
  ['saveHelp', 'Export a JSON backup of your profile & progress, or paste a backup to restore.', '导出档案与闯关进度的 JSON 备份，或粘贴已有存档恢复。'],
  ['copySave', 'Copy save', '复制存档'],
  ['copyUnavailable', 'Select the text above to copy.', '请选中上方文本手动复制。'],
  ['noOutcome', 'No settled outcome yet.', '本局尚未结算。'],
  ['settlementPending', 'Coins appear after battle settlement.', '战斗结算后将在此显示金币收益。'],
  ['on', 'On', '开启'],
  ['off', 'Off', '关闭'],
  ['unavailable', 'Not available', '暂不可用'],
  ['missing', 'Waiting', '等待中'],
  ['invalidProfile', 'Invalid profile data', '档案数据无效'],
  ['error', 'Something went wrong', '出了点问题'],
  ['bad-phase', 'Not available right now', '当前阶段不可用'],
  ['bad-speed', 'Speed must be 1×, 1.5×, 3×, or 10×', '倍速仅支持 1×、1.5×、3×、10×'],
  ['bad-language', 'Language must be EN or ZH', '语言仅支持中/英'],
  ['bad-screen', 'Unknown screen', '未知界面'],
  ['unknown-action', 'Unknown action', '未知操作'],
  ['backRow', 'Wall Deck', '城墙阵地'],
  ['critDamage', 'Crit×', '暴伤'],
  ['projectile', 'Bullet', '子弹'],
  ['pauseToPlan', 'Tap the Gunner anytime to switch target priority.', '随时点击枪手即可查看属性或切换优先攻击目标。'],
  ['planningLocked', 'Tap the Gunner anytime to switch target priority.', '随时点击枪手即可查看属性或切换优先攻击目标。'],
  ['statsUnavailable', 'Stats unavailable.', '属性暂不可用。'],
  ['emptySelection', 'Tap the Gunner at center wall to view stats or switch target priority.', '点击城墙正中的枪手可查看属性或切换优先攻击目标。'],
  ['supportNote', 'Auto Skills fire automatically on cooldown.', '自动技能冷却就绪后自动释放。'],
  ['youGain', 'Result', '效果'],
  ['currentStats', 'Stats', '属性'],
  ['chooseEmpty', 'Tap the Gunner at center wall.', '点击城墙正中的枪手。'],
  ['heroStays', 'Gunner holds the center wall.', '枪手固定驻守城墙正中。'],
  ['moveHint', 'Tap below to switch target priority.', '点击下方切换优先攻击目标。'],
  ['buildPanelLabel', 'Upgrades and gunner controls', '强化选卡与枪手控制'],
  ['kindTower', 'Turret', '炮塔'],
  ['no_draft', 'No active upgrade pick', '当前没有三选一'],
  ['no_options', 'All upgrades maxed', '全部强化已满级'],
  ['not_playing', 'Fight is not active', '当前不在战斗中'],
  ['not_ready', 'Need more XP', '经验尚未满'],
  ['busy', 'Upgrade pick already open', '三选一已打开'],
  ['bad_index', 'Invalid choice', '无效选项'],
  ['bad_option', 'Invalid choice', '无效选项'],
  ['upgrade_failed', 'Upgrade failed', '强化未生效'],
  ['unknown_tower', 'Unknown unit', '未知单位'],
  ['no_slot', 'No open space', '无可用位置'],
  ['draft_missing', 'Upgrade closed', '选卡已关闭'],
  ['unknown_upgrade', 'Unknown upgrade', '未知强化'],
  ['upgrade_capped', 'Already max level', '已达满级'],
  ['no_hero', 'Gunner missing', '未找到枪手'],
  ['invalid_state', 'Action unavailable', '当前不可操作']
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

const RESULT_BODIES = Object.freeze({
  victory: 'victoryBody',
  defeat: 'defeatBody',
  abandon: 'abandonBody'
});

/** Victory, defeat, or abandoned. Any other outcome stays a sentence, never a raw code. */
export function resultLabel(language, outcome) {
  const lang = normalizeLanguage(language);
  if (outcome === 'victory') return t(lang, 'victory');
  if (outcome === 'defeat') return t(lang, 'defeat');
  if (outcome === 'abandon') return t(lang, 'abandoned');
  return t(lang, 'noOutcome');
}

/** One next step after a loss. Easy already is the lower pressure, so it points at the Armory. */
export function defeatAdvice(language, difficulty) {
  const lang = normalizeLanguage(language);
  return t(lang, difficulty === 'easy' ? 'defeatNextEasy' : 'defeatNext');
}

/** Names the next Armory action. An empty string means there is nothing left to buy or equip. */
export function armoryNextLine(language, offer) {
  const lang = normalizeLanguage(language);
  const name = offer?.name?.[lang] || offer?.name?.en || '';
  if (!name || !offer) return '';
  if (offer.kind === 'equip') return t(lang, 'defeatEquip', {name});
  if (offer.affordable) return t(lang, 'defeatBuy', {name, cost: offer.cost});
  return t(lang, 'defeatShort', {name, cost: offer.cost, short: offer.short});
}

/**
 * What happened, then what was paid. currency null means the purse is not settled yet.
 * A zero abandon names the short-run rule. Unknown outcomes never echo the code.
 */
export function resultStory(language, outcome, currency) {
  const lang = normalizeLanguage(language);
  const body = t(lang, RESULT_BODIES[outcome] || 'noOutcome');
  const join = (parts) => {
    const bits = parts.filter(Boolean);
    if (lang !== 'zh') return bits.join(' ');
    return bits.reduce((text, part, index) => {
      if (index === 0) return part;
      return `${text}${/[。！？]$/.test(text) ? '' : '。'}${part}`;
    }, '');
  };
  if (!Number.isFinite(currency)) return join([body, t(lang, 'settlementPending')]);
  const paid = t(lang, 'earnedAmount', {amount: currency});
  if (outcome === 'abandon' && currency <= 0) return join([body, t(lang, 'freshAbandon'), paid]);
  return join([body, paid]);
}
