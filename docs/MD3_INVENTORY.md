# MD3 重构 P0：基线与组件盘点

> 配套计划：[MD3_REDESIGN_PLAN.md](MD3_REDESIGN_PLAN.md)。本文件记录 P0 的基线证据（2026-10-18）和"现有控件 → MD3 组件"映射，
> 供 P1–P8 对照。基线截图与报告在被忽略的 `_test/md3-p0/` 下，不入库；需要时按 §1.4 重新生成。

## 1. 基线证据

### 1.1 测试

- `node tests/run-all.mjs --report _test/md3-p0-baseline.json`（Node v20.19.2，WSL）：**91 通过、9 部分执行、0 失败、2 排除**，与 2026-10-18 上一轮一致；`tests/jsmod/` 无差异。

### 1.2 截图

- 位置：`_test/md3-p0/baseline/`，共 135 张，附 `manifest.json`（每张图记录视口、请求的主题、页面实际的 `data-theme` / `data-design`、横向溢出、新增控制台错误）。
- 覆盖：
  - Studio 主题包（当前默认），浅色与深色 × 5 个视口（1600×900、1280×720、1024×768、900×800、800×600）× 11 个页面：稿件库、任务中心、新建、详细信息（初稿暂停）、设置·模型、设置·外观、帮助、编辑器的字幕 / 角色 / 设置 / 日志页。
  - 1600×900 补充：设置的另 4 个分类、查找替换、字幕卡右键菜单、快捷键对话框、空稿件库。
  - Material You 主题包：浅色与深色 × 1600×900 × 稿件库、任务中心、设置·外观、编辑器字幕页（作为目标方向的参考）。
- 结果：135 张的实际主题与请求一致；**横向溢出 0；新增控制台错误 0**。
- 已作废：`_test/md3-p0/shots/` 是第一次运行的结果，深色和 Material 截图没有生效（见 §1.4），不要使用；该目录可以删除。

### 1.3 性能（5000 行长稿，1600×900，无头 Chrome，`--disable-gpu`）

无头模式下 rAF 被限制在约 20fps（每帧约 50ms），帧时间只能看相对变化；以 `Performance.getMetrics` 统计的主线程耗时为主要指标。原始数据：`_test/md3-p0/perf-baseline.json`。

| 场景（时长） | 样式重算 | 布局 | 脚本 | 主线程任务合计 | 帧时间 平均 / p95 / 最大 |
| --- | --- | --- | --- | --- | --- |
| 12 行，空闲 3s | 3.7ms | 19.4ms | 13.5ms | 106ms | 44 / 50 / 50ms |
| 12 行，滚动 5s | 15.1ms | 35.9ms | 32.2ms | 196ms | 45 / 50 / 67ms |
| 5000 行，空闲 3s | 3.7ms | 18.7ms | 15.0ms | 109ms | 47 / 50 / 83ms |
| **5000 行，滚动 5s** | **360ms** | **204ms** | **152ms** | **1048ms** | 55 / 67 / 117ms |

- 5000 行稿件从切换路由到列表出现约 0.6s。
- 滚动时样式重算是最大头，与卡片选择器复杂度直接相关。P6 的验收以这组数字为对照，目标是不劣化，最好下降。

### 1.4 复现方法与环境注意

- 隔离运行：把 `editor/`、`asr/` 复制到临时目录后启动 `PORT=8399 node editor/server.js --no-tray`，不在仓库根目录生成 `projects/`。在副本里执行 `fetch-vendor.js` 补齐 libass。
- 测试数据：40s 的 `testsrc2` 加 `sine` 音轨视频；12 行和 5000 行的合成双语逐词 ASS（3 个角色、行首角色标签、逐词 `\c` 高亮）；另外手写两个初稿元数据，分别为暂停（翻译 86%）和失败（识别 34%）。
- WSL 下运行：`tools/lib/cdp.mjs` 写死的是 Windows 浏览器路径和 Linux 临时 profile 目录；在 WSL 里要改用 `/mnt/c/...` 的 Chrome 路径和 Windows 临时目录，Node 20 还要加 `--experimental-websocket`。服务端的 ffmpeg 可以用包装脚本调用 Windows 的 `ffmpeg.exe`（参数里的路径用 `wslpath -w` 转换）。
- 两个踩坑：
  1. `Page.navigate` 到只差 hash 的同一个 URL 是同文档跳转，页面不会重新加载，写进 localStorage 的偏好不生效。必须先跳 `about:blank`。截图前要断言 `body.dataset.theme` 和 `themePack`。
  2. 同一个浏览器里快速切换文档后，新页面的 `/api` 请求会一直排队，最后被前端超时中止（`ERR_ABORTED`），但服务端直接 curl 只要 10～30ms。推测是上一个文档的 SSE 和媒体长连接还没释放，占满了同一主机最多 6 个 HTTP/1.1 连接。每切换一次偏好就换一个全新的浏览器可以规避。**正常使用中是否发生未验证**，见 §3 F6。

