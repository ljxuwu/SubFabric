# Material Design 3 前端重构计划

> 状态：P0–P5 已完成且已验证；P6–P8 未开始（2026-10-18）。执行进度只记在 [STATUS.md](STATUS.md)，本文件只在范围、顺序或验收变化时修改。
> 改代码前仍须读 [PROJECT_MAP.md](../PROJECT_MAP.md) §6、§7。

## 0. 需求与已确认决策

用户需求（2026-10-18）：用 Material-UI 风格重构前端，优化组件外观与排版。

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 技术路线 | **原生实现 Material Design 3**，不引入 React / MUI | MUI 是 React 组件库，需要 npm 与打包；与"原生 ESM、无构建、零 npm 依赖、SEA 单文件"红线冲突。MD3 是 Google 的设计规范，MUI 只是它的一种 React 实现 |
| 主题包 | **统一为 Material**：Studio / Classic / UWP 下线，旧包迁移为种子色预设 | 现有 4 套 design 在 CSS 里各自覆盖（material 86 处、uwp 122 处、classic 22 处、studio 31 处），是样式冲突的主要来源 |
| 范围 | 首页 / 稿件库 / 任务中心、设置 / 资源 / 帮助、编辑器工作台、时间轴 canvas 配色 | 全量 |

说明：MUI 默认主题仍以 Material Design 2 为主（阴影多、4px 圆角、Roboto）；本计划按 MD3（色调表面、动态取色、更大圆角）实施，与项目已有的 Material You 方向一致。

### 目标

1. 一套 MD3 设计令牌（颜色角色 / 字体层级 / 形状 / 高度 / 动效 / 状态层）成为唯一视觉来源。
2. 一套自建 `md-*` 组件样式，覆盖界面里所有按钮、输入、选择、导航、卡片、列表、弹层、进度。
3. 按 MD3 窗口尺寸等级和 4dp 网格重排四块界面，减少视觉噪声、统一间距与层级。
4. 最终删除旧的层层覆盖（深色橙主题 → 质感层 → Studio 生产层 → 各 design 覆盖 → 毛玻璃末端覆盖）。

### 非目标

- 不改业务逻辑、数据流、API、保存协议、逐词/特效/字幕渲染（`karaoke.js`、`postprocess.js`、`ass.js`、`assplayer.js` 不动）。
- 不改字幕本身的颜色（`--zh` / `--en`、角色色、ASS 样式）。
- 不引入 Web 字体下载、远程资源、Shadow DOM、构建步骤或 npm 依赖。
- 不重做交互模型（时间轴拖拽、虚拟滚动、快捷键、就地编辑逻辑保持原样）。

## 1. 现状盘点（2026-10-18 实测）

| 项 | 数据 | 对重构的影响 |
| --- | --- | --- |
| `editor/studio.html` | 2031 行，607 个 `id` | 业务 JS 靠 id/data-* 绑定，**重构只换 class 与外层结构，钩子不动** |
| `editor/css/studio.css` | 4291 行，72 处 `!important`，22 处 `backdrop-filter` | 多层"同选择器靠后覆盖"，ID 选择器与 `!important` 混用 |
| 前端 JS | 约 2.1 万行；`main.js` 7155、`project.js` 4096、`timeline.js` 2092、`editor.js` 1418、`studio.js` 854 | `main/project/studio` 合计约 900 处 DOM 查询、约 90 处 `innerHTML` 拼 HTML |
| 两套 CSS 变量族 | Studio 族 `--bg --surface --surface-2 --text --muted --line --accent --accent-soft --on-accent --outline`；旧族 `--bg-1 --bg-2 --border --text-1 --accent-2 --accent-ink --accent-aNN --accent-glow` | 时间轴 canvas 读旧族（`timeline.js` `syncStudioColors`）；需要兼容别名层过渡 |
| 取色 | `studio-themes.js` `palette()`（HSL 近似，注释写明非 HCT）＋ `accent.js`（`<head>` 同步脚本，防首屏闪色） | 换成 HCT 色调板，保持同步执行 |
| 主题偏好 | `studio-state.js` 校验，`studio.js` 存 `localStorage`；字段 `themePack / accent / mode / background / glass* / custom` | 需要迁移旧值 |
| 静态白名单 | `server.js` `STATIC_RESOURCES` 逐个列文件 | 新增 CSS/JS 文件必须登记；安装包 `.iss` 用 `editor\*` 通配，无需改 |
| 与外观强相关的测试 | `theme-packs` `uwp-theme` `ui-integration` `card-style` `orbit-capsule` `ui-feedback-20261017` `studio-navigation` `log-panel` `reflect-ui` `notes` `hotwords` `font-picker` `badcat-layer`；其中 12 个直接读 `studio.html` / `studio.css` 源码断言 | 每阶段同步改断言；UWP 测试随主题下线删除 |
| 文案 | `i18n.js` 用 MutationObserver 按文本节点查词典 | 图标不能插进文本节点中间；不能用 Shadow DOM |

