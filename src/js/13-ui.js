'use strict';
/* ============================================================
   13 — UI CORE: screens, hub, briefing, barracks, arsenal
   ============================================================ */
const UI = {
  setFooterVersion() { const el = document.getElementById('footer-version'); if (el) el.textContent = 'SQUAD COMMANDER v' + GAME_VERSION + ' — offline build'; },
  current: 'menu',
  backScreen: 'menu',
  battle: null,
  fromBattle: false,
  briefMission: null,
  deployment: [],
  profileId: null,
  newDifficulty: 'veteran',
  resultSummary: null,
  shownResults: null,
  _toastId: 0,
  _hudT: 0,
  _cards: {},

  init() {
    this.bindGlobal();
    this.bindMenu();
    this.bindSettings();
    this.applySettings(false);
    this.renderMenu();
    this.show('menu');
    this.updateHUDLoop();
  },

  bindGlobal() {
    const unlock = () => AudioSys.unlock();
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', () => AudioSys.unlock(), { once: true });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('dragstart', (e) => e.preventDefault());
  },

  /* ---------------- helpers ---------------- */
  resChips() {
    const d = Campaign.data;
    if (!d) return '';
    return `
      <div class="res">${icon('credit')}<span>CR</span><b>${fmtNum(d.credits)}</b></div>
      <div class="res">${icon('ammo')}<span>AMMO</span><b>${fmtNum(d.ammo)}</b></div>
      <div class="res">${icon('medkit')}<span>MED</span><b>${fmtNum(d.med)}</b></div>
      <div class="res">${icon('intel')}<span>INTEL</span><b>${fmtNum(d.intel)}</b></div>
      <div class="res">${icon('shield')}<span>${DIFFICULTIES[d.difficulty] ? DIFFICULTIES[d.difficulty].label : 'VETERAN'}</span><b></b></div>`;
  },
  setRes(id) {
    const el = $('#' + id);
    if (el) el.innerHTML = this.resChips();
  },
  toast(text, kind = '') {
    const wrap = $('#toasts');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    // coalesce identical consecutive notifications (combat spam)
    const last = wrap.lastElementChild;
    if (last && last.textContent === text) { last.dataset.n = (+last.dataset.n || 1) + 1; last.textContent = text + (last.dataset.n > 1 ? ' ×' + last.dataset.n : ''); return; }
    wrap.appendChild(el);
    const life = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 2600);
    el._life = life;
    el.addEventListener('click', () => { clearTimeout(el._life); el.remove(); });
    // severity-aware cap: a critical toast never evicts another critical one —
    // the oldest informational toast goes first
    const sev = (el2) => (el2.classList.contains('bad') ? 2 : el2.classList.contains('warn') ? 1 : 0);
    while (wrap.children.length > 3) {
      let victim = wrap.firstElementChild, vs = sev(victim);
      for (const child of wrap.children) { const s2 = sev(child); if (s2 < vs) { victim = child; vs = s2; } }
      clearTimeout(victim._life); victim.remove();
    }
  },
  show(name) {
    if (typeof App !== 'undefined' && App.scene === 'battle' && name !== 'results' && name !== 'settings' && name !== 'help') {
      App.scene = 'menu';
      Stage.unbind();
    }
    $$('.screen').forEach((s) => s.classList.remove('is-active'));
    const el = $('#screen-' + name);
    if (el) el.classList.add('is-active');
    this.current = name;
    if (!['settings', 'help'].includes(name)) this.backScreen = name;
    if (name !== 'results') this.fromBattle = (name === 'settings' || name === 'help') && this.fromBattle;
    if (name !== 'settings' && name !== 'help') this.fromBattle = false;
    $('#hud').classList.toggle('is-active', false);
    if (name === 'menu') this.renderMenu();
    if (name === 'hub') this.renderHub();
    if (name === 'barracks') this.renderBarracks();
    if (name === 'arsenal') this.renderArsenal();
    if (name === 'stats') this.renderStats();
    if (name === 'recruit') this.renderRecruit();
    if (name === 'newgame') this.renderNewGame();
    if (name === 'settings') this.renderSettings();
    if (name === 'briefing') this.renderBriefing();
    if (name === 'profile') this.renderProfile();
    this.setRes('settings-resources');
    this.setRes('stats-resources');
    this.setRes('barracks-resources');
    this.setRes('arsenal-resources');
    this.setRes('hub-resources');
    this.setRes('recruit-resources');
    this.setRes('brief-resources');
    this.setRes('profile-resources');
    this.setRes('result-resources');
    this.setRes('newgame-resources');
    AudioSys.ensure = true;
  },

  openSettings() {
    if (this.battle && !this.battle.result && !this.battle.paused) this.battle.setPaused(true);
    this.fromBattle = !!this.battle && !this.battle.result;
    this.backScreen = this.fromBattle ? 'battle' : this.current;
    this.renderSettings();
    this.show('settings');
    $('#pause').classList.remove('is-active');
  },
  openHelp() {
    if (this.battle && !this.battle.result && !this.battle.paused) this.battle.setPaused(true);
    this.fromBattle = !!this.battle && !this.battle.result;
    this.backScreen = this.fromBattle ? 'battle' : this.current;
    this.show('help');
  },
  goBack() {
    if (this.backScreen === 'battle' && this.battle) {
      this.resumeBattleUI();
      return;
    }
    this.show(this.backScreen || 'menu');
  },

  /* ---------------- menu ---------------- */
  bindMenu() {
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { AudioSys.click(); this.show(nav.dataset.nav); return; }
      const act = e.target.closest('[data-act]');
      if (act) {
        AudioSys.click();
        const a = act.dataset.act;
        if (a === 'continue') {
          if (Campaign.data) this.show('hub');
          else this.show('newgame');
        } else if (a === 'new') { this.renderNewGame(); this.show('newgame'); }
        else if (a === 'barracks') {
          if (Campaign.data) this.show('barracks'); else this.show('newgame');
        } else if (a === 'settings') this.openSettings();
        else if (a === 'help') this.openHelp();
        else if (a === 'menu') this.show('menu');
        else if (a === 'stats') this.show('stats');
        else if (a === 'credits') this.show('credits');
        return;
      }
      const pauseAct = e.target.closest('[data-pause-act]');
      if (pauseAct) { this.onPauseAction(pauseAct.dataset.pauseAct); return; }
      const speed = e.target.closest('[data-speed]');
      if (speed) {
        if (!this.battle) return;
        const s = parseInt(speed.dataset.speed, 10);
        if (s === 0) this.battle.setPaused(!this.battle.paused);
        else { this.battle.setSpeed(s); if (this.battle.paused) this.battle.setPaused(false); }
        return;
      }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd) { this.onCommand(cmd.dataset.cmd); return; }
      const miss = e.target.closest('[data-mission]');
      if (miss) {
        const m = MISSIONS_BY_ID[miss.dataset.mission];
        if (!m) return;
        const st = Campaign.missionStatus(m.id);
        if (st === 'locked') { AudioSys.ui('deny'); return; }
        this.openBriefing(m.id);
        return;
      }
      const dep = e.target.closest('[data-deploy-id]');
      if (dep) { this.toggleDeployment(dep.dataset.deployId); return; }
      const supply = e.target.closest('[data-supply]');
      if (supply) {
        const r = Campaign.resupply(supply.dataset.supply);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Supply delivered', 'good'); this.refreshRes(); this.renderArsenal(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Not enough credits', 'bad'); }
        return;
      }
      const upg = e.target.closest('[data-upgrade]');
      if (upg) {
        const [weapon, upgrade] = upg.dataset.upgrade.split(':');
        const r = Campaign.buyUpgrade(weapon, upgrade);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Upgrade installed', 'good'); this.renderArsenal(); this.refreshRes(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Unavailable', 'bad'); }
        return;
      }
      const skill = e.target.closest('[data-skill]');
      if (skill) {
        const r = Campaign.upgradeSkill(this.profileId, skill.dataset.skill);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Specialisation improved', 'good'); this.renderProfile(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Cannot upgrade', 'bad'); }
        return;
      }
      const armor = e.target.closest('[data-buy-armor]');
      if (armor) {
        const r = Campaign.buyArmor(this.profileId);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Armour upgraded', 'good'); this.renderProfile(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Unavailable', 'bad'); }
        return;
      }
      const prof = e.target.closest('[data-profile]');
      if (prof) {
        this.profileId = prof.dataset.profile;
        this.show('profile');
        return;
      }
      const rec = e.target.closest('[data-recruit]');
      if (rec) {
        const r = Campaign.recruit(rec.dataset.recruit);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Soldier enlisted: ' + r.soldier.name, 'good'); this.renderRecruit(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Cannot recruit', 'bad'); }
        return;
      }
      const all = e.target.closest('[data-all]');
      if (all && this.battle) { this.battle.selectAll(); return; }
      const formBtn = e.target.closest('[data-form]');
      if (formBtn && this.battle) { this.battle.cycleFormation(); return; }
      const card = e.target.closest('[data-unit]');
      if (card && this.battle) {
        const id = card.dataset.unit;
        if (card.dataset.longpress === '1') { card.dataset.longpress = '0'; return; }
        this.battle.select(id, false);
        return;
      }
      const diff = e.target.closest('[data-diff]');
      if (diff) {
        this.newDifficulty = diff.dataset.diff;
        AudioSys.ui('tap');
        this.renderNewGame();
        return;
      }
    });
    $('#btn-start-campaign').addEventListener('click', () => {
      AudioSys.unlock();
      if (Campaign.data && !confirm('This will erase the current campaign. Continue?')) return;
      Campaign.newCampaign(this.newDifficulty);
      this.applySettings(false);
      AudioSys.ui('confirm');
      this.show('hub');
      this.toast('Task force deployed', 'good');
    });
  },
  renderMenu() {
    const d = Campaign.data;
    const save = $('#mm-save');
    if (save) {
      if (d) {
        const done = MISSIONS.filter((m) => d.progress[m.id] && d.progress[m.id].completed).length;
        const next = MISSIONS.find((m) => d.progress[m.id] && d.progress[m.id].status === 'available' && !d.progress[m.id].completed);
        const region = next ? REGIONS[next.region] : null;
        save.innerHTML = `
          <div class="mm-row"><span class="k">${L10N.t('menu.campaign')}</span><span class="v">${done}/${MISSIONS.length}</span></div>
          ${next ? `<div class="mm-name">${esc(next.name)}${region ? ' · ' + esc(region.name || '') : ''}</div>` : ''}
          <div class="mm-row"><span class="k">${L10N.t('menu.ready')}</span><span class="v">${Campaign.readyRoster().length}</span></div>
          <div class="mm-row"><span class="k">${L10N.t('menu.credits2')}</span><span class="v">${fmtNum(d.credits)}</span></div>`;
      } else {
        save.innerHTML = `<div class="mm-empty">${esc(L10N.t('menu.nosave'))}</div>`;
      }
    }
    const cont = $('[data-act="continue"]');
    if (cont) cont.disabled = false;
const build = $('#menu-build');
    if (build) build.textContent = 'BUILD ' + GAME_VERSION;
  },
  renderNewGame() {
    const wrap = $('#difficulty-cards');
    if (wrap) {
      wrap.innerHTML = Object.entries(DIFFICULTIES).map(([k, d]) => `
        <button class="panel diff-card ${this.newDifficulty === k ? 'is-active' : ''}" data-diff="${k}" style="text-align:left;cursor:pointer;border-color:${this.newDifficulty === k ? 'var(--accent)' : 'var(--line)'}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:0;color:${this.newDifficulty === k ? 'var(--accent)' : 'var(--olive)'}">${d.label}</h4>
            ${this.newDifficulty === k ? '<span class="badge badge--accent">SELECTED</span>' : ''}
          </div>
          <p class="result-note" style="margin:6px 0 0">${esc(d.desc)}</p>
          <div class="weapon-stats" style="margin-top:8px">
            <div class="wstat"><span>ENEMY ACC</span><b>${Math.round(d.enemyAcc * 100)}%</b></div>
            <div class="wstat"><span>REACTION</span><b>${d.enemyReact.toFixed(2)}×</b></div>
            <div class="wstat"><span>COORDINATION</span><b>${d.enemyCoord.toFixed(2)}×</b></div>
            <div class="wstat"><span>REWARDS</span><b>${Math.round(d.reward * 100)}%</b></div>
          </div>
        </button>`).join('');
    }
    this.setRes('newgame-resources');
  },

  /* ---------------- hub ---------------- */
  renderHub() {
    const d = Campaign.data;
    if (!d) { this.show('menu'); return; }
    this.setRes('hub-resources');
    const grid = $('#region-grid');
    if (grid) {
      grid.innerHTML = REGIONS.map((r, ri) => {
        const missions = REGION_MISSIONS[ri];
        return `<div class="region-col">
          <div class="region-head">
            <div><h3>${r.name}</h3><div class="mtype" style="font-size:9px;color:var(--dim);letter-spacing:.2em">${r.sub}</div></div>
            <div class="threat">${ri === 0 ? 'THREAT I–III' : ri === 1 ? 'THREAT III–IV' : 'THREAT IV–V'}</div>
          </div>
          <div class="region-list">
            ${missions.map((m) => this.missionCard(m)).join('')}
          </div>
        </div>`;
      }).join('');
    }
    const roster = $('#hub-roster');
    if (roster) {
      roster.innerHTML = d.roster.map((s) => `
        <button class="mini-soldier ${s.status === 'dead' ? 'is-dead' : s.status === 'injured' ? 'is-hurt' : ''}" data-profile="${s.id}">
          <canvas data-portrait="${s.id}" width="56" height="56"></canvas>
          <div><b>${esc(s.callsign || s.name)}</b><br>${ROLES[s.role].short} · ${s.status === 'dead' ? 'KIA' : s.status === 'injured' ? 'INJURED' : 'READY'}</div>
        </button>`).join('');
      d.roster.forEach((s) => {
        const cv = roster.querySelector(`[data-portrait="${s.id}"]`);
        if (cv) this.drawSoldierPortrait(cv, s);
      });
    }
    const notes = $('#hub-notes');
    if (notes) {
      const alive = Campaign.aliveRoster();
      const ready = Campaign.readyRoster();
      const last = d.log[d.log.length - 1];
      const next = MISSIONS.find((m) => d.progress[m.id] && d.progress[m.id].status === 'available');
      notes.innerHTML = `
        <div class="intel-line"><span>ACTIVE SOLDIERS</span><b>${alive.length} / 10</b></div>
        <div class="intel-line"><span>READY FOR TASKING</span><b>${ready.length}</b></div>
        <div class="intel-line"><span>MEDICAL SUPPLIES</span><b>${d.med}</b></div>
        <div class="intel-line"><span>NEXT OPERATION</span><b>${next ? next.name : (Campaign.allMissionsComplete() ? 'CAMPAIGN COMPLETE' : 'NONE')}</b></div>
        <div class="intel-line"><span>LAST OPERATION</span><b>${last ? esc(last.mission) + (last.success ? ' ✓' : ' ✗') : '—'}</b></div>
        <p style="margin:8px 0 0;color:var(--dim)">${next ? esc(next.brief) : 'All twelve operations are complete. You may replay any mission to improve ratings.'}</p>`;
    }
    const foot = $('#hub-footer-info');
    if (foot) {
      const done = MISSIONS.filter((m) => d.progress[m.id] && d.progress[m.id].completed).length;
      foot.textContent = `CAMPAIGN PROGRESS ${done} / ${MISSIONS.length} · ${DIFFICULTIES[d.difficulty] ? DIFFICULTIES[d.difficulty].label : ''}`;
    }
    const sub = $('#hub-sub');
    if (sub) sub.textContent = 'Task Force Nightjar — ' + (Campaign.allMissionsComplete() ? L10N.t('hub.secured') : L10N.t('hub.ready'));
  },
  missionCard(m) {
    const d = Campaign.data;
    const p = d.progress[m.id] || {};
    const locked = !p.completed && p.status === 'locked';
    const done = !!p.completed;
    const stars = '★★★'.slice(0, p.stars || 0) + '☆☆☆'.slice(0, 3 - (p.stars || 0));
    return `<button class="mission-card ${locked ? 'is-locked' : ''} ${done ? 'is-done' : ''}" data-mission="${m.id}" ${locked ? 'disabled' : ''}>
      <div class="mnum">${String(MISSION_INDEX[m.id] + 1).padStart(2, '0')}</div>
      <div>
        <div class="mname">${locked ? '▮▮▮▮▮▮' : esc(m.name)}</div>
        <div class="mtype">${m.type} · ${m.theme.toUpperCase()}${locked ? ' · LOCKED' : ''}</div>
      </div>
      <div class="mstars">${locked ? icon('lock') : (done ? stars : '▸')}</div>
    </button>`;
  },
  refreshRes() {
    this.setRes('hub-resources'); this.setRes('barracks-resources'); this.setRes('arsenal-resources');
    this.setRes('stats-resources'); this.setRes('recruit-resources'); this.setRes('brief-resources');
    this.setRes('profile-resources'); this.setRes('result-resources'); this.setRes('settings-resources');
  },

  /* ---------------- briefing ---------------- */
  openBriefing(id) {
    const m = MISSIONS_BY_ID[id];
    if (!m) return;
    this.briefMission = m;
    const ready = Campaign.readyRoster();
    this.deployment = ready.slice(0, 6).map((s) => s.id);
    this.renderBriefing();
    this.show('briefing');
  },
  renderBriefing() {
    const m = this.briefMission;
    if (!m) return;
    const d = Campaign.data;
    if (!d) { this.show('menu'); return; }
    const region = REGIONS[m.region];
    $('#brief-kicker').textContent = `OPERATION ${String(MISSION_INDEX[m.id] + 1).padStart(2, '0')} — ${region.name}`;
    $('#brief-heading').textContent = m.name;
    $('#brief-sub').textContent = `${m.type} · ${m.theme.toUpperCase()} · ${m.tod.toUpperCase()}`;
    this.setRes('brief-resources');
    const enemyCounts = {};
    for (const e of m.enemies) enemyCounts[e.type] = (enemyCounts[e.type] || 0) + 1;
    const waveCount = (m.waves || []).reduce((a, w) => a + w.count, 0);
    const totalEnemies = m.enemies.length + waveCount;
    const content = $('#brief-content');
    if (content) {
      content.innerHTML = `
        <div class="panel">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <h4 style="margin:0 0 4px">${region.name} · ${region.sub}</h4>
              <div class="brief-title">${esc(m.name)}</div>
            </div>
            <div style="text-align:right">
              <div class="badge badge--danger">THREAT ${romanish(m.threat)}</div>
              <div class="badge" style="margin-top:4px">${esc(m.type)}</div>
            </div>
          </div>
          <div class="brief-meta">
            <span class="badge">${icon('clock')} ${fmtTime(m.timeLimit)} LIMIT</span>
            <span class="badge">${icon('target')} ${totalEnemies} HOSTILES</span>
            <span class="badge">${icon('map')} ${(m.width / 1000).toFixed(1)} KM</span>
            <span class="badge badge--accent">PAR ${fmtTime(m.par)}</span>
          </div>
          <p class="result-note" style="margin:0">${esc(m.brief)}</p>
        </div>
        <div class="panel">
          <h4>Primary objectives</h4>
          <ul class="obj-list">
            ${m.objectives.filter((o) => !o.optional).map((o) => `<li><span class="box"></span><span>${esc(o.label)}${o.seconds ? ` <span style="color:var(--dim)">(${o.seconds}s)</span>` : ''}</span></li>`).join('')}
          </ul>
          ${(m.optional || []).length ? `<h4 style="margin-top:12px">Optional</h4>
          <ul class="obj-list">
            ${(m.optional || []).map((o) => `<li class="opt"><span class="box"></span><span>${esc(o.label)}</span></li>`).join('')}
            ${m.objectives.filter((o) => o.optional).map((o) => `<li class="opt"><span class="box"></span><span>${esc(o.label)}</span></li>`).join('')}
          </ul>` : ''}
        </div>
        <div class="panel">
          <h4>Intelligence</h4>
          <p class="result-note" style="margin:0 0 8px">${esc(m.intel)}</p>
          <div class="intel-line"><span>ENEMY COMPOSITION</span><b>${Object.entries(enemyCounts).map(([k, v]) => ENEMIES[k].label + ' ×' + v).join(', ') || 'NONE'}</b></div>
          <div class="intel-line"><span>REINFORCEMENTS</span><b>${waveCount ? waveCount + ' hostiles in ' + m.waves.length + ' waves' : 'NONE CONFIRMED'}</b></div>
          <div class="intel-line"><span>TERRAIN</span><b>${m.theme === 'urban' ? 'RUBBLE STREETS / TERRACES' : m.theme === 'forest' ? 'PINE RIDGES / CLEARINGS' : 'FOUNDRY YARDS / GANTRIES'}</b></div>
          <div class="intel-line"><span>EXTRACTION</span><b>${m.objectives.some((o) => o.type === 'extract') ? 'REQUIRED' : 'NOT REQUIRED'}</b></div>
        </div>
        <div class="panel">
          <h4>Payment on success</h4>
          <div class="intel-line"><span>CREDITS</span><b>${fmtNum((m.rewards && m.rewards.credits) || 0)} cr</b></div>
          <div class="intel-line"><span>AMMUNITION</span><b>+${(m.rewards && m.rewards.ammo) || 0}</b></div>
          <div class="intel-line"><span>MEDICAL / INTEL</span><b>+${(m.rewards && m.rewards.med) || 0} / +${(m.rewards && m.rewards.intel) || 0}</b></div>
        </div>`;
    }
    this.renderDeployment();
    const btn = $('#btn-deploy');
    if (btn) btn.disabled = this.deployment.length === 0;
  },
  renderDeployment() {
    const wrap = $('#brief-squad');
    if (!wrap) return;
    const d = Campaign.data;
    const ready = Campaign.readyRoster();
    const others = d.roster.filter((s) => s.status !== 'ready');
    const rows = [];
    for (const s of ready) {
      const sel = this.deployment.includes(s.id);
      rows.push(`<button class="deploy-row ${sel ? 'is-sel' : ''}" data-deploy-id="${s.id}">
        <span class="check">✓</span>
        <canvas data-portrait="${s.id}" width="72" height="72"></canvas>
        <div><div class="dname">${esc(s.name)}</div><div class="drole">${ROLES[s.role].label} · ${Campaign.rankName(s)} · ${WEAPONS[s.weapon].name}</div>
        <div class="hpbar"><i style="width:${Math.round(100 * s.hp / s.maxHp)}%"></i></div></div>
        <div style="text-align:right"><div class="drole">LV ${Campaign.levelOf(s)}</div><div class="drole">${s.kills || 0} KILLS</div></div>
      </button>`);
    }
    for (const s of others) {
      rows.push(`<button class="deploy-row is-unavailable" disabled>
        <span class="check"></span>
        <canvas data-portrait="${s.id}" width="72" height="72"></canvas>
        <div><div class="dname">${esc(s.name)}</div><div class="drole">${s.status === 'dead' ? 'KILLED IN ACTION' : 'RECOVERING — ' + s.injuryMissions + ' OP'}</div></div>
        <div style="text-align:right"><div class="drole">${ROLES[s.role].short}</div></div>
      </button>`);
    }
    wrap.innerHTML = rows.join('') || '<div class="result-note">No soldiers are ready. Recruit replacements in the barracks.</div>';
    d.roster.forEach((s) => {
      const cv = wrap.querySelector(`[data-portrait="${s.id}"]`);
      if (cv) this.drawSoldierPortrait(cv, s);
    });
    const count = $('#brief-count');
    if (count) count.textContent = `${this.deployment.length} / 6`;
    const cost = $('#brief-cost');
    if (cost) cost.textContent = 'AMMO COST ' + Campaign.deployCost(this.deployment.length);
    const eta = $('#brief-eta');
    if (eta) eta.textContent = d.ammo + ' AMMO AVAILABLE';
    const btn = $('#btn-deploy');
    if (btn) btn.disabled = this.deployment.length === 0 || d.ammo < Campaign.deployCost(this.deployment.length);
  },
  toggleDeployment(id) {
    const idx = this.deployment.indexOf(id);
    if (idx >= 0) this.deployment.splice(idx, 1);
    else if (this.deployment.length < 6) this.deployment.push(id);
    else { this.toast('Maximum six soldiers', 'bad'); AudioSys.ui('deny'); return; }
    AudioSys.ui('tap');
    this.renderDeployment();
  },

  startBattle(mission, soldierIds) {
    const d = Campaign.data;
    const soldiers = soldierIds.map((id) => d.roster.find((s) => s.id === id)).filter((s) => s && s.status === 'ready');
    if (!soldiers.length) { this.toast('No ready soldiers', 'bad'); return; }
    const cost = Campaign.deployCost(soldiers.length);
    if (d.ammo < cost) { this.toast('Insufficient ammunition resupply', 'bad'); AudioSys.ui('deny'); return; }
    d.ammo -= cost;
    Campaign.save();
    AudioSys.unlock();
    const battle = new Battle(mission, soldiers, d);
    this.battle = battle;
    this.deployment = soldierIds.slice();
    App.scene = 'battle';
    $$('.screen').forEach((s) => s.classList.remove('is-active'));
    $('#pause').classList.remove('is-active');
    $('#hud').classList.add('is-active');
    this.initBattleHUD(battle);
    Stage.bind(battle.cam, {
      tap: (x, y, ev) => { if (this.battle) this.battle.tapAt(x, y, ev); },
      cameraMoved: () => { if (this.battle) this.battle.cam.follow = null; },
      resize: () => { if (this.battle) { CameraUtil.setBounds(this.battle.cam, this.battle.level); CameraUtil.clamp(this.battle.cam); } },
      blur: () => { if (this.battle && !this.battle.result && !this.battle.paused) this.battle.setPaused(true); },
      sens: (Campaign.settings.camSens || 1)
    });
    battle.cam.follow = null;
    this.toast('Operation ' + mission.name + ' — deployed', 'good');
    AudioSys.setMusic(true);
    AudioSys.setAmbientTheme(mission.theme, battle.weather > 0.3);
    this.updateBattleHUD(battle, true);
  },

  /* ---------------- barracks ---------------- */
  renderBarracks() {
    const d = Campaign.data;
    if (!d) { this.show('menu'); return; }
    const grid = $('#barracks-grid');
    if (!grid) return;
    grid.innerHTML = d.roster.map((s) => {
      const st = s.status;
      const xpNext = xpForNext(s.xp || 0);
      const xpPct = xpNext ? clamp(((s.xp || 0) - RANKS[Campaign.ranks(s)].xp) / Math.max(1, xpNext - RANKS[Campaign.ranks(s)].xp), 0, 1) : 1;
      const status = st === 'dead' ? L10N.t('bar.dead') : st === 'injured' ? L10N.t('bar.injured') + ' ' + s.injuryMissions : L10N.t('bar.ready');
      return `<button class="soldier-card ${st === 'dead' ? 'is-dead' : st === 'injured' ? 'is-injured' : ''}" data-profile="${s.id}">
        <span class="corner-tag">${esc(status)}</span>
        <canvas class="portrait" data-portrait="${s.id}" width="124" height="148"></canvas>
        <div class="sc-body">
          <div class="sc-name">${esc(s.name)}</div>
          <div class="sc-role">${esc(L10N.t('role.' + s.role))}</div>
          <div class="sc-rank">${Campaign.rankName(s)} · LV ${Campaign.levelOf(s)} · ${esc(s.callsign || '')}</div>
          <div class="bar xp"><i style="width:${Math.round(xpPct * 100)}%"></i></div>
          <div class="bar hp"><i style="width:${Math.round(100 * (st === 'dead' ? 0 : s.hp) / s.maxHp)}%;background:${st === 'injured' ? 'var(--danger)' : 'var(--ok)'}"></i></div>
          <div class="sc-foot"><span>${s.kills || 0} ${L10N.t('res.squad') === 'وضعیت گروه' ? 'شکار' : 'KILLS'}</span><span>${s.missions || 0} ${L10N.t('res.squad') === 'وضعیت گروه' ? 'عملیات' : 'OPS'}</span></div>
        </div>
      </button>`;
    }).join('');
    d.roster.forEach((s) => {
      const cv = grid.querySelector(`[data-portrait="${s.id}"]`);
      if (cv) this.drawSoldierPortrait(cv, s);
    });
  },

  renderRecruit() {
    const d = Campaign.data;
    if (!d) return;
    Campaign.ensureRecruits();
    const grid = $('#recruit-grid');
    if (!grid) return;
    const alive = Campaign.aliveRoster().length;
    grid.innerHTML = d.recruits.map((c) => {
      const stats = soldierStats(c, d);
      const can = d.credits >= c.cost && alive < 10;
      return `<div class="soldier-card">
        <canvas class="portrait" data-portrait="${c.id}" width="124" height="148"></canvas>
        <div class="sc-body">
          <div class="sc-name">${esc(c.name)}</div>
          <div class="sc-role">${ROLES[c.role].label} · ${WEAPONS[c.weapon].name}</div>
          <div class="sc-rank">${RANKS[Campaign.ranks(c)].name} · ${c.xp} XP</div>
          <div class="weapon-stats" style="margin-top:6px">
            <div class="wstat"><span>HEALTH</span><b>${stats.maxHp}</b></div>
            <div class="wstat"><span>ACCURACY</span><b>${Math.round(stats.acc * 100)}</b></div>
          </div>
          <div class="sc-foot" style="align-items:center;margin-top:8px">
            <span style="color:var(--accent)">${fmtNum(c.cost)} CR</span>
            <button class="btn btn--sm ${can ? 'btn--primary' : ''}" data-recruit="${c.id}" ${can ? '' : 'disabled'}>Sign</button>
          </div>
        </div>
      </div>`;
    }).join('');
    d.recruits.forEach((c) => {
      const cv = grid.querySelector(`[data-portrait="${c.id}"]`);
      if (cv) this.drawSoldierPortrait(cv, c);
    });
  },

  renderProfile() {
    const d = Campaign.data;
    const s = d && d.roster.find((x) => x.id === this.profileId);
    if (!s) { this.show('barracks'); return; }
    const stats = soldierStats(s, d);
    $('#profile-heading').textContent = s.name;
    $('#profile-sub').textContent = `${ROLES[s.role].label} · ${Campaign.rankName(s)} · ${s.status === 'dead' ? 'KILLED IN ACTION' : s.status === 'injured' ? 'RECOVERING' : 'READY FOR TASKING'}`;
    this.setRes('profile-resources');
    const points = Campaign.skillPoints(s);
    const content = $('#profile-content');
    if (!content) return;
    if (s.status === 'dead') {
      content.innerHTML = `<div class="panel" style="max-width:640px;margin:0 auto">
        <h4>Memorial record</h4>
        <div class="brief-title">${esc(s.name)}</div>
        <p class="result-note">Killed in action during the campaign. ${s.kills || 0} confirmed kills across ${s.missions || 0} operations.</p>
        <div class="intel-line"><span>ROLE</span><b>${ROLES[s.role].label}</b></div>
        <div class="intel-line"><span>FINAL RANK</span><b>${Campaign.rankName(s)}</b></div>
      </div>`;
      $('#profile-points').textContent = '';
      return;
    }
    content.innerHTML = `
      <div class="profile-grid">
        <div class="profile-hero">
          <canvas data-bigportrait="${s.id}" width="560" height="380"></canvas>
          <div class="profile-name">${esc(s.name)}</div>
          <div class="profile-role">${ROLES[s.role].label} · ${esc(s.callsign || '')}</div>
          <div class="intel-line" style="margin-top:6px"><span>RANK</span><b>${Campaign.rankName(s)} (LV ${Campaign.levelOf(s)})</b></div>
          <div class="intel-line"><span>EXPERIENCE</span><b>${s.xp || 0} XP</b></div>
          <div class="intel-line"><span>ARMOUR</span><b>${ARMOR_LEVELS[(s.armor || 1) - 1].label}</b></div>
          <button class="btn btn--sm" data-buy-armor="1" style="margin-top:8px" ${ (s.armor || 1) >= 3 ? 'disabled' : ''}>
            ${ (s.armor || 1) >= 3 ? 'ARMOUR MAXED' : 'UPGRADE ARMOUR — ' + fmtNum(ARMOR_LEVELS[(s.armor || 1)].cost) + ' cr'}
          </button>
          <div style="margin-top:auto">
            <div class="stat-row"><span>HEALTH</span><div class="track"><i style="width:${Math.round(100 * s.hp / s.maxHp)}%"></i></div><b>${Math.round(s.hp)}/${s.maxHp}</b></div>
            <div class="stat-row"><span>ACCURACY</span><div class="track"><i style="width:${Math.min(100, stats.acc * 78)}%"></i></div><b>${Math.round(stats.acc * 100)}</b></div>
            <div class="stat-row"><span>MOBILITY</span><div class="track"><i style="width:${Math.min(100, stats.speed)}%"></i></div><b>${Math.round(stats.speed)}</b></div>
            <div class="stat-row"><span>REACTION</span><div class="track"><i style="width:${Math.min(100, stats.react * 85)}%"></i></div><b>${stats.react.toFixed(2)}</b></div>
            <div class="stat-row"><span>SUPP. RESIST</span><div class="track"><i style="width:${Math.round(stats.suppressionResist * 100)}%"></i></div><b>${Math.round(stats.suppressionResist * 100)}%</b></div>
          </div>
        </div>
        <div>
          <div class="panel">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h4 style="margin:0">Specialisations</h4>
              <span class="badge ${points > 0 ? 'badge--accent' : ''}">${points} POINT${points === 1 ? '' : 'S'}</span>
            </div>
            <div class="skill-grid" style="margin-top:8px">
              ${SKILL_ORDER.map((k) => {
                const sk = SKILLS[k];
                const lvl = (s.skills && s.skills[k]) || 0;
                const can = points > 0 && lvl < sk.max;
                return `<button class="skill ${lvl >= sk.max ? 'locked' : ''} ${can ? 'can-up' : ''}" data-skill="${k}" ${can ? '' : 'disabled'}>
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span class="sk-name">${sk.label}</span>
                    <span class="sk-cost">${lvl}/${sk.max}</span>
                  </div>
                  <div class="sk-desc">${sk.desc}</div>
                  <div class="pips">${Array.from({ length: sk.max }).map((_, i) => `<i class="${i < lvl ? 'on' : (i === lvl && can ? 'next' : '')}"></i>`).join('')}</div>
                </button>`;
              }).join('')}
            </div>
          </div>
          <div class="panel">
            <h4>Loadout</h4>
            <div class="equip-row">
              <div><div class="lab">PRIMARY WEAPON</div><div class="val">${WEAPONS[s.weapon].name} <span style="color:var(--dim);font-size:11px">(${WEAPONS[s.weapon].cls})</span></div></div>
              <select class="sel" id="sel-weapon">
                ${ROLES[s.role].allowed.map((wid) => `<option value="${wid}" ${s.weapon === wid ? 'selected' : ''}>${WEAPONS[wid].name}</option>`).join('')}
              </select>
            </div>
            <div class="equip-row"><div><div class="lab">AMMUNITION RESERVE</div><div class="val">${WEAPONS[s.weapon].mag} round magazine · ${WEAPONS[s.weapon].reserveMax || WEAPONS[s.weapon].mag * 5} reserve</div></div><span class="badge">${WEAPONS[s.weapon].cls}</span></div>
            <div class="equip-row"><div><div class="lab">ARMOUR</div><div class="val">${ARMOR_LEVELS[(s.armor || 1) - 1].label}</div></div><span class="badge">${Math.round(stats.armorRed * 100)}% DR</span></div>
            <div class="equip-row"><div><div class="lab">MEDKITS</div><div class="val">${s.role === 'medic' ? '4 field kits' : '1 field kit'}</div></div><span class="badge">${s.role === 'medic' ? 'MEDIC' : 'BASIC'}</span></div>
          </div>
          <div class="panel">
            <h4>Service history</h4>
            <ul class="history-list">
              ${(s.history || []).slice().reverse().map((h) => `<li><span>${esc(h.mission)}</span><b>${h.success ? '✓' : '✗'} · ${h.kills} kills · +${h.xp} XP</b></li>`).join('') || '<li><span>No operations yet</span><b>—</b></li>'}
            </ul>
          </div>
        </div>
      </div>`;
    const big = content.querySelector('[data-bigportrait]');
    if (big) this.drawSoldierPortrait(big, s, { big: true });
    $('#profile-points').textContent = points > 0 ? `${points} skill point${points === 1 ? '' : 's'} available` : 'No unspent skill points';
    const sel = $('#sel-weapon');
    if (sel) {
      sel.addEventListener('change', () => {
        const r = Campaign.assignWeapon(s.id, sel.value);
        if (r.ok) { AudioSys.ui('confirm'); this.toast('Weapon assigned: ' + WEAPONS[sel.value].name, 'good'); this.renderProfile(); }
        else { AudioSys.ui('deny'); this.toast(r.msg || 'Cannot assign', 'bad'); }
      });
    }
  },

  drawSoldierPortrait(canvas, soldier, opts = {}) {
    if (!canvas) return;
    try {
      const h = canvas.height, w = canvas.width;
      const proxy = {
        id: soldier.id || soldier.name, name: soldier.name, team: opts.team || 'ally',
        role: soldier.role, type: soldier.type, weapon: soldier.weapon,
        tag: soldier.tag, stance: 'stand', anim: 'idle', state: 'alive', dir: 1,
        aimAngle: opts.aimAngle != null ? opts.aimAngle : 0.3,
        walkPhase: 0, flash: 0, recoil: 0, hitFlash: 0
      };
      const c = canvas.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h * 0.34, 4, w / 2, h * 0.55, w * 0.9);
      g.addColorStop(0, 'rgba(142,154,94,.20)');
      g.addColorStop(1, 'rgba(8,10,7,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const scale = opts.big ? h / 78 : h / 80;
      c.save();
      c.translate(w / 2, h * 0.97);
      Art.drawUnit(c, proxy, 0, { scale, shadow: false });
      c.restore();
    } catch (e) { /* ignore portrait errors */ }
  },

  /* ---------------- arsenal ---------------- */
  renderArsenal() {
    const d = Campaign.data;
    if (!d) { this.show('menu'); return; }
    this.setRes('arsenal-resources');
    const grid = $('#arsenal-grid');
    if (!grid) return;
    // the grenade launcher is an enemy weapon (demo archetype) — never sold
    const sellable = WEAPON_ORDER.filter((wid) => wid !== 'gl');
    grid.innerHTML = sellable.map((wid) => {
      const w = WEAPONS[wid];
      const up = d.arsenal.upgrades[wid] || {};
      return `<div class="weapon-card">
        <div class="wc-head">
          <div><div class="wc-name">${w.name}</div><div class="wc-class">${w.cls}</div></div>
          <div class="badge">${Object.values(up).filter(Boolean).length}/3 UPG</div>
        </div>
        <canvas data-weapon="${wid}" width="520" height="84"></canvas>
        <div class="weapon-stats">
          <div class="wstat"><span>DAMAGE</span><b>${w.dmg}${w.pellets > 1 ? '×' + w.pellets : ''}</b></div>
          <div class="wstat"><span>RATE</span><b>${(1 / w.interval).toFixed(1)}/s</b></div>
          <div class="wstat"><span>MAGAZINE</span><b>${up.mag ? Math.round(w.mag * 1.35) : w.mag}</b></div>
          <div class="wstat"><span>RELOAD</span><b>${(w.reload * (up.tuned ? 0.85 : 1)).toFixed(1)}s</b></div>
          <div class="wstat"><span>RANGE</span><b>${w.range} m</b></div>
          <div class="wstat"><span>SUPPRESS</span><b>${w.suppression}</b></div>
        </div>
        <div class="upgrades">
          ${WEAPON_UPGRADES.map((u) => `<button class="upg ${up[u.id] ? 'is-owned' : ''}" data-upgrade="${wid}:${u.id}" ${up[u.id] ? 'disabled' : ''}>${u.label}${up[u.id] ? ' ✓' : ' · ' + u.cost}</button>`).join('')}
        </div>
        <div class="result-note" style="font-size:10.5px">${w.desc}</div>
      </div>`;
    }).join('');
    for (const wid of sellable) {
      const cv = grid.querySelector(`[data-weapon="${wid}"]`);
      if (!cv) continue;
      const c = cv.getContext('2d');
      c.clearRect(0, 0, cv.width, cv.height);
      c.save();
      c.translate(cv.width / 2 - 70, cv.height / 2 + 14);
      c.scale(3.6, 3.6);
      Art.drawWeaponShape(c, wid, 0, 0, -0.04, 1, 0);
      c.restore();
    }
  },

  /* ---------------- stats ---------------- */
  renderStats() {
    const d = Campaign.data;
    if (!d) return;
    const t = Campaign.statsTotals();
    const content = $('#stats-content');
    if (!content) return;
    const missionsDone = MISSIONS.filter((m) => d.progress[m.id] && d.progress[m.id].completed).length;
    content.innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="v">${missionsDone}<span style="color:var(--dim);font-size:14px">/${MISSIONS.length}</span></div><div class="l">Operations complete</div></div>
        <div class="stat-box"><div class="v">${fmtNum(t.kills)}</div><div class="l">Hostiles eliminated</div></div>
        <div class="stat-box"><div class="v">${t.accuracy}%</div><div class="l">Squad accuracy</div></div>
        <div class="stat-box"><div class="v">${fmtNum(t.alliesLost)}</div><div class="l">Soldiers lost</div></div>
        <div class="stat-box"><div class="v">${fmtNum(t.revives)}</div><div class="l">Field revives</div></div>
        <div class="stat-box"><div class="v">${fmtNum(t.rescues)}</div><div class="l">Civilians rescued</div></div>
        <div class="stat-box"><div class="v">${fmtNum(t.missionsWon)}</div><div class="l">Victories</div></div>
        <div class="stat-box"><div class="v">${t.bestStars}★</div><div class="l">Best rating</div></div>
      </div>
      <div class="hub-bottom" style="margin-top:12px">
        <div class="hub-panel">
          <h4>Campaign progress</h4>
          ${MISSIONS.map((m) => {
            const p = d.progress[m.id] || {};
            return `<div class="intel-line" style="cursor:default;${p.status === 'locked' ? 'opacity:.4' : ''}">
              <span>${String(MISSION_INDEX[m.id] + 1).padStart(2, '0')} · ${esc(m.name)}</span>
              <b>${p.completed ? '★'.repeat(p.stars || 0) + '☆'.repeat(3 - (p.stars || 0)) : p.status === 'available' ? 'AVAILABLE' : 'LOCKED'}</b>
            </div>`;
          }).join('')}
        </div>
        <div class="hub-panel">
          <h4>Honours</h4>
          ${ACHIEVEMENTS.map((a) => `<div class="intel-line" style="cursor:default;${d.achievements.includes(a.id) ? '' : 'opacity:.45'}">
            <span>${d.achievements.includes(a.id) ? '★ ' : '☆ '}${esc(a.label)}</span><b>${d.achievements.includes(a.id) ? 'EARNED' : esc(a.desc)}</b>
          </div>`).join('')}
          <h4 style="margin-top:14px">The fallen</h4>
          ${(d.memorial || []).length ? d.memorial.map((m) => `<div class="intel-line"><span>${esc(m.name)} · ${ROLES[m.role] ? ROLES[m.role].short : ''}</span><b>${esc(m.mission)}</b></div>`).join('') : '<div class="result-note">No soldiers lost. Keep it that way.</div>'}
        </div>
      </div>`;
    const foot = $('#stats-footer');
    if (foot) foot.textContent = `Task Force Nightjar · ${d.roster.filter((s) => s.status !== 'dead').length} active · ${d.roster.filter((s) => s.status === 'dead').length} fallen`;
  },

  /* ---------------- settings ---------------- */
  bindSettings() {
    const setRange = (id, key, label, transform) => {
      const el = $('#' + id);
      if (!el) return;
      const lab = $('#val-' + id.replace('set-', ''));
      el.addEventListener('input', () => {
        const v = parseInt(el.value, 10);
        if (lab) lab.textContent = v;
        Campaign.settings[key] = transform ? transform(v) : v / 100;
        this.applySettings(false);
        this.saveSettings();
      });
    };
    setRange('set-master', 'master', 'val-master');
    setRange('set-sfx', 'sfx', 'val-sfx');
    setRange('set-music', 'music', 'val-music');
    setRange('set-hud', 'hudScale', 'val-hud', (v) => v / 100);
    setRange('set-cam', 'camSens', 'val-cam', (v) => v / 100);
    const q = $('#set-quality');
    if (q) q.addEventListener('change', () => { Campaign.settings.quality = q.value; this.applySettings(false); this.saveSettings(); });
    const langSel = $('#set-lang');
    if (langSel) langSel.addEventListener('change', () => { L10N.setLang(langSel.value); this.saveSettings(); AudioSys.ui('confirm'); });
    $$('[data-toggle]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.toggle;
        Campaign.settings[key] = !Campaign.settings[key];
        el.classList.toggle('on', !!Campaign.settings[key]);
        this.applySettings(false);
        this.saveSettings();
        AudioSys.ui('tap');
      });
    });
    const exportBtn = $('#btn-save-export');
    if (exportBtn) exportBtn.addEventListener('click', () => {
      $('#save-export').value = Campaign.exportSave();
      $('#save-status').textContent = 'Save exported below. Copy it somewhere safe.';
      AudioSys.ui('confirm');
    });
    const copyBtn = $('#btn-save-copy');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const ta = $('#save-export');
      ta.value = Campaign.exportSave();
      ta.select();
      try { document.execCommand('copy'); $('#save-status').textContent = 'Save copied to clipboard.'; }
      catch (e) { $('#save-status').textContent = 'Select the text and copy manually.'; }
      AudioSys.ui('confirm');
    });
    const importBtn = $('#btn-save-import');
    if (importBtn) importBtn.addEventListener('click', () => {
      const text = $('#save-export').value.trim();
      if (!text) { this.toast('Paste save data first', 'bad'); return; }
      if (!confirm('Import this save? Current progress will be replaced.')) return;
      const r = Campaign.importSave(text);
      if (r.ok) { this.toast('Save imported', 'good'); this.applySettings(false); this.show('hub'); }
      else this.toast(r.msg || 'Import failed', 'bad');
    });
    const resetBtn = $('#btn-save-reset');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (!confirm('Erase the entire campaign? This cannot be undone.')) return;
      if (!confirm('Final confirmation: erase roster, progress and achievements?')) return;
      Campaign.reset();
      this.battle = null;
      App.scene = 'menu';
      Stage.unbind();
      $('#hud').classList.remove('is-active');
      $('#save-status').textContent = 'Campaign erased.';
      this.toast('Campaign erased', 'bad');
      this.show('menu');
    });
    $('#btn-settings-back').addEventListener('click', () => this.goBack());
    $('#btn-help-back').addEventListener('click', () => this.goBack());
    $('#btn-profile-back').addEventListener('click', () => this.show('barracks'));
    $('#btn-recruit').addEventListener('click', () => { this.show('recruit'); });
    $('#btn-recruit-back').addEventListener('click', () => this.show('barracks'));
    $('#btn-refresh-recruits').addEventListener('click', () => {
      if (Campaign.data.credits < 100) { this.toast('Need 100 credits', 'bad'); return; }
      Campaign.data.credits -= 100;
      Campaign.data.recruits = [];
      Campaign.ensureRecruits();
      Campaign.save();
      this.refreshRes();
      this.renderRecruit();
      AudioSys.ui('confirm');
    });
    $('#btn-brief-back').addEventListener('click', () => this.show('hub'));
    $('#btn-deploy').addEventListener('click', () => {
      if (!this.briefMission) return;
      this.startBattle(this.briefMission, this.deployment);
    });
    $('#btn-result-continue').addEventListener('click', () => {
      this.leaveBattleToHub();
    });
    $('#btn-result-retry').addEventListener('click', () => {
      if (!this.resultSummary) return;
      const m = this.resultSummary.mission;
      const ids = Campaign.readyRoster().slice(0, 6).map((s) => s.id);
      if (!ids.length) { this.toast('No ready soldiers to redeploy', 'bad'); return; }
      this.startBattle(m, ids);
    });
    $('#btn-result-continue').addEventListener('click', () => { AudioSys.ui('confirm'); });
    $('#btn-pause').addEventListener('click', () => {
      if (!this.battle) return;
      if (this.battle.paused) this.battle.setPaused(false);
      else this.battle.setPaused(true);
    });
    $('#btn-battle-settings').addEventListener('click', () => this.openSettings());
    $('#btn-battle-settings').innerHTML = icon('settings');
    $('#btn-pause').innerHTML = icon('pause');
    $$('[data-speed]').forEach((b) => {
      if (b.dataset.speed === '0') return;
    });
  },
  applySettings(renderControls = true) {
    const s = Campaign.settings;
    AudioSys.setVolume('master', s.master);
    AudioSys.setVolume('sfx', s.sfx);
    AudioSys.setVolume('music', s.music);
    document.documentElement.style.setProperty('--hud-scale', clamp(s.hudScale || 1, 0.75, 1.25));
    window.__SC_LOWQ = s.quality === 'low';
    if (this.battle) {
      this.battle.particles.setQuality(s.quality);
      this.battle.level.quality = s.quality;
      this.battle.weather = s.quality === 'low' ? (this.battle.baseWeather != null ? this.battle.baseWeather : this.battle.weather) * 0.5 : (this.battle.baseWeather != null ? this.battle.baseWeather : this.battle.weather);
      this.battle.initRain();
    }
    Stage.sensitivity = s.camSens || 1;
    if (renderControls) this.renderSettings();
  },
  saveSettings() {
    if (Campaign.data) Campaign.save();
    try { storeSet('squadcommander.settings', Campaign.settings); } catch (e) { }
  },
  renderSettings() {
    const s = Campaign.settings;
    const setVal = (id, v) => { const el = $('#' + id); if (el) el.value = v; };
    setVal('set-master', Math.round(s.master * 100));
    setVal('set-sfx', Math.round(s.sfx * 100));
    setVal('set-music', Math.round(s.music * 100));
    setVal('set-hud', Math.round((s.hudScale || 1) * 100));
    setVal('set-cam', Math.round((s.camSens || 1) * 100));
    const lab = (id, v) => { const el = $('#val-' + id); if (el) el.textContent = v; };
    lab('master', Math.round(s.master * 100));
    lab('sfx', Math.round(s.sfx * 100));
    lab('music', Math.round(s.music * 100));
    lab('hud', Math.round((s.hudScale || 1) * 100));
    lab('cam', Math.round((s.camSens || 1) * 100));
    const q = $('#set-quality');
    if (q) q.value = s.quality;
    const lang = $('#set-lang');
    if (lang) lang.value = L10N.lang;
    const diag = $('#set-diagnostics');
    if (diag) diag.classList.toggle('on', !!s.diagnostics);
    $$('[data-toggle]').forEach((el) => el.classList.toggle('on', !!s[el.dataset.toggle]));
    this.setRes('settings-resources');
  },

  leaveBattleToHub() {
    this.battle = null;
    this.resultSummary = null;
    this.shownResults = null;
    App.scene = 'menu';
    Stage.unbind();
    $('#hud').classList.remove('is-active');
    $('#pause').classList.remove('is-active');
    AudioSys.setTension(0);
    AudioSys.setMusic(false);
    this.show('hub');
  },

  updateHUDLoop() {
    setInterval(() => {
      if (this.battle && App.scene === 'battle' && !this.battle.result) this.updateBattleHUD(this.battle);
    }, 160);
  }
};
