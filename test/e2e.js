const assert = require('assert');
const { makeEnv } = require('./mock');
const env = makeEnv();
const G = env.ctx;
const noDates = (v, p = 'ret') => {
  if (v instanceof Date || (v && v.constructor && v.constructor.name === 'FakeDate')) throw new Error('Date returned at ' + p);
  if (v && typeof v === 'object') for (const k of Object.keys(v)) noDates(v[k], p + '.' + k);
  return v;
};
const web = (fn, ...a) => { G.__webContext = true; try { return noDates(G[fn](...a)); } finally { G.__webContext = false; } };
const dlg = (fn, ...a) => noDates(G[fn](...a));
const sheet = n => env.ss.getSheetByName(n);
const rows = n => { const s = sheet(n); return s.getLastRow() > 1 ? s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).getValues() : []; };

G.setup();
console.log('sheets:', env.ss.getSheets().map(s => s.name).join(', '));
const key = env.props.KIOSK_KEY, tok = env.props.ADMIN_TOKEN;
// Settings: open all day for the test, period started 10 days ago.
const st = sheet('הגדרות');
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const today = G.todayKey_('Asia/Jerusalem');
env.userEdit('הגדרות', 'B3', G.keyToDate_(G.addDays_(today, -9), 'Asia/Jerusalem'));
const pin = String(st.getRange('B8').getValue());

// doGet
assert(G.doGet({ parameter: { k: key } }).html.includes("var KEY = '" + key + "'"));
assert(G.doGet({ parameter: { k: 'x' } }).html.includes('הקישור אינו תקין'));
assert.throws(() => web('kioskInit', 'bad'));
console.log('init:', JSON.stringify(web('kioskInit', key)));

// Admin functions are refused from the web app without the token; menu functions are refused there entirely.
assert.throws(() => web('adminGetPending', 'nope'));
assert.throws(() => web('menuDraw'));

const sub = d => web('kioskSubmit', key, d);
let r;
r = sub({ phone: '052-111-1111', first: 'משה', last: 'כהן' }); console.log('1 new w/ phone:', r.status, r.name, JSON.stringify(r.stats)); assert.equal(r.status, 'created');
r = sub({ phone: '0521111111' }); console.log('2 phone only again:', r.status); assert.equal(r.status, 'already');
r = sub({ last: 'לוי', first: 'דוד' }); assert.equal(r.status, 'created');
r = sub({ last: 'פרידמן', first: 'יוסף', phone: '0533333333' }); assert.equal(r.status, 'created');
r = sub({ last: 'כהן', first: 'יצחק', phone: '0544444444' }); console.log('Yitzchak Cohen:', r.status, r.name);
r = sub({ last: '' }); assert.equal(r.ok, false); console.log('no name:', r.message);
r = sub({ phone: '123' }); assert.equal(r.ok, false); console.log('bad phone:', r.message);

// lookups
console.log('lookup phone:', JSON.stringify(web('kioskLookup', key, { phone: '0521111111' })));
console.log('lookup "כה":', JSON.stringify(web('kioskLookup', key, { last: 'כה' }).cands.map(c => c.name + c.hint)));
console.log('lookup "פרידמ":', JSON.stringify(web('kioskLookup', key, { last: 'פרידמ' }).cands.map(c => c.name)));
console.log('lookup "לויי":', JSON.stringify(web('kioskLookup', key, { last: 'לויי' }).cands.map(c => c.name)));