## 2. 设计规范（MD3 落地口径）

### 2.1 颜色

- 令牌命名沿用官方 `--md-sys-color-*`，与 MD3 / MUI 文档对得上：
  `primary / on-primary / primary-container / on-primary-container`，secondary、tertiary、error 同构；
  `surface / surface-dim / surface-bright / surface-container-lowest|low|(base)|high|highest`；
  `on-surface / on-surface-variant / outline / outline-variant / inverse-surface / inverse-on-surface / inverse-primary / scrim / shadow`。
- 色调板：从种子色生成 HCT 色调板（TonalSpot 规则：primary 色度 36、secondary 16、tertiary 色相 +60 / 色度 24、neutral 6、neutral-variant 8、error 固定色相 25 / 色度 84）。
- 角色取色（静态 MD3 色调表）：浅色 primary 40 / on-primary 100 / container 90 / on-container 10；深色 80 / 20 / 30 / 90。
  表面：浅色 surface 98、lowest 100、low 96、base 94、high 92、highest 90、dim 87；深色 surface 6、lowest 4、low 10、base 12、high 17、highest 22、bright 24。
- 实现：移植 `material-color-utilities`（Apache-2.0）中 HCT / CAM16 / TonalPalette 的必要子集，保留许可声明；不引入 npm 包。
- 用户可选：种子色（含预设）、浅色 / 深色 / 跟随系统。旧主题包种子色变成预设：Studio 苔绿 `#5C7560`、Material You 蓝 `#5789DC`、Classic 橙 `#FF7A45`、UWP 蓝 `#0078D7`。
- 字幕预览色、角色色、ASS 样式色**不跟随主题**。

### 2.2 字体层级

- 字体栈：`"Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", "Segoe UI", system-ui, sans-serif`；时间码与数值用 `--md-ref-typeface-mono`（沿用现有 `--mono`）加 `font-variant-numeric: tabular-nums`。
- 采用 MD3 type scale 的 15 级（display / headline / title / body / label 各 L/M/S），落成 `--md-sys-typescale-<role>-<size>-{font,size,line-height,weight,tracking}`。
- 中文排版修正：`body` 行高按 1.5～1.6 调高，`label` 字距设 0（MD3 默认的拉丁字距不适合中文）。
- 桌面编辑器信息密度高：字幕卡正文用 body-medium（14px），时间与元信息用 label-small（11px）。

### 2.3 形状、高度、间距、动效

- 形状：`none 0 / xs 4 / sm 8 / md 12 / lg 16 / xl 28 / full 9999`。卡片 md，对话框 xl，按钮与 chip full，文本框 xs（顶角）。
- 高度：以色调表面区分层级（surface-container-*），阴影只用于悬浮层（菜单、对话框、FAB、拖动中），level 0～5。
  **长列表（字幕卡、模型列表）禁止逐项阴影和 `backdrop-filter`**（5000 行虚拟滚动的性能约束）。
- 状态层：hover 8%、focus 10%、pressed 10%、dragged 16%，用 `::before` + `color-mix()` 实现，不需要 JS。
- 间距：4dp 网格，令牌 `--md-space-1..12`（4、8、12、16、20、24、32、40、48…）。
- 动效：MD3 easing（standard / emphasized / emphasized-decelerate / emphasized-accelerate）与时长（short 50～200ms、medium 250～400ms）；保留 `prefers-reduced-motion` 全局关闭；不使用 `transition: all`。
- 保留已有的 Material Expressive 元素：花瓣 FAB（新建）、40° 统计胶囊、波浪进度条。

### 2.4 布局

- 窗口尺寸等级：compact < 600、medium 600–839、expanded 840–1199、large 1200–1599、extra-large ≥ 1600。桌面优先，最低验收 800×600。
- 导航：large 及以上用 navigation drawer（现 `#sf-nav`），expanded 及以下收为 navigation rail（只显示图标和短标签）。
- 页面：顶部 top app bar（small，标题＋主要操作），内容区最大宽度与左右边距按尺寸等级取值（24 / 32px）。
- 稿件库：自适应卡片网格（`minmax(280px, 1fr)`），列表视图为 MD3 list。
- 新建 / 详情页：由现在固定 2×2 的 `ws-panel` 改为 MD3 supporting-pane：主栏放输入与配置，辅栏放预览与进度；expanded 以下单栏。
- 设置：list-detail 布局（左分类列表，右内容卡片），表单行 label + control + supporting text 三段式。
- 编辑器：保持"左视频 / 下时间轴 / 右面板"和可拖动分割线，只换外观；右面板改为 MD3 secondary tabs。

