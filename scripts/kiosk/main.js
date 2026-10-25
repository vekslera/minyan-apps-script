// Registration page — state and start-up. KioskPage.html calls startKiosk().
// Declarations only — nothing runs when the file loads; the page calls the start function.

var S = { info: null, roster: [], session: '', selectedId: '', phoneId: '', fromSaved: false, lastPhone: '', form: null, loc: null, seq: 0, lookupTimer: null, resetTimer: null, busy: false };
var DEVICE = 'desktop';

function startKiosk() {
  timingStart(DEBUG_MS);
  DEVICE = detectDevice();
  $('phone').addEventListener('input', onPhone);
  $('last').addEventListener('input', onName);
  $('first').addEventListener('input', onName);
  $('form').addEventListener('submit', submit);
  $('again').addEventListener('click', reset);
  $('gabbaiOn').addEventListener('click', openPin);
  $('gabbaiOff').addEventListener('click', function () { exitGabbai(); });
  $('pinOk').addEventListener('click', checkPin);
  $('pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPin(); });
  $('pinCancel').addEventListener('click', function () { show('pinDlg', false); });
  $('notMe').addEventListener('click', notMe);
  $('whereRetry').addEventListener('click', retryWhere);
  $('whereAllow').addEventListener('click', allowLocation);
  $('whereSend').addEventListener('click', sendForApproval);
  $('whereCancel').addEventListener('click', cancelWhere);
  $('locTest').addEventListener('click', testLocation);
  $('deviceLabel').textContent = DEVICE_NAMES[DEVICE] || '';
  setupPersonalPhone();
  init();
  prefillPhone();
  // Keep the date and the opening hours current on a tablet that stays on all day.
  setInterval(gabbaiIdleCheck, 60 * 1000);
  setInterval(function () {
    call('kioskInit', [KEY, S.session], function (info) {
      var changed = !S.info || info.today !== S.info.today;
      S.info = info;
      S.roster = info.roster || S.roster;
      if (changed) { $('hebDate').textContent = hebDate(info.today); $('gregDate').textContent = gregDate(info.today); if (S.session) gabbaiUi(true); }
      refreshClosed();
    }, function () {});
  }, 5 * 60 * 1000);
}
