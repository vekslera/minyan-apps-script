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
