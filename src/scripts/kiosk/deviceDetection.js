// Registration page — what device the page runs on.
// FORCED_DEVICE comes from the link (&device=kiosk); see doGet in Kiosk.gs.
// Declarations only — nothing runs when the file loads; the page calls the start function.

/**
 * 'mobile' (a phone), 'tablet', 'desktop' — or 'kiosk' when the link says &device=kiosk (the shul's tablet).
 * Client hints first (Chrome/Edge/Android), then the user-agent string. iPadOS reports itself as a Mac,
 * so a "Mac" with a touch screen is a tablet.
 */
function detectDevice() {
  if (FORCED_DEVICE && FORCED_DEVICE.indexOf('__') !== 0) return FORCED_DEVICE;
  var ua = navigator.userAgent || '';
  var uad = navigator.userAgentData;
  if (/iPhone|iPod|Windows Phone|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0)) return 'tablet';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'mobile' : 'tablet';      // Android tablets omit "Mobile"
  if (uad && uad.mobile === true) return 'mobile';
  return 'desktop';
}
var DEVICE_NAMES = { mobile: 'טלפון נייד', tablet: 'טאבלט', desktop: 'מחשב', kiosk: 'טאבלט בית הכנסת' };
