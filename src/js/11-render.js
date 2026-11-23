'use strict';
/* ============================================================
   11 — RENDERING
   ============================================================ */
function drawParallax(ctx, level, cam, layer, factor, opts = {}) {
  const tile = Art.getTile(level.theme, level.tod, layer);
  const scale = Stage.scale * 2 * (0.94 + cam.zoom * 0.06);
  const tw = tile.width * scale;
  const th = tile.height * scale;
  let off = -(cam.x * factor * Stage.scale * cam.zoom) % tw;
  if (off > 0) off -= tw;
  const y = Stage.h - th + (opts.dy || 0);
  const alpha = opts.alpha != null ? opts.alpha : 1;
  ctx.globalAlpha = alpha;
  for (let x = off; x < Stage.w; x += tw) {
    if (x + tw < -20 || x > Stage.w + 20) continue;
    ctx.drawImage(tile, x, y, tw, th);
  }
  ctx.globalAlpha = 1;
}

function drawMenuBackdrop(ctx, level, cam, t, opts = {}) {
  const W = Stage.w, H = Stage.h;
  const pal = level.paletteData;
  Art.drawSky(ctx, W, H, pal, t);
  if (level.tod === 'night') Art.drawStars(ctx, W, H, level.seed, t);
  Art.drawSun(ctx, W, H, pal, cam.x, t);
  drawParallax(ctx, level, cam, 'far', 0.1, { alpha: 0.85 });
  drawParallax(ctx, level, cam, 'mid', 0.3, { alpha: 0.95 });
  // haze
  const hz = ctx.createLinearGradient(0, H * 0.35, 0, H);
  hz.addColorStop(0, 'rgba(0,0,0,0)');
  hz.addColorStop(1, pal.haze);
  ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);

  Stage.apply(ctx, cam);
  const view = Stage.viewFor(cam);
  Art.drawTerrain(ctx, level, view);
  Art.drawPlatformFaces(ctx, level, view);
  // props
  for (const p of level.props) drawWorldProp(ctx, p);
  for (const c of level.covers) Art.drawCover(ctx, c, level);
  // soldiers
  if (opts.units) {
    for (const u of opts.units) {
      Art.drawUnit(ctx, u, t);
      drawUnitTag(ctx, u, opts.selected === u);
    }
  }
  // dust
  ctx.setTransform(Stage.dpr, 0, 0, Stage.dpr, 0, 0);
  drawMenuDust(ctx, W, H, t, pal);
  // fg
  drawParallax(ctx, level, cam, 'fg', 1.18, { alpha: 0.95 });
  drawVignette(ctx, W, H, 0.9);
  if (opts.tint) { ctx.fillStyle = opts.tint; ctx.fillRect(0, 0, W, H); }
}

