// Location check on the registration page, with emulated GPS (needs: npm install playwright).
const assert = require('assert');
const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const SHUL = { latitude: 31.9857703, longitude: 34.8582831 };
const north = m => ({ latitude: SHUL.latitude + m / 111320, longitude: SHUL.longitude });
const env = makeEnv(); const G = env.ctx; G.setup();
// The shul's point in the הגדרות sheet, as the gabbai's "מיקום בית הכנסת" screen would write it.
G.setSettings_({ 'מיקום בית הכנסת — קו רוחב': SHUL.latitude, 'מיקום בית הכנסת — קו אורך': SHUL.longitude, 'רדיוס מותר (מטרים)': 150 });
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const key = env.props.KIOSK_KEY, pin = env.ctx.gabbaiPin_();
G.kioskSubmit(key, { phone: '0521111111', first: 'משה', last: 'כהן', device: 'kiosk' });
const shim = `(function(){function r(h){return new Proxy({},{get:function(_,p){if(p==='withSuccessHandler')return function(f){return r(Object.assign({},h,{ok:f}))};if(p==='withFailureHandler')return function(f){return r(Object.assign({},h,{fail:f}))};return function(){var a=[].slice.call(arguments);window.__gs(p,JSON.stringify(a)).then(function(x){var o=JSON.parse(x);if(o.err){h.fail&&h.fail({message:o.err})}else{h.ok&&h.ok(o.val)}})}}})}window.google={script:{run:r({})}}})();`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sent = [];
(async () => {
  const browser = await chromium.launch();
  async function open(ctxOpts, params) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 760 } }, ctxOpts));
    const p = await ctx.newPage();
    p.on('pageerror', e => { throw e; });
    await p.exposeFunction('__gs', (fn, a) => {
      const args = JSON.parse(a); if (fn === 'kioskSubmit') sent.push(args[1]);
      G.__webContext = true; try { return JSON.stringify({ val: G[fn](...args) }); } catch (e) { return JSON.stringify({ err: e.message }); } finally { G.__webContext = false; }
    });
    const html = G.doGet({ parameter: Object.assign({ k: key }, params || {}) }).html.replace('<head>', '<head><script>' + shim + '</script>');
    await p.route('https://kiosk.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
    await p.route(/fonts\.g/, r => r.abort());
    await p.goto('https://kiosk.test/'); await p.waitForTimeout(400);
    return { ctx, p };
  }
  const phone = { userAgent: IPHONE, hasTouch: true, isMobile: true, permissions: ['geolocation'] };

  // 1. inside the shul → registered
  let { ctx, p } = await open(Object.assign({ geolocation: Object.assign(north(30), { accuracy: 15 }) }, phone));
  assert(await p.isVisible('#locNote') && /המיקום לא נשמר/.test(await p.textContent('#locNote')), 'privacy note on the form');
  await p.fill('#phone', '0521111111'); await p.waitForTimeout(300); await p.click('#submit'); await p.waitForTimeout(500);
  console.log('inside →', (await p.textContent('#doneTitle')).trim());
  assert(/משה כהן/.test(await p.textContent('#doneTitle')));
  await ctx.close();

  // 1b. the &debug=1 timing panel: every step of a registration, with the server's share
  ({ ctx, p } = await open(Object.assign({ geolocation: Object.assign(north(30), { accuracy: 15 }) }, phone), { debug: '1' }));
  await p.fill('#phone', '0521111111'); await p.waitForTimeout(300); await p.click('#submit'); await p.waitForTimeout(500);
  const rows = await p.$$eval('#timingRows > div', d => d.map(x => x.textContent));
  console.log('timing panel:\n  ' + rows.join('\n  '));
  ['server built the page', 'page code running', "today's data came with the page", 'form ready', 'GPS — early reading started',
   'tap: register', 'GPS — early reading, ±15 m', 'kioskSubmit (server ', 'confirmation shown']
    .forEach(l => assert(rows.some(r => r.includes(l)), 'timing row: ' + l));
  assert(!rows.some(r => r.includes('kioskInit')), 'no second call when the page opens');
  const ph = await p.$eval('#timing', b => b.getBoundingClientRect().height);
  assert(ph < 110, 'compact panel (about 4 lines): ' + ph + ' px');
  await p.screenshot({ path: 'test/shots/l0-timing.png' });
  await p.click('#timingHide'); assert(await p.isVisible('#timingShow')); assert(await p.isHidden('#timing'));
  await p.click('#timingShow'); assert(await p.isVisible('#timing'));
  await ctx.close();
  ({ ctx, p } = await open(Object.assign({ geolocation: north(30) }, phone)));
  assert.equal(await p.$('#timing'), null, 'no panel without &debug=1');
  await ctx.close();

  // 1c. the early reading follows the person: page opened outside, walks in while typing → registered as inside
  ({ ctx, p } = await open(Object.assign({ geolocation: Object.assign(north(900), { accuracy: 15 }) }, phone), { debug: '1' }));
  await p.waitForTimeout(300);
  await ctx.setGeolocation(Object.assign(north(25), { accuracy: 12 }));    // walked in
  await p.waitForTimeout(300);
  await p.fill('#phone', '0521111111'); await p.waitForTimeout(300); await p.click('#submit'); await p.waitForTimeout(500);
  assert(/משה כהן/.test(await p.textContent('#doneTitle')), 'the latest early reading is used');
  await ctx.close();

  // 2. outside → told so; walks in and retries → registered
  ({ ctx, p } = await open(Object.assign({ geolocation: Object.assign(north(850), { accuracy: 20 }) }, phone)));
  await p.fill('#last', 'לוי'); await p.fill('#first', 'דוד'); await p.click('#submit'); await p.waitForTimeout(500);
  assert.equal(await p.isVisible('#where'), true);
  console.log('outside →', (await p.textContent('#whereTitle')).trim(), '|', (await p.textContent('#whereText')).trim().slice(0, 40));
  await p.screenshot({ path: 'test/shots/l1-outside.png' });
  await ctx.setGeolocation(Object.assign(north(40), { accuracy: 15 }));
  await p.click('#whereRetry'); await p.waitForTimeout(1500);
  console.log('after walking in + retry →', (await p.textContent('#doneTitle')).trim());
  assert(/דוד לוי/.test(await p.textContent('#doneTitle')));
  // 3. outside again → sends it for the gabbai's approval
  await p.click('#again');
  await ctx.setGeolocation(Object.assign(north(2000), { accuracy: 20 }));
  await p.fill('#last', 'פרידמן'); await p.fill('#first', 'יוסף'); await p.click('#submit'); await p.waitForTimeout(500);
  await p.click('#whereSend'); await p.waitForTimeout(500);
  console.log('send for approval →', (await p.textContent('#doneTitle')).trim(), '/', (await p.textContent('#doneText')).trim());
  assert.equal((await p.textContent('#doneTitle')).trim(), 'הרישום התקבל');
  await ctx.close();

  // 4. location permission refused → explained
  ({ ctx, p } = await open({ userAgent: IPHONE, hasTouch: true, isMobile: true }));
  await p.fill('#last', 'כהן'); await p.click('#submit'); await p.waitForTimeout(800);
  console.log('no permission →', (await p.textContent('#whereTitle')).trim(), '|', (await p.textContent('#whereText')).trim().slice(0, 50));
  assert.equal((await p.textContent('#whereTitle')).trim(), 'לא התקבל מיקום');
  assert(await p.isVisible('#whereAllow')); assert(await p.isHidden('#whereRetry'));
  assert(/שירותי מיקום/.test(await p.textContent('#whereText')) && /אתרי Safari/.test(await p.textContent('#whereText')), 'iPhone steps');
  assert(/המיקום לא נשמר/.test(await p.textContent('#whereText')), 'privacy note when asking to enable location');
  await p.screenshot({ path: 'test/shots/l2-no-permission.png', fullPage: true });
  // still refused → the steps again; then the person allows it → "אפשר מיקום" registers
  await p.click('#whereAllow'); await p.waitForTimeout(500);
  assert(/עדיין/.test(await p.textContent('#whereText')));
  await ctx.grantPermissions(['geolocation'], { origin: 'https://kiosk.test' });
  await ctx.setGeolocation(Object.assign(north(25), { accuracy: 12 }));
  await p.click('#whereAllow'); await p.waitForTimeout(600);
  console.log('after allowing →', (await p.textContent('#doneTitle')).trim());
  assert(/כהן/.test(await p.textContent('#doneTitle')));
  await ctx.close();

  // 4b. Android with location switched off (the browser reports "position unavailable") → Android steps
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 760 }, userAgent: ANDROID, hasTouch: true, isMobile: true });
  await ctxA.addInitScript(() => {
    window.__gpsOff = true;
    const real = navigator.geolocation;
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(ok, fail, o) { if (window.__gpsOff) setTimeout(() => fail({ code: 2 }), 50); else setTimeout(() => ok({ coords: { latitude: 31.9859, longitude: 34.85828, accuracy: 10 } }), 50); },
      watchPosition() { return 0; }, clearWatch() {} } });
  });
  ({ p } = await (async () => { const pg = await ctxA.newPage(); pg.on('pageerror', e => { throw e; });
    await pg.exposeFunction('__gs', (fn, a) => { G.__webContext = true; try { return JSON.stringify({ val: G[fn](...JSON.parse(a)) }); } catch (e) { return JSON.stringify({ err: e.message }); } finally { G.__webContext = false; } });
    const html = G.doGet({ parameter: { k: key } }).html.replace('<head>', '<head><script>' + shim + '</script>');
    await pg.route('https://kiosk.test/', r => r.fulfill({ contentType: 'text/html', body: html })); await pg.route(/fonts\.g/, r => r.abort());
    await pg.goto('https://kiosk.test/'); await pg.waitForTimeout(400); return { p: pg }; })());
  await p.fill('#last', 'כהן'); await p.click('#submit'); await p.waitForTimeout(600);
  console.log('Android, location off →', (await p.textContent('#whereText')).replace(/\s+/g, ' ').trim().slice(0, 90));
  assert(/כבוי/.test(await p.textContent('#whereText')) && /מושכים את המסך/.test(await p.textContent('#whereText')));
  await p.evaluate(() => { window.__gpsOff = false; });                // the person switches location on
  await p.click('#whereAllow'); await p.waitForTimeout(600);
  assert(/כהן/.test(await p.textContent('#doneTitle')), 'registered after switching location on');
  await ctxA.close();

  // 5. a computer: self-registration closed, gabbai mode works, with the location test
  ({ ctx, p } = await open({ permissions: ['geolocation'], geolocation: Object.assign(north(60), { accuracy: 12 }) }));
  console.log('computer →', (await p.textContent('#closed')).trim());
  assert(await p.isHidden('#locNote'), 'no location note where nothing is checked');
  assert.equal(await p.isVisible('#form'), false);
  await p.click('#gabbaiOn'); await p.fill('#pin', pin); await p.click('#pinOk'); await p.waitForTimeout(400);
  assert.equal(await p.isVisible('#form'), true);
  await p.click('#locTest'); await p.waitForTimeout(500);
  console.log('gabbai location test →', (await p.textContent('#msg')).trim());
  assert(/60 מ׳/.test(await p.textContent('#msg')));
  await ctx.close();

  // 6. the shul tablet link (&device=kiosk) never asks for a location
  ({ ctx, p } = await open({ userAgent: IPHONE, hasTouch: true }, { device: 'kiosk' }));
  await p.fill('#phone', '0521111111'); await p.waitForTimeout(300); await p.click('#submit'); await p.waitForTimeout(500);
  assert(/משה כהן/.test(await p.textContent('#doneTitle'))); console.log('shul tablet → registered without location');
  await ctx.close();

  // the coordinates went to the server only with self-registrations, and were never stored
  assert(sent.filter(s => s.loc && s.loc.lat).length >= 3);
  assert(!/31\.98|34\.85/.test(JSON.stringify(env.ss.getSheets().filter(s => s.name !== 'הגדרות').map(s => s.data))), 'no registrant position stored');
  await browser.close();
  console.log('location flow OK');
})().catch(e => { console.error(e); process.exit(1); });
