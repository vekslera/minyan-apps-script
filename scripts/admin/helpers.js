// Import and review screens — server calls, messages, dates, phones.
// Used by the Sheet dialog (AdminPage) and the gabbai tools page (GabbaiPage). Each page sets API:
// which server functions to call (adminX with the token, or gabbaiX with the key and session),
// and defines callFailed(e).
// normPhone_/validPhone_ come from the server (sharedJs_ in Utils.gs).
// Declarations only — nothing runs when the file loads; the page calls the start function.

/** call('GetPending', [], ok) → google.script.run.adminGetPending(TOKEN) or gabbaiGetPending(KEY, session). */
function call(fn, args, ok) {
  var done = ttime(API.prefix + fn);                          // the &debug=1 timing panel (no-op otherwise)
  var r = google.script.run.withSuccessHandler(function (res) { done(res); ok(res); })
                           .withFailureHandler(function (e) { done(null, 'failed'); busy(false); callFailed(e); });
  r[API.prefix + fn].apply(r, API.auth().concat(args));
}
function errText(e) { return (e && e.message) || 'אירעה תקלה'; }
function flash(id, kind, text) { $(id).innerHTML = text ? '<div class="note ' + kind + '">' + esc(text) + '</div>' : ''; }
function busy(on) { S.busy = on; if ($('barBtn')) $('barBtn').disabled = on; }
var DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
function dow(k) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))).getUTCDay(); }
function dlabel(k) { return k ? DOW[dow(k)] + ' ' + k.slice(8, 10) + '/' + k.slice(5, 7) : ''; }
function normPhone(v) { return normPhone_(v); }   // shared with the server (Matching.gs)
function phoneOk(v) { var p = normPhone(v); return !p || validPhone_(p); }
