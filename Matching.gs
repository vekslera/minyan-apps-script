// ======================================================================================
//  NAME MATCHING
//  Phone number first; then fuzzy Hebrew name matching and suggestions.
// ======================================================================================

/** Returns {decision:'auto'|'review'|'new', best:{person,score}|null, cands:[...], note} */
function matchPerson_(people, e) {
  const variants = nameVariants_(e);
  const hasName = variants.length > 0;
  const cands = hasName ? people.map(p => ({ person: p, score: nameScore_(p, variants) }))
    .filter(c => c.score >= 0.3).sort((a, b) => b.score - a.score) : [];
  const typedLast = e.full ? splitFull_(clean_(e.full)).last : e.last;

  // 1) The phone number decides — unless the typed surname is clearly someone else's.
  if (e.phone) {
    const owner = people.find(p => p.phone === e.phone);
    if (owner) {
      const ns = hasName ? nameScore_(owner, variants) : 1;
      if (ns >= MATCH.PHONE_NAME) return { decision: 'auto', best: { person: owner, score: 1 }, cands: cands };
      return { decision: 'review', best: { person: owner, score: ns }, cands: cands,
               note: 'הטלפון רשום על שם ' + displayName_(owner) + ', אבל נכתב שם אחר' };
    }
  }

  // 2) Names.
  const best = cands[0], second = cands[1];
  if (!best || best.score < MATCH.SUGGEST) {
    if (typedLast) return { decision: 'new', best: null, cands: cands };
    return { decision: 'review', best: null, cands: cands, note: hasName ? 'נכתב רק שם פרטי — נא לבחור אדם או להשלים שם משפחה' : 'טלפון לא מוכר, בלי שם' };
  }
  // Same surname but a clearly different first name: a different person (a brother, a son).
  const tf = norm_(e.full ? splitFull_(clean_(e.full)).first : e.first), bf = norm_(best.person.first);
  const otherFirst = tf && bf && firstSim_(tf, bf) < 0.6 && sim_(tf, norm_(best.person.last)) < 0.6;
  if (best.score < MATCH.AUTO && otherFirst && typedLast) return { decision: 'new', best: null, cands: cands };
  if (e.phone) {
    if (best.person.phone) {
      return { decision: 'review', best: best, cands: cands,
               note: 'השם דומה ל' + displayName_(best.person) + ', אבל הטלפון שונה' };
    }
  }
  const clear = !second || best.score - second.score >= MATCH.GAP;
  if (!typedLast && !e.phone) {
    return { decision: 'review', best: best, cands: cands, note: 'נכתב רק שם פרטי — נא לאשר' };
  }
  if (best.score >= MATCH.AUTO && clear) return { decision: 'auto', best: best, cands: cands };
  return { decision: 'review', best: best, cands: cands, note: clear ? 'איות דומה — נא לאשר' : 'יש יותר מאפשרות אחת' };
}

/** Suggestions while typing: fuzzy score, plus a boost for names that start with what was typed. */
function suggest_(people, first, last) {
  const nf = norm_(first), nl = norm_(last);
  const variants = nameVariants_({ first: first, last: last, full: '' });
  return people.map(p => {
    let s = variants.length ? nameScore_(p, variants) : 0;
    const pl = norm_(p.last), pf = norm_(p.first);
    let pre = 0;
    if (nl && pl && pl.startsWith(nl)) pre = 0.65 + 0.3 * nl.length / pl.length;
    if (nf) {
      if (pf && pf.startsWith(nf)) pre = nl ? (pre ? pre + 0.05 : 0) : 0.55 + 0.3 * nf.length / pf.length;
      else if (pre) pre -= 0.15;
    }
    return { person: p, score: Math.max(s, pre) };
  }).filter(c => c.score >= 0.5).sort((a, b) => b.score - a.score);
}

/** All plausible (first, last) readings of what was written, normalized. */
function nameVariants_(e) {
  const out = [];
  const add = (f, l) => { f = norm_(f); l = norm_(l); if (f || l) out.push({ first: f, last: l }); };
  const multi = s => {
    const t = norm_(s).split(' ').filter(Boolean);
    if (t.length < 2) return;
    add(t[0], t.slice(1).join(' '));
    add(t.slice(0, -1).join(' '), t[t.length - 1]);
    if (t.length >= 3) add(t.slice(0, -2).join(' '), t.slice(-2).join(' '));
  };
  const full = clean_(e.full);
  if (full) {
    if (norm_(full).split(' ').length === 1) {
      const sp = splitFull_(full);
      if (sp.last) add('', full);                             // one word: usually a surname…
      if (isFirstName_(full)) add(full, '');                  // …but "יוחאי" or "לוי" may be a first name
    } else { add('', full); multi(full); }
  } else {
    const first = clean_(e.first), last = clean_(e.last);
    add(first, last);
    if (!first && last) multi(last);
    if (first && !last) multi(first);
  }
  return out;
}

