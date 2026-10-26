// ======================================================================================
//  HELPERS
//  Settings, keys, dates and small utilities.
// ======================================================================================

function ensureSheet_(ss, name, header) {
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.setRightToLeft(true); }
  if (header && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground(HDR_BG);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readSettings_(ss, tz) {
  // The sheet part is cached (cleared by onEdit of the הגדרות sheet and by setSettings_).
  let raw = cacheGetJson_(CACHE_KEYS.SETTINGS);
  if (!raw) {
    const sh = sheet_(ss, SH.SETTINGS);
    if (!sh) throw new Error('המערכת עדיין לא הוגדרה — הריצו את "הגדרה ראשונית"');
    const v = sh.getRange(1, 1, Math.max(sh.getLastRow(), 2), 5).getValues();
    const map = {}, notes = {};
    v.forEach(r => {
      const k = String(r[0]).trim();
      if (!k) return;
      const hourRow = k === SET.FROM || k === SET.TO;
      map[k] = hourRow ? parseHour_(r[1], null, tz) : r[1] instanceof Date ? toKey_(r[1], tz) : r[1];
      notes[k] = String(r[2] || '');
    });
    raw = { map: map, notes: notes, excluded: v.slice(1).map(r => toKey_(r[4], tz)).filter(Boolean) };
    cachePutJson_(CACHE_KEYS.SETTINGS, raw);
  }
  const map = raw.map;
  const num = (x, d) => (x === '' || x == null || isNaN(Number(x))) ? d : Number(x);
  const excluded = new Set(raw.excluded);
  return { name: String(map[SET.NAME] || 'מניין שחרית').trim(), start: toKey_(map[SET.START], tz), end: toKey_(map[SET.END], tz),
           threshold: num(map[SET.PCT], 75), rebbe: num(map[SET.REBBE], 25), from: num(map[SET.FROM], 5), to: num(map[SET.TO], 11),   // hours; 8.5 = 8:30
           // The gabbai code is kept out of sight (script properties). Until setup() moves it there,
           // the old places still work: Secrets.gs, then the old "קוד גבאי" row.
           pin: gabbaiPin_() || secret_('gabbaiPin') || String(map[OLD_SET.PIN] == null ? '' : map[OLD_SET.PIN]).trim(),
           // The web-app address comes from Secrets.gs (deploymentId) only; the old sheet row until setup() removes it.
           url: webAppUrlFromSecrets_() || String(map[OLD_SET.URL] || '').trim(),
           shul: shulFromSheet_(map, raw.notes || {}),
           excluded: excluded };
}

/**
 * The shul area from the sheet: {lat, lng, radius, tol, note}, null when the rows are empty (no check),
 * or undefined when the sheet is from an older version without these rows (Location.gs then looks elsewhere).
 */
function shulFromSheet_(map, notes) {
  if (!(SET.LAT in map)) return undefined;
  const lat = Number(map[SET.LAT]), lng = Number(map[SET.LNG]);
  if (map[SET.LAT] === '' || map[SET.LNG] === '' || !isFinite(lat) || !isFinite(lng) || (!lat && !lng)) return null;
  const radius = Number(map[SET.RADIUS]) > 0 ? Number(map[SET.RADIUS]) : 50;
  const t = map[SET.TOL];
  const tol = t === '' || t == null || isNaN(Number(t)) || Number(t) < 0 ? null : Number(t);
  return { lat: lat, lng: lng, radius: radius, tol: tol, note: notes[SET.LAT] || '' };
}

/**
 * Writes settings by label: values = {label: value}, notes = {label: text for column C}. A missing row is
 * added at the end. Clears the cached copy.
 */
function setSettings_(values, notes) {
  const sh = sheet_(SpreadsheetApp.getActive(), SH.SETTINGS);
  const n = Math.max(sh.getLastRow(), 1);
  const labels = sh.getRange(1, 1, n, 1).getValues().map(r => String(r[0]).trim());
  let last = labels.reduce((m, l, i) => (l ? i + 1 : m), 0);      // last row used in column A (column E may be longer)
  const rowOf = label => {
    let i = labels.indexOf(label);
    if (i < 0) { i = last++; labels[i] = label; sh.getRange(i + 1, 1).setValue(label); }
    return i + 1;
  };
  Object.keys(values || {}).forEach(k => sh.getRange(rowOf(k), 2).setValue(values[k]));
  Object.keys(notes || {}).forEach(k => sh.getRange(rowOf(k), 3).setValue(notes[k]));
  cacheClear_();
}

/** Is self-registration open now? s.from / s.to are hours with half hours as .5 (8.5 = 8:30). */
function isOpenHour_(s, tz) {
  const t = Utilities.formatDate(new Date(), tz, 'H:mm').split(':');
  const now = Number(t[0]) + Number(t[1]) / 60;
  return now >= s.from && now < s.to;
}

/**
 * A registration hour from the sheet: 8, 8.5, "8:30", "08:30" or a time typed into a cell (a Date) →
 * hours as a number, rounded to the half hour (8:30 → 8.5). Anything else → the default.
 */
function parseHour_(v, def, tz) {
  let h = NaN;
  if (v instanceof Date) { const t = Utilities.formatDate(v, tz, 'H:mm').split(':'); h = Number(t[0]) + Number(t[1]) / 60; }
  else if (typeof v === 'number') h = v;
  else {
    const m = String(v == null ? '' : v).trim().match(/^(\d{1,2})(?:[:.](\d{1,2}))?$/);
    if (m) h = String(v).indexOf(':') >= 0 ? Number(m[1]) + Number(m[2] || 0) / 60 : Number(String(v).trim());
  }
  if (!isFinite(h) || h < 0 || h > 24) return def;
  return Math.round(h * 2) / 2;
}

// ---- Script cache: makes registration-page lookups cheap. Never the source of truth for writes. ----

const CACHE_KEYS = { PEOPLE: 'people.v1', SETTINGS: 'settings.v1' };
const CACHE_SECONDS = 600;
function cache_() { try { return CacheService.getScriptCache(); } catch (e) { return null; } }
function cacheGetJson_(k) {
  const c = cache_();
  if (!c) return null;
  try { const v = c.get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function cachePutJson_(k, v) {
  const c = cache_();
  if (!c) return;
  try {
    const s = JSON.stringify(v);
    if (s.length < 95000) c.put(k, s, CACHE_SECONDS); else c.remove(k);      // a cache entry holds up to 100 KB
  } catch (e) {}
}
function cacheClear_() {
  const c = cache_();
  if (c) { try { c.removeAll([CACHE_KEYS.PEOPLE, CACHE_KEYS.SETTINGS]); } catch (e) {} }
  if (typeof shulArea_ === 'function') shulArea_.v = undefined;           // derived from the settings
}

/** Entries waiting for review (each day of each person counts). Used by the reports' warnings. */
function countPending_(ss) {
  return readPending_(ss).filter(r => String(r[PQ.STATUS]) === ST.WAIT).length;
}
/** Names waiting for review, counted like the review screen: one card per same name + same phone. */
function countPendingNames_(ss) {
  const tz = ss.getSpreadsheetTimeZone(), keys = new Set();
  readPending_(ss).forEach(r => {
    if (String(r[PQ.STATUS]) !== ST.WAIT) return;
    const e = pendingEntry_(r, tz);
    keys.add(pendingGroupKey_(e));
  });
  return keys.size;
}
function pendingGroupKey_(e) { return norm_(e.raw) + '|' + e.phone; }

function appendRows_(sh, rows) {
  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function toast_(msg) { SpreadsheetApp.getActive().toast(msg, 'מניין', 10); }

function escHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function prop_(name) {
  const props = PropertiesService.getDocumentProperties();
  let v = props.getProperty(name);
  if (!v) { v = Utilities.getUuid().replace(/-/g, '').slice(0, 16); props.setProperty(name, v); }
  return v;
}
function kioskKey_() { return secret_('kioskKey') || prop_('KIOSK_KEY'); }

/**
 * A private value from Secrets.gs (kept out of git; see Secrets.gs.example). Returns '' when the file
 * or the value is missing, so the project also works without it (values then come from the sheet).
 */
function secret_(name) {
  // eslint-disable-next-line no-undef
  const s = typeof SECRETS !== 'undefined' && SECRETS ? SECRETS[name] : '';
  return s == null ? '' : String(s).trim();
}
/** A percentage (1–100) from Secrets.gs, or 0 when it is not set or not a valid number. */
function secretPercent_(name) {
  const v = Number(secret_(name).replace('%', ''));
  return v > 0 && v <= 100 ? v : 0;
}
/** The registration page address, built from the deployment ID in Secrets.gs (or '' if not set). */
function webAppUrlFromSecrets_() {
  const id = secret_('deploymentId');
  return id ? 'https://script.google.com/macros/s/' + id + '/exec' : '';
}
function adminToken_() { return prop_('ADMIN_TOKEN'); }
function checkKey_(k) { if (!k || k !== kioskKey_()) throw new Error('הקישור אינו תקין — בקשו מהגבאי קישור מעודכן'); }
function checkAdmin_(t) { if (!t || t !== adminToken_()) throw new Error('אין הרשאה'); }

// ---- Dates: internally every day is a 'yyyy-mm-dd' string ----

function todayKey_(tz) { return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'); }
function keyToDate_(k, tz) { return Utilities.parseDate(k, tz, 'yyyy-MM-dd'); }
function fmtKey_(k) { return k.slice(8, 10) + '/' + k.slice(5, 7) + '/' + k.slice(0, 4); }
/** JSON that is safe inside a <script> block (no "</script>", no line separators that break JS). */
function scriptJson_(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Adds the server's own time (ms) to a result, for the &debug=1 timing panel. */
function withMs_(t0, r) { if (r && typeof r === 'object') r._ms = Date.now() - t0; return r; }

function fmtShort_(k) { return k.slice(8, 10) + '/' + k.slice(5, 7); }
/** Hours as shown and written to the sheet: 8.5 → "8:30", 11 → "11:00". (Also sent to the pages.) */
function fmtHour_(h) { const m = Math.round(Number(h) * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); }
function ymd_(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10); }
function dow_(k) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))).getUTCDay(); }
function addDays_(k, n) { return ymd_(+k.slice(0, 4), +k.slice(5, 7), +k.slice(8, 10) + n); }

function toKey_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ymd_(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?$/);
  if (m) return dmyToKey_(m[1], m[2], m[3], todayKey_(tz));
  return '';
}

