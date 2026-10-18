// MD3 重构 P6：编辑器工作台（editor/css/app-editor.css）的源码约定、入口接线、F2 / F9 修正与字幕卡尺寸同源约束。
// 字幕卡结构与测量容器的行为在 card-style-test / row-rerecog-test 里验证；就地编辑几何在 video-geometry-test。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. 样式约定
const raw = read('editor/css/app-editor.css');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/!important/.test(css), 'no !important');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/#[a-z][\w-]*/g, '')) && !/\b(rgba?|hsla?)\(/.test(css), 'colors come only from MD3 tokens');
ok(!/transition\s*:\s*all\b/.test(css), 'no transition: all');
for (const decl of css.matchAll(/(transition|animation)\s*:\s*([^;]+);/g)) {
  ok(/var\(--md-motion-/.test(decl[2]) && !/\d+m?s\b/.test(decl[2]), `${decl[1]} uses motion tokens: ${decl[2]}`);
}
ok(!/backdrop-filter/.test(css), 'no backdrop-filter (it would contain fixed popups such as #range-bar)');
// 字幕卡与 .cue-measure 共用尺寸：本文件不得改卡片的盒模型（只能通过 --cc-* 换颜色）
ok(!/\.cue-card|\.cc-|\.cue-measure|#cue-list\s+\./.test(css), 'app-editor.css never touches subtitle-card geometry (height stays in sync with .cue-measure)');
ok(!/#sf-player/.test(css), 'player controls keep their own button styles');
ok(/:is\(#toolbar, #editor-panel, #timeline-panel, \.modal-surface, \.fr-box, \.rn-box, \.pick-box, \.fix-box, \.ctd-box, #job-card\) \.btn \{/.test(css), 'template buttons in editor areas map to MD3');
ok(/#panel-tabs \.ptab\.active \{ border-bottom-color: var\(--md-sys-color-primary\)/.test(css), 'panel tabs are MD3 secondary tabs');
ok(/\.switch input:checked \+ \.switch-slider \{ border-color: transparent; background: var\(--md-sys-color-primary\); \}/.test(css), 'legacy switches look like MD3 switches');
// F2：≤900px 与 studio.css 的窄屏定位同一断点；只在编辑器工作区放开高度，面板限高（虚拟滚动需要固定视口）
const narrow = css.slice(css.indexOf('@media (max-width: 900px)'));
ok(/@media \(max-width: 900px\) \{/.test(css) && /@media \(max-width: 900px\)/.test(read('editor/css/studio.css')), 'F2: same breakpoint as the legacy stacked layout');
ok(/\.sf-studio\[data-workspace=editor\] #app \{[^}]*height: auto;[^}]*grid-template-rows: auto minmax\(280px, 52vh\) 8px var\(--tl-h\) minmax\(480px, 80vh\);/.test(narrow), 'F2: stacked rows give the video at least 280px and cap the subtitle panel');
ok(/#toolbar \.btn:has\(> \.ico\) \{[^}]*font-size: 0;/.test(narrow), 'F2: narrow toolbar keeps icon buttons (text stays as accessible name)');
// F9：查找替换不再有写死的深色块
ok(/\.fr-tabs \{[^}]*background: transparent;/.test(css) && /\.fr-hint \{[^}]*background: var\(--md-sys-color-surface-container-highest\)/.test(css) && /\.fr-input \{[^}]*background: transparent;/.test(css), 'F9: find / replace uses tonal surfaces');
const legacy = read('editor/css/studio.css');
ok(!/#(101015|131318|141418|141419|17171d|1c1c24|23232d|26262f)\b/.test(legacy), 'F9: dark surface hex colors are gone from the legacy layer');
ok(!/#ffd54a|#ffe08a|rgba\(255, ?213, ?74/.test(legacy.replace(/--sub-sub: #ffd54a;/, '')), 'warning yellow (unreadable on light surfaces) replaced by --sf-color-warning');
ok(/--sf-color-warning: color-mix\(in srgb, var\(--md-sys-color-error\) 55%, var\(--md-sys-color-on-surface\)\);/.test(read('editor/css/md-tokens.css')), 'warning token derives from MD3 roles');
const cardVars = legacy.slice(legacy.indexOf(':is(#editor-panel #cue-list, .cue-measure) {'), legacy.indexOf(':is(#editor-panel #cue-list, .cue-measure) .cue-card {'));
ok(/--cc-shadow: none;/.test(cardVars) && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(cardVars), 'subtitle cards: MD3 colors, no per-item shadow in the long list');
const tokens = read('editor/css/md-tokens.css');
for (const role of new Set([...css.matchAll(/var\(--md-type-([a-z-]+)\)/g)].map(m => m[1]))) ok(tokens.includes(`--md-type-${role}:`), `font shorthand --md-type-${role} exists`);

// 2. 入口接线
const app = read('editor/css/app.css');
ok(/@import url\("app-editor\.css"\) layer\(app\);/.test(app) && app.indexOf('"app-settings.css"') < app.indexOf('"app-editor.css"'), 'imported last into the app layer');
ok(read('editor/server.js').includes("'/editor/css/app-editor.css'"), 'static allowlist serves app-editor.css');
ok(/'app-editor'\]\.map\(n => `editor\/css\/\$\{n\}\.css`\)/.test(read('tools/studio-install.mjs')), 'UI installer ships app-editor.css');

// 3. 不变量：#range-bar 仍在 #app 之外；就地编辑的几何代码未改
const html = read('editor/studio.html');
{
  // 按 div 嵌套找到 #app 真正的闭合位置（第 840 行附近那个带「/#app」注释的 </div> 是早已存在的多余闭合，浏览器会忽略）
  const start = html.indexOf('<div id="app">');
  let depth = 0, end = -1;
  for (const m of html.slice(start).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) { end = start + m.index; break; }
  }
  ok(end > start && html.indexOf('id="range-bar"') > end, '#range-bar stays outside #app (PROJECT_MAP §6)');
}
ok(html === read('tools/templates/studio.html'), 'generator template stays identical to the entry');

console.log(`App editor: ${checks} checks — tokens-only styles, card geometry untouched, F2 stacked layout, F9 tonal dialog, warning token, wiring passed`);