## 2. 控件盘点

### 2.1 各区域控件数量（`studio.html` 静态标记；JS 生成的另列于 §2.3）

| 区域（起始 id） | 按钮 | 文本输入 | 勾选 | 滑块 | 下拉 | 多行文本 | 主要 class |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 侧边导航 `#sf-nav` | 1 | 0 | 0 | 0 | 0 | 0 | 导航用 `<a data-route>` |
| Studio 顶栏 `#sf-topbar` | 2 | 0 | 0 | 0 | 0 | 0 | `.btn` `.btn-accent` |
| 帮助页 `#sf-help` | 2 | 0 | 0 | 0 | 0 | 0 | `.btn` `.btn-accent` |
| 编辑器工具栏 `#toolbar` | 4 | 0 | 0 | 0 | 0 | 0 | `.btn` `.btn-accent` |
| 视频区 `#stage-wrap` | 0 | 1 | 0 | 0 | 0 | 0 | 就地编辑输入 |
| 编辑器右面板 `#editor-panel` | 33 | 14 | 17 | 12 | 10 | 0 | `.btn`×25 `.btn-mini`×24 `label.switch`×13 `input.range`×12 `select.btn`×6 `select.btn-mini`×5 `.ptab`×4 `select.select`×4 |
| 时间轴面板 `#timeline-panel` | 8 | 1 | 1 | 0 | 1 | 0 | `.tl-menu-item`×5 `.danger`×2 `.rb-btn`×2 `.switch-mini` |
| 编辑器弹层（`#fr-overlay` 起） | 40 | 11 | 4 | 0 | 1 | 2 | `.btn`×30 `.btn-accent`×9 `.tl-menu-item`×7 `.fr-input`×4 `.fr-tab`×2 `.fr-chk`×2 `.fr-dd`×2 |
| 稿件库 / 任务中心 `#home-view` | 11 | 1 | 0 | 0 | 0 | 0 | `.btn`×5 `.btn-accent`×2 `.sf-flower` `.sf-orbit` |
| 详细信息 `#detail-view` | 8 | 2 | 2 | 0 | 4 | 2 | `.np-select`×4 `.ws-fld`×3 `.np-input`×2 `.ws-check`×2 `.np-area`×2 `.page-back` |
| 新建稿件 `#np-view` | 11 | 7 | 5 | 0 | 5 | 2 | `.np-input`×5 `.np-select`×5 `.ws-fld`×3 `.np-switch`×3 `.np-mode`×2 `.np-time`×2 |
| 设置 `#st-view` | 24 | 4 | 0 | 0 | 3 | 1 | `.st-tab`×6 `.sf-asr-family`×5 `.st-input`×4 `.st-label`×3 `.select`×3 |
| LLM 方案抽屉及之后（`#st-scheme-drawer` 起） | 26 | 25 | 7 | 3 | 10 | 1 | `.st-input`×20 `.st-lbl`×4 `.st-select`×2 `.sf-background-choice`×3 |

浮层与菜单（静态）：`#confirm-overlay` `#cue-text-overlay` `#fix-overlay` `#fr-overlay` `#pick-overlay` `#realign-overlay` `#reflect-overlay` `#rim-overlay` `#srt-overlay`；菜单 `#card-menu` `#role-menu` `#tl-menu` `#fr-src-menu` `#fr-dst-menu`；另有 `modal.js` 可拖动二级窗口、toast、`#job-card`、`#range-bar`。

### 2.2 现有样式 → MD3 组件

同一种控件目前有多套写法，统一是 P2 的主要工作：

