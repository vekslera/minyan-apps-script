// Registration page — location check for self-registration (phone or tablet; not gabbai mode, not the
// shul tablet). The position goes to the server with the registration, is compared with the shul's point
// there, and is never stored (see Location.gs).
// Declarations only — nothing runs when the file loads; the page calls the start function.

var LOC_TIMEOUT = 15000;

function needsLocation() { return !!(S.info && S.info.locationCheck) && !S.session && DEVICE !== 'kiosk'; }

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

/**
 * Outside the shul: say so, and offer "נסה שוב" / "שלח לאישור הגבאי".
 * No position: explain why, with steps for this kind of phone, and offer "אפשר מיקום" / "שלח לאישור הגבאי".
 */
function showWhere(res) {
  var outside = res.where === 'outside';
  $('whereTitle').textContent = outside ? 'נראה שאתה מחוץ לבית הכנסת' : 'לא התקבל מיקום';
  $('whereText').innerHTML = outside
    ? 'המרחק המשוער מבית הכנסת: כ-' + esc(res.distance) + ' מ׳.<br>אם אתה בבית הכנסת — המתן רגע ונסה שוב; לפעמים המיקום מתעדכן לאט.'
    : locationHelp(S.loc && S.loc.error);
  show('whereRetry', outside);
  show('whereAllow', !outside);
  show('form', false);
  show('where', true);
}

/** "אפשר מיקום": asks the browser again (this shows its permission prompt when it still can), then registers. */
function allowLocation() {
  var b = $('whereAllow');
  b.disabled = true; b.textContent = 'מבקש מיקום…';
  getLocation(function (loc) {
    b.disabled = false; b.textContent = 'אפשר מיקום';
    S.loc = loc;
    if (loc.error) { $('whereText').innerHTML = locationHelp(loc.error, true); return; }
    hideWhere();
    send(false);
  });
}

function phoneKind() {
  var ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0)) return 'ios';
  return /Android/i.test(ua) ? 'android' : '';
}

/**
 * Why there is no position, and what to do on this phone. A web page cannot switch the phone's location on;
 * it can only ask again once the person has. iPhone reports "location off" as "denied", so both steps are given.
 */
function locationHelp(err, again) {
  var kind = phoneKind(), steps = [], lead;
  var turnOn = kind === 'ios' ? 'הגדרות ← פרטיות ואבטחה ← שירותי מיקום ← להפעיל.'
             : kind === 'android' ? 'מושכים את המסך מלמעלה למטה ומפעילים "מיקום" (Location).'
             : 'להפעיל את המיקום (GPS) בהגדרות הטלפון.';
  var allowSite = kind === 'ios' ? 'באותו מסך: "אתרי Safari" (או הדפדפן שבו פתחתם את הדף) ← "בזמן השימוש ביישום".'
                : kind === 'android' ? 'בדפדפן: לוחצים על הסמל שליד כתובת האתר (מנעול או הגדרות) ← הרשאות ← מיקום ← "אפשר".'
                : 'בהגדרות הדפדפן לאתר הזה: מיקום ← "אפשר".';
  if (err === 'denied') {
    lead = again ? 'הדפדפן עדיין לא מקבל מיקום.' : 'הדפדפן לא קיבל רשות להשתמש במיקום.';
    steps = kind === 'ios' ? [turnOn, allowSite] : [allowSite, turnOn];
  } else if (err === 'unavailable') {
    lead = 'נראה שהמיקום בטלפון כבוי.';
    steps = [turnOn];
  } else if (err === 'timeout') {
    lead = 'המיקום לא התקבל בזמן.';
    steps = ['לוודא שהמיקום בטלפון מופעל.', 'לעמוד רגע ליד חלון או בחצר.'];
  } else if (err === 'unsupported') {
    return 'הדפדפן הזה לא תומך במיקום. אפשר לשלוח את הרישום לאישור הגבאי, או לפתוח את הדף בדפדפן אחר.';
  } else {
    lead = 'לא התקבל מיקום.';
    steps = [turnOn];
  }
  steps.push('ללחוץ "אפשר מיקום" כאן ולאשר אם הטלפון שואל.');
  return esc(lead) + ' מה עושים:<ol>' + steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>';
}
function hideWhere() { show('where', false); show('form', true); }
function retryWhere() { hideWhere(); resubmit(false); }
function sendForApproval() { hideWhere(); resubmit(true); }
function cancelWhere() { hideWhere(); reset(); }

/** Gabbai mode: how far is this device from the shul right now? Helps to check the radius. Nothing is stored. */
function testLocation() {
  gabbaiActive();
  showInfo('בודק מיקום…');
  getLocation(function (loc) {
    call('kioskCheckLocation', [KEY, S.session, loc], function (r) {
      if (!r.configured) return showInfo('מיקום בית הכנסת עדיין לא נקבע — כלי גבאי ← מיקום בית הכנסת.');
      if (r.reason) return showInfo('לא התקבל מיקום: ' + r.reason + '.');
      showInfo('מרחק מבית הכנסת: ' + r.distance + ' מ׳ · דיוק: ±' + r.accuracy + ' מ׳ · רדיוס: ' + r.radius + ' מ׳ — ' +
               (r.inside ? 'בתוך התחום ✓' : 'מחוץ לתחום') + ' · לשינוי: כלי גבאי ← מיקום בית הכנסת');
    });
  });
}
function showInfo(t) { $('msg').className = 'msg info'; $('msg').textContent = t; show('msg', !!t); }
