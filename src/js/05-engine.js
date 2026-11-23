'use strict';
/* ============================================================
   05 — ENGINE: stage, camera, input, particles
   ============================================================ */
const Stage = {
  canvas: null, ctx: null, dpr: 1, w: 0, h: 0, scale: 1,
  cam: null,
  handlers: {},
  pointers: new Map(),
  dragging: false, pinch: null,
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    const c = canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onCancel(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.releaseAll();
        if (this.handlers.blur) this.handlers.blur();
      }
    });
  },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.25);
    const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
    this.dpr = dpr; this.w = w; this.h = h;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.scale = h / 720;
    if (this.handlers.resize) this.handlers.resize();
  },
  viewFor(cam) {
    const scale = this.scale * (cam ? cam.zoom : 1);
    const vw = this.w / scale, vh = this.h / scale;
    const cx = cam ? cam.x : 0, cy = cam ? cam.y : 360;
    return {
      left: cx - vw / 2, right: cx + vw / 2, top: cy - vh / 2, bottom: cy + vh / 2,
      w: vw, h: vh, scale, cx, cy
    };
  },
  apply(ctx, cam) {
    const s = this.scale * cam.zoom * this.dpr;
    const sx = (cam.shakeX || 0) * this.scale * cam.zoom;
    const sy = (cam.shakeY || 0) * this.scale * cam.zoom;
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.w / 2) - cam.x * s + sx, this.dpr * (this.h / 2) - cam.y * s + sy);
  },
  toScreen(x, y, cam) {
    const s = this.scale * cam.zoom;
    return { x: (x - cam.x) * s + this.w / 2, y: (y - cam.y) * s + this.h / 2 };
  },
  toWorld(sx, sy, cam) {
    const s = this.scale * cam.zoom;
    return { x: (sx - this.w / 2) / s + cam.x, y: (sy - this.h / 2) / s + cam.y };
  },
  onDown(e) {
    if (!this.handlers) return;
    AudioSys.unlock();
    this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
    if (this.pointers.size === 2) {
      const pts = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: this.cam ? this.cam.zoom : 1, mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2, moved: false };
      this.dragging = false;
      return;
    }
    this.pointers.get(e.pointerId).preventTap = false;
  },
  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 10) p.moved = true;
    if (this.pointers.size === 2 && this.pinch && this.cam) {
      const pts = [...this.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = d / Math.max(1, this.pinch.dist);
      this.cam.zoom = clamp(this.pinch.zoom * ratio, this.cam.minZoom || 0.72, this.cam.maxZoom || 1.45);
      // pan by midpoint
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      const s = this.scale * this.cam.zoom;
      this.cam.x -= (mx - this.pinch.mx) / s * 0.9;
      this.cam.y -= (my - this.pinch.my) / s * 0.9;
      this.pinch.mx = mx; this.pinch.my = my;
      this.pinch.moved = true;
      if (this.handlers.cameraMoved) this.handlers.cameraMoved();
      return;
    }
    if (!this.cam) return;
    if (p.moved && this.pointers.size === 1) {
      this.dragging = true;
      const s = this.scale * this.cam.zoom;
      const sens = Stage.sensitivity || 1;
      this.cam.x -= dx / s * sens;
      this.cam.y -= dy / s * sens;
      if (this.handlers.cameraMoved) this.handlers.cameraMoved();
    }
  },
  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) this.dragging = false;
    if (!p.moved && !p.preventTap && this.cam) {
      const w = this.toWorld(e.clientX, e.clientY, this.cam);
      if (this.handlers.tap) this.handlers.tap(w.x, w.y, e);
    }
    if (this.handlers.pointerUp) this.handlers.pointerUp(e);
  },
  onCancel(e) {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    this.dragging = false;
  },
  onWheel(e) {
    e.preventDefault();
    if (!this.cam) return;
    const delta = -e.deltaY * 0.0016;
    this.cam.zoom = clamp(this.cam.zoom + delta, this.cam.minZoom || 0.72, this.cam.maxZoom || 1.45);
    if (this.handlers.cameraMoved) this.handlers.cameraMoved();
    this.canvas.classList.add('zooming');
    clearTimeout(this._zt);
    this._zt = setTimeout(() => this.canvas.classList.remove('zooming'), 300);
  },
  releaseAll() {
    this.pointers.clear(); this.pinch = null; this.dragging = false;
  },
  // called when switching scene
  bind(cam, handlers) { this.cam = cam; this.handlers = handlers || {}; this.releaseAll(); },
  unbind() { this.cam = null; this.handlers = {}; this.releaseAll(); }
};

function makeCamera(x, y) {
  return {
    x, y, zoom: 1, minZoom: 0.74, maxZoom: 1.4,
    tx: x, ty: y, tz: 1, shake: 0, shakeX: 0, shakeY: 0,
    bounds: { minX: 0, maxX: 4000, minY: 300, maxY: 430 },
    follow: null, smooth: 6
  };
}

