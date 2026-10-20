// Verify a pure-JS Hebrew calendar against ICU (Intl) for ~6 years of days.
const HEBREW_EPOCH = 347995.5;
const hLeap = y => ((7 * y + 1) % 19) < 7;
const hMonths = y => hLeap(y) ? 13 : 12;
function hDelay1(y) { const m = Math.floor((235 * y - 234) / 19); const parts = 12084 + 13753 * m; let d = m * 29 + Math.floor(parts / 25920); if ((3 * (d + 1)) % 7 < 3) d++; return d; }
function hDelay2(y) { const last = hDelay1(y - 1), pres = hDelay1(y), next = hDelay1(y + 1); return next - pres === 356 ? 2 : (pres - last === 382 ? 1 : 0); }
const hYearDays = y => hToJd(y + 1, 7, 1) - hToJd(y, 7, 1);
function hMonthDays(y, m) {
  if (m === 2 || m === 4 || m === 6 || m === 10 || m === 13) return 29;
  if (m === 12 && !hLeap(y)) return 29;
  if (m === 8 && hYearDays(y) % 10 !== 5) return 29;
  if (m === 9 && hYearDays(y) % 10 === 3) return 29;
  return 30;
}
function hToJd(y, m, d) {
  let jd = HEBREW_EPOCH + hDelay1(y) + hDelay2(y) + d + 1;
  if (m < 7) { for (let i = 7; i <= hMonths(y); i++) jd += hMonthDays(y, i); for (let i = 1; i < m; i++) jd += hMonthDays(y, i); }
  else for (let i = 7; i < m; i++) jd += hMonthDays(y, i);
  return jd;
}
function hFromJd(jd) {
  jd = Math.floor(jd) + 0.5;
  const count = Math.floor(((jd - HEBREW_EPOCH) * 98496.0) / 35975351.0);
  let y = count - 1;
  for (let i = count; jd >= hToJd(i, 7, 1); i++) y++;
  const first = jd < hToJd(y, 1, 1) ? 7 : 1;
  let m = first;
  for (let i = first; jd > hToJd(y, i, hMonthDays(y, i)); i++) m++;
  return { y, m, d: jd - hToJd(y, m, 1) + 1 };
}
const keyToJd = k => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)) / 86400000 + 2440587.5;
const ICU_M = { 'Tishri': 7, 'Heshvan': 8, 'Kislev': 9, 'Tevet': 10, 'Shevat': 11, 'Adar': 12, 'Adar I': 12, 'Adar II': 13, 'Nisan': 1, 'Iyar': 2, 'Sivan': 3, 'Tamuz': 4, 'Av': 5, 'Elul': 6 };
const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
let bad = 0, n = 0;
for (let t = Date.UTC(2023, 0, 1); t < Date.UTC(2029, 0, 1); t += 86400000) {
  const k = new Date(t).toISOString().slice(0, 10);
  const h = hFromJd(keyToJd(k));
  const p = Object.fromEntries(fmt.formatToParts(new Date(t + 43200000)).map(x => [x.type, x.value]));
  let m = ICU_M[p.month];
  if (p.month === 'Adar' && hLeap(h.y)) m = 13;
  n++;
  if (+p.day !== h.d || m !== h.m || +p.year !== h.y) { if (bad++ < 5) console.log('MISMATCH', k, h, p); }
  if (hToJd(h.y, h.m, h.d) !== keyToJd(k)) { if (bad++ < 5) console.log('ROUNDTRIP', k); }
}
console.log('checked', n, 'days, mismatches:', bad, '| 2026-10-19 =', JSON.stringify(hFromJd(keyToJd('2026-10-19'))));