function drawMenuDust(ctx, W, H, t, pal) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,230,190,.25)';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 397 + t * (8 + i % 4)) % (W + 60)) - 30;
    const y = (i * 233) % H;
    const a = 0.06 + (i % 5) * 0.02;
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y + Math.sin(t + i) * 8, 1 + (i % 3) * 0.6, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawWorldProp(ctx, p) {
  const x = p.x, y = p.y;
  if (p.type === 'tree') {
    const s = p.scale || 1;
    ctx.strokeStyle = 'rgba(16,19,14,.95)';
    ctx.lineWidth = 7 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 * s, y - 90 * s); ctx.stroke();
    ctx.fillStyle = '#1b241c';
    for (let i = 0; i < 4; i++) {
      const yy = y - 70 * s - i * 26 * s;
      const w = (50 - i * 8) * s;
      Art.poly(ctx, [[x + 4 * s, yy - 26 * s], [x - w, yy + 16 * s], [x + 4 * s, yy + 6 * s], [x + w, yy + 16 * s]]);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 22 * s, 4, 0, 0, TAU); ctx.fill();
  } else if (p.type === 'stump') {
    ctx.fillStyle = '#2b2419';
    Art.rr(ctx, x - 9, y - 16, 18, 16, 3); ctx.fill();
    ctx.fillStyle = '#3c3222';
    ctx.beginPath(); ctx.ellipse(x, y - 16, 9, 3.5, 0, 0, TAU); ctx.fill();
  } else if (p.type === 'pole') {
    ctx.strokeStyle = 'rgba(24,26,20,.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y - 120); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 18, y - 104); ctx.lineTo(x + 20, y - 108); ctx.stroke();
    if (p.seed % 2 === 0) {
      ctx.fillStyle = 'rgba(255,214,150,.7)';
      ctx.beginPath(); ctx.arc(x + 18, y - 107, 2.2, 0, TAU); ctx.fill();
      Art.lensFlare(ctx, x + 18, y - 107, 20, 'rgba(255,190,90,.22)', 1);
    }
  } else if (p.type === 'pipe') {
    ctx.strokeStyle = 'rgba(36,40,32,.9)';
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(x - 30, y - 46); ctx.lineTo(x + 30, y - 46); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 20, y - 46); ctx.lineTo(x + 20, y); ctx.stroke();
    ctx.fillStyle = 'rgba(227,166,63,.14)';
    ctx.fillRect(x - 30, y - 51, 60, 2);
  } else if (p.type === 'tank') {
    ctx.fillStyle = 'rgba(40,44,36,.9)';
    Art.rr(ctx, x - 28, y - 66, 56, 66, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(20,22,18,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 28, y - 46); ctx.lineTo(x + 28, y - 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 28, y - 28); ctx.lineTo(x + 28, y - 28); ctx.stroke();
  } else if (p.type === 'crateStack') {
    ctx.fillStyle = 'rgba(52,44,30,.9)';
    ctx.fillRect(x - 22, y - 22, 24, 22);
    ctx.fillRect(x + 2, y - 16, 20, 16);
    ctx.strokeStyle = 'rgba(18,15,10,.6)'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 22, y - 22, 24, 22);
  } else if (p.type === 'rubble') {
    ctx.fillStyle = 'rgba(55,52,40,.9)';
    ctx.beginPath(); ctx.ellipse(x, y - 4, 30, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(70,66,50,.8)';
    ctx.beginPath(); ctx.ellipse(x - 10, y - 10, 14, 7, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 14, y - 7, 9, 5, -0.1, 0, TAU); ctx.fill();
  } else if (p.type === 'sign') {
    ctx.strokeStyle = 'rgba(30,30,24,.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 44); ctx.stroke();
    ctx.fillStyle = 'rgba(90,88,60,.85)';
    ctx.fillRect(x - 13, y - 60, 26, 16);
    ctx.fillStyle = 'rgba(200,195,160,.45)';
    ctx.fillRect(x - 9, y - 55, 18, 2);
    ctx.fillRect(x - 9, y - 50, 12, 2);
  } else {
    Art.drawProp(ctx, p, {});
  }
}

