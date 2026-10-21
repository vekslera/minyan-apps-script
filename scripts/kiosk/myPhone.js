// Registration page — on a personal phone (not the shul's tablet, not gabbai mode) the phone number, if
// given, is remembered on that phone, so next time one tap registers. It stays optional: without it the
// person is identified by surname as usual.
// A web page cannot read the device's own number; this is the closest substitute: the browser may offer
// it as autofill the first time (autocomplete="tel"), and after that the page remembers it.
// Declarations only — nothing runs when the file loads; the page calls the start function.

var MY_PHONE_KEY = 'minyanMyPhone';

function onPersonalPhone() { return DEVICE === 'mobile' && !S.pin; }
function savedPhone() { try { return localStorage.getItem(MY_PHONE_KEY) || ''; } catch (e) { return ''; } }
function rememberPhone(p) { try { localStorage.setItem(MY_PHONE_KEY, p); } catch (e) {} }
function forgetPhone() { try { localStorage.removeItem(MY_PHONE_KEY); } catch (e) {} }

/** On a personal phone: lets the browser offer the owner's number and says it will be remembered. */
function setupPersonalPhone() {
  var on = onPersonalPhone();
  $('phoneNote').textContent = on ? '(יישמר בטלפון לפעם הבאה)' : '(מספיק בפעמים הבאות)';
  $('phone').setAttribute('autocomplete', on ? 'tel' : 'off');
  $('phone').setAttribute('name', on ? 'tel' : 'phone');
}

/** Fills in the number remembered on this phone and looks it up. */
function prefillPhone() {
  S.fromSaved = false;
  show('notMe', false);
  if (!onPersonalPhone()) return;
  var p = savedPhone();
  if (!p || !validPhone_(p)) return;
  $('phone').value = fmtPhone_(p);
  S.fromSaved = true;
  show('notMe', true);
  phoneLookup(p);
}

/** "זה לא אני": forget the remembered number (e.g. a phone shared in the family) and start clean. */
function notMe() {
  forgetPhone();
  reset();
  $('phone').focus();
}
