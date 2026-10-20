// ======================================================================================
//  DATA ACCESS
//  Sheets are read once into memory (a "ctx"), changed, and written back in one go.
// ======================================================================================

/** Sheet handles, looked up once per execution (each lookup is a call to Google's servers). */
function sheet_(ss, name) {
  const memo = sheet_.memo || (sheet_.memo = {});
  if (!memo[name]) memo[name] = ss.getSheetByName(name);
  return memo[name];
}

function peopleFromRows_(pv) {
  return pv.filter(r => String(r[0]).trim()).map(r => ({
    id: String(r[0]).trim(), first: String(r[1]).trim(), last: String(r[2]).trim(), phone: normPhone_(r[3]),
    aliases: String(r[4] || '').split(';').map(x => x.trim()).filter(Boolean), added: r[5], notes: String(r[6] || ''),
  }));
}

/** Reads the People sheet (always fresh — used before writing). Also refreshes the read-only cache. */
function readPeople_(ss) {
  const ps = sheet_(ss, SH.PEOPLE);
  if (!ps) throw new Error('המערכת עדיין לא הוגדרה — הריצו את "הגדרה ראשונית"');
  const n = ps.getLastRow() - 1;
  const people = peopleFromRows_(n > 0 ? ps.getRange(2, 1, n, PEOPLE_HDR.length).getValues() : []);
  people.rowsOnSheet = Math.max(n, 0);
  cachePeople_(people);
  return people;
}

/**
 * People for read-only use (registration-page lookups): from the cache when possible, else the sheet.
 * The cache is cleared on every write by this script and on any manual edit of the אנשים sheet (onEdit).
 */
function peopleForReading_(ss) {
  const c = cacheGetJson_(CACHE_KEYS.PEOPLE);
  if (c) return c.map(p => Object.assign(p, { added: p.added ? new Date(p.added) : '' }));
  return readPeople_(ss);
}
function cachePeople_(people) {
  cachePutJson_(CACHE_KEYS.PEOPLE, people.map(p => ({ id: p.id, first: p.first, last: p.last, phone: p.phone,
    aliases: p.aliases, added: p.added instanceof Date ? p.added.getTime() : '', notes: p.notes })));
}

/**
 * Everything one action needs, in memory. People and settings are read up front; the attendance history
 * and the review sheet are read only if the action touches them (they are the large ones).
 */
function loadCtx_(ss) {
  const tz = ss.getSpreadsheetTimeZone();
  const people = readPeople_(ss);
  const byId = {};
  people.forEach(p => { byId[p.id] = p; });
  const settings = readSettings_(ss, tz);
  const ctx = { ss: ss, tz: tz, people: people, byId: byId, settings: settings, excluded: settings.excluded,
                newAtt: [], newPending: [], peopleDirty: false, peopleRowsOnSheet: people.rowsOnSheet };
  let att = null, pendingBase = null;
  const loadAtt = () => {
    if (!att) {
      const as = sheet_(ss, SH.ATT), n = as.getLastRow() - 1;
      const rows = n > 0 ? as.getRange(2, 1, n, ATT_HDR.length).getValues() : [];
      att = { rows: rows, keys: new Set(rows.filter(r => r[0] && r[1]).map(r => toKey_(r[0], tz) + '|' + String(r[1]).trim())) };
    }
    return att;
  };
  Object.defineProperty(ctx, 'attRows', { get: () => loadAtt().rows, set: v => { loadAtt().rows = v; } });
  Object.defineProperty(ctx, 'attKeys', { get: () => loadAtt().keys });
  Object.defineProperty(ctx, 'pendingBase', {
    get: () => (pendingBase === null ? (pendingBase = Math.max(sheet_(ss, SH.PENDING).getLastRow(), 1)) : pendingBase),
    set: v => { pendingBase = v; },
  });
  return ctx;
}

function flushCtx_(ctx) {
  const ss = ctx.ss;
  if (ctx.peopleDirty) {
    const sh = sheet_(ss, SH.PEOPLE);
    if (ctx.people.length) {
      sh.getRange(2, 1, ctx.people.length, PEOPLE_HDR.length).setValues(ctx.people.map(p =>
        [p.id, p.first, p.last, p.phone, p.aliases.join('; '), p.added || new Date(), p.notes || '']));
    }
    const extra = ctx.peopleRowsOnSheet - ctx.people.length;                // rows left over after a merge
    if (extra > 0) sh.getRange(2 + ctx.people.length, 1, extra, PEOPLE_HDR.length).clearContent();
    ctx.peopleRowsOnSheet = ctx.people.length;
    cachePeople_(ctx.people);
  }
  if (ctx.newAtt.length) appendRows_(sheet_(ss, SH.ATT), ctx.newAtt);
  if (ctx.newPending.length) {
    appendRows_(sheet_(ss, SH.PENDING), ctx.newPending);
    ctx.pendingBase += ctx.newPending.length;
  }
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
  // IDs are never reused, even after a row is deleted by hand: old attendance rows keep pointing at the old ID.
  const props = PropertiesService.getDocumentProperties();
  const max = ctx.people.reduce((m, p) => Math.max(m, Number(String(p.id).replace(/\D/g, '')) || 0), 0);
  const next = Math.max(max + 1, Number(props.getProperty('NEXT_PERSON') || 0));
  props.setProperty('NEXT_PERSON', String(next + 1));
  const p = { id: 'P' + String(next).padStart(3, '0'), first: e.first || '', last: e.last || '',
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
  const sh = sheet_(ss, SH.PENDING);
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, PEND_HDR.length).getValues() : [];
}

function pendingEntry_(r, tz) {
  return { id: String(r[PQ.ID]), loggedAt: r[PQ.LOGGED], date: toKey_(r[PQ.DATE], tz), source: String(r[PQ.SRC]),
           raw: clean_(r[PQ.RAW]), first: clean_(r[PQ.FIRST]), last: clean_(r[PQ.LAST]),
           phone: normPhone_(r[PQ.PHONE]), note: String(r[PQ.NOTE] || ''), full: '' };
}
