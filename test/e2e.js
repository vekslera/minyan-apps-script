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

// Registrations come from a tablet unless a test says otherwise (a computer may only use gabbai mode).
const sub = d => web('kioskSubmit', key, Object.assign({ device: 'tablet' }, d));
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
const sess = web('kioskLogin', key, pin).token;
assert(sess && sess.length > 10);
assert.throws(() => web('kioskLogin', key, '0000'), /שגוי/);
const past = [1,2,3,4].map(n => G.addDays_(today, -n)).filter(d => G.dow_(d) !== 6).slice(0, 3);
const d1 = past[0], d2 = past[1];
past.forEach(d => { r = sub({ phone: '0521111111', session: sess, date: d }); assert.equal(r.status, 'recorded', JSON.stringify(r)); });
r = sub({ personId: 'P002', session: sess, date: past[0] }); assert.equal(r.status, 'recorded');
assert.throws(() => sub({ phone: '0521111111', session: 'not-a-session', date: d1 }), /כניסה מחדש/);
// a Shabbat date
let sat = today; while (G.dow_(sat) !== 6) sat = G.addDays_(sat, -1);
r = sub({ phone: '0521111111', session: sess, date: sat }); assert.equal(r.ok, false); console.log('shabbat:', r.message);
r = sub({ phone: '0521111111', session: sess, date: G.addDays_(today, 1) }); assert.equal(r.ok, false);
// ambiguous: surname only, two Cohens → pending
r = sub({ last: 'כהן' }); console.log('ambiguous כהן:', r.status); assert.equal(r.status, 'pending');
// typo with known first name → auto
r = sub({ last: 'פרידמאן', first: 'יוסף', session: sess, date: d1 }); console.log('typo פרידמאן:', r.status, r.name);
// phone of Moshe but other first name and other surname → pending
r = sub({ phone: '0521111111', last: 'גולד', first: 'אברהם', session: sess, date: d2 }); console.log('phone conflict:', r.status);
// chosen person with a different phone already on file → pending
r = sub({ personId: 'P003', phone: '0509999999', session: sess, date: d2 }); console.log('chip+other phone:', r.status);

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
  sub({ phone: '0599999998', first: 'גבאי', last: 'בודק', device: 'mobile', session: sess, date: past[0] });
  const att2 = rows('נוכחות'); assert.equal(att2[att2.length - 1][3], 'גבאי');
  console.log('device OK');
}

// ---------- Browser scripts are declarations only ----------
{
  // If scripts/*.js were ever uploaded as server code (wrong .clasp.json), loading them must not throw.
  const vm2 = require('vm'), fs2 = require('fs'), path2 = require('path');
  const box = vm2.createContext({});
  const walk = d => fs2.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path2.join(d, e.name)) : [path2.join(d, e.name)]);
  const files = walk(path2.join(__dirname, '..', 'scripts')).filter(f => f.endsWith('.js'));
  files.forEach(f => vm2.runInContext(fs2.readFileSync(f, 'utf8'), box, { filename: f }));
  // and every include in the pages resolves
  for (const page of ['KioskPage', 'AdminPage', 'GabbaiPage', 'LinkDialog', 'ReportTextDialog']) {
    const html = G.page_(page);
    assert(!/data-include=/.test(html), page + ' has an unresolved include');
  }
  console.log('client scripts OK (' + files.length + ' files)');
}

// ---------- Personal phone: the number is optional, the surname identifies as usual ----------
{
  const r = sub({ first: 'בלי', last: 'טלפון', device: 'mobile' });
  assert.equal(r.ok, true); assert.equal(r.status, 'created');
  const again = sub({ last: 'טלפון', device: 'mobile' });
  assert.equal(again.ok, true); assert.equal(again.name, 'בלי טלפון');
  console.log('mobile without phone OK');
}

