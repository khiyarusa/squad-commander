'use strict';
/* ============================================================
   06 — WORLD: multi-tier level construction, 2D navigation, LOS
   ------------------------------------------------------------
   The battlefield is a side-view tactical space with a ground
   profile, elevated walkways and stairs. Navigation is an
   explicit graph over all walkable surfaces. Solid props block
   nodes; vaultable props create costly traverse edges that
   disappear when the prop is destroyed.
   ============================================================ */

const COVER_MATERIALS = {
  sandbag:  { material: 'sandbag',  hardness: 2, protection: 0.82, density: 1.0 },
  concrete: { material: 'concrete', hardness: 3, protection: 0.92, density: 1.4 },
  rock:     { material: 'concrete', hardness: 3, protection: 0.94, density: 1.5 },
  crate:    { material: 'wood',     hardness: 1, protection: 0.55, density: 0.7 },
  log:      { material: 'wood',     hardness: 1, protection: 0.62, density: 0.8 },
  wall:     { material: 'brick',    hardness: 2, protection: 0.86, density: 1.3 },
  container:{ material: 'metal',    hardness: 2, protection: 0.74, density: 1.1 },
  wreck:    { material: 'metal',    hardness: 2, protection: 0.68, density: 1.0 },
  barrel:   { material: 'metal',    hardness: 1, protection: 0.45, density: 0.6 }
};

function makeCover(id, x, y, type, w, h, seed) {
  const mat = COVER_MATERIALS[type] || COVER_MATERIALS.crate;
  const hp = 110 + h * 2.4 * mat.density;
  return {
    id, x, y, w, h, type, material: mat.material, hardness: mat.hardness,
    protection: mat.protection, coverValue: h / 50,
    maxHp: hp, hp, dead: false, explosive: type === 'barrel',
    solid: type === 'container' || type === 'wall' || type === 'wreck',
    vaultable: type !== 'wall',
    occupants: [], claims: [], claimT: {}, reservedBy: null, seed: seed || 0
  };
}