/** Every full-name string known for a person (normalized). */
function knownFulls_(p) {
  const f = norm_(p.first), l = norm_(p.last);
  const list = [(f + ' ' + l).trim(), (l + ' ' + f).trim()];
  (p.aliases || []).forEach(a => list.push(norm_(a)));
  return list.filter(Boolean);
}

function nameScore_(p, variants) {
  const pF = norm_(p.first), pL = norm_(p.last);
  const fulls = knownFulls_(p);
  const aliases = (p.aliases || []).map(norm_).filter(Boolean);
  let best = 0;
  for (const v of variants) {
    const vFull = (v.first + ' ' + v.last).trim();
    if (fulls.includes(vFull)) return 1;
    let s = 0;
    if (v.last && pL) {
      const ls = sim_(v.last, pL);
      if (v.first && pF) {
        // The surname must agree first; a shared first name alone means nothing ("מנדי בקשי" ≠ "מנדי ציקושווילי").
        s = ls >= 0.7 ? 0.6 * ls + 0.4 * firstSim_(v.first, pF) : 0.5 * ls;
        const sw = sim_(v.first, pL);                                                  // first/last swapped
        const sw2 = firstSim_(v.last, pF);
        if (sw >= 0.7 && sw2 >= 0.6) s = Math.max(s, 0.95 * (0.6 * sw + 0.4 * sw2));
      } else if (v.first && !pF) {
        s = 0.93 * ls;
      } else {
        s = 0.96 * ls;                                   // only a surname was given
      }
    } else if (v.first && !v.last && pF) {
      s = 0.8 * firstSim_(v.first, pF);                  // only a first name — weak
    }
    for (const a of aliases) s = Math.max(s, 0.97 * sim_(vFull, a));                 // learned spellings
    best = Math.max(best, s);
  }
  return best;
}

/** Similarity 0..1 on the spelling and on a vowel-letter-free "skeleton" (כהן=כוהן, אהרן=אהרון). */
function sim_(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let s = levRatio_(a, b);
  const sa = skel_(a), sb = skel_(b);
  if (sa && sb) {
    const L = Math.min(sa.length, sb.length);
    s = Math.max(s, (L >= 3 ? 0.92 : L === 2 ? 0.88 : 0.7) * levRatio_(sa, sb));
  }
  return s;
}

function norm_(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/־/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-֑ͯ-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, c => FINALS[c])
    .replace(/['"`׳״]/g, '')
    .replace(/[.\-_,()\/]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function skel_(s) {
  let t = s.replace(/\s+/g, '').replace(/[אהוי]/g, '');
  t = t.replace(/ph/g, 'f').replace(/ch|kh/g, 'h').replace(/ck|q|c/g, 'k')
       .replace(/tz|ts/g, 'z').replace(/w/g, 'v').replace(/y/g, 'i');
  if (/[a-z]/.test(t)) t = t.charAt(0) + t.slice(1).replace(/[aeiouh]/g, '');
  return t.replace(/(.)\1+/g, '$1');
}

function levRatio_(a, b) {
  if (a === b) return 1;
  const n = a.length, m = b.length;
  if (!n || !m) return 0;
  let prev = [];
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const cur = [i];
    for (let j = 1; j <= m; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

function clean_(s) {
  return String(s == null ? '' : s).replace(INVISIBLE_RE, '').replace(EMOJI_RE, '')
    .replace(/\s+/g, ' ').trim().replace(TITLES_RE, '').trim();
}

/** "כהן" → surname only; "משה כהן" → first + surname; "שניאור זלמן כהן" → first = all but the last word. */
function splitFull_(full) {
  const t = String(full || '').split(' ').filter(Boolean);
  const PARTICLES = ['בן', 'בר', 'אבן', 'אבו', 'די', 'דה', 'אל', 'ואן', 'פון', 'בית'];
  if (t.length >= 3 && PARTICLES.indexOf(t[t.length - 2]) >= 0) {
    return { first: t.slice(0, -2).join(' '), last: t.slice(-2).join(' ') };       // "אודי בן דוד"
  }
  if (t.length < 2) {
    const w = t[0] || '';
    if (w && isFirstName_(w) && !alsoSurnames_().has(norm_(w))) return { first: w, last: '' };   // "יוחאי"
    return { first: '', last: w };
  }
  return { first: t.slice(0, -1).join(' '), last: t[t.length - 1] };
}

function normPhone_(v) {
  let s = String(v == null ? '' : v).replace(/\D/g, '');
  if (!s) return '';
  if (s.startsWith('972')) s = '0' + s.slice(3);
  if (s.length === 9 && s[0] === '5') s = '0' + s;          // a mobile number that lost its leading zero
  return s;
}
function validPhone_(p) { return /^0\d{8,9}$/.test(p); }
function fmtPhone_(p) {
  if (!p) return '';
  if (p.length === 10) return p.slice(0, 3) + '-' + p.slice(3);
  if (p.length === 9) return p.slice(0, 2) + '-' + p.slice(2);
  return p;
}

function displayName_(p) { return ((p.first || '') + ' ' + (p.last || '')).trim() || fmtPhone_(p.phone) || p.id; }
