'use strict';
/* ============================================================
   10 — AI: friendly autonomy, enemy behaviour
   ============================================================ */

Battle.prototype.allyAcquireTarget = function (u) {
  if (u.dead || u.downed || !u.weaponCfg) return null;
  const eye = unitEye(u);
  const range = u.weaponCfg.range * 1.05;
  if (u.focusId) {
    const f = this.enemies.find((e) => e.id === u.focusId && !e.dead);
    if (f) {
      const c = unitCenter(f);
      if (Math.abs(f.x - u.x) <= range && lineOfSight(this.level, eye.x, eye.y, c.x, c.y)) return f;
    } else u.focusId = null;
  }
  let best = null, bestScore = 1e9;
  const watch = u.overwatch ? Math.atan2(u.overwatch.y - u.y, u.overwatch.x - u.x) : null;
  for (const e of this.enemies) {
    if (e.dead) continue;
    const d = Math.abs(e.x - u.x);
    if (d > range) continue;
    const c = unitCenter(e);
    if (!lineOfSight(this.level, eye.x, eye.y, c.x, c.y)) continue;
    if (watch != null) {
      const a = Math.atan2(c.y - eye.y, c.x - eye.x);
      if (Math.abs(angleDiff(a, watch)) > 0.58) continue;
    }
    let score = d;
    if (e.target === u) score -= 60;
    if (e.aiState === 'retreat') score += 120;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
};

Battle.prototype.autoCoverFor = function (u, threatX) {
  if (!u.prefersCover) return false;
  const found = findNearbyCover(this.level, u.x + (u.formationIndex % 3 - 1) * 40, threatX, 230);
  if (!found) return false;
  claimCover(found.cover, u.id);
  if (Math.abs(found.x - u.x) < 6) {
    u.coverId = found.cover.id;
    u.stance = 'crouch';
    if (!found.cover.occupants.includes(u.id)) found.cover.occupants.push(u.id);
    return true;
  }
  const p = findPath(this.level, u.x, found.x);
  if (p) {
    u.path = p; u.pathI = 0;
    u.autoCoverTarget = { x: found.x, coverId: found.cover.id };
    u.addFeedCover = true;
    return true;
  }
  return false;
};

Battle.prototype.updateAllyUnit = function (u, dt) {
  if (u.dead || u.downed) return;
  if (u.healAudioT > 0) u.healAudioT -= dt;

  /* ---- movement execution ---- */
  const beforeX = u.x;
  if (u.order) {
    this.updateUnitMovement(u, dt);
  } else if (u.path) {
    const done = this.moveAlongPath(u, dt, 1.05);
    if (done) {
      u.path = null;
      if (u.autoCoverTarget) {
        this.attachCover(u, u.autoCoverTarget.coverId);
        u.autoCoverTarget = null;
      }
    }
  } else {
    u.moving = false;
  }

  /* ---- stance management ---- */
  if (u.moving) {
    u.stance = 'stand';
    if (u.coverId) {
      const c = this.level.covers.find((cv) => cv.id === u.coverId);
      if (c && Math.abs(c.x - u.x) > 55) u.coverId = null;
    }
  } else {
    const cov = u.coverId ? this.level.covers.find((c) => c.id === u.coverId && !c.dead) : null;
    if (cov && Math.abs(cov.x - u.x) < cov.w / 2 + 20) {
      u.stance = (u.role === 'sniper' && (u.holding || u.overwatch)) ? 'prone' : 'crouch';
    } else if (u.stance !== 'prone') {
      u.stance = 'stand';
    }
    if (u.role === 'sniper' && u.holding && !cov) u.stance = 'prone';
  }

  /* ---- emergency cover ---- */
  if (!u.moving && (u.suppression > 58 || u.recentlyHit) && !u.autoCoverTarget) {
    const canAuto = !u.order || ['hold', 'overwatch', 'suppress', 'focus'].includes(u.order.type);
    if (canAuto) {
      u.autoCoverT = (u.autoCoverT || 0) + dt;
      if (u.autoCoverT > 0.5) {
        u.autoCoverT = 0;
        const tgt = u.target || this.enemies.find((e) => !e.dead);
        this.autoCoverFor(u, tgt ? tgt.x : null);
      }
    }
  } else if (u.suppression < 20) {
    u.autoCoverT = 0;
  }
  if (u.recentlyHit > 0) u.recentlyHit -= dt;

  /* ---- targeting ---- */
  const tgt = this.allyAcquireTarget(u);
  u.target = tgt;
  if (tgt && u.lastTargetId !== tgt.id) {
    u.lastTargetId = tgt.id;
    u.aimT = Math.max(0, (u.aimT || 0) * 0.4);
    u.burstLeft = u.weaponCfg ? (u.weaponCfg.burst ? u.weaponCfg.burst[0] : 3) : 3;
  }
  if (!tgt) u.lastTargetId = null;

  if (u.order && u.order.type === 'heal' && u.healTarget) {
    if (Math.abs(u.healTarget.x - u.x) < 36) return; // stay on task
  }

  /* ---- reload logic ---- */
  if (u.reloadT <= 0 && u.weaponCfg) {
    if (u.mag <= 0 && u.reserve > 0) this.startReload(u);
    else if (u.mag <= u.magSize * 0.18 && u.reserve > 0 && (!tgt || u.suppression > 20) && !u.moving) this.startReload(u);
  }

  /* ---- auto medical ---- */
  if (u.role === 'medic' && !u.order && !u.moving && u.medkits > 0 && !u.healingAuto || (u.role === 'medic' && !u.moving && u.medkits > 0 && u.order && u.order.type === 'hold' && !u.healingAuto)) {
    const enemiesNear = this.enemies.some((e) => !e.dead && Math.abs(e.x - u.x) < 240);
    if (!enemiesNear) {
      const patient = this.allies.filter((a) => !a.dead && a !== u && (a.downed || (a.hp < a.maxHp * 0.55)))
        .sort((a, b) => (a.downed === b.downed ? Math.abs(a.x - u.x) - Math.abs(b.x - u.x) : (a.downed ? -1 : 1)))[0];
      if (patient && Math.abs(patient.x - u.x) < 520) {
        u.healingAuto = true;
        this.startOrder(u, { type: 'heal', targetId: patient.id });
        this.addFeed(`${u.callsign || u.name}: moving to treat ${patient.callsign || patient.name}`);
      }
    }
  }
  if (u.healingAuto && !u.order) u.healingAuto = false;

  /* ---- firing ---- */
  if (u.reloadT > 0 || u.healTarget) {
    if (u.reloadT > 0) u.anim = 'reload';
    return;
  }
  let aimTarget = null;
  let suppressMode = false;
  if (tgt) aimTarget = unitCenter(tgt);
  else if (u.suppressAt) {
    aimTarget = { x: u.suppressAt.x, y: u.suppressAt.y - 18 };
    suppressMode = true;
  } else if (u.overwatch && !u.target) {
    // hold the watch direction
    u.desiredAim = Math.atan2(u.overwatch.y - u.y, u.overwatch.x - u.x);
    u.anim = 'aim';
    u.state = 'aim';
    return;
  }
  if (!aimTarget) {
    if (u.order && u.order.type === 'focus') {
      // no target visible, hold position and scan
    }
    return;
  }
  const m = muzzlePoint(u);
  const inRange = Math.abs(aimTarget.x - u.x) < u.weaponCfg.range * 1.04;
  if (!inRange) {
    if (u.order) return;
    u.desiredAim = Math.atan2(aimTarget.y - m.y, aimTarget.x - m.x);
    return;
  }
  // LOS for actual targets; if blocked by cover, suppress the cover instead
  if (!suppressMode) {
    const eye = unitEye(u);
    if (!lineOfSight(this.level, eye.x, eye.y, aimTarget.x, aimTarget.y)) {
      const block = raycastCover(this.level, eye.x, eye.y, aimTarget.x, aimTarget.y);
      if (block && Math.abs(block.cover.x - u.x) < u.weaponCfg.range) {
        aimTarget = { x: block.cover.x + (Math.random() - 0.5) * 24, y: block.cover.y - block.cover.h * 0.55 };
        suppressMode = true;
        u.suppressCoverT = (u.suppressCoverT || 0) + 1;
      } else return;
    } else if (this.friendlyBlocked(u, aimTarget.x, aimTarget.y)) {
      u.blockedT = 0.25;
      return;
    }
  }
  const desired = Math.atan2(aimTarget.y - m.y, aimTarget.x - m.x);
  u.desiredAim = desired;
  u.dir = Math.cos(desired) >= 0 ? 1 : -1;
  u.anim = 'aim';
  u.state = 'aim';
  u.aimT = (u.aimT || 0) + dt * (u.react || 1) * (1 - (u.suppression || 0) * 0.0035) * (u.moving ? 0.65 : 1);
  const needAim = u.weaponCfg.aim * (1 + (u.suppression || 0) * 0.004) * (u.moving ? 1.5 : 1);
  if (u.aimT < needAim) return;
  if (u.burstPause > 0) { u.burstPause -= dt; return; }
  if (u.burstLeft == null || u.burstLeft <= 0) {
    u.burstPause = 0.18 + Math.random() * 0.35 + (u.suppression || 0) * 0.004;
    u.burstLeft = u.weaponCfg.burst ? (u.weaponCfg.burst[0] + Math.floor(Math.random() * (u.weaponCfg.burst[1] - u.weaponCfg.burst[0] + 1))) : 3;
    return;
  }
  const spreadMul = suppressMode ? 1.5 : (u.moving ? 1.25 : 1);
  const fired = this.fireWeapon(u, aimTarget.x, aimTarget.y, { spreadMul });
  if (fired) {
    u.burstLeft--;
    if (u.weaponCfg.auto === false) {
      u.burstPause = 0.35 + Math.random() * 0.4;
      u.burstLeft = 1;
      u.aimT = needAim * 0.55;
    }
    if (tgt) {
      tgt.target = u;
      tgt.lastSeen = { x: u.x, y: u.y };
    }
  }
};

/* ============================================================
   ENEMY AI
   ============================================================ */
Battle.prototype.updateEnemyAI = function (u, dt) {
  if (u.dead) return;
  u.thinkT -= dt;
  u.stateT += dt;
  if (u.reactT > 0) u.reactT -= dt;
  if (u.alertT > 0) u.alertT -= dt;

  /* perception tick */
  if (u.thinkT <= 0) {
    u.thinkT = 0.22 + Math.random() * 0.12;
    this.enemyPerceive(u);
    this.enemyCoord(u);
  }

  /* state selection */
  const hpRatio = u.hp / u.maxHp;
  if (!u.dead) {
    if (hpRatio < 0.24 && u.aiState !== 'retreat' && u.aiState !== 'engage') {
      u.aiState = 'retreat';
      u.stateT = 0;
    }
    if (u.aiState === 'patrol' && u.target) {
      u.aiState = 'alert';
      u.stateT = 0;
      u.reactT = (0.32 + Math.random() * 0.35) * (u.react || 1);
    }
    if ((u.aiState === 'alert' || u.aiState === 'investigate') && u.target && u.reactT <= 0 && u.stateT > 0.25) {
      u.aiState = 'engage';
      u.stateT = 0;
    }
    if (u.aiState === 'engage' && (u.suppression > 62 || u.hp < u.maxHp * 0.4) && u.stateT > 1.2) {
      const found = findNearbyCover(this.level, u.x, u.target ? u.target.x : null, 260);
      if (found && Math.abs(found.x - u.x) > 8) {
        u.aiState = 'cover';
        u.coverDest = found;
        u.path = findPath(this.level, u.x, found.x);
        u.pathI = 0;
        u.stateT = 0;
      }
    }
    if ((u.enemyType === 'flanker' || u.enemyType === 'scout') && u.aiState === 'engage' && u.target && u.stateT > 2.2 && Math.random() < 0.012) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const dest = clamp(u.target.x + side * (130 + Math.random() * 100), 40, this.level.width - 40);
      u.aiState = 'flank';
      u.flankDest = dest;
      u.path = findPath(this.level, u.x, dest);
      u.pathI = 0;
      u.stateT = 0;
    }
    if (u.aiState === 'flank' && (!u.path || u.pathI >= u.path.length)) {
      u.aiState = 'engage';
      u.stateT = 0;
    }
    if (u.aiState === 'cover' && (!u.path || u.pathI >= u.path.length)) {
      u.stance = 'crouch';
      if (u.coverDest) { u.coverId = u.coverDest.cover.id; u.x = Math.max(u.x, u.coverDest.x - 3); u.y = this.level.surfaceAt(u.x); }
      u.aiState = 'engage';
      u.stateT = 0;
    }
    if (u.aiState === 'retreat') {
      if (hpRatio > 0.45 || u.stateT > 8) { u.aiState = 'engage'; u.stateT = 0; }
    }
    if (u.aiState === 'alert' && u.stateT > 9 && !u.target) { u.aiState = 'investigate'; u.stateT = 0; }
    if (u.aiState === 'investigate' && u.stateT > 11) { u.aiState = 'patrol'; u.stateT = 0; u.alertPos = null; }
  }

  /* movement + combat */
  switch (u.aiState) {
    case 'patrol': {
      u.moving = false;
      u.stance = 'stand';
      if (u.patrolWait > 0) { u.patrolWait -= dt; break; }
      if (!u.path) {
        const nx = clamp((u.homeX || u.x) + (Math.random() - 0.5) * 220, 40, this.level.width - 40);
        const p = findPath(this.level, u.x, nx);
        if (p) { u.path = p; u.pathI = 0; u.patrolTarget = nx; }
        u.patrolWait = 2.5 + Math.random() * 3;
      } else {
        if (this.moveAlongPath(u, dt, 0.62)) { u.path = null; u.patrolWait = 2 + Math.random() * 3; }
      }
      break;
    }
    case 'alert':
    case 'investigate': {
      u.stance = 'stand';
      const dest = u.alertPos || (u.lastSeen ? u.lastSeen : null);
      if (dest) {
        if (!u.path) { u.path = findPath(this.level, u.x, dest.x); u.pathI = 0; }
        if (u.path && this.moveAlongPath(u, dt, 0.9)) { u.path = null; }
        u.desiredAim = dest.x > u.x ? 0.1 : Math.PI - 0.1;
        if (Math.abs(u.x - dest.x) < 30 && (!u.path)) {
          u.desiredAim = Math.sin(this.time * 1.5) * 0.5 + (u.dir > 0 ? 0 : Math.PI);
          u.anim = 'aim';
        }
      }
      break;
    }
    case 'cover': {
      if (u.path) {
        this.moveAlongPath(u, dt, 0.95);
      }
      if (u.path && u.target) this.enemyTryFire(u, dt, true);
      break;
    }
    case 'flank': {
      if (u.path) {
        this.moveAlongPath(u, dt, 1.15);
      } else if (u.target) {
        this.enemyTryFire(u, dt, true);
      }
      break;
    }
    case 'retreat': {
      u.stance = 'stand';
      if (!u.path) {
        const dir = u.target ? Math.sign(u.x - u.target.x) || 1 : 1;
        const dest = clamp(u.x + dir * 190, 40, this.level.width - 40);
        u.path = findPath(this.level, u.x, dest);
        u.pathI = 0;
      }
      if (u.path) this.moveAlongPath(u, dt, 1.25);
      if (u.target) this.enemyTryFire(u, dt, true);
      break;
    }
    case 'engage':
    default: {
      const tgt = u.target;
      if (!tgt || tgt.dead) {
        u.aiState = 'investigate';
        u.stateT = 0;
        u.stance = 'stand';
        break;
      }
      const d = Math.abs(tgt.x - u.x);
      const preferred = u.weaponCfg ? Math.min(u.weaponCfg.range * 0.8, (u.enemyType === 'sniper' ? 900 : u.enemyType === 'scout' || u.enemyType === 'flanker' ? 220 : 520)) : 400;
      const tooClose = d < preferred * 0.35 && (u.enemyType === 'sniper' || u.enemyType === 'heavy');
      if (d > preferred * 1.15 && u.enemyType !== 'sniper') {
        if (!u.path) {
          const dest = clamp(tgt.x - Math.sign(tgt.x - u.x) * preferred * 0.7, 40, this.level.width - 40);
          u.path = findPath(this.level, u.x, dest);
          u.pathI = 0;
        }
        if (u.path) this.moveAlongPath(u, dt, 0.85);
        this.enemyTryFire(u, dt, true);
      } else if (tooClose) {
        if (!u.path) {
          const dest = clamp(u.x - (tgt.x - u.x) * 0.4, 40, this.level.width - 40);
          u.path = findPath(this.level, u.x, dest);
          u.pathI = 0;
        }
        if (u.path) this.moveAlongPath(u, dt, 1.0);
        this.enemyTryFire(u, dt, true);
      } else {
        u.moving = false;
        const cov = u.coverId ? this.level.covers.find((c) => c.id === u.coverId && !c.dead) : null;
        if (cov && Math.abs(cov.x - u.x) < 44) u.stance = 'crouch';
        else if (u.enemyType === 'sniper' && d > 500) u.stance = 'prone';
        else u.stance = 'stand';
        this.enemyTryFire(u, dt, false);
      }
      break;
    }
  }

  if (!u.moving && u.anim !== 'aim' && u.anim !== 'fire' && u.anim !== 'reload') {
    u.anim = 'idle';
  }
};

