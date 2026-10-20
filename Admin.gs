// ======================================================================================
//  ADMIN DIALOGS
//  WhatsApp import and review screens inside the Sheet. Every call checks the admin token.
// ======================================================================================

function menuImport() { openAdmin_('import'); }
function menuReview() { openAdmin_('review'); }

function openAdmin_(view) {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createHtmlOutput(page_('AdminPage').replace('__TOKEN__', () => adminToken_()).replace('__VIEW__', () => view))
    .setWidth(980).setHeight(680);
  ui.showModalDialog(html, view === 'import' ? 'ייבוא רשימה מוואטסאפ' : 'רישומים לבדיקה');
}

/** Step 1 of the import: parse pasted text into (date, name) rows. Nothing is saved yet. */
function adminParseImport(token, text, defaultDate) {
  checkAdmin_(token);
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const today = todayKey_(tz);
  const def = toKey_(defaultDate, tz);
  const rows = parseWhatsAppLines_(String(text || '').split(/\r?\n/), today);
  rows.forEach(r => { if (!r.date) r.date = def; });

  const ctx = loadCtx_(ss);
  const counts = {};
  ctx.attRows.forEach(r => { const k = toKey_(r[0], tz); counts[k] = (counts[k] || 0) + 1; });
  const dateInfo = {};
  rows.forEach(r => {
    if (r.date && !dateInfo[r.date]) dateInfo[r.date] = { recorded: counts[r.date] || 0, noMinyan: ctx.excluded.has(r.date) };
  });
  return { rows: rows, today: today, dateInfo: dateInfo };
}

/** Step 2 of the import: put the checked rows into the review queue. */
function adminQueueImport(token, rows) {
  checkAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = loadCtx_(SpreadsheetApp.getActive());
    const today = todayKey_(ctx.tz);
    const seen = new Set();
    let added = 0, rejected = 0;
    (rows || []).forEach(r => {
      const date = toKey_(r.date, ctx.tz), raw = clean_(r.name);
      if (!raw) return;
      if (!date || dow_(date) === 6 || date > today) { rejected++; return; }
      const k = date + '|' + norm_(raw);
      if (seen.has(k)) return;
      seen.add(k);
      const sp = splitFull_(raw);
      queuePending_(ctx, { date: date, source: SRC.WA, raw: raw, first: sp.first, last: sp.last, phone: '',
                           loggedAt: new Date() }, '');
      added++;
    });
    flushCtx_(ctx);
    return { added: added, rejected: rejected };
  } finally {
    lock.releaseLock();
  }
}

