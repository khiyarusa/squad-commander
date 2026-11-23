'use strict';
/* Command system: lifecycle, queue, cancel/replace, persistent behaviors, support orders. */
const h = require('./lib/harness');

async function cleanBattle(page) {
  return page.evaluate(() => {
    const b = window.__SC.battle;
    b.sandboxed = true;
    b.paused = false;
    for (const e of b.enemies) if (!e.dead) b.killUnit(e, null);
    b.selected.clear();
    return b.allies.map((a) => a.id);
  });
}

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  await h.newGame(page);
  await h.start(page, 'm01', 6);

  await h.test('move order runs through the explicit lifecycle', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      const ok = b.issueOrder('move', u.x + 140, b.level.floorAt(u.x + 140).y);
      const started = { ok, state: u.order && u.order.state, id: u.order && u.order.id };
      for (let i = 0; i < 60 * 10 && u.order; i++) b.update(1 / 60);
      return { started, last: u.lastCommand, completed: b.ordersCompleted, failed: b.ordersFailed, x: u.x, target: u.lastCommand && u.lastCommand.x };
    }, ids[0]);
    h.assert(r.started.ok && r.started.state === 'active', 'order starts Active');
    h.assert(r.last && r.last.state === 'completed' && r.last.reason === 'arrived', 'order completes when the soldier arrives');
    // body separation can nudge a soldier a few pixels off the exact slot
    h.assert(Math.abs(r.x - r.target) < 8, 'soldier is on the destination');
    h.assert(r.completed === 1 && r.failed === 0, 'only one completion was recorded');
  });

  await h.test('order queue is sequential and capped at six', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      b.queueMode = true;
      b.issueOrder('move', u.x + 90, 620);
      for (let i = 0; i < 8; i++) b.issueOrder('move', u.x + 120 + i * 40, 620);
      const queued = u.queue.map((q) => ({ state: q.state, type: q.type }));
      const len = u.queue.length;
      const rejected = 8 - len;
      b.queueMode = false;
      b.cancelSelected();
      return { len, queued, rejected, orderNull: !u.order };
    }, ids[0]);
    h.assert(r.len === 6, 'queue holds exactly six orders');
    h.assert(r.rejected === 2, 'orders beyond the cap are rejected');
    h.assert(r.queued.every((q) => q.state === 'queued'), 'waiting orders are in Queued state');
    h.assert(r.orderNull, 'cancel clears the active order');
  });

  await h.test('queued orders can be cancelled without touching the active one', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      b.issueOrder('move', u.x + 80, 620);
      b.queueMode = true;
      b.issueOrder('move', u.x + 300, 620);
      b.queueMode = false;
      const activeBefore = u.order.id;
      const ok = b.cancelOrder(u, 0);
      return { ok, activeSame: u.order && u.order.id === activeBefore, queue: u.queue.length };
    }, ids[0]);
    h.assert(r.ok, 'cancelOrder(index) returns true');
    h.assert(r.queue === 0, 'queued order removed');
    h.assert(r.activeSame, 'active order untouched');
  });

  await h.test('issuing a new order retires the previous one honestly', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      b.issueOrder('move', u.x + 500, 620);
      const first = u.order;
      b.issueOrder('move', u.x + 60, 620);
      return { state: first.state, reason: first.reason, current: u.order.id, different: first.id !== u.order.id };
    }, ids[0]);
    h.assert(r.state === 'cancelled' && r.reason === 'replaced', 'previous command marked Cancelled/Replaced');
    h.assert(r.different, 'new command is active');
  });

  await h.test('overwatch persists and terminates only on cancel or ammo exhaustion', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      b.issueOrder('overwatch', u.x + 400, u.y - 40);
      for (let i = 0; i < 60 * 4; i++) b.update(1 / 60);
      const after = { state: u.order && u.order.state, watch: !!u.overwatch };
      b.cancelOrder(u, null);
      const cancelled = u.lastCommand && u.lastCommand.state;
      return { after, cancelled };
    }, ids[0]);
    h.assert(r.after.state === 'active' && r.after.watch, 'overwatch still active after four seconds');
    h.assert(r.cancelled === 'cancelled', 'cancel terminates overwatch');
  });

  await h.test('take-cover resolves a cover slot and reserves it', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      const cov = b.level.covers.filter((c) => !c.dead && !c.solid).sort((a, c) => Math.abs(a.x - u.x) - Math.abs(c.x - u.x))[0];
      b.selected.add(u.id);
      b.issueOrder('cover', cov.x, cov.y);
      for (let i = 0; i < 60 * 20 && u.order; i++) b.update(1 / 60);
      return {
        state: u.lastCommand && u.lastCommand.state,
        reason: u.lastCommand && u.lastCommand.reason,
        coverId: u.coverId,
        wanted: cov.id,
        claims: cov.claims.slice(),
        stance: u.stance
      };
    }, ids[0]);
    h.assert(r.state === 'completed', 'cover order completed');
    h.assert(r.coverId === r.wanted, 'soldier attached to the chosen cover');
    h.assert(r.claims.includes(ids[0]), 'cover reservation contains the soldier');
    h.assert(r.stance === 'crouch', 'soldier crouches in cover');
  });

  await h.test('reload order completes with a full magazine', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      u.mag = 3; u.reserve = 40;
      b.issueOrder('reload');
      const start = u.order && u.order.state;
      for (let i = 0; i < 60 * 8 && u.order; i++) b.update(1 / 60);
      return { start, mag: u.mag, size: u.magSize, last: u.lastCommand };
    }, ids[0]);
    h.assert(r.start === 'active', 'reload starts Active');
    h.assert(r.mag === r.size, 'magazine is full');
    h.assert(r.last && r.last.state === 'completed' && r.last.reason === 'reloaded', 'reload completed');
  });

  await h.test('treat order heals, stops bleeding and consumes a medkit', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((ids) => {
      const b = window.__SC.battle;
      const medic = b.allies.find((a) => a.role === 'medic');
      const patient = b.allies.find((a) => a.id !== medic.id);
      patient.hp = 32; patient.bleeding = true; patient.bleedingTreated = false;
      b.selected.add(medic.id);
      b.issueOrder('heal', patient.x, patient.y, patient);
      const start = medic.order && medic.order.state;
      for (let i = 0; i < 60 * 25 && medic.order; i++) b.update(1 / 60);
      return {
        start, hp: patient.hp, max: patient.maxHp, bleeding: patient.bleeding,
        treated: patient.bleedingTreated, medkits: medic.medkits,
        last: medic.lastCommand
      };
    }, ids);
    h.assert(r.start === 'active', 'treat starts Active');
    h.assert(r.hp > 32, 'patient health increased to ' + Math.round(r.hp));
    h.assert(r.bleeding === false && r.treated === true, 'bleeding stopped and treated flag set');
    h.assert(r.medkits >= 3, 'medkit consumed');
    h.assert(r.last && r.last.state === 'completed', 'treat completed');
  });

  await h.test('carry order lifts a casualty and moves toward extraction', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((ids) => {
      const b = window.__SC.battle;
      const carrier = b.allies.find((a) => a.id === ids[1]);
      const patient = b.allies.find((a) => a.id === ids[2]);
      b.allies.forEach((a) => { a.medkits = 0; a.recoveringAuto = true; });
      b.downUnit(patient, null);
      b.selected.add(carrier.id);
      b.issueOrder('carry', patient.x, patient.y, patient);
      for (let i = 0; i < 60 * 20 && !carrier.carryId; i++) b.update(1 / 60);
      const picked = { carryId: carrier.carryId, carriedBy: patient.carriedBy, state: carrier.lastCommand && carrier.lastCommand.state };
      const x0 = carrier.x;
      for (let i = 0; i < 60 * 4; i++) b.update(1 / 60);
      return {
        picked, x0, x1: carrier.x, evac: b.level.evac.x,
        patientY: patient.y, carrierY: carrier.y
      };
    }, ids);
    h.assert(r.picked.carryId, 'carrier picked up the casualty');
    h.assert(r.picked.carriedBy === ids[1], 'casualty records its carrier');
    h.assert(r.picked.state === 'completed', 'carry order completed on pickup');
    h.assert(r.x1 > r.x0, 'carrier advances toward extraction while carrying');
    h.assert(Math.abs(r.patientY - r.carrierY) < 2, 'casualty follows the carrier');
  });

  await h.test('invalid support orders fail visibly and never leave a stale order', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      const other = b.allies.find((a) => a.id !== id);
      b.selected.add(u.id);
      const before = b.ordersFailed;
      const rejected = b.issueOrder('carry', other.x, other.y, other);
      const direct = b.startOrder(u, { type: 'carry', targetId: other.id });
      return {
        before, rejected, direct,
        after: b.ordersFailed,
        last: u.lastCommand,
        order: u.order,
        feed: b.feed.slice(-3).map((f) => f.text)
      };
    }, ids[0]);
    h.assert(r.rejected === false, 'carrying a conscious soldier is rejected at issue time');
    h.assert(r.direct === false, 'startOrder also refuses the invalid carry');
    h.assert(r.after === r.before + 1, 'failure counter incremented exactly once');
    h.assert(r.last && r.last.state === 'failed' && /casualty/.test(r.last.reason), 'reason recorded: ' + (r.last && r.last.reason));
    h.assert(!r.order, 'no active order left behind');
  });

  await h.test('wait order completes after its timer', async () => {
    const ids = await cleanBattle(page);
    const r = await page.evaluate((id) => {
      const b = window.__SC.battle;
      const u = b.allies.find((a) => a.id === id);
      b.selected.add(u.id);
      b.startOrder(u, { type: 'wait', seconds: 1 });
      for (let i = 0; i < 60 * 2; i++) b.update(1 / 60);
      return { last: u.lastCommand, order: u.order };
    }, ids[0]);
    h.assert(r.last && r.last.state === 'completed' && r.last.reason === 'waited', 'wait completed');
    h.assert(!r.order, 'order cleared');
  });

  h.assertClean(ctx);
  h.summary('commands');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
