'use strict';
/* ============================================================
   08 — BATTLE: mission runtime, squad orders, movement
   ============================================================ */
class Battle {
  constructor(mission, deployment, campaign) {
    this.mission = mission;
    this.campaign = campaign;
    this.settings = campaign.settings || Campaign.settings || SETTINGS_DEFAULT;
    this.diff = DIFFICULTIES[campaign.difficulty] || DIFFICULTIES.veteran;
    this.level = buildLevel(mission);
    this.level.quality = (campaign.settings && campaign.settings.quality) || 'high';
    this.id = uid('battle');
    this.startedAt = now();
    this.result = null;
    this.resultShown = false;
    this.paused = false;
    this.speed = 1;
    this.time = 0;
    this.stepAcc = 0;
    this.timeLeft = mission.timeLimit || 9999;
    this.selected = new Set();
    this.orderMode = 'move';
    this.queueMode = false;
    this.formation = 'line';
    this.inspected = null;
    this.allies = [];
    this.enemies = [];
    this.neutrals = [];
    this.projectiles = [];
    this.corpses = [];
    this.particles = new ParticleSystem(420);
    this.particles.setQuality(this.level.quality);
    this.popups = [];
    this.decals = [];
    this.ripples = [];
    this.feed = [];
    this.feedSeq = 0;
    this.stats = {
      shots: 0, hits: 0, kills: 0, damage: 0, alliesDowned: 0, alliesKilled: 0,
      neutralsLost: 0, revives: 0, heals: 0, objectives: 0, startTime: 0, medkitsUsed: 0
    };
    this.waves = (mission.waves || []).map((w) => ({ ...w, spawned: false, done: false }));
    this.hint = '';
    this.hintT = 0;
    this.hurtFlash = 0;
    this.cameraLock = null;
    this.inspectedTimer = 0;
    this.started = true;
    this.weather = 0;
    this.rain = [];
    this.scorch = [];
    this.ended = false;
    this.endDelay = 0;
    this.deployCenter = mission.deploy.x * mission.width;
    this.cam = makeCamera(this.deployCenter, 360);
    CameraUtil.setBounds(this.cam, this.level);
    this.cam.tx = this.deployCenter;
    this.cam.ty = 380;
    this.cam.x = this.deployCenter;
    this.cam.y = 380;
    this.initUnits(deployment);
    this.initObjectives();
    this.weather = (mission.tod === 'night' ? 0.25 : 0.1) + (mission.theme === 'forest' ? 0.5 : mission.theme === 'industrial' ? 0.35 : 0.12);
    if (mission.id === 'm08') this.weather = 1;
    if (mission.id === 'm10') this.weather = 0.75;
    this.baseWeather = this.weather;
    this.initRain();
    this.applyCommanderAura();
    this.addFeed(mission.name + ' — ' + mission.type, 'good');
    this.hint = this.hintFor(mission);
    this.hintT = 8;
    this.cam.follow = null;
    this.selectInitial();
  }

  hintFor(m) {
    switch (m.type) {
      case 'DEFEND': return 'Hold the marked zone. Interlocking fire wins this.';
      case 'SABOTAGE': return 'Stand in the marked ring to plant charges.';
      case 'RESCUE': return 'Reach the marked civilian, then extract together.';
      case 'SEARCH & RESCUE': return 'Reach the pilot and treat her wounds.';
      case 'ESCORT': return 'Your VIP follows the squad. Keep him alive.';
      case 'SURVIVE': return 'Survive the timer. Use cover and watch your ammo.';
      case 'CAPTURE': return 'Hold the highlighted bay until it is secured.';
      case 'EXTRACTION': return 'Free the engineer, then bring her to extraction.';
      case 'DECAPITATION': return 'Kill the warlord. Everything else is optional.';
      default: return 'Tap a soldier, then tap the ground to move. Drag to pan.';
    }
  }