function addPlatform(level, x1, len, clearance, id) {
  const W = level.width;
  x1 = Math.round(clamp(x1, 280, W - 680));
  const x2 = Math.round(Math.min(W - 180, x1 + len));
  let minGround = Infinity;
  for (let x = x1; x <= x2; x += 12) minGround = Math.min(minGround, level.surfaceAt(x));
  const y = Math.round(Math.min(minGround - clearance, 610));
  if (y < 300) return null;
  const stairW = 78;
  const leftBottom = Math.max(40, x1 - stairW);
  const rightBottom = Math.min(W - 40, x2 + stairW);
  const p = { id: id || 'pl' + level.platforms.length, x1, x2, y, tier: 1, kind: 'platform' };
  level.platforms.push(p);
  const leftGy = level.surfaceAt(leftBottom);
  const rightGy = level.surfaceAt(rightBottom);
  level.stairs.push({
    id: p.id + '_sl', platformId: p.id, side: 'left', tier: 0.5,
    x1: leftBottom, x2: x1, y1: leftGy, y2: y, width: 26
  });
  level.stairs.push({
    id: p.id + '_sr', platformId: p.id, side: 'right', tier: 0.5,
    x1: x2, x2: rightBottom, y1: y, y2: rightGy, width: 26
  });
  return p;
}

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
    covers: [], decor: [], props: [], zones: [], navNodes: [], platforms: [], stairs: [],
    neutrals: [], quality: 'high', weather: 0, navDirty: true, navRevision: 0,
    navReport: null, exposureT: 0
  };
  const rng = mulberry32(mission.seed);
  level.surfaceAt = (xx) => Art.surfaceAt(level, xx);
  level.floorAt = (xx, xy) => floorAt(level, xx, xy);
  level.floorCandidates = (xx) => floorCandidates(level, xx);

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

  /* ---- elevated walkways (genuine 2D verticality) ---- */
  if (W > 2600) {
    addPlatform(level, W * (0.23 + rng() * 0.05), 290 + rng() * 90, 118, 'pl0');
    addPlatform(level, W * (0.56 + rng() * 0.07), 270 + rng() * 90, 118, 'pl1');
  }
  for (const p of level.platforms) {
    level.props.push({ type: 'walkway', x: (p.x1 + p.x2) / 2, y: p.y, x1: p.x1, x2: p.x2, platform: p, seed: p.x1 });
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
  const nearStair = (cx) => level.stairs.some((s) => cx > s.x1 - 34 && cx < s.x2 + 34);
  for (let i = 0; i < totalCovers; i++) {
    let cvx = 220 + (i + 0.5) * ((W - 380) / totalCovers) + (rng() - 0.5) * 100;
    cvx = clamp(cvx, 160, W - 160);
    if (cvx < avoidLeft && Math.abs(cvx - deployCenter) < 130) cvx += 220;
    if (nearStair(cvx)) cvx += 130;
    const type = coverTypes[Math.floor(rng() * coverTypes.length)];
    const [w, h] = coverDims[type];
    const y = level.surfaceAt(cvx);
    level.covers.push(makeCover('cv' + i, cvx, y, type, w, h, i));
  }
  // guaranteed forward covers
  [0.34, 0.5, 0.66, 0.82].forEach((f, i) => {
    const cx = clamp(f * W + (i % 2 ? -70 : 60), 200, W - 200);
    if (nearStair(cx)) return;
    const y = level.surfaceAt(cx);
    if (!level.covers.some((c) => Math.abs(c.x - cx) < 70 && Math.abs(c.y - y) < 24)) {
      level.covers.push(makeCover('cvx' + i, cx, y, i % 2 ? 'concrete' : 'sandbag', 64, 46, 100 + i));
    }
  });
  // platform cover: one firing position per walkway, never on the stair mouth
  let plCoverIdx = 0;
  for (const p of level.platforms) {
    const cx = p.x1 + (p.x2 - p.x1) * (0.38 + rng() * 0.2);
    level.covers.push(makeCover('cvp' + (plCoverIdx++), cx, p.y, rng() < 0.5 ? 'sandbag' : 'crate', 52, 36, 200 + plCoverIdx));
    const ex = p.x2 - 42;
    if (ex > cx + 60) level.covers.push(makeCover('cvp' + (plCoverIdx++), ex, p.y, 'crate', 44, 34, 300 + plCoverIdx));
  }

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
  void pts;
  for (const obj of mission.objectives) {
    if (obj.type === 'hold') {
      const zx = obj.x * W;
      level.zones.push({ id: obj.type + '_' + level.zones.length, type: 'hold', x: zx, y: level.surfaceAt(zx), w: obj.width || 200, seconds: obj.seconds, label: obj.label, objective: obj });
    } else if (obj.type === 'interact') {
      const ix = obj.x * W;
      level.zones.push({ id: obj.type + '_' + level.zones.length, type: 'interact', x: ix, y: level.surfaceAt(ix), w: 64, seconds: obj.seconds, label: obj.label, objective: obj });
      level.props.push({ type: mission.theme === 'industrial' ? 'console' : 'antenna', x: ix, y: level.surfaceAt(ix), powered: true, objective: obj });
    }
  }
  const evx = (mission.evac ? mission.evac.x : 0.94) * W;
  level.zones.push({ id: 'evac', type: 'evac', x: evx, y: level.surfaceAt(evx), w: 150, label: 'EXTRACTION' });
  level.evac = { x: evx, y: level.surfaceAt(evx) };

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

  /* ---- deployment slots (ground, on a walkable node) ---- */
  const dc = mission.deploy.x * W;
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const sx = clamp(dc + i * 30 - 70, 40, W - 40);
    slots.push({ x: sx, y: level.surfaceAt(sx) });
  }
  level.deploySlots = slots;

  buildNavGraph(level);
  validateLevelReachability(level);
  return level;
}

/* ============================================================
   Walkable surfaces and floor queries
   ============================================================ */
function floorCandidates(level, x) {
  const out = [{ y: level.surfaceAt(x), id: 'ground', kind: 'ground', tier: 0 }];
  for (const p of level.platforms) {
    if (x >= p.x1 - 0.5 && x <= p.x2 + 0.5) out.push({ y: p.y, id: p.id, kind: 'platform', tier: 1 });
  }
  for (const s of level.stairs) {
    if (x >= s.x1 - 0.5 && x <= s.x2 + 0.5) {
      const t = (x - s.x1) / Math.max(1, s.x2 - s.x1);
      out.push({ y: s.y1 + (s.y2 - s.y1) * t, id: s.id, kind: 'stair', tier: s.tier });
    }
  }
  return out.sort((a, b) => a.y - b.y);
}