// gabbai, past dates
assert.equal(web('kioskCheckPin', key, pin), true);
assert.equal(web('kioskCheckPin', key, '0000'), false);
const past = [1,2,3,4].map(n => G.addDays_(today, -n)).filter(d => G.dow_(d) !== 6).slice(0, 3);
const d1 = past[0], d2 = past[1];
past.forEach(d => { r = sub({ phone: '0521111111', pin, date: d }); assert.equal(r.status, 'recorded', JSON.stringify(r)); });
r = sub({ personId: 'P002', pin, date: past[0] }); assert.equal(r.status, 'recorded');
r = sub({ phone: '0521111111', pin: '9999', date: d1 }); assert.equal(r.ok, false);
// a Shabbat date
let sat = today; while (G.dow_(sat) !== 6) sat = G.addDays_(sat, -1);
r = sub({ phone: '0521111111', pin, date: sat }); assert.equal(r.ok, false); console.log('shabbat:', r.message);
r = sub({ phone: '0521111111', pin, date: G.addDays_(today, 1) }); assert.equal(r.ok, false);
// ambiguous: surname only, two Cohens → pending
r = sub({ last: 'כהן' }); console.log('ambiguous כהן:', r.status); assert.equal(r.status, 'pending');
// typo with known first name → auto
r = sub({ last: 'פרידמאן', first: 'יוסף', pin, date: d1 }); console.log('typo פרידמאן:', r.status, r.name);
// phone of Moshe but other first name and other surname → pending
r = sub({ phone: '0521111111', last: 'גולד', first: 'אברהם', pin, date: d2 }); console.log('phone conflict:', r.status);
// chosen person with a different phone already on file → pending
r = sub({ personId: 'P003', phone: '0509999999', pin, date: d2 }); console.log('chip+other phone:', r.status);

// ---------- WhatsApp import ----------
const wa = [
  '[' + d1.split('-').reverse().join('/') + ', 07:45:12] Shmuel: מניין שחרית יום ב\' ' + d1.slice(8,10)+'/'+d1.slice(5,7),
  '1. כהן משה', '2. לוי', '3) הרב פרידמן 🙏', '- גולדשטיין, שניאורסון', 'תודה לכולם!',
  d2.slice(8,10)+'.'+d2.slice(5,7) + ': לוי, רבינוביץ',
  'גולדשטין',
  'אברהם רבינוביץ',
].join('\n');
const parsed = dlg('adminParseImport', tok, wa, '');
console.log('parsed:', parsed.rows.map(x => x.date.slice(5) + ' ' + x.name).join(' | '));
console.log('dateInfo:', JSON.stringify(parsed.dateInfo));
const q = dlg('adminQueueImport', tok, parsed.rows.concat([{ date: sat, name: 'שבתון' }]));
console.log('queued:', JSON.stringify(q)); assert.equal(q.rejected, 1);

let pend = dlg('adminGetPending', tok);
for (const g of pend.groups) console.log(' •', g.raw, '|', g.decision, '| best', g.bestId, '|', g.cands.map(c => c.id + ':' + c.score).join(' '), '|', g.ids.length, 'rows |', g.note);

// Resolve: confirm auto groups, new for unknowns (with phone), choose person for ambiguous כהן.
const decs = pend.groups.map(g => {
  if (g.raw === 'כהן') return { gid: g.gid, ids: g.ids, action: 'person', personId: 'P001' };
  if (g.raw === 'גולד' || g.raw === 'אברהם גולד') return { gid: g.gid, ids: g.ids, action: 'ignore' };
  if (g.decision === 'new' && g.raw === 'גולדשטיין') return { gid: g.gid, ids: g.ids, action: 'new', first: 'אהרן', last: 'גולדשטיין', phone: '0555555555' };
  if (g.decision === 'new') return { gid: g.gid, ids: g.ids, action: 'new', first: g.first, last: g.last, phone: '' };
  if (g.decision === 'later') return null;
  if (g.bestId) return { gid: g.gid, ids: g.ids, action: 'person', personId: g.bestId };
  return null;
}).filter(Boolean);
// try a conflicting phone on one decision
decs.push({ gid: 'x', ids: [pend.groups[0].ids[0]], action: 'new', first: 'א', last: 'ב', phone: '0521111111' });
const res = dlg('adminResolve', tok, decs);
console.log('resolve:', JSON.stringify(res));
pend = dlg('adminGetPending', tok);
for (const g of pend.groups) console.log(' • after save:', g.raw, '|', g.decision, '| best', g.bestId, '|', g.note);
const res2 = dlg('adminResolve', tok, pend.groups.filter(g => g.bestId && g.decision !== 'review').map(g => ({ gid: g.gid, ids: g.ids, action: 'person', personId: g.bestId })));
console.log('resolve 2:', JSON.stringify(res2));
pend = dlg('adminGetPending', tok);
console.log('still pending:', pend.groups.map(g => g.raw + ' (' + g.decision + ' → ' + g.bestId + ')').join(' | '));

