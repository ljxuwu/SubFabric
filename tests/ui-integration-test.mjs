import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { isolatedServer } from './helpers/isolated-server.mjs';
const root = path.resolve(import.meta.dirname, '..');
const themesContext = { window: { matchMedia: () => ({ matches: false }) }, document: { documentElement: { dataset: {}, style: { setProperty() {} } } }, localStorage: { getItem: () => null } };
vm.createContext(themesContext);
for (const file of ['md-color.js', 'studio-themes.js']) vm.runInContext(fs.readFileSync(path.join(root, 'editor/js', file), 'utf8'), themesContext);
const themes = themesContext.window.SF_THEMES;
const stateSource = fs.readFileSync(path.join(root, 'editor/js/studio-state.js'), 'utf8');
const { normalizeStudio, projectPhase, matchesProject, imageData } = await import('data:text/javascript;base64,' + Buffer.from(stateSource).toString('base64'));
// MD3 统一主题：默认 Material + 默认种子色；无效值回落默认
assert.equal(normalizeStudio(null, themes).themePack, 'material-you');
assert.equal(normalizeStudio(null, themes).accent, '#5789DC');
assert.equal(normalizeStudio({ themePack: 'bad', accent: 'url(evil)', mode: 'bad', image: '<svg>', motion: 'bad', custom: [{}] }, themes).accent, '#5789DC');
assert.equal(imageData('data:image/svg+xml;base64,AAAA'), false);
// 旧偏好一次性迁移：下线的内置包 → Material；UWP 固定蓝；用户自选色保留；流光 → 纯色；毛玻璃字段丢弃
assert.deepEqual([normalizeStudio({ themePack: 'windows-uwp', accent: '#ff00aa' }, themes)].map(p => [p.themePack, p.accent])[0], ['material-you', '#0078D7']);
assert.deepEqual([normalizeStudio({ themePack: 'studio', accent: '#5c7560' }, themes)].map(p => [p.themePack, p.accent])[0], ['material-you', '#5C7560']);
assert.deepEqual([normalizeStudio({ themePack: 'subfabric-classic', accent: '#ff7a45' }, themes)].map(p => [p.themePack, p.accent])[0], ['material-you', '#FF7A45']);
const migrated = normalizeStudio({ background: 'aurora', auroraColors: ['#123456', '#abcdef', '#789abc'], auroraMotion: 'static', glassDim: 90, glassBlur: 4, glassOpacity: 50 }, themes);
assert.equal(migrated.background, 'solid', 'retired aurora background falls back to solid');
for (const key of ['auroraColors', 'auroraMotion', 'glassDim', 'glassBlur', 'glassOpacity']) assert.equal(key in migrated, false, 'retired preference dropped: ' + key);
assert.equal(normalizeStudio({ background: 'image' }, themes).background, 'image');
// 背景遮罩强度
assert.equal(normalizeStudio({}, themes).scrim, 68);
for (const invalid of [NaN, Infinity, null, '80', {}]) assert.equal(normalizeStudio({ scrim: invalid }, themes).scrim, 68);
assert.equal(normalizeStudio({ scrim: 0 }, themes).scrim, 40);
assert.equal(normalizeStudio({ scrim: 120 }, themes).scrim, 95);
assert.equal(normalizeStudio({ scrim: 80.4 }, themes).scrim, 80);
const prefs = normalizeStudio({ folders: [{ id: 'f-one', name: 'Folder' }, { id: 'f-one', name: 'duplicate' }, { id: '../x', name: 'bad' }], assignments: { 'p-one': 'f-one', 'p-bad': 'f-no' } }, themes);
assert.equal(prefs.folders.length, 1); assert.deepEqual(prefs.assignments, { 'p-one': 'f-one' });
const active = { id: 'p-one', name: 'Movie', draft: { status: 'running', progress: 30 } };
const ready = { id: 'p-ready', name: 'Ready', format: 'ass', videoExists: true };
const error = { id: 'p-error', name: 'Error', format: 'ass', draft: { status: 'paused' } };
assert.equal(projectPhase(active), 'active'); assert.equal(projectPhase(ready), 'ready'); assert.equal(projectPhase(error), 'attention');
assert.ok(matchesProject(active, { route: '#/tasks', filter: 'active', folder: 'f-one', search: 'MOV' }, prefs.assignments));
assert.equal(matchesProject(ready, { route: '#/tasks' }), false);
assert.equal(matchesProject(error, { filter: 'ready' }), false);
assert.ok(matchesProject({ id: 'p-window', name: 'Creating', prepare: {} }, { route: '#/tasks' }), 'new prepare window remains in task center');
const fresh = fs.readFileSync(path.join(root, 'editor/studio.html'), 'utf8');
const studioCss = fs.readFileSync(path.join(root, 'editor/css/studio.css'), 'utf8');
const studioJs = fs.readFileSync(path.join(root, 'editor/js/studio.js'), 'utf8');
assert.doesNotMatch(fresh, /data-route="resources"|id="sf-resource-links"|data-resource=/, 'Studio exposes one global settings entry without duplicate resource shortcuts');
assert.doesNotMatch(fresh, /🧠|🎯|📥/, 'Studio action buttons use the shared SVG icon registry instead of emoji glyphs');
const generatorSource = fs.readFileSync(path.join(root, 'tools/generate-studio.mjs'), 'utf8');
assert.doesNotMatch(generatorSource, /data-route="resources"/, 'Studio generator keeps the resource route out of the sidebar');
// Studio now owns the production markup; the former legacy entry is intentionally absent.
assert.equal(fs.existsSync(path.join(root, 'editor/index.html')), false);
assert.equal(fs.existsSync(path.join(root, 'editor/css/style.css')), false);
assert.equal(fs.existsSync(path.join(root, 'editor/css/ui.css')), false);
assert.ok(fresh.includes('id="sf-settings-tab-theme"'));
assert.match(fresh, /背景遮罩强度/);
assert.doesNotMatch(fresh, /毛玻璃|模糊流光|sf-aurora-/, 'glass and aurora controls are retired (MD3 D1)');
assert.doesNotMatch(studioCss, /--sf-glass-|backdrop-filter:blur\(var/, 'surfaces no longer depend on glass variables');
assert.match(studioCss, /\/\* MD3 表面层级[\s\S]*surface-container-low/, 'opaque MD3 tonal surfaces replace the glass layer');
assert.doesNotMatch(studioCss, /backdrop-filter\s*:/, 'no backdrop-filter left in the legacy layer (P8)');
assert.match(studioJs, /window\.SF_MD\.apply\(accent, dark, themes\.roleOverrides\(pack, dark\)\)/, 'Studio applies colors through the MD3 scheme');
assert.doesNotMatch(studioJs, /--sf-glass|auroraColors|design === 'uwp'/, 'Studio adapter no longer carries glass, aurora or UWP branches');
const ids = text => [...text.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
// Regeneration must preserve the redesigned settings, without writing any output or assets.
const generated = new Map();
const generatorContext = {
  fs: { readFileSync: fs.readFileSync, writeFileSync: (file, contents) => generated.set(file, contents), copyFileSync() {} },
  path, fileURLToPath: () => path.join(root, 'tools/generate-studio.mjs'), console: { log() {} }
};
vm.createContext(generatorContext);
const generator = fs.readFileSync(path.join(root, 'tools/generate-studio.mjs'), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('import.meta.url', "'generator'");
vm.runInContext(generator, generatorContext);
const regenerated = generated.get(path.join(root, 'editor/studio.html'));
for (const id of new Set(ids(fresh))) assert.ok(ids(regenerated).includes(id), 'regenerator missing control ' + id);
assert.deepEqual(ids(regenerated).filter((id, i, all) => all.indexOf(id) !== i), [], 'regenerated IDs remain unique');
assert.ok(regenerated.includes('id="sf-settings-tab-translate"'));
assert.ok(!regenerated.includes('id="sf-settings-tab-general"'));
assert.ok(regenerated.includes('id="sf-asr-families"'));
assert.ok(regenerated.includes('id="st-scheme-name"'));
for (const [id, icon] of [...fresh.matchAll(/id="sf-settings-tab-([^\"]+)"[^>]*data-ico="([^\"]+)"/g)].map(m => [m[1], m[2]])) {
  const { ico } = await import('../editor/js/icons.js');
  assert.ok(ico(icon), 'registered settings icon ' + id);
}
assert.equal(/SF_DEMO|data\.js|prototypes\/|localStorage/.test(fresh), false);
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'docs/ui-integration-baseline.json')));
const crypto = await import('node:crypto');
assert.equal(fs.existsSync(path.join(root, 'editor/index.html')), false, 'legacy entry removed');
assert.match(fs.readFileSync(path.join(root, 'editor/js/main.js'), 'utf8'), /allocateWordTimes/, 'legacy editor keeps the shared letter-weighted word allocator');
const server = await isolatedServer({ source: process.argv[2] ? path.resolve(process.argv[2]) : undefined });
try {
  async function entry(value) {
    const config = path.join(server.root, 'ui-config.json');
    if (value === null) { if (fs.existsSync(config)) fs.unlinkSync(config); } else fs.writeFileSync(config, value);
    const response = await server.call('/', { redirect: 'manual' });
    assert.equal(response.status, 302); assert.equal(response.headers.get('cache-control'), 'no-store'); return response.headers.get('location');
  }
  assert.equal(await entry(null), '/editor/studio.html');
  for (const value of ['{"ui":"new"}', '{}', 'bad-json', '{"ui":"../private"}', 'x'.repeat(17000)]) assert.equal(await entry(value), '/editor/studio.html');
  assert.equal(await entry('{"ui":"legacy"}'), '/editor/studio.html');
  assert.equal(await entry('\uFEFF{"ui":"legacy"}'), '/editor/studio.html');
  assert.equal((await server.call('/index.html', { redirect: 'manual' })).headers.get('location'), '/editor/studio.html');
  for (const name of ['subtitles-octopus.js', 'subtitles-octopus-worker.js', 'subtitles-octopus-worker.wasm', 'fonts/NotoSansCJKsc-Regular.otf']) { const f = path.join(server.root, 'editor/vendor', name); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'test resource'); }
  const seen = new Set(), queue = ['/editor/studio.html'];
  while (queue.length) {
    const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
    const r = await server.call(url); assert.equal(r.status, 200, url);
    const text = await r.text();
    const refs = url.endsWith('.html') ? [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
      : url.endsWith('.css') ? [...text.matchAll(/@import\s+url\("([^"]+)"\)/g)].map(m => (url.slice(0, url.lastIndexOf('/') + 1) + m[1]))
      : [...text.matchAll(/(?:from\s*|import\s*\()?['"]((?:\.{1,2}\/|\/)[^'"\n]+\.js(?:\?[^'"\n]*)?)['"]/g)].map(m => m[1]);
    for (const ref of refs) if (!ref.startsWith('#') && !/^[a-z]+:/i.test(ref)) queue.push(new URL(ref, server.origin + url).pathname);
  }
  for (const ref of ['/editor/js/md-color.js', '/editor/js/studio.js', '/editor/js/studio-state.js', '/editor/js/studio-themes.js', '/editor/js/studio-progress.js', '/editor/css/app.css', '/editor/css/md-tokens.css', '/editor/css/studio.css', '/editor/css/md-components.css']) assert.ok(seen.has(ref), ref);
  assert.equal((await server.call('/ui-config.json')).status, 403);
  console.log(`Studio parity: ${new Set(ids(fresh)).size} controls, ${seen.size} resources, single-entry/config privacy and real-state filters passed`);
} finally { await server.close(); }
