// MD3 取色（editor/js/md-color.js）：HCT 移植对照官方期望值、角色对比度、首屏引导与旧接口兼容。
// 期望值 tests/md-color-expected.json 由 material-color-utilities 0.3.0 生成（见文件内 source 字段）。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'editor/js/md-color.js'), 'utf8');
const expected = JSON.parse(fs.readFileSync(path.join(root, 'tests/md-color-expected.json'), 'utf8'));

/** 在假的 window/document 里执行一次 md-color.js；返回写到 :root 的属性与全局对象 */
function load({ prefs = null, systemDark = false } = {}) {
  const props = new Map();
  const documentElement = { dataset: {}, style: { colorScheme: '', setProperty: (k, v) => props.set(k, v) } };
  const window = { matchMedia: () => ({ matches: systemDark }) };
  const context = { window, document: { documentElement }, localStorage: { getItem: key => (key === 'subfabric-studio-v1' && prefs ? JSON.stringify(prefs) : null) } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { MD: window.SF_MD, SSAccent: window.SSAccent, props, documentElement };
}

const { MD } = load();
let checks = 0;

// 1. 移植的 HCT 与官方实现逐值一致
for (const [seed, exp] of Object.entries(expected.seeds)) {
  const h = MD.hct(MD.argbFromHex(seed));
  assert.ok(Math.abs(h.hue - exp.hct[0]) < 1e-5 && Math.abs(h.chroma - exp.hct[1]) < 1e-5 && Math.abs(h.tone - exp.hct[2]) < 1e-5, `HCT of ${seed}`);
  for (const mode of ['light', 'dark']) {
    const got = JSON.parse(JSON.stringify(MD.scheme(seed, mode === 'dark')));
    assert.deepEqual(got, exp[mode], `${seed} ${mode} scheme matches material-color-utilities`);
    checks += Object.keys(got).length;
  }
}
// CRITICAL_PLANES 由循环生成，必须与官方写死的常量一致（抽查首、中、尾）
const planes = MD._internal.CRITICAL_PLANES;
assert.equal(planes.length, 255);
for (const [i, v] of [[0, 0.015176349177441876], [10, 0.3188300904430532], [127, 21.404114048223256], [254, 99.55452497210776]]) {
  assert.ok(Math.abs(planes[i] - v) < 1e-12, `critical plane ${i}`);
}

// 2. 角色对比度：任意种子色、浅色与深色都满足 WCAG（正文 4.5:1；轮廓等非文本 3:1）
const TEXT_PAIRS = [
  ['on-primary', 'primary'], ['on-primary-container', 'primary-container'], ['on-secondary', 'secondary'], ['on-secondary-container', 'secondary-container'],
  ['on-tertiary', 'tertiary'], ['on-tertiary-container', 'tertiary-container'], ['on-error', 'error'], ['on-error-container', 'error-container'],
  ['on-surface', 'surface'], ['on-surface', 'surface-container-lowest'], ['on-surface', 'surface-container-highest'],
  ['on-surface-variant', 'surface'], ['on-surface-variant', 'surface-container-highest'], ['inverse-on-surface', 'inverse-surface'],
  ['primary', 'surface'], ['primary', 'surface-container-highest'],
];
const NON_TEXT_PAIRS = [['outline', 'surface'], ['outline', 'surface-container-highest']];
const seeds = [...Object.keys(expected.seeds), '#FFFF00', '#00FFFF', '#000000', '#FFFFFF'];
let worst = Infinity;
for (const seed of seeds) {
  for (const dark of [false, true]) {
    const s = MD.scheme(seed, dark);
    for (const [fg, bg] of TEXT_PAIRS) {
      const c = MD.contrast(s[fg], s[bg]);
      worst = Math.min(worst, c);
      assert.ok(c >= 4.5, `${seed} ${dark ? 'dark' : 'light'} ${fg} on ${bg} = ${c.toFixed(2)}`);
    }
    for (const [fg, bg] of NON_TEXT_PAIRS) assert.ok(MD.contrast(s[fg], s[bg]) >= 3, `${seed} ${dark ? 'dark' : 'light'} ${fg} on ${bg}`);
  }
}

// 3. 首屏引导：按 Studio 偏好同步写入颜色与明暗，绘制前即生效
{
  const def = load();
  assert.equal(def.documentElement.dataset.theme, 'light', 'no prefs → light');
  assert.equal(def.props.get('--md-sys-color-primary'), expected.seeds['#5789DC'].light.primary, 'no prefs → default seed');
  assert.equal(def.props.size, MD.ROLE_NAMES.length, 'only --md-sys-color-* roles are written');
  assert.ok([...def.props.keys()].every(k => k.startsWith('--md-sys-color-')), 'legacy variables are left to md-compat.css');
  const dark = load({ prefs: { mode: 'dark', accent: '#FF7A45' } });
  assert.equal(dark.documentElement.dataset.theme, 'dark');
  assert.equal(dark.documentElement.style.colorScheme, 'dark');
  assert.equal(dark.props.get('--md-sys-color-primary'), expected.seeds['#FF7A45'].dark.primary, 'saved accent seeds the dark scheme');
  assert.equal(load({ prefs: { mode: 'system' }, systemDark: true }).documentElement.dataset.theme, 'dark', 'system mode follows the OS');
  assert.equal(load({ prefs: { mode: 'system' }, systemDark: false }).documentElement.dataset.theme, 'light');
  const uwp = load({ prefs: { themePack: 'windows-uwp', accent: '#FF00AA', mode: 'light' } });
  assert.equal(uwp.props.get('--md-sys-color-primary'), expected.seeds['#0078D7'].light.primary, 'former UWP users keep the Windows blue seed');
  assert.equal(load({ prefs: { accent: 'javascript:alert(1)' } }).props.get('--md-sys-color-primary'), expected.seeds['#5789DC'].light.primary, 'invalid accent falls back to the default seed');
  const html = fs.readFileSync(path.join(root, 'editor/studio.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<script src="js\/md-color\.js"><\/script>/, 'md-color.js runs synchronously in <head>');
  assert.ok(head.indexOf('js/md-color.js') < head.indexOf('css/app.css'), 'colors are set before the stylesheet');
  assert.match(html, /<body[^>]*>\s*<script>document\.body\.dataset\.theme = document\.documentElement\.dataset\.theme/, 'body copies the boot theme before any content is parsed');
  assert.doesNotMatch(html, /js\/accent\.js/, 'accent.js has been replaced');
}

// 4. 旧接口兼容层（main.js 的主题色块）
{
  const { SSAccent, props } = load();
  assert.equal(SSAccent.PRESETS.length, 10);
  assert.ok(SSAccent.PRESETS.every(p => /^#[0-9A-F]{6}$/.test(p.hex) && p.name), 'presets are valid seeds');
  for (const legacy of ['#5C7560', '#FF7A45', '#0078D7']) assert.ok(SSAccent.PRESETS.some(p => p.hex === legacy), `legacy pack seed ${legacy} offered as preset`);
  assert.equal(SSAccent.set('#zzz'), false);
  assert.equal(SSAccent.set('#6750a4'), true);
  assert.equal(SSAccent.current(), '#6750A4');
  assert.equal(props.get('--md-sys-color-primary'), expected.seeds['#6750A4'].light.primary);
  assert.equal(SSAccent.reset(), '#5789DC');
}

// 5. 兼容别名层与令牌文件：旧变量全部指向 MD3 角色，不再写死颜色
{
  const compat = fs.readFileSync(path.join(root, 'editor/css/md-compat.css'), 'utf8');
  for (const name of ['--bg', '--surface', '--surface-2', '--text', '--muted', '--line', '--outline', '--accent', '--accent-soft', '--on-accent',
    '--bg-0', '--bg-1', '--bg-2', '--bg-3', '--border', '--text-0', '--text-1', '--text-2', '--accent-2', '--accent-ink', '--danger', '--zh', '--en']) {
    const m = compat.match(new RegExp(`\\s${name}:\\s*([^;]+);`));
    assert.ok(m, `${name} is aliased`);
    assert.match(m[1], /var\(--md-sys-color-/, `${name} points at an MD3 role`);
  }
  const app = fs.readFileSync(path.join(root, 'editor/css/app.css'), 'utf8');
  assert.match(app, /^@layer md-tokens, legacy, md-compat, md-components, app;/m, 'cascade layer order is declared first');
  assert.match(app, /@import url\("studio\.css"\) layer\(legacy\);/, 'the legacy stylesheet lives in its own layer');
  const tokens = fs.readFileSync(path.join(root, 'editor/css/md-tokens.css'), 'utf8');
  for (const role of MD.ROLE_NAMES) assert.match(tokens, new RegExp(`--md-sys-color-${role}:\\s*#[0-9A-F]{6};`), `fallback value for ${role}`);
}

console.log(`MD3 color: ${checks} role values match material-color-utilities, ${seeds.length} seeds × 2 modes meet WCAG (worst text pair ${worst.toFixed(2)}:1), boot + compat checks passed`);