function floorAt(level, x, hintY) {
  const c = floorCandidates(level, x);
  if (hintY == null) return c[c.length - 1];
  let best = c[0], bd = Math.abs(c[0].y - hintY);
  for (let i = 1; i < c.length; i++) {
    const d = Math.abs(c[i].y - hintY);
    if (d < bd) { bd = d; best = c[i]; }
  }
  return best;
}

/* surface id a unit is currently standing on */
function surfaceOf(level, x, y) {
  return floorAt(level, x, y).id;
}

function inSolid(level, x, y) {
  for (const cov of level.covers) {
    if (cov.dead || !cov.solid) continue;
    if (Math.abs(x - cov.x) <= cov.w / 2 + 2 && y > cov.y - cov.h - 2 && y <= cov.y + 8) return cov;
  }
  return null;
}

/* ============================================================
   Navigation graph
   ============================================================ */
function buildNavGraph(level) {
  const nodes = [];
  const W = level.width;
  const add = (x, y, surface, tier, surfaceRef) => {
    const n = { i: nodes.length, x, y, surface, tier, surfaceRef, blocked: false, exposure: 0, hazard: 0, crowd: 0 };
    nodes.push(n);
    return n;
  };

  // ground nodes
  const gstep = 28;
  const ground = [];
  for (let x = 18; x < W - 18; x += gstep) ground.push(add(x, level.surfaceAt(x), 'ground', 0, null));
  // platform nodes
  const plat = {};
  for (const p of level.platforms) {
    plat[p.id] = [];
    for (let x = p.x1 + 10; x < p.x2 - 6; x += gstep) {
      plat[p.id].push(add(x, p.y, p.id, 1, p));
    }
  }
  // stair nodes
  const stair = {};
  for (const s of level.stairs) {
    stair[s.id] = [];
    const steps = Math.max(4, Math.round(Math.abs(s.x2 - s.x1) / 14));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = s.x1 + (s.x2 - s.x1) * t;
      const y = s.y1 + (s.y2 - s.y1) * t;
      stair[s.id].push(add(x, y, s.id, s.tier, s));
    }
  }
  level.navNodes = nodes;
  const edges = nodes.map(() => []);
  const addEdge = (a, b, opts) => {
    if (a == null || b == null || a === b) return;
    const c = opts || {};
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const cost = d + (c.extra || 0) + Math.abs(b.y - a.y) * 0.45;
    const edge = { to: b.i, cost, vault: c.vault || null, vaults: c.vaults || null, drop: !!c.drop, stair: !!c.stair };
    edges[a.i].push(edge);
    // drop edges are one-way: a walkway drop must not become an upward climb
    if (!c.directed) edges[b.i].push({ to: a.i, cost, vault: c.vault || null, vaults: c.vaults || null, drop: false, stair: !!c.stair });
  };

  // mark blocked ground nodes (solid props)
  for (const n of ground) {
    const solid = inSolid(level, n.x, n.y);
    if (solid) { n.blocked = true; n.solidId = solid.id; }
    for (const c of level.covers) {
      if (!c.dead && c.explosive && Math.abs(c.x - n.x) < 65 && Math.abs(c.y - n.y) < 40) n.hazard = Math.max(n.hazard, 1);
    }
  }
  for (const p of level.platforms) {
    for (const n of plat[p.id]) {
      const solid = inSolid(level, n.x, n.y);
      if (solid) { n.blocked = true; n.solidId = solid.id; }
    }
  }

  // ground adjacency with vault edges over solids
  for (let i = 0; i < ground.length; i++) {
    if (ground[i].blocked) continue;
    let j = i + 1;
    const vaults = [];
    let impossible = false;
    while (j < ground.length && ground[j].blocked) {
      const cov = level.covers.find((c) => c.id === ground[j].solidId);
      if (!cov || !cov.vaultable) { impossible = true; break; }
      if (!vaults.includes(cov)) vaults.push(cov);
      j++;
    }
    if (impossible || j >= ground.length) continue;
    const span = ground[j].x - ground[i].x;
    if (j === i + 1) {
      addEdge(ground[i], ground[j], {});
    } else if (span < 320 && vaults.length) {
      addEdge(ground[i], ground[j], {
        extra: 110 + vaults.reduce((sum, c) => sum + c.w, 0) * 0.6,
        vault: vaults[0], vaults
      });
    }
  }
  // long-range connections across a chain of vaultable props
  for (let i = 0; i < ground.length; i++) {
    if (ground[i].blocked) continue;
    for (let k = 2; k <= 12; k++) {
      const j = i + k;
      if (j >= ground.length || ground[j].blocked) continue;
      if (ground[j].x - ground[i].x > 336) break;
      // skip if there is a normal path already through unblocked nodes
      let blocked = 0;
      for (let m = i + 1; m < j; m++) if (ground[m].blocked) blocked++;
      if (blocked < 3) continue;
      const vaults = [];
      let ok = true;
      for (let m = i + 1; m < j; m++) {
        if (!ground[m].blocked) continue;
        const cov = level.covers.find((c) => c.id === ground[m].solidId);
        if (!cov || !cov.vaultable) { ok = false; break; }
        if (!vaults.includes(cov)) vaults.push(cov);
      }
      if (ok && vaults.length) addEdge(ground[i], ground[j], { extra: 120 + vaults.reduce((sum, c) => sum + c.w, 0) * 0.7, vault: vaults[0], vaults });
    }
  }

  // platform adjacency
  for (const p of level.platforms) {
    const list = plat[p.id];
    for (let i = 0; i < list.length - 1; i++) addEdge(list[i], list[i + 1], {});
  }

  // stair adjacency + links
  for (const s of level.stairs) {
    const list = stair[s.id];
    for (let i = 0; i < list.length - 1; i++) addEdge(list[i], list[i + 1], { stair: true, extra: 2 });
    const bottom = s.side === 'left' ? list[0] : list[list.length - 1];
    const top = s.side === 'left' ? list[list.length - 1] : list[0];
    // bottom -> nearest ground node
    let bg = null, bgd = 90;
    for (const g of ground) { const d = Math.hypot(g.x - bottom.x, g.y - bottom.y); if (d < bgd) { bgd = d; bg = g; } }
    if (bg) addEdge(bottom, bg, { extra: 8 });
    // top -> nearest platform node
    const p = level.platforms.find((q) => q.id === s.platformId);
    if (p) {
      let bp = null, bpd = 90;
      for (const q of plat[p.id]) { const d = Math.hypot(q.x - top.x, q.y - top.y); if (d < bpd) { bpd = d; bp = q; } }
      if (bp) addEdge(top, bp, { extra: 8 });
    }
  }

  // drop-down edges: walkway edge to the ground below.
  // Match by horizontal proximity — the fall height itself is not a reason
  // to refuse (a 118px walkway would otherwise never produce a drop).
  for (const p of level.platforms) {
    for (const q of plat[p.id]) {
      if (q.blocked) continue;
      if (q.x - p.x1 > 26 && p.x2 - q.x > 26) continue;
      let bg = null, bd = 34;
      for (const g of ground) {
        if (g.y <= q.y) continue; // drops only go down
        const d = Math.abs(g.x - q.x);
        if (d < bd && g.y - q.y < 230) { bd = d; bg = g; }
      }
      if (bg) addEdge(q, bg, { extra: 55, drop: true, directed: true });
    }
  }

  level.navEdges = edges;
  level.navStats = {
    nodes: nodes.length,
    edges: edges.reduce((s, e) => s + e.length, 0) / 2,
    blocked: nodes.filter((n) => n.blocked).length,
    platforms: level.platforms.length,
    stairs: level.stairs.length
  };
  level.navDirty = false;
  level.navRevision++;
}

