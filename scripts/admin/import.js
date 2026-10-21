// Import and review screens (Sheet dialog and gabbai tools page) — WhatsApp import: parse, check dates, queue for review.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function parseImport() {
  var text = $('waText').value;
  if (!text.trim()) return flash('importNote', 'err', 'לא הודבק טקסט');
  flash('importNote', '', '');
  $('parseBtn').disabled = true;
  call('ParseImport', [text, $('defDate').value], function (res) {
    $('parseBtn').disabled = false;
    var groups = [], byDate = {};
    res.rows.forEach(function (r) {
      var k = r.date || '';
      if (!byDate[k]) { byDate[k] = { orig: k, date: k, names: [], off: false, shifted: false }; groups.push(byDate[k]); }
      if (r.shifted) byDate[k].shifted = true;
      byDate[k].names.push({ name: r.name, off: false });
    });
    S.imp = { groups: groups, today: res.today, info: res.dateInfo };
    renderImport();
  });
}

function groupIssue(g) {
  if (!g.date) return { level: 'e', text: 'חסר תאריך — בחרו תאריך' };
  if (g.date > S.imp.today) return { level: 'e', text: 'תאריך עתידי' };
  if (dow(g.date) === 6) return { level: 'e', text: 'שבת — תקנו את התאריך' };
  if (g.shifted && g.date === g.orig) return { level: 'w', text: 'ההודעה נשלחה בשבת/מוצאי שבת — נרשם ליום שישי. בדקו.' };
  var info = S.imp.info[g.date];
  if (info && info.noMinyan) return { level: 'w', text: 'מסומן כיום ללא מניין' };
  if (info && info.recorded) return { level: 'w', text: 'כבר יש ' + info.recorded + ' רישומים לתאריך זה (כפולים לא ייספרו פעמיים)' };
  return null;
}
function renderImport() {
  var imp = S.imp, box = $('preview');
  if (!imp.groups.length) { box.innerHTML = '<div class="empty">לא נמצאו שמות בטקסט</div>'; renderImportBar(); return; }
  var h = '<table class="imp"><tr class="hdr"><th style="width:150px">תאריך</th><th style="width:60px">שמות</th><th>שמות שנמצאו (× להסרה)</th><th style="width:210px">הערה</th><th style="width:70px">לייבא?</th></tr>';
  imp.groups.forEach(function (g, gi) {
    var n = g.names.filter(function (x) { return !x.off; }).length, iss = groupIssue(g);
    h += '<tr class="' + (g.off ? 'off' : '') + '"><td><input type="date" data-g="' + gi + '" class="gdate" value="' + esc(g.date) + '"> ' +
         '<div class="g-meta">' + esc(dlabel(g.date)) + '</div></td><td data-l="מספר שמות">' + n + '</td><td>';
    g.names.forEach(function (x, ni) {
      if (!x.off) h += '<span class="nm">' + esc(x.name) + '<button type="button" title="הסרה" data-g="' + gi + '" data-n="' + ni + '" class="rm">×</button></span>';
    });
    h += '</td><td' + (iss ? ' data-l="הערה"' : '') + '>' + (iss ? '<span class="' + iss.level + '">' + esc(iss.text) + '</span>' : '') + '</td>' +
         '<td data-l="לייבא?"><input type="checkbox" class="gon" data-g="' + gi + '"' + (g.off ? '' : ' checked') + '></td></tr>';
  });
  box.innerHTML = h + '</table>';
  Array.prototype.forEach.call(box.querySelectorAll('.gdate'), function (el) {
    el.onchange = function () { imp.groups[+el.getAttribute('data-g')].date = el.value; renderImport(); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('.rm'), function (el) {
    el.onclick = function () { imp.groups[+el.getAttribute('data-g')].names[+el.getAttribute('data-n')].off = true; renderImport(); };
  });
  Array.prototype.forEach.call(box.querySelectorAll('.gon'), function (el) {
    el.onchange = function () { imp.groups[+el.getAttribute('data-g')].off = !el.checked; renderImport(); };
  });
  renderImportBar();
}
function importRows() {
  var rows = [];
  (S.imp ? S.imp.groups : []).forEach(function (g) {
    if (g.off) return;
    g.names.forEach(function (x) { if (!x.off) rows.push({ date: g.date, name: x.name }); });
  });
  return rows;
}
function renderImportBar() {
  if (S.view !== 'import') return;
  var rows = importRows();
  var blocked = S.imp && S.imp.groups.some(function (g) { var i = groupIssue(g); return !g.off && i && i.level === 'e'; });
  show('bar', !!(S.imp && S.imp.groups.length));
  $('barMsg').innerHTML = blocked ? '<span class="e">יש תאריכים לתיקון (או בטלו את הסימון "לייבא?")</span>' : rows.length + ' שמות מוכנים לבדיקה';
  $('barBtn').textContent = 'המשך לבדיקת השמות ←';
  $('barBtn').disabled = blocked || !rows.length;
  $('barBtn').onclick = queueImport;
}
function queueImport() {
  var rows = importRows();
  if (!rows.length || S.busy) return;
  busy(true);
  call('QueueImport', [rows], function (res) {
    busy(false);
    S.imp = null; $('waText').value = ''; $('preview').innerHTML = '';
    go('review');
    flash('revNote', 'ok', 'נוספו ' + res.added + ' רישומים לבדיקה' + (res.rejected ? ' (' + res.rejected + ' נדחו בגלל תאריך לא תקין)' : '') +
          '. לכל שם: בחרו את האדם הנכון, אשרו או הוסיפו טלפון, ולחצו "שמירה".');
  });
}
