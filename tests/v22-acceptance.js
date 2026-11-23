'use strict';
/* v2.2 acceptance: Persian RTL default, credits, safe reachability repair, stall safety. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('Persian is the default language with genuine RTL', async () => {
    const r = await page.evaluate(() => ({
      lang: L10N.lang,
      htmlDir: document.documentElement.dir,
      htmlLang: document.documentElement.lang,
      newBtn: document.querySelector('[data-act="new"]') ? document.querySelector('[data-act="new"]').textContent : null,
      creditsBtn: !!document.querySelector('[data-act="credits"]'),
      faFont: getComputedStyle(document.body).fontFamily.includes('Vazirmatn')
    }));
    h.assert(r.lang === 'fa', 'default language fa');
    h.assert(r.htmlDir === 'rtl' && r.htmlLang === 'fa', 'html dir=rtl lang=fa');
    h.assert(r.newBtn && r.newBtn.indexOf('عملیات') >= 0, 'menu button localized: ' + r.newBtn);
    h.assert(r.creditsBtn, 'credits button present');
    h.assert(r.faFont, 'Vazirmatn applied');
  });

  await h.test('credits screen shows the creator exactly', async () => {
    await page.evaluate(() => UI.show('credits'));
    const r = await page.evaluate(() => ({
      active: document.getElementById('screen-credits').classList.contains('is-active'),
      made: document.querySelector('.credits-name').textContent,
      tg: document.querySelector('.credits-row[href*="t.me"]') && document.querySelector('.credits-row[href*="t.me"]').href,
      rb: document.querySelector('.credits-row[href*="rubika"]') && document.querySelector('.credits-row[href*="rubika"]').href
    }));
    h.assert(r.active, 'credits screen activates');
    h.assert(r.made.indexOf('Amin') >= 0, 'creator name present: ' + r.made);
    h.assert(r.tg && r.tg.indexOf('t.me/Mozrd') > 0, 'telegram @Mozrd linked');
    h.assert(r.rb && r.rb.indexOf('angosht0') > 0, 'rubika @angosht0 linked');
    await h.shot(page, 'v22-credits-fa');
  });

  await h.test('language switch to English restores LTR and back', async () => {
    await page.evaluate(() => L10N.setLang('en'));
    const en = await page.evaluate(() => ({
      dir: document.documentElement.dir,
      sample: document.querySelector('[data-act="new"]').textContent
    }));
    h.assert(en.dir === 'ltr', 'switching to en sets LTR');
    h.assert(/Operation|New/i.test(en.sample), 'en label applied: ' + en.sample);
    await page.evaluate(() => L10N.setLang('fa'));
    const fa = await page.evaluate(() => document.documentElement.dir);
    h.assert(fa === 'rtl', 'switching back restores RTL');
  });

  await h.test('reachability repair is surgical — unrelated cover survives', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const L = b.level;
      const solidsAlive0 = L.covers.filter((c) => c.solid && !c.dead).length;
      const report = L.navReport || {};
      return {
        solidsAlive0,
        removed: report.removedSolids != null ? report.removedSolids : 'n/a',
        reachable: report.reachable,
        solidsAliveNow: L.covers.filter((c) => c.solid && !c.dead).length,
        destroyedAll: L.covers.filter((c) => c.solid).every((c) => c.dead)
      };
    });
    h.assert(r.reachable !== false, 'level validated reachable (report: ' + JSON.stringify(r.reachable) + ')');
    h.assert(!r.destroyedAll, 'repair did not destroy every solid in the level');
    h.assert(r.solidsAliveNow > 0, 'cover layout preserved (' + r.solidsAliveNow + ' solids alive)');
  });

  await h.test('stall guard never bypasses through a wall', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true; for (const e of b.enemies) b.killUnit(e, null);
      const u = b.allies.find((a) => !a.dead && !a.downed);
      // pin the unit at the left bound with waypoints beyond it, and a solid
      // covering the escape line — the guard must refuse to bypass
      const solid = b.level.covers.find((c) => c.solid && !c.dead);
      u.x = 12; u.y = b.level.surfaceAt(12);
      solid.x = 70; solid.y = b.level.surfaceAt(70);
      u.path = [
        { x: 12, y: u.y, surface: 'ground' },
        { x: 5, y: u.y, surface: 'ground' },
        { x: 70, y: b.level.surfaceAt(70), surface: 'ground' }
      ];
      u.pathI = 1; u.stallT = 2; // pre-load the stall timer, target beyond the bound
      const x0 = u.x;
      b.moveAlongPath(u, 1 / 60, 1);
      const crossed = u.x > solid.x - solid.w / 2; // passed into the solid footprint?
      return { x0, x1: +u.x.toFixed(1), crossed, pathCleared: !u.path, stalled: !!u.stalled };
    });
    h.assert(!r.crossed, 'stall bypass refused to walk through the solid (x ' + r.x0.toFixed(0) + ' -> ' + r.x1 + ')');
    h.assert(r.stalled, 'stall marked for the order layer');
  });

  await h.test('perf HUD toggles from settings and reports frame stats', async () => {
    await page.evaluate(() => { Campaign.settings.diagnostics = true; });
    await page.waitForTimeout(400); // let the render loop apply the HUD
    const on = await page.evaluate(() => {
      const el = document.getElementById('perf-hud');
      return { display: el.style.display, text: el.textContent };
    });
    h.assert(on.display === 'block', 'HUD visible with diagnostics on');
    h.assert(/FPS/.test(on.text) && /frame/.test(on.text), 'HUD reports FPS and frame time: ' + JSON.stringify(on.text));
    const fps = parseInt((on.text.match(/FPS ~(\d+)/) || [])[1], 10);
    h.assert(fps > 0 && fps <= 240, 'FPS reading plausible (' + fps + ')');
    await page.evaluate(() => { Campaign.settings.diagnostics = false; });
    await page.waitForTimeout(400);
    const off = await page.evaluate(() => document.getElementById('perf-hud').style.display);
    h.assert(off === 'none', 'HUD hidden with diagnostics off');
  });

  h.assertClean(ctx);
  h.summary('v22-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
