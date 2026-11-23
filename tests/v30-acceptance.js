'use strict';
/* v3.0 acceptance: MenuPlate cache correctness, commander radius, notifications, art sanity. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('MenuPlate cache keys include viewport + DPR and invalidates on resize', async () => {
    const k1 = await page.evaluate(() => MenuPlate.key({ x: 1500 }));
    await page.setViewportSize({ width: 1100, height: 620 });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({
      k2: MenuPlate.key({ x: 1500 }),
      cacheSize: MenuPlate.cache.size,
      maxEntries: MenuPlate.maxEntries,
      w: Stage.w
    }));
    h.assert(r.k2 !== k1, 'cache key changes with viewport (' + k1.split('|')[1] + ' -> ' + r.k2.split('|')[1] + ')');
    h.assert(r.cacheSize <= r.maxEntries, 'cache bounded (' + r.cacheSize + ' <= ' + r.maxEntries + ')');
    // back to original size for later tests
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
  });

  await h.test('MenuPlate serves a live plate after resize (no stale art)', async () => {
    await page.setViewportSize({ width: 1100, height: 620 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      // every cached key must reference the CURRENT viewport
      return [...MenuPlate.cache.keys()].every((k) => k.includes(Stage.w + 'x' + Stage.h + '@' + Stage.dpr));
    });
    h.assert(r, 'all cached plates match the current viewport');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);
  });

  await h.test('toasts coalesce, cap at three and are dismissible', async () => {
    const r = await page.evaluate(() => {
      UI.toast('CONTACT', 'warn'); UI.toast('CONTACT', 'warn'); UI.toast('CONTACT', 'warn');
      UI.toast('CONTACT', 'warn');
      const wrap = document.getElementById('toasts');
      const after4 = { n: wrap.children.length, text: wrap.lastElementChild.textContent };
      wrap.lastElementChild.click(); // dismiss
      return { after4, afterDismiss: wrap.children.length };
    });
    h.assert(r.after4.n <= 3, 'toast count capped at 3 (got ' + r.after4.n + ')');
    h.assert(/×/.test(r.after4.text), 'identical toasts coalesced with a counter (' + r.after4.text + ')');
    h.assert(r.afterDismiss === r.after4.n - 1, 'click dismisses a toast');
    await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
  });

  await h.test('forest parallax tile contains real tree variety (not only triangles)', async () => {
    const r = await page.evaluate(() => {
      const tile = Art.getTile('forest', 'dawn', 'mid');
      const c = tile.getContext('2d');
      const d = c.getImageData(0, 0, tile.width, tile.height).data;
      const bandTop = tile.height * 0.25, bandBot = tile.height * 0.8;
      let trees = 0, inTree = false;
      const colors = new Set();
      let thinTrunks = 0;
      for (let x = 0; x < tile.width; x++) {
        let opaque = 0, darkTrunk = 0;
        for (let y = Math.floor(bandTop); y < bandBot; y++) {
          const i = (y * tile.width + x) * 4;
          if (d[i + 3] > 128) {
            opaque++;
            if (d[i] < 45 && d[i + 1] < 45 && d[i + 2] < 45) darkTrunk++;
            if (x % 7 === 0 && y % 7 === 0) colors.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
          }
        }
        const isTree = opaque > 8;
        if (isTree && !inTree) trees++;
        inTree = isTree;
        if (darkTrunk > 30 && opaque < 120) thinTrunks++; // narrow dark trunk column
      }
      return { trees, thinTrunks, colors: colors.size };
    });
    h.assert(r.trees >= 8, 'multiple distinct tree silhouettes (' + r.trees + ')');
    h.assert(r.thinTrunks >= 5, 'real trunks exist under canopies (' + r.thinTrunks + ')');
    h.assert(r.colors >= 10, 'layered canopy color variety (' + r.colors + ' quantized colors)');
  });

  await h.test('version 3.0.0 across package and runtime', async () => {
    const r = await page.evaluate(() => GAME_VERSION);
    const pkg = require('../package.json');
    h.assert(r === pkg.version && r === '3.0.0', 'version synced at 3.0.0 (runtime ' + r + ', pkg ' + pkg.version + ')');
  });

  h.assertClean(ctx);
  h.summary('v30-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
