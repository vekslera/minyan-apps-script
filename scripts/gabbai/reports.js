// Gabbai tools page — weekly report and final summary: the sheet is written on the server, the page shows
// the WhatsApp text with copy and share buttons.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function openWeekly() {
  var today = S.info ? S.info.today : '';
  if (!$('weekEnd').value) $('weekEnd').value = today;
  $('weekEnd').max = today;
}
function runWeekly() {
  wait('weeklyBtn');
  $('weeklyOut').innerHTML = '';
  call('Weekly', [$('weekEnd').value], function (r) { unwait(); showReport('weeklyOut', r); });
}

function openFinal() {
  var p = S.info && S.info.period;
  $('finalLead').textContent = p ? 'התקופה: ' + p.start + ' – ' + p.end + '. בהגרלה משתתפים מי שהגיעו ל-' + p.threshold + '% מימי המניין ומעלה.'
                                 : 'תחילת וסוף התקופה עדיין לא מולאו בגיליון "הגדרות".';
  $('finalBtn').disabled = !p;
}
function runFinal() {
  wait('finalBtn');
  $('finalOut').innerHTML = '';
  call('Final', [], function (r) { unwait(); showReport('finalOut', r); });
}

function openRebbe() {
  var p = S.info && S.info.period;
  $('rebbeLead').textContent = p ? 'התקופה: ' + p.start + ' – ' + p.end + '. נכללים מי שהגיעו ל-' + p.rebbe + '% מימי המניין ומעלה, לפי שם משפחה.'
                                 : 'תחילת וסוף התקופה עדיין לא מולאו בגיליון "הגדרות".';
  $('rebbeBtn').disabled = !p;
}
function runRebbe() {
  wait('rebbeBtn');
  $('rebbeOut').innerHTML = '';
  call('Rebbe', [], function (r) { unwait(); showReport('rebbeOut', r); });
}

/** r = {text, sheet?, days, missing[], pending, …} */
function showReport(box, r) {
  var h = '';
  if (r.missing && r.missing.length) h += '<div class="warn">אין אף רישום בימים: ' + esc(r.missing.join(', ')) + ' — אולי צריך לייבא מוואטסאפ?</div>';
  if (r.pending) h += '<div class="warn">' + r.pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו.</div>';
  h += '<p class="g-meta">' + (r.sheet ? 'הטבלה המלאה נשמרה בגיליון "' + esc(r.sheet) + '". ' : '') + 'אפשר לערוך את הטקסט לפני השליחה.</p>' +
       '<textarea class="out" id="' + box + 'Text">' + esc(r.text) + '</textarea>' +
       '<div class="actions"><button class="btn primary" type="button" id="' + box + 'Copy">העתקה</button>' +
       '<a class="btn" id="' + box + 'Wa" target="_blank" rel="noopener">שליחה בוואטסאפ</a></div>';
  $(box).innerHTML = h;
  var t = $(box + 'Text'), wa = $(box + 'Wa');
  function link() { wa.href = 'https://wa.me/?text=' + encodeURIComponent(t.value); }
  link();
  t.addEventListener('input', link);
  $(box + 'Copy').onclick = function () { copyText(t.value, this, t); };
}
