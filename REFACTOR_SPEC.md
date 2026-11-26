# Fencefall / 最后一道防线 — 系统性重构规格说明书（v2.0 Refactor Spec）

> **文档用途**：供 **Astra** 执行 P0 → P3 系统性重构的唯一权威设计与工程规格文档。重构完成后，**前端视觉表现、打击感特效、UI 美术与音效质感**将由后续独立的前端优化阶段（Frontend Polish Pass）接手深化。
>
> **核心铁律**：
> 1. **目标定位**：真正融合 **《向僵尸开炮》**（高密度尸潮割草、高频三选一质变构筑、元素化学反应超武、防线危机冲击波、局外机制型词条）与 **《植物大战僵尸》**（后排向日葵式产能经济、前排战场内可建造防御工事/陷阱、鲜明敌人弱点与克制反制）。
> 2. **严格零主动技能**：不加入任何手动瞄准、手动释放大招、手点炸弹/回血按钮。所有战斗攻击与防线保命冲击波均为**自动/被动触发**；玩家只负责**选牌、合成、排阵、建造前线工事、切换防御塔索敌优先级**。
> 3. **保留 10× 倍速**：速度档位严格保持 `1× / 1.5× / 3× / 10×`，所有速度共用固定 `STEP = 1/60` 确定性步长，便于快速测试与高倍速游玩。
> 4. **纯静态零依赖**：维持 Vanilla ES Modules、无运行时外部依赖/API、纯 JSON 可序列化状态、Node 内置测试 (`npm test`) 与单文件打包 (`npm run build`) 架构。
> 5. **为后续前端优化留好干净接口**：所有模拟逻辑严格留在 `src/engine.js`、`src/data/*`、`src/systems/*`，通过结构化 `state` 与 `events` 输出给渲染层和 UI 层；本阶段 UI/渲染以**功能完备、交互无冲突、结构干净**为首要标准。

---

## 目录

