const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(FILE);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__SC.newCampaign('veteran'));
  await page.evaluate(() => window.__SC.startMission('m05', 6));
  // walk into contact and screenshot mid-firefight
  await page.evaluate(() => {
    const b = UI.battle;
    b.selectAll(); b.issueOrder('sprint', b.level.width * 0.45, 0);
    window.__SC.step(7);
  });
  await page.evaluate(() => {
    const b = UI.battle;
    b.setSpeed(2);
    window.__SC.step(3);
    const front = b.aliveAllies[0];
    b.cam.x = front ? front.x + 170 : b.cam.x; b.cam.tx = b.cam.x; b.cam.follow = null;
  });
  // catch a frame with tracers: take 3 quick screenshots
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(160);
    await page.screenshot({ path: `/tmp/opencode/fight-${i}.png` });
  }
  const st = await page.evaluate(() => ({ shots: UI.battle.stats.shots, hits: UI.battle.stats.hits, kills: UI.battle.stats.kills, projectiles: UI.battle.projectiles.length }));
  console.log(JSON.stringify(st));
  await browser.close();
})();
