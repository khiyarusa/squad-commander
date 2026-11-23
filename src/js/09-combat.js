'use strict';
/* ============================================================
   09 — COMBAT: weapons, projectiles, wounds, objectives
   ============================================================ */

Battle.prototype.startReload = function (u) {
  if (!u.weaponCfg || u.dead || u.downed) return;
  if (u.reloadT > 0) return;
  if (u.mag >= u.magSize) return;
  if (u.reserve <= 0) {
    // fall back to sidearm once
    if (!u.fallbackPistol) {
      u.fallbackPistol = true;
      const cfg = weaponStats('pistol', null);
      u.weaponCfg = cfg;
      u.mag = cfg.mag; u.magSize = cfg.mag; u.reserve = cfg.mag * 3;
      u.addFeedFlag = true;
      this.addFeed(`${u.callsign || u.name}: out of ammo — sidearm`, 'warn');
      u.anim = 'idle';
    }
    return;
  }
  u.reloadT = u.weaponCfg.reload * (u.reloadSpeedMul || 1);
  u.reloadTotal = u.reloadT;
  u.anim = 'reload';
  u.state = 'reload';
  AudioSys.reload(u.x, this.cam);
};
Battle.prototype.finishReload = function (u) {
  if (!u.weaponCfg) return;
  const need = u.magSize - u.mag;
  const take = Math.min(need, u.reserve);
  u.mag += take;
  u.reserve -= take;
  u.reloadT = 0;
  u.anim = 'idle';
  u.state = 'idle';
  u.reloadFlash = 0.4;
  if (u.order && u.order.type === 'reload') this.completeOrder(u, 'reloaded');
};

Battle.prototype.addSuppression = function (u, amount) {
  if (!u || u.dead) return;
  const resist = (u.stats && u.stats.suppressionResist) || 1;
  u.suppression = clamp((u.suppression || 0) + amount * resist, 0, 100);
  if (u.suppression > 55 && u.team === 'ally' && !u.holding && u.state === 'idle' && !u.inCoverAuto) {
    u.suppressedT = 1.5;
  }
};

Battle.prototype.alertNoise = function (x, y, radius, source) {
  for (const e of this.enemies) {
    if (e.dead) continue;
    const d = Math.abs(e.x - x);
    if (d > radius) continue;
    if (e.aiState === 'patrol' || e.aiState === 'idle') {
      e.aiState = 'alert';
      e.alertT = 6;
      e.alertPos = { x, y };
      e.thinkT = 0;
    } else if (e.aiState === 'alert') {
      e.alertPos = { x, y };
      e.alertT = Math.max(e.alertT, 3);
    }
  }
};

Battle.prototype.friendlyBlocked = function (u, tx, ty) {
  const m = muzzlePoint(u);
  const distToTarget = dist(m.x, m.y, tx, ty);
  const targets = this.units.filter((o) => o !== u && !o.dead && !o.downed && (o.team === u.team || (u.team === 'ally' && o.team === 'neutral')));
  for (const o of targets) {
    const hb = unitHitbox(o);
    const t = rayRectT(m.x, m.y, tx, ty, { x: hb.x - 4, y: hb.y - 4, w: hb.w + 8, h: hb.h + 8 });
    if (t != null && t > 0.02 && t * distToTarget < distToTarget - 30) return true;
  }
  return false;
};

Battle.prototype.fireWeapon = function (u, tx, ty, opts = {}) {
  if (!u || u.dead || u.downed) return false;
  if (u.carryId) return false;
  const cfg = u.weaponCfg;
  if (!cfg) return false;
  if (u.reloadT > 0) return false;
  if (u.mag <= 0) { this.startReload(u); return false; }
  if (u.fireT > 0) return false;
  const m = muzzlePoint(u);
  const base = Math.atan2(ty - m.y, tx - m.x);
  const spread = effectiveSpread(u) * DEG * (opts.spreadMul || 1);
  const pellets = cfg.pellets || 1;
  for (let i = 0; i < pellets; i++) {
    const a = base + (Math.random() + Math.random() - 1) * spread * (pellets > 1 ? 1.6 : 1);
    this.spawnBullet(u, m, a, cfg, opts);
  }
  u.mag--;
  u.shots += pellets;
  this.stats.shots += pellets;
  u.fireT = cfg.interval * (0.92 + Math.random() * 0.16);
  u.recoil = Math.min(3.4, (u.recoil || 0) + cfg.recoil * 0.33);
  u.flash = 0.22;
  u.anim = 'fire';
  u.state = 'fire';
  u.aimReady = 0;
  AudioSys.gunshot(cfg.sound, u.x, this.cam);
  if (u.team === 'ally') this.emitNoise(u.x, u.y - 40, cfg.sound === 'sniper' ? 900 : cfg.sound === 'shotgun' ? 720 : 580, 'ally');
  this.particles.spawn({ x: m.x, y: m.y, vx: Math.cos(base) * 40, vy: Math.sin(base) * 40 - 8, life: 0.35, size: 3.5, kind: 'smoke', color: 'rgba(210,205,185,.32)', grow: 16, drag: 0.9 });
  // shell casing
  if (cfg.sound !== 'shotgun' && cfg.sound !== 'sniper') {
    this.particles.spawn({
      x: m.x - Math.cos(base) * 10, y: m.y - Math.sin(base) * 10 - 6,
      vx: -Math.cos(base) * 60 + (Math.random() - 0.5) * 30,
      vy: -70 - Math.random() * 40, g: 600, life: 0.9, size: 2.2, kind: 'casing',
      color: '#b9975a', rot: Math.random() * 6, vr: 12, drag: 0.995
    });
  }
  // recoil kick particles
  if (cfg.sound === 'sniper' || cfg.sound === 'shotgun') {
    this.particles.burst(m.x, m.y, 5, { angle: base, spread: 0.6, speed: 90, life: 0.35, size: 2, color: '#e8dcc0', kind: 'spark', additive: true, drag: 0.9 });
  }
  this.alertNoise(u.x, u.y, 780, u);
  if (cfg.grenade) AudioSys.impact(m.x, this.cam, 'metal');
  this.spawnSuppressionWave(u, m, base, cfg.range, cfg.suppression || 1);
  return true;
};

