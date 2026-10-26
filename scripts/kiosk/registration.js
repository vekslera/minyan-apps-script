// Registration page — loading, opening hours, submitting and the confirmation screen.
// Declarations only — nothing runs when the file loads; the page calls the start function.

// ---------- Startup & state ----------
/**
 * The page arrives with today's data and the name list (INIT, from doGet), so the form shows at once.
 * Only a saved gabbai login needs a server call first, to check that it is still valid.
 */
function init() {
  var saved = load('minyanSession');
  if (!saved && INIT && typeof INIT === 'object') { tmark('today\'s data came with the page'); return applyInit(INIT, ''); }
  call('kioskInit', [KEY, saved || ''], function (info) { applyInit(info, saved); },
       function (e) { $('loading').textContent = errText(e); });
}
function applyInit(info, saved) {
    S.info = info;
    S.roster = info.roster || S.roster;
    $('title').textContent = info.name || 'רישום נוכחות';
    var h = hebDate(info.today);
    $('hebDate').textContent = h;
    show('sep', !!h);
    $('gregDate').textContent = gregDate(info.today);
    show('loading', false);
    tmark('form ready');
    if (saved && info.session && !S.session) { S.session = saved; gabbaiActive(); gabbaiUi(true); reset(); }   // back in gabbai mode
    else if (saved && !info.session) store('minyanSession', null);
    refreshClosed();
    startEarlyLocation();
}
function refreshClosed() {
  var i = S.info, why = '';
  if (!S.session) {
    if (i.dow === 6) why = 'שבת שלום<small>אין רישום בשבת</small>';
    else if (i.minyanDay === false) why = 'היום אין מניין<small>המניין מתקיים בימים ' + daysLabel_(i.days) + '</small>';
    else if (i.noMinyan) why = 'היום אין רישום';
    else if (!i.open) why = 'הרישום סגור כעת<small>הרישום פתוח בין השעות ' + fmtHour_(i.from) + ' ל-' + fmtHour_(i.to) + '</small>';
    else if (DEVICE === 'desktop') why = 'רישום עצמי — מטלפון נייד או מטאבלט<small>במחשב אפשר לרשום רק במצב גבאי</small>';
  }
  show('locNote', !why && needsLocation());
  $('closed').innerHTML = why;
  show('closed', !!why);
  if (!$('done').hidden || !$('where').hidden) return;
  show('form', !why);
}
// ---------- Submit ----------
function showMsg(t) { $('msg').className = 'msg err'; $('msg').textContent = t; show('msg', !!t); }
function setBusy(on, label) { S.busy = on; $('submit').disabled = on; $('submit').textContent = on ? (label || 'רושם…') : 'רישום נוכחות'; }
function submit(ev) {
  ev.preventDefault();
  if (S.busy) return;
  showMsg('');
  var phone = normPhone($('phone').value), last = $('last').value.trim(), first = $('first').value.trim();
  var pid = S.selectedId || S.phoneId;
  if ($('phone').value.trim() && !validPhone_(phone)) return showMsg('מספר הטלפון אינו תקין');
  S.lastPhone = phone;
  if (!pid && !last) { $('last').focus(); return showMsg('נא למלא שם משפחה'); }
  S.form = { phone: phone, first: first, last: last, personId: pid };
  tmark('tap: register');
  resubmit(false);
}
/**
 * Sends the registration — with a position first when this device must be in the shul: the early reading
 * when it is recent (taken while the person typed), otherwise a fresh one. fresh = always a new reading
 * ("נסה שוב" after walking in).
 */
function resubmit(outsideOk, fresh) {
  if (!needsLocation()) { S.loc = null; return send(false); }
  if (outsideOk) return send(true);
  var early = !fresh && recentLocation();
  if (early) { S.loc = early; tmark('GPS — early reading, ±' + Math.round(early.acc) + ' m, ' + Math.round((Date.now() - early.t) / 1000) + ' s old'); return send(false); }
  setBusy(true, 'בודק מיקום…');
  getLocation(function (loc) { S.loc = loc; send(false); });
}
function send(outsideOk) {
  setBusy(true);
  if (S.session) gabbaiActive();
  var f = S.form;
  call('kioskSubmit', [KEY, { phone: f.phone, first: f.first, last: f.last, personId: f.personId, device: S.session ? '' : DEVICE,
                              session: S.session, date: S.session ? $('date').value : '', loc: S.session ? null : S.loc,
                              outsideOk: !!outsideOk }], done);
}
function done(res) {
  setBusy(false);
  if (!res.ok && res.where) return showWhere(res);
  if (!res.ok) return showMsg(res.message);
  if (onPersonalPhone() && validPhone_(S.lastPhone)) rememberPhone(S.lastPhone);
  if (res.person && !S.roster.some(function (p) { return p.id === res.person.id; })) S.roster.push(res.person);
  var g = !!S.session, other = res.date !== S.info.today;
  var mark = $('mark'), title = '', text = '';
  if (res.status === 'pending') {
    mark.className = 'mark wait'; mark.textContent = '…';
    title = 'הרישום התקבל';
    text = 'הגבאי יאשר אותו בהמשך';
  } else {
    mark.className = 'mark ok'; mark.textContent = '✓';
    title = g ? res.name : 'תודה, ' + res.name + '!';
    if (res.status === 'already') text = other ? 'כבר רשום ל-' + shortDate(res.date) : 'כבר רשום להיום — אין צורך לרשום שוב';
    else text = other ? 'נרשם ל-' + shortDate(res.date) : (g ? 'נרשם להיום' : 'הנוכחות נרשמה להיום');
  }
  $('doneTitle').textContent = title;
  $('doneText').textContent = text;
  var st = res.stats;
  if (st) {
    $('doneStats').innerHTML = 'נוכחות בתקופה: <b>' + st.count + '</b> מתוך ' + st.days + ' ימים (' + st.pct + '%)' +
      (st.eligible ? '<br><span class="elig">✓ עומד בתנאי ההגרלה</span>' : '');
  }
  show('doneStats', !!st);
  show('form', false);
  show('done', true);
  tmark('confirmation shown');
  stopEarlyLocation(); EARLY.pos = null;
  clearTimeout(S.resetTimer);
  S.resetTimer = setTimeout(reset, g ? 2000 : 6000);
}
function reset() {
  clearTimeout(S.resetTimer);
  ['phone', 'last', 'first'].forEach(function (id) { $(id).value = ''; });
  S.selectedId = ''; S.phoneId = ''; S.seq++;
  show('phoneHit', false); show('names', true); renderChips([]); showMsg('');
  show('done', false);
  show('where', false);
  refreshClosed();
  if (S.session) $('phone').focus();
  prefillPhone();
  startEarlyLocation();
}
