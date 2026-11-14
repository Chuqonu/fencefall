/**
 * Placement, draft, and merge UI.
 *
 * renderBuildPanel(container, state, api) rebuilds only the given container.
 * data-ui="overlay" shows the modal step: draft, placement, or merge confirmation.
 * data-ui="panel" shows inspection. Move and the slot grid stay on the panel
 * while playing. A draft overlay keeps three short choice cards and does not
 * include the 10-slot rearrange grid. Each card is the choice: tap the card,
 * there is no confirm or cancel under it. A mark and a meter show the power:
 * damage, attack speed, and range, or the one stat a hero upgrade changes.
 * A tower card says whether that base type is already on the board. Merge confirmation, when
 * a preview is open, shows the result name and rank, then at most two more lines.
 * It does not paste the catalog essay. Confirm and cancel stay 44px buttons.
 * A container without data-ui shows the modal and the inspection together.
 * Buttons call api.act. This module does not write run or profile state.
 * Clicks on its own controls stop at this panel so a parent bubble listener
 * does not run the same action twice. Other buttons in the container are left alone.
 */
import { canPlan, clone } from '../shared.js';
import { getUnitStats, TOWERS } from '../data/towers.js';
import { RECIPES } from '../data/recipes.js';
import { previewMerge } from '../systems/merges.js';
import { HERO_UPGRADES } from '../systems/hero.js';
import { localize, formatNumber, t as translate } from '../i18n.js';

const STYLE_ID = 'fencefall-build-panel-styles';

const CSS = `
.ff-build{display:flex;flex-direction:column;gap:10px;max-width:100%;min-width:0;color:#f1eee2;font:15px/1.35 ui-sans-serif,system-ui,sans-serif}
.ff-build *{box-sizing:border-box}
.ff-build h2,.ff-build h3,.ff-build p{margin:0}
.ff-build h2{font-size:1.15rem;line-height:1.25}
.ff-build h3{font-size:1rem;line-height:1.3;word-break:break-word}
.ff-build .card{min-width:0}
.ff-build .muted{color:#a5b8be}
.ff-build .ff-next-wave{font-size:13px;line-height:1.3}
.ff-build .badge{display:inline-block;padding:2px 6px;border:1px solid #6d8388;vertical-align:middle}
.ff-build .hero-lock{border-color:#e0c17a;color:#e0c17a}
.ff-build button{touch-action:manipulation}
.ff-build .btn{appearance:none;width:auto;min-height:44px;min-width:44px;height:auto;padding:8px 10px;border:1px solid #6d8388;border-radius:2px;background:#1c3338;color:#f1eee2;font:inherit;line-height:1.25;text-align:center;white-space:normal;word-break:break-word;cursor:pointer}
.ff-build .btn-primary{background:#2d6a4f;border-color:#e0c17a;color:#f7fff8;font-weight:700}
.ff-build .btn:focus-visible{outline:2px solid #f1eee2;outline-offset:2px}
.ff-build .ff-actions{display:flex;flex-wrap:wrap;gap:8px}
.ff-build .ff-actions .btn{flex:1 1 140px}
.ff-build .ff-merge .ff-actions .btn{flex:1 1 140px;min-width:44px;min-height:44px;height:44px}
.ff-build .card>.btn,.ff-build .ff-choice .btn{width:100%}
.ff-build .ff-draft-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.ff-build .ff-draft-list li{min-width:0}
.ff-build .ff-effect{white-space:pre-line}
.ff-build.is-draft{gap:6px;background:rgba(12,22,28,.94);border:1px solid #3e5960;padding:8px}
.ff-build.is-draft .ff-title{font-size:18px}
.ff-build.is-draft .ff-draft-hint{font-size:13px;line-height:1.3}
.ff-build.is-draft .ff-choice{padding:6px 8px;display:flex;flex-direction:row;align-items:center;gap:8px;width:100%;min-height:44px;text-align:left;cursor:pointer}
.ff-build.is-draft .ff-choice-copy{min-width:0;display:flex;flex-direction:column;gap:2px}
.ff-build.is-draft .ff-mark{width:44px;height:44px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;border:1px solid currentColor;font-size:16px;line-height:1}
.ff-build.is-draft .ff-mark small{font-size:9px;line-height:1;max-width:42px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-build.is-draft .ff-meter{width:64px;height:44px;flex:none;display:flex;flex-direction:column;justify-content:center;gap:2px}
.ff-build.is-draft .ff-meter-row{display:flex;align-items:center;gap:3px;height:10px;min-height:0}
.ff-build.is-draft .ff-meter-row>span{flex:none;min-width:14px;font-size:9px;line-height:1;color:#c5d5da}
.ff-build.is-draft .ff-meter-track{flex:1;height:6px;background:#24383e}
.ff-build.is-draft .ff-meter-fill{display:block;height:6px;width:0}
.ff-build.is-draft [data-meter="damage"] .ff-meter-fill{background:#f0d56a}
.ff-build.is-draft [data-meter="speed"] .ff-meter-fill{background:#f0cb72}
.ff-build.is-draft [data-meter="range"] .ff-meter-fill{background:#9fd7e8}
.ff-build.is-draft [data-meter="crit"] .ff-meter-fill{background:#f0cb72}
.ff-build.is-draft [data-meter="critDamage"] .ff-meter-fill{background:#e7a08a}
.ff-build.is-draft [data-meter="pierce"] .ff-meter-fill{background:#d7e4ea}
.ff-build.is-draft [data-meter="poison"] .ff-meter-fill{background:#7dce6a}
.ff-build.is-draft .ff-meter[data-bars="1"] .ff-meter-track,.ff-build.is-draft .ff-meter[data-bars="1"] .ff-meter-fill{height:14px}
.ff-build.is-draft .ff-choice h3{font-size:16px;line-height:1.2}
.ff-build.is-draft .ff-blurb,.ff-build.is-draft .ff-statline{font-size:13px;line-height:1.25}
.ff-build.is-draft .ff-statline{color:#c5d5da}
.ff-build.is-draft .ff-field{align-self:flex-start;font-size:12px;line-height:1.2;padding:1px 6px}
.ff-build .ff-field.is-new{border-color:#e0c17a;color:#e0c17a}
.ff-build .ff-field.is-owned{color:#a5b8be}
.ff-build.is-draft .ff-draft-merge{display:flex;flex-direction:column;gap:6px}
.ff-build.is-draft .ff-draft-merge .btn{width:100%}
.ff-build .ff-slots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:0;padding:0;list-style:none}
.ff-build .ff-slots .btn,.ff-build .ff-note{width:100%;min-height:44px;padding:4px;font-size:12px;line-height:1.15}
.ff-build .ff-note{display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #3e5960;background:#122128;text-align:center;overflow:hidden}
.ff-build .ff-note small,.ff-build .ff-slots .btn small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ff-build .is-selected{border-color:#e0c17a;box-shadow:inset 0 0 0 1px #e0c17a}
.ff-build .is-hero{color:#e0c17a}
.ff-build .ff-stats{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.ff-build .ff-stats li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #2a4148;padding:2px 0}
.ff-build .ff-stats b{font-weight:650;text-align:right}
.ff-build .ff-pips{letter-spacing:1px}
.ff-build .ff-message{padding:8px;border:1px solid #e7a08a;background:#3a2a22}
.ff-build .ff-mechs{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none}
@media (max-width:899px){
  .ff-build.is-draft .ff-blurb,.ff-build.is-draft .ff-statline{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
}
@media (max-width:360px){
  .ff-build{font-size:14px}
  .ff-build .ff-slots{gap:4px}
  .ff-build .ff-slots .btn,.ff-build .ff-note{font-size:11px;padding:2px}
}
@media (prefers-reduced-motion:reduce){
  .ff-build *,.ff-build *::before,.ff-build *::after{transition:none !important;animation:none !important}
}
`;

const EXTRA = {
  en: {
    damage: 'Damage',
    range: 'Range',
    attackSpeed: 'Attack speed',
    crit: 'Critical',
    critDamage: 'Crit damage',
    rank: 'Rank',
    hero: 'Hero',
    towers: 'Tower',
    upgrade: 'Upgrade',
    select: 'Select',
    place: 'Place',
    move: 'Move',
    merge: 'Merge',
    mergePreview: 'Merge preview',
    mergeConfirm: 'Confirm merge',
    mergeCancel: 'Cancel merge',
    heroProtected: 'Hero stays independent',
    invalidMerge: 'These units cannot merge',
    fullBoard: 'All slots are full',
    chooseUpgrade: 'Choose upgrade',
    chooseOneOfThree: 'Choose one of three',
    chooseSlot: 'Choose a slot',
    cancelPlacement: 'Cancel placement',
    replace: 'Replace',
    replaceConfirm: 'Confirm replacement',
    effect: 'Effect',
    emptySlot: 'Empty slot',
    recipes: 'Recipe',
    ingredients: 'Ingredients',
    cost: 'Cost',
    level: 'Level',
    maxLevel: 'Max level',
    pause: 'Pause',
    resume: 'Resume',
    planning: 'Planning',
    nextWave: 'Next wave',
    pausedHidden: 'Paused while the page is hidden',
    helpPlacement: 'Select a defender, then move it or merge two towers. Empty slots can take a new tower. Planning pauses the fight.',
    helpMerge: 'Matching type and rank raise rank, up to 4. Different base towers of equal rank follow a recipe. Cancel keeps both units.',
    helpDraft: 'Choose one card. A tower is placed next. A hero upgrade applies immediately and the hero stays on the board.',
    helpRange: 'Range is measured from this slot center to an enemy center, across the field. Rear slots sit farther back, so their range reaches past the fence.',
    kills: 'Kills',
    xp: 'XP',
    victory: 'Victory',
    defeat: 'Defeat',
    cancel: 'Cancel',
    back: 'Back',
    confirm: 'Confirm',
    locked: 'Unavailable',
    loading: 'Loading',
    frontRow: 'Front row',
    backRow: 'Rear row',
    hybrid: 'Hybrid',
    projectile: 'Projectile',
    splash: 'Splash',
    chain: 'Chain',
    pierce: 'Pierce',
    burn: 'Burn',
    slow: 'Slow',
    poison: 'Poison',
    aura: 'Aura',
    haste: 'Haste',
    stacks: 'Stacks',
    speed: 'Speed',
    swap: 'Swap',
    pauseToPlan: 'Pause to move defenders or merge towers.',
    noMergePartner: 'A merge needs two towers. The hero stays independent.',
    heroNoMerge: 'The hero stays independent. Move the hero during planning. Merges and replacement leave the hero in place.',
    placeHint: 'Choose an empty slot. Occupied towers stay unless this card is a replacement.',
    replaceHeroSafe: 'Choose the tower to replace. The hero stays in place.',
    confirmReplaceBody: 'The tower in this slot will be removed.',
    slotOccupied: 'Occupied',
    statsUnavailable: 'Stats will appear when the catalog is ready.',
    noDraft: 'The draft has no cards yet. Wait for the next choice.',
    planningLocked: 'The fight is running. Pause to move or merge.',
    emptySelection: 'Select a slot to see its stats.',
    sameTypeMerge: 'Same type and rank combine into the next rank.',
    hybridMerge: 'This pair becomes the hybrid below.',
    maxRankNote: 'Rank 4 can form a hybrid with a different rank-4 base tower when a recipe exists.',
    supportNote: 'Support range is a circle from this slot. Aura bonuses reach defenders inside that circle. Attacks use the same geometric range.',
    youGain: 'Result',
    currentStats: 'Stats',
    nextStats: 'After this choice',
    draftWaiting: 'The three choices stay available until you pick one.',
    draftOnField: 'Already on the field',
    draftNewType: 'Not on the field yet',
    mergeReview: 'Review the merge, then confirm or cancel. Both units stay if you cancel.',
    lostOnReplace: 'Removed tower',
    chooseEmpty: 'Empty slots are ready for placement.',
    heroStays: 'The hero stays on the board.',
    cancelPick: 'Back',
    noValidTarget: 'No legal merge is available from this tower.',
    moveHint: 'Choose a destination. An occupied slot swaps places.',
    mergeHint: 'Choose a tower of equal rank. The preview explains the result before you confirm.',
    sourceHint: 'Choose the defender to move.',
    mergeSourceHint: 'Choose the first tower. The hero is not a merge ingredient.',
    attacks: 'Attacks',
    duration: 'Duration',
    reduction: 'slow',
    buildPanelLabel: 'Build, draft, and merge',
    kindTower: 'Tower',
    kindHybrid: 'Hybrid',
    kindUpgrade: 'Hero upgrade',
    slotLabel: 'Slot',
  },
  zh: {
    damage: '伤害',
    range: '射程',
    attackSpeed: '攻速',
    crit: '暴击',
    critDamage: '暴击伤害',
    rank: '阶',
    hero: '英雄',
    towers: '塔',
    upgrade: '升级',
    select: '选择',
    place: '放置',
    move: '移动',
    merge: '合成',
    mergePreview: '合成预览',
    mergeConfirm: '确认合成',
    mergeCancel: '取消合成',
    heroProtected: '英雄保持独立',
    invalidMerge: '这些单位不能合成',
    fullBoard: '栏位已满',
    chooseUpgrade: '选择升级',
    chooseOneOfThree: '三选一',
    chooseSlot: '选择格子',
    cancelPlacement: '取消放置',
    replace: '替换',
    replaceConfirm: '确认替换',
    effect: '效果',
    emptySlot: '空位',
    recipes: '配方',
    ingredients: '材料',
    cost: '花费',
    level: '等级',
    maxLevel: '已满级',
    pause: '暂停',
    resume: '继续',
    planning: '规划中',
    nextWave: '下一波',
    pausedHidden: '页面隐藏，战斗已暂停',
    helpPlacement: '先点选防守单位，再移动或合成。空位可以放置新塔。规划时战斗会暂停。',
    helpMerge: '同类型且同阶会升阶，最高 4 阶。不同基础塔在同阶时按配方合成。取消会保留双方。',
    helpDraft: '选择一张卡。塔需要接着放置。英雄升级会立即生效，英雄留在场上。',
    helpRange: '射程从本格中心量到敌人中心，可以跨列。后排更靠后，因此射程要能覆盖到栅栏前方。',
    kills: '击杀',
    xp: '经验',
    victory: '胜利',
    defeat: '失败',
    cancel: '取消',
    back: '返回',
    confirm: '确认',
    locked: '不可用',
    loading: '读取中',
    frontRow: '前排',
    backRow: '后排',
    hybrid: '混合',
    projectile: '弹道',
    splash: '溅射',
    chain: '连锁',
    pierce: '穿透',
    burn: '燃烧',
    slow: '减速',
    poison: '毒素',
    aura: '光环',
    haste: '急速',
    stacks: '层数',
    speed: '速度',
    swap: '交换',
    pauseToPlan: '暂停后才能移动防守单位或合成塔。',
    noMergePartner: '合成需要两座塔。英雄保持独立。',
    heroNoMerge: '英雄保持独立。规划时可以移动英雄。合成和替换都不会动英雄。',
    placeHint: '选择一个空位。已有的塔会留下，除非这张卡是替换。',
    replaceHeroSafe: '选择要替换的塔。英雄会留在原位。',
    confirmReplaceBody: '这个格子上的塔会被移除。',
    slotOccupied: '已占用',
    statsUnavailable: '图鉴就绪后会显示属性。',
    noDraft: '这次选拔还没有卡牌。请等待下一次选择。',
    planningLocked: '战斗进行中。暂停后才能移动或合成。',
    emptySelection: '选择一个格子以查看属性。',
    sameTypeMerge: '相同类型且阶数相同，会升到下一阶。',
    hybridMerge: '这一对会变成下面的混合单位。',
    maxRankNote: '4 阶可以与另一座 4 阶的不同基础塔按配方混合。',
    supportNote: '支援范围是以本格为圆心的圆。光环加成覆盖圆内的防守单位。攻击也按这个几何距离判定。',
    youGain: '结果',
    currentStats: '属性',
    nextStats: '选择之后',
    draftWaiting: '在你做出选择之前，三张卡都会保留。',
    draftOnField: '场上已有',
    draftNewType: '场上还没有',
    mergeReview: '先查看合成结果，再确认或取消。取消会保留双方。',
    lostOnReplace: '被移除的塔',
    chooseEmpty: '空位可以直接放置。',
    heroStays: '英雄会留在场上。',
    cancelPick: '返回',
    noValidTarget: '这座塔目前没有合法的合成对象。',
    moveHint: '选择目的地。占用的格子会交换位置。',
    mergeHint: '选择一座同阶塔。确认前会显示合成结果。',
    sourceHint: '选择要移动的防守单位。',
    mergeSourceHint: '选择第一座塔。英雄不能作为合成材料。',
    attacks: '攻击',
    duration: '持续',
    reduction: '减速',
    buildPanelLabel: '构筑、选拔与合成',
    kindTower: '塔',
    kindHybrid: '混合',
    kindUpgrade: '英雄升级',
    slotLabel: '格子',
  },
};

