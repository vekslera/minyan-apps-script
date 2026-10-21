// Registration page — gabbai mode (code, date picker).
// Declarations only — nothing runs when the file loads; the page calls the start function.

// ---------- Gabbai mode ----------
// Logging in gives a session token (the code itself is not kept); it ends on "יציאה", after 30 minutes
// without activity, or when the code is changed. 3 wrong codes lock the login for 60 seconds.
var IDLE_MS = 30 * 60 * 1000;
function gabbaiUi(on) {
  show('gabbaiBar', on);
  show('gabbaiOn', !on);
  $('deviceLabel').textContent = on ? '' : (DEVICE_NAMES[DEVICE] || '');
  setupPersonalPhone();
  show('locTest', on && !!(S.info && S.info.locationCheck));
  // The gabbai tools page (same session in this browser tab). Empty while the web app address is unknown.
  show('toolsLink', on && !!TOOLS_URL);
  if (TOOLS_URL) $('toolsLink').href = TOOLS_URL;
  if (on) { $('date').value = S.info.today; $('date').max = S.info.today; }
}
function openPin() { $('pin').value = ''; show('pinMsg', false); show('pinDlg', true); $('pin').focus(); }
function checkPin() {
  var pin = $('pin').value.trim();
  if (!pin) return;
  $('pinOk').disabled = true;
  call('kioskLogin', [KEY, pin], function (r) {
    $('pinOk').disabled = false;
    S.session = r.token; store('minyanSession', r.token);
    gabbaiActive();
    show('pinDlg', false);
    gabbaiUi(true);
    reset();
    if (r.weakCode) showInfo('מומלץ להחליף לקוד ארוך יותר (לפחות 6 תווים) — בכלי הגבאי ← שינוי קוד.');
  }, function (e) { $('pinOk').disabled = false; $('pinMsg').textContent = errText(e); show('pinMsg', true); });
}
function exitGabbai(note) {
  if (S.session) call('kioskLogout', [KEY, S.session], function () {}, function () {});
  S.session = ''; store('minyanSession', null);
  gabbaiUi(false); reset();
  if (typeof note === 'string' && note) showInfo(note);
}
function gabbaiActive() { S.gabbaiSeen = Date.now(); }
/** Called every minute: leave gabbai mode after 30 minutes without activity. */
function gabbaiIdleCheck() {
  if (S.session && Date.now() - (S.gabbaiSeen || 0) > IDLE_MS) exitGabbai('יצאת ממצב גבאי אחרי 30 דקות ללא פעילות.');
}
/** A gabbai action failed because the session ended (expired, code changed): leave gabbai mode. */
function sessionEnded(e) {
  if (errText(e).indexOf('כניסה מחדש') < 0) return false;
  exitGabbai('ההתחברות למצב גבאי הסתיימה — יש להיכנס שוב.');
  return true;
}
