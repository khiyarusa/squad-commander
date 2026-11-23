'use strict';
/* Performance: full-squad battle simulation stays inside its frame budget. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  await h.newGame(page);

  await h.test('a six-soldier firefight simulates faster than real time', async () => {
    await h.start(page, 'm05', 6);
    const r = await page.evaluate(() => {
      const b = UI.battle;
      b.paused = false;
      // push the squad into the enemy so every system is hot
      b.selectAll();
      b.issueOrder('sprint', b.level.width * 0.45, 0);
      window.__SC.step(8);
      // measured section: 600 fixed steps = 10 simulated seconds
      const t0 = performance.now();
      for (let i = 0; i < 600; i++) b.update(1 / 60);
      const ms = performance.now() - t0;
      return {
        ms: +ms.toFixed(1),
        perFrame: +(ms / 600).toFixed(3),
        units: b.units.length,
        particles: b.particles.list.length,
        projectiles: b.projectiles.length,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
      };
    });
    h.assert(r.perFrame < 8, 'average step ' + r.perFrame + ' ms is inside the 16.6 ms frame budget');
    h.assert(r.units > 5, 'simulating a full battle (' + r.units + ' units)');
    h.assert(r.heap == null || r.heap < 400, 'heap stable (' + r.heap + ' MB)');
  });

  await h.test('a long simulated deployment does not leak unbounded state', async () => {
    const r = await page.evaluate(() => {
      const b = UI.battle;
      for (let s = 0; s < 60; s++) window.__SC.step(10); // ~10 simulated minutes
      return {
        time: Math.round(b.time),
        decals: b.decals.length,
        noise: (b.noise || []).length,
        feed: b.feed.length,
        projectiles: b.projectiles.length,
        particles: b.particles.list.length,
        heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
        result: !!b.result
      };
    });
    h.assert(r.decals < 400, 'decals capped (' + r.decals + ')');
    h.assert(r.feed <= 40, 'feed trimmed (' + r.feed + ')');
    h.assert(r.noise <= 24, 'noise list trimmed (' + r.noise + ')');
    h.assert(r.heap == null || r.heap < 600, 'heap after 10 simulated minutes (' + r.heap + ' MB)');
  });

  h.assertClean(ctx);
  h.summary('perf');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