function drawUnitTag(ctx, u, selected) {
  if (!u || u.dead) return;
  const h = unitHeight(u);
  const x = u.x, y = u.y;
  // selection
  if (selected) {
    ctx.save();
    ctx.translate(x, y + 1);
    ctx.strokeStyle = 'rgba(227,166,63,.85)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 5.5, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.fillStyle = '#e3a63f';
    ctx.beginPath();
    ctx.moveTo(x, y - h - 14);
    ctx.lineTo(x - 3.5, y - h - 20);
    ctx.lineTo(x + 3.5, y - h - 20);
    ctx.closePath();
    ctx.fill();
  }
  // health bar
  const ratio = clamp(u.hp / u.maxHp, 0, 1);
  const show = u.team === 'ally' || u.team === 'neutral' || (u.hp < u.maxHp) || u === u.battle.inspected;
  if (show) {
    const bw = u.team === 'neutral' ? 20 : 24;
    const bx = x - bw / 2, by = y - h - 8;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(bx - 0.5, by - 0.5, bw + 1, 4);
    ctx.fillStyle = u.team === 'enemy' ? '#c2452d' : u.team === 'neutral' ? '#d9b46a' : (ratio < 0.3 ? '#d0533b' : '#7fb36b');
    ctx.fillRect(bx, by, bw * ratio, 3);
    if (u.downed) {
      ctx.fillStyle = '#d0533b';
      ctx.font = '600 8px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DOWN ' + Math.ceil(u.downT) + 's', x, by - 4);
      ctx.textAlign = 'left';
    } else if (u.reloadT > 0) {
      ctx.fillStyle = '#e3a63f';
      ctx.fillRect(bx, by + 4, bw * (1 - u.reloadT / (u.reloadTotal || 1)), 1.6);
    }
  }
  // commander star
  if (u.role === 'commander' && u.team === 'ally' && !u.dead) {
    ctx.fillStyle = '#e3a63f';
    ctx.font = '700 8px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★', x, y - h - 12);
    ctx.textAlign = 'left';
  }
  // overwatch eye
  if (u.overwatch && !u.dead) {
    ctx.strokeStyle = 'rgba(227,166,63,.6)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + 12, y - h - 15, 3, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(227,166,63,.8)';
    ctx.beginPath(); ctx.arc(x + 12, y - h - 15, 1.2, 0, TAU); ctx.fill();
  }
  if (u.suppressAt) {
    ctx.strokeStyle = 'rgba(208,83,59,.55)';
    ctx.beginPath(); ctx.moveTo(x - 2, y - h - 12); ctx.lineTo(x, y - h - 8); ctx.lineTo(x + 2, y - h - 12); ctx.stroke();
  }
  // name for selection/inspection
  if (selected || (u.battle && u.battle.inspected === u)) {
    ctx.font = '600 9px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    const nm = (u.callsign || u.name || '').toUpperCase();
    ctx.fillText(nm, x + 0.5, y - h - 26);
    ctx.fillStyle = u.team === 'enemy' ? '#e57357' : u.team === 'neutral' ? '#e8d9a8' : '#ece9dc';
    ctx.fillText(nm, x, y - h - 26.5);
    ctx.textAlign = 'left';
  }
}