function rebuildNav(level) {
  buildNavGraph(level);
  // preserve exposure values for nodes at similar positions
  validateLevelReachability(level);
}

function nearestNavNode(level, x, y, preferSurface) {
  let best = null, bd = Infinity;
  for (const n of level.navNodes) {
    if (n.blocked) continue;
    let d = Math.hypot(n.x - x, (n.y - y) * 2.4);
    if (preferSurface && n.surface !== preferSurface) d += 18;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/* A* over the graph; cost includes exposure, hazard and crowd pressure. */
function findPath(level, fromX, fromY, toX, toY, opts) {
  // backwards-compatible 3-argument form: findPath(level, fromX, toX)
  if (toX === undefined) { toX = fromY; fromY = floorAt(level, fromX).y; toY = floorAt(level, toX).y; }
  if (!level.navNodes || level.navDirty) buildNavGraph(level);
  const nodes = level.navNodes;
  if (!nodes.length) return null;
  const o = opts || {};
  if (fromY == null) fromY = floorAt(level, fromX).y;
  if (toY == null) toY = floorAt(level, toX).y;
  const start = nearestNavNode(level, fromX, fromY);
  let goal = nearestNavNode(level, toX, toY);
  if (!start || !goal) return null;

  // direct same-surface shortcut
  if (Math.abs(fromY - toY) < 24 && Math.abs(start.y - goal.y) < 24 && walkClear(level, fromX, fromY, toX, toY)) {
    return [{ x: toX, y: toY }];
  }

  const n = nodes.length;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const cameEdge = new Array(n).fill(null);
  const closed = new Uint8Array(n);
  const open = [start.i];
  const inOpen = new Uint8Array(n);
  inOpen[start.i] = 1;
  g[start.i] = 0;
  const h = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 0.86 + Math.abs(a.tier - b.tier) * 12;
  f[start.i] = h(start, goal);
  let guard = 0;
  let found = false;
  while (open.length && guard++ < 12000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    inOpen[cur] = 0;
    if (cur === goal.i) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const node = nodes[cur];
    const es = level.navEdges[cur];
    for (let ei = 0; ei < es.length; ei++) {
      const e = es[ei];
      if (closed[e.to]) continue;
      const nb = nodes[e.to];
      if (nb.blocked) continue;
      const crowd = nb.crowd || 0;
      const extra = (nb.exposure || 0) * 62 + (nb.hazard || 0) * 85 + crowd * 22 + (node.exposure || 0) * 20;
      const tg = g[cur] + e.cost + extra;
      if (tg < g[e.to]) {
        g[e.to] = tg;
        came[e.to] = cur;
        cameEdge[e.to] = e;
        f[e.to] = tg + h(nb, goal);
        if (!inOpen[e.to]) { open.push(e.to); inOpen[e.to] = 1; }
      }
    }
  }
  if (!found) {
    // last resort: direct if the same floor is horizontally clear
    if (Math.abs(fromY - toY) < 26 && walkClear(level, fromX, fromY, toX, toY)) return [{ x: toX, y: toY }];
    return null;
  }
  const chain = [];
  let c = goal.i;
  while (c !== -1 && chain.length < 400) { chain.push(c); c = came[c]; }
  chain.reverse();
  const pts = [];
  for (let i = 0; i < chain.length; i++) {
    const nd = nodes[chain[i]];
    const prev = pts[pts.length - 1];
    if (prev && Math.abs(prev.x - nd.x) < 0.6 && Math.abs(prev.y - nd.y) < 0.6) continue;
    pts.push({ x: nd.x, y: nd.y, surface: nd.surface, tier: nd.tier, node: nd.i });
    // apex over a vaulted solid
    if (i < chain.length - 1) {
      const e = cameEdge[chain[i + 1]];
      if (e && e.vaults) {
        for (const v of e.vaults) pts.push({ x: v.x, y: v.y - v.h - 5, surface: 'vault', tier: nd.tier, vault: true });
      } else if (e && e.vault) {
        pts.push({ x: e.vault.x, y: e.vault.y - e.vault.h - 5, surface: 'vault', tier: nd.tier, vault: true });
      }
    }
  }
  // remove redundant collinear points on the same surface
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (i > 0 && i < pts.length - 1) {
      const a = pts[i - 1], b = pts[i + 1];
      if (p.surface === a.surface && p.surface === b.surface && !p.vault &&
          Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < 2.5 &&
          (b.x - a.x) * (p.x - a.x) >= 0) continue;
    }
    out.push(p);
  }
  // the unit is usually standing between graph nodes; drop the leading
  // node it has effectively already reached so it does not walk backwards
  while (out.length > 1 && Math.hypot(out[0].x - fromX, out[0].y - fromY) < 20) out.shift();
  const dest = floorAt(level, toX, toY);
  const last = out[out.length - 1];
  if (!last || Math.abs(last.x - toX) > 0.6 || Math.abs(last.y - dest.y) > 0.6) {
    out.push({ x: toX, y: dest.y, surface: dest.id, tier: dest.tier });
  }
  return out;
}

/* True when a straight horizontal-ish walk between two points crosses no solid prop. */
function walkClear(level, ax, ay, bx, by) {
  if (Math.abs(ay - by) > 26) return false;
  const dx = bx - ax, dy = by - ay;
  const steps = Math.max(3, Math.ceil(Math.abs(dx) / 12));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t, y = ay + dy * t;
    for (const cov of level.covers) {
      if (cov.dead || !cov.solid) continue;
      if (Math.abs(x - cov.x) < cov.w / 2 + 2 && y > cov.y - cov.h - 2 && y <= cov.y + 8) return false;
    }
  }
  return true;
}

