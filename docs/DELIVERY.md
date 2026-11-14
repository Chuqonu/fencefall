# Delivery / 交付

The release includes the complete game and a portable browser build. This document describes packaging; executed game checks are recorded in `BROWSER_ACCEPTANCE.md`.

## English

### Build

`npm run build` runs `node scripts/build.mjs` with Node built-ins only. Required devDependency: **none**. esbuild is not used and should not be added for this script.

Inputs are `index.html`, the module graph from its local script (contract entry `src/boot.js`), and local stylesheets (`src/styles.css` plus any CSS that graph imports). Outputs:

| Path | Role |
| --- | --- |
| `dist/index.html` | One portable file. CSS and JS are inlined. Open from disk or any static host. |
| `dist/static/index.html` | Same app with external local assets. |
| `dist/static/assets/app.js` | Classic script, not `type=module`. |
| `dist/static/assets/app.css` | Inlined stylesheet text. |
| `dist/build.json` | Module list, byte sizes, warnings. No timestamp. |

The bundle follows static `import` / `export` from `src/boot.js`. JSON imports become `default`. PNG, JPEG, GIF, WebP, SVG, WAV, MP3, OGG, and ICO imports become a base64 `default` data URI. Side-effect CSS imports and `url()` / `@import` in those stylesheets are inlined. `http:`, `https:`, protocol-relative URLs, and bare specifiers fail the build. There is no runtime network API.

Each build also runs an in-script bundler self-test and loads the bundled `src/engine.js` graph in Node. That graph must stay free of DOM at import time. `node scripts/build.mjs --exec` additionally runs the boot bundle against a DOM stand-in. That flag is not part of CI and is not a browser test.

### Bundler limits

- Top-level `await` is rejected.
- `import()` must use a static string specifier. It is included in the bundle and runs when called.
- `import.meta.url` becomes `document.baseURI`. `import.meta` becomes `{url: document.baseURI}`. Do not fetch sibling source files at runtime.
- Named imports are copied when the dependency factory returns. Mutating an exported object is visible. Reassigning an imported binding is not a live ESM binding.
- `export function` declarations are published before imports, so cyclic calls between function declarations work. A cycle is warned. A cycle that reads a `const` before it is initialized does not match full ESM live-binding behavior.
- `export let` / `export var` use getters on the export object. A named importer still snapshots the value after the dependency finishes.
- Preview code must not rely on the bundler to allocate ids. The bundler does not change game rules.

### CI

GitHub Actions is optional. The example is `docs/ci.example.yml`: Node 22, `npm ci`, `npm test`, `npm run build`, `contents: read`, no deploy and no secrets. Copy that file to `.github/workflows/ci.yml` only from a login that can update workflow files. The token used for this private repo can push source and `dist/`, and GitHub rejects workflow paths from it. `package-lock.json` is committed, so `npm ci` can run once the workflow is installed by hand.

### Integrator notes

1. `package-lock.json` is present and the dependency list is empty. `npm ci` is valid after the workflow file is copied into place.
2. Do not add an esbuild devDependency for the current build script.
3. Re-run `npm run build` after the other workers land. `dist/` from this workspace only packages files present at build time.
4. Keep browser runtime imports relative to the repo. `src/boot.js` remains the page entry unless `index.html` points elsewhere.
5. The production entry mounts the complete bilingual game UI.

### Original packaging checks (before integration)

Ran locally:

- `node --check scripts/build.mjs`
- `node scripts/build.mjs --self-test-only` (virtual module graph, cyclic function declarations, static `import()`, and the real `src/engine.js` graph: 10 slots, one hero in slot 2, fence 600, pause, speeds 3 and rejected 2)
- `node scripts/build.mjs --exec` (writes `dist/`, `node --check` on `dist/static/assets/app.js`, then runs the scaffold bundle in Node under a DOM stand-in until `innerHTML` is set)

Those original packaging checks did not exercise a browser. Later integration testing is recorded in `BROWSER_ACCEPTANCE.md`. The DOM stand-in is not a browser.

### 中文

`npm run build` 即 `node scripts/build.mjs`，只用 Node 自带模块。**不需要** devDependency，也不使用 esbuild。

输入是 `index.html`、其中的本地脚本依赖图（合同入口 `src/boot.js`），以及样式表（`src/styles.css` 和依赖图里的 CSS）。`dist/index.html` 把 CSS 与 JS 内联合成一个可离线打开的文件。`dist/static/` 是拆开的静态站点。构建会拒绝外部 URL 和裸导入。相对 JSON 与图片、音频导入会收进包内。

每次构建都会做打包自测，并在 Node 里加载打包后的 `src/engine.js` 图。该图在导入时不能碰 DOM。`--exec` 只用 DOM 替身跑启动包，不是浏览器测试，CI 不调用它。

限制：不支持顶层 `await`；`import()` 只能是静态字符串；`import.meta.url` 变成 `document.baseURI`；具名导入在依赖模块执行完后拷贝一次，不是完整的 ESM 活绑定。`export function` 会在导入之前挂上，因此函数声明之间的循环调用可用，构建会警告循环。循环里过早读取 `const` 与真正的 ESM 不一致。

GitHub Actions 是可选的。示例在 `docs/ci.example.yml`：Node 22、`npm ci`、`npm test`、`npm run build`，只读权限，不部署，不含密钥。当前推送令牌可以推送源码和 `dist/`，但不能创建 `.github/workflows`。需要 CI 时，用有 workflow 权限的登录把示例复制到 `.github/workflows/ci.yml`。`package-lock.json` 已经提交，依赖列表为空，复制之后 `npm ci` 可以运行。

集成其他模块后要重新构建。

最初的打包检查跑过 `node --check scripts/build.mjs`、`node scripts/build.mjs --self-test-only` 和 `node scripts/build.mjs --exec`。后续完整游戏的检查记录见 `BROWSER_ACCEPTANCE.md`。
