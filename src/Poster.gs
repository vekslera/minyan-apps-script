// ======================================================================================
//  THE PRINTABLE QR SIGN — the data it shows besides the link (scripts/gabbai/poster.js draws it)
//  The lottery's prize (its own row in הגדרות), the two thresholds, and the period as Hebrew dates.
//  A switched-off lottery or report (threshold 0) and missing dates are left out of the sign.
// ======================================================================================

/** For gabbaiLink(): {prize, threshold, rebbe, from, to} — from/to as Hebrew dates ("ט״ו בחשוון תשפ״ז"), or ''. */
function posterInfo_(s) {
  return { prize: s.prize || '', threshold: s.threshold, rebbe: s.rebbe,
           from: s.start ? hebDateLong_(s.start) : '', to: s.end ? hebDateLong_(s.end) : '' };
}

/** 'yyyy-mm-dd' → "ט״ו בחשוון תשפ״ז" (with ב before the month, as written on a sign). */
function hebDateLong_(k) {
  const h = hebFromKey_(k);
  return gematria_(h.d) + ' ב' + hebMonthName_(h.y, h.m) + ' ' + gematria_(h.y % 1000);
}