Battle.prototype.spawnBullet = function (u, origin, angle, cfg, opts) {
  if (cfg.grenade) {
    this.projectiles.push({
      kind: 'grenade', x: origin.x, y: origin.y,
      vx: Math.cos(angle) * cfg.vel, vy: Math.sin(angle) * cfg.vel - 110,
      team: u.team, ownerId: u.id, dmg: cfg.dmg * (u.team === 'ally' ? this.diff.playerDamage : 1),
      life: 2.6, fuse: 2.4, gravity: 640, radius: 105, trail: [], traveled: 0
    });
    return;
  }
  const speed = cfg.vel;
  this.projectiles.push({
    kind: 'bullet', x: origin.x, y: origin.y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    team: u.team, ownerId: u.id,
    dmg: cfg.dmg * (u.team === 'enemy' ? (this.diff.playerDamage || 1) : 1),
    pen: bulletPenetration(cfg),
    passedCovers: [],
    suppress: cfg.suppression || 1,
    life: cfg.range / speed + 0.08, maxLife: cfg.range / speed + 0.08,
    trail: [], traveled: 0, fromX: origin.x, fromY: origin.y
  });
};

Battle.prototype.spawnSuppressionWave = function (u, origin, angle, range, amount) {
  const ex = origin.x + Math.cos(angle) * range;
  const ey = origin.y + Math.sin(angle) * range;
  for (const t of this.units) {
    if (t === u || t.dead || t.downed) continue;
    if (t.team === u.team) continue;
    const d = Math.sqrt(distToSegmentSq(t.x, t.y - 28, origin.x, origin.y, ex, ey));
    if (d < 55) {
      this.addSuppression(t, (7 + (55 - d) * 0.5) * amount * 0.35);
    }
  }
};

Battle.prototype.updateProjectiles = function (dt) {
  const projs = this.projectiles;
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt;
    if (p.kind === 'grenade') {
      p.vy += p.gravity * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 7) p.trail.shift();
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const ground = this.level.surfaceAt(p.x);
      if (p.y >= ground || p.life <= 0) {
        this.explode(p.x, Math.min(ground, p.y), p.radius, p.dmg, p.team, p.ownerId);
        projs.splice(i, 1);
      }
      continue;
    }
    const ox = p.x, oy = p.y;
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    p.traveled += Math.hypot(nx - ox, ny - oy);
    let bestT = 1.2, hitType = null, hitUnit = null, hitCover = null;
    // units (downed soldiers are low on the ground and not hit by direct fire)
    for (const uu of this.units) {
      if (uu.dead || uu.downed || uu.id === p.ownerId) continue;
      const hb = unitHitbox(uu);
      if (hb.h <= 0) continue;
      const t = rayRectT(ox, oy, nx, ny, hb);
      if (t != null && t < bestT && t > 0.001) { bestT = t; hitType = 'unit'; hitUnit = uu; }
    }
    // covers
    for (const cov of this.level.covers) {
      if (cov.dead) continue;
      if (p.passedCovers && p.passedCovers.includes(cov.id)) continue;
      const t = rayRectT(ox, oy, nx, ny, coverRect(cov));
      if (t != null && t < bestT && t > 0.001) { bestT = t; hitType = 'cover'; hitUnit = null; hitCover = cov; }
    }
    // terrain
    const tt = terrainHitT(this.level, ox, oy, nx, ny);
    if (tt != null && tt < bestT) { bestT = tt; hitType = 'ground'; hitUnit = null; hitCover = null; }
    if (hitType) {
      const hx = ox + (nx - ox) * bestT, hy = oy + (ny - oy) * bestT;
      if (hitType === 'cover' && hitCover && (p.pen || 0) > hitCover.hardness) {
        // round penetrates: chip the cover, lose energy, keep flying
        this.damageCover(hitCover, p.dmg * 0.35, hx, hy, p);
        p.passedCovers = p.passedCovers || [];
        p.passedCovers.push(hitCover.id);
        p.dmg *= Math.max(0.25, 1 - hitCover.protection * 0.7);
        p.suppress *= 0.75;
        this.particles.spawn({ x: hx, y: hy, vx: p.vx * 0.2, vy: p.vy * 0.2, life: 0.18, size: 1.6, kind: 'spark', color: '#ffe0a8', additive: true });
        p.x = nx; p.y = ny;
        continue;
      }
      this.handleImpact(p, hitType, hitUnit, hitCover, hx, hy);
      projs.splice(i, 1);
      continue;
    }
    p.x = nx; p.y = ny;
    if (p.life <= 0 || p.traveled > 1400 || p.x < -60 || p.x > this.level.width + 60) {
      projs.splice(i, 1);
      continue;
    }
    if (Math.random() < 0.5) {
      this.particles.spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.1, size: 1.2, kind: 'dot', color: 'rgba(255,230,180,.65)', additive: true });
    }
  }
};