/** Israeli day/month order. Without a year: the most recent such date (not in the future). */
function dmyToKey_(d, m, y, todayKey) {
  d = +d; m = +m;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  let yr;
  if (y) { yr = +y; if (yr < 100) yr += 2000; if (yr < 2000 || yr > 2100) return ''; }
  else { yr = +todayKey.slice(0, 4); if (ymd_(yr, m, d) > addDays_(todayKey, 1)) yr--; }
  const k = ymd_(yr, m, d);
  return +k.slice(8, 10) === d ? k : '';
}

/**
 * The HTML of one of the page files (KioskPage.html, AdminPage.html …), ready to serve:
 *  - <script data-include="scripts/kiosk/main.js"></script> is replaced by that file's code. Apps Script
 *    can't serve .js files to the browser, so the browser code lives in scripts/*.js, is uploaded by clasp
 *    as HTML-type files (see "htmlExtensions" in .clasp.json), and is inlined here;
 *  - <link data-include="styles/tools.html"> is replaced by that file (a <style> block);
 *  - <script data-shared></script> gets the server functions the pages share (sharedJs_).
 */
function page_(name) {
  return fileText_(name)
    .replace(/<script data-include="([^"]+)"><\/script>/g, (m, file) => '<script>\n' + clientScript_(file) + '\n</script>')
    .replace(/<link data-include="([^"]+)\.html">/g, (m, file) => fileText_(file))
    .replace('<script data-shared></script>', () => '<script>\n' + sharedJs_() + '\n</script>');
}