  initUnits(deployment) {
    const slots = this.level.deploySlots;
    const list = (deployment && deployment.length ? deployment : this.campaign.roster.filter((s) => s.status === 'ready')).slice(0, 6);
    list.forEach((soldier, i) => {
      const slot = slots[i % slots.length];
      const u = createAllyFromSoldier(soldier, slot.x, slot.y, i, this.campaign);
      u.battle = this;
      this.allies.push(u);
    });
    // enemy spawns
    const W = this.mission.width;
    for (const e of this.mission.enemies) {
      let x = e.x != null ? e.x * W : 0.6 * W;
      if (e.x > 0 && e.x < 1) x = e.x * W;
      x = clamp(x, 80, W - 80);
      const u = createEnemy(e.type, x, this.level.surfaceAt(x), this.diff, e.tag);
      if (e.tag) u.tag = e.tag;
      u.battle = this;
      if (this.mission.tod === 'night') u.viewRange = (u.viewRange || 600) * 0.85;
      u.homeX = x;
      u.patrolTarget = x + (Math.random() - 0.5) * 160;
      this.enemies.push(u);
    }
    // neutrals
    for (const n of this.level.neutrals) {
      const u = createNeutral(n.role === 'vip' ? (n.down ? 'pilot' : 'vip') : 'hostage', n.x, n.y, n.tag);
      if (n.down) { u.downed = true; u.state = 'down'; u.anim = 'down'; }
      u.battle = this;
      u.objective = n.objective;
      this.neutrals.push(u);
    }
    // ensure an escort VIP exists for protect/escort objectives
    const escortObj = this.mission.objectives.find((o) => o.type === 'protect' || o.type === 'escort');
    if (escortObj && !this.neutrals.some((n) => n.tag === escortObj.tag)) {
      const sx = this.level.deploySlots[3].x;
      const u = createNeutral('vip', sx, this.level.surfaceAt(sx), escortObj.tag);
      u.battle = this;
      u.freed = true;
      u.following = true;
      this.neutrals.push(u);
    }
    if (this.mission.id === 'm11') {
      const v = this.neutrals.find((n) => n.tag === 'vip');
      if (v) v.name = 'ENGINEER';
    }
    this.units = [...this.allies, ...this.enemies, ...this.neutrals];
    for (const u of this.units) this.ensureComponents(u);
  }

  ensureComponents(u) {
    u.battle = this;
    if (u.weaponCfg && u.mag == null) u.mag = u.weaponCfg.mag;
    if (u.magSize == null) u.magSize = u.weaponCfg ? u.weaponCfg.mag : 0;
  }

  applyCommanderAura() {
    const cmd = this.allies.find((a) => a.role === 'commander' && !a.dead);
    const bonus = cmd ? 0.05 + (cmd.skills && cmd.skills.leadership ? cmd.skills.leadership * 0.02 : 0) : 0;
    for (const a of this.allies) {
      a.buffAcc = bonus;
      a.acc = (a.stats ? a.stats.acc : a.acc) * (1 + bonus);
    }
    this.commanderAlive = !!cmd;
  }

  initObjectives() {
    this.objectives = this.mission.objectives.map((def, i) => {
      const o = {
        id: 'obj' + i, def, label: def.label, type: def.type,
        optional: !!def.optional, state: 'active', progress: 0,
        max: def.seconds || 0, complete: false, failed: false, meta: {}
      };
      if (def.type === 'hold' || def.type === 'interact') {
        o.zone = this.level.zones.find((z) => z.objective === def);
        o.max = def.seconds;
      }
      if (def.type === 'rescueUnits') {
        o.perTag = {};
        for (const t of def.tags) o.perTag[t] = 0;
        o.max = def.seconds;
      }
      if (def.type === 'killTarget') {
        o.target = this.enemies.find((e) => e.tag === def.tag) || null;
      }
      return o;
    });
    this.optionalObjectives = (this.mission.optional || []).map((def, i) => ({
      id: 'opt' + i, def, label: def.label, type: def.type, optional: true,
      state: 'active', complete: false, failed: false, progress: 0, max: 0
    }));
    this.objById = {};
    for (const o of this.objectives) this.objById[o.id] = o;
  }

  selectInitial() {
    const cmd = this.allies.find((a) => a.role === 'commander') || this.allies[0];
    if (cmd) this.selected.add(cmd.id);
  }

  get selectedUnits() { return this.allies.filter((a) => this.selected.has(a.id) && !a.dead); }
  get aliveAllies() { return this.allies.filter((a) => !a.dead && !a.downed); }
  get squadSize() { return this.allies.length; }

