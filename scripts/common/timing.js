// Shared by the pages — the timing panel, shown only when the link has "&debug=1": where each second goes
// (server page build, every server call with the server's own share, GPS, form ready, confirmation).
// The page's DEBUG_MS is '' (off) or the milliseconds the server spent building the page (on).
// Declarations only — nothing runs when the file loads; the page calls the start function.

var TIMING = { on: false, rows: [] };

function timingStart(debugMs) {
  TIMING.on = debugMs !== '' && debugMs != null && String(debugMs).indexOf('__') !== 0;
  if (!TIMING.on) return;
  var box = document.createElement('div');
  box.id = 'timing';
  box.setAttribute('dir', 'ltr');
  box.setAttribute('style', 'position:fixed;left:6px;bottom:6px;z-index:998;max-width:min(94vw,420px);max-height:45vh;overflow:auto;' +
    'background:rgba(255,255,255,.95);border:1px solid #999;border-radius:8px;padding:6px 8px;font:12px/1.4 monospace;color:#111;box-shadow:0 2px 8px rgba(0,0,0,.2)');
  box.innerHTML = '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><b style="flex:1">timing (ms)</b>' +
    '<button type="button" id="timingCopy" style="font:inherit">copy</button><button type="button" id="timingHide" style="font:inherit">hide</button></div>' +
    '<div id="timingRows"></div>';
  document.body.appendChild(box);
  document.getElementById('timingHide').onclick = function () { box.hidden = true; };
  document.getElementById('timingCopy').onclick = function () {
    var text = TIMING.rows.map(timingLine).join('\n');
    try { navigator.clipboard.writeText(text).then(function () { document.getElementById('timingCopy').textContent = 'copied'; }); } catch (e) {}
  };
  tmark('server built the page', Number(debugMs));
  tmark('page code running');
}

function tnow() { return Math.round(performance.now()); }
function timingLine(r) { return '+' + r.at + '  ' + r.label + (r.ms != null ? '  ' + r.ms + ' ms' : ''); }

/** A moment ("form ready"), or a duration when ms is given. Times are from the start of the page frame. */
function tmark(label, ms) {
  if (!TIMING.on) return;
  var r = { at: tnow(), label: label, ms: ms == null ? null : Math.round(ms) };
  TIMING.rows.push(r);
  var el = document.getElementById('timingRows');
  if (el) { var d = document.createElement('div'); d.textContent = timingLine(r); el.appendChild(d); el.parentNode.scrollTop = 1e6; }
}

/** Starts a clock; the returned function records "<label> N ms" (+ the server's share, if the result has _ms). */
function ttime(label) {
  var start = tnow();
  return function (result, note) {
    if (!TIMING.on) return;
    var server = result && typeof result === 'object' && result._ms != null ? ' (server ' + result._ms + ')' : '';
    tmark(label + server + (note ? ' — ' + note : ''), tnow() - start);
  };
}

/** Wraps a success handler of google.script.run so the call is timed. */
function timed(label, ok) {
  var done = ttime(label);
  return function (res) { done(res); if (ok) ok(res); };
}
