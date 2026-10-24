/* Material Design 3 取色（经典脚本，<head> 里同步执行）。
 *
 * 为什么是经典脚本：首屏绘制前就要按用户的种子色和明暗模式写好颜色令牌，
 * ES 模块是延迟执行的，会先闪一下默认色（原 accent.js 也是同样理由）。
 *
 * 为什么自己移植 HCT：MD3 的色调板建立在 HCT（CAM16 色相/色度 + L* 明度）上，同一 tone 在任何色相下
 * 明度一致，所以"tone 40 上放 tone 100 的字"对任意种子色都能保证对比度。项目不允许 npm 依赖，
 * 这里只移植取色需要的最小子集（CAM16 正变换、HctSolver、TonalPalette.tone），算法与常量逐字取自
 * Google material-color-utilities 0.3.0（Apache License 2.0，Copyright 2021–2022 Google LLC，
 * https://github.com/material-foundation/material-color-utilities ）。tests/md-color-test.mjs 用官方库
 * 生成的期望值核对移植结果。
 *
 * 配色方案是 MD3 的 TonalSpot（默认动态配色）：primary 色度 36、secondary 16、tertiary 色相 +60 / 色度 24、
 * neutral 6、neutral-variant 8、error 色相 25 / 色度 84；颜色角色取 MD3 静态 tone 表（见 ROLES）。
 *
 * 对外：window.SF_MD（取色 API）与 window.SSAccent（旧强调色接口的兼容层，main.js 的色块仍在用）。
 * 写到 :root 的只有 --md-sys-color-*；样式与脚本都直接使用这些角色名（旧变量名的别名层已在 MD3 重构 P8 删除）。
 */