| 现有写法 | 套数 | MD3 组件 | 统一后的变体 |
| --- | --- | --- | --- |
| `.btn-accent` | 1 | Filled button | 每屏只有一个主操作 |
| `.btn`、`.sf-pack-select`、`.pc-details`、模型卡 `.sm-*` | 多 | Outlined / tonal / text button | 默认 outlined；次要强调用 tonal；行内次要用 text |
| `.btn-mini`、`.rb-btn` | 2 | Button 小号（Expressive S 尺寸）/ icon button | 密集区域（编辑器右面板、时间轴）用 |
| `.danger` | 1 | Button 的 error 配色 | |
| `select.btn`、`select.btn-mini`、`select.select`、`.np-select`、`select.st-input`、`.st-select`、`.ws-fld`、`.note-dur` | **8** | Select（outlined） | 两档：标准（表单）、紧凑（工具栏 / 面板） |
| `.np-input`、`.st-input`、`.fr-input`、`.np-time`、搜索框、`.fp-filter`、就地编辑框 | **7** | Text field（outlined） | 标准、紧凑、搜索（search bar）、行内 |
| `.np-area`、多行 `textarea` | 2 | Text field 多行 | |
| `label.switch`、`.switch-mini`、`.np-switch` | 3 | Switch | 标准、紧凑 |
| `.ws-check`、`.fr-chk`、`.badcat-item` | 3 | Checkbox | |
| `input.range` | 1 | Slider | |
| `.ptab`（编辑器四页）、`.st-tab`（设置二级）、`.fr-tab`、`[data-log]` | 4 | Tabs | 编辑器与设置用 secondary tabs |
| `.np-mode`、视图切换、显示模式 | 3 | Segmented button | |
| `.tl-menu-item`、`.fr-menu-item`、`#card-menu`、`#role-menu`、`#tl-menu`、`.fr-dd` 下拉菜单 | 6 | Menu | |
| `*-overlay` 共 9 个、`modal.js` | 10 | Dialog | 简单确认居中固定；大型工具对话框可拖动（D6） |
| toast、`#sf-notice` | 2 | Snackbar / banner | |
| `#job-card` | 1 | 带进度的 snackbar 变体 | |
| `#range-bar` | 1 | 浮动工具栏（menu 外观） | 必须留在 `#app` 外 |
| `.sf-flower` | 1 | FAB（花瓣 Expressive 变体，D3 保留） | |
| `.sf-orbit` | 1 | 统计胶囊（Expressive，D3 保留） | |
| `.sf-asr-family`、模型系列折叠 | 2 | List / expansion list | |
| `.sf-background-choice`、主题包卡片 | 2 | 可选卡片（单选卡片） | |
| `.cc-chip`、徽标、热词块 | 3 | Assist / input chip、badge | |
| `.page-back` | 1 | 顶栏返回 icon button | |
| 项目卡、设置卡、`.ws-panel`、Quiet Card 字幕卡 | 4 | Card（elevated / filled / outlined） | 字幕卡与 `.cue-measure` 共用规则 |

### 2.3 JS 生成的控件（需要改模板函数的位置）

| 文件 | 生成的控件 class（出现次数） |
| --- | --- |
| `project.js` | `.btn`×26 `.btn-mini`×20 `.sm-pyinstall`×4 `.btn-accent`×3 `.pc-details`×2 `.sm-del`×2 `.sm-dl`×2 `.sm-pyset`×2 `.sm-pyreset`×2 `details.sf-settings-details`×2 |
| `main.js` | `.fr-menu-item`×2 `.btn`×2 `.btn-mini`×2 `.fr-menu-unassigned` `label.badcat-item` `.note-go` `.note-del` |
| `color-picker.js` | `.btn`×3 `.btn-mini`×3 `.sscp-swatch`×2 `.sscp-x` `.btn-accent` |
| `editor.js` | `.pick-row` `.cc-chip` `.cc-rerecog`（另有 Quiet Card 整卡模板 `_cardHtml`） |
| `studio.js` | `.btn`×2 `.sf-pack-select` `.sf-pack-delete` |
| `font-picker.js` | `input.fp-filter` |

## 3. P0 发现的问题（作为后续阶段的输入）