console.log('\nPEOPLE:'); rows('אנשים').forEach(r => console.log('  ', r.slice(0, 5).join(' | ')));
console.log('ATT rows:', rows('נוכחות').length);
// duplicate day check
const keys = rows('נוכחות').map(r => G.toKey_(r[0], 'Asia/Jerusalem') + r[1]);
assert.equal(new Set(keys).size, keys.length, 'duplicate attendance rows');

// ---------- Reports ----------
env.ui.nextPrompt = '';
G.menuWeekly();
const wk = env.ss.getSheets().find(s => s.name.startsWith('שבוע עד'));
console.log('\nWEEKLY sheet', wk.name); wk.getRange(1, 1, Math.min(wk.getLastRow(), 12), 8).getValues().forEach(r => console.log('  ', r.map(v => v instanceof Object && v.toISOString ? 'D' : v).join(' | ')));
console.log('WA text:\n' + env.ui.lastDialog.match(/<textarea id="t">([\s\S]*?)<\/textarea>/)[1]);
G.menuFinal();
const fin = sheet('דוח סופי');
fin.getRange(1, 1, Math.min(fin.getLastRow(), 10), 7).getValues().forEach(r => console.log('  ', r.join(' | ')));

// ≥ threshold check: compute eligibility directly
const ctx = G.loadCtx_(env.ss);
const stt = G.computeStats_(ctx, G.addDays_(today, -3), today);
console.log('days', stt.days.length, stt.rows.map(r => r.person.id + ':' + r.count + (r.eligible ? '✓' : '')).join(' '));

env.ui.nextAlert = 'YES';
G.menuDraw();
console.log(env.log.filter(l => l[0] === 'alert').slice(-1)[0]);

G.menuFindDuplicates();
console.log('dups:', JSON.stringify(rows('כפילויות')));
G.menuKioskLink(); console.log(env.log.slice(-1)[0]);
env.userEdit('הגדרות', 'B9', 'https://script.google.com/macros/s/ABC/exec');
G.menuKioskLink(); assert(env.ui.lastDialog.includes('/exec?k=' + key)); console.log('link dialog ok');
console.log('\nALL OK');

// ---------- Secrets.gs overrides ----------
{
  const env2 = makeEnv({ secrets: { gabbaiPin: '4321', deploymentId: 'AKfycbTEST', kioskKey: 'fixedkey123', lotteryThreshold: '60' } });
  const G2 = env2.ctx;
  G2.setup();
  const s2 = G2.readSettings_(env2.ss, 'Asia/Jerusalem');
  assert.equal(s2.pin, '4321');
  assert.equal(s2.url, 'https://script.google.com/macros/s/AKfycbTEST/exec');
  assert.equal(G2.kioskKey_(), 'fixedkey123');
  assert.equal(s2.threshold, 60);
  // an invalid value falls back to the sheet
  const env3 = makeEnv({ secrets: { lotteryThreshold: 'abc' } }); env3.ctx.setup();
  assert.equal(env3.ctx.readSettings_(env3.ss, 'Asia/Jerusalem').threshold, 75);
  G2.menuKioskLink();
  assert(env2.ui.lastDialog.includes('/AKfycbTEST/exec?k=fixedkey123'));
  assert(G2.doGet({ parameter: { k: 'fixedkey123' } }).html.includes("var KEY = 'fixedkey123'"));
  console.log('secrets override OK');
}

// ---------- Phone numbers ----------
{
  const P = G.normPhone_, V = G.validPhone_, F = G.fmtPhone_;
  const cases = [
    ['052-111-1111', '0521111111', true], ['521111111', '0521111111', true], ['+972 52 111 1111', '0521111111', true],
    ['+972-052-1111111', '0521111111', true], ['00972521111111', '0521111111', true], ['972521111111', '0521111111', true],
    ['03-6123456', '036123456', true], ['36123456', '036123456', true], ['02 6234567', '026234567', true],
    ['+972 3 612 3456', '036123456', true], ['077-4123456', '0774123456', true], ['774123456', '0774123456', true],
    ['(212) 555-1234', '+12125551234', true], ['212.555.1234', '+12125551234', true], ['1-212-555-1234', '+12125551234', true],
    ['+1 646 555 0199', '+16465550199', true], ['001 646 555 0199', '+16465550199', true], ['12125551234', '+12125551234', true],
    ['123', '123', false], ['0501234', '0501234', false], ['+44 20 7946 0958', '+442079460958', false],
    ['(012) 555-1234', '0125551234', false], ['212-155-1234', '+12121551234', false], ['', '', false],
  ];
  for (const [inp, want, ok] of cases) {
    assert.equal(P(inp), want, 'normPhone ' + inp);
    assert.equal(V(P(inp)), ok, 'validPhone ' + inp);
  }
  assert.equal(F('+12125551234'), '+1-212-555-1234'); assert.equal(F('036123456'), '03-6123456'); assert.equal(F('0774123456'), '077-4123456');
  // end to end through the registration page
  const r1 = sub({ phone: '(646) 555-0199', first: 'Yossi', last: 'Klein' });
  assert.equal(r1.status, 'created');
  const r2 = sub({ phone: '+1 646 555 0199' }); assert.equal(r2.status, 'already'); assert.equal(r2.name, 'Yossi Klein');
  const r3 = sub({ phone: '03-6123456', first: 'שלום', last: 'ביטון' }); assert.equal(r3.status, 'created');
  assert.equal(web('kioskLookup', key, { phone: '36123456' }).byPhone.name, 'שלום ביטון');
  assert.equal(sub({ phone: '+44 20 7946 0958', last: 'Smith' }).ok, false);
  const ppl = rows('אנשים').map(r => r[3]);
  assert(ppl.includes('+16465550199') && ppl.includes('036123456'));
  // the pages receive the same functions
  assert(G.doGet({ parameter: { k: key } }).html.includes('function normPhone_('));
  console.log('phones OK');
}

// ---------- Final summary text ----------
{
  G.menuFinal();
  const html = env.ui.lastDialog;
  const text = html.match(/<textarea id="t">([\s\S]*?)<\/textarea>/)[1];
  console.log('FINAL TEXT:\n' + text);
  assert(text.includes('סיכום התקופה') && text.includes('ימי מניין'));
  assert(/משתתפים בהגרלה \(\d+\)|עדיין אין/.test(text));
  assert.equal(env.log.filter(l => l[0] === 'dialog').slice(-1)[0][1], 'סיכום התקופה — טקסט להדבקה בוואטסאפ');
  console.log('final text OK');
}

// ---------- Cache safety ----------
{
  const init = web('kioskInit', key);
  assert(init.roster.length > 3 && init.roster.every(p => !('phone' in p)), 'roster must not contain phones');
  // A person row deleted by hand (fires no onEdit) must not come back on the next write.
  const ps = env.ss.getSheetByName('אנשים');
  const before = ps.getRange(2, 1, ps.getLastRow() - 1, 7).getValues();
  const victim = before[before.length - 1][0];
  ps.data.splice(before.length, 1);                       // delete the last person's row directly
  sub({ phone: '0581234567', first: 'בדיקה', last: 'מטמון' });
  const after = ps.getRange(2, 1, ps.getLastRow() - 1, 7).getValues().map(r => r[0]);
  assert(!after.includes(victim), 'deleted row resurrected by a stale cache');
  assert(after.length === before.length, 'one deleted, one added');
  // A manual edit of a name is seen by the next lookup.
  const rowIdx = after.indexOf('P001') + 2;
  env.userEdit('אנשים', 'C' + rowIdx, 'כהנא');
  assert(web('kioskInit', key).roster.find(p => p.id === 'P001').last === 'כהנא');
  console.log('cache safety OK');
}

// ---------- Device detection (server side of it) ----------
{
  assert(G.doGet({ parameter: { k: key, device: 'kiosk' } }).html.includes("var FORCED_DEVICE = 'kiosk'"));
  assert(G.doGet({ parameter: { k: key, device: 'evil<script>' } }).html.includes("var FORCED_DEVICE = ''"));
  const r = sub({ phone: '0599999999', first: 'נייד', last: 'בודק', device: 'mobile' });
  assert.equal(r.status, 'created');
  const att = rows('נוכחות'); assert.equal(att[att.length - 1][3], 'דף רישום · נייד');
  sub({ phone: '0599999998', first: 'גבאי', last: 'בודק', device: 'mobile', pin, date: past[0] });
  const att2 = rows('נוכחות'); assert.equal(att2[att2.length - 1][3], 'גבאי');
  console.log('device OK');
}
