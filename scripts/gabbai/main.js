// Gabbai tools page — state, login/logout, navigation. GabbaiPage.html calls startGabbai().
// The import and review screens are the same code as the Sheet dialog (scripts/admin/*.js); API in the page
// sends their calls to the gabbai* server functions (Gabbai.gs) with the key and the session.
// Declarations only — nothing runs when the file loads; the page calls the start function.

var S = { view: '', session: '', info: null, seen: 0,
          imp: null, groups: [], people: [], byId: {}, dec: {}, errors: {}, busy: false,   // import/review
          dups: [], drawArmed: false };
var IDLE_MS = 30 * 60 * 1000;
var TITLES = { login: 'כלי גבאי', home: 'כלי גבאי', review: 'רישומים לבדיקה', import: 'ייבוא מוואטסאפ',
               weekly: 'דוח שבועי', final: 'סיכום התקופה', draw: 'הגרלה', dups: 'כפילויות',
               link: 'קישור לדף הרישום', shul: 'מיקום בית הכנסת', settings: 'הגדרות', pin: 'שינוי קוד גבאי' };
var NOTES = { login: 'loginNote', home: 'homeNote', review: 'revNote', import: 'importNote', weekly: 'weeklyNote',
              final: 'finalNote', draw: 'drawNote', dups: 'dupsNote', link: 'linkNote', shul: 'shulNote', settings: 'settingsNote', pin: 'pinNote' };

function store(name, val) { try { if (val == null) sessionStorage.removeItem(name); else sessionStorage.setItem(name, val); } catch (e) {} }
function load(name) { try { return sessionStorage.getItem(name); } catch (e) { return null; } }

/** A button waits for the server; callFailed() releases every waiting button. */
function wait(id) { var b = $(id); b.disabled = true; b.setAttribute('data-wait', '1'); }
function unwait() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-wait]'), function (b) { b.disabled = false; b.removeAttribute('data-wait'); });
}

/** Every failed server call ends here (scripts/admin/helpers.js calls it too). */
function callFailed(e) {
  unwait();
  var msg = errText(e);
  if (msg.indexOf('כניסה מחדש') >= 0) return loggedOut('ההתחברות הסתיימה — יש להיכנס שוב.');
  flash(NOTES[S.view] || 'homeNote', 'err', msg);
}

function go(v) {
  if (v !== 'login' && !S.session) v = 'login';
  S.view = v;
  S.seen = Date.now();
  Object.keys(TITLES).forEach(function (k) { show('v-' + k, k === v); });
  Object.keys(NOTES).forEach(function (k) { if (k !== 'review' && k !== v) flash(NOTES[k], '', ''); });
  $('title').textContent = TITLES[v];
  show('back', v !== 'home' && v !== 'login');
  show('logout', v !== 'login');
  show('bar', false);
  window.scrollTo(0, 0);
  if (v === 'home') refreshHome();
  else if (v === 'review') loadReview();
  else if (v === 'import') renderImportBar();
  else if (v === 'weekly') openWeekly();
  else if (v === 'final') openFinal();
  else if (v === 'draw') loadDraw();
  else if (v === 'dups') loadDups();
  else if (v === 'link') loadLink();
  else if (v === 'shul') loadShul();
  else if (v === 'settings') loadSettings();
  else if (v === 'pin') openPin();
  else if (v === 'login') { $('pin').value = ''; setTimeout(function () { $('pin').focus(); }, 50); }
}

function refreshHome() {
  if (S.info && Date.now() - S.info.at < 3000) return;          // just loaded
  google.script.run.withSuccessHandler(function (info) {
    if (!info.session) return loggedOut('');
    setInfo(info);
  }).withFailureHandler(callFailed).gabbaiInit(KEY, S.session);
}
function setInfo(info) {
  S.info = info; info.at = Date.now();
  $('sub').textContent = info.name || '';
  $('cnt').textContent = info.pending; show('cnt', info.pending > 0);
  $('period').textContent = info.period ? '· תקופה: ' + info.period.start + ' – ' + info.period.end + ' · הגרלה מ-' + info.period.threshold + '%' : '';
}

function login() {
  var pin = $('pin').value.trim();
  if (!pin) return;
  wait('loginBtn');
  google.script.run.withSuccessHandler(function (r) {
    unwait();
    S.session = r.token; store('minyanSession', r.token);
    go('home');
    if (r.weakCode) flash('homeNote', 'err', 'מומלץ להחליף לקוד ארוך יותר (לפחות 6 תווים) — "שינוי קוד גבאי".');
  }).withFailureHandler(function (e) { unwait(); flash('loginNote', 'err', errText(e)); }).kioskLogin(KEY, pin);
}
function logout() {
  if (S.session) google.script.run.withFailureHandler(function () {}).kioskLogout(KEY, S.session);
  loggedOut('יצאת מכלי הגבאי.');
}
function loggedOut(note) {
  S.session = ''; store('minyanSession', null);
  S.dec = {}; S.imp = null; S.groups = []; S.people = [];
  $('waText').value = ''; $('preview').innerHTML = ''; $('groups').innerHTML = '';
  go('login');
  if (note) flash('loginNote', 'ok', note);
}
/** Called every minute: log out after 30 minutes without activity (the server ends the session too). */
function idleCheck() { if (S.session && Date.now() - S.seen > IDLE_MS) logout(); }

function startGabbai() {
  $('loginBtn').onclick = login;
  $('pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });
  $('back').onclick = function () { go('home'); };
  $('logout').onclick = logout;
  Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (t) { t.onclick = function () { go(t.getAttribute('data-go')); }; });
  Array.prototype.forEach.call(document.querySelectorAll('a.toKiosk'), function (a) { if (HOME_URL) a.href = HOME_URL; else a.hidden = true; });
  $('parseBtn').onclick = parseImport;
  $('confirmAll').onclick = confirmCertainMatches;
  $('weeklyBtn').onclick = runWeekly;
  $('finalBtn').onclick = runFinal;
  $('pinSave').onclick = savePin;
  $('shulTest').onclick = testShulDistance;
  $('shulMeasure').onclick = measureShul;
  $('shulSet').onclick = setShul;
  $('shulRadiusSave').onclick = saveShulRadius;
  $('setSave').onclick = saveSettings;
  $('noMinyanAdd').onclick = addNoMinyan;
  ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { S.seen = Date.now(); }, true); });
  setInterval(idleCheck, 60 * 1000);

  // A session from the registration page's gabbai mode (same browser tab) is used as it is.
  S.session = load('minyanSession') || '';
  if (!S.session) return go('login');
  google.script.run.withSuccessHandler(function (info) {
    if (!info.session) return loggedOut('');
    setInfo(info);
    go('home');
  }).withFailureHandler(function (e) { S.session = ''; go('login'); flash('loginNote', 'err', errText(e)); }).gabbaiInit(KEY, S.session);
}
