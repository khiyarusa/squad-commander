'use strict';
/* ============================================================
   06 — WORLD: level construction, navigation, line of sight
   ============================================================ */

function buildLevel(mission) {
  const W = mission.width;
  const heights = mission.heights;
  const N = heights.length;
  const ramp = 120;
  const segW = W / N;
  const segments = [];
  let x = 0;
  for (let i = 0; i < N; i++) {
    const y = heights[i];
    const isLast = i === N - 1;
    const flatEnd = isLast ? W : x + segW - ramp;
    segments.push({ x1: x, x2: flatEnd, y1: y, y2: y, flat: true });
    if (!isLast) {
      const ny = heights[i + 1];
      segments.push({ x1: flatEnd, x2: flatEnd + ramp, y1: y, y2: ny, flat: false });
      x = flatEnd + ramp;
    }
  }
  const level = {
    mission, width: W, seed: mission.seed, theme: mission.theme, tod: mission.tod,
    segments, paletteData: Art.paletteFor(mission.theme, mission.tod),
    covers: [], decor: [], props: [], zones: [], navNodes: [],
    neutrals: [], quality: 'high', weather: 0
  };
  const rng = mulberry32(mission.seed);
  level.surfaceAt = (xx) => Art.surfaceAt(level, xx);

  /* ---- decorative ground detail ---- */
  const decorCount = Math.floor(W / 26);
  for (let i = 0; i < decorCount; i++) {
    const dx = rng() * W;
    const r = rng();
    if (r < 0.55) level.decor.push({ type: 'grass', x: dx, n: 2 + Math.floor(rng() * 4), h: 5 + rng() * 9, sway: (rng() - 0.5) * 3 });
    else if (r < 0.82) level.decor.push({ type: 'stone', x: dx, r: 2 + rng() * 5 });
    else if (r < 0.94) level.decor.push({ type: 'debris', x: dx, w: 4 + rng() * 12, rot: rng() * 3 });
    else level.decor.push({ type: 'crack', x: dx, dx: 4 + rng() * 10 });
  }

  /* ---- cover objects ---- */
  const density = mission.coverDensity || 1;
  const coverTypes = mission.theme === 'forest'
    ? ['log', 'rock', 'crate', 'log', 'rock', 'sandbag', 'barrel']
    : mission.theme === 'industrial'
      ? ['container', 'concrete', 'crate', 'barrel', 'wreck', 'wall', 'container']
      : ['sandbag', 'concrete', 'crate', 'wreck', 'container', 'wall', 'barrel', 'sandbag'];
  const coverDims = {
    sandbag: [56, 34], concrete: [66, 48], crate: [48, 40], container: [118, 86],
    wall: [78, 72], wreck: [86, 52], log: [96, 26], rock: [58, 42], barrel: [28, 36]
  };
  const deployCenter = mission.deploy.x * W;
  const avoidLeft = deployCenter + (mission.deploy.width || 180) * 0.6;
  const totalCovers = Math.floor(9 * density) + 4;
  for (let i = 0; i < totalCovers; i++) {
    let cvx = 220 + (i + 0.5) * ((W - 380) / totalCovers) + (rng() - 0.5) * 100;
    cvx = clamp(cvx, 160, W - 160);
    if (cvx < avoidLeft && Math.abs(cvx - deployCenter) < 130) cvx += 220;
    const type = coverTypes[Math.floor(rng() * coverTypes.length)];
    const [w, h] = coverDims[type];
    const y = level.surfaceAt(cvx);
    level.covers.push({
      id: 'cv' + i, x: cvx, y, w, h, type, maxHp: 120 + h * 2.2, hp: 120 + h * 2.2,
      dead: false, explosive: type === 'barrel', coverValue: h / 50, occupants: []
    });
  }
  // a couple of guaranteed forward covers
  [0.34, 0.5, 0.66, 0.82].forEach((f, i) => {
    const cx = clamp(f * W + (i % 2 ? -70 : 60), 200, W - 200);
    const y = level.surfaceAt(cx);
    if (!level.covers.some((c) => Math.abs(c.x - cx) < 70)) {
      level.covers.push({
        id: 'cvx' + i, x: cx, y, w: 64, h: 46, type: i % 2 ? 'concrete' : 'sandbag',
        maxHp: 240, hp: 240, dead: false, explosive: false, coverValue: 1, occupants: []
      });
    }
  });

  /* ---- background props ---- */
  const propCount = Math.floor(W / 420);
  for (let i = 0; i < propCount; i++) {
    const px = 200 + (i + 0.4) * (W - 400) / Math.max(1, propCount) + (rng() - 0.5) * 120;
    const y = level.surfaceAt(px);
    let type;
    if (mission.theme === 'forest') type = rng() < 0.5 ? 'tree' : rng() < 0.5 ? 'tree' : 'stump';
    else if (mission.theme === 'industrial') type = rng() < 0.4 ? 'pipe' : rng() < 0.7 ? 'tank' : 'crateStack';
    else type = rng() < 0.35 ? 'pole' : rng() < 0.6 ? 'rubble' : rng() < 0.8 ? 'sign' : 'crateStack';
    level.props.push({ type, x: px, y, seed: Math.floor(rng() * 1e6), scale: 0.8 + rng() * 0.5 });
  }

  /* ---- objective zones & props ---- */
  const pts = (mission.points || {});
  const buildZoneY = (x) => level.surfaceAt(x);
  for (const obj of mission.objectives) {
    if (obj.type === 'hold') {
      const zx = obj.x * W;
      level.zones.push({ id: obj.type + '_' + level.zones.length, type: 'hold', x: zx, y: buildZoneY(zx), w: obj.width || 200, seconds: obj.seconds, label: obj.label, objective: obj });
    } else if (obj.type === 'interact') {
      const ix = obj.x * W;
      level.zones.push({ id: obj.type + '_' + level.zones.length, type: 'interact', x: ix, y: buildZoneY(ix), w: 64, seconds: obj.seconds, label: obj.label, objective: obj });
      level.props.push({ type: mission.theme === 'industrial' ? 'console' : 'antenna', x: ix, y: buildZoneY(ix), powered: true, objective: obj });
    }
  }
  const evx = (mission.evac ? mission.evac.x : 0.94) * W;
  level.zones.push({ id: 'evac', type: 'evac', x: evx, y: buildZoneY(evx), w: 150, label: 'EXTRACTION' });
  level.evac = { x: evx, y: buildZoneY(evx) };

  /* ---- neutral units ---- */
  for (const obj of mission.objectives) {
    if (obj.type === 'rescue') {
      const nx = obj.x * W;
      level.neutrals.push({ tag: obj.tag || 'vip', x: nx, y: level.surfaceAt(nx), role: 'vip', down: obj.tag === 'pilot', objective: obj });
    } else if (obj.type === 'rescueUnits') {
      const list = mission.neutrals || obj.tags.map((tag, i) => ({ tag, x: 0.56 + i * 0.08 }));
      for (const n of list) {
        const nx = n.x * W;
        level.neutrals.push({ tag: n.tag, x: nx, y: level.surfaceAt(nx), role: 'hostage', down: false });
      }
    }
  }
  if (mission.neutrals && !level.neutrals.length) {
    for (const n of mission.neutrals) {
      const nx = n.x * W;
      level.neutrals.push({ tag: n.tag, x: nx, y: level.surfaceAt(nx), role: n.role || 'vip', down: !!n.down });
    }
  }

  /* ---- deployment slots ---- */
  const dc = mission.deploy.x * W;
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const sx = clamp(dc + i * 30 - 70, 40, W - 40);
    slots.push({ x: sx, y: level.surfaceAt(sx) });
  }
  level.deploySlots = slots;

  /* ---- nav graph ---- */
  const nodes = [];
  const step = 24;
  for (let nx = 12; nx < W - 12; nx += step) {
    nodes.push({ i: nodes.length, x: nx, y: level.surfaceAt(nx) });
  }
  for (let i = 0; i < nodes.length; i++) {
    nodes[i].next = i > 0 ? i - 1 : -1;
    nodes[i].prev = i < nodes.length - 1 ? i + 1 : -1;
  }
  level.navNodes = nodes;
  level.navStep = step;
  return level;
}

