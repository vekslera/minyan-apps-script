// Registration page — state and start-up. KioskPage.html calls startKiosk().
// Declarations only — nothing runs when the file loads; the page calls the start function.

var S = { info: null, roster: [], pin: '', selectedId: '', phoneId: '', fromSaved: false, lastPhone: '', seq: 0, lookupTimer: null, resetTimer: null, busy: false };
var DEVICE = 'desktop';

function startKiosk() {
  DEVICE = detectDevice();
  $('phone').addEventListener('input', onPhone);
  $('last').addEventListener('input', onName);
  $('first').addEventListener('input', onName);
  $('form').addEventListener('submit', submit);
  $('again').addEventListener('click', reset);
  $('gabbaiOn').addEventListener('click', openPin);
  $('gabbaiOff').addEventListener('click', exitGabbai);
  $('pinOk').addEventListener('click', checkPin);
  $('pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPin(); });
  $('pinCancel').addEventListener('click', function () { show('pinDlg', false); });
  $('notMe').addEventListener('click', notMe);
  $('deviceLabel').textContent = DEVICE_NAMES[DEVICE] || '';
  setupPersonalPhone();
  init();
  prefillPhone();
  // Keep the date and the opening hours current on a tablet that stays on all day.
  setInterval(function () {
    call('kioskInit', [KEY], function (info) {
      var changed = !S.info || info.today !== S.info.today;
      S.info = info;
      S.roster = info.roster || S.roster;
      if (changed) { $('hebDate').textContent = hebDate(info.today); $('gregDate').textContent = gregDate(info.today); if (S.pin) gabbaiUi(true); }
      refreshClosed();
    }, function () {});
  }, 5 * 60 * 1000);
}