const REASONS = {
  en: {
    hero: 'The hero stays independent and is not a merge ingredient.',
    hero_protected: 'The hero stays independent and is not a merge ingredient.',
    heroProtected: 'The hero stays independent and is not a merge ingredient.',
    same: 'Choose two different slots.',
    same_slot: 'Choose two different slots.',
    empty: 'That slot is empty.',
    not_planning: 'Pause the battle before moving or merging.',
    planning: 'Pause the battle before moving or merging.',
    phase: 'Move and merge while planning, or while a draft is open.',
    rank: 'Both units need the same rank.',
    rank_mismatch: 'Both units need the same rank.',
    max_rank: 'Rank 4 does not rank up. A different rank-4 base tower can still form a hybrid.',
    capped: 'That upgrade is already at its cap.',
    no_recipe: 'This pair has no hybrid recipe.',
    recipe: 'This pair has no hybrid recipe.',
    hybrid: 'A hybrid merges only with the same hybrid at the same rank.',
    hybrid_mix: 'A hybrid merges only with the same hybrid at the same rank.',
    different: 'These types have no combination.',
    invalid: 'These units cannot merge.',
    invalidMerge: 'These units cannot merge.',
    full: 'Every slot is full. Replace a tower, or merge two towers.',
    fullBoard: 'Every slot is full. Replace a tower, or merge two towers.',
    occupied: 'That slot already holds a defender.',
  },
  zh: {
    hero: '英雄保持独立，不能作为合成材料。',
    hero_protected: '英雄保持独立，不能作为合成材料。',
    heroProtected: '英雄保持独立，不能作为合成材料。',
    same: '请选择两个不同的格子。',
    same_slot: '请选择两个不同的格子。',
    empty: '这个格子是空的。',
    not_planning: '请先暂停，再移动或合成。',
    planning: '请先暂停，再移动或合成。',
    phase: '规划中或选拔打开时可以移动和合成。',
    rank: '双方阶数需要相同。',
    rank_mismatch: '双方阶数需要相同。',
    max_rank: '4 阶不能再升阶。另一座 4 阶的不同基础塔仍可混合。',
    capped: '这项升级已经到达上限。',
    no_recipe: '这一对没有混合配方。',
    recipe: '这一对没有混合配方。',
    hybrid: '混合单位只能与相同的混合单位在同阶合成。',
    hybrid_mix: '混合单位只能与相同的混合单位在同阶合成。',
    different: '这两种类型不能组合。',
    invalid: '这些单位不能合成。',
    invalidMerge: '这些单位不能合成。',
    full: '栏位已满。可以替换一座塔，或先合成两座塔。',
    fullBoard: '栏位已满。可以替换一座塔，或先合成两座塔。',
    occupied: '这个格子已经有防守单位。',
  },
};

const MECHANICS = {
  en: {
    splash: 'Hits enemies around the impact.',
    chain: 'Jumps to another enemy in chain range.',
    pierce: 'Continues through additional enemies.',
    burn: 'Applies burning damage over time.',
    slow: 'Lowers enemy move speed for a short time.',
    poison: 'Stacks poison damage over time.',
    aura: 'Buffs defenders inside the aura circle.',
    support: 'Buffs nearby defenders and still uses geometric range.',
    stun: 'Can stop an enemy briefly.',
    brittle: 'Marked enemies take extra damage.',
    frost: 'Chills and slows enemies in range.',
    lightning: 'Chains a strike between enemies.',
    execute: 'Deals heavier damage to weakened enemies.',
  },
  zh: {
    splash: '命中点周围的敌人也会受伤。',
    chain: '会跳到连锁范围内的另一个敌人。',
    pierce: '可以继续打穿后面的敌人。',
    burn: '附加持续燃烧伤害。',
    slow: '短时间内降低敌人移速。',
    poison: '叠加持续毒素伤害。',
    aura: '强化光环圆内的防守单位。',
    support: '强化附近防守单位，攻击仍按几何距离判定。',
    stun: '可以短暂停住敌人。',
    brittle: '被标记的敌人会受到额外伤害。',
    frost: '减速范围内的敌人。',
    lightning: '在敌人之间连锁电击。',
    execute: '对残血敌人造成更重的伤害。',
  },
};

const ephemeral = {
  runId: '',
  phase: '',
  mode: 'idle',
  from: -1,
  to: -1,
  replaceIndex: -1,
  message: '',
  ignorePreview: null,
};

let currentDoc = typeof document !== 'undefined' ? document : null;

function ensureStyles(doc) {
  if (!doc?.getElementById || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

function el(tag, attrs = {}, ...children) {
  const doc = currentDoc;
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) appendNode(node, child);
  return node;
}

function appendNode(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const item of child) appendNode(node, item);
    return;
  }
  if (typeof child === 'string' || typeof child === 'number') {
    node.appendChild(node.ownerDocument.createTextNode(String(child)));
    return;
  }
  node.appendChild(child);
}

function button(attrs = {}, ...children) {
  const classes = ['btn'];
  if (attrs.primary) classes.push('btn-primary');
  if (attrs.class) classes.push(attrs.class);
  const copy = { ...attrs, type: 'button', class: classes.join(' '), 'data-ff-owner': 'build' };
  delete copy.primary;
  return el('button', copy, ...children);
}

function clearContainer(container) {
  for (const node of [...container.childNodes]) {
    if (node.nodeType === 1) {
      const element = node;
      if (element.tagName === 'CANVAS' || element.querySelector?.('canvas')) continue;
    }
    node.remove();
  }
}

function roleOf(container) {
  const raw = String(container?.getAttribute?.('data-ui') || '').toLowerCase();
  if (!raw) return '';
  if (raw.includes('menu')) return 'menu';
  if (raw.includes('overlay')) return 'overlay';
  if (raw.includes('panel')) return 'panel';
  return '';
}

