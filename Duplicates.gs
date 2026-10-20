// ======================================================================================
//  DUPLICATES & MERGING
//  Find people entered twice and merge them.
// ======================================================================================

function menuFindDuplicates() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const ctx = loadCtx_(ss);
  const ps = ctx.people, rows = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.phone && b.phone && a.phone !== b.phone) continue;     // different phones = different people
      const sc = Math.max(nameScore_(a, nameVariants_({ first: b.first, last: b.last })),
                          nameScore_(b, nameVariants_({ first: a.first, last: a.last })));
      if (sc >= MATCH.DUP) rows.push([a.id, displayName_(a), b.id, displayName_(b), Math.round(sc * 100) + '%', false, '']);
    }
  }
  const sh = ensureSheet_(ss, SH.DUPS, DUPS_HDR);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, DUPS_HDR.length).clear();
  if (rows.length) {
    sh.getRange(2, 1, rows.length, DUPS_HDR.length).setValues(rows);
    sh.getRange(2, 6, rows.length, 1).insertCheckboxes();
  }
  sh.activate();
  toast_(rows.length ? 'נמצאו ' + rows.length + ' כפילויות אפשריות. סמנו "למזג?" ליד הנכונות, ואז: מניין ← מיזוג הכפילויות המסומנות.'
                     : 'לא נמצאו כפילויות.');
}

function menuMerge() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SH.DUPS);
  const n = sh ? sh.getLastRow() - 1 : 0;
  if (n < 1) { toast_('אין מה למזג.'); return; }
  const rng = sh.getRange(2, 1, n, DUPS_HDR.length);
  const vals = rng.getValues();
  const ctx = loadCtx_(ss);
  const into = {};
  const resolve = id => { while (into[id]) id = into[id]; return id; };
  let merged = 0;

  vals.forEach(r => {
    if (r[5] !== true || String(r[6]).startsWith('מוזג')) return;
    const keep = ctx.byId[resolve(String(r[0]).trim())], drop = ctx.byId[resolve(String(r[2]).trim())];
    if (!keep || !drop || keep === drop) { r[6] = 'שגיאה: בדקו את המזהים'; return; }
    if (keep.phone && drop.phone && keep.phone !== drop.phone) { r[6] = 'שגיאה: טלפונים שונים'; return; }
    keep.first = keep.first || drop.first;
    keep.last = keep.last || drop.last;
    keep.phone = keep.phone || drop.phone;
    const kn = knownFulls_(keep);
    [displayName_(drop)].concat(drop.aliases).forEach(a => {
      if (a && !kn.includes(norm_(a))) { keep.aliases.push(a); kn.push(norm_(a)); }
    });
    into[drop.id] = keep.id;
    ctx.people = ctx.people.filter(p => p !== drop);
    delete ctx.byId[drop.id];
    r[6] = 'מוזג: ' + drop.id + ' ← ' + keep.id;
    merged++;
  });
  if (!merged) { rng.setValues(vals); toast_('לא סומנו שורות.'); return; }

  const seen = new Set(), att = [];
  ctx.attRows.forEach(r => {
    const id = resolve(String(r[1]).trim());
    const key = toKey_(r[0], ctx.tz) + '|' + id;
    if (seen.has(key)) return;
    seen.add(key);
    const p = ctx.byId[id];
    att.push([r[0], id, p ? displayName_(p) : r[2], r[3], r[4], r[5]]);
  });
  const as = ss.getSheetByName(SH.ATT);
  if (as.getLastRow() > 1) as.getRange(2, 1, as.getLastRow() - 1, ATT_HDR.length).clearContent();
  if (att.length) as.getRange(2, 1, att.length, ATT_HDR.length).setValues(att);
  ctx.attRows = att;
  ctx.peopleDirty = true;
  flushCtx_(ctx);
  rng.setValues(vals);
  toast_('מוזגו ' + merged + ' זוגות.');
}
