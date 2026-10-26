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
const pin = G.gabbaiPin_();

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
const before = env.log.length;
env.ui.nextPromptButton = 'CANCEL'; G.menuKioskLink(); console.log(env.log.slice(-1)[0]);
assert(!env.log.slice(before).some(l => l[0] === 'dialog') && env.log.slice(before).some(l => l[0] === 'prompt'),
       "Google's reported address is never used: the address is asked for");
env.ui.nextPromptButton = 'OK'; env.props.WEB_URL = 'https://script.google.com/macros/s/ABC/exec';
G.menuKioskLink(); assert(env.ui.lastDialog.includes('/exec?k=' + key)); console.log('link dialog ok');

// ---------- Secrets.gs overrides ----------
{
  const env2 = makeEnv({ secrets: { gabbaiPin: '4321', deploymentId: 'AKfycbTEST', kioskKey: 'fixedkey123', lotteryThreshold: '60' } });   // an older Secrets.gs
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
  // retiring Secrets.gs: setup copied the address and the key to hidden storage, so the link stays the same
  assert(/הקישור לדף הרישום \(הכתובת והמפתח\) נשמר גם במקום מוסתר/.test(env2.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  assert.equal(env2.props.WEB_URL, 'https://script.google.com/macros/s/AKfycbTEST/exec'); assert.equal(env2.props.KIOSK_KEY, 'fixedkey123');
  G2.SECRETS = {};                                                   // Secrets.gs removed
  G2.cacheClear_();
  assert.equal(G2.kioskKey_(), 'fixedkey123', 'same key without Secrets.gs');
  assert.equal(G2.kioskLink_(G2.readSettings_(env2.ss, 'Asia/Jerusalem')), 'https://script.google.com/macros/s/AKfycbTEST/exec?k=fixedkey123');
  assert(!/kioskSubmit/.test(G2.doGet({ parameter: { k: 'other' } }).html) && /kioskSubmit/.test(G2.doGet({ parameter: { k: 'fixedkey123' } }).html), 'the old QR code still opens the page');
  G2.setup();
  assert(!/נשמר גם במקום מוסתר/.test(env2.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'no message once Secrets.gs is gone');
  assert.equal(G2.kioskKey_(), 'fixedkey123');
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
  assert(/✓ = משתתף בהגרלה \(\d+\)|עדיין אין/.test(text));
  assert(/^1\. .+ — \d+\/\d+( ✓)?$/m.test(text), 'every person with days/minyan-days, like the weekly text');
  const listed = text.split('\n').filter(l => /^\d+\. /.test(l)).length;
  assert.equal(listed, G.computeStats_(G.loadCtx_(env.ss), G.readSettings_(env.ss, 'Asia/Jerusalem').start, G.readSettings_(env.ss, 'Asia/Jerusalem').end).rows.length, 'everyone who came is listed');
  assert.equal(env.log.filter(l => l[0] === 'dialog').slice(-1)[0][1], 'סיכום התקופה — טקסט להדבקה בוואטסאפ');
  G.menuRebbe();
  assert.equal(env.log.filter(l => l[0] === 'dialog').slice(-1)[0][1], 'דוח לרבי — טקסט להדבקה בוואטסאפ');
  assert(/דוח לרבי/.test(env.ui.lastDialog) && !/בגיליון החדש/.test(env.ui.lastDialog), 'no sheet for this one');
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
  const files = walk(path2.join(__dirname, '..', 'src', 'scripts')).filter(f => f.endsWith('.js'));
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
  const k = envL.props.KIOSK_KEY, lpin = envL.ctx.gabbaiPin_();
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
  // no registrant's position anywhere: outside הגדרות nothing looks like a coordinate, and in הגדרות only the shul's own point
  const all = JSON.stringify(envL.ss.getSheets().filter(s => s.name !== 'הגדרות').map(s => s.data));
  assert(!/31\.98|34\.85/.test(all), 'coordinates must never be stored');
  const coords = (JSON.stringify(envL.ss.getSheetByName('הגדרות').data).match(/31\.98\d*|34\.85\d*/g) || []).map(Number);
  assert.deepEqual(coords.sort(), [SHUL.lat, SHUL.lng].sort(), 'the settings hold the shul point only');
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
  assert(/^\d{6}$/.test(A.gabbaiPin_()), 'a new installation gets a random 6-digit code');
  A.setPin_('1234');                                               // an old-style short code
  const k = envA.props.KIOSK_KEY, code = A.gabbaiPin_();
  const w = (fn, ...a) => { A.__webContext = true; try { return A[fn](...a); } finally { A.__webContext = false; } };
  assert.throws(() => w('kioskLogin', k, 'wrong1'), /שגוי/);
  assert.throws(() => w('kioskLogin', k, 'wrong2'), /שגוי/);
  assert.throws(() => w('kioskLogin', k, 'wrong3'), /נעולה ל-60/);
  assert.throws(() => w('kioskLogin', k, code), /בעוד \d+ שניות/, 'even the right code waits during the lockout');
  envA.now.offsetMs += 61 * 1000;                                   // a minute later
  const s1 = w('kioskLogin', k, code);
  assert.equal(s1.weakCode, true, 'a 4-digit code is reported as weak');
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
  assert.equal(A.readSettings_(envA.ss, 'Asia/Jerusalem').pin, 'testcode9');
  assert(!JSON.stringify(envA.ss.getSheets().map(x => x.data)).includes('testcode9'), 'the code is never in the Sheet');
  // an expired session (30 minutes without use)
  envA.now.offsetMs += 31 * 60 * 1000;
  console.log('gabbai access OK');
}

// ---------- Gabbai tools page: every Sheet tool through the web, with a session ----------
{
  const envT = makeEnv(); const T = envT.ctx; T.setup();
  const k = envT.props.KIOSK_KEY, code = envT.ctx.gabbaiPin_();
  const W = (fn, ...a) => { T.__webContext = true; try { return noDates(T[fn](...a)); } finally { T.__webContext = false; } };
  const day = T.todayKey_('Asia/Jerusalem');
  envT.userEdit('הגדרות', 'B6', 0); envT.userEdit('הגדרות', 'B7', 24);
  envT.userEdit('הגדרות', 'B3', T.keyToDate_(T.addDays_(day, -9), 'Asia/Jerusalem'));
  envT.props.WEB_URL = 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec';
  // pages: the tools page is complete; the registration page links to it
  const page = W('doGet', { parameter: { k: k, view: 'gabbai' } }).html;
  assert(page.includes("var KEY = '" + k + "'") && page.includes('function startGabbai') && page.includes('function loadReview'));
  assert(!/__[A-Z]+__|data-include/.test(page), 'no placeholders left in the tools page');
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
  // the same name on another day: one more entry, but still 2 cards — the tile counts as the list does
  assert.equal(W('gabbaiQueueImport', k, s, [{ date: days[1], name: 'שניאורסון' }]).added, 1);
  assert.equal(W('gabbaiGetPending', k, s).groups.length, 2);
  assert.equal(W('gabbaiInit', k, s).pending, 2, 'tile = cards, not entries');
  assert.equal(T.countPending_(envT.ss), 3, 'the reports still count entries');
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
  // report to the Rebbe: names at or above 25% (default), alphabetical, as WhatsApp text
  const reb = W('gabbaiRebbe', k, s);
  const rebNames = reb.text.split('\n').filter(l => /^\d+\. /.test(l)).map(l => l.replace(/^\d+\. /, ''));
  const st = T.computeStats_(T.loadCtx_(envT.ss), T.readSettings_(envT.ss, 'Asia/Jerusalem').start, T.readSettings_(envT.ss, 'Asia/Jerusalem').end);
  const expect = st.rows.filter(r => r.count * 100 >= 25 * st.days.length).sort((a, b) => (a.person.last + ' ' + a.person.first).localeCompare(b.person.last + ' ' + b.person.first, 'he')).map(r => T.displayName_(r.person));
  assert.deepEqual(rebNames, expect); assert.equal(reb.names, expect.length); assert.equal(reb.threshold, 25);
  assert(reb.text.startsWith('*דוח לרבי — ') && rebNames.includes('משה כהן'), reb.text);
  assert(st.rows.some(r => r.count * 100 < 25 * st.days.length && !rebNames.includes(T.displayName_(r.person))), 'someone below 25% is left out');
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
  // &debug=1: the page gets the server's build time; the timed calls report their server share
  assert(/var DEBUG_MS = '\d+';/.test(W('doGet', { parameter: { k: k, debug: '1' } }).html));
  assert(/var DEBUG_MS = '';/.test(W('doGet', { parameter: { k: k } }).html), 'off without &debug=1');
  assert(/DEBUG_MS = '\d+'/.test(W('doGet', { parameter: { k: k, view: 'gabbai', debug: '1' } }).html));
  // moving between the pages keeps the flag (but the link for sharing doesn't get it)
  assert(/TOOLS_URL = '[^']+&view=gabbai&debug=1'/.test(W('doGet', { parameter: { k: k, debug: '1' } }).html), 'כלי גבאי keeps &debug=1');
  assert(/HOME_URL = '[^']+\?k=\w+&debug=1'/.test(W('doGet', { parameter: { k: k, view: 'gabbai', debug: '1' } }).html), 'back to registration keeps it');
  assert(!/debug=1/.test(W('doGet', { parameter: { k: k } }).html.match(/TOOLS_URL = '[^']*'/)[0]), 'not added without the flag');
  assert(!/debug/.test(W('gabbaiLink', k, ch.token).link), 'the link for sharing stays clean');
  assert.equal(typeof W('kioskInit', k)._ms, 'number');
  // today's data comes with the page (no second call); safe inside <script>
  const kp = W('doGet', { parameter: { k: k } }).html;
  const initJson = kp.match(/var INIT = (\{.*\});/)[1];
  const init = JSON.parse(initJson);
  assert.equal(init.today, W('kioskInit', k).today); assert(Array.isArray(init.roster) && init.roster.length >= 2);
  assert(!/<\/script/i.test(initJson) && !/0521111111|0522222222/.test(initJson), 'no </script> and no phone numbers in the page'); assert.equal(typeof W('gabbaiInit', k, '')._ms, 'number');
  console.log('gabbai tools OK');
}

// ---------- Shul location in the הגדרות sheet: set by the gabbai; radius; GPS tolerance ----------
{
  const SH0 = { lat: 31.9857703, lng: 34.8582831 };
  const at = (p, m) => ({ lat: p.lat + m / 111320, lng: p.lng });                 // m metres north of p
  const envS = makeEnv(); const S2 = envS.ctx; S2.setup();
  const k = envS.props.KIOSK_KEY, code = S2.gabbaiPin_();
  const W = (fn, ...a) => { S2.__webContext = true; try { return noDates(S2[fn](...a)); } finally { S2.__webContext = false; } };
  const cell = label => { const r = envS.ss.getSheetByName('הגדרות').data.find(x => x[0] === label); return r ? r[1] : undefined; };
  const s = W('kioskLogin', k, code).token;
  assert.throws(() => W('gabbaiShulInfo', k, 'nope'), /כניסה מחדש/);
  let info = W('gabbaiShulInfo', k, s);
  assert.equal(info.configured, false, 'a new installation has no location check');
  assert.equal(W('kioskInit', k).locationCheck, false);
  assert.throws(() => W('gabbaiSetShulRadius', k, s, 60, ''), /קודם קובעים/);
  // a vague reading is refused; a precise one is written to the sheet with a note
  assert.throws(() => W('gabbaiSetShulLocation', k, s, Object.assign({}, SH0, { acc: 80 })), /לא מדויקת/);
  info = W('gabbaiSetShulLocation', k, s, Object.assign({}, SH0, { acc: 9 }));
  assert.equal(info.configured, true); assert.equal(info.radius, 50); assert.equal(info.tolUsed, 25); assert(/נמדד בכלי הגבאי.*±9/.test(info.note));
  assert.equal(cell('מיקום בית הכנסת — קו רוחב'), SH0.lat); assert.equal(cell('רדיוס מותר (מטרים)'), 50);
  assert.equal(W('kioskInit', k).locationCheck, true);
  // radius 40, tolerance empty = half: a house 84 m away with ±30 m is outside; 50 m with ±15 m inside
  assert.throws(() => W('gabbaiSetShulRadius', k, s, 10, ''), /בין 20 ל-1000/);
  assert.throws(() => W('gabbaiSetShulRadius', k, s, 40, -3), /סטיית ה-GPS/);
  info = W('gabbaiSetShulRadius', k, s, 40, '');
  assert.equal(info.radius, 40); assert.equal(info.tol, null); assert.equal(info.tolUsed, 20);
  let c = W('gabbaiCheckLocation', k, s, Object.assign(at(SH0, 84), { acc: 30 }));
  assert.equal(c.inside, false); assert.equal(c.distance, 84); assert.equal(c.tol, 20);
  assert.equal(W('gabbaiCheckLocation', k, s, Object.assign(at(SH0, 50), { acc: 15 })).inside, true);
  // an explicit tolerance
  info = W('gabbaiSetShulRadius', k, s, 40, 50);
  assert.equal(info.tol, 50); assert.equal(cell('סטיית GPS מותרת (מטרים)'), 50);
  assert.equal(W('gabbaiCheckLocation', k, s, Object.assign(at(SH0, 84), { acc: 60 })).inside, true, '84 ≤ 40 + min(60, 50)');
  info = W('gabbaiSetShulRadius', k, s, 40, 0);
  assert.equal(W('gabbaiCheckLocation', k, s, Object.assign(at(SH0, 45), { acc: 30 })).inside, false, 'tolerance 0: the radius only');
  // registrations follow the sheet
  envS.userEdit('הגדרות', 'B6', 0); envS.userEdit('הגדרות', 'B7', 24);
  const r = S2.kioskSubmit(k, { phone: '0521111111', first: 'משה', last: 'כהן', device: 'mobile', loc: Object.assign(at(SH0, 84), { acc: 30 }) });
  assert.equal(r.where, 'outside');
  // a manual edit of the sheet counts too
  envS.userEdit('הגדרות', 'B10', 200);
  assert.equal(W('gabbaiShulInfo', k, s).radius, 200);
  // turning the check off
  info = W('gabbaiClearShulLocation', k, s);
  assert.equal(info.configured, false); assert.equal(cell('מיקום בית הכנסת — קו רוחב'), '');
  assert.equal(W('kioskInit', k).locationCheck, false);
  console.log('shul location OK');
}

// ---------- setup() moves settings from older versions ----------
{
  // An older installation: code and address rows in the sheet, the shul in Secrets.gs, a threshold there too.
  const envM = makeEnv({ secrets: { gabbaiPin: 'oldcode77', shulLat: '31.9857703', shulLng: '34.8582831', shulRadius: 150, lotteryThreshold: '80' } });
  const M = envM.ctx;
  const st = envM.ss.insertSheet('הגדרות');
  const today = M.todayKey_('Asia/Jerusalem');
  [['הגדרה', 'ערך', 'הסבר', '', 'ימים ללא מניין (תאריך אחד בכל תא)'],
   ['שם המניין', 'מניין סטיינבך', 'מוצג בראש דף הרישום', '', M.keyToDate_(M.addDays_(today, 3), 'Asia/Jerusalem')],
   ['תחילת התקופה', M.keyToDate_(today, 'Asia/Jerusalem'), ''], ['סוף התקופה', M.keyToDate_(M.addDays_(today, 20), 'Asia/Jerusalem'), ''],
   ['אחוז נוכחות מינימלי להגרלה', 75, ''], ['רישום עצמי פתוח משעה', 8, ''], ['רישום עצמי פתוח עד שעה', 11, ''],
   ['קוד גבאי', '4567', 'old'], ['כתובת דף הרישום (Web app)', 'https://script.google.com/macros/s/OLD/exec', ''],
   ['הערה שלי', 'משהו', 'שורה שהוספתי']].forEach((row, i) => row.forEach((v, j) => st.set(i + 1, j + 1, v)));
  // before setup: the old places still work
  let s0 = M.readSettings_(envM.ss, 'Asia/Jerusalem');
  assert.equal(s0.pin, 'oldcode77'); assert.equal(M.shulArea_().radius, 150);
  M.setup();
  M.shulArea_.v = undefined;
  const s1 = M.readSettings_(envM.ss, 'Asia/Jerusalem');
  assert.equal(M.gabbaiPin_(), 'oldcode77', 'the code moves (Secrets.gs wins over the old row) and stays the same');
  assert.equal(s1.name, 'מניין סטיינבך'); assert.equal(s1.from, 8); assert.equal(s1.to, 11); assert.equal(s1.threshold, 80);
  assert.equal(s1.start, today); assert.equal(s1.excluded.size, 1, 'no-minyan dates kept');
  const a = M.shulArea_(); assert.equal(a.lat, 31.9857703); assert.equal(a.radius, 150);
  const labels = st.data.map(r => r[0]).filter(Boolean);
  assert(!labels.includes('קוד גבאי') && !labels.includes('כתובת דף הרישום (Web app)'), 'old rows removed');
  assert(labels.includes('הערה שלי'), 'the user\'s own rows are kept');
  assert(!JSON.stringify(st.data).includes('oldcode77') && !JSON.stringify(st.data).includes('4567'), 'no code in the Sheet');
  assert(/Secrets\.gs/.test(envM.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'the closing message says what moved');
  // running setup again changes nothing — not even a threshold the gabbai changed since
  envM.userEdit('הגדרות', 'B5', 70);
  const before = JSON.stringify(st.data);
  M.setup();
  assert.equal(JSON.stringify(st.data), before);
  assert.equal(M.readSettings_(envM.ss, 'Asia/Jerusalem').threshold, 70);
  // the gabbai's own measurement (older version: script properties) wins over Secrets.gs
  const envP = makeEnv({ secrets: { shulLat: '31.9', shulLng: '34.8' } }); const P = envP.ctx;
  envP.props.SHUL_AREA = JSON.stringify({ lat: 31.98577, lng: 34.85828, radius: 45, acc: 6, setAt: '21/10/2026' });
  P.setup(); P.shulArea_.v = undefined;
  assert.equal(P.shulArea_().radius, 45); assert(/21\/10\/2026/.test(P.shulArea_().note));
  assert.equal(envP.props.SHUL_AREA, undefined, 'the old property is removed');
  console.log('settings migration OK');
}

// ---------- Gabbai settings screen: name, hours, period, threshold, no-minyan days ----------
{
  const envG = makeEnv(); const Q = envG.ctx; Q.setup();
  const k = envG.props.KIOSK_KEY;
  const W = (fn, ...a) => { Q.__webContext = true; try { return noDates(Q[fn](...a)); } finally { Q.__webContext = false; } };
  const s = W('kioskLogin', k, Q.gabbaiPin_()).token;
  assert.throws(() => W('gabbaiSettings', k, 'x'), /כניסה מחדש/);
  let g = W('gabbaiSettings', k, s);
  assert.equal(g.from, 5); assert.equal(g.to, 11); assert.equal(g.threshold, 75); assert.equal(g.name, 'מניין שחרית');
  assert.equal(g.rebbe, 25, 'report to the Rebbe: 25% by default');
  const base = { name: 'מניין סטיינבך', from: 8, to: 11, start: g.start, end: g.end, threshold: 70, rebbe: 30 };
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { rebbe: 101 })), /לדוח לרבי/);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { from: 11, to: 8 })), /שעות הרישום/);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { start: g.end, end: g.start })), /אחרי סופה/);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { threshold: -1 })), /בין 0 \(כבוי\) ל-100/);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { name: ' ' })), /חסר שם/);
  g = W('gabbaiSaveSettings', k, s, base);
  assert.equal(g.from, 8); assert.equal(g.threshold, 70); assert.equal(g.name, 'מניין סטיינבך');
  assert.equal(g.rebbe, 30); assert.equal(Q.readSettings_(envG.ss, 'Asia/Jerusalem').rebbe, 30);
  assert.equal(W('kioskInit', k).name, 'מניין סטיינבך');
  const d1 = Q.addDays_(g.today, 2), d2 = Q.addDays_(g.today, -3);
  g = W('gabbaiSetNoMinyan', k, s, [d1, d2]);
  assert.deepEqual(g.excluded, [d2, d1].sort());
  assert.throws(() => W('gabbaiSetNoMinyan', k, s, ['not a date']), /אינו תקין/);
  g = W('gabbaiSetNoMinyan', k, s, [d1]);
  assert.deepEqual(g.excluded, [d1]);
  assert(Q.loadCtx_(envG.ss).excluded.has(d1));
  // half hours: 8:30–11:00
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { from: 8.25, to: 11 })), /חצי שעה/);
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { from: 8.5, to: 11 }));
  assert.equal(g.from, 8.5); assert.equal(g.to, 11);
  const hourCell = label => envG.ss.getSheetByName('הגדרות').data.find(x => x[0] === label)[1];
  assert.equal(hourCell('רישום עצמי פתוח משעה'), '8:30', 'written as text, as the gabbai would type it');
  assert.equal(hourCell('רישום עצמי פתוח עד שעה'), '11:00');
  // what a gabbai may type into the sheet
  const tz = 'Asia/Jerusalem';
  assert.equal(Q.parseHour_('8:30', null, tz), 8.5); assert.equal(Q.parseHour_('08:30', null, tz), 8.5);
  assert.equal(Q.parseHour_(8.5, null, tz), 8.5); assert.equal(Q.parseHour_('9', null, tz), 9); assert.equal(Q.parseHour_('9.5', null, tz), 9.5);
  assert.equal(Q.parseHour_(new Q.Date('2026-10-25T06:30:00Z'), null, tz), 8.5, 'a time typed into a cell (Sheets makes it a Date)');
  assert.equal(Q.parseHour_('abc', 5, tz), 5); assert.equal(Q.parseHour_('25:00', 5, tz), 5);
  assert.equal(Q.fmtHour_(8.5), '8:30'); assert.equal(Q.fmtHour_(11), '11:00'); assert.equal(Q.fmtHour_(0), '0:00');
  envG.userEdit('הגדרות', 'B6', '9:30');
  assert.equal(Q.readSettings_(envG.ss, tz).from, 9.5);
  // open/closed by the half hour
  const t = Q.Utilities.formatDate(new Q.Date(), tz, 'H:mm').split(':'), nowH = Number(t[0]) + Number(t[1]) / 60;
  const slot = Math.floor(nowH * 2) / 2;
  assert.equal(Q.isOpenHour_({ from: slot, to: slot + 0.5 }, tz), true);
  assert.equal(Q.isOpenHour_({ from: slot + 0.5, to: slot + 1 }, tz), false);
  // the closed message shows the half hour
  envG.userEdit('הגדרות', 'B6', Q.fmtHour_(slot + 0.5)); envG.userEdit('הגדרות', 'B7', Q.fmtHour_(slot + 1));
  const closed = Q.kioskSubmit(k, { first: 'א', last: 'ב', device: 'mobile' });
  assert.equal(closed.ok, false); assert(closed.message.includes(Q.fmtHour_(slot + 0.5)), closed.message);
  assert(/:30|:00/.test(closed.message));
  // ---- 0 = off: lottery and report to the Rebbe ----
  envG.userEdit('הגדרות', 'B6', '0:00'); envG.userEdit('הגדרות', 'B7', '24:00');
  Q.kioskSubmit(k, { phone: '0521111111', first: 'משה', last: 'כהן', device: 'tablet' });
  for (let n = 1; n <= 3; n++) { const d = Q.addDays_(g.today, -n); if (Q.dow_(d) !== 6) Q.kioskSubmit(k, { phone: '0521111111', session: s, date: d }); }
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { start: Q.addDays_(g.today, -5), threshold: 0, rebbe: 0 }));
  assert.equal(g.threshold, 0); assert.equal(g.rebbe, 0);
  let init = W('gabbaiInit', k, s);
  assert.equal(init.lotteryOn, false); assert.equal(init.rebbeOn, false);
  assert.throws(() => W('gabbaiDrawInfo', k, s), /ההגרלה כבויה/);
  assert.throws(() => W('gabbaiDraw', k, s), /ההגרלה כבויה/);
  assert.throws(() => W('gabbaiRebbe', k, s), /הדוח לרבי כבוי/);
  const fin = W('gabbaiFinal', k, s);
  assert(!/✓|בהגרלה|משתתף/.test(fin.text), 'summary without lottery marks:\n' + fin.text);
  assert(/משה כהן — \d+\/\d+$/m.test(fin.text));
  const pst = Q.personStats_(Q.loadCtx_(envG.ss), 'P001');
  assert(pst && pst.count >= 1 && pst.eligible === false, 'no "✓ עומד בתנאי ההגרלה" on the page: ' + JSON.stringify(pst));
  // the Sheet menu: still there, marked; choosing it explains
  Q.onOpen();
  Q.menuDraw(); assert(/ההגרלה כבויה/.test(envG.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  Q.menuRebbe(); assert(/הדוח לרבי כבוי/.test(envG.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  // back on
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { start: Q.addDays_(g.today, -5), threshold: 50, rebbe: 25 }));
  init = W('gabbaiInit', k, s);
  assert.equal(init.lotteryOn, true); assert.equal(init.rebbeOn, true);
  assert(W('gabbaiDrawInfo', k, s).eligible.length >= 1);
  assert(/משה כהן/.test(W('gabbaiRebbe', k, s).text));
  console.log('gabbai settings OK');
}

// ---------- Minyan weekdays (ימי המניין): which days count and when registration is open ----------
{
  const envD = makeEnv(); const Q = envD.ctx; Q.setup();
  const k = envD.props.KIOSK_KEY, tz = 'Asia/Jerusalem';
  const W = (fn, ...a) => { Q.__webContext = true; try { return noDates(Q[fn](...a)); } finally { Q.__webContext = false; } };
  const s = W('kioskLogin', k, Q.gabbaiPin_()).token;
  // what a gabbai may write in the sheet
  const P = v => Q.parseDays_(v) && Array.from(Q.parseDays_(v));
  assert.deepEqual(P('א ב ג ד ה'), [0, 1, 2, 3, 4]); assert.deepEqual(P('א-ה'), [0, 1, 2, 3, 4]);
  assert.deepEqual(P('א׳–ה׳'), [0, 1, 2, 3, 4]); assert.deepEqual(P('א,ג, ו'), [0, 2, 5]);
  assert.equal(Q.parseDays_(''), null); assert.equal(Q.parseDays_('ש'), null, 'Shabbat is never a minyan day');
  assert.equal(Q.daysLabel_([0, 1, 2, 3, 4, 5]), 'א׳–ו׳'); assert.equal(Q.daysLabel_([0, 2]), 'א׳, ג׳');
  // default: Sunday to Friday, written in the sheet
  const sh = envD.ss.getSheetByName('הגדרות');
  const row = sh.data.findIndex(x => x[0] === 'ימי המניין') + 1;
  assert(row > 0, 'the setting row exists'); assert.equal(sh.data[row - 1][1], 'א ב ג ד ה ו');
  assert.equal(row, sh.data.findIndex(x => x[0] === 'אחוז נוכחות מינימלי לדוח לרבי') + 2, 'added at the end');
  assert.deepEqual(Array.from(Q.readSettings_(envD.ss, tz).days), [0, 1, 2, 3, 4, 5]);
  Q.setup(); assert.equal(sh.data[row - 1][1], 'א ב ג ד ה ו', 'setup keeps the value');
  envD.userEdit('הגדרות', 'B' + row, 'garbage');
  assert.deepEqual(Array.from(Q.readSettings_(envD.ss, tz).days), [0, 1, 2, 3, 4, 5], 'unreadable → the default');
  // the tools screen
  let g = W('gabbaiSettings', k, s);
  assert.deepEqual(g.days, [0, 1, 2, 3, 4, 5]);
  const base = { name: g.name, from: 0, to: 24, start: Q.addDays_(g.today, -13), end: g.end, threshold: 50, rebbe: 25 };
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { days: [] })), /לפחות יום מניין אחד/);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { days: [6] })), /לפחות יום מניין אחד/, 'Shabbat is dropped');
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { days: [4, 0, 1, 2, 3] }));
  assert.deepEqual(g.days, [0, 1, 2, 3, 4]); assert.equal(sh.data[row - 1][1], 'א ב ג ד ה');
  g = W('gabbaiSaveSettings', k, s, base);
  assert.deepEqual(g.days, [0, 1, 2, 3, 4], 'left out → unchanged');
  // a Friday is not counted, and can't be registered or imported
  let fri = ''; for (let n = 1; n <= 7; n++) { const d = Q.addDays_(g.today, -n); if (Q.dow_(d) === 5) fri = d; }
  const st = Q.computeStats_(Q.loadCtx_(envD.ss), base.start, g.today);
  assert(st.days.length >= 8 && st.days.every(d => Q.dow_(d) <= 4), 'only Sunday–Thursday count: ' + st.days.join(','));
  W('kioskSubmit', k, { phone: '0521111111', first: 'משה', last: 'כהן', session: s, date: Q.addDays_(fri, -1) });
  const r = W('kioskSubmit', k, { phone: '0521111111', session: s, date: fri });
  assert.equal(r.ok, false); assert(/ביום זה אין מניין.*א׳–ה׳/.test(r.message), r.message);
  const imp = W('gabbaiParseImport', k, s, fri.slice(8, 10) + '.' + fri.slice(5, 7) + ': לוי', '');
  assert.equal(imp.dateInfo[fri].offDay, true); assert.deepEqual(imp.days, [0, 1, 2, 3, 4]);
  assert.equal(W('gabbaiQueueImport', k, s, imp.rows).rejected, 1);
  // today: closed when today isn't a minyan day
  const dw = Q.dow_(g.today);
  if (dw !== 6) {
    const others = [0, 1, 2, 3, 4, 5].filter(x => x !== dw);
    W('gabbaiSaveSettings', k, s, Object.assign({}, base, { days: others }));
    const init = W('kioskInit', k, '');
    assert.equal(init.minyanDay, false); assert.deepEqual(init.days, others);
    const self = W('kioskSubmit', k, { first: 'א', last: 'ב', device: 'mobile' });
    assert.equal(self.ok, false); assert(/^היום אין מניין/.test(self.message), self.message);
    W('gabbaiSaveSettings', k, s, Object.assign({}, base, { days: [dw] }));
    assert.equal(W('kioskInit', k, '').minyanDay, true);
  }
  console.log('minyan weekdays OK');
  // the gabbai's details for the QR sign (and the developer's)
  let ln = W('gabbaiLink', k, s);
  assert.deepEqual(ln.gabbai, { name: '', phone: '' }); assert.equal(ln.dev.name, 'אלכס וקסלר'); assert.equal(ln.name, g.name);
  assert.throws(() => W('gabbaiSaveSettings', k, s, Object.assign({}, base, { gabbaiPhone: '123' })), /טלפון הגבאי אינו תקין/);
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { gabbaiName: ' ישראל  ישראלי ', gabbaiPhone: '0501112233' }));
  assert.equal(g.gabbaiName, 'ישראל ישראלי'); assert.equal(g.gabbaiPhone, '050-1112233');
  const gRow = label => sh.data.find(x => x[0] === label);
  assert.equal(gRow('טלפון הגבאי')[1], '050-1112233', 'kept as text');
  assert(sh.data.findIndex(x => x[0] === 'טלפון הגבאי') > sh.data.findIndex(x => x[0] === 'ימי המניין'), 'new rows at the end');
  ln = W('gabbaiLink', k, s);
  assert.deepEqual(ln.gabbai, { name: 'ישראל ישראלי', phone: '050-1112233' });
  g = W('gabbaiSaveSettings', k, s, base);
  assert.equal(g.gabbaiPhone, '050-1112233', 'left out → unchanged');
  envD.userEdit('הגדרות', 'B' + (sh.data.findIndex(x => x[0] === 'טלפון הגבאי') + 1), 501112233);   // Sheets made it a number
  assert.equal(Q.readSettings_(envD.ss, tz).gabbaiPhone, '050-1112233');
  g = W('gabbaiSaveSettings', k, s, Object.assign({}, base, { gabbaiName: '', gabbaiPhone: '' }));
  assert.equal(g.gabbaiName, ''); assert.equal(g.gabbaiPhone, '');
  console.log('gabbai details OK');
}

