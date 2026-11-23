'use strict';
/* ============================================================
   15 — BOOTSTRAP & MAIN LOOP
   ============================================================ */
const App = { scene: 'menu', last: 0, acc: 0, started: false };

function boot() {
  const loaded = Campaign.load();
  if (loaded && Campaign.recoveredFromBackup) {
    setTimeout(() => UI.toast('Save recovered from backup', 'bad'), 800);
  }
  if (!loaded) {
    const ls = storeGet('squadcommander.settings');
    if (ls) Campaign.settings = Object.assign({ ...SETTINGS_DEFAULT }, ls);
  }
  Campaign.settings = Object.assign({ ...SETTINGS_DEFAULT }, Campaign.settings || {});
  Stage.init($('#stage'));
  UI.init();
  try { MenuScene.init(); } catch (e) { console.warn('menu scene failed', e); }
  window.addEventListener('beforeunload', () => { if (!window.__SC_NO_AUTOSAVE) { try { Campaign.save(); } catch (e) { } } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (UI.battle && !UI.battle.result && !UI.battle.paused) UI.battle.setPaused(true);
      if (!window.__SC_NO_AUTOSAVE) Campaign.save();
    }
  });
  window.addEventListener('keydown', onKeyDown);
  if (UI.setFooterVersion) UI.setFooterVersion();
  App.started = true;
  requestAnimationFrame(frame);
}

function updatePerfHud(b) {
  const el = document.getElementById('perf-hud');
  if (!el) return;
  const on = Campaign.settings && Campaign.settings.diagnostics;
  el.style.display = on ? 'block' : 'none';
  if (!on) return;
  const avg = App.ft && App.ft.length ? (App.ft.reduce((a, v) => a + v, 0) / App.ft.length).toFixed(1) : '?';
  const lines = ['FPS ~' + (App.ft && App.ft.length ? Math.round(1000 / Math.max(1, App.ft.reduce((a, v) => a + v, 0) / App.ft.length)) : 0),
    'frame ' + avg + ' ms'];
  if (b) {
    lines.push('units ' + b.units.length, 'AI ' + (b.enemies.filter((e) => !e.dead).length),
      'proj ' + b.projectiles.length, 'fx ' + b.particles.list.length);
  }
  el.textContent = lines.join('\n');
}

function frame(ts) {
  const dt = App.last ? Math.min(0.06, (ts - App.last) / 1000) : 0.016;
  const dms = App.last ? ts - App.last : 16;
  App.last = ts;
  // adaptive quality
  App.ft = App.ft || [];
  App.ft.push(dms);
  if (App.ft.length > 150) {
    const avg = App.ft.reduce((a, b) => a + b, 0) / App.ft.length;
    App.ft.length = 0;
    const q = (UI.battle && UI.battle.level.quality) || Campaign.settings.quality;
    if (avg > 44 && q !== 'low') {
      App.degraded = true;
      window.__SC_LOWQ = true;
      if (UI.battle) { UI.battle.level.quality = 'low'; UI.battle.particles.setQuality('low'); }
      UI.toast('Performance mode: reduced effects', '');
    } else if (avg > 30 && q === 'high') {
      window.__SC_LOWQ = false;
      if (UI.battle) { UI.battle.level.quality = 'medium'; UI.battle.particles.setQuality('medium'); }
    }
  }
  if (App.scene === 'battle' && UI.battle) {
    try {
      UI.battle.update(dt);
      UI.battle.render();
      AudioSys.updateMusic(dt, true);
      updatePerfHud(UI.battle);
    } catch (e) {
      console.error('battle render error', e);
    }
  } else {
    try {
      const ctx = Stage.ctx;
      ctx.setTransform(Stage.dpr, 0, 0, Stage.dpr, 0, 0);
      MenuScene.render(ctx, ts / 1000);
    } catch (e) {
      console.error('menu render error', e);
    }
  }
  requestAnimationFrame(frame);
}

function onKeyDown(e) {
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (App.scene !== 'battle' || !UI.battle || UI.current !== 'battle') {
    if (e.key === 'Escape' && (UI.current === 'settings' || UI.current === 'help')) { UI.goBack(); }
    return;
  }
  const b = UI.battle;
  if (e.key === ' ') {
    e.preventDefault();
    b.setPaused(!b.paused);
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    if ($('#pause').classList.contains('is-active')) b.setPaused(false);
    else b.setPaused(true);
    return;
  }
  if (/^[1-6]$/.test(e.key)) {
    const idx = parseInt(e.key, 10) - 1;
    const a = b.allies[idx];
    if (a) b.select(a.id, e.shiftKey);
    return;
  }
  if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.metaKey) { b.selectAll(); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); b.cam.tx -= 140; b.cam.follow = null; return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); b.cam.tx += 140; b.cam.follow = null; return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); b.cam.ty -= 60; b.cam.follow = null; return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); b.cam.ty += 60; b.cam.follow = null; return; }
  if (e.key === '+' || e.key === '=') { b.cam.zoom = clamp(b.cam.zoom + 0.1, b.cam.minZoom, b.cam.maxZoom); return; }
  if (e.key === '-') { b.cam.zoom = clamp(b.cam.zoom - 0.1, b.cam.minZoom, b.cam.maxZoom); return; }
  const map = {
    r: 'reload', c: 'cover', o: 'overwatch', f: 'focus', x: 'suppress',
    h: 'hold', t: 'retreat', g: 'regroup', m: 'move', e: 'heal',
    q: 'queue', v: 'formation', backspace: 'cancel', delete: 'cancel'
  };
  const cmd = map[e.key.toLowerCase()];
  if (cmd) {
    e.preventDefault();
    UI.onCommand(cmd);
  }
}

