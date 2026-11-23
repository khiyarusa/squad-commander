'use strict';
/* ============================================================
   14 — BATTLE HUD & RESULTS
   ============================================================ */
const CMD_DEFS = {
  primary: [
    { id: 'move', label: 'MOVE', ico: 'move', hint: 'Move to point' },
    { id: 'hold', label: 'HOLD', ico: 'hold', hint: 'Hold this position' },
    { id: 'cover', label: 'COVER', ico: 'cover', hint: 'Take cover near point' },
    { id: 'overwatch', label: 'WATCH', ico: 'overwatch', hint: 'Overwatch a direction' },
    { id: 'focus', label: 'FOCUS', ico: 'focus', hint: 'Focus fire a target' },
    { id: 'suppress', label: 'SUPPR', ico: 'suppress', hint: 'Suppress an area' }
  ],
  secondary: [
    { id: 'queue', label: 'QUEUE', ico: 'queue', hint: 'Queue orders' },
    { id: 'reload', label: 'RELOAD', ico: 'reload', hint: 'Reload weapons' },
    { id: 'heal', label: 'TREAT', ico: 'heal', hint: 'Treat a soldier' },
    { id: 'carry', label: 'CARRY', ico: 'move', hint: 'Carry a downed soldier' },
    { id: 'retreat', label: 'FALL BK', ico: 'retreat', hint: 'Retreat to deployment' },
    { id: 'regroup', label: 'REGROUP', ico: 'regroup', hint: 'Regroup on commander' },
    { id: 'formation', label: 'LINE', ico: 'grid', hint: 'Cycle formation' },
    { id: 'cancel', label: 'CANCEL', ico: 'cancel', hint: 'Cancel orders' }
  ]
};