Battle.prototype.handleImpact = function (p, type, unit, cover, x, y) {
  if (type === 'unit') {
    this.damageUnit(unit, p.dmg, p.ownerId, x, y, { bullet: true });
    this.particles.burst(x, y, 4, { angle: -Math.PI / 2, spread: 1.8, speed: 70, life: 0.4, size: 2.2, colors: ['#7d1d16', '#a32b22', '#5a130f'], kind: 'blood', g: 240 });
    this.particles.spawn({ x, y, vx: 0, vy: -6, life: 0.3, size: 3, kind: 'smoke', color: 'rgba(120,20,15,.35)', grow: 10 });
  } else if (type === 'cover') {
    this.damageCover(cover, p.dmg * 0.8, x, y, p);
  } else {
    AudioSys.impact(x, this.cam, 'dirt');
    this.particles.burst(x, y, 3, { angle: -Math.PI / 2, spread: 1.6, speed: 55, life: 0.4, size: 2.4, colors: ['#8a7c5e', '#6d6249', '#4b4534'], kind: 'dust', g: 260 });
    this.decals.push({ x, y: this.level.surfaceAt(x) + 2, type: 'hole', size: 2.4 + Math.random() * 2, rot: 0, life: 10 });
  }
};

Battle.prototype.damageCover = function (cover, dmg, x, y, p) {
  if (!cover || cover.dead) return;
  cover.hp -= dmg;
  const mat = cover.material || 'concrete';
  AudioSys.impact(x, this.cam, mat === 'metal' ? 'metal' : mat === 'wood' ? 'wood' : 'stone');
  this.particles.burst(x, y, 3, {
    angle: p && p.team === 'ally' ? 0.4 : Math.PI - 0.4, spread: 1.6, speed: 55,
    life: 0.45, size: 1.8,
    colors: mat === 'metal' ? ['#e9c98a', '#bfa06a', '#8b6b3a'] : mat === 'wood' ? ['#8b6b45', '#6a4d2f'] : ['#b5ad97', '#8f8774'],
    kind: 'spark', g: 380, drag: 0.94
  });
  this.particles.spawn({ x, y, vx: 0, vy: -10, life: 0.5, size: 4, kind: 'dust', color: 'rgba(150,140,120,.4)', grow: 14 });
  if (cover.hp > 0) return;
  cover.dead = true;
  cover.hp = 0;
  for (const o of this.units) {
    if (o.coverId === cover.id) {
      o.coverId = null;
      o.assignedCover = null;
      if (o.stance === 'crouch' && !o.order) o.stance = 'stand';
    }
  }
  cover.occupants.length = 0;
  cover.claims = [];
  cover.claimT = {};
  const splinter = mat === 'wood' ? 'debris' : 'spark';
  this.particles.burst(cover.x, cover.y - cover.h / 2, 14, {
    spread: TAU, speed: 140, life: 0.95, size: 3.2,
    colors: mat === 'wood' ? ['#8b6b45', '#6a4d2f', '#4b3a24'] : mat === 'metal' ? ['#9fa4a0', '#6c716f', '#d0b170'] : ['#b5ad97', '#8f8774', '#6b6352'],
    kind: splinter, g: 500
  });
  this.addFeed(cover.type === 'barrel' ? 'Fuel barrel detonated' : 'Cover destroyed' + (cover.solid ? ' — route opened' : ''), cover.explosive ? 'warn' : '');
  this.level.navDirty = true;
  rebuildNav(this.level);
  if (cover.explosive) this.explode(cover.x, cover.y - cover.h / 2, 115, 62, 'neutral', null);
};

