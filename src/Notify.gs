// ======================================================================================
//  NOTIFICATIONS TO THE MAINTAINER (ntfy — instant push to the ntfy app on a phone)
//
//  - Errors nobody caused on purpose are pushed at once: a page that breaks in the browser or a server call
//    that fails (reported by scripts/common/report.js → clientError), or the page failing to build (doGet).
//    The same error from the same place at most once an hour.
//  - Once a day (a time trigger that setup() installs) a check pushes the "quiet" problems: no page address,
//    the period ending or ended, no registration at all on recent minyan days, many entries waiting for review.
//
//  The topic comes from Maintainer.gs, which deploy\deploy-all.ps1 writes into each minyan's upload (from the
//  git-ignored deploy\maintainer.json) — never into git, never into the template. Without it nothing is sent.
//  Messages carry no registrants' names, phone numbers or locations: only the minyan (short name, name and its
//  Google account), where, and the error text, with long numbers masked. Expected errors (the Hebrew messages the app shows its users) are never sent.
// ======================================================================================

const NTFY = { SERVER: 'https://ntfy.sh', THROTTLE_S: 3600, CHECK_HOUR: 22, PENDING_MANY: 20, QUIET_DAYS: 3, ENDED_DAYS: 3 };

/** The registration page (Apps Script calls doGet by this name): builds it, and reports a failure. */
function doGet(e) {
  try { return doGet_(e); }
  catch (err) { reportError_('doGet', err && err.message); throw err; }
}

/** The maintainer's channel, or null (no Maintainer.gs: a template copy, or tests). */
function maintainer_() {
  // eslint-disable-next-line no-undef
  const m = typeof MAINTAINER !== 'undefined' && MAINTAINER ? MAINTAINER : null;
  return m && /^[\w-]{6,64}$/.test(String(m.ntfyTopic || '')) ? m : null;
}

/** Sends one notification. Returns true when ntfy accepted it. Never throws. */
function notify_(title, message, priority) {
  const m = maintainer_();
  if (!m) return false;
  try {
    let click = '';
    try { click = SpreadsheetApp.getActive().getUrl(); } catch (e) {}
    // which minyan's Google account it came from (Account.gs records it in setup)
    let account = '';
    try { account = PropertiesService.getDocumentProperties().getProperty('ACCOUNT') || ownerAccount_(SpreadsheetApp.getActive()); } catch (e) {}
    const res = UrlFetchApp.fetch(m.ntfyServer || NTFY.SERVER, {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ topic: m.ntfyTopic, title: title, message: message + (account ? '\nחשבון: ' + account : ''), priority: priority || 3,
                                tags: ['synagogue'].concat(m.minyan ? [String(m.minyan)] : []), click: click || undefined }),
    });
    return res.getResponseCode() < 300;
  } catch (e) { return false; }
}

