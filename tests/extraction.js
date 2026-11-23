'use strict';
/* Extraction: requirement policies, HUD honesty, and end-of-mission gating. */
const h = require('./lib/harness');

async function fresh(page, id = 'm01', n = 6) {
  await h.newGame(page);
  await h.start(page, id, n);
  return page.evaluate(() => {
    const b = window.__SC.battle;
    b.sandboxed = true;
    b.paused = false;
    for (const e of b.enemies) if (!e.dead) b.killUnit(e, null);
    return { evac: b.level.evac, n: b.allies.filter((a) => !a.dead).length };
  });
}

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('default policy requires every living soldier at the pad', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      const req0 = b.extractRequirement();
      for (const a of b.allies) if (!a.dead) { a.x = evac.x - 30; a.y = b.level.surfaceAt(a.x); }
      const reqAll = b.extractRequirement();
      // one soldier stays behind
      const stray = b.allies.find((a) => !a.dead);
      stray.x = evac.x - 900; stray.y = b.level.surfaceAt(stray.x);
      const reqStray = b.extractRequirement();
      return { need0: req0.need, have0: req0.have, sat0: req0.satisfied, all: reqAll, stray: reqStray };
    }, setup);
    h.assert(r.need0 === r.have0 === false || r.sat0 === false, 'extraction not satisfied while the squad is deployed elsewhere');
    h.assert(r.all.satisfied === true, 'all survivors on the pad satisfies the policy');
    h.assert(r.stray.satisfied === false, 'one soldier short fails the check');
    h.assert(r.stray.have === r.all.have - 1, 'head count reflects the real positions');
  });

  await h.test('commander policy tracks the commander only', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      b.extractPolicy = 'commander';
      const cmd = b.allies.find((a) => a.role === 'commander') || b.allies[0];
      const others = b.allies.filter((a) => a !== cmd && !a.dead);
      for (const a of others) { a.x = evac.x - 30; a.y = b.level.surfaceAt(a.x); }
      const withoutCmd = b.extractRequirement();
      cmd.x = evac.x - 30; cmd.y = b.level.surfaceAt(cmd.x);
      const withCmd = b.extractRequirement();
      return { withoutCmd, withCmd };
    }, setup);
    h.assert(r.withoutCmd.satisfied === false, 'commander missing — extraction denied');
    h.assert(r.withCmd.satisfied === true, 'commander on station — extraction granted');
    h.assert(r.withCmd.need === 1, 'only one person is required');
  });

  await h.test('percentage policy extracts a fraction of the squad', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      b.extractPolicy = 'percent:0.5';
      const living = b.allies.filter((a) => !a.dead);
      const req0 = b.extractRequirement();
      living.slice(0, 3).forEach((a) => { a.x = evac.x - 30; a.y = b.level.surfaceAt(a.x); });
      const req3 = b.extractRequirement();
      return { need0: req0.need, sat0: req0.satisfied, need3: req3.need, sat3: req3.satisfied, label: req3.label };
    }, setup);
    h.assert(r.need0 === 3, '50% of six soldiers = 3 required');
    h.assert(r.sat0 === false, 'two or fewer on the pad is not enough');
    h.assert(r.sat3 === true, 'three on the pad passes');
    h.assert(/EXTRACT 50%/.test(r.label), 'label states the policy');
  });

  await h.test('vip policy requires the freed principal at the pad', async () => {
    const setup = await fresh(page, 'm02', 6);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      b.extractPolicy = 'vip';
      const vip = b.neutrals.find((n) => n.role === 'vip' || n.tag === 'vip') || b.neutrals[0];
      for (const a of b.allies) if (!a.dead) { a.x = evac.x - 30; a.y = b.level.surfaceAt(a.x); }
      const before = b.extractRequirement();
      b.releaseNeutral(vip);
      vip.x = evac.x - 900; vip.y = b.level.surfaceAt(vip.x);
      const vipFar = b.extractRequirement();
      vip.x = evac.x - 30; vip.y = b.level.surfaceAt(vip.x);
      const vipIn = b.extractRequirement();
      return { role: vip.role, before, vipFar, vipIn };
    }, setup);
    h.assert(r.before.satisfied === false, 'no freed VIP — extraction denied');
    h.assert(r.vipFar.satisfied === false, 'freed VIP still behind the lines');
    h.assert(r.vipIn.satisfied === true, 'VIP on the pad — extraction granted');
  });

  await h.test('mission does not end until the extraction policy is met', async () => {
    const setup = await fresh(page, 'm04', 5);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      // park hostiles far away instead of sandboxing: the result gate refuses
      // to fire in sandbox mode, and we want the real end-of-mission path
      for (const e of b.enemies) { e.x = -5000; e.y = 620; e.aiState = 'patrol'; e.awareness = 0; }
      b.sandboxed = false; // the result gate refuses to fire in sandbox mode
      for (const o of b.objectives) if (o.type === 'interact') { o.progress = o.max; }
      b.updateObjectives(0.05);
      const pre = { result: b.result, extracts: b.objectives.filter((o) => o.type === 'extract').map((o) => o.complete) };
      for (const a of b.aliveAllies) { a.x = evac.x - 25; a.y = b.level.surfaceAt(a.x); }
      for (let i = 0; i < 90 && !b.result; i++) b.update(1 / 60);
      return { pre, post: b.result && { success: b.result.success, reason: b.result.reason } };
    }, setup);
    h.assert(r.pre.result === null, 'objectives done but squad away: no result');
    h.assert(r.pre.extracts.every((e) => e === false), 'extract objective stays open');
    h.assert(r.post && r.post.success === true, 'squad on the pad completes the mission');
  });

  await h.test('downed soldiers can be carried into extraction to satisfy ALL', async () => {
    const setup = await fresh(page, 'm01', 4);
    const r = await page.evaluate(({ evac }) => {
      const b = window.__SC.battle;
      const casualty = b.allies[0];
      const carrier = b.allies[1];
      b.allies.forEach((a) => { a.medkits = 0; a.recoveringAuto = true; });
      for (const a of b.allies) if (a !== carrier && a !== casualty) { a.x = evac.x - 30; a.y = b.level.surfaceAt(a.x); }
      b.downUnit(casualty, null);
      carrier.x = evac.x - 300; carrier.y = b.level.surfaceAt(carrier.x);
      const reqCarry = b.extractRequirement();
      carrier.carryId = casualty.id; casualty.carriedBy = carrier.id; casualty.carried = true;
      carrier.x = evac.x - 25;
      const reqIn = b.extractRequirement();
      return { reqCarry: { sat: reqCarry.satisfied, detail: reqCarry.detail }, reqIn: { sat: reqIn.satisfied, have: reqIn.have } };
    }, setup);
    h.assert(r.reqCarry.sat === false, 'carrier alone is not enough while the casualty lies behind');
    h.assert(r.reqIn.sat === true, 'carried casualty counts once the carrier reaches the pad');
  });

  h.assertClean(ctx);
  h.summary('extraction');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