### 2.5 组件映射

| MD3 组件 | 现有位置（举例） | 说明 |
| --- | --- | --- |
| Button（filled / tonal / outlined / text / elevated） | `.btn`、`.btn-accent`、工具栏按钮、对话框按钮 | 一屏只有一个 filled 主操作；其余 tonal / outlined / text |
| Icon button（standard / filled / tonal / outlined） | 工具栏图标、卡片操作、播放控制 | 必须有 `aria-label` |
| FAB / Extended FAB | 首页"开始新的创作"花瓣按钮 | 保留花瓣形状作为 Expressive 变体 |
| Segmented button | 视图切换、日志子页、字幕显示模式（双行 / 仅中 / 仅英） | |
| Chips（filter / assist / input） | 角色筛选、异常筛选、热词块、徽标 | 徽标改为 assist chip 或 badge |
| Text field（filled / outlined） | 搜索框、`.np-input`、设置输入、行内编辑框 | 设置页统一 outlined；行内编辑保持紧凑变体 |
| Menu / Select | 自定义选择器（`studio.js`）、右键菜单、字体选择器 | 自定义选择器保留原生 `<select>` 语义透传 |
| Switch / Checkbox / Radio / Slider | 开关、特效参数、毛玻璃滑块、置信度门槛 | |
| Tabs（primary / secondary） | 编辑器右侧"字幕 / 角色 / 设置 / 日志"、设置里的二级页签 | |
| Navigation drawer / rail | `#sf-nav` | |
| Top app bar | `#sf-topbar`、编辑器 `#toolbar` | 编辑器低频按钮进溢出菜单 |
| Card（elevated / filled / outlined） | 项目卡、设置卡、Quiet Card 字幕卡、模型卡 | 字幕卡用 outlined 或 filled 变体，**高度测量规则必须与 `.cue-measure` 一致** |
| List / Expansion | 模型列表（按系列折叠）、LLM 方案、日志、备注 | |
| Dialog（basic / full-screen） | `modal.js` 二级窗口、确认框、查找替换、修复字幕、重叠台词选择 | 大型工具对话框保留可拖动（MD3 无此规范，作为项目扩展） |
| Side sheet | LLM 方案抽屉 `#st-scheme-drawer` | |
| Snackbar | toast、`#sf-notice` | 分级色用 container 角色 |
| Progress（linear / circular / wavy） | 初稿进度、任务卡、模型下载、`#job-card` | 波浪进度沿用 `studio-progress.js` |
| Tooltip（plain / rich） | `title` 提示、时间轴边缘提示、进度条悬浮时间 | 原生 `title` 先保留，重要位置改 rich tooltip |
| Badge | 任务数、子标签条数 | |
| Stepper（项目扩展） | 初稿处理步骤条 | |

## 3. 技术方案

### 3.1 文件组织

```
editor/css/
  app.css            样式入口：声明层序并按层 @import 下面各文件（studio.html 只链接它）
  md-tokens.css      MD3 参考令牌与系统令牌（形状/字体/间距/动效/状态层；颜色由 JS 写入，这里只有默认种子的回退值）
  md-components.css  md-* 组件样式（无业务选择器）
  md-compat.css      旧变量族 → MD3 令牌的别名层（过渡期，P8 删除）
  studio.css         逐步缩减为布局与业务专属样式
editor/js/
  md-color.js        HCT 色调板与角色计算（经典脚本，<head> 同步执行，取代 accent.js 的取色部分）
  md.js              少量组件行为辅助（菜单定位、tabs 键盘、可选 ripple），ESM
tools/md-gallery.html 组件陈列页（file:// 直接打开，只引 CSS 与经典脚本，不经服务端）
```