(function (w, d) {
  'use strict';

  /* ── 颜色工具（color_utils / math_utils） ── */
  const SRGB_TO_XYZ = [[0.41233895, 0.35762064, 0.18051042], [0.2126, 0.7152, 0.0722], [0.01932141, 0.11916382, 0.95034478]];
  const WHITE_POINT_D65 = [95.047, 100.0, 108.883];
  const signum = n => (n < 0 ? -1 : n === 0 ? 0 : 1);
  const lerp = (a, b, t) => (1.0 - t) * a + t * b;
  const sanitizeDegrees = deg => { deg %= 360.0; return deg < 0 ? deg + 360.0 : deg; };
  const matrixMultiply = (row, m) => [
    row[0] * m[0][0] + row[1] * m[0][1] + row[2] * m[0][2],
    row[0] * m[1][0] + row[1] * m[1][1] + row[2] * m[1][2],
    row[0] * m[2][0] + row[1] * m[2][1] + row[2] * m[2][2],
  ];
  const argbFromRgb = (r, g, b) => (255 << 24 | (r & 255) << 16 | (g & 255) << 8 | b & 255) >>> 0;
  function linearized(c) {
    const n = c / 255.0;
    return n <= 0.040449936 ? n / 12.92 * 100.0 : Math.pow((n + 0.055) / 1.055, 2.4) * 100.0;
  }
  function delinearized(c) {
    const n = c / 100.0;
    const v = n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1.0 / 2.4) - 0.055;
    return Math.max(0, Math.min(255, Math.round(v * 255.0)));
  }
  const argbFromLinrgb = l => argbFromRgb(delinearized(l[0]), delinearized(l[1]), delinearized(l[2]));
  function labF(t) {
    const e = 216.0 / 24389.0, kappa = 24389.0 / 27.0;
    return t > e ? Math.pow(t, 1.0 / 3.0) : (kappa * t + 16) / 116;
  }
  function labInvf(ft) {
    const e = 216.0 / 24389.0, kappa = 24389.0 / 27.0, ft3 = ft * ft * ft;
    return ft3 > e ? ft3 : (116 * ft - 16) / kappa;
  }
  const yFromLstar = lstar => 100.0 * labInvf((lstar + 16.0) / 116.0);
  function argbFromLstar(lstar) {
    const c = delinearized(yFromLstar(lstar));
    return argbFromRgb(c, c, c);
  }
  function lstarFromArgb(argb) {
    const y = matrixMultiply([linearized(argb >> 16 & 255), linearized(argb >> 8 & 255), linearized(argb & 255)], SRGB_TO_XYZ)[1];
    return 116.0 * labF(y / 100.0) - 16.0;
  }
  function normHex(v) {
    let s = String(v == null ? '' : v).trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return /^#[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : '';
  }
  const argbFromHex = hex => (0xff000000 | parseInt(normHex(hex).slice(1), 16)) >>> 0;
  const hexFromArgb = argb => '#' + (argb & 0xffffff).toString(16).padStart(6, '0').toUpperCase();

  /* ── CAM16 观察条件（ViewingConditions.make() 默认参数） ── */
  const VC = (function () {
    const xyz = WHITE_POINT_D65;
    const adaptingLuminance = (200.0 / Math.PI) * yFromLstar(50.0) / 100.0, backgroundLstar = 50.0, surround = 2.0;
    const rW = xyz[0] * 0.401288 + xyz[1] * 0.650173 + xyz[2] * -0.051461;
    const gW = xyz[0] * -0.250268 + xyz[1] * 1.204414 + xyz[2] * 0.045854;
    const bW = xyz[0] * -0.002079 + xyz[1] * 0.048952 + xyz[2] * 0.953127;
    const f = 0.8 + surround / 10.0;
    const c = f >= 0.9 ? lerp(0.59, 0.69, (f - 0.9) * 10.0) : lerp(0.525, 0.59, (f - 0.8) * 10.0);
    let dd = f * (1.0 - (1.0 / 3.6) * Math.exp((-adaptingLuminance - 42.0) / 92.0));
    dd = dd > 1.0 ? 1.0 : dd < 0.0 ? 0.0 : dd;
    const rgbD = [dd * (100.0 / rW) + 1.0 - dd, dd * (100.0 / gW) + 1.0 - dd, dd * (100.0 / bW) + 1.0 - dd];
    const k = 1.0 / (5.0 * adaptingLuminance + 1.0), k4 = k * k * k * k, k4F = 1.0 - k4;
    const fl = k4 * adaptingLuminance + 0.1 * k4F * k4F * Math.cbrt(5.0 * adaptingLuminance);
    const n = yFromLstar(backgroundLstar) / xyz[1];
    const z = 1.48 + Math.sqrt(n), nbb = 0.725 / Math.pow(n, 0.2);
    const af = [rW, gW, bW].map((v, i) => Math.pow((fl * rgbD[i] * v) / 100.0, 0.42));
    const rgbA = af.map(v => (400.0 * v) / (v + 27.13));
    const aw = (2.0 * rgbA[0] + rgbA[1] + 0.05 * rgbA[2]) * nbb;
    return { n, aw, nbb, ncb: nbb, c, nc: f, rgbD, fl, fLRoot: Math.pow(fl, 0.25), z };
  }());

  /** CAM16 色相与色度（Cam16.fromIntInViewingConditions 中求 hue/chroma 的部分） */
  function cam16(argb) {
    const redL = linearized(argb >> 16 & 255), greenL = linearized(argb >> 8 & 255), blueL = linearized(argb & 255);
    const x = 0.41233895 * redL + 0.35762064 * greenL + 0.18051042 * blueL;
    const y = 0.2126 * redL + 0.7152 * greenL + 0.0722 * blueL;
    const z = 0.01932141 * redL + 0.11916382 * greenL + 0.95034478 * blueL;
    const rC = 0.401288 * x + 0.650173 * y - 0.051461 * z;
    const gC = -0.250268 * x + 1.204414 * y + 0.045854 * z;
    const bC = -0.002079 * x + 0.048952 * y + 0.953127 * z;
    const [rA, gA, bA] = [rC, gC, bC].map((v, i) => {
      const dv = VC.rgbD[i] * v, af = Math.pow((VC.fl * Math.abs(dv)) / 100.0, 0.42);
      return (signum(dv) * 400.0 * af) / (af + 27.13);
    });
    const a = (11.0 * rA + -12.0 * gA + bA) / 11.0;
    const b = (rA + gA - 2.0 * bA) / 9.0;
    const u = (20.0 * rA + 20.0 * gA + 21.0 * bA) / 20.0;
    const p2 = (40.0 * rA + 20.0 * gA + bA) / 20.0;
    const atanDegrees = (Math.atan2(b, a) * 180.0) / Math.PI;
    const hue = atanDegrees < 0 ? atanDegrees + 360.0 : atanDegrees >= 360 ? atanDegrees - 360.0 : atanDegrees;
    const j = 100.0 * Math.pow((p2 * VC.nbb) / VC.aw, VC.c * VC.z);
    const huePrime = hue < 20.14 ? hue + 360 : hue;
    const eHue = 0.25 * (Math.cos((huePrime * Math.PI) / 180.0 + 2.0) + 3.8);
    const p1 = (50000.0 / 13.0) * eHue * VC.nc * VC.ncb;
    const t = (p1 * Math.sqrt(a * a + b * b)) / (u + 0.305);
    const alpha = Math.pow(t, 0.9) * Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
    return { hue, chroma: alpha * Math.sqrt(j / 100.0) };
  }

  /* ── HctSolver：给定 色相/色度/明度 求最接近的 sRGB ── */
  const SCALED_DISCOUNT_FROM_LINRGB = [
    [0.001200833568784504, 0.002389694492170889, 0.0002795742885861124],
    [0.0005891086651375999, 0.0029785502573438758, 0.0003270666104008398],
    [0.00010146692491640572, 0.0005364214359186694, 0.0032979401770712076],
  ];
  const LINRGB_FROM_SCALED_DISCOUNT = [
    [1373.2198709594231, -1100.4251190754821, -7.278681089101213],
    [-271.815969077903, 559.6580465940733, -32.46047482791194],
    [1.9622899599665666, -57.173814538844006, 308.7233197812385],
  ];
  const Y_FROM_LINRGB = [0.2126, 0.7152, 0.0722];
  // 官方源码里是 255 个写死的常量；它们正是 8 位通道值中点 (i + 0.5) 的线性化结果，测试核对两者一致。
  const CRITICAL_PLANES = Array.from({ length: 255 }, (_, i) => linearized(i + 0.5));
  const sanitizeRadians = angle => (angle + Math.PI * 8) % (Math.PI * 2);
  function trueDelinearized(c) {
    const n = c / 100.0;
    return (n <= 0.0031308 ? n * 12.92 : 1.055 * Math.pow(n, 1.0 / 2.4) - 0.055) * 255.0;
  }
  function chromaticAdaptation(component) {
    const af = Math.pow(Math.abs(component), 0.42);
    return signum(component) * 400.0 * af / (af + 27.13);
  }
  function hueOf(linrgb) {
    const sd = matrixMultiply(linrgb, SCALED_DISCOUNT_FROM_LINRGB);
    const rA = chromaticAdaptation(sd[0]), gA = chromaticAdaptation(sd[1]), bA = chromaticAdaptation(sd[2]);
    return Math.atan2((rA + gA - 2.0 * bA) / 9.0, (11.0 * rA + -12.0 * gA + bA) / 11.0);
  }
  const areInCyclicOrder = (a, b, c) => sanitizeRadians(b - a) < sanitizeRadians(c - a);
  const isBounded = x => 0.0 <= x && x <= 100.0;
  function setCoordinate(source, coordinate, target, axis) {
    const t = (coordinate - source[axis]) / (target[axis] - source[axis]);
    return [0, 1, 2].map(i => source[i] + (target[i] - source[i]) * t);
  }
  function nthVertex(y, n) {
    const [kR, kG, kB] = Y_FROM_LINRGB;
    const coordA = n % 4 <= 1 ? 0.0 : 100.0, coordB = n % 2 === 0 ? 0.0 : 100.0;
    if (n < 4) {
      const r = (y - coordA * kG - coordB * kB) / kR;
      return isBounded(r) ? [r, coordA, coordB] : [-1.0, -1.0, -1.0];
    } else if (n < 8) {
      const g = (y - coordB * kR - coordA * kB) / kG;
      return isBounded(g) ? [coordB, g, coordA] : [-1.0, -1.0, -1.0];
    }
    const b = (y - coordA * kR - coordB * kG) / kB;
    return isBounded(b) ? [coordA, coordB, b] : [-1.0, -1.0, -1.0];
  }
  function bisectToSegment(y, targetHue) {
    let left = [-1.0, -1.0, -1.0], right = left, leftHue = 0.0, rightHue = 0.0, initialized = false, uncut = true;
    for (let n = 0; n < 12; n++) {
      const mid = nthVertex(y, n);
      if (mid[0] < 0) continue;
      const midHue = hueOf(mid);
      if (!initialized) { left = mid; right = mid; leftHue = midHue; rightHue = midHue; initialized = true; continue; }
      if (uncut || areInCyclicOrder(leftHue, midHue, rightHue)) {
        uncut = false;
        if (areInCyclicOrder(leftHue, targetHue, midHue)) { right = mid; rightHue = midHue; } else { left = mid; leftHue = midHue; }
      }
    }
    return [left, right];
  }
  function bisectToLimit(y, targetHue) {
    let [left, right] = bisectToSegment(y, targetHue);
    let leftHue = hueOf(left);
    for (let axis = 0; axis < 3; axis++) {
      if (left[axis] === right[axis]) continue;
      let lPlane, rPlane;
      if (left[axis] < right[axis]) {
        lPlane = Math.floor(trueDelinearized(left[axis]) - 0.5);
        rPlane = Math.ceil(trueDelinearized(right[axis]) - 0.5);
      } else {
        lPlane = Math.ceil(trueDelinearized(left[axis]) - 0.5);
        rPlane = Math.floor(trueDelinearized(right[axis]) - 0.5);
      }
      for (let i = 0; i < 8; i++) {
        if (Math.abs(rPlane - lPlane) <= 1) break;
        const mPlane = Math.floor((lPlane + rPlane) / 2.0);
        const mid = setCoordinate(left, CRITICAL_PLANES[mPlane], right, axis);
        const midHue = hueOf(mid);
        if (areInCyclicOrder(leftHue, targetHue, midHue)) { right = mid; rPlane = mPlane; } else { left = mid; leftHue = midHue; lPlane = mPlane; }
      }
    }
    return [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2, (left[2] + right[2]) / 2];
  }
  function inverseChromaticAdaptation(adapted) {
    const adaptedAbs = Math.abs(adapted);
    const base = Math.max(0, 27.13 * adaptedAbs / (400.0 - adaptedAbs));
    return signum(adapted) * Math.pow(base, 1.0 / 0.42);
  }
  function findResultByJ(hueRadians, chroma, y) {
    let j = Math.sqrt(y) * 11.0;
    const tInnerCoeff = 1 / Math.pow(1.64 - Math.pow(0.29, VC.n), 0.73);
    const eHue = 0.25 * (Math.cos(hueRadians + 2.0) + 3.8);
    const p1 = eHue * (50000.0 / 13.0) * VC.nc * VC.ncb;
    const hSin = Math.sin(hueRadians), hCos = Math.cos(hueRadians);
    for (let round = 0; round < 5; round++) {
      const jNormalized = j / 100.0;
      const alpha = chroma === 0.0 || j === 0.0 ? 0.0 : chroma / Math.sqrt(jNormalized);
      const t = Math.pow(alpha * tInnerCoeff, 1.0 / 0.9);
      const p2 = VC.aw * Math.pow(jNormalized, 1.0 / VC.c / VC.z) / VC.nbb;
      const gamma = 23.0 * (p2 + 0.305) * t / (23.0 * p1 + 11 * t * hCos + 108.0 * t * hSin);
      const a = gamma * hCos, b = gamma * hSin;
      const rA = (460.0 * p2 + 451.0 * a + 288.0 * b) / 1403.0;
      const gA = (460.0 * p2 - 891.0 * a - 261.0 * b) / 1403.0;
      const bA = (460.0 * p2 - 220.0 * a - 6300.0 * b) / 1403.0;
      const linrgb = matrixMultiply([inverseChromaticAdaptation(rA), inverseChromaticAdaptation(gA), inverseChromaticAdaptation(bA)], LINRGB_FROM_SCALED_DISCOUNT);
      if (linrgb[0] < 0 || linrgb[1] < 0 || linrgb[2] < 0) return 0;
      const fnj = Y_FROM_LINRGB[0] * linrgb[0] + Y_FROM_LINRGB[1] * linrgb[1] + Y_FROM_LINRGB[2] * linrgb[2];
      if (fnj <= 0) return 0;
      if (round === 4 || Math.abs(fnj - y) < 0.002) {
        if (linrgb[0] > 100.01 || linrgb[1] > 100.01 || linrgb[2] > 100.01) return 0;
        return argbFromLinrgb(linrgb);
      }
      j = j - (fnj - y) * j / (2 * fnj);
    }
    return 0;
  }
  function solveToInt(hueDegrees, chroma, lstar) {
    if (chroma < 0.0001 || lstar < 0.0001 || lstar > 99.9999) return argbFromLstar(lstar);
    hueDegrees = sanitizeDegrees(hueDegrees);
    const hueRadians = hueDegrees / 180 * Math.PI;
    const y = yFromLstar(lstar);
    const exact = findResultByJ(hueRadians, chroma, y);
    return exact !== 0 ? exact : argbFromLinrgb(bisectToLimit(y, hueRadians));
  }
  function hct(argb) {
    const cam = cam16(argb);
    return { hue: cam.hue, chroma: cam.chroma, tone: lstarFromArgb(argb) };
  }

  /* ── MD3 配色方案（TonalSpot + 静态 tone 表） ── */
  const DEFAULT_SEED = '#5789DC';
  // [色调板, 浅色 tone, 深色 tone]
  const ROLES = {
    'primary': ['p', 40, 80], 'on-primary': ['p', 100, 20], 'primary-container': ['p', 90, 30], 'on-primary-container': ['p', 10, 90], 'inverse-primary': ['p', 80, 40],
    'secondary': ['s', 40, 80], 'on-secondary': ['s', 100, 20], 'secondary-container': ['s', 90, 30], 'on-secondary-container': ['s', 10, 90],
    'tertiary': ['t', 40, 80], 'on-tertiary': ['t', 100, 20], 'tertiary-container': ['t', 90, 30], 'on-tertiary-container': ['t', 10, 90],
    'error': ['e', 40, 80], 'on-error': ['e', 100, 20], 'error-container': ['e', 90, 30], 'on-error-container': ['e', 10, 90],
    'surface': ['n', 98, 6], 'surface-dim': ['n', 87, 6], 'surface-bright': ['n', 98, 24],
    'surface-container-lowest': ['n', 100, 4], 'surface-container-low': ['n', 96, 10], 'surface-container': ['n', 94, 12],
    'surface-container-high': ['n', 92, 17], 'surface-container-highest': ['n', 90, 22],
    'on-surface': ['n', 10, 90], 'surface-variant': ['nv', 90, 30], 'on-surface-variant': ['nv', 30, 80],
    'inverse-surface': ['n', 20, 90], 'inverse-on-surface': ['n', 95, 20],
    'outline': ['nv', 50, 60], 'outline-variant': ['nv', 80, 30], 'shadow': ['n', 0, 0], 'scrim': ['n', 0, 0],
  };
  const ROLE_NAMES = Object.freeze(Object.keys(ROLES));
  function palettes(seed) {
    const { hue } = hct(argbFromHex(normHex(seed) || DEFAULT_SEED));
    return { p: [hue, 36], s: [hue, 16], t: [sanitizeDegrees(hue + 60), 24], n: [hue, 6], nv: [hue, 8], e: [25, 84] };
  }
  const schemeCache = new Map();
  /** 种子色 → { 角色名: '#RRGGBB' }；同一种子与明暗结果确定，可缓存 */
  function scheme(seed, dark) {
    const key = (normHex(seed) || DEFAULT_SEED) + (dark ? ':d' : ':l');
    if (schemeCache.has(key)) return schemeCache.get(key);
    const pals = palettes(seed), out = {};
    for (const role of ROLE_NAMES) {
      const [pal, light, darkTone] = ROLES[role], [h, c] = pals[pal];
      out[role] = hexFromArgb(solveToInt(h, c, dark ? darkTone : light));
    }
    schemeCache.set(key, Object.freeze(out));
    return schemeCache.get(key);
  }
  /** 一条色调板（用于预览与测试） */
  const tone = (hue, chroma, t) => hexFromArgb(solveToInt(hue, chroma, t));

  function luminance(hex) {
    const v = parseInt(normHex(hex).slice(1), 16);
    return [v >> 16 & 255, v >> 8 & 255, v & 255].map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  }
  /** WCAG 对比度 */
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }

  /** 把方案写成 :root 的 --md-sys-color-*；overrides 是主题包里白名单内的角色覆盖 */
  function apply(seed, dark, overrides) {
    const roles = { ...scheme(seed, dark) };
    if (overrides) for (const [role, hex] of Object.entries(overrides)) if (ROLES[role] && normHex(hex)) roles[role] = normHex(hex);
    const st = d.documentElement.style;
    for (const role of ROLE_NAMES) st.setProperty('--md-sys-color-' + role, roles[role]);
    st.colorScheme = dark ? 'dark' : 'light';
    d.documentElement.dataset.theme = dark ? 'dark' : 'light';
    return roles;
  }

  /* 种子色预设：MD3 常用种子 + 旧主题包的代表色（迁移后仍能一键找回原来的感觉） */
  const PRESETS = Object.freeze([
    { hex: '#5789DC', name: '晴空蓝 · 默认' },
    { hex: '#5C7560', name: '苔绿（原 Studio）' },
    { hex: '#FF7A45', name: '橙（原 Classic）' },
    { hex: '#0078D7', name: 'Windows 蓝（原 UWP）' },
    { hex: '#6750A4', name: 'Material 紫' },
    { hex: '#006A6A', name: '青' },
    { hex: '#386A20', name: '草绿' },
    { hex: '#8B5000', name: '琥珀' },
    { hex: '#B3261E', name: '朱红' },
    { hex: '#7D5260', name: '玫瑰' },
  ].map(Object.freeze));

  /* ── 首屏引导：读 Studio 偏好（studio-state.js 的 STUDIO_KEY），在任何内容绘制前套上颜色 ──
   * 这里只做"够画第一帧"的最小解析；完整校验与迁移由 studio-state.js 的 normalizeStudio 负责。 */
  const STUDIO_KEY = 'subfabric-studio-v1';
  function bootPrefs() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(STUDIO_KEY) || '{}') || {}; } catch (e) { v = {}; }
    // 旧 Windows UWP 主题包忽略用户强调色、固定用 Windows 蓝；迁移后保持原来的蓝色。
    const seed = v.themePack === 'windows-uwp' ? '#0078D7' : normHex(v.accent) || DEFAULT_SEED;
    const mode = ['light', 'dark', 'system'].includes(v.mode) ? v.mode : 'light';
    let systemDark = false;
    try { systemDark = w.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { systemDark = false; }
    return { seed, dark: mode === 'dark' || (mode === 'system' && systemDark) };
  }
  const boot = bootPrefs();
  apply(boot.seed, boot.dark);

  w.SF_MD = Object.freeze({
    DEFAULT_SEED, ROLE_NAMES, PRESETS, normHex, argbFromHex, hexFromArgb, hct, solveToInt, tone, palettes, scheme, contrast, apply,
    _internal: Object.freeze({ CRITICAL_PLANES, linearized, lstarFromArgb, cam16 }),
  });

  /* ── 旧强调色接口兼容层 ──
   * main.js 的主题色块仍通过 SSAccent 读写；studio.js 载入后会把 current/set/reset 换成 Studio 偏好版本。
   * 这里的默认实现只负责 studio.js 之前的那一小段时间，不再单独存储（旧 'ss-accent' 键已废弃）。 */
  let current = boot.seed;
  w.SSAccent = {
    DEFAULT: DEFAULT_SEED, PRESETS,
    normHex: hex => (normHex(hex) || '').toLowerCase(),
    current: () => current,
    set(hex) { const h = normHex(hex); if (!h) return false; current = h; apply(h, boot.dark); return true; },
    reset() { current = DEFAULT_SEED; apply(current, boot.dark); return current; },
  };
}(window, document));
