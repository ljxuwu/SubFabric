/* MD3 组件行为辅助（经典脚本，window.MDUI；MD3 重构计划 P2）。
 *
 * 只做 CSS 做不到的三件事，样式全部在 css/md-components.css：
 *   1. 标签页键盘：.md-tabs[role=tablist] 里方向键 / Home / End 移动焦点并激活（MD3 默认"焦点即激活"），
 *      漫游 tabindex 保证 Tab 键只停在选中的那一页。激活就是 click()，业务原有的点击处理不用改。
 *   2. 菜单：openMenu(menu, anchor) 按锚点定位（下方优先、空间不够翻到上方、左右夹在视口内），
 *      聚焦第一个可用项，方向键 / Home / End 移动，Esc 与点外部关闭并把焦点还给锚点。
 *   3. 滑块：.md-slider 的已填充比例写到 --md-slider-fill（CSS 读不到 input 的 value）。
 * 对话框用原生 <dialog> + showModal()，焦点限制和 Esc 由浏览器负责，这里不重复实现。
 * 纯函数 nextIndex / placeMenu / sliderFill 单独导出，tests/md-components-test.mjs 直接测。
 */
(function (w, d) {
  'use strict';

  /** 在 count 个项里按按键算下一个下标；不处理的按键返回 -1。disabled(i) 为真的项会被跳过。 */
  function nextIndex(current, key, count, { vertical = false, disabled = () => false } = {}) {
    if (count <= 0) return -1;
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft', next = vertical ? 'ArrowDown' : 'ArrowRight';
    let step, start;
    if (key === next) { step = 1; start = current; }
    else if (key === prev) { step = -1; start = current; }
    else if (key === 'Home') { step = 1; start = -1; }
    else if (key === 'End') { step = -1; start = count; }
    else return -1;
    for (let i = 1; i <= count; i++) {
      const idx = (((start + step * i) % count) + count) % count;
      if (!disabled(idx)) return idx;
    }
    return -1;
  }

  /** 菜单位置：anchor/viewport 为矩形，menu 为 {width,height}；返回 {left, top, origin} */
  function placeMenu(anchor, menu, viewport, margin = 8) {
    const below = viewport.height - anchor.bottom - margin, above = anchor.top - margin;
    const flip = menu.height > below && above > below;
    let top = flip ? anchor.top - menu.height : anchor.bottom;
    top = Math.max(margin, Math.min(top, viewport.height - menu.height - margin));
    let left = anchor.left;
    const alignEnd = left + menu.width > viewport.width - margin;
    if (alignEnd) left = anchor.right - menu.width;
    left = Math.max(margin, Math.min(left, viewport.width - menu.width - margin));
    return { left: Math.round(left), top: Math.round(top), origin: `${alignEnd ? 'right' : 'left'} ${flip ? 'bottom' : 'top'}` };
  }

  /** 滑块已填充比例（百分比字符串）；min === max 时视为 0% */
  function sliderFill(value, min, max) {
    const lo = Number.isFinite(+min) ? +min : 0, hi = Number.isFinite(+max) ? +max : 100, v = +value;
    if (!(hi > lo) || !Number.isFinite(v)) return '0%';
    return `${Math.round(Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * 10000) / 100}%`;
  }
  function syncSlider(input) { input.style.setProperty('--md-slider-fill', sliderFill(input.value, input.min || 0, input.max || 100)); }
  function syncSliders(root = d) { root.querySelectorAll('.md-slider').forEach(syncSlider); }

  const isDisabled = el => el.disabled || el.getAttribute('aria-disabled') === 'true';

  /* ── 标签页 ── */
  function tabsOf(list) { return [...list.querySelectorAll('[role=tab]')].filter(t => t.closest('[role=tablist]') === list); }
  function initTabs(root = d) {
    root.querySelectorAll('.md-tabs[role=tablist]').forEach(list => {
      const tabs = tabsOf(list);
      const current = tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs.find(t => !isDisabled(t));
      tabs.forEach(t => t.setAttribute('tabindex', t === current ? '0' : '-1'));
    });
  }
  function onTabKey(e) {
    const tab = e.target.closest?.('[role=tab]'), list = tab?.closest('.md-tabs[role=tablist]');
    if (!list) return;
    const tabs = tabsOf(list), vertical = list.getAttribute('aria-orientation') === 'vertical';
    const idx = nextIndex(tabs.indexOf(tab), e.key, tabs.length, { vertical, disabled: i => isDisabled(tabs[i]) });
    if (idx < 0) return;
    e.preventDefault();
    tabs.forEach((t, i) => t.setAttribute('tabindex', i === idx ? '0' : '-1'));
    tabs[idx].focus();
    tabs[idx].click();
  }

  /* ── 菜单 ── */
  let openState = null;
  function menuItems(menu) { return [...menu.querySelectorAll('.md-menu-item, [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]')]; }
  function closeMenu(restoreFocus = true) {
    if (!openState) return;
    const { menu, anchor, onClose } = openState;
    openState = null;
    menu.hidden = true;
    anchor?.setAttribute?.('aria-expanded', 'false');
    d.removeEventListener('pointerdown', onOutside, true);
    if (restoreFocus) anchor?.focus?.();
    onClose?.();
  }
  function onOutside(e) {
    if (openState && !openState.menu.contains(e.target) && !openState.anchor?.contains?.(e.target)) closeMenu(false);
  }
  function openMenu(menu, anchor, { onClose } = {}) {
    if (openState) closeMenu(false);
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const pos = placeMenu(rect, { width: menu.offsetWidth, height: menu.offsetHeight }, { width: w.innerWidth, height: w.innerHeight });
    menu.style.left = pos.left + 'px';
    menu.style.top = pos.top + 'px';
    menu.style.setProperty('--md-menu-origin', pos.origin);
    anchor.setAttribute('aria-expanded', 'true');
    openState = { menu, anchor, onClose };
    d.addEventListener('pointerdown', onOutside, true);
    const first = menuItems(menu).find(el => !isDisabled(el));
    first?.focus();
  }
  function onMenuKey(e) {
    if (!openState || !openState.menu.contains(e.target)) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'Tab') { closeMenu(false); return; }
    const items = menuItems(openState.menu);
    const idx = nextIndex(items.indexOf(e.target.closest('.md-menu-item, [role^=menuitem]')), e.key, items.length, { vertical: true, disabled: i => isDisabled(items[i]) });
    if (idx < 0) return;
    e.preventDefault();
    items[idx].focus();
  }

  d.addEventListener('keydown', e => { onTabKey(e); onMenuKey(e); });
  d.addEventListener('click', e => {
    const tab = e.target.closest?.('.md-tabs[role=tablist] [role=tab]');
    if (tab) tabsOf(tab.closest('[role=tablist]')).forEach(t => t.setAttribute('tabindex', t === tab ? '0' : '-1'));
  });
  d.addEventListener('input', e => { if (e.target.classList?.contains('md-slider')) syncSlider(e.target); });
  function init(root = d) { initTabs(root); syncSliders(root); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', () => init()); else init();

  w.MDUI = Object.freeze({ nextIndex, placeMenu, sliderFill, syncSlider, syncSliders, initTabs, openMenu, closeMenu, init });
}(window, document));