/* ---------------- debug / QA hook (not used by gameplay) ---------------- */
window.__SC = {
  get campaign() { return Campaign.data; },
  get battle() { return UI.battle; },
  get scene() { return App.scene; },
  get screen() { return UI.current; },
  version: GAME_VERSION,
  newCampaign(diff = 'veteran') {
    Campaign.newCampaign(diff);
    UI.applySettings(false);
    UI.show('hub');
    return true;
  },
  show(name) { UI.show(name); return true; },
  listMissions() { return MISSIONS.map((m) => ({ id: m.id, name: m.name, type: m.type, region: m.region })); },
  startMission(id, count = 6) {
    if (!Campaign.data) Campaign.newCampaign('veteran');
    const m = MISSIONS_BY_ID[id];
    if (!m) return null;
    Campaign.data.ammo = Math.max(Campaign.data.ammo, 400);
    let pool = Campaign.readyRoster();
    if (pool.length < count) {
      for (const s of Campaign.data.roster) {
        if (s.status === 'dead') continue;
        if (pool.length >= count) break;
        if (!pool.includes(s)) { s.status = 'ready'; s.hp = s.maxHp; s.injuryMissions = 0; pool.push(s); }
      }
    }
    const sel = pool.slice(0, Math.max(1, Math.min(6, count)));
    if (!sel.length) return null;
    UI.startBattle(m, sel.map((s) => s.id));
    return this.state();
  },
  step(seconds = 1) {
    const b = UI.battle;
    if (!b) return null;
    b.paused = false;
    const steps = Math.round(clamp(seconds, 0, 600) * 60);
    for (let i = 0; i < steps; i++) {
      b.update(1 / 60);
      if (b.result) break;
    }
    UI.updateBattleHUD(b, true);
    return this.state();
  },
  pause(p = true) { if (UI.battle) UI.battle.setPaused(p); return true; },
  sandbox(on = true) { if (UI.battle) { UI.battle.sandboxed = !!on; } return UI.battle ? UI.battle.sandboxed : false; },
  resume() { if (UI.battle) UI.battle.setPaused(false); return true; },
  selectAll() { if (UI.battle) UI.battle.selectAll(); return true; },
  selectIds(ids) { const b = UI.battle; if (!b) return false; b.selected.clear(); ids.forEach((i) => b.selected.add(i)); UI.refreshSquadStrip(b); return true; },
  order(kind, x, y, targetId) {
    const b = UI.battle;
    if (!b) return false;
    const target = targetId ? b.units.find((u) => u.id === targetId || u.soldierId === targetId) : null;
    return b.issueOrder(kind, x, y, target);
  },
  findAlly(role) { const b = UI.battle; return b ? b.allies.filter((a) => !role || a.role === role) : []; },
  findEnemy(i = 0) { const b = UI.battle; return b ? b.enemies[i] : null; },
  clearEnemies() {
    const b = UI.battle; if (!b) return false;
    for (const e of b.enemies) if (!e.dead) b.killUnit(e, null);
    return true;
  },
  teleportSelected(x) {
    const b = UI.battle; if (!b) return false;
    for (const u of b.selectedUnits) { u.x = clamp(x, 20, b.level.width - 20); u.y = b.level.surfaceAt(u.x); u.path = null; }
    return true;
  },
  completeObjective(idx) {
    const b = UI.battle; if (!b) return false;
    const o = b.objectives[idx]; if (!o) return false;
    b.completeObjective(o); return true;
  },
  applyDamageToEnemy(dmg) {
    const b = UI.battle; if (!b) return false;
    for (const e of b.enemies) if (!e.dead) b.damageUnit(e, dmg, b.allies[0] ? b.allies[0].id : null, e.x, e.y - 30, {});
    return true;
  },
  state() {
    const b = UI.battle;
    return {
      scene: App.scene, screen: UI.current,
      hasBattle: !!b,
      paused: b ? b.paused : null,
      time: b ? b.time : null,
      mission: b ? b.mission.id : null,
      result: b && b.result ? { success: b.result.success, stars: b.result.stars, reason: b.result.reason } : null,
      objectives: b ? b.objectives.concat(b.optionalObjectives).map((o) => ({ label: o.label, type: o.type, complete: o.complete, failed: o.failed, progress: o.progress, max: o.max, optional: o.optional })) : [],
      allies: b ? b.allies.map((a) => ({ id: a.id, soldierId: a.soldierId, role: a.role, name: a.name, x: a.x, y: a.y, hp: a.hp, mag: a.mag, reserve: a.reserve, dead: a.dead, downed: a.downed, stance: a.stance, anim: a.anim, order: a.order ? a.order.type : null, queue: a.queue.length, suppression: Math.round(a.suppression), kills: a.kills })) : [],
      enemies: b ? b.enemies.filter((e) => !e.dead).map((e) => ({ id: e.id, type: e.type, x: e.x, y: e.y, hp: e.hp, state: e.aiState })) : [],
      projectiles: b ? b.projectiles.length : 0,
      selected: b ? [...b.selected] : [],
      feed: b ? b.feed.slice(-4).map((f) => f.text) : [],
      campaign: Campaign.data ? { credits: Campaign.data.credits, ammo: Campaign.data.ammo, missions: Object.keys(Campaign.data.progress).filter((k) => Campaign.data.progress[k].completed).length, roster: Campaign.data.roster.map((s) => ({ name: s.name, status: s.status, hp: s.hp, xp: s.xp, level: Campaign.levelOf(s) })) } : null
    };
  }
};

boot();