Battle.prototype.explode = function (x, y, radius, dmg, team, ownerId) {
  AudioSys.explosion(x, this.cam, clamp(radius / 100, 0.7, 1.5));
  this.emitNoise(x, y, 900, team);
  CameraUtil.shake(this.cam, 9);
  this.particles.spawn({ x, y, life: 0.28, size: 12, grow: 120, kind: 'flash', color: 'rgba(255,210,140,.85)', additive: true });
  this.particles.spawn({ x, y, life: 0.45, size: 10, grow: 200, kind: 'ring', color: 'rgba(255,220,160,.5)', additive: true });
  this.particles.burst(x, y, 18, { spread: TAU, speed: 180, life: 0.8, size: 5, colors: ['#3a352c', '#565044', '#7a6c50'], kind: 'smoke', grow: 26, drag: 0.9 });
  this.particles.burst(x, y, 14, { spread: TAU, speed: 240, life: 0.6, size: 2.6, colors: ['#ffc46a', '#ff8a3c', '#ffe9b0'], kind: 'spark', additive: true, g: 240 });
  this.particles.burst(x, y, 10, { spread: TAU, speed: 190, life: 1.0, size: 3.2, colors: ['#5c4b36', '#3f3426'], kind: 'debris', g: 620 });
  for (const u of this.units) {
    if (u.dead) continue;
    const d = dist(x, y, u.x, u.y - 20);
    if (d > radius) continue;
    const fall = 1 - d / radius;
    const lineBlocked = lineOfSight(this.level, x, y - 20, u.x, u.y - 24, {});
    const mul = lineBlocked ? 0.55 : 1;
    this.damageUnit(u, dmg * fall * mul, ownerId, u.x, u.y - 24, { explosive: true });
    this.addSuppression(u, 40 * fall);
    this.addStress(u, 26 * fall);
  }
  let navChanged = false;
  for (const cov of this.level.covers) {
    if (cov.dead) continue;
    const d = dist(x, y, cov.x, cov.y - cov.h / 2);
    if (d < radius * 0.9) {
      cov.hp -= dmg * (1 - d / (radius * 0.9)) * 1.6;
      if (cov.hp <= 0) {
        cov.dead = true;
        cov.claims = [];
        cov.claimT = {};
        navChanged = true;
        if (cov.explosive && dist(x, y, cov.x, cov.y) > 20) {
          this.pendingBooms = this.pendingBooms || [];
          this.pendingBooms.push({ x: cov.x, y: cov.y - cov.h / 2, t: 0.18, team, ownerId });
        }
      }
    }
  }
  if (navChanged) { this.level.navDirty = true; rebuildNav(this.level); }
  if (this.pendingBooms) {
    // processed on the simulation step, not recursively here
  }
  this.decals.push({ x, y: this.level.surfaceAt(x), type: 'scorch', size: radius * 0.5, rot: 0, life: 30 });
  this.alertNoise(x, y, 1000, null);
};

Battle.prototype.damageUnit = function (u, dmg, ownerId, hx, hy, opts = {}) {
  if (!u || u.dead || u.invuln > 0) return;
  if (u.downed) {
    if (opts.explosive || dmg > 10) {
      u.downT -= 8 + dmg * 0.4;
      if (u.downT <= 0) this.killUnit(u, ownerId);
    }
    return;
  }
  const armor = u.armorRed || 0;
  let final = Math.max(1, dmg * (1 - armor));
  if (opts.explosive) final *= 0.9;
  const wasAlly = u.team === 'ally';
  u.hp -= final;
  u.hitsTaken++;
  u.hitFlash = 0.28;
  u.recentlyHit = 2.2;
  if (wasAlly) this.hurtFlash = Math.min(0.32, (this.hurtFlash || 0) + 0.14);
  u.suppression = clamp((u.suppression || 0) + final * 1.2, 0, 100);
  u.lastHitBy = ownerId;
  this.onUnitDamaged(u, final, ownerId);
  u.bleedingTreated = false;
  this.stats.damage += final;
  if (!opts.explosive) this.stats.hits++;
  const owner = this.units.find((o) => o.id === ownerId);
  if (owner) {
    owner.damageDealt = (owner.damageDealt || 0) + final;
    if (owner.team === 'ally' && u.team === 'enemy') owner.hits = (owner.hits || 0) + 1;
  }
  if (u.team === 'ally' && owner && owner.team === 'ally') {
    this.addFeed(`${owner.callsign || owner.name}: friendly fire!`, 'warn');
  }
  if (this.settings.damageNumbers && (u.team === 'enemy' || owner && owner.team === 'ally')) {
    this.popups.push({ x: u.x + (Math.random() - 0.5) * 12, y: u.y - unitHeight(u) - 10, text: '-' + Math.round(final), color: u.team === 'enemy' ? '#f0c065' : '#e57357', t: 0, vy: -28 });
  }
  if (wasAlly) {
    CameraUtil.shake(this.cam, 1.6);
    AudioSys.impact(hx != null ? hx : u.x, this.cam, 'dirt');
    if (u.role === 'commander' && u.hp > 0 && u.hp < u.maxHp * 0.3) this.addFeed('COMMANDER WOUNDED', 'warn');
  }
  if (u.hp <= 0) {
    if (u.team === 'enemy') this.killUnit(u, ownerId);
    else if (u.team === 'neutral') this.killUnit(u, ownerId);
    else this.downUnit(u, ownerId);
  } else if (u.team === 'ally') {
    if (u.order && u.order.type === 'heal') this.cancelOrders(u);
  }
};

