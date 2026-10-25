// ======================================================================================
//  GABBAI TOOLS PAGE (web app, "?k=…&view=gabbai")
//  The Sheet's מניין menu, in the browser and on a phone: review list, WhatsApp import, reports,
//  lottery, duplicates, the registration link, changing the code. Every call needs a gabbai session
//  (Auth.gs). The work itself is shared with the Sheet menu (Admin.gs, Reports.gs, Duplicates.gs).
// ======================================================================================

/** Runs fn with the script lock held — the web page may be used while someone registers. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** First call of the page: is the session alive, and the numbers for the home screen. */
function gabbaiInit(key, session) {
  checkKey_(key);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const s = readSettings_(ss, tz);
  const base = { name: s.name, today: todayKey_(tz) };
  if (!sessionValid_(key, session)) return Object.assign(base, { session: false });
  return Object.assign(base, {
    session: true, pending: countPending_(ss), minutes: AUTH.SESSION_SECONDS / 60,
    period: s.start && s.end ? { start: fmtKey_(s.start), end: fmtKey_(s.end), threshold: s.threshold } : null,
  });
}

// ---- Import and review (same screens as the Sheet dialog) ----
function gabbaiParseImport(key, session, text, defaultDate) { checkSession_(key, session); return parseImport_(text, defaultDate); }
function gabbaiQueueImport(key, session, rows) { checkSession_(key, session); return queueImport_(rows); }
function gabbaiGetPending(key, session) { checkSession_(key, session); return pendingGroups_(); }
function gabbaiResolve(key, session, decisions) { checkSession_(key, session); return resolvePending_(decisions); }

// ---- Reports ----
/** Weekly report: 7 days ending on endDate (empty = today). Writes the sheet, returns the WhatsApp text. */
function gabbaiWeekly(key, session, endDate) {
  checkSession_(key, session);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const end = endDate ? toKey_(endDate, tz) : todayKey_(tz);
  if (!end) throw new Error('התאריך אינו תקין');
  return withLock_(() => weeklyReport_(loadCtx_(ss), end, true));
}
function gabbaiFinal(key, session) {
  checkSession_(key, session);
  return withLock_(() => finalReport_(loadCtx_(SpreadsheetApp.getActive()), true));
}

// ---- Lottery ----
function gabbaiDrawInfo(key, session) {
  checkSession_(key, session);
  return drawInfo_(loadCtx_(SpreadsheetApp.getActive()));
}
function gabbaiDraw(key, session) {
  checkSession_(key, session);
  return withLock_(() => draw_(loadCtx_(SpreadsheetApp.getActive())));
}

// ---- Duplicates ----
function gabbaiFindDuplicates(key, session) {
  checkSession_(key, session);
  return findDuplicates_(loadCtx_(SpreadsheetApp.getActive()));
}
/** pairs = [{keep, drop}] (person IDs). Returns {merged, results: [status per pair]}. */
function gabbaiMerge(key, session, pairs) {
  checkSession_(key, session);
  return withLock_(() => mergePeople_(loadCtx_(SpreadsheetApp.getActive()), pairs));
}

// ---- Registration link ----
function gabbaiLink(key, session) {
  checkSession_(key, session);
  const ss = SpreadsheetApp.getActive();
  const link = kioskLink_(readSettings_(ss, ss.getSpreadsheetTimeZone()));
  return { link: link, tools: link ? link + '&view=gabbai' : '' };
}

// ---- Settings: name, registration hours, period, lottery threshold, days without a minyan ----
function settingsForPage_() {
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const s = readSettings_(ss, tz);
  return { name: s.name, from: s.from, to: s.to, start: s.start, end: s.end, threshold: s.threshold,
           excluded: Array.from(s.excluded).sort(), today: todayKey_(tz) };
}
function gabbaiSettings(key, session) { checkSession_(key, session); return settingsForPage_(); }

/** d = {name, from, to, start, end, threshold}. Checks everything first; saves all or nothing. */
function gabbaiSaveSettings(key, session, d) {
  checkSession_(key, session);
  d = d || {};
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const name = clean_(d.name);
  const from = Number(d.from), to = Number(d.to), thr = Number(d.threshold);
  const start = toKey_(d.start, tz), end = toKey_(d.end, tz);
  if (!name) throw new Error('חסר שם למניין');
  if (name.length > 60) throw new Error('שם המניין ארוך מדי');
  const half = x => isFinite(x) && Math.round(x * 2) === x * 2;                 // whole or half hours
  if (!(half(from) && half(to) && from >= 0 && to <= 24 && from < to)) throw new Error('שעות הרישום אינן תקינות: "משעה" צריכה להיות לפני "עד שעה", בקפיצות של חצי שעה');
  if (!start || !end) throw new Error('תאריכי התקופה אינם תקינים');
  if (start > end) throw new Error('תחילת התקופה אחרי סופה');
  if (!(thr >= 1 && thr <= 100)) throw new Error('אחוז הנוכחות להגרלה צריך להיות בין 1 ל-100');
  const v = {};
  v[SET.NAME] = name; v[SET.FROM] = fmtHour_(from); v[SET.TO] = fmtHour_(to); v[SET.PCT] = Math.round(thr * 10) / 10;
  v[SET.START] = keyToDate_(start, tz); v[SET.END] = keyToDate_(end, tz);
  withLock_(() => { textFormatHours_(); setSettings_(v); });
  return settingsForPage_();
}

/** The hour cells hold text ("8:30"), so Sheets doesn't turn them into times. */
function textFormatHours_() {
  const sh = sheet_(SpreadsheetApp.getActive(), SH.SETTINGS);
  const labels = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  [SET.FROM, SET.TO].forEach(l => { const i = labels.indexOf(l); if (i >= 0) sh.getRange(i + 1, 2).setNumberFormat('@'); });
}

/** Replaces the list of days without a minyan (column E of הגדרות). dates = ['yyyy-mm-dd', …]. */
function gabbaiSetNoMinyan(key, session, dates) {
  checkSession_(key, session);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const keys = Array.from(new Set((dates || []).map(x => toKey_(x, tz)))).filter(Boolean).sort();
  if (keys.length !== new Set(dates || []).size) throw new Error('אחד התאריכים אינו תקין');
  withLock_(() => {
    const sh = sheet_(ss, SH.SETTINGS);
    const n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 5, n - 1, 1).clearContent();
    if (keys.length) sh.getRange(2, 5, keys.length, 1).setValues(keys.map(k => [keyToDate_(k, tz)])).setNumberFormat('dd/mm/yyyy');
    cacheClear_();
  });
  return settingsForPage_();
}
