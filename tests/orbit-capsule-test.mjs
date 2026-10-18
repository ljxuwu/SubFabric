/**
 * 首页「可编辑稿件」统计胶囊：40° 倾斜 + 文字水平（D3 保留的 Expressive 元素）。
 *
 * 胶囊按钮自身 rotate(40deg)、内部文字 rotate(-40deg) 抵消。MD3 重构 P4 起样式在 css/app-home.css：
 * 主视觉网格的第三栏按视口分档，宽度必须容得下旋转后的包围盒（w·cos40° + h·sin40°），
 * 这样不需要再用 translateX 右移，也不会压到继续编辑卡或撑出内容区。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = rel => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');
const CSS = read('editor/css/app-home.css').replace(/\/\*[\s\S]*?\*\//g, '');
const LEGACY = read('editor/css/studio.css');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + extra)); }
};
const rule = sel => {
  const m = CSS.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
  return m ? m[1] : '';
};

console.log('== 40° 胶囊与反向文字 ==');
ok(/transform: rotate\(40deg\);/.test(rule('.sf-studio .sf-orbit')), '按钮旋转 40°');
ok(/rotate\(-40deg\)/.test(rule('.sf-studio .sf-orbit > span')), '文字反向旋转 -40°（净角度 0）');
ok(/rotate\(40deg\) scale\(1\.04\)/.test(rule('.sf-studio .sf-orbit:hover')), '悬停保持 40° 并轻微放大');
ok(/rotate\(40deg\) scale\(0\.96\)/.test(rule('.sf-studio .sf-orbit:active')), '按下保持 40° 并轻微缩小');
ok(/border-radius: var\(--md-sys-shape-corner-full\)/.test(rule('.sf-studio .sf-orbit')), '整圆角胶囊');
ok(/tertiary-container/.test(rule('.sf-studio .sf-orbit')), '颜色取 MD3 tertiary-container 角色');
ok(!/rotate\((20|26|45)deg\)/.test(CSS), '没有残留旧的 20° / 26° / 45°');
ok(!/translateX\(var\(--orbit-x\)\)/.test(CSS), '不再依赖右移补偿（栏宽已容得下包围盒）');

console.log('\n== 旧样式已清理 ==');
ok(!/\.sf-orbit/.test(LEGACY), 'studio.css 里不再有 .sf-orbit 规则');
ok(!/data-design=(uwp|classic|studio)/.test(LEGACY), '不再残留 UWP / Classic / Studio 的设计分支');
ok(/<body[^>]*data-design="material"/.test(read('editor/studio.html')), '入口页默认就是 Material 设计语言');

console.log('\n== 几何：旋转后的包围盒放得进第三栏 ==');
const RAD = 40 * Math.PI / 180;
const box = (w, h) => w * Math.cos(RAD) + h * Math.sin(RAD);
const blocks = [
  { name: '桌面', media: null },
  { name: '短视口（≥1000 且 max-height:800）', media: '@media (min-width: 1000px) and (max-height: 800px)' },
  { name: '窄视口（max-width:1150）', media: '@media (max-width: 1150px)' },
];
for (const b of blocks) {
  let scope = CSS;
  if (b.media) {
    const i = CSS.indexOf(b.media + ' {');
    ok(i >= 0, `${b.name}: 有对应的媒体查询`);
    scope = CSS.slice(i, CSS.indexOf('\n}', i));
  } else scope = CSS.slice(0, CSS.indexOf('@media'));
  const orbit = scope.match(/\.sf-orbit \{[^}]*?width: (\d+)px;[^}]*?height: (\d+)px;/);
  const hero = scope.match(/\.sf-hero \{[^}]*?grid-template-columns: [^;]*? (\d+)px;/);
  ok(orbit && hero, `${b.name}: 找到胶囊尺寸与栏宽`);
  if (!orbit || !hero) continue;
  const [w, h, col] = [Number(orbit[1]), Number(orbit[2]), Number(hero[1])];
  const bb = box(w, h);
  ok(bb <= col, `${b.name}: ${w}×${h} 旋转后宽 ${bb.toFixed(1)}px ≤ 栏宽 ${col}px`, bb.toFixed(1));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