- 新增文件逐个登记到 `server.js` `STATIC_RESOURCES`；`tools/studio-install.mjs` 的增量清单同步。
- 用 CSS Cascade Layers 固定层序，结束"靠后覆盖"的竞争（P1 实际落地的层序）：
  `@layer md-tokens, legacy, md-compat, md-components, app;`（P1 最初写成 `md.tokens` 这类带点的名字，P2 发现它们实际是同一父层 `md` 的子层、整体排在 legacy 之前，已改为连字符；层名不能带点）
  旧 `studio.css` 整体放入 `legacy` 层，新组件层天然压过它，不用 `!important` 也不用加 ID。
  `md-compat` 必须排在 `legacy` **之后**：旧文件 `:root` 写死过一套颜色默认值，后面的层同选择器才能覆盖（P1 已删掉那组默认值，层序仍保持，作为防回归）。
  `<link>` 不能指定层，所以由 `app.css` 用 `@import … layer(…)` 引入各文件；不在任何层里的样式会压过所有层，新样式一律放进层里。
  （应用以 Edge `--app` 模式运行，Chromium 已支持 `@layer` 与 `color-mix()`。）

### 3.2 迁移方式

- **只换外衣不换钩子**：保留所有 `id`、`data-*`、`hidden` 语义和 JS 依赖的 DOM 嵌套顺序；在原元素上加 `md-*` class。
  需要换结构时先 grep 该节点的全部 JS 引用（`getElementById` / `querySelector` / `closest` / 事件委托选择器）。
- JS 拼的 HTML（项目卡、模型卡、字幕卡、日志行、菜单）改为调用少量模板函数，class 与静态 HTML 一致。
- 不用 Shadow DOM 和自定义元素：i18n 的 MutationObserver、测试源码断言、事件委托都依赖 light DOM。
- 图标沿用 `icons.js` 内联 SVG，统一 20 / 24px 视框；不放进文本节点中间。
- 每完成一块，就从 `legacy` 层删掉该块被取代的规则，避免最后一次性大删。

### 3.3 主题统一与偏好迁移

- `studio-themes.js` 只保留 Material：`apply()` 删去 uwp / classic / studio 分支；`designNames` 只剩 `material`。
- `studio-state.js` 规范化：`themePack` 不是 `material-you` 时，迁移为 `material-you`，并把原包种子色写进 `accent`（用户原来用 UWP 就保留蓝色），只迁移一次。
- `studio.js` 删除 UWP 专用分支（禁用自定义色、`themed()` 判断等）；设置 → 外观简化为种子色（预设＋自绘取色器）、明暗模式、背景。
- 自定义主题包：保留导入 / 导出，`schema` 升为 `subfabric-theme-v2`（`seed` ＋ 可选的颜色角色覆盖，白名单与安全校验不变）；v1 包导入时只取 `seed`，忽略 `design` 并提示。
- `editor/themes/` 的 studio / classic / uwp JSON 删除；`docs/THEME_PACKS.md` 重写。
- `accent.js` 的取色逻辑并入 `md-color.js`。旧事件名 `ss-accent`、`sf-studio-theme` 在过渡期继续派发，时间轴等监听方不用同时改。

### 3.4 兼容别名（`md-compat.css`，P8 删除）

| 旧变量 | 指向 |
| --- | --- |
| `--bg` | `--md-sys-color-surface` |
| `--surface` / `--bg-1` | `--md-sys-color-surface-container-low` |
| `--surface-2` / `--bg-2` | `--md-sys-color-surface-container` |
| `--text` / `--text-1` | `--md-sys-color-on-surface` |
| `--muted` | `--md-sys-color-on-surface-variant` |
| `--line` / `--border` | `--md-sys-color-outline-variant` |
| `--outline` | `--md-sys-color-outline` |
| `--accent` | `--md-sys-color-primary` |
| `--accent-soft` | `--md-sys-color-primary-container` |
| `--on-accent` / `--accent-ink` | `--md-sys-color-on-primary` |
| `--accent-2` | `color-mix(in srgb, var(--md-sys-color-primary) 92%, var(--md-sys-color-on-primary))` |
| `--accent-aNN` | `color-mix(in srgb, var(--md-sys-color-primary) NN%, transparent)` |

## 4. 分阶段计划

每个阶段做完都要保证应用完整可用（中间态可以发布），并作为一个 GitHub 原子提交的检查点（按 AGENTS.md 云端里程碑流程）。

### P0 基线与准备（S）

- 记录测试基线：`node tests/run-all.mjs --report _test/md3-p0-baseline.json`（最近一次是 91 通过 / 9 部分执行 / 0 失败 / 2 排除）。
- 截图基线：源码服务＋临时项目，用 CDP 在 1600×900、1280×720、1024×768、900×800、800×600 下截图，每种尺寸都拍浅色和深色：首页（空 / 有稿件）、任务中心、新建、详情、设置各分类、帮助、编辑器（字幕 / 角色 / 设置 / 日志四页）、主要对话框。截图放 `_test/`，不入库。
- 盘点：生成"组件实例 → MD3 组件 → 所在文件"清单（以 §2.5 为骨架，补全到每个页面）。
- 核对 §6 待确认决策。
- 验收：基线报告与截图齐全；清单覆盖 `studio.html` 全部可交互元素类型。

