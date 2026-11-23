'use strict';
/* v2.3 acceptance: menu rebirth, version single-source, asset pipeline, plate cache. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('main menu is rebuilt as the cinematic command center', async () => {
    const r = await page.evaluate(() => ({
      panel: !!document.querySelector('.mm-panel'),
      hero: !!document.querySelector('.mm-hero'),
      ctas: document.querySelectorAll('.mm-cta').length,
      utils: document.querySelectorAll('.mm-util').length,
      oldClutter: {
        brandline: !!document.querySelector('.menu-brandline'),
        grain: !!document.querySelector('#screen-menu .grain'),
        oldActions: !!document.querySelector('.menu-actions')
      },
      build: document.getElementById('menu-build').textContent
    }));
    h.assert(r.panel && r.hero, 'new menu structure present');
    h.assert(r.ctas === 3, 'exactly three primary CTAs (got ' + r.ctas + ')');
    h.assert(r.utils === 4, 'secondary utilities in a compact nav (got ' + r.utils + ')');
    h.assert(!r.oldClutter.brandline && !r.oldClutter.oldActions && !r.oldClutter.grain, 'old clutter removed');
    h.assert(r.build === 'BUILD 2.3.0', 'build label from single source (' + r.build + ')');
    await h.shot(page, 'v23-menu-final');
  });

  await h.test('save card reflects the real campaign state', async () => {
    const empty = await page.evaluate(() => document.getElementById('mm-save').textContent);
    h.assert(/آغاز نشده|No campaign/.test(empty), 'empty state before a campaign exists');
    await h.newGame(page);
    await page.evaluate(() => { UI.renderMenu(); });
    const filled = await page.evaluate(() => ({
      text: document.getElementById('mm-save').textContent,
      hasCampaign: !!Campaign.data
    }));
    h.assert(filled.hasCampaign && /\d+\/12/.test(filled.text), 'save card shows campaign progress: ' + filled.text.replace(/\s+/g, ' ').slice(0, 80));
  });

  await h.test('version is single-sourced across package, build and runtime', async () => {
    const r = await page.evaluate(() => GAME_VERSION);
    const pkg = require('../package.json');
    h.assert(r === pkg.version, 'GAME_VERSION (' + r + ') === package.json (' + pkg.version + ')');
    h.assert(r === '2.3.0', 'release version 2.3.0');
  });

  await h.test('menu hero plate renders through the cache', async () => {
    const r = await page.evaluate(() => ({
      cache: MenuPlate.cache.size,
      canvasBacked: (() => { const e = MenuPlate.cache.values().next().value; return !!e && e.cv && e.cv.width > 0; })()
    }));
    h.assert(r.cache >= 1, 'plate cache populated (' + r.cache + ' entries)');
    h.assert(r.canvasBacked, 'plate entries are backed by offscreen canvases');
  });

  await h.test('hub title and subtitle are localized', async () => {
    await page.evaluate(() => UI.show('hub'));
    const r = await page.evaluate(() => ({
      title: document.querySelector('#screen-hub .screen-title').textContent,
      sub: document.getElementById('hub-sub').textContent
    }));
    h.assert(r.title === 'عملیات‌ها', 'hub title Persian: ' + r.title);
    h.assert(/nightjar/i.test(r.sub) && !/ready for tasking/.test(r.sub), 'hub sub Persian: ' + r.sub);
    await page.evaluate(() => L10N.setLang('en'));
    const en = await page.evaluate(() => document.querySelector('#screen-hub .screen-title').textContent);
    h.assert(en === 'Operations', 'hub title switches to English');
    await page.evaluate(() => L10N.setLang('fa'));
  });

  h.assertClean(ctx);
  h.summary('v23-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
