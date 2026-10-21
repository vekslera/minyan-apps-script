// ======================================================================================
//  LOCATION CHECK
//  Self-registrations (phone/tablet, not gabbai mode, not the shul tablet) must come from the shul.
//  The page sends the browser's position with the registration; it is used here for one comparison and
//  NEVER stored. Only the outcome may be stored: "inside", or for the review list a rounded distance
//  ("מחוץ לבית הכנסת, ~850 מ׳") or the reason no position was available.
//  The shul's point and radius: as set by the gabbai on the tools page ("מיקום בית הכנסת", measured
//  in the shul), otherwise from Secrets.gs (shulLat, shulLng, shulRadius). Without either the check is off.
//  (That point is the shul's, set on purpose; it is not anyone's position.)
// ======================================================================================

const SHUL_SET = { MAX_ACC: 50, MIN_R: 20, MAX_R: 1000, NEW_RADIUS: 50 };

/** The shul area from Secrets.gs, or null. */
function secretsArea_() {
  const lat = Number(secret_('shulLat')), lng = Number(secret_('shulLng'));
  if (!lat || !lng || !isFinite(lat) || !isFinite(lng)) return null;
  const radius = Number(secret_('shulRadius'));
  return { lat: lat, lng: lng, radius: radius > 0 ? radius : 150, source: 'secrets' };
}

/** {lat, lng, radius, source, setAt?, acc?} of the shul, or null when the check is not configured. */
function shulArea_() {
  if (shulArea_.v === undefined) {
    let a = null;
    try { a = JSON.parse(PropertiesService.getDocumentProperties().getProperty('SHUL_AREA') || 'null'); } catch (e) { a = null; }
    shulArea_.v = a && isFinite(a.lat) && isFinite(a.lng) && a.radius > 0 ? Object.assign(a, { source: 'gabbai' }) : secretsArea_();
  }
  return shulArea_.v;
}
function saveShulArea_(a) {
  const props = PropertiesService.getDocumentProperties();
  if (a) props.setProperty('SHUL_AREA', JSON.stringify({ lat: a.lat, lng: a.lng, radius: a.radius, acc: a.acc || 0, setAt: a.setAt || '' }));
  else props.deleteProperty('SHUL_AREA');
  shulArea_.v = undefined;
}

/** Whether this registration has to come from the shul. */
function locationRequired_(device, gabbai) {
  return !gabbai && device !== 'kiosk' && !!shulArea_();
}

