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
      'role.commander': 'فرمانده', 'role.rifleman': 'تفنگدار', 'role.assault': 'یورش‌بر',
      'role.support': 'پشتیبان', 'role.sniper': 'تیرانداز دقیق', 'role.medic': 'بهدار',
      'role.engineer': 'مهندس رزمی'
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
      'role.commander': 'Commander', 'role.rifleman': 'Rifleman', 'role.assault': 'Assault',
      'role.support': 'Support', 'role.sniper': 'Sniper', 'role.medic': 'Medic',
      'role.engineer': 'Engineer'
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
