// Import and review screens (Sheet dialog and gabbai tools page) — review screen: one card per name, decisions, saving.
// Declarations only — nothing runs when the file loads; the page calls the start function.

// =================== REVIEW ===================
function loadReview() {
  show('bar', false);
  $('groups').innerHTML = '<div class="empty">טוען…</div>';
  call('GetPending', [], function (res) {
    S.groups = res.groups; S.people = res.people; S.byId = {};
    res.people.forEach(function (p) { S.byId[p.id] = p; });
    var keep = S.dec; S.dec = {};
    res.groups.forEach(function (g) { S.dec[g.gid] = keep[g.gid] || initDec(g); });
    renderReview();
  });
}
function initDec(g) {
  var d = { action: '', personId: '', confirmed: false, phone: g.phone ? g.phoneFmt : '', editPhone: false,
            first: g.first, last: g.last };
  if (g.decision === 'later') return d;
  if (g.decision === 'new') d.action = 'new';
  else if (g.bestId) { d.action = 'person'; d.personId = g.bestId; }
  return d;
}
function personPhone(id) { var p = S.byId[id]; return p ? p.phone : ''; }
function needsConfirm(g, d) {
  return d.action === 'person' && !!d.personId && (!!personPhone(d.personId) || g.decision === 'review') && !d.confirmed && !d.editPhone;
}
function isReady(g, d) {
  if (!phoneOk(d.phone)) return false;
  if (d.action === 'ignore') return true;
  if (d.action === 'person') return !!d.personId && !needsConfirm(g, d) && (!d.editPhone || !!normPhone(d.phone));
  if (d.action === 'new') return !!d.last.trim();
  return false;
}
function renderReview() {
  $('cnt').textContent = S.groups.length; show('cnt', S.groups.length > 0);
  show('revTools', S.groups.length > 0);
  if (!S.groups.length) { $('groups').innerHTML = '<div class="empty">אין רישומים שממתינים לבדיקה ✓</div>'; show('bar', false); return; }
  var days = S.groups.reduce(function (a, g) { return a + g.ids.length; }, 0);
  $('revSummary').textContent = S.groups.length + ' שמות שונים · ' + days + ' רישומים';
  $('groups').innerHTML = S.groups.map(function (g, i) { return '<div class="group" id="g' + i + '"></div>'; }).join('');
  S.groups.forEach(function (g, i) { renderGroup(i); });
  renderReviewBar();
}
function renderGroup(i) {
  var g = S.groups[i], d = S.dec[g.gid], el = $('g' + i), name = 'r' + i;
  var ready = isReady(g, d);
  el.className = 'group' + (ready ? ' ready' : '');
  var dates = g.dates.map(dlabel).join(', ');
  var h = '<div class="g-head"><div><span class="g-raw">' + esc(g.raw || '(בלי שם)') + '</span>' +
          (g.phone ? ' <span class="ph">' + esc(g.phoneFmt) + '</span>' : '') +
          '<div class="g-meta">' + g.ids.length + (g.ids.length === 1 ? ' יום' : ' ימים') + ': ' + esc(dates) + ' · ' + esc(g.sources.join(', ')) + '</div>' +
          (g.note ? '<div class="g-note">' + esc(g.note) + '</div>' : '') +
          (S.errors[g.gid] ? '<div class="g-err">' + esc(S.errors[g.gid]) + '</div>' : '') +
          '</div><span class="badge ' + (ready ? 'ok">מוכן' : 'wait">ממתין להחלטה') + '</span></div>';

  h += '<div class="opts">';
  var inCands = false;
  g.cands.forEach(function (c) {
    var sel = d.action === 'person' && d.personId === c.id;
    if (sel) inCands = true;
    h += '<label class="opt' + (sel ? ' sel' : '') + '"><input type="radio" name="' + name + '" data-a="person" data-id="' + c.id + '"' + (sel ? ' checked' : '') + '>' +
         '<b>' + esc(c.name) + '</b>' + (c.phone ? ' <span class="ph">' + esc(c.phone) + '</span>' : '') + '</label>';
  });
  var otherSel = d.action === 'person' && d.personId && !inCands;
  h += '<label class="opt' + (otherSel ? ' sel' : '') + '"><input type="radio" name="' + name + '" data-a="other"' + (otherSel ? ' checked' : '') + '>אדם אחר: ' +
       '<select data-k="other"><option value="">— בחרו —</option>' +
       S.people.map(function (p) { return '<option value="' + p.id + '"' + (otherSel && p.id === d.personId ? ' selected' : '') + '>' + esc(p.name) + (p.phone ? ' · ' + esc(p.phone) : '') + '</option>'; }).join('') +
       '</select></label>';
  h += '<label class="opt' + (d.action === 'new' ? ' sel' : '') + '"><input type="radio" name="' + name + '" data-a="new"' + (d.action === 'new' ? ' checked' : '') + '>אדם חדש</label>';
  h += '<label class="opt' + (d.action === 'ignore' ? ' sel' : '') + '"><input type="radio" name="' + name + '" data-a="ignore"' + (d.action === 'ignore' ? ' checked' : '') + '>לא לרשום</label>';
  h += '</div>';

  var badPhone = !phoneOk(d.phone) ? ' <span class="e">מספר לא תקין</span>' : '';
  if (d.action === 'person' && d.personId) {
    var pp = personPhone(d.personId);
    if (pp && !d.editPhone) {
      h += '<div class="detail"><span>טלפון רשום: <span class="ph" style="font-size:14px;color:var(--ink)">' + esc(pp) + '</span></span>' +
           '<label><input type="checkbox" data-k="confirm"' + (d.confirmed ? ' checked' : '') + '> <span class="' + (d.confirmed ? 'good' : 'need') + '">זה האיש הנכון</span></label>' +
           '<button class="btn" type="button" data-k="edit" style="padding:3px 10px;font-weight:600">הטלפון השתנה?</button></div>';
    } else {
      h += '<div class="detail"><label>' + (pp ? 'טלפון חדש:' : 'אין טלפון רשום. טלפון:') + ' <input type="tel" class="tel" data-k="phone" value="' + esc(d.phone) + '" placeholder="רשות"></label>' + badPhone +
           (g.decision === 'review' && !pp ? '<label><input type="checkbox" data-k="confirm"' + (d.confirmed ? ' checked' : '') + '> <span class="' + (d.confirmed ? 'good' : 'need') + '">זה האיש הנכון</span></label>' : '') +
           (pp ? '<button class="btn" type="button" data-k="unedit" style="padding:3px 10px;font-weight:600">ביטול</button>' : '') + '</div>';
    }
  } else if (d.action === 'new') {
    h += '<div class="detail"><label>שם פרטי <input type="text" data-k="first" value="' + esc(d.first) + '" style="width:130px"></label>' +
         '<label>שם משפחה* <input type="text" data-k="last" value="' + esc(d.last) + '" style="width:140px"></label>' +
         '<label>טלפון <input type="tel" class="tel" data-k="phone" value="' + esc(d.phone) + '" placeholder="מומלץ"></label>' + badPhone +
         (!normPhone(d.phone) ? '<span class="need">כדאי להוסיף טלפון</span>' : '') + '</div>';
  } else if (d.action === 'ignore') {
    h += '<div class="detail g-meta">הרישום לא ייספר</div>';
  }
  el.innerHTML = h;

  Array.prototype.forEach.call(el.querySelectorAll('input[type=radio]'), function (r) {
    r.onchange = function () {
      var a = r.getAttribute('data-a');
      d.confirmed = false; d.editPhone = false;
      if (a === 'person') { d.action = 'person'; d.personId = r.getAttribute('data-id'); }
      else if (a === 'other') { d.action = 'person'; d.personId = el.querySelector('select[data-k=other]').value; }
      else d.action = a;
      renderGroup(i); renderReviewBar();
    };
  });
  var sel = el.querySelector('select[data-k=other]');
  sel.onchange = function () { d.action = 'person'; d.personId = sel.value; d.confirmed = false; d.editPhone = false; renderGroup(i); renderReviewBar(); };
  bind(el, 'confirm', 'change', function (x) { d.confirmed = x.checked; renderGroup(i); renderReviewBar(); });
  bind(el, 'edit', 'click', function () { d.editPhone = true; d.phone = g.phone ? g.phoneFmt : ''; renderGroup(i); renderReviewBar(); var p = el.querySelector('[data-k=phone]'); if (p) p.focus(); });
  bind(el, 'unedit', 'click', function () { d.editPhone = false; d.phone = ''; renderGroup(i); renderReviewBar(); });
  ['phone', 'first', 'last'].forEach(function (k) {
    bind(el, k, 'input', function (x) { d[k] = x.value; refreshBadge(i); renderReviewBar(); });
    bind(el, k, 'change', function () { renderGroup(i); });
  });
}
function bind(el, k, ev, fn) { var x = el.querySelector('[data-k=' + k + ']'); if (x) x.addEventListener(ev, function () { fn(x); }); }
function refreshBadge(i) {
  var g = S.groups[i], el = $('g' + i), ready = isReady(g, S.dec[g.gid]);
  el.classList.toggle('ready', ready);
  var b = el.querySelector('.badge'); b.className = 'badge ' + (ready ? 'ok' : 'wait'); b.textContent = ready ? 'מוכן' : 'ממתין להחלטה';
}