const CameraUtil = {
  setBounds(cam, level) {
    const vw = Stage.w / (Stage.scale * cam.zoom);
    cam.bounds.minX = vw / 2 - 80;
    cam.bounds.maxX = level.width - vw / 2 + 80;
    cam.bounds.minY = 250;
    cam.bounds.maxY = 470;
    if (cam.bounds.maxX < cam.bounds.minX) cam.bounds.maxX = cam.bounds.minX = level.width / 2;
  },
  clamp(cam) {
    const b = cam.bounds;
    cam.x = clamp(cam.x, b.minX, b.maxX);
    cam.y = clamp(cam.y, b.minY, b.maxY);
    cam.tx = clamp(cam.tx, b.minX, b.maxX);
    cam.ty = clamp(cam.ty, b.minY, b.maxY);
  },
  update(cam, dt, t) {
    if (cam.follow) {
      cam.tx = cam.follow.x + (cam.follow.lookAhead || 0);
      cam.ty = clamp(cam.follow.y - 70, cam.bounds.minY, cam.bounds.maxY);
    }
    const k = 1 - Math.exp(-cam.smooth * dt);
    cam.x += (cam.tx - cam.x) * k;
    cam.y += (cam.ty - cam.y) * k;
    cam.zoom += (cam.tz - cam.zoom) * Math.min(1, dt * 8);
    this.clamp(cam);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 26);
      const a = cam.shake;
      cam.shakeX = (Math.random() - 0.5) * a;
      cam.shakeY = (Math.random() - 0.5) * a;
    } else { cam.shakeX = 0; cam.shakeY = 0; }
  },
  shake(cam, amount) {
    cam.shake = Math.min(22, Math.max(cam.shake || 0, amount));
  }
};

/* ---------------- particles ---------------- */
class ParticleSystem {
  constructor(cap = 400) {
    this.cap = cap;
    this.list = [];
    this.pool = [];
    this.quality = 'high';
  }
  setQuality(q) {
    this.quality = q;
    const c = QUALITY[q] || QUALITY.high;
    this.cap = c.particles;
  }
  spawn(o) {
    if (this.list.length >= this.cap) return null;
    let p = this.pool.pop();
    if (!p) p = {};
    p.x = o.x || 0; p.y = o.y || 0;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.g = o.g != null ? o.g : 0;
    p.drag = o.drag != null ? o.drag : 0.98;
    p.life = o.life || 0.6; p.max = p.life;
    p.size = o.size || 2; p.grow = o.grow || 0;
    p.color = o.color || '#fff';
    p.kind = o.kind || 'dot';
    p.rot = o.rot || 0; p.vr = o.vr || 0;
    p.additive = !!o.additive;
    p.alpha = o.alpha != null ? o.alpha : 1;
    p.shrink = o.shrink || 0;
    this.list.push(p);
    return p;
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L.splice(i, 1);
        if (this.pool.length < 800) this.pool.push(p);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.grow) p.size = Math.max(0.2, p.size + p.grow * dt);
    }
  }
  draw(c, view) {
    const lowQ = this.quality === 'low';
    for (const p of this.list) {
      if (p.x < view.left - 80 || p.x > view.right + 80) continue;
      const a = p.alpha * Math.min(1, p.life / (p.max * 0.55));
      if (a <= 0.01) continue;
      c.globalAlpha = a;
      if (p.additive) c.globalCompositeOperation = 'lighter';
      const s = p.size;
      switch (p.kind) {
        case 'smoke':
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.fill();
          break;
        case 'dust':
          c.fillStyle = p.color;
          c.beginPath(); c.ellipse(p.x, p.y, s, s * 0.66, p.rot, 0, TAU); c.fill();
          break;
        case 'spark': {
          const sp = Math.hypot(p.vx, p.vy);
          const nx = sp ? p.vx / sp : 1, ny = sp ? p.vy / sp : 0;
          c.strokeStyle = p.color; c.lineWidth = Math.max(0.6, s * 0.5);
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - nx * s * 3, p.y - ny * s * 3); c.stroke();
          break;
        }
        case 'blood':
          c.fillStyle = p.color;
          c.beginPath(); c.ellipse(p.x, p.y, s, s * 0.8, p.rot, 0, TAU); c.fill();
          break;
        case 'casing':
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillStyle = p.color; c.fillRect(-s / 2, -s / 4, s, s / 2);
          c.restore();
          break;
        case 'debris':
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillStyle = p.color; c.fillRect(-s / 2, -s / 2, s, s * 0.7);
          c.restore();
          break;
        case 'ring':
          c.strokeStyle = p.color; c.lineWidth = Math.max(0.8, s * 0.08);
          c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.stroke();
          break;
        case 'flash':
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.fill();
          break;
        case 'fire':
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, s, 0, TAU); c.fill();
          break;
        case 'line':
          c.strokeStyle = p.color; c.lineWidth = s;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); c.stroke();
          break;
        default:
          c.fillStyle = p.color;
          c.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }
  burst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = (opts.angle != null ? opts.angle : Math.random() * TAU) + (Math.random() - 0.5) * (opts.spread || TAU);
      const sp = (opts.speed || 80) * (0.4 + Math.random() * 0.9);
      this.spawn({
        x: x + (Math.random() - 0.5) * (opts.jitter || 0),
        y: y + (Math.random() - 0.5) * (opts.jitter || 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: opts.g || 0, life: (opts.life || 0.5) * (0.6 + Math.random() * 0.8),
        size: (opts.size || 2) * (0.6 + Math.random() * 0.9),
        color: opts.colors ? opts.colors[Math.floor(Math.random() * opts.colors.length)] : opts.color,
        kind: opts.kind || 'dot', additive: opts.additive, drag: opts.drag
      });
    }
  }
}