Object.assign(UI, {
  _battleEventsBound: false,
  _longPressTimer: null,

  initBattleHUD(battle) {
    this.battle = battle;
    this._cards = {};
    this.current = 'battle';
    this.bindBattleEvents();
    const missionEl = $('#hud-mission');
    if (missionEl) missionEl.textContent = battle.mission.name;
    this.buildCommandDeck(battle);
    this.refreshSquadStrip(battle);
    this.updateBattleHUD(battle, true);
    $('#hud').classList.add('is-active');
    $('#hud-feed').innerHTML = '';
    $('#pause').classList.remove('is-active');
    AudioSys.setTension(0.2);
    this.updatePauseButton(battle);
  },

  bindBattleEvents() {
    if (this._battleEventsBound) return;
    this._battleEventsBound = true;
    const strip = $('#squad-strip');
    const startPress = (e) => {
      const card = e.target.closest('[data-unit]');
      if (!card || !this.battle) return;
      const id = card.dataset.unit;
      clearTimeout(this._longPressTimer);
      this._longPressTimer = setTimeout(() => {
        if (!this.battle) return;
        this.battle.select(id, true);
        card.dataset.longpress = '1';
        AudioSys.ui('tap');
        this.updateBattleHUD(this.battle, true);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 520);
    };
    const endPress = () => clearTimeout(this._longPressTimer);
    // queue chips: drag starts on pointerdown (click would be too late)
    $('#selected-strip').addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('.cmdq-chip[data-qi]');
      if (chip && !e.target.closest('button')) { e.preventDefault(); this.beginQueueDrag(chip); }
    });
    strip.addEventListener('pointerdown', startPress);
    strip.addEventListener('pointerup', endPress);
    strip.addEventListener('pointercancel', endPress);
    strip.addEventListener('pointerleave', endPress);
    $('#selected-strip').addEventListener('click', (e) => {
      if (!this.battle) return;
      if (e.target.closest('[data-all]')) { this.battle.selectAll(); return; }
      if (e.target.closest('[data-form]')) { this.battle.cycleFormation(); return; }
      if (e.target.closest('[data-queue]')) { this.battle.toggleQueue(); return; }
      const cancelQ = e.target.closest('[data-cancel-q]');
      if (cancelQ) {
        const unit = this.battle.selectedUnits[0];
        if (unit) this.battle.cancelOrder(unit, parseInt(cancelQ.dataset.cancelQ, 10));
        return;
      }
      if (e.target.closest('[data-cancel-active]')) {
        const unit = this.battle.selectedUnits[0];
        if (unit) this.battle.cancelOrder(unit, null);
        return;
      }
      if (e.target.closest('[data-drop]')) {
        const unit = this.battle.selectedUnits[0];
        if (unit && unit.carryId) { this.battle.dropCarried(unit); UI.refreshSelection(this.battle); }
        return;
      }

    });
    $('#pause').addEventListener('click', (e) => {
      if (e.target === $('#pause')) { if (this.battle) this.battle.setPaused(false); }
    });
  },

  buildCommandDeck(battle) {
    const mk = (d, secondary) => `<button class="cmd ${secondary ? 'cmd--secondary' : ''}" data-cmd="${d.id}" title="${esc(d.hint)}">${icon(d.ico)}<span class="cl">${esc(L10N.t('battle.' + d.id) !== 'battle.' + d.id ? L10N.t('battle.' + d.id) : d.label)}</span></button>`;
    const p = $('#cmd-primary');
    const s = $('#cmd-secondary');
    if (p) p.innerHTML = CMD_DEFS.primary.map((d) => mk(d)).join('');
    if (s) s.innerHTML = CMD_DEFS.secondary.map((d) => mk(d, true)).join('');
    this.refreshCommandDeck(battle);
  },

  refreshCommandDeck(battle) {
    if (!battle) return;
    $$('.cmd').forEach((el) => {
      const id = el.dataset.cmd;
      el.classList.toggle('is-armed', id === battle.orderMode && ['move', 'cover', 'overwatch', 'focus', 'suppress', 'heal'].includes(id));
      el.classList.toggle('is-queue', id === 'queue' && battle.queueMode);
      if (id === 'formation') {
        const lab = el.querySelector('.cl');
        if (lab) lab.textContent = battle.formation.slice(0, 7).toUpperCase();
      }
      el.classList.toggle('is-armed', id === 'queue' ? battle.queueMode : (id === battle.orderMode && ['move', 'cover', 'overwatch', 'focus', 'suppress', 'heal'].includes(id)));
    });
    $$('[data-speed]').forEach((b) => {
      if (b.dataset.speed === '0') return;
      b.classList.toggle('on', parseInt(b.dataset.speed, 10) === battle.speed);
    });
    this.updatePauseButton(battle);
  },

  updatePauseButton(battle) {
    const b = $('#btn-pause');
    if (!b) return;
    b.innerHTML = icon(battle.paused ? 'play' : 'pause');
    b.classList.toggle('on', battle.paused);
  },

  onCommand(cmd) {
    const b = this.battle;
    if (!b) return;
    if (b.result) return;
    switch (cmd) {
      case 'move':
      case 'cover':
      case 'overwatch':
      case 'focus':
      case 'suppress':
      case 'heal':
      case 'carry':
        if (!b.selectedUnits.length) { this.toast('Select a soldier first', 'bad'); AudioSys.ui('deny'); return; }
        b.setOrderMode(cmd);
        if (cmd === 'heal') this.toast('Tap a soldier to treat');
        else if (cmd === 'carry') this.toast('Tap a downed soldier to carry');
        else if (cmd === 'focus') this.toast('Tap a hostile to focus fire');
        else if (cmd === 'cover') this.toast('Tap a position to take cover');
        else if (cmd === 'overwatch') this.toast('Tap the direction to watch');
        else if (cmd === 'suppress') this.toast('Tap the area to suppress');
        break;
      case 'hold':
        b.issueOrder('hold');
        break;
      case 'queue':
        b.toggleQueue();
        this.toast(b.queueMode ? 'Order queue enabled' : 'Order queue disabled');
        break;
      case 'reload':
        b.issueOrder('reload');
        break;
      case 'retreat':
        b.issueOrder('retreat');
        break;
      case 'regroup':
        b.issueOrder('regroup');
        break;
      case 'formation':
        b.cycleFormation();
        this.toast('Formation: ' + b.formation.toUpperCase());
        break;
      case 'cancel':
        b.cancelSelected();
        break;
    }
    this.refreshCommandDeck(b);
    this.updateBattleHUD(b, true);
  },

  refreshSquadStrip(battle) {
    const strip = $('#squad-strip');
    if (!strip) return;
    this._cards = {};
    strip.innerHTML = battle.allies.map((a, i) => {
      const st = a.dead ? 'KIA' : a.downed ? 'DOWN' : ROLES[a.role].short;
      return `<button class="squad-card ${battle.selected.has(a.id) ? 'is-sel' : ''} ${a.dead ? 'is-dead' : ''} ${a.downed ? 'is-down' : ''}" data-unit="${a.id}">
        <div class="sc-top"><span class="sc-key">${i + 1}</span><span class="sc-nt ${a.downed ? 'hurt' : ''}">${st}</span></div>
        <div class="sc-n">${esc(a.callsign || a.name.split(' ').pop())}</div>
        <div class="sc-r">${ROLES[a.role].label}</div>
        <div class="mini-bars">
          <div class="mb hp"><i style="width:${Math.round(100 * Math.max(0, a.hp) / a.maxHp)}%"></i></div>
          <div class="mb am"><i style="width:${a.magSize ? Math.round(100 * a.mag / a.magSize) : 0}%"></i></div>
        </div>
        <canvas width="92" height="112" data-unit-portrait="${a.id}"></canvas>
        <div class="ord-tag"></div>
      </button>`;
    }).join('');
    for (const a of battle.allies) {
      const cv = strip.querySelector(`[data-unit-portrait="${a.id}"]`);
      if (cv) this.drawSoldierPortrait(cv, a);
    }
    this.updateSquadCards(battle);
  },

  updateSquadCards(battle) {
    if (!battle) return;
    for (const a of battle.allies) {
      const card = $(`.squad-card[data-unit="${a.id}"]`);
      if (!card) continue;
      card.classList.toggle('is-sel', battle.selected.has(a.id));
      card.classList.toggle('is-dead', !!a.dead);
      card.classList.toggle('is-down', !!a.downed);
      const hp = card.querySelector('.mb.hp i');
      if (hp) hp.style.width = Math.round(100 * Math.max(0, a.hp) / a.maxHp) + '%';
      const am = card.querySelector('.mb.am i');
      if (am) am.style.width = (a.magSize ? Math.round(100 * a.mag / a.magSize) : 0) + '%';
      const nt = card.querySelector('.sc-nt');
      if (nt) {
        nt.textContent = a.dead ? 'KIA' : a.downed ? 'DOWN' : ROLES[a.role].short;
        nt.classList.toggle('hurt', !!a.downed || !!a.dead);
      }
      const tag = card.querySelector('.ord-tag');
      if (tag) {
        let t = '';
        if (a.dead) t = '';
        else if (a.downed) t = 'DOWN';
        else if (a.order) t = a.order.type.toUpperCase() + (a.order.state === 'waiting' ? '|PAUSE' : '');
        else if (a.overwatch) t = 'WATCH';
        else if (a.suppressAt) t = 'SUPPR';
        else if (a.reloadT > 0) t = 'RELOAD';
        else if (a.healTarget) t = 'TREAT';
        else if (a.holding) t = 'HOLD';
        if (a.queue.length) t += ' +' + a.queue.length;
        tag.textContent = t;
      }
    }
  },

  refreshSelection(battle) {
    if (!battle) return;
    this.updateSelectedStrip(battle);
    this.updateSquadCards(battle);
    this.refreshCommandDeck(battle);
  },

  updateSelectedStrip(battle) {
    const el = $('#selected-strip');
    if (!el) return;
    const units = battle.selectedUnits;
    const insp = battle.inspected;
    if (!units.length) {
      if (insp && insp.team === 'enemy' && !insp.dead) {
        el.innerHTML = `<div class="ss-name" style="color:var(--danger-2)">${esc(insp.enemyName || 'HOSTILE')}</div>
          <div class="ss-role">${(insp.type || '').toUpperCase()}</div>
          <div class="ss-need">HP ${Math.round(insp.hp)} / ${insp.maxHp} · ${insp.aiState.toUpperCase()} · ${insp.weaponCfg ? insp.weaponCfg.name : ''} · AWARE ${Math.round((insp.awareness || 0) * 100)}%${insp.suppression > 40 ? ' · PINNED' : ''}</div>
          <div class="ss-bars"><button class="btn btn--sm" data-all="1">SELECT SQUAD</button></div>`;
        return;
      }
      el.innerHTML = `<div class="ss-need">No soldier selected — tap a card or a soldier on the field.</div>
        <div class="ss-bars"><button class="btn btn--sm" data-all="1">SELECT ALL</button><button class="btn btn--sm" data-form="1">${battle.formation.toUpperCase()}</button></div>`;
      return;
    }
    if (units.length > 1) {
      const down = units.filter((u) => u.downed).length;
      el.innerHTML = `<div class="ss-name">${units.length} SOLDIERS</div>
        <div class="ss-role">MULTI-SELECTION</div>
        <div class="ss-need">${units.filter((u) => !u.dead).length} combat effective${down ? ' · ' + down + ' down' : ''}</div>
        <div class="ss-bars">
          <button class="btn btn--sm" data-all="1">ALL</button>
          <button class="btn btn--sm" data-form="1">${battle.formation.toUpperCase()}</button>
          <button class="btn btn--sm ${battle.queueMode ? 'btn--primary' : ''}" data-queue="1">QUEUE ${battle.queueMode ? 'ON' : 'OFF'}</button>
        </div>
        ${units.some((x) => x.order || x.queue.length) ? `<div class="cmdq">${units.filter((x) => x.order).map((x) => `<span class="cmdq-chip is-active">${esc((x.callsign || '?').slice(0, 5))}:${x.order.type.toUpperCase()}${x.queue.length ? ' +' + x.queue.length : ''}</span>`).join('')}</div>` : ''}`;
      return;
    }
    const u = units[0];
    const hpPct = Math.round(100 * Math.max(0, u.hp) / u.maxHp);
    const amPct = u.magSize ? Math.round(100 * u.mag / u.magSize) : 0;
    let need = '';
    if (u.downed) need = `DOWN — ${Math.ceil(u.downT)}s TO BLEED OUT — send a medic`;
    else if (u.reloadT > 0) need = 'RELOADING…';
    else if (u.order) need = 'ORDER: ' + u.order.type.toUpperCase() + (u.queue.length ? ` (+${u.queue.length} queued)` : '');
    else if (u.overwatch) need = 'ON OVERWATCH';
    else if (u.suppressAt) need = 'SUPPRESSING';
    else if (u.suppression > 45) need = 'SUPPRESSED — seek cover';
    else need = `${u.holding ? 'HOLDING' : u.moving ? 'MOVING' : 'READY'} · ${u.medkits} MEDKIT${u.medkits === 1 ? '' : 'S'} · ${u.weaponCfg ? u.weaponCfg.name : ''}`;
    const chips = [];
    if (u.order) {
      chips.push(`<span class="cmdq-chip is-active" title="${esc(u.order.reason || '')}">${u.order.type.toUpperCase()}${u.order.state === 'waiting' ? ' · PAUSED' : ''}<button data-cancel-active="1" aria-label="Cancel order">×</button></span>`);
    }
    u.queue.forEach((q, qi) => {
      chips.push(`<span class="cmdq-chip" draggable="true" data-qi="${qi}"><b>${qi + 1}</b>${q.type.toUpperCase()}<button data-cancel-q="${qi}" aria-label="Cancel queued order">×</button></span>`);
    });
    el.innerHTML = `<div class="ss-name">${esc(u.callsign || u.name)}</div>
      <div class="ss-role">${ROLES[u.role].label}${u.isCommander ? ' · CMD' : ''}</div>
      <div class="ss-need">${esc(need)}</div>
      ${chips.length ? `<div class="cmdq">${chips.join('')}</div>` : ''}
      <div class="ss-bars">
        <div class="ssbar hp ${hpPct < 30 ? 'low' : ''}"><div class="lab"><span>HP</span><span>${Math.round(Math.max(0, u.hp))}/${u.maxHp}</span></div><div class="tr"><i style="width:${hpPct}%"></i></div></div>
        <div class="ssbar am"><div class="lab"><span>AMMO</span><span>${u.mag}/${u.reserve}</span></div><div class="tr"><i style="width:${amPct}%"></i></div></div>
        <button class="btn btn--sm" data-all="1">ALL</button>
        <button class="btn btn--sm" data-form="1">${battle.formation.toUpperCase()}</button>
        ${u.carryId ? '<button class="btn btn--sm" data-drop="1">DROP CASUALTY</button>' : ''}
      </div>`;
  },

  /* ---- BUG-09: drag-to-reorder the command queue ---- */
  beginQueueDrag(chip) {
    if (this._qdrag) return;
    const from = parseInt(chip.dataset.qi, 10);
    if (isNaN(from)) return;
    const bar = chip.parentElement;
    const chips = [...bar.querySelectorAll('.cmdq-chip[data-qi]')];
    const rect = chip.getBoundingClientRect();
    const ghost = chip.cloneNode(true);
    ghost.classList.add('is-dragging');
    ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:99;pointer-events:none;opacity:.9`;
    document.body.appendChild(ghost);
    chip.style.opacity = '0.35';
    const move = (ev) => {
      const x = ev.clientX ?? (ev.touches && ev.touches[0].clientX);
      const y = ev.clientY ?? (ev.touches && ev.touches[0].clientY);
      if (x == null) return;
      ghost.style.left = x - rect.width / 2 + 'px';
      ghost.style.top = y - rect.height / 2 + 'px';
      // insertion gap under the pointer
      let gapSet = false;
      for (const el of chips) {
        if (el === chip) continue;
        const r = el.getBoundingClientRect();
        const before = x < r.left + r.width / 2;
        el.style.borderLeft = (!gapSet && before) ? '2px solid var(--accent)' : '';
        if (!gapSet && before) gapSet = true;
      }
      if (!gapSet) chips[chips.length - 1] && (chips[chips.length - 1].style.borderRight = '2px solid var(--accent)');
    };
    const up = (ev) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      ghost.remove();
      const x = ev.clientX ?? (ev.changedTouches && ev.changedTouches[0].clientX);
      let to = chips.length;
      for (let i = 0; i < chips.length; i++) {
        const el = chips[i];
        if (el === chip) continue;
        const r = el.getBoundingClientRect();
        if (x <= r.left + r.width / 2) { to = i > from ? i - 1 : i; break; }
      }
      chips.forEach((el) => { el.style.borderLeft = ''; el.style.borderRight = ''; el.style.opacity = ''; });
      const unit = this.battle && this.battle.selectedUnits[0];
      if (unit && to !== from && to >= 0 && to <= unit.queue.length) {
        const q = unit.queue.splice(from, 1)[0];
        unit.queue.splice(Math.min(to, unit.queue.length), 0, q);
        AudioSys.ui('tap');
        this.refreshSelection(this.battle);
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    this._qdrag = true;
    setTimeout(() => { this._qdrag = false; }, 100);
  },

  updateBattleHUD(battle, force = false) {
    if (!battle || this.battle !== battle) return;
    const t = performance.now();
    if (!force && this._hudT && t - this._hudT < 140) return;
    this._hudT = t;
    const clock = $('#hud-clock');
    if (clock) clock.textContent = fmtTime(battle.time);
    const opt = $('#hud-objtimer');
    if (opt) {
      if (battle.mission.timeLimit) opt.textContent = 'T-' + fmtTime(battle.timeLeft);
      else opt.textContent = '';
      const holdObj = battle.objectives.find((o) => o.type === 'hold' && !o.complete);
      if (holdObj) opt.textContent = 'HOLD ' + fmtTime(holdObj.max - holdObj.progress);
      const surv = battle.objectives.find((o) => o.type === 'survive' && !o.complete);
      if (surv) opt.textContent = 'SURVIVE ' + fmtTime(surv.max - surv.progress);
    }
    const list = $('#hud-objectives');
    if (list) {
      const all = battle.objectives.concat(battle.optionalObjectives);
      list.innerHTML = all.map((o) => {
        let pct = null;
        if (['hold', 'interact', 'rescue', 'rescueUnits', 'survive'].includes(o.type) && o.max) pct = clamp(o.progress / o.max, 0, 1);
        const cls = o.complete ? 'done' : o.failed ? 'failed' : o.optional ? 'opt' : '';
        let detail = '';
        if (o.type === 'extract' && !o.complete) {
          const req = battle.extractRequirement();
          detail = `<span class="obj-detail">${esc(req.detail)}</span>`;
        }
        return `<div class="obj ${cls}">
          <span class="b"></span>
          <span>${esc(o.label)}</span>
          ${detail}
          ${pct != null && !o.complete && !o.failed ? `<span class="pbar"><i style="width:${Math.round(pct * 100)}%"></i></span>` : ''}
        </div>`;
      }).join('');
    }
    this.updateSquadCards(battle);
    this.updateSelectedStrip(battle);
    this.refreshCommandDeck(battle);
    const hint = $('#hud-hint');
    if (hint) {
      if (battle.hintT > 0 && battle.hint && Campaign.settings.hints) {
        hint.textContent = battle.hint;
        hint.style.opacity = '1';
      } else hint.style.opacity = '0';
    }
    this.updatePauseButton(battle);
    const ps = $('#pause-stats');
    if (ps) {
      const alive = battle.aliveAllies.length;
      ps.innerHTML = `<span>EFFECTIVE <b>${alive}/${battle.allies.length}</b></span><span>KILLS <b>${battle.stats.kills}</b></span><span>DOWNED <b>${battle.stats.alliesDowned}</b></span><span>TIME <b>${fmtTime(battle.time)}</b></span>`;
    }
  },

  pushFeed(battle, text, cls = '') {
    if (this.battle !== battle) return;
    const feed = $('#hud-feed');
    if (!feed) return;
    const el = document.createElement('div');
    el.className = 'fl ' + cls;
    el.innerHTML = `<span class="t">${fmtTime(battle.time)}</span>${esc(text)}`;
    feed.appendChild(el);
    while (feed.children.length > 6) feed.removeChild(feed.firstChild);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .6s'; setTimeout(() => el.remove(), 700); }, 7000);
  },

  setPaused(battle, p) {
    if (this.battle !== battle) return;
    const el = $('#pause');
    if (!el) return;
    el.classList.toggle('is-active', !!p);
    this.updatePauseButton(battle);
    const ps = $('#pause-stats');
    if (ps) ps.innerHTML = `<span>EFFECTIVE <b>${battle.aliveAllies.length}/${battle.allies.length}</b></span><span>KILLS <b>${battle.stats.kills}</b></span><span>DOWNED <b>${battle.stats.alliesDowned}</b></span><span>TIME <b>${fmtTime(battle.time)}</b></span>`;
  },

  onPauseAction(act) {
    const b = this.battle;
    if (!b) return;
    if (act === 'resume') { AudioSys.ui('confirm'); b.setPaused(false); return; }
    if (act === 'settings') { this.openSettings(); return; }
    if (act === 'help') { this.openHelp(); return; }
    if (act === 'restart') {
      if (!confirm('Restart this operation from the beginning?')) return;
      AudioSys.ui('confirm');
      const mission = b.mission;
      const ids = b.allies.map((a) => a.soldierId).filter(Boolean);
      this.restartBattle(mission, ids);
      return;
    }
    if (act === 'abort') {
      if (!confirm('Abort the operation? No rewards will be granted.')) return;
      this.abortBattle();
    }
  },

  restartBattle(mission, ids) {
    const soldiers = ids.map((id) => Campaign.data.roster.find((s) => s.id === id)).filter((s) => s && s.status !== 'dead');
    if (!soldiers.length) { this.toast('No soldiers available', 'bad'); return; }
    const b = new Battle(mission, soldiers, Campaign.data);
    this.battle = b;
    this.resultSummary = null;
    $('#pause').classList.remove('is-active');
    this.hideAllScreens();
    $('#hud').classList.add('is-active');
    this.initBattleHUD(b);
    Stage.bind(b.cam, {
      tap: (x, y, ev) => { if (this.battle) this.battle.tapAt(x, y, ev); },
      cameraMoved: () => { if (this.battle) this.battle.cam.follow = null; },
      resize: () => { if (this.battle) { CameraUtil.setBounds(this.battle.cam, this.battle.level); CameraUtil.clamp(this.battle.cam); } },
      blur: () => { if (this.battle && !this.battle.result && !this.battle.paused) this.battle.setPaused(true); },
      sens: Campaign.settings.camSens
    });
    App.scene = 'battle';
    this.updateBattleHUD(b, true);
  },

  abortBattle() {
    this.battle = null;
    App.scene = 'menu';
    Stage.unbind();
    $('#hud').classList.remove('is-active');
    $('#pause').classList.remove('is-active');
    AudioSys.setMusic(false);
    AudioSys.setTension(0);
    this.show('hub');
  },

  hideAllScreens() {
    $$('.screen').forEach((s) => s.classList.remove('is-active'));
  },

  resumeBattleUI() {
    if (!this.battle) { this.show('hub'); return; }
    this.hideAllScreens();
    this.current = 'battle';
    $('#hud').classList.add('is-active');
    App.scene = 'battle';
    if (!this.battle.result) {
      this.battle.paused = true;
      $('#pause').classList.add('is-active');
    }
    this.updateBattleHUD(this.battle, true);
  },

  showResults(battle) {
    if (this.shownResults === battle) return;
    this.shownResults = battle;
    if (!battle.resultApplied) {
      battle.resultApplied = true;
      this.resultSummary = Campaign.applyMissionResult(battle);
    }
    const r = battle.result;
    const m = battle.mission;
    const sum = this.resultSummary || { credits: 0, ammo: 0, med: 0, intel: 0, soldiers: [], promotions: [], injuries: [], deaths: [], achievements: [] };
    this.resultSummary = sum;
    const grade = !r.success ? 'F' : r.stars >= 3 ? 'S' : r.stars === 2 ? 'A' : 'B';
    const stars = r.success ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : '☆☆☆';
    const content = $('#result-content');
    $('#result-kicker').textContent = r.success ? 'OPERATION COMPLETE' : 'OPERATION FAILED';
    $('#result-heading').textContent = m.name;
    $('#result-sub').textContent = `${REGIONS[m.region].name} · ${m.type} · ${DIFFICULTIES[Campaign.data.difficulty].label}`;
    this.setRes('result-resources');
    if (content) {
      content.innerHTML = `
        <div class="result-hero">
          <div class="result-grade ${r.success ? '' : 'fail'}">${grade}</div>
          <div>
            <div class="result-stars">${stars}</div>
            <div class="result-title">${r.success ? 'Mission accomplished' : 'Mission failed'}</div>
            <div class="result-sub">${r.success ? ('Field time ' + fmtTime(r.time) + ' · accuracy ' + r.accuracy + '%') : esc(r.reason || 'Objective not met')}</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div class="result-sub">PAYMENT</div>
            <div style="font-size:30px;font-weight:800;color:var(--accent)">+${fmtNum(sum.credits)} <span style="font-size:13px;color:var(--muted)">CR</span></div>
            <div class="result-sub">AMMO +${sum.ammo} · MED +${sum.med} · INTEL +${sum.intel}</div>
          </div>
        </div>
        <div class="result-grid">
          <div class="panel">
            <h4>Objectives</h4>
            <div class="result-list">
              ${r.objectives.map((o) => `<div class="result-line"><span>${o.optional ? '○ ' : ''}${esc(o.label)}</span><b class="${o.complete ? 'plus' : o.failed ? 'minus' : ''}">${o.complete ? 'COMPLETE' : o.failed ? 'FAILED' : 'INCOMPLETE'}</b></div>`).join('')}
              ${r.optional.map((o) => `<div class="result-line"><span>○ ${esc(o.label)}</span><b class="${o.complete ? 'plus' : 'minus'}">${o.complete ? 'COMPLETE' : 'MISSED'}</b></div>`).join('')}
            </div>
            <h4 style="margin-top:12px">Combat report</h4>
            <div class="result-list">
              <div class="result-line"><span>Hostiles eliminated</span><b>${r.kills}</b></div>
              <div class="result-line"><span>Shots fired / hits</span><b>${r.shots} / ${r.hits} (${r.accuracy}%)</b></div>
              <div class="result-line"><span>Soldiers downed</span><b>${r.downed}</b></div>
              <div class="result-line"><span>Soldiers killed</span><b class="${r.killed ? 'minus' : ''}">${r.killed}</b></div>
              <div class="result-line"><span>Civilians lost</span><b class="${r.neutralsLost ? 'minus' : ''}">${r.neutralsLost}</b></div>
              <div class="result-line"><span>Optional objectives</span><b>${r.optionalDone}/${r.optionalTotal}</b></div>
            </div>
          </div>
          <div class="panel">
            <h4>Squad performance</h4>
            <div class="result-list">
              ${(sum.soldiers || []).map((s) => `<div class="result-line">
                <span>${esc(s.name)} <span style="color:var(--dim)">${ROLES[s.role] ? ROLES[s.role].short : ''}</span></span>
                <b class="${s.dead ? 'minus' : ''}">${s.dead ? 'KIA' : s.downed ? 'DOWNED' : s.kills + ' kills'} · +${s.xp} XP</b>
              </div>`).join('')}
            </div>
            ${(sum.promotions || []).length ? `<h4 style="margin-top:12px">Promotions</h4>${sum.promotions.map((p) => `<div class="result-line"><span>${esc(p.name)}</span><b class="plus">${p.rank}</b></div>`).join('')}` : ''}
            ${(sum.injuries || []).length ? `<h4 style="margin-top:12px">Injuries</h4>${sum.injuries.map((i) => `<div class="result-line"><span>${esc(i.name)}</span><b class="minus">OUT FOR ${i.missions} OP${i.missions > 1 ? 'S' : ''}</b></div>`).join('')}` : ''}
            ${(sum.deaths || []).length ? `<h4 style="margin-top:12px">Killed in action</h4>${sum.deaths.map((d) => `<div class="result-line"><span>${esc(d.name)}</span><b class="minus">GONE</b></div>`).join('')}` : ''}
            ${(sum.achievements || []).length ? `<h4 style="margin-top:12px">Honours</h4>${sum.achievements.map((a) => `<div class="result-line"><span>★ ${esc(a.label)}</span><b class="plus">EARNED</b></div>`).join('')}` : ''}
          </div>
        </div>
        ${sum.unlocked ? `<div class="panel" style="margin-top:12px;border-left:2px solid var(--accent)"><h4>New operation unlocked</h4><div class="result-title" style="font-size:24px">${esc(sum.unlocked.name)}</div><div class="result-sub">${esc(sum.unlocked.type)} · ${REGIONS[sum.unlocked.region].name}</div></div>` : ''}
        ${r.success && Campaign.allMissionsComplete() ? `<div class="panel" style="margin-top:12px;border-left:2px solid var(--accent)"><h4>Campaign complete</h4><div class="result-title" style="font-size:24px">THE VALLEY IS QUIET</div><div class="result-note">Twelve operations. Every objective. The militia is broken. Task Force Nightjar stands relieved.</div></div>` : ''}
      `;
    }
    const footer = $('#result-footer');
    if (footer) footer.textContent = r.success ? 'Debrief filed. Squad recovered to base.' : 'Debrief filed. Reorganise and try again.';
    const retry = $('#btn-result-retry');
    if (retry) retry.style.display = 'inline-flex';
    this.show('results');
    AudioSys.setMusic(false);
    AudioSys.setTension(0);
    if (r.success && typeof AudioSys === 'object') AudioSys.ui('confirm');
  }
});