### P1 令牌、取色引擎与主题统一（M）

- 新增 `md-color.js`（HCT 子集＋角色表）、`md-tokens.css`、`md-compat.css`；`studio.html` 的 `<head>` 改为同步加载 `md-color.js`，并声明 `@layer` 层序。
- 按 §3.3 完成主题统一与偏好迁移；删除 studio / classic / uwp 主题 JSON 与对应 CSS 分支（这一步只删各 design 的颜色覆盖，形状类覆盖在后续阶段处理）。
- 时间轴 canvas 先通过兼容别名拿到新颜色（P7 再细调）。
- 测试：新增 `md-color-test.mjs`（HCT 往返与色调板的期望值取自 material-color-utilities 官方单测；全部 on-* / 容器配对对比度 ≥ 4.5；同一种子输出确定）。改写 `theme-packs-test.mjs`（v2 schema、v1 导入降级、迁移逻辑）。删除 `uwp-theme-test.mjs` 并在 STATUS 写明原因。
- 验收：全部页面能用新颜色渲染、布局不变；10 个种子（含高亮黄、低饱和灰、纯红）×浅深色没有不可读文字；首屏无闪色；完整回归 0 失败。
- **P1 结果（2026-10-18，已完成且已验证）**：
  - HCT 移植与官方 material-color-utilities 0.3.0 对照：12,750 个 `solveToInt` 采样、2,000 个随机色的 HCT 全部一致；10 个种子 × 浅深 × 34 角色共 680 个值逐一相等（`tests/md-color-expected.json`）。14 个种子的正文配对对比度最低 4.5 以上。
  - `studio.css` 删除 174 条只属于下线主题的规则（189 个选择器），删除浅色 / 深色两组毛玻璃规则与流光样式，4291 → 约 3940 行。
  - 删除 `accent.js`、三个下线主题包 JSON、`tests/uwp-theme-test.mjs`（只测已下线的 UWP 包）；`tests/jsmod/accent.js` 镜像同步删除。
  - 验收证据与回归数字见 STATUS 与 [MD3_INVENTORY.md](MD3_INVENTORY.md) §4。

### P2 组件库（L）

- 按 §2.5 实现 `md-components.css` 与 `md.js`；`tools/md-gallery.html` 陈列每个组件的所有变体和状态（默认 / hover / focus-visible / pressed / disabled / 错误），浅色和深色各一份。
- 键盘与无障碍：focus-visible 环（内描边，避免被滚动容器裁掉，沿用现有经验）、tabs 方向键、菜单 Esc 关闭并归还焦点、对话框焦点陷阱。
- 这一阶段不替换业务页面。
- 测试：新增 `md-components-test.mjs`（源码断言：没有 `transition: all`；动画都受 reduced-motion 门控；组件层不出现 ID 选择器和 `!important`）。
- 验收：陈列页逐项目检通过；对比度检查通过。
- **P2 结果（2026-10-18，已完成且已验证）**：
  - `editor/css/md-components.css`：122 个 md- 类，覆盖 §2.5 全部组件（stepper 留给 P4；navigation rail 留给 P3），外加 15 级字体工具类。`editor/js/md.js`（经典脚本 `window.MDUI`）负责标签页键盘、菜单定位与焦点、滑块填充。两者已接入 `app.css` / `studio.html` / 静态白名单，但业务页面还没有使用（P3 起替换）。
  - `tools/md-gallery.html`：全部组件与变体，可切换明暗、种子色与减少动效，`data-state` 静态展示悬停、焦点、按下。
  - `tests/md-components-test.mjs`：96 项断言，覆盖源码约定、陈列页覆盖、层名、接线和 md.js 纯函数。
  - 真实浏览器检查陈列页：标签页方向键与 End（跳过禁用项）、菜单定位（贴在锚点下方）、方向键跳过禁用项、Esc 归还焦点、原生对话框、滑块填充都正常；只截了陈列页的明暗两张全页图和 6 张分区图（`_test/md3-p2/`），没有重跑整套界面截图。
  - 截图里发现并修正了 P1 的层名问题（见 §3.1）：组件原本整体输给旧样式里的 `* { padding:0 }`。修正后 compat 层才真正排在 legacy 之后；已核对旧样式里没有声明任何 compat 变量，应用外观不受影响。

