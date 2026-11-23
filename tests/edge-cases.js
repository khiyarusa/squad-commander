const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';
const ok = (name, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${extra ? ' :: ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERR:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERR:', m.text()); } });
  page.on('dialog', (d) => d.accept());
  await page.goto(FILE);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__SC.newCampaign('veteran'));

  // --- edge 1: ammo dry -> sidearm fallback
  await page.evaluate(() => window.__SC.startMission('m01', 4));
  await page.evaluate(() => {
    const b = UI.battle; const u = b.allies[0];
    u.mag = 0; u.reserve = 0; b.startReload(u);
  });
  await page.evaluate(() => window.__SC.step(0.5));
  let r = await page.evaluate(() => { const u = UI.battle.allies[0]; return { weapon: u.weaponCfg.id, mag: u.mag, fallback: !!u.fallbackPistol }; });
  ok('dry weapon falls back to sidearm', r.weapon === 'pistol' && r.mag > 0, JSON.stringify(r));

  // --- edge 2: commander incapacitated -> succession
  await page.evaluate(() => {
    const b = UI.battle; const cmd = b.allies.find(a => a.role === 'commander');
    b.damageUnit(cmd, 500, b.enemies[0] ? b.enemies[0].id : null, cmd.x, cmd.y - 30, {});
  });
  await page.evaluate(() => window.__SC.step(0.2));
  r = await page.evaluate(() => ({
    commanderAlive: UI.battle.commanderAlive,
    feed: UI.battle.feed.map(f => f.text).join(' | '),
    cmdState: UI.battle.allies.find(a => a.role === 'commander').state
  }));
  ok('commander down triggers succession / coordination loss', !r.commanderAlive && /TAKES COMMAND|IS DOWN|WIPED/.test(r.feed), r.feed.slice(0, 120));

  // --- edge 3: cover destroyed while occupied
  await page.evaluate(() => {
    const b = UI.battle;
    const u = b.aliveAllies.find(a => !a.downed);
    const cov = b.level.covers.find(c => !c.dead);
    u.x = cov.x - cov.w / 2 - 10; u.y = b.level.surfaceAt(u.x);
    b.attachCover(u, cov.id);
    cov.hp = 1;
    b.damageCover = null;
    // shoot the cover
    b.handleImpact({ team: 'enemy', dmg: 400 }, 'cover', null, cov, cov.x, cov.y - cov.h / 2);
  });
  r = await page.evaluate(() => {
    const b = UI.battle; const cov = b.level.covers.find(c => c.dead);
    const occ = b.allies.find(a => a.coverId && !b.level.covers.find(c => c.id === a.coverId));
    return { someDead: !!cov, dangling: !!occ };
  });
  ok('cover destruction clears occupants', r.someDead && !r.dangling, JSON.stringify(r));

  // --- edge 4: extract mission does not complete until extraction
  await page.evaluate(() => UI.abortBattle());
  await page.evaluate(() => window.__SC.startMission('m04', 5));
  await page.evaluate(() => window.__SC.clearEnemies());
  await page.evaluate(() => {
    const b = UI.battle;
    for (const o of b.objectives) {
      if (o.type === 'interact') o.progress = o.max; // charges set
    }
  });
  await page.evaluate(() => window.__SC.step(0.5));
  r = await page.evaluate(() => ({
    result: UI.battle.result ? UI.battle.result.success : null,
    extracts: UI.battle.objectives.filter(o => o.type === 'extract').map(o => o.complete),
    allies: UI.battle.aliveAllies.length
  }));
  ok('killAll+interact done but extraction pending', r.result === null && r.extracts.every(e => !e), JSON.stringify(r));
  await page.evaluate(() => {
    const b = UI.battle;
    const evac = b.level.evac;
    for (const u of b.aliveAllies) { u.x = evac.x - 20; u.y = b.level.surfaceAt(u.x); }
  });
  await page.evaluate(() => window.__SC.step(1));
  r = await page.evaluate(() => UI.battle.result ? UI.battle.result.success : null);
  ok('extraction completes mission', r === true, String(r));

  // --- edge 5: paused battle freezes projectiles/explosions
  await page.evaluate(() => UI.abortBattle());
  await page.evaluate(() => window.__SC.startMission('m01', 4));
  await page.evaluate(() => {
    const b = UI.battle; b.setPaused(true);
    const u = b.aliveAllies[0];
    b.projectiles.push({ kind: 'grenade', x: u.x + 60, y: u.y - 60, vx: -160, vy: 0, team: 'enemy', ownerId: 'x', dmg: 60, life: 2, fuse: 2, gravity: 640, radius: 110, trail: [], traveled: 0 });
  });
  await page.evaluate(() => { const b = UI.battle; for (let i = 0; i < 30; i++) b.update(1 / 60); });
  r = await page.evaluate(() => {
    const b = UI.battle; const u = b.allies[0];
    return { paused: b.paused, hp: Math.round(u.hp), max: u.maxHp, projectiles: b.projectiles.length };
  });
  ok('grenade frozen while paused', r.hp === r.max && r.projectiles === 1, JSON.stringify(r));
  await page.evaluate(() => { UI.battle.setPaused(false); window.__SC.step(0.8); });
  r = await page.evaluate(() => Math.round(UI.battle.allies[0].hp) < UI.battle.allies[0].maxHp);
  ok('explosion damage applies after resume', r);

  // --- edge 6: enemy loses sight -> investigates last known
  await page.evaluate(() => UI.abortBattle());
  await page.evaluate(() => window.__SC.startMission('m01', 4));
  await page.evaluate(() => {
    const b = UI.battle;
    // find an enemy with clear LOS to a placed soldier
    const u = b.aliveAllies[0];
    let e = null;
    for (const en of b.enemies) {
      for (const side of [-1, 1]) {
        for (const off of [100, 130, 160, 200, 240, 280]) {
          u.x = clamp(en.x + side * off, 30, b.level.width - 30); u.y = b.level.surfaceAt(u.x);
          if (lineOfSight(b.level, unitEye(en).x, unitEye(en).y, unitCenter(u).x, unitCenter(u).y)) { e = en; break; }
        }
        if (e) break;
      }
      if (e) break;
    }
    if (!e) { e = b.enemies[0]; u.x = clamp(e.x - 150, 30, b.level.width - 30); u.y = b.level.surfaceAt(u.x); }
    b.enemyPerceive(e);
    window.__e = e;
    window.__perceived = !!e.lastSeen;
  });
  await page.evaluate(() => window.__SC.step(1));
  await page.evaluate(() => {
    const b = UI.battle;
    const e = window.__e;
    const u = b.aliveAllies[0];
    u.x = Math.max(30, e.x - 1400); u.y = b.level.surfaceAt(u.x);
  });
  await page.evaluate(() => window.__SC.step(3));
  r = await page.evaluate(() => {
    const e = window.__e;
    return { state: e.aiState, hasTarget: !!e.target, lastSeen: !!e.lastSeen };
  });
  const perceived = await page.evaluate(() => window.__perceived);
  ok('enemy perceives then loses sight and investigates', perceived && r.state !== 'patrol' && r.lastSeen, JSON.stringify(r));

  // --- edge 7: pinch zoom + camera bounds
  await page.evaluate(() => UI.abortBattle());
  await page.evaluate(() => window.__SC.startMission('m01', 4));
  const z0 = await page.evaluate(() => UI.battle.cam.zoom);
  await page.touchscreen.tap(400, 300);
  // pinch via CDP touch
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300 }, { x: 500, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y: 300 }, { x: 580, y: 300 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
  const z1 = await page.evaluate(() => UI.battle.cam.zoom);
  ok('pinch zoom changes camera zoom', z1 > z0, `${z0.toFixed(2)} -> ${z1.toFixed(2)}`);
  await page.evaluate(() => { const b = UI.battle; b.cam.x = -5000; CameraUtil.clamp(b.cam); });
  r = await page.evaluate(() => UI.battle.cam.x >= UI.battle.cam.bounds.minX - 1);
  ok('camera clamped to level bounds', r);

  console.log('errors total:', errors.length);
  await browser.close();
})();
