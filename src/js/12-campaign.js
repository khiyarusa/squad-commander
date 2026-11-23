'use strict';
/* ============================================================
   12 — CAMPAIGN, PROGRESSION, SAVE SYSTEM
   ============================================================ */
const Campaign = {
  data: null,
  settings: { ...SETTINGS_DEFAULT },
  _namesUsed: new Set(),

  blankSoldier(role, name, callsign, opts = {}) {
    const base = ROLES[role];
    return {
      id: uid('s'), name: name || 'SOLDIER', callsign: callsign || pick(CALLSIGNS),
      role, xp: opts.xp || 0, level: rankForXp(opts.xp || 0) + 1,
      skills: { marksmanship: 0, mobility: 0, awareness: 0, endurance: 0, leadership: 0, medicine: 0 },
      hp: base.hp, maxHp: base.hp, status: 'ready', injuryMissions: 0,
      weapon: opts.weapon || base.weapon, armor: opts.armor || 1,
      kills: 0, missions: 0, joined: Date.now(), history: [], downed: false
    };
  },

  newCampaign(difficulty = 'veteran') {
    const roster = [
      this.blankSoldier('commander', 'R. VANCE', 'HAVOC'),
      this.blankSoldier('rifleman', 'D. OKAFOR', 'BISHOP'),
      this.blankSoldier('assault', 'M. REYES', 'SPARK'),
      this.blankSoldier('support', 'K. LARSEN', 'ANVIL'),
      this.blankSoldier('sniper', 'S. KOVAC', 'KESTREL'),
      this.blankSoldier('medic', 'A. HADDAD', 'DOC')
    ];
    const progress = {};
    for (const m of MISSIONS) progress[m.id] = { status: 'locked', stars: 0, attempts: 0, bestTime: null, completed: false };
    progress[MISSIONS[0].id].status = 'available';
    this.data = {
      started: true,
      difficulty,
      credits: 1200,
      ammo: 240,
      med: 4,
      intel: 3,
      roster,
      progress,
      recruits: [],
      arsenal: { upgrades: {} },
      stats: {
        missionsWon: 0, missionsLost: 0, missionsPlayed: 0, kills: 0, shots: 0, hits: 0,
        damage: 0, alliesDowned: 0, alliesLost: 0, rescues: 0, revives: 0,
        flawlessMissions: 0, sixDeployWins: 0, timePlayed: 0, medkitsUsed: 0, bestStars: 0
      },
      achievements: [],
      memorial: [],
      log: [],
      createdAt: Date.now(), updatedAt: Date.now()
    };
    this.ensureRecruits();
    this.save();
    return this.data;
  },

  ensureDefaults() {
    if (!this.data) return false;
    const st = this.data.stats || (this.data.stats = {});
    const def = { missionsWon: 0, missionsLost: 0, missionsPlayed: 0, kills: 0, shots: 0, hits: 0, damage: 0, alliesDowned: 0, alliesLost: 0, rescues: 0, revives: 0, flawlessMissions: 0, sixDeployWins: 0, timePlayed: 0, medkitsUsed: 0, bestStars: 0 };
    for (const k in def) if (st[k] == null) st[k] = def[k];
    this.data.achievements = this.data.achievements || [];
    this.data.memorial = this.data.memorial || [];
    this.data.log = this.data.log || [];
    this.data.stats = st;
    this.data.arsenal = this.data.arsenal || { upgrades: {} };
    this.data.recruits = this.data.recruits || [];
    for (const s of this.data.roster) {
      s.skills = Object.assign({ marksmanship: 0, mobility: 0, awareness: 0, endurance: 0, leadership: 0, medicine: 0 }, s.skills || {});
      s.history = s.history || [];
      s.level = rankForXp(s.xp || 0) + 1;
      if (!s.weapon) s.weapon = (ROLES[s.role] || ROLES.rifleman).weapon;
      if (!s.armor) s.armor = 1;
      s.maxHp = soldierStats(s, this.data).maxHp;
    }
    for (const id in this.data.progress) {
      const p = this.data.progress[id];
      p.attempts = p.attempts || 0;
      p.stars = p.stars || 0;
    }
    return true;
  },

  load() {
    try {
      const raw = storeGet(SAVE_KEY);
      if (!raw) return false;
      if (raw.version !== SAVE_VERSION) {
        // attempt soft migration
        if (!raw.campaign) { console.warn('save version mismatch'); return false; }
      }
      if (!raw.campaign || !Array.isArray(raw.campaign.roster) || !raw.campaign.roster.length) return false;
      this.data = raw.campaign;
      this.settings = Object.assign({ ...SETTINGS_DEFAULT }, raw.settings || {});
      this.ensureDefaults();
      return true;
    } catch (e) {
      console.warn('save load failed', e);
      return false;
    }
  },

  save() {
    if (!this.data) return false;
    this.data.updatedAt = Date.now();
    const payload = { version: SAVE_VERSION, campaign: this.data, settings: this.settings };
    const ok = storeSet(SAVE_KEY, payload);
    if (ok) {
      // keep a backup snapshot at most every few saves
      if (!this._lastBackup || Date.now() - this._lastBackup > 60000) {
        this._lastBackup = Date.now();
        storeSet(SAVE_BACKUP, payload);
      }
    }
    return ok;
  },

  reset() {
    storeRemove(SAVE_KEY); storeRemove(SAVE_BACKUP);
    this.data = null;
  },

  /* ---- queries ---- */
  ranks(s) { return rankForXp(s.xp || 0); },
  rankName(s) { return RANKS[this.ranks(s)].name; },
  levelOf(s) { return this.ranks(s) + 1; },
  skillPoints(s) {
    const lvl = this.levelOf(s);
    const spent = SKILL_ORDER.reduce((a, k) => a + ((s.skills && s.skills[k]) || 0), 0);
    return Math.max(0, lvl - spent);
  },
  aliveRoster() { return (this.data ? this.data.roster : []).filter((s) => s.status !== 'dead'); },
  readyRoster() { return (this.data ? this.data.roster : []).filter((s) => s.status === 'ready'); },
  missionStatus(id) {
    if (!this.data) return 'locked';
    const p = this.data.progress[id];
    if (p && p.completed) return 'complete';
    if (p && p.status === 'available') return 'available';
    return 'locked';
  },
  missionStars(id) { const p = this.data && this.data.progress[id]; return p ? p.stars : 0; },
  nextMissionId(id) {
    const i = MISSION_INDEX[id];
    return i >= 0 && i < MISSIONS.length - 1 ? MISSIONS[i + 1].id : null;
  },
  allMissionsComplete() {
    return this.data && MISSIONS.every((m) => this.data.progress[m.id] && this.data.progress[m.id].completed);
  },
  deployCost(n) { return n * 12; },
  hasAmmo(n) { return this.data && this.data.ammo >= this.deployCost(n); },

  /* ---- recruitment ---- */
  ensureRecruits() {
    if (!this.data) return;
    if (!this.data.recruits || !this.data.recruits.length) {
      this.data.recruits = [];
      const roles = shuffle(['rifleman', 'assault', 'support', 'sniper', 'medic', 'rifleman']);
      const used = new Set(this.data.roster.map((s) => s.name));
      for (let i = 0; i < 3; i++) {
        let nm;
        do { nm = pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES); } while (used.has(nm));
        used.add(nm);
        const role = roles[i % roles.length];
        const xp = Math.floor(Math.random() * 140);
        const cand = this.blankSoldier(role, nm, pick(CALLSIGNS.filter((c) => !this.data.roster.some((s) => s.callsign === c))) || 'ROOK', { xp });
        cand.cost = 380 + Math.floor(Math.random() * 4) * 90 + Math.floor(xp * 0.9);
        cand.id = uid('rec');
        cand.maxHp = soldierStats(cand, this.data).maxHp;
        cand.hp = cand.maxHp;
        this.data.recruits.push(cand);
      }
    }
  },

  recruit(id) {
    if (!this.data) return { ok: false, msg: 'No campaign' };
    const cand = this.data.recruits.find((r) => r.id === id);
    if (!cand) return { ok: false, msg: 'Candidate not found' };
    if (this.aliveRoster().length >= 10) return { ok: false, msg: 'Roster full (10)' };
    if (this.data.credits < cand.cost) return { ok: false, msg: 'Not enough credits' };
    this.data.credits -= cand.cost;
    const s = deepClone(cand);
    delete s.cost;
    s.id = uid('s'); s.status = 'ready'; s.hp = s.maxHp || ROLES[s.role].hp;
    s.joined = Date.now(); s.missions = 0; s.kills = 0; s.history = [];
    this.data.roster.push(s);
    this.data.recruits = this.data.recruits.filter((r) => r.id !== id);
    this.ensureRecruits();
    this.save();
    return { ok: true, soldier: s };
  },

  /* ---- progression ---- */
  upgradeSkill(soldierId, skillId) {
    const s = this.data && this.data.roster.find((x) => x.id === soldierId);
    if (!s) return { ok: false, msg: 'Soldier not found' };
    if (!SKILLS[skillId]) return { ok: false, msg: 'Unknown skill' };
    if ((s.skills[skillId] || 0) >= SKILLS[skillId].max) return { ok: false, msg: 'Skill maxed' };
    if (this.skillPoints(s) <= 0) return { ok: false, msg: 'No skill points available' };
    s.skills[skillId] = (s.skills[skillId] || 0) + 1;
    s.maxHp = soldierStats(s, this.data).maxHp;
    if (s.hp > s.maxHp) s.hp = s.maxHp;
    this.save();
    return { ok: true, points: this.skillPoints(s) };
  },

  buyArmor(soldierId) {
    const s = this.data && this.data.roster.find((x) => x.id === soldierId);
    if (!s) return { ok: false, msg: 'Soldier not found' };
    const next = (s.armor || 1) + 1;
    if (next > 3) return { ok: false, msg: 'Already at max armour' };
    const lvl = ARMOR_LEVELS[next - 1];
    if (this.data.credits < lvl.cost) return { ok: false, msg: 'Not enough credits' };
    this.data.credits -= lvl.cost;
    s.armor = next;
    this.save();
    return { ok: true, armor: next };
  },

  assignWeapon(soldierId, weaponId) {
    const s = this.data && this.data.roster.find((x) => x.id === soldierId);
    if (!s) return { ok: false, msg: 'Soldier not found' };
    const allowed = (ROLES[s.role] && ROLES[s.role].allowed) || [];
    if (!allowed.includes(weaponId)) return { ok: false, msg: 'Weapon not authorised for this role' };
    s.weapon = weaponId;
    this.save();
    return { ok: true };
  },

  buyUpgrade(weaponId, upgradeId) {
    const upg = WEAPON_UPGRADES.find((u) => u.id === upgradeId);
    if (!upg) return { ok: false, msg: 'Unknown upgrade' };
    this.data.arsenal.upgrades[weaponId] = this.data.arsenal.upgrades[weaponId] || {};
    if (this.data.arsenal.upgrades[weaponId][upgradeId]) return { ok: false, msg: 'Already installed' };
    if (this.data.credits < upg.cost) return { ok: false, msg: 'Not enough credits' };
    this.data.credits -= upg.cost;
    this.data.arsenal.upgrades[weaponId][upgradeId] = true;
    this.save();
    return { ok: true };
  },

  resupply(kind) {
    const cost = { ammo: 180, med: 160, intel: 140 }[kind];
    if (!cost) return { ok: false };
    if (this.data.credits < cost) return { ok: false, msg: 'Not enough credits' };
    this.data.credits -= cost;
    if (kind === 'ammo') this.data.ammo += 120;
    if (kind === 'med') this.data.med += 2;
    if (kind === 'intel') this.data.intel += 1;
    this.save();
    return { ok: true };
  },

  checkAchievements() {
    if (!this.data) return [];
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (this.data.achievements.includes(a.id)) continue;
      let ok = false;
      try { ok = a.test(this.data); } catch (e) { ok = false; }
      if (ok) {
        this.data.achievements.push(a.id);
        unlocked.push(a);
      }
    }
    return unlocked;
  },

  applyMissionResult(battle) {
    if (!this.data) return null;
    const m = battle.mission;
    const r = battle.result;
    const diff = DIFFICULTIES[this.data.difficulty] || DIFFICULTIES.veteran;
    const prog = this.data.progress[m.id] || (this.data.progress[m.id] = { status: 'available', stars: 0, attempts: 0, completed: false });
    prog.attempts = (prog.attempts || 0) + 1;
    const summary = {
      mission: m, success: r.success, stars: r.stars,
      credits: 0, ammo: 0, med: 0, intel: 0,
      soldiers: [], promotions: [], injuries: [], deaths: [], unlocked: null, achievements: []
    };
    this.data.stats.missionsPlayed++;
    if (r.success) {
      this.data.stats.missionsWon++;
      this.data.stats.bestStars = Math.max(this.data.stats.bestStars || 0, r.stars);
      const mult = (diff.reward || 1) * (1 + Math.max(0, r.stars - 1) * 0.12);
      const rw = m.rewards || { credits: 500, ammo: 40, med: 1, intel: 1 };
      summary.credits = Math.round((rw.credits || 500) * mult);
      summary.ammo = Math.round((rw.ammo || 30) * (diff.reward || 1));
      summary.med = Math.round((rw.med || 1));
      summary.intel = Math.round((rw.intel || 1));
      this.data.credits += summary.credits;
      this.data.ammo += summary.ammo;
      this.data.med += summary.med;
      this.data.intel += summary.intel;
      prog.completed = true;
      prog.status = 'complete';
      prog.stars = Math.max(prog.stars || 0, r.stars);
      if (!prog.bestTime || r.time < prog.bestTime) prog.bestTime = r.time;
      const next = this.nextMissionId(m.id);
      if (next) {
        const np = this.data.progress[next];
        if (np && np.status === 'locked') {
          np.status = 'available';
          summary.unlocked = MISSIONS_BY_ID[next];
        }
      }
      this.data.stats.rescues += battle.neutrals.filter((n) => n.freed).length;
    } else {
      this.data.stats.missionsLost++;
      summary.credits = 80;
      this.data.credits += 80;
    }
    this.data.stats.kills += r.kills;
    this.data.stats.shots += r.shots;
    this.data.stats.hits += r.hits;
    this.data.stats.damage += r.shots ? r.hits * 12 : 0;
    this.data.stats.alliesDowned += r.downed;
    this.data.stats.alliesLost += r.killed;
    this.data.stats.revives += battle.stats.revives || 0;
    if (r.success && r.downed === 0) this.data.stats.flawlessMissions++;
    if (r.success && r.killed === 0 && r.soldierResults.length >= 6) this.data.stats.sixDeployWins++;
    this.data.stats.medkitsUsed += battle.stats.medkitsUsed || 0;
    this.data.med = Math.max(0, this.data.med - (battle.stats.medkitsUsed || 0));

    for (const res of r.soldierResults) {
      const s = this.data.roster.find((x) => x.id === res.soldierId);
      if (!s) continue;
      const beforeRank = this.ranks(s);
      let xpGain = (r.success ? 58 : 14) + res.kills * 24 + Math.floor(res.damage * 0.12) + (res.downed ? 0 : 12);
      if (r.success) xpGain += r.stars * 8;
      s.xp = (s.xp || 0) + Math.max(5, Math.round(xpGain));
      s.missions = (s.missions || 0) + 1;
      s.kills = (s.kills || 0) + res.kills;
      const afterRank = this.ranks(s);
      if (afterRank > beforeRank) {
        summary.promotions.push({ name: s.name, rank: RANKS[afterRank].name });
      }
      s.level = afterRank + 1;
      if (res.dead) {
        s.status = 'dead';
        s.hp = 0;
        this.data.memorial.push({ name: s.name, callsign: s.callsign, role: s.role, mission: m.name, date: Date.now(), kills: s.kills });
        summary.deaths.push({ name: s.name, role: s.role });
      } else {
        s.hp = Math.max(1, res.hp);
        if (res.downed || s.hp < s.maxHp * 0.35) {
          s.status = 'injured';
          s.injuryMissions = Math.max(1, res.downed ? 2 : 1);
          s.hp = Math.round(s.maxHp * 0.55);
          summary.injuries.push({ name: s.name, missions: s.injuryMissions });
        } else if (s.status !== 'injured') {
          s.status = 'ready';
          s.hp = s.maxHp;
        }
      }
      s.history.push({ mission: m.name, success: r.success, kills: res.kills, xp: Math.round(xpGain), date: Date.now() });
      if (s.history.length > 24) s.history.shift();
      summary.soldiers.push({ id: s.id, name: s.name, role: s.role, xp: Math.round(xpGain), kills: res.kills, dead: res.dead, downed: res.downed });
    }

    // recovery for those not deployed
    const deployedIds = new Set(r.soldierResults.map((s) => s.soldierId));
    for (const s of this.data.roster) {
      if (s.status !== 'injured' || deployedIds.has(s.id)) continue;
      s.injuryMissions = Math.max(0, (s.injuryMissions || 0) - 1);
      if (s.injuryMissions === 0) {
        s.status = 'ready';
        s.hp = s.maxHp;
      }
    }
    // dead soldiers removed from active ready list naturally
    this.data.log.push({ type: 'mission', mission: m.name, success: r.success, stars: r.stars, time: r.time, date: Date.now() });
    if (this.data.log.length > 40) this.data.log.shift();
    summary.achievements = this.checkAchievements();
    this.data.updatedAt = Date.now();
    this.save();
    return summary;
  },

  statsTotals() {
    const d = this.data;
    if (!d) return {};
    const t = deepClone(d.stats);
    t.accuracy = d.stats.shots > 0 ? Math.round((d.stats.hits / d.stats.shots) * 100) : 0;
    t.roster = d.roster.length;
    t.alive = this.aliveRoster().length;
    t.missionsTotal = MISSIONS.length;
    t.missionsComplete = MISSIONS.filter((m) => d.progress[m.id] && d.progress[m.id].completed).length;
    return t;
  },

  exportSave() {
    return JSON.stringify({ version: SAVE_VERSION, campaign: this.data, settings: this.settings }, null, 1);
  },

  importSave(text) {
    try {
      const raw = JSON.parse(text);
      if (!raw || !raw.campaign || !Array.isArray(raw.campaign.roster)) return { ok: false, msg: 'Invalid save data' };
      this.data = raw.campaign;
      this.settings = Object.assign({ ...SETTINGS_DEFAULT }, raw.settings || {});
      this.ensureDefaults();
      this.save();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: 'Could not parse save data' };
    }
  }
};
