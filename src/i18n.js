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
  ['ricochet', 'EM Ricochet', '电磁穿刺'],
  ['napalm', 'Napalm Barrage', '燃油弹火海'],
  ['armored_car', 'Armored Sweeper', '重装装甲车'],
  ['cryo_barrage', 'Glacial Barrage', '干冰连发柱'],
  ['orbital_beam', 'Orbital Laser', '高能射线'],
  ['starterPackTitle', 'Vanguard Starter Supply', '开荒爽玩补给包'],
  ['starterPackDesc', 'Claim +180 Coins + free Opening Airdrop Gem (instant 3-choice boost every run)!', '一键免费领 180 币 +【空投先锋宝石】（每局开场即享免费三选一），直接起飞！'],
  ['claimStarterPack', 'Claim +180 & Free Gem', '一键领取（+180币 +空投宝石）'],
  ['starterClaimed', 'Starter Supply Claimed · Opening Airdrop Ready', '开荒补给已领取 · 空投宝石已装配'],
  ['gems', 'Core Gems', '核心宝石'],
  ['gemsIntro', 'Equip up to 3 core gems for dramatic BangBang build powers. Tap any socket to swap.', '最多镶嵌 3 颗核心宝石，解锁城墙免疫、开局空投、贯穿与百分比斩杀。'],
  ['gemSlots', 'Equipped Slots', '已镶嵌槽位'],
  ['gemSlotEmpty', 'Empty', '空槽'],
  ['gemTierEpic', 'Epic', '史诗'],
  ['gemTierLegend', 'Legend', '传说'],
  ['openingDraft', 'Opening Airdrop', '开局空投'],
  ['wallImmunity', 'Wall Immunity', '城墙免疫'],
  ['heroPierce', 'Hero Pierce', '英雄穿透'],
  ['statusDamage', 'Elemental Surge', '异常增伤'],
  ['shredPercent', 'Crit Max-HP Shred', '暴击斩血'],
  ['superweaponHaste', 'Super-Weapon CD', '超武冷却'],
  ['starterWeapon', 'Opening Evolution', '开局随机超武'],
  ['aegisChip', 'Aegis', '盾'],
  ['openingDropTitle', 'Opening Airdrop · Pick 1 of 3', '开局空投 · 免费三选一'],
  ['arsenalNapalm', 'Napalm', '火海'],
  ['arsenalCar', 'Sweeper', '装甲车'],
  ['arsenalCryo', 'Glacial', '冰柱'],
  ['arsenalBeam', 'Laser', '激光'],
  ['arsenalEm', 'EM', '雷击'],
  ['tabBattle', 'Battle', '出击'],
  ['tabArmory', 'Armory', '军械'],
  ['tabCodex', 'Codex', '图鉴'],
  ['tabSettings', 'Settings', '设置'],
  ['armoryTabGems', 'Gems', '核心宝石'],
  ['armoryTabGear', 'Gear', '武装装备'],
  ['armoryTabUpgrades', 'Upgrades', '永久强化'],
  ['tagSuperweapon', 'Super-Weapon', '自动超武'],
  ['tagHero', 'Hero Mod', '英雄进化'],
  ['tagNewTurret', 'New Turret', '新炮塔'],
  ['tagUpgradeTurret', 'Upgrade Lv.{from}→{to}', '升级 Lv.{from}→{to}'],
  ['deployNow', 'Deploy Bastion', '开始防线'],
  ['swapHint', 'Drag to move or swap', '拖动可移位或互换'],
  ['teamDamage', 'Team damage', '全队伤害'],
  ['teamHaste', 'Team attack speed', '全队攻速'],
  ['teamCrit', 'Team crit chance', '全队暴击率'],
  ['freeRerolls', 'Extra rerolls', '额外刷新'],
  ['critKnockback', 'Critical knockback', '暴击击退'],
  ['surgeCharges', 'Surge charges', '冲击波充能'],
  ['surgePower', 'Surge power', '冲击波威力'],
  ['thorns', 'Wall thorns', '城墙反伤'],
  ['economy', 'War Chest', '战备增幅'],

  ['systems', 'Systems online', '已接入系统'],
  ['not-planning', 'Cannot move units right now', '现在不能调整站位'],
  ['no-run', 'Start a run first', '先开始一局'],
  ['bad-slot', 'Choose a wall slot', '请选择城墙格'],
  ['bad-choice', 'Choose one of the three cards', '请选择三张卡中的一张'],
  ['nextStats', 'After this choice', '选择之后'],
  ['draftWaiting', 'Tap a card to apply immediately.', '点选一张卡片立即生效。'],
  ['cancelPick', 'Back', '返回'],
  ['attacks', 'Attacks', '攻击'],
  ['reduction', 'slow', '减速'],
  ['kindUpgrade', 'Hero upgrade', '英雄进化'],
  ['slotLabel', 'Slot', '格子'],
  ['hero_protected', 'The hero stays on the wall.', '英雄始终驻守防线。'],
  ['same', 'Choose two different slots.', '请选择两个不同的格子。'],
  ['same_slot', 'Choose two different slots.', '请选择两个不同的格子。'],
  ['empty', 'That slot is empty.', '这个格子是空的。'],
  ['not_planning', 'Cannot rearrange right now.', '现在不能调整站位。'],
  ['phase', 'Drag defenders to move or swap slots anytime.', '战斗中可随时拖动防守单位调整站位。'],
  ['max_rank', 'Already at max level (Lv.4).', '已达到最高等级（Lv.4）。'],
  ['capped', 'Already at max level.', '该强化已满级。'],
  ['frost', 'Chills and slows enemies in range.', '减速范围内的敌人。'],
  ['lightning', 'Chains a strike between enemies.', '在敌人之间连锁电击。'],
  ['execute', 'Deals heavier damage to weakened enemies.', '对残血敌人造成更重伤害。'],
  ['surge', 'Surge', '冲击波'],
  ['targeting', 'Targeting', '索敌'],
  ['reroll', 'Reroll', '刷新'],
  ['free', 'Free', '免费'],
  ['foremost', 'Foremost', '最前'],
  ['priority', 'Priority', '高危'],
  ['strongest', 'Strongest', '最肉'],
  ['weakest', 'Weakest', '残血'],
  ['selectMission', 'Sortie', '选择出击'],
  ['corpseExplode', 'Corpse explosion', '尸爆'],
  ['thermalShock', 'Thermal shock', '蒸汽爆破'],
  ['armorPen', 'Armor penetration', '护甲穿透'],
  ['knockback', 'Knockback', '击退'],
  ['poisonDetonate', 'Poison reaction', '触媒反应'],
  ['cloud', 'Hazard zone', '火海/毒雾'],
  ['legacyRunReset', 'Profile migrated! Start a fresh v4 battle.', '档案已自动继承，请开启全新的 v4 爽玩对局！'],

  // Brand and navigation
  ['title', 'Fencefall', '最后一道防线'],
  ['titleLockup', 'Fencefall · 最后一道防线', 'Fencefall · 最后一道防线'],
  ['subtitle', 'Bastion Auto-Shooter', '全自动城墙弹幕防线'],
  ['tagline', 'Zero active buttons. Pick 1 of 3, unleash full-screen super-weapons.', '零主动按键，三选一构筑满屏弹幕与全自动超武。'],
  ['play', 'Play', '出击'],
  ['playHint', 'Start a new fight', '开始一场新的防线战斗'],
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
  ['newRun', 'New run', '新对局'],
  ['abandon', 'Abandon', '放弃'],
  ['loading', 'Loading', '加载中'],
  ['loadingGame', 'Fortifying the bastion…', '正在架设城墙防线…'],
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
  ['planning', 'Ready', '整备'],
  ['planningHint', 'Tap a unit to switch targeting, or drag to swap slots.', '点击单位切换索敌，拖动可互换站位。'],
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
  ['fenceBonus', 'Wall HP', '城墙生命'],
  ['fenceDanger', 'Wall Critical', '防线危急'],
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
  ['enemy', 'Enemy', '敌人'],
  ['enemies', 'Enemies', '敌人'],
  ['enemyCount', 'Enemies {count}', '敌人 {count}'],
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
  ['notPlanning', 'You cannot move or merge right now', '现在不能移动或合成'],
  ['planningRequired', 'You cannot move or merge right now', '现在不能移动或合成'],
  ['cannotMoveDuringFight', 'You can move units while the fight is running', '战斗进行时也可以移动单位'],
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
  ['equippedBonus', 'Equipped bonus', '已装备加成'],
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
  ['levelCap', 'Max level', '等级上限'],
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
  ['defeatNext', 'Easy lowers enemy health, speed, and damage. An Armory bonus applies on the next run.', '简单难度会降低敌人的生命、速度和伤害。军械库加成会在下一局生效。'],
  ['defeatNextEasy', 'An Armory bonus applies on the next run. A hero upgrade from a draft applies immediately.', '军械库加成会在下一局生效。整备中的英雄升级会立刻生效。'],
  ['defeatBuy', 'You can buy {name} for {cost}. It applies on the next run.', '可以购买{name}，价格 {cost}。下一局生效。'],
  ['defeatEquip', 'Equip {name} before the next run.', '下一局开始前装备{name}。'],
  ['defeatShort', 'You need {short} more for {name}, which costs {cost}.', '还差 {short} 才能购买{name}，价格 {cost}。'],
  ['abandonBody', 'You left this fight. That reward is saved once.', '你离开了这一局。这笔报酬只保存一次。'],
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
  ['howto', 'How to play', '玩法说明'],
  ['howtoLead', 'Pick 1 of 3. Unleash full-screen auto super-weapons.', '三选一构筑，零主动按键全自动割草。'],
  ['helpOverview', 'Zombies surge down toward your bastion wall. Hero rifles, auto super-weapons, and wall turrets fire automatically. Kill zombies to level up and pick 1 of 3 upgrades.', '尸潮从上方涌向钢铁城墙。英雄主炮、全自动超武与城墙炮塔全自动开火。击杀积累经验，通过三选一不断进化成型。'],
  ['helpPlacement', 'Picking a new turret deploys it automatically onto the wall; picking the same turret again upgrades it directly (Lv.1→Lv.4). Drag any defender on the wall anytime to move or swap slots.', '选中新炮塔会自动部署上墙；再次抽中同种炮塔将直接升级（Lv.1→Lv.4）。战斗中随时可拖动城墙单位移动或互换位置。'],
  ['helpDraft', 'Kills fill the XP bar. Each level-up pauses the fight and offers 3 cards: Hero weapon mods, Auto Super-Weapons, or Bastion Turret deploys & upgrades. One tap applies immediately.', '击杀填充经验条。每次升级都会暂停并弹出三选一：英雄弹幕强化、全自动超武或城墙炮塔部署/升级，单次点击立即生效。'],
  ['helpFence', 'Enemies attack only the bastion wall. Defenders never die. Auto-Surge shockwaves and Aegis Wall Immunity protect you at critical moments. If wall HP hits zero, the run ends.', '敌人只攻击钢铁城墙，防守单位无血条。危急时自动触发冲击波与城墙免疫保命。城墙生命归零则本局结束。'],
  ['helpRange', 'Tap any defender on the wall to see its range ring and switch targeting priority (Foremost, Priority, Strongest, Weakest) in one tap.', '点击城墙上的任意单位可查看射程圈，并一键切换索敌优先级（最前 / 高危 / 最肉 / 残血）。'],
  ['helpSpeed', 'Speeds are 1×, 1.5×, 3×, and 10×. They share one simulation clock and never alter rewards.', '支持 1×、1.5×、3×、10× 四档倍速，共用同一模拟时钟，不影响任何掉落与奖励。'],
  ['helpHero', 'Every run begins with your Hero in the front center. Evolve Hero bullets into Split Shrapnel, EM Ricochet, Napalm Fire Sea, Armored Sweeper, Glacial Barrage, and Orbital Laser.', '开局英雄驻守前排中央，可一路进化出子母分裂弹、电磁穿刺、燃油火海、重装装甲车、干冰连发柱与高能射线。'],
  ['helpRewards', 'Victory and defeat pay coins once. Higher difficulties multiply rewards. Claim the free Starter Pack on the home screen to skip early grind!', '胜负结算均可获得货币，难度越高倍率越高。主页可免费一键领取开荒补给包，直接跳过前期刮痧！'],
  ['helpEquipment', 'Spend coins in the Armory on 3-socket Core Gems, Gear, and Permanent Upgrades. Purchases take effect on your next sortie.', '在军械库镶嵌最多 3 颗核心宝石、装备武器护符装甲或强化永久属性，下一局立即生效。'],
  ['helpLanguage', 'Switch 中 / EN anytime from the top bar without losing your run.', '随时点击顶部 中 / EN 切换语言，保留当前对局与进度。'],
  ['helpLanes', 'No lanes — enemies stream across the entire field toward the bastion wall.', '无分路设计，尸潮从全屏上方涌向钢铁城墙。'],
  ['helpWin', 'Clear all waves to win, then optionally continue into Endless mode.', '清空全部波次即胜利，胜利后可继续挑战无尽模式。'],
  ['helpBoss', 'Bosses arrive on schedule with high HP and special traits. Use Armor-Pen, Crit Shredder, and Orbital Laser to melt them.', '首领按波次降临，善用穿甲、斩血宝石与高能射线集中融化。'],
  ['helpSave', 'Your profile and paused run save automatically in browser storage. Export or import JSON backups anytime.', '档案与暂停对局自动存于本地浏览器，随时可导出/导入 JSON 备份。'],
  ['helpStatuses', 'Burn, Poison, Slow, Stun, and Brittle stack together — pair them with the Elemental Surge Gem for +25% bonus damage.', '燃烧、中毒、减速、眩晕、易伤可叠加，搭配【冰火共鸣宝石】额外增伤 25%。'],
  ['helpDifficulty', 'Easy, Normal, Hard, and Nightmare scale enemy strength, wall HP, and coin rewards.', '轻松、标准、困难、噩梦分别调整敌人强度、城墙生命与结算奖励倍率。'],
  ['helpSupport', 'Banner turrets buff nearby allies (+damage & +attack speed) while firing brittle rounds.', '旌旗台一边攻击一边为周围友军提供伤害与攻速光环。'],
  ['helpCrit', 'Critical hits deal multiplied damage and trigger HP Shredder & Knockback bonuses.', '暴击造成倍率伤害，并可触发斩血与击退特效。'],
  ['helpTouch', 'Built mobile-first: thumb-zone bottom dock, one-tap 3-of-1 cards, and direct 4-mode targeting pills.', '专为手机单手优化：底部拇指操作栏、一键三选一卡片与四档索敌直选。'],
  ['helpEndless', 'Endless unlocks after clearing the main waves without paying the main victory bonus twice.', '通关主线后可继续无尽模式挑战极限波次。'],

  // Accessibility labels
  ['ariaBattlefield', 'Battlefield', '战场'],
  ['ariaFence', 'Bastion wall', '钢铁城墙'],
  ['ariaSlot', 'Wall slot {index}', '城墙槽位 {index}'],
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
  ['armoryIntro', 'Equip up to 3 Core Gems, gear up, and level permanent upgrades to crush tougher hordes.', '镶嵌最多 3 颗核心宝石、更换武装并升级永久属性，轻松横扫高难尸潮。'],
  ['bonuses', 'Active Loadout Bonuses', '当前配置加成'],
  ['rewardBonusNote', 'Reward bonuses multiply coins earned when a battle finishes.', '奖励加成会在战斗结算时与难度倍率叠乘。'],
  ['equipReplaces', 'Equipping an item swaps it into that gear slot.', '点击装备即可直接替换当前槽位武装。'],
  ['codexRankNote', 'Bastion turrets upgrade directly from Lv.1 to Lv.4 when picked again during battle.', '战斗中再次抽中同种炮塔可直接从 Lv.1 升至 Lv.4。'],
  ['settingsKeepRun', 'Changes apply immediately without interrupting your saved run.', '设置实时生效，不会丢失当前已保存的对局。'],
  ['difficultyNextRun', 'Difficulty applies when you start your next battle.', '难度将在下一局出击时生效。'],
  ['difficultyRewards', 'Higher difficulties increase zombie pressure and coin rewards.', '更高难度带来更猛尸潮与更高货币倍率。'],
  ['helpRole', 'Zero active combat skills — focus on building explosive synergies while your bastion handles the firing.', '严格零主动技能——专注构筑弹幕与超武联动，火力全自动倾泻。'],
  ['helpAura', 'Banner auras boost nearby defenders within range.', '旌旗光环会强化射程圆内的周边防守单位。'],
  ['helpBoard', 'Zombies advance toward the steel bastion wall with 2×5 defender slots behind it.', '尸潮自上而下推进，城墙后方设有 2×5 阵列供英雄与炮塔驻守。'],
  ['helpRows', 'Front row beside the Hero fills first; drag units anytime to rearrange.', '前排英雄两侧优先部署，可随时拖拽换位。'],
  ['enemyApproach', 'Approaches from top.', '从上方涌入。'],
  ['enemyFenceOnly', 'Targets the bastion wall.', '仅攻击城墙防线。'],
  ['fenceDamage', 'Wall damage taken', '城墙承伤'],
  ['health', 'Health', '生命'],
  ['enemyHealth', 'Enemy HP', '敌人生命'],
  ['enemySpeed', 'Enemy speed', '敌人移速'],
  ['enemyDamage', 'Enemy damage', '敌人伤害'],
  ['pressureCount', 'Horde size', '尸潮规模'],
  ['saveHelp', 'Export a JSON backup of your profile & run, or paste a backup to restore.', '导出档案与对局的 JSON 备份，或粘贴已有存档进行恢复。'],
  ['copySave', 'Copy save', '复制存档'],
  ['copyUnavailable', 'Select the text above to copy.', '请选中上方文本手动复制。'],
  ['noOutcome', 'No settled outcome yet.', '本局尚未结算。'],
  ['settlementPending', 'Rewards appear after battle settlement.', '战斗结算后将在此显示报酬。'],
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
  ['backRow', 'Rear deck', '后排'],
  ['critDamage', 'Crit×', '暴伤'],
  ['projectile', 'Projectile', '投射'],
  ['pauseToPlan', 'Drag defenders anytime to move or swap.', '随时拖动防守单位即可移动或换位。'],
  ['planningLocked', 'Drag defenders anytime to move or swap.', '随时拖动防守单位即可移动或换位。'],
  ['statsUnavailable', 'Stats unavailable.', '属性暂不可用。'],
  ['emptySelection', 'Tap a defender on the wall to inspect or set targeting.', '点击城墙上的单位可查看属性或切换索敌。'],
  ['supportNote', 'Support aura buffs defenders inside the range ring.', '支援光环强化射程圈内的所有友军。'],
  ['youGain', 'Result', '效果'],
  ['currentStats', 'Stats', '属性'],
  ['chooseEmpty', 'Empty wall slot — drag any unit here to reposition.', '空城墙槽位——可将任意单位拖至此处。'],
  ['heroStays', 'Hero stays on the bastion.', '英雄始终驻守城墙。'],
  ['moveHint', 'Drag to an empty slot to move, or onto another unit to swap.', '拖至空位移动，拖至其他单位直接互换。'],
  ['buildPanelLabel', 'Draft and unit controls', '选卡与单位控制'],
  ['kindTower', 'Turret', '炮塔'],
  ['no_draft', 'No active draft', '当前没有三选一'],
  ['no_options', 'All upgrades maxed', '全部强化已满级'],
  ['not_playing', 'Fight is not active', '当前不在战斗中'],
  ['not_ready', 'Need more XP', '经验尚未满'],
  ['busy', 'Draft already open', '三选一已打开'],
  ['bad_index', 'Invalid option', '无效选项'],
  ['bad_option', 'Invalid option', '无效选项'],
  ['upgrade_failed', 'Upgrade failed', '强化未生效'],
  ['unknown_tower', 'Unknown turret', '未知炮塔'],
  ['no_slot', 'Wall slots full', '城墙槽位已满'],
  ['draft_missing', 'Draft closed', '选卡已关闭'],
  ['unknown_upgrade', 'Unknown upgrade', '未知强化'],
  ['upgrade_capped', 'Already max level', '已达满级'],
  ['no_hero', 'Hero missing', '未找到英雄'],
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
