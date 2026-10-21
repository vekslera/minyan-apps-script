// Personal phone flow on the registration page (needs: npm install playwright).
// The page is served from a real origin so that localStorage works, as it does on Google's servers.
const assert = require('assert');
const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx; G.setup();
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const key = env.props.KIOSK_KEY;
G.kioskSubmit(key, { phone: '0521111111', first: 'משה', last: 'כהן' });
const shim = `(function(){function r(h){return new Proxy({},{get:function(_,p){if(p==='withSuccessHandler')return function(f){return r(Object.assign({},h,{ok:f}))};if(p==='withFailureHandler')return function(f){return r(Object.assign({},h,{fail:f}))};return function(){var a=[].slice.call(arguments);window.__gs(p,JSON.stringify(a)).then(function(x){var o=JSON.parse(x);if(o.err){h.fail&&h.fail({message:o.err})}else{h.ok&&h.ok(o.val)}})}}})}window.google={script:{run:r({})}}})();`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const TABLET = 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
(async () => {
  const browser = await chromium.launch();
  async function open(ctx, params) {
    const p = await ctx.newPage();
    p.on('pageerror', e => { throw e; });
    await p.exposeFunction('__gs', (fn, a) => { G.__webContext = true; try { return JSON.stringify({ val: G[fn](...JSON.parse(a)) }); } catch (e) { return JSON.stringify({ err: e.message }); } finally { G.__webContext = false; } });
    const html = G.doGet({ parameter: Object.assign({ k: key }, params || {}) }).html.replace('<head>', '<head><script>' + shim + '</script>');
    await p.route('https://kiosk.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
    await p.route(/fonts\.g/, r => r.abort());
    await p.goto('https://kiosk.test/'); await p.waitForTimeout(400);
    return p;
  }
  const phoneCtx = await browser.newContext({ userAgent: IPHONE, hasTouch: true, isMobile: true, viewport: { width: 390, height: 760 } });
  // 1st visit on a phone: number required, field offers autofill
  let p = await open(phoneCtx);
  assert.equal(await p.isVisible('#phoneReq'), true);
  assert.equal(await p.getAttribute('#phone', 'autocomplete'), 'tel');
  await p.fill('#last', 'כהן'); await p.fill('#first', 'משה'); await p.click('#submit'); await p.waitForTimeout(200);
  console.log('no number on a phone →', await p.textContent('#msg'));
  await p.fill('#phone', '052-111-1111'); await p.waitForTimeout(300);
  await p.click('#submit'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => localStorage.getItem('minyanMyPhone')), '0521111111');
  await p.screenshot({ path: 'test/shots/m1-first.png' });
  await p.close();
  // 2nd visit on the same phone: number filled in and recognized
  p = await open(phoneCtx);
  console.log('2nd visit: field =', await p.inputValue('#phone'), '| greeting =', (await p.textContent('#phoneHit')).trim(), '| "not me" shown:', await p.isVisible('#notMe'));
  assert.equal(await p.inputValue('#phone'), '052-1111111');
  assert(/משה כהן/.test(await p.textContent('#phoneHit')));
  await p.screenshot({ path: 'test/shots/m2-second-visit.png' });
  // "not me" clears it
  await p.click('#notMe'); await p.waitForTimeout(100);
  assert.equal(await p.inputValue('#phone'), ''); assert.equal(await p.evaluate(() => localStorage.getItem('minyanMyPhone')), null);
  console.log('"זה לא אני" → cleared');
  await p.close();
  // gabbai mode on a phone: nothing required or prefilled
  await phoneCtx.addInitScript(() => localStorage.setItem('minyanMyPhone', '0521111111'));
  p = await open(phoneCtx);
  const pin = String(env.ss.getSheetByName('הגדרות').getRange('B8').getValue());
  await p.click('#gabbaiOn'); await p.fill('#pin', pin); await p.click('#pinOk'); await p.waitForTimeout(300);
  assert.equal(await p.isVisible('#phoneReq'), false); assert.equal(await p.inputValue('#phone'), '');
  console.log('gabbai mode on a phone → not required, not prefilled');
  await p.close(); await phoneCtx.close();
  // the shul tablet: never required, never remembered
  const tabCtx = await browser.newContext({ userAgent: TABLET, hasTouch: true });
  p = await open(tabCtx, { device: 'kiosk' });
  assert.equal(await p.isVisible('#phoneReq'), false); assert.equal(await p.getAttribute('#phone', 'autocomplete'), 'off');
  await p.fill('#phone', '0521111111'); await p.waitForTimeout(300); await p.click('#submit'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => localStorage.getItem('minyanMyPhone')), null);
  console.log('shul tablet → not required, nothing remembered');
  await browser.close();
  console.log('mobile flow OK');
})().catch(e => { console.error(e); process.exit(1); });
