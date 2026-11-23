'use strict';
/* ============================================================
   01 — UTILITIES
   ============================================================ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
const smoothstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const now = () => (performance && performance.now ? performance.now() : Date.now());

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const pick = (arr, rng = Math.random) => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
const chance = (p, rng = Math.random) => rng() < p;
function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function uid(prefix = 'id') {
  uid._n = (uid._n || 0) + 1;
  return prefix + '_' + uid._n.toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function fmtNum(n) { return Math.round(n).toLocaleString('en-US'); }
function romanish(n) { return ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || String(n); }
const normAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function angleDiff(a, b) { return normAngle(a - b); }
function lerpAngle(a, b, t) { return a + angleDiff(b, a) * clamp(t, 0, 1); }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

function rectRayHit(ax, ay, bx, by, rx, ry, rw, rh) {
  const dx = bx - ax, dy = by - ay;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-8) { if (ax < rx || ax > rx + rw) return false; }
  else {
    let t1 = (rx - ax) / dx, t2 = (rx + rw - ax) / dx;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dy) < 1e-8) { if (ay < ry || ay > ry + rh) return false; }
  else {
    let t1 = (ry - ay) / dy, t2 = (ry + rh - ay) / dy;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}
function pointInRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function distToSegmentSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist2(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist2(px, py, ax + t * dx, ay + t * dy);
}

function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---- storage ---- */
function storeGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
  catch (e) { console.warn('storage read failed', key, e); return fallback; }
}
function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { console.warn('storage write failed', key, e); return false; }
}
function storeRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
function deepClone(obj) { try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; } }

/* ---- icons ---- */
const ICON_PATHS = {
  move: 'M5 19 19 5M9 5h10v10',
  sprint: 'M4 18 11 5m-3 0 7 13M13 18l7-13',
  hold: 'M7 5h10v14H7zM10 9h4M10 13h4',
  follow: 'M6 4v8a4 4 0 0 0 4 4h8M13 11l5 5-5 5',
  cover: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z',
  overwatch: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  focus: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  suppress: 'M4 12h5m-5 5h5M4 7h5M13 5l4 14M18 5l-2 6M21 8l-4 10',
  reload: 'M20 8a8 8 0 1 0 1 7M20 3v5h-5',
  heal: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  retreat: 'M19 12H5m6-6-6 6 6 6',
  regroup: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M17 8a2.6 2.6 0 1 0 0-5.2M15 13.4A5.5 5.5 0 0 1 22 19',
  queue: 'M4 6h16M4 12h10M4 18h7M17 14l3 3-3 3',
  cancel: 'M6 6l12 12M18 6 6 18',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l13 8-13 8z',
  ff: 'M3 5l9 7-9 7zM12 5l9 7-9 7z',
  sound: 'M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2.1-1.6c.06-.33.1-.66.1-1z',
  back: 'M9 6l-6 6 6 6M3 12h18',
  forward: 'M15 6l6 6-6 6M21 12H3',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  star: 'M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z',
  skull: 'M12 2a7 7 0 0 0-7 7v5l2 2v4h10v-4l2-2V9a7 7 0 0 0-7-7zM9 10h2M13 10h2M11 15h2v4h-2z',
  ammo: 'M5 21V8l4-5 4 5v13M9 3v18M15 21V10l3-4 3 4v11',
  credit: 'M12 2v20M17 6.5C16 5 14 4.5 12 4.5 9 4.5 7 6 7 8.5c0 2.6 2 3.5 5 4s5 1.5 5 4c0 2.5-2 4-5 4-2 0-4-.6-5-2',
  medkit: 'M4 7h16v13H4zM9 7V4h6v3M12 10v7M8.5 13.5h7',
  intel: 'M4 5h16v11H4zM9 21l3-5 3 5M7 9h6M7 12h10',
  target: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
  shield: 'M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6zM9 12l2 2 4-4',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 4v16M4 12h16',
  check: 'M4 12l5 6L20 6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 11v6M12 7.5v.5',
  save: 'M4 4h13l3 3v13H4zM8 4v6h8V4M8 20v-7h8v7',
  download: 'M12 3v12m-5-5 5 5 5-5M4 21h16',
  upload: 'M12 21V9m-5 5 5-5 5 5M4 3h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  soldier: 'M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM7 22v-6a5 5 0 0 1 10 0v6M5 9l2 2M19 9l-2 2M8 22h8',
  mission: 'M12 2 4 7v10l8 5 8-5V7zM12 7v10M8 9l8 6M16 9l-8 6',
  radio: 'M4 9h16v11H4zM8 9V5l8 4M8 14h3M8 17h8',
  eyeoff: 'M3 3l18 18M10.5 10.5a2 2 0 0 0 2.8 2.8M9 5.4A10 10 0 0 1 12 5c6 0 9 7 9 7a17 17 0 0 1-2.4 3.3M6.4 7.4A17 17 0 0 0 3 12s3 7 9 7c1 0 2-.2 3-.6',
  chevron: 'M9 5l7 7-7 7',
  user: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 3',
  heart: 'M12 21C7 17 3 13.5 3 9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 9 2.5c0 4-4 7.5-9 11.5z',
  crosshair: 'M12 4v5M12 15v5M4 12h5M15 12h5M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  flag: 'M5 21V3M5 4h12l-2 4 2 4H5',
  arrowup: 'M12 19V5m-6 6 6-6 6 6',
  arrowdown: 'M12 5v14m-6-6 6 6 6-6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1'
};
function icon(name, cls = 'ico') {
  const p = ICON_PATHS[name] || ICON_PATHS.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${p}"/></svg>`;
}
