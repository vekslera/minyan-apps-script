// Gabbai tools page — lottery: who takes part, then one draw (logged in the הגרלות sheet).
// Declarations only — nothing runs when the file loads; the page calls the start function.

function loadDraw() {
  S.drawArmed = false;
  $('drawBox').innerHTML = '<div class="empty">טוען…</div>';
  call('DrawInfo', [], renderDraw);
}
function renderDraw(info) {
  var n = info.eligible.length;
  var h = '<p class="lead">התקופה: ' + esc(info.start) + ' – ' + esc(info.end) + ' · ' + info.days + ' ימי מניין · ' +
          'בהגרלה מי שהגיעו ל-' + info.threshold + '% ומעלה.</p>';
  if (info.pending) h += '<div class="warn">' + info.pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו — כדאי לטפל בהם לפני ההגרלה.</div>';
  if (info.last) h += '<div class="warn">ההגרלה האחרונה: ' + esc(info.last.when) + ' — ' + esc(info.last.name) + '. הגרלה נוספת תירשם בנפרד.</div>';
  if (!n) {
    $('drawBox').innerHTML = h + '<div class="empty">עדיין אין מי שהגיע ל-' + info.threshold + '% מימי המניין</div>';
    return;
  }
  h += '<b>' + n + ' משתתפים:</b><ol class="list">' +
       info.eligible.map(function (e) { return '<li>' + esc(e.name) + ' <span class="g-meta">(' + e.pct + '%)</span></li>'; }).join('') + '</ol>' +
       '<div class="actions"><button class="btn primary" id="drawBtn" type="button">הגרלה</button></div>';
  $('drawBox').innerHTML = h;
  $('drawBtn').onclick = draw;
}
/** Two taps: the first asks "are you sure", the second draws. */
function draw() {
  var b = $('drawBtn');
  if (!S.drawArmed) {
    S.drawArmed = true;
    b.textContent = 'בטוח? הקשה נוספת מגרילה';
    setTimeout(function () { if (S.drawArmed && $('drawBtn')) { S.drawArmed = false; $('drawBtn').textContent = 'הגרלה'; } }, 6000);
    return;
  }
  S.drawArmed = false;
  wait('drawBtn');
  call('Draw', [], function (w) {
    unwait();
    $('drawBox').innerHTML = '<div class="winner"><div class="g-meta">הזוכה</div><span class="who">' + esc(w.name) + '</span>' +
      '<div class="g-meta">' + w.pct + '% נוכחות · מתוך ' + w.among + ' משתתפים</div>' +
      '<p class="g-meta">ההגרלה נשמרה בגיליון "הגרלות".</p></div>';
  });
}
