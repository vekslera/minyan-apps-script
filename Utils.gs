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
  const sh = ss.getSheetByName(SH.SETTINGS);
  if (!sh) throw new Error('המערכת עדיין לא הוגדרה — הריצו את "הגדרה ראשונית"');
  const n = Math.max(sh.getLastRow(), 2);
  const v = sh.getRange(1, 1, n, 5).getValues();
  const map = {};
  v.forEach(r => { const k = String(r[0]).trim(); if (k) map[k] = r[1]; });
  const num = (x, d) => (x === '' || x == null || isNaN(Number(x))) ? d : Number(x);
  const excluded = new Set(v.slice(1).map(r => toKey_(r[4], tz)).filter(Boolean));
  return { name: String(map[SET.NAME] || 'מניין שחרית').trim(), start: toKey_(map[SET.START], tz), end: toKey_(map[SET.END], tz),
           threshold: num(map[SET.PCT], 75), from: num(map[SET.FROM], 5), to: num(map[SET.TO], 11),
           // Values in Secrets.gs (not in git) win over the sheet.
           pin: secret_('gabbaiPin') || String(map[SET.PIN] == null ? '' : map[SET.PIN]).trim(),
           url: webAppUrlFromSecrets_() || String(map[SET.URL] || '').trim(),
           excluded: excluded };
}

function isOpenHour_(s, tz) {
  const h = Number(Utilities.formatDate(new Date(), tz, 'H'));
  return h >= s.from && h < s.to;
}

function countPending_(ss) {
  return readPending_(ss).filter(r => String(r[PQ.STATUS]) === ST.WAIT).length;
}

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
function fmtShort_(k) { return k.slice(8, 10) + '/' + k.slice(5, 7); }
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

/** The HTML of one of the page files (KioskPage.html, AdminPage.html …). */
function page_(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }
