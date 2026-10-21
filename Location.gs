// ======================================================================================
//  LOCATION CHECK
//  Self-registrations (phone/tablet, not gabbai mode, not the shul tablet) must come from the shul.
//  The page sends the browser's position with the registration; it is used here for one comparison and
//  NEVER stored. Only the outcome may be stored: "inside", or for the review list a rounded distance
//  ("מחוץ לבית הכנסת, ~850 מ׳") or the reason no position was available.
//  The shul's point and radius come from Secrets.gs (shulLat, shulLng, shulRadius). Without them the
//  check is off.
// ======================================================================================

/** {lat, lng, radius} of the shul from Secrets.gs, or null when the check is not configured. */
function shulArea_() {
  const lat = Number(secret_('shulLat')), lng = Number(secret_('shulLng'));
  if (!lat || !lng || !isFinite(lat) || !isFinite(lng)) return null;
  const radius = Number(secret_('shulRadius'));
  return { lat: lat, lng: lng, radius: radius > 0 ? radius : 150 };
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
 * metres, so a reading counts as inside if the shul is within its accuracy circle (up to one extra radius).
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
  return { inside: distance <= area.radius + Math.min(accuracy, area.radius),
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
function kioskCheckLocation(key, pin, loc) {
  checkKey_(key);
  const ss = SpreadsheetApp.getActive();
  const s = readSettings_(ss, ss.getSpreadsheetTimeZone());
  if (!s.pin || String(pin).trim() !== s.pin) throw new Error('קוד הגבאי שגוי');
  const area = shulArea_();
  if (!area) return { configured: false };
  const chk = checkLocation_(loc);
  logLocationCheck_({ device: 'gabbai-test', inside: chk.inside, distance: chk.distance, accuracy: chk.accuracy, reason: chk.reason });
  return { configured: true, radius: area.radius, inside: chk.inside, distance: chk.distance, accuracy: chk.accuracy,
           reason: chk.reason ? LOCATION_REASONS[chk.reason] : '' };
}