// ---------- A copy made from the template: own key, own gabbai code, address pasted once ----------
{
  // the template: code only, never set up — a copy opens with a pointer to the first step
  const envC = makeEnv(); const Q = envC.ctx;
  Q.onOpen();
  assert(envC.log.some(l => l[0] === 'toast' && /הגדרה ראשונית/.test(l[1])), 'a fresh copy points to setup');
  // what the web-app address may look like when pasted
  assert.equal(Q.parseWebUrl_(' https://script.google.com/macros/s/AKfycbEXAMPLE_example-123/exec?usp=sharing '), 'https://script.google.com/macros/s/AKfycbEXAMPLE_example-123/exec');
  assert.equal(Q.parseWebUrl_('https://script.google.com/a/macros/example.org/s/AKfycbEXAMPLE_example-123/exec'), 'https://script.google.com/a/macros/example.org/s/AKfycbEXAMPLE_example-123/exec');
  assert.equal(Q.parseWebUrl_('AKfycbEXAMPLE_example-123'), 'https://script.google.com/macros/s/AKfycbEXAMPLE_example-123/exec');
  assert.equal(Q.parseWebUrl_('https://docs.google.com/spreadsheets/d/x/edit'), '');
  assert.equal(Q.parseWebUrl_(''), '');
  // setup in the copy, then the address: not known yet → setup says how to publish; the link asks for it
  Q.setup();
  assert(/פריסה חדשה/.test(envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'setup explains how to publish');
  assert(/קוד הגבאי הראשוני: \d{6}/.test(envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'the new code is shown once');
  assert(/כתובת דף הרישום \(הדבקה\)/.test(envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'setup says where to paste');
  envC.ui.nextPromptButton = 'CANCEL'; Q.menuKioskLink();
  assert(!envC.log.some(l => l[0] === 'dialog'), 'cancelled: no link');
  envC.ui.nextPromptButton = 'OK'; envC.ui.nextPrompt = 'not an address'; Q.menuKioskLink();
  assert(/אינה תקינה/.test(envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  envC.ui.nextPrompt = 'https://script.google.com/macros/s/AKfycbCOPY_example_0001/exec';
  Q.menuKioskLink();
  assert(envC.log.some(l => l[0] === 'dialog'), 'the link dialog opens after pasting');
  const key1 = Q.kioskKey_(), pin1 = Q.gabbaiPin_();
  assert.equal(Q.kioskLink_(Q.readSettings_(envC.ss, 'Asia/Jerusalem')), 'https://script.google.com/macros/s/AKfycbCOPY_example_0001/exec?k=' + key1);
  const n = envC.log.length; Q.menuKioskLink();
  assert(!envC.log.slice(n).some(l => l[0] === 'prompt'), 'asked only once');
  envC.ui.nextPrompt = 'https://script.google.com/macros/s/AKfycbCOPY_example_0002/exec'; Q.menuWebUrl();
  assert(/AKfycbCOPY_example_0002\/exec\?k=/.test(envC.ui.lastDialog), 'the address can be replaced');
  envC.ui.nextPrompt = 'https://script.google.com/macros/s/AKfycbCOPY_example_0001/exec'; Q.menuWebUrl();
  Q.setup();
  assert.equal(Q.kioskKey_(), key1, 'setup again: same key'); assert.equal(Q.gabbaiPin_(), pin1, 'same code');
  assert(/קישור לדף הרישום/.test(envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  // this Sheet copied again (hidden values copied along): the copy gets everything new
  envC.ss.id = 'ss-copy';
  Q.setup();
  const last = envC.log.filter(l => l[0] === 'alert').slice(-1)[0][1];
  assert(/זהו עותק/.test(last), last);
  assert.notEqual(Q.kioskKey_(), key1, 'a new page key'); assert.notEqual(Q.gabbaiPin_(), pin1, 'a new gabbai code');
  assert.equal(envC.props.WEB_URL, undefined, "the original's address is not used");
  assert(/פריסה חדשה/.test(last), 'and is told to publish its own page');
  // the original's old link doesn't open the copy's page
  const bad = Q.doGet({ parameter: { k: key1 } }).html;
  assert(!bad.includes('kioskSubmit') && bad === Q.doGet({ parameter: { k: 'x' } }).html, "the original's key opens only the bad-link page");
  console.log('template copies OK');
}

// ---------- Notifications to the maintainer (Notify.gs → ntfy) ----------
{
  // without Maintainer.gs (the template, its copies before deploy-all): nothing is sent
  const env0 = makeEnv(); env0.ctx.setup();
  assert.equal(env0.ctx.reportError_('x', 'TypeError: boom'), false); env0.ctx.dailyCheck();
  assert.equal(env0.sent.length, 0, 'no channel, no messages');
  assert.equal(env0.triggers.filter(t => t.getHandlerFunction() === 'dailyCheck').length, 1, 'the daily check is set up anyway');

  const envN = makeEnv({ maintainer: { ntfyServer: 'https://ntfy.example', ntfyTopic: 'test-topic-0001', minyan: 'shulA' } }); const N = envN.ctx;
  N.setup();
  const k = envN.props.KIOSK_KEY, tz = 'Asia/Jerusalem', today = N.todayKey_(tz);
  // setup: one daily trigger, at 22, also when run again
  N.setup();
  const daily = envN.triggers.filter(t => t.getHandlerFunction() === 'dailyCheck');
  assert.equal(daily.length, 1); assert.equal(daily[0].spec.hour, 22); assert.equal(daily[0].spec.days, 1);
  assert(envN.log.some(l => l[0] === 'alert' && /בדיקה יומית/.test(l[1])), 'setup says so (first time)');
  // an unexpected error from a page: sent at once, with the minyan's name; the same one not again within the hour
  assert.equal(N.clientError('wrong-key', { kind: 'page', message: 'x' }), false, 'only with the page key');
  assert.equal(N.clientError(k, { kind: 'call', page: 'kiosk', where: 'kioskSubmit', message: 'TypeError: Cannot read properties of undefined (reading \'id\')' }), true);
  assert.equal(envN.sent.length, 1);
  const m = envN.sent[0];
  assert.equal(m.url, 'https://ntfy.example'); assert.equal(m.body.topic, 'test-topic-0001');
  assert(/^⚠ shulA · מניין שחרית$/.test(m.body.title), m.body.title); assert.deepEqual(m.body.tags, ['synagogue', 'shulA']);
  assert(/\nחשבון: minyan-owner@example\.com$/.test(m.body.message), 'which Google account: ' + m.body.message); assert(/kiosk · kioskSubmit: TypeError/.test(m.body.message), m.body.message);
  assert.equal(m.body.priority, 4); assert(/spreadsheets\/d\//.test(m.body.click), 'opens the Sheet');
  N.clientError(k, { kind: 'call', page: 'kiosk', where: 'kioskSubmit', message: 'TypeError: Cannot read properties of undefined (reading \'id\')' });
  assert.equal(envN.sent.length, 1, 'once an hour');
  // the app's own Hebrew messages are not errors; a page script error always is (with the admin token too)
  assert.equal(N.clientError(k, { kind: 'call', where: 'kioskLogin', message: 'קוד שגוי' }), false);
  assert.equal(N.clientError(N.adminToken_(), { kind: 'page', page: 'admin', where: 'main.js:12', message: 'ReferenceError: x is not defined' }), true);
  // no personal data: long numbers masked
  N.reportError_('kioskSubmit', 'failed for 052-123-4567 at 31.9857703,34.8582831');
  const last = envN.sent[envN.sent.length - 1].body.message;
  assert(!/123-4567|9857703|8582831/.test(last), last);
  // the page failing to build
  const real = N.doGet_; N.doGet_ = () => { throw new Error('Exception: Service Spreadsheets failed'); };
  assert.throws(() => N.doGet({ parameter: { k: k } }), /Service Spreadsheets failed/);
  N.doGet_ = real;
  assert(/doGet: Exception: Service Spreadsheets failed/.test(envN.sent[envN.sent.length - 1].body.message));
  // ntfy down: nothing breaks
  envN.ntfy.status = 500; assert.equal(N.reportError_('x', 'Error: another'), false); envN.ntfy.status = 200;

  // the daily check: nothing to say → nothing sent
  const sh = envN.ss.getSheetByName('הגדרות');
  const row = label => sh.data.findIndex(x => x[0] === label) + 1;
  const setRow = (label, v) => envN.userEdit('הגדרות', 'B' + row(label), v);
  envN.props.WEB_URL = 'https://script.google.com/macros/s/AKfycbNOTIFY_example/exec';
  setRow('תחילת התקופה', N.keyToDate_(today, tz)); setRow('סוף התקופה', N.keyToDate_(N.addDays_(today, 20), tz));
  let n0 = envN.sent.length;
  N.dailyCheck(); assert.equal(envN.sent.length, n0, 'all well: no message');
  // a second trigger (setup run from another account) the same day does nothing
  delete envN.props.WEB_URL; N.dailyCheck(); assert.equal(envN.sent.length, n0, 'once a day');
  // problems: no address; the period ends in 7 days; nobody registered on the last 3 minyan days
  delete envN.props.DAILY_CHECK;
  setRow('תחילת התקופה', N.keyToDate_(N.addDays_(today, -14), tz)); setRow('סוף התקופה', N.keyToDate_(N.addDays_(today, 7), tz));
  N.dailyCheck();
  const d = envN.sent[envN.sent.length - 1].body;
  assert.equal(d.title, 'בדיקה יומית · shulA · מניין שחרית'); assert.equal(d.priority, 3);
  assert(/כתובת דף הרישום לא הוגדרה/.test(d.message), d.message);
  assert(/התקופה מסתיימת ב-.* \(עוד 7 ימים\)/.test(d.message), d.message);
  assert(/אין אף רישום ב-3 ימי המניין האחרונים/.test(d.message), d.message);
  // one registration yesterday-ish (a minyan day) → no "no registrations" line
  let lastDay = N.addDays_(today, -1); while (!N.isMinyanDay_(N.readSettings_(envN.ss, tz), lastDay)) lastDay = N.addDays_(lastDay, -1);
  const sess = N.kioskLogin(k, N.gabbaiPin_()).token;
  N.kioskSubmit(k, { phone: '0521111111', first: 'משה', last: 'כהן', session: sess, date: lastDay });
  assert.deepEqual(N.dailyProblems_(envN.ss, today).filter(x => /אין אף רישום/.test(x)), []);
  // the period ended yesterday → said (for 3 days), then quiet
  setRow('סוף התקופה', N.keyToDate_(N.addDays_(today, -1), tz));
  assert(N.dailyProblems_(envN.ss, today).some(x => /התקופה הסתיימה/.test(x)));
  setRow('סוף התקופה', N.keyToDate_(N.addDays_(today, -10), tz));
  assert(!N.dailyProblems_(envN.ss, today).some(x => /התקופה הסתיימה/.test(x)));
  // the test alert from the menu
  let before = envN.sent.length; N.menuTestAlert();
  assert.equal(envN.sent.length, before + 1); assert(/^בדיקה · shulA/.test(envN.sent[envN.sent.length - 1].body.title));
  assert(/נשלחה/.test(envN.log.filter(l => l[0] === 'alert').slice(-1)[0][1]));
  env0.ctx.menuTestAlert(); assert(/אינן מופעלות/.test(env0.log.filter(l => l[0] === 'alert').slice(-1)[0][1]), 'no channel: says so');
  // the minyan's Google account: recorded by setup in its own row, read-only, put back after a manual change
  const acc = row('חשבון Google של המניין');
  assert(acc > row('טלפון הגבאי'), 'at the end'); assert.equal(sh.data[acc - 1][1], 'minyan-owner@example.com');
  const locks = sh.getProtections('RANGE').filter(p => p.getDescription() === 'חשבון Google של המניין — נרשם אוטומטית');
  assert.equal(locks.length, 1); assert.equal(locks[0].p.row, acc); assert.equal(locks[0].p.col, 2); assert.equal(locks[0].p.warningOnly, true);
  envN.userEdit('הגדרות', 'B' + acc, 'someone@example.com');
  assert.equal(sh.data[acc - 1][1], 'minyan-owner@example.com', 'a manual change is put back');
  envN.userEdit('הגדרות', 'B' + row('שם הגבאי'), 'ישראל'); assert.equal(sh.data[row('שם הגבאי') - 1][1], 'ישראל', 'other rows stay editable');
  N.setup(); assert.equal(sh.getProtections('RANGE').filter(p => p.getDescription() === 'חשבון Google של המניין — נרשם אוטומטית').length, 1, 'one protection, also after setup again');
  console.log('notifications OK');
}

console.log('\nALL OK');
