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
  const found = findNearbyCover(this.level, u.x + (u.formationIndex % 3 - 1) * 40, threatX, 230, null, u.y);
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

Battle.prototype.allyTryFire = function (u, dt, target) {
  if (!u || u.dead || u.downed || !u.weaponCfg) return false;
  if (u.reloadT > 0 || u.carryId) return false;
  if (u.mag <= 0) { if (u.reserve > 0) this.startReload(u); return false; }
  const tgt = target || u.target || this.allyAcquireTarget(u);
  if (!tgt || tgt.dead) return false;
  if (Math.abs(tgt.x - u.x) > u.weaponCfg.range * 1.04) return false;
  const eye = unitEye(u), c = unitCenter(tgt);
  if (!lineOfSight(this.level, eye.x, eye.y, c.x, c.y)) return false;
  const m = muzzlePoint(u);
  const desired = Math.atan2(c.y - m.y, c.x - m.x);
  u.desiredAim = desired;
  u.dir = Math.cos(desired) >= 0 ? 1 : -1;
  u.anim = 'aim';
  u.state = 'aim';
  u.aimT = (u.aimT || 0) + dt * (u.react || 1) * (1 - (u.suppression || 0) * 0.0035);
  if (u.aimT < u.weaponCfg.aim) return false;
  if (u.burstPause > 0) { u.burstPause -= dt; return false; }
  if (u.burstLeft == null || u.burstLeft <= 0) {
    u.burstLeft = u.weaponCfg.burst ? u.weaponCfg.burst[0] : 2;
    u.burstPause = 0.15 + Math.random() * 0.3;
    return false;
  }
  const fired = this.fireWeapon(u, c.x, c.y, { spreadMul: 1.25 });
  if (fired) { u.burstLeft--; u.aimT = 0; }
  return fired;
};