function confirmCertainMatches() {
  S.groups.forEach(function (g, i) {
    var d = S.dec[g.gid];
    if (g.decision === 'auto' && d.action === 'person' && d.personId === g.bestId) { d.confirmed = true; renderGroup(i); }
  });
  renderReviewBar();
}

function renderReviewBar() {
  if (S.view !== 'review') return;
  var ready = S.groups.filter(function (g) { return isReady(g, S.dec[g.gid]); }).length;
  show('bar', S.groups.length > 0);
  $('barMsg').textContent = 'מוכנים לשמירה: ' + ready + ' מתוך ' + S.groups.length + (ready < S.groups.length ? ' (השאר יחכו לפעם הבאה)' : '');
  $('barBtn').textContent = 'שמירה';
  $('barBtn').disabled = !ready || S.busy;
  $('barBtn').onclick = saveReview;
}
function saveReview() {
  if (S.busy) return;
  var list = [];
  S.groups.forEach(function (g) {
    var d = S.dec[g.gid];
    if (!isReady(g, d)) return;
    list.push({ gid: g.gid, ids: g.ids, action: d.action, personId: d.personId,
                first: d.first, last: d.last, phone: (d.action === 'person' && !d.editPhone && personPhone(d.personId)) ? '' : normPhone(d.phone) });
  });
  if (!list.length) return;
  busy(true);
  call('Resolve', [list], function (res) {
    busy(false);
    S.errors = {};
    res.errors.forEach(function (e) { S.errors[e.gid] = e.msg; });
    var parts = [];
    if (res.saved) parts.push('נשמרו ' + res.saved + ' שמות (' + res.days + ' ימי נוכחות)');
    if (res.ignored) parts.push(res.ignored + ' סומנו "לא לרשום"');
    if (res.errors.length) parts.push(res.errors.length + ' לא נשמרו — ראו את ההערה באדום');
    flash('revNote', res.errors.length ? 'err' : 'ok', parts.join(' · '));
    loadReview();
  });
}
