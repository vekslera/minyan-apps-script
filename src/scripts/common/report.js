// Shared by the pages — tells the maintainer about a problem nobody caused on purpose (Notify.gs → an email):
// a server call that failed with a non-Hebrew error, or a script error on the page itself.
// The app's own Hebrew messages (wrong code, closed hours …) are not reported. Each message once per page load.
// Declarations only — nothing runs when the file loads.

var REPORTED = {};

/** kind: 'call' (a failed server call; where = the function) or 'page' (window.onerror; where = file:line). */
function reportProblem(kind, where, error) {
  try {
    var msg = String(error && error.message ? error.message : (error || ''));
    if (kind !== 'page' && /[א-ת]/.test(msg)) return;   // the app's own message to the user
    var id = kind + '|' + where + '|' + msg;
    if (REPORTED[id]) return;
    REPORTED[id] = 1;
    var auth = typeof KEY !== 'undefined' && KEY ? KEY : (typeof TOKEN !== 'undefined' ? TOKEN : '');
    var page = typeof API !== 'undefined' ? API.prefix : 'kiosk';
    google.script.run.withFailureHandler(function () {}).clientError(auth, { kind: kind, page: page, where: String(where || ''), message: msg });
  } catch (e) {}
}
