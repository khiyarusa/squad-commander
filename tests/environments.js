const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERR:', e.message); });
  await page.goto(FILE);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__SC.newCampaign('veteran'));

  // forest dawn - m06 escort
  await page.evaluate(() => window.__SC.startMission('m06', 6));
  await page.evaluate(() => { const b = UI.battle; b.selectAll(); b.issueOrder('sprint', b.level.width * 0.3, 0); window.__SC.step(5); });
  await page.evaluate(() => { const b = UI.battle; b.cam.x = b.allies[0].x + 200; b.cam.tx = b.cam.x; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/opencode/th-forest.png' });
  await page.evaluate(() => UI.abortBattle());

  // forest night - m08 survive with hold visuals
  await page.evaluate(() => window.__SC.startMission('m08', 6));
  await page.evaluate(() => { const b = UI.battle; window.__SC.step(9); });
  await page.evaluate(() => { const b = UI.battle; b.cam.x = b.aliveAllies[0] ? b.aliveAllies[0].x + 150 : b.cam.x; b.cam.tx = b.cam.x; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/opencode/th-forest-night.png' });
  await page.evaluate(() => UI.abortBattle());

  // industrial overcast - m09 capture with hold zone
  await page.evaluate(() => window.__SC.startMission('m09', 6));
  await page.evaluate(() => { const b = UI.battle; b.selectAll(); b.issueOrder('sprint', b.level.width * 0.45, 0); window.__SC.step(7); });
  await page.evaluate(() => { const b = UI.battle; b.cam.x = b.level.zones.find(z => z.type === 'hold').x; b.cam.tx = b.cam.x; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/opencode/th-industrial.png' });
  await page.evaluate(() => UI.abortBattle());

  // urban dusk day - m02 rescue w/ objective marker + neutral
  await page.evaluate(() => window.__SC.startMission('m02', 6));
  await page.evaluate(() => { const b = UI.battle; b.selectAll(); b.issueOrder('sprint', b.level.width * 0.62, 0); window.__SC.step(9); });
  await page.evaluate(() => { const b = UI.battle; const n = b.neutrals[0]; b.cam.x = (n ? n.x : b.cam.x) - 60; b.cam.tx = b.cam.x; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/opencode/th-urban-rescue.png' });
  await page.evaluate(() => UI.abortBattle());

  // heap check after all this
  const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  console.log('heap MB:', mem, 'errors:', errors.length);
  await browser.close();
})();
