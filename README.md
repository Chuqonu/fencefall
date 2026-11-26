# Fencefall / 最后一道防线

A playable browser roguelite about protecting one fence with ten defender slots. Enemies approach from above with a center-weighted spread and lateral drift. Defenders fire automatically at any enemy within range.

## Play

Open **`dist/index.html`** in a desktop browser, or serve `dist/` from a static web server for phone play. Everything is contained in that file; there are no runtime downloads or external APIs. Browser storage keeps your progress. Use Settings → Export save to keep a portable backup or move between browsers.

For a source preview, run `npm run dev` and open `http://127.0.0.1:4173/`.

- Start with one independent hero in the front center of a 2×5 board.
- Earn three-choice drafts containing towers or passive hero upgrades.
- Pause to move defenders or combine equal-rank towers. Identical types gain a rank; compatible different types become hybrids. The hero never merges.
- Protect the shared fence. Enemies attack only that fence. Before Play, the new-run form offers The Long Watch (the long campaign, about 14 minutes at 1×; the new roles join after the opening) or eleven shorter sorties: Wire Rush, Plate Weight, Dust Brood, Mender Line, Leap Ash, Shade Hour, Wretched Standard, Ash Ward, Cinder Line, Ash Hush, and Mixed Gate. Available speeds: 1×, 1.5×, 3×, 10×. Drafts and planning pause the battle.
- Choose Easy, Normal, Hard, or Nightmare. Higher difficulties pay more currency, which buys hero equipment and permanent starting bonuses.
- Switch between English and Chinese at any time. On phones, Details opens the planning and inspection drawer.

There are six base tower types, 15 hybrid recipes, fifteen enemy roles, critical hits, chaining lightning, splash, burning, poison, slows, support auras, and synthesized combat audio. Eight new roles: Ash Leaper (crouches, then jumps), Crack Brood (splits into two dust gnawers), Ash Mender (heals an ally, not itself), Fence Shade (cannot be shot while faded, and still bites the fence), Standard Wretch (nearby enemies move faster; it does not), Ash Warden (weakens hits on one nearby ally, and is not shielded itself), Cinder Charge (bites once at the fence, then a fuse you can still stop), and Ash Hush (slows the whole board's recharge while it is on the fence). Sound starts off and can be enabled in the top bar or Settings. There are no active abilities.

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

- 开局只有前排正中的一名独立英雄；英雄不能合成。
- 击败敌人获得经验，每次征召提供三个防御塔或被动英雄升级选项。
- 暂停后调整站位、预览并确认合成。同种同阶提升等级；不同基础塔按配方成为混合塔。
- 敌人只攻击共享栅栏，生命归零即失败。按下“开始”前，可在新对局表单选择“长夜守望”（长战役，1×约14分钟，开局之后新角色会加入）或八个较短出击：线驰突进、板甲重压、尘裂、修补队列、灰跃、栅影时刻、旗孽、混合闸门。速度为1×、1.5×、3×、10×。选牌和布阵期间战斗暂停。
- 四档难度带来不同奖励。局外货币可以购买英雄装备和永久起步加成。
- 中英文随时切换。手机端点击“详情”打开查看属性和布阵面板。

包含六种基础塔、十五种混合配方、十二种敌人，以及暴击、连锁、范围攻击、燃烧、中毒、减速、支援光环和战斗音效。五种新角色：灰跃者（先蹲下再跳）、裂巢（裂成两只尘啮）、烬补者（治疗一名同伴，不治疗自己）、栅影（淡出时无法被射击，仍会啃栅栏）、旗孽（附近敌人移动更快，它自己不会）。声音默认关闭，可在顶部或设置中开启。没有主动技能。

本项目已完成自动化检查和浏览器尺寸测试；尚未在实体 iPhone / Safari 上验证。仓库保持私有，没有自动发布到公共网站。