Battle.prototype.downUnit = function (u, ownerId) {
  if (u.downed || u.dead) return;
  if (u.carryId) {
    const carried = this.allies.find((a) => a.id === u.carryId);
    if (carried) { carried.carriedBy = null; carried.carried = false; carried.x = u.x + 20; carried.y = u.y; if (!carried.downT || carried.downT <= 0) carried.downT = 20; }
    u.carryId = null;
    u.carryTargetId = null;
  }
  u.downed = true;
  u.bleeding = false;
  u.hp = 0;
  u.state = 'down';
  u.anim = 'down';
  u.stance = 'prone';
  u.downT = u.downMax || 45;
  u.moving = false;
  u.path = null;
  u.order = null;
  u.queue = [];
  u.reviveProg = 0;
  this.stats.alliesDowned++;
  if (u.team === 'ally') {
    this.addFeed(`${u.callsign || u.name} IS DOWN — ${Math.ceil(u.downT)}s`, 'warn');
    AudioSys.radio('alarm');
    CameraUtil.shake(this.cam, 4);
    if (u.role === 'commander') {
      u.isCommander = false;
      this.refreshCommand();
    }
    for (const a of this.allies) if (a !== u && !a.dead && !a.downed && Math.abs(a.x - u.x) < 420) this.addStress(a, 14);
    UI.refreshSquadStrip(this);
  }
};

Battle.prototype.killUnit = function (u, ownerId) {
  if (u.dead) return;
  u.dead = true;
  u.downed = false;
  u.hp = 0;
  u.state = 'dead';
  u.anim = 'dead';
  u.stance = 'prone';
  u.moving = false;
  u.path = null;
  u.order = null;
  u.queue = [];
  const owner = this.units.find((o) => o.id === ownerId);
  if (owner && owner.team === 'ally') owner.kills = (owner.kills || 0) + 1;
  // a dying carrier releases their casualty immediately (state consistency)
  if (u.carryId) {
    const carried = this.allies.find((a) => a.id === u.carryId);
    if (carried) { carried.carriedBy = null; carried.carried = false; carried.x = u.x + 16; carried.y = u.y; if (!carried.downT || carried.downT <= 0) carried.downT = 20; carried.anim = 'down'; }
    u.carryId = null; u.carryTargetId = null;
  }
  if (u.team === 'enemy') {
    this.stats.kills++;
    this.particles.burst(u.x, u.y - 10, 5, { spread: TAU, speed: 40, life: 1.4, size: 2.6, colors: ['#5a120e', '#7d1d16'], kind: 'blood', g: 120 });
    this.decals.push({ x: u.x, y: this.level.surfaceAt(u.x), type: 'blood', size: 12 + Math.random() * 8, rot: Math.random() * 6, life: 999 });
    AudioSys.death(u.x, this.cam);
    this.addFeed(`${u.enemyName || 'Hostile'} down`, 'good');
    if (u.tag === 'warlord') {
      this.addFeed('WARLORD ELIMINATED', 'good');
      this.cam.shake = 12;
      AudioSys.radio('confirm');
    }
  } else if (u.team === 'ally') {
    this.stats.alliesKilled++;
    this.addFeed(`${u.callsign || u.name} KIA`, 'warn');
    AudioSys.death(u.x, this.cam);
    CameraUtil.shake(this.cam, 5);
    if (u.role === 'commander') { u.isCommander = false; this.refreshCommand(); }
    for (const a of this.allies) if (a !== u && !a.dead && !a.downed && Math.abs(a.x - u.x) < 500) this.addStress(a, 20);
    if (u.carriedBy) { const c = this.allies.find((a) => a.id === u.carriedBy); if (c) { c.carryId = null; c.carryTargetId = null; } }
    UI.refreshSquadStrip(this);
  } else {
    this.stats.neutralsLost++;
    this.addFeed(`${u.name} KILLED`, 'warn');
    AudioSys.death(u.x, this.cam);
  }
  this.decals.push({ x: u.x, y: this.level.surfaceAt(u.x), type: 'blood', size: 10, rot: 0, life: 999 });
};

Battle.prototype.refreshCommand = function () {
  const cmd = this.allies.find((a) => a.role === 'commander' && !a.dead && !a.downed);
  if (cmd) {
    this.commanderAlive = true;
    this.applyCommanderAura();
    return;
  }
  this.commanderAlive = false;
  const successor = this.allies.filter((a) => !a.dead && !a.downed)
    .sort((a, b) => (b.xp || 0) - (a.xp || 0))[0] || null;
  for (const a of this.allies) {
    if (a.dead) continue;
    a.acc = a.stats ? a.stats.acc * (successor ? 0.98 : 0.95) : a.acc;
  }
  if (successor && !this.successionAnnounced) {
    this.successionAnnounced = true;
    this.addFeed(`${successor.callsign || successor.name} TAKES COMMAND`, 'warn');
  }
};