function navIndexAt(level, x) {
  const n = level.navNodes;
  if (!n.length) return 0;
  return clamp(Math.round((x - n[0].x) / level.navStep), 0, n.length - 1);
}

/* A* over the surface chain (nodes are bidirectional) */
function findPath(level, fromX, toX) {
  const nodes = level.navNodes;
  if (!nodes.length) return null;
  const start = navIndexAt(level, fromX);
  const goal = navIndexAt(level, toX);
  if (start === goal) return [{ x: toX, y: level.surfaceAt(toX) }];
  const open = [start];
  const came = new Map();
  const gScore = new Map([[start, 0]]);
  const fScore = new Map([[start, Math.abs(nodes[start].x - nodes[goal].x)]]);
  const visited = new Set();
  let guard = 0;
  while (open.length && guard++ < 5000) {
    // pick lowest f (small graph, fine)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if ((fScore.get(open[i]) || 1e9) < (fScore.get(open[bi]) || 1e9)) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) {
      const path = [];
      let c = cur;
      while (c != null) { path.push({ x: nodes[c].x, y: nodes[c].y }); c = came.has(c) ? came.get(c) : null; }
      path.reverse();
      path.push({ x: toX, y: level.surfaceAt(toX) });
      // compress collinear points
      const out = [];
      for (let i = 0; i < path.length; i++) {
        if (i === 0 || i === path.length - 1) { out.push(path[i]); continue; }
        const a = path[i - 1], b = path[i], c2 = path[i + 1];
        const cross = (b.x - a.x) * (c2.y - a.y) - (b.y - a.y) * (c2.x - a.x);
        if (Math.abs(cross) > 0.8) out.push(b);
      }
      return out;
    }
    visited.add(cur);
    const neighbors = [nodes[cur].next, nodes[cur].prev].filter((v) => v != null && v >= 0 && !visited.has(v));
    for (const nb of neighbors) {
      const d = Math.abs(nodes[nb].x - nodes[cur].x) + Math.abs(nodes[nb].y - nodes[cur].y) * 1.6;
      const tg = (gScore.get(cur) || 0) + d;
      if (tg < (gScore.get(nb) != null ? gScore.get(nb) : 1e9)) {
        came.set(nb, cur);
        gScore.set(nb, tg);
        fScore.set(nb, tg + Math.abs(nodes[nb].x - nodes[goal].x));
        if (!open.includes(nb)) open.push(nb);
      }
    }
  }
  return null;
}