Battle.prototype.render = function () {
  const ctx = Stage.ctx;
  const W = Stage.w, H = Stage.h;
  const cam = this.cam, level = this.level;
  const pal = level.paletteData;
  const t = performance.now() / 1000;
  ctx.setTransform(Stage.dpr, 0, 0, Stage.dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  Art.drawSky(ctx, W, H, pal, t);
  if (level.tod === 'night') Art.drawStars(ctx, W, H, level.seed, t);
  Art.drawSun(ctx, W, H, pal, cam.x, t);
  drawParallax(ctx, level, cam, 'far', 0.1, { alpha: 0.85 });
  drawParallax(ctx, level, cam, 'mid', 0.3, { alpha: 0.96 });
  const hz = ctx.createLinearGradient(0, H * 0.4, 0, H);
  hz.addColorStop(0, 'rgba(0,0,0,0)');
  hz.addColorStop(1, pal.haze);
  ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);

  Stage.apply(ctx, cam);
  const view = Stage.viewFor(cam);
  Art.drawTerrain(ctx, level, view);
  Art.drawPlatformFaces(ctx, level, view);
  // decals under units
  this.drawDecals(ctx, view);
  // props behind
  for (const p of level.props) {
    if (p.x < view.left - 90 || p.x > view.right + 90) continue;
    drawWorldProp(ctx, p);
  }
  // covers
  for (const c of level.covers) {
    if (c.x < view.left - 80 || c.x > view.right + 80) continue;
    Art.drawCover(ctx, c, level);
  }
  // zones & objectives
  for (const z of level.zones) {
    if (z.x < view.left - 120 || z.x > view.right + 120) continue;
    const obj = this.objectives.find((o) => o.zone === z);
    Art.drawZone(ctx, z, t, obj ? !obj.complete : true);
    if (z.type === 'hold') this.drawZoneProgress(ctx, z, obj);
    if (z.type === 'interact') this.drawInteractRing(ctx, z, obj, t);
  }
  // corpses under living
  const sorted = this.units.slice().sort((a, b) => {
    if (a.dead !== b.dead) return a.dead ? -1 : 1;
    return a.y - b.y;
  });
  for (const u of sorted) {
    if (u.x < view.left - 70 || u.x > view.right + 70) continue;
    Art.drawUnit(ctx, u, t);
    if (u.flash > 0) {
      const m = Art.muzzleOf(u);
      Art.lensFlare(ctx, m.x, m.y, 26, 'rgba(255,200,120,.5)', 0.8);
    }
  }
  // health / tags above living
  for (const u of sorted) {
    if (u.dead) continue;
    if (u.x < view.left - 70 || u.x > view.right + 70) continue;
    drawUnitTag(ctx, u, this.selected.has(u.id));
  }
  // selected unit order path
  for (const u of this.selectedUnits) this.drawUnitPath(ctx, u);
  // projectiles
  this.drawProjectiles(ctx, view);
  // particles
  this.particles.draw(ctx, view);
  // objective markers
  this.drawObjectiveMarkers(ctx, view, t);
  // tap ripples
  for (const r of this.ripples) {
    const a = 1 - r.t / 1.4;
    ctx.strokeStyle = `rgba(227,166,63,${a * 0.8})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(r.x, this.level.surfaceAt(r.x), 18 + r.t * 34, 5 + r.t * 9, 0, 0, TAU); ctx.stroke();
    if (r.kind === 'overwatch' || r.kind === 'suppress') {
      ctx.strokeStyle = `rgba(227,166,63,${a * 0.5})`;
      ctx.beginPath(); ctx.arc(r.x, r.y, 26, 0, TAU); ctx.stroke();
    }
  }
  // popups
  for (const p of this.popups) {
    const a = 1 - p.t / 1.1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.font = '700 11px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(p.text, p.x + 0.6, p.y + p.vy * p.t + 0.6);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y + p.vy * p.t);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // screen-space layers
  ctx.setTransform(Stage.dpr, 0, 0, Stage.dpr, 0, 0);
  drawParallax(ctx, level, cam, 'fg', 1.16, { alpha: 0.92 });
  this.drawWeather(ctx, t);
  // muzzle light wash
  this.drawPost(ctx, t);
};

Battle.prototype.drawDecals = function (ctx, view) {
  for (const d of this.decals) {
    if (d.x < view.left - 40 || d.x > view.right + 40) continue;
    const a = Math.min(1, d.life / 3);
    if (d.type === 'blood') {
      ctx.fillStyle = `rgba(96,18,14,${0.4 * a})`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 0.3, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(d.x + d.size * 0.5, d.y + 2, d.size * 0.4, d.size * 0.16, 0, 0, TAU); ctx.fill();
    } else if (d.type === 'scorch') {
      ctx.fillStyle = `rgba(20,17,12,${0.5 * a})`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 0.24, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(30,26,20,${0.35 * a})`;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.size, d.size * 0.4, d.rot || 0, 0, TAU); ctx.fill();
    }
  }
};

