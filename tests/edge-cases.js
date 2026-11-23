'use strict';
/* Edge cases: dry weapons, command succession, cover destruction mid-occupancy,
   extraction gating, pause freezing, sight memory, pinch zoom + camera bounds. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch({ touch: true });
  const page = ctx.page;
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await h.newGame(page);

  await h.test('dry weapon falls back to the sidearm', async () => {
    await h.start(page, 'm01', 4);
    await page.evaluate(() => {
      const b = UI.battle; const u = b.allies[0];
      b.sandboxed = true;
      u.mag = 0; u.reserve = 0; b.startReload(u);
    });
    await h.step(page, 0.5);
    const r = await page.evaluate(() => { const u = UI.battle.allies[0]; return { weapon: u.weaponCfg.id, mag: u.mag, fallback: !!u.fallbackPistol }; });
    h.assert(r.weapon === 'pistol' && r.mag > 0, 'sidearm drawn with ammo (' + r.weapon + ', mag ' + r.mag + ')');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('commander down triggers succession', async () => {
    await h.start(page, 'm01', 4);
    await page.evaluate(() => {
      const b = UI.battle; const cmd = b.allies.find((a) => a.role === 'commander');
      b.sandboxed = true;
      b.damageUnit(cmd, 500, null, cmd.x, cmd.y - 30, {});
    });
    await h.step(page, 0.2);
    const r = await page.evaluate(() => ({
      commanderAlive: UI.battle.commanderAlive,
      feed: UI.battle.feed.map((f) => f.text).join(' | ')
    }));
    h.assert(!r.commanderAlive && /TAKES COMMAND|IS DOWN|WIPED/.test(r.feed), 'succession recorded in feed');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('cover destroyed while occupied detaches the occupant', async () => {
    await h.start(page, 'm01', 4);
    const r = await page.evaluate(() => {
      const b = UI.battle;
      b.sandboxed = true;
      const u = b.aliveAllies.find((a) => !a.downed);
      const cov = b.level.covers.find((c) => !c.dead);
      u.x = cov.x - cov.w / 2 - 10; u.y = b.level.surfaceAt(u.x);
      b.attachCover(u, cov.id);
      cov.hp = 1;
      b.handleImpact({ team: 'enemy', dmg: 400, pen: 0 }, 'cover', null, cov, cov.x, cov.y - cov.h / 2);
      return {
        dead: b.level.covers.some((c) => c.dead),
        dangling: b.allies.some((a) => a.coverId && !b.level.covers.find((c) => c.id === a.coverId && !c.dead))
      };
    });
    h.assert(r.dead, 'cover was destroyed');
    h.assert(!r.dangling, 'no occupant keeps a dead cover');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('mission does not complete until extraction (sabotage)', async () => {
    await h.start(page, 'm04', 5);
    const r = await page.evaluate(() => {
      const b = UI.battle;
      for (const e of b.enemies) { e.x = -5000; e.y = 620; }
      b.sandboxed = true;
      for (const o of b.objectives) if (o.type === 'interact') o.progress = o.max;
      b.updateObjectives(0.05);
      const pre = { result: b.result, extracts: b.objectives.filter((o) => o.type === 'extract').map((o) => o.complete) };
      b.sandboxed = false;
      const evac = b.level.evac;
      for (const u of b.aliveAllies) { u.x = evac.x - 20; u.y = b.level.surfaceAt(u.x); }
      for (let i = 0; i < 90 && !b.result; i++) b.update(1 / 60);
      return { pre, success: b.result && b.result.success };
    });
    h.assert(r.pre.result === null && r.pre.extracts.every((e) => !e), 'charges set but extraction still pending');
    h.assert(r.success === true, 'reaching the pad completes the mission');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('paused battle freezes projectiles and damage', async () => {
    await h.start(page, 'm01', 4);
    const r = await page.evaluate(() => {
      const b = UI.battle;
      const u = b.aliveAllies[0];
      b.sandboxed = true;
      b.setPaused(true);
      b.projectiles.push({ kind: 'grenade', x: u.x + 60, y: u.y - 60, vx: -160, vy: 0, team: 'enemy', ownerId: 'x', dmg: 60, life: 2, fuse: 2, gravity: 640, radius: 110, trail: [], traveled: 0 });
      for (let i = 0; i < 30; i++) b.update(1 / 60);
      return { hp: Math.round(u.hp), max: u.maxHp, projectiles: b.projectiles.length };
    });
    h.assert(r.hp === r.max && r.projectiles === 1, 'grenade frozen while paused');
    await page.evaluate(() => { UI.battle.setPaused(false); UI.battle.sandboxed = true; for (const e of UI.battle.enemies) { e.x = -5000; e.y = 620; } });
    await h.step(page, 0.8);
    const dmg = await page.evaluate(() => Math.round(UI.battle.allies[0].hp) < UI.battle.allies[0].maxHp);
    h.assert(dmg, 'explosion applies after resume');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('enemy perceives, loses sight and investigates last known', async () => {
    await h.start(page, 'm01', 4);
    const r = await page.evaluate(() => {
      const b = UI.battle;
      b.sandboxed = true;
      const u = b.aliveAllies[0];
      for (const o of b.allies) if (o !== u) { o.x = -4000; o.y = 620; }
      const e = b.enemies.find((x) => !x.dead);
      // scan for a clear stretch at eye height, like the ai suite does
      let sx = null;
      const L = b.level;
      for (let x = 300; x < L.width - 400; x += 20) {
        const c1 = { x: x + 280, y: L.surfaceAt(x + 280) - 32 };
        const c2 = { x: x - 280, y: L.surfaceAt(x - 280) - 32 };
        if (lineOfSight(L, x, L.surfaceAt(x) - 45, c1.x, c1.y, {}) &&
            lineOfSight(L, x, L.surfaceAt(x) - 45, c2.x, c2.y, {})) { sx = x; break; }
      }
      e.x = sx; e.y = L.surfaceAt(sx);
      u.x = sx + 280; u.y = L.surfaceAt(u.x); u.stance = 'stand';
      let perceived = false;
      for (let i = 0; i < 12 && !e.target; i++) { b.enemyPerceive(e); if (e.target) perceived = true; }
      const mem = e.lastSeen && { x: Math.round(e.lastSeen.x), y: Math.round(e.lastSeen.y) };
      u.x = Math.max(30, e.x - 1400); u.y = b.level.surfaceAt(u.x);
      e.lastSeenT = b.time - 3;
      for (let i = 0; i < 6; i++) b.enemyPerceive(e);
      return { sx, perceived, mem: e.lastSeen && { x: Math.round(e.lastSeen.x), y: Math.round(e.lastSeen.y) }, state: e.aiState, hasTarget: !!e.target, lastSeen: !!e.lastSeen };
    });
    h.assert(r.sx != null, 'a clear LOS stretch exists on the map');
    h.assert(r.perceived, 'enemy perceived the soldier');
    h.assert(r.state !== 'patrol' && r.lastSeen, 'after losing sight the enemy keeps memory and searches');
    await page.evaluate(() => UI.abortBattle());
  });

  await h.test('pinch zoom and camera clamping behave on touch', async () => {
    await h.start(page, 'm01', 4);
    const z0 = await page.evaluate(() => UI.battle.cam.zoom);
    // drive the canvas pointer pipeline directly: CDP touch synthesis is
    // racy with two-finger gestures, PointerEvents hit the same listeners
    await page.evaluate(() => {
      const c = document.getElementById('stage');
      const fire = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, {
        pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 7
      }));
      fire('pointerdown', 7, 300, 300);
      fire('pointerdown', 8, 500, 300);
      for (let s = 1; s <= 6; s++) {
        const t = s / 6;
        fire('pointermove', 7, 300 - 80 * t, 300);
        fire('pointermove', 8, 500 + 80 * t, 300);
      }
      fire('pointerup', 7, 220, 300);
      fire('pointerup', 8, 580, 300);
    });
    await page.waitForTimeout(400);
    const z1 = await page.evaluate(() => UI.battle.cam.zoom);
    h.assert(z1 > z0, 'pinch zoom increases camera zoom (' + z0.toFixed(2) + ' -> ' + z1.toFixed(2) + ')');
    const clamped = await page.evaluate(() => {
      const b = UI.battle;
      b.cam.x = -5000; CameraUtil.clamp(b.cam);
      return b.cam.x >= b.cam.bounds.minX - 1;
    });
    h.assert(clamped, 'camera clamped to level bounds');
    await page.evaluate(() => UI.abortBattle());
  });

  h.assertClean(ctx);
  h.summary('edge-cases');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