// ---------- Location check (Secrets.gs: shulLat/shulLng/shulRadius) ----------
{
  const SHUL = { lat: 31.9857703, lng: 34.8582831 };
  const envL = makeEnv({ secrets: { shulLat: String(SHUL.lat), shulLng: String(SHUL.lng), shulRadius: 150 } });
  const L = envL.ctx; L.setup();
  envL.userEdit('הגדרות', 'B6', 0); envL.userEdit('הגדרות', 'B7', 24);
  const k = envL.props.KIOSK_KEY, lpin = String(envL.ss.getSheetByName('הגדרות').getRange('B8').getValue());
  const lsess = L.kioskLogin(k, lpin).token;
  const wsub = d => { L.__webContext = true; try { return L.kioskSubmit(k, d); } finally { L.__webContext = false; } };
  const north = m => ({ lat: SHUL.lat + m / 111320, lng: SHUL.lng });           // m metres north of the shul
  assert.equal(L.kioskInit(k).locationCheck, true);
  // a computer may not self-register; nor may a page that doesn't say what it runs on
  assert.match(wsub({ last: 'כהן', device: 'desktop', loc: { lat: SHUL.lat, lng: SHUL.lng, acc: 10 } }).message, /טאבלט/);
  assert.equal(wsub({ last: 'כהן', loc: { lat: SHUL.lat, lng: SHUL.lng, acc: 10 } }).ok, false);
  // inside
  let r = wsub({ phone: '0521111111', first: 'משה', last: 'כהן', device: 'mobile', loc: Object.assign(north(20), { acc: 15 }) });
  assert.equal(r.ok, true); assert.equal(r.status, 'created');
  r = wsub({ phone: '0522222222', first: 'דוד', last: 'לוי', device: 'tablet', loc: Object.assign(north(200), { acc: 80 }) });
  assert.equal(r.status, 'created', '200 m away with ±80 m accuracy counts as inside');
  // outside → told so, with a rounded distance; nothing recorded
  const attBefore = envL.ss.getSheetByName('נוכחות').getLastRow();
  r = wsub({ phone: '0523333333', first: 'יוסף', last: 'פרידמן', device: 'mobile', loc: Object.assign(north(847), { acc: 20 }) });
  assert.equal(r.ok, false); assert.equal(r.where, 'outside'); assert.equal(r.distance, 850);
  assert.equal(envL.ss.getSheetByName('נוכחות').getLastRow(), attBefore);
  // … sends it for approval → review list with the distance only
  r = wsub({ phone: '0523333333', first: 'יוסף', last: 'פרידמן', device: 'mobile', loc: Object.assign(north(847), { acc: 20 }), outsideOk: true });
  assert.equal(r.ok, true); assert.equal(r.status, 'pending');
  // no position (permission denied) → told so; then for approval
  r = wsub({ last: 'כהן', personId: 'P001', device: 'mobile', loc: { error: 'denied' } });
  assert.equal(r.where, 'none'); assert(/הרשאת מיקום/.test(r.message));
  r = wsub({ personId: 'P001', device: 'mobile', loc: { error: 'denied' }, outsideOk: true });
  assert.equal(r.status, 'pending');
  const pend = envL.ss.getSheetByName('לבדיקה'); const notes = pend.getRange(2, 1, pend.getLastRow() - 1, 10).getValues();
  assert.equal(notes[0][8], 'מחוץ לבית הכנסת (~850 מ׳)'); assert.equal(notes[1][8], 'ללא מיקום (לא ניתנה הרשאת מיקום)');
  assert.equal(notes[1][6], 'כהן', 'pending row carries the chosen person\'s name');
  // the review screen suggests the person
  const g = L.adminGetPending(envL.props.ADMIN_TOKEN).groups;
  assert(g.some(x => x.bestId === 'P001'));
  // the shul tablet and gabbai mode are not checked
  assert.equal(wsub({ phone: '0524444444', first: 'א', last: 'טאבלט', device: 'kiosk' }).status, 'created');
  assert.equal(wsub({ phone: '0525555555', first: 'ב', last: 'גבאי', session: lsess, device: '' }).status, 'created');
  // nothing anywhere in the spreadsheet looks like a coordinate
  const all = JSON.stringify(envL.ss.getSheets().map(s => s.data));
  assert(!/31\.98|34\.85/.test(all), 'coordinates must never be stored');
  // gabbai location test
  const t = L.kioskCheckLocation(k, lsess, Object.assign(north(60), { acc: 12 }));
  assert.equal(t.inside, true); assert.equal(t.distance, 60); assert.equal(t.radius, 150);
  assert.throws(() => L.kioskCheckLocation(k, 'bad-session', north(0)), /כניסה מחדש/);
  // without Secrets.gs coordinates the check is off
  assert.equal(G.kioskInit(key).locationCheck, false);
  console.log('location OK');
}