/** Everything waiting for a decision, grouped by "same name + same phone", with suggestions. */
function adminGetPending(token) {
  checkAdmin_(token);
  const ss = SpreadsheetApp.getActive();
  const ctx = loadCtx_(ss);
  const groups = new Map();
  readPending_(ss).forEach(r => {
    if (String(r[PQ.STATUS]) !== ST.WAIT) return;
    const e = pendingEntry_(r, ctx.tz);
    const key = norm_(e.raw) + '|' + e.phone;
    let g = groups.get(key);
    if (!g) {
      g = { gid: key, raw: e.raw, first: e.first, last: e.last, phone: e.phone, isWA: e.source === SRC.WA,
            ids: [], dates: [], sources: [], notes: [] };
      groups.set(key, g);
    }
    g.ids.push(e.id);
    if (e.date && g.dates.indexOf(e.date) < 0) g.dates.push(e.date);
    if (g.sources.indexOf(e.source) < 0) g.sources.push(e.source);
    if (e.note && g.notes.indexOf(e.note) < 0) g.notes.push(e.note);
  });

  const order = { review: 0, 'new': 1, auto: 2, later: 3 };
  const list = Array.from(groups.values());
  list.forEach(g => {
    g.e = g.isWA ? { full: g.raw, first: '', last: '', phone: g.phone }
                 : { full: '', first: g.first, last: g.last, phone: g.phone };
    g.m = matchPerson_(ctx.people, g.e);
  });
  // Two new names in the same batch that look alike (e.g. "רבינוביץ" and "אברהם רבינוביץ") are probably
  // one person: handle the fuller one first; the other is suggested automatically after saving.
  const fresh = list.filter(g => g.m.decision === 'new' && !g.phone)
    .sort((a, b) => norm_(b.raw).split(' ').length - norm_(a.raw).split(' ').length || b.ids.length - a.ids.length);
  fresh.forEach((g, i) => {
    for (let j = 0; j < i; j++) {
      const h = fresh[j];
      if (h.m.decision !== 'new') continue;
      const sp = splitFull_(h.raw);
      const mm = matchPerson_([{ id: '_', first: sp.first, last: sp.last, phone: '', aliases: [] }], g.e);
      if (mm.best && mm.decision !== 'new') {
        g.m = { decision: 'later', best: null, cands: g.m.cands,
                note: 'דומה ל"' + h.raw + '", שגם הוא שם חדש. שמרו קודם את "' + h.raw + '" — אחר כך יוצע כאן אוטומטית.' };
        break;
      }
    }
  });
  const out = list.map(g => {
    const m = g.m;
    const cands = (m.cands || []).slice(0, 4);
    if (m.best && !cands.some(c => c.person === m.best.person)) cands.unshift(m.best);
    g.dates.sort();
    return {
      gid: g.gid, raw: g.raw, first: g.first, last: g.last, phone: g.phone, phoneFmt: fmtPhone_(g.phone),
      ids: g.ids, dates: g.dates, sources: g.sources,
      note: [m.note].concat(g.notes).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · '),
      decision: m.decision, bestId: m.best ? m.best.person.id : '',
      cands: cands.map(c => ({ id: c.person.id, name: displayName_(c.person), phone: fmtPhone_(c.person.phone),
                               score: Math.round(c.score * 100) })),
    };
  }).sort((a, b) => (order[a.decision] - order[b.decision]) || a.raw.localeCompare(b.raw, 'he'));

  const people = ctx.people.map(p => ({ id: p.id, name: displayName_(p), phone: fmtPhone_(p.phone) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  return { groups: out, people: people, today: todayKey_(ctx.tz) };
}

/**
 * Apply decisions from the review screen.
 * d = {gid, ids:[...], action:'person'|'new'|'ignore', personId, first, last, phone}
 * The phone number is the final identifier: a phone that belongs to someone else is never re-assigned.
 */
function adminResolve(token, decisions) {
  checkAdmin_(token);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActive();
    const ctx = loadCtx_(ss);
    const psh = ss.getSheetByName(SH.PENDING);
    const n = psh.getLastRow() - 1;
    const vals = n > 0 ? psh.getRange(2, 1, n, PEND_HDR.length).getValues() : [];
    const idx = {};
    vals.forEach((r, i) => { idx[String(r[PQ.ID])] = i; });
    let saved = 0, ignored = 0, days = 0;
    const errors = [];

    (decisions || []).forEach(d => {
      const rows = (d.ids || []).map(id => idx[id])
        .filter(i => i !== undefined && String(vals[i][PQ.STATUS]) === ST.WAIT);
      if (!rows.length) return;
      const err = msg => errors.push({ gid: d.gid, msg: msg });
      if (d.action === 'ignore') { rows.forEach(i => { vals[i][PQ.STATUS] = ST.IGNORED; }); ignored++; return; }

      const phone = normPhone_(d.phone);
      if (phone && !validPhone_(phone)) return err('מספר הטלפון אינו תקין');
      const owner = phone ? ctx.people.find(p => p.phone === phone) : null;
      let p;
      if (d.action === 'person') {
        p = ctx.byId[d.personId];
        if (!p) return err('האדם שנבחר לא נמצא');
        if (owner && owner !== p) return err('הטלפון ' + fmtPhone_(phone) + ' רשום על שם ' + displayName_(owner) + ' — בחרו בו');
        if (phone && p.phone !== phone) {
          if (p.phone) p.notes = (p.notes ? p.notes + '; ' : '') + 'טלפון קודם: ' + p.phone;
          p.phone = phone;
          ctx.peopleDirty = true;
        }
      } else if (d.action === 'new') {
        if (owner) return err('הטלפון ' + fmtPhone_(phone) + ' כבר רשום על שם ' + displayName_(owner) + ' — בחרו בו');
        const last = clean_(d.last), first = clean_(d.first);
        if (!last) return err('חסר שם משפחה');
        p = createPerson_(ctx, { first: first, last: last, phone: phone });
      } else return;

      rows.forEach(i => {
        const e = pendingEntry_(vals[i], ctx.tz);
        learnAlias_(ctx, p, e.raw);
        if (e.date && record_(ctx, p, e)) days++;
        vals[i][PQ.STATUS] = ST.DONE + ' ← ' + p.id;
      });
      saved++;
    });

    if (vals.length) psh.getRange(2, 1, vals.length, PEND_HDR.length).setValues(vals);
    flushCtx_(ctx);
    return { saved: saved, ignored: ignored, days: days, errors: errors };
  } finally {
    lock.releaseLock();
  }
}

function menuKioskLink() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss, ss.getSpreadsheetTimeZone());
  let url = s.url;
  if (!url) { try { url = ScriptApp.getService().getUrl() || ''; } catch (e) { url = ''; } }
  if (!/^https:\/\/script\.google\.com\/.+\/exec/.test(url)) {
    ui.alert('דף הרישום עדיין לא פורסם',
      'בעורך הסקריפט: פריסה (Deploy) ← פריסה חדשה ← אפליקציית אינטרנט (Web app), הפעלה בתור "אני", גישה "כל אחד".\n' +
      'אחר כך הדביקו את הכתובת (שמסתיימת ב-exec/) בגיליון "הגדרות", בשורה "' + SET.URL + '".',
      ui.ButtonSet.OK);
    return;
  }
  const link = url.split('?')[0] + '?k=' + kioskKey_();
  const html = HtmlService.createHtmlOutput(page_('LinkDialog').replace(/__LINK__/g, () => escHtml_(link)).replace('__PIN__', () => escHtml_(s.pin)))
    .setWidth(560).setHeight(470);
  ui.showModalDialog(html, 'קישור לדף הרישום');
}
