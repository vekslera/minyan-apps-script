// Registration page — today's Hebrew and Gregorian date for the header.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function keyDate(k) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10), 12)); }
function shortDate(k) { return k.slice(8, 10) + '/' + k.slice(5, 7); }
// ---------- Hebrew date ----------
function gem(n) {
  var ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'],
      hund = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  var s = hund[Math.floor(n / 100)], r = n % 100;
  if (r === 15) s += 'טו'; else if (r === 16) s += 'טז'; else s += tens[Math.floor(r / 10)] + ones[r % 10];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
function hebDate(k) {
  try {
    var parts = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(keyDate(k));
    var d = 0, m = '', y = 0;
    parts.forEach(function (p) {
      if (p.type === 'day') d = parseInt(p.value, 10);
      if (p.type === 'month') m = p.value;
      if (p.type === 'year' || p.type === 'relatedYear') y = parseInt(p.value, 10) || y;
    });
    if (!d || !m || !y) return '';
    if (m.charAt(0) !== 'ב') m = 'ב' + m;
    return gem(d) + ' ' + m + ' ' + gem(y % 1000);
  } catch (e) { return ''; }
}
function gregDate(k) {
  try { return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(keyDate(k)); }
  catch (e) { return shortDate(k); }
}
