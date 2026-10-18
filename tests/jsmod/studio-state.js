// 只保存界面偏好/文件夹关系；字幕、任务、模型、凭据不进入浏览器演示状态。
export const STUDIO_KEY = 'subfabric-studio-v1';
// MD3 重构：主题包只剩 Material（material-you），种子色默认 #5789DC；毛玻璃三参数与流光背景下线，
// 改为单一的 scrim（背景遮罩强度，只作用于自定义图片背景）。旧偏好由 normalizeStudio 一次性迁移。
export const defaults = Object.freeze({ themePack: 'material-you', accent: '#5789DC', mode: 'light', background: 'solid', image: '', motion: 'on', scrim: 68, custom: [], folders: [], assignments: {}, recent: '', view: 'grid' });
const id = s => typeof s === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(s);
export function imageData(s) {
  return typeof s === 'string' && s.length <= 2800000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s);
}
export function normalizeStudio(value, themes) {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const custom = themes.validList(v.custom) ? v.custom.map(pack => themes.asCustom(pack)).filter(Boolean) : [];
  const folders = Array.isArray(v.folders) ? v.folders.filter(f => f && id(f.id) && typeof f.name === 'string' && f.name.trim() && f.name.length <= 60).slice(0, 40).map(f => ({ id: f.id, name: f.name.trim() })) : [];
  const unique = folders.filter((f, i) => folders.findIndex(x => x.id === f.id) === i);
  const assignments = Object.fromEntries(Object.entries(v.assignments && typeof v.assignments === 'object' ? v.assignments : {}).filter(([p, f]) => id(p) && unique.some(x => x.id === f)).slice(0, 5000));
  // 旧内置包（Studio / Classic / UWP）迁移到 Material；UWP 当时忽略用户强调色、固定 Windows 蓝，迁移后保持这个蓝。
  const migrated = themes.migrateId(v.themePack, custom);
  return { ...defaults, themePack: migrated.themePack, accent: migrated.seed || (themes.hex(v.accent) ? v.accent.toUpperCase() : defaults.accent),
    mode: ['light', 'dark', 'system'].includes(v.mode) ? v.mode : 'light', background: v.background === 'image' ? 'image' : 'solid',
    scrim: typeof v.scrim === 'number' && Number.isFinite(v.scrim) ? Math.max(40, Math.min(95, Math.round(v.scrim))) : defaults.scrim,
    image: imageData(v.image) ? v.image : '', motion: v.motion === 'off' ? 'off' : 'on', custom, folders: unique, assignments, recent: id(v.recent) ? v.recent : '', view: v.view === 'list' ? 'list' : 'grid' };
}
export function projectPhase(project) {
  if (project.fetching || project.prepare?.status === 'running' || project.draft?.status === 'running') return 'active';
  if (['error', 'paused'].includes(project.draft?.status) || project.prepare?.status === 'error' || project.videoExists === false) return 'attention';
  if (project.format) return 'ready';
  return project.draft?.status ? 'attention' : 'active';
}
export function matchesProject(project, { route = '#/home', filter = 'all', search = '', folder = '' } = {}, assignments = {}) {
  if (route === '#/tasks' && !project.draft && projectPhase(project) !== 'active' && !project.fetching && project.prepare?.status !== 'error') return false;
  if (folder && assignments[project.id] !== folder) return false;
  if (filter !== 'all' && projectPhase(project) !== filter) return false;
  return `${project.name || ''} ${project.video?.name || ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
}