Battle.prototype.drawZoneProgress = function (ctx, z, o) {
  if (!o) return;
  const p = clamp(o.progress / Math.max(0.001, o.max), 0, 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(227,166,63,.35)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(z.x, z.y, (z.w / 2) + 8, 20, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = o.complete ? 'rgba(127,179,107,.85)' : 'rgba(227,166,63,.9)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(z.x, z.y, (z.w / 2) + 8, 20, 0, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.stroke();
  ctx.restore();
};

Battle.prototype.drawInteractRing = function (ctx, z, o, t) {
  if (!o || o.complete) return;
  const p = clamp(o.progress / Math.max(0.001, o.max), 0, 1);
  ctx.save();
  ctx.strokeStyle = 'rgba(227,166,63,.75)';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(z.x, z.y - 2, 26, -Math.PI / 2, -Math.PI / 2 + p * TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(z.x, z.y - 2, 26, 0, TAU); ctx.stroke();
  if (o.progress > 0 && o.progress < o.max) {
    ctx.fillStyle = 'rgba(227,166,63,.9)';
    ctx.font = '600 8px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(o.max - o.progress) + 's', z.x, z.y - 34);
    ctx.textAlign = 'left';
  }
  ctx.restore();
};

Battle.prototype.drawObjectiveMarkers = function (ctx, view, t) {
  for (const o of this.objectives) {
    if (o.complete) continue;
    let x = null, label = o.label;
    if (o.zone) x = o.zone.x;
    else if (o.type === 'killAll') continue;
    else if (o.type === 'killTarget' && o.target && !o.target.dead) x = o.target.x;
    else if ((o.type === 'rescue' || o.type === 'escort' || o.type === 'protect')) {
      const n = this.neutrals.find((nn) => nn.tag === (o.def.tag || 'vip'));
      if (n) x = n.x;
    }
    if (x == null) continue;
    if (x < view.left - 80 || x > view.right + 80) continue;
    const y = this.level.surfaceAt(x);
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.9;
    // beam
    const g = ctx.createLinearGradient(0, y - 92, 0, y);
    g.addColorStop(0, 'rgba(227,166,63,0)');
    g.addColorStop(1, 'rgba(227,166,63,' + (0.08 + pulse * 0.05) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(x - 2, y - 92, 4, 92);
    // diamond
    ctx.translate(x, y - 96 - pulse * 3);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = 'rgba(10,12,8,.85)';
    ctx.strokeStyle = 'rgba(227,166,63,.9)';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-5.5, -5.5, 11, 11);
    ctx.strokeRect(-5.5, -5.5, 11, 11);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#e3a63f';
    ctx.fillRect(-1.3, -1.3, 2.6, 2.6);
    ctx.restore();
    // label
    ctx.font = '600 8.5px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    ctx.fillText(label.toUpperCase(), x + 0.5, y - 112.5);
    ctx.fillStyle = 'rgba(236,233,220,.9)';
    ctx.fillText(label.toUpperCase(), x, y - 113);
    ctx.textAlign = 'left';
  }
};

Battle.prototype.drawUnitPath = function (ctx, u) {
  const points = [];
  if (u.path) {
    points.push({ x: u.x, y: u.y });
    for (let i = u.pathI; i < u.path.length; i++) points.push(u.path[i]);
  }
  const queued = u.queue.filter((q) => q.x != null);
  if (points.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(227,166,63,.5)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y - 2);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y - 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const dest = points[points.length - 1];
    ctx.strokeStyle = 'rgba(227,166,63,.8)';
    ctx.beginPath(); ctx.ellipse(dest.x, this.level.surfaceAt(dest.x), 9, 3, 0, 0, TAU); ctx.stroke();
    ctx.restore();
  }
  if (u.overwatch) {
    const a = Math.atan2(u.overwatch.y - u.y, u.overwatch.x - u.x);
    const eye = { x: u.x, y: u.y - (u.stance === 'crouch' ? 30 : 44) };
    ctx.save();
    ctx.fillStyle = 'rgba(227,166,63,.06)';
    ctx.strokeStyle = 'rgba(227,166,63,.25)';
    ctx.beginPath();
    ctx.moveTo(eye.x, eye.y);
    ctx.lineTo(eye.x + Math.cos(a - 0.58) * 300, eye.y + Math.sin(a - 0.58) * 300);
    ctx.lineTo(eye.x + Math.cos(a + 0.58) * 300, eye.y + Math.sin(a + 0.58) * 300);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  if (u.queue && u.queue.length) {
    let px = u.path && u.path.length ? u.path[u.path.length - 1].x : u.x;
    for (let i = 0; i < u.queue.length; i++) {
      const q = u.queue[i];
      if (q.x == null) continue;
      const qy = this.level.surfaceAt(q.x);
      ctx.fillStyle = 'rgba(12,15,9,.85)';
      ctx.strokeStyle = 'rgba(227,166,63,.7)';
      ctx.beginPath(); ctx.arc(q.x, qy - 14, 6, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e3a63f';
      ctx.font = '600 7px "Barlow Condensed", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), q.x, qy - 11.5);
      ctx.textAlign = 'left';
      px = q.x;
    }
  }
};

Battle.prototype.drawProjectiles = function (ctx, view) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of this.projectiles) {
    if (p.x < view.left - 60 || p.x > view.right + 60) continue;
    if (p.kind === 'grenade') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#2e3326';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,190,90,.8)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      if (p.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,200,120,.18)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const t of p.trail) ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
    } else {
      const len = 26;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const nx = p.vx / sp, ny = p.vy / sp;
      ctx.strokeStyle = 'rgba(255,215,140,.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - nx * len, p.y - ny * len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,245,210,.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
};

Battle.prototype.drawWeather = function (ctx, t) {
  const W = Stage.w, H = Stage.h;
  if (this.weather > 0.15 && this.rain.length) {
    ctx.save();
    ctx.strokeStyle = this.level.theme === 'forest' ? 'rgba(170,205,210,.18)' : 'rgba(190,195,190,.13)';
    ctx.lineWidth = 1;
    const wind = this.level.theme === 'industrial' ? 40 : 18;
    for (const d of this.rain) {
      const x = ((d.x * (W + 80) + t * wind) % (W + 80)) - 40;
      const y = ((d.y * (H + 60) + t * 620 * d.s) % (H + 60)) - 30;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2.5 - wind * 0.03, y + d.l);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (this.level.theme === 'industrial') {
    // drifting ash
    ctx.save();
    ctx.fillStyle = 'rgba(210,205,190,.22)';
    for (let i = 0; i < 16; i++) {
      const x = ((i * 271 + t * 12) % (W + 40)) - 20;
      const y = ((i * 167 + t * 22) % (H + 40)) - 20;
      ctx.globalAlpha = 0.15 + (i % 4) * 0.05;
      ctx.beginPath(); ctx.arc(x, y, 1.1, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // ground fog
  const fog = ctx.createLinearGradient(0, H * 0.72, 0, H);
  fog.addColorStop(0, 'rgba(0,0,0,0)');
  fog.addColorStop(1, this.level.theme === 'forest' ? 'rgba(150,175,160,.10)' : 'rgba(180,170,150,.08)');
  ctx.fillStyle = fog;
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
};

Battle.prototype.drawPost = function (ctx, t) {
  const W = Stage.w, H = Stage.h;
  // warm grade / cool shadows
  if (this.level.paletteData.tint) {
    ctx.fillStyle = this.level.paletteData.tint;
    ctx.fillRect(0, 0, W, H);
  }
  // vignette
  drawVignette(ctx, W, H, 1);
  // damage vignette
  if (this.hurtFlash > 0) {
    const a = Math.min(0.45, this.hurtFlash);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
    g.addColorStop(0, 'rgba(120,20,10,0)');
    g.addColorStop(1, `rgba(150,25,15,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // grain
  if ((QUALITY[this.level.quality] || QUALITY.high).grain) {
    drawGrain(ctx, W, H, t);
  }
  if (this.paused) {
    ctx.fillStyle = 'rgba(5,8,5,.18)';
    ctx.fillRect(0, 0, W, H);
  }
};

function drawVignette(ctx, W, H, strength = 1) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${0.45 * strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // top & bottom cinematic bars
  const bars = ctx.createLinearGradient(0, 0, 0, 70);
  bars.addColorStop(0, 'rgba(0,0,0,.34)');
  bars.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bars; ctx.fillRect(0, 0, W, 70);
  const bars2 = ctx.createLinearGradient(0, H - 90, 0, H);
  bars2.addColorStop(0, 'rgba(0,0,0,0)');
  bars2.addColorStop(1, 'rgba(0,0,0,.42)');
  ctx.fillStyle = bars2; ctx.fillRect(0, H - 90, W, 90);
}

let grainCanvas = null;
let grainPattern = null;
function drawGrain(ctx, W, H, t) {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = 128; grainCanvas.height = 128;
    const c = grainCanvas.getContext('2d');
    const img = c.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
      img.data[i + 3] = 12;
    }
    c.putImageData(img, 0, 0);
  }
  if (!grainPattern) grainPattern = ctx.createPattern(grainCanvas, 'repeat');
  ctx.save();
  ctx.globalAlpha = 0.5;
  const ox = (t * 37) % 128, oy = (t * 53) % 128;
  ctx.translate(-ox, -oy);
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, W + 128, H + 128);
  ctx.restore();
}

/* ---------- menu scene ---------- */
const MenuScene = {
  level: null,
  cam: null,
  units: [],
  init() {
    const mission = {
      seed: 777, theme: 'urban', tod: 'dusk', width: 3200,
      heights: [620, 560, 620], coverDensity: 1,
      deploy: { x: 0.5, width: 200 }, evac: { x: 0.9 },
      objectives: [], enemies: [], waves: [], neutrals: []
    };
    this.level = buildLevel(mission);
    this.cam = makeCamera(1500, 380);
    this.cam.zoom = 1.02;
    this.cam.minZoom = 1; this.cam.maxZoom = 1;
    CameraUtil.setBounds(this.cam, this.level);
    const slots = this.level.deploySlots;
    this.units = [];
    const roster = [
      { role: 'commander', name: 'R. VANCE', weapon: 'rifle', x: slots[2].x + 40, y: slots[2].y, dir: 1, aimAngle: 0.1, stance: 'stand', anim: 'idle' },
      { role: 'rifleman', name: 'D. OKAFOR', weapon: 'rifle', x: slots[2].x - 30, y: slots[2].y, dir: 1, aimAngle: 0.1, stance: 'crouch', anim: 'idle' },
      { role: 'sniper', name: 'S. KOVAC', weapon: 'sniper', x: slots[2].x + 120, y: slots[2].y, dir: 1, aimAngle: -0.05, stance: 'prone', anim: 'idle' },
      { role: 'support', name: 'K. LARSEN', weapon: 'lmg', x: slots[2].x - 110, y: slots[2].y, dir: 1, aimAngle: 0.08, stance: 'stand', anim: 'idle' },
      { role: 'medic', name: 'A. HADDAD', weapon: 'smg', x: slots[2].x + 190, y: slots[2].y, dir: 1, aimAngle: 0.12, stance: 'stand', anim: 'idle' }
    ];
    for (const r of roster) {
      const u = createUnitBase({
        team: 'ally', role: r.role, name: r.name, x: r.x, y: r.y,
        weapon: r.weapon, weaponCfg: weaponStats(r.weapon, {}), maxHp: 100, hp: 100
      });
      u.dir = r.dir; u.aimAngle = r.aimAngle; u.stance = r.stance; u.anim = r.anim;
      u.callsign = r.name.split(' ')[1];
      u.battle = { inspected: null };
      this.units.push(u);
    }
    // a couple of enemies far away for depth
    for (let i = 0; i < 2; i++) {
      const x = this.level.width * (0.74 + i * 0.06);
      const e = createEnemy(i ? 'heavy' : 'rifleman', x, this.level.surfaceAt(x), DIFFICULTIES.veteran, null);
      e.dir = -1; e.aimAngle = Math.PI - 0.1;
      e.battle = { inspected: null };
      this.units.push(e);
    }
  },
  render(ctx, t) {
    if (!this.level) this.init();
    const cam = this.cam;
    const pan = Math.sin(t * 0.045) * 120;
    cam.x = 1500 + pan;
    cam.y = 380 + Math.sin(t * 0.03) * 18;
    drawMenuBackdrop(ctx, this.level, cam, t, {
      units: this.units,
      tint: 'rgba(4,6,4,.25)'
    });
  }
};