1. [重构总览与 P0→P3 实施路线](#1-重构总览与-p0p3-实施路线)
2. [战场坐标系与前线工事区设计（PvZ 融合核心）](#2-战场坐标系与前线工事区设计pvz-融合核心)
3. [局内经济系统与产能单位（向日葵体系）](#3-局内经济系统与产能单位向日葵体系)
4. [核心数值重构：英雄、基础塔、15 种化学反应混合塔](#4-核心数值重构英雄基础塔15-种化学反应混合塔)
5. [索敌优先级系统与被动防线保命机制](#5-索敌优先级系统与被动防线保命机制)
6. [高密度尸潮节奏、敌人反制重做与出击校准](#6-高密度尸潮节奏敌人反制重做与出击校准)
7. [局外成长重构（军械库机制词条）](#7-局外成长重构军械库机制词条)
8. [状态结构、存档迁移与事件契约（含前端对接规范）](#8-状态结构存档迁移与事件契约含前端对接规范)
9. [基线前端修复清单与代码减负要求](#9-基线前端修复清单与代码减负要求)
10. [平衡验收标准与自动化测试清单](#10-平衡验收标准与自动化测试清单)

---

## 1. 重构总览与 P0→P3 实施路线

### 必须彻底解决的 v1 遗留顽疾

| 问题编号 | v1 现状与实测证据 | v2 重构目标 |
| --- | --- | --- |
| **BUG-01 英雄独大** | 0 塔 0 合成单英雄可通关 Easy/Normal/Hard（英雄包揽 66%~99.8% 击杀）；隐藏 `2 HP/s` 栅栏回血抹平压力 | 削弱英雄初始白字与射程，改为“质变触发主炮”；删除隐藏回血；单英雄不造塔在 Normal 第 10~15 波内必败 |
| **BUG-02 混合塔负收益** | 15/15 混合塔单体 DPS 低于双亲本之和；混合后锁死升阶；`recipes.js` 与 `towers.js` 两套缩放代码分裂 | 统一单一缩放公式；所有 1 阶混合塔综合战力 ≥ 双亲本之和 ×1.25；允许用亲本基础塔为混合塔升阶 |
| **BUG-03 沉睡机制墓地** | `stun`、`brittle`、`execute`、`multishot`、`fence_focus`、`state.clouds`、`advanceEnemyShot`、`statusResist` 全部实现但 0 使用 | 全部 8 套机制正式接入英雄、混合塔、前线工事与敌人数据表 |
| **BUG-04 战场屏保化** | 14 分钟仅 410 只怪，63.4% 时间同屏 ≤3 只怪；11 个短出击未校准导致 Normal 85 秒暴毙 | 主线缩至 **6.5~8 分钟**，总怪量提至 **1,100~1,400 只**，同屏常态 10~18 只、尸潮峰值 30~50 只；重校全部短出击 |
| **BUG-05 反制脱节** | 文案喊“先打旗手/奶妈/护卫”，代码死锁打最近；虚化/跳跃无反制出口，触发 11 次 `combat-stalled` | 新增 4 档索敌优先级；前线工事精准反制跳跃/虚化/自爆；改造 Leaper/Shade/Spitter |
| **BUG-06 UX 与代码臃肿** | 战斗内 XP 条被 `.hud-quiet` 隐藏；点英雄误触合成报错；首屏看不到开始按钮；4 处重复 i18n 表 | 修复全部交互冲突与 HUD 信息缺失；收敛单一 i18n 与单一缩放数据源，删除死代码 |

### 推荐执行顺序

- **Phase P0（核心骨架与数值地基）**：更新 `shared.js` / `state.js` / `engine.js` → 重构 `hero.js`、`towers.js`、`recipes.js`、`merges.js`、`drafts.js` → 移除隐藏回血、接入 8 套沉睡机制与元素反应。
- **Phase P1（PvZ 阵型经济 + 策略反制 + 尸潮波次）**：新增 `field-units.js` 与 `systems/field.js`（战场内前线工事）→ 新增 `harvest` 经济塔与 `energy` 经济循环 + 三选一重随 → 新增 4 档索敌与被动防线冲击波（`fence_surge`）→ 重做 `enemies.js`、`waves.js`、`expeditions.js`。
- **Phase P2（基线交互修复、事件契约与持久化）**：升级 `storage.js`（v2 存档校验与 v1 自动兼容/迁移）→ 补齐完整事件流 → 修复 `boot.js`、`shell.js`、`build-panel.js`、`meta-panel.js`、`renderer.js` 的核心交互与显示（经验条/辉光条/前线工事建造/索敌切换/主菜单首屏/移除重复选格面板/补全中文化）。
- **Phase P3（局外词条、平衡验证与代码瘦身）**：重做 `progression.js` 机制型装备与 4 条永久成长 → 更新 `scripts/balance.mjs` 适配新系统并跑通平衡矩阵 → 清理重复 i18n 与死代码 → 更新测试套件并运行 `npm test` + `npm run build`。

---

## 2. 战场坐标系与前线工事区设计（PvZ 融合核心）

### 2.1 逻辑画布分区（保持 `360 × 640` 竖屏）

```
y =   0 ~  48   顶部出怪边界 / 天际线（spawnY = -16）
y =  48 ~ 388   主行军区（敌人中心化截断正态分布出生 + 平滑横向漂移，无离散分路）
y = 388 ~ 496   【新增】前线工事区（2 排 × 5 格 = 10 个战场工事位 fieldSlots，位于栅栏上方！）
                  ├─ 外排（fieldIndex 5..9）：中心 y = 414（伏击/先锋排）
                  └─ 内排（fieldIndex 0..4）：中心 y = 468（护墙/贴防排）
y = 512         共享主栅栏（ARENA.fenceY = 512）
y = 532 ~ 638   后方防御台（2 排 × 5 格 = 10 个防守槽位 slots，敌人永不攻击此处）
                  ├─ 前排（slotIndex 0..4）：中心 y = 560（火力前排，英雄初始在 slot 2）
                  └─ 后排（slotIndex 5..9）：中心 y = 612（后排高地：产能塔 +30% 收益）
```

### 2.2 `ARENA` 新增几何常量（`src/shared.js`）

保留现有 `slotGeometry(index)`（0..9，后方 2×5 防守台）不变，新增前线工事位常量与函数：

```js
export const FIELD_GRID = Object.freeze({
  rows: 2,
  cols: 5,
  slotWidth: 52,
  slotHeight: 40,
  pitchX: 60,        // x = 60, 120, 180, 240, 300（覆盖 x: 34..326）
  startX: 60,
  innerY: 468,       // row 0: fieldIndex 0..4（贴近栅栏）
  outerY: 414,       // row 1: fieldIndex 5..9（前沿）
});
```

导出纯函数：
- `fieldSlotGeometry(fieldIndex)` → `{ index, row, col, x, y, left, top, width, height }`
- `hitFieldSlot(x, y)` → `0..9` 或 `-1`

### 2.3 三种前线战场防御单位（新增 `src/data/field-units.js`）

全部可建造在 `state.fieldSlots[0..9]` 中（位于栅栏上方），**消耗局内经济 `state.energy`（辉光）**，每种自带独立建造冷却（类似 PvZ 植物卡片冷却），**无主动攻击技能**：

| ID | 中英文名 | 类型 | 辉光花费 | 建造冷却 | 生命/耐久 | 核心机制与 PvZ 策略反制 |
| --- | --- | --- | --- | --- | --- | --- |
| `bulwark` | 铁棘壁 / Iron Bulwark | 阻挡工事（类高坚果） | `35` | `5.0s` | `300 HP`（护甲 `0.15`） | **拦截敌人**：碰撞到该格的敌人停步转而啃咬铁棘壁；每次被啃反弹 `10` 点伤害（荆棘）。**精准反制**：① 空中跃过的 `Ash Leaper` 撞壁坠落，受到 `25` 伤害并**眩晕 `1.2s`**；② `Cinder Charge` 撞壁后改炸铁棘壁，保护主栅栏；③ 拦截 `Sap Spitter` 射向该列区域的酸液弹！ |
| `spikes` | 碎骨地刺 / Thorn Strip | 地面陷阱（类地刺） | `30` | `4.0s` | `160` 耐久 | **不可被敌人啃咬**，敌人从上方踩过时每 `0.4s` 触发一次：`14` 伤害（无视 50% 护甲）+ 轻减速（`factor: 0.78`, `1.0s`）。每次触发消耗耐久（普通怪 `1.5`、蛮兽/首领 `6`）。**精准反制**：**对虚化中的 `Fence Shade` 照常造成 60% 伤害**，且极度克制高密度 `Dust Gnawer` 虫群！ |
| `flare` | 耀光灯塔 / Reveal Brazier | 辅助工事（类路灯花） | `45` | `6.0s` | `140 HP`（护甲 `0`） | 脆弱结构，碰撞敌人会攻击它（**经典 PvZ 配合：外排放 `bulwark` 抗伤，内排放 `flare` 保护**）。持续散发 `115px` 半径光域：每 `0.5s` 对范围内敌人施加 **`revealed`（破除 `Fence Shade` 虚化无敌）** + **`brittle`（易伤 `+20%`, `1.2s`）** + 轻减速（`factor: 0.85`, `1.0s`）。 |

### 2.4 前线工事行为规则（新增 `src/systems/field.js`）

1. **建造 (`deployFieldUnit(state, kind, fieldIndex)`)**：
   - 仅当 `canPlan(state)` 且目标 `fieldSlots[fieldIndex].unit === null` 且 `state.energy >= cost` 且 `state.fieldCooldowns[kind] <= 0` 时允许建造。
   - 扣除 `energy`，重置 `fieldCooldowns[kind]`，放入 `{ id, kind, hp, maxHp, armor, rank: 1, timer: 0, kills: 0 }`，触发 `field_build` 事件。
2. **拆除 (`removeFieldUnit(state, fieldIndex)`)**：
   - `canPlan(state)` 时允许移除已有工事，按当前剩余血量比例返还最多 **50%** 建造成本（`Math.floor(cost * 0.5 * (hp / maxHp))`），触发 `field_remove` 事件。
3. **碰撞与拦截（在 `movement.js` 与 `combat.js` 中协同）**：
   - 仅当工事 `blocksMovement === true`（`bulwark`、`flare`）时阻挡敌人。
   - 判定：敌人进入 `|enemy.x - pad.x| <= pad.width * 0.5 + enemy.radius * 0.5` 且 `enemy.y + enemy.radius >= pad.top` 且 `enemy.y <= pad.top + pad.height * 0.5` 时，敌人在 `pad.top - enemy.radius` 停步，记录 `enemy.blockedByFieldId = unit.id`，改为按 `enemy.attackInterval` 攻击该工事（并触发 `bulwark` 的荆棘反伤）。
   - 工事血量归零时销毁，发出 `field_destroy` 事件，释放被阻挡的敌人继续推进。
   - **硬规则不变**：主防线后方 `slots[0..9]` 的英雄与防御塔仍然无血量、永不受击；主栅栏血量归零仍是唯一失败条件。

---

## 3. 局内经济系统与产能单位（向日葵体系）

### 3.1 局内经济资源 `state.energy`（辉光 / Sun-Energy）

- **初始值**：`45`（受局外加成影响，上限 `999`）。
- **来源**：
  - 基础自然恢复：`2.0 / 秒`（仅在 `playing` 未暂停时增长，保证不造经济塔也有基础参与感）。
  - 击杀掉落：虫群 `+1`、普通/突进/跃袭/虚化 `+2`、重甲/喷者/裂巢/治疗/旗手/护卫/爆弹/静场 `+4`、蛮兽 `+6`、首领 `+35`。
  - 尸潮大波（`horde: true`）启动或清完奖励：`+15`。
  - **产能单位 `harvest`（辉穗 / Sun Gleaner）周期产出**（核心来源）。
- **消耗出口（纯策略建造与构筑，零主动战斗技能）**：
  1. 建造前线战场工事（`bulwark` 35 / `spikes` 30 / `flare` 45）。
  2. **三选一重随（Draft Reroll）**：在 `phase === 'draft'` 时，玩家可点击重随刷新 3 张新牌。单次三选一内费用递增：`20 → 35 → 50`（每次三选一最多重随 3 次；局外词条可提供每局前 1~2 次免费重随）。

### 3.2 第 7 种基础单位：`harvest`（辉穗 / Sun Gleaner，向日葵定位）

- `BASE_TYPES` 扩展为：`['bolt', 'fire', 'frost', 'lightning', 'poison', 'support', 'harvest']`。
- **职责**：纯经济与后勤单位，**不发射攻击弹道（`damage: 0`）**——占用一个宝贵格子换取滚雪球发育，还原 PvZ “贪向日葵 vs 补战力”的经典博弈！
- **周期产出（Rank 1 → Rank 4）**：

| 阶数 | 名称概念 | 产出周期 | 每次产出辉光 (`energy`) | 每次产出经验 (`xp`) | 维护修复前线最残血工事 |
| --- | --- | --- | --- | --- | --- |
| Rank 1 | 辉穗 | `5.0s` | `+12` | `+2` | `0` |
| Rank 2 | 双生辉穗 | `4.6s` | `+26` | `+5` | `+20 HP` |
| Rank 3 | 辉光尖塔 | `4.2s` | `+52` | `+10` | `+45 HP` |
| Rank 4 | 曜阳核心 | `3.8s` | `+95` | `+18` | `+85 HP` |

- **后排专属加成（PvZ 阵型位置策略）**：
  - 当 `harvest` 位于 **后排（`slot.row === 1`，格子 5..9）** 时，辉光与经验产出额外 **`+30%`**！
  - 当位于前排（`slot.row === 0`）时，仅基础收益（UI 与图鉴明确提示“建议置入后排获得 +30% 收益”）。
- **合成规则**：
  - 同阶 `harvest + harvest` 升阶（`R1 → R4`）。
  - **不参与** 15 种战斗混合配方（防止配方爆炸，保持 6 战斗基础塔 × 15 混合配方清晰易记）。
  - 每次三选一若棋盘有空位且场上尚无 `harvest`，在前 4 次整备中提高 `harvest` 出现权重，确保玩家早期就能体验经济流派。

---

## 4. 核心数值重构：英雄、基础塔、15 种化学反应混合塔

### 4.1 英雄重定位：`src/systems/hero.js`（从“单通战神”改为“《向僵尸开炮》主炮核心”）

1. **基础属性调整（`HERO_BASE`）**：
   - `damage: 14`（原 `26`）
   - `interval: 0.65`（原 `0.60`，基础 DPS 从 `45.9` 降至 `23.2`）
   - `range: 320`（原 `430`，不再从最顶出生线白嫖全场，但仍覆盖前中场与前线工事区）
   - `critChance: 0.08`, `critMultiplier: 1.75`, `projectileSpeed: 540`
2. **重做 8 项局内英雄质变升级（`HERO_UPGRADES`）**：
   取消纯无聊的射程白字，改为类似《向僵尸开炮》的流派进化词条：

| ID | 中英文名 | 上限 | 每级效果（带机制质变） |
| --- | --- | --- | --- |
| `volley` | 齐射扩容 / Split Volley | 2 | **启用 `multishot`**：每级增加 `1` 发额外弹道（1 级双发、2 级三发，分别瞄准射程内顺位目标） |
| `strike` | 重膛装药 / Heavy Bore | 4 | 伤害 `+5`；暴击时附带 `18px` **击退**（非首领） |
| `cadence` | 速射机匣 / Rapid Loader | 4 | 攻速 `+14%` |
| `pierce` | 穿甲弹芯 / Armor Core | 2 | 贯穿 `+1`；无视敌人 `25%` 护甲（2 级无视 50%） |
| `shrapnel` | 温压破片 / Thermobaric | 3 | 赋予溅射半径 `30 + 10*(lvl-1)` 与燃烧 `{dps: 4*lvl, duration: 2.6}` |
| `frostbite` | 急冻弹头 / Cryo Rounds | 3 | 赋予减速 `{factor: 0.76 - 0.06*(lvl-1), duration: 2.2}` 与 **`brittle` 易伤 `{power: 0.10*lvl, duration: 2.6}`** |
| `focus` | 弱点锁定 / Kill Switch | 3 | 暴击率 `+10%`、暴击倍率 `+0.30`；**2 级起解锁 `execute`（≤40% 血目标伤害 ×1.35）** |
| `bastion` | 堡垒工程 / Bastion Ward | 2 | 主栅栏上限 `+80`（并等量回复当前生命）；**防线冲击波（Fence Surge）伤害与击退 `+35%`**，且前线工事血量上限 `+20%` |

### 4.2 六种战斗基础塔重调（`src/data/towers.js`）

- **统一升阶缩放表 `RANK_SCALE`（唯一数据源，同时服务基础塔与混合塔）**：
  - `damage: [1, 2.25, 4.6, 9.2]`（2 座 R1 合 1 座 R2 增益约 `+25%` 总输出 + 省 1 格，不再 12× 失控）
  - `interval: [1, 0.91, 0.83, 0.76]`
  - `rangeAdd: [0, 16, 32, 48]`
  - `effect (burn/poison dps): [1, 2.0, 3.8, 7.2]`
  - **严格删除** `src/data/recipes.js` 中未使用的 `scaleHybridStats`、`getHybridStats`、`rankDamageMultiplier`，彻底消除双套缩放分裂！
- **所有基础塔射程抬升至 `275~315`**，保证后排（`y=612`）依然覆盖栅栏前 `175~215px`（涵盖全部两排前线工事与主交战区）：

| ID | 名称 | 1 阶伤害 | 间隔 | 射程 | 核心机制与改动 | 默认索敌 |
| --- | --- | --- | --- | --- | --- | --- |
| `bolt` | 穿钉 | `13` | `0.68s` | `295` | `pierce: 1`, `crit: 16% / 1.85×`（高速点杀贯通） | `foremost` |
| `fire` | 烬火 | `11` | `0.98s` | `280` | `splash: 42`, `burn: {dps: 5, duration: 2.8}`（群伤灼烧） | `foremost` |
| `frost` | 霜结 | `9` | `0.85s` | `290` | `splash: 24`（新增小范围溅射！）, `slow: {factor: 0.64, duration: 2.4}` | `foremost` |
| `lightning` | 弧雷 | `12` | `1.10s` | `315` | `chain: 2`, `chainRange: 92`, **`stun: {duration: 0.25}`（20% 概率短暂麻痹，或每第 3 击必晕）** | `priority` |
| `poison` | 瘴毒 | `6` | `0.78s` | `285` | `poison: {dps: 3.5, duration: 4.5, maxStacks: 4}`, `armorPen: 0.35`（专克重甲与蛮兽） | `strongest` |
| `support` | 旌旗 | `6` | `1.05s` | `280` | `aura: {range: 120, damage: 0.14, haste: 0.10}`（覆盖 8 邻格含对角）；普攻附带 `brittle: {power: 0.10, duration: 2.0}` | `priority` |

### 4.3 15 种混合塔彻底重构：正收益 + 化学反应 + 亲本升阶（`src/data/recipes.js` & `src/systems/merges.js`）

#### 两大硬规则

1. **正收益红线**：每座 1 阶混合塔的综合输出/控制价值必须 **≥ 双 1 阶亲本之和 × 1.25**（单测直接断言检验！）。
2. **亲本升阶规则（`merges.js` 新增）**：
   - 同型同阶合并：`A(R) + A(R) → A(R+1)`（基础塔、相同混合塔、`harvest` 均适用，最高 4 阶）。
   - 不同战斗基础塔同阶合并：`A(R) + B(R) → Hybrid(A,B, R)`（1 阶混合塔本身数值已按“双亲本融合强化”标定）。
   - **【新增】混合塔亲本升阶**：`Hybrid(A,B, R) + A(R)` 或 `Hybrid(A,B, R) + B(R)` → **`Hybrid(A,B, R+1)`**（`R < 4`，支持双向拖拽，目标格保留混合塔并升阶！）。这让玩家合出混合塔后，后续再抽到任一亲本基础塔都能继续把混合塔拉满到 4 阶！

#### 15 种化学反应混合塔完整规格（全部启用沉睡机制）

| ID | 配方 | 中英文名 | 1 阶基础数值（伤害 / 间隔 / 射程） | 专属化学反应与机制（`mechanics` 全部实装） | 默认索敌 |
| --- | --- | --- | --- | --- | --- |
| `cinderbolt` | `bolt+fire` | 烬矢 / Cinderbolt | `22 / 0.66s / 300` | `pierce: 2`, `burn: {dps: 7, dur: 2.8}`, **`armorPen: 0.45`**（穿甲火线，撕裂板甲队列） | `foremost` |
| `hailspike` | `bolt+frost` | 雹针 / Hailspike | `19 / 0.72s / 300` | `pierce: 2`, `slow: {factor: 0.56, dur: 2.5}`, **`brittle: {power: 0.25, dur: 3.0}`**（整列挂易伤） | `foremost` |
| `arcbolt` | `bolt+lightning` | 弧矢 / Arcbolt | `18 / 0.80s / 315` | `chain: 3 (96px)`, `crit: 26% / 2.0×`, **`multishot`**（双发暴击连锁电弧） | `foremost` |
| `venomspine` | `bolt+poison` | 毒脊 / Venomspine | `16 / 0.65s / 295` | `pierce: 2`, `poison: {dps: 3.8, dur: 4.5, maxStacks: 5}`, **`execute`**（贯通叠毒 + 残血斩杀） | `weakest` |
| `watchpost` | `bolt+support` | 哨卫 / Watchpost | `24 / 0.75s / 380` | `crit: 30% / 2.2×`, **`execute`**, `aura: {range: 135, dmg: 0.14, haste: 0.08}`（全图高危狙击手） | `priority` |
| `scald` | `fire+frost` | 蒸灼 / Scald | `18 / 1.00s / 285` | `splash: 54`, `burn: {dps: 6, dur: 2.8}`, `slow: {factor: 0.50, dur: 2.5}`, **`thermalShock: 0.45`**（命中已减速或燃烧目标触发 +45% 蒸汽爆破并挂 `brittle 0.20`） | `foremost` |
| `wildfire` | `fire+lightning` | 野火 / Wildfire | `18 / 0.96s / 295` | `splash: 46`, `chain: 2 (88px)`, `burn: {dps: 8, dur: 3.0}`, **`stun: {duration: 0.35}`**（连锁轰炸打断引线/施法） | `foremost` |
| `blight` | `fire+poison` | 疫焚 / Plaguefire | `14 / 1.05s / 285` | `splash: 54`, `burn: {dps: 5, dur: 3.2}`, `poison: {dps: 3.2, dur: 4.8, maxStacks: 4}`, **`corpseExplode: {radius: 52, hpRatio: 0.22}`**（燃烧或中毒目标死亡时尸爆，传染 1 层毒并造成 22% 最大生命溅射伤害！） | `foremost` |
| `pyre` | `fire+support` | 烽坛 / Pyre | `17 / 1.02s / 290` | `splash: 44`, `burn: {dps: 7, dur: 3.0}`, **`fence_focus`**, `revealRadius: 48`（命中区短暂显隐虚化怪）, `aura: {range: 145, dmg: 0.18, haste: 0.06}` | `foremost` |
| `shatter` | `frost+lightning` | 霜裂 / Shatter | `17 / 0.92s / 305` | `chain: 3 (100px)`, `crit: 22% / 2.0×`, `slow: {factor: 0.56, dur: 2.2}`, **`stun: {duration: 0.55}`**（核心群控眩晕连锁） | `priority` |
| `miasma` | `frost+poison` | 瘴雾 / Miasma | `11 / 1.15s / 285` | `splash: 48`, **`cloud: {radius: 62, duration: 4.0, tick: 0.5, dps: 6}`**（正式写入 `state.clouds`！云内持续减速 `0.56` + 叠毒 + `brittle 0.20`，且可伤到虚化怪） | `foremost` |
| `glacierward` | `frost+support` | 霜垣 / Glacierward | `15 / 0.95s / 290` | `splash: 38`, `slow: {factor: 0.45, dur: 2.8}`, **`knockback: 22`**（击退非首领敌人）, **`fence_focus`**, `aura: {range: 150, dmg: 0.10, haste: 0.15}` | `foremost` |
| `catalyst` | `lightning+poison` | 触媒 / Catalyst | `15 / 0.90s / 305` | `chain: 3 (108px)`, `poison: {dps: 3.5, dur: 4.0, maxStacks: 5}`, **`poisonDetonate: 0.18`**（目标每层毒使其受到本次命中伤害额外 `+18%`） | `strongest` |
| `relay` | `lightning+support` | 继电 / Relay | `15 / 0.88s / 300` | `chain: 2 (90px)`, **`multishot`**, `aura: {range: 152, dmg: 0.08, haste: 0.20}`（高速齐射增幅核心） | `priority` |
| `cultivator` | `poison+support` | 培育 / Cultivator | `13 / 0.92s / 290` | `poison: {dps: 4.5, dur: 5.2, maxStacks: 6}`, **`brittle: {power: 0.30, dur: 3.5}`**, `armorPen: 0.40`, `aura: {range: 138, dmg: 0.15, haste: 0.08}`（Boss 融化器） | `strongest` |

### 4.4 战斗核心新机制实装要点（`src/systems/combat.js`）

- **`state.clouds` 真正运行**：在 `updateCombat` 中新增 `updateClouds(state, dt)`，推进云雾寿命（上限 `MAX_CLOUDS = 24`），每 `cloud.tick` 秒对半径内活体敌人（**含虚化 `phased` 敌人**）结算伤害与状态（`slow`/`poison`/`brittle`），过期移除。
- **`armorPen`（护甲穿透）**：`effectiveArmor = armor * (1 - clamp(armorPen, 0, 1))`。
- **`knockback`（击退）**：将非死亡敌人 `y` 向上推回 `knockback * (isBoss ? 0.2 : 1)`，夹紧到 `[8, stopY]`，重置 `attacking = false`，触发 `knockback` 事件。
- **`corpseExplode`（尸爆）**：在 `killEnemy` 中若敌人带有 `corpseExplode` 标记（或击杀来源带该特性）且未递归触发过（用 `options.fromExplode !== true` 防止无限死循环），对半径内活体敌人造成 `min(260, enemy.maxHp * hpRatio)` 溅射伤害并传播 1 层毒，触发 `corpse_explode` 事件。
- **`thermalShock` / `poisonDetonate`**：在 `impactDamage` 中读取目标当前状态，触发元素反应乘区并附带 `reaction: 'steam' | 'catalyst'` 字段到 `hit` 事件中（方便前端做炫酷反应弹窗！）。
- **彻底删除隐藏栅栏回血**：删除 `engine.js` 中对 `regenerateFence` 的无条件调用（将 `FENCE_REGEN_PER_SECOND` 置 0 或改为仅由显性局外词条/波次通关奖励触发）。

---

## 5. 索敌优先级系统与被动防线保命机制

### 5.1 防御塔索敌优先级（零主动技能下的核心战术指挥）

- 每个非 `harvest` 单位（含英雄）拥有字段 `unit.targeting`，取值枚举：
  - `'foremost'`（默认：最靠近防线，最大 `y`）
  - `'priority'`（高危优先：优先 `ENEMIES[kind].priority === true` 的敌人——即 `mender`、`banner`、`warden`、`hush`、`charge`、`spitter`，同类再按最大 `y`）
  - `'strongest'`（重甲/高血优先：最大当前 `hp`，同血按最大 `y`）
  - `'weakest'`（残血收割：最小 `hp / maxHp`，同比例按最大 `y`）
- 玩家在战斗中随时（运行或暂停皆可）可通过 `api.act('setTargeting', { index, mode })` 切换任意防守单位的索敌模式（支持一键循环切换）。
- 仅 `selectTarget(state, origin, range, targeting, ignore)` 替代旧的单一 `nearestEnemy`，严格保持确定性（最终平手按 `String(id)` 排序）。

### 5.2 低频自动保命机制：防线冲击波（`state.surge` — PvZ 小推车 × 向僵尸开炮防线脉冲）

- **数据结构**：
  ```js
  state.surge = {
    charges: 1,         // 初始 1 次；局外装备/永久升级可增至 2 次
    maxCharges: 1,
    shieldTimer: 0,     // > 0 时主栅栏免疫所有伤害（3.0s）
    cooldown: 0,        // 两次自动触发间最少间隔 10.0s
    thresholdsUsed: []  // 记录已触发的血线（如 0.5、0.2）
  };
  ```
- **纯自动触发条件**（严禁加手动触发按钮！）：
  在 `biteFence` 结算栅栏扣血时检查：若 `state.surge.charges > 0 && state.surge.cooldown <= 0` 且满足以下任一条件，立即触发 `triggerFenceSurge(state)`：
  1. 本次受击后栅栏将归零（**致命一击保底**）：将 `fence.hp` 锁在 `Math.max(1, Math.round(fence.maxHp * 0.12))` 后触发；
  2. 栅栏血量比例首次跌破 `0.50`（或拥有 2 次充能时首次跌破 `0.20`）。
- **冲击波效果**：
  - `charges -= 1`，`shieldTimer = 3.0`，`cooldown = 10.0`。
  - 横扫 `y >= ARENA.fenceY - 240` 的全部活体敌人：
    - 非首领：`swarm` 或 `hp/maxHp <= 0.18` 直接秒杀；其余造成 `110 * surgePower` 无视护甲伤害 + 击退 `150px` + 眩晕 `1.6s` + 熄灭 `Cinder Charge` 引线！
    - 首领：造成 `Math.min(450, enemy.maxHp * 0.08)` 伤害 + 击退 `45px` + 眩晕 `0.5s`。
  - 发出 `{ type: 'fence_surge', y: ARENA.fenceY, reach: 240, chargesLeft, shieldDuration: 3.0 }` 事件。

---

## 6. 高密度尸潮节奏、敌人反制重做与出击校准

### 6.1 敌人特性重做（`src/data/enemies.js`）

1. **下调普通小怪血量以支撑高密度割草感**（参考基准，可结合平衡脚本微调）：
   - `shambler`: `hp: 52`, `speed: 30`, `damage: 7`, `xp: 1`
   - `runner`: `hp: 32`, `speed: 62`, `damage: 5`, `xp: 1`
   - `swarm`: `hp: 14`, `speed: 52`, `damage: 2.5`, `xp: 0.5`（允许小数 XP 或每只 `1` 并提高 `draftXpCost` 比例，建议保持整数 `xp: 1` 并调整 `draftXpCost` 曲线更干净！）
   - `armored`: `hp: 165`, `armor: 0.55`, `speed: 25`, `damage: 11`, `xp: 3`
   - `brute`: `hp: 560`, `armor: 0.15`, `speed: 19`, `damage: 26`, `xp: 6`
   - `boss`: `hp: 3600`, `armor: 0.20`, `speed: 16`, `damage: 28`, `xp: 30`, **新增 `statusResist: { slow: 0.5, stun: 0.65 }`**
2. **修复 3 个反体验敌人机制 + 标记 `priority: true`**：
   - `spitter`（腐浆喷者，`priority: true`）：**正式配置 `attackRange: 135`, `projectileSpeed: 190`**。走到距栅栏 `135px` 处停步喷射酸液弹（走 `advanceEnemyShot`），若弹道经过 `bulwark` 铁棘壁则被铁棘壁拦下！
   - `leaper`（灰跃者）：移除“平时全程无敌”的离谱设定（`crouchOnly` 废除！）。改为正常行进与蹲下均可被射击，仅在 `0.35s` 空中起跳段短暂不可选中；跃过 `bulwark` 时被高墙撞停眩晕 `1.2s`。
   - `shade`（栅影）：调整为 `phase: { open: 1.4, shut: 1.4 }`；处于 `flare`（耀光灯塔）或 `pyre` 显隐区时 `enemy.revealed = true` 强制可选中；未显隐时仍受地刺与云雾伤害（彻底消除 `combat-stalled`）。
   - 为 `mender`、`banner`、`warden`、`charge`、`hush`、`spitter` 全部加上 `priority: true` 标签，并把 `banner` 加速倍率从离谱的 `3×`（`haste: 2`）调为清晰可控的 `1.75×`（`haste: 0.75`）。

### 6.2 主线战役节奏重做：`The Long Watch / 长夜守望`（`src/systems/waves.js`）

- **目标总时长（1× 速）**：**400 ~ 470 秒（约 6.5 ~ 7.8 分钟）**（清完最终 Boss）。
- **节奏曲线（4 幕 + 3 次旗帜大波尸潮 + 2 次 Boss）**：
  - **0:00 ~ 1:30（开局立阵）**：第 1 波 6 只灰烬蹒者，约 **14~18 秒**触发首次三选一；第 2~5 波引入线驰者与虫群，鼓励玩家决定是否后排种 `harvest` 或前线放 `bulwark`/`spikes`。
  - **1:50 ~ 2:15（第一波旗帜大尸潮 `horde: true`）**：旗孽领队 + 25+ 虫群/步兵/突进密集冲锋，检验群体清屏（溅射/连锁/地刺）能力。
  - **2:20 ~ 3:50（特性反制期 + 中期小首领）**：分批引入 `spitter`（远程）、`armored`（重甲）、`leaper`（跃袭）、`shade`（虚化）、`splitter`（裂变）；**3:35 次冠首领（0.45× HP）** 登场。
  - **4:00 ~ 5:45（第二波旗帜大尸潮 + 复合高压）**：`mender`、`warden`、`charge`、`hush` 与 `brute` 混编，强烈检验**索敌切换（`priority`）+ 混合塔化学反应 + 前线工事拦截**。
  - **6:00 ~ 6:45（终局尸潮 + 最终首领 冠裂兽）**：先来一波高密度先锋潮，**6:20 最终冠裂兽**带护卫进场，约 **7:10 ~ 7:40** 决战通关，通关后依然提供**无尽模式（Endless）**。
- **高频三选一经验曲线（`draftXpCost`）**：
  - 配合提高后的总怪量（Normal 全程总击杀 XP ~1,400~1,700，不含经济塔额外 XP），调整 `draftXpCost(n)` 使普通打法整局自然触发 **24~28 次三选一**（首次 `6 XP`，前期每 12~18 秒一次，中后期每 18~24 秒一次；经济流种 2 座 `harvest` 可达 30~35 次！）。

### 6.3 短出击（`src/data/expeditions.js`）全面校准

- 将 11 个短出击统一精简/校准为 **2.5 ~ 3.5 分钟高节奏挑战关**（或保留全部 11 个但全部跑通 `balance.mjs` 验收）：
  - **必须修复** `wires` 第 20 秒 `healthScale: 3` 的离谱错误（改为 `healthScale: 1.0` 靠数量而不是单怪肉度压迫）。
  - 所有短出击开局给予 `energy: 60` 与略低的 `draftXpCost` 系数（如 `0.75×`），确保 3 分钟内也能体验 10~14 次三选一并合出混合塔！

---

## 7. 局外成长重构（军械库机制词条）

重构 [src/systems/progression.js](file:///home/antigravity/Chuqonu/fencefall/src/systems/progression.js)，打破“只强化英雄 +2% 白字”的沉闷感：

### 7.1 装备系统（3 槽位：`weapon` / `charm` / `armor`，共 9 件，含机制词条！）

所有装备的数值加成改为**同时作用于英雄与全部防御塔（或指定体系）**，且高端装备附带《向僵尸开炮》式玩法词条：

| 槽位 | ID | 名称 | 价格 | 效果（数值 + 机制词条） |
| --- | --- | --- | --- | --- |
| 武器 | `splinter_bow` | 裂片弓 | `60` | 全队伤害 `+6%` |
| 武器 | `kinetic_core` | 动能弹芯 | `150` | 全队伤害 `+5%`、全队暴击率 `+4%`；**暴击附加 `8px` 轻击退** |
| 武器 | `prism_lens` | 棱镜核心 | `300` | 全队伤害 `+8%`、**所有混合塔额外 `+14%` 伤害**、每局前 2 次三选一重随免费 |
| 护符 | `runner_charm` | 奔行护符 | `55` | 全队攻速 `+6%` |
| 护符 | `sun_spindle` | 辉光纺锤 | `145` | 开局额外 `+35` 辉光、`harvest` 产能塔收益 `+20%` |
| 护符 | `bounty_seal` | 赏金印 | `260` | 结算货币 `+15%`、全队暴击率 `+3%`、三选一重随费用 `-25%` |
| 护甲 | `fence_nails` | 栅栏钉 | `50` | 开局主栅栏生命 `+40`、前线工事生命 `+15%` |
| 护甲 | `vanguard_kit` | 先锋工事箱 | `140` | 前线工事造价 `-15%`、生命 `+25%`、`bulwark` 反伤 `+5` |
| 护甲 | `surge_capacitor` | 脉冲电容 | `280` | **防线冲击波（Fence Surge）充能上限 `+1`（共 2 次）**、冲击波伤害 `+25%` |

### 7.2 永久成长（4 条轨道，均设严格上限，0 局外也能通关标准难度）

- `damage`（全队火力，5 级）：每级全队伤害 `+3%`
- `haste`（全队装填，5 级）：每级全队攻速 `+3%`
- `vitality`（防线加固，5 级）：每级主栅栏 `+18 HP`、前线工事生命 `+6%`
- `economy`（后勤补给，5 级）：每级开局辉光 `+10`、自然辉光恢复 `+0.25/s`

> **注意兼容性**：`createProfile` 与 `storage.js` 需兼容旧存档（缺少 `economy` 字段或旧装备 ID 如 `hawk_brace`/`stormglass_edge`/`survey_bead`/`ward_planks`/`bastion_mail` 时，做平滑映射或原价折算退还货币，不直接报错丢档）。

---

## 8. 状态结构、存档迁移与事件契约（含前端对接规范）

### 8.1 `state` 新增/变更字段（`src/state.js` & `src/storage.js`）

将 `CONTRACT_VERSION` 升级为 **`2`**（`storage.js` 导入/读取 v1 存档时自动迁移 profile，对不兼容的旧进行中 v1 run 返回安全重置提示而不崩溃）：

```js
// Run state 新增核心字段（全部纯 JSON 可序列化）
{
  version: 2,
  energy: 45,
  maxEnergy: 999,
  fieldSlots: Array(10),       // 每格 { index, row, col, x, y, left, top, width, height, unit: null | FieldUnit }
  fieldCooldowns: { bulwark: 0, spikes: 0, flare: 0 },
  surge: { charges: 1, maxCharges: 1, shieldTimer: 0, cooldown: 0, thresholdsUsed: [] },
  draftRerollsUsed: 0,         // 当前这一次三选一已重随次数
  freeRerollsLeft: 0,          // 本局剩余免费重随次数（来自装备）
  clouds: [],                  // 现正式启用：{ id, kind, x, y, radius, remaining, duration, tick, tickTimer, dps, sourceId, slow?, poison?, brittle? }
  // 每个防守 Unit 新增：
  //   targeting: 'foremost' | 'priority' | 'strongest' | 'weakest'
  //   harvestTimer?: number (仅 harvest 单位)
  // 每个 Enemy 可选新增：
  //   blockedByFieldId?: string | null
  //   revealed?: boolean
  //   statusResist?: { slow?: number, stun?: number }
  //   priority?: boolean
}
```

### 8.2 控制器新增 Actions（`src/boot.js`）

在保留现有 `ACTIONS` 基础上新增：
- `deployField({ kind, index })`：在 `fieldSlots[index]` 建造前线工事
- `removeField({ index })`：拆除前线工事并按耐久返还部分辉光
- `setTargeting({ index, mode })`：设置/循环切换 `slots[index].unit.targeting`
- `rerollDraft()`：在 `phase === 'draft'` 时消耗辉光（或免费次数）重随 3 张新牌（推进 `state.rng`）

### 8.3 标准化视觉/音频事件契约（**关键：为下一阶段前端优化预留**）

Astra 在 `combat.js`、`field.js`、`waves.js`、`drafts.js` 中必须严格发出以下结构化事件（含完整坐标与标签），确保后续前端优化无需改动任何核心逻辑即可实现高级特效与音效：

| 事件 `type` | 必带字段 | 用途（供后续前端渲染与音效使用） |
| --- | --- | --- |
| `shot` | `sourceId, targetId, x, y, targetX, targetY, damage, crit, towerType, multishot?, pierce?, chain?, splash?` | 差异化大号弹道与枪口火光 |
| `hit` | `sourceId, targetId, x, y, damage, crit, execute, attack, towerType, reaction?, armorBlocked?` | 暴击大跳字、元素反应文字（蒸汽/触媒）、破甲火花 |
| `knockback` | `targetId, x, y, distance` | 击退残影与尘土 |
| `corpse_explode` | `x, y, radius, damage` | 疫焚尸爆链式爆破特效 |
| `cloud_spawn` | `id, kind, x, y, radius, duration` | 地面持续毒雾/霜云渲染 |
| `fence_surge` | `y, reach, chargesLeft, shieldDuration` | 全屏冲击波横扫 + 震屏 + 防线护盾光罩 |
| `field_build` / `field_hit` / `field_destroy` / `field_repair` | `index, kind, x, y, hp?, maxHp?, amount?` | 前线工事建造动画、受击碎屑、受损裂纹与修复绿光 |
| `energy_gain` | `amount, x?, y?, source: 'harvest' \| 'kill' \| 'wave'` | 后排辉穗飘出金色辉光粒子飞向顶部经济槽 |
| `wave_horde` | `wave, name, count` | PvZ 式“一大波敌人正在逼近！”红色警示横幅 |
| `draft_reroll` | `cost, rerollsUsed` | 卡牌洗牌翻转动画 |
| `targeting_change` | `slot, mode` | 塔顶索敌图标切换反馈 |

---

## 9. 基线前端修复清单与代码减负要求

> **分工边界**：Astra 负责完成本节的**功能接通、交互 BUG 修复、数据层与代码减负**；深度美术重绘、高级粒子/动画、视觉风格统一与沉浸式音效将在 Astra 重构完后由下一阶段专门优化。

### 9.1 必须由 Astra 在本阶段修复的 UI/UX 硬伤

1. **恢复战斗 HUD 关键信息（`src/ui/shell.js` & `src/styles.css`）**：
   - 移除对 `hud-xp` 的 `.hud-quiet` 隐藏！战斗 HUD 必须清晰可见：**主栅栏血量 + 防线冲击波剩余充能图标 + 升级经验条（XP） + 当前辉光（Energy） + 波次与进度**。
   - 新增简洁的**前线工事快捷建造栏**（3 个按钮：`铁棘壁 35` / `碎骨地刺 30` / `耀光灯塔 45`，带冷却倒计时与费用状态，点击选中一种工事后再点画布上方 `fieldSlots` 空位即可建造，或再次点击取消）。
2. **彻底修复“点选查看 vs 合成误触”与“放塔弹窗挡视野”**：
   - `placePending` 成功后，将 `ui.selectedSlot` 重置为 `-1`（**不再自动弹出详情卡遮挡栅栏**）。
   - **单击**任意已占用格子 = 仅切换选中该格查看详情（永远不再把“先选 A 再单击 B”当成合成而误报英雄错误！）。
   - **拖拽**单位到空位 = 移动；**拖拽**单位到合法合成目标 = 触发合成预览/确认；详情面板内仍保留显式“移动”与“合成”按钮供无拖拽设备使用。
3. **详情面板新增 1 键索敌切换**：选中任意非 `harvest` 单位时，展示 4 档索敌切换按钮（`最近 / 高危 / 最强 / 残血`），并支持对前线工事点击查看血量与拆除返还。
4. **三选一面板新增“重随（Reroll）”按钮与清晰简短文案**：
   - 展示当前辉光与本次重随花费（或“免费重随”）。
   - 精简卡牌与图鉴描述：删掉 200 字说明书式长段落，改为 **1 句核心玩法亮点 + 关键数值标签 + 合成路线简表**。
   - **修掉漏译**：在 `i18n.js` 补全 `projectile`、`harvest`、`bulwark`、`spikes`、`flare`、`targeting`、`reroll`、`surge`、`energy`、`corpseExplode`、`thermalShock`、`knockback` 等全部中英双语词条。
5. **简化主菜单首屏（`src/ui/meta-panel.js`）**：
   - 首屏顶部直接呈现标题 + **醒目主按钮【继续战斗】（有存档时）与【开始战斗】** + 难度快捷选择 + 当前所选战役/出击名称与“切换关卡”折叠区（不要在“开始”按钮上方平铺 12 张大卡片把开始按钮挤出首屏！）。
6. **画布基线渲染接通（`src/render/renderer.js` & `world.js`）**：
   - 在 `fenceY` 上方绘制 10 个 `fieldSlots` 虚线/地形底座（选定要建造的工事时高亮可建空位）。
   - 绘制 `bulwark`、`spikes`、`flare`（含显隐光环圈）的清晰像素占位/基础精灵与血条。
   - 绘制 `state.clouds` 持续云雾、`fence_surge` 冲击波扩散条与 `shieldTimer` 栅栏护盾边线、以及敌方 `spitter` 酸液弹道。
   - 去除放置模式上方重复的 10 个大号文字槽位按钮网格（直接高亮画布上真实槽位，仅保留顶部精简提示条与“取消放置”按钮）。

### 9.2 代码减负与一致性清理

- **单一 i18n 来源**：删除 `src/boot.js`（`TEXT`）、`src/ui/build-panel.js`（`EXTRA`/`REASONS`/`MECHANICS`）中大量与 `src/i18n.js` 重复的翻译表，统一从 `src/i18n.js` 读取。
- **删除死代码**：移除 `src/boot.js` 中未使用的 `mountFallback` 与 `drawPlaceholder`（若无测试依赖；如有测试依赖则保留精简桩函数）、移除 `src/data/recipes.js` 中未调用的 `scaleHybridStats`/`getHybridStats`、移除 `src/render/renderer.js` 中被 `void` 掉的 `drawFieldHint`。
- **同步文档**：更新 `README.md`（中英文版本严格一致）与 `docs/BALANCE_METHOD.md`。

---

## 10. 平衡验收标准与自动化测试清单

Astra 在完成重构后，**必须更新 `scripts/balance.mjs` 并实际运行平衡模拟与全部单测**，只有全部满足以下量化指标才算交付达标：

### 10.1 核心平衡硬指标（0 局外装备、0 永久加成、至少 5 个种子）

| 验证场景 | 必须达成的验收标准 |
| --- | --- |
| **单局时长（Long Watch Normal, 1×）** | 胜利局主动模拟时间落在 **390s ~ 500s（6.5 ~ 8.3 分钟）**，整局三选一次数 **22 ~ 32 次** |
| **同屏怪数与割草密度（Normal）** | 逐秒采样中位数存活敌人 **≥ 8 只**，峰值 **≥ 25 只**，`combat-stalled` 警报 **= 0**，空场比例 `deadShare < 0.08` |
| **打破“单英雄无双”** | **纯单英雄（0 塔、0 前线工事）在 Normal 难度 100% 失败**（建议撑不过第 12~18 波）；常规胜利局中英雄击杀占比控制在 **20% ~ 42%** |
| **策略区分度（Normal）** | `random`（纯随机瞎选不建前线）胜率 **≤ 20%**；而理解合成/前线/经济的策略（`aggressive` / `hybrid_econ` / `control`）胜率 **≥ 70%** |
| **难度梯度** | Easy 常规策略胜率 **≥ 90%**；Normal 常规策略胜率 **60% ~ 85%**；Hard 0 局外胜率 **20% ~ 50%**（带合理局外后 ≥ 70%）；Nightmare 0 局外胜率 **0% ~ 15%** |
| **混合塔正收益** | 单元测试静态断言：15/15 混合塔在 1 阶下的综合有效输出/功能分 **严格高于**双亲本 1 阶之和；带亲本升阶的混合策略表现优于或持平纯单型升阶 |
| **短出击可玩性** | 全部短出击在 Normal 难度下均可通过 `aggressive` 或 `control` 策略通关，不再出现 85 秒强制暴毙 |

### 10.2 必过自动化测试要求（`npm test` & `npm run build`）

除更新受新数值影响的旧测试外，**必须新增覆盖以下新系统的测试**：
1. **前线工事测试**：`bulwark` 阻挡敌人并反伤、拦截 `Ash Leaper` 空中跳跃并眩晕、拦下 `spitter` 酸液弹、承接 `Cinder Charge` 自爆；`spikes` 对虚化 `Fence Shade` 生效并消耗耐久；`flare` 破除 `Fence Shade` 虚化并施加 `brittle`。
2. **经济与产能测试**：`harvest` 周期产出 `energy` 与 `xp`，后排（slot 5..9）严格享受 `+30%` 加成，2 阶以上自动修复受损前线工事；三选一重随扣费递增且不破坏确定性 RNG。
3. **混合塔与沉睡机制全覆盖测试**：全部 15 种配方可正常合成；**亲本升阶**（`hybrid(A,B,R) + A(R) -> hybrid(A,B,R+1)`）正常生效且不破坏英雄保护；`stun`、`brittle`、`execute`、`multishot`、`fence_focus`、`state.clouds`、`knockback`、`corpseExplode`、`thermalShock`、`poisonDetonate`、`spitter` 远程弹道全部有真实战斗集成测试。
4. **索敌优先级测试**：同一战场下 `foremost` / `priority` / `strongest` / `weakest` 分别命中预期目标。
5. **防线冲击波测试**：被动跌破 50% / 致命保底自动触发冲击波、击退眩晕、开启 3 秒护盾、消耗充能且无主动按钮；`1× / 1.5× / 3× / 10×` 速度模拟一致性。
6. **存档与打包测试**：v2 实时存档（含 `energy`、`fieldSlots`、`clouds`、`surge`、`targeting`）导出/导入无损往返；v1 旧 Profile 导入平滑迁移不报错；`npm run build` 零报错零警告生成便携 `dist/index.html`。
