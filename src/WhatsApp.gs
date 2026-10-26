// ======================================================================================
//  WHATSAPP PARSER
//  Turns pasted WhatsApp text into (date, name) rows.
// ======================================================================================

/** Lines of pasted WhatsApp text → [{date:'yyyy-mm-dd'|'', name}] */
function parseWhatsAppLines_(lines, todayKey) {
  const out = [];
  let cur = '', shifted = false;
  const DATE_RE = /(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/;
  const BULLET_RE = /^\s*(?:\d{1,3}\s*[.)\-:]\s*|[-–•*·▪●○◦>]+\s*)/;
  const DAYWORDS_RE = /(?:^|\s)(?:יום\s+)?(?:[א-ו]['׳]|ראשון|שני|שלישי|רביעי|חמישי|שישי)(?=\s|$|[,:.\-])/g;
  for (const line of lines) {
    let t = String(line).replace(INVISIBLE_RE, '').replace(EMOJI_RE, '').trim();
    if (!t) continue;
    // Message prefixes:  [19/10/2026, 07:45:12] Name: text  ·  [07:45, 19/10/2026] Name: text  ·  19/10/2026, 07:45 - Name: text
    const pm = t.match(/^\[([^\]]*\d{1,2}:\d{2}[^\]]*)\]\s*([^:]{1,40}):\s*(.*)$/) ||
               t.match(/^(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp]\.?\s?[Mm]\.?)?)\s*[-–]\s*([^:]{1,40}):\s*(.*)$/);
    if (pm) {
      const pd = pm[1].match(DATE_RE);
      const posted = pd ? dmyToKey_(pd[1], pd[2], pd[3], todayKey) : '';
      // A list posted on Shabbat (usually Motzaei Shabbat) is Friday's list.
      if (posted) { shifted = dow_(posted) === 6; cur = shifted ? addDays_(posted, -1) : posted; }
      t = pm[3].trim();
      if (!t) continue;
    }
    // A Hebrew date ("ח׳ חשוון", "יום ב' כ"ח תשרי") also sets the date.
    const hd = parseHebDate_(t, todayKey);
    if (hd) {
      cur = hd.key; shifted = false;
      t = t.replace(hd.match, ' ').replace(DATE_RE, ' ').replace(DAYWORDS_RE, ' ').replace(/^[\s:,.\-–]+/, '').trim();
      if (!t || !/[A-Za-z\u05D0-\u05EA]{2}/.test(t)) continue;
    }
    // A date on a line sets the date for the names after it; names may follow on the same line.
    const dm = t.match(DATE_RE);
    if (dm) {
      const k = dmyToKey_(dm[1], dm[2], dm[3], todayKey);
      if (k) {
        cur = k; shifted = false;
        t = t.replace(dm[0], ' ').replace(DAYWORDS_RE, ' ').replace(/^[\s:,.\-–]+/, '').trim();
        if (!t) continue;
      }
    }
    t = t.replace(BULLET_RE, '').trim();
    if (!/[A-Za-zא-ת]/.test(t)) continue;
    const lower = t.toLowerCase();
    if (STOPWORDS.some(w => lower.includes(w))) continue;
    for (let piece of t.split(/[,;]+|\s+[-–]\s+/)) {
      piece = piece.replace(BULLET_RE, '').replace(/[!?:.]+$/, '').trim();
      if (!piece || !/[A-Za-zא-ת]/.test(piece)) continue;
      if (piece.split(/\s+/).length > 4) continue;           // a sentence, not a name
      out.push(shifted ? { date: cur, name: piece, shifted: true } : { date: cur, name: piece });
    }
  }
  return out;
}
