// ======================================================================================
//  GABBAI ACCESS
//  One gabbai code for everything in gabbai mode (registering others, the gabbai tools page).
//  Logging in returns a session token; the code itself is never kept in the browser.
//  3 wrong codes in a row lock gabbai login for 60 seconds (for everyone — it is a guessing brake).
//  The code can be changed by the gabbai (tools page) or in the Sheet menu; a change logs everyone out.
//  Where the code comes from, first match wins: changed by the gabbai (script properties) →
//  Secrets.gs gabbaiPin → the הגדרות sheet.
// ======================================================================================

const AUTH = { SESSION_SECONDS: 1800, LOCK_SECONDS: 60, MAX_FAILS: 3, MIN_LENGTH: 6 };
const SESSION_EXPIRED = 'נדרשת כניסה מחדש למצב גבאי';

/** The gabbai code as changed by the gabbai, if it ever was ('' otherwise). */
function changedPin_() {
  if (changedPin_.v === undefined) {
    changedPin_.v = PropertiesService.getDocumentProperties().getProperty('GABBAI_PIN') || '';
  }
  return changedPin_.v;
}
function sessionGen_() { return PropertiesService.getDocumentProperties().getProperty('SESSION_GEN') || '1'; }

/** Checks a typed code. Throws a Hebrew message when locked or wrong; counts failures. */
function verifyPin_(pin) {
  const c = cache_();
  const now = Date.now();
  const lockUntil = Number(c && c.get('pinLock') || 0);
  if (now < lockUntil) throw new Error('יותר מדי ניסיונות שגויים — נסו שוב בעוד ' + Math.ceil((lockUntil - now) / 1000) + ' שניות');
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss, ss.getSpreadsheetTimeZone());
  if (s.pin && String(pin == null ? '' : pin).trim() === s.pin) { if (c) c.remove('pinFails'); return true; }
  const fails = Number(c && c.get('pinFails') || 0) + 1;
  if (c && fails >= AUTH.MAX_FAILS) {
    c.put('pinLock', String(now + AUTH.LOCK_SECONDS * 1000), AUTH.LOCK_SECONDS + 5);
    c.remove('pinFails');
    throw new Error('קוד שגוי 3 פעמים — הכניסה נעולה ל-' + AUTH.LOCK_SECONDS + ' שניות');
  }
  if (c) c.put('pinFails', String(fails), 600);
  throw new Error('קוד הגבאי שגוי');
}

/** Gabbai login: returns a session token (valid 30 minutes after the last use). */
function kioskLogin(key, pin) {
  checkKey_(key);
  verifyPin_(pin);
  const token = Utilities.getUuid().replace(/-/g, '');
  cache_().put('gs:' + token, sessionGen_(), AUTH.SESSION_SECONDS);
  return { token: token, minutes: AUTH.SESSION_SECONDS / 60, weakCode: String(pin).trim().length < AUTH.MIN_LENGTH };
}

/** Throws SESSION_EXPIRED unless the token is a live session; extends it. */
function checkSession_(key, token) {
  checkKey_(key);
  const c = cache_();
  const v = token && c ? c.get('gs:' + token) : null;
  if (!v || v !== sessionGen_()) throw new Error(SESSION_EXPIRED);
  c.put('gs:' + token, v, AUTH.SESSION_SECONDS);
}
function sessionValid_(key, token) { try { checkSession_(key, token); return true; } catch (e) { return false; } }

function kioskLogout(key, token) {
  checkKey_(key);
  if (token) { const c = cache_(); if (c) c.remove('gs:' + token); }
  return true;
}

/** Rules for a new code. Returns an error message, or '' when fine. */
function pinProblem_(next) {
  next = String(next == null ? '' : next);
  if (next !== next.trim() || /\s/.test(next)) return 'הקוד לא יכול להכיל רווחים';
  if (next.length < AUTH.MIN_LENGTH) return 'הקוד צריך להיות לפחות ' + AUTH.MIN_LENGTH + ' תווים';
  if (next.length > 32) return 'הקוד ארוך מדי';
  return '';
}

/** Stores a new code, logs everyone out, and notes the change next to the old value in the sheet. */
function setPin_(next) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('GABBAI_PIN', next);
  props.setProperty('SESSION_GEN', String(Number(props.getProperty('SESSION_GEN') || '1') + 1));
  changedPin_.v = next;
  cacheClear_();
  try {
    const sh = sheet_(SpreadsheetApp.getActive(), SH.SETTINGS);
    const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), 1).getValues();
    const row = v.findIndex(r => String(r[0]).trim() === SET.PIN);
    if (row >= 0) sh.getRange(row + 1, 3).setValue('הקוד שונה על ידי הגבאי ב-' + fmtKey_(todayKey_(SpreadsheetApp.getActive().getSpreadsheetTimeZone())) + ' — הערך בעמודה B כבר לא בשימוש');
  } catch (e) {}
}

/** Gabbai tools page: change the code (the current code is asked again). */
function gabbaiChangePin(key, token, current, next) {
  checkSession_(key, token);
  verifyPin_(current);
  const problem = pinProblem_(next);
  if (problem) throw new Error(problem);
  setPin_(String(next));
  return { ok: true };
}

/** Sheet menu: change the gabbai code. */
function menuChangePin() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('שינוי קוד גבאי', 'הקוד החדש (לפחות ' + AUTH.MIN_LENGTH + ' תווים).\nכל מי שבמצב גבאי ינותק.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const next = r.getResponseText();
  const problem = pinProblem_(next);
  if (problem) { ui.alert(problem); return; }
  setPin_(next);
  ui.alert('קוד הגבאי שונה.');
}