/* ---------------- line of sight & raycasts ---------------- */
function rayRectT(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay;
  let tmin = 0, tmax = 1;
  if (Math.abs(dx) < 1e-8) {
    if (ax < r.x || ax > r.x + r.w) return null;
  } else {
    let t1 = (r.x - ax) / dx, t2 = (r.x + r.w - ax) / dx;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-8) {
    if (ay < r.y || ay > r.y + r.h) return null;
  } else {
    let t1 = (r.y - ay) / dy, t2 = (r.y + r.h - ay) / dy;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function coverRect(cov) { return { x: cov.x - cov.w / 2, y: cov.y - cov.h, w: cov.w, h: cov.h }; }

function terrainBlocked(level, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = clamp(Math.ceil(d / 14), 3, 140);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (y > level.surfaceAt(x) - 0.5) return true;
  }
  return false;
}

function lineOfSight(level, ax, ay, bx, by, opts = {}) {
  if (terrainBlocked(level, ax, ay, bx, by)) return false;
  if (opts.ignoreCovers) return true;
  for (const cov of level.covers) {
    if (cov.dead) continue;
    if (rayRectT(ax, ay, bx, by, coverRect(cov)) != null) return false;
  }
  return true;
}

function raycastCover(level, ax, ay, bx, by) {
  let best = null;
  for (const cov of level.covers) {
    if (cov.dead) continue;
    const t = rayRectT(ax, ay, bx, by, coverRect(cov));
    if (t != null && t > 0 && t < 1 && (!best || t < best.t)) best = { t, cover: cov };
  }
  return best;
}

/* sample terrain along a shot for impact point */
function terrainHitT(level, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = clamp(Math.ceil(d / 8), 3, 220);
  for (let i = 2; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    if (y > level.surfaceAt(x) - 1) return t;
  }
  return null;
}

function findNearbyCover(level, x, threatX, maxDist = 300) {
  let best = null;
  for (const cov of level.covers) {
    if (cov.dead) continue;
    const d = Math.abs(cov.x - x);
    if (d > maxDist) continue;
    if (threatX != null) {
      const between = (cov.x - x) * (threatX - cov.x) > 0 || Math.abs(cov.x - threatX) < Math.abs(x - threatX);
      if (!between && d > 80) continue;
    }
    const claims = cov.claims ? cov.claims.length : 0;
    const score = d + claims * 150;
    if (!best || score < best.d) best = { cov, d: score };
  }
  if (!best) return null;
  const sign = threatX != null && threatX > best.cov.x ? 1 : -1;
  const tx = clamp(best.cov.x - sign * (best.cov.w / 2 + 11), 20, level.width - 20);
  return { cover: best.cov, x: tx, y: level.surfaceAt(tx) };
}

function claimCover(cov, unitId) {
  if (!cov.claims) cov.claims = [];
  if (!cov.claims.includes(unitId)) cov.claims.push(unitId);
}

function coversNear(level, x, maxDist) {
  return level.covers.filter((c) => !c.dead && Math.abs(c.x - x) < maxDist);
}