Battle.prototype.enemyPerceive = function (u) {
  if (u.dead) return;
  const eye = unitEye(u);
  const range = u.viewRange || 620;
  let best = null, bestD = 1e9;
  for (const a of this.allies) {
    if (a.dead || a.downed) continue;
    const d = Math.abs(a.x - u.x);
    if (d > range) continue;
    const c = unitCenter(a);
    if (!lineOfSight(this.level, eye.x, eye.y, c.x, c.y, {})) continue;
    // stealth / prone reduces detection a little
    let eff = d * (a.stance === 'prone' ? 1.15 : a.stance === 'crouch' ? 1.08 : 1);
    if (a.suppression > 60) eff *= 0.9;
    // avoid every hostile stacking onto one soldier
    const crowd = this.enemies.reduce((n, e) => n + (e !== u && !e.dead && e.target === a ? 1 : 0), 0);
    eff += crowd * 150;
    if (eff < bestD) { bestD = eff; best = a; }
  }
  if (best) {
    u.target = best;
    if (u.target !== best) u.targetSince = this.time;
    u.lastSeen = { x: best.x, y: best.y };
    u.lastSeenT = this.time;
    u.alertPos = { x: best.x, y: best.y };
    if (u.aiState === 'patrol' || u.aiState === 'investigate' || u.aiState === 'alert') {
      const wasPassive = u.aiState === 'patrol' || u.aiState === 'investigate';
      u.aiState = 'alert';
      u.stateT = u.aiState === 'alert' ? u.stateT : 0;
      u.reactT = Math.max(u.reactT || 0, (0.18 + Math.random() * 0.3) * (u.react || 1) * (this.diff ? 1 : 1));
      if (wasPassive && !u.contacted) {
        u.contacted = true;
        this.addFeed('CONTACT — ' + (u.enemyName || 'hostile') + (best && Math.abs(best.x - u.x) < 220 ? ' — CLOSE' : ''), 'warn');
      }
    }
  } else if (u.target) {
    if (this.time - (u.lastSeenT || 0) > 2.2) {
      u.target = null;
      u.aiState = 'investigate';
      u.stateT = 0;
      u.path = null;
    }
  }
  // periodic target rotation so hostiles spread fire across the squad
  if (u.target && !u.target.dead && this.time - (u.targetSince || 0) > 2.6) {
    u.target = null; // re-acquire with crowd penalty next tick
  }
  if (u.target && u.target.dead) { u.target = null; u.aiState = 'patrol'; u.stateT = 0; }
};

