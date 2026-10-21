// Registration page — live lookup while typing (names in the page, phone on the server).
// Declarations only — nothing runs when the file loads; the page calls the start function.

// ---------- Live lookup ----------
// Names are matched right here on the page (the same code as the server, see sharedJs_ in Utils.gs) against
// the roster sent by kioskInit, so typing never waits for the server. Only a complete phone number is
// looked up on the server, because the page never receives phone numbers.
function onPhone() {
  S.phoneId = '';
  var p = normPhone($('phone').value);
  if (validPhone_(p)) phoneLookup(p);
  else { S.seq++; show('phoneHit', false); show('names', true); localSuggest(); }
}
function onName() {
  S.selectedId = '';
  clearTimeout(S.lookupTimer);
  S.lookupTimer = setTimeout(localSuggest, 120);
}
function localSuggest() {
  if (S.phoneId) return;
  var first = $('first').value, last = $('last').value;
  if (norm_(last).length < 2 && norm_(first).length < 2) { renderChips([]); return; }
  renderChips(suggest_(S.roster, clean_(first), clean_(last)).slice(0, 6).map(function (c) {
    var p = c.person;
    return { id: p.id, name: (p.first + ' ' + p.last).trim(), first: p.first, last: p.last, hint: p.hint };
  }));
}
function phoneLookup(phone) {
  var my = ++S.seq;
  call('kioskLookup', [KEY, { phone: phone }], function (res) {
    if (my !== S.seq) return;
    var hit = $('phoneHit');
    if (res.byPhone) {
      S.phoneId = res.byPhone.id;
      hit.className = 'hit found';
      hit.innerHTML = 'שלום, <b>' + esc(res.byPhone.name) + '</b>';
      show(hit, true);
      show('names', false);
      renderChips([]);
      return;
    }
    show('names', true);
    hit.className = 'hit new';
    hit.textContent = 'מספר חדש — נא למלא שם משפחה ושם פרטי';
    show(hit, true);
    localSuggest();
  }, function () {});
}
function renderChips(cands) {
  var box = $('chips');
  box.innerHTML = '';
  cands.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (c.id === S.selectedId ? ' sel' : '');
    b.innerHTML = esc(c.name) + (c.hint ? '<span class="hint">· ' + esc(c.hint) + '</span>' : '');
    b.onclick = function () {
      S.selectedId = (S.selectedId === c.id) ? '' : c.id;
      if (S.selectedId) { $('last').value = c.last; $('first').value = c.first; }
      Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('sel'); });
      if (S.selectedId) b.classList.add('sel');
    };
    box.appendChild(b);
  });
  show('sugg', cands.length > 0);
}
