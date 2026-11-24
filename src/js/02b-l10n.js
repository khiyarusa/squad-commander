'use strict';
/* ============================================================
   02b — LOCALIZATION (fa default, en secondary)
   Centralized dictionary. Never scatter strings in gameplay logic.
   Numbers stay Latin for tactical readability; all prose is Persian.
   ============================================================ */
const L10N = {
  lang: 'fa',
  dict: {
    fa: {
      'menu.new': 'عملیات جدید', 'menu.continue': 'ادامه', 'menu.barracks': 'پادگان',
      'menu.arsenal': 'زره‌خانه', 'menu.stats': 'آمار', 'menu.settings': 'تنظیمات',
      'menu.help': 'راهنما', 'menu.credits': 'درباره سازنده', 'menu.build': 'نسخه',
      'menu.kicker': 'فرماندهی تاکتیکی گروه رزمی', 'menu.campaign': 'پیشرفت عملیات',
      'menu.ready': 'نیروی آماده', 'menu.credits2': 'اعتبار', 'menu.nosave': 'هنوز کمپینی آغاز نشده — «عملیات جدید» را آغاز کنید',
      'campaign.select': 'انتخاب عملیات', 'campaign.region': 'منطقه',
      'briefing.deploy': 'اعزام', 'briefing.squad': 'گروه رزمی',
      'battle.move': 'حرکت', 'battle.hold': 'تثبیت', 'battle.cover': 'سنگرگیری',
      'battle.watch': 'پوشش', 'battle.focus': 'تمرکز آتش', 'battle.suppress': 'سنگربار',
      'battle.queue': 'صف', 'battle.reload': 'خشاب‌گذاری', 'battle.treat': 'درمان',
      'battle.carry': 'حمل مجروح', 'battle.fallback': 'عقب‌نشینی', 'battle.regroup': 'تجمع',
      'battle.line': 'خط', 'battle.cancel': 'لغو', 'battle.all': 'همه',
      'hud.objectives': 'اهداف عملیات', 'hud.missiontime': 'زمان عملیات',
      'res.pause': 'توقف', 'res.resume': 'ادامه', 'res.restart': 'شروع دوباره', 'res.abort': 'انصراف از عملیات',
      'results.complete': 'عملیات موفق', 'results.failed': 'عملیات ناموفق',
      'results.continue': 'ادامه',
      'feats.contact': 'تماس!', 'feats.down': 'از پا افتاد', 'feats.kia': 'شهید شد',
      'feats.missioncomplete': 'عملیات کامل شد',
      'set.language': 'زبان', 'set.master': 'صدای کلی', 'set.music': 'موسیقی',
      'set.sfx': 'جلوه‌های صوتی', 'set.quality': 'کیفیت گرافیک', 'set.diagnostics': 'نمایش کارایی',
      'credits.title': 'درباره سازنده', 'credits.made': 'ساخته‌شده توسط Amin',
      'credits.telegram': 'تلگرام', 'credits.rubika': 'روبیکا',
      'hub.title': 'عملیات‌ها', 'hub.sub': 'نیروی ویژه NIGHTJAR — آماده مأموریت', 'hub.secured': 'همه‌ی مناطق امن شد', 'hub.ready': 'آماده مأموریت', 'role.commander': 'فرمانده', 'role.rifleman': 'تفنگدار', 'role.assault': 'یورش‌بر',
      'role.support': 'پشتیبان', 'role.sniper': 'تیرانداز دقیق', 'role.medic': 'بهدار',
      'role.engineer': 'مهندس رزمی',
      'res.opComplete': 'عملیات موفق', 'res.opFailed': 'عملیات ناموفق',
      'res.accomplished': 'مأموریت انجام شد', 'res.failedDesc': 'مأموریت ناموفق بود',
      'res.fieldtime': 'زمان عملیات ', 'res.objNotMet': 'اهداف کامل نشد',
      'res.squad': 'وضعیت گروه', 'res.rewards': 'پاداش‌ها', 'res.continue': 'ادامه',
      'bar.title': 'پادگان', 'bar.roster': 'فهرست نیروها', 'bar.status': 'وضعیت',
      'bar.rank': 'درجه', 'bar.xp': 'تجربه', 'bar.weapon': 'سلاح', 'bar.armor': 'زره',
      'bar.injured': 'آسیب‌دیده', 'bar.ready': 'آماده', 'bar.dead': 'از دست رفته',
      'ars.title': 'زره‌خانه', 'ars.damage': 'آسیب', 'ars.range': 'برد',
      'ars.magazine': 'خشاب', 'ars.rate': 'نرخ شلیک', 'ars.reload': 'خشاب‌گذاری',
      'ars.upgrades': 'ارتقاها', 'ars.cost': 'هزینه'
    },
    en: {
      'menu.new': 'New Operation', 'menu.continue': 'Continue', 'menu.barracks': 'Barracks',
      'menu.arsenal': 'Arsenal', 'menu.stats': 'Statistics', 'menu.settings': 'Settings',
      'menu.help': 'Manual', 'menu.credits': 'About', 'menu.build': 'BUILD',
      'campaign.select': 'Select Operation', 'campaign.region': 'Region',
      'briefing.deploy': 'Deploy', 'briefing.squad': 'Squad',
      'battle.move': 'MOVE', 'battle.hold': 'HOLD', 'battle.cover': 'COVER',
      'battle.watch': 'WATCH', 'battle.focus': 'FOCUS', 'battle.suppress': 'SUPPR',
      'battle.queue': 'QUEUE', 'battle.reload': 'RELOAD', 'battle.treat': 'TREAT',
      'battle.carry': 'CARRY', 'battle.fallback': 'FALL BK', 'battle.regroup': 'REGROUP',
      'battle.line': 'LINE', 'battle.cancel': 'CANCEL', 'battle.all': 'ALL',
      'hud.objectives': 'Objectives', 'hud.missiontime': 'MISSION TIME',
      'res.pause': 'Pause', 'res.resume': 'Resume', 'res.restart': 'Restart', 'res.abort': 'Abort',
      'results.complete': 'MISSION COMPLETE', 'results.failed': 'MISSION FAILED',
      'results.continue': 'Continue',
      'feats.contact': 'CONTACT', 'feats.down': 'IS DOWN', 'feats.kia': 'KIA',
      'feats.missioncomplete': 'MISSION COMPLETE',
      'set.language': 'Language', 'set.master': 'Master', 'set.music': 'Music',
      'set.sfx': 'Effects', 'set.quality': 'Quality', 'set.diagnostics': 'Performance HUD',
      'credits.title': 'About the creator', 'credits.made': 'Made by Amin',
      'credits.telegram': 'Telegram', 'credits.rubika': 'Rubika',
      'menu.kicker': 'Tactical squad command', 'menu.campaign': 'Campaign',
      'menu.ready': 'Ready soldiers', 'menu.credits2': 'Credits', 'menu.nosave': 'No campaign yet — start a new operation',
      'hub.title': 'Operations', 'hub.sub': 'Task Force Nightjar — ready for tasking', 'hub.secured': 'all regions secured', 'hub.ready': 'ready for tasking', 'role.commander': 'Commander', 'role.rifleman': 'Rifleman', 'role.assault': 'Assault',
      'role.support': 'Support', 'role.sniper': 'Sniper', 'role.medic': 'Medic',
      'role.engineer': 'Engineer',
      'res.opComplete': 'OPERATION COMPLETE', 'res.opFailed': 'OPERATION FAILED',
      'res.accomplished': 'Mission accomplished', 'res.failedDesc': 'Mission failed',
      'res.fieldtime': 'Field time ', 'res.objNotMet': 'Objective not met',
      'res.squad': 'Squad status', 'res.rewards': 'Rewards', 'res.continue': 'Continue',
      'bar.title': 'Barracks', 'bar.roster': 'Roster', 'bar.status': 'Status',
      'bar.rank': 'Rank', 'bar.xp': 'XP', 'bar.weapon': 'Weapon', 'bar.armor': 'Armour',
      'bar.injured': 'Injured', 'bar.ready': 'Ready', 'bar.dead': 'Lost',
      'ars.title': 'Arsenal', 'ars.damage': 'Damage', 'ars.range': 'Range',
      'ars.magazine': 'Magazine', 'ars.rate': 'Rate', 'ars.reload': 'Reload',
      'ars.upgrades': 'Upgrades', 'ars.cost': 'Cost'
    }
  },
  t(key) {
    const d = this.dict[this.lang] || this.dict.fa;
    return d[key] != null ? d[key] : (this.dict.fa[key] != null ? this.dict.fa[key] : key);
  },
  setLang(l) {
    this.lang = l === 'en' ? 'en' : 'fa';
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'fa' ? 'rtl' : 'ltr';
    document.body.classList.toggle('lang-fa', this.lang === 'fa');
    this.apply();
    try { localStorage.setItem('squadcommander.lang', this.lang); } catch (e) { /* storage blocked */ }
  },
  apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = this.t(el.dataset.i18n); });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = this.t(el.dataset.i18nTitle); });
  }
};
try { const saved = localStorage.getItem('squadcommander.lang'); if (saved) L10N.lang = saved; } catch (e) { /* storage blocked */ }
