'use strict';
/* Boot smoke: the single file loads offline with zero external requests. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  const info = await page.evaluate(() => ({
    hasSC: !!window.__SC,
    title: document.title,
    menuActive: document.querySelector('#screen-menu').classList.contains('is-active'),
    canvas: [document.querySelector('#stage').width, document.querySelector('#stage').height],
    version: typeof GAME_VERSION !== 'undefined' ? GAME_VERSION : null
  }));

  h.assert(info.hasSC, 'debug/testing API is present');
  h.assert(info.menuActive, 'main menu is the active screen on boot');
  h.assert(info.canvas[0] > 0 && info.canvas[1] > 0, 'render canvas is sized');
  h.assert(info.version != null, 'game version constant is defined');
  h.assertClean(ctx);

  h.assert(ctx.requests.length === 0, 'zero non-file requests on boot (offline)');
  await h.shot(page, 'boot-menu');
  h.summary('smoke');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