/** Great-circle distance in metres (haversine). */
function distanceMeters_(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * loc = {lat, lng, acc} from the browser, or {error: 'denied' | 'unavailable' | 'timeout' | 'unsupported'}.
 * Returns {inside, distance, accuracy} or {inside: false, reason}. GPS indoors is often off by tens of
 * metres, so the reading's accuracy is allowed on top of the radius — but at most half a radius, so that a
 * vague reading from a nearby house doesn't count as inside.
 */
function checkLocation_(loc) {
  const area = shulArea_();
  if (!area) return { inside: true, off: true };
  const lat = loc ? Number(loc.lat) : NaN, lng = loc ? Number(loc.lng) : NaN;
  if (!loc || loc.error || !isFinite(lat) || !isFinite(lng) || (!lat && !lng)) {
    const reason = loc && LOCATION_REASONS[loc.error] ? loc.error : 'unavailable';
    return { inside: false, reason: reason };
  }
  const distance = distanceMeters_(area, { lat: lat, lng: lng });
  const accuracy = Math.max(0, Number(loc.acc) || 0);
  return { inside: distance <= area.radius + Math.min(accuracy, area.radius / 2),
           distance: Math.round(distance), accuracy: Math.round(accuracy) };
}

const LOCATION_REASONS = {
  denied: 'לא ניתנה הרשאת מיקום', unavailable: 'המיקום לא זמין', timeout: 'המיקום לא התקבל בזמן',
  unsupported: 'הדפדפן לא תומך במיקום',
};

/** What may be stored about a failed check: the rounded distance or the reason — never coordinates. */
function locationNote_(chk) {
  if (chk.reason) return 'ללא מיקום (' + LOCATION_REASONS[chk.reason] + ')';
  return 'מחוץ לבית הכנסת (~' + roundDistance_(chk.distance) + ' מ׳)';
}
function roundDistance_(m) { return m < 1000 ? Math.round(m / 10) * 10 : Math.round(m / 100) * 100; }

/**
 * RESERVED — not implemented yet. A hook for investigating poor location readings (e.g. someone inside
 * the shul reported as outside). It receives only the outcome of a check, never the coordinates.
 * Turned on by `locationLog: true` in Secrets.gs; today it does nothing either way. When implementing,
 * decide first what may be kept and for how long, and keep coordinates out unless that is decided.
 */
function logLocationCheck_(info) {
  if (secret_('locationLog') !== 'true') return;
  // Not implemented yet: e.g. append [time, device, inside, distance, accuracy, reason] to a "יומן מיקום" sheet.
}

/** Gabbai tool on the registration page: how far is this device from the shul right now? Nothing is stored. */
function kioskCheckLocation(key, session, loc) {
  checkSession_(key, session);
  const area = shulArea_();
  if (!area) return { configured: false };
  const chk = checkLocation_(loc);
  logLocationCheck_({ device: 'gabbai-test', inside: chk.inside, distance: chk.distance, accuracy: chk.accuracy, reason: chk.reason });
  return { configured: true, radius: area.radius, inside: chk.inside, distance: chk.distance, accuracy: chk.accuracy,
           reason: chk.reason ? LOCATION_REASONS[chk.reason] : '' };
}

// ---- Gabbai tools page: the shul's location ----

function shulInfo_() {
  const a = shulArea_(), sec = secretsArea_();
  const base = { secrets: !!sec, maxAcc: SHUL_SET.MAX_ACC, minR: SHUL_SET.MIN_R, maxR: SHUL_SET.MAX_R };
  if (!a) return Object.assign(base, { configured: false });
  return Object.assign(base, { configured: true, lat: a.lat, lng: a.lng, radius: a.radius, source: a.source,
                               setAt: a.setAt || '', acc: a.acc || 0 });
}
function gabbaiShulInfo(key, session) { checkSession_(key, session); return shulInfo_(); }

/** Sets the shul's point to where the gabbai stands (a precise reading only). Keeps the radius. */
function gabbaiSetShulLocation(key, session, loc) {
  checkSession_(key, session);
  const lat = Number(loc && loc.lat), lng = Number(loc && loc.lng), acc = Number(loc && loc.acc);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (!lat && !lng)) throw new Error('המיקום שהתקבל אינו תקין');
  if (!(acc > 0) || acc > SHUL_SET.MAX_ACC) throw new Error('המדידה לא מדויקת מספיק (±' + Math.round(acc || 0) + ' מ׳). נדרש ±' + SHUL_SET.MAX_ACC + ' מ׳ או פחות.');
  const cur = shulArea_();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  saveShulArea_({ lat: lat, lng: lng, radius: cur ? cur.radius : SHUL_SET.NEW_RADIUS, acc: Math.round(acc), setAt: fmtKey_(todayKey_(tz)) });
  return shulInfo_();
}
function gabbaiSetShulRadius(key, session, radius) {
  checkSession_(key, session);
  const r = Math.round(Number(radius));
  if (!(r >= SHUL_SET.MIN_R && r <= SHUL_SET.MAX_R)) throw new Error('הרדיוס צריך להיות בין ' + SHUL_SET.MIN_R + ' ל-' + SHUL_SET.MAX_R + ' מטרים');
  const cur = shulArea_();
  if (!cur) throw new Error('קודם קובעים את מיקום בית הכנסת');
  saveShulArea_(Object.assign({}, cur, { radius: r }));
  return shulInfo_();
}
/** Back to Secrets.gs (or no check, if it has no point). */
function gabbaiResetShulLocation(key, session) {
  checkSession_(key, session);
  saveShulArea_(null);
  return shulInfo_();
}
/** The same check a registration gets; nothing is stored. */
function gabbaiCheckLocation(key, session, loc) { return kioskCheckLocation(key, session, loc); }
