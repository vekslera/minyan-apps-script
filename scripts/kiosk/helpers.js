// Registration page — small helpers: server calls, phone, session storage.
// normPhone_/validPhone_ come from the server (sharedJs_ in Utils.gs).
// Declarations only — nothing runs when the file loads; the page calls the start function.

function call(fn, args, ok, fail) {
  var r = google.script.run.withSuccessHandler(ok).withFailureHandler(fail || function (e) { setBusy(false); showMsg(errText(e)); });
  r[fn].apply(r, args);
}
function errText(e) { return (e && e.message) ? e.message : 'אירעה תקלה, נסו שוב'; }
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function normPhone(v) { return normPhone_(v); }   // shared with the server (Matching.gs)
function store(name, val) { try { if (val == null) sessionStorage.removeItem(name); else sessionStorage.setItem(name, val); } catch (e) {} }
function load(name) { try { return sessionStorage.getItem(name); } catch (e) { return null; } }