### P3 应用外壳、导航与全局弹层（M）

- `#sf-nav` 改为 drawer / rail（按尺寸等级）；`#sf-topbar` 改为 top app bar；页面切换用 MD3 shared-axis / fade-through。
- `modal.js` 对话框、确认框、toast → snackbar、`#sf-notice` → banner、右键菜单与 `#range-bar` 浮条换成 menu 样式。
  **`#range-bar` 必须留在 `#app` 外**（PROJECT_MAP §6 的 fixed 包含块问题）。
- 验收：导航在 5 个尺寸下正确切换；所有弹层的 Esc、焦点、位置正确；相关测试（`studio-navigation`、`ui-feedback-20261017`）更新后通过。
- **P3 结果（2026-10-18，已完成且已验证）**：
  - 新增 `editor/css/app-shell.css`（app 层），删除 `studio.css` 中被接管的约 107 行旧规则。
  - 导航：抽屉 / rail / 模态抽屉。顶栏：MD3 top app bar，主操作为 filled，次要为 tonal。
  - toast 与通知改为 snackbar；菜单与批量浮条改为 MD3 外观，定位逻辑不变。
  - 确认框有 alertdialog 语义、固定居中（D6），关闭后归还焦点。
  - 页面切换只做淡入：shared-axis 的位移会给页面里的 fixed 浮层建立包含块，没有采用。
  - 解决 P0 的 F3。F2（800×600 编辑器工具栏截断、视频区被压）属于编辑器内部布局，留给 P6。
  - 新发现 F11（1024 宽首页内容区出现横向滚动条，P1 已存在），留给 P4。

### P4 首页 / 稿件库 / 任务中心 / 新建 / 详情（L）

- 稿件卡改为 MD3 card（封面 16:9、标题 title-medium、元信息 label、进度 linear / wavy）；花瓣 FAB、40° 胶囊保留并改用新令牌；搜索栏、filter chips、视图切换用 segmented button；空状态和骨架屏统一。
- 文件夹管理：drawer 内的列表项、新建 / 改名用对话框。
- 新建 / 详情页：按 §2.4 改成 supporting-pane；步骤条用项目扩展的 stepper；表单用 outlined text field / select / switch。
- 不变量：`isCreating` 置顶、`cardSig` 就地更新、仅 running 状态播放进度动画（PROJECT_MAP §6「首页列表」）。
- 验收：`home-project-list-test`、`orbit-capsule-test` 更新后通过；5 个尺寸截图与 P0 对比，没有溢出和横向滚动；新建 → 下载 / 识别 → 详情流程能走通（模拟或真实媒体按条件执行）。
- **P4 结果（2026-10-18，已完成且已验证）**：
  - 新增 `editor/css/app-home.css`（app 层），删除 `studio.css` 中被接管的约 340 条旧规则（3836 → 3350 行）。`md-tokens.css` 新增 `--md-type-*` 字体简写。
  - 稿件库：`minmax(280px, 1fr)` 卡片网格（outlined card，封面 16:9），列表视图为 MD3 list；筛选为 filter chips，搜索为 search bar，视图切换为 segmented button（`#sf-view`）。卡片按钮改为 md-button，删除为带名称的图标按钮；文件夹下拉只在已有文件夹时出现。
  - 新建 / 详情：结构改为 `.ws-main` + `aside.ws-side`（只移动面板，id 与表单不变），<920px 单栏；竖向步骤条；表单控件、勾选、开关换成 MD3 外观。界面方位用语随版面调整（「填到右侧」→「填进『输入与配置』」）。
  - 解决 F10、F11，F7 在首页 / 新建 / 详情解决（设置页留给 P5）。花瓣 FAB 与 40° 胶囊保留，胶囊不再靠 translateX 补偿位置。
  - 没有执行真实的新建 → 下载 / 识别流程（需要真实媒体与模型）；只在已有项目上检查了详情页与新建页的模式切换。

### P5 设置 / 资源 / 帮助 / 日志（L）

