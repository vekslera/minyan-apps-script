// Import/review dialog — server calls, messages, dates, phones.
// normPhone_/validPhone_ come from the server (sharedJs_ in Utils.gs).
// Declarations only — nothing runs when the file loads; the page calls the start function.

function call(fn, args, ok) {
  var r = google.script.run.withSuccessHandler(ok).withFailureHandler(function (e) { busy(false); flash(S.view === 'import' ? 'importNote' : 'revNote', 'err', (e && e.message) || 'אירעה תקלה'); });
  r[fn].apply(r, args);
}
function flash(id, kind, text) { $(id).innerHTML = text ? '<div class="note ' + kind + '">' + esc(text) + '</div>' : ''; }
function busy(on) { S.busy = on; $('barBtn').disabled = on; }
var DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
function dow(k) { return new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10))).getUTCDay(); }
function dlabel(k) { return k ? DOW[dow(k)] + ' ' + k.slice(8, 10) + '/' + k.slice(5, 7) : ''; }
function normPhone(v) { return normPhone_(v); }   // shared with the server (Matching.gs)
function phoneOk(v) { var p = normPhone(v); return !p || validPhone_(p); }
