/* Declarative theme packs. JSON only: no scripts, CSS, URLs or remote assets.
 *
 * MD3 重构（2026-10-18）起界面只有一种设计语言（Material Design 3），主题包只描述颜色：
 *   v2 { schema:'subfabric-theme-v2', id, name, version, description, author?, seed, roles?, assets?, builtin? }
 *      roles = { light: { <MD3 角色名>: '#RRGGBB' }, dark: { … } }，角色名白名单取自 SF_MD.ROLE_NAMES。
 *   v1（旧 Studio / Material / Classic / UWP 时代）仍可导入，但只保留 seed：v1 的令牌按旧设计语言绘制，
 *      套到 MD3 的角色上会破坏对比度，所以丢弃 tokens 与 design，导入处给出提示。
 * 取色依赖 <head> 里同步执行的 js/md-color.js（window.SF_MD）。
 */
(function () {
  'use strict';
  const MD = window.SF_MD;
  const dataImage = value => typeof value === 'string' && value.length <= 700000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
  const hex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const V1_KEYS = new Set(['schema', 'id', 'name', 'version', 'description', 'author', 'design', 'seed', 'tokens', 'assets', 'builtin']);
  const V2_KEYS = new Set(['schema', 'id', 'name', 'version', 'description', 'author', 'seed', 'roles', 'assets', 'builtin']);
  const V1_DESIGNS = new Set(['studio', 'material', 'uwp', 'classic']);
  const V1_TOKENS = new Set(['bg', 'surface', 'surface2', 'text', 'muted', 'line', 'accent', 'accentSoft', 'onAccent', 'outline']);
  const roleNames = new Set(MD.ROLE_NAMES);
  // 迁移后不再提供的内置包；旧偏好里的这些 id 一律落到 material-you。
  const RETIRED = Object.freeze({ 'studio': '#5C7560', 'subfabric-classic': '#FF7A45', 'windows-uwp': '#0078D7' });
  const builtins = Object.freeze([
    Object.freeze({ schema: 'subfabric-theme-v2', id: 'material-you', name: 'Material You', version: '2.0.0', description: '动态取色、柔和轮廓与波浪进度', seed: MD.DEFAULT_SEED, builtin: true }),
  ]);
  const builtinIds = new Set([...builtins.map(pack => pack.id), ...Object.keys(RETIRED)]);
  const DEFAULT_ID = builtins[0].id;

  function plainObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
  function validModes(map, keyOk) {
    if (map === undefined) return true;
    if (!plainObject(map)) return false;
    return Object.keys(map).every(mode => ['light', 'dark'].includes(mode) && plainObject(map[mode])
      && Object.keys(map[mode]).every(key => keyOk(key) && hex(map[mode][key])));
  }
  function validAssets(assets) {
    if (assets === undefined) return true;
    if (!plainObject(assets)) return false;
    return Object.keys(assets).every(key => key === 'preview' && dataImage(assets[key]));
  }
  function validCommon(pack) {
    return typeof pack.id === 'string' && /^[a-z][a-z0-9-]{1,47}$/.test(pack.id)
      && typeof pack.name === 'string' && pack.name.trim().length > 0 && pack.name.length <= 48
      && typeof pack.description === 'string' && pack.description.length <= 160
      && (pack.author === undefined || typeof pack.author === 'string' && pack.author.length <= 80)
      && typeof pack.version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pack.version)
      && hex(pack.seed) && (pack.builtin === undefined || typeof pack.builtin === 'boolean') && validAssets(pack.assets);
  }
  /** 当前格式（v2） */
  function valid(pack) {
    return plainObject(pack) && Object.keys(pack).every(k => V2_KEYS.has(k)) && pack.schema === 'subfabric-theme-v2'
      && validCommon(pack) && validModes(pack.roles, key => roleNames.has(key));
  }
  /** 旧格式（v1），只用于导入与旧偏好迁移 */
  function validV1(pack) {
    return plainObject(pack) && Object.keys(pack).every(k => V1_KEYS.has(k)) && pack.schema === 'subfabric-theme-v1'
      && validCommon(pack) && V1_DESIGNS.has(pack.design) && validModes(pack.tokens, key => V1_TOKENS.has(key));
  }
  /** v1 → v2：只保留身份信息、seed 与预览图 */
  function upgrade(pack) {
    if (valid(pack)) return pack;
    if (!validV1(pack)) return null;
    const { tokens: _tokens, design: _design, ...rest } = pack;
    return { ...rest, schema: 'subfabric-theme-v2' };
  }
  const isBuiltin = packOrId => builtinIds.has(typeof packOrId === 'string' ? packOrId : packOrId?.id);
  function validList(list) {
    return Array.isArray(list) && list.length <= 24 && list.every(p => valid(upgrade(p)))
      && new Set(list.map(p => p.id)).size === list.length
      && list.every(p => !isBuiltin(p.id) && p.builtin !== true);
  }
  function clone(pack, builtin = false) {
    const out = { schema: 'subfabric-theme-v2', id: pack.id, name: pack.name.trim(), version: pack.version, description: pack.description.trim(), seed: pack.seed.toUpperCase() };
    if (pack.author?.trim()) out.author = pack.author.trim();
    if (pack.roles) out.roles = Object.fromEntries(Object.entries(pack.roles).map(([mode, values]) => [mode, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toUpperCase()]))]));
    if (pack.assets?.preview) out.assets = { preview: pack.assets.preview };
    if (builtin) out.builtin = true;
    return out;
  }
  const list = custom => [...builtins, ...(validList(custom) ? custom.map(p => clone(upgrade(p))) : [])];
  const get = (id, custom) => list(custom).find(p => p.id === id) || builtins[0];
  const canDelete = packOrId => !isBuiltin(packOrId);
  const remove = (custom, id) => validList(custom) ? custom.filter(pack => pack.id !== id).map(pack => clone(upgrade(pack))) : [];
  /** 导入或存储用：升级到 v2、去掉 builtin 标记；内置包 id 或无效包返回 null */
  function asCustom(pack) {
    const v2 = upgrade(pack);
    if (!v2 || isBuiltin(v2)) return null;
    return clone({ ...v2, builtin: false });
  }
  /** 主题包对当前明暗模式的角色覆盖（白名单内） */
  const roleOverrides = (pack, dark) => {
    const values = pack?.roles?.[dark ? 'dark' : 'light'] || {};
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => roleNames.has(key) && hex(value)));
  };
  /** 旧偏好里的主题包 id 迁移：返回 { themePack, seed? }，seed 只在必须改用旧包颜色时给出 */
  function migrateId(id, custom) {
    if (id === 'windows-uwp') return { themePack: DEFAULT_ID, seed: RETIRED[id] };
    if (Object.hasOwn(RETIRED, id)) return { themePack: DEFAULT_ID };
    return { themePack: get(id, custom).id };
  }
  const scheme = (seed, dark) => MD.scheme(seed, dark);
  window.SF_THEMES = Object.freeze({ builtins, DEFAULT_ID, RETIRED, hex, valid, validV1, upgrade, validList, list, get, isBuiltin, canDelete, remove, asCustom, roleOverrides, migrateId, scheme, contrast: MD.contrast });
}());