Battle.prototype.healTick = function (healer, target, dt) {
  if (!target || target.dead) { this.completeOrder(healer); return; }
  if (healer.medkits <= 0) {
    this.addFeed(`${healer.callsign || healer.name}: no medical supplies`, 'warn');
    healer.healTarget = null;
    this.completeOrder(healer);
    return;
  }
  if (!healer.healKitReserved) {
    healer.healKitReserved = true;
    healer.medkits--;
    this.stats.medkitsUsed++;
  }
  const isMedic = healer.role === 'medic';
  const mul = (healer.stats ? healer.stats.healMul : 1) * (isMedic ? 1 : 0.55);
  healer.healT = (healer.healT || 0) + dt;
  if (!healer.healAudioT || healer.healAudioT <= 0) { AudioSys.heal(target.x, this.cam); healer.healAudioT = 1.2; }
  healer.healAudioT -= dt;
  healer.anim = 'heal';
  if (target.downed) {
    target.reviveProg = (target.reviveProg || 0) + dt * mul;
    if (target.reviveProg >= 2.8) {
      target.downed = false;
      target.downT = 0;
      target.hp = Math.round(target.maxHp * 0.35);
      target.state = 'idle';
      target.anim = 'idle';
      target.stance = 'crouch';
      target.injured = true;
      target.bleeding = false;
      target.bleedingTreated = true;
      this.stats.revives++;
      healer.healedTotal = (healer.healedTotal || 0) + target.hp;
      this.addFeed(`${target.callsign || target.name} STABILISED`, 'good');
      AudioSys.ui('confirm');
      target.healTarget = null;
      this.completeOrder(healer);
      this.refreshCommand();
      UI.refreshSquadStrip(this);
      return;
    }
  } else {
    if (target.hp >= target.maxHp) {
      this.completeOrder(healer);
      healer.healTarget = null;
      return;
    }
    const rate = (isMedic ? 11 : 5.5) * mul;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + rate * dt);
    healer.healedTotal = (healer.healedTotal || 0) + (target.hp - before);
    if (Math.random() < dt * 3) {
      this.particles.spawn({ x: target.x + (Math.random() - 0.5) * 14, y: target.y - 30, vx: 0, vy: -12, life: 0.6, size: 2, kind: 'spark', color: 'rgba(150,220,160,.7)', additive: true });
    }
    if (target.hp >= target.maxHp) {
      this.stats.heals++;
      target.bleeding = false;
      target.bleedingTreated = true;
      this.addFeed(`${target.callsign || target.name}: patched up`, 'good');
      AudioSys.ui('confirm');
      target.healTarget = null;
      this.completeOrder(healer);
    }
  }
  if (!target.downed && target.anim === 'down') target.anim = 'idle';
};