/* Flood fill from deploy; remove non-vaultable solids if a critical point is cut off. */
function reachableNodes(level, startNodes) {
  const seen = new Uint8Array(level.navNodes.length);
  const q = [];
  for (const s of startNodes) { if (s && !seen[s.i]) { seen[s.i] = 1; q.push(s.i); } }
  while (q.length) {
    const c = q.pop();
    for (const e of level.navEdges[c]) {
      if (seen[e.to]) continue;
      seen[e.to] = 1;
      q.push(e.to);
    }
  }
  return seen;
}

function validateLevelReachability(level) {
  const targets = [
    { x: level.evac.x, y: level.evac.y, label: 'evac' },
    ...level.zones.filter((z) => z.type !== 'evac').map((z) => ({ x: z.x, y: z.y, label: z.id })),
    ...level.neutrals.map((n) => ({ x: n.x, y: n.y, label: 'neutral:' + n.tag }))
  ];
  const starts = level.deploySlots.map((s) => nearestNavNode(level, s.x, s.y)).filter(Boolean);
  let seen = reachableNodes(level, starts);
  const unreachable = [];
  for (const t of targets) {
    const n = nearestNavNode(level, t.x, t.y);
    if (!n || !seen[n.i]) unreachable.push(t.label);
  }
  let removed = 0;
  if (unreachable.length) {
    // destroy non-vaultable barriers that sit between deploy and the target
    for (const cov of level.covers) {
      if (cov.dead || !cov.solid || cov.vaultable) continue;
      cov.dead = true;
      cov.destroyedByNav = true;
      removed++;
    }
    if (removed) {
      buildNavGraph(level);
      seen = reachableNodes(level, level.deploySlots.map((s) => nearestNavNode(level, s.x, s.y)).filter(Boolean));
    }
  }
  const still = [];
  for (const t of targets) {
    const n = nearestNavNode(level, t.x, t.y);
    if (!n || !seen[n.i]) still.push(t.label);
  }
  level.navReport = {
    reachable: still.length === 0,
    unreachable: still,
    removedSolids: removed,
    before: unreachable,
    stats: level.navStats
  };
  if (still.length) console.warn('NAV: unreachable targets after repair:', still.join(','));
  return level.navReport;
}

