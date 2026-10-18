// MD3 重构 P3：应用外壳（editor/css/app-shell.css）的源码约定、入口接线、旧规则清理与关键行为钩子。
// 导航栏展开 / 收起的运行时行为在 studio-navigation-test.mjs 里用真实 studio.js 验证。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. 外壳样式约定
const shell = read('editor/css/app-shell.css').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/!important/.test(shell), 'shell styles never need !important (the app layer already wins)');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(shell) && !/\b(rgba?|hsla?)\(/.test(shell), 'shell colors come only from MD3 tokens');
ok(!/transition\s*:\s*all\b/.test(shell), 'no transition: all');
for (const decl of shell.matchAll(/(transition|animation)\s*:\s*([^;]+);/g)) {
  ok(/var\(--md-motion-/.test(decl[2]) && !/\d+m?s\b/.test(decl[2]), `${decl[1]} uses motion tokens: ${decl[2]}`);
}
ok(/@media \(max-width: 1199px\) \{ :root \{ --sf-nav-w: 80px; \} \}/.test(shell), 'below 1200px the drawer collapses into an 80px rail');
ok(/:root \{ --sf-nav-w: 248px; --sf-top-h: 64px; \}/.test(shell), 'drawer width and MD3 top app bar height');
ok(/\[data-nav-open=true\] #sf-nav-scrim/.test(shell), 'modal drawer has a scrim');
ok(/:is\(#home-view, \.workspace-page, \.sf-page\):not\(\[hidden\]\) \{ animation: sf-fade-in/.test(shell)
  && !/@keyframes sf-fade-in \{[^}]*transform/.test(shell), 'page transition only fades (no transform → no containing block for fixed popups)');
ok(/#toast,\s*\.sf-studio #sf-notice \{[^}]*bottom: 24px;[^}]*background: var\(--md-sys-color-inverse-surface\)/.test(shell), 'toast and notice are MD3 snackbars');

// 2. 入口接线
const app = read('editor/css/app.css');
ok(/@import url\("app-shell\.css"\) layer\(app\);/.test(app) && app.indexOf('@import url("md-components.css")') < app.indexOf('@import url("app-shell.css")'), 'shell is imported last, into the app layer');
ok(read('editor/server.js').includes("'/editor/css/app-shell.css'"), 'static allowlist serves app-shell.css');
ok(/'app-shell'\]\.map\(n => `editor\/css\/\$\{n\}\.css`\)/.test(read('tools/studio-install.mjs')), 'UI installer ships app-shell.css');

// 3. 被接管的旧规则已删除，避免旧属性漏出来
const legacy = read('editor/css/studio.css');
for (const [re, what] of [[/^\.sf-nav \{/m, '.sf-nav'], [/^\.sf-topbar \{/m, '.sf-topbar'], [/^#toast \{/m, '#toast'], [/@keyframes toast-in/, 'toast keyframes'],
  [/#sf-notice \{/, '#sf-notice'], [/\.sf-nav a:focus-visible/, 'nav focus override'], [/\.sf-folder-head button \{/, 'folder add button'], [/\.sf-brand-mark \{/, 'brand mark']]) {
  ok(!re.test(legacy), 'legacy rule removed: ' + what);
}

// 4. 结构与可访问性钩子
const html = read('editor/studio.html');
const nav = html.slice(html.indexOf('<aside id="sf-nav"'), html.indexOf('</aside>'));
ok(/<button type="button" class="md-icon-button sf-nav-toggle" id="sf-nav-toggle" data-ico="menu" aria-label="展开导航" aria-expanded="false" aria-controls="sf-nav">/.test(nav), 'rail menu button');
ok([...nav.matchAll(/<a href="#\/[a-z]+" class="md-nav-item" data-route="/g)].length === 4, 'all four destinations are MD3 nav items');
ok(/<\/aside>\s*<div id="sf-nav-scrim" aria-hidden="true"><\/div>/.test(html), 'scrim sits outside the nav, below it in z-order');
ok(/id="sf-direct-editor"/.test(html) && /class="md-button md-button--tonal" id="sf-direct-editor"/.test(html) && /class="md-button md-button--filled" id="sf-create"/.test(html), 'top app bar actions are MD3 buttons (one filled primary)');
ok(/<div class="rn-box modal-surface" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">/.test(html), 'confirm box has dialog semantics');
ok(!/id="confirm-title"[^>]*modal-drag-handle|class="rn-title modal-drag-handle" id="confirm-title"/.test(html), 'confirm title is not a drag handle (D6)');
ok(!/'#confirm-overlay'/.test(read('editor/js/modal.js')), 'confirm box is no longer draggable (D6)');
ok(/const opener = document\.activeElement;[\s\S]{0,400}opener\.focus\(\)/.test(read('editor/js/editor.js')), 'confirm box returns focus to its opener');
ok(/if \(msg !== 'ASS 渲染就绪' \|\| document\.body\.dataset\.workspace === 'editor'\) toast\(msg\);/.test(read('editor/js/main.js')), '"ASS ready" only toasts inside the editor (F3)');
const studio = read('editor/js/studio.js');
ok(/class="md-nav-item\$\{folder === f\.id \? ' active' : ''\}"/.test(studio) && /class="md-icon-button md-icon-button--small" data-remove-folder/.test(studio), 'folders render as nav items with icon-button removal');
ok(/menu: '<path/.test(read('editor/js/icons.js')), 'menu icon exists');
const dict = JSON.parse(read('editor/lang/zh-CN.json'));
ok(dict['展开导航'] && dict['收起导航'], 'new labels are in the editable dictionary');
ok(html === read('tools/templates/studio.html'), 'generator template stays identical to the entry');

console.log(`App shell: ${checks} checks — rail/drawer, top app bar, snackbars, menus, dialog semantics, legacy cleanup and wiring passed`);
