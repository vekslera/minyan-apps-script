// Device detection on the registration page, with emulated browsers (needs: npm install playwright).
const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx; G.setup();
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const key = env.props.KIOSK_KEY;
const UA = {
  iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  iPadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  iPadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};
const cases = [
  ['iPhone', UA.iPhone, true, 'mobile'], ['Android phone', UA.androidPhone, true, 'mobile'],
  ['Android tablet', UA.androidTablet, true, 'tablet'], ['old iPad', UA.iPadOld, true, 'tablet'],
  ['iPadOS (desktop UA + touch)', UA.iPadOS, true, 'tablet'], ['Mac desktop', UA.macDesktop, false, 'desktop'],
  ['Windows desktop', UA.windows, false, 'desktop'], ['Android phone + &device=kiosk', UA.androidPhone, true, 'kiosk', 'kiosk'],
];
const shim = `(function(){function r(h){return new Proxy({},{get:function(_,p){if(p==='withSuccessHandler')return function(f){return r(Object.assign({},h,{ok:f}))};if(p==='withFailureHandler')return function(f){return r(Object.assign({},h,{fail:f}))};return function(){var a=[].slice.call(arguments);window.__gs(p,JSON.stringify(a)).then(function(x){var o=JSON.parse(x);if(o.err){h.fail&&h.fail({message:o.err})}else{h.ok&&h.ok(o.val)}})}}})}window.google={script:{run:r({})}}})();`;
(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const [name, ua, touch, want, forced] of cases) {
    const ctx = await browser.newContext({ userAgent: ua, hasTouch: touch, isMobile: want === 'mobile', viewport: { width: 400, height: 800 } });
    const p = await ctx.newPage();
    await p.exposeFunction('__gs', (fn, a) => { G.__webContext = true; try { return JSON.stringify({ val: G[fn](...JSON.parse(a)) }); } catch (e) { return JSON.stringify({ err: e.message }); } finally { G.__webContext = false; } });
    await p.route('**/*', r => /fonts\.g/.test(r.request().url()) ? r.abort() : r.continue());
    const html = G.doGet({ parameter: forced ? { k: key, device: forced } : { k: key } }).html;
    await p.setContent(html.replace('<head>', '<head><script>' + shim + '</script>'));
    await p.waitForTimeout(250);
    const got = await p.evaluate(() => DEVICE);
    const label = await p.textContent('#deviceLabel');
    if (got !== want) bad++;
    console.log((got === want ? 'ok  ' : 'FAIL') + ' ' + name.padEnd(30) + ' → ' + got.padEnd(8) + ' "' + label + '"');
    await ctx.close();
  }
  await browser.close();
  console.log(bad ? bad + ' FAILED' : 'device detection OK');
  process.exit(bad ? 1 : 0);
})();
