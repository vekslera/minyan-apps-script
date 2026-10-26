// ======================================================================================
//  GABBAI ACCESS
//  One gabbai code for everything in gabbai mode (registering others, the gabbai tools page).
//  Logging in returns a session token; the code itself is never kept in the browser.
//  3 wrong codes in a row lock gabbai login for 60 seconds (for everyone — it is a guessing brake).
//  The code can be changed by the gabbai (tools page) or in the Sheet menu; a change logs everyone out.
//  The code is kept out of sight in the document properties (GABBAI_PIN) — not in the Sheet, not in git.
//  setup() puts it there from older versions (Secrets.gs gabbaiPin, or the old "קוד גבאי" row).
// ======================================================================================

const AUTH = { SESSION_SECONDS: 1800, LOCK_SECONDS: 60, MAX_FAILS: 3, MIN_LENGTH: 6 };
const SESSION_EXPIRED = 'נדרשת כניסה מחדש למצב גבאי';

/** The gabbai code ('' until setup() has stored one). */
function gabbaiPin_() {
  if (gabbaiPin_.v === undefined) {
    gabbaiPin_.v = PropertiesService.getDocumentProperties().getProperty('GABBAI_PIN') || '';
  }
  return gabbaiPin_.v;
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

/** Stores a new code and logs everyone out. */
function setPin_(next) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('GABBAI_PIN', next);
  props.setProperty('SESSION_GEN', String(Number(props.getProperty('SESSION_GEN') || '1') + 1));
  gabbaiPin_.v = next;
  cacheClear_();
}

/** A random first code for a new installation: 6 digits. */
function newPin_() { return String(100000 + Math.floor(Math.random() * 900000)); }

/**
 * Gabbai tools page: change the code (the current code is asked again). Everyone else is logged out;
 * the gabbai who changed it gets a fresh session and stays in.
 */
function gabbaiChangePin(key, token, current, next) {
  checkSession_(key, token);
  verifyPin_(current);
  const problem = pinProblem_(next);
  if (problem) throw new Error(problem);
  setPin_(String(next));
  const fresh = Utilities.getUuid().replace(/-/g, '');
  cache_().put('gs:' + fresh, sessionGen_(), AUTH.SESSION_SECONDS);
  return { ok: true, token: fresh };
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
