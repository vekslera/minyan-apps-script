// ======================================================================================
//  DUPLICATES & MERGING
//  Find people entered twice and merge them.
// ======================================================================================

function menuFindDuplicates() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const rows = findDuplicates_(loadCtx_(ss)).map(d => [d.a.id, d.a.name, d.b.id, d.b.name, d.score + '%', false, '']);
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

/** Pairs of people who look like the same person (never two different phone numbers). Shared with the web tools. */
function findDuplicates_(ctx) {
  const ps = ctx.people, out = [];
  const pub = p => ({ id: p.id, name: displayName_(p), phone: fmtPhone_(p.phone), days: 0 });
  const days = {};
  ctx.attRows.forEach(r => { const id = String(r[1]).trim(); days[id] = (days[id] || 0) + 1; });
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.phone && b.phone && a.phone !== b.phone) continue;     // different phones = different people
      const sc = Math.max(nameScore_(a, nameVariants_({ first: b.first, last: b.last })),
                          nameScore_(b, nameVariants_({ first: a.first, last: a.last })));
      if (sc >= MATCH.DUP) {
        const pa = pub(a), pb = pub(b);
        pa.days = days[a.id] || 0; pb.days = days[b.id] || 0;
        out.push({ a: pa, b: pb, score: Math.round(sc * 100) });
      }
    }
  }
  return out;
}

function menuMerge() {
  SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SH.DUPS);
  const n = sh ? sh.getLastRow() - 1 : 0;
  if (n < 1) { toast_('אין מה למזג.'); return; }
  const rng = sh.getRange(2, 1, n, DUPS_HDR.length);
  const vals = rng.getValues();
  const todo = vals.map((r, i) => ({ i: i, keep: String(r[0]).trim(), drop: String(r[2]).trim() }))
    .filter(x => vals[x.i][5] === true && !String(vals[x.i][6]).startsWith('מוזג'));
  const res = mergePeople_(loadCtx_(ss), todo);
  todo.forEach((x, k) => { vals[x.i][6] = res.results[k]; });
  rng.setValues(vals);
  toast_(res.merged ? 'מוזגו ' + res.merged + ' זוגות.' : 'לא סומנו שורות.');
}

/**
 * Merges each pair {keep, drop} (person IDs): names, phone and aliases go to "keep", attendance moves over
 * (a day both were recorded counts once), "drop" disappears. Returns a status line per pair.
 */
function mergePeople_(ctx, pairs) {
  const into = {};
  const resolve = id => { while (into[id]) id = into[id]; return id; };
  let merged = 0;
  const results = (pairs || []).map(x => {
    const keep = ctx.byId[resolve(String(x.keep))], drop = ctx.byId[resolve(String(x.drop))];
    if (!keep || !drop || keep === drop) return 'שגיאה: בדקו את המזהים';
    if (keep.phone && drop.phone && keep.phone !== drop.phone) return 'שגיאה: טלפונים שונים';
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
    merged++;
    return 'מוזג: ' + drop.id + ' ← ' + keep.id;
  });
  if (!merged) return { merged: 0, results: results };

  const seen = new Set(), att = [];
  ctx.attRows.forEach(r => {
    const id = resolve(String(r[1]).trim());
    const key = toKey_(r[0], ctx.tz) + '|' + id;
    if (seen.has(key)) return;
    seen.add(key);
    const p = ctx.byId[id];
    att.push([r[0], id, p ? displayName_(p) : r[2], r[3], r[4], r[5]]);
  });
  const as = sheet_(ctx.ss, SH.ATT);
  if (as.getLastRow() > 1) as.getRange(2, 1, as.getLastRow() - 1, ATT_HDR.length).clearContent();
  if (att.length) as.getRange(2, 1, att.length, ATT_HDR.length).setValues(att);
  ctx.attRows = att;
  ctx.peopleDirty = true;
  flushCtx_(ctx);
  return { merged: merged, results: results };
}
