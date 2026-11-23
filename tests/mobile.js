'use strict';
/* Mobile: touch-first HUD on a phone-sized landscape viewport, all 12 missions boot. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch({ viewport: { width: 844, height: 390 }, dpr: 2, touch: true });
  const page = ctx.page;
  await h.newGame(page);

  await h.test('battle HUD fits a landscape phone and hides the rotate overlay', async () => {
    await h.start(page, 'm01', 6);
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => ({
      rotateHidden: getComputedStyle(document.getElementById('rotate')).display === 'none',
      hudActive: document.getElementById('hud').classList.contains('is-active')
    }));
    h.assert(r.rotateHidden, 'rotate overlay hidden in landscape');
    h.assert(r.hudActive, 'battle HUD active');
    await h.shot(page, 'mobile-battle');
  });

  await h.test('touch tap selects a soldier on the canvas', async () => {
    await page.evaluate(() => {
      const b = window.__SC.battle;
      b.cam.follow = null;
      b.cam.ty = 470; // ride the clamp so ground units sit above the HUD stack
      b.selected.clear();
    });
    await page.waitForTimeout(500); // let the camera lerp settle
    const where = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      const s = Stage.toScreen(u.x, u.y - 27, b.cam);
      return { sx: Math.round(s.x), sy: Math.round(s.y), camY: Math.round(b.cam.y) };
    });
    await page.touchscreen.tap(where.sx, where.sy);
    await page.waitForTimeout(200);
    const sel = await page.evaluate(() => window.__SC.battle.selected.size);
    h.assert(sel === 1, 'tap on a soldier selects exactly them (got ' + sel + ')');
  });

  await h.test('queued orders and support commands work through the touch UI', async () => {
    await page.evaluate(() => {
      const b = window.__SC.battle;
      b.selectAll();
      b.toggleQueue();
      b.issueOrder('move', 1200, 620);
      b.issueOrder('move', 1800, 620);
    });
    const q = await page.evaluate(() => window.__SC.battle.allies.map((a) => ({
      q: a.queue.length, active: a.order ? 1 : 0, state: a.queue[0] && a.queue[0].state
    })));
    h.assert(q.every((c) => c.q + c.active === 2), 'both commands registered for every soldier (active + queued)');
    h.assert(q.every((c) => c.state === 'queued' || (c.q === 0 && c.active === 2)), 'second order waits in the queue');
    await page.evaluate(() => {
      const b = window.__SC.battle;
      b.toggleQueue();
      b.selectAll();
      b.issueOrder('overwatch', b.allies[0].x + 300, 400);
    });
    const ow = await page.evaluate(() => window.__SC.battle.allies.filter((a) => a.overwatch).length);
    h.assert(ow >= 1, 'overwatch assigned (' + ow + ')');
    await page.evaluate(() => {
      const b = window.__SC.battle;
      b.selectAll();
      b.issueOrder('cover', b.allies[0].x + 120, 620);
      for (let i = 0; i < 60 * 25 && b.allies.some((a) => a.order && a.order.type === 'cover'); i++) b.update(1 / 60);
    });
    await h.step(page, 0.1);
    const cov = await page.evaluate(() => window.__SC.battle.allies.filter((a) => a.coverId).length);
    h.assert(cov >= 1, 'cover taken (' + cov + ')');
    await page.evaluate(() => {
      const b = window.__SC.battle;
      b.cancelSelected();
      const u = b.allies[0];
      u.mag = 2;
      b.selected.clear(); b.selected.add(u.id);
      b.issueOrder('reload');
    });
    await h.step(page, 2.6);
    const mag = await page.evaluate(() => { const u = window.__SC.battle.allies[0]; return { mag: u.mag, size: u.magSize }; });
    h.assert(mag.mag === mag.size, 'reload completed over the simulated steps');
    await h.shot(page, 'mobile-orders');
  });

  await h.test('all twelve missions boot on the mobile viewport', async () => {
    await page.evaluate(() => UI.abortBattle());
    const ids = await page.evaluate(() => MISSIONS.map((x) => x.id));
    h.assert(ids.length === 12, 'campaign defines 12 missions');
    for (const id of ids) {
      await page.evaluate((mid) => { window.__SC.startMission(mid, 6); window.__SC.step(4); }, id);
      const s = await page.evaluate(() => {
        const b = UI.battle;
        return { id: b.mission.id, allies: b.allies.length, enemies: b.enemies.length, objectives: b.objectives.length, result: !!b.result };
      });
      h.assert(s.id === id && s.allies > 0 && s.enemies > 0 && s.objectives > 0, id + ' boots: ' + s.allies + ' allies, ' + s.enemies + ' hostiles, ' + s.objectives + ' objectives');
      await page.evaluate(() => UI.abortBattle());
    }
  });

  await h.test('campaign state persists across a reload', async () => {
    await page.evaluate(() => { window.__SC_NO_AUTOSAVE = true; Campaign.save(); });
    await page.reload();
    await page.waitForFunction(() => window.__SC && window.__SC.screen, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({ has: !!Campaign.data, diff: Campaign.data && Campaign.data.difficulty }));
    h.assert(r.has && r.diff === 'veteran', 'campaign restored after reload');
  });

  await h.test('portrait orientation shows the rotate overlay', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none');
    h.assert(shown, 'rotate overlay shown in portrait');
    await h.shot(page, 'mobile-portrait');
  });

  h.assertClean(ctx);
  h.summary('mobile');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
