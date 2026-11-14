# Fencefall / 最后一道防线

Portrait fence defense. Enemies enter from the top. Ten defender slots sit in two rows of five behind one shared fence. This checkout is the v1 coordination checkpoint, not a finished game.

## English

### What runs in this checkpoint

The shared scaffold creates a run with exactly ten slots and one hero in rear-center slot 7. It steps a seeded clock, honors pause, and accepts speeds 1, 1.5, and 3. `src/boot.js` draws that scaffold on a canvas. Combat, waves, merging, drafts, persistence, art, and the bilingual game UI are not in this snapshot; other workers own those modules against `CONTRACT.md`.

### Commands

```bash
npm test          # node --test tests/*.test.mjs
npm run smoke     # tests/smoke.test.mjs only
npm run dev       # source preview on http://127.0.0.1:4173/
npm run build     # dist/index.html and dist/static/
node --check scripts/build.mjs
```

`npm run dev` serves this folder with `scripts/serve.mjs`. The page loads `src/boot.js` as an ES module, so use that server rather than opening `index.html` from disk.

`npm run build` needs no packages. It does not use esbuild. The portable file is `dist/index.html`: CSS and JS are inlined, and the page does not call a runtime API. `dist/static/` is the same app split into `index.html`, `assets/app.js`, and `assets/app.css` for ordinary static hosting. Rebuild after integration. A `dist/` produced from this checkpoint only contains the scaffold graph.

Node 20 or newer matches the syntax and the built-in test runner. CI is pinned to Node 22.

### Language

This README is in English and Chinese. The scaffold boot screen is still the English development line. Player-facing translation belongs to `src/i18n.js` and is not claimed complete here.

### Tests and limits

`tests/smoke.test.mjs` covers the scaffold clock, slots, hero, and profile snapshot. Packaging checks bundled module linking in Node. No browser pass, phone viewport, or balance run was done for this delivery. Do not treat the scaffold canvas as the game.

The source repository is private. Nothing here deploys the game or stores credentials.

## 中文

### 当前检查点实际能运行的部分

共享脚手架会创建一局游戏：恰好十个槽位，英雄在后排正中（槽位 7）。时钟按种子步进，暂停有效，速度只接受 1、1.5 和 3。`src/boot.js` 把这个脚手架画到画布上。战斗、波次、合成、选牌、存档、画面和完整双语界面不在本快照里，由其他工人按 `CONTRACT.md` 实现。

### 命令

```bash
npm test          # node --test tests/*.test.mjs
npm run smoke     # 仅 tests/smoke.test.mjs
npm run dev       # 源码预览 http://127.0.0.1:4173/
npm run build     # 生成 dist/index.html 与 dist/static/
node --check scripts/build.mjs
```

`npm run dev` 用 `scripts/serve.mjs` 提供本目录。页面以 ES 模块加载 `src/boot.js`，请用这个本地服务，不要直接用磁盘打开 `index.html`。

`npm run build` 不需要安装依赖，也不使用 esbuild。便携文件是 `dist/index.html`：CSS 和 JS 都内联，运行时不请求外部 API。`dist/static/` 把同一份应用拆成 `index.html`、`assets/app.js` 和 `assets/app.css`，便于普通静态托管。集成全部模块后要重新构建。本检查点生成的 `dist/` 只打包脚手架依赖图。

语法和 Node 自带测试运行器对应 Node 20 或更新版本。CI 固定为 Node 22。

### 语言

本说明含中文和英文。脚手架启动画面仍是英文开发提示。玩家界面译文属于 `src/i18n.js`，这里不声称已经完成。

### 测试与界限

`tests/smoke.test.mjs` 覆盖脚手架的时钟、槽位、英雄和档案快照。打包步骤在 Node 里检查模块是否连得上。本次交付没有做浏览器、手机视口或平衡性试玩。不要把脚手架画布当成完整游戏。

源码仓库保持私有。这里不部署游戏，也不存放凭证。
