// ======================================================================================
//  HEBREW CALENDAR
//  Pure arithmetic (no dependence on the server's Intl support), gematria, Hebrew-date parsing.
// ======================================================================================

// Months are numbered from Nisan: 1 ניסן … 6 אלול, 7 תשרי, 8 חשוון, 9 כסלו, 10 טבת, 11 שבט, 12 אדר (א׳), 13 אדר ב׳

const HEB_EPOCH = 347995.5;
function hLeap_(y) { return ((7 * y + 1) % 19) < 7; }
function hMonths_(y) { return hLeap_(y) ? 13 : 12; }
function hDelay1_(y) {
  const m = Math.floor((235 * y - 234) / 19), parts = 12084 + 13753 * m;
  let d = m * 29 + Math.floor(parts / 25920);
  if ((3 * (d + 1)) % 7 < 3) d++;
  return d;
}
function hDelay2_(y) {
  const last = hDelay1_(y - 1), pres = hDelay1_(y), next = hDelay1_(y + 1);
  return next - pres === 356 ? 2 : (pres - last === 382 ? 1 : 0);
}
function hYearDays_(y) { return hToJd_(y + 1, 7, 1) - hToJd_(y, 7, 1); }
function hMonthDays_(y, m) {
  if (m === 2 || m === 4 || m === 6 || m === 10 || m === 13) return 29;
  if (m === 12 && !hLeap_(y)) return 29;
  if (m === 8 && hYearDays_(y) % 10 !== 5) return 29;
  if (m === 9 && hYearDays_(y) % 10 === 3) return 29;
  return 30;
}
function hToJd_(y, m, d) {
  let jd = HEB_EPOCH + hDelay1_(y) + hDelay2_(y) + d + 1;
  if (m < 7) {
    for (let i = 7; i <= hMonths_(y); i++) jd += hMonthDays_(y, i);
    for (let i = 1; i < m; i++) jd += hMonthDays_(y, i);
  } else for (let i = 7; i < m; i++) jd += hMonthDays_(y, i);
  return jd;
}
function hFromJd_(jd) {
  jd = Math.floor(jd) + 0.5;
  const count = Math.floor(((jd - HEB_EPOCH) * 98496.0) / 35975351.0);
  let y = count - 1;
  for (let i = count; jd >= hToJd_(i, 7, 1); i++) y++;
  const first = jd < hToJd_(y, 1, 1) ? 7 : 1;
  let m = first;
  for (let i = first; jd > hToJd_(y, i, hMonthDays_(y, i)); i++) m++;
  return { y: y, m: m, d: jd - hToJd_(y, m, 1) + 1 };
}
function keyToJd_(k) { return Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000 + 2440587.5; }
function jdToKey_(jd) { return new Date((Math.floor(jd) + 0.5 - 2440587.5) * 86400000).toISOString().slice(0, 10); }
/** 'yyyy-mm-dd' → {y, m, d} in the Hebrew calendar */
function hebFromKey_(k) { return hFromJd_(keyToJd_(k)); }

const HEB_MONTH_NAMES = { 1: 'ניסן', 2: 'אייר', 3: 'סיוון', 4: 'תמוז', 5: 'אב', 6: 'אלול', 7: 'תשרי', 8: 'חשוון',
                          9: 'כסלו', 10: 'טבת', 11: 'שבט', 12: 'אדר', 13: 'אדר ב׳' };
function hebMonthName_(y, m) { return m === 12 && hLeap_(y) ? 'אדר א׳' : HEB_MONTH_NAMES[m]; }

/** Number → Hebrew letters with geresh/gershayim (8 → ח׳, 15 → ט״ו, 787 → תשפ״ז). */
function gematria_(n) {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'],
        hund = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  let s = hund[Math.floor(n / 100)];
  const r = n % 100;
  if (r === 15) s += 'טו'; else if (r === 16) s += 'טז'; else s += tens[Math.floor(r / 10)] + ones[r % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
/** Hebrew letters → number ("כ״ח" → 28, "טו" → 15). Returns 0 if it isn't a plain number. */
function gematriaValue_(s) {
  const V = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ך': 20, 'ל': 30, 'מ': 40,
              'ם': 40, 'נ': 50, 'ן': 50, 'ס': 60, 'ע': 70, 'פ': 80, 'ף': 80, 'צ': 90, 'ץ': 90, 'ק': 100, 'ר': 200, 'ש': 300, 'ת': 400 };
  const t = String(s).replace(/['"׳״]/g, '');
  let n = 0;
  for (const c of t) { if (!V[c]) return 0; n += V[c]; }
  return n;
}
/** 'yyyy-mm-dd' → "ח׳ חשוון תשפ״ז" */
function hebDateStr_(k) {
  const h = hebFromKey_(k);
  return gematria_(h.d) + ' ' + hebMonthName_(h.y, h.m) + ' ' + gematria_(h.y % 1000);
}

const HEB_MONTH_RE = '(?:מר)?חשו?ון|תשרי|כסלי?ו|טבת|שבט|אדר(?:\\s*(?:א[׳\'"]?|ב[׳\'"]?|ראשון|שני))?|ניסן|אי?יר|סיו?ון|תמוז|(?:מנחם\\s+)?אב|אלול';
const HEB_DATE_RE = new RegExp('(?:^|[\\s,(])([א-ת]{1,2}["\'׳״]?[א-ת]?)\\s+(?:ב|ל)?(' + HEB_MONTH_RE + ')(?=$|[\\s,.)\\-])(?:\\s+(?:ה|ה׳|ה\')?([א-ת]{2,4}["\'׳״][א-ת]))?');

/**
 * Finds a Hebrew date in a line ("ח׳ חשוון", "יום ב' כ"ח תשרי תשפ"ז") and returns
 * {key:'yyyy-mm-dd', match:'…'} — the most recent such day not after tomorrow — or null.
 */
function parseHebDate_(line, todayKey) {
  const m = String(line).match(HEB_DATE_RE);
  if (!m) return null;
  const day = gematriaValue_(m[1]);
  if (day < 1 || day > 30) return null;
  const mn = m[2];
  let month = 0;
  if (/חשו?ון/.test(mn)) month = 8; else if (/תשרי/.test(mn)) month = 7; else if (/כסל/.test(mn)) month = 9;
  else if (/טבת/.test(mn)) month = 10; else if (/שבט/.test(mn)) month = 11; else if (/ניסן/.test(mn)) month = 1;
  else if (/אי?יר/.test(mn)) month = 2; else if (/סיו?ון/.test(mn)) month = 3; else if (/תמוז/.test(mn)) month = 4;
  else if (/אלול/.test(mn)) month = 6; else if (/אב$/.test(mn)) month = 5;
  else if (/אדר/.test(mn)) month = /ב[׳'"]?$|שני$/.test(mn) ? 13 : (/א[׳'"]?$|ראשון$/.test(mn) ? 12 : -1);
  if (!month) return null;
  let year = m[3] ? 5000 + gematriaValue_(m[3]) : 0;
  const limit = keyToJd_(addDays_(todayKey, 1));
  let y = year || hebFromKey_(todayKey).y;
  for (let tries = 0; tries < 3; tries++, y--) {
    let mm = month;
    if (mm === -1) mm = hLeap_(y) ? 13 : 12;                // plain "אדר" = the Adar of Purim
    if (mm === 13 && !hLeap_(y)) mm = 12;
    if (day > hMonthDays_(y, mm)) { if (year) return null; continue; }
    const jd = hToJd_(y, mm, day);
    if (jd <= limit || year) return { key: jdToKey_(jd), match: m[0] };
  }
  return null;
}
