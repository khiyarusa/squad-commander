'use strict';
/* Environments: every theme/time-of-day renders clean, no leaks in a long session. */
const h = require('./lib/harness');

const TOUR = [
  { id: 'm06', label: 'forest dawn (escort)' },
  { id: 'm08', label: 'forest night (survive)' },
  { id: 'm09', label: 'industrial overcast (capture)' },
  { id: 'm02', label: 'urban dusk (rescue)' }
];

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  await h.newGame(page);

  for (const t of TOUR) {
    await h.test(t.label + ' renders without errors', async () => {
      await h.start(page, t.id, 6);
      await page.evaluate(() => {
        const b = UI.battle;
        b.paused = false;
        b.selectAll();
        b.issueOrder('sprint', b.level.width * 0.35, 0);
        window.__SC.step(6);
        const front = b.aliveAllies[0];
        if (front) { b.cam.follow = null; b.cam.tx = front.x + 170; }
      });
      await page.waitForTimeout(350);
      const r = await page.evaluate(() => {
        const b = UI.battle;
        return {
          theme: b.mission.theme, tod: b.mission.tod,
          allies: b.aliveAllies.length, enemies: b.enemies.length,
          platformCount: b.level.platforms.length,
          heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null
        };
      });
      h.assert(r.allies > 0 && r.enemies > 0, 'scene populated: ' + r.allies + ' allies vs ' + r.enemies + ' hostiles');
      h.assert(r.heap == null || r.heap < 500, 'heap budget sane (' + r.heap + ' MB)');
      await h.shot(page, 'env-' + t.id);
      await page.evaluate(() => UI.abortBattle());
    });
  }

  h.assertClean(ctx);
  h.summary('environments');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