- 设置改为 list-detail；每组一张卡，行结构是 label＋control＋supporting text；模型列表用 expansion list；LLM 方案用 side sheet；本机硬件信息用 filled card。
- 外观页：种子色预设＋取色器（`color-picker.js` 换外观）、明暗、背景；按 §6 的决定处理毛玻璃参数。
- 设置草稿离场保护、保存条外观改为 MD3 bottom app bar 或 banner。
- 帮助页和日志页（运行日志 / 操作日志 / 备注）换外观，日志保持等宽字体。
- 验收：`log-panel`、`hotwords`、`font-picker`、`theme-packs` 等测试通过；设置每个分类都能完整滚到底；键盘能走完整个设置页。
- **P5 结果（2026-10-18，已完成且已验证）**：
  - 新增 `editor/css/app-settings.css`（app 层），删除 `studio.css` 中被接管的约 400 条旧规则（3350 → 约 2710 行）。
  - 设置：list-detail（224px 分类导航 + 内容），每组一张色调卡片；输入 / 下拉为 outlined，模板里的 `.btn` 映射为 MD3 按钮；明暗模式改为分段按钮，遮罩强度改为 MD3 滑块，勾选改为 md-checkbox；<900px 分类改为横向一行。去掉 "MAKE IT FEEL LIKE YOU" 眉标（F7 全部解决）。
  - 与计划的差异：LLM 方案仍是卡片下方的内联展开（PROJECT_MAP 记录的 2026-10-14 决定），只换外观，没有改成 side sheet；硬件信息用色调条 + 纸片，没有单独做 filled card；保存条沿用标题右侧的动作区（「返回」tonal、「保存并返回」filled），没有改成 bottom app bar。
  - 帮助页：卡片网格与 MD3 按钮。日志：子页切换为分段按钮，三个列表改为色调表面（浅色主题下原来是写死的黑块），保持等宽；修正默认高亮「运行日志」却显示操作日志的不一致。
  - 顺带：新版本 / 缺渲染器横幅从内联写死的蓝 / 橙改为 MD3 色调（app-shell.css）。

### P6 编辑器工作台（L，风险最高）

- 工具栏 → top app bar（主要操作：导出；次要操作进溢出菜单；保存状态改为 label＋icon）。
- 视频区：容器形状与空状态卡；就地编辑弹框用 outlined text field 外观，**几何计算不动**（`videoedit.js`）。
- 右侧面板：secondary tabs；字幕列表搜索栏、角色筛选 chips、显示模式 segmented；Quiet Card 字幕卡换成 MD3 卡片外观，**卡片与 `.cue-measure` 共用同一套规则**，保持虚拟滚动高度一致；行内编辑框、角色列表、样式面板、后处理特效分组、导出按钮组。
- 弹层：查找替换、修复字幕、重叠台词选择、添加角色、反思纠错预览、分段导入预览、`#job-card` 进度卡、备注输入条与弹幕层。
- 验收：`card-style`、`row-rerecog`、`reflect-ui`、`notes`、`badcat-layer`、`video-geometry`、`cue-segment` 等测试通过；5000 行项目滚动不掉帧（CDP Performance 录制，对比 P0）；真实浏览器跑一遍"打开项目 → 播放 → 就地编辑 → 列表编辑 → 拖时间轴 → 导出"。

### P7 时间轴 canvas（M）

- 颜色改读 MD3 令牌：轨道底 surface-container-low，胶片 / 波形底 surface-container，刻度文字 on-surface-variant，刻度线 outline-variant，播放头 primary，选中环 tertiary 或 primary，悬停提示 inverse-surface。
- 字幕块继续用角色色＋`mutedHex()` 降饱和；文字对比度在浅色和深色下都要校验。canvas 字体取 label-small 令牌。
- 主题切换时刷新颜色缓存（合并现有的 `sf-studio-theme` 与 `ss-accent` 两个监听）。
- 验收：`timeline-*` 测试通过；浅色和深色、高 DPI（1.25 / 1.5 / 2）截图；右键菜单与边缘提示位置正确。

### P8 清理与收尾（M）

- 删除 `legacy` 层里所有已被取代的规则、`md-compat.css` 和旧变量；全部 JS 改用 MD3 令牌名；`accent.js` 只留下兼容事件，或整体删除。
- 目标：`!important` 降到个位数（只留给 `[hidden]` 等），`backdrop-filter` 只用在少数悬浮层；记录 CSS 总行数。
- 文档：`PROJECT_MAP.md` §2 / §4 / §6 / §7 / §8、`README.md`（主题说明）、`docs/THEME_PACKS.md`、`docs/UI_INTEGRATION.md`；用 `tests/gen-lang.mjs` 重新生成 `lang/zh-CN.json` 并核对文案。
- 验收：完整回归 0 失败；ESLint 0 error；全尺寸、浅深色、reduced-motion 截图验收；源码服务冒烟（`/api/version`、静态白名单可达）；可选：SEA 构建＋安装包冒烟（不覆盖用户已装版本）。

### 工作量与顺序