// ---------- Gabbai access: lockout, sessions, changing the code ----------
{
  const envA = makeEnv(); const A = envA.ctx; A.setup();
  const k = envA.props.KIOSK_KEY, code = String(envA.ss.getSheetByName('הגדרות').getRange('B8').getValue());
  const w = (fn, ...a) => { A.__webContext = true; try { return A[fn](...a); } finally { A.__webContext = false; } };
  assert.throws(() => w('kioskLogin', k, 'wrong1'), /שגוי/);
  assert.throws(() => w('kioskLogin', k, 'wrong2'), /שגוי/);
  assert.throws(() => w('kioskLogin', k, 'wrong3'), /נעולה ל-60/);
  assert.throws(() => w('kioskLogin', k, code), /בעוד \d+ שניות/, 'even the right code waits during the lockout');
  envA.now.offsetMs += 61 * 1000;                                   // a minute later
  const s1 = w('kioskLogin', k, code);
  assert.equal(s1.weakCode, true, 'the 4-digit setup code is reported as weak');
  // the session works, logout ends it
  assert.equal(w('kioskInit', k, s1.token).session, true);
  w('kioskLogout', k, s1.token);
  assert.equal(w('kioskInit', k, s1.token).session, false);
  // changing the code: the current one is required, rules apply, everyone is logged out
  const s2 = w('kioskLogin', k, code).token, s3 = w('kioskLogin', k, code).token;
  assert.throws(() => w('gabbaiChangePin', k, s2, code, '12 34'), /רווחים/);
  assert.throws(() => w('gabbaiChangePin', k, s2, code, 'abc'), /לפחות 6/);
  assert.throws(() => w('gabbaiChangePin', k, s2, 'nope', 'testcode9'), /שגוי/);
  w('gabbaiChangePin', k, s2, code, 'testcode9');
  assert.equal(w('kioskInit', k, s3).session, false, 'other sessions end when the code changes');
  assert.throws(() => w('kioskLogin', k, code), /שגוי/);
  const s4 = w('kioskLogin', k, 'testcode9'); assert.equal(s4.weakCode, false);
  assert.match(String(envA.ss.getSheetByName('הגדרות').getRange('C8').getValue()), /שונה על ידי הגבאי/);
  assert.equal(A.readSettings_(envA.ss, 'Asia/Jerusalem').pin, 'testcode9', 'the changed code wins over Secrets.gs and the sheet');
  // an expired session (30 minutes without use)
  envA.now.offsetMs += 31 * 60 * 1000;
  console.log('gabbai access OK');
}