/* 4 Hz threat map for route cost + cover evaluation. */
function updateNavExposure(level, enemies, dt) {
  level.exposureT = (level.exposureT || 0) + dt;
  if (level.exposureT < 0.25) return;
  level.exposureT = 0;
  const live = enemies.filter((e) => !e.dead && !e.downed);
  // nearby threats only, nearest first, weighted by proximity so a close
  // enemy dominates a far one instead of array order deciding
  const threats = live.map((e) => ({ e, x: e.x, y: e.y - (e.stance === 'crouch' ? 26 : 42) }));
  for (const n of level.navNodes) {
    const near = [];
    for (const t of threats) {
      const dx = Math.abs(t.x - n.x);
      if (dx < 760) near.push({ dx, t });
    }
    near.sort((a, b) => a.dx - b.dx);
    let heat = 0;
    for (const { dx, t } of near.slice(0, 4)) {
      if (lineOfSight(level, t.x, t.y, n.x, n.y - 20)) {
        heat = Math.max(heat, 1 - dx / 760);
        if (heat > 0.9) break;
      }
    }
    const target = heat;
    n.exposure = n.exposure == null ? target : n.exposure + (target - n.exposure) * 0.5;
  }
  // crowd pressure from allies, updated cheaply
  const units = level._crowdUnits;
  if (units) {
    for (const n of level.navNodes) n.crowd = 0;
    for (const u of units) {
      if (u.dead || u.downed) continue;
      const near = nearestNavNode(level, u.x, u.y);
      if (near) near.crowd = Math.min(1, (near.crowd || 0) + 0.35);
    }
  }
}

