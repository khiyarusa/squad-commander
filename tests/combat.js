'use strict';
/* Combat & medical: weapons/ammo, projectiles, suppression, friendly fire, cover damage, injury tiers, healing, revival. */
const h = require('./lib/harness');

async function fresh(page) {
  await h.newGame(page);
  await h.start(page, 'm01', 6);
  return page.evaluate(() => {
    const b = window.__SC.battle;
    b.sandboxed = true;
    b.paused = false;
    for (const e of b.enemies) if (!e.dead) b.killUnit(e, null);
    return { width: b.level.width };
  });
}

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('seven weapon classes are defined and role-legal', async () => {
    const r = await page.evaluate(() => {
      const ids = Object.keys(WEAPONS);
      const rolesOk = Object.values(ROLES).every((ro) => WEAPONS[ro.weapon]);
      return { ids, rolesOk };
    });
    h.assert(r.ids.length === 7, 'exactly seven weapon classes (got ' + r.ids.length + ')');
    h.assert(r.ids.join(',').split(',').sort().join() === ['gl', 'lmg', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper'].sort().join(), 'rifle/smg/shotgun/sniper/lmg/pistol/gl all present');
    h.assert(r.rolesOk, 'every role carries a defined weapon');
  });

  await h.test('firing consumes ammo and the round flies as a real projectile', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      for (const o of b.allies) if (o !== u) { o.x = -4000; o.y = 620; }
      const e = { id: 'e_test', team: 'enemy', dead: false, downed: false, x: u.x + 170, y: b.level.surfaceAt(u.x + 170), hp: 60, maxHp: 84, armorRed: 0, invuln: 0 };
      b.units.push(e); b.enemies.push(e);
      u.mag = 20; u.fireT = 0; u.reloadT = 0;
      const before = b.projectiles.length;
      const fired = b.fireWeapon(u, e.x, e.y - 28, { spreadMul: 0 });
      const spawned = b.projectiles.length - before;
      let hp = e.hp;
      for (let i = 0; i < 240 && e.hp === hp; i++) b.updateProjectiles(1 / 60);
      const out = {
        fired, mag: u.mag, shotsDelta: b.stats.shots,
        hpBefore: hp, hpAfter: e.hp,
        spawned
      };
      b.enemies.pop(); b.units.pop();
      return out;
    });
    h.assert(r.fired, 'fireWeapon returns true');
    h.assert(r.mag === 19, 'magazine decremented');
    h.assert(r.spawned >= 1, 'a projectile was spawned');
    h.assert(r.hpAfter < r.hpBefore, 'the round hit and dealt damage (' + r.hpBefore + ' -> ' + r.hpAfter + ')');
  });

  await h.test('near misses generate suppression on the enemy', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      for (const o of b.allies) if (o !== u) { o.x = -4000; o.y = 620; }
      u.fireT = 0; u.reloadT = 0; u.mag = 20;
      const e = { id: 'e_test2', team: 'enemy', dead: false, downed: false, x: u.x + 260, y: b.level.surfaceAt(u.x + 260), hp: 60, maxHp: 84, armorRed: 0, invuln: 0 };
      b.units.push(e); b.enemies.push(e);
      e.suppression = 0;
      // fire well past the enemy: the muzzle line passes within 55px
      b.fireWeapon(u, e.x + 40, e.y - 28, { spreadMul: 0 });
      b.updateProjectiles(1 / 60);
      const out = { sup: +e.suppression.toFixed(1), hp: e.hp };
      b.enemies.pop(); b.units.pop();
      return out;
    });
    h.assert(r.sup > 0, 'suppression accumulated (' + r.sup + ')');
  });

  await h.test('friendly fire damages allies and is reported', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const a = b.allies[0], v = b.allies[1];
      v.hp = 80; v.invuln = 0; v.armorRed = 0;
      const feedBefore = b.feed.length;
      b.damageUnit(v, 25, a.id, v.x, v.y - 30, { bullet: true });
      return { hp: v.hp, feed: b.feed.slice(feedBefore).map((f) => f.text).join('|') };
    });
    h.assert(r.hp === 55, 'ally took the full 25 damage (hp ' + r.hp + ')');
    h.assert(/friendly fire/i.test(r.feed), 'feed reports the friendly fire incident');
  });

  await h.test('cover absorbs fire, degrades and destruction detaches occupants', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const cov = b.level.covers.find((c) => !c.dead);
      const u = b.allies[0];
      u.coverId = cov.id;
      const rev = b.level.navRevision;
      const hp0 = cov.hp;
      b.damageCover(cov, cov.hp + 10, cov.x, cov.y - 10, { team: 'enemy' });
      return {
        dead: cov.dead, hp0, rev: b.level.navRevision,
        detached: u.coverId === null,
        clearedClaims: (cov.claims || []).length === 0
      };
    });
    h.assert(r.dead, 'cover destroyed when its hp pool runs out');
    h.assert(r.detached, 'occupant loses cover assignment');
    h.assert(r.clearedClaims, 'reservations cleared');
    h.assert(r.rev > 0, 'navigation revision advanced after destruction');
  });

  await h.test('injury tiers escalate and serious wounds bleed', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      u.hp = u.maxHp * 0.5; u.bleeding = false; u.bleedingTreated = false;
      b.updateInjury(u, 0.016);
      const light = u.injury;
      u.hp = u.maxHp * 0.2;
      b.updateInjury(u, 0.016);
      const serious = { injury: u.injury, bleeding: u.bleeding };
      const hpBefore = u.hp;
      for (let i = 0; i < 120; i++) b.updateInjury(u, 1 / 60);
      return { light, serious, drained: +(hpBefore - u.hp).toFixed(2) };
    });
    h.assert(r.light === 'light', '50% hp classifies as LIGHT');
    h.assert(r.serious.injury === 'serious', '20% hp classifies as SERIOUS');
    h.assert(r.serious.bleeding === true, 'serious wound starts bleeding');
    h.assert(r.drained > 0.5, 'bleeding drains health over time (' + r.drained + ')');
  });

  await h.test('medic treatment heals and stamps the wound as treated', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const medic = b.allies.find((a) => a.role === 'medic');
      const p = b.allies[0];
      p.hp = 30; p.bleeding = true; p.bleedingTreated = false;
      medic.medkits = 2; medic.healKitReserved = false;
      medic.healTarget = p;
      for (let i = 0; i < 60 * 30 && medic.healTarget; i++) b.healTick(medic, p, 1 / 60);
      return { hp: Math.round(p.hp), max: p.maxHp, bleeding: p.bleeding, treated: p.bleedingTreated, kits: medic.medkits, heals: b.stats.heals };
    });
    h.assert(r.hp === r.max, 'patient restored to full hp');
    h.assert(r.bleeding === false && r.treated === true, 'bleeding stopped and marked treated');
    h.assert(r.kits < 2, 'a medkit was consumed');
    h.assert(r.heals >= 1, 'heal counted in mission stats');
  });

  await h.test('medic revives a downed soldier in the field', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const medic = b.allies.find((a) => a.role === 'medic');
      const p = b.allies[0];
      b.downUnit(p, null);
      const wasDown = p.downed;
      medic.medkits = 2; medic.healKitReserved = false;
      medic.healTarget = p;
      for (let i = 0; i < 60 * 12 && p.downed && medic.healTarget; i++) b.healTick(medic, p, 1 / 60);
      return { wasDown, revived: !p.downed, hp: p.hp, max: p.maxHp, revives: b.stats.revives };
    });
    h.assert(r.wasDown, 'patient started downed');
    h.assert(r.revived, 'soldier back on their feet');
    h.assert(r.hp >= r.max * 0.3 && r.hp < r.max, 'revived at partial hp (' + Math.round(r.hp) + ')');
    h.assert(r.revives >= 1, 'revive counted');
  });

  await h.test('explosions damage units and scenery in radius', async () => {
    await fresh(page);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      const cov = b.level.covers.find((c) => !c.dead);
      u.x = cov.x + 40; u.y = b.level.surfaceAt(u.x);
      const hpBefore = u.hp;
      const rev = b.level.navRevision;
      b.explode(cov.x, cov.y - 20, 130, 220, 'enemy', 'e_x');
      return {
        hpAfter: u.hp, damaged: u.hp < hpBefore,
        covDead: cov.dead,
        navMoved: b.level.navRevision > rev,
        sup: Math.round(u.suppression)
      };
    });
    h.assert(r.damaged, 'unit in radius took splash damage');
    h.assert(r.covDead, 'destructible scenery was destroyed');
    h.assert(r.navMoved, 'nav graph rebuilt after destruction');
    h.assert(r.sup > 0, 'explosion suppresses survivors (' + r.sup + ')');
  });

  h.assertClean(ctx);
  h.summary('combat');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