  select(id, additive = false) {
    if (!additive) this.selected.clear();
    if (this.selected.has(id) && additive) this.selected.delete(id);
    else this.selected.add(id);
    const u = this.allies.find((a) => a.id === id);
    if (u) {
      this.inspected = u;
      AudioSys.ui('tap');
      UI.refreshSelection(this);
    }
  }
  selectAll() {
    this.selected.clear();
    for (const a of this.allies) if (!a.dead) this.selected.add(a.id);
    AudioSys.ui('tap');
    UI.refreshSelection(this);
  }
  clearSelection() { this.selected.clear(); UI.refreshSquadStrip(this); }

  setOrderMode(mode) {
    if (this.result) return;
    this.orderMode = mode;
    if (mode === 'move') this.queueMode = false;
    AudioSys.click();
    UI.refreshCommandDeck(this);
  }
  toggleQueue() { this.queueMode = !this.queueMode; AudioSys.click(); UI.refreshCommandDeck(this); }
  cycleFormation() {
    const f = ['line', 'column', 'wedge', 'defensive'];
    this.formation = f[(f.indexOf(this.formation) + 1) % f.length];
    this.addFeed('Formation: ' + this.formation.toUpperCase());
    AudioSys.ui('confirm');
    UI.refreshCommandDeck(this);
  }

  setSpeed(n) { this.speed = n; AudioSys.click(); UI.refreshCommandDeck(this); }
  setPaused(p) {
    this.paused = p;
    AudioSys.setMusic(true);
    UI.setPaused(this, p);
    if (p) this.addFeed('TACTICAL PAUSE — orders still active');
    AudioSys.ui(p ? 'confirm' : 'tap');
  }

  addFeed(text, cls = '') {
    this.feed.push({ id: ++this.feedSeq, text, cls, time: this.time });
    if (this.feed.length > 42) this.feed.shift();
    if (UI && UI.pushFeed) UI.pushFeed(this, text, cls);
  }

  formationOffsets(n) {
    const out = [];
    const sp = 36;
    for (let i = 0; i < n; i++) {
      if (this.formation === 'column') out.push((i - (n - 1) / 2) * 16);
      else if (this.formation === 'wedge') {
        const k = Math.ceil(i / 2);
        out.push(i === 0 ? 0 : (i % 2 ? -1 : 1) * k * 40);
      } else if (this.formation === 'defensive') {
        const order = [0, -1, 1, -2, 2, -3, 3];
        out.push((order[i] || 0) * 30);
      } else out.push((i - (n - 1) / 2) * sp);
    }
    return out;
  }