// ---------- Gabbai tools page: every Sheet tool through the web, with a session ----------
{
  const envT = makeEnv(); const T = envT.ctx; T.setup();
  const k = envT.props.KIOSK_KEY, code = String(envT.ss.getSheetByName('הגדרות').getRange('B8').getValue());
  const W = (fn, ...a) => { T.__webContext = true; try { return noDates(T[fn](...a)); } finally { T.__webContext = false; } };
  const day = T.todayKey_('Asia/Jerusalem');
  envT.userEdit('הגדרות', 'B6', 0); envT.userEdit('הגדרות', 'B7', 24);
  envT.userEdit('הגדרות', 'B3', T.keyToDate_(T.addDays_(day, -9), 'Asia/Jerusalem'));
  envT.userEdit('הגדרות', 'B9', 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec');
  // pages: the tools page is complete; the registration page links to it
  const page = W('doGet', { parameter: { k: k, view: 'gabbai' } }).html;
  assert(page.includes("var KEY = '" + k + "'") && page.includes('function startGabbai') && page.includes('function loadReview'));
  assert(!/__[A-Z]+__|data-include/.test(page.replace('/*__SHARED_JS__*/', '')), 'no placeholders left in the tools page');
  assert(/TOOLS_URL = 'https:\/\/script\.google\.com\/macros\/s\/AKfyc_EXAMPLE\/exec\?k=\w+&view=gabbai'/.test(W('doGet', { parameter: { k: k } }).html));
  assert(W('doGet', { parameter: { k: 'bad', view: 'gabbai' } }).html.includes('הקישור אינו תקין'));
  // without a session nothing works
  assert.equal(W('gabbaiInit', k, '').session, false);
  ['gabbaiGetPending', 'gabbaiDrawInfo', 'gabbaiFindDuplicates', 'gabbaiLink'].forEach(fn => assert.throws(() => W(fn, k, 'nope'), /כניסה מחדש/, fn));
  assert.throws(() => W('gabbaiWeekly', k, 'nope', ''), /כניסה מחדש/);
  const s = W('kioskLogin', k, code).token;
  const home = W('gabbaiInit', k, s);
  assert.equal(home.session, true); assert.equal(home.pending, 0); assert(home.period && home.period.start);
  // data: three regulars
  const sub = d => T.kioskSubmit(k, Object.assign({ device: 'tablet' }, d));
  const days = [1, 2, 3, 4, 5, 6, 7, 8].map(n => T.addDays_(day, -n)).filter(d => T.dow_(d) !== 6);
  sub({ phone: '0521111111', first: 'משה', last: 'כהן' });
  sub({ phone: '0522222222', first: 'דוד', last: 'לוי' });
  days.forEach(d => sub({ phone: '0521111111', session: s, date: d }));
  // import → review → resolve, all through the web functions
  const parsed = W('gabbaiParseImport', k, s, 'כהן משה\nשניאורסון', days[0]);
  assert.equal(parsed.rows.length, 2);
  assert.equal(W('gabbaiQueueImport', k, s, parsed.rows).added, 2);
  assert.equal(W('gabbaiInit', k, s).pending, 2);
  const pend = W('gabbaiGetPending', k, s);
  const cohen = pend.groups.find(g => g.raw === 'כהן משה'), sch = pend.groups.find(g => g.raw === 'שניאורסון');
  assert.equal(cohen.bestId, 'P001');
  const res = W('gabbaiResolve', k, s, [{ gid: cohen.gid, ids: cohen.ids, action: 'person', personId: 'P001' },
                                       { gid: sch.gid, ids: sch.ids, action: 'new', first: '', last: 'שניאורסון', phone: '' }]);
  assert.equal(res.saved, 2);
  // reports: written to the sheet, WhatsApp text returned; no Sheet UI is touched from the web
  const wk = W('gabbaiWeekly', k, s, '');
  assert(wk.text.includes('משה כהן') && envT.ss.getSheetByName(wk.sheet));
  assert.throws(() => W('gabbaiWeekly', k, s, 'not a date'), /אינו תקין/);
  envT.userEdit('הגדרות', 'B4', '');
  assert.throws(() => W('gabbaiFinal', k, s), /תחילת וסוף התקופה/);
  assert.throws(() => W('gabbaiDrawInfo', k, s), /תחילת וסוף התקופה/);
  envT.userEdit('הגדרות', 'B4', T.keyToDate_(T.addDays_(day, 30), 'Asia/Jerusalem'));
  const fin = W('gabbaiFinal', k, s);
  assert(fin.text.includes('(עד היום)') && fin.eligible === 1, JSON.stringify(fin));
  assert.equal(W('gabbaiInit', k, s).period.threshold, 75);
  // lottery
  const info = W('gabbaiDrawInfo', k, s);
  assert.equal(info.eligible.length, 1); assert.equal(info.eligible[0].name, 'משה כהן'); assert.equal(info.last, null);
  const win = W('gabbaiDraw', k, s);
  assert.equal(win.name, 'משה כהן'); assert.equal(win.among, 1);
  assert.equal(W('gabbaiDrawInfo', k, s).last.name, 'משה כהן');
  // duplicates: "דוד לוי" entered again without a phone
  const ctx = T.loadCtx_(envT.ss);
  const dup = T.createPerson_(ctx, { first: 'דוד', last: 'לוי', phone: '' });
  T.record_(ctx, dup, { date: days[1], source: 'דף רישום', raw: 'דוד לוי', loggedAt: new Date() });
  T.flushCtx_(ctx); T.cacheClear_();
  const pairs = W('gabbaiFindDuplicates', k, s);
  const pair = pairs.find(p => [p.a.id, p.b.id].includes(dup.id));
  assert(pair, JSON.stringify(pairs));
  const mr = W('gabbaiMerge', k, s, [{ keep: 'P002', drop: dup.id }]);
  assert.equal(mr.merged, 1);
  assert(!T.loadCtx_(envT.ss).byId[dup.id], 'the duplicate is gone');
  assert.equal(W('gabbaiFindDuplicates', k, s).filter(p => [p.a.id, p.b.id].includes(dup.id)).length, 0);
  // link
  const ln = W('gabbaiLink', k, s);
  assert.equal(ln.link, 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec?k=' + k);
  assert.equal(ln.tools, ln.link + '&view=gabbai');
  // changing the code keeps this gabbai logged in with a fresh session
  const other = W('kioskLogin', k, code).token;
  const ch = W('gabbaiChangePin', k, s, code, 'testcode9');
  assert.equal(W('gabbaiInit', k, ch.token).session, true);
  assert.equal(W('gabbaiInit', k, other).session, false);
  console.log('gabbai tools OK');
}

console.log('\nALL OK');
