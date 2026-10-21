// Gabbai tools page in a browser: login, every tool, logout; on a computer and at phone width
// (needs: npm install playwright). Served from a real origin so sessionStorage works.
const assert = require('assert');
const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx; G.setup();
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const today = G.todayKey_('Asia/Jerusalem');
env.userEdit('הגדרות', 'B3', G.keyToDate_(G.addDays_(today, -9), 'Asia/Jerusalem'));
env.userEdit('הגדרות', 'B9', 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec');
const key = env.props.KIOSK_KEY, pin = String(env.ss.getSheetByName('הגדרות').getRange('B8').getValue());
const sess = G.kioskLogin(key, pin).token;
const sub = d => G.kioskSubmit(key, Object.assign({ device: 'tablet' }, d));
const past = [1, 2, 3, 4, 5, 6, 7, 8].map(n => G.addDays_(today, -n)).filter(d => G.dow_(d) !== 6);
sub({ phone: '0521111111', first: 'משה', last: 'כהן' });
sub({ phone: '0522222222', first: 'דוד', last: 'לוי' });
past.forEach(d => sub({ phone: '0521111111', session: sess, date: d }));
// a duplicate: "דוד לוי" once more without a phone
{ const c = G.loadCtx_(env.ss); G.createPerson_(c, { first: 'דוד', last: 'לוי', phone: '' }); G.flushCtx_(c); G.cacheClear_(); }

const shim = `(function(){function r(h){return new Proxy({},{get:function(_,p){if(p==='withSuccessHandler')return function(f){return r(Object.assign({},h,{ok:f}))};if(p==='withFailureHandler')return function(f){return r(Object.assign({},h,{fail:f}))};return function(){var a=[].slice.call(arguments);window.__gs(p,JSON.stringify(a)).then(function(x){var o=JSON.parse(x);if(o.err){h.fail&&h.fail({message:o.err})}else{h.ok&&h.ok(o.val)}})}}})}window.google={script:{run:r({})}}})();`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function open(ctx) {
    const p = await ctx.newPage();
    p.on('pageerror', e => errors.push(e.message));
    await p.exposeFunction('__gs', (fn, a) => { G.__webContext = true; try { return JSON.stringify({ val: G[fn](...JSON.parse(a)) }); } catch (e) { return JSON.stringify({ err: e.message }); } finally { G.__webContext = false; } });
    const html = G.doGet({ parameter: { k: key, view: 'gabbai' } }).html.replace('<head>', '<head><script>' + shim + '</script>');
    await p.route('https://kiosk.test/', r => r.fulfill({ contentType: 'text/html', body: html }));
    await p.route(/fonts\.g|cdnjs/, r => r.abort());
    await p.goto('https://kiosk.test/'); await p.waitForTimeout(400);
    return p;
  }
  const overflow = p => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const tile = (p, v) => p.click('[data-go=' + v + ']').then(() => p.waitForTimeout(400));

  // ---------- computer ----------
  const desk = await browser.newContext({ viewport: { width: 1100, height: 800 }, locale: 'he-IL' });
  let p = await open(desk);
  assert(await p.isVisible('#v-login'), 'without a session: login');
  await p.fill('#pin', 'wrong'); await p.click('#loginBtn'); await p.waitForTimeout(300);
  assert(/שגוי/.test(await p.textContent('#loginNote')));
  await p.fill('#pin', pin); await p.press('#pin', 'Enter'); await p.waitForTimeout(400);
  assert(await p.isVisible('#v-home'));
  assert(/לקוד ארוך יותר/.test(await p.textContent('#homeNote')), 'weak code warning');
  console.log('home:', (await p.textContent('#sub')).trim(), '|', (await p.textContent('#period')).trim());
  await p.screenshot({ path: 'test/shots/g1-home.png' });

  // import → review
  await tile(p, 'import');
  await p.fill('#waText', past[0].slice(8, 10) + '/' + past[0].slice(5, 7) + '\nכהן משה\nשניאורסון\nלוי דוד');
  await p.click('#parseBtn'); await p.waitForTimeout(400);
  console.log('import bar:', await p.textContent('#barMsg'));
  await p.click('#barBtn'); await p.waitForTimeout(500);
  assert(await p.isVisible('#v-review'));
  console.log('review:', await p.textContent('#revSummary'));
  await p.click('#confirmAll'); await p.waitForTimeout(100);
  for (const g of await p.$$('.group')) {
    const conf = await g.$('[data-k=confirm]'); if (conf && !(await conf.isChecked())) await conf.click();
  }
  await p.screenshot({ path: 'test/shots/g2-review.png', fullPage: true });
  await p.click('#barBtn'); await p.waitForTimeout(500);
  console.log('saved:', (await p.textContent('#revNote')).trim());
  assert(/נשמרו/.test(await p.textContent('#revNote')));

  // weekly report
  await p.click('#back'); await p.waitForTimeout(300); await tile(p, 'weekly');
  await p.click('#weeklyBtn'); await p.waitForTimeout(400);
  const wtext = await p.inputValue('#weeklyOutText');
  assert(/משה כהן/.test(wtext));
  assert((await p.getAttribute('#weeklyOutWa', 'href')).startsWith('https://wa.me/?text='));
  await p.screenshot({ path: 'test/shots/g3-weekly.png', fullPage: true });
  console.log('weekly text, 1st line:', wtext.split('\n')[0]);

  // final summary
  await p.click('#back'); await tile(p, 'final');
  console.log('final lead:', await p.textContent('#finalLead'));
  await p.click('#finalBtn'); await p.waitForTimeout(400);
  const ftext = await p.inputValue('#finalOutText');
  assert(/משה כהן — \d+\/\d+ ✓/.test(ftext) && /דוד לוי — \d+\/\d+$/m.test(ftext), ftext);

  // lottery: two taps
  await p.click('#back'); await tile(p, 'draw');
  console.log('draw list:', (await p.$$eval('#drawBox li', l => l.map(x => x.textContent))).join(' | '));
  await p.click('#drawBtn'); await p.waitForTimeout(100);
  assert(/בטוח/.test(await p.textContent('#drawBtn')));
  await p.click('#drawBtn'); await p.waitForTimeout(400);
  console.log('winner:', (await p.textContent('.winner .who')).trim());
  await p.screenshot({ path: 'test/shots/g4-draw.png' });

  // duplicates
  await p.click('#back'); await tile(p, 'dups');
  const nPairs = (await p.$$('#dupsList .group')).length;
  console.log('duplicate pairs:', nPairs);
  assert(nPairs >= 1);
  await p.click('.dupOn >> nth=0'); await p.waitForTimeout(100);
  await p.screenshot({ path: 'test/shots/g5-dups.png', fullPage: true });
  await p.click('#barBtn'); await p.waitForTimeout(500);
  console.log('merge:', (await p.textContent('#dupsNote')).trim());
  assert(/מוזגו 1/.test(await p.textContent('#dupsNote')));

  // link
  await p.click('#back'); await tile(p, 'link');
  assert.equal((await p.textContent('#url')).trim(), 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec?k=' + key);
  await p.screenshot({ path: 'test/shots/g6-link.png' });

  // change the code, then log out
  await p.click('#back'); await tile(p, 'pin');
  await p.fill('#pinCur', pin); await p.fill('#pinNew', 'testcode9'); await p.fill('#pinNew2', 'testcode92');
  await p.click('#pinSave'); await p.waitForTimeout(200);
  assert(/לא זהה/.test(await p.textContent('#pinNote')));
  await p.fill('#pinNew2', 'testcode9'); await p.click('#pinSave'); await p.waitForTimeout(400);
  console.log('pin:', (await p.textContent('#pinNote')).trim());
  assert(/שונה/.test(await p.textContent('#pinNote')));
  await p.click('#back'); await p.waitForTimeout(300);
  assert(await p.isVisible('#v-home'), 'still logged in after changing the code');
  await p.click('#logout'); await p.waitForTimeout(300);
  assert(await p.isVisible('#v-login'));
  console.log('logout:', (await p.textContent('#loginNote')).trim());
  await p.close();

  // a session from the registration page (same tab) opens the tools directly; an ended one asks for the code
  const fresh = G.kioskLogin(key, 'testcode9').token;
  await desk.addInitScript(t => sessionStorage.setItem('minyanSession', t), fresh);
  p = await open(desk);
  assert(await p.isVisible('#v-home'), 'session carried over');
  G.kioskLogout(key, fresh);
  await tile(p, 'review');
  assert(await p.isVisible('#v-login'), 'ended session → login');
  console.log('ended session →', (await p.textContent('#loginNote')).trim());
  await p.close(); await desk.close();

  // ---------- phone ----------
  const phone = await browser.newContext({ userAgent: IPHONE, hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } });
  p = await open(phone);
  await p.fill('#pin', 'testcode9'); await p.click('#loginBtn'); await p.waitForTimeout(400);
  assert(!(await overflow(p)), 'home fits the phone');
  await p.screenshot({ path: 'test/shots/g7-phone-home.png', fullPage: true });
  sub({ first: 'אברהם', last: 'רבינוביץ', device: 'mobile', loc: { error: 'denied' }, outsideOk: true });   // something to review
  await tile(p, 'import');
  await p.fill('#waText', past[1].slice(8, 10) + '/' + past[1].slice(5, 7) + '\nכהן\nגולדשטיין, פרידמן');
  await p.click('#parseBtn'); await p.waitForTimeout(400);
  assert(!(await overflow(p)), 'import preview fits the phone');
  await p.screenshot({ path: 'test/shots/g8-phone-import.png', fullPage: true });
  await p.click('#barBtn'); await p.waitForTimeout(500);
  assert(!(await overflow(p)), 'review fits the phone');
  await p.screenshot({ path: 'test/shots/g9-phone-review.png', fullPage: true });
  for (const v of ['weekly', 'final', 'draw', 'dups', 'link', 'pin']) {
    await p.click('#back'); await p.waitForTimeout(200); await tile(p, v);
    if (v === 'weekly') { await p.click('#weeklyBtn'); await p.waitForTimeout(300); }
    assert(!(await overflow(p)), v + ' fits the phone');
  }
  await p.screenshot({ path: 'test/shots/g10-phone-pin.png', fullPage: true });
  await p.close(); await phone.close();
  await browser.close();
  assert.deepEqual(errors, []);
  console.log('gabbai tools page OK');
})().catch(e => { console.error(e); process.exit(1); });
