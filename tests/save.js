'use strict';
/* Save system v3: checksums, rotation, backup recovery, import validation. */
const h = require('./lib/harness');

(async () => {
  const ctx = await h.launch();
  const page = ctx.page;

  await h.test('save writes a checksummed v3 payload with rotation', async () => {
    await h.newGame(page);
    const r = await page.evaluate(() => {
      Campaign.data.credits = 7777;
      const ok1 = Campaign.save();
      Campaign.data.credits = 8888;
      const ok2 = Campaign.save();
      const diag = Campaign.diagnoseSave();
      const raw = JSON.parse(localStorage.getItem('squadcommander.save.v3'));
      return { ok1, ok2, diag, raw, backup: !!localStorage.getItem('squadcommander.save.v3.bak') };
    });
    h.assert(r.ok1 && r.ok2, 'both saves succeed');
    h.assert(r.diag.primary === 'valid', 'primary slot validates');
    h.assert(r.diag.backup === 'valid', 'backup slot holds the previous commit');
    h.assert(r.diag.pending === 'missing', 'pending slot is cleaned up after commit');
    h.assert(r.raw.version === 3 && typeof r.raw.checksum === 'string' && r.raw.body && r.raw.body.campaign, 'payload is versioned + checksummed');
    h.assert(r.raw.body.campaign.credits === 8888, 'primary holds the newest credits');
    h.assert(r.backup, 'backup file exists');
  });

  await h.test('corrupt primary is recovered from the backup', async () => {
    const r = await page.evaluate(() => {
      // primary=8888, backup=7777 from the previous test
      localStorage.setItem('squadcommander.save.v3', '{"version":3,"broken":true}');
      Campaign.data = null;
      Campaign.recoveredFromBackup = false;
      const loaded = Campaign.load();
      return {
        loaded,
        recovered: Campaign.recoveredFromBackup,
        credits: Campaign.data && Campaign.data.credits,
        diag: Campaign.diagnoseSave(),
        roster: Campaign.data ? Campaign.data.roster.length : 0
      };
    });
    h.assert(r.loaded === true, 'load succeeds after primary corruption');
    h.assert(r.recovered === true, 'recovery flag is set');
    h.assert(r.credits === 7777, 'backup state restored (credits ' + r.credits + ')');
    h.assert(r.roster === 6, 'roster intact');
    h.assert(r.diag.primary === 'valid', 'recovered state was re-committed to primary');
  });

  await h.test('forged imports are rejected by the checksum', async () => {
    const r = await page.evaluate(() => {
      const exported = Campaign.exportSave();
      const forged = JSON.parse(exported);
      forged.body.campaign.credits = 999999;
      const res1 = Campaign.importSave(JSON.stringify(forged));
      // also break the checksum field itself
      const forged2 = JSON.parse(exported);
      forged2.checksum = 'deadbeef';
      const res2 = Campaign.importSave(JSON.stringify(forged2));
      const garbage = Campaign.importSave('not json at all');
      const credits = Campaign.data.credits;
      return { res1, res2, garbage, credits };
    });
    h.assert(r.res1.ok === false, 'edited body rejected: ' + r.res1.msg);
    h.assert(r.res2.ok === false, 'broken checksum rejected');
    h.assert(r.garbage.ok === false, 'non-JSON rejected');
    h.assert(r.credits === 7777, 'campaign untouched by rejected imports (credits ' + r.credits + ')');
  });

  await h.test('legacy v2 save is migrated on import', async () => {
    const r = await page.evaluate(() => {
      const cur = Campaign.data;
      const legacy = {
        version: 2,
        campaign: JSON.parse(JSON.stringify(cur)),
        settings: { master: 0.5 }
      };
      legacy.campaign.credits = 4242;
      const res = Campaign.importSave(JSON.stringify(legacy));
      return { res, credits: Campaign.data && Campaign.data.credits, version: (Campaign.diagnoseSave().primary === 'valid') ? 3 : 0 };
    });
    h.assert(r.res.ok === true, 'v2 payload accepted: ' + (r.res.msg || ''));
    h.assert(r.credits === 4242, 'migrated credits present');
    h.assert(r.version === 3, 'migrated save stored as v3');
  });

  await h.test('valid v3 export round-trips through import', async () => {
    const r = await page.evaluate(() => {
      const before = JSON.stringify([Campaign.data.credits, Campaign.data.roster.length, Campaign.data.difficulty]);
      const text = Campaign.exportSave();
      Campaign.reset();
      const hadData = !!Campaign.data;
      const res = Campaign.importSave(text);
      const after = JSON.stringify([Campaign.data.credits, Campaign.data.roster.length, Campaign.data.difficulty]);
      return { before, hadData, res, after, same: before === after };
    });
    h.assert(r.hadData === false, 'reset cleared the campaign');
    h.assert(r.res.ok === true, 'import accepted the exported save');
    h.assert(r.same, 'state identical after round-trip: ' + r.after);
  });

  await h.test('persistence survives a page reload', async () => {
    await page.evaluate(() => { window.__SC_NO_AUTOSAVE = true; Campaign.save(); });
    await page.reload();
    await page.waitForFunction(() => window.__SC && window.__SC.screen, null, { timeout: 15000 });
    const r = await page.evaluate(() => ({
      has: !!Campaign.data,
      credits: Campaign.data && Campaign.data.credits,
      recovered: Campaign.recoveredFromBackup
    }));
    h.assert(r.has && r.credits === 4242, 'campaign restored from storage after reload');
    h.assert(r.recovered === false, 'normal load does not flag recovery');
  });

  h.assertClean(ctx);
  h.summary('save');
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
