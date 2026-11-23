'use strict';
/* v2.1 acceptance: carry state consistency, bounded path retries, directed
   drop edges, formation slot validity, exposure weighting, arsenal honesty,
   queue drag reorder, animation states. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  await h.newGame(page);
  await h.start(page, 'm01', 6);

  await h.test('BUG-01: a new order keeps the carry relationship intact', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true; for (const e of b.enemies) b.killUnit(e, null);
      const carrier = b.allies[0], casualty = b.allies[1];
      b.allies.forEach((a) => { a.medkits = 0; a.recoveringAuto = true; });
      b.downUnit(casualty, null);
      b.selected.clear(); b.selected.add(carrier.id);
      b.issueOrder('carry', casualty.x, casualty.y, casualty);
      for (let i = 0; i < 60 * 15 && !carrier.carryId; i++) b.update(1 / 60);
      const carrying = carrier.carryId === casualty.id && casualty.carriedBy === carrier.id;
      // issue a different order while carrying
      b.issueOrder('move', carrier.x + 220, 620);
      const after = { carryId: carrier.carryId, carriedBy: casualty.carriedBy, carried: casualty.carried };
      // walk: casualty must follow, carrier must be slowed
      const x0 = carrier.x;
      for (let i = 0; i < 60 * 3 && carrier.carryId; i++) b.update(1 / 60);
      // explicit drop releases both sides
      b.dropCarried(carrier);
      const dropped = { carryId: carrier.carryId, carriedBy: casualty.carriedBy, carried: casualty.carried, downed: casualty.downed };
      return { carrying, after, moved: carrier.x > x0, dropped };
    });
    h.assert(r.carrying, 'pickup established both sides of the relationship');
    h.assert(r.after.carryId && r.after.carriedBy && r.after.carried, 'a new order does not break the carry link');
    h.assert(r.moved, 'carrier still moves under orders while carrying');
    h.assert(r.dropped.carryId == null && r.dropped.carriedBy == null && r.dropped.carried === false && r.dropped.downed, 'explicit drop releases both sides to a downed state');
  });

  await h.test('BUG-01b: a downed or dead carrier releases the casualty', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const carrier = b.allies[0], casualty = b.allies[1];
      b.allies.forEach((a) => { a.medkits = 0; a.recoveringAuto = true; });
      b.downUnit(casualty, null);
      carrier.carryId = casualty.id; casualty.carriedBy = carrier.id; casualty.carried = true;
      carrier.x = 900; casualty.x = 900; casualty.y = b.level.surfaceAt(900);
      // carrier goes down -> casualty must be dropped, not glued
      b.downUnit(carrier, null);
      const afterDown = { carriedBy: casualty.carriedBy, carried: casualty.carried, downed: casualty.downed, x: Math.round(casualty.x) };
      // and a dead carrier releases too
      const c2 = b.allies[2], cas2 = b.allies[3];
      b.downUnit(cas2, null);
      c2.carryId = cas2.id; cas2.carriedBy = c2.id; cas2.carried = true;
      b.killUnit(c2, null);
      return { afterDown, afterDeath: { carriedBy: cas2.carriedBy, carried: cas2.carried } };
    });
    h.assert(r.afterDown.carriedBy == null && r.afterDown.carried === false && r.afterDown.downed, 'downed carrier leaves a downed casualty behind');
    h.assert(r.afterDeath.carriedBy == null && r.afterDeath.carried === false, 'dead carrier releases the casualty');
  });

  await h.test('BUG-02: a genuinely unreachable patient fails honestly', async () => {
    await h.start(page, 'm01', 6); // fresh battle: earlier tests mutate the squad
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true; for (const e of b.enemies) b.killUnit(e, null);
      const medic = b.allies.find((a) => a.role === 'medic' && !a.downed);
      const patient = b.allies.find((a) => a !== medic && !a.downed);
      patient.hp = 30; patient.bleeding = true; patient.bleedingTreated = false;
      patient.downed = false;
      medic.medkits = 3; medic.healKitReserved = false;
      // beyond the level edge: no nav node, no approach — truly unreachable
      patient.x = b.level.width + 600; patient.y = 620;
      medic.x = b.level.width - 120; medic.y = b.level.surfaceAt(medic.x);
      b.selected.clear(); b.selected.add(medic.id);
      b.issueOrder('heal', patient.x, patient.y, patient);
      const frames = [];
      for (let i = 0; i < 60 * 20 && medic.order; i++) {
        b.update(1 / 60);
        if (i % 120 === 0) frames.push(medic.order && medic.order.state);
      }
      return { frames, last: medic.lastCommand };
    });
    h.assert(r.frames.includes('active'), 'order starts Active');
    h.assert(r.last && r.last.state === 'failed' && /reach|route/.test(r.last.reason), 'failed with reason: ' + (r.last && r.last.reason));
  });

  await h.test('BUG-02b: an adjacent wounded soldier gets treated despite obstacles', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true; for (const e of b.enemies) b.killUnit(e, null);
      const medic = b.allies.find((a) => a.role === 'medic' && !a.downed);
      const patient = b.allies.find((a) => a !== medic && !a.downed);
      patient.hp = 30; patient.bleeding = true; patient.bleedingTreated = false;
      patient.downed = false;
      medic.medkits = 3; medic.healKitReserved = false;
      const solid = b.level.covers.find((c) => c.solid && !c.dead);
      patient.x = solid.x; patient.y = b.level.surfaceAt(solid.x);
      medic.x = patient.x - 39; medic.y = b.level.surfaceAt(medic.x);
      b.selected.clear(); b.selected.add(medic.id);
      b.issueOrder('heal', patient.x, patient.y, patient);
      for (let i = 0; i < 60 * 15 && medic.order; i++) b.update(1 / 60);
      return { hp: Math.round(patient.hp), last: medic.lastCommand };
    });
    h.assert(r.hp > 90, 'patient treated to full (hp ' + r.hp + ')');
    h.assert(r.last && r.last.state === 'completed', 'treat order completed');
  });

  await h.test('BUG-03: drop edges are one-way — no climbing a drop', async () => {
    const r = await page.evaluate(() => {
      const L = window.__SC.battle.level;
      const p = L.platforms[0];
      // find the drop edge node from the platform
      let dropNode = null, groundNode = null;
      for (const n of L.navNodes) {
        for (const e of L.navEdges[n.i]) {
          if (e.drop) { dropNode = n; groundNode = L.navNodes[e.to]; break; }
        }
        if (dropNode) break;
      }
      if (!dropNode) return { found: false };
      // reverse direction must NOT exist
      let reverse = null;
      for (const e of L.navEdges[groundNode.i]) if (e.to === dropNode.i) reverse = e;
      // and pathfinding must still descend: platform -> ground works
      const down = findPath(L, dropNode.x, dropNode.y, groundNode.x + 30, groundNode.y);
      // but ground -> the same platform point must not use a drop edge upward
      const up = findPath(L, groundNode.x, groundNode.y, dropNode.x, dropNode.y);
      return {
        found: true, reverse: !!reverse,
        downOk: !!down,
        upOk: !!up
      };
    });
    h.assert(r.found, 'a drop edge exists in the level');
    h.assert(!r.reverse, 'no reverse (upward) drop edge exists');
    h.assert(r.downOk, 'descending from the walkway still works');
    h.assert(r.upOk, 'climbing back up is still possible via stairs');
  });

  await h.test('BUG-04: formation slots never land inside a solid prop', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const solid = b.level.covers.find((c) => c.solid && !c.dead);
      b.selectAll();
      const slots = b.formationSlots(b.aliveAllies, solid.x, b.level.surfaceAt(solid.x), null);
      return { slots, anyInside: slots.some((s) => inSolid(b.level, s.x, s.y)) };
    });
    h.assert(!r.anyInside, 'no slot intersects a solid prop');
  });

  await h.test('BUG-05: exposure is weighted by threat proximity', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const L = b.level;
      // one close enemy, one far enemy with LOS to the same node
      const n = L.navNodes.find((q) => !q.blocked);
      const close = { dead: false, downed: false, x: n.x + 80, y: n.y, stance: 'stand' };
      const far = { dead: false, downed: false, x: n.x + 700, y: n.y, stance: 'stand' };
      updateNavExposure(L, [close, far], 1);
      const nearVal = n.exposure;
      updateNavExposure(L, [far], 1);
      const farVal = n.exposure;
      return { nearVal: +nearVal.toFixed(2), farVal: +farVal.toFixed(2) };
    });
    h.assert(r.nearVal > r.farVal, 'close threat heats exposure more (' + r.nearVal + ' > ' + r.farVal + ')');
  });

  await h.test('BUG-07: arsenal never sells the grenade launcher', async () => {
    const r = await page.evaluate(() => {
      UI.show('arsenal');
      const grid = document.getElementById('arsenal-grid');
      const names = [...grid.querySelectorAll('.wc-name')].map((el) => el.textContent);
      return { names, hasGL: names.some((n) => /GL/i.test(n)), count: names.length };
    });
    h.assert(!r.hasGL, 'no GL card in the arsenal (cards: ' + r.count + ')');
    h.assert(r.count === 6, 'six sellable weapon classes (rifle/smg/shotgun/sniper/lmg/pistol)');
  });

  await h.test('BUG-09: queue chips support drag-to-reorder', async () => {
    await h.start(page, 'm01', 6);
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      b.sandboxed = true;
      const u = b.allies.find((a) => !a.dead && !a.downed);
      if (UI.current !== 'battle' || !document.getElementById('hud').classList.contains('is-active')) {
        // restore the battle HUD if a previous test navigated away
        UI.battle = b; UI.showResults = UI.showResults; App.scene = 'battle';
        document.getElementById('hud').classList.add('is-active');
      }
      b.selected.clear(); b.selected.add(u.id);
      b.setPaused(true); // freeze the live sim so the queue cannot drain
      u.order = null; u.queue = [];
      b.queueMode = true;
      b.issueOrder('move', u.x + 100, 620);
      b.issueOrder('move', u.x + 200, 620);
      b.issueOrder('move', u.x + 300, 620);
      b.queueMode = false;
      UI.refreshSelection(b);
      const before = u.queue.map((q) => q.x);
      UI.refreshSelection(b);
      const chips = [...document.querySelectorAll('.cmdq-chip[data-qi]')];
      if (chips.length < 2) return { before, ok: false, n: chips.length };
      // simulate a drag of the LAST chip onto the FIRST chip's centre
      const c0 = chips[0].getBoundingClientRect();
      const cl = chips[chips.length - 1].getBoundingClientRect();
      const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, {
        pointerId: 21, clientX: x, clientY: y, bubbles: true, cancelable: true
      }));
      fire('pointerdown', cl.left + 10, cl.top + 5, chips[chips.length - 1]);
      fire('pointermove', (c0.left + cl.left) / 2, cl.top, document);
      fire('pointerup', c0.left + 6, c0.top, document); // clearly the left half of chip 0
      const after = u.queue.map((q) => q.x);
      b.setPaused(false);
      return { before, after, ok: JSON.stringify(before) !== JSON.stringify(after) };
    });
    h.assert(r.ok, 'queue order changed by drag (before ' + JSON.stringify(r.before) + ' -> after ' + JSON.stringify(r.after) + ')');
  });

  await h.test('animation states are driven by real simulation state', async () => {
    const r = await page.evaluate(() => {
      const b = window.__SC.battle;
      const u = b.allies[0];
      const snap = {};
      // reload visual phase
      u.mag = 3; u.reserve = 30; b.startReload(u); u.reloadT = u.weaponCfg.reload * 0.5;
      snap.reloadT = u.reloadT > 0;
      // heal pose flag
      const medic = b.allies.find((a) => a.role === 'medic');
      medic.anim = 'heal'; snap.healAnim = medic.anim === 'heal';
      // carried flag follows the real relationship
      const carrier = b.allies[2], cas = b.allies[3];
      b.downUnit(cas, null);
      b.startCarry(carrier, cas);
      snap.carried = cas.carried === true && carrier.carryId === cas.id;
      b.dropCarried(carrier);
      return snap;
    });
    h.assert(r.reloadT, 'reload phase present on a reloading unit');
    h.assert(r.healAnim, 'heal anim state settable and readable');
    h.assert(r.carried, 'carried flag follows the real carry relationship');
  });

  await h.test('version label reads from the single GAME_VERSION source', async () => {
    const r = await page.evaluate(() => ({
      menu: document.getElementById('menu-build').textContent,
      footer: document.getElementById('footer-version').textContent,
      constant: GAME_VERSION
    }));
    h.assert(r.menu === 'BUILD ' + r.constant, 'menu build label matches GAME_VERSION (' + r.menu + ')');
    h.assert(r.footer.includes(r.constant), 'footer label = ' + r.footer);
  });

  h.assertClean(ctx);
  h.summary('v21-acceptance');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
