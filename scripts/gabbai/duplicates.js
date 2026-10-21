// Gabbai tools page — duplicates: pairs that look like one person; merge the ones the gabbai marks.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function loadDups() {
  $('dupsList').innerHTML = '<div class="empty">מחפש…</div>';
  call('FindDuplicates', [], function (list) {
    // keep the record with more attendance days (on a tie, the older one)
    S.dups = list.map(function (d) { return { a: d.a, b: d.b, score: d.score, on: false, keepB: d.b.days > d.a.days }; });
    renderDups();
  });
}
function personLine(p) {
  return '<b>' + esc(p.name) + '</b>' + (p.phone ? ' <span class="ph">' + esc(p.phone) + '</span>' : '') +
         ' <span class="g-meta">· ' + p.days + ' ימים · ' + esc(p.id) + '</span>';
}
function renderDups() {
  if (!S.dups.length) { $('dupsList').innerHTML = '<div class="empty">לא נמצאו כפילויות ✓</div>'; show('bar', false); return; }
  $('dupsList').innerHTML = S.dups.map(function (d, i) {
    return '<div class="group' + (d.on ? ' ready' : '') + '"><div class="g-head"><div class="g-meta">דמיון ' + d.score + '%</div>' +
      '<label class="opt' + (d.on ? ' sel' : '') + '"><input type="checkbox" data-i="' + i + '" class="dupOn"' + (d.on ? ' checked' : '') + '> למזג</label></div>' +
      '<div class="pair">' +
      '<label class="opt' + (d.on && !d.keepB ? ' sel' : '') + '"><input type="radio" name="k' + i + '" data-i="' + i + '" data-b="0"' + (!d.keepB ? ' checked' : '') + '> להשאיר: ' + personLine(d.a) + '</label>' +
      '<label class="opt' + (d.on && d.keepB ? ' sel' : '') + '"><input type="radio" name="k' + i + '" data-i="' + i + '" data-b="1"' + (d.keepB ? ' checked' : '') + '> להשאיר: ' + personLine(d.b) + '</label>' +
      '</div></div>';
  }).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.dupOn'), function (c) {
    c.onchange = function () { S.dups[+c.getAttribute('data-i')].on = c.checked; renderDups(); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('#dupsList input[type=radio]'), function (r) {
    r.onchange = function () { S.dups[+r.getAttribute('data-i')].keepB = r.getAttribute('data-b') === '1'; renderDups(); };
  });
  var n = S.dups.filter(function (d) { return d.on; }).length;
  show('bar', true);
  $('barMsg').textContent = n ? 'מסומנים למיזוג: ' + n : 'סמנו "למזג" ליד זוג שהוא אותו אדם';
  $('barBtn').textContent = 'מיזוג';
  $('barBtn').disabled = !n || S.busy;
  $('barBtn').onclick = mergeDups;
}
function mergeDups() {
  var pairs = S.dups.filter(function (d) { return d.on; })
    .map(function (d) { return d.keepB ? { keep: d.b.id, drop: d.a.id } : { keep: d.a.id, drop: d.b.id }; });
  if (!pairs.length || S.busy) return;
  busy(true);
  call('Merge', [pairs], function (r) {
    busy(false);
    var bad = r.results.filter(function (x) { return x.indexOf('שגיאה') === 0; });
    flash('dupsNote', bad.length ? 'err' : 'ok', 'מוזגו ' + r.merged + ' זוגות' + (bad.length ? ' · ' + bad.join(' · ') : ''));
    loadDups();
  });
}