  issueOrder(kind, wx, wy, targetUnit) {
    const units = this.selectedUnits;
    if (!units.length) { this.addFeed('No soldiers selected', 'warn'); AudioSys.ui('deny'); return false; }
    if (kind === 'focus' && targetUnit && targetUnit.team !== 'enemy') kind = 'move';
    if (kind === 'heal' && (!targetUnit || targetUnit.team !== 'ally')) {
      this.addFeed('Select a soldier to treat', 'warn'); AudioSys.ui('deny'); return false;
    }
    const offsets = this.formationOffsets(units.length);
    let issued = 0;
    units.forEach((u, i) => {
      let order = null;
      const destX = clamp(wx + (offsets[i] || 0), 24, this.level.width - 24);
      switch (kind) {
        case 'move': order = { type: 'move', x: destX, y: this.level.surfaceAt(destX) }; break;
        case 'sprint': order = { type: 'sprint', x: destX, y: this.level.surfaceAt(destX) }; break;
        case 'cover': {
          const searchX = clamp(wx + (offsets[i] || 0) * 1.1, 40, this.level.width - 40);
          const found = findNearbyCover(this.level, searchX, this.enemies.length ? this.nearestEnemyX(u) : null, 460);
          if (found) { claimCover(found.cover, u.id); order = { type: 'cover', x: found.x, y: found.y, coverId: found.cover.id }; }
          else order = { type: 'move', x: destX, y: this.level.surfaceAt(destX) };
          break;
        }
        case 'overwatch': order = { type: 'overwatch', x: wx, y: wy }; break;
        case 'suppress': order = { type: 'suppress', x: wx, y: wy }; break;
        case 'focus': order = { type: 'focus', targetId: targetUnit.id }; break;
        case 'hold': order = { type: 'hold' }; break;
        case 'follow': order = { type: 'follow' }; break;
        case 'reload': order = { type: 'reload' }; break;
        case 'heal': order = { type: 'heal', targetId: targetUnit.id }; break;
        case 'retreat': order = { type: 'retreat', x: this.deployCenter, y: this.level.surfaceAt(this.deployCenter) }; break;
        case 'regroup': {
          const cmd = this.aliveAllies.find((a) => a.role === 'commander') || this.aliveAllies[0];
          const gx = cmd ? cmd.x : this.deployCenter;
          order = { type: 'regroup', x: clamp(gx + (offsets[i] || 0), 24, this.level.width - 24), y: this.level.surfaceAt(gx) };
          break;
        }
        default: order = null;
      }
      if (!order) return;
      order.stamp = this.time;
      order.mode = kind;
      this.pushOrder(u, order);
      issued++;
    });
    if (issued) {
      const label = {
        move: 'MOVE', sprint: 'SPRINT', cover: 'TAKE COVER', overwatch: 'OVERWATCH',
        suppress: 'SUPPRESS', focus: 'FOCUS FIRE', hold: 'HOLD', follow: 'FOLLOW',
        reload: 'RELOAD', heal: 'TREAT', retreat: 'RETREAT', regroup: 'REGROUP'
      }[kind] || kind.toUpperCase();
      this.addFeed(`${label} — ${issued} soldier${issued > 1 ? 's' : ''}`, 'good');
      AudioSys.ui('confirm');
      this.ripples.push({ x: wx, y: wy, t: 0, kind });
      if (['move', 'sprint', 'cover', 'retreat', 'regroup'].includes(kind)) {
        const lead = units.find((u) => !u.dead) || units[0];
        if (lead) { this.cam.follow = lead; this.cam.follow.lookAhead = Math.sign(wx - lead.x) * 90; }
      }
      if (kind === 'focus' || kind === 'suppress' || kind === 'cover' || kind === 'overwatch') {
        // keep mode armed for repeated use; move mode stays default
      } else if (kind !== 'heal') {
        this.orderMode = 'move';
      }
      UI.refreshCommandDeck(this);
      return true;
    }
    return false;
  }

