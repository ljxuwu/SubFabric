import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// 主题包（MD3 重构后）：只剩 Material 内置包；自定义包为 v2（种子色 + MD3 角色覆盖），
// v1 旧包仍可导入但只保留种子色；旧偏好里的内置包 id 一次性迁移；安全白名单不变。
const root = path.resolve(import.meta.dirname, '..');
const studioSource = fs.readFileSync(path.join(root, 'editor/js/studio.js'), 'utf8');
assert.match(studioSource, /data-pack-select=\"\$\{esc\(pack\.id\)\}\"/, 'theme cards expose the pack id through data-pack-select');
assert.match(studioSource, /themes\.get\(b\.dataset\.packSelect, prefs\.custom\)/, 'theme picker reads the data-pack-select value when switching packs');
assert.doesNotMatch(studioSource, /themes\.get\(b\.dataset\.pack, prefs\.custom\)/, 'theme picker does not read the stale dataset.pack key');
const context = { window: { matchMedia: () => ({ matches: false }) }, document: { documentElement: { dataset: {}, style: { setProperty() {} } } }, localStorage: { getItem: () => null } };
vm.createContext(context);
for (const file of ['md-color.js', 'studio-themes.js']) vm.runInContext(fs.readFileSync(path.join(root, 'editor/js', file), 'utf8'), context);
const themes = context.window.SF_THEMES;
const plain = value => JSON.parse(JSON.stringify(value));

// 内置包：只有 Material，且与可分发的 JSON 一致
assert.equal(themes.builtins.length, 1, 'only the Material built-in pack remains');
assert.deepEqual(fs.readdirSync(path.join(root, 'editor/themes')), ['material-you.theme.json'], 'retired built-in JSON packages are removed');
for (const pack of themes.builtins) {
  assert.equal(pack.builtin, true, `${pack.id} is marked built-in`);
  assert.equal(themes.valid(pack), true, `${pack.id} passes the v2 schema`);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'editor/themes', `${pack.id}.theme.json`), 'utf8')), plain(pack), `${pack.id} has a distributable JSON package`);
}
assert.equal(themes.get('unknown').id, 'material-you', 'unknown ids fall back to the default pack');

// v2 自定义包：角色覆盖走 MD3 角色白名单
const custom = {
  schema: 'subfabric-theme-v2', id: 'painted', name: 'Painted', version: '1.2.0', description: 'Local palette', author: 'Tester', seed: '#112233',
  roles: { light: { primary: '#225588', surface: '#fefefe' }, dark: { 'on-surface': '#eeeeee' } },
  assets: { preview: 'data:image/png;base64,AAAA' }
};
assert.equal(themes.valid(custom), true, 'custom v2 pack accepts role overrides and local preview art');
const stored = themes.asCustom({ ...custom, builtin: true });
assert.equal(stored.builtin, undefined, 'stored custom packs cannot masquerade as built-ins');
assert.equal(stored.seed, '#112233');
assert.deepEqual(plain(themes.roleOverrides(custom, false)), { primary: '#225588', surface: '#fefefe' });
assert.deepEqual(plain(themes.roleOverrides(custom, true)), { 'on-surface': '#eeeeee' });
assert.equal(themes.valid({ ...custom, script: 'alert(1)' }), false, 'scripts are rejected');
assert.equal(themes.valid({ ...custom, css: 'body{}' }), false, 'CSS injection is rejected');
assert.equal(themes.valid({ ...custom, design: 'material' }), false, 'v2 packs no longer carry a design language');
assert.equal(themes.valid({ ...custom, assets: { preview: 'https://example.com/a.png' } }), false, 'remote assets are rejected');
assert.equal(themes.valid({ ...custom, assets: { preview: 'data:image/svg+xml;base64,AAAA' } }), false, 'SVG assets are rejected');
assert.equal(themes.valid({ ...custom, roles: { light: { '--md-sys-color-primary': '#ffffff' } } }), false, 'role names stay on the MD3 allowlist');
assert.equal(themes.valid({ ...custom, roles: { light: { primary: 'red' } } }), false, 'role values must be #RRGGBB');
assert.equal(themes.valid({ ...custom, seed: 'url(evil)' }), false, 'unsafe seeds are rejected');

// v1 旧包：可导入，只保留种子色
const v1 = {
  schema: 'subfabric-theme-v1', id: 'painted-studio', name: 'Painted Studio', version: '1.0.0', description: 'Old pack', design: 'uwp', seed: '#445566',
  tokens: { light: { bg: '#fefefe', accent: '#225588' } }
};
assert.equal(themes.valid(v1), false, 'v1 is not the current schema');
assert.equal(themes.validV1(v1), true, 'v1 packs are still recognised for import');
assert.equal(themes.validV1({ ...v1, design: 'script' }), false, 'v1 unknown designs are rejected');
assert.equal(themes.validV1({ ...v1, tokens: { light: { '--bg': '#fff' } } }), false, 'v1 token names stay on their old allowlist');
const upgraded = themes.asCustom(v1);
assert.equal(upgraded.schema, 'subfabric-theme-v2');
assert.equal(upgraded.seed, '#445566', 'v1 import keeps the seed');
assert.equal(upgraded.design, undefined, 'v1 design is dropped');
assert.equal(upgraded.tokens, undefined, 'v1 tokens are dropped (they were drawn for retired design languages)');
assert.equal(themes.validList([v1]), true, 'stored v1 custom packs survive the upgrade');
assert.equal(themes.list([v1])[1].schema, 'subfabric-theme-v2');

// 旧偏好里的内置包 id 迁移
assert.deepEqual(plain(themes.migrateId('windows-uwp', [])), { themePack: 'material-you', seed: '#0078D7' }, 'UWP users keep the Windows blue seed');
assert.deepEqual(plain(themes.migrateId('studio', [])), { themePack: 'material-you' }, 'Studio users keep their own accent');
assert.deepEqual(plain(themes.migrateId('subfabric-classic', [])), { themePack: 'material-you' });
assert.deepEqual(plain(themes.migrateId('painted', [custom])), { themePack: 'painted' }, 'custom pack selection is preserved');
for (const retired of ['studio', 'subfabric-classic', 'windows-uwp']) {
  assert.equal(themes.asCustom({ ...custom, id: retired }), null, `retired id ${retired} cannot be claimed by a custom pack`);
}

// 删除规则
assert.equal(themes.canDelete('material-you'), false, 'built-in packs cannot be deleted');
assert.equal(themes.canDelete('painted'), true, 'custom packs can be deleted');
assert.equal(themes.remove([stored], 'painted').length, 0, 'custom pack removal is deterministic');
console.log('Theme packs: Material built-in, v2 role overrides, v1 seed-only import, retired-pack migration, safe allowlists and deletion rules passed');
