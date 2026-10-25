// Gabbai tools page in a browser: login, every tool, logout; on a computer and at phone width
// (needs: npm install playwright). Served from a real origin so sessionStorage works.
const assert = require('assert');
const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx; G.setup(); G.setPin_('1234');   // an old-style short code, to see the "weak code" hint
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const today = G.todayKey_('Asia/Jerusalem');
env.userEdit('הגדרות', 'B3', G.keyToDate_(G.addDays_(today, -9), 'Asia/Jerusalem'));
env.web.url = 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec';
const key = env.props.KIOSK_KEY, pin = env.ctx.gabbaiPin_();
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

  // report to the Rebbe
  await p.click('#back'); await tile(p, 'rebbe');
  console.log('rebbe lead:', await p.textContent('#rebbeLead'));
  await p.click('#rebbeBtn'); await p.waitForTimeout(400);
  const rtext = await p.inputValue('#rebbeOutText');
  assert(rtext.startsWith('*דוח לרבי') && /^1\. משה כהן$/m.test(rtext) && /^2\. דוד לוי$/m.test(rtext), 'by surname: כהן before לוי\n' + rtext);
  assert(!/בגיליון/.test(await p.textContent('#rebbeOut')));
  assert((await p.getAttribute('#rebbeOutWa', 'href')).startsWith('https://wa.me/?text='));
  await p.screenshot({ path: 'test/shots/g13-rebbe.png', fullPage: true });

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

  // ---------- shul location, measured on a phone in the shul ----------
  const SH = { latitude: 31.9857703, longitude: 34.8582831 };
  const inShul = await browser.newContext({ userAgent: IPHONE, hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 },
                                            permissions: ['geolocation'], geolocation: Object.assign({ accuracy: 6 }, SH) });
  await inShul.grantPermissions(['geolocation'], { origin: 'https://kiosk.test' });
  p = await open(inShul);
  await p.fill('#pin', 'testcode9'); await p.click('#loginBtn'); await p.waitForTimeout(400);
  await tile(p, 'shul');
  assert(/כבויה/.test(await p.textContent('#shulBox')), 'no location yet');
  assert(await p.isHidden('#shulRadiusCard'));
  await p.click('#shulMeasure'); await p.waitForSelector('#shulSet:not([hidden])', { timeout: 25000 });
  console.log('measured:', (await p.textContent('#shulMeasureOut')).trim());
  await p.click('#shulSet'); assert(/בטוח/.test(await p.textContent('#shulSet')));
  await p.click('#shulSet'); await p.waitForTimeout(400);
  console.log('set:', (await p.textContent('#shulNote')).trim(), '|', (await p.textContent('#shulBox')).replace(/\s+/g, ' ').trim());
  assert(/רדיוס: 50 מ׳/.test(await p.textContent('#shulBox')));
  await p.fill('#shulRadius', '40'); await p.click('#shulRadiusSave'); await p.waitForTimeout(300);
  assert(/רדיוס: 40 מ׳/.test(await p.textContent('#shulBox')));
  await inShul.setGeolocation({ latitude: SH.latitude + 20 / 111320, longitude: SH.longitude, accuracy: 10 });
  await p.click('#shulTest'); await p.waitForTimeout(400);
  console.log('20 m away:', (await p.textContent('#shulTestOut')).trim());
  assert(/בתוך/.test(await p.textContent('#shulTestOut')));
  await inShul.setGeolocation({ latitude: SH.latitude + 84 / 111320, longitude: SH.longitude, accuracy: 30 });
  await p.click('#shulTest'); await p.waitForTimeout(400);
  console.log('84 m away:', (await p.textContent('#shulTestOut')).trim());
  assert(/מחוץ/.test(await p.textContent('#shulTestOut')));
  // a vague reading (as on most computers) can't be set
  await inShul.setGeolocation(Object.assign({ accuracy: 120 }, SH));
  await p.click('#shulMeasure'); await p.waitForTimeout(21500);
  console.log('vague:', (await p.textContent('#shulMeasureOut')).trim());
  assert(/לא מדויקת/.test(await p.textContent('#shulMeasureOut'))); assert(await p.isHidden('#shulSet'));
  assert(!(await overflow(p)), 'shul screen fits the phone');
  await p.screenshot({ path: 'test/shots/g11-phone-shul.png', fullPage: true });
  await p.close(); await inShul.close();

  // ---------- settings screen ----------
  const sctx = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, userAgent: IPHONE });
  p = await open(sctx);
  await p.fill('#pin', 'testcode9'); await p.click('#loginBtn'); await p.waitForTimeout(400);
  await tile(p, 'settings');
  assert.equal(await p.inputValue('#setFrom'), '0'); assert.equal(await p.inputValue('#setTo'), '24');
  await p.selectOption('#setFrom', '11'); await p.selectOption('#setTo', '8'); await p.click('#setSave'); await p.waitForTimeout(200);
  assert(/לפני/.test(await p.textContent('#settingsNote')), 'hours checked in the page');
  assert.equal(await p.$eval('#setFrom', s => s.options[17].text), '8:30', 'half-hour steps');
  await p.fill('#setName', 'מניין סטיינבך'); await p.selectOption('#setFrom', '8.5'); await p.selectOption('#setTo', '11'); await p.fill('#setPct', '70'); await p.fill('#setRebbe', '30');
  await p.click('#setSave'); await p.waitForTimeout(400);
  console.log('settings:', (await p.textContent('#settingsNote')).trim(), '| header:', await p.textContent('#sub'));
  const sNow = G.readSettings_(env.ss, 'Asia/Jerusalem');
  assert.equal(sNow.from, 8.5); assert.equal(sNow.to, 11); assert.equal(sNow.rebbe, 30);
  assert(/8:30–11:00/.test(await p.textContent('#settingsNote'))); assert.equal(sNow.threshold, 70); assert.equal(sNow.name, 'מניין סטיינבך');
  const nm = G.addDays_(today, 1);
  await p.fill('#noMinyanDate', nm); await p.click('#noMinyanAdd'); await p.waitForTimeout(400);
  assert(G.readSettings_(env.ss, 'Asia/Jerusalem').excluded.has(nm));
  await p.click('.nmDel'); await p.waitForTimeout(400);
  assert(!G.readSettings_(env.ss, 'Asia/Jerusalem').excluded.has(nm));
  assert(!(await overflow(p)), 'settings fit the phone');
  await p.screenshot({ path: 'test/shots/g12-phone-settings.png', fullPage: true });
  await p.click('#back'); await p.waitForTimeout(400);
  assert(/70%/.test(await p.textContent('#period')), 'home shows the new threshold');
  env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);   // back to "open all day" for the rest
  await p.close(); await sctx.close();

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
  for (const v of ['weekly', 'final', 'rebbe', 'draw', 'dups', 'link', 'shul', 'settings', 'pin']) {
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
