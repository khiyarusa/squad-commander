'use strict';
/* Navigation: multi-tier graph, A*, platform traversal, dynamic rebuild. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('level builds a genuine multi-tier navigation graph', async () => {
    await h.newGame(page);
    await h.start(page, 'm01', 6);
    const nav = await page.evaluate(() => {
      const L = window.__SC.battle.level;
      return {
        nodes: L.navNodes.length,
        edges: L.navEdges.reduce((s, e) => s + e.length, 0),
        platforms: L.platforms.length,
        stairs: L.stairs.length,
        stats: L.navStats,
        report: L.navReport,
        blocked: L.navNodes.filter((n) => n.blocked).length
      };
    });
    h.assert(nav.platforms >= 2, 'at least two elevated walkways exist');
    h.assert(nav.stairs >= 4, 'each walkway has stairs on both sides');
    h.assert(nav.nodes > 100, 'nav graph has ' + nav.nodes + ' nodes');
    h.assert(nav.edges > nav.nodes, 'graph is cyclic, not a 1D chain');
    h.assert(nav.stats.blocked > 0, 'solid props block nodes');
    h.assert(nav.report && nav.report.reachable, 'all objectives and extraction are reachable');
  });

  await h.test('A* crosses the whole map over multiple surfaces', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const L = b.level;
      const start = b.allies[0];
      const target = L.evac;
      const path = findPath(L, start.x, start.y, target.x, target.y);
      return {
        n: path ? path.length : 0,
        last: path ? path[path.length - 1] : null,
        surfaces: path ? [...new Set(path.map((p) => p.surface))] : [],
        platforms: L.platforms.map((p) => ({ x1: p.x1, x2: p.x2, y: p.y }))
      };
    });
    h.assert(r.n > 5, 'path has waypoints across the map (' + r.n + ')');
    h.assert(r.last && Math.abs(r.last.x - 3102) < 40, 'path terminates at extraction');
    h.assert(r.surfaces.includes('ground'), 'path uses ground surface');
    h.assert(r.surfaces.some((s) => s === 'vault' || /_s/.test(s) || /^pl/.test(s)), 'path uses vault/stairs/platform geometry');
  });

  await h.test('squad climbs a stair and occupies a walkway', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true;
      for (const e of b.enemies) b.killUnit(e, null);
      const p = b.level.platforms[0];
      const cx = (p.x1 + p.x2) / 2;
      b.selectAll();
      b.issueOrder('move', cx, p.y);
      for (let i = 0; i < 60 * 30; i++) b.update(1 / 60);
      return {
        platform: { x1: p.x1, x2: p.x2, y: p.y },
        allies: b.allies.map((a) => ({ x: a.x, y: a.y, pi: a.pathI, order: !!a.order })),
        last: b.allies[0].lastCommand
      };
    });
    const onTop = r.allies.filter((a) => Math.abs(a.y - r.platform.y) < 3 &&
      a.x > r.platform.x1 - 4 && a.x < r.platform.x2 + 4);
    h.assert(onTop.length >= 2, 'at least two soldiers stand on the walkway (got ' + onTop.length + ')');
    h.assert(r.allies.every((a) => !a.order), 'all move commands resolved');
    h.assert(r.last && r.last.state === 'completed', 'move command completed');
  });

  await h.test('destroying a solid prop rebuilds navigation and opens a route', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const L = b.level;
      const solid = L.covers.find((c) => c.solid && c.vaultable && !c.dead);
      const beforeRev = L.navRevision;
      const pathBefore = findPath(L, 100, L.surfaceAt(100), solid.x, solid.y + 1);
      b.damageCover(solid, 100000, solid.x, solid.y - 10, { team: 'ally' });
      const pathAfter = findPath(L, 100, L.surfaceAt(100), solid.x, solid.y);
      return {
        dead: solid.dead,
        rev: L.navRevision,
        beforeRev,
        after: L.navStats,
        pathBefore: pathBefore ? pathBefore.length : null,
        pathAfter: pathAfter ? pathAfter.length : null,
        inSolid: inSolid(L, solid.x, solid.y)
      };
    });
    h.assert(r.dead, 'solid cover was destroyed');
    h.assert(r.rev > r.beforeRev, 'navigation revision advanced');
    h.assert(r.pathAfter != null, 'a route to the destroyed prop exists');
    h.assert(r.inSolid == null, 'destroyed prop no longer blocks bodies');
  });

  await h.test('walkClear rejects solids and accepts open ground', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const L = b.level;
      const solid = L.covers.find((c) => c.solid && !c.dead);
      return {
        blocked: walkClear(L, solid.x - solid.w / 2 - 40, L.surfaceAt(solid.x), solid.x + solid.w / 2 + 40, L.surfaceAt(solid.x)),
        open: walkClear(L, 60, L.surfaceAt(60), 200, L.surfaceAt(200))
      };
    });
    h.assert(r.blocked === false, 'straight walk through a solid is rejected');
    h.assert(r.open === true, 'straight walk over open ground is accepted');
  });

  h.assertClean(ctx);
  h.summary('navigation');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
