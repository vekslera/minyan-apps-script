// Gabbai tools page — settings: minyan name, self-registration hours, period, lottery threshold, and the
// days without a minyan. All of them live in the הגדרות sheet (the gabbai code does not).
// Declarations only — nothing runs when the file loads; the page calls the start function.

var SETTINGS = null;

function loadSettings() {
  fillHours();
  call('Settings', [], renderSettings);
}
function fillHours() {
  if ($('setFrom').options.length) return;
  for (var h = 0; h <= 24; h += 0.5) {                     // every half hour: 8:00, 8:30, 9:00 …
    var label = fmtHour_(h);
    if (h < 24) $('setFrom').add(new Option(label, String(h)));
    if (h > 0) $('setTo').add(new Option(label, String(h)));
  }
}
function renderSettings(g) {
  SETTINGS = g;
  $('setName').value = g.name;
  $('setFrom').value = String(g.from); $('setTo').value = String(g.to);
  $('setStart').value = g.start || ''; $('setEnd').value = g.end || '';
  $('setPct').value = g.threshold;
  var list = g.excluded;
  $('noMinyanList').innerHTML = list.length
    ? list.map(function (k, i) { return '<span class="nm">' + esc(dlabel(k)) + '/' + k.slice(0, 4) + '<button type="button" title="הסרה" data-i="' + i + '" class="nmDel">×</button></span>'; }).join('')
    : '<p class="g-meta">אין ימים כאלה.</p>';
  Array.prototype.forEach.call(document.querySelectorAll('.nmDel'), function (b) {
    b.onclick = function () {
      var next = SETTINGS.excluded.filter(function (_, i) { return i !== +b.getAttribute('data-i'); });
      call('SetNoMinyan', [next], function (x) { flash('settingsNote', 'ok', 'היום הוסר.'); renderSettings(x); });
    };
  });
}
function saveSettings() {
  var d = { name: $('setName').value.trim(), from: Number($('setFrom').value), to: Number($('setTo').value),
            start: $('setStart').value, end: $('setEnd').value, threshold: Number($('setPct').value) };
  if (d.from >= d.to) return flash('settingsNote', 'err', '"משעה" צריכה להיות לפני "עד שעה"');
  if (d.start && d.end && d.start > d.end) return flash('settingsNote', 'err', 'תחילת התקופה אחרי סופה');
  wait('setSave');
  call('SaveSettings', [d], function (g) {
    unwait(); renderSettings(g);
    if (S.info) { S.info.name = g.name; $('sub').textContent = g.name; S.info.at = 0; }
    flash('settingsNote', 'ok', 'ההגדרות נשמרו. רישום עצמי: ' + fmtHour_(g.from) + '–' + fmtHour_(g.to) + '.');
  });
}
function addNoMinyan() {
  var k = $('noMinyanDate').value;
  if (!k || !SETTINGS) return;
  if (SETTINGS.excluded.indexOf(k) >= 0) return flash('settingsNote', 'err', 'התאריך כבר ברשימה');
  wait('noMinyanAdd');
  call('SetNoMinyan', [SETTINGS.excluded.concat([k])], function (x) {
    unwait(); $('noMinyanDate').value = ''; flash('settingsNote', 'ok', 'נוסף: ' + dlabel(k) + '.'); renderSettings(x);
  });
}