/**
 * A project file's text exactly as written. Not createHtmlOutputFromFile(name).getContent(): that one is
 * rewritten by Google — comments are removed and, in a file that is plain script, every "<" becomes "&lt;",
 * which breaks the code. The template's raw content is the file untouched.
 */
function fileText_(name) { return HtmlService.createTemplateFromFile(name).getRawContent(); }

/** The code of one browser script, e.g. "scripts/kiosk/main.js" (stored in Apps Script as "scripts/kiosk/main"). */
function clientScript_(file) {
  const code = fileText_(file.replace(/\.js$/, ''));
  if (/<\/script/i.test(code)) throw new Error(file + ' must not contain "</script"');
  // Every script starts with a // comment line; if it's missing, the file was not read as written.
  if (!/^\s*\/\//.test(code)) throw new Error(file + ' was not read as written (its first comment line is missing)');
  return code;
}

/**
 * Server functions the pages use too (phone rules …), sent as source text so there is one copy of the
 * logic. Only self-contained functions belong here.
 */
function sharedJs_() {
  const fns = [normPhone_, validPhone_, fmtPhone_, fmtHour_,
               clean_, norm_, skel_, levRatio_, sim_, splitFull_, nameVariants_, knownFulls_, nameScore_, suggest_,
               nickCanon_, firstNames_, alsoSurnames_, isFirstName_, canonFirst_, firstSim_];
  const consts = { FINALS: FINALS, NICKNAMES: NICKNAMES, FIRST_NAMES_EXTRA: FIRST_NAMES_EXTRA };
  const regexes = { TITLES_RE: TITLES_RE, INVISIBLE_RE: INVISIBLE_RE, EMOJI_RE: EMOJI_RE };
  return Object.keys(consts).map(k => 'var ' + k + ' = ' + JSON.stringify(consts[k]) + ';')
    .concat(Object.keys(regexes).map(k => 'var ' + k + ' = ' + regexes[k].toString() + ';'))
    .concat(fns.map(f => f.toString())).join('\n');
}
