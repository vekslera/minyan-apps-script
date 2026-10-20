// ======================================================================================
//  REGISTRATION PAGE (web app)
//  Runs as the owner. Every call checks the page key from the link.
// ======================================================================================

function doGet(e) {
  const key = kioskKey_();
  const ok = e && e.parameter && e.parameter.k === key;
  return HtmlService.createHtmlOutput(ok ? page_('KioskPage').replace('__KEY__', () => key) : page_('BadLinkPage'))
    .setTitle('רישום נוכחות במניין')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function kioskInit(key) {
  checkKey_(key);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const s = readSettings_(ss, tz);
  const today = todayKey_(tz);
  return { name: s.name, today: today, dow: dow_(today), open: isOpenHour_(s, tz),
           from: s.from, to: s.to, noMinyan: s.excluded.has(today) };
}

function kioskCheckPin(key, pin) {
  checkKey_(key);
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss, ss.getSpreadsheetTimeZone());
  return !!s.pin && String(pin).trim() === s.pin;
}

/** Live lookup while typing: who owns this phone, and which names look like what was typed. */
function kioskLookup(key, q) {
  checkKey_(key);
  q = q || {};
  const ctx = loadCtx_(SpreadsheetApp.getActive());
  const phone = normPhone_(q.phone);
  const owner = validPhone_(phone) ? ctx.people.find(p => p.phone === phone) : null;
  const first = clean_(q.first), last = clean_(q.last);
  let cands = [];
  if (!owner && (norm_(last).length >= 2 || norm_(first).length >= 2)) {
    cands = suggest_(ctx.people, first, last).slice(0, 6).map(c => pub_(c.person));
  }
  return { byPhone: owner ? pub_(owner) : null, phoneKnown: !!owner, cands: cands };
}

function kioskSubmit(key, d) {
  checkKey_(key);
  d = d || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const ctx = loadCtx_(ss);
    const s = ctx.settings;
    const today = todayKey_(ctx.tz);
    const fail = msg => ({ ok: false, message: msg });

    const gabbai = !!d.pin;
    if (gabbai && String(d.pin).trim() !== s.pin) return fail('קוד הגבאי שגוי');
    let date = today;
    if (gabbai && d.date) {
      date = toKey_(d.date, ctx.tz);
      if (!date) return fail('התאריך אינו תקין');
      if (date > today) return fail('אי אפשר לרשום לתאריך עתידי');
    }
    if (dow_(date) === 6) return fail('אין רישום בשבת');
    if (ctx.excluded.has(date)) return fail('תאריך זה מסומן כיום ללא מניין');
    if (!gabbai && !isOpenHour_(s, ctx.tz)) return fail('הרישום פתוח בין השעות ' + s.from + ':00 ל-' + s.to + ':00');

    const e = { date: date, source: gabbai ? SRC.GABBAI : SRC.KIOSK, loggedAt: new Date(),
                first: clean_(d.first), last: clean_(d.last), phone: normPhone_(d.phone), full: '',
                personId: String(d.personId || '').trim() };
    if (e.phone && !validPhone_(e.phone)) return fail('מספר הטלפון אינו תקין');
    const owner = e.phone ? ctx.people.find(p => p.phone === e.phone) : null;
    if (!e.personId && !owner && !e.last) return fail('נא למלא שם משפחה');

    const res = submitEntry_(ctx, e);
    flushCtx_(ctx);
    return { ok: true, status: res.status, date: date,
             name: res.person ? displayName_(res.person) : [e.first, e.last].filter(Boolean).join(' '),
             stats: res.person ? personStats_(ctx, res.person.id) : null };
  } finally {
    lock.releaseLock();
  }
}

/** Decide who an entry belongs to; record it, create a person, or queue it for review. */
function submitEntry_(ctx, e) {
  let p = null, note = '';
  const owner = e.phone ? ctx.people.find(x => x.phone === e.phone) : null;
  if (e.personId) {
    p = ctx.byId[e.personId] || null;
    if (!p) note = 'נבחר אדם שאינו קיים';
    else if (owner && owner !== p) {
      note = 'נבחר ' + displayName_(p) + ', אבל הטלפון רשום על שם ' + displayName_(owner); p = null;
    } else if (e.phone && p.phone && p.phone !== e.phone) {
      note = 'נבחר ' + displayName_(p) + ', אבל הטלפון שונה מהרשום (' + fmtPhone_(p.phone) + ')'; p = null;
    }
  } else {
    const m = matchPerson_(ctx.people, e);
    if (m.decision === 'auto') p = m.best.person;
    else if (m.decision === 'new') {
      p = createPerson_(ctx, e);
      record_(ctx, p, e);
      return { status: 'created', person: p };
    } else note = m.note || '';
  }
  if (!p) {
    const chosen = e.personId && ctx.byId[e.personId];
    if (chosen && !e.first && !e.last) { e.first = chosen.first; e.last = chosen.last; }
    queuePending_(ctx, e, note);
    return { status: 'pending', person: null };
  }
  learn_(ctx, p, e);
  return { status: record_(ctx, p, e) ? 'recorded' : 'already', person: p };
}

function personStats_(ctx, id) {
  const s = ctx.settings;
  if (!s.start || !s.end) return null;
  if (todayKey_(ctx.tz) < s.start) return null;
  const st = computeStats_(ctx, s.start, s.end);
  if (!st.days.length) return null;
  const r = st.rows.find(x => x.person.id === id);
  const count = r ? r.count : 0;
  return { count: count, days: st.days.length, pct: Math.round(100 * count / st.days.length),
           eligible: count * 100 >= s.threshold * st.days.length, threshold: s.threshold };
}

function pub_(p) {
  return { id: p.id, name: displayName_(p), first: p.first, last: p.last,
           hint: p.phone ? p.phone.slice(-3) : '' };
}
