# SubFabric 主题包

自 MD3 重构（2026-10-18）起，SubFabric 的界面统一使用 Material Design 3。主题包只描述**颜色**，不再切换设计风格：

- 内置主题包只有 **Material You**（默认种子色 `#5789DC`）。
- 以前的 Studio、SubFabric Classic、Windows UWP 三个内置包已经下线。选过它们的用户会自动迁移到 Material You：Studio 和 Classic 保留原来自选的强调色，Windows UWP 保留当时固定使用的 Windows 蓝 `#0078D7`。这几种代表色也都在"主题色"的预设色块里。
- 设置 → 外观与体验 → 主题色与主题包：可以直接改种子色，也可以导入、导出自己的主题包。

## 配色是怎么生成的

界面配色由一个**种子色**生成（MD3 的 TonalSpot 方案，算法移植自 Google material-color-utilities）。种子色决定色相；主色、次色、第三色、中性色各自取固定色度，再按 MD3 规定的明度（tone）取出约 30 个颜色角色。例如：

- `primary`：浅色 tone 40 / 深色 tone 80
- `on-primary`：浅色 tone 100 / 深色 tone 20
- 表面：`surface-container-low`、`surface-container` 等

因为同一个 tone 在任何色相下明度都一样，换任何种子色，文字和背景的对比度都能达标（测试覆盖了 14 个种子，正文配对都不低于 4.5:1）。

## 自定义主题包（v2）

主题包是一个 JSON 文件。最简单的做法是在设置页导出当前主题包，改 `id`、名称、描述和颜色，再导入：

```json
{
  "schema": "subfabric-theme-v2",
  "id": "my-theme",
  "name": "我的主题",
  "version": "1.0.0",
  "description": "我的工作区配色",
  "author": "可选作者",
  "seed": "#5C7560",
  "roles": {
    "light": {
      "primary": "#3E6544",
      "surface": "#F7F9F2"
    },
    "dark": {
      "primary": "#A3D3A6"
    }
  },
  "assets": {
    "preview": "data:image/png;base64,..."
  }
}
```

- `seed`：必填，`#RRGGBB`。整套配色由它生成。
- `roles`：可选，按 `light` / `dark` 覆盖个别颜色角色。角色名必须是 MD3 角色（`primary`、`on-primary`、`primary-container`、`secondary…`、`tertiary…`、`error…`、`surface`、`surface-dim`、`surface-bright`、`surface-container-lowest` 到 `surface-container-highest`、`on-surface`、`surface-variant`、`on-surface-variant`、`inverse-surface`、`inverse-on-surface`、`inverse-primary`、`outline`、`outline-variant`、`shadow`、`scrim`），值必须是 `#RRGGBB`。**覆盖后的对比度由你自己负责**；只想换颜色倾向时，改 `seed` 就够了。
- `assets.preview`：可选，只接受内嵌的 PNG、JPEG 或 WebP（`data:` URL）。
- 主题包不能包含脚本、CSS、HTML、SVG 或远程 URL，也不再有 `design` 字段。导入文件不能超过 800KB。

## 旧版主题包（v1）

`schema` 为 `subfabric-theme-v1` 的旧包仍然可以导入，但**只保留种子色**：v1 的 `tokens` 和 `design` 是按已下线的设计风格绘制的，套到 MD3 的颜色角色上会破坏对比度，所以导入时会丢弃，并给出提示。浏览器里已保存的 v1 自定义包也会按同样规则自动升级。

## 其他规则

- 导入同名自定义包会替换旧版本；导入内置包会自动生成一个带 `-custom` 后缀的副本。
- 下线的内置包 id（`studio`、`subfabric-classic`、`windows-uwp`）不能被自定义包占用。
- 内置包不能删除；自定义包可以在主题卡片右上角删除，删除当前使用的包时回到 Material You。
