'use strict';
/* ============================================================
   03 — PROCEDURAL ART SYSTEM
   Cinematic side-view illustration, fully generated.
   ============================================================ */
const Art = (() => {
  const tileCache = new Map();
  let noisePattern = null;
  let noiseCanvas = null;

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function poly(c, pts) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
  }
  function limb(c, x1, y1, x2, y2, w, color) {
    c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function lensFlare(c, x, y, r, color, alpha) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = alpha;
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }

  /* ---------------- palettes ---------------- */
  const PALETTES = {
    'urban|dusk': {
      sky: [[0, '#0e1720'], [0.38, '#33414a'], [0.66, '#7d6450'], [0.82, '#d19a63'], [1, '#f2c88e']],
      sun: { x: 0.7, y: 0.69, r: 46, color: '#ffe1ad', glow: 'rgba(255,176,96,.4)' },
      far: '#2b3439', far2: '#37424a', mid: '#232a2b', midLit: '#3a4241',
      window: 'rgba(255,196,112,.75)', window2: 'rgba(255,158,80,.4)',
      haze: 'rgba(232,176,120,.20)', fog: 'rgba(210,170,130,.13)',
      ground: ['#5a5340', '#3c392b', '#16150f'], edge: '#8b8058', grass: '#6f6b45', rubble: '#7d7357',
      fg: '#0c0e0b', tint: 'rgba(255,160,80,.055)', ambient: 'rgba(255,170,90,.08)'
    },
    'urban|night': {
      sky: [[0, '#05090f'], [0.45, '#0d1824'], [0.75, '#22303d'], [1, '#3d4a51']],
      sun: { x: 0.24, y: 0.24, r: 24, color: '#dfe9f5', glow: 'rgba(150,190,230,.22)' },
      far: '#121b23', far2: '#1b252e', mid: '#101820', midLit: '#26323a',
      window: 'rgba(255,190,110,.9)', window2: 'rgba(255,150,70,.45)',
      haze: 'rgba(80,110,140,.16)', fog: 'rgba(90,120,145,.11)',
      ground: ['#31352d', '#22251e', '#0b0c09'], edge: '#575c46', grass: '#45492f', rubble: '#4c4a3a',
      fg: '#050705', tint: 'rgba(60,110,150,.07)', ambient: 'rgba(120,170,210,.06)'
    },
    'forest|dawn': {
      sky: [[0, '#101b23'], [0.4, '#31434a'], [0.7, '#8c9a8c'], [0.88, '#d6c69a'], [1, '#eee0b6']],
      sun: { x: 0.32, y: 0.66, r: 40, color: '#fff0c8', glow: 'rgba(255,226,160,.34)' },
      far: '#394a4a', far2: '#4a5b56', mid: '#22312c', midLit: '#33463c',
      window: 'rgba(255,220,150,.6)', window2: 'rgba(255,200,120,.3)',
      haze: 'rgba(206,214,186,.2)', fog: 'rgba(190,205,180,.13)',
      ground: ['#4c5238', '#333827', '#12140e'], edge: '#78805a', grass: '#63703f', rubble: '#6b6748',
      fg: '#070b07', tint: 'rgba(180,200,140,.055)', ambient: 'rgba(200,220,160,.07)'
    },
    'forest|night': {
      sky: [[0, '#040a0d'], [0.42, '#0b1820'], [0.78, '#1b2c31'], [1, '#2b3b3c']],
      sun: { x: 0.7, y: 0.22, r: 22, color: '#d8e8ef', glow: 'rgba(150,200,215,.18)' },
      far: '#0e1a1c', far2: '#16262a', mid: '#0b1513', midLit: '#1d2e29',
      window: 'rgba(255,210,130,.8)', window2: 'rgba(255,180,90,.35)',
      haze: 'rgba(70,105,110,.2)', fog: 'rgba(80,120,125,.14)',
      ground: ['#2c3527', '#1d241a', '#080b07'], edge: '#4c5940', grass: '#3f4d2e', rubble: '#464636',
      fg: '#030604', tint: 'rgba(60,110,120,.07)', ambient: 'rgba(110,170,180,.06)'
    },
    'industrial|overcast': {
      sky: [[0, '#4a5155'], [0.42, '#6f7473'], [0.72, '#a3a094'], [1, '#c2bba7']],
      sun: { x: 0.62, y: 0.3, r: 60, color: 'rgba(255,238,205,.55)', glow: 'rgba(255,236,200,.16)' },
      far: '#5b605f', far2: '#6e7370', mid: '#3a3f3c', midLit: '#50554f',
      window: 'rgba(255,196,110,.55)', window2: 'rgba(255,160,80,.25)',
      haze: 'rgba(196,190,170,.24)', fog: 'rgba(200,200,185,.16)',
      ground: ['#565143', '#3b382d', '#17160f'], edge: '#7f7860', grass: '#5f6144', rubble: '#6e6753',
      fg: '#0a0b08', tint: 'rgba(180,170,140,.05)', ambient: 'rgba(230,210,170,.06)'
    },
    'industrial|night': {
      sky: [[0, '#070c10'], [0.45, '#111a20'], [0.76, '#242d31'], [1, '#39403f']],
      sun: { x: 0.78, y: 0.2, r: 20, color: '#e6eef2', glow: 'rgba(160,190,200,.2)' },
      far: '#131b1f', far2: '#1d2629', mid: '#0e1517', midLit: '#232d2d',
      window: 'rgba(255,180,90,.85)', window2: 'rgba(255,140,60,.4)',
      haze: 'rgba(70,95,100,.2)', fog: 'rgba(80,105,110,.14)',
      ground: ['#33352c', '#23251d', '#0a0b08'], edge: '#565a45', grass: '#494d31', rubble: '#514e3c',
      fg: '#040604', tint: 'rgba(60,100,110,.07)', ambient: 'rgba(120,170,180,.05)'
    }
  };
  function paletteFor(theme, tod) {
    return PALETTES[theme + '|' + tod] || PALETTES[theme + '|dusk'] || PALETTES['urban|dusk'];
  }

  /* ---------------- background tiles ---------------- */
  function makeTile(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    return cv;
  }

  function drawUrbanFar(c, rng, w, h, pal) {
    const baseY = h * 0.72;
    let x = -40;
    while (x < w + 40) {
      const bw = 44 + rng() * 100, bh = 90 + rng() * 230;
      const top = baseY - bh;
      c.globalAlpha = 0.85;
      c.fillStyle = pal.far;
      c.fillRect(x, top, bw, bh + 140);
      // silhouette personality on the roofline
      const kind = rng();
      if (kind < 0.2) { // stepped setbacks
        c.fillRect(x + bw * 0.18, top - 18, bw * 0.4, 18);
        c.fillRect(x + bw * 0.3, top - 34, bw * 0.2, 16);
      } else if (kind < 0.35) { // broken / shelled top: jagged silhouette
        c.beginPath(); c.moveTo(x, top + 10 + rng() * 8);
        let bx = x;
        while (bx < x + bw) {
          const seg = bw / 5;
          bx += seg;
          c.lineTo(bx - seg * 0.3, top + rng() * 14);
          c.lineTo(bx, top + 4 + rng() * 12);
        }
        c.lineTo(x + bw, baseY + 140); c.lineTo(x, baseY + 140); c.closePath();
        c.fill();
        x += bw + 4 + rng() * 22;
        continue;
      } else if (kind < 0.5) { // antenna mast
        c.fillRect(x + bw * 0.45, top - 30, 3, 30);
        c.fillRect(x + bw * 0.38, top - 22, 10, 2);
      } else if (kind < 0.62) { // water tank
        c.fillRect(x + bw * 0.32, top - 20, bw * 0.3, 14);
        c.fillRect(x + bw * 0.44, top - 6, 4, 6);
      } else if (kind < 0.72) { // crane arm
        c.fillRect(x + bw * 0.5, top - 40, 3, 40);
        c.fillRect(x + bw * 0.5, top - 40, 46, 3);
      }
      // rooftop edge highlight
      c.fillStyle = 'rgba(255,220,170,.08)';
      c.fillRect(x, top, bw, 2);
      c.globalAlpha = 1;
      x += bw + 4 + rng() * 22;
    }
    // haze
    const g = c.createLinearGradient(0, h * 0.42, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.haze);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function drawUrbanMid(c, rng, w, h, pal) {
    let x = -60;
    while (x < w + 60) {
      const bw = 90 + rng() * 130, bh = 130 + rng() * 200;
      const baseY = h * 0.83;
      const top = baseY - bh;
      c.fillStyle = pal.mid;
      c.fillRect(x, top, bw, bh + 120);
      // roof lip + broken edge
      c.fillStyle = pal.midLit;
      c.fillRect(x - 5, top - 7, bw + 10, 7);
      for (let i = 0; i < 3; i++) {
        if (rng() < 0.5) c.fillRect(x + 8 + rng() * (bw - 20), top - 18 - rng() * 8, 5, 14);
      }
      // windows
      const cols = Math.max(2, Math.floor(bw / 34));
      const rows = Math.max(2, Math.floor(bh / 44));
      for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
          if (rng() < 0.42) continue;
          const wx = x + 12 + cx * ((bw - 20) / cols);
          const wy = top + 18 + ry * ((bh - 26) / rows);
          const lit = rng() < 0.28;
          c.fillStyle = lit ? pal.window : 'rgba(8,10,10,.55)';
          c.fillRect(wx, wy, 12, 16);
          if (lit && rng() < 0.4) {
            c.fillStyle = pal.window2;
            c.fillRect(wx + 2, wy + 11, 8, 5);
          }
        }
      }
      // vertical pipe / balconies
      if (rng() < 0.5) {
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.fillRect(x + bw - 12, top, 4, bh);
      }
      x += bw + 16 + rng() * 38;
    }
    const g = c.createLinearGradient(0, h * 0.35, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.haze);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function drawForestFar(c, rng, w, h, pal) {
    // mountain ridges
    for (let layer = 0; layer < 3; layer++) {
      c.fillStyle = layer === 0 ? pal.far : layer === 1 ? pal.far2 : pal.mid;
      c.globalAlpha = 0.6 + layer * 0.12;
      c.beginPath();
      c.moveTo(-20, h * 0.74);
      let y = h * (0.6 - layer * 0.02);
      for (let x = -20; x <= w + 20; x += 60) {
        y = h * (0.58 - layer * 0.03) + Math.sin(x * 0.006 + layer * 2) * 40 + rng() * 25;
        c.lineTo(x, y);
      }
      c.lineTo(w + 20, h);
      c.lineTo(-20, h);
      c.closePath(); c.fill();
    }
    c.globalAlpha = 1;
    // mist bands
    for (let i = 0; i < 5; i++) {
      const y = h * (0.55 + i * 0.07);
      const g = c.createLinearGradient(0, y - 20, 0, y + 40);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, pal.fog);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, y - 20, w, 60);
    }
  }
  function drawForestMid(c, rng, w, h, pal) {
    const baseY = h * 0.85;
    // ground cover strip
    c.fillStyle = pal.mid;
    c.fillRect(-10, baseY - 8, w + 20, h - baseY + 20);
    const shade = 'rgba(8,10,7,.55)';
    const lit = pal.midLit || 'rgba(74,88,58,.9)';
    for (let x = -30; x < w + 30;) {
      const kind = rng();
      const th = 130 + rng() * 230;
      const top = baseY - th;
      if (kind < 0.14) {
        // dead bare tree: tapered trunk + crooked branches
        const lean = (rng() - 0.5) * 0.24;
        c.save(); c.translate(x, baseY); c.rotate(lean);
        c.fillStyle = shade;
        c.beginPath(); c.moveTo(-5, 0); c.quadraticCurveTo(-2, -th * 0.6, -1, -th); c.lineTo(2, -th); c.quadraticCurveTo(4, -th * 0.5, 6, 0); c.closePath(); c.fill();
        c.strokeStyle = shade; c.lineCap = 'round';
        for (let b = 0; b < 5; b++) {
          const by = -th * (0.35 + b * 0.13), side = b % 2 ? 1 : -1;
          c.lineWidth = 2.2 - b * 0.3;
          c.beginPath(); c.moveTo(0, by); c.quadraticCurveTo(side * 12, by - 8, side * (16 + rng() * 10), by - 14 - rng() * 8); c.stroke();
        }
        c.restore();
      } else if (kind < 0.55) {
        // spruce: narrow stacked fronds with curved edges
        const sway = (rng() - 0.5) * 6;
        c.fillStyle = shade;
        c.beginPath(); c.moveTo(x - 2.5, baseY); c.quadraticCurveTo(x - 1 + sway * 0.4, baseY - th * 0.5, x - 1.5 + sway, top + 10); c.lineTo(x + 1.5 + sway, top + 10); c.quadraticCurveTo(x + 1 + sway * 0.4, baseY - th * 0.5, x + 3, baseY); c.closePath(); c.fill();
        const tiers = 5 + Math.floor(rng() * 3);
        for (let k = 0; k < tiers; k++) {
          const yy = top + (k / tiers) * (th * 0.8);
          const ww = (16 + rng() * 10) * (1 - k / (tiers + 1.5));
          c.fillStyle = k % 2 ? pal.mid : shade;
          c.beginPath();
          c.moveTo(x + sway * (0.3 + k / tiers), yy);
          c.quadraticCurveTo(x - ww, yy + 10, x - ww * 0.55, yy + th * 0.16);
          c.quadraticCurveTo(x - ww * 0.2, yy + th * 0.13, x + sway, yy + th * 0.11);
          c.quadraticCurveTo(x + ww * 0.2, yy + th * 0.13, x + ww * 0.55, yy + th * 0.16);
          c.quadraticCurveTo(x + ww, yy + 10, x + sway * (0.3 + k / tiers), yy);
          c.closePath(); c.fill();
          if (k < tiers - 1) { // moonlit/sunlit rim
            c.fillStyle = lit; c.globalAlpha = 0.22;
            c.beginPath(); c.moveTo(x + sway, yy - 2); c.quadraticCurveTo(x + ww * 0.4, yy + 8, x + ww * 0.22, yy + th * 0.15); c.lineTo(x + sway, yy + th * 0.1); c.closePath(); c.fill();
            c.globalAlpha = 1;
          }
        }
      } else {
        // broad pine: trunk + canopy blob clusters
        c.fillStyle = shade;
        c.beginPath(); c.moveTo(x - 3, baseY); c.quadraticCurveTo(x - 1, baseY - th * 0.4, x - 2, top + th * 0.3); c.lineTo(x + 2, top + th * 0.3); c.quadraticCurveTo(x + 1, baseY - th * 0.4, x + 3.5, baseY); c.closePath(); c.fill();
        for (let k = 0; k < 7; k++) {
          const bx = x + (rng() - 0.5) * 34, by = top + 14 + rng() * (th * 0.5);
          const r = 10 + rng() * 14;
          c.fillStyle = k % 3 ? pal.mid : shade;
          c.beginPath(); c.ellipse(bx, by, r, r * 0.72, rng() * 0.6, 0, TAU); c.fill();
          c.fillStyle = lit; c.globalAlpha = 0.16;
          c.beginPath(); c.ellipse(bx - r * 0.25, by - r * 0.3, r * 0.55, r * 0.32, -0.4, 0, TAU); c.fill();
          c.globalAlpha = 1;
        }
      }
      // undergrowth: ferns / bushes / rocks / logs
      const roll = rng();
      if (roll < 0.3) {
        c.strokeStyle = shade; c.lineWidth = 1.6; c.lineCap = 'round';
        for (let f = 0; f < 5; f++) {
          const fx = x + (rng() - 0.5) * 30, fh = 8 + rng() * 12;
          c.beginPath(); c.moveTo(fx, baseY); c.quadraticCurveTo(fx + (f - 2) * 3, baseY - fh * 0.6, fx + (f - 2) * 6, baseY - fh); c.stroke();
        }
      } else if (roll < 0.42) {
        c.fillStyle = 'rgba(16,18,14,.8)';
        c.beginPath(); c.ellipse(x + 10, baseY - 4, 10 + rng() * 8, 5 + rng() * 3, 0, Math.PI, TAU); c.fill();
      }
      x += 34 + rng() * 40;
    }
    const g = c.createLinearGradient(0, h * 0.4, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.haze);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function drawIndustrialFar(c, rng, w, h, pal) {
    const baseY = h * 0.78;
    c.fillStyle = pal.far;
    let x = -50;
    while (x < w + 60) {
      const kind = rng();
      if (kind < 0.4) {
        // chimney
        const bw = 22 + rng() * 18, bh = 200 + rng() * 200;
        c.fillRect(x, baseY - bh, bw, bh + 160);
        c.fillStyle = 'rgba(0,0,0,.25)';
        c.fillRect(x, baseY - bh, bw, 12);
        c.fillStyle = pal.far;
        if (rng() < 0.5) {
          c.globalAlpha = 0.18;
          c.fillStyle = '#cfcbbd';
          c.beginPath(); c.ellipse(x + bw / 2, baseY - bh - 18, 34, 12, 0, 0, TAU); c.fill();
          c.globalAlpha = 1; c.fillStyle = pal.far;
        }
      } else if (kind < 0.72) {
        const bw = 50 + rng() * 90, bh = 90 + rng() * 150;
        c.fillRect(x, baseY - bh, bw, bh + 160);
        c.fillStyle = 'rgba(0,0,0,.2)';
        c.fillRect(x, baseY - bh, bw, 8);
        c.fillStyle = pal.far;
      } else {
        // silo
        const bw = 48 + rng() * 30, bh = 120 + rng() * 110;
        rr(c, x, baseY - bh, bw, bh + 120, bw / 2);
        c.fill();
      }
      x += 60 + rng() * 90;
    }
    // cranes
    for (let i = 0; i < 2; i++) {
      const cx = rng() * w, cy = h * 0.28, cw = 150 + rng() * 100;
      c.strokeStyle = 'rgba(20,24,22,.55)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, h * 0.8); c.lineTo(cx, cy); c.lineTo(cx + cw, cy); c.stroke();
      c.beginPath(); c.moveTo(cx, cy + 18); c.lineTo(cx + 34, cy); c.stroke();
    }
    const g = c.createLinearGradient(0, h * 0.4, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.haze);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function drawIndustrialMid(c, rng, w, h, pal) {
    const baseY = h * 0.86;
    let x = -40;
    while (x < w + 40) {
      const kind = rng();
      if (kind < 0.45) {
        const bw = 110 + rng() * 120, bh = 120 + rng() * 140;
        c.fillStyle = pal.mid;
        c.fillRect(x, baseY - bh, bw, bh + 140);
        c.fillStyle = pal.midLit;
        c.fillRect(x - 4, baseY - bh - 6, bw + 8, 6);
        // corrugation
        c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1;
        for (let k = 0; k < bw; k += 11) { c.beginPath(); c.moveTo(x + k, baseY - bh + 10); c.lineTo(x + k, baseY); c.stroke(); }
        // windows strip
        if (rng() < 0.7) {
          for (let k = 0; k < 3; k++) {
            c.fillStyle = rng() < 0.4 ? pal.window : 'rgba(10,12,12,.5)';
            c.fillRect(x + 14 + k * 30, baseY - bh + 22, 18, 12);
          }
        }
        // pipes
        if (rng() < 0.5) {
          c.strokeStyle = 'rgba(20,24,20,.8)'; c.lineWidth = 5;
          c.beginPath(); c.moveTo(x - 6, baseY - bh + 40); c.lineTo(x + bw + 6, baseY - bh + 40); c.stroke();
        }
      } else if (kind < 0.72) {
        // storage tanks
        const bw = 60 + rng() * 30, bh = 100 + rng() * 70;
        c.fillStyle = pal.mid;
        rr(c, x, baseY - bh, bw, bh + 140, 18); c.fill();
        c.fillStyle = pal.midLit;
        c.fillRect(x, baseY - bh + 20, bw, 4);
        c.fillRect(x, baseY - bh + 52, bw, 3);
      } else {
        // fence + stacked crates
        c.strokeStyle = 'rgba(18,20,17,.65)'; c.lineWidth = 2;
        for (let k = 0; k < 7; k++) {
          c.beginPath(); c.moveTo(x + k * 14, baseY - 42); c.lineTo(x + k * 14, baseY); c.stroke();
        }
        c.beginPath(); c.moveTo(x, baseY - 42); c.lineTo(x + 98, baseY - 42); c.stroke();
        c.fillStyle = 'rgba(30,28,22,.6)';
        c.fillRect(x + 10, baseY - 30, 26, 30);
        c.fillRect(x + 44, baseY - 22, 30, 22);
      }
      x += 130 + rng() * 80;
    }
    const g = c.createLinearGradient(0, h * 0.4, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, pal.haze);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function drawForegroundTile(c, rng, w, h, pal, theme) {
    const baseY = h;
    c.fillStyle = pal.fg;
    if (theme === 'forest') {
      for (let i = 0; i < 44; i++) {
        const x = rng() * w, bh = 20 + rng() * 70;
        c.beginPath();
        c.moveTo(x, baseY);
        c.quadraticCurveTo(x - 6, baseY - bh * 0.6, x - 16 - rng() * 12, baseY - bh);
        c.quadraticCurveTo(x + 2, baseY - bh * 0.55, x + 20 + rng() * 12, baseY - bh * 0.9);
        c.quadraticCurveTo(x + 6, baseY - bh * 0.4, x + 13, baseY);
        c.closePath(); c.fill();
      }
      for (let i = 0; i < 10; i++) {
        // fallen logs / rocks
        const x = rng() * w, bw = 30 + rng() * 80;
        c.globalAlpha = 0.85;
        c.beginPath(); c.ellipse(x, baseY - 3, bw / 2, 9 + rng() * 5, 0, Math.PI, TAU); c.fill();
        c.globalAlpha = 1;
      }
    } else if (theme === 'industrial') {
      for (let i = 0; i < 16; i++) {
        const x = rng() * w, bw = 18 + rng() * 60, bh = 6 + rng() * 22;
        c.globalAlpha = 0.8;
        c.fillRect(x, baseY - bh, bw, bh);
        c.globalAlpha = 1;
      }
      // chain-link suggestion
      c.strokeStyle = 'rgba(20,22,18,.7)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, baseY - 70); c.lineTo(w, baseY - 70); c.stroke();
    } else {
      for (let i = 0; i < 26; i++) {
        const x = rng() * w, bw = 20 + rng() * 70, bh = 4 + rng() * 18;
        c.globalAlpha = 0.8;
        c.fillRect(x, baseY - bh, bw, bh);
        c.globalAlpha = 1;
      }
      for (let i = 0; i < 12; i++) {
        const x = rng() * w;
        c.strokeStyle = 'rgba(10,11,8,.9)'; c.lineWidth = 1 + rng() * 2;
        c.beginPath(); c.moveTo(x, baseY); c.quadraticCurveTo(x + 4, baseY - 22, x + 12, baseY - 34 - rng() * 16); c.stroke();
      }
    }
  }
  function getTile(theme, tod, layer) {
    const key = theme + '|' + tod + '|' + layer;
    if (tileCache.has(key)) return tileCache.get(key);
    const w = 1400, h = 360;
    const cv = makeTile(w, h);
    const c = cv.getContext('2d');
    const pal = paletteFor(theme, tod);
    const rng = mulberry32(hashStr(key));
    if (layer === 'far') {
      if (theme === 'urban') drawUrbanFar(c, rng, w, h, pal);
      else if (theme === 'forest') drawForestFar(c, rng, w, h, pal);
      else drawIndustrialFar(c, rng, w, h, pal);
    } else if (layer === 'mid') {
      if (theme === 'urban') drawUrbanMid(c, rng, w, h, pal);
      else if (theme === 'forest') drawForestMid(c, rng, w, h, pal);
      else drawIndustrialMid(c, rng, w, h, pal);
    } else if (layer === 'fg') {
      drawForegroundTile(c, rng, w, h, pal, theme);
    }
    tileCache.set(key, cv);
    while (tileCache.size > 8) {
      const oldest = tileCache.keys().next().value;
      tileCache.delete(oldest);
    }
    return cv;
  }

  function drawSky(c, w, h, pal, t) {
    const g = c.createLinearGradient(0, 0, 0, h);
    for (const [p, col] of pal.sky) g.addColorStop(p, col);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // subtle cloud bands
    c.save();
    for (let i = 0; i < 5; i++) {
      const y = h * (0.16 + i * 0.1) + Math.sin(t * 0.03 + i) * 4;
      const g2 = c.createLinearGradient(0, y - 16, 0, y + 16);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(0.5, 'rgba(255,240,215,.055)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g2;
      c.fillRect(0, y - 16, w, 32);
    }
    c.restore();
  }

  function drawSun(c, w, h, pal, camx, t) {
    const sun = pal.sun;
    const x = w * sun.x - camx * 0.015, y = h * sun.y;
    lensFlare(c, x, y, sun.r * 4.5, sun.glow, 0.75);
    c.fillStyle = sun.color;
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(x, y, sun.r, 0, TAU); c.fill();
    c.globalAlpha = 1;
    lensFlare(c, x, y, sun.r * 1.8, sun.color, 0.35);
  }

  function drawStars(c, w, h, seed, t) {
    const rng = mulberry32(seed);
    c.fillStyle = 'rgba(230,240,255,.8)';
    for (let i = 0; i < 55; i++) {
      const x = rng() * w, y = rng() * h * 0.5;
      c.globalAlpha = 0.15 + rng() * 0.5;
      c.fillRect(x, y, 1, 1);
    }
    c.globalAlpha = 1;
  }

  /* ---------------- world / terrain ---------------- */
  function surfaceAt(level, x) {
    const segs = level.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (x >= s.x1 && x <= s.x2) return s.y1 + (s.y2 - s.y1) * ((x - s.x1) / Math.max(1, s.x2 - s.x1));
    }
    if (x < segs[0].x1) return segs[0].y1;
    return segs[segs.length - 1].y2;
  }

  function drawTerrain(c, level, view) {
    const x0 = Math.max(-200, view.left - 60), x1 = Math.min(level.width + 200, view.right + 60);
    const step = 10;
    c.beginPath();
    c.moveTo(x0, surfaceAt(level, x0));
    for (let x = x0; x <= x1; x += step) c.lineTo(x, surfaceAt(level, x));
    c.lineTo(x1, surfaceAt(level, x1));
    c.lineTo(x1, 1200);
    c.lineTo(x0, 1200);
    c.closePath();
    const pal = level.pal;
    const data = level.paletteData;
    const g = c.createLinearGradient(0, 460, 0, 760);
    g.addColorStop(0, data.ground[0]);
    g.addColorStop(0.45, data.ground[1]);
    g.addColorStop(1, data.ground[2]);
    c.fillStyle = g;
    c.fill();
    // dirt texture
    if (!noiseCanvas) {
      noiseCanvas = makeTile(140, 140);
      const nc = noiseCanvas.getContext('2d');
      const rng = mulberry32(99);
      for (let i = 0; i < 260; i++) {
        nc.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.05})`;
        nc.fillRect(rng() * 140, rng() * 140, 1 + rng() * 3, 1 + rng() * 3);
      }
      noisePattern = c.createPattern(noiseCanvas, 'repeat');
    }
    if (noisePattern && level.quality !== 'low') {
      c.globalAlpha = 0.5;
      c.fillStyle = noisePattern;
      c.fill();
      c.globalAlpha = 1;
    }
    // top edge
    c.beginPath();
    c.moveTo(x0, surfaceAt(level, x0));
    for (let x = x0; x <= x1; x += 8) c.lineTo(x, surfaceAt(level, x));
    c.strokeStyle = data.edge;
    c.globalAlpha = 0.55;
    c.lineWidth = 2.5;
    c.stroke();
    c.globalAlpha = 1;
    // decoration
    for (const d of level.decor) {
      if (d.x < x0 - 40 || d.x > x1 + 40) continue;
      const y = surfaceAt(level, d.x);
      if (d.type === 'grass') {
        c.strokeStyle = data.grass;
        c.globalAlpha = 0.55;
        c.lineWidth = 1.2;
        for (let i = 0; i < d.n; i++) {
          const ox = (i - d.n / 2) * 2.5;
          c.beginPath();
          c.moveTo(d.x + ox, y + 1);
          c.quadraticCurveTo(d.x + ox + d.sway, y - d.h * 0.6, d.x + ox + d.sway * 2, y - d.h);
          c.stroke();
        }
        c.globalAlpha = 1;
      } else if (d.type === 'stone') {
        c.fillStyle = 'rgba(0,0,0,.25)';
        c.beginPath(); c.ellipse(d.x, y - 1, d.r, d.r * 0.55, 0, 0, TAU); c.fill();
        c.fillStyle = data.rubble;
        c.globalAlpha = 0.7;
        c.beginPath(); c.ellipse(d.x, y - d.r * 0.5, d.r, d.r * 0.6, 0, 0, TAU); c.fill();
        c.globalAlpha = 1;
      } else if (d.type === 'debris') {
        c.fillStyle = 'rgba(10,10,8,.5)';
        c.save();
        c.translate(d.x, y - 2); c.rotate(d.rot);
        c.fillRect(-d.w / 2, -2, d.w, 3);
        c.restore();
      } else if (d.type === 'crack') {
        c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(d.x, y + 4); c.lineTo(d.x + d.dx, y + 18); c.stroke();
      }
    }
  }

  function drawPlatformFaces(c, level, view) {
    // vertical retaining walls where height jumps
    for (let i = 1; i < level.segments.length; i++) {
      const a = level.segments[i - 1], b = level.segments[i];
      if (Math.abs(a.y2 - b.y1) < 8) continue;
      const x = a.x2;
      if (x < view.left - 80 || x > view.right + 80) continue;
      const yTop = Math.min(a.y2, b.y1), yBot = Math.max(a.y2, b.y1);
      const g = c.createLinearGradient(x, yTop, x, yBot);
      g.addColorStop(0, 'rgba(48,46,36,.9)');
      g.addColorStop(1, 'rgba(14,14,10,.95)');
      c.fillStyle = g;
      c.fillRect(x - 10, yTop, 20, yBot - yTop + 30);
    }
  }

  /* ---------------- props & cover ---------------- */
  /* ---------------- elevated walkways & stairs ---------------- */
  function drawPlatforms(c, level, view) {
    const pal = level.paletteData;
    const rail = level.theme === 'industrial' ? '#5a615c' : level.theme === 'forest' ? '#5a4a32' : '#6a6152';
    const beam = level.theme === 'industrial' ? '#3c423f' : level.theme === 'forest' ? '#3a2f20' : '#474034';
    for (const p of level.platforms) {
      if (p.x2 < view.left - 140 || p.x1 > view.right + 140) continue;
      const y = p.y;
      // support legs down to whatever ground is beneath
      c.strokeStyle = 'rgba(18,18,14,.55)';
      c.lineWidth = 5;
      for (let sx = p.x1 + 24; sx < p.x2 - 8; sx += 118) {
        const gy = level.surfaceAt(sx);
        c.beginPath(); c.moveTo(sx, y + 6); c.lineTo(sx + 3, gy); c.stroke();
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(sx - 8, y + 24); c.lineTo(sx + 14, y + 24); c.stroke();
        c.lineWidth = 5;
      }
      // deck
      const g = c.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, level.theme === 'industrial' ? '#6b7470' : '#7c6a49');
      g.addColorStop(1, beam);
      c.fillStyle = g;
      c.fillRect(p.x1, y - 4, p.x2 - p.x1, 14);
      // planks / seams
      c.strokeStyle = 'rgba(20,18,14,.4)';
      c.lineWidth = 1;
      for (let sx = p.x1 + 12; sx < p.x2; sx += 26) {
        c.beginPath(); c.moveTo(sx, y - 3); c.lineTo(sx, y + 9); c.stroke();
      }
      // top edge highlight
      c.fillStyle = 'rgba(255,235,190,.16)';
      c.fillRect(p.x1, y - 4, p.x2 - p.x1, 1.2);
      // railing (back side)
      c.strokeStyle = rail;
      c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(p.x1, y - 30); c.lineTo(p.x2, y - 30); c.stroke();
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(p.x1, y - 16); c.lineTo(p.x2, y - 16); c.stroke();
      for (let sx = p.x1 + 6; sx <= p.x2 - 4; sx += 32) {
        c.beginPath(); c.moveTo(sx, y - 4); c.lineTo(sx, y - 30); c.stroke();
      }
      // end posts
      c.fillStyle = rail;
      c.fillRect(p.x1 - 2, y - 32, 4, 30);
      c.fillRect(p.x2 - 2, y - 32, 4, 30);
      // hanging lamp for industrial
      if (level.theme === 'industrial' && level.quality !== 'low') {
        const lx = (p.x1 + p.x2) / 2;
        c.strokeStyle = 'rgba(20,20,16,.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(lx, y - 30); c.lineTo(lx, y - 56); c.stroke();
        c.fillStyle = 'rgba(240,190,110,.85)';
        c.beginPath(); c.arc(lx, y - 57, 3, 0, TAU); c.fill();
        const lg = c.createRadialGradient(lx, y - 57, 2, lx, y - 57, 46);
        lg.addColorStop(0, 'rgba(255,200,110,.16)');
        lg.addColorStop(1, 'rgba(255,200,110,0)');
        c.fillStyle = lg; c.beginPath(); c.arc(lx, y - 57, 46, 0, TAU); c.fill();
      }
    }
    // stairs
    for (const st of level.stairs) {
      if (st.x2 < view.left - 100 || st.x1 > view.right + 100) continue;
      const n = Math.max(6, Math.round(Math.abs(st.x2 - st.x1) / 12));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const x0 = st.x1 + (st.x2 - st.x1) * t0;
        const x1 = st.x1 + (st.x2 - st.x1) * t1;
        const y0 = st.y1 + (st.y2 - st.y1) * t0;
        const y1 = st.y1 + (st.y2 - st.y1) * t1;
        const g = c.createLinearGradient(0, Math.min(y0, y1), 0, Math.max(y0, y1) + 10);
        g.addColorStop(0, level.theme === 'industrial' ? '#606965' : '#7a6948');
        g.addColorStop(1, beam);
        c.fillStyle = g;
        c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 10);
        c.fillStyle = 'rgba(255,240,200,.13)';
        c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, 1);
      }
      // handrail along the slope
      c.strokeStyle = rail; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(st.x1, st.y1 - 30); c.lineTo(st.x2, st.y2 - 30); c.stroke();
      for (let i = 0; i <= n; i += 2) {
        const tt = i / n;
        const sx = st.x1 + (st.x2 - st.x1) * tt;
        const sy = st.y1 + (st.y2 - st.y1) * tt;
        c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 30); c.stroke();
      }
    }
  }

  function drawCover(c, cov, level) {
    if (cov.dead) {
      // rubble remains
      c.fillStyle = 'rgba(30,28,22,.75)';
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.ellipse(cov.x - cov.w / 2 + (i + 0.5) * (cov.w / 4), cov.y - 3, cov.w / 9, 3.5, 0, 0, TAU);
        c.fill();
      }
      return;
    }
    const x = cov.x, y = cov.y, w = cov.w, h = cov.h;
    const dmg = 1 - cov.hp / cov.maxHp;
    if (cov.type === 'sandbag') {
      const rows = Math.max(2, Math.round(h / 14));
      for (let r = 0; r < rows; r++) {
        const n = 3 + (r % 2);
        for (let i = 0; i < n; i++) {
          const bw = (w / n) * 0.98;
          const bx = x - w / 2 + i * (w / n) + 1;
          const by = y - h + r * (h / rows) + 1;
          const g = c.createLinearGradient(bx, by, bx, by + h / rows);
          g.addColorStop(0, '#8a7c56');
          g.addColorStop(0.5, '#6f6344');
          g.addColorStop(1, '#4a4230');
          c.fillStyle = g;
          rr(c, bx, by, bw - 1, h / rows + 1, 3);
          c.fill();
          c.strokeStyle = 'rgba(30,26,18,.5)'; c.lineWidth = 0.8;
          c.stroke();
        }
      }
    } else if (cov.type === 'concrete') {
      const g = c.createLinearGradient(x, y - h, x, y);
      g.addColorStop(0, '#8f8b7b');
      g.addColorStop(0.55, '#6a6758');
      g.addColorStop(1, '#43412f');
      c.fillStyle = g;
      poly(c, [[x - w / 2, y], [x - w / 2 + 5, y - h], [x + w / 2 - 5, y - h], [x + w / 2, y]]);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.09)';
      c.fillRect(x - w / 2 + 6, y - h + 3, w - 12, 3);
      if (dmg > 0.3) {
        c.strokeStyle = 'rgba(20,18,14,.6)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(x - 6, y - h + 4); c.lineTo(x + 2, y - h * 0.55); c.lineTo(x - 3, y - 4); c.stroke();
      }
    } else if (cov.type === 'crate') {
      c.fillStyle = '#5d4a2e';
      c.fillRect(x - w / 2, y - h, w, h);
      c.fillStyle = '#6d5836';
      c.fillRect(x - w / 2 + 2, y - h + 2, w - 4, h - 4);
      c.strokeStyle = 'rgba(30,22,12,.8)'; c.lineWidth = 1.5;
      c.strokeRect(x - w / 2 + 2, y - h + 2, w - 4, h - 4);
      c.beginPath(); c.moveTo(x - w / 2 + 2, y - h + 2); c.lineTo(x + w / 2 - 2, y - 2); c.stroke();
      c.strokeStyle = 'rgba(30,22,12,.45)';
      c.beginPath(); c.moveTo(x - w / 2 + 2, y - 2); c.lineTo(x + w / 2 - 2, y - h + 2); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.fillRect(x - w / 2 + 2, y - h * 0.5, w - 4, 2);
    } else if (cov.type === 'container') {
      const g = c.createLinearGradient(x, y - h, x, y);
      g.addColorStop(0, '#6a5a44');
      g.addColorStop(0.5, '#514634');
      g.addColorStop(1, '#2c261c');
      c.fillStyle = g;
      c.fillRect(x - w / 2, y - h, w, h);
      c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1;
      for (let k = 6; k < w - 4; k += 9) {
        c.beginPath(); c.moveTo(x - w / 2 + k, y - h + 4); c.lineTo(x - w / 2 + k, y - 2); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,.06)';
      c.fillRect(x - w / 2, y - h, w, 3);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.fillRect(x - w / 2, y - h + 12, w, 3);
      c.fillRect(x - w / 2, y - 16, w, 4);
      c.fillStyle = 'rgba(163,90,53,.5)';
      for (let i = 0; i < 4; i++) c.fillRect(x - w / 2 + 10 + i * 16, y - h + 18 + i * 7, 4, 14);
      c.fillStyle = 'rgba(220,215,190,.35)';
      c.font = 'bold 8px "Barlow Condensed", sans-serif';
      c.fillText('CARGO', x - 16, y - h / 2 + 3);
    } else if (cov.type === 'wall') {
      c.fillStyle = '#4b4638';
      c.fillRect(x - w / 2, y - h, w, h);
      c.fillStyle = '#5a5442';
      let row = 0;
      for (let by = y - h; by < y; by += 9) {
        const off = row % 2 ? 7 : 0;
        for (let bx = x - w / 2 + off; bx < x + w / 2; bx += 16) {
          c.fillRect(bx + 1, by + 1, 13, 7);
        }
        row++;
      }
      if (dmg > 0.2) {
        c.fillStyle = 'rgba(8,8,6,.8)';
        c.beginPath(); c.arc(x + 4, y - h * 0.62, 6 + dmg * 8, 0, TAU); c.fill();
      }
    } else if (cov.type === 'wreck') {
      c.fillStyle = '#37342b';
      rr(c, x - w / 2, y - h, w, h * 0.8, 6); c.fill();
      c.fillStyle = '#454136';
      rr(c, x - w / 2 + 8, y - h - 8, w * 0.5, h * 0.45, 5); c.fill();
      c.fillStyle = '#1c1b16';
      c.beginPath(); c.arc(x - w / 2 + 12, y - 4, 6, 0, TAU); c.arc(x + w / 2 - 12, y - 4, 6, 0, TAU); c.fill();
      c.fillStyle = 'rgba(140,70,40,.4)';
      c.fillRect(x - w / 2 + 4, y - h + 4, w - 8, 4);
    } else if (cov.type === 'rock') {
      c.fillStyle = '#4b4b3e';
      poly(c, [[x - w / 2, y], [x - w / 2 + 6, y - h * 0.7], [x - 4, y - h], [x + w / 2 - 3, y - h * 0.6], [x + w / 2, y]]);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,.06)';
      poly(c, [[x - w / 2 + 6, y - h * 0.7], [x - 4, y - h], [x + 4, y - h * 0.55]]);
      c.fill();
    } else if (cov.type === 'log') {
      c.fillStyle = '#4a3a28';
      rr(c, x - w / 2, y - h, w, h, h / 2); c.fill();
      c.strokeStyle = 'rgba(30,22,14,.55)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - w / 2 + 6, y - h * 0.6); c.lineTo(x + w / 2 - 4, y - h * 0.5); c.stroke();
      c.fillStyle = '#5c4933';
      c.beginPath(); c.ellipse(x + w / 2 - 3, y - h / 2, 4, h / 2, 0, 0, TAU); c.fill();
    } else if (cov.type === 'barrel') {
      const g = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, '#7a3524');
      g.addColorStop(0.5, '#a3482f');
      g.addColorStop(1, '#5a281b');
      c.fillStyle = g;
      rr(c, x - w / 2, y - h, w, h, 4); c.fill();
      c.fillStyle = 'rgba(230,180,60,.75)';
      c.fillRect(x - w / 2, y - h * 0.62, w, 4);
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.fillRect(x - w / 2, y - h * 0.3, w, 2);
      c.fillStyle = 'rgba(0,0,0,.5)';
      c.beginPath(); c.ellipse(x, y - h, w / 2, 2.5, 0, 0, TAU); c.fill();
      if (cov.explosive) {
        c.fillStyle = 'rgba(255,220,120,' + (0.4 + Math.sin(performance.now() * 0.004) * 0.2) + ')';
        c.beginPath(); c.arc(x, y - h * 0.45, 1.6, 0, TAU); c.fill();
      }
    }
    // damage cracks overlay
    if (dmg > 0.4 && cov.type !== 'barrel') {
      c.strokeStyle = 'rgba(15,12,8,.55)'; c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - w * 0.2, y - h + 2);
      c.lineTo(x - w * 0.1, y - h * 0.55);
      c.lineTo(x - w * 0.2, y - 2);
      c.stroke();
    }
    // shadow at base
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.beginPath(); c.ellipse(x, y + 1, w * 0.55, 3, 0, 0, TAU); c.fill();
  }

  function drawProp(c, prop, level) {
    const x = prop.x, y = prop.y;
    if (prop.type === 'antenna') {
      c.strokeStyle = '#6a6a58'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 62); c.stroke();
      c.beginPath(); c.moveTo(x - 12, y); c.lineTo(x, y - 62); c.lineTo(x + 12, y); c.stroke();
      c.fillStyle = '#8e9a5e';
      c.beginPath(); c.arc(x, y - 64, 2.5, 0, TAU); c.fill();
      if (prop.powered) {
        lensFlare(c, x, y - 64, 16, 'rgba(255,170,60,.6)', 0.6);
        c.fillStyle = '#ffcf7a';
        c.beginPath(); c.arc(x, y - 64, 2, 0, TAU); c.fill();
      }
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.beginPath(); c.ellipse(x, y + 1, 14, 3, 0, 0, TAU); c.fill();
    } else if (prop.type === 'console') {
      c.fillStyle = '#3c4038';
      rr(c, x - 11, y - 24, 22, 24, 2); c.fill();
      c.fillStyle = prop.powered ? '#8fbf7a' : '#34402e';
      c.fillRect(x - 7, y - 20, 14, 8);
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.fillRect(x - 8, y - 9, 16, 4);
    } else if (prop.type === 'flare') {
      // objective marker column
      const pulse = 0.5 + Math.sin(performance.now() * 0.003) * 0.2;
      c.save();
      c.globalCompositeOperation = 'lighter';
      const g = c.createLinearGradient(0, y - 90, 0, y);
      g.addColorStop(0, 'rgba(120,220,140,0)');
      g.addColorStop(1, 'rgba(120,220,140,' + (0.18 * pulse) + ')');
      c.fillStyle = g;
      c.fillRect(x - 12, y - 90, 24, 90);
      c.restore();
    }
  }

  function drawZone(c, z, t, active) {
    const cx = z.x, w = z.w || 160, y = z.y;
    const pulse = 0.5 + Math.sin(t * 2.4 + (z.x || 0)) * 0.5;
    if (z.type === 'evac') {
      c.save();
      c.globalAlpha = active ? 0.9 : 0.5;
      c.strokeStyle = '#7fb36b';
      c.lineWidth = 1.5;
      c.setLineDash([8, 7]);
      c.beginPath(); c.ellipse(cx, y - 2, w / 2, 13, 0, 0, TAU); c.stroke();
      c.setLineDash([]);
      const g = c.createLinearGradient(0, y - 70, 0, y);
      g.addColorStop(0, 'rgba(127,179,107,0)');
      g.addColorStop(1, `rgba(127,179,107,${0.12 + pulse * 0.06})`);
      c.fillStyle = g;
      c.fillRect(cx - w / 2, y - 70, w, 70);
      // chevrons
      c.strokeStyle = 'rgba(127,179,107,.55)'; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const oy = y - 8 - i * 6;
        c.beginPath(); c.moveTo(cx - 10, oy); c.lineTo(cx, oy - 5); c.lineTo(cx + 10, oy); c.stroke();
      }
      c.restore();
    } else if (z.type === 'hold') {
      c.save();
      c.strokeStyle = active ? 'rgba(227,166,63,.85)' : 'rgba(227,166,63,.4)';
      c.lineWidth = 1.5;
      c.setLineDash([10, 6]);
      c.beginPath(); c.ellipse(cx, y, w / 2, 16, 0, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.fillStyle = `rgba(227,166,63,${0.05 + pulse * 0.03})`;
      c.fillRect(cx - w / 2, y - 60, w, 60);
      c.restore();
    } else if (z.type === 'interact') {
      c.save();
      c.globalAlpha = 0.8;
      c.strokeStyle = 'rgba(227,166,63,.7)';
      c.lineWidth = 1.2;
      c.setLineDash([5, 5]);
      c.beginPath(); c.ellipse(cx, y, 30, 8, 0, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.restore();
    }
  }

  /* ---------------- characters ---------------- */
  const ALLY = { uni: '#4b5537', uniL: '#59643f', uniD: '#333b26', vest: '#2e3423', vestD: '#242919', helmet: '#414a2e', helmetD: '#2b321e', boot: '#191b13', glove: '#22251a', belt: '#3b3323' };
  const NEUTRAL = { uni: '#8d7a58', uniL: '#a08a64', uniD: '#665741', vest: '#6d5a3f', vestD: '#54462f', helmet: null, boot: '#2a2620', glove: '#4a3f30', belt: '#5a4a34', skin: '#c79a72' };

  function enemyPalette(type) {
    const e = ENEMIES[type] || ENEMIES.rifleman;
    return {
      uni: e.color, uniL: e.color, uniD: '#241d18', vest: '#302923', vestD: '#211b16',
      helmet: '#2f2b25', helmetD: '#1d1a16', boot: '#141310', glove: '#231e18', belt: '#3b3026',
      visor: e.visor, heavy: type === 'heavy', ghillie: type === 'sniper', officer: type === 'commander'
    };
  }

  function soldierColors(u) {
    if (u.team === 'enemy') return enemyPalette(u.type);
    if (u.team === 'neutral') return NEUTRAL;
    return {
      ...ALLY,
      accent: (ROLES[u.role] && ROLES[u.role].color) || '#a9b47a',
      visor: u.role === 'sniper' ? '#b9c98a' : '#9fc4c9'
    };
  }

  function drawWeaponShape(c, id, x, y, angle, scale, recoil) {
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.scale(scale, scale);
    if (recoil) c.translate(-recoil * 2.2, 0);
    const dark = '#1e201a', mid = '#2d2f26', light = '#3e4134', steel = '#55584a';
    c.lineCap = 'round';
    const rect = (rx, ry, rw, rh, col) => { c.fillStyle = col; c.fillRect(rx, ry, rw, rh); };
    if (id === 'pistol') {
      rect(-3, -2, 8, 4, mid);
      rect(3, -1.2, 7, 2, dark);
      rect(-3, 1.5, 2.5, 5, dark);
      rect(-1, -2.5, 3, 1, light);
    } else if (id === 'smg') {
      rect(-8, -2.2, 8, 4.4, mid);
      rect(0, -2.6, 9, 5.2, dark);
      rect(7, -1.2, 12, 2, steel);
      rect(1, 2.2, 3.5, 7, dark); // mag
      rect(9, -4, 4, 1.6, light);
      rect(-6, 1.6, 3, 4, dark);
    } else if (id === 'shotgun') {
      rect(-11, -2.2, 12, 4.6, '#4a3a26');
      rect(0, -2.4, 10, 4.8, dark);
      rect(8, -1.2, 16, 2.2, steel);
      rect(8, 1.2, 12, 1.8, mid);
      rect(15, 1, 7, 3.4, '#4a3a26');
      rect(-9, 2, 4, 4, '#4a3a26');
    } else if (id === 'sniper') {
      rect(-13, -2.2, 14, 4.4, '#3c3a2a');
      rect(0, -2.6, 12, 5.2, dark);
      rect(10, -1.2, 26, 2.2, steel);
      rect(12, 1, 20, 1.4, mid);
      rect(2, -6.5, 11, 3.4, '#242620'); // scope
      rect(3, -7.6, 3, 1.4, '#181a16');
      rect(12, 2.4, 2, 5, dark);
      rect(-2, 2.2, 3, 5, dark);
    } else if (id === 'lmg') {
      rect(-9, -2.4, 10, 4.8, mid);
      rect(0, -3, 12, 6, dark);
      rect(6, 2.6, 10, 6, '#23251d'); // box mag
      rect(10, -1.3, 19, 2.4, steel);
      rect(12, 0.6, 16, 1.6, mid);
      rect(2, -4.6, 8, 1.8, light);
      rect(18, 2, 2.5, 6, dark);
      rect(23, 2, 2.5, 6, dark);
    } else if (id === 'gl') {
      rect(-8, -2.4, 9, 5, mid);
      rect(0, -3, 9, 6, dark);
      rect(8, -2.2, 9, 4.4, '#3a4030');
      rect(14, -1.6, 8, 3.2, steel);
      c.fillStyle = '#23251d';
      c.beginPath(); c.arc(4, 3.6, 4, 0, TAU); c.fill();
      rect(5, -4, 4, 1.4, light);
    } else {
      // rifle
      rect(-10, -2.2, 11, 4.4, '#3e3a2a');
      rect(0, -2.6, 11, 5.2, dark);
      rect(9, -1.8, 10, 3.6, mid);
      rect(18, -1.1, 10, 2.2, steel);
      rect(2, 2.4, 3.4, 6.5, dark);
      rect(3.4, -4.4, 5, 1.6, light);
      rect(-2, 2.2, 3, 4, dark);
      rect(12, -3.2, 5, 1, '#4a4d3e');
    }
    // top highlight
    c.fillStyle = 'rgba(255,255,255,.10)';
    c.fillRect(-4, -2.6, 11, 0.7);
    c.restore();
  }
  const MUZZLE_LEN = { rifle: 28, smg: 20, shotgun: 24, sniper: 37, lmg: 30, pistol: 13, gl: 21 };

  function muzzleOf(u) {
    const stance = u.stance || 'stand';
    const aim = u.aimAngle != null ? u.aimAngle : (u.dir > 0 ? 0 : Math.PI);
    const hx = u.x + (u.dir || 1) * 11;
    const hy = u.y + (stance === 'crouch' ? -31 : stance === 'prone' ? -9 : -40);
    const len = MUZZLE_LEN[u.weapon] || 26;
    return { x: hx + Math.cos(aim) * len, y: hy + Math.sin(aim) * len };
  }

  function drawUnit(c, u, t, opts = {}) {
    const pal = soldierColors(u);
    const dir = u.dir || 1;
    const stance = u.stance || 'stand';
    const dead = u.state === 'dead' || u.anim === 'dead';
    const down = u.state === 'down' || u.anim === 'down';
    const scale = opts.scale || 1;
    const moving = u.anim === 'walk' || u.anim === 'run';
    const p = u.walkPhase || 0;
    const aim = u.aimAngle != null ? u.aimAngle : (dir > 0 ? 0.05 : Math.PI);
    const skin = pal.skin || ['#b98b63', '#8f6446', '#c79a72', '#a37450'][hashStr(u.name || u.type || 'x') % 4];
    const crouch = stance === 'crouch' && !dead && !down;
    const prone = stance === 'prone' && !dead && !down;

    // shadow
    if (opts.shadow !== false && level_quality_shadows()) {
      c.fillStyle = 'rgba(0,0,0,.32)';
      c.beginPath(); c.ellipse(u.x, u.y + 1, dead || down || prone ? 26 : 13, 3.6, 0, 0, TAU); c.fill();
    }

    c.save();
    c.translate(u.x, u.y);
    c.scale(scale, scale);
    if (dead) { c.scale(dir, 1); c.rotate(-1.45); c.translate(2, 2); }
    else if (down) { c.scale(dir, 1); c.rotate(-1.38); c.translate(1, 3); }
    else c.scale(dir, 1);

    // ---- animation state machine inputs (real simulation state) ----
    const healing = u.anim === 'heal';
    const carrying = !!u.carryId;
    const reloading = u.reloadT > 0 && u.weaponCfg ? 1 - u.reloadT / Math.max(0.01, u.weaponCfg.reload) : 0; // 0..1
    const injured = u.injury === 'serious' ? 2 : u.injury === 'light' ? 1 : 0;
    // heavy suppression: physically cower — head down, shoulders hunched
    const suppressed = !dead && !down && (u.suppression || 0) > 60;
    const hitStagger = !dead && !down && (u.recentlyHit || 0) > 1.6;
    const peeking = !!(u.coverId && u.stance === 'crouch' && (u.overwatch || u.target || u.suppressAt || u.aimReady === 0));

    const hipY = prone ? -7 : crouch ? -17 : -24;
    const shY = prone ? -11 : crouch ? -32 : -44;
    const headY = prone ? -12 : crouch ? -39 : -52;
    // carry: strong forward hunch; serious injury: painful hunch; heal: crouch toward patient
    const hunch = (carrying ? 5 : 0) + (injured === 2 ? 3 : 0) + (suppressed ? 4 : 0);
    const lean = (carrying ? 4 : 0) + (moving && !crouch && !prone ? (u.anim === 'run' ? 4 : 2) : 0) + (healing ? 3 : 0) + hunch;
    // reload dips the muzzle through the mag-change phase; heal lowers the weapon;
    // suppression tucks the weapon close to the body
    const poseDip = reloading > 0.15 && reloading < 0.85 ? 0.55 : healing ? 0.8 : suppressed ? 0.35 : 0;
    const bob = moving && !prone ? Math.abs(Math.sin(p)) * (injured === 2 ? 0.8 : 1.2) : Math.sin(t * 1.6 + (u.id ? u.id.length : 0)) * 0.5;
    const sy = shY + bob, hy = hipY + bob;
    const la = Math.atan2(Math.sin(aim + poseDip), dir * Math.cos(aim + poseDip));
    if (peeking) c.translate(Math.cos(aim) * 3, 0); // lean out of cover toward the aim

    // ---- carried: draped over the carrier's shoulder ----
    if (u.anim === 'carried' && !dead && !down) {
      c.save();
      c.translate(0, -38);
      c.rotate(-1.15); // horizontal across the shoulder
      // legs hanging behind
      limb(c, -4, 4, -14, 16, 6.5, pal.uniD);
      c.fillStyle = pal.boot;
      c.fillRect(-17, 14, 6, 5);
      // torso + vest
      c.fillStyle = pal.uni;
      rr(c, -10, -8, 24, 13, 5); c.fill();
      c.fillStyle = pal.vest;
      rr(c, -6, -7, 16, 11, 4); c.fill();
      // arms dangling
      limb(c, 8, 0, 13, 12, 4, pal.uniL);
      // head lolling back
      c.fillStyle = skin;
      c.beginPath(); c.arc(-14, -4, 5.4, 0, TAU); c.fill();
      if (pal.helmet) {
        c.fillStyle = pal.helmet;
        c.beginPath(); c.arc(-14, -5, 6, Math.PI * 0.9, TAU); c.fill();
      }
      c.restore();
      c.restore();
      return;
    }

    // ---- prone pose ----
    if (prone || dead || down) {
      // collapsed / prone bodies: legs behind, torso forward
      const bodyLen = dead || down ? 30 : 34;
      // legs
      limb(c, -2, -6, -18, -2, 7, pal.uniD);
      limb(c, -2, -8, -16, -11, 7, pal.uni);
      c.fillStyle = pal.boot;
      c.fillRect(-23, -4, 7, 5);
      // torso
      c.save();
      c.translate(prone ? 0 : -2, prone ? -8 : -7);
      c.rotate(prone ? 0 : 0.15);
      c.fillStyle = pal.uni;
      rr(c, 0, -10, bodyLen, 13, 5); c.fill();
      c.fillStyle = pal.vest;
      rr(c, 6, -9, 20, 11, 4); c.fill();
      c.fillStyle = pal.vestD;
      c.fillRect(10, -7, 4, 7); c.fillRect(16, -7, 4, 7);
      if (pal.heavy) { c.fillStyle = pal.uniD; c.fillRect(2, -11, 12, 3); }
      // head
      c.fillStyle = skin;
      c.beginPath(); c.arc(bodyLen + 2, -4, 5.5, 0, TAU); c.fill();
      if (pal.helmet) {
        c.fillStyle = pal.helmet;
        c.beginPath(); c.arc(bodyLen + 2, -5.5, 6, Math.PI, TAU); c.fill();
        c.fillStyle = pal.helmetD;
        c.fillRect(bodyLen + 2, -12, 7, 2.5);
      } else if (u.team === 'neutral') {
        c.fillStyle = '#3a2e24';
        c.beginPath(); c.arc(bodyLen + 2, -6, 5.5, Math.PI, TAU); c.fill();
      }
      // arm
      limb(c, 14, -6, 26, 3, 4.5, pal.uniL);
      if (!dead && (u.weaponCfg || u.team !== 'neutral')) {
        // weapon on ground
        drawWeaponShape(c, u.weapon || 'rifle', 18, 2, 0.02, 0.92, 0);
        if (u.flash > 0) drawMuzzleFlash(c, 44, 2, 0.7);
      } else if (dead || u.team === 'neutral') {
        c.fillStyle = 'rgba(130,20,16,.5)';
        c.beginPath(); c.ellipse(-4, 6, 22, 5, 0, 0, TAU); c.fill();
      }
      c.restore();
      c.restore();
      return;
    }

    // ---- legs ----
    const stanceSpread = crouch ? 7 : 5;
    const stride = moving ? (u.anim === 'run' ? 11 : 7) * (injured === 2 ? 0.72 : injured === 1 ? 0.88 : 1) : 0;
    const legA = Math.sin(p) * stride;
    const legB = Math.sin(p + Math.PI) * stride;
    const liftA = moving ? Math.max(0, Math.cos(p)) * (u.anim === 'run' ? 6 : 3.5) : 0;
    const liftB = moving ? Math.max(0, -Math.cos(p)) * (u.anim === 'run' ? 6 : 3.5) : 0;
    // back leg
    drawLeg(c, -2, hy + 2, -stanceSpread + legB, 0 - liftB, pal.uniD, pal.boot, crouch);
    // front leg
    drawLeg(c, 1, hy + 2, stanceSpread + legA, 0 - liftA, pal.uni, pal.boot, crouch);

    // ---- torso ----
    const kick = Math.max(0, u.recoil || 0) * 1.4 + (hitStagger ? 2.2 : 0); // shoulder rocks back on each shot / fresh hit
    c.save();
    c.translate(lean * 0.4 - kick * 0.35, 0);
    c.rotate(lean * 0.012 - kick * 0.015 - (suppressed ? 0.05 : 0));
    // backpack — role-shaped so silhouettes differ at a glance
    if (u.role === 'medic' || u.team === 'neutral') {
      // medic: taller medical pack with a cross panel
      c.fillStyle = pal.vestD;
      rr(c, -14, shY - 1, 10, 22, 3); c.fill();
      c.fillStyle = '#ddd8c8';
      rr(c, -13, shY + 3, 8, 9, 2); c.fill();
      c.fillStyle = '#c2452d';
      c.fillRect(-10.5, shY + 5.5, 3, 4); c.fillRect(-11.8, shY + 6.6, 5.6, 1.8);
    } else if (u.role === 'support' || u.role === 'heavy') {
      // support: ammo box slung low
      c.fillStyle = pal.vestD;
      rr(c, -13, shY + 6, 11, 14, 2); c.fill();
      c.strokeStyle = '#a08a52'; c.lineWidth = 1.5;
      c.strokeRect(-12, shY + 8, 9, 10);
    } else if (u.role === 'sniper') {
      // sniper: low-profile pack + rolled mat
      c.fillStyle = pal.vestD;
      rr(c, -12, shY + 3, 9, 16, 3); c.fill();
      c.fillStyle = pal.uniD;
      rr(c, -15, shY + 12, 13, 5, 2.5); c.fill();
    } else {
      c.fillStyle = pal.vestD;
      rr(c, -12, shY + 2, 9, 18, 3); c.fill();
      c.fillStyle = 'rgba(0,0,0,.25)';
      c.fillRect(-11, shY + 7, 7, 2);
      if (u.team === 'ally') {
        c.fillStyle = 'rgba(0,0,0,.3)';
        c.fillRect(-10, shY + 13, 4, 5);
      }
    }
    // assault: breaching charge on the belt
    if (u.role === 'assault') {
      c.fillStyle = '#6d4a2c';
      rr(c, -8, hy - 6, 7, 5, 1.5); c.fill();
      c.fillStyle = '#c2452d';
      c.fillRect(-5.5, hy - 4.5, 2, 2);
    }
    // torso shape
    c.fillStyle = pal.uni;
    poly(c, [[-7, hy - 1], [6, hy - 1], [8, sy + 3], [-6, sy + 3]]);
    c.fill();
    // belt
    c.fillStyle = pal.belt;
    c.fillRect(-6.5, hy - 4, 14, 4);
    // vest
    c.fillStyle = pal.vest;
    rr(c, -7.5, sy + 4, 15, hy - sy - 6, 3.5); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1;
    c.stroke();
    // pouches
    c.fillStyle = pal.vestD;
    c.fillRect(-4, sy + 9, 5, 6);
    c.fillRect(1.5, sy + 9, 5, 6);
    c.fillRect(-4, sy + 17, 4, 5);
    // shoulder pads
    c.fillStyle = pal.uniL;
    c.beginPath(); c.ellipse(-5, sy + 4, 4.5, 3.4, -0.2, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(5.5, sy + 5, 4, 3, 0.2, 0, TAU); c.fill();
    // accent armband / role colour
    if (pal.accent) {
      c.fillStyle = pal.accent;
      c.globalAlpha = 0.85;
      c.fillRect(4.5, sy + 6, 3, 7);
      c.globalAlpha = 1;
    }
    if (u.role === 'medic') {
      c.fillStyle = '#e6e2d4'; c.fillRect(-4, sy + 20, 2.5, 2.5);
      c.fillStyle = '#c2452d'; c.fillRect(-3.7, sy + 20.4, 2, 1.6);
    }
    if (u.role === 'support' || u.role === 'heavy') {
      // ammo belt
      c.strokeStyle = '#a08a52'; c.lineWidth = 3; c.globalAlpha = 0.8;
      c.beginPath(); c.moveTo(-5, sy + 4); c.lineTo(6, sy + 20); c.stroke();
      c.globalAlpha = 1;
    }

    // ---- head ----
    const headX = 1.5 + lean * 0.3 - (suppressed ? 1.6 : 0);
    const headDuck = suppressed ? 2.5 : 0;
    // neck
    c.fillStyle = skin;
    c.fillRect(headX - 2, sy + 1, 4, 5);
    // head
    c.beginPath(); c.ellipse(headX, headY + headDuck, 5.2, 5.8, 0, 0, TAU); c.fill();
    // jaw shadow
    c.fillStyle = 'rgba(0,0,0,.18)';
    c.beginPath(); c.ellipse(headX + 1, headY + 3, 4.4, 2.6, 0, 0, TAU); c.fill();
    if (pal.helmet) {
      // helmet shell
      c.fillStyle = pal.helmet;
      c.beginPath();
      c.arc(headX, headY - 1.5 + headDuck, 6.6, Math.PI * 1.02, Math.PI * 1.98);
      c.lineTo(headX + 6, headY - 1);
      c.lineTo(headX - 6.5, headY - 1);
      c.closePath(); c.fill();
      // brim
      c.fillStyle = pal.helmetD;
      c.fillRect(headX - 6, headY - 2.5 + headDuck, 13, 2.2);
      // goggles
      c.fillStyle = '#1b1e18';
      c.fillRect(headX - 3.4, headY - 3, 8, 3.4);
      c.fillStyle = pal.visor || 'rgba(140,200,200,.75)';
      c.globalAlpha = 0.85;
      c.fillRect(headX - 2.6, headY - 2.4, 2.6, 2.2);
      c.fillRect(headX + 1, headY - 2.4, 2.6, 2.2);
      c.globalAlpha = 1;
      // side rail
      c.fillStyle = pal.helmetD;
      c.fillRect(headX - 7, headY - 4, 2, 3);
      if (u.team === 'enemy') {
        c.fillStyle = pal.visor || '#d0533b';
        c.globalAlpha = 0.8;
        c.fillRect(headX + 1, headY - 2.2, 2.4, 1.4);
        c.globalAlpha = 1;
      }
      // antenna / officer
      if (pal.officer) {
        c.strokeStyle = '#24241e'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(headX - 4, headY - 6); c.lineTo(headX - 7, headY - 15); c.stroke();
      }
    } else if (u.team === 'neutral') {
      c.fillStyle = '#3a2e24';
      c.beginPath(); c.arc(headX, headY - 2, 5.6, Math.PI, TAU); c.fill();
      if (u.tag === 'vip') { // scarf
        c.fillStyle = '#b5643f';
        c.fillRect(headX - 4, headY + 3, 9, 3);
      }
    }
    if (pal.ghillie) {
      c.strokeStyle = 'rgba(58,68,44,.9)'; c.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        c.beginPath();
        c.moveTo(headX + Math.cos(a) * 4, headY - 2 + Math.sin(a) * 3);
        c.lineTo(headX + Math.cos(a) * (9 + (i % 3) * 3), headY - 2 + Math.sin(a) * (7 + (i % 2) * 3));
        c.stroke();
      }
    }
    c.restore();

    // ---- arms + weapon ----
    const aimX = Math.cos(la), aimY = Math.sin(la);
    const handDist = prone ? 7 : 9.5;
    const handX = 3 + aimX * handDist;
    const handY = sy + 5 + aimY * handDist;
    const recoil = Math.max(0, u.recoil || 0);
    const flash = u.flash || 0;
    // support hand along barrel
    const supX = handX + aimX * 9, supY = handY + aimY * 9;
    limb(c, -4, sy + 7, supX, supY, 4.6, pal.uniD);
    c.fillStyle = pal.glove;
    c.beginPath(); c.arc(supX, supY, 2.4, 0, TAU); c.fill();
    // weapon
    if (u.weaponCfg || u.team !== 'neutral') drawWeaponShape(c, u.weapon || 'rifle', handX, handY, la, 1, recoil);
    // reload: spare magazine travels belt -> well during the mid phase
    if (reloading > 0.25 && reloading < 0.8) {
      const mt = (reloading - 0.25) / 0.55;
      const mx0 = -6, my0 = hy - 2; // belt pouch
      const mx = mx0 + (handX - mx0) * mt, my = my0 + (handY - my0) * mt;
      c.fillStyle = '#3c4034';
      rr(c, mx - 1.6, my - 3, 3.2, 6, 1); c.fill();
      c.fillStyle = pal.glove;
      c.beginPath(); c.arc(mx, my + 3.5, 2.2, 0, TAU); c.fill();
    }
    // heal: medic extends the kit toward the patient
    if (healing) {
      const kx = handX + aimX * 7, ky = handY + aimY * 7;
      c.fillStyle = '#ddd8c8';
      rr(c, kx - 4, ky - 3, 8, 6, 1.5); c.fill();
      c.fillStyle = '#c2452d';
      c.fillRect(kx - 1, ky - 2.2, 2, 4.4); c.fillRect(kx - 2.2, ky - 1, 4.4, 2);
      c.fillStyle = pal.glove;
      c.beginPath(); c.arc(kx - 5, ky, 2.2, 0, TAU); c.fill();
    }
    // carrier: both hands forward holding the casualty
    if (carrying) {
      c.fillStyle = pal.glove;
      c.beginPath(); c.arc(9, shY - 4, 2.4, 0, TAU); c.fill();
    }
    // front arm over weapon
    limb(c, 4, sy + 6, handX, handY, 5, pal.uniL);
    c.fillStyle = pal.glove;
    c.beginPath(); c.arc(handX, handY, 2.7, 0, TAU); c.fill();
    // muzzle flash
    if (flash > 0) {
      const len = MUZZLE_LEN[u.weapon] || 26;
      const mx = handX + Math.cos(la) * len, my = handY + Math.sin(la) * len;
      drawMuzzleFlash(c, mx, my, Math.min(1, flash * 8), la);
    }
    // hit flash
    if (u.hitFlash > 0) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Math.min(0.3, u.hitFlash * 1.1);
      c.fillStyle = '#ffd9c8';
      c.beginPath(); c.ellipse(0, -28, 10, 20, 0, 0, TAU); c.fill();
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    c.restore();
  }
  function level_quality_shadows() { return !window.__SC_LOWQ; }

  function drawLeg(c, hx, hy, fx, fy, col, bootCol, crouch) {
    const kx = (hx + fx) / 2 + (crouch ? 6 : 4);
    const ky = (hy + fy) / 2 + (crouch ? 2 : 1);
    limb(c, hx, hy, kx, ky, 6.5, col);
    limb(c, kx, ky, fx, fy, 5.6, col);
    // knee pad
    c.fillStyle = 'rgba(15,16,11,.5)';
    c.beginPath(); c.arc(kx, ky, 3.1, 0, TAU); c.fill();
    // boot
    c.save();
    c.translate(fx, fy);
    c.fillStyle = bootCol;
    c.beginPath();
    c.moveTo(-4, -1); c.lineTo(3, -1); c.lineTo(7, 2); c.lineTo(7, 4); c.lineTo(-4, 4); c.closePath();
    c.fill();
    c.restore();
  }

  function drawMuzzleFlash(c, x, y, a, angle) {
    if (a <= 0) return;
    c.save();
    c.translate(x, y);
    if (angle != null) c.rotate(angle);
    c.globalAlpha = Math.min(1, a);
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(255,245,200,.95)');
    g.addColorStop(0.35, 'rgba(255,190,80,.55)');
    g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, 18, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,250,220,.95)';
    c.beginPath();
    c.moveTo(0, -2.6); c.lineTo(13, 0); c.lineTo(0, 2.6); c.lineTo(4, 0);
    c.closePath(); c.fill();
    c.restore();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  function drawPortrait(canvas, soldier, opts = {}) {
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    const g = c.createRadialGradient(w / 2, h * 0.35, 4, w / 2, h * 0.5, w * 0.8);
    g.addColorStop(0, 'rgba(142,154,94,.14)');
    g.addColorStop(1, 'rgba(8,10,7,.0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const scale = opts.scale || (h / 74);
    const fake = {
      id: soldier.id, name: soldier.name, team: opts.team || 'ally', role: soldier.role,
      type: soldier.type, weapon: soldier.weapon, x: 0, y: 0, dir: 1,
      stance: 'stand', anim: 'idle', aimAngle: opts.aimAngle != null ? opts.aimAngle : 0.35,
      state: 'alive', walkPhase: 0, flash: 0, recoil: 0, hitFlash: 0,
      tag: soldier.tag
    };
    c.save();
    c.translate(w / 2, h * 0.97);
    if (opts.back) c.translate(-w * 0.05, 0);
    drawUnit(c, fake, 0, { scale, shadow: false, noLighting: true });
    c.restore();
  }

  /* ---------------- effects ---------------- */
  function drawTracer(c, x1, y1, x2, y2, alpha) {
    c.strokeStyle = `rgba(255,220,150,${alpha})`;
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.strokeStyle = `rgba(255,255,220,${alpha * 0.45})`;
    c.lineWidth = 0.6;
    c.stroke();
  }

  return {
    rr, poly, limb, lensFlare, paletteFor, getTile, drawSky, drawSun, drawStars,
    surfaceAt, drawTerrain, drawPlatformFaces, drawPlatforms, drawCover, drawProp, drawZone,
    drawUnit, drawWeaponShape, muzzleOf, drawMuzzleFlash, drawTracer, drawPortrait,
    MUZZLE_LEN
  };
})();