Battle.prototype.enemyCoord = function (u) {
  if (u.dead || this.time % 4 > 0.25) return;
  const workers = this.enemies.filter((e) => !e.dead && e.aiState !== 'patrol' && e.lastSeen);
  if (!workers.length) return;
  const lead = workers[0];
  if (!lead) return;
  const coord = this.diff ? this.diff.enemyCoord : 1;
  for (const e of this.enemies) {
    if (e.dead || e === u || e.aiState === 'engage') continue;
    if (Math.abs(e.x - u.x) < 520 * coord && Math.random() < 0.4 * coord) {
      if (!e.lastSeen) {
        e.lastSeen = { ...lead.lastSeen };
        e.alertPos = { ...lead.lastSeen };
        e.lastSeenT = this.time;
        if (e.aiState === 'patrol') { e.aiState = 'alert'; e.stateT = 0; }
      }
    }
  }
};

Battle.prototype.enemyTryFire = function (u, dt, moving) {
  if (u.reloadT > 0 || u.dead) return false;
  if (!u.weaponCfg) return false;
  if (u.mag <= 0) {
    this.startReload(u);
    return false;
  }
  if (u.reactT > 0) return false;
  const tgt = u.target;
  if (!tgt || tgt.dead) return false;
  const c = unitCenter(tgt);
  const m = muzzlePoint(u);
  const d = Math.abs(c.x - u.x);
  if (d > u.weaponCfg.range * 1.02) return false;
  const eye = unitEye(u);
  if (!lineOfSight(this.level, eye.x, eye.y, c.x, c.y)) {
    // suppression fire into blocking cover / last known position
    const block = raycastCover(this.level, eye.x, eye.y, c.x, c.y);
    if (block && (u.enemyType === 'heavy' || Math.random() < 0.35) && Math.abs(block.cover.x - u.x) < u.weaponCfg.range) {
      const desired0 = Math.atan2(block.cover.y - block.cover.h * 0.5 - m.y, block.cover.x - m.x);
      u.desiredAim = desired0;
      u.dir = Math.cos(desired0) >= 0 ? 1 : -1;
      u.anim = 'aim';
      u.aimT = (u.aimT || 0) + dt * (u.react || 1);
      if (u.aimT < u.weaponCfg.aim) return false;
      if (u.fireT > 0) return false;
      if (u.burstPause > 0) { u.burstPause -= dt; return false; }
      const ok = this.fireWeapon(u, block.cover.x + (Math.random() - 0.5) * 20, block.cover.y - block.cover.h * 0.55, { spreadMul: 2.2 });
      if (ok) { u.burstLeft--; if (u.burstLeft <= 0) { u.burstPause = 0.4 + Math.random() * 0.5; u.burstLeft = 4; } }
      return ok;
    }
    if (u.enemyType === 'heavy' && u.lastSeen && Math.abs(u.lastSeen.x - u.x) < u.weaponCfg.range && Math.random() < 0.02) {
      this.fireWeapon(u, u.lastSeen.x, u.lastSeen.y - 25, { spreadMul: 2.6 });
      return true;
    }
    return false;
  }
  if (this.friendlyBlocked(u, c.x, c.y)) return false;
  const desired = Math.atan2(c.y - m.y, c.x - m.x);
  u.desiredAim = desired;
  u.dir = Math.cos(desired) >= 0 ? 1 : -1;
  u.anim = 'aim';
  u.state = 'aim';
  u.aimT = (u.aimT || 0) + dt * (u.react || 1) * (1 - (u.suppression || 0) * 0.003);
  const need = u.weaponCfg.aim * (1 + (u.suppression || 0) * 0.004) * (moving ? 1.3 : 1);
  if (u.aimT < need) return false;
  if (u.burstPause > 0) { u.burstPause -= dt; return false; }
  if (!u.burstLeft || u.burstLeft <= 0) {
    u.burstPause = 0.45 + Math.random() * 0.55;
    u.burstLeft = u.weaponCfg.burst ? (u.weaponCfg.burst[0] + Math.floor(Math.random() * (u.weaponCfg.burst[1] - u.weaponCfg.burst[0] + 1))) : 3;
    return false;
  }
  // commander aura
  const cmd = this.enemies.find((e) => !e.dead && e.enemyType === 'commander' && Math.abs(e.x - u.x) < 360);
  const fired = this.fireWeapon(u, c.x, c.y, { spreadMul: cmd ? 0.85 : 1 });
  if (fired) {
    u.burstLeft--;
    if (u.weaponCfg.auto === false) { u.burstPause = 0.4 + Math.random() * 0.3; u.burstLeft = 1; u.aimT = need * 0.4; }
  }
  return fired;
};
