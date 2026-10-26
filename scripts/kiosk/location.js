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
  if (typeof stopEarlyLocation === 'function') stopEarlyLocation();   // one location request at a time
  var called = false, done = ttime('GPS');
  function finish(x) { if (!called) { called = true; done(null, x.error ? x.error : '±' + Math.round(x.acc) + ' m'); cb(x); } }
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

// ---------- Early reading ----------
// The GPS starts before the tap, so the position is usually ready when the person taps "רישום נוכחות":
// at once when the phone already allows location, otherwise when they start typing (so the permission
// question doesn't pop up the moment the page opens). The reading stays in the page and goes to the
// server only with the registration — never stored. It restarts when the page comes back to the screen.
var EARLY_MAX_AGE = 2 * 60 * 1000, EARLY_STOP = 3 * 60 * 1000;
var EARLY = { watch: null, pos: null, waiting: false, stopTimer: null };

function startEarlyLocation() {
  if (!needsLocation() || !navigator.geolocation || EARLY.watch !== null || EARLY.waiting) return;
  var go = function () { EARLY.waiting = false; watchEarly(); };
  var onFirstInput = function () { $('form').removeEventListener('focusin', onFirstInput); go(); };
  try {
    navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
      if (p.state === 'granted') go();
      else { EARLY.waiting = true; $('form').addEventListener('focusin', onFirstInput); }
    }, function () { EARLY.waiting = true; $('form').addEventListener('focusin', onFirstInput); });
  } catch (e) { EARLY.waiting = true; $('form').addEventListener('focusin', onFirstInput); }
}
function watchEarly() {
  if (EARLY.watch !== null) return;
  var done = ttime('GPS — early reading started');
  try {
    EARLY.watch = navigator.geolocation.watchPosition(function (pos) {
      if (!EARLY.pos) done(null, '±' + Math.round(pos.coords.accuracy) + ' m');
      EARLY.pos = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
    }, function () { /* no early reading: the tap takes one, with the usual messages */ },
    { enableHighAccuracy: true, maximumAge: 0, timeout: LOC_TIMEOUT });
  } catch (e) { EARLY.watch = null; return; }
  clearTimeout(EARLY.stopTimer);
  EARLY.stopTimer = setTimeout(stopEarlyLocation, EARLY_STOP);       // spare the battery on a page left open
}
function stopEarlyLocation() {
  if (EARLY.watch !== null) { try { navigator.geolocation.clearWatch(EARLY.watch); } catch (e) {} }
  EARLY.watch = null;
}
/** The early reading, if it is recent enough to stand for "now". */
function recentLocation() {
  var p = EARLY.pos;
  return p && Date.now() - p.t < EARLY_MAX_AGE ? { lat: p.lat, lng: p.lng, acc: p.acc, t: p.t } : null;
}
/** Back on screen after a while (phone in the pocket): forget the old reading and start again. */
function onVisibility() {
  if (document.hidden) { stopEarlyLocation(); return; }
  EARLY.pos = null;
  startEarlyLocation();
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
  return esc(lead) + ' מה עושים:<ol>' + steps.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>' +
         '<p class="privacy">המיקום לא נשמר — הוא משמש רק לבדיקה שאתה בבית הכנסת.</p>';
}
function hideWhere() { show('where', false); show('form', true); }
function retryWhere() { hideWhere(); resubmit(false, true); }
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
