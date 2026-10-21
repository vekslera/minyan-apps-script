// Registration page — gabbai mode (code, date picker).
// Declarations only — nothing runs when the file loads; the page calls the start function.

// ---------- Gabbai mode ----------
function gabbaiUi(on) {
  show('gabbaiBar', on);
  show('gabbaiOn', !on);
  $('deviceLabel').textContent = on ? '' : (DEVICE_NAMES[DEVICE] || '');
  setupPersonalPhone();
  show('locTest', on && !!(S.info && S.info.locationCheck));
  if (on) { $('date').value = S.info.today; $('date').max = S.info.today; }
}
function openPin() { $('pin').value = ''; show('pinMsg', false); show('pinDlg', true); $('pin').focus(); }
function checkPin() {
  var pin = $('pin').value.trim();
  if (!pin) return;
  call('kioskCheckPin', [KEY, pin], function (ok) {
    if (!ok) { $('pinMsg').textContent = 'קוד שגוי'; show('pinMsg', true); return; }
    S.pin = pin; store('minyanPin', pin);
    show('pinDlg', false);
    gabbaiUi(true);
    reset();
  }, function (e) { $('pinMsg').textContent = errText(e); show('pinMsg', true); });
}
function exitGabbai() { S.pin = ''; store('minyanPin', null); gabbaiUi(false); reset(); }
