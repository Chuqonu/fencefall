# Fencefall / 最后一道防线

## Play

Open **dist/index.html** to play offline, or serve **dist/static/** on a static host. Choose Continue or Start, select a difficulty and expand the mission selector to switch between The Long Watch and eleven shorter sorties. English and Simplified Chinese are available in Settings.

- The hero starts in the front center. Defenders attack automatically. Choose one of four targeting modes for each attacker and one of eight passive upgrade paths for the hero.
- Earn XP for three-card drafts. Place towers on the ten rear-board slots. Merge two equal-rank combat types to make one of fifteen hybrids. A hybrid combines with an equal-rank parent to gain a rank. Drag to preview and confirm the merge. The hero can move between slots.
- Build persistent defenses on the ten slots above the fence. A bulwark costs 35 energy, spikes cost 30 and a flare costs 45. Inspect a structure to see its durability or dismantle it for a partial refund.
- The Sun Gleaner produces energy and XP, earns 30% more in the rear row and repairs damaged structures from rank 2. Reroll a draft up to three times for 20, 35 and 50 energy before equipment discounts.
- The fence automatically spends a surge charge at a health threshold or on a lethal hit, then gains a three-second shield. The main campaign has three flag hordes and two bosses. Normal victories took about 7–8 simulation minutes in the reference run. Available speeds are 1×, 1.5×, 3× and 10×.
- Settlement currency buys team equipment and four permanent upgrade tracks. Use Settings → Export save for backups. Importing a v1 profile preserves progression and maps retired equipment. An incompatible v1 battle restarts with a notice.

## 游玩

打开 **dist/index.html** 即可离线游玩，也可将 **dist/static/** 部署到静态服务器。首屏可选择继续或开始、切换难度。展开关卡选择即可在「长夜守望」与 11 个短出击之间切换。设置中可切换英文与简体中文。

- 英雄从前排中央起步，所有防守者自动攻击。每个攻击单位可切换四种索敌模式，英雄有八条被动升级路线。
- 积累经验触发三选一，将塔放在防线后方十格。两种同阶战斗塔可合出十五种混合塔；混合塔再与同阶亲本合成可升一阶。拖动后可预览并确认。英雄可换位。
- 栅栏上方十格可建造持久工事。铁棘壁、碎骨地刺、耀光灯塔分别消耗 35、30、45 辉光。点选工事可查看耐久，拆除后按剩余耐久返还部分辉光。
- 辉穗产出辉光与经验，放在后排收益增加 30%，二阶起可维修受损工事。每次三选一最多重随三次，装备折扣前依次消耗 20、35、50 辉光。
- 防线达到血量阈值或遭受致命伤害时，自动消耗一次冲击波充能，并获得三秒护盾。主线有三次旗帜尸潮和两次首领战。参考测试中 Normal 胜利约需 7～8 分钟模拟时间。支持 1×、1.5×、3×、10×。
- 结算货币可购买全队装备和四条永久成长。通过「设置 → 导出存档」备份。导入 v1 档案会保留成长并映射退役装备。遇到不兼容的 v1 战斗存档时，界面会提示重新开局。

## Development and verification / 开发与验收

Node 20+. No external dependencies. 使用 Node 20 或以上版本，无需安装外部依赖。

```sh
npm run dev
npm test
node scripts/balance.mjs --seed-count=10 --verify --output=acceptance
npm run build
```

The development server runs at http://127.0.0.1:4173/. The build produces both offline and static-site versions. See [the specification](REFACTOR_SPEC.md) for the v2 contract and [the balance report](docs/BALANCE_METHOD.md) for the simulation method and results.

开发服务器位于 http://127.0.0.1:4173/。构建同时生成单文件离线版和静态站点版。详见 [v2 规格与接口](REFACTOR_SPEC.md) 和 [平衡实测方法与结果](docs/BALANCE_METHOD.md)。
