'use strict';
/* Firefight: contact produces shots, hits, tracers and projectiles on screen. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  await h.newGame(page);

  await h.test('squad walks into contact and the firefight is real', async () => {
    await h.start(page, 'm05', 6);
    await page.evaluate(() => {
      const b = UI.battle;
      b.paused = false;
      b.selectAll();
      b.issueOrder('sprint', b.level.width * 0.45, 0);
      window.__SC.step(7);
      b.setSpeed(2);
      window.__SC.step(3);
      const front = b.aliveAllies[0];
      if (front) { b.cam.follow = null; b.cam.tx = front.x + 170; }
    });
    // let a few frames render for tracer screenshots
    for (let i = 0; i < 3; i++) { await page.waitForTimeout(160); await h.shot(page, 'fight-' + i); }
    const st = await page.evaluate(() => ({
      shots: UI.battle.stats.shots, hits: UI.battle.stats.hits, kills: UI.battle.stats.kills,
      projectiles: UI.battle.projectiles.length,
      enemyShots: UI.battle.enemies.reduce((s, e) => s + (e.shots || 0), 0)
    }));
    h.assert(st.shots > 0, 'squad fired ' + st.shots + ' rounds');
    h.assert(st.enemyShots > 0, 'hostiles returned fire (' + st.enemyShots + ' rounds)');
    h.assert(st.hits > 0, 'rounds connected (' + st.hits + ' hits)');
  });

  h.assertClean(ctx);
  h.summary('fight');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
