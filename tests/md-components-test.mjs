// MD3 组件层（editor/css/md-components.css + editor/js/md.js，MD3 重构 P2）：
// 源码约定、陈列页覆盖、md.js 纯函数、入口接线。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('editor/css/md-components.css');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. 源码约定
ok(!/!important/.test(code), 'component layer never uses !important');
ok(!/transition\s*:\s*all\b/.test(code), 'no transition: all');
const selectors = [...code.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@') && !/^(from|to|\d+%)$/.test(s));
ok(selectors.every(s => !/#[A-Za-z_-]/.test(s)), 'no ID selectors');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(code), 'no hard-coded hex colors');
ok(!/\b(rgba?|hsla?)\(/.test(code), 'no hard-coded rgb/hsl colors');
const classNames = new Set([...code.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(m => m[1]));
ok([...classNames].every(c => c.startsWith('md-')), 'every class is md- prefixed: ' + [...classNames].filter(c => !c.startsWith('md-')).join(','));
for (const decl of code.matchAll(/(transition|animation)\s*:\s*([^;]+);/g)) {
  if (decl[2].trim() === 'none') continue;
  const durations = decl[2].match(/\d+m?s\b/g) || [];
  ok(durations.length === 0, `${decl[1]} uses motion tokens instead of literal durations: ${decl[2]}`);
  ok(/var\(--md-motion-/.test(decl[2]), `${decl[1]} duration is a --md-motion-* token: ${decl[2]}`);
}
ok([...code.matchAll(/@keyframes\s+([\w-]+)/g)].every(m => m[1].startsWith('md-')), 'keyframes are md- prefixed');
ok(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--md-motion-short:\s*0ms/.test(code), 'system reduced motion zeroes motion tokens');
ok(/body\[data-motion=off\]\s*\{[^}]*--md-motion-short:\s*0ms[^}]*--md-motion-loop:\s*0ms/.test(code), 'in-app reduced motion zeroes motion tokens');
const colorVars = new Set([...code.matchAll(/var\(--md-sys-color-([a-z-]+)\)/g)].map(m => m[1]));
const md = (() => {
  const ctx = { window: { matchMedia: () => ({ matches: false }) }, document: { documentElement: { dataset: {}, style: { setProperty() {} } } }, localStorage: { getItem: () => null } };
  vm.createContext(ctx); vm.runInContext(read('editor/js/md-color.js'), ctx); return ctx.window.SF_MD;
})();
ok([...colorVars].every(r => md.ROLE_NAMES.includes(r)), 'only existing MD3 color roles are referenced: ' + [...colorVars].filter(r => !md.ROLE_NAMES.includes(r)).join(','));
ok(/:is\([^)]*\.md-button[^)]*\)::before\s*\{[^}]*background:\s*currentColor/.test(code), 'state layer is drawn with currentColor');
ok(/\[data-state=hover\]/.test(code) && /\[data-state=focus\]/.test(code) && /\[data-state=pressed\]/.test(code), 'gallery can force hover / focus / pressed');

// 2. 陈列页覆盖：组件里的每个类都要出现在陈列页里，陈列页也不能用不存在的 md- 类
const gallery = read('tools/md-gallery.html');
const galleryClasses = new Set([...gallery.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => c.startsWith('md-')));
const missing = [...classNames].filter(c => !galleryClasses.has(c));
ok(missing.length === 0, 'gallery shows every component class; missing: ' + missing.join(', '));
const unknown = [...galleryClasses].filter(c => !classNames.has(c));
ok(unknown.length === 0, 'gallery only uses defined md- classes; unknown: ' + unknown.join(', '));
ok(gallery.indexOf('../editor/js/md-color.js') < gallery.indexOf('../editor/css/app.css'), 'gallery boots colors before styles like the app');
ok(/@layer app \{/.test(gallery), 'gallery layout styles live in the app layer, below components cannot be overridden by accident');
ok(!/<script type="module"/.test(gallery), 'gallery uses classic scripts only (works from file://)');

// 3. 入口接线
const app = read('editor/css/app.css');
ok(/@import url\("md-components\.css"\) layer\(md-components\);/.test(app), 'components are imported into the md-components layer');
ok(app.indexOf('md-compat.css') < app.indexOf('md-components.css'), 'components import after compat');
ok(!/@layer[^;{]*\./.test(app) && !/layer\([^)]*\./.test(app), 'layer names have no dots (a.b nests b inside a, which sorted before legacy)');
const html = read('editor/studio.html');
ok(/<script src="js\/md\.js"><\/script>/.test(html), 'studio.html loads md.js as a classic script');
ok(html === read('tools/templates/studio.html'), 'generator template stays identical to the entry');
const server = read('editor/server.js');
ok(server.includes("'/editor/css/md-components.css'") && /\['md-color', 'md',/.test(server), 'static allowlist serves the component files');

// 4. md.js 纯函数
const listeners = {};
const ctx = { window: {}, document: { readyState: 'complete', addEventListener: (t, f) => { listeners[t] = f; }, querySelectorAll: () => [] } };
vm.createContext(ctx);
vm.runInContext(read('editor/js/md.js'), ctx);
const UI = ctx.window.MDUI;
ok(['keydown', 'click', 'input'].every(t => typeof listeners[t] === 'function'), 'md.js installs delegated listeners only');
const { nextIndex, placeMenu, sliderFill } = UI;
assert.equal(nextIndex(0, 'ArrowRight', 4), 1);
assert.equal(nextIndex(3, 'ArrowRight', 4), 0, 'wraps forward');
assert.equal(nextIndex(0, 'ArrowLeft', 4), 3, 'wraps backward');
assert.equal(nextIndex(2, 'Home', 4), 0);
assert.equal(nextIndex(0, 'End', 4), 3);
assert.equal(nextIndex(1, 'ArrowDown', 4), -1, 'horizontal lists ignore vertical keys');
assert.equal(nextIndex(1, 'ArrowDown', 4, { vertical: true }), 2);
assert.equal(nextIndex(0, 'ArrowRight', 4, { disabled: i => i === 1 }), 2, 'skips disabled items');
assert.equal(nextIndex(0, 'End', 4, { disabled: i => i === 3 }), 2, 'End skips a disabled last item');
assert.equal(nextIndex(0, 'ArrowRight', 3, { disabled: () => true }), -1, 'all disabled');
assert.equal(nextIndex(0, 'Enter', 4), -1);
assert.equal(nextIndex(0, 'ArrowRight', 0), -1);
checks += 12;
const vp = { width: 1000, height: 800 };
assert.deepEqual({ ...placeMenu({ left: 100, top: 100, right: 180, bottom: 140 }, { width: 200, height: 300 }, vp) }, { left: 100, top: 140, origin: 'left top' }, 'opens below the anchor');
assert.deepEqual({ ...placeMenu({ left: 100, top: 600, right: 180, bottom: 640 }, { width: 200, height: 300 }, vp) }, { left: 100, top: 300, origin: 'left bottom' }, 'flips above when there is more room');
assert.deepEqual({ ...placeMenu({ left: 900, top: 100, right: 980, bottom: 140 }, { width: 200, height: 100 }, vp) }, { left: 780, top: 140, origin: 'right top' }, 'aligns to the anchor end near the right edge');
assert.equal(placeMenu({ left: 10, top: 100, right: 40, bottom: 140 }, { width: 2000, height: 100 }, vp).left, 8, 'clamps into the viewport margin');
assert.equal(placeMenu({ left: 100, top: 380, right: 180, bottom: 420 }, { width: 200, height: 900 }, vp).top, 8, 'oversized menus are clamped to the top margin');
checks += 5;
assert.equal(sliderFill(68, 40, 95), '50.91%');
assert.equal(sliderFill(0, 0, 100), '0%');
assert.equal(sliderFill(150, 0, 100), '100%', 'clamped above');
assert.equal(sliderFill(-5, 0, 100), '0%', 'clamped below');
assert.equal(sliderFill(5, 10, 10), '0%', 'empty range');
assert.equal(sliderFill('abc', 0, 100), '0%', 'non-numeric value');
checks += 6;
const props = new Map();
UI.syncSlider({ value: '25', min: '', max: '', style: { setProperty: (k, v) => props.set(k, v) } });
assert.equal(props.get('--md-slider-fill'), '25%', 'missing min/max default to 0..100');
checks++;

console.log(`MD3 components: ${checks} checks — ${classNames.size} md- classes all shown in the gallery, tokens-only colors, motion tokens, md.js helpers and wiring passed`);