Battle.prototype.updateAllyUnit = function (u, dt) {
  if (u.dead || u.downed) return;
  if (u.healAudioT > 0) u.healAudioT -= dt;

  /* ---- interruption: emergency cover, then resume the paused command ---- */
  if (u.interrupt) {
    u.interrupt.t -= dt;
    u.moving = false;
    const threat = this.enemies.find((e) => !e.dead);
    if (!u.interrupt.target && threat) {
      const found = findNearbyCover(this.level, u.x, threat.x, 280, threat.y, u.y);
      u.interrupt.target = found;
      if (found) { claimCover(found.cover, u.id); const p = findPath(this.level, u.x, u.y, found.x, found.y); if (p) { u.path = p; u.pathI = 0; } }
    }
    if (u.path) this.moveAlongPath(u, dt, 1.35);
    if (u.interrupt.target && Math.abs(u.x - u.interrupt.target.x) < 14) this.attachCover(u, u.interrupt.target.cover.id);
    if (u.interrupt.t <= 0) {
      const cmd = u.order;
      u.interrupt = null;
      u.path = null;
      if (cmd && cmd.state === 'waiting') this.resumeCommand(u);
    }
    const tgtI = this.allyAcquireTarget(u);
    u.target = tgtI;
    if (tgtI) this.allyTryFire(u, dt);
    return;
  }

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

  /* ---- persistent command termination + follow behaviour ---- */
  if (u.order) {
    const o = u.order;
    if (o.type === 'focus') {
      const alive = this.enemies.some((e) => e.id === o.targetId && !e.dead);
      if (!alive) { this.completeOrder(u, 'target eliminated'); return; }
    }
    if (o.type === 'suppress' && u.mag <= 0 && u.reserve <= 0) { this.failOrder(u, o, 'ammunition exhausted'); return; }
    if (o.type === 'overwatch' && u.mag <= 0 && u.reserve <= 0) { this.failOrder(u, o, 'ammunition exhausted'); return; }
    if ((o.type === 'hold' || o.type === 'overwatch') && u.breakT == null) u.breakT = 0;
    if (o.type === 'follow') {
      const leader = this.aliveAllies.find((a) => a.role === 'commander') || this.aliveAllies[0];
      if (!leader || leader === u) { this.completeOrder(u, 'leader lost'); return; }
      const want = leader.x - Math.sign(leader.dir || 1) * 46;
      if (Math.abs(want - u.x) > 54 || Math.abs(leader.y - u.y) > 24) {
        if (!u.path || this.time - (u.lastPathT || 0) > 0.9) {
          const p = findPath(this.level, u.x, u.y, want, leader.y);
          if (p) { u.path = p; u.pathI = 0; u.lastPathT = this.time; }
        }
        this.moveAlongPath(u, dt, 1.15);
      } else {
        u.moving = false;
      }
    }
  }
  if (u.carryId) {
    const ev = this.level.evac;
    if (ev && Math.abs(u.x - ev.x) < 92 && Math.abs(u.y - ev.y) < 30) {
      this.addFeed(`${u.callsign || u.name}: casualty at extraction — dropping`, 'good');
      this.dropCarried(u);
    }
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

  /* ---- casualty recovery: nearby idle soldiers pick up the wounded ---- */
  if (!u.order && !u.moving && !u.carryId && u.hp > u.maxHp * 0.45 && this.time > 4 && !u.recoveringAuto) {
    const enemiesNear = this.enemies.some((e) => !e.dead && Math.abs(e.x - u.x) < 260);
    if (!enemiesNear) {
      const casualty = this.allies.find((a) => a !== u && !a.dead && a.downed && !a.carriedBy &&
        Math.abs(a.x - u.x) < 360 && !this.allies.some((o) => o !== u && o.carryTargetId === a.id));
      if (casualty) {
        u.recoveringAuto = true;
        this.startOrder(u, { type: 'carry', targetId: casualty.id, auto: true });
        this.addFeed(`${u.callsign || u.name}: moving to recover ${casualty.callsign || casualty.name}`);
      }
    }
  }
  if (u.recoveringAuto && !u.order && !u.carryId) u.recoveringAuto = false;

  /* ---- a carrier automatically brings the casualty to extraction ---- */
  if (u.carryId && !u.order) {
    const ev = this.level.evac;
    if (ev && Math.abs(u.x - ev.x) > 60) {
      if (!u.path) {
        const p = findPath(this.level, u.x, u.y, ev.x + (u.x < ev.x ? -34 : 34), ev.y);
        if (p) { u.path = p; u.pathI = 0; u.lastPathT = this.time; }
      }
      this.moveAlongPath(u, dt, 0.85);
    } else {
      u.moving = false;
    }
  }

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
    if ((u.confidence == null) || this.time % 0.5 < 0.05) u.confidence = this.enemyConfidence(u);
    if ((hpRatio < 0.28 || (u.confidence != null && u.confidence < 0.22)) && u.aiState !== 'retreat' && u.aiState !== 'engage' && u.stateT > 0.6) {
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
      const threatX = u.target ? u.target.x : (u.lastSeen ? u.lastSeen.x : null);
      const found = findNearbyCover(this.level, u.x, threatX, 260);
      if (found && Math.abs(found.x - u.x) > 8) {
        u.aiState = 'cover';
        u.coverDest = found;
        const p = findPath(this.level, u.x, found.x);
        if (p && p.length) { u.path = p; u.pathI = 0; }
        else { u.aiState = 'engage'; u.stateT = 1.0; } // retry shortly, never fake a move
      } else if (u.suppression > 75) {
        // no cover at all: controlled fallback instead of standing in the open
        u.aiState = 'retreat';
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
    if (u.aiState === 'search' && u.stateT > 14) { u.aiState = 'patrol'; u.stateT = 0; u.alertPos = null; u.searchPts = null; }
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
    case 'search': {
      u.stance = 'stand';
      if (!u.searchPts || !u.searchPts.length) {
        const c = u.lastSeen || { x: u.x, y: u.y };
        u.searchPts = [
          { x: clamp(c.x + (Math.random() - 0.5) * 150, 30, this.level.width - 30) },
          { x: clamp(c.x + (Math.random() - 0.5) * 280, 30, this.level.width - 30) },
          { x: clamp(c.x + (Math.random() - 0.5) * 120, 30, this.level.width - 30) }
        ];
        u.searchI = 0;
        u.path = null;
      }
      const pt = u.searchPts[u.searchI % u.searchPts.length];
      if (!u.path) {
        const p = findPath(this.level, u.x, u.y, pt.x, this.level.floorAt(pt.x).y);
        if (p) { u.path = p; u.pathI = 0; }
        else u.searchI++;
      } else if (this.moveAlongPath(u, dt, 0.78)) {
        u.path = null;
        u.searchI++;
        u.patrolWait = 1.2 + Math.random() * 1.6;
      }
      if (u.patrolWait > 0) { u.patrolWait -= dt; u.moving = false; }
      u.desiredAim = Math.sin(this.time * 1.7) * 0.7 + (u.dir > 0 ? 0 : Math.PI);
      if (u.stateT > 10) { u.aiState = 'patrol'; u.stateT = 0; u.searchPts = null; }
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
      if (u.tactic === 'flank' && u.path && u.stateT > 0.5) {
        this.moveAlongPath(u, dt, 1.1);
        this.enemyTryFire(u, dt, true);
        break;
      }
      if (u.suppression > 68) {
        // pinned: stay low, return inaccurate fire, do not advance
        u.moving = false;
        u.path = null;
        u.stance = 'crouch';
        this.enemyTryFire(u, dt, false);
        break;
      }
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

/* ---------- noise events: gunfire, explosions, sprinting ---------- */
Battle.prototype.emitNoise = function (x, y, radius, team) {
  this.noise = this.noise || [];
  this.noise.push({ x, y, t: this.time, r: radius || 520, team: team || 'ally' });
  if (this.noise.length > 24) this.noise.shift();
};
Battle.prototype.pruneNoise = function () {
  if (!this.noise) return;
  const cut = this.time - 4;
  this.noise = this.noise.filter((n) => n.t >= cut);
};

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return Math.abs(d);
}

Battle.prototype.enemyConfidence = function (u) {
  let nearby = 0;
  for (const e of this.enemies) {
    if (e === u || e.dead) continue;
    if (Math.abs(e.x - u.x) < 520) nearby++;
  }
  // a warlord steadies only the hostiles within his command radius
  const leader = this.enemies.some((e) => !e.dead && e.enemyType === 'commander' && Math.abs(e.x - u.x) < 560);
  const hp = u.hp / u.maxHp;
  let c = 0.35 + Math.min(0.3, nearby * 0.08) + (leader ? 0.15 : 0) + hp * 0.25;
  if (u.suppression > 50) c -= 0.18;
  return clamp(c, 0, 1);
};

Battle.prototype.enemyPerceive = function (u) {
  if (u.dead) return;
  this.pruneNoise();
  const eye = unitEye(u);
  const range = u.viewRange || 620;
  const facing = u.aimAngle != null ? u.aimAngle : (u.dir > 0 ? 0 : Math.PI);
  let best = null, bestScore = -1e9;
  let sawAny = false;
  for (const a of this.allies) {
    if (a.dead || a.downed) continue;
    const c = unitCenter(a);
    const d = Math.hypot(c.x - eye.x, c.y - eye.y);
    if (d > range) continue;
    const los = lineOfSight(this.level, eye.x, eye.y, c.x, c.y, {});
    if (!los) continue;
    const ang = Math.atan2(c.y - eye.y, c.x - eye.x);
    const inFov = angleDiff(ang, facing) < 1.02 || d < 90;
    // peripheral vision detects slowly; foveal vision detects fast
    const base = inFov ? 0.75 : 0.18;
    const stealth = a.stance === 'prone' ? 0.45 : a.stance === 'crouch' ? 0.72 : 1;
    const score = base * (1 - d / range) * stealth;
    sawAny = true;
    u.awareness = clamp((u.awareness || 0) + (inFov ? 0.5 : 0.14) * stealth, 0, 1);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (!sawAny) u.awareness = clamp((u.awareness || 0) - 0.13, 0, 1);

  // hearing: gunfire and explosions draw attention even through cover
  let heard = null;
  for (const n of this.noise || []) {
    if (n.team === 'enemy') continue;
    const d = Math.hypot(n.x - u.x, (n.y - u.y) * 1.6);
    if (d < n.r) { heard = n; break; }
  }
  if (heard && (!best || u.awareness < 0.6)) {
    u.awareness = clamp((u.awareness || 0) + 0.4, 0, 1);
    u.alertPos = { x: heard.x, y: heard.y };
    u.heardT = this.time;
    if (u.aiState === 'patrol') { u.aiState = 'alert'; u.stateT = 0; }
  }

  // acquire when awareness crosses threshold (close targets are noticed instantly)
  const canAcquire = best && (u.awareness > 0.55 || Math.abs(best.x - u.x) < 130);
  if (canAcquire) {
    if (u.target !== best) u.targetSince = this.time;
    u.target = best;
    u.lastSeen = { x: best.x, y: best.y };
    u.lastSeenT = this.time;
    u.alertPos = { x: best.x, y: best.y };
    if (u.aiState === 'patrol' || u.aiState === 'investigate' || u.aiState === 'alert' || u.aiState === 'search') {
      const wasPassive = u.aiState === 'patrol' || u.aiState === 'investigate' || u.aiState === 'search';
      u.aiState = 'alert';
      if (!wasPassive) u.stateT = 0;
      u.reactT = Math.max(u.reactT || 0, (0.18 + Math.random() * 0.3) * (u.react || 1));
      if (wasPassive && !u.contacted) {
        u.contacted = true;
        this.addFeed(L10N.t('feats.contact') + ' — ' + (u.enemyName || 'hostile') + (Math.abs(best.x - u.x) < 220 ? ' — CLOSE' : ''), 'warn');
      }
    }
  } else if (u.target) {
    const stale = this.time - (u.lastSeenT || 0);
    if (stale > 2.2 || !best) {
      u.target = null;
      // heavy suppression while engaging: hold the engage state so the
      // suppression->cover transition can fire; dropping to patrol here
      // made pinned enemies wander back into the open
      if (u.aiState === 'engage' && u.suppression > 62) {
        if (u.lastSeen) u.aiState = 'search';
        u.stateT = Math.max(u.stateT || 0, 1.3);
      } else if (u.lastSeen) { u.aiState = 'search'; u.searchPts = null; u.stateT = 0; }
      else { u.aiState = 'patrol'; u.stateT = 0; }
      u.path = null;
    }
  }
  if (u.target && u.target.dead) { u.target = null; u.aiState = 'patrol'; u.stateT = 0; }
  // confidence drives aggression and retreat
  u.confidence = this.enemyConfidence(u);
};

Battle.prototype.enemyCoord = function (u) {
  if (u.dead || this.time % 4 > 0.25) return;
  // commander aura: nearby hostiles steady and coordinate
  const boss = this.enemies.find((e) => !e.dead && e.enemyType === 'commander');
  if (boss) {
    for (const e of this.enemies) {
      if (e === boss || e.dead) continue;
      if (Math.abs(e.x - boss.x) < 560) {
        e.commanderBuff = true;
        e.react = Math.max(0.6, e.react * 0.998);
        if (this.time % 4 < 0.2 && e.aiState === 'patrol' && u.alertPos) {
          e.alertPos = { ...u.alertPos };
          e.aiState = 'alert';
          e.stateT = 0;
        }
      } else e.commanderBuff = false;
    }
  }
  // assign tactical roles: heavies pin, fast units flank, rest hold the line
  for (const e of this.enemies) {
    if (e.dead || e.aiState !== 'engage') continue;
    if (e.enemyType === 'heavy' || (e.weaponCfg && /LIGHT MACHINE/.test(e.weaponCfg.cls || ''))) e.tactic = 'suppress';
    else if (e.enemyType === 'flanker' || e.enemyType === 'scout') e.tactic = 'flank';
    else e.tactic = 'line';
  }
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