function pageHas(container, role) {
  try {
    const doc = container?.ownerDocument;
    if (!doc?.querySelectorAll) return false;
    for (const candidate of doc.querySelectorAll('[data-ui]')) {
      if (candidate !== container && roleOf(candidate) === role) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function bind(container) {
  if (container.__ffBuildBound) return;
  container.addEventListener('click', (event) => {
    const target = event.target;
    const control = target?.closest?.('button');
    if (!control || !container.contains(control) || control.getAttribute('data-ff-owner') !== 'build') return;
    const action = control.getAttribute('data-action') || '';
    const intent = control.getAttribute('data-intent') || '';
    if (!action && !intent) return;
    event.preventDefault();
    event.stopPropagation();
    const api = container.__ffBuildCtx?.api;
    if (!api) return;
    handlePress(container, api, action, intent, control);
  }, true);
  container.__ffBuildBound = true;
}

function pickIndex(value) {
  if (value == null || value === '') return -1;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 9 ? number : -1;
}

function validSlot(index) {
  return Number.isInteger(index) && index >= 0 && index <= 9;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function readUI(api) {
  const empty = { screen: '', selectedSlot: -1, mergeFrom: -1, mergePreview: null, message: '' };
  try {
    const ui = api?.getUI?.();
    if (!ui || typeof ui !== 'object') return empty;
    return {
      screen: typeof ui.screen === 'string' ? ui.screen : '',
      selectedSlot: pickIndex(ui.selectedSlot),
      mergeFrom: pickIndex(ui.mergeFrom),
      mergePreview: ui.mergePreview ?? null,
      message: ui.message ?? '',
    };
  } catch {
    return empty;
  }
}

function languageOf(state, api) {
  try {
    const profile = api?.getProfile?.() || state?.profileSnapshot;
    return profile?.settings?.language === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

function reducedMotion(state, api) {
  try {
    const profile = api?.getProfile?.() || state?.profileSnapshot;
    return !!profile?.settings?.reducedMotion;
  } catch {
    return false;
  }
}

function makeT(api, lang) {
  const table = EXTRA[lang] || EXTRA.en;
  return (key, vars) => {
    let value = '';
    try {
      if (typeof api?.t === 'function') value = api.t(key, vars);
    } catch {
      value = '';
    }
    if (typeof value !== 'string' || value === '' || value === key) {
      let fallback = table[key] ?? EXTRA.en[key] ?? '';
      if (!fallback) return typeof value === 'string' && value !== '' ? value : String(key);
      if (vars && typeof vars === 'object') {
        fallback = fallback.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`));
      }
      return fallback;
    }
    return value;
  };
}

function localizeSafe(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'object') {
    if (typeof value.en === 'string' || typeof value.zh === 'string') {
      try {
        const text = localize(value, lang);
        if (text) return String(text);
      } catch {
        /* use the catalog fields directly */
      }
      return String(value[lang] || value.en || value.zh || '');
    }
  }
  return '';
}

function fmtNum(value, lang) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const rounded = Math.round(number * 100) / 100;
  try {
    if (typeof formatNumber === 'function') {
      const formatted = formatNumber(rounded, lang === 'zh' ? 'zh' : 'en');
      if (formatted != null && formatted !== '') return String(formatted);
    }
  } catch {
    /* Intl below */
  }
  try {
    return new Intl.NumberFormat(lang === 'zh' ? 'zh-Hans' : 'en').format(rounded);
  } catch {
    return String(rounded);
  }
}

function perSecond(lang) {
  return lang === 'zh' ? '/秒' : '/s';
}

function reasonText(reason, lang, tr) {
  if (reason == null || reason === '') return tr('invalidMerge');
  if (typeof reason === 'object') return localizeSafe(reason, lang) || tr('invalidMerge');
  const code = String(reason);
  const table = REASONS[lang] || REASONS.en;
  const normalized = code.replace(/[\s-]+/g, '_');
  if (table[code]) return table[code];
  if (table[normalized]) return table[normalized];
  if (code.includes(' ')) return code;
  const translated = tr(code);
  if (translated && translated !== code) return translated;
  return tr('invalidMerge');
}

function slotAt(state, index) {
  if (!state?.slots || !validSlot(index)) return null;
  return state.slots.find((slot) => slot && slot.index === index) || state.slots[index] || null;
}

function slotUnit(state, index) {
  const unit = slotAt(state, index)?.unit;
  return unit && typeof unit === 'object' ? unit : null;
}

function isHero(unit) {
  return !!unit && (unit.kind === 'hero' || unit.type === 'hero');
}

function recipeList() {
  return Array.isArray(RECIPES) ? RECIPES : [];
}

function recipeById(id) {
  if (!id) return null;
  return recipeList().find((recipe) => recipe && recipe.id === id) || null;
}

function towerRecord(type) {
  try {
    const row = TOWERS?.[type];
    return row && typeof row === 'object' ? row : null;
  } catch {
    return null;
  }
}

function upgradeRecord(id) {
  try {
    const row = id ? HERO_UPGRADES?.[id] : null;
    return row && typeof row === 'object' ? row : null;
  } catch {
    return null;
  }
}

function towerName(type, lang, tr) {
  const record = towerRecord(type);
  const name = localizeSafe(record?.name, lang);
  return name || type || tr('towers');
}

function unitLabel(unit, lang, tr) {
  if (!unit) return tr('emptySlot');
  if (isHero(unit)) return tr('hero');
  if (unit.kind === 'hybrid') {
    const recipe = recipeById(unit.type);
    return localizeSafe(recipe?.name, lang) || unit.type || tr('hybrid');
  }
  return towerName(unit.type, lang, tr);
}

function unitDescription(unit, lang) {
  if (!unit || isHero(unit)) return '';
  if (unit.kind === 'hybrid') return localizeSafe(recipeById(unit.type)?.description, lang);
  return localizeSafe(towerRecord(unit.type)?.description, lang);
}

function findHero(state) {
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (isHero(unit)) return unit;
  }
  return null;
}

function nonHeroSlots(state) {
  const slots = [];
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (unit && !isHero(unit)) slots.push(index);
  }
  return slots;
}

function emptySlots(state) {
  const slots = [];
  for (let index = 0; index < 10; index += 1) {
    if (!slotUnit(state, index)) slots.push(index);
  }
  return slots;
}

function copyUnit(unit) {
  if (!unit) return null;
  try {
    return clone(unit);
  } catch {
    return { ...unit, upgrades: unit.upgrades && typeof unit.upgrades === 'object' ? { ...unit.upgrades } : {} };
  }
}

function safeStats(unit, state) {
  if (!unit) return null;
  try {
    const stats = getUnitStats(copyUnit(unit), state);
    return stats && typeof stats === 'object' ? stats : null;
  } catch {
    return null;
  }
}

function safePreview(state, from, to) {
  try {
    const preview = previewMerge(state, from, to);
    return preview && typeof preview === 'object' ? preview : { ok: false, reason: 'invalidMerge' };
  } catch {
    return { ok: false, reason: 'invalidMerge' };
  }
}

function planningAvailable(state) {
  if (!state || state.phase === 'placing' || state.phase === 'victory' || state.phase === 'defeat') return false;
  if (state.hiddenPaused && !state.paused && state.phase !== 'draft') return false;
  return canPlan(state);
}

function previewPayload(preview) {
  if (!preview || typeof preview !== 'object') return false;
  return preview.ok != null || preview.result != null || preview.reason != null
    || preview.description != null || preview.from != null || preview.to != null || preview.unit != null;
}

function endpoints(ui) {
  let from = -1;
  let to = -1;
  const preview = ui?.mergePreview;
  if (preview && typeof preview === 'object') {
    from = pickIndex(preview.from ?? preview.fromIndex);
    to = pickIndex(preview.to ?? preview.toIndex);
  }
  if (from < 0) from = pickIndex(ui?.mergeFrom);
  if (ephemeral.mode === 'merge-confirm' || ephemeral.mode === 'merge') {
    if (validSlot(ephemeral.from)) from = ephemeral.from;
    if (validSlot(ephemeral.to)) to = ephemeral.to;
  }
  if (to < 0 && validSlot(from) && validSlot(ui?.selectedSlot) && ui.selectedSlot !== from && previewPayload(preview)) {
    to = ui.selectedSlot;
  }
  return { from, to };
}

function mergeConfirmActive(ui) {
  if (ephemeral.mode === 'merge' || ephemeral.mode === 'move') return false;
  const ends = endpoints(ui);
  const pair = validSlot(ends.from) && validSlot(ends.to) && ends.from !== ends.to;
  if (!pair) return false;
  if (ephemeral.mode === 'merge-confirm') return true;
  if (!previewPayload(ui?.mergePreview)) return false;
  const ignored = ephemeral.ignorePreview;
  if (ignored && ignored.from === ends.from && ignored.to === ends.to) return false;
  return true;
}

function syncEphemeral(state, ui) {
  if (!state) return;
  if (ephemeral.runId !== state.runId) {
    ephemeral.runId = state.runId || '';
    ephemeral.phase = state.phase || '';
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    ephemeral.replaceIndex = -1;
    ephemeral.message = '';
    ephemeral.ignorePreview = null;
  }
  if (ephemeral.phase !== state.phase) {
    if (state.phase !== 'placing') ephemeral.replaceIndex = -1;
    if (state.phase === 'victory' || state.phase === 'defeat') {
      ephemeral.mode = 'idle';
      ephemeral.from = -1;
      ephemeral.to = -1;
      ephemeral.message = '';
    }
    ephemeral.phase = state.phase || '';
  }
  if (ui.screen && ui.screen !== 'battle') {
    ephemeral.mode = 'idle';
    ephemeral.replaceIndex = -1;
  }
  if (ephemeral.mode === 'merge-confirm') {
    if (!slotUnit(state, ephemeral.from) || !slotUnit(state, ephemeral.to)) {
      ephemeral.mode = 'idle';
      ephemeral.from = -1;
      ephemeral.to = -1;
    }
  }
  if ((ephemeral.mode === 'move' || ephemeral.mode === 'merge') && ephemeral.from >= 0 && !slotUnit(state, ephemeral.from)) {
    ephemeral.from = -1;
  }
  if (ephemeral.mode === 'merge' && isHero(slotUnit(state, ephemeral.from))) ephemeral.from = -1;
}

function progressText(state, tr, lang) {
  const xp = finite(state?.xp) ? Number(state.xp) : 0;
  const next = finite(state?.nextDraftXp) ? Number(state.nextDraftXp) : 0;
  const level = finite(state?.draftLevel) ? Number(state.draftLevel) : 0;
  return `${tr('level')} ${fmtNum(level, lang)} · ${tr('xp')} ${fmtNum(xp, lang)} / ${fmtNum(next, lang)}`;
}

function slotCaption(slot, tr) {
  const index = Number.isInteger(slot?.index) ? slot.index : 0;
  const row = slot?.row === 0 || slot?.row === 1 ? slot.row : (index >= 5 ? 1 : 0);
  return `${index + 1} · ${row ? tr('backRow') : tr('frontRow')}`;
}

function rankPips(rank) {
  const filled = Math.max(0, Math.min(4, Number(rank) || 0));
  let text = '';
  for (let i = 0; i < 4; i += 1) text += i < filled ? '●' : '○';
  return text;
}

function percentNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) <= 1 ? number * 100 : number;
}

function burnValue(burn, lang) {
  const dps = Number(burn?.dps ?? burn?.damage);
  const duration = Number(burn?.duration);
  return `${fmtNum(dps, lang)} / ${fmtNum(duration, lang)}s`;
}

function slowValue(slow, lang, tr) {
  const factor = Number(slow?.factor ?? slow?.power);
  const duration = Number(slow?.duration);
  if (Number.isFinite(factor) && factor > 0 && factor <= 1) {
    const reduced = (1 - factor) * 100;
    return `${fmtNum(reduced, lang)}% · ×${fmtNum(factor, lang)} · ${fmtNum(duration, lang)}s`;
  }
  return `${fmtNum(factor, lang)} · ${fmtNum(duration, lang)}s`;
}

function poisonValue(poison, lang, tr) {
  const dps = Number(poison?.dps ?? poison?.damage);
  const duration = Number(poison?.duration);
  const stacks = Number(poison?.maxStacks ?? poison?.stacks ?? 1);
  return `${fmtNum(dps, lang)} · ${tr('stacks')} ${fmtNum(stacks, lang)} · ${fmtNum(duration, lang)}s`;
}

function auraValue(aura, lang, tr) {
  const parts = [];
  if (finite(aura?.range)) parts.push(`${tr('range')} ${fmtNum(aura.range, lang)}`);
  const damage = percentNumber(aura?.damage);
  if (damage) parts.push(`${tr('damage')} +${fmtNum(damage, lang)}%`);
  const haste = percentNumber(aura?.haste);
  if (haste) parts.push(`${tr('haste')} +${fmtNum(haste, lang)}%`);
  return parts.join(' · ');
}

function mechanicText(item, lang) {
  if (item && typeof item === 'object') {
    return localizeSafe(item.description || item.name || item, lang);
  }
  const id = String(item ?? '').trim();
  if (!id) return '';
  const table = MECHANICS[lang] || MECHANICS.en;
  return table[id] || table[id.replace(/[\s-]+/g, '_')] || id.replace(/[_-]+/g, ' ');
}

function describeStats(stats, lang, tr) {
  const rows = [];
  const specials = [];
  const push = (id, label, value) => {
    if (value == null || value === '' || value === '—') return;
    rows.push({ id, label, value: String(value) });
  };
  if (!stats || typeof stats !== 'object') return { rows, specials };
  if (finite(stats.damage)) push('stat-damage', tr('damage'), fmtNum(stats.damage, lang));
  if (finite(stats.interval) && Number(stats.interval) > 0) {
    const rate = `${fmtNum(1 / Number(stats.interval), lang)}${perSecond(lang)}`;
    const gap = `${fmtNum(stats.interval, lang)}s`;
    push('stat-attackSpeed', tr('attackSpeed'), `${rate} · ${gap}`);
  }
  if (finite(stats.range)) push('stat-range', tr('range'), fmtNum(stats.range, lang));
  if (finite(stats.critChance) && Number(stats.critChance) > 0) {
    const chance = percentNumber(stats.critChance);
    const multiplier = finite(stats.critMultiplier) ? ` ×${fmtNum(stats.critMultiplier, lang)}` : '';
    push('stat-crit', tr('crit'), `${fmtNum(chance, lang)}%${multiplier}`);
  }
  if (finite(stats.projectileSpeed) && Number(stats.projectileSpeed) > 0) {
    push('stat-projectile', tr('projectile'), fmtNum(stats.projectileSpeed, lang));
  }
  if (finite(stats.splash) && Number(stats.splash) > 0) {
    push('stat-splash', tr('splash'), fmtNum(stats.splash, lang));
    specials.push(`${tr('splash')} ${fmtNum(stats.splash, lang)}`);
  }
  if (finite(stats.chain) && Number(stats.chain) > 0) {
    const range = finite(stats.chainRange) ? ` · ${tr('range')} ${fmtNum(stats.chainRange, lang)}` : '';
    push('stat-chain', tr('chain'), `${fmtNum(stats.chain, lang)}${range}`);
    specials.push(`${tr('chain')} ${fmtNum(stats.chain, lang)}${range}`);
  }
  if (finite(stats.pierce) && Number(stats.pierce) > 0) {
    push('stat-pierce', tr('pierce'), fmtNum(stats.pierce, lang));
    specials.push(`${tr('pierce')} ${fmtNum(stats.pierce, lang)}`);
  }
  if (stats.burn && typeof stats.burn === 'object') {
    const value = burnValue(stats.burn, lang);
    push('stat-burn', tr('burn'), value);
    specials.push(`${tr('burn')} ${value}`);
  }
  if (stats.slow && typeof stats.slow === 'object') {
    const value = slowValue(stats.slow, lang, tr);
    push('stat-slow', tr('slow'), value);
    specials.push(`${tr('slow')} ${value}`);
  }
  if (stats.poison && typeof stats.poison === 'object') {
    const value = poisonValue(stats.poison, lang, tr);
    push('stat-poison', tr('poison'), value);
    specials.push(`${tr('poison')} ${value}`);
  }
  if (stats.aura && typeof stats.aura === 'object') {
    const value = auraValue(stats.aura, lang, tr);
    if (value) {
      push('stat-aura', tr('aura'), value);
      specials.push(`${tr('aura')} ${value}`);
    }
  }
  return { rows, specials };
}

function effectLinesFromStats(stats, lang, tr) {
  if (!stats) return [tr('statsUnavailable')];
  const { rows, specials } = describeStats(stats, lang, tr);
  const lines = [];
  for (const id of ['stat-damage', 'stat-attackSpeed', 'stat-range', 'stat-crit']) {
    const row = rows.find((item) => item.id === id);
    if (row) lines.push(`${row.label} ${row.value}`);
  }
  for (const special of specials) lines.push(special);
  const mechanics = Array.isArray(stats.mechanics) ? stats.mechanics : [];
  const seen = new Set(specials.map((line) => line.toLowerCase()));
  for (const item of mechanics) {
    const text = mechanicText(item, lang);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    lines.push(text);
    if (lines.length >= 8) break;
  }
  return lines.length ? lines : [tr('statsUnavailable')];
}

function statList(stats, lang, tr, testid = 'unit-stats') {
  const { rows } = describeStats(stats, lang, tr);
  const list = el('ul', { class: 'ff-stats', 'data-testid': testid });
  const prefix = testid === 'unit-stats' ? '' : `${testid}-`;
  if (!rows.length) {
    list.append(el('li', { text: tr('statsUnavailable') }));
    return list;
  }
  for (const row of rows) {
    const item = el('li', { 'data-testid': `${prefix}${row.id}` });
    item.append(el('span', { text: row.label }), el('b', { text: row.value }));
    list.append(item);
  }
  return list;
}

function supportNote(unit, stats, tr) {
  const type = unit?.type;
  const mechanics = Array.isArray(stats?.mechanics) ? stats.mechanics.map((item) => String(item)) : [];
  if (type === 'support' || stats?.aura || mechanics.some((item) => /support|aura/i.test(item))) {
    return tr('supportNote');
  }
  return '';
}

function upgradeLevel(hero, id) {
  if (!hero || !id) return 0;
  if (Array.isArray(hero.upgrades)) return hero.upgrades.filter((entry) => entry === id).length;
  const value = hero.upgrades?.[id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const level = Number(value.level ?? value.rank ?? 0);
    return Number.isFinite(level) ? level : 0;
  }
  return 0;
}

function withUpgrade(hero, id) {
  const next = copyUnit(hero) || { id: 'hero', kind: 'hero', type: 'hero', rank: 1, upgrades: {}, cooldown: 0, kills: 0 };
  if (Array.isArray(hero?.upgrades)) {
    next.upgrades = [...hero.upgrades, id];
    return next;
  }
  const upgrades = next.upgrades && typeof next.upgrades === 'object' && !Array.isArray(next.upgrades)
    ? { ...next.upgrades }
    : {};
  const current = upgrades[id];
  if (current && typeof current === 'object') {
    const level = Number(current.level ?? current.rank ?? 0) + 1;
    upgrades[id] = { ...current, level, rank: Number(current.rank ?? level) };
  } else {
    upgrades[id] = (typeof current === 'number' && Number.isFinite(current) ? current : 0) + 1;
  }
  next.upgrades = upgrades;
  return next;
}

function effectObjectLines(record, lang, tr) {
  const effect = record?.effect || record?.stats || record?.bonus || record?.modifiers;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return [];
  const keyMap = {
    damage: 'damage',
    range: 'range',
    interval: 'attackSpeed',
    haste: 'haste',
    critChance: 'crit',
    critMultiplier: 'crit',
    projectileSpeed: 'projectile',
    splash: 'splash',
    chain: 'chain',
    pierce: 'pierce',
  };
  const lines = [];
  for (const [key, raw] of Object.entries(effect)) {
    if (!finite(raw) || Number(raw) === 0) continue;
    if (key === 'critMultiplier') {
      const number = Number(raw);
      lines.push(`${tr('critDamage')} ${number > 0 ? '+' : ''}${fmtNum(number, lang)}×`);
      continue;
    }
    const label = tr(keyMap[key] || key);
    const number = Number(raw);
    const fractional = Math.abs(number) <= 1 && key !== 'range' && key !== 'interval' && key !== 'projectileSpeed' && key !== 'chain' && key !== 'pierce';
    const shown = fractional
      ? `${number > 0 ? '+' : ''}${fmtNum(number * 100, lang)}%`
      : `${number > 0 ? '+' : ''}${fmtNum(number, lang)}`;
    lines.push(`${label} ${shown}`);
  }
  return lines;
}

function deltaLines(before, after, lang, tr) {
  if (!before || !after) return [];
  const lines = [];
  const fields = [
    ['damage', 'damage', false],
    ['range', 'range', false],
    ['critChance', 'crit', true],
  ];
  for (const [field, key, asPercent] of fields) {
    const left = Number(before[field]) || 0;
    const right = Number(after[field]) || 0;
    if (Math.abs(right - left) < 1e-6) continue;
    if (asPercent) {
      lines.push(`${tr(key)} ${fmtNum(percentNumber(left) || 0, lang)}% → ${fmtNum(percentNumber(right) || 0, lang)}%`);
    } else {
      lines.push(`${tr(key)} ${fmtNum(left, lang)} → ${fmtNum(right, lang)}`);
    }
  }
  const leftInterval = Number(before.interval) || 0;
  const rightInterval = Number(after.interval) || 0;
  if (leftInterval > 0 && rightInterval > 0 && Math.abs(leftInterval - rightInterval) > 1e-6) {
    lines.push(`${tr('attackSpeed')} ${fmtNum(1 / leftInterval, lang)}${perSecond(lang)} → ${fmtNum(1 / rightInterval, lang)}${perSecond(lang)}`);
  }
  const leftCrit = Number(before.critMultiplier) || 0;
  const rightCrit = Number(after.critMultiplier) || 0;
  if (leftCrit > 0 && rightCrit > 0 && Math.abs(leftCrit - rightCrit) > 1e-6) {
    lines.push(`${tr('critDamage')} ${fmtNum(leftCrit, lang)}× → ${fmtNum(rightCrit, lang)}×`);
  }
  return lines;
}

function optionCost(option) {
  const cost = Number(option?.cost ?? option?.price);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function draftOptionName(option, lang, tr) {
  const attached = localizeSafe(option?.name, lang);
  if (attached) return attached;
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    return localizeSafe(upgradeRecord(id)?.name, lang) || id || tr('chooseUpgrade');
  }
  if (option?.type) return towerName(option.type, lang, tr);
  return tr('towers');
}

function resolveUpgradeId(option) {
  if (option?.upgradeId) return option.upgradeId;
  if (option?.id && upgradeRecord(option.id)) return option.id;
  return '';
}

function draftEffectLines(state, option, lang, tr) {
  const lines = [];
  const attached = option?.summary || option?.effectText || option?.immediate;
  const attachedText = localizeSafe(attached, lang);
  if (attachedText) lines.push(attachedText);
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    const record = upgradeRecord(id);
    const hero = findHero(state);
    const level = upgradeLevel(hero, id);
    const cap = Number(record?.cap);
    if (Number.isFinite(cap)) lines.push(`${tr('level')} ${fmtNum(level, lang)} / ${fmtNum(cap, lang)}`);
    else if (level) lines.push(`${tr('level')} ${fmtNum(level, lang)}`);
    const cost = optionCost(option);
    if (cost > 0) lines.push(`${tr('cost')} ${fmtNum(cost, lang)}`);
    const before = hero ? safeStats(hero, state) : null;
    const after = hero && id ? safeStats(withUpgrade(hero, id), state) : null;
    const deltas = deltaLines(before, after, lang, tr);
    if (deltas.length) lines.push(...deltas);
    else lines.push(...effectObjectLines(record, lang, tr));
    lines.push(tr('heroStays'));
  } else {
    const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
    const preview = option?.unit && typeof option.unit === 'object'
      ? option.unit
      : { id: `preview-${option?.type || 'tower'}`, kind: 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
    lines.push(...effectLinesFromStats(safeStats(preview, state), lang, tr));
    lines.push(`${tr('rank')} ${fmtNum(preview.rank || rank, lang)}`);
    if (option?.replace) lines.push(`${tr('replace')} · ${tr('heroStays')}`);
    const cost = optionCost(option);
    if (cost > 0) lines.push(`${tr('cost')} ${fmtNum(cost, lang)}`);
  }
  return lines.length ? lines : [tr('statsUnavailable')];
}

function messageLines(ui, lang, tr) {
  const lines = [];
  if (ephemeral.message) lines.push(reasonText(ephemeral.message, lang, tr));
  if (ui?.message != null && ui.message !== '') {
    const text = typeof ui.message === 'object' ? (localizeSafe(ui.message, lang) || '') : reasonText(ui.message, lang, tr);
    if (text && !lines.includes(text)) lines.push(text);
  }
  return lines;
}

function normalizeCopy(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function catalogEssay(type, kind, lang) {
  if (!type) return '';
  const recipe = recipeById(type);
  const tower = towerRecord(type);
  const source = (kind === 'hybrid' || recipe) && recipe ? recipe.description : tower?.description;
  return normalizeCopy(localizeSafe(source, lang));
}

function lineIsCatalogEssay(line, ui, lang) {
  const text = normalizeCopy(line);
  if (!text) return false;
  const described = normalizeCopy(localizeSafe(ui?.mergePreview?.description, lang));
  if (described && text === described) return true;
  if (described && text.length > 140 && (text.includes(described) || described.includes(text))) return true;
  const result = ui?.mergePreview?.result || ui?.mergePreview?.unit;
  const essay = result?.type ? catalogEssay(result.type, result.kind, lang) : '';
  return !!(essay && essay.length > 40 && text.includes(essay));
}

function renderMessages(ui, lang, tr, options = {}) {
  let lines = messageLines(ui, lang, tr);
  if (options.omitEssays) lines = lines.filter((line) => !lineIsCatalogEssay(line, ui, lang));
  if (!lines.length) return null;
  return el('div', { class: 'ff-message', role: 'status', 'aria-live': 'polite', 'data-testid': 'panel-message', text: lines.join(' ') });
}

function renderSlotFace(slot, lang, tr) {
  const unit = slot?.unit;
  const number = el('small', { text: String((slot?.index ?? 0) + 1) });
  const name = el('small', { text: unit ? unitLabel(unit, lang, tr) : tr('emptySlot') });
  const mark = el('small', {
    class: 'ff-pips',
    text: unit && !isHero(unit) ? rankPips(unit.rank) : (isHero(unit) ? '★' : ''),
  });
  return [number, name, mark];
}

function renderSelectGrid(state, ui, lang, tr) {
  const list = el('div', { class: 'grid ff-slots', 'data-testid': 'slot-grid', role: 'group' });
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    const unit = slot.unit;
    const classes = ['slot-btn'];
    if (ui.selectedSlot === index) classes.push('is-selected');
    if (isHero(unit)) classes.push('is-hero');
    const label = `${tr('select')} ${slotCaption(slot, tr)} ${unit ? unitLabel(unit, lang, tr) : tr('emptySlot')}`;
    list.append(button({
      class: classes.join(' '),
      'data-action': 'selectSlot',
      'data-index': String(index),
      'data-testid': `select-slot-${index}`,
      'data-kind': unit ? (isHero(unit) ? 'hero' : (unit.kind || 'tower')) : 'empty',
      'aria-pressed': ui.selectedSlot === index ? 'true' : 'false',
      'aria-label': label,
    }, ...renderSlotFace(slot, lang, tr)));
  }
  return list;
}

function renderMoveGrid(state, lang, tr) {
  const wrap = el('div', { 'data-testid': 'move-grid' });
  const from = ephemeral.from;
  if (!slotUnit(state, from)) {
    wrap.append(el('p', { class: 'muted', text: tr('sourceHint') }));
    const list = el('div', { class: 'grid ff-slots' });
    for (let index = 0; index < 10; index += 1) {
      const unit = slotUnit(state, index);
      const slot = slotAt(state, index) || { index, unit: null };
      if (!unit) {
        list.append(el('div', { class: 'ff-note', 'data-testid': `move-empty-${index}` }, ...renderSlotFace(slot, lang, tr)));
        continue;
      }
      list.append(button({
        class: isHero(unit) ? 'slot-btn is-hero' : 'slot-btn',
        'data-intent': 'set-from',
        'data-index': String(index),
        'data-testid': `move-source-${index}`,
        'aria-label': `${tr('move')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    }
    wrap.append(list);
    return wrap;
  }
  const source = slotUnit(state, from);
  wrap.append(el('p', { text: `${tr('move')} · ${unitLabel(source, lang, tr)} · ${slotCaption(slotAt(state, from), tr)}` }));
  wrap.append(el('p', { class: 'muted', text: tr('moveHint') }));
  const list = el('div', { class: 'grid ff-slots' });
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    if (index === from) {
      list.append(el('div', { class: 'ff-note is-selected', 'data-testid': `move-source-current` }, ...renderSlotFace(slot, lang, tr)));
      continue;
    }
    const occupant = slot.unit;
    const verb = occupant ? tr('swap') : tr('emptySlot');
    list.append(button({
      class: isHero(occupant) ? 'slot-btn is-hero' : 'slot-btn',
      'data-action': 'move',
      'data-from': String(from),
      'data-to': String(index),
      'data-testid': `move-to-${index}`,
      'aria-label': `${tr('move')} ${verb} ${slotCaption(slot, tr)} ${occupant ? unitLabel(occupant, lang, tr) : ''}`.trim(),
    }, el('small', { text: verb }), ...renderSlotFace(slot, lang, tr).slice(1)));
  }
  wrap.append(list);
  return wrap;
}

function renderMergeGrid(state, lang, tr) {
  const wrap = el('div', { 'data-testid': 'merge-grid' });
  const partners = nonHeroSlots(state);
  if (partners.length < 2) {
    wrap.append(el('p', { class: 'muted', 'data-testid': 'no-merge-partner', text: tr('noMergePartner') }));
    return wrap;
  }
  const from = ephemeral.from;
  if (!slotUnit(state, from) || isHero(slotUnit(state, from))) {
    wrap.append(el('p', { class: 'muted', text: tr('mergeSourceHint') }));
    const list = el('div', { class: 'grid ff-slots' });
    for (let index = 0; index < 10; index += 1) {
      const slot = slotAt(state, index) || { index, unit: null };
      const unit = slot.unit;
      if (!unit) {
        list.append(el('div', { class: 'ff-note' }, ...renderSlotFace(slot, lang, tr)));
        continue;
      }
      if (isHero(unit)) {
        list.append(el('div', {
          class: 'ff-note is-hero',
          'data-testid': `merge-blocked-${index}`,
          role: 'note',
        }, el('small', { text: tr('hero') }), el('small', { text: tr('heroProtected') })));
        continue;
      }
      list.append(button({
        class: 'slot-btn',
        'data-intent': 'set-merge-from',
        'data-index': String(index),
        'data-testid': `merge-source-${index}`,
        'aria-label': `${tr('merge')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    }
    wrap.append(list);
    return wrap;
  }
  const source = slotUnit(state, from);
  wrap.append(el('p', { text: `${tr('merge')} · ${unitLabel(source, lang, tr)} · ${tr('rank')} ${fmtNum(source.rank || 1, lang)}` }));
  wrap.append(el('p', { class: 'muted', text: tr('mergeHint') }));
  const list = el('div', { class: 'grid ff-slots' });
  const notes = el('ul', { class: 'muted', 'data-testid': 'merge-blocked-list' });
  let legal = 0;
  for (let index = 0; index < 10; index += 1) {
    const slot = slotAt(state, index) || { index, unit: null };
    const unit = slot.unit;
    if (index === from) {
      list.append(el('div', { class: 'ff-note is-selected' }, ...renderSlotFace(slot, lang, tr)));
      continue;
    }
    if (!unit) {
      list.append(el('div', { class: 'ff-note', 'data-testid': `merge-blocked-${index}` }, el('small', { text: tr('emptySlot') })));
      continue;
    }
    if (isHero(unit)) {
      list.append(el('div', { class: 'ff-note is-hero', 'data-testid': `merge-blocked-${index}`, role: 'note' }, el('small', { text: tr('heroProtected') })));
      notes.append(el('li', { text: `${unitLabel(unit, lang, tr)} · ${tr('heroProtected')}` }));
      continue;
    }
    const preview = safePreview(state, from, index);
    if (preview.ok) {
      legal += 1;
      list.append(button({
        class: 'slot-btn btn-primary',
        primary: true,
        'data-action': 'mergePreview',
        'data-from': String(from),
        'data-to': String(index),
        'data-testid': `merge-target-${index}`,
        'aria-label': `${tr('mergePreview')} ${unitLabel(unit, lang, tr)}`,
      }, ...renderSlotFace(slot, lang, tr)));
    } else {
      const why = reasonText(preview.reason, lang, tr);
      list.append(el('div', { class: 'ff-note', 'data-testid': `merge-blocked-${index}`, role: 'note' }, el('small', { text: unitLabel(unit, lang, tr) }), el('small', { text: tr('locked') })));
      notes.append(el('li', { text: `${unitLabel(unit, lang, tr)} · ${why}` }));
    }
  }
  wrap.append(list);
  if (!legal) wrap.append(el('p', { 'data-testid': 'no-valid-target', text: tr('noValidTarget') }));
  if (notes.childNodes.length) wrap.append(notes);
  return wrap;
}

function bilingualHint(hint, lang) {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return '';
  if (typeof hint.en !== 'string' || typeof hint.zh !== 'string') return '';
  const en = hint.en.trim();
  const zh = hint.zh.trim();
  if (!en || !zh) return '';
  const text = localizeSafe({ en, zh }, lang);
  return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
}

function nextWaveLine(state, lang, tr) {
  const hint = bilingualHint(state?.director?.nextHint, lang);
  if (!hint) return '';
  let text = '';
  try {
    text = tr('nextWave', { hint });
  } catch {
    text = '';
  }
  if (typeof text !== 'string') text = '';
  text = text.replace(/\s+/g, ' ').trim();
  const missing = !text || text === 'nextWave' || text.includes('{hint}');
  if (missing) {
    const label = lang === 'zh' ? '下一波' : 'Next wave';
    return `${label} · ${hint}`;
  }
  if (text.includes(hint)) return text;
  return `${text} · ${hint}`;
}

function appendNextWave(parent, state, lang, tr) {
  const line = nextWaveLine(state, lang, tr);
  if (!line) return;
  parent.append(el('p', {
    class: 'muted ff-next-wave',
    'data-testid': 'next-wave',
    text: line,
  }));
}

function renderRearrange(state, ui, lang, tr, showHeroBadge) {
  const wrap = el('section', { class: 'ff-rearrange', 'data-testid': 'rearrange' });
  if (state.hiddenPaused && !state.paused && state.phase !== 'draft') {
    wrap.append(el('p', { class: 'ff-message', role: 'status', text: tr('pausedHidden') }));
    wrap.append(button({
      primary: true,
      'data-action': 'resume',
      'data-testid': 'resume-hidden',
      text: tr('resume'),
    }));
    return wrap;
  }
  if (!planningAvailable(state)) {
    if (state.phase === 'playing') {
      wrap.append(el('h3', { text: tr('planning') }));
      appendNextWave(wrap, state, lang, tr);
      wrap.append(el('p', { class: 'muted', text: tr('planningLocked') }));
      wrap.append(el('p', { class: 'muted', text: tr('pauseToPlan') }));
      wrap.append(button({
        primary: true,
        'data-action': 'pause',
        'data-testid': 'pause-to-plan',
        text: tr('pause'),
      }));
    }
    return wrap;
  }
  wrap.append(el('h3', { text: tr('planning') }));
  appendNextWave(wrap, state, lang, tr);
  if (state.paused && state.phase === 'playing') {
    wrap.append(button({
      'data-action': 'resume',
      'data-testid': 'resume-planning',
      text: tr('resume'),
    }));
  }
  const selected = slotUnit(state, ui.selectedSlot);
  if (showHeroBadge && isHero(selected)) {
    wrap.append(el('p', { class: 'badge hero-lock', 'data-testid': 'hero-protected', text: tr('heroProtected') }));
  }
  if (ephemeral.mode === 'move') {
    wrap.append(renderMoveGrid(state, lang, tr));
    wrap.append(button({ 'data-intent': 'cancel-mode', 'data-testid': 'cancel-move', text: tr('cancel') }));
    return wrap;
  }
  if (ephemeral.mode === 'merge') {
    wrap.append(el('p', { class: 'muted', text: tr('helpMerge') }));
    wrap.append(renderMergeGrid(state, lang, tr));
    wrap.append(button({ 'data-intent': 'cancel-mode', 'data-testid': 'cancel-merge', text: tr('cancel') }));
    return wrap;
  }
  wrap.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  const actions = el('div', { class: 'ff-actions' });
  actions.append(button({
    'data-intent': 'pick-move',
    'data-testid': 'move-toggle',
    'data-focus': 'cancel-move',
    text: tr('move'),
  }));
  const partners = nonHeroSlots(state);
  if (partners.length >= 2) {
    actions.append(button({
      'data-intent': 'pick-merge',
      'data-testid': 'merge-toggle',
      'data-focus': 'cancel-merge',
      text: tr('merge'),
    }));
  }
  wrap.append(actions);
  if (partners.length < 2) wrap.append(el('p', { class: 'muted', 'data-testid': 'no-merge-partner', text: tr('noMergePartner') }));
  if (isHero(selected)) wrap.append(el('p', { class: 'muted', text: tr('heroNoMerge') }));
  wrap.append(renderSelectGrid(state, ui, lang, tr));
  return wrap;
}

function clipMergeLine(text, lang) {
  const max = lang === 'zh' ? 28 : 48;
  const value = normalizeCopy(text);
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trim()}…`;
}

function mergeExtraLines(state, result, from, to, lang, tr) {
  const lines = [];
  const left = slotUnit(state, from);
  const right = slotUnit(state, to);
  const side = (unit, index) => {
    if (!unit) return tr('emptySlot');
    const rank = Number(unit.rank) || 1;
    const rankBit = rank > 1 ? ` ${tr('rank')} ${fmtNum(rank, lang)}` : '';
    return `${index + 1} ${unitLabel(unit, lang, tr)}${rankBit}`;
  };
  if (left || right) lines.push(clipMergeLine(`${side(left, from)} + ${side(right, to)}`, lang));
  if (result) {
    const signature = signatureLine(safeStats(result, state), lang, tr);
    if (signature) lines.push(clipMergeLine(signature, lang));
  }
  return lines.filter(Boolean).slice(0, 2);
}

function mergeActionButton(attrs, label) {
  return button({
    ...attrs,
    class: 'ff-merge-btn',
    style: 'min-height:44px;height:44px;min-width:44px',
  }, label);
}

function renderMergeConfirm(state, ui, lang, tr) {
  const { from, to } = endpoints(ui);
  const card = el('article', {
    class: 'card ff-merge',
    'data-testid': 'build-merge',
    'data-from': String(from),
    'data-to': String(to),
  });
  const finish = (includeConfirm) => {
    const actions = el('div', { class: 'ff-actions ff-merge-actions' });
    if (includeConfirm) {
      actions.append(mergeActionButton({
        primary: true,
        'data-action': 'mergeConfirm',
        'data-from': String(from),
        'data-to': String(to),
        'data-testid': 'merge-confirm',
      }, tr('mergeConfirm')));
    }
    actions.append(mergeActionButton({
      'data-action': 'mergeCancel',
      'data-testid': 'merge-cancel',
    }, tr('mergeCancel')));
    card.append(actions);
    return card;
  };
  if (!validSlot(from) || !validSlot(to) || from === to) {
    card.append(el('p', { 'data-testid': 'merge-reason', text: tr('invalidMerge') }));
    return finish(false);
  }
  const preview = safePreview(state, from, to);
  const stored = ui.mergePreview && typeof ui.mergePreview === 'object' ? ui.mergePreview : null;
  if (!preview.ok) {
    card.append(el('p', { 'data-testid': 'merge-reason', text: reasonText(preview.reason || stored?.reason, lang, tr) }));
    return finish(false);
  }
  const result = preview.result || stored?.result || stored?.unit || null;
  const name = result ? unitLabel(result, lang, tr) : tr('merge');
  const rank = Number(result?.rank) || 1;
  const heading = el('h2', { class: 'ff-title', 'data-testid': 'merge-result-name' });
  heading.append(el('span', { text: name }));
  heading.append(el('span', {
    class: 'ff-pips',
    'data-testid': 'merge-result-rank',
    text: ` · ${tr('rank')} ${fmtNum(rank, lang)} ${rankPips(rank)}`,
  }));
  card.append(heading);
  const extra = el('div', { 'data-testid': 'merge-preview-lines' });
  const lines = mergeExtraLines(state, result, from, to, lang, tr);
  lines.forEach((text, index) => {
    extra.append(el('p', {
      'data-testid': index === 0 ? 'merge-ingredients' : 'merge-result-description',
      text,
    }));
  });
  card.append(extra);
  return finish(true);
}

function draftIntro(lang) {
  return lang === 'zh'
    ? '选一张。塔接着放置，英雄升级立刻生效。'
    : 'Pick one. Towers are placed next. Hero upgrades apply now.';
}

function choiceLimit(lang) {
  return lang === 'zh' ? 20 : 36;
}

function fitChoice(segments, max) {
  const chosen = segments.filter((segment) => segment && segment.text);
  const length = () => chosen.map((segment) => segment.text).join(' · ').length;
  while (length() > max) {
    let index = -1;
    let rank = -1;
    for (let i = 0; i < chosen.length; i += 1) {
      if (!chosen[i].optional) continue;
      const drop = chosen[i].drop ?? 1;
      if (drop >= rank) {
        rank = drop;
        index = i;
      }
    }
    if (index < 0) break;
    chosen.splice(index, 1);
  }
  return chosen.map((segment) => segment.text).join(' · ');
}

function towerRole(type, lang) {
  return localizeSafe(towerRecord(type)?.role, lang);
}

function roleSegment(role, signature) {
  if (!role) return '';
  if (signature && signature.toLowerCase().includes(role.toLowerCase())) return '';
  return role;
}

function signatureLine(stats, lang, tr) {
  if (!stats) return lang === 'zh' ? '单体射击' : 'Single-target shot';
  if (stats.burn && typeof stats.burn === 'object') {
    const dps = fmtNum(Number(stats.burn.dps ?? stats.burn.damage), lang);
    const splash = Number(stats.splash) > 0;
    if (lang === 'zh') return splash ? `溅射燃烧 ${dps}/秒` : `燃烧 ${dps}/秒`;
    return splash ? `Splash and burn ${dps}/s` : `Burn ${dps}/s`;
  }
  if (stats.slow && typeof stats.slow === 'object') {
    const factor = Number(stats.slow.factor ?? stats.slow.power);
    if (Number.isFinite(factor) && factor > 0 && factor <= 1) {
      const kept = fmtNum(Math.round(factor * 100), lang);
      return lang === 'zh' ? `减速至 ${kept}%` : `Slows to ${kept}% speed`;
    }
    return lang === 'zh' ? '减速单个敌人' : 'Slows one enemy';
  }
  if (stats.poison && typeof stats.poison === 'object') {
    const stacks = fmtNum(Number(stats.poison.maxStacks ?? stats.poison.stacks ?? 1), lang);
    const dps = fmtNum(Number(stats.poison.dps ?? stats.poison.damage), lang);
    return lang === 'zh' ? `${tr('poison')} ${dps}/秒，${stacks} 层` : `${tr('poison')} ${dps}/s, ${stacks} stacks`;
  }
  if (stats.aura && typeof stats.aura === 'object') {
    const damage = percentNumber(stats.aura.damage);
    const haste = percentNumber(stats.aura.haste);
    const parts = [];
    if (damage) parts.push(`+${fmtNum(damage, lang)}% ${tr('damage')}`);
    if (haste) parts.push(`+${fmtNum(haste, lang)}% ${tr('haste')}`);
    const body = parts.join(lang === 'zh' ? '，' : ', ');
    return body ? `${tr('aura')} ${body}` : tr('aura');
  }
  if (Number(stats.chain) > 0) return `${tr('chain')} ${fmtNum(stats.chain, lang)}`;
  if (Number(stats.pierce) > 0) return `${tr('pierce')} ${fmtNum(stats.pierce, lang)}`;
  if (Number(stats.splash) > 0) return lang === 'zh' ? '范围溅射' : 'Splash on impact';
  return lang === 'zh' ? '单体射击' : 'Single-target shot';
}

function heroEffectLine(record, lang, tr) {
  const effect = record?.effect;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return '';
  if (finite(effect.damageAdd) && Number(effect.damageAdd) !== 0) {
    return `${tr('damage')} +${fmtNum(effect.damageAdd, lang)}`;
  }
  if (finite(effect.haste) && Number(effect.haste) !== 0) {
    return `${tr('attackSpeed')} +${fmtNum(Math.round(Number(effect.haste) * 100), lang)}%`;
  }
  if (finite(effect.range) && Number(effect.range) !== 0) {
    return `${tr('range')} +${fmtNum(effect.range, lang)}`;
  }
  if (finite(effect.critChance) && Number(effect.critChance) !== 0) {
    return `${tr('crit')} +${fmtNum(Math.round(Number(effect.critChance) * 100), lang)}%`;
  }
  if (finite(effect.critMultiplier) && Number(effect.critMultiplier) !== 0) {
    return `${tr('critDamage')} +${fmtNum(effect.critMultiplier, lang)}×`;
  }
  if (finite(effect.pierce) && Number(effect.pierce) !== 0) {
    return `${tr('pierce')} +${fmtNum(effect.pierce, lang)}`;
  }
  if (effect.poison && typeof effect.poison === 'object') {
    const dps = fmtNum(effect.poison.dps, lang);
    const duration = fmtNum(effect.poison.duration, lang);
    return lang === 'zh'
      ? `${tr('poison')} ${dps}/秒，${duration} 秒`
      : `${tr('poison')} ${dps}/s for ${duration}s`;
  }
  const sentence = localizeSafe(record?.description, lang).replace(/\s+/g, ' ').trim();
  if (!sentence) return '';
  const first = sentence.split(/(?<=[。！？.!?])\s*/)[0] || sentence;
  return first.replace(/[。.!]$/, '');
}

function compactOffer(state, option, lang, tr) {
  const max = choiceLimit(lang);
  if (option?.kind === 'hero_upgrade') {
    const id = resolveUpgradeId(option);
    const record = upgradeRecord(id);
    const hero = findHero(state);
    const effect = heroEffectLine(record, lang, tr) || tr('chooseUpgrade');
    const cap = Number(record?.cap ?? option?.cap);
    const current = upgradeLevel(hero, id);
    const next = Number.isFinite(Number(option?.nextLevel)) ? Number(option.nextLevel) : current + 1;
    const levelText = Number.isFinite(cap) ? `${tr('level')} ${fmtNum(next, lang)}/${fmtNum(cap, lang)}` : '';
    const blurb = fitChoice([
      { text: tr('hero'), optional: true, drop: 2 },
      { text: effect, optional: false },
      { text: levelText, optional: true, drop: 1 },
    ], max);
    return { blurb, stats: [] };
  }
  const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
  const preview = option?.unit && typeof option.unit === 'object'
    ? option.unit
    : { id: `preview-${option?.type || 'tower'}`, kind: option?.kind || 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
  const stats = safeStats(preview, state);
  const signature = signatureLine(stats, lang, tr);
  const role = roleSegment(towerRole(option?.type || preview.type, lang), signature);
  const aura = stats?.aura && typeof stats.aura === 'object';
  const damage = !aura && finite(stats?.damage) ? `${tr('damage')} ${fmtNum(stats.damage, lang)}` : '';
  const interval = Number(stats?.interval);
  const speed = !aura && interval > 0 ? `${tr('attackSpeed')} ${fmtNum(1 / interval, lang)}${perSecond(lang)}` : '';
  const blurb = fitChoice([
    { text: option?.replace ? tr('replace') : '', optional: false },
    { text: role, optional: true, drop: 2 },
    { text: signature, optional: false },
    { text: damage, optional: true, drop: 1 },
    { text: speed, optional: true, drop: 3 },
  ], max);
  return { blurb, stats: [] };
}

function legalMergePairs(state) {
  const towers = nonHeroSlots(state);
  const pairs = [];
  for (let left = 0; left < towers.length; left += 1) {
    for (let right = left + 1; right < towers.length; right += 1) {
      const preview = safePreview(state, towers[left], towers[right]);
      if (preview.ok) pairs.push({ from: towers[left], to: towers[right] });
    }
  }
  return pairs;
}

function pairLabel(state, from, to, lang, tr) {
  const side = (index) => {
    const unit = slotUnit(state, index);
    const rank = Number(unit?.rank) || 1;
    const rankBit = rank > 1 ? ` ${tr('rank')}${fmtNum(rank, lang)}` : '';
    return `${index + 1} ${unitLabel(unit, lang, tr)}${rankBit}`;
  };
  return `${side(from)} + ${side(to)}`;
}

function renderDraftMerge(state, lang, tr, ui) {
  if (mergeConfirmActive(ui)) return null;
  if (nonHeroSlots(state).length < 2) return null;
  const wrap = el('div', { class: 'ff-draft-merge', 'data-testid': 'draft-merge' });
  if (ephemeral.mode !== 'merge') {
    wrap.append(button({
      'data-intent': 'pick-merge',
      'data-testid': 'draft-merge-open',
      text: tr('mergePreview'),
    }));
    return wrap;
  }
  const pairs = legalMergePairs(state);
  if (!pairs.length) {
    wrap.append(el('p', { 'data-testid': 'no-valid-target', text: tr('noValidTarget') }));
  } else {
    const list = el('div', { class: 'ff-draft-list', 'data-testid': 'draft-merge-pairs' });
    for (const pair of pairs) {
      list.append(button({
        'data-action': 'mergePreview',
        'data-from': String(pair.from),
        'data-to': String(pair.to),
        'data-testid': `draft-merge-${pair.from}-${pair.to}`,
        text: pairLabel(state, pair.from, pair.to, lang, tr),
      }));
    }
    wrap.append(list);
  }
  wrap.append(el('p', { class: 'muted', text: tr('heroProtected') }));
  wrap.append(button({
    'data-intent': 'cancel-mode',
    'data-testid': 'cancel-merge',
    text: tr('mergeCancel'),
  }));
  return wrap;
}

function draftBaseType(option) {
  if (!option || typeof option !== 'object') return '';
  if (option.kind === 'hero_upgrade') return '';
  if (option.kind && option.kind !== 'tower') return '';
  const type = typeof option.type === 'string' ? option.type.trim() : '';
  if (!type || type === 'hero') return '';
  return type;
}

function boardHasBaseType(state, type) {
  if (!type) return false;
  for (let index = 0; index < 10; index += 1) {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit) || unit.kind === 'hybrid') continue;
    if (unit.type === type) return true;
  }
  return false;
}

function draftFieldLabel(state, option, lang, tr) {
  const type = draftBaseType(option);
  if (!type) return null;
  const onField = boardHasBaseType(state, type);
  const key = onField ? 'draftOnField' : 'draftNewType';
  let text = tr(key);
  if (typeof text !== 'string' || text === '' || text === key) {
    const fallback = lang === 'zh'
      ? { draftOnField: '场上已有', draftNewType: '场上还没有' }
      : { draftOnField: 'Already on the field', draftNewType: 'Not on the field yet' };
    text = fallback[key];
  }
  return { onField, type, text };
}

const ROLE_CUES = {
  bolt: { glyph: '➤', color: '#f0d56a', en: 'Shot', zh: '投射' },
  fire: { glyph: '▲', color: '#e25b2a', en: 'Burn', zh: '燃烧' },
  frost: { glyph: '❄', color: '#9fd7e8', en: 'Slow', zh: '减速' },
  lightning: { glyph: '↯', color: '#f4e27a', en: 'Chain', zh: '连锁' },
  poison: { glyph: '●', color: '#7dce6a', en: 'Stack', zh: '叠毒' },
  support: { glyph: '✚', color: '#8fd0c6', en: 'Aura', zh: '光环' },
};

const METER_CAPTION = {
  en: { damage: 'Dmg', speed: 'Spd', range: 'Rng', crit: 'Crit', critDamage: 'C×', pierce: 'Pierce', poison: 'Tox' },
  zh: { damage: '伤', speed: '速', range: '距', crit: '暴', critDamage: '爆', pierce: '穿', poison: '毒' },
};

function fillPct(part, whole) {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round(part / whole * 100)));
}

function threeBars(damage, speed, range) {
  return [
    { key: 'damage', fill: damage },
    { key: 'speed', fill: speed },
    { key: 'range', fill: range },
  ];
}

function towerPowerBars(state, option) {
  const rank = Number.isInteger(Number(option?.rank)) && option.rank >= 1 && option.rank <= 4 ? Number(option.rank) : 1;
  const preview = option?.unit && typeof option.unit === 'object'
    ? option.unit
    : { id: `preview-${option?.type || 'tower'}`, kind: option?.kind || 'tower', type: option?.type, rank, upgrades: {}, cooldown: 0, kills: 0 };
  const stats = safeStats(preview, state) || {};
  const interval = Number(stats.interval);
  return threeBars(
    fillPct(Number(stats.damage) || 0, 12),
    fillPct(interval > 0 ? 1 / interval : 0, 1.6),
    fillPct(Number(stats.range) || 0, 280),
  );
}

function heroPowerBars(option) {
  const record = upgradeRecord(resolveUpgradeId(option));
  const effect = record?.effect || {};
  const cap = Number(record?.cap ?? option?.cap);
  const next = Number(option?.nextLevel);
  const progress = Number.isFinite(cap) && cap > 0 && Number.isFinite(next) ? next / cap : 0.75;
  const strong = Math.max(36, Math.min(100, Math.round(36 + 64 * progress)));
  const dim = 14;
  if (effect.damageAdd) return threeBars(strong, dim, dim);
  if (effect.haste) return threeBars(dim, strong, dim);
  if (effect.range) return threeBars(dim, dim, strong);
  if (effect.critChance) return [{ key: 'crit', fill: strong }];
  if (effect.critMultiplier) return [{ key: 'critDamage', fill: strong }];
  if (Number(effect.pierce) > 0) return [{ key: 'pierce', fill: strong }];
  if (effect.poison) return [{ key: 'poison', fill: strong }];
  return [{ key: 'damage', fill: strong }];
}

function powerBars(state, option) {
  if (option?.kind === 'hero_upgrade') return heroPowerBars(option);
  return towerPowerBars(state, option);
}

function meterCaption(key, lang) {
  const table = lang === 'zh' ? METER_CAPTION.zh : METER_CAPTION.en;
  return table[key] || '';
}

function renderMeter(state, option, lang, index) {
  const bars = powerBars(state, option);
  const meter = el('span', {
    class: 'ff-meter',
    'data-testid': `draft-choice-${index}-meter`,
    'data-bars': String(bars.length),
    'aria-hidden': 'true',
  });
  for (const bar of bars) {
    const row = el('span', { class: 'ff-meter-row', 'data-meter': bar.key, 'data-fill': String(bar.fill) });
    row.append(el('span', { text: meterCaption(bar.key, lang) }));
    row.append(el('span', { class: 'ff-meter-track' }, el('span', {
      class: 'ff-meter-fill',
      style: `width:${bar.fill}%`,
    })));
    meter.append(row);
  }
  return meter;
}

function heroMarkLabel(effect, lang) {
  let key = '';
  if (effect.damageAdd) key = 'damage';
  else if (effect.haste) key = 'speed';
  else if (effect.range) key = 'range';
  else if (effect.critChance) key = 'crit';
  else if (effect.critMultiplier) key = 'critDamage';
  else if (Number(effect.pierce) > 0) key = 'pierce';
  else if (effect.poison) key = 'poison';
  const labels = lang === 'zh'
    ? { damage: '伤害', speed: '攻速', range: '射程', crit: '暴击', critDamage: '暴伤', pierce: '穿透', poison: '毒素' }
    : { damage: 'Damage', speed: 'Speed', range: 'Range', crit: 'Crit', critDamage: 'Crit×', pierce: 'Pierce', poison: 'Poison' };
  return labels[key] || '';
}

function heroStatCue(option, lang) {
  const id = resolveUpgradeId(option);
  const record = upgradeRecord(id);
  const effect = record?.effect || {};
  const label = heroMarkLabel(effect, lang);
  if (effect.damageAdd) return { glyph: '＋', color: '#f0d56a', label };
  if (effect.haste) return { glyph: '»', color: '#f0cb72', label };
  if (effect.range) return { glyph: '→', color: '#9fd7e8', label };
  if (effect.critChance) return { glyph: '✦', color: '#f0cb72', label };
  if (effect.critMultiplier) return { glyph: '×', color: '#e7a08a', label };
  if (Number(effect.pierce) > 0) return { glyph: '│', color: '#d7e4ea', label };
  if (effect.poison) return { glyph: '●', color: '#7dce6a', label };
  return { glyph: '★', color: '#f0cb72', label };
}

function draftMark(option, lang, tr) {
  if (option?.kind === 'hero_upgrade') return heroStatCue(option, lang, tr);
  const cue = ROLE_CUES[option?.type];
  if (!cue) return { glyph: '◆', color: '#d7e4ea', label: '' };
  return { glyph: cue.glyph, color: cue.color, label: lang === 'zh' ? cue.zh : cue.en };
}

/** Glanceable mark and meter for one of the three draft cards. */
export function draftPower(state, option, language) {
  const lang = language === 'zh' ? 'zh' : 'en';
  const tr = (key, vars) => translate(lang, key, vars);
  const mark = draftMark(option, lang, tr);
  return {
    glyph: mark.glyph,
    label: mark.label,
    color: mark.color,
    bars: powerBars(state, option).map((bar) => ({
      key: bar.key,
      fill: bar.fill,
      caption: meterCaption(bar.key, lang),
    })),
  };
}

function renderDraft(state, lang, tr, idSuffix) {
  const section = el('section', { 'data-testid': 'build-draft', 'data-compact': '1' });
  const titleId = `ff-draft-title-${idSuffix}`;
  const title = el('h2', { id: titleId, class: 'ff-title', 'data-testid': 'draft-title', text: tr('chooseOneOfThree') });
  section.append(title);
  section.setAttribute('aria-labelledby', titleId);
  section.append(el('p', { class: 'muted ff-draft-hint', 'data-testid': 'draft-hint', text: draftIntro(lang) }));
  const options = Array.isArray(state.draft?.options) ? state.draft.options : null;
  if (!options || !options.length) {
    section.append(el('p', { 'data-testid': 'draft-empty', text: tr('noDraft') }));
    return section;
  }
  const list = el('ol', { class: 'ff-draft-list', 'data-testid': 'draft-list', 'data-count': String(options.length) });
  options.forEach((option, index) => {
    const name = draftOptionName(option, lang, tr);
    const offer = compactOffer(state, option, lang, tr);
    const field = draftFieldLabel(state, option, lang, tr);
    const effectId = `ff-draft-effect-${idSuffix}-${index}`;
    const statText = offer.stats.join(' · ');
    const mark = draftMark(option, lang, tr);
    const described = statText ? `${offer.blurb}. ${statText}` : offer.blurb;
    const spoken = field ? `${name}. ${field.text}. ${described}` : `${name}. ${described}`;
    const card = button({
      class: 'card ff-choice',
      'data-action': 'chooseDraft',
      'data-index': String(index),
      'data-kind': option?.kind || '',
      'data-type': option?.type || '',
      'data-upgrade-id': option?.upgradeId || '',
      'data-replace': option?.replace ? 'true' : 'false',
      'data-option-id': option?.id || '',
      'data-testid': `draft-choice-${index}`,
      'aria-describedby': effectId,
      'aria-label': spoken,
    });
    const markNode = el('span', {
      class: 'ff-mark',
      'data-testid': `draft-choice-${index}-mark`,
      'data-stat': mark.label || '',
      style: `color:${mark.color}`,
      'aria-hidden': 'true',
    });
    markNode.append(el('b', { text: mark.glyph }));
    if (mark.label) markNode.append(el('small', { text: mark.label }));
    card.append(markNode, renderMeter(state, option, lang, index));
    const copy = el('span', { class: 'ff-choice-copy' });
    copy.append(el('h3', { 'data-testid': `draft-choice-${index}-name`, text: name }));
    if (field) {
      copy.append(el('p', {
        class: `badge ff-field ${field.onField ? 'is-owned' : 'is-new'}`,
        'data-testid': `draft-choice-${index}-field`,
        'data-on-field': field.onField ? 'true' : 'false',
        'data-type': field.type,
        text: field.text,
      }));
    }
    copy.append(el('p', { id: effectId, class: 'ff-blurb', 'data-testid': `draft-choice-${index}-effect`, text: offer.blurb }));
    if (statText) {
      copy.append(el('p', { class: 'ff-statline', 'data-testid': `draft-choice-${index}-stats`, text: statText }));
    }
    card.append(copy);
    list.append(el('li', { 'data-testid': `draft-card-${index}` }, card));
  });
  section.append(list);
  return section;
}

function renderPlacing(state, lang, tr) {
  const section = el('section', { 'data-testid': 'build-placing' });
  section.append(el('h2', { class: 'ff-title', text: tr('chooseSlot') }));
  section.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  const pending = state.pendingUnit;
  const unit = pending?.unit;
  if (!unit) {
    section.append(el('p', { text: tr('loading') }));
    section.append(button({
      'data-action': 'cancelPlacement',
      'data-testid': 'cancel-placement',
      text: tr('cancelPlacement'),
    }));
    return section;
  }
  const allowReplace = pending.replace === true || emptySlots(state).length === 0;
  section.append(el('article', { class: 'card', 'data-testid': 'placing-unit' },
    el('span', { class: 'badge', text: pending.replace ? tr('replace') : tr('kindTower') }),
    el('h3', { 'data-testid': 'pending-name', text: unitLabel(unit, lang, tr) }),
    unitDescription(unit, lang) ? el('p', { class: 'muted', text: unitDescription(unit, lang) }) : null,
    el('p', { class: 'ff-pips', text: `${tr('rank')} ${fmtNum(unit.rank || 1, lang)} ${rankPips(unit.rank || 1)}` }),
    statList(safeStats(unit, state), lang, tr, 'pending-stats'),
  ));
  if (ephemeral.replaceIndex >= 0) {
    const target = slotUnit(state, ephemeral.replaceIndex);
    const box = el('article', { class: 'card', 'data-testid': 'replace-preview' });
    box.append(el('h3', { text: tr('replaceConfirm') }));
    box.append(el('p', { text: tr('confirmReplaceBody') }));
    box.append(el('p', { 'data-testid': 'replace-target-name', text: `${tr('lostOnReplace')}: ${target ? unitLabel(target, lang, tr) : tr('emptySlot')}` }));
    box.append(el('p', { class: 'badge hero-lock', text: tr('heroProtected') }));
    const actions = el('div', { class: 'ff-actions' });
    actions.append(button({
      primary: true,
      'data-action': 'place',
      'data-index': String(ephemeral.replaceIndex),
      'data-replace': 'true',
      'data-testid': 'replace-confirm',
      text: tr('replaceConfirm'),
    }));
    actions.append(button({
      'data-intent': 'cancel-replace',
      'data-testid': 'replace-cancel',
      text: tr('cancel'),
    }));
    box.append(actions);
    section.append(box);
  } else {
    if (allowReplace && emptySlots(state).length === 0) {
      section.append(el('p', { text: tr('fullBoard') }));
      section.append(el('p', { class: 'muted', text: tr('replaceHeroSafe') }));
    } else {
      section.append(el('p', { class: 'muted', text: tr('placeHint') }));
    }
    const list = el('div', { class: 'grid ff-slots', 'data-testid': 'place-grid' });
    for (let index = 0; index < 10; index += 1) {
      const slot = slotAt(state, index) || { index, unit: null };
      const occupant = slot.unit;
      if (!occupant) {
        list.append(button({
          class: 'slot-btn',
          primary: true,
          'data-action': 'place',
          'data-index': String(index),
          'data-replace': 'false',
          'data-testid': `place-slot-${index}`,
          'aria-label': `${tr('place')} ${slotCaption(slot, tr)}`,
        }, el('small', { text: String(index + 1) }), el('small', { text: tr('place') }), el('small', { text: tr('emptySlot') })));
        continue;
      }
      if (isHero(occupant) || !allowReplace) {
        list.append(el('div', {
          class: isHero(occupant) ? 'ff-note is-hero' : 'ff-note',
          'data-testid': `place-blocked-${index}`,
          role: 'note',
        }, el('small', { text: unitLabel(occupant, lang, tr) }), el('small', { text: isHero(occupant) ? tr('heroProtected') : tr('slotOccupied') })));
        continue;
      }
      list.append(button({
        class: 'slot-btn',
        'data-intent': 'arm-replace',
        'data-index': String(index),
        'data-testid': `replace-slot-${index}`,
        'data-focus': 'replace-confirm',
        'aria-label': `${tr('replace')} ${unitLabel(occupant, lang, tr)}`,
      }, el('small', { text: tr('replace') }), el('small', { text: unitLabel(occupant, lang, tr) })));
    }
    section.append(list);
  }
  section.append(button({
    'data-action': 'cancelPlacement',
    'data-testid': 'cancel-placement',
    text: tr('cancelPlacement'),
  }));
  return section;
}

function renderDetails(state, ui, lang, tr, options) {
  const section = el('section', { class: 'card ff-details', 'data-testid': 'build-details' });
  if (state.phase === 'victory' || state.phase === 'defeat') {
    section.append(el('h2', { text: state.phase === 'victory' ? tr('victory') : tr('defeat') }));
  } else if (state.paused && state.phase === 'playing') {
    section.append(el('p', { class: 'badge', 'data-testid': 'planning-banner', text: tr('planning') }));
  }
  if (state.hiddenPaused) section.append(el('p', { class: 'muted', text: tr('pausedHidden') }));
  const index = ui.selectedSlot;
  const slot = validSlot(index) ? slotAt(state, index) : null;
  const unit = slot?.unit || null;
  if (!slot) {
    section.append(el('h2', { text: tr('select') }));
    section.append(el('p', { class: 'muted', 'data-testid': 'empty-selection', text: tr('emptySelection') }));
    section.append(el('p', { class: 'muted', text: tr('helpPlacement') }));
  } else if (!unit) {
    section.append(el('h2', { 'data-testid': 'unit-name', text: tr('emptySlot') }));
    section.append(el('p', { class: 'muted', text: slotCaption(slot, tr) }));
    section.append(el('p', { class: 'muted', text: tr('chooseEmpty') }));
    if (state.phase === 'placing' && options.placeSelected) {
      section.append(button({
        primary: true,
        'data-action': 'place',
        'data-index': String(index),
        'data-replace': 'false',
        'data-testid': 'place-selected',
        text: tr('place'),
      }));
    }
  } else {
    const kind = isHero(unit) ? tr('hero') : (unit.kind === 'hybrid' ? tr('hybrid') : tr('towers'));
    section.append(el('p', { class: isHero(unit) ? 'badge hero-lock' : 'badge', 'data-testid': 'unit-type', text: kind }));
    if (isHero(unit) && options.heroBadge) {
      section.append(el('p', { class: 'badge hero-lock', 'data-testid': 'hero-protected', text: tr('heroProtected') }));
      section.append(el('p', { class: 'muted', text: tr('heroNoMerge') }));
    }
    section.append(el('h2', { 'data-testid': 'unit-name', text: unitLabel(unit, lang, tr) }));
    section.append(el('p', { class: 'muted', text: slotCaption(slot, tr) }));
    if (!isHero(unit)) {
      section.append(el('p', { class: 'ff-pips', 'data-testid': 'unit-rank', text: `${tr('rank')} ${fmtNum(unit.rank || 1, lang)} ${rankPips(unit.rank)}` }));
      if (Number(unit.rank) >= 4) section.append(el('p', { class: 'muted', text: tr('maxRankNote') }));
    }
    const description = isHero(unit) ? '' : unitDescription(unit, lang);
    if (description) section.append(el('p', { text: description }));
    if (unit.kind === 'hybrid') {
      const recipe = recipeById(unit.type);
      if (recipe?.parents?.length) {
        const parents = recipe.parents.map((type) => towerName(type, lang, tr)).join(' + ');
        section.append(el('p', { 'data-testid': 'unit-recipe', text: `${tr('recipes')} · ${tr('ingredients')} ${parents}` }));
      }
    }
    const stats = safeStats(unit, state);
    section.append(el('h3', { text: tr('currentStats') }));
    section.append(statList(stats, lang, tr, 'unit-stats'));
    section.append(el('p', { class: 'muted', text: tr('helpRange') }));
    const auraNote = supportNote(unit, stats, tr);
    if (auraNote) section.append(el('p', { class: 'muted', 'data-testid': 'support-note', text: auraNote }));
    const mechanics = Array.isArray(stats?.mechanics) ? stats.mechanics : [];
    if (mechanics.length) {
      const list = el('ul', { class: 'ff-mechs', 'data-testid': 'unit-mechanics' });
      for (const item of mechanics) {
        const text = mechanicText(item, lang);
        if (text) list.append(el('li', { class: 'badge', text }));
      }
      if (list.childNodes.length) section.append(list);
    }
    if (isHero(unit) && unit.upgrades && typeof unit.upgrades === 'object') {
      const entries = Array.isArray(unit.upgrades) ? unit.upgrades.map((id) => [id, 1]) : Object.entries(unit.upgrades);
      if (entries.length) {
        const list = el('ul', { class: 'ff-stats', 'data-testid': 'hero-upgrades' });
        for (const [id, value] of entries) {
          const record = upgradeRecord(id);
          const name = localizeSafe(record?.name, lang) || id;
          const level = typeof value === 'number' ? value : upgradeLevel(unit, id);
          const cap = Number(record?.cap);
          const capText = Number.isFinite(cap) ? ` / ${fmtNum(cap, lang)}` : '';
          list.append(el('li', { text: `${name} · ${tr('level')} ${fmtNum(level, lang)}${capText}` }));
        }
        section.append(list);
      }
    }
    if (finite(unit.kills) && Number(unit.kills) > 0) {
      section.append(el('p', { text: `${tr('kills')} ${fmtNum(unit.kills, lang)}` }));
    }
  }
  if (options.actions && state.phase !== 'victory' && state.phase !== 'defeat') {
    section.append(renderRearrange(state, ui, lang, tr, false));
  }
  return section;
}

function restoreFocus(container) {
  const id = container.__ffFocus;
  if (!id || !/^[\w-]+$/.test(id)) return;
  if (!container.__ffFocusUntil || Date.now() > container.__ffFocusUntil) return;
  const node = container.querySelector(`[data-testid="${id}"]`);
  if (node && typeof node.focus === 'function') {
    try { node.focus(); } catch { /* the control may be hidden */ }
  }
}

function safeAct(api, action, payload) {
  try {
    if (typeof api?.act !== 'function') return { ok: false, reason: 'invalidMerge' };
    return api.act(action, payload);
  } catch (error) {
    return { ok: false, reason: error?.message || 'invalidMerge' };
  }
}

function rerenderFamily(container, api) {
  const state = typeof api?.getState === 'function' ? api.getState() : null;
  renderBuildPanel(container, state, api);
  const doc = container.ownerDocument;
  if (!doc?.querySelectorAll) return;
  for (const candidate of doc.querySelectorAll('[data-ui]')) {
    if (candidate !== container && candidate.__ffBuildCtx) {
      renderBuildPanel(candidate, api.getState?.() || state, api);
    }
  }
}

function handlePress(container, api, action, intent, control) {
  const state = typeof api.getState === 'function' ? api.getState() : null;
  const index = pickIndex(control.getAttribute('data-index'));
  const from = pickIndex(control.getAttribute('data-from'));
  const to = pickIndex(control.getAttribute('data-to'));
  container.__ffFocus = control.getAttribute('data-focus') || control.getAttribute('data-testid') || '';
  container.__ffFocusUntil = Date.now() + 500;
  const ui = readUI(api);

  if (intent === 'pick-move') {
    ephemeral.mode = 'move';
    ephemeral.to = -1;
    ephemeral.from = slotUnit(state, ui.selectedSlot) ? ui.selectedSlot : -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'pick-merge') {
    const selected = slotUnit(state, ui.selectedSlot);
    ephemeral.mode = 'merge';
    ephemeral.to = -1;
    ephemeral.from = selected && !isHero(selected) ? ui.selectedSlot : -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'cancel-mode' || intent === 'cancel-replace') {
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    ephemeral.replaceIndex = -1;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'set-from') {
    if (!slotUnit(state, index)) return;
    ephemeral.from = index;
    ephemeral.message = '';
    safeAct(api, 'selectSlot', { index });
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'set-merge-from') {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit)) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    ephemeral.mode = 'merge';
    ephemeral.from = index;
    ephemeral.message = '';
    safeAct(api, 'selectSlot', { index });
    rerenderFamily(container, api);
    return;
  }
  if (intent === 'arm-replace') {
    const unit = slotUnit(state, index);
    if (!unit || isHero(unit)) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    ephemeral.replaceIndex = index;
    ephemeral.message = '';
    rerenderFamily(container, api);
    return;
  }
  if (!action) return;

  let payload = {};
  if (action === 'chooseDraft') {
    if (!Number.isInteger(index) || index < 0) return;
    payload = { index };
    ephemeral.mode = 'idle';
  } else if (action === 'place') {
    if (!validSlot(index)) return;
    const replace = control.getAttribute('data-replace') === 'true';
    if (replace && isHero(slotUnit(state, index))) {
      ephemeral.message = 'hero';
      rerenderFamily(container, api);
      return;
    }
    payload = { index, replace };
  } else if (action === 'move' || action === 'mergePreview' || action === 'mergeConfirm') {
    if (!validSlot(from) || !validSlot(to) || from === to) {
      ephemeral.message = 'same';
      rerenderFamily(container, api);
      return;
    }
    payload = { from, to };
  } else if (action === 'selectSlot') {
    if (!validSlot(index)) return;
    payload = { index };
  } else if (action === 'mergeCancel') {
    const ends = endpoints(ui);
    ephemeral.ignorePreview = { from: ends.from, to: ends.to };
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    payload = {};
  } else if (action === 'cancelPlacement') {
    ephemeral.replaceIndex = -1;
    ephemeral.mode = 'idle';
    payload = {};
  } else if (action === 'pause' || action === 'resume') {
    payload = {};
  } else {
    return;
  }

  if (action === 'mergePreview') {
    ephemeral.mode = 'merge-confirm';
    ephemeral.from = from;
    ephemeral.to = to;
    ephemeral.ignorePreview = null;
  }

  ephemeral.message = '';
  const result = safeAct(api, action, payload);
  if (result && typeof result === 'object' && result.ok === false) {
    ephemeral.message = result.reason || (action === 'move' ? 'phase' : 'invalidMerge');
    if (action === 'mergePreview' || action === 'mergeConfirm') {
      ephemeral.mode = 'merge-confirm';
      ephemeral.from = from;
      ephemeral.to = to;
    }
  } else if (action === 'mergeConfirm' || action === 'move' || action === 'place') {
    if (action === 'mergeConfirm') ephemeral.ignorePreview = { from, to };
    ephemeral.mode = 'idle';
    ephemeral.from = -1;
    ephemeral.to = -1;
    if (action === 'place') ephemeral.replaceIndex = -1;
  }
  rerenderFamily(container, api);
}

export function renderBuildPanel(container, state, api) {
  if (!container || typeof container.appendChild !== 'function' || container.tagName === 'CANVAS') return;
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc?.createElement) return;
  currentDoc = doc;
  const role = roleOf(container);
  if (role === 'menu') {
    clearContainer(container);
    return;
  }
  if (!role && container.querySelector?.('canvas')) return;
  ensureStyles(doc);
  bind(container);
  const safeApi = api || {};
  container.__ffBuildCtx = { api: safeApi };
  const lang = languageOf(state, safeApi);
  const tr = makeT(safeApi, lang);
  const ui = readUI(safeApi);
  if (state) syncEphemeral(state, ui);
  if ((ui.screen && ui.screen !== 'battle') || !state || !Array.isArray(state.slots)) {
    clearContainer(container);
    return;
  }

  const confirming = mergeConfirmActive(ui);
  const modalKind = state.phase === 'draft' ? 'draft' : (state.phase === 'placing' ? 'placing' : '');
  const overlayMounted = role !== 'overlay' && pageHas(container, 'overlay');
  const modalWanted = confirming || modalKind === 'draft' || modalKind === 'placing';
  const includeModal = role === 'overlay'
    ? modalWanted
    : role === 'panel'
      ? (!overlayMounted && modalWanted)
      : modalWanted;
  if (role === 'overlay' && !includeModal) {
    clearContainer(container);
    return;
  }
  const includeDetails = role !== 'overlay';
  const modalHere = includeModal && modalWanted;
  const actionsHere = modalHere
    ? true
    : includeDetails && !(overlayMounted && modalWanted);
  const showProgress = role === 'overlay' ? modalHere : !(overlayMounted && modalWanted);

  const root = el('section', {
    class: `ff-build panel${state.phase === 'draft' ? ' is-draft' : ''}${reducedMotion(state, safeApi) ? ' is-reduced' : ''}`,
    'data-testid': 'build-panel',
    'data-ff-build': '1',
    'data-phase': state.phase || '',
    'data-lang': lang,
    role: 'region',
    'aria-label': tr('buildPanelLabel'),
  });
  const messages = renderMessages(ui, lang, tr, { omitEssays: role === 'overlay' });
  if (messages) root.append(messages);
  if (showProgress) {
    root.append(el('p', { class: 'muted', 'data-testid': 'xp-progress', text: progressText(state, tr, lang) }));
  }
  if (confirming && modalHere) root.append(renderMergeConfirm(state, ui, lang, tr));
  if (modalKind === 'draft' && includeModal) root.append(renderDraft(state, lang, tr, role || 'main', ui));
  if (modalKind === 'placing' && includeModal) root.append(renderPlacing(state, lang, tr));
  if (includeDetails) {
    const draftOwnsHeroNote = modalKind === 'draft' && includeModal;
    root.append(renderDetails(state, ui, lang, tr, {
      actions: actionsHere && !modalHere,
      heroBadge: !draftOwnsHeroNote && isHero(slotUnit(state, ui.selectedSlot)),
      placeSelected: false,
    }));
  }
  if (!root.childNodes.length) {
    clearContainer(container);
    return;
  }
  clearContainer(container);
  container.append(root);
  restoreFocus(container);
}
