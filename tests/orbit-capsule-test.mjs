/**
 * 首页「可编辑稿件」统计胶囊：40° 倾斜 + 文字水平。
 *
 * Material You 的胶囊用按钮自身 rotate(40deg)、内部文字 rotate(-40deg) 抵消；
 * 其它主题不倾斜（Studio/Classic 4px 圆角矩形，UWP 也保持直角），文字同样不能带旋转。
 * 40° 的包围盒仍比原 26° 宽，CSS 里按视口分档缩小并右移，避免压到稿件卡/撑出视口。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS = fs.readFileSync(path.join(HERE, '..', 'editor', 'css', 'studio.css'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra === undefined ? '' : ' :: ' + extra)); }
};

console.log('== 40° 胶囊与反向文字 ==');
ok(/\.sf-orbit \{[^}]*transform:rotate\(40deg\)/.test(CSS), '基础按钮旋转 40°');
ok(/\.sf-orbit>span \{[^}]*rotate\(-40deg\)/.test(CSS), '基础文字反向旋转 -40°（净角度 0）');
ok(!CSS.includes('rotate(20deg)') && !CSS.includes('rotate(26deg)'), '旧的 20°/26° 旋转已移除');
ok(/\.sf-orbit:hover \{[^}]*rotate\(40deg\) scale\(1\.04\)/.test(CSS), '悬停保持 40° 并轻微放大');
ok(/\.sf-orbit:active \{[^}]*rotate\(40deg\) scale\(\.96\)/.test(CSS), '按下保持 40° 并轻微缩小');

console.log('\n== Material You 专用布局 ==');
ok(/\.sf-studio\[data-design=material\] \.sf-orbit \{\s*--orbit-x: 8px;[\s\S]*?width:92px; height:140px;[\s\S]*?rotate\(40deg\)/.test(CSS),
  '桌面尺寸 92×140、右移 8px、旋转 40°');
ok(/\.sf-studio\[data-design=material\] \.sf-orbit>span,[\s\S]{0,400}?rotate\(-40deg\)/.test(CSS),
  'Material 的悬停/按下文字仍反向旋转 -40°');
ok(CSS.includes('width:88px; height:132px;'), '短视口（max-height:800）缩到 88×132');
ok(CSS.includes('width:70px; height:108px;'), '窄视口（max-width:1150）缩到 70×108');

console.log('\n== MD3 统一主题：已下线主题的胶囊覆盖已清理 ==');
ok(!/:not\(\[data-design=material\]\)/.test(CSS), '不再有"非 Material 主题"的胶囊分支（界面只剩 Material）');
ok(!/data-design=(uwp|classic|studio)/.test(CSS), '不再残留 UWP / Classic / Studio 的设计分支');
ok(/<body[^>]*data-design="material"/.test(fs.readFileSync(path.join(HERE, '../editor/studio.html'), 'utf8')), '入口页默认就是 Material 设计语言');

console.log('\n== 几何粗算：40° 包围盒 ==');
// 旋转后横向包围盒：w·cosθ + h·sinθ（θ=40°）。
const RAD = 40 * Math.PI / 180;
const box = (w, h) => w * Math.cos(RAD) + h * Math.sin(RAD);
const cases = [
  { name: '1600 桌面', w: 92, h: 140, available: 193 },
  { name: '1280×720', w: 88, h: 132, available: 181 },
  { name: '1024×768', w: 70, h: 108, available: 137 },
];
for (const c of cases) {
  const b = box(c.w, c.h);
  ok(b <= c.available - 10, `${c.name}: 横向包围盒 ${b.toFixed(1)}px ≤ 可用 ${c.available}px - 10px`, b.toFixed(1));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
