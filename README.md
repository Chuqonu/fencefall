# Fencefall / 最后一道防线

A playable browser roguelite about protecting one fence with ten defender slots. Enemies approach from above with a center-weighted spread and lateral drift. Defenders fire automatically at any enemy within range.

## Play

Open **`dist/index.html`** in a desktop browser, or serve `dist/` from a static web server for phone play. Everything is contained in that file; there are no runtime downloads or external APIs. Browser storage keeps your progress. Use Settings → Export save to keep a portable backup or move between browsers.

For a source preview, run `npm run dev` and open `http://127.0.0.1:4173/`.

- Start with one independent hero in the rear center of a 2×5 board.
- Earn three-choice drafts containing towers or passive hero upgrades.
- Pause to move defenders or combine equal-rank towers. Identical types gain a rank; compatible different types become hybrids. The hero never merges.
- Protect the shared fence through a campaign of roughly 14 minutes at 1×. Available speeds: 1×, 1.5×, 3×. Drafts and planning pause the battle.
- Choose Easy, Normal, Hard, or Nightmare. Higher difficulties pay more currency, which buys hero equipment and permanent starting bonuses.
- Switch between English and Chinese at any time. On phones, Details opens the planning and inspection drawer.

There are six base tower types, 15 hybrid recipes, seven enemy roles, critical hits, chaining lightning, splash, burning, poison, slows, support auras, and synthesized combat audio. Sound starts off and can be enabled in the top bar or Settings. There are no active combat abilities.

## Develop and verify

Node 20+; no dependencies to install.

```bash
npm run dev
npm test
npm run build
node scripts/balance.mjs --help
```

The build produces a portable `dist/index.html` and a conventional static site in `dist/static/`. Rebuild after source changes. The source `index.html` requires a web server; use the built file when opening directly from disk.

The private GitHub repository contains source and built output. Optional CI is provided as `docs/ci.example.yml`; the current GitHub login cannot install workflow files. No public deployment is configured.

See `docs/BROWSER_ACCEPTANCE.md` for executed checks and remaining device limitations, `docs/BALANCE_METHOD.md` for the automated play policies, and `CONTRACT.md` for the module interfaces.

## 中文

这是一款可在浏览器运行的竖屏塔防游戏。敌人从上方进入，出生位置偏向中间，并会轻微横向移动。防守者位于共同栅栏之后的两排五格内，自动攻击射程内任意方向的敌人。

打开 **`dist/index.html`** 即可在电脑浏览器游玩。手机可访问托管该文件的静态网页。游戏资源全部内置，无需外部 API。进度保存在当前浏览器；在“设置 → 导出存档”中备份或转移进度。

- 开局只有后排正中的一名独立英雄；英雄不能合成。
- 击败敌人获得经验，每次征召提供三个防御塔或被动英雄升级选项。
- 暂停后调整站位、预览并确认合成。同种同阶提升等级；不同基础塔按配方成为混合塔。
- 栅栏生命归零即失败。常规通关约14分钟，可选择1×、1.5×、3×速度。选牌和布阵期间战斗暂停。
- 四档难度带来不同奖励。局外货币可以购买英雄装备和永久起步加成。
- 中英文随时切换。手机端点击“详情”打开查看属性和布阵面板。

包含六种基础塔、十五种混合配方、七种敌人，以及暴击、连锁、范围攻击、燃烧、中毒、减速、支援光环和战斗音效。声音默认关闭，可在顶部或设置中开启。没有主动战斗技能。

本项目已完成自动化检查和浏览器尺寸测试；尚未在实体 iPhone / Safari 上验证。仓库保持私有，没有自动发布到公共网站。
