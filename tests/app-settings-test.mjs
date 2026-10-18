// MD3 重构 P5：设置 / 帮助 / 日志（editor/css/app-settings.css）的源码约定、入口接线、结构钩子与旧规则清理。
// 设置分类切换、方案表单、遮罩强度等运行时行为在 studio-navigation-test.mjs 里用真实 studio.js / project.js 验证。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. 样式约定
const css = read('editor/css/app-settings.css').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/!important/.test(css), 'no !important (the app layer already wins)');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/#[a-z][\w-]*/g, '')) && !/\b(rgba?|hsla?)\(/.test(css), 'colors come only from MD3 tokens (log lists no longer hard-code a dark block)');
ok(!/transition\s*:\s*all\b/.test(css), 'no transition: all');
for (const decl of css.matchAll(/(transition|animation)\s*:\s*([^;]+);/g)) {
  ok(/var\(--md-motion-/.test(decl[2]) && !/\d+m?s\b/.test(decl[2]), `${decl[1]} uses motion tokens: ${decl[2]}`);
}
ok(!/backdrop-filter/.test(css), 'no backdrop-filter');
ok(/#st-view \.st-box \{[^}]*grid-template-columns: 224px minmax\(0, 1fr\);[^}]*background: transparent;/.test(css), 'settings is list-detail: category list + content, no shared tinted backdrop');
ok(/#st-view \.st-tabs \{[^}]*position: sticky;/.test(css), 'category list stays in view while the content scrolls');
ok(/@media \(max-width: 899px\) \{[\s\S]*?\.st-tabs \{ position: static; flex-direction: row;/.test(css), 'narrow windows turn the category list into a scrolling row');
ok(/#st-view \.st-tab\.active \{ background: var\(--md-sys-color-secondary-container\)/.test(css), 'selected category uses the MD3 navigation indicator');
ok(/:is\(\.st-card, \.st-section\) \{[^}]*border-radius: var\(--md-sys-shape-corner-large\);[^}]*background: var\(--md-sys-color-surface-container-low\);/.test(css), 'each group is a tonal card');
ok(/:is\(#st-view, #sf-help\) \.btn \{/.test(css) && /\.btn\.btn-accent \{ border-color: transparent; background: var\(--md-sys-color-primary\)/.test(css), 'template buttons map to MD3 outlined / filled');
ok(/\.st-scheme-inline \{[^}]*grid-template-rows: 0fr;[^}]*transition: grid-template-rows var\(--md-motion-medium\)/.test(css) && /\.st-scheme-inline\.open \{ grid-template-rows: 1fr;/.test(css), 'inline scheme form still expands 0fr → 1fr');
const medium = Number((read('editor/css/md-tokens.css').match(/--md-sys-motion-duration-medium2: (\d+)ms/) || [])[1]);
const closeDelay = Number((read('editor/js/project.js').match(/schemeEls\.drawer\.hidden = true; \}, (\d+)\);/) || [])[1]);
ok(medium > 0 && closeDelay > medium, `scheme collapse (${medium}ms) finishes before project.js hides it (${closeDelay}ms)`);
ok(/:is\(#log-view, #oplog-view, #note-view\) \{[^}]*background: var\(--md-sys-color-surface-container-highest\)/.test(css), 'log lists use a tonal surface in both themes');
ok(/#log-view \{ font: 12px \/ 1\.6 var\(--md-ref-typeface-mono\); \}/.test(css), 'logs stay monospace');
ok(/\.log-subtabs \{[^}]*border-radius: var\(--md-sys-shape-corner-full\)/.test(css) && /\.log-subtab\.active \{ background: var\(--md-sys-color-secondary-container\)/.test(css), 'log sub-pages are a segmented button');
const tokens = read('editor/css/md-tokens.css');
for (const role of new Set([...css.matchAll(/var\(--md-type-([a-z-]+)\)/g)].map(m => m[1]))) ok(tokens.includes(`--md-type-${role}:`), `font shorthand --md-type-${role} exists`);

// 2. 入口接线
const app = read('editor/css/app.css');
ok(/@import url\("app-settings\.css"\) layer\(app\);/.test(app) && app.indexOf('"app-home.css"') < app.indexOf('"app-settings.css"'), 'imported into the app layer after the home styles');
ok(read('editor/server.js').includes("'/editor/css/app-settings.css'"), 'static allowlist serves app-settings.css');
ok(/'app-settings'[,\]][^\n]*\]\.map\(n => `editor\/css\/\$\{n\}\.css`\)/.test(read('tools/studio-install.mjs')), 'UI installer ships app-settings.css');

// 3. 被接管的旧规则已删除
const legacy = read('editor/css/studio.css');
for (const [re, what] of [[/#st-view\b(?!\.is-leaving)/, '#st-view'], [/\.settings-inner\b/, '.settings-inner'], [/\.st-(card|tab|tabs|body|grid|row|input|area|actions|scheme|drawer|hw|models)\b/, '.st-*'],
  [/\.sm-(model|group|name|state|head|desc)\b/, '.sm-*'], [/\.sf-(asr|settings|background|scrim|scheme)-/, 'settings sections'], [/\.gl-(row|tab|tabs|input|add|del|wrap)\b/, 'glossary'],
  [/\.hw-mine/, 'hotword mining'], [/\.hotword-/, 'hotword rows'], [/\.sf-help-grid/, 'help grid'], [/\.sf-studio(\[data-design=material\])? (:is\()?\.log-subtab/, 'old Studio log sub-tabs']]) {
  ok(!re.test(legacy), 'legacy rule removed: ' + what);
}
ok(/\.log-subtab\.active/.test(legacy) && /\.log-pane\s*\{[^}]*flex: 1/.test(legacy), 'base log layout rules stay (log-panel-test)');
ok(/#panel-tabs \.ptab:focus-visible \{ outline: 3px solid var\(--md-sys-color-secondary\)/.test(read('editor/css/app-editor.css')), 'editor tab focus ring survived the cleanup (moved to app-editor.css in P6)');

// 4. 结构钩子
const html = read('editor/studio.html');
const st = html.slice(html.indexOf('<div id="st-view"'), html.indexOf('<script src="js/studio-themes.js">'));
ok(!/MAKE IT FEEL LIKE YOU|SUBFABRIC STUDIO|page-eyebrow|sf-eyebrow/.test(html), 'F7: no English mono eyebrows left on any page');
ok(/<div class="md-segmented md-segmented--dense sf-settings-segments" role="group" aria-label="明暗模式">(<button type="button" class="md-segment" data-appearance-mode="(light|dark|system)" aria-pressed="false">[^<]+<\/button>){3}<\/div>/.test(st), 'light / dark / system is a segmented button');
ok(/<input type="range" class="md-slider" id="sf-scrim"/.test(st) && /window\.MDUI\?\.syncSlider\(\$\('sf-scrim'\)\)/.test(read('editor/js/studio.js')), 'scrim is an MD3 slider whose fill follows programmatic updates');
for (const id of ['st-cast-enabled', 'st-correct-usetranslate', 'an-use-translate', 'ah-use-llm', 'st-scheme-activate', 'st-scheme-auto']) ok(new RegExp(`class="md-checkbox" id="${id}"`).test(st), `#${id} is an MD3 checkbox`);
ok(/class="st-tabs" role="tablist"[\s\S]*?class="st-body"[\s\S]*?class="st-actions"/.test(st), '.st-tabs / .st-body / .st-actions stay direct children in order (PROJECT_MAP §6)');
ok(/<button type="button" class="md-button md-button--tonal" data-go="new">创建稿件<\/button>/.test(html) && /class="md-button md-button--outlined" id="sf-shortcuts"/.test(html), 'help actions are MD3 buttons');
ok(/class="log-subtab active" data-log="op"/.test(html) && !/class="log-subtab active" data-log="app"/.test(html), 'the highlighted log sub-tab matches the pane shown by default');
ok(html === read('tools/templates/studio.html'), 'generator template stays identical to the entry');

// 5. 顶部横幅改为类名 + 令牌（原来是写死蓝色 / 橙色的内联样式）
const main = read('editor/js/main.js');
ok(/banner\.className = 'sf-app-banner';/.test(main) && /vendorBanner\.className = 'sf-app-banner sf-app-banner--warn';/.test(main), 'banners use classes');
ok(!/#2563eb|#b45309/.test(main), 'no hard-coded banner colors');
const shell = read('editor/css/app-shell.css');
ok(/\.sf-app-banner \{[^}]*background: var\(--md-sys-color-primary-container\)/.test(shell) && /\.sf-app-banner--warn \{[^}]*background: var\(--md-sys-color-error-container\)/.test(shell), 'banner colors come from MD3 roles');

console.log(`App settings: ${checks} checks — list-detail settings, tonal cards, MD3 controls, scheme expansion timing, logs and banners, legacy cleanup and wiring passed`);
