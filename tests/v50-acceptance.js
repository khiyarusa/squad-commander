'use strict';
/* v5.0 acceptance: stealth mechanic, suppressed physical reaction, localization depth. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('stealth is a real perception input — sniper evades longer than support', async () => {
    await h.newGame(page);
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true;
      for (const e of b.enemies) { e.aiState = 'patrol'; e.awareness = 0; e.target = null; }
      const e = b.enemies.find((x) => !x.dead);
      const L = b.level;
      // clear LOS stretch at eye height
      let sx = null;
      for (let x = 400; x < L.width - 400; x += 20) {
        if (lineOfSight(L, x, L.surfaceAt(x) - 45, x + 280, L.surfaceAt(x + 280) - 32, {}) &&
            lineOfSight(L, x, L.surfaceAt(x) - 45, x - 280, L.surfaceAt(x - 280) - 32, {})) { sx = x; break; }
      }
      e.x = sx; e.y = L.surfaceAt(sx);
      e.aimAngle = 0; e.dir = 1; e.awareness = 0;
      const sniper = b.allies.find((a) => a.role === 'sniper');
      const support = b.allies.find((a) => a.role === 'support');
      const probe = (a) => {
        for (const o of b.allies) { o.away = o !== a; o.x = o === a ? sx + 280 : -4000; o.y = o === a ? L.surfaceAt(sx + 280) : 620; o.stance = 'stand'; }
        e.awareness = 0; e.target = null; e.aiState = 'patrol';
        b.enemyPerceive(e);
        return e.awareness;
      };
      const supGain = probe(support);
      const snpGain = probe(sniper);
      // reset allies
      b.allies.forEach((a, i) => { a.x = 128 + i * 30; a.y = L.surfaceAt(a.x); });
      return { supGain: +supGain.toFixed(3), snpGain: +snpGain.toFixed(3),
        snipStealth: sniper.stealth, supStealth: support.stealth };
    });
    h.assert(r.supStealth < r.snipStealth, 'support has lower stealth stat than sniper');
    h.assert(r.supGain > r.snpGain, 'support soldier is noticed faster (' + r.supGain + ' > ' + r.snpGain + ')');
  });

  await h.test('heavily suppressed soldier physically cowers (render state)', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true;
      const u = b.allies.find((a) => !a.downed);
      u.suppression = 85;
      u.recentlyHit = 2.0; // fresh hit → stagger
      // render once and compare head height against a calm unit
      const probe = (unit, sup) => {
        unit.suppression = sup;
        const cv = document.createElement('canvas');
        cv.width = 140; cv.height = 140;
        const c = cv.getContext('2d');
        unit.x = 70; unit.y = 130; unit.stance = 'stand';
        Art.drawUnit(c, unit, 0, { shadow: false, scale: 1.5 });
        const d = c.getImageData(0, 0, 140, 140).data;
        // find the lowest opaque pixel row (feet) and topmost (helmet)
        let top = 140, bottom = 0;
        for (let y = 0; y < 140; y++) for (let x = 0; x < 140; x++) {
          if (d[(y * 140 + x) * 4 + 3] > 128) { if (y < top) top = y; if (y > bottom) bottom = y; }
        }
        return { top, bottom, height: bottom - top };
      };
      const calm = probe(u, 0);
      const cower = probe(u, 85);
      return { calmH: calm.height, cowerH: cower.height, shorter: cower.height < calm.height };
    });
    h.assert(r.shorter, 'suppressed soldier renders shorter/crouched (calm ' + r.calmH + 'px vs cower ' + r.cowerH + 'px)');
  });

  await h.test('results screen is localized in Persian', async () => {
    await h.newGame(page);
    await h.start(page, 'm01', 4);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      // eliminate the objective honestly (killAll completes it), then extract
      b.sandboxed = true;
      for (const e of b.enemies) if (!e.dead) b.killUnit(e, null);
      b.sandboxed = false;
      const evac = b.level.evac;
      for (const o of b.objectives) if (o.type === 'extract') o.progress = o.max;
      for (const a of b.aliveAllies) { a.x = evac.x - 25; a.y = b.level.surfaceAt(a.x); }
      for (let i = 0; i < 120 && !b.result; i++) b.update(1 / 60);
      if (b.result) { b.resultShown = true; b.ended = true; UI.showResults(b); }
      const screen = document.getElementById('screen-results');
      return {
        active: screen.classList.contains('is-active'),
        text: screen.textContent.slice(0, 400),
        lang: L10N.lang
      };
    });
    h.assert(r.active, 'results screen shown');
    h.assert(/عملیات موفق|عملیات ناموفق/.test(r.text), 'results title in Persian');
    h.assert(!/OPERATION (COMPLETE|FAILED)/.test(r.text), 'no raw English title leaks');
  });

  await h.test('barracks soldier cards carry Persian role and status', async () => {
    await page.evaluate(() => UI.leaveBattleToHub());
    await page.evaluate(() => UI.show('barracks'));
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#barracks-grid .soldier-card')];
      return {
        n: cards.length,
        roles: cards.map((c) => c.querySelector('.sc-role').textContent),
        tags: cards.map((c) => c.querySelector('.corner-tag').textContent)
      };
    });
    h.assert(r.n >= 6, 'full roster rendered (' + r.n + ')');
    h.assert(r.roles.some((x) => /فرمانده|تک‌تیرانداز|بهدار/.test(x)), 'roles in Persian: ' + r.roles.join(', '));
    h.assert(r.tags.some((x) => /آماده/.test(x)), 'status tags in Persian: ' + r.tags[0]);
  });

  h.assertClean(ctx);
  h.summary('v50-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
