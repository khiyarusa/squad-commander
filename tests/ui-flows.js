const { chromium } = require('/home/ubuntu/opencode project/LIMINAL/node_modules/playwright');
const FILE = 'file:///home/ubuntu/opencode project/squad commander/SQUAD_COMMANDER.html';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.log('PAGE ERR:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERR:', m.text()); } });
  page.on('dialog', (d) => d.accept());
  await page.goto(FILE);
  await page.waitForTimeout(900);

  // menu -> new campaign via real clicks
  await page.click('[data-act="new"]');
  await page.waitForTimeout(200);
  console.log('newgame screen:', await page.evaluate(() => UI.current));
  await page.click('[data-diff="elite"]');
  await page.waitForTimeout(150);
  await page.click('#btn-start-campaign');
  await page.waitForTimeout(400);
  console.log('after start:', await page.evaluate(() => ({ screen: UI.current, diff: Campaign.data.difficulty, credits: Campaign.data.credits })));

  // open first mission via click
  await page.click('[data-mission="m01"]');
  await page.waitForTimeout(300);
  console.log('briefing:', await page.evaluate(() => ({ screen: UI.current, mission: UI.briefMission && UI.briefMission.id, deploy: UI.deployment.length })));
  // toggle one soldier off and on
  const firstId = await page.evaluate(() => UI.deployment[0]);
  await page.click(`[data-deploy-id="${firstId}"]`);
  await page.waitForTimeout(100);
  console.log('after toggle off:', await page.evaluate(() => UI.deployment.length));
  await page.click(`[data-deploy-id="${firstId}"]`);
  await page.waitForTimeout(100);
  await page.click('#btn-deploy');
  await page.waitForTimeout(700);
  console.log('in battle:', await page.evaluate(() => ({ scene: App.scene, screen: UI.current, battle: !!UI.battle })));

  // pause via HUD button
  await page.click('#btn-pause');
  await page.waitForTimeout(300);
  console.log('pause visible:', await page.evaluate(() => document.querySelector('#pause').classList.contains('is-active')));
  await page.screenshot({ path: '/tmp/opencode/p1-pause.png' });
  // resume
  await page.click('[data-pause-act="resume"]');
  await page.waitForTimeout(200);

  // command deck: arm WATCH and tap canvas
  await page.click('[data-cmd="overwatch"]');
  await page.waitForTimeout(100);
  console.log('order mode:', await page.evaluate(() => UI.battle.orderMode));
  const cam = await page.evaluate(() => ({ x: UI.battle.cam.x, y: UI.battle.cam.y, zoom: UI.battle.cam.zoom }));
  // convert a world point right of squad to screen: tap canvas center-right
  await page.mouse.click(900, 400);
  await page.waitForTimeout(150);
  console.log('overwatch set:', await page.evaluate(() => UI.battle.allies.filter(a => a.overwatch).length));

  // squad card selection + long press
  await page.click('.squad-card[data-unit] >> nth=2');
  await page.waitForTimeout(120);
  console.log('selected after card click:', await page.evaluate(() => [...UI.battle.selected].length));
  const card = await page.$('.squad-card[data-unit] >> nth=3');
  const bb = await card.boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForTimeout(150);
  console.log('after longpress multi:', await page.evaluate(() => [...UI.battle.selected].length));

  // settings from battle
  await page.click('#btn-battle-settings');
  await page.waitForTimeout(300);
  console.log('settings from battle:', await page.evaluate(() => ({ screen: UI.current, paused: UI.battle.paused })));
  await page.evaluate(() => { document.getElementById('set-master').value = 30; document.getElementById('set-master').dispatchEvent(new Event('input')); });
  await page.waitForTimeout(100);
  console.log('master setting:', await page.evaluate(() => Campaign.settings.master));
  await page.click('#btn-settings-back');
  await page.waitForTimeout(250);
  console.log('back to battle paused overlay:', await page.evaluate(() => ({ screen: UI.current, pauseVisible: document.querySelector('#pause').classList.contains('is-active') })));
  await page.click('[data-pause-act="resume"]');

  // abort
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  await page.click('[data-pause-act="abort"]');
  await page.waitForTimeout(300);
  console.log('after abort:', await page.evaluate(() => ({ screen: UI.current, battle: !!UI.battle, ammo: Campaign.data.ammo })));

  // barracks -> profile -> skill upgrade
  await page.evaluate(() => window.__SC.show('barracks'));
  await page.click('.soldier-card >> nth=0');
  await page.waitForTimeout(250);
  console.log('profile:', await page.evaluate(() => ({ screen: UI.current, points: Campaign.skillPoints(Campaign.data.roster[0]) })));
  await page.click('[data-skill="marksmanship"]');
  await page.waitForTimeout(200);
  console.log('skill after upgrade:', await page.evaluate(() => Campaign.data.roster[0].skills.marksmanship));

  // arsenal -> buy upgrade
  await page.evaluate(() => window.__SC.show('arsenal'));
  await page.waitForTimeout(200);
  await page.click('[data-upgrade="rifle:optic"]');
  await page.waitForTimeout(200);
  console.log('upgrade owned:', await page.evaluate(() => Campaign.data.arsenal.upgrades.rifle.optic));

  // recruit
  await page.evaluate(() => window.__SC.show('recruit'));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => Campaign.data.roster.length);
  await page.click('[data-recruit]');
  await page.waitForTimeout(200);
  console.log('recruit:', await page.evaluate((b) => ({ before: b, after: Campaign.data.roster.length, credits: Campaign.data.credits }), before));

  // stats screen
  await page.evaluate(() => window.__SC.show('stats'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: '/tmp/opencode/p2-stats.png' });

  // save export / import round trip
  const saveText = await page.evaluate(() => Campaign.exportSave());
  await page.evaluate(() => Campaign.reset());
  await page.reload();
  await page.waitForTimeout(900);
  console.log('after reset+reload, campaign:', await page.evaluate(() => !!Campaign.data));
  await page.evaluate(() => window.__SC.show('settings'));
  await page.waitForTimeout(200);
  await page.evaluate((t) => { document.getElementById('save-export').value = t; }, saveText);
  await page.click('#btn-save-import');
  page.once('dialog', (d) => d.accept());
  await page.waitForTimeout(300);
  console.log('after import:', await page.evaluate(() => ({ has: !!Campaign.data, diff: Campaign.data && Campaign.data.difficulty })));

  console.log('errors total:', errors.length);
  await browser.close();
})();
