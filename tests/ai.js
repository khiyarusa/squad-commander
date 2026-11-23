'use strict';
/* Enemy AI: FOV + LOS perception, hearing, memory, confidence, coordination, archetypes. */
const h = require('./lib/harness');

/* Fresh battle, sandboxed, one live rifleman enemy, cleared noise.
   Returns { ok, x } where x is a ground position with clean LOS both ways. */
async function fresh(page) {
  await h.newGame(page);
  await h.start(page, 'm01', 6);
  return page.evaluate(() => {
    const b = window.__SC.battle;
    b.sandboxed = true;
    b.paused = false;
    const live = b.enemies.find((e) => !e.dead);
    for (const e of b.enemies) if (e !== live && !e.dead) b.killUnit(e, null);
    live.aiState = 'patrol'; live.awareness = 0; live.target = null; live.lastSeen = null;
    live.alertPos = null; live.confidence = null; live.suppression = 0; live.stateT = 0;
    live.aimAngle = 0; live.dir = 1;
    b.noise = [];
    const L = b.level;
    const eyeOf = (x) => ({ x, y: L.surfaceAt(x) - 45 });
    const ctrOf = (x) => ({ x, y: L.surfaceAt(x) - 32 });
    for (let x = 300; x < L.width - 400; x += 20) {
      const e1 = eyeOf(x), c1 = ctrOf(x + 280), c2 = ctrOf(x - 280);
      if (lineOfSight(L, e1.x, e1.y, c1.x, c1.y, {}) &&
          lineOfSight(L, e1.x, e1.y, c2.x, c2.y, {})) {
        return { ok: true, x, id: live.id };
      }
    }
    return { ok: false, x: null, id: live.id };
  });
}

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('enemy acquires a target inside its field of view', async () => {
    const setup = await fresh(page);
    h.assert(setup.ok, 'a clear LOS stretch exists on the ground');
    const r = await page.evaluate(({ x, id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      const a = b.allies[0];
      // clear the field: every other ally parks far off-map
      for (const o of b.allies) if (o !== a) { o.x = -4000; o.y = 620; }
      a.x = x + 280; a.y = b.level.surfaceAt(a.x); a.stance = 'stand';
      e.x = x; e.y = b.level.surfaceAt(x);
      e.aimAngle = 0; e.dir = 1; e.awareness = 0; e.target = null; e.aiState = 'patrol';
      b.enemyPerceive(e); b.enemyPerceive(e);
      return { target: e.target && e.target.id, want: a.id, aware: +e.awareness.toFixed(2), state: e.aiState, los: lineOfSight(b.level, unitEye(e).x, unitEye(e).y, unitCenter(a).x, unitCenter(a).y, {}) };
    }, setup);
    h.assert(r.los, 'test setup has line of sight');
    h.assert(r.target === r.want, 'enemy targets the soldier in front of it');
    h.assert(r.aware >= 0.55, 'awareness crossed the acquire threshold (' + r.aware + ')');
    h.assert(r.state === 'alert', 'patrol enemy transitions to alert');
  });

  await h.test('a soldier behind the enemy stays unnoticed at first glance', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ x, id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      const a = b.allies[0];
      for (const o of b.allies) if (o !== a) { o.x = -4000; o.y = 620; }
      a.x = x - 280; a.y = b.level.surfaceAt(a.x); a.stance = 'stand';
      e.x = x; e.y = b.level.surfaceAt(x);
      e.aimAngle = 0; e.dir = 1; e.awareness = 0; e.target = null; e.aiState = 'patrol'; e.lastSeen = null;
      b.enemyPerceive(e);
      return { target: e.target && e.target.id, aware: +e.awareness.toFixed(2), lastSeen: !!e.lastSeen };
    }, setup);
    h.assert(!r.target, 'no acquisition from behind');
    h.assert(r.aware < 0.55, 'peripheral awareness stays low (' + r.aware + ')');
    h.assert(!r.lastSeen, 'no last-known position recorded');
  });

  await h.test('gunfire noise alerts a patrol that cannot see the shooter', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ x, id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      const a = b.allies[0];
      for (const o of b.allies) if (o !== a) { o.x = -4000; o.y = 620; }
      a.x = x + 640; a.y = 620; // beyond view range (600) but inside earshot (700)
      e.x = x; e.y = b.level.surfaceAt(x);
      e.aimAngle = 0; e.dir = 1; e.awareness = 0; e.target = null; e.aiState = 'patrol'; e.lastSeen = null; e.alertPos = null;
      b.noise = [];
      b.emitNoise(a.x, a.y - 40, 700, 'ally');
      b.enemyPerceive(e);
      return { state: e.aiState, aware: +e.awareness.toFixed(2), alertPos: e.alertPos, heardX: a.x, target: e.target && e.target.id };
    }, setup);
    h.assert(r.state === 'alert', 'patrol becomes alert after hearing shots');
    h.assert(r.aware >= 0.4, 'hearing raises awareness (' + r.aware + ')');
    h.assert(r.alertPos && Math.abs(r.alertPos.x - r.heardX) < 5, 'investigation point is the noise origin');
    h.assert(!r.target, 'hearing alone does not fabricate a visible target');
  });

  await h.test('losing sight keeps a memory and switches to search', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ x, id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      const a = b.allies[0];
      for (const o of b.allies) if (o !== a) { o.x = -4000; o.y = 620; }
      a.x = x + 280; a.y = b.level.surfaceAt(a.x);
      e.x = x; e.y = b.level.surfaceAt(x);
      e.aimAngle = 0; e.dir = 1; e.awareness = 0; e.target = null; e.aiState = 'patrol'; e.lastSeen = null;
      b.enemyPerceive(e); b.enemyPerceive(e);
      const hadTarget = e.target && e.target.id === a.id;
      const memory = e.lastSeen && { x: Math.round(e.lastSeen.x), y: Math.round(e.lastSeen.y) };
      // soldier breaks away far outside view; contact goes stale
      a.x = -4000; a.y = 620;
      e.lastSeenT = b.time - 3.5;
      b.enemyPerceive(e);
      return { hadTarget, memory, after: { target: e.target && e.target.id, state: e.aiState, lastSeen: e.lastSeen } };
    }, setup);
    h.assert(r.hadTarget, 'contact established first');
    h.assert(r.memory, 'last-known position stored');
    h.assert(!r.after.target, 'target dropped when out of sight too long');
    h.assert(r.after.state === 'search', 'enemy searches the last known position');
    h.assert(r.after.lastSeen, 'memory retained for the search');
  });

  await h.test('enemy commander presence raises squad confidence', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      e.suppression = 0;
      const boss = { id: 'boss_test', enemyType: 'commander', dead: false, x: e.x + 80, y: e.y };
      b.enemies.push(boss);
      const withBoss = b.enemyConfidence(e);
      boss.dead = true;
      const without = b.enemyConfidence(e);
      b.enemies.pop();
      return { withBoss: +withBoss.toFixed(3), without: +without.toFixed(3) };
    }, setup);
    h.assert(r.withBoss > r.without, 'warlord aura raises confidence (' + r.withBoss + ' vs ' + r.without + ')');
    h.assert(r.without > 0 && r.without <= 1, 'confidence is a clamped 0..1 value');
  });

  await h.test('coordinated alerting spreads contact to nearby hostiles', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ id }) => {
      const b = window.__SC.battle;
      const engaged = b.enemies.find((q) => q.id === id);
      engaged.aiState = 'engage';
      engaged.lastSeen = { x: engaged.x + 100, y: engaged.y };
      engaged.target = { id: 'test_target' };
      const buddy = { id: 'buddy_test', enemyType: 'rifleman', dead: false, x: engaged.x + 220, y: 620, aiState: 'patrol', stateT: 0, target: null };
      const far = { id: 'far_test', enemyType: 'rifleman', dead: false, x: engaged.x + 1900, y: 620, aiState: 'patrol', stateT: 0, target: null };
      b.enemies.push(buddy, far);
      b.time = 8.0; // inside the coordination window
      const rnd = Math.random;
      Math.random = () => 0; // make the coordination roll deterministic
      b.enemyCoord(engaged);
      Math.random = rnd;
      const out = { buddy: buddy.aiState, far: far.aiState };
      b.enemies.pop(); b.enemies.pop();
      return out;
    }, setup);
    h.assert(r.buddy === 'alert', 'nearby hostile is alerted by the engagement');
    h.assert(r.far === 'patrol', 'distant hostile is not alerted');
  });

  await h.test('enemy archetypes are distinct in stats and behaviour inputs', async () => {
    const r = await page.evaluate(() => {
      const types = {};
      for (const k in ENEMIES) {
        const t = ENEMIES[k];
        types[k] = { hp: t.hp, armor: t.armor, weapon: t.weapon, view: t.view };
      }
      return { count: Object.keys(ENEMIES).length, types };
    });
    h.assert(r.count >= 6, 'at least six archetypes exist (got ' + r.count + ')');
    const hps = Object.values(r.types).map((t) => t.hp);
    h.assert(new Set(hps).size >= 4, 'hit points differ between archetypes');
    const weps = new Set(Object.values(r.types).map((t) => t.weapon));
    h.assert(weps.size >= 3, 'archetypes carry at least three weapon classes');
    h.assert(r.types.heavy.hp > r.types.scout.hp, 'heavy out-tanks the scout');
    h.assert(r.types.sniper.view > r.types.rifleman.view, 'sniper sees farther than a rifleman');
  });

  await h.test('suppression drives pinned enemies out of aggression', async () => {
    const setup = await fresh(page);
    const r = await page.evaluate(({ id }) => {
      const b = window.__SC.battle;
      const e = b.enemies.find((q) => q.id === id);
      // stand next to a live cover so the pinned fallback has somewhere to go
      const cov = b.level.covers.find((c) => !c.dead);
      e.x = cov.x + 70; e.y = b.level.surfaceAt(e.x);
      e.aiState = 'engage'; e.stateT = 2; e.suppression = 80; e.target = b.allies[0];
      b.updateEnemyAI(e, 0.016);
      return { state: e.aiState, sup: e.suppression, pinned: e.suppression > 62, coverNear: !!b.level.covers.find((c) => !c.dead && Math.abs(c.x - e.x) < 260) };
    }, setup);
    h.assert(r.pinned, 'enemy is heavily suppressed');
    h.assert(r.coverNear, 'a cover point exists within the fallback radius');
    h.assert(r.state === 'cover', 'pinned enemy breaks off the frontal assault (now: ' + r.state + ')');
  });

  h.assertClean(ctx);
  h.summary('ai');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