/* ---------------- objectives ---------------- */
Battle.prototype.updateObjectives = function (dt) {
  const evac = this.level.evac;
  const all = this.objectives.concat(this.optionalObjectives);
  const requiredOthers = this.objectives.filter((o) => !o.optional && o.type !== 'extract');
  const othersDone = requiredOthers.every((o) => o.complete);
  for (const o of all) {
    if (o.complete || o.failed) continue;
    switch (o.type) {
      case 'killAll': {
        const alive = this.enemies.filter((e) => !e.dead).length;
        o.progress = Math.max(0, 1 - alive / Math.max(1, this.mission.enemies.length + this.waves.reduce((a, w) => a + w.count, 0)));
        if (alive === 0 && this.waves.every((w) => w.spawned)) this.completeObjective(o);
        break;
      }
      case 'killTarget': {
        if (!o.target || o.target.dead) this.completeObjective(o);
        break;
      }
      case 'survive': {
        o.progress = Math.min(o.max, (o.progress || 0) + dt);
        if (o.progress >= o.max) this.completeObjective(o);
        break;
      }
      case 'hold': {
        const zone = o.zone;
        if (!zone) break;
        const inside = this.allies.filter((a) => !a.dead && !a.downed && Math.abs(a.x - zone.x) <= (zone.w / 2) + 8 && Math.abs(a.y - zone.y) < 44).length;
        o.inside = inside;
        o.contested = this.enemies.some((e) => !e.dead && Math.abs(e.x - zone.x) < zone.w / 2 && Math.abs(e.y - zone.y) < 44);
        if (inside > 0) {
          o.progress = Math.min(o.max, o.progress + dt * (o.contested ? 0.55 : 1));
        }
        if (o.progress >= o.max) this.completeObjective(o);
        break;
      }
      case 'interact': {
        const zone = o.zone;
        if (!zone) break;
        const worker = this.allies.find((a) => !a.dead && !a.downed && Math.abs(a.x - zone.x) < 48 && Math.abs(a.y - zone.y) < 36);
        o.workerId = worker ? worker.id : null;
        if (worker) {
          o.progress = Math.min(o.max, o.progress + dt);
          if (Math.random() < dt * 4) {
            const prop = this.level.props.find((p) => p.objective === o.def);
            if (prop) this.particles.spawn({ x: prop.x + (Math.random() - 0.5) * 10, y: prop.y - 10, vx: 0, vy: -20, life: 0.5, size: 2, kind: 'spark', color: '#ffcf7a', additive: true });
          }
        }
        if (o.progress >= o.max) {
          const prop = this.level.props.find((p) => p.objective === o.def);
          if (prop) {
            prop.powered = false;
            this.particles.burst(prop.x, prop.y - 30, 12, { spread: TAU, speed: 90, life: 0.8, size: 2.2, colors: ['#ffcf7a', '#ff8a3c'], kind: 'spark', additive: true, g: 120 });
          }
          this.completeObjective(o);
        }
        break;
      }
      case 'rescue': {
        const tag = o.def.tag || 'vip';
        const n = this.neutrals.find((x) => x.tag === tag);
        if (!n || n.dead) { if (n && n.dead) this.failObjective(o); break; }
        if (n.freed) { this.completeObjective(o); break; }
        const near = this.allies.some((a) => !a.dead && !a.downed && Math.abs(a.x - n.x) < 58 && Math.abs(a.y - n.y) < 40);
        if (near) {
          o.progress = Math.min(o.max, o.progress + dt);
          if (Math.random() < dt * 5) this.particles.spawn({ x: n.x, y: n.y - 20, vx: 0, vy: -18, life: 0.6, size: 2, kind: 'spark', color: '#9fe0a8', additive: true });
        }
        if (o.progress >= o.max) {
          this.releaseNeutral(n);
          this.completeObjective(o);
        }
        break;
      }
      case 'rescueUnits': {
        let allFreed = true;
        for (const tag of o.def.tags) {
          const n = this.neutrals.find((x) => x.tag === tag);
          if (!n || n.dead) { this.failObjective(o); allFreed = false; break; }
          if (n.freed) continue;
          const near = this.allies.some((a) => !a.dead && !a.downed && Math.abs(a.x - n.x) < 58 && Math.abs(a.y - n.y) < 40);
          if (near) {
            o.perTag[tag] = Math.min(o.max, (o.perTag[tag] || 0) + dt);
            if (Math.random() < dt * 4) this.particles.spawn({ x: n.x, y: n.y - 20, vx: 0, vy: -16, life: 0.5, size: 2, kind: 'spark', color: '#9fe0a8', additive: true });
            if (o.perTag[tag] >= o.max) this.releaseNeutral(n);
          }
          if (!n.freed) allFreed = false;
        }
        o.progress = o.def.tags.reduce((s, t) => s + (o.perTag[t] || 0), 0) / (o.max * o.def.tags.length);
        if (allFreed && o.def.tags.every((t) => { const n = this.neutrals.find((x) => x.tag === t); return n && n.freed; })) this.completeObjective(o);
        break;
      }
      case 'protect': {
        const n = this.neutrals.find((x) => x.tag === o.def.tag);
        if (!n) break;
        if (n.dead) this.failObjective(o);
        break;
      }
      case 'escort': {
        const n = this.neutrals.find((x) => x.tag === o.def.tag);
        if (!n) break;
        if (n.dead) { this.failObjective(o); break; }
        const squadIn = this.allies.some((a) => !a.dead && !a.downed && Math.abs(a.x - evac.x) < 100);
        const vipIn = Math.abs(n.x - evac.x) < 110;
        if (squadIn && vipIn && n.freed !== false) {
          this.completeObjective(o);
          const prot = this.objectives.find((p) => p.type === 'protect' && p.def.tag === o.def.tag && !p.complete);
          if (prot && !this.neutrals.find((nn) => nn.tag === o.def.tag)?.dead) this.completeObjective(prot);
        }
        break;
      }
      case 'extract': {
        if (!othersDone) break;
        const req = this.extractRequirement();
        o.extractReq = req;
        const escorts = this.neutrals.filter((n) => n.freed || n.following);
        const escortsIn = escorts.every((n) => Math.abs(n.x - evac.x) < 120 && Math.abs(n.y - evac.y) < 40);
        if (req.satisfied && req.have > 0 && escortsIn) this.completeObjective(o);
        break;
      }
    }
    // optional noInjury/noKia are evaluated at mission end
  }
  // optional checks
  for (const o of this.optionalObjectives) {
    if (o.complete || o.failed) continue;
    if (o.type === 'noInjury') {
      if (this.stats.alliesDowned > 0 || this.allies.some((a) => a.hp < a.maxHp * 0.4 && !a.downed)) o.failed = true;
    }
    if (o.type === 'noKia') {
      if (this.stats.alliesKilled > 0) o.failed = true;
    }
  }
};

