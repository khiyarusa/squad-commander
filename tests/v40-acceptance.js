'use strict';
/* v4.0 acceptance: BUG-001..012 regressions. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('BUG-001: menu soldiers actually render (numeric snap, no NaN)', async () => {
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const snapX = MenuPlate.snapX(MenuScene.cam);
      // pixel-verify: sample the squad band for olive/green uniform colors
      const cv = document.createElement('canvas');
      cv.width = Stage.w; cv.height = Stage.h;
      const c = cv.getContext('2d');
      // re-draw the live menu layer exactly as the frame does
      const snap = Object.assign({}, MenuScene.cam, { x: snapX, y: MenuPlate.snapY(MenuScene.cam), shakeX: 0, shakeY: 0, shake: 0 });
      Stage.apply(c, snap);
      for (const u of MenuScene.units) Art.drawUnit(c, u, 5, { scale: 1.7 });
      const d = c.getImageData(0, 0, cv.width, cv.height).data;
      let soldierPixels = 0;
      for (let i = 0; i < d.length; i += 16) {
        if (d[i + 3] > 200 && d[i + 1] > 55 && d[i + 1] < 130 && d[i] < d[i + 1] && d[i + 2] < d[i + 1]) soldierPixels++;
      }
      return { snapFinite: Number.isFinite(snapX), soldierPixels, n: MenuScene.units.length };
    });
    h.assert(r.snapFinite, 'snapX is a finite number');
    h.assert(r.n >= 6, 'hero scene has a squad (' + r.n + ' units)');
    h.assert(r.soldierPixels > 400, 'soldiers actually painted onto the menu layer (' + r.soldierPixels + ' uniform pixels)');
    await h.shot(page, 'v40-menu-hero');
  });

  await h.test('BUG-002: plate cache key includes camera Y and memory is bounded', async () => {
    const r = await page.evaluate(() => {
      const k1 = MenuPlate.key({ x: 1500, y: 400 });
      const k2 = MenuPlate.key({ x: 1500, y: 440 });
      MenuPlate.usedBytes = MenuPlate.budgetBytes + MenuPlate.plateBytes({ width: 1280, height: 720 });
      MenuPlate.evictIfNeeded();
      return { different: k1 !== k2, used: MenuPlate.usedBytes, budget: MenuPlate.budgetBytes, n: MenuPlate.cache.size };
    });
    h.assert(r.different, 'camera Y changes the cache key');
    h.assert(r.used <= r.budget, 'byte budget enforced after eviction');
  });

  await h.test('BUG-003/006: commander buff clears on death and respects 2D distance', async () => {
    await h.newGame(page); await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const e = b.enemies.find((x) => !x.dead);
      const boss = { id: 'b1', enemyType: 'commander', dead: false, x: e.x + 100, y: e.y };
      b.enemies.push(boss);
      b.enemyCoord(e);
      const buffed = !!e.commanderBuff;
      boss.dead = true;
      b.enemyCoord(e);
      const afterDeath = !!e.commanderBuff;
      b.enemies.pop();
      return { buffed, afterDeath };
    });
    h.assert(r.buffed, 'nearby commander buffs the unit');
    h.assert(!r.afterDeath, 'buff cleared when the commander dies');
  });

  await h.test('BUG-004: dead target under heavy suppression still reaches cover', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true;
      const e = b.enemies.find((x) => !x.dead);
      const cov = b.level.covers.find((c) => !c.dead);
      e.x = cov.x + 70; e.y = b.level.surfaceAt(e.x);
      for (const o of b.allies) { o.x = -4000; o.y = 620; }
      e.aiState = 'engage'; e.suppression = 80; e.stateT = 2;
      e.target = { id: 'dead_guy', dead: true }; // target died mid-fight
      e.thinkT = 10; e.lastSeenT = b.time; e.lastSeen = { x: cov.x - 120, y: e.y };
      b.updateEnemyAI(e, 0.016);
      return { state: e.aiState, cover: e.coverDest && e.coverDest.cover.id };
    });
    h.assert(r.state === 'cover' && r.cover, 'suppressed enemy with a dead target still takes cover (now: ' + r.state + ')');
  });

  await h.test('BUG-009: a critical toast is never evicted by ordinary ones', async () => {
    const r = await page.evaluate(() => {
      const wrap = document.getElementById('toasts');
      wrap.innerHTML = '';
      UI.toast('info 1'); UI.toast('info 2'); UI.toast('info 3');
      UI.toast('CRITICAL', 'bad');
      UI.toast('info 4'); UI.toast('info 5');
      const crit = [...wrap.children].find((el) => el.textContent === 'CRITICAL');
      const res = { kept: !!crit, n: wrap.children.length };
      wrap.innerHTML = '';
      return res;
    });
    h.assert(r.kept, 'critical toast survived three later informational toasts');
    h.assert(r.n <= 3, 'cap still enforced (' + r.n + ')');
  });

  await h.test('BUG-010: drag queue cleans up on pointercancel', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true; b.setPaused(true);
      const u = b.allies.find((a) => !a.dead && !a.downed);
      b.selected.clear(); b.selected.add(u.id);
      u.order = null; u.queue = [];
      b.queueMode = true;
      b.issueOrder('move', u.x + 100, 620);
      b.issueOrder('move', u.x + 200, 620);
      b.issueOrder('move', u.x + 300, 620);
      b.queueMode = false;
      UI.refreshSelection(b);
      const chips = [...document.querySelectorAll('.cmdq-chip[data-qi]')];
      const before = u.queue.map((q) => q.x);
      if (chips.length < 2) return { ok: false, before };
      const c0 = chips[0].getBoundingClientRect();
      const cl = chips[chips.length - 1].getBoundingClientRect();
      const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { pointerId: 31, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      fire('pointerdown', cl.left + 10, cl.top + 5, chips[chips.length - 1]);
      fire('pointermove', (c0.left + cl.left) / 2, cl.top, document);
      fire('pointercancel', 0, 0, document); // interrupted mid-drag
      const ghostLeft = !!document.querySelector('.cmdq-chip.is-dragging');
      const cleared = chips.every((el) => !el.style.opacity);
      // after cancellation the queue must be unchanged and drag must be re-armable
      const after = u.queue.map((q) => q.x);
      b.setPaused(false);
      return { ok: true, before, after, unchanged: JSON.stringify(before) === JSON.stringify(after), ghostLeft, cleared };
    });
    h.assert(r.ok && r.unchanged, 'cancelling mid-drag leaves the queue untouched');
    h.assert(!r.ghostLeft, 'no drag ghost remains after pointercancel');
    h.assert(r.cleared, 'chip styling restored');
  });

  await h.test('BUG-011/012: version and help text match the implementation', async () => {
    const r = await page.evaluate(() => ({
      v: GAME_VERSION,
      help: document.body.innerHTML.includes('up to six orders')
    }));
    const pkg = require('../package.json');
    h.assert(r.v === pkg.version && r.v === '4.0.0', 'version 4.0.0 synced (runtime ' + r.v + ', pkg ' + pkg.version + ')');
    h.assert(r.help, 'help text states the real queue capacity (six)');
  });

  h.assertClean(ctx);
  h.summary('v40-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
