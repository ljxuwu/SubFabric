// MD3 重构 P7：时间轴画布配色跟随 MD3 角色（明暗两套文字层）、两个主题事件合并、devicePixelRatio 变化重分配画布。
// 用假的 document / getComputedStyle / matchMedia 跑真实的 Timeline.prototype 方法，不起浏览器。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = path.join(root, 'editor', 'js');
const JSMOD = path.join(import.meta.dirname, 'jsmod');
fs.mkdirSync(JSMOD, { recursive: true });
for (const f of fs.readdirSync(SRC)) {
  if (!f.endsWith('.js')) continue;
  const a = path.join(JSMOD, f), b = path.join(SRC, f);
  if (!fs.existsSync(a) || !fs.readFileSync(a).equals(fs.readFileSync(b))) fs.copyFileSync(b, a);
}
fs.writeFileSync(path.join(JSMOD, 'package.json'), '{"type":"module"}\n');
const { Timeline } = await import('./jsmod/timeline.js');
const source = fs.readFileSync(path.join(SRC, 'timeline.js'), 'utf8');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// MD3 角色取值（md-color.js 在 :root 写成 #rrggbb）
const ROLES = {
  light: { primary: '#425E91', 'on-primary': '#FFFFFF', 'surface-container-low': '#F3F3FA', 'surface-container': '#EDEDF4', 'surface-container-high': '#E8E7EF',
    'surface-container-lowest': '#FFFFFF', outline: '#74777F', 'outline-variant': '#C4C6D0', 'on-surface': '#1A1C20', 'on-surface-variant': '#44474E',
    error: '#BA1A1A', 'on-error': '#FFFFFF', tertiary: '#715574', 'inverse-surface': '#2F3036', 'inverse-on-surface': '#F0F0F7', 'inverse-primary': '#ABC7FF' },
  dark: { primary: '#ABC7FF', 'on-primary': '#0B305F', 'surface-container-low': '#1A1C20', 'surface-container': '#1E2025', 'surface-container-high': '#282A2F',
    'surface-container-lowest': '#0C0E13', outline: '#8E9099', 'outline-variant': '#44474E', 'on-surface': '#E2E2E9', 'on-surface-variant': '#C4C6D0',
    error: '#FFB4AB', 'on-error': '#690005', tertiary: '#DDBCE0', 'inverse-surface': '#E2E2E9', 'inverse-on-surface': '#2F3036', 'inverse-primary': '#425E91' },
};
function fakeDom(mode) {
  const vars = Object.fromEntries(Object.entries(ROLES[mode]).map(([k, v]) => ['--md-sys-color-' + k, v]));
  vars['--md-ref-typeface-plain'] = '"Microsoft YaHei UI", sans-serif';
  vars['--md-ref-typeface-mono'] = '"Cascadia Mono", monospace';
  globalThis.document = { documentElement: {}, body: { classList: { contains: c => c === 'sf-studio' }, dataset: { theme: mode } } };
  globalThis.getComputedStyle = () => ({ getPropertyValue: name => vars[name] || '' });
}
const stub = () => ({ colors: {}, ink: null, ui: null, _dirty: false });

// 1. 浅色：界面元素取 MD3 角色，文字层是"提亮 + 深色字"
fakeDom('light');
const light = stub();
Timeline.prototype._syncColors.call(light);
ok(light.accent === ROLES.light.primary && light.accentInk === ROLES.light['on-primary'], 'playhead / selection use primary and on-primary');
ok(light.colors.bg === ROLES.light['surface-container-low'] && light.colors.waveBg === ROLES.light['surface-container'], 'track uses surface-container-low, wave / film band surface-container');
ok(light.colors.ruler === ROLES.light['on-surface-variant'] && light.colors.rulerTick === ROLES.light['outline-variant'], 'ruler text on-surface-variant, ticks outline-variant');
ok(light.ink.light === true && /^rgba\(255,255,255,0\.72\)$/.test(light.ink.backdrop), 'light theme lightens the block area instead of darkening it');
ok(light.ink.wordText === ROLES.light['on-surface'] && light.ink.textInk === ROLES.light['on-surface'], 'light theme draws words in on-surface');
ok(light.ui.error === ROLES.light.error && light.ui.inverseSurface === ROLES.light['inverse-surface'], 'bad-row marks use error, labels use the inverse surface (plain tooltip)');
ok(light.ui.accentOnMedia === ROLES.light['inverse-primary'], 'labels over video thumbnails use the tone-80 primary');
ok(/Cascadia Mono/.test(light.ui.fontMono) && /Microsoft YaHei UI/.test(light.ui.fontPlain), 'canvas fonts come from the MD3 typeface tokens');
ok(light._dirty === true, 'a sync schedules a redraw');

// 2. 深色：文字层保持原来调过的取值，界面元素同样取 MD3 角色
fakeDom('dark');
const dark = stub();
Timeline.prototype._syncColors.call(dark);
ok(dark.ink.light === false && dark.ink.backdrop === 'rgba(8,8,12,.46)' && dark.ink.zhScrim === 'rgba(8,8,12,.45)', 'dark theme keeps the tuned darkening and Chinese-line scrim');
ok(dark.colors.bg === ROLES.dark['surface-container-low'] && dark.accent === ROLES.dark.primary, 'dark theme also reads MD3 roles');
ok(dark.ui.accentOnMedia === ROLES.dark.primary, 'dark theme: primary is already tone 80');

// 3. 两个主题事件走同一个入口；DPR 变化会重新分配画布并继续监听新值
ok(/addEventListener\('sf-studio-theme', \(\) => this\._syncColors\(\)\)/.test(source) && /addEventListener\('ss-accent', \(\) => this\._syncColors\(\)\)/.test(source), 'seed-color and theme events share one refresh path');
ok(!/syncStudioColors/.test(source), 'old half-way sync is gone');
{
  const listeners = [];
  globalThis.window = { devicePixelRatio: 1, matchMedia: q => ({ media: q, addEventListener: (type, fn, opt) => listeners.push({ q, type, fn, once: opt?.once }) }) };
  // 只取构造函数里 watchDpr 那一段跑（不必构造完整 Timeline）
  const start = source.indexOf('const watchDpr = () => {'), end = source.indexOf('\n    watchDpr();', start) + '\n    watchDpr();'.length;
  const body = source.slice(start, end);
  let resized = 0;
  new Function('window', `return function () { ${body} }`)(globalThis.window).call({ _resize: () => resized++ });
  ok(listeners.length === 1 && listeners[0].q === '(resolution: 1dppx)' && listeners[0].type === 'change' && listeners[0].once, 'watches the current resolution once');
  globalThis.window.devicePixelRatio = 1.5;
  listeners[0].fn();
  ok(resized === 1, 'a resolution change reallocates the canvas');
  ok(listeners.length === 2 && listeners[1].q === '(resolution: 1.5dppx)', 'then keeps watching the new resolution');
}

// 4. 绘制代码不再写死界面色（只剩默认值 / 回退值与视频缩略图上的暗底）
const drawCode = source.slice(source.indexOf('  draw(t, playing) {'));
const literals = [...drawCode.matchAll(/(fillStyle|strokeStyle)\s*=\s*('#[0-9a-fA-F]{3,8}'|'rgba?\([^']*\)')/g)].map(m => m[2]);
ok(literals.every(v => v === "'rgba(0,0,0,.62)'"), `drawing code has no hard-coded UI colors left (found ${literals.join(', ') || 'none'})`);

console.log(`Timeline theme: ${checks} checks — MD3 roles for both themes, light text layer, merged events, DPR watcher, no hard-coded UI colors`);
