'use strict';
/* ============================================================
   07 — UNITS: stats, factories, hitboxes
   ============================================================ */

function rankForXp(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}
function xpForNext(xp) {
  const r = rankForXp(xp);
  return RANKS[r + 1] ? RANKS[r + 1].xp : null;
}
function weaponStats(id, upgrades) {
  const base = WEAPONS[id] || WEAPONS.rifle;
  const w = { ...base };
  const up = upgrades || {};
  if (up.optic) { w.spread *= 0.75; }
  if (up.mag) { w.mag = Math.round(w.mag * 1.35); }
  if (up.tuned) { w.reload *= 0.85; w.interval *= 0.94; }
  w.magSize = w.mag;
  w.reserveMax = w.mag * 5;
  return w;
}

function soldierStats(soldier, campaign) {
  const role = ROLES[soldier.role] || ROLES.rifleman;
  const sk = soldier.skills || {};
  const marks = (sk.marksmanship || 0), mob = (sk.mobility || 0), aware = (sk.awareness || 0),
    endur = (sk.endurance || 0), lead = (sk.leadership || 0), med = (sk.medicine || 0);
  const armor = ARMOR_LEVELS[clamp((soldier.armor || 1) - 1, 0, 2)];
  let leaderBonus = 0;
  if (campaign && campaign.roster) {
    const cmd = campaign.roster.find((s) => s.role === 'commander' && s.status !== 'dead' && s.id !== soldier.id);
    if (cmd) leaderBonus = (cmd.skills && cmd.skills.leadership ? cmd.skills.leadership : 0) * 0.04;
  }
  if (soldier.role === 'commander') leaderBonus += lead * 0.04;
  return {
    maxHp: Math.round(role.hp + endur * 12),
    acc: role.acc * (1 + marks * 0.07 + leaderBonus),
    speed: 68 * role.speed * (1 + mob * 0.07) * (armor.speed ? 1 + armor.speed : 1),
    react: role.react * (1 + aware * 0.12),
    armorRed: armor.dmgReduction,
    suppressionResist: 1 - aware * 0.10,
    healMul: 1 + med * 0.2,
    leadership: lead,
    armorLabel: armor.label
  };
}

function createUnitBase(o) {
  return {
    id: o.id || uid('u'), team: o.team || 'ally', role: o.role || 'rifleman',
    type: o.type || null, name: o.name || 'SOLDIER', tag: o.tag || null,
    x: o.x || 0, y: o.y || 0, dir: o.dir || 1,
    hp: o.hp || 100, maxHp: o.maxHp || 100, armorRed: o.armorRed || 0,
    stance: 'stand', state: o.state || 'idle', anim: 'idle',
    weapon: o.weapon || null, weaponCfg: o.weaponCfg || null,
    mag: o.weaponCfg ? o.weaponCfg.mag : 0,
    magSize: o.weaponCfg ? o.weaponCfg.mag : 0,
    reserve: o.weaponCfg ? o.weaponCfg.mag * 4 : 0,
    reloadT: 0, fireT: 0, aimT: 0, aimAngle: o.dir < 0 ? Math.PI : 0.05,
    recoil: 0, flash: 0, hitFlash: 0, walkPhase: 0,
    speed: o.speed || 68, acc: o.acc || 1, react: o.react || 1,
    suppression: 0, morale: 100, stress: 0, stamina: 100,
    target: null, order: null, queue: [], path: null, pathI: 0,
    holding: false, following: false, overwatch: null, suppressAt: null,
    focusId: null, coverId: null, cover: null,
    downed: false, downT: 0, downMax: 45, dead: false, freed: false,
    healTarget: null, healT: 0, healDone: 0, reviveTarget: null,
    kills: 0, shots: 0, damageDealt: 0, lastSeen: null, alertPos: null, alertT: 0,
    thinkT: 0, stateT: 0, burstLeft: 0, burstPause: 0, aimReady: 0,
    stopDist: 2, desiredX: null, reactT: 0, threatT: 0,
    isCommander: o.role === 'commander', soldierId: o.soldierId || null,
    aiState: 'patrol', patrolTarget: null, patrolWait: 0,
    stats: o.stats || null, battle: null, lastHitBy: null, invuln: 0,
    hitsTaken: 0, flashColor: null, skin: null, assignedCover: null,
    velocityX: 0, suppressFire: 0, hitWall: 0, seenBySound: 0,
    voiceT: 0, calloutT: 0, formationIndex: o.formationIndex || 0,
    prefersCover: o.prefersCover !== false
  };
}

function createAllyFromSoldier(soldier, x, y, index, campaign) {
  const st = soldierStats(soldier, campaign);
  const up = (campaign.arsenal && campaign.arsenal.upgrades && campaign.arsenal.upgrades[soldier.weapon]) || {};
  const wcfg = weaponStats(soldier.weapon, up);
  const u = createUnitBase({
    id: 'ally_' + soldier.id, team: 'ally', role: soldier.role, name: soldier.name,
    x, y, hp: soldier.hp != null ? Math.min(soldier.hp, st.maxHp) : st.maxHp, maxHp: st.maxHp,
    weapon: soldier.weapon, weaponCfg: wcfg, speed: st.speed, acc: st.acc, react: st.react,
    armorRed: st.armorRed, soldierId: soldier.id, stats: st, formationIndex: index
  });
  u.stealth = (ROLES[soldier.role] || ROLES.rifleman).stealth; // real perception input
  u.callsign = soldier.callsign;
  u.skills = soldier.skills || {};
  u.medkits = soldier.role === 'medic' ? 4 : 1;
  u.reserve = wcfg.reserveMax;
  u.dir = 1;
  u.aimAngle = 0.05;
  u.xp = soldier.xp || 0;
  return u;
}