  nearestEnemyX(u) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - u.x);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.x : null;
  }

  pushOrder(u, order) {
    if (u.dead) return;
    if (this.queueMode && u.order) {
      if (u.queue.length < 4) {
        u.queue.push(order);
        this.addFeed(`${u.callsign || u.name}: order queued (${u.queue.length})`);
      }
      return;
    }
    u.queue = [];
    this.startOrder(u, order);
  }

  startOrder(u, order) {
    if (u.dead || u.downed) { u.order = null; return; }
    u.order = order;
    u.path = null; u.pathI = 0;
    u.holding = false; u.following = false;
    u.overwatch = null; u.suppressAt = null; u.coverId = null;
    u.healKitReserved = false;
    u.orderTime = this.time;
    switch (order.type) {
      case 'move':
      case 'sprint':
      case 'retreat':
      case 'regroup':
      case 'cover': {
        const p = findPath(this.level, u.x, order.x);
        if (p) { u.path = p; u.pathI = 0; }
        else { this.addFeed(`${u.callsign || u.name}: no route`, 'warn'); this.completeOrder(u); }
        if (order.type === 'sprint' || order.type === 'retreat') u.sprint = true;
        if (order.type === 'cover') u.pendingCover = order.coverId;
        break;
      }
      case 'hold':
        u.holding = true;
        u.path = null;
        this.completeOrder(u);
        break;
      case 'follow':
        u.following = true;
        this.completeOrder(u);
        break;
      case 'overwatch':
        u.overwatch = { x: order.x, y: order.y, t: 0 };
        u.holding = true;
        this.completeOrder(u);
        break;
      case 'suppress':
        u.suppressAt = { x: order.x, y: order.y, t: 0 };
        this.completeOrder(u);
        break;
      case 'focus':
        u.focusId = order.targetId;
        u.holding = true;
        this.completeOrder(u);
        break;
      case 'reload':
        this.startReload(u);
        this.completeOrder(u);
        break;
      case 'heal':
        u.healTarget = this.allies.find((a) => a.id === order.targetId && !a.dead) || null;
        if (!u.healTarget) this.completeOrder(u);
        break;
    }
  }

  completeOrder(u) {
    const finished = u.order;
    u.order = null;
    u.sprint = false;
    if (u.queue.length) {
      const next = u.queue.shift();
      this.startOrder(u, next);
    } else {
      u.path = null;
    }
    if (finished && (finished.type === 'move' || finished.type === 'cover' || finished.type === 'regroup' || finished.type === 'retreat')) {
      if (finished.type === 'cover') {
        this.attachCover(u, finished.coverId);
      }
    }
  }

  attachCover(u, coverId) {
    const cov = this.level.covers.find((c) => c.id === coverId && !c.dead);
    if (cov && Math.abs(cov.x - u.x) < cov.w / 2 + 26) {
      u.coverId = cov.id;
      u.stance = 'crouch';
      if (!cov.occupants.includes(u.id)) cov.occupants.push(u.id);
    }
  }

  cancelOrders(u) {
    u.order = null; u.queue = []; u.path = null; u.pathI = 0;
    u.holding = false; u.following = false;
    u.overwatch = null; u.suppressAt = null; u.focusId = null; u.healTarget = null;
  }

  cancelSelected() {
    const units = this.selectedUnits;
    for (const u of units) this.cancelOrders(u);
    this.addFeed('Orders cancelled');
    AudioSys.ui('tap');
    UI.refreshCommandDeck(this);
  }

  moveAlongPath(u, dt, speedMul = 1) {
    if (!u.path || u.pathI >= u.path.length) { u.moving = false; return true; }
    const tgt = u.path[u.pathI];
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    if (Math.abs(dx) < 2.2 && Math.abs(dy) < 12) {
      u.pathI++;
      if (u.pathI >= u.path.length) { u.path = null; u.moving = false; return true; }
      return false;
    }
    const spd = u.speed * speedMul * (u.stance === 'crouch' ? 0.55 : 1) * (u.downed ? 0 : 1);
    const step = spd * dt;
    const len = Math.max(0.001, Math.abs(dx));
    const moveX = Math.sign(dx) * Math.min(len, step);
    u.x = clamp(u.x + moveX, 12, this.level.width - 12);
    u.y = this.level.surfaceAt(u.x);
    if (Math.abs(dx) > 1) u.dir = Math.sign(dx);
    u.moving = true;
    u.walkPhase += Math.min(0.45, Math.abs(moveX) / Math.max(10, spd) * 7);
    u.anim = speedMul > 1.3 ? 'run' : 'walk';
    if (u.stamina != null) u.stamina = clamp(u.stamina - (speedMul > 1.3 ? 9 : 2.5) * dt, 0, 100);
    return false;
  }

  updateUnitMovement(u, dt) {
    if (!u.order) { u.moving = false; return; }
    const o = u.order;
    switch (o.type) {
      case 'move': {
        if (this.moveAlongPath(u, dt, 1)) this.completeOrder(u);
        break;
      }
      case 'sprint':
      case 'retreat': {
        if (this.moveAlongPath(u, dt, 1.55)) this.completeOrder(u);
        break;
      }
      case 'regroup': {
        if (this.moveAlongPath(u, dt, 1.1)) this.completeOrder(u);
        break;
      }
      case 'cover': {
        if (this.moveAlongPath(u, dt, 1.05)) {
          this.attachCover(u, o.coverId);
          this.completeOrder(u);
        }
        break;
      }
      case 'heal': {
        const t = u.healTarget;
        if (!t || t.dead) { u.healTarget = null; this.completeOrder(u); break; }
        if (Math.abs(t.x - u.x) > 34) {
          if (!u.path) {
            const p = findPath(this.level, u.x, t.x + (u.x < t.x ? -24 : 24));
            if (p) { u.path = p; u.pathI = 0; }
          }
          this.moveAlongPath(u, dt, 1.1);
        } else {
          u.moving = false;
          u.anim = 'heal';
          u.dir = t.x >= u.x ? 1 : -1;
          this.healTick(u, t, dt);
        }
        break;
      }
      default:
        u.moving = false;
    }
  }

  update(dtReal) {
    if (this.ended) {
      this.particles.update(dtReal);
      this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dtReal);
      CameraUtil.update(this.cam, dtReal, this.time);
      this.updateRipples(dtReal);
      return;
    }
    const dt = Math.min(dtReal, 0.1);
    if (!this.paused) {
      this.stepAcc += dt * this.speed;
      let steps = 0;
      while (this.stepAcc >= 1 / 60 && steps < 8) {
        this.step(1 / 60);
        this.stepAcc -= 1 / 60;
        steps++;
      }
    }
    CameraUtil.update(this.cam, dt, this.time);
    this.updateRipples(dt);
    if (this.hintT > 0) this.hintT -= dt;
  }

  updateRipples(dt) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      this.ripples[i].t += dt;
      if (this.ripples[i].t > 1.4) this.ripples.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      if (p.t > 1.1) this.popups.splice(i, 1);
    }
  }

  step(dt) {
    if (this.result) return;
    this.time += dt;
    if (this.pendingBooms && this.pendingBooms.length) {
      for (let i = this.pendingBooms.length - 1; i >= 0; i--) {
        const pb = this.pendingBooms[i];
        pb.t -= dt;
        if (pb.t <= 0) {
          this.pendingBooms.splice(i, 1);
          this.explode(pb.x, pb.y, 115, 55, pb.team || 'neutral', pb.ownerId || null);
        }
      }
    }
    if (this.mission.timeLimit) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.failMission('TIME EXPIRED'); return; }
    }
    this.updateWaves(dt);
    for (const u of this.units) {
      if (u.dead) continue;
      u.stateT += dt;
      if (u.suppression > 0) u.suppression = Math.max(0, u.suppression - dt * 9);
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.flash > 0) u.flash -= dt * 5;
      if (u.recoil > 0) u.recoil = Math.max(0, u.recoil - dt * 9);
      if (u.reactT > 0) u.reactT -= dt;
      if (u.invuln > 0) u.invuln -= dt;
      if (u.fireT > 0) u.fireT -= dt;
      if (u.reloadT > 0) {
        u.reloadT -= dt;
        if (u.reloadT <= 0) this.finishReload(u);
      }
      if (u.stamina < 100 && u.anim !== 'run') u.stamina = clamp(u.stamina + dt * 7, 0, 100);
      if (u.downed) {
        u.downT -= dt;
        if (u.downT <= 0) this.killUnit(u, null);
        if (u.anim !== 'down') u.anim = 'down';
        continue;
      }
      if (u.team === 'ally') this.updateAllyUnit(u, dt);
      else if (u.team === 'enemy') this.updateEnemyAI(u, dt);
      else this.updateNeutralUnit(u, dt);
      if (u.anim !== 'dead' && u.anim !== 'down' && u.anim !== 'heal' && !u.moving) {
        if (u.state === 'aim' || u.state === 'fire') u.anim = 'aim';
        else u.anim = 'idle';
      }
      if (u.aimAngle != null) {
        const desired = u.desiredAim != null ? u.desiredAim : (u.dir > 0 ? 0.05 : Math.PI);
        u.aimAngle = lerpAngle(u.aimAngle, desired, Math.min(1, dt * 12));
      }
    }
    this.updateProjectiles(dt);
    this.particles.update(dt);
    this.separateUnits();
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.2);
    this.updateObjectives(dt);
    this.updateNeutrals(dt);
    this.checkSquadStatus();
    this.checkMissionEnd();
    this.decals = this.decals.filter((d) => { d.life -= dt; return d.life > 0; });
    const tension = clamp(0.25 + this.enemies.filter((e) => !e.dead && e.aiState !== 'patrol').length * 0.12, 0, 1);
    AudioSys.setTension(tension);
    if (this.hintT > 0) this.hintT -= dt;
  }

  updateNeutralUnit(u, dt) {
    if (u.dead || u.downed) return;
    // neutrals are driven by updateNeutrals(); stance/anim handled there
  }

  separateUnits() {
    const list = this.units.filter((u) => !u.dead && !u.downed);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const d = a.x - b.x;
        if (Math.abs(d) < 12 && Math.abs(a.y - b.y) < 16) {
          const push = (12 - Math.abs(d)) * 0.4 * (d >= 0 ? 1 : -1) || 3;
          a.x = clamp(a.x + push, 12, this.level.width - 12);
          b.x = clamp(b.x - push, 12, this.level.width - 12);
          a.y = this.level.surfaceAt(a.x);
          b.y = this.level.surfaceAt(b.x);
        }
      }
    }
  }

  updateNeutrals(dt) {
    for (const n of this.neutrals) {
      if (n.dead || n.downed) continue;
      if (n.freed || n.following) {
        const allies = this.aliveAllies;
        if (!allies.length) { n.moving = false; continue; }
        let best = allies[0], bd = 1e9;
        for (const a of allies) { const d = Math.abs(a.x - n.x); if (d < bd) { bd = d; best = a; } }
        if (bd > 42) {
          const targetX = best.x + (n.x < best.x ? -26 : 26);
          if (!n.path) { const p = findPath(this.level, n.x, targetX); if (p) { n.path = p; n.pathI = 0; } }
          this.moveAlongPath(n, dt, 1.0);
        } else {
          n.moving = false; n.anim = 'idle';
        }
        n.dir = best.x > n.x ? 1 : -1;
      } else {
        n.moving = false;
        n.anim = 'idle';
      }
    }
  }

  checkSquadStatus() {
    if (this.sandboxed) return;
    const active = this.allies.filter((a) => !a.dead && !a.downed);
    if (!active.length) {
      if (!this.result) this.failMission('SQUAD WIPED');
    }
  }

  checkMissionEnd() {
    if (this.result || this.sandboxed) return;
    const required = this.objectives.filter((o) => !o.optional);
    for (const o of required) {
      if (o.failed) { this.failMission(o.label.toUpperCase() + ' FAILED'); return; }
    }
    if (required.every((o) => o.complete)) this.succeedMission();
  }

  failMission(reason) {
    if (this.result) return;
    this.result = this.buildResult(false, reason);
    this.finishInternal();
  }
  succeedMission() {
    if (this.result) return;
    this.result = this.buildResult(true, '');
    this.finishInternal();
  }

  buildResult(success, reason) {
    const optionalList = this.optionalObjectives.concat(this.objectives.filter((o) => o.optional).map((o) => ({
      label: o.label, complete: o.complete, failed: o.failed
    })));
    const optionalDone = optionalList.filter((o) => o.complete).length;
    const optionalTotal = optionalList.length;
    let stars = success ? 1 : 0;
    if (success) {
      if (optionalTotal === 0) stars = 3;
      else if (optionalDone === optionalTotal) stars = 3;
      else if (optionalDone > 0) stars = 2;
      let injuries = this.allies.filter((a) => a.downed || (a.hp > 0 && a.hp < a.maxHp * 0.35)).length;
      if (this.stats.alliesKilled === 0 && injuries === 0) stars = Math.max(stars, 3);
      else if (this.stats.alliesKilled === 0 && injuries <= 1) stars = Math.max(stars, 2);
    }
    const totalShots = Math.max(1, this.stats.shots);
    return {
      success, reason, stars,
      time: this.time, timeLimit: this.mission.timeLimit,
      kills: this.stats.kills, shots: this.stats.shots, hits: this.stats.hits,
      accuracy: Math.round((this.stats.hits / totalShots) * 100),
      downed: this.stats.alliesDowned, killed: this.stats.alliesKilled,
      neutralsLost: this.stats.neutralsLost,
      objectives: this.objectives.filter((o) => !o.optional).map((o) => ({ label: o.label, complete: o.complete, failed: o.failed, optional: false })),
      optional: optionalList,
      optionalDone, optionalTotal,
      mission: this.mission,
      soldierResults: this.allies.map((a) => ({
        soldierId: a.soldierId, name: a.name, role: a.role, kills: a.kills,
        damage: Math.round(a.damageDealt), shots: a.shots, hits: a.hits,
        dead: a.dead, downed: a.state === 'down',
        hp: Math.max(0, Math.round(a.hp)), maxHp: a.maxHp, healed: a.healedTotal || 0
      }))
    };
  }

  finishInternal() {
    this.resultShown = false;
    this.endDelay = 1.6;
    this.paused = false;
    this.cam.follow = this.pickFocusUnit();
    AudioSys.setTension(0);
    this.addFeed(this.result.success ? 'MISSION COMPLETE' : 'MISSION FAILED', this.result.success ? 'good' : 'warn');
    if (this.result.success) AudioSys.radio('confirm'); else AudioSys.radio('alarm');
    const self = this;
    setTimeout(() => {
      if (self.result && !self.resultShown) {
        self.resultShown = true;
        self.ended = true;
        if (typeof UI !== 'undefined' && UI.showResults) UI.showResults(self);
      }
    }, 1650);
  }

  pickFocusUnit() {
    const s = this.selectedUnits[0];
    if (s) return s;
    const a = this.aliveAllies[0];
    return a || null;
  }

  tapAt(wx, wy, ev) {
    if (this.result) return;
    const additive = !!(ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey));
    const u = this.pickUnitAt(wx, wy);
    if (u) {
      if (u.team === 'ally') {
        if (this.orderMode === 'heal') { this.issueOrder('heal', u.x, u.y, u); return; }
        this.select(u.id, additive);
        this.inspected = u;
        this.cam.tx = clamp((this.cam.tx + u.x) / 2, this.cam.bounds.minX, this.cam.bounds.maxX);
        UI.refreshSquadStrip(this);
        UI.refreshSelection(this);
        return;
      }
      if (u.team === 'enemy') {
        if (this.orderMode === 'focus') { this.issueOrder('focus', u.x, u.y, u); return; }
        this.inspected = u;
        UI.refreshSelection(this);
        AudioSys.ui('tap');
        return;
      }
      if (u.team === 'neutral') {
        if (this.orderMode === 'heal') { this.addFeed('Civilians cannot be treated by order', 'warn'); AudioSys.ui('deny'); return; }
        this.inspected = u;
        UI.refreshSelection(this);
        return;
      }
    }
    const mode = this.orderMode;
    if (mode === 'focus') { this.addFeed('Select a hostile to focus fire', 'warn'); AudioSys.ui('deny'); return; }
    if (mode === 'heal') { this.addFeed('Select a soldier to treat', 'warn'); AudioSys.ui('deny'); return; }
    this.issueOrder(mode, wx, wy, null);
  }

  pickUnitAt(wx, wy) {
    let best = null, bestD = 34;
    for (const u of this.units) {
      if (u.dead) continue;
      const h = unitHeight(u);
      const cx = u.x, cy = u.y - h / 2;
      const d = Math.hypot(wx - cx, wy - cy);
      if (d < bestD + (u.team === 'ally' ? 6 : 0)) { bestD = d; best = u; }
    }
    return best;
  }

  focusOn(x, y) {
    this.cam.tx = clamp(x, this.cam.bounds.minX, this.cam.bounds.maxX);
    this.cam.ty = clamp(y - 40, this.cam.bounds.minY, this.cam.bounds.maxY);
  }

  updateWaves(dt) {
    for (const w of this.waves) {
      if (w.spawned) continue;
      if (this.time >= w.t) {
        w.spawned = true;
        const side = w.side || 'right';
        const baseX = side === 'right' ? this.level.width - 70 : 70;
        for (let i = 0; i < w.count; i++) {
          const type = w.pool[Math.floor(Math.random() * w.pool.length)];
          const x = clamp(baseX + (i - w.count / 2) * 34 + (Math.random() - 0.5) * 20, 40, this.level.width - 40);
          const u = createEnemy(type, x, this.level.surfaceAt(x), this.diff, null);
          u.battle = this;
          if (this.mission.tod === 'night') u.viewRange = (u.viewRange || 600) * 0.85;
          u.patrolTarget = x - 200;
          u.alertT = 4;
          u.alertPos = { x: this.deployCenter, y: 380 };
          this.enemies.push(u);
          this.units.push(u);
          this.particles.spawn({ x, y: this.level.surfaceAt(x) - 20, life: 0.6, size: 14, kind: 'smoke', color: 'rgba(60,60,50,.4)', vy: -10, grow: 20 });
        }
        this.addFeed('HOSTILES INBOUND — ' + w.count + ' CONTACTS', 'warn');
        AudioSys.radio('alarm');
        this.cam.shake = Math.max(this.cam.shake, 2);
      }
    }
    if (this.waves.every((w) => w.spawned)) this.wavesDone = true;
  }
}
