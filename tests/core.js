const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';

(async () => {
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERROR:', m.text()); } });
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERROR:', e.message); });
  const requests = [];
  page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });

  await page.goto(FILE);
  await page.waitForTimeout(1200);

  // new campaign
  await page.evaluate(() => window.__SC.newCampaign('veteran'));
  await page.waitForTimeout(300);
  const st1 = await page.evaluate(() => window.__SC.state());
  console.log('after newCampaign:', JSON.stringify(st1.campaign ? st1.campaign.credits : null), 'screen:', st1.screen);
  await page.screenshot({ path: '/tmp/opencode/02-hub.png' });

  // briefing
  await page.evaluate(() => window.__SC.show('briefing'));
  await page.evaluate(() => { UI.briefMission = MISSIONS_BY_ID['m01']; UI.deployment = Campaign.readyRoster().slice(0, 6).map(s => s.id); UI.renderBriefing(); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/opencode/03-briefing.png' });

  // start mission
  await page.evaluate(() => window.__SC.startMission('m01', 6));
  await page.waitForTimeout(600);
  let st = await page.evaluate(() => window.__SC.state());
  console.log('battle started:', st.hasBattle, 'allies:', st.allies.length, 'enemies:', st.enemies.length, 'objectives:', st.objectives.length);
  await page.screenshot({ path: '/tmp/opencode/04-battle-start.png' });

  // move order
  await page.evaluate(() => { window.__SC.selectAll(); window.__SC.order('move', 900, 0); });
  await page.evaluate(() => window.__SC.step(2.5));
  await page.screenshot({ path: '/tmp/opencode/05-battle-move.png' });
  st = await page.evaluate(() => window.__SC.state());
  console.log('after move: positions', st.allies.map(a => Math.round(a.x)).join(','));

  // sprint toward enemies + let AI fight
  await page.evaluate(() => { window.__SC.selectAll(); window.__SC.order('sprint', 1700, 0); });
  await page.evaluate(() => window.__SC.step(8));
  st = await page.evaluate(() => window.__SC.state());
  console.log('after engage: projectiles', st.projectiles, 'kills', st.campaign ? '-' : '-', 'enemies', st.enemies.length, 'suppr', st.allies.map(a => a.suppression).join(','));
  await page.screenshot({ path: '/tmp/opencode/06-battle-fight.png' });

  // close combat
  await page.evaluate(() => { window.__SC.selectAll(); window.__SC.order('sprint', 2000, 0); });
  await page.evaluate(() => window.__SC.step(10));
  st = await page.evaluate(() => window.__SC.state());
  console.log('allies hp:', st.allies.map(a => Math.round(a.hp)).join(','), 'dead:', st.allies.filter(a => a.dead).length, 'enemies alive:', st.enemies.length);
  await page.screenshot({ path: '/tmp/opencode/07-battle-late.png' });

  // finish mission
  await page.evaluate(() => window.__SC.clearEnemies());
  await page.evaluate(() => window.__SC.step(2));
  await page.waitForTimeout(2100);
  st = await page.evaluate(() => window.__SC.state());
  console.log('result:', JSON.stringify(st.result), 'screen:', st.screen);
  await page.screenshot({ path: '/tmp/opencode/08-results.png' });

  // continue to hub
  await page.evaluate(() => UI.leaveBattleToHub());
  await page.waitForTimeout(400);
  st = await page.evaluate(() => window.__SC.state());
  console.log('back at hub:', st.screen, 'campaign:', JSON.stringify(st.campaign && { credits: st.campaign.credits, missions: st.campaign.missions, roster: st.campaign.roster.map(r => r.status) }));

  // other screens
  for (const s of ['barracks', 'arsenal', 'stats', 'settings', 'help']) {
    await page.evaluate((n) => window.__SC.show(n), s);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `/tmp/opencode/09-${s}.png` });
  }
  // profile
  await page.evaluate(() => { UI.profileId = Campaign.data.roster[0].id; UI.show('profile'); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: '/tmp/opencode/09-profile.png' });

  console.log('total errors:', errors.length);
  console.log('external requests:', requests.length, requests.slice(0, 5));
  await browser.close();
})();
