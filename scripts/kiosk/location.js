// Registration page — location check for self-registration (phone or tablet; not gabbai mode, not the
// shul tablet). The position goes to the server with the registration, is compared with the shul's point
// there, and is never stored (see Location.gs).
// Declarations only — nothing runs when the file loads; the page calls the start function.

var LOC_TIMEOUT = 15000;

function needsLocation() { return !!(S.info && S.info.locationCheck) && !S.pin && DEVICE !== 'kiosk'; }

/**
 * Calls back once with {lat, lng, acc} or {error: 'denied' | 'unavailable' | 'timeout' | 'unsupported'}.
 * Always a fresh reading (maximumAge 0): an earlier one may be from before the person walked in — or out.
 */
function getLocation(cb) {
  var called = false;
  function finish(x) { if (!called) { called = true; cb(x); } }
  if (!navigator.geolocation) return finish({ error: 'unsupported' });
  setTimeout(function () { finish({ error: 'timeout' }); }, LOC_TIMEOUT + 3000);
  try {
    navigator.geolocation.getCurrentPosition(function (pos) {
      finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
    }, function (err) {
      finish({ error: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' });
    }, { enableHighAccuracy: true, timeout: LOC_TIMEOUT, maximumAge: 0 });
  } catch (e) { finish({ error: 'unavailable' }); }
}

/** Outside the shul, or no position: say so, and offer "נסה שוב" / "שלח לאישור הגבאי". */
function showWhere(res) {
  var outside = res.where === 'outside';
  $('whereTitle').textContent = outside ? 'נראה שאתה מחוץ לבית הכנסת' : 'לא התקבל מיקום';
  $('whereText').innerHTML = outside
    ? 'המרחק המשוער מבית הכנסת: כ-' + esc(res.distance) + ' מ׳.<br>אם אתה בבית הכנסת — המתן רגע ונסה שוב; לפעמים המיקום מתעדכן לאט.'
    : esc(res.message) + '.<br>' + (res.message === 'לא ניתנה הרשאת מיקום'
        ? 'יש לאשר לדפדפן גישה למיקום (בהגדרות האתר ← מיקום) ואז ללחוץ "נסה שוב".'
        : 'כדאי לוודא שהמיקום (GPS) פועל בטלפון ולנסות שוב.');
  show('form', false);
  show('where', true);
}
function hideWhere() { show('where', false); show('form', true); }
function retryWhere() { hideWhere(); resubmit(false); }
function sendForApproval() { hideWhere(); resubmit(true); }
function cancelWhere() { hideWhere(); reset(); }

/** Gabbai mode: how far is this device from the shul right now? Helps to check the radius. Nothing is stored. */
function testLocation() {
  showInfo('בודק מיקום…');
  getLocation(function (loc) {
    call('kioskCheckLocation', [KEY, S.pin, loc], function (r) {
      if (!r.configured) return showInfo('בדיקת מיקום לא מוגדרת (shulLat/shulLng ב-Secrets.gs).');
      if (r.reason) return showInfo('לא התקבל מיקום: ' + r.reason + '.');
      showInfo('מרחק מבית הכנסת: ' + r.distance + ' מ׳ · דיוק: ±' + r.accuracy + ' מ׳ · רדיוס: ' + r.radius + ' מ׳ — ' +
               (r.inside ? 'בתוך התחום ✓' : 'מחוץ לתחום'));
    });
  });
}
function showInfo(t) { $('msg').className = 'msg info'; $('msg').textContent = t; show('msg', !!t); }