function createEnemy(type, x, y, diff, tag) {
  const d = ENEMIES[type] || ENEMIES.rifleman;
  const wcfg = weaponStats(d.weapon, null);
  const u = createUnitBase({
    id: 'enemy_' + uid('e'), team: 'enemy', role: 'enemy', type: d.id, name: d.label,
    x, y, hp: Math.round(d.hp * (diff ? diff.enemyHp : 1)), maxHp: Math.round(d.hp * (diff ? diff.enemyHp : 1)),
    weapon: d.weapon, weaponCfg: wcfg,
    speed: 62 * d.speed, acc: d.acc * (diff ? diff.enemyAcc : 1), react: d.react * (diff ? diff.enemyReact : 1),
    armorRed: d.armor * 0.05, tag: tag || null
  });
  u.dir = -1;
  u.aimAngle = Math.PI;
  u.viewRange = d.view * (diff ? diff.enemyPerception : 1);
  u.reserve = wcfg.magSize * 5;
  u.medkits = 0;
  u.aiState = 'patrol';
  u.reactBase = 0.45;
  u.patrolWait = 1 + Math.random() * 2;
  u.enemyType = d.id;
  u.enemyName = d.label;
  return u;
}

function createNeutral(kind, x, y, tag, extra) {
  const isPilot = kind === 'pilot';
  const isVip = kind === 'vip';
  const names = { pilot: 'DOWNED PILOT', vip: 'DEFECTOR', hostage: 'HOSTAGE', engineer: 'ENGINEER' };
  const u = createUnitBase({
    id: 'neutral_' + uid('n'), team: 'neutral', role: kind === 'vip' ? 'vip' : 'hostage',
    name: (extra && extra.name) || names[kind] || 'CIVILIAN', x, y,
    hp: isPilot ? 34 : isVip ? 70 : 48, maxHp: isPilot ? 34 : isVip ? 70 : 48,
    tag: tag || kind
  });
  u.neutralKind = kind;
  u.speed = 60;
  u.guarded = true;
  u.freed = false;
  if (isPilot) { u.stance = 'prone'; u.anim = 'down'; u.state = 'down'; u.downed = true; u.downT = 999; u.bleedOut = false; }
  return u;
}

function unitHeight(u) {
  if (u.dead) return 0;
  if (u.downed || u.stance === 'prone') return 15;
  if (u.stance === 'crouch') return 32;
  return 54;
}
function unitHitbox(u) {
  const h = unitHeight(u);
  const w = u.stance === 'prone' || u.downed ? 30 : 18;
  return { x: u.x - w / 2, y: u.y - h, w, h };
}
function unitCenter(u) {
  const h = unitHeight(u);
  return { x: u.x, y: u.y - h * 0.58 };
}
function unitEye(u) {
  const h = u.downed ? 8 : u.stance === 'crouch' ? 27 : 45;
  return { x: u.x + (u.dir || 1) * 4, y: u.y - h };
}
function muzzlePoint(u) { return Art.muzzleOf(u); }

function unitInRange(u, t) {
  const cfg = u.weaponCfg;
  if (!cfg) return false;
  return Math.abs(t.x - u.x) <= cfg.range * 1.02;
}
function canSeeUnit(level, viewer, target) {
  if (!target || target.dead) return false;
  const e = unitEye(viewer);
  const c = unitCenter(target);
  if (dist(e.x, e.y, c.x, c.y) > (viewer.viewRange || 900)) return false;
  return lineOfSight(level, e.x, e.y, c.x, c.y);
}

function effectiveSpread(u) {
  const cfg = u.weaponCfg;
  if (!cfg) return 4;
  let s = cfg.spread;
  if (u.stance === 'crouch') s *= 0.8;
  if (u.stance === 'prone') s *= 0.58;
  if (u.anim === 'walk') s *= 1.35;
  if (u.anim === 'run') s *= 1.9;
  s *= 1 / Math.max(0.6, u.acc || 1);
  s *= 1 + (u.suppression / 100) * 1.4;
  s *= 1 + (u.recoil || 0) * 0.12;
  if (u.moving) s *= 1.15;
  s *= 1 + (100 - u.stamina) / 300;
  const moraleMul = 0.72 + (u.morale == null ? 100 : u.morale) / 360;
  s /= Math.max(0.55, moraleMul);
  if (u.injury === 'light') s *= 1.1;
  if (u.injury === 'serious') s *= 1.3;
  return s;
}

function currentRankLabel(u) {
  if (!u.xp) return 'RECRUIT';
  return RANKS[rankForXp(u.xp)].name;
}
