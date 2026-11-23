const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERROR:', m.text()); } });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });

  await page.goto(FILE);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__SC.newCampaign('veteran'));

  // --- mobile battle ---
  await page.evaluate(() => window.__SC.startMission('m01', 6));
  await page.waitForTimeout(700);
  await page.screenshot({ path: '/tmp/opencode/m1-battle.png' });
  const rotateHidden = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display === 'none');
  console.log('rotate overlay hidden in landscape:', rotateHidden);

  // --- real touch tap on canvas: tap a soldier then ground ---
  const before = await page.evaluate(() => window.__SC.state().allies.map(a => Math.round(a.x)));
  await page.touchscreen.tap(420, 300); // probably empty
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__SC.state().selected);
  console.log('touch tap selection:', JSON.stringify(after));

  // queue test
  await page.evaluate(() => {
    const b = UI.battle;
    b.selectAll();
    b.toggleQueue();
    b.issueOrder('move', 1200, 0);
    b.issueOrder('move', 1800, 0);
  });
  await page.evaluate(() => window.__SC.step(0.5));
  const q = await page.evaluate(() => window.__SC.state().allies.map(a => a.queue));
  console.log('queue lengths:', JSON.stringify(q));

  // overwatch + cover + suppress
  await page.evaluate(() => {
    const b = UI.battle; b.toggleQueue();
    b.selectAll(); b.issueOrder('overwatch', b.allies[0].x + 300, 400);
    b.selectAll(); b.issueOrder('cover', b.allies[0].x + 120, 0);
  });
  await page.evaluate(() => window.__SC.step(1.5));
  const ow = await page.evaluate(() => ({
    overwatch: UI.battle.allies.filter(a => a.overwatch).length,
    covers: UI.battle.allies.filter(a => a.coverId).length,
    stances: UI.battle.allies.map(a => a.stance)
  }));
  console.log('overwatch/cover:', JSON.stringify(ow));

  // reload test
  await page.evaluate(() => {
    const b = UI.battle; const u = b.allies[0];
    u.mag = 2; b.startReload(u);
  });
  await page.evaluate(() => window.__SC.step(2.6));
  const mag = await page.evaluate(() => { const u = UI.battle.allies[0]; return { mag: u.mag, size: u.magSize, reserve: u.reserve }; });
  console.log('reload result:', JSON.stringify(mag));

  // heal test
  await page.evaluate(() => {
    const b = UI.battle;
    const patient = b.allies[1];
    patient.hp = 28;
    const medic = b.allies.find(a => a.role === 'medic');
    b.selected.clear(); b.selected.add(medic.id);
    b.issueOrder('heal', patient.x, patient.y, patient);
  });
  await page.evaluate(() => window.__SC.step(6));
  const heal = await page.evaluate(() => {
    const b = UI.battle; const p = b.allies[1]; const m = b.allies.find(a => a.role === 'medic');
    return { hp: Math.round(p.hp), medkits: m.medkits, used: b.stats.medkitsUsed };
  });
  console.log('heal result:', JSON.stringify(heal));

  await page.screenshot({ path: '/tmp/opencode/m2-orders.png' });

  // abort & run all 12 missions smoke
  await page.evaluate(() => UI.abortBattle());
  const results = [];
  const missionIds = await page.evaluate(() => MISSIONS.map(x => x.id));
  for (const id of missionIds) {
    await page.evaluate((mid) => { window.__SC.startMission(mid, 6); }, id);
    await page.evaluate((mid) => { window.__SC.step(4); }, id);
    const s = await page.evaluate(() => {
      const b = UI.battle;
      return { id: b.mission.id, allies: b.allies.length, enemies: b.enemies.length + b.enemies.filter(e => e.dead).length, neutrals: b.neutrals.length, objectives: b.objectives.length, time: Math.round(b.time * 10) / 10, result: !!b.result };
    });
    results.push(s);
    await page.evaluate(() => UI.abortBattle());
  }
  console.log('mission smoke:', JSON.stringify(results));

  // persistence
  await page.evaluate(() => Campaign.save());
  await page.reload();
  await page.waitForTimeout(1200);
  const persisted = await page.evaluate(() => ({
    hasCampaign: !!Campaign.data,
    missions: Campaign.data ? Object.values(Campaign.data.progress).filter(p => p.completed).length : 0,
    credits: Campaign.data ? Campaign.data.credits : null
  }));
  console.log('persistence:', JSON.stringify(persisted));

  // portrait overlay
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const rotateShown = await page.evaluate(() => getComputedStyle(document.getElementById('rotate')).display !== 'none');
  console.log('rotate overlay shown in portrait:', rotateShown);
  await page.screenshot({ path: '/tmp/opencode/m3-portrait.png' });

  console.log('total errors:', errors.length);
  await browser.close();
})();
