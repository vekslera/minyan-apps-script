// ======================================================================================
//  REGISTRATION PAGE (web app)
//  Runs as the owner. Every call checks the page key from the link.
// ======================================================================================

function doGet(e) {
  const key = kioskKey_();
  const ok = e && e.parameter && e.parameter.k === key;
  // "&device=kiosk" on the link marks the shul's own tablet, whatever the browser reports (see README).
  const forced = ok && DEVICES.indexOf(String(e.parameter.device || '')) >= 0 ? e.parameter.device : '';
  // "&view=gabbai" opens the gabbai tools page (Gabbai.gs); it asks for the gabbai code itself.
  const tools = ok && e.parameter.view === 'gabbai';
  let link = '';
  if (ok) { const ss = SpreadsheetApp.getActive(); link = kioskLink_(readSettings_(ss, ss.getSpreadsheetTimeZone())); }
  const html = !ok ? page_('BadLinkPage')
    : tools ? page_('GabbaiPage').replace('__KEY__', () => key).replace(/__HOME__/g, () => link)
    : page_('KioskPage').replace('__KEY__', () => key).replace('__DEVICE__', () => forced)
                        .replace('__TOOLS__', () => link ? link + '&view=gabbai' : '');
  return HtmlService.createHtmlOutput(html)
    .setTitle(tools ? 'כלי גבאי — מניין' : 'רישום נוכחות במניין')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function kioskInit(key, session) {
  checkKey_(key);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const s = readSettings_(ss, tz);
  const today = todayKey_(tz);
  // The names (never the phone numbers) go to the page, which then suggests names without calling the server.
  const roster = peopleForReading_(ss).map(p => ({ id: p.id, first: p.first, last: p.last, aliases: p.aliases,
                                                    hint: p.phone ? p.phone.slice(-3) : '' }));
  return { name: s.name, today: today, dow: dow_(today), open: isOpenHour_(s, tz),
           from: s.from, to: s.to, noMinyan: s.excluded.has(today), roster: roster, locationCheck: !!shulArea_(),
           session: session ? sessionValid_(key, session) : false };
}


/** Live lookup while typing: who owns this phone, and which names look like what was typed. */
function kioskLookup(key, q) {
  checkKey_(key);
  q = q || {};
  const people = peopleForReading_(SpreadsheetApp.getActive());
  const phone = normPhone_(q.phone);
  const owner = validPhone_(phone) ? people.find(p => p.phone === phone) : null;
  const first = clean_(q.first), last = clean_(q.last);
  let cands = [];
  if (!owner && (norm_(last).length >= 2 || norm_(first).length >= 2)) {       // pages from before the roster
    cands = suggest_(people, first, last).slice(0, 6).map(c => pub_(c.person));
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

    const gabbai = !!d.session;
    if (gabbai) checkSession_(key, d.session);                // throws SESSION_EXPIRED
    let date = today;
    if (gabbai && d.date) {
      date = toKey_(d.date, ctx.tz);
      if (!date) return fail('התאריך אינו תקין');
      if (date > today) return fail('אי אפשר לרשום לתאריך עתידי');
    }
    if (dow_(date) === 6) return fail('אין רישום בשבת');
    if (ctx.excluded.has(date)) return fail('תאריך זה מסומן כיום ללא מניין');
    if (!gabbai && !isOpenHour_(s, ctx.tz)) return fail('הרישום פתוח בין השעות ' + fmtHour_(s.from) + ' ל-' + fmtHour_(s.to));

    // Self-registration only from a phone or a tablet; a computer is for gabbai mode.
    const device = String(d.device || '');
    if (!gabbai && (device === 'desktop' || !device)) return fail('רישום עצמי אפשרי רק מטלפון נייד או מטאבלט. במחשב — במצב גבאי.');

    // Location: outside the shul (or no position) → tell the person; they may retry or send it for approval.
    let locNote = '';
    if (locationRequired_(device, gabbai)) {
      const chk = checkLocation_(d.loc);
      logLocationCheck_({ device: device, inside: chk.inside, distance: chk.distance, accuracy: chk.accuracy, reason: chk.reason });
      if (!chk.inside) {
        if (!d.outsideOk) {
          return { ok: false, where: chk.reason ? 'none' : 'outside', message: chk.reason ? LOCATION_REASONS[chk.reason] : '',
                   distance: chk.reason ? null : roundDistance_(chk.distance) };
        }
        locNote = locationNote_(chk);
      }
    }

    const e = { date: date, source: gabbai ? SRC.GABBAI : sourceLabel_(d.device), loggedAt: new Date(),
                first: clean_(d.first), last: clean_(d.last), phone: normPhone_(d.phone), full: '',
                personId: String(d.personId || '').trim() };
    if (e.phone && !validPhone_(e.phone)) return fail('מספר הטלפון אינו תקין');
    const owner = e.phone ? ctx.people.find(p => p.phone === e.phone) : null;
    if (!e.personId && !owner && !e.last) return fail('נא למלא שם משפחה');

    if (locNote) {                                          // sent for the gabbai's approval
      const chosen = e.personId && ctx.byId[e.personId];
      if (chosen && !e.first && !e.last) { e.first = chosen.first; e.last = chosen.last; }
      if (!e.first && !e.last && owner) { e.first = owner.first; e.last = owner.last; }
      queuePending_(ctx, e, locNote);
      flushCtx_(ctx);
      return { ok: true, status: 'pending', date: date, person: null,
               name: [e.first, e.last].filter(Boolean).join(' '), stats: null };
    }

    const res = submitEntry_(ctx, e);
    flushCtx_(ctx);
    return { ok: true, status: res.status, date: date,
             person: res.person ? Object.assign(pub_(res.person), { aliases: res.person.aliases }) : null,
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

/** "דף רישום · נייד" — where a self-registration came from, as the page detected it. */
function sourceLabel_(device) {
  const label = DEVICE_LABELS[String(device || '')];
  return label ? SRC.KIOSK + ' · ' + label : SRC.KIOSK;
}

function pub_(p) {
  return { id: p.id, name: displayName_(p), first: p.first, last: p.last,
           hint: p.phone ? p.phone.slice(-3) : '' };
}