| # | 问题 | 证据 | 处理阶段 |
| --- | --- | --- | --- |
| F1 | 浅色模式下，导航、顶栏、稿件卡等表面是 `rgba(0,0,0,.2)` 加 `blur(18px)`，整体发灰发脏 | 计算样式实测；`studio-light-*-home.png`、`*-new.png` | **P1 已解决**：表面改为不透明色调，浅色截图不再发灰 |
| F2 | 800×600 的编辑器里视频区几乎被压没；工具栏右侧按钮和保存状态被截断（父容器裁剪，所以没有产生页面横向滚动） | `studio-*-800x600-editor-*.png` | P6（编辑器内部布局；P3 只处理了外壳，外壳在 800×600 下已无溢出） |
| F3 | "ASS 渲染就绪"提示是深色药丸配暗绿字，对比度低，并且出现在所有页面上、压着顶栏 | 多数截图顶部居中 | **P3 已解决**：改为底部 MD3 snackbar（反色表面），「ASS 渲染就绪」只在编辑器里提示 |
| F4 | 深色设置页里选中的导航项、"本机配置"标签对比度不足 | `studio-dark-1600x900-settings-models.png` | **P1 已解决**：选中项与标签改用 primary-container / on-primary-container |
| F5 | 同类控件写法过多：下拉 8 套、文本框 7 套、开关和勾选 6 套 | §2.2 | P2 |
| F6 | 测试驱动快速切换文档后，`/api` 请求排队直到超时（推测是同主机 6 连接上限被上一个文档的长连接占满）；正常使用中未验证 | §1.4 | 不在本重构范围；如果真实使用中复现，单独立项 |
| F7 | 页面标题带英文等宽眉标（"PROJECT WORKSPACE"、"MAKE IT FEEL LIKE YOU"），与中文标题层级不统一 | 新建、设置截图 | P4 / P5（按 MD3 字体层级重排） |
| F8 | 滚动 5000 行长稿时，样式重算 360ms / 5s，是主线程最大开销 | §1.3 | P6（简化卡片选择器，长列表禁用逐项阴影和模糊） |
| F9 | 浅色模式下，查找替换对话框里的"正文/角色"分段按钮和提示条仍是写死的深色块（P0 已存在，P1 未改动） | `md3-light-1600x900-dialog-find-replace.png` 与 P0 同名截图对比 | P6（编辑器弹层换成 MD3 对话框 / 分段按钮） |
| F10 | 首页卡片的状态徽标（如"待翻译"）在任何种子色下都是写死的蓝色 | `seedFFD54A-light-1600x900-home.png` | P4 |
| F11 | 1024 宽时首页内容区（`#home-view`）底部出现横向滚动条，页面本身不溢出 | `md3-p1/shots/md3-light-1024x768-home.png`、`md3-p3/home-1024-rail.png` | P4 |

## 4. P1 验收（2026-10-18）

- 完整 JS 回归 `node tests/run-all.mjs --report _test/md3-p1-run2.json`（Node v20.19.2）：**91 通过、9 部分执行、0 失败、2 排除**。部分执行的 9 项与 P0 基线是同一批。测试总数仍为 101：删除 `uwp-theme-test.mjs`，新增 `md-color-test.mjs`。`tests/jsmod/` 镜像与源码逐字节一致。
- ESLint（`npx --yes eslint@9 editor/ tools/ tests/`）：0 error。P1 改动的文件没有新增 warning，`studio.js` 第 569 行的 2 个 warning 在 HEAD 就已存在。
- 截图：`_test/md3-p1/shots/`，共 139 张（Material 浅色和深色 × 5 个视口 × 11 个页面，外加补充页面、对话框、空状态，以及橙 `#FF7A45` 和亮黄 `#FFD54A` 两个极端种子色）。实际主题全部为 material，视口全部匹配，横向溢出 0，控制台错误 0。
- 性能（`_test/md3-p1/perf.json`，与 §1.3 同一方法）：滚动 5000 行时平均帧时间从 54.8ms 降到 16.7ms，达到 60fps 上限。按帧折算，主线程耗时 11.5 → 10.8ms，样式重算 3.96 → 1.92ms。帧率提升来自去掉 `backdrop-filter` 带来的合成开销；总量数字因为 5 秒内多渲染了 3.3 倍的帧而变大，不能直接比较。
- 首屏颜色：`md-color.js` 在 `<head>` 中同步写入颜色与 `data-theme`，`<body>` 的第一个子节点把主题复制到 body，在任何内容解析之前完成（`md-color-test` 断言）。没有做逐帧录屏验证。

