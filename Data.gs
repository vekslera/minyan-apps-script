// ======================================================================================
//  DATA ACCESS
//  Sheets are read once into memory (a "ctx"), changed, and written back in one go.
// ======================================================================================

function loadCtx_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const ps = ss.getSheetByName(SH.PEOPLE);
  if (!ps) throw new Error('המערכת עדיין לא הוגדרה — הריצו את "הגדרה ראשונית"');
  const pv = ps.getLastRow() > 1 ? ps.getRange(2, 1, ps.getLastRow() - 1, PEOPLE_HDR.length).getValues() : [];
  const people = pv.filter(r => String(r[0]).trim()).map(r => ({
    id: String(r[0]).trim(), first: String(r[1]).trim(), last: String(r[2]).trim(), phone: normPhone_(r[3]),
    aliases: String(r[4] || '').split(';').map(x => x.trim()).filter(Boolean), added: r[5], notes: String(r[6] || ''),
  }));
  const byId = {};
  people.forEach(p => { byId[p.id] = p; });

  const as = ss.getSheetByName(SH.ATT);
  const av = as.getLastRow() > 1 ? as.getRange(2, 1, as.getLastRow() - 1, ATT_HDR.length).getValues() : [];
  const attKeys = new Set(av.filter(r => r[0] && r[1]).map(r => toKey_(r[0], tz) + '|' + String(r[1]).trim()));

  const settings = readSettings_(ss, tz);
  return { ss: ss, tz: tz, people: people, byId: byId, attRows: av, attKeys: attKeys, settings: settings,
           excluded: settings.excluded, pendingBase: Math.max(ss.getSheetByName(SH.PENDING).getLastRow(), 1),
           newAtt: [], newPending: [], peopleDirty: false };
}

function flushCtx_(ctx) {
  const ss = ctx.ss;
  if (ctx.peopleDirty) {
    const sh = ss.getSheetByName(SH.PEOPLE);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, PEOPLE_HDR.length).clearContent();
    if (ctx.people.length) {
      sh.getRange(2, 1, ctx.people.length, PEOPLE_HDR.length).setValues(ctx.people.map(p =>
        [p.id, p.first, p.last, p.phone, p.aliases.join('; '), p.added || new Date(), p.notes || '']));
    }
  }
  appendRows_(ss.getSheetByName(SH.ATT), ctx.newAtt);
  appendRows_(ss.getSheetByName(SH.PENDING), ctx.newPending);
  ctx.pendingBase += ctx.newPending.length;
  ctx.newAtt = []; ctx.newPending = []; ctx.peopleDirty = false;
}

function record_(ctx, p, e) {
  const key = e.date + '|' + p.id;
  if (ctx.attKeys.has(key)) return false;                 // already counted for that day
  ctx.attKeys.add(key);
  const raw = e.raw || [e.first, e.last].filter(Boolean).join(' ') + (e.phone ? ' · ' + fmtPhone_(e.phone) : '');
  const row = [keyToDate_(e.date, ctx.tz), p.id, displayName_(p), e.source, raw.trim(), e.loggedAt || new Date()];
  ctx.newAtt.push(row);
  ctx.attRows.push(row);
  return true;
}

function createPerson_(ctx, e) {
  const max = ctx.people.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0);
  const p = { id: 'P' + String(max + 1).padStart(3, '0'), first: e.first || '', last: e.last || '',
              phone: e.phone || '', aliases: [], added: new Date(), notes: '' };
  ctx.people.push(p);
  ctx.byId[p.id] = p;
  ctx.peopleDirty = true;
  return p;
}

/** Remember a new spelling; fill in a missing phone / first name. */
function learn_(ctx, p, e) {
  learnAlias_(ctx, p, e.raw || [e.first, e.last].filter(Boolean).join(' '));
  if (e.phone && !p.phone && !ctx.people.some(q => q.phone === e.phone)) { p.phone = e.phone; ctx.peopleDirty = true; }
  if (!p.first && e.first && e.last && sim_(norm_(e.last), norm_(p.last)) >= 0.9) { p.first = e.first; ctx.peopleDirty = true; }
}

function learnAlias_(ctx, p, raw) {
  raw = clean_(raw);
  const n = norm_(raw);
  if (!n || knownFulls_(p).includes(n) || norm_(p.last) === n) return;
  // A lone surname is only worth remembering if nobody else has a similar surname.
  if (n.split(' ').length === 1 && ctx.people.some(q => q !== p && sim_(n, norm_(q.last)) >= 0.75)) return;
  p.aliases.push(raw);
  ctx.peopleDirty = true;
}

function queuePending_(ctx, e, note) {
  const id = 'Q' + String(ctx.pendingBase + ctx.newPending.length).padStart(4, '0');
  const raw = e.raw || [e.first, e.last].filter(Boolean).join(' ');
  ctx.newPending.push([id, e.loggedAt || new Date(), e.date ? keyToDate_(e.date, ctx.tz) : '', e.source,
                       raw, e.first || '', e.last || '', e.phone || '', note || '', ST.WAIT]);
}

function readPending_(ss) {
  const sh = ss.getSheetByName(SH.PENDING);
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, PEND_HDR.length).getValues() : [];
}

function pendingEntry_(r, tz) {
  return { id: String(r[PQ.ID]), loggedAt: r[PQ.LOGGED], date: toKey_(r[PQ.DATE], tz), source: String(r[PQ.SRC]),
           raw: clean_(r[PQ.RAW]), first: clean_(r[PQ.FIRST]), last: clean_(r[PQ.LAST]),
           phone: normPhone_(r[PQ.PHONE]), note: String(r[PQ.NOTE] || ''), full: '' };
}