Battle.prototype.extractRequirement = function () {
  const evac = this.level.evac;
  const pol = this.extractPolicy || this.mission.extractPolicy || 'all';
  const living = this.allies.filter((a) => !a.dead);
  const total = Math.max(1, living.length);
  const inZone = (a) => {
    if (a.carriedBy) {
      const carrier = this.allies.find((c) => c.id === a.carriedBy && !c.dead);
      return !!carrier && Math.abs(carrier.x - evac.x) < 100 && Math.abs(carrier.y - evac.y) < 40;
    }
    return Math.abs(a.x - evac.x) < 100 && Math.abs(a.y - evac.y) < 40;
  };
  const present = living.filter(inZone).length;
  const effective = living.filter((a) => !a.downed);
  const downed = living.filter((a) => a.downed);
  let need = total;
  let satisfied = present >= need;
  let label = 'ALL SURVIVORS AT EXTRACTION';
  let detail = `${present}/${total} personnel`;
  if (pol === 'commander') {
    const cmd = living.find((a) => a.role === 'commander') || living.slice().sort((a, b) => (b.xp || 0) - (a.xp || 0))[0];
    need = 1;
    satisfied = !!cmd && inZone(cmd);
    label = 'COMMANDER AT EXTRACTION';
    detail = satisfied ? 'commander on station' : 'commander not on station';
  } else if (pol === 'vip') {
    const vips = this.neutrals.filter((n) => (n.freed || n.following) && !n.dead);
    need = 1;
    satisfied = vips.length > 0 && vips.every((n) => Math.abs(n.x - evac.x) < 120 && Math.abs(n.y - evac.y) < 40);
    label = 'VIP AT EXTRACTION';
    detail = satisfied ? 'VIP on station' : 'VIP not on station';
  } else if (pol === 'casualty') {
    need = 1;
    satisfied = downed.some(inZone) && effective.some(inZone);
    label = 'CASUALTY + ESCORT AT EXTRACTION';
    detail = `${downed.filter(inZone).length} casualty in zone`;
  } else if (/^percent:/.test(pol)) {
    const p = clamp(parseFloat(pol.split(':')[1]) || 0.6, 0.1, 1);
    need = Math.ceil(total * p);
    satisfied = present >= need && effective.length > 0 && effective.some(inZone);
    label = `EXTRACT ${Math.round(p * 100)}% OF SURVIVORS`;
    detail = `${present}/${need} required`;
  } else {
    // all: every living soldier, including downed (carried in) must be at the pad
    need = total;
    satisfied = present >= total && effective.length > 0 && effective.some(inZone);
    label = 'ALL SURVIVORS AT EXTRACTION';
    detail = `${present}/${need} personnel`;
  }
  return { policy: pol, need, have: present, satisfied, label, detail, inZone: effective.filter(inZone).length, downed: downed.length };
};

Battle.prototype.releaseNeutral = function (n) {
  if (!n || n.dead) return;
  n.freed = true;
  n.following = true;
  n.guarded = false;
  if (n.downed) {
    n.downed = false;
    n.downT = 0;
    n.hp = Math.max(30, Math.round(n.maxHp * 0.7));
  }
  n.state = 'idle';
  n.anim = 'idle';
  n.stance = 'crouch';
  n.name = n.role === 'vip' ? (n.name === 'DOWNED PILOT' ? 'PILOT' : n.name) : n.name;
  this.addFeed(`${n.name} SECURED — follow the squad`, 'good');
  AudioSys.ui('confirm');
  this.particles.burst(n.x, n.y - 25, 8, { spread: TAU, speed: 50, life: 0.9, size: 2.4, color: '#8fd6a0', kind: 'spark', additive: true });
};

Battle.prototype.completeObjective = function (o) {
  if (o.complete) return;
  o.complete = true;
  o.state = 'complete';
  this.stats.objectives++;
  this.addFeed('OBJECTIVE COMPLETE — ' + o.label, 'good');
  AudioSys.ui('confirm');
  if (!o.optional) {
    this.cam.shake = Math.max(this.cam.shake, 1.2);
  }
  UI.updateBattleHUD(this);
};

Battle.prototype.failObjective = function (o) {
  if (o.failed || o.complete) return;
  o.failed = true;
  o.state = 'failed';
  this.addFeed('OBJECTIVE FAILED — ' + o.label, 'warn');
  AudioSys.ui('deny');
  UI.updateBattleHUD(this);
};

Battle.prototype.initRain = function () {
  this.rain = [];
  const q = QUALITY[this.level.quality] || QUALITY.high;
  const n = Math.round(120 * q.weather * this.weather);
  for (let i = 0; i < n; i++) {
    this.rain.push({ x: Math.random(), y: Math.random(), l: 8 + Math.random() * 18, s: 0.5 + Math.random() });
  }
};

/* ---------------- utility stats ---------------- */
Battle.prototype.getSoldierContribution = function (soldierId) {
  const u = this.allies.find((a) => a.soldierId === soldierId);
  if (!u) return null;
  return {
    kills: u.kills || 0, damage: u.damageDealt || 0, shots: u.shots || 0, hits: u.hits || 0,
    dead: u.dead, downed: u.downed
  };
};