| 阶段 | 规模 | 依赖 |
| --- | --- | --- |
| P0 | S | — |
| P1 | M | P0 |
| P2 | L | P1 |
| P3 | M | P2 |
| P4 / P5 | L / L | P3（可交替进行） |
| P6 | L | P3 |
| P7 | M | P1（可与 P4～P6 并行） |
| P8 | M | 全部 |

## 5. 测试与验收总则

- 每阶段：定向测试＋`node tests/run-all.mjs --report _test/md3-<阶段>.json` 全量 0 失败；`npx --yes eslint@9 editor/ tools/ tests/` 0 error；改过的前端模块用测试同步 `tests/jsmod/` 镜像并一起提交。
- 视觉验收矩阵：5 个视口 × 浅色 / 深色 × 3 个种子色（默认蓝、橙、高亮黄）＋ reduced-motion；控制台 0 错误；`scrollWidth === innerWidth`。
- 无障碍：文字对比度达到 WCAG AA；全键盘可达；焦点可见；图标按钮都有 `aria-label`。
- 性能：5000 行字幕滚动、首页 100 个稿件、时间轴缩放平移，与 P0 对比不劣化。
- GPU / 模型 / 真实媒体相关流程只在条件具备时验收，没执行的在 STATUS 写明。

## 6. 决策（2026-10-18 用户确认，全部按建议执行）

| # | 问题 | 结论 |
| --- | --- | --- |
| D1 | 毛玻璃三参数（压暗 / 模糊 / 透明度）和流光、图片背景是否保留 | 保留"纯色 / 图片"背景（加 scrim）；面板改为不透明色调表面；三个滑块合并为一个"背景遮罩强度"；流光并入纯色的动态变体或下线。**P1 落地：流光下线**（旧偏好落回纯色），遮罩强度 40–95%、默认 68%（等于原图片背景 0.32 的不透明度） |
| D2 | 自定义主题包导入 / 导出是否保留 | 保留，升级为 v2（种子色＋角色覆盖），兼容导入 v1 |
| D3 | 花瓣 FAB、40° 胶囊、波浪进度这些 Expressive 元素 | 保留 |
| D4 | 界面字体 | 只用系统字体栈，不打包 Web 字体（不增大安装包） |
| D5 | 默认种子色 | `#5789DC`（现 Material You 默认） |
| D6 | 大型工具对话框是否保持可拖动 | 保留拖动（项目扩展），确认框和简单对话框固定居中 |

P0 的基线证据、控件盘点和发现的问题（F1–F8）见 [MD3_INVENTORY.md](MD3_INVENTORY.md)。

## 7. 不变量（每阶段自查）

1. 不新增构建步骤或 npm 依赖；不用 Shadow DOM；`server.js` 保持单文件。
2. 业务 JS 依赖的 `id`、`data-*`、事件委托选择器与 DOM 嵌套不变，要改先 grep 全部引用。
3. `[hidden]` 必须真正隐藏（全局规则保留在最高层）。
4. `#range-bar` 留在 `#app` 之外；带 `backdrop-filter` / `transform` 的祖先不要包住 fixed 元素。
5. 字幕卡与 `.cue-measure` 的尺寸规则同源；长列表不加逐项阴影或模糊。
6. 新文案进 `lang/zh-CN.json`；图标不插进文本节点中间。
7. 弹层 `pop-in` 规范（PROJECT_MAP §6）由 MD3 动效令牌接管，但仍保留"从触发点长出、120～150ms、不从 scale(0) 开始、reduced-motion 关闭"。
8. 新增静态文件登记 `STATIC_RESOURCES`；结构或职责变化同步更新 `PROJECT_MAP.md`。
9. 不碰字幕渲染、逐词数据、后处理特效、保存协议。

## 8. 风险

| 风险 | 缓解 |
| --- | --- |
| 旧 CSS 覆盖链导致新样式不生效或回退 | `@layer` 固定层序；每阶段删掉被取代的旧规则 |
| 结构调整打断 JS 绑定 | 只加 class；改结构先 grep 引用；真实浏览器跑交互流程 |
| 虚拟滚动高度错乱 | 卡片与测量容器同源；用测试断言 `_h` 计算；验收时滚到底 |
| HCT 移植出错 | 用官方参考值做单元测试；保留 Apache-2.0 声明 |
| 用户旧偏好丢失 | 一次性迁移并保留种子色；迁移逻辑有测试 |
| 大量源码断言测试失效 | 每阶段同步改断言，删测试必须在 STATUS 写原因 |
| 周期长、中间态混杂 | 每阶段都可发布；兼容层保证新旧并存时视觉不崩 |
