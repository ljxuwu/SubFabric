// MD3 重构 P4：首页 / 稿件库 / 任务中心 / 新建 / 详情（editor/css/app-home.css）的源码约定、入口接线、
// 结构钩子与旧规则清理。卡片的就地更新与进度动画行为在 home-project-list-test.mjs 里用真实 project.js 验证；
// 筛选、视图切换在 studio-navigation-test.mjs 里跑真实 studio.js。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. 样式约定
const css = read('editor/css/app-home.css').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/!important/.test(css), 'no !important (the app layer already wins)');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(css) && !/\b(rgba?|hsla?)\(/.test(css), 'colors come only from MD3 tokens (F10: no hard-coded status blue)');
ok(!/transition\s*:\s*all\b/.test(css), 'no transition: all');
for (const decl of css.matchAll(/(transition|animation)\s*:\s*([^;]+);/g)) {
  ok(/var\(--md-motion-/.test(decl[2]) && !/\d+m?s\b/.test(decl[2]), `${decl[1]} uses motion tokens: ${decl[2]}`);
}
ok(!/backdrop-filter/.test(css), 'no backdrop-filter on pages that host fixed popups');
ok(!/\.proj-card[^{]*\{[^}]*animation/.test(css) && !/anim-in/.test(css), 'cards have no entrance / breathing animation (progress animation stays running-only)');
ok(/\.home-list \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(280px, 1fr\)\);/.test(css), 'library is an adaptive minmax(280px, 1fr) card grid');
ok(/#home-view\[data-list=list\] \.home-list \{ grid-template-columns: minmax\(0, 1fr\);/.test(css), 'list view is a single-column MD3 list');
ok(/\.ws-grid \{ display: grid; grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 380px\);/.test(css)
  && /@media \(max-width: 919px\) \{\s*\.sf-studio \.ws-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/.test(css), 'new / details pages are a supporting pane that stacks below 920px');
ok(/#home-view \{[^}]*overflow-x: hidden;/.test(css), 'F11: home content never shows a horizontal scrollbar');
ok(/#home-view\[data-folders="0"\] \.sf-choice-assignment \{ display: none; \}/.test(css), 'folder picker on cards only appears once folders exist');
ok(/\.pc-st\.st-paused \{ background: var\(--md-sys-color-tertiary-container\)/.test(css), 'F10: status chips use container roles');
const tokens = read('editor/css/md-tokens.css');
for (const role of [...css.matchAll(/var\(--md-type-([a-z-]+)\)/g)].map(m => m[1])) ok(tokens.includes(`--md-type-${role}:`), `font shorthand token --md-type-${role} exists`);

// 2. 入口接线
const app = read('editor/css/app.css');
ok(/@import url\("app-home\.css"\) layer\(app\);/.test(app) && app.indexOf('"app-shell.css"') < app.indexOf('"app-home.css"'), 'imported into the app layer after the shell');
ok(read('editor/server.js').includes("'/editor/css/app-home.css'"), 'static allowlist serves app-home.css');
ok(/'app-home'[,\]][^\n]*\]\.map\(n => `editor\/css\/\$\{n\}\.css`\)/.test(read('tools/studio-install.mjs')), 'UI installer ships app-home.css');

// 3. 被接管的旧规则已删除（只剩共享的 .np-file-row 等给分段导入对话框用）
const legacy = read('editor/css/studio.css');
for (const [re, what] of [[/\.proj-card\s*[{,:.]/, '.proj-card'], [/\.pc-(main|name|meta|actions|draft|badge|st)\b/, '.pc-*'], [/\.ws-(grid|panel|head|badge|preview|meta|field|row|actions|idle)\b/, '.ws-*'],
  [/\.dp-(steps?|bar|log|line|actions)\b/, '.dp-*'], [/\.np-(mode|auto|input|area|select|switch|hint)\b/, '.np-* (workspace)'], [/\.sf-(hero|flower|resume|orbit|cover|assign)\b/, 'hero / cover'],
  [/#sf-(filters|search)\b/, 'library tools'], [/\.skel-(row|b)\b/, 'skeleton'], [/\.home-(inner|list|empty|head|title|toolbar)\b/, '.home-*']]) {
  ok(!re.test(legacy), 'legacy rule removed: ' + what);
}
ok(/\.np-file-row \{/.test(legacy) && /\.np-time \{/.test(legacy), 'shared rows used by the segment-import dialog stay');

// 4. 结构钩子
const html = read('editor/studio.html');
const home = html.slice(html.indexOf('<div id="home-view"'), html.indexOf('<!-- /#home-view -->'));
ok([...home.matchAll(/<button type="button" class="md-chip md-chip--filter( active)?" data-filter="[a-z]+" aria-pressed="(true|false)">/g)].length === 4, 'four filter chips with aria-pressed');
ok(/<label class="md-search md-search--dense sf-search" data-ico="search"><input id="sf-search" type="search"/.test(home), 'search is an MD3 search bar around the same #sf-search input');
ok(/<div class="md-segmented md-segmented--dense" id="sf-view" role="group" aria-label="视图"><button type="button" class="md-segment" data-view="grid" aria-pressed="true">卡片视图<\/button><button type="button" class="md-segment" data-view="list" aria-pressed="false">列表视图<\/button><\/div>/.test(home), 'view switch is a segmented button');
ok(!/sf-list-mode/.test(html + read('editor/js/studio.js')), 'old single toggle button is gone');
ok(!/YOUR NEXT STORY|PROJECT WORKSPACE|PROJECT DETAILS|ws-kicker/.test(html), 'F7: English mono eyebrows removed from home / new / details');
for (const view of ['np-view', 'detail-view']) {
  const start = html.indexOf(`<div id="${view}"`), part = html.slice(start, html.indexOf('\n</div>\n', start));
  const main = part.indexOf('<div class="ws-main">'), side = part.indexOf('<aside class="ws-side" aria-label="预览与进度">');
  ok(main > 0 && side > main, `${view}: main pane precedes the supporting pane`);
  const mainPart = part.slice(main, side), sidePart = part.slice(side);
  ok(/-input-title|detail-form/.test(mainPart) && /-set-title/.test(mainPart), `${view}: input and generate settings in the main pane`);
  ok(/-preview-title/.test(sidePart) && /-progress-title/.test(sidePart), `${view}: preview and progress in the supporting pane`);
  ok(!/class="btn[ "]/.test(part.replace(/<button type="button" class="btn page-back"[^>]*>/g, '')), `${view}: buttons are MD3 buttons`);
}
for (const id of ['dt-set-cast', 'dt-set-speakers', 'np-set-cast', 'np-autopost', 'np-region-on']) ok(new RegExp(`class="md-checkbox" id="${id}"`).test(html), `#${id} is an MD3 checkbox`);
for (const id of ['np-word', 'np-speakers']) ok(new RegExp(`class="md-switch md-switch--small" id="${id}"`).test(html), `#${id} is an MD3 switch`);
ok(html === read('tools/templates/studio.html'), 'generator template stays identical to the entry');

// 5. JS 拼的卡片与提示
const project = read('editor/js/project.js');
ok(/class="md-button md-button--small md-button--tonal pc-open"/.test(project) && /class="md-icon-button md-icon-button--small pc-del" aria-label="删除项目"/.test(project), 'card actions render as MD3 buttons; delete has an accessible name');
ok(!/class="btn[^"]*pc-/.test(project), 'no legacy .btn left on cards');
ok(!/style\.color = '#/.test(project) && /hint\.classList\.add\('is-warn'\)/.test(project), 'new-project warning uses a class, not an inline color');
const studio = read('editor/js/studio.js');
ok(/b\.setAttribute\('aria-pressed', String\(on\)\)/.test(studio) && /dataset\.folders = String\(prefs\.folders\.length\)/.test(studio), 'studio.js keeps chip state and folder count in the DOM');
const dict = JSON.parse(read('editor/lang/zh-CN.json'));
for (const k of ['视图', '预览与进度', '建议先确认「稿件预览」里的标题和作者，再开始创建。']) ok(dict[k], `dictionary has "${k}"`);

console.log(`App home: ${checks} checks — tokens-only styles, adaptive grid / list / supporting pane, MD3 controls, legacy cleanup and wiring passed`);
