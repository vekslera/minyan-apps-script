// Gabbai tools page — the shul's location: where its centre is, the radius, a distance test, and setting the
// centre by measuring in the shul. Registrants' positions are never stored; this point is the shul's own.
// Declarations only — nothing runs when the file loads; the page calls the start function.

var SHUL = { info: null, best: null, armed: false, measuring: false };
var SHUL_MEASURE_MS = 20000, SHUL_GOOD_ACC = 8;

function loadShul() {
  SHUL.best = null; SHUL.armed = false;
  show('shulSet', false); $('shulMeasureOut').textContent = ''; $('shulTestOut').textContent = '';
  call('ShulInfo', [], renderShul);
}
function renderShul(r) {
  SHUL.info = r;
  var h;
  if (!r.configured) {
    h = '<b>בדיקת המיקום כבויה</b><p class="lead">עדיין לא נקבע מיקום לבית הכנסת, ולכן רישום עצמי לא נבדק לפי מיקום.</p>';
  } else {
    var at = r.lat.toFixed(6) + ',' + r.lng.toFixed(6);
    h = '<b>המיקום הנוכחי</b><p class="lead" style="margin-top:6px">מרכז: <a href="https://www.google.com/maps?q=' + at + '" target="_blank" rel="noopener" class="ph">' + at + '</a>' +
        ' · רדיוס: <b>' + r.radius + ' מ׳</b><br>' +
        (r.source === 'gabbai' ? 'נקבע בכלי הגבאי' + (r.setAt ? ' ב-' + esc(r.setAt) : '') + (r.acc ? ' (דיוק המדידה ±' + r.acc + ' מ׳)' : '')
                               : 'מתוך הקובץ Secrets.gs') + '</p>';
    if (r.source === 'gabbai') {
      h += '<button class="btn" id="shulReset" type="button">' + (r.secrets ? 'חזרה למיקום מ-Secrets.gs' : 'מחיקת המיקום (כיבוי הבדיקה)') + '</button>';
    }
  }
  $('shulBox').innerHTML = h;
  if ($('shulReset')) $('shulReset').onclick = function () { twoTaps(this, function () { call('ResetShulLocation', [], function (x) { flash('shulNote', 'ok', 'בוצע.'); renderShul(x); }); }); };
  show('shulRadiusCard', r.configured);
  if (r.configured) { $('shulRadius').value = r.radius; $('shulRadius').min = r.minR; $('shulRadius').max = r.maxR; }
}

/** A button that needs a second tap within 6 seconds. */
function twoTaps(btn, fn) {
  if (btn.getAttribute('data-armed')) { btn.removeAttribute('data-armed'); btn.textContent = btn.getAttribute('data-label'); return fn(); }
  btn.setAttribute('data-label', btn.textContent); btn.setAttribute('data-armed', '1');
  btn.textContent = 'בטוח? הקשה נוספת מאשרת';
  setTimeout(function () { if (btn.getAttribute('data-armed')) { btn.removeAttribute('data-armed'); btn.textContent = btn.getAttribute('data-label'); } }, 6000);
}

function geoError(err) {
  return err && err.code === 1 ? 'לא ניתנה הרשאת מיקום לדפדפן' : err && err.code === 3 ? 'המיקום לא התקבל בזמן' : 'המיקום לא זמין';
}

/** One fresh reading, exactly like a registration, checked by the server. */
function testShulDistance() {
  if (!navigator.geolocation) return ($('shulTestOut').textContent = 'הדפדפן לא תומך במיקום');
  wait('shulTest'); $('shulTestOut').textContent = 'בודק…';
  navigator.geolocation.getCurrentPosition(function (pos) {
    call('CheckLocation', [{ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }], function (r) {
      unwait();
      if (!r.configured) return ($('shulTestOut').textContent = 'לא נקבע מיקום לבית הכנסת.');
      $('shulTestOut').innerHTML = 'מרחק: <b>' + r.distance + ' מ׳</b> · דיוק: ±' + r.accuracy + ' מ׳ · רדיוס: ' + r.radius + ' מ׳ — ' +
        (r.inside ? '<span style="color:var(--ok);font-weight:700">ייחשב בתוך בית הכנסת ✓</span>' : '<span class="e">ייחשב מחוץ לבית הכנסת</span>');
    });
  }, function (err) { unwait(); $('shulTestOut').textContent = geoError(err); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
}

/** Watches the position for up to 20 seconds and keeps the most precise reading. */
function measureShul() {
  if (!navigator.geolocation) return ($('shulMeasureOut').textContent = 'הדפדפן לא תומך במיקום');
  if (SHUL.measuring) return;
  SHUL.measuring = true; SHUL.best = null;
  wait('shulMeasure'); show('shulSet', false);
  $('shulMeasureOut').textContent = 'מודד…';
  var id = null, timer = null;
  function done(errText) {
    if (!SHUL.measuring) return;
    SHUL.measuring = false;
    if (id !== null) navigator.geolocation.clearWatch(id);
    clearTimeout(timer); unwait();
    var b = SHUL.best;
    if (!b) return ($('shulMeasureOut').textContent = errText || 'לא התקבל מיקום');
    var maxAcc = SHUL.info ? SHUL.info.maxAcc : 50;
    if (b.acc > maxAcc) {
      $('shulMeasureOut').innerHTML = '<span class="e">המדידה לא מדויקת מספיק (±' + Math.round(b.acc) + ' מ׳; נדרש ±' + maxAcc + ' מ׳ או פחות).</span> ' +
        'נסו בטלפון, ליד חלון או בחצר, ומדדו שוב.';
      return;
    }
    var far = SHUL.info && SHUL.info.configured ? ' · ' + Math.round(distanceM(SHUL.info, b)) + ' מ׳ מהמרכז הנוכחי' : '';
    $('shulMeasureOut').textContent = 'נמדד: דיוק ±' + Math.round(b.acc) + ' מ׳' + far + '.';
    show('shulSet', true);
  }
  id = navigator.geolocation.watchPosition(function (pos) {
    var c = pos.coords;
    if (!SHUL.best || c.accuracy < SHUL.best.acc) SHUL.best = { lat: c.latitude, lng: c.longitude, acc: c.accuracy };
    $('shulMeasureOut').textContent = 'מודד… הדיוק הטוב ביותר עד כה: ±' + Math.round(SHUL.best.acc) + ' מ׳';
    if (SHUL.best.acc <= SHUL_GOOD_ACC) done();
  }, function (err) { done(geoError(err)); }, { enableHighAccuracy: true, timeout: SHUL_MEASURE_MS, maximumAge: 0 });
  timer = setTimeout(function () { done(); }, SHUL_MEASURE_MS);
}
function setShul() {
  if (!SHUL.best) return;
  twoTaps($('shulSet'), function () {
    wait('shulSet');
    call('SetShulLocation', [SHUL.best], function (r) {
      unwait(); show('shulSet', false);
      $('shulMeasureOut').textContent = '';
      flash('shulNote', 'ok', 'מיקום בית הכנסת נקבע. מעכשיו הרישום העצמי נבדק לפיו.');
      renderShul(r);
    });
  });
}
function saveShulRadius() {
  wait('shulRadiusSave');
  call('SetShulRadius', [Number($('shulRadius').value)], function (r) {
    unwait(); flash('shulNote', 'ok', 'הרדיוס נשמר: ' + r.radius + ' מ׳.'); renderShul(r);
  });
}
/** Metres between two {lat, lng} (for the "how far from the current centre" hint only). */
function distanceM(a, b) {
  var R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
