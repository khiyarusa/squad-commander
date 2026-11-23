'use strict';
/* Core campaign flow through real UI clicks: menu → new campaign → briefing →
   deploy → battle HUD → orders → results → hub → meta screens → save/import. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.waitForTimeout(600);

  await h.test('new campaign starts from the menu via real clicks', async () => {
    await page.click('[data-act="new"]');
    await page.waitForTimeout(200);
    await page.click('[data-diff="elite"]');
    await page.waitForTimeout(150);
    await page.click('#btn-start-campaign');
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({
      screen: UI.current, diff: Campaign.data.difficulty, credits: Campaign.data.credits
    }));
    h.assert(st.screen === 'hub', 'hub is shown after campaign start (got ' + st.screen + ')');
    h.assert(st.diff === 'elite', 'difficulty applied');
    h.assert(typeof st.credits === 'number' && st.credits > 0, 'starting credits granted');
  });

  await h.test('first mission opens a briefing and deploys', async () => {
    await page.click('[data-mission="m01"]');
    await page.waitForTimeout(300);
    const brief = await page.evaluate(() => ({ screen: UI.current, mission: UI.briefMission && UI.briefMission.id, deploy: UI.deployment.length }));
    h.assert(brief.screen === 'briefing', 'briefing screen shown');
    h.assert(brief.mission === 'm01', 'mission loaded into briefing');
    h.assert(brief.deploy >= 4, 'default deployment has soldiers (' + brief.deploy + ')');
    const firstId = await page.evaluate(() => UI.deployment[0]);
    await page.click(`[data-deploy-id="${firstId}"]`);
    const afterOff = await page.evaluate(() => UI.deployment.length);
    await page.click(`[data-deploy-id="${firstId}"]`);
    const afterOn = await page.evaluate(() => UI.deployment.length);
    h.assert(afterOff === brief.deploy - 1, 'soldier can be undeployed');
    h.assert(afterOn === brief.deploy, 'soldier re-deployed');
    await page.click('#btn-deploy');
    await page.waitForTimeout(700);
    const inBattle = await page.evaluate(() => ({ scene: App.scene, battle: !!UI.battle, n: UI.battle ? UI.battle.allies.length : 0 }));
    h.assert(inBattle.battle, 'battle scene is live');
    h.assert(inBattle.n === brief.deploy, 'deployed squad size matches selection');
  });

  await h.test('pause menu, settings and resume work mid-battle', async () => {
    await page.click('#btn-pause');
    await page.waitForTimeout(300);
    const paused = await page.evaluate(() => document.querySelector('#pause').classList.contains('is-active'));
    h.assert(paused, 'pause overlay is active');
    await h.shot(page, 'core-pause');
    await page.click('[data-pause-act="resume"]');
    await page.waitForTimeout(200);
    const resumed = await page.evaluate(() => !document.querySelector('#pause').classList.contains('is-active'));
    h.assert(resumed, 'resume clears the overlay');
  });

  await h.test('command deck arms order modes and issues real orders', async () => {
    await page.click('[data-cmd="overwatch"]');
    await page.waitForTimeout(100);
    const mode = await page.evaluate(() => UI.battle.orderMode);
    h.assert(mode === 'overwatch', 'WATCH arms overwatch mode');
    await page.mouse.click(900, 400);
    await page.waitForTimeout(150);
    const ow = await page.evaluate(() => UI.battle.allies.filter((a) => a.overwatch).length);
    h.assert(ow > 0, 'overwatch was assigned to ' + ow + ' soldiers');
    await page.click('[data-cmd="move"]');
    await page.mouse.click(700, 500);
    await page.waitForTimeout(200);
    const moving = await page.evaluate(() => UI.battle.allies.filter((a) => a.moving || (a.order && a.order.type === 'move')).length);
    h.assert(moving > 0, 'move order took hold on ' + moving + ' soldiers');
  });

  await h.test('squad cards select units and long-press multi-selects', async () => {
    await page.click('.squad-card[data-unit] >> nth=2');
    await page.waitForTimeout(120);
    const sel1 = await page.evaluate(() => window.__SC.battle.selected.size);
    h.assert(sel1 === 1, 'card click selects a single soldier');
    const card = await page.$('.squad-card[data-unit] >> nth=3');
    const bb = await card.boundingBox();
    await page.mouse.move(bb.x + 20, bb.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await page.waitForTimeout(150);
    const sel2 = await page.evaluate(() => window.__SC.battle.selected.size);
    h.assert(sel2 > 1, 'long press adds soldiers to the selection (got ' + sel2 + ')');
  });

  await h.test('settings are reachable from battle and persist', async () => {
    await page.click('#btn-battle-settings');
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ screen: UI.current, paused: UI.battle.paused }));
    h.assert(st.screen === 'settings', 'settings screen opened');
    h.assert(st.paused, 'battle auto-pauses behind settings');
    await page.evaluate(() => { document.getElementById('set-master').value = 30; document.getElementById('set-master').dispatchEvent(new Event('input')); });
    const master = await page.evaluate(() => Campaign.settings.master);
    h.assert(Math.abs(master - 0.3) < 0.01, 'master volume setting stored (' + master + ')');
    await page.click('#btn-settings-back');
    await page.waitForTimeout(250);
    const back = await page.evaluate(() => ({ screen: UI.current, pause: document.querySelector('#pause').classList.contains('is-active') }));
    h.assert(back.screen === 'battle' && back.pause, 'returns to the paused battle');
    await page.click('[data-pause-act="resume"]');
  });

  await h.test('abort returns to the hub', async () => {
    await page.click('#btn-pause');
    await page.waitForTimeout(200);
    await page.click('[data-pause-act="abort"]');
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => ({ screen: UI.current, battle: !!UI.battle }));
    h.assert(st.screen === 'hub' && !st.battle, 'aborted back to hub');
  });

  await h.test('barracks profile lets the player spend a skill point', async () => {
    await page.evaluate(() => window.__SC.show('barracks'));
    await page.click('.soldier-card >> nth=0');
    await page.waitForTimeout(250);
    const before = await page.evaluate(() => ({
      screen: UI.current,
      points: Campaign.skillPoints(Campaign.data.roster[0]),
      skill: Campaign.data.roster[0].skills.marksmanship
    }));
    h.assert(before.screen === 'profile', 'profile screen opens from barracks');
    h.assert(before.points > 0, 'rookie has a skill point to spend');
    await page.click('[data-skill="marksmanship"]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => Campaign.data.roster[0].skills.marksmanship);
    h.assert(after === before.skill + 1, 'marksmanship increased (' + before.skill + ' -> ' + after + ')');
  });

  await h.test('arsenal upgrade purchase and recruitment work', async () => {
    await page.evaluate(() => window.__SC.show('arsenal'));
    await page.waitForTimeout(200);
    await page.click('[data-upgrade="rifle:optic"]');
    await page.waitForTimeout(200);
    const owned = await page.evaluate(() => Campaign.data.arsenal.upgrades.rifle.optic);
    h.assert(!!owned, 'optic upgrade owned after purchase');
    await page.evaluate(() => window.__SC.show('recruit'));
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => Campaign.data.roster.length);
    await page.click('[data-recruit]');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ n: Campaign.data.roster.length, credits: Campaign.data.credits }));
    h.assert(after.n === before + 1, 'recruit added to roster');
    h.assert(after.credits < 1200, 'recruitment cost credits');
  });

  await h.test('all meta screens render without errors', async () => {
    for (const s of ['barracks', 'arsenal', 'stats', 'settings', 'help']) {
      await page.evaluate((n) => window.__SC.show(n), s);
      await page.waitForTimeout(200);
      const cur = await page.evaluate(() => UI.current);
      h.assert(cur === s, s + ' screen renders');
      await h.shot(page, 'core-' + s);
    }
    await page.evaluate(() => { UI.profileId = Campaign.data.roster[0].id; UI.show('profile'); });
    await page.waitForTimeout(250);
    h.assert(await page.evaluate(() => UI.current) === 'profile', 'profile screen renders');
  });

  await h.test('save export / import round-trips through the settings UI', async () => {
    await page.evaluate(() => window.__SC.show('settings'));
    await page.waitForTimeout(200);
    const saveText = await page.evaluate(() => Campaign.exportSave());
    await page.evaluate(() => Campaign.reset());
    await page.reload();
    await page.waitForFunction(() => window.__SC && window.__SC.screen, null, { timeout: 15000 });
    await page.evaluate(() => window.__SC.show('settings'));
    await page.waitForTimeout(200);
    await page.evaluate((t) => { document.getElementById('save-export').value = t; }, saveText);
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.click('#btn-save-import');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ has: !!Campaign.data, diff: Campaign.data && Campaign.data.difficulty, screen: UI.current }));
    h.assert(r.has && r.diff === 'elite', 'imported save restores the campaign');
  });

  h.assertClean(ctx);
  h.summary('core');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