/** No personal data in a notification: long numbers (phones, coordinates) masked, length limited. */
function scrub_(s) {
  return String(s == null ? '' : s).replace(/\+?\d[\d\s-]{6,}\d/g, '…').replace(/\d+\.\d{3,}/g, '…').slice(0, 300);
}
/** The app's own messages to its users are Hebrew; an error without Hebrew is one nobody meant. */
function unexpectedError_(message) { return !/[א-ת]/.test(String(message || '')); }
/** "steinbach · מניין שחרית": the short name from deploy\minyanim.json (in Maintainer.gs), then the minyan's own name. */
function notifyName_() {
  let name;
  try { const ss = SpreadsheetApp.getActive(); name = readSettings_(ss, ss.getSpreadsheetTimeZone()).name; }
  catch (e) { try { name = SpreadsheetApp.getActive().getName(); } catch (e2) { name = 'מניין'; } }
  const m = maintainer_(), short = m && m.minyan ? String(m.minyan) : '';
  return short ? short + ' · ' + name : name;
}
function hash_(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

/** Pushes an error at once — at most once an hour for the same place and message. */
function reportError_(where, message) {
  if (!maintainer_()) return false;
  const text = scrub_(message || 'שגיאה לא ידועה'), place = scrub_(where);
  const key = 'NTFY_' + hash_(place + '|' + text);
  const c = cache_();
  try { if (c && c.get(key)) return false; if (c) c.put(key, '1', NTFY.THROTTLE_S); } catch (e) {}
  return notify_('⚠ ' + notifyName_(), place + ': ' + text, 4);
}

/**
 * From the pages (scripts/common/report.js): a server call failed, or the page itself broke (kind 'page').
 * auth = the page key (registration and tools pages) or the admin token (Sheet dialogs).
 */
function clientError(auth, info) {
  if (!auth || (auth !== kioskKey_() && auth !== adminToken_())) return false;
  info = info || {};
  const msg = String(info.message || '');
  if (info.kind !== 'page' && !unexpectedError_(msg)) return false;
  return reportError_(String(info.page || 'page') + ' · ' + String(info.where || ''), msg);
}

/** מניין → שליחת התראת בדיקה למפתח: one notification, to see that alerts arrive. */
function menuTestAlert() {
  const ui = SpreadsheetApp.getUi();
  if (!maintainer_()) {
    ui.alert('התראות למפתח', 'ההתראות אינן מופעלות בגיליון הזה. הן מופעלות כשהמפתח מעדכן את המניין (deploy-all).', ui.ButtonSet.OK);
    return;
  }
  const ok = notify_('בדיקה · ' + notifyName_(), 'התראת בדיקה מהגיליון. אם היא הגיעה — ההתראות עובדות.', 3);
  ui.alert('התראות למפתח', ok ? 'התראת הבדיקה נשלחה.' : 'שליחת ההתראה נכשלה. נסו שוב מאוחר יותר.', ui.ButtonSet.OK);
}

/** setup(): the daily check, once per account that runs setup (dailyCheck skips a second run on the same day). */
function installDailyCheck_() {
  try {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyCheck')) return '';
    ScriptApp.newTrigger('dailyCheck').timeBased().everyDays(1).atHour(NTFY.CHECK_HOUR).create();
    return 'נקבעה בדיקה יומית (בסביבות ' + NTFY.CHECK_HOUR + ':00) שמתריעה למפתח על תקלות.';
  } catch (e) { return ''; }
}

/** The daily trigger. */
function dailyCheck() {
  if (!maintainer_()) return;
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone(), today = todayKey_(tz);
  const props = PropertiesService.getDocumentProperties();
  if (props.getProperty('DAILY_CHECK') === today) return;            // another account's trigger ran already
  props.setProperty('DAILY_CHECK', today);
  let lines;
  try { lines = dailyProblems_(ss, today); }
  catch (e) { lines = ['הבדיקה היומית נכשלה: ' + scrub_(e && e.message)]; }
  if (lines.length) notify_('בדיקה יומית · ' + notifyName_(), lines.join('\n'), 3);
}

/** The quiet problems, as short Hebrew lines ([] = all well). */
function dailyProblems_(ss, today) {
  const ctx = loadCtx_(ss), s = ctx.settings, out = [];
  const daysTo = k => Math.round((Date.parse(k) - Date.parse(today)) / 86400000);
  if (!kioskLink_(s)) out.push('כתובת דף הרישום לא הוגדרה (מניין ← כתובת דף הרישום (הדבקה)).');
  if (s.end) {
    const left = daysTo(s.end);
    if (left < 0 && -left <= NTFY.ENDED_DAYS) out.push('התקופה הסתיימה ב-' + fmtKey_(s.end) + '. תקופה חדשה: כלי הגבאי ← הגדרות.');
    else if (left === 7 || left === 1) out.push('התקופה מסתיימת ב-' + fmtKey_(s.end) + ' (עוד ' + left + (left === 1 ? ' יום' : ' ימים') + ').');
  }
  // No registration at all on the last few minyan days of the period (before today): the page or the link may be broken.
  if (s.start && s.start < today && !(s.end && s.end < addDays_(today, -1))) {
    const days = [];
    for (let k = addDays_(today, -1); k >= s.start && days.length < NTFY.QUIET_DAYS && daysTo(k) > -30; k = addDays_(k, -1)) {
      if (isMinyanDay_(s, k)) days.push(k);
    }
    if (days.length === NTFY.QUIET_DAYS) {
      const seen = new Set(ctx.attRows.map(r => r[0] ? toKey_(r[0], ctx.tz) : '').filter(Boolean));
      if (days.every(k => !seen.has(k))) out.push('אין אף רישום ב-' + NTFY.QUIET_DAYS + ' ימי המניין האחרונים. כדאי לבדוק שהדף והקישור עובדים.');
    }
  }
  const waiting = countPendingNames_(ss);
  if (waiting >= NTFY.PENDING_MANY) out.push(waiting + ' שמות ממתינים לבדיקה (כלי הגבאי ← רישומים לבדיקה).');
  return out;
}
