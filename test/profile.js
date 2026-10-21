// Counts Google-service calls and CPU time per entry point, on a realistic month of data.
// Each service call costs roughly 30–150 ms on Google's servers; CPU there is ~3–5x slower than here.
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx;
const counts = {}; let on = false;
const wrap = (obj, name, label) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function (...a) { if (on) counts[label] = (counts[label] || 0) + 1; return f.apply(this, a); }; };
const proto = o => Object.getPrototypeOf(o);
G.setup();
const ss = env.ss, sh0 = ss.getSheetByName('אנשים'), rg0 = sh0.getRange(1, 1);
for (const m of Object.getOwnPropertyNames(proto(rg0))) if (m !== 'constructor') wrap(proto(rg0), m, 'Range.' + m);
for (const m of Object.getOwnPropertyNames(proto(sh0))) if (!['constructor', 'set'].includes(m)) wrap(proto(sh0), m, 'Sheet.' + m);
['getSheetByName', 'insertSheet', 'getSheets', 'getSpreadsheetTimeZone'].forEach(m => wrap(ss, m, 'SS.' + m));
const dp = G.PropertiesService.getDocumentProperties;
G.PropertiesService.getDocumentProperties = () => { if (on) counts['Properties'] = (counts['Properties'] || 0) + 1; return dp(); };
const st = ss.getSheetByName('הגדרות');
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const today = G.todayKey_('Asia/Jerusalem');
env.userEdit('הגדרות', 'B3', G.keyToDate_(G.addDays_(today, -30), 'Asia/Jerusalem'));
const key = env.props.KIOSK_KEY, tok = env.props.ADMIN_TOKEN, pin = String(st.getRange('B8').getValue());
const sess = G.kioskLogin(key, pin).token;
const LAST = ['כהן','לוי','פרידמן','גולדשטיין','רבינוביץ','שניאורסון','מזרחי','ביטון','אברגל','קאופמן','מרגולין','הניג','ברנדלר','אנגלמן','טלוצינסקי','ריבקין','חימי','מנדלסון','קוביטשעק','ציקושווילי','בקשי','קטאשווילי','מיכלשווילי','בן דוד','שוורץ','וייס','קליין','רוזנברג','גרינברג','הורוביץ'];
const FIRST = ['משה','יוסף','דוד','אברהם','יצחק','יעקב','מנחם','שמואל','חיים','לוי'];
const people = [];
for (let i = 0; i < 60; i++) people.push({ first: FIRST[i % 10], last: LAST[(i * 7) % 30], phone: '05' + String(20000000 + i * 1234567).slice(0, 8) });
const days = []; for (let n = 1; n <= 30; n++) { const d = G.addDays_(today, -n); if (G.dow_(d) !== 6) days.push(d); }
people.forEach((p, i) => G.kioskSubmit(key, { phone: p.phone, first: p.first, last: p.last, session: sess, date: days[0] }));
days.slice(1).forEach((d, j) => people.forEach((p, i) => { if ((i + j) % 4) G.kioskSubmit(key, { phone: p.phone, session: sess, date: d }); }));
const wa = days.slice(0, 5).map(d => d.slice(8, 10) + '/' + d.slice(5, 7) + '\n' + people.slice(0, 25).map(p => p.last).join('\n')).join('\n') + '\nרבינוביץ חדש\nשמעון חדשי';
G.adminQueueImport(tok, G.adminParseImport(tok, wa, '').rows);
console.log('data: people', ss.getSheetByName('אנשים').getLastRow() - 1, '| attendance rows', ss.getSheetByName('נוכחות').getLastRow() - 1,
            '| pending', ss.getSheetByName('לבדיקה').getLastRow() - 1);

function prof(label, fn) {
  Object.keys(counts).forEach(k => delete counts[k]);
  on = true; const t = process.hrtime.bigint(); let r;
  try { G.__webContext = label.startsWith('kiosk'); r = fn(); } finally { on = false; G.__webContext = false; }
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + '×' + v).join(' ');
  console.log(label.padEnd(26), 'calls', String(total).padStart(4), '| cpu', ms.toFixed(0).padStart(5), 'ms |', top);
  return r;
}
env.ui.nextPrompt = ''; env.ui.nextAlert = 'NO';
prof('kioskInit', () => G.kioskInit(key));
prof('kioskLookup (name)', () => G.kioskLookup(key, { last: 'כה' }));
prof('kioskLookup (phone)', () => G.kioskLookup(key, { phone: people[3].phone }));
prof('kioskSubmit (known phone)', () => G.kioskSubmit(key, { phone: people[5].phone, device: 'tablet' }));
prof('kioskSubmit (new person)', () => G.kioskSubmit(key, { phone: '0587777777', first: 'נחום', last: 'זילברמן', device: 'tablet' }));
prof('doGet', () => G.doGet({ parameter: { k: key } }));
const pend = prof('adminGetPending', () => G.adminGetPending(tok));
prof('adminResolve (all auto)', () => G.adminResolve(tok, pend.groups.filter(g => g.decision === 'auto').map(g => ({ gid: g.gid, ids: g.ids, action: 'person', personId: g.bestId }))));
prof('adminParseImport', () => G.adminParseImport(tok, wa, ''));
prof('menuWeekly', () => G.menuWeekly());
prof('menuFinal', () => G.menuFinal());
prof('menuDraw', () => G.menuDraw());
prof('menuFindDuplicates', () => G.menuFindDuplicates());
prof('menuKioskLink', () => G.menuKioskLink());