/* ============================================================
   Cover evaluation, reservation and line of sight
   ============================================================ */
function coverRect(cov) { return { x: cov.x - cov.w / 2, y: cov.y - cov.h, w: cov.w, h: cov.h }; }

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

function coverExpiry(cov) {
  if (!cov.claimT) cov.claimT = {};
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const live = [];
  for (const id of (cov.claims || [])) {
    const t = cov.claimT[id];
    if (t == null || now - t < 8) live.push(id);
    else delete cov.claimT[id];
  }
  cov.claims = live;
  return live;
}

function claimCover(cov, unitId, duration) {
  if (!cov) return;
  if (!cov.claims) cov.claims = [];
  if (!cov.claimT) cov.claimT = {};
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  if (!cov.claims.includes(unitId)) {
    if (coverExpiry(cov).length >= 2) return false;
    cov.claims.push(unitId);
  }
  cov.claimT[unitId] = now - Math.max(0, 8 - (duration == null ? 8 : duration));
  return true;
}

function releaseCover(cov, unitId) {
  if (!cov) return;
  if (cov.claims) cov.claims = cov.claims.filter((id) => id !== unitId);
  if (cov.claimT) delete cov.claimT[unitId];
  if (cov.occupants) cov.occupants = cov.occupants.filter((id) => id !== unitId);
}

/* Evaluate a cover for a unit against a threat; vertical threats make low cover useless. */
function coverScore(level, cov, x, threatX, threatY) {
  if (!cov || cov.dead) return -Infinity;
  const d = Math.abs(cov.x - x);
  let side = 0;
  if (threatX != null) {
    const between = (cov.x - x) * (threatX - cov.x) >= -8;
    side = between ? 0 : d * 0.9;
  }
  let vertical = 0;
  if (threatY != null && threatY < cov.y - 32) vertical = 120; // threat is above the cover
  const claims = coverExpiry(cov).length;
  return cov.protection * 90 + cov.h / 2 - d * 0.55 - side - claims * 70 - vertical;
}

function findNearbyCover(level, x, threatX, maxDist = 300, threatY, unitY) {
  let best = null;
  const base = unitY == null ? floorAt(level, x).y : unitY;
  for (const cov of level.covers) {
    if (cov.dead) continue;
    if (Math.abs(cov.y - base) > 34) continue;
    const d = Math.abs(cov.x - x);
    if (d > maxDist) continue;
    if (coverExpiry(cov).length >= 2) continue;
    const score = coverScore(level, cov, x, threatX, threatY);
    if (!best || score > best.score) best = { cov, score, d };
  }
  if (!best) return null;
  const sign = threatX != null && threatX > best.cov.x ? 1 : -1;
  const tx = clamp(best.cov.x - sign * (best.cov.w / 2 + 12), 20, level.width - 20);
  const fl = floorAt(level, tx, best.cov.y);
  return { cover: best.cov, x: tx, y: fl.y, score: best.score };
}

function coversNear(level, x, maxDist) {
  return level.covers.filter((c) => !c.dead && Math.abs(c.x - x) < maxDist);
}

/* material-specific bullet penetration */
function bulletPenetration(cfg) {
  if (!cfg) return 0;
  if (cfg.grenade) return 0;
  const cls = cfg.cls || '';
  if (/SNIPER/.test(cls)) return 3;
  if (/LIGHT MACHINE/.test(cls)) return 2;
  if (/SHOTGUN/.test(cls)) return 2;
  return 1;
}
