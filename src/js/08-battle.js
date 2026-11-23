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
    this.customFormation = null;
    this.previewPoint = null;
    this.commandSeq = 0;
    this.ordersIssued = 0;
    this.ordersCompleted = 0;
    this.ordersFailed = 0;
    this.navT = 0;
    this.extractPolicy = mission.extractPolicy || 'all';
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
      let ey = this.level.surfaceAt(x);
      let onPlatform = null;
      for (const p of this.level.platforms) {
        if (x > p.x1 + 30 && x < p.x2 - 30) { onPlatform = p; break; }
      }
      if (onPlatform && (e.tier === 1 || (!e.tier && Math.abs(x - onPlatform.x1 - (onPlatform.x2 - onPlatform.x1) * 0.55) < 110))) {
        if (e.tier === 1 || (e.type === 'sniper' || e.type === 'heavy' || Math.abs(x / W - 0.5) < 0.15)) {
          ey = onPlatform.y;
          x = clamp(x, onPlatform.x1 + 14, onPlatform.x2 - 14);
        }
      }
      const u = createEnemy(e.type, x, ey, this.diff, e.tag);
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
    const f = ['line', 'column', 'wedge', 'defensive', 'custom'];
    const next = f[(f.indexOf(this.formation) + 1) % f.length];
    if (next === 'custom' && !this.customFormation) {
      if (!this.captureCustomFormation()) { this.formation = 'line'; }
    } else {
      this.formation = next;
    }
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
    if (this.feed.length > 36) this.feed.shift();
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

  /* Real 2D, role-aware formation slots resolved to walkable floors. */
  formationSlots(units, wx, wy, threatX) {
    const live = units.filter((u) => !u.dead && !u.downed);
    const n = live.length;
    if (!n) return [];
    const base = this.level.floorAt(wx, wy);
    const sign = threatX != null ? Math.sign(threatX - wx) || 1 : 1;
    const roleDepth = { assault: 34, rifleman: 12, support: -8, commander: -30, medic: -44, sniper: -58 };
    const slots = [];
    const custom = this.formation === 'custom' ? this.customFormation : null;
    if (custom && custom.length) {
      const cx = custom.reduce((s, o) => s + o.dx, 0) / custom.length;
      const cy = custom.reduce((s, o) => s + o.dy, 0) / custom.length;
      for (let i = 0; i < n; i++) {
        const off = custom[i % custom.length];
        const sx = clamp(wx + (off.dx - cx) * sign, 22, this.level.width - 22);
        const sy = clamp((wy + (off.dy - cy)), 0, 2000);
        const fl = this.level.floorAt(sx, sy);
        slots.push({ x: sx, y: fl.y, surface: fl.id, role: live[i].role, tier: fl.tier });
      }
      return slots;
    }
    // role ordering: commander/medic rear, assault front, sniper seeks high ground
    const order = live.map((u, i) => i).sort((a, b) => {
      const score = (u) => u.role === 'assault' ? -2 : u.role === 'commander' ? 2 : u.role === 'medic' ? 3 : u.role === 'sniper' ? 4 : 0;
      return score(live[a]) - score(live[b]);
    });
    for (let k = 0; k < n; k++) {
      const u = live[order[k]];
      let sx, sy, fl;
      if (this.formation === 'column') {
        sx = wx - sign * k * 24;
        fl = this.level.floorAt(sx, wy);
      } else if (this.formation === 'wedge') {
        const depth = Math.ceil(k / 2) * 30;
        sx = wx - sign * depth + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 22;
        fl = this.level.floorAt(sx, wy);
      } else if (this.formation === 'defensive') {
        const ring = [0, -1, 1, -2, 2, -3, 3];
        sx = wx + (ring[k] || 0) * 30;
        fl = this.level.floorAt(sx, wy);
      } else {
        sx = wx + (k - (n - 1) / 2) * 36;
        fl = this.level.floorAt(sx, wy);
      }
      // role depth relative to threat direction
      sx = clamp(sx + sign * (roleDepth[u.role] || 0) * 0.6, 22, this.level.width - 22);
      fl = this.level.floorAt(sx, wy);
      // sniper prefers a nearby walkway if it is meaningfully higher
      if (u.role === 'sniper' || this.formation === 'defensive') {
        let best = null;
        for (const p of this.level.platforms) {
          if (wx < p.x1 - 160 || wx > p.x2 + 160) continue;
          if (p.y > fl.y - 50) continue;
          const d = Math.abs((p.x1 + p.x2) / 2 - wx);
          if (!best || d < best.d) best = { p, d };
        }
        if (best) {
          const px = clamp(wx, best.p.x1 + 20, best.p.x2 - 20);
          fl = { y: best.p.y, id: best.p.id, tier: 1, kind: 'platform' };
          sx = px;
        }
      }
      slots.push({ x: sx, y: fl.y, surface: fl.id, role: u.role, tier: fl.tier });
    }
    return slots;
  }

  captureCustomFormation() {
    const live = this.selectedUnits.filter((u) => !u.dead && !u.downed);
    if (live.length < 2) return false;
    const cx = live.reduce((s, u) => s + u.x, 0) / live.length;
    const cy = live.reduce((s, u) => s + u.y, 0) / live.length;
    this.customFormation = live.map((u) => ({ dx: u.x - cx, dy: u.y - cy }));
    this.formation = 'custom';
    this.addFeed('Custom formation captured');
    AudioSys.ui('confirm');
    UI.refreshCommandDeck(this);
    return true;
  }

  issueOrder(kind, wx, wy, targetUnit) {
    const units = this.selectedUnits;
    if (!units.length) { this.addFeed('No soldiers selected', 'warn'); AudioSys.ui('deny'); return false; }
    if (kind === 'focus' && targetUnit && targetUnit.team !== 'enemy') kind = 'move';
    if (kind === 'heal' && (!targetUnit || targetUnit.team !== 'ally')) {
      this.addFeed('Select a soldier to treat', 'warn'); AudioSys.ui('deny'); return false;
    }
    if (kind === 'carry' && (!targetUnit || targetUnit.team !== 'ally' || !targetUnit.downed)) {
      this.addFeed('Select a downed soldier to carry', 'warn'); AudioSys.ui('deny'); return false;
    }
    const threat = this.enemies.find((e) => !e.dead);
    const slots = this.formationSlots(units, wx, wy, threat ? threat.x : null);
    this.formationPreview = { x: wx, y: wy, slots: slots.slice(), t: 2.2, kind };
    let issued = 0;
    units.forEach((u, i) => {
      const slot = slots[i] || { x: clamp(wx, 22, this.level.width - 22), y: this.level.floorAt(wx, wy).y };
      let order = null;
      switch (kind) {
        case 'move':
        case 'sprint':
          order = { type: kind, x: slot.x, y: slot.y, slot: i };
          break;
        case 'cover': {
          const found = findNearbyCover(this.level, slot.x, threat ? threat.x : null, 460, threat ? threat.y : null, slot.y);
          if (found) order = { type: 'cover', x: found.x, y: found.y, coverId: found.cover.id, slot: i };
          else order = { type: 'move', x: slot.x, y: slot.y, slot: i };
          break;
        }
        case 'overwatch':
          order = { type: 'overwatch', x: wx, y: wy, angle: Math.atan2(wy - u.y, wx - u.x), halfAngle: 0.58 };
          break;
        case 'suppress':
          order = { type: 'suppress', x: wx, y: wy };
          break;
        case 'focus':
          order = { type: 'focus', targetId: targetUnit.id };
          break;
        case 'hold':
          order = { type: 'hold', x: u.x, y: u.y };
          break;
        case 'follow':
          order = { type: 'follow' };
          break;
        case 'reload':
          order = { type: 'reload' };
          break;
        case 'heal':
          order = { type: 'heal', targetId: targetUnit.id };
          break;
        case 'carry':
          order = { type: 'carry', targetId: targetUnit.id };
          break;
        case 'dropcarry':
          order = { type: 'dropcarry' };
          break;
        case 'wait':
          order = { type: 'wait', seconds: 4, untilCalm: false };
          break;
        case 'retreat':
          order = { type: 'retreat', x: this.deployCenter, y: this.level.floorAt(this.deployCenter).y };
          break;
        case 'regroup': {
          const cmd = this.aliveAllies.find((a) => a.role === 'commander') || this.aliveAllies[0];
          const gx = cmd ? cmd.x : this.deployCenter;
          order = { type: 'regroup', x: gx + (slot.x - wx) * 0.5, y: cmd ? cmd.y : this.level.floorAt(gx).y };
          break;
        }
        default: order = null;
      }
      if (!order) return;
      order.stamp = this.time;
      order.mode = kind;
      if (this.pushOrder(u, order)) issued++;
    });
    if (issued) {
      const label = {
        move: 'MOVE', sprint: 'SPRINT', cover: 'TAKE COVER', overwatch: 'OVERWATCH',
        suppress: 'SUPPRESS', focus: 'FOCUS FIRE', hold: 'HOLD', follow: 'FOLLOW',
        reload: 'RELOAD', heal: 'TREAT', retreat: 'RETREAT', regroup: 'REGROUP',
        carry: 'CARRY', dropcarry: 'DROP CASUALTY', wait: 'WAIT'
      }[kind] || kind.toUpperCase();
      this.addFeed(`${label} — ${issued} soldier${issued > 1 ? 's' : ''}`, 'good');
      AudioSys.ui('confirm');
      this.ripples.push({ x: wx, y: wy, t: 0, kind });
      for (const sl of (this.formationPreview ? this.formationPreview.slots : [])) {
        this.ripples.push({ x: sl.x, y: sl.y, t: 0, kind: 'slot' });
      }
      if (['move', 'sprint', 'cover', 'retreat', 'regroup'].includes(kind)) {
        const lead = units.find((u) => !u.dead) || units[0];
        if (lead) { this.cam.follow = lead; this.cam.follow.lookAhead = Math.sign(wx - lead.x) * 90; }
      }
      if (!['focus', 'suppress', 'cover', 'overwatch', 'heal', 'carry'].includes(kind)) this.orderMode = 'move';
      UI.refreshCommandDeck(this);
      return true;
    }
    return false;
  }

  nearestEnemyX(u) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - u.x, (e.y - u.y) * 1.5);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? best.x : null;
  }

  makeCommand(order) {
    const persistent = ['hold', 'follow', 'overwatch', 'suppress', 'focus', 'carry'].includes(order.type);
    return Object.assign({}, order, {
      id: 'cmd' + (++this.commandSeq),
      seq: this.commandSeq,
      state: 'queued',
      persistent,
      reason: null,
      createdAt: this.time,
      startedAt: null,
      timeout: order.timeout || (persistent ? 0 : 0)
    });
  }

  pushOrder(u, order) {
    if (!u || u.dead) return false;
    if (u.downed && order.type !== 'heal') { this.addFeed(`${u.callsign || u.name}: down — cannot take orders`, 'warn'); return false; }
    const cmd = this.makeCommand(order);
    if (this.queueMode && (u.order || u.queue.length)) {
      if (u.queue.length >= 6) { this.addFeed(`${u.callsign || u.name}: queue full (6)`, 'warn'); AudioSys.ui('deny'); return false; }
      u.queue.push(cmd);
      this.ordersIssued++;
      this.addFeed(`${u.callsign || u.name}: ${cmd.type.toUpperCase()} queued (${u.queue.length})`);
      return true;
    }
    // replacing an active order: retire it honestly and release its claims
    if (u.order) {
      const prev = u.order;
      prev.state = 'cancelled';
      prev.reason = 'replaced';
      prev.completedAt = this.time;
      if (prev.coverId) {
        const cov = this.level.covers.find((c) => c.id === prev.coverId);
        if (cov) releaseCover(cov, u.id);
      }
      if (prev.type === 'carry') this.dropCarried(u);
      u.order = null;
    }
    for (const q of u.queue) { q.state = 'cancelled'; q.reason = 'replaced'; }
    u.queue = [];
    this.ordersIssued++;
    return this.startOrder(u, cmd);
  }

  startOrder(u, order) {
    if (!u || u.dead) return false;
    if (u.downed && order.type !== 'heal') {
      order.state = 'failed'; order.reason = 'incapacitated';
      this.ordersFailed++;
      return false;
    }
    if (!order.id) order = this.makeCommand(order);
    const prev = u.order;
    if (prev && prev.coverId && prev.type !== 'cover') {
      const pc = this.level.covers.find((c) => c.id === prev.coverId);
      if (pc) releaseCover(pc, u.id);
    }
    order.state = 'active';
    order.startedAt = this.time;
    u.order = order;
    u.lastCommand = order;
    u.path = null; u.pathI = 0;
    u.holding = false; u.following = false;
    u.overwatch = null; u.suppressAt = null; u.focusId = null;
    u.healKitReserved = false;
    u.sprint = false;
    u.carryId = null;
    u.orderTime = this.time;
    u.interrupt = null;
    switch (order.type) {
      case 'move':
      case 'sprint':
      case 'retreat':
      case 'regroup':
      case 'cover': {
        const p = findPath(this.level, u.x, u.y, order.x, order.y);
        if (p && p.length) { u.path = p; u.pathI = 0; }
        else {
          this.addFeed(`${u.callsign || u.name}: no route to objective`, 'warn');
          this.failOrder(u, order, 'unreachable');
          return false;
        }
        if (order.type === 'sprint' || order.type === 'retreat') u.sprint = true;
        if (order.type === 'cover') {
          u.pendingCover = order.coverId;
          const cov = this.level.covers.find((c) => c.id === order.coverId);
          if (cov) claimCover(cov, u.id);
        }
        break;
      }
      case 'hold':
        u.holding = true;
        u.path = null;
        break;
      case 'follow':
        u.following = true;
        u.path = null;
        break;
      case 'overwatch':
        u.overwatch = { x: order.x, y: order.y, angle: order.angle != null ? order.angle : Math.atan2(order.y - u.y, order.x - u.x), halfAngle: order.halfAngle || 0.58, t: 0 };
        u.holding = true;
        u.path = null;
        break;
      case 'suppress':
        u.suppressAt = { x: order.x, y: order.y, t: 0 };
        u.path = null;
        break;
      case 'focus': {
        const target = this.enemies.find((e) => e.id === order.targetId && !e.dead);
        if (!target) { this.failOrder(u, order, 'target lost'); return false; }
        u.focusId = target.id;
        u.holding = true;
        break;
      }
      case 'reload':
        if (!u.weaponCfg) { this.failOrder(u, order, 'no weapon'); return false; }
        if (u.mag >= u.magSize) { this.completeOrder(u, 'magazine full'); return true; }
        if (u.reserve <= 0) { this.failOrder(u, order, 'no reserve ammo'); return false; }
        this.startReload(u);
        break;
      case 'heal': {
        const target = this.allies.find((a) => a.id === order.targetId && !a.dead);
        if (!target) { this.failOrder(u, order, 'patient lost'); return false; }
        if (!target.downed && target.hp >= target.maxHp) { this.completeOrder(u, 'not wounded'); return true; }
        if (u.medkits <= 0) { this.failOrder(u, order, 'no medical supplies'); return false; }
        u.healTarget = target;
        u.healT = 0;
        if (Math.abs(target.x - u.x) > 34 || Math.abs(target.y - u.y) > 20) {
          const p = findPath(this.level, u.x, u.y, target.x - Math.sign(target.x - u.x || 1) * 24, target.y);
          if (p) { u.path = p; u.pathI = 0; }
        }
        break;
      }
      case 'carry': {
        const target = this.allies.find((a) => a.id === order.targetId && !a.dead);
        if (!target || !target.downed) { this.failOrder(u, order, 'casualty not down'); return false; }
        if (target.carriedBy && target.carriedBy !== u.id) { this.failOrder(u, order, 'already carried'); return false; }
        u.carryTargetId = target.id;
        if (Math.abs(target.x - u.x) > 36 || Math.abs(target.y - u.y) > 24) {
          const p = findPath(this.level, u.x, u.y, target.x + (u.x < target.x ? -22 : 22), target.y);
          if (p) { u.path = p; u.pathI = 0; }
        }
        break;
      }
      case 'dropcarry':
        this.dropCarried(u);
        this.completeOrder(u, 'casualty dropped');
        return true;
      case 'wait':
        u.waitT = order.seconds == null ? 4 : order.seconds;
        u.waitUntilCalm = !!order.untilCalm;
        break;
    }
    return true;
  }

  completeOrder(u, reason) {
    const cmd = u.order;
    if (!cmd) return false;
    cmd.state = 'completed';
    cmd.reason = reason || 'done';
    cmd.completedAt = this.time;
    u.lastCommand = cmd;
    this.ordersCompleted++;
    if (cmd.type === 'heal') { u.healTarget = null; u.healKitReserved = false; }
    if (cmd.type === 'focus') u.focusId = null;
    if (cmd.type === 'overwatch') u.overwatch = null;
    if (cmd.type === 'suppress') u.suppressAt = null;
    if (cmd.type === 'hold') u.holding = false;
    if (cmd.type === 'follow') u.following = false;
    if (cmd.type === 'carry') u.carryTargetId = null;
    u.waitT = 0; u.waitUntilCalm = false;
    u.order = null;
    u.sprint = false;
    u.path = null;
    u.pathI = 0;
    const queued = u.queue.length;
    if (queued) {
      const next = u.queue.shift();
      this.startOrder(u, next);
    }
    if (cmd.type === 'cover' && queued === 0) {
      this.attachCover(u, cmd.coverId);
    }
    UI.refreshCommandDeck(this);
    return true;
  }

  failOrder(u, cmd, reason) {
    if (!cmd) return false;
    cmd.state = 'failed';
    cmd.reason = reason || 'failed';
    cmd.completedAt = this.time;
    u.lastCommand = cmd;
    this.ordersFailed++;
    this.addFeed(`${u.callsign || u.name}: ${cmd.type.toUpperCase()} FAILED — ${reason}`, 'warn');
    AudioSys.ui('deny');
    if (cmd.type === 'focus') u.focusId = null;
    if (cmd.type === 'heal') u.healTarget = null;
    if (cmd.type === 'overwatch') u.overwatch = null;
    if (cmd.type === 'suppress') u.suppressAt = null;
    u.order = null;
    u.waitT = 0; u.waitUntilCalm = false;
    u.path = null; u.pathI = 0; u.sprint = false;
    if (u.queue.length) {
      const next = u.queue.shift();
      this.startOrder(u, next);
    }
    UI.refreshCommandDeck(this);
    return true;
  }

  cancelOrder(u, index) {
    if (index != null && index >= 0) {
      const cmd = u.queue[index];
      if (!cmd) return false;
      cmd.state = 'cancelled';
      cmd.reason = 'cancelled by player';
      u.queue.splice(index, 1);
      this.addFeed(`${u.callsign || u.name}: queued ${cmd.type.toUpperCase()} cancelled`);
      AudioSys.ui('tap');
      UI.refreshCommandDeck(this);
      return true;
    }
    if (u.order) {
      const cmd = u.order;
      cmd.state = 'cancelled';
      cmd.reason = 'cancelled by player';
      cmd.completedAt = this.time;
      u.lastCommand = cmd;
      if (cmd.coverId) {
        const cov = this.level.covers.find((c) => c.id === cmd.coverId);
        if (cov) releaseCover(cov, u.id);
      }
      if (cmd.type === 'carry') this.dropCarried(u);
      u.order = null;
      u.path = null; u.pathI = 0; u.sprint = false;
      u.holding = false; u.following = false;
      u.overwatch = null; u.suppressAt = null; u.focusId = null; u.healTarget = null;
      u.waitT = 0;
      u.interrupt = null;
      this.addFeed(`${u.callsign || u.name}: ${cmd.type.toUpperCase()} cancelled`);
      AudioSys.ui('tap');
    }
    if (u.queue.length) {
      for (const q of u.queue) { q.state = 'cancelled'; q.reason = 'cleared'; }
      u.queue = [];
    }
    UI.refreshCommandDeck(this);
    return true;
  }

  attachCover(u, coverId) {
    const cov = this.level.covers.find((c) => c.id === coverId && !c.dead);
    if (!cov) return false;
    if (Math.abs(cov.x - u.x) > cov.w / 2 + 34 || Math.abs(cov.y - u.y) > 30) return false;
    if (coverExpiry(cov).filter((id) => id !== u.id).length >= 2) return false;
    if (u.coverId && u.coverId !== cov.id) {
      const old = this.level.covers.find((c) => c.id === u.coverId);
      if (old) releaseCover(old, u.id);
    }
    claimCover(cov, u.id, 30);
    u.coverId = cov.id;
    u.assignedCover = cov.id;
    u.stance = 'crouch';
    if (!cov.occupants.includes(u.id)) cov.occupants.push(u.id);
    return true;
  }

  cancelOrders(u) {
    return this.cancelOrder(u, null);
  }

  cancelSelected() {
    const units = this.selectedUnits;
    for (const u of units) this.cancelOrders(u);
    this.addFeed('Orders cancelled');
    AudioSys.ui('tap');
    UI.refreshCommandDeck(this);
  }

  dropCarried(u) {
    if (!u || !u.carryId) return;
    const target = this.allies.find((a) => a.id === u.carryId);
    if (target) {
      target.carriedBy = null;
      target.carried = false;
      const fl = this.level.floorAt(u.x + (u.dir > 0 ? 24 : -24), u.y);
      target.x = clamp(u.x + (u.dir > 0 ? 24 : -24), 20, this.level.width - 20);
      target.y = fl.y;
      target.stance = 'prone';
      target.anim = 'down';
      if (!target.downT || target.downT <= 0) target.downT = 30;
    }
    u.carryId = null;
    u.carryTargetId = null;
    if (u.order && u.order.type === 'carry') this.completeOrder(u, 'casualty dropped');
  }

  startCarry(u, target) {
    if (!u || !target || !target.downed || target.carriedBy) return false;
    u.carryId = target.id;
    target.carriedBy = u.id;
    target.carried = true;
    target.path = null;
    u.stance = 'stand';
    this.addFeed(`${u.callsign || u.name}: carrying ${target.callsign || target.name}`, 'good');
    AudioSys.ui('confirm');
    return true;
  }

  moveAlongPath(u, dt, speedMul = 1) {
    if (!u.path || u.pathI >= u.path.length) { u.moving = false; return true; }
    const tgt = u.path[u.pathI];
    const dx = tgt.x - u.x;
    const dy = tgt.y - u.y;
    if (Math.abs(dx) < 2.4 && Math.abs(dy) < 5) {
      u.pathI++;
      if (u.pathI >= u.path.length) {
        u.path = null; u.moving = false;
        const fl = this.level.floorAt(u.x, u.y);
        u.y = fl.y;
        return true;
      }
      return false;
    }
    let mul = speedMul;
    if (u.stance === 'crouch') mul *= 0.62;
    if (u.carryId) mul *= 0.55;
    if (u.injury === 'light') mul *= 0.92;
    if (u.injury === 'serious') mul *= 0.8;
    if (u.stamina != null && u.stamina < 20) mul *= 0.82;
    const spd = u.speed * mul;
    const step = spd * dt;
    const d = Math.hypot(dx, dy);
    const k = Math.min(1, step / Math.max(0.001, d));
    const nx = clamp(u.x + dx * k, 12, this.level.width - 12);
    const ny = u.y + dy * k;
    u.x = nx; u.y = ny;
    if (Math.abs(dx) > 0.8) u.dir = Math.sign(dx);
    u.moving = true;
    u.vaulting = !!tgt.vault;
    u.onStair = !!(tgt.surface && String(tgt.surface).indexOf('_s') > 0);
    u.walkPhase += Math.min(0.5, Math.abs(dx) / Math.max(10, spd) * 7);
    u.anim = (speedMul > 1.3 || u.sprint) ? 'run' : 'walk';
    if (u.stamina != null) u.stamina = clamp(u.stamina - (speedMul > 1.3 ? 9 : 2.5) * dt, 0, 100);
    return false;
  }

  updateUnitMovement(u, dt) {
    if (!u.order) { u.moving = false; return; }
    const o = u.order;
    switch (o.type) {
      case 'move': {
        if (this.moveAlongPath(u, dt, 1)) this.completeOrder(u, 'arrived');
        break;
      }
      case 'sprint':
      case 'retreat': {
        if (this.moveAlongPath(u, dt, 1.55)) this.completeOrder(u, 'arrived');
        break;
      }
      case 'regroup': {
        if (this.moveAlongPath(u, dt, 1.1)) this.completeOrder(u, 'arrived');
        break;
      }
      case 'cover': {
        if (this.moveAlongPath(u, dt, 1.05)) {
          if (this.attachCover(u, o.coverId)) this.completeOrder(u, 'in cover');
          else {
            const cov = this.level.covers.find((c) => c.id === o.coverId);
            if (!cov || cov.dead) this.failOrder(u, o, 'cover destroyed');
            else this.completeOrder(u, 'cover position reached');
          }
        }
        break;
      }
      case 'heal': {
        const t = u.healTarget;
        if (!t || t.dead) { this.failOrder(u, o, 'patient lost'); break; }
        if (Math.abs(t.x - u.x) > 34 || Math.abs(t.y - u.y) > 22) {
          if (!u.path) {
            const p = findPath(this.level, u.x, u.y, t.x + (u.x < t.x ? -24 : 24), t.y);
            if (p) { u.path = p; u.pathI = 0; }
          }
          if (u.path) this.moveAlongPath(u, dt, 1.1);
        } else {
          u.moving = false;
          u.anim = 'heal';
          u.dir = t.x >= u.x ? 1 : -1;
          this.healTick(u, t, dt);
        }
        break;
      }
      case 'carry': {
        const target = this.allies.find((a) => a.id === u.carryTargetId && !a.dead);
        if (!target || !target.downed) { this.failOrder(u, o, 'casualty lost'); break; }
        if (u.carryId === target.id) { u.moving = false; break; }
        if (Math.abs(target.x - u.x) > 34 || Math.abs(target.y - u.y) > 24) {
          if (!u.path) {
            const p = findPath(this.level, u.x, u.y, target.x + (u.x < target.x ? -22 : 22), target.y);
            if (p) { u.path = p; u.pathI = 0; }
          }
          if (u.path) this.moveAlongPath(u, dt, 1.0);
        } else {
          u.moving = false;
          if (this.startCarry(u, target)) this.completeOrder(u, 'casualty recovered');
        }
        break;
      }
      case 'wait': {
        u.moving = false;
        u.waitT -= dt;
        if (u.waitUntilCalm && u.suppression < 25) this.completeOrder(u, 'calm');
        else if (u.waitT <= 0) this.completeOrder(u, 'waited');
        break;
      }
      case 'reload': {
        u.moving = false;
        if (u.reloadT <= 0) this.completeOrder(u, 'reloaded');
        break;
      }
      default:
        u.moving = false;
    }
  }

  resumeCommand(u) {
    const cmd = u.order;
    if (!cmd || cmd.state !== 'waiting') return;
    cmd.state = 'active';
    const t = cmd.type;
    if (['move', 'sprint', 'retreat', 'regroup', 'cover'].includes(t)) {
      const p = findPath(this.level, u.x, u.y, cmd.x, cmd.y);
      if (p) { u.path = p; u.pathI = 0; } else this.failOrder(u, cmd, 'route lost');
    } else if (t === 'heal' && u.healTarget) {
      const p = findPath(this.level, u.x, u.y, u.healTarget.x, u.healTarget.y);
      if (p) { u.path = p; u.pathI = 0; }
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
    if (this.formationPreview && this.formationPreview.t > 0) this.formationPreview.t -= dt;
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
    this.navT += dt;
    this.level._crowdUnits = this.allies.filter((a) => !a.dead && !a.downed);
    if (this.navT >= 0.25) { updateNavExposure(this.level, this.enemies, this.navT); this.navT = 0; }
    for (const u of this.units) {
      if (u.dead) continue;
      if (u.carried) {
        const carrier = this.units.find((c) => c.id === u.carriedBy && !c.dead && !c.downed);
        if (carrier) { u.x = carrier.x; u.y = carrier.y; u.dir = carrier.dir; u.anim = 'carried'; u.moving = false; }
        else { u.carried = false; u.carriedBy = null; u.anim = 'down'; u.state = 'down'; if (!u.downT || u.downT <= 0) u.downT = 20; }
        continue;
      }
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
        if (u.carriedBy) { u.anim = 'carried'; continue; }
        u.downT -= dt;
        if (u.downT <= 0) this.killUnit(u, null);
        if (u.anim !== 'down') u.anim = 'down';
        continue;
      }
      this.updateInjury(u, dt);
      this.updateMorale(u, dt);
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

  updateInjury(u, dt) {
    if (u.dead || u.downed) return;
    const ratio = u.hp / u.maxHp;
    const was = u.injury;
    u.injury = ratio < 0.3 ? 'serious' : ratio < 0.65 ? 'light' : 'healthy';
    if (u.injury === 'serious') {
      if (!u.bleeding && !u.bleedingTreated) {
        u.bleeding = true;
        if (u.team === 'ally') this.addFeed(`${u.callsign || u.name}: bleeding — treat now`, 'warn');
      }
      if (u.bleeding) {
        u.hp -= 0.5 * dt;
        u.stress = clamp((u.stress || 0) + 1.4 * dt, 0, 100);
        if (u.hp <= 0) { u.hp = 0; this.downUnit(u, u.lastHitBy); return; }
      }
    } else if (u.injury === 'healthy') {
      u.bleeding = false;
    }
    if (was && was !== u.injury && u.team === 'ally' && u.injury !== 'healthy') {
      this.addFeed(`${u.callsign || u.name}: ${u.injury.toUpperCase()} WOUND`, 'warn');
    }
  }

  updateMorale(u, dt) {
    if (u.dead || u.downed) return;
    if (u.stress == null) u.stress = 0;
    let decay = 2.0;
    if (u.coverId) decay += 2;
    if (this.allies.some((a) => a !== u && a.role === 'medic' && !a.dead && !a.downed && Math.abs(a.x - u.x) < 90)) decay += 2;
    if (u.holding || u.overwatch) decay += 0.6;
    u.stress = clamp(u.stress - decay * dt, 0, 100);
    if (u.suppression > 55) u.stress = clamp(u.stress + 7 * dt, 0, 100);
    if (u.bleeding) u.stress = clamp(u.stress + 2.5 * dt, 0, 100);
    const cmd = this.aliveAllies.find((a) => a.role === 'commander');
    const lead = cmd && cmd.skills ? (cmd.skills.leadership || 0) : 0;
    u.morale = clamp(100 - u.stress * 0.82 + lead * 4, 0, 100);
    u.shaken = u.stress > 55;
    u.breaking = u.stress > 82;
    if (u.team === 'ally' && u.breaking && u.morale < 26 && !u.panicked && this.time > (u.panicCd || 0)) {
      u.panicked = true;
      u.panicCd = this.time + 16;
      const cov = findNearbyCover(this.level, u.x, this.enemies.find((e) => !e.dead)?.x, 320, null, u.y);
      let panicOrder;
      if (cov) panicOrder = { type: 'cover', x: cov.x, y: cov.y, coverId: cov.cover.id, auto: true };
      else panicOrder = { type: 'retreat', x: this.deployCenter, y: this.level.floorAt(this.deployCenter).y, auto: true };
      this.addFeed(`${u.callsign || u.name}: BREAKING — falling back`, 'warn');
      this.pushOrder(u, panicOrder);
    }
  }

  addStress(u, amount) {
    if (!u || u.dead || u.downed) return;
    u.stress = clamp((u.stress || 0) + amount, 0, 100);
    u.morale = clamp(100 - u.stress * 0.82, 0, 100);
  }

  onUnitDamaged(u, amount, attacker) {
    if (!u || u.dead) return;
    if (u.team === 'ally') {
      this.addStress(u, Math.min(18, 3 + amount * 0.45));
      const cmd = u.order;
      const emergency = (u.suppression > 62 || (u.hp < u.maxHp * 0.3 && amount > 8)) &&
        cmd && ['move', 'sprint', 'regroup', 'cover', 'reload'].includes(cmd.type);
      if (emergency && !u.interrupt) {
        u.interrupt = { t: 2.0, cmdState: cmd.state, emerging: true };
        cmd.state = 'waiting';
        cmd.reason = 'contact — seeking cover';
        u.path = null; u.pathI = 0;
        this.addFeed(`${u.callsign || u.name}: taking cover — order paused`, 'warn');
      }
      if (cmd && cmd.type === 'reload' && amount > 9 && !u.carryId) {
        this.failOrder(u, cmd, 'interrupted by fire');
      }
    }
  }

  updateNeutralUnit(u, dt) {
    if (u.dead || u.downed) return;
    // neutrals are driven by updateNeutrals(); stance/anim handled there
  }

  separateUnits() {
    const list = this.units.filter((u) => !u.dead && !u.downed);
    const shift = (u, dx) => {
      const oldX = u.x;
      const oldY = u.y;
      u.x = clamp(u.x + dx, 12, this.level.width - 12);
      const f = this.level.floorAt(u.x, oldY);
      if (Math.abs(f.y - oldY) > 38) { u.x = oldX; u.y = oldY; }
      else u.y = f.y;
    };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.carriedBy || b.carriedBy) continue;
        const d = a.x - b.x;
        if (Math.abs(d) < 12 && Math.abs(a.y - b.y) < 20) {
          // soldiers in motion squeeze past stationary allies; only idle
          // pairs and head-on movers get pushed apart. This prevents a
          // moving unit from bulldozing the whole squad down the lane.
          if (a.moving && !b.moving) continue;
          if (b.moving && !a.moving) continue;
          if (a.moving && b.moving && Math.sign(a.dir || 1) === Math.sign(b.dir || 1)) continue;
          const overlap = 12 - Math.abs(d);
          const sign = d >= 0 ? 1 : -1;
          shift(a, overlap * 0.5 * sign);
          shift(b, -overlap * 0.5 * sign);
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
        if (this.orderMode === 'carry') { this.issueOrder('carry', u.x, u.y, u); return; }
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
    if (mode === 'carry') { this.addFeed('Select a downed soldier to carry', 'warn'); AudioSys.ui('deny'); return; }
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
