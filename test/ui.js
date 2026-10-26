const { chromium } = require('playwright');
const { makeEnv } = require('./mock');
const env = makeEnv(); const G = env.ctx;
G.setup();
const st = env.ss.getSheetByName('הגדרות');
env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
const today = G.todayKey_('Asia/Jerusalem');
env.userEdit('הגדרות', 'B3', G.keyToDate_(G.addDays_(today, -9), 'Asia/Jerusalem'));
const key = env.props.KIOSK_KEY, tok = env.props.ADMIN_TOKEN, pin = G.gabbaiPin_();
const sess = G.kioskLogin(key, pin).token;
const sub = d => G.kioskSubmit(key, Object.assign({ device: 'tablet' }, d));
sub({ phone: '0521111111', first: 'משה', last: 'כהן' });
sub({ phone: '0544444444', first: 'יצחק', last: 'כהן' });
sub({ first: 'דוד', last: 'לוי' });
sub({ phone: '0533333333', first: 'יוסף', last: 'פרידמן' });
sub({ phone: '+1 646 555 0199', first: 'יוסי', last: 'קליין' });
const past = [1,2,3,4,5,6,7,8].map(n => G.addDays_(today, -n)).filter(d => G.dow_(d) !== 6);
past.slice(0, 6).forEach(d => sub({ phone: '0521111111', session: sess, date: d }));

const shim = `
  (function(){
    function runner(h){ return new Proxy({}, { get: function(_, prop){
      if (prop === 'withSuccessHandler') return function(f){ return runner(Object.assign({}, h, {ok:f})); };
      if (prop === 'withFailureHandler') return function(f){ return runner(Object.assign({}, h, {fail:f})); };
      return function(){ var args = Array.prototype.slice.call(arguments);
        window.__gs(prop, JSON.stringify(args)).then(function(r){ var o = JSON.parse(r);
          if (o.err) { h.fail && h.fail({message:o.err}); } else { h.ok && h.ok(o.val); } }); };
    }}); }
    window.google = { script: { run: runner({}) } };
  })();`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function page(html, vp, web) {
    const p = await browser.newPage({ viewport: vp, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) errors.push('console: ' + m.text()); });
    await p.exposeFunction('__gs', (fn, a) => {
      G.__webContext = web;
      try { return JSON.stringify({ val: G[fn](...JSON.parse(a)) }); }
      catch (e) { return JSON.stringify({ err: e.message }); }
      finally { G.__webContext = false; }
    });
    await p.route('**/*', r => /fonts\.g|cdnjs/.test(r.request().url()) ? r.abort() : r.continue());
    await p.setContent(html.replace('<head>', '<head><script>' + shim + '</script>'), { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(400);
    return p;
  }
  // ---------- Kiosk (tablet portrait) ----------
  const kioskHtml = G.doGet({ parameter: { k: key, device: 'kiosk' } }).html;   // the headless browser looks like a computer
  let k = await page(kioskHtml, { width: 800, height: 1000 }, true);
  console.log('hebDate:', await k.textContent('#hebDate'), '|', await k.textContent('#gregDate'));
  await k.screenshot({ path: 'shots/k1-start.png' });
  await k.fill('#phone', '052-111-1111'); await k.waitForTimeout(500);
  console.log('phone hit:', await k.textContent('#phoneHit'));
  await k.screenshot({ path: 'shots/k2-phone.png' });
  await k.fill('#phone', '(646) 555-0199'); await k.waitForTimeout(500);
  console.log('US phone hit:', await k.textContent('#phoneHit'));
  await k.fill('#phone', '03-612'); await k.waitForTimeout(500);
  console.log('partial landline, hit hidden:', await k.isHidden('#phoneHit'));
  await k.fill('#phone', '052-111-1111'); await k.waitForTimeout(500);
  await k.click('#submit'); await k.waitForTimeout(400);
  console.log('done:', (await k.textContent('#done')).replace(/\s+/g, ' ').trim());
  await k.screenshot({ path: 'shots/k3-done.png' });
  await k.click('#again');
  await k.fill('#last', 'כה'); await k.waitForTimeout(600);
  console.log('chips:', await k.$$eval('.chip', els => els.map(e => e.textContent)));
  await k.screenshot({ path: 'shots/k4-chips.png' });
  await k.click('.chip >> nth=1'); await k.click('#submit'); await k.waitForTimeout(400);
  console.log('done2:', (await k.textContent('#done')).replace(/\s+/g, ' ').trim());
  await k.click('#again');
  await k.fill('#last', 'רבינוביץ'); await k.fill('#first', 'אברהם'); await k.fill('#phone', '0501234567'); await k.waitForTimeout(500);
  console.log('new phone hint:', await k.textContent('#phoneHit'));
  await k.screenshot({ path: 'shots/k5-new.png' });
  await k.click('#submit'); await k.waitForTimeout(400);
  console.log('done3:', (await k.textContent('#done')).replace(/\s+/g, ' ').trim());
  await k.click('#again');
  await k.click('#gabbaiOn'); await k.fill('#pin', '0000'); await k.click('#pinOk'); await k.waitForTimeout(300);
  console.log('bad pin:', await k.textContent('#pinMsg'));
  await k.fill('#pin', pin); await k.click('#pinOk'); await k.waitForTimeout(400);
  await k.fill('#date', past[0]); await k.fill('#last', 'לוי'); await k.waitForTimeout(500);
  await k.screenshot({ path: 'shots/k6-gabbai.png' });
  await k.click('#submit'); await k.waitForTimeout(400);
  console.log('gabbai done:', (await k.textContent('#done')).replace(/\s+/g, ' ').trim());
  await k.close();
  // phone width
  k = await page(kioskHtml, { width: 390, height: 760 }, true);
  await k.fill('#last', 'כה'); await k.waitForTimeout(600);
  await k.screenshot({ path: 'shots/k7-phone-width.png' });
  const overflow = await k.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('horizontal overflow on phone:', overflow);
  await k.close();
  // closed state (Shabbat simulated by hours)
  env.userEdit('הגדרות', 'B6', 5); env.userEdit('הגדרות', 'B7', 5);
  const freshKiosk = () => G.doGet({ parameter: { k: key, device: 'kiosk' } }).html;   // today's data is built into the page
  k = await page(freshKiosk(), { width: 800, height: 700 }, true);
  console.log('closed:', (await k.textContent('#closed')).trim());
  await k.screenshot({ path: 'shots/k8-closed.png' });
  await k.close();
  env.userEdit('הגדרות', 'B6', 0); env.userEdit('הגדרות', 'B7', 24);
  // closed: today is not one of the minyan's weekdays
  {
    const dRow = env.ss.getSheetByName('הגדרות').data.findIndex(x => x[0] === 'ימי המניין') + 1;
    const dw = G.dow_(G.todayKey_('Asia/Jerusalem'));
    if (dw !== 6) {
      env.userEdit('הגדרות', 'B' + dRow, ['א', 'ב', 'ג', 'ד', 'ה', 'ו'].filter((_, i) => i !== dw).join(' '));
      k = await page(freshKiosk(), { width: 390, height: 700 }, true);
      const why = (await k.textContent('#closed')).trim();
      console.log('closed (not a minyan day):', why);
      if (!/היום אין מניין/.test(why) || !/המניין מתקיים בימים/.test(why)) throw new Error('not-a-minyan-day screen: ' + why);
      if (await k.isVisible('#form')) throw new Error('form shown on a day without a minyan');
      await k.screenshot({ path: 'shots/k8b-not-minyan-day.png' });
      await k.close();
      env.userEdit('הגדרות', 'B' + dRow, 'א ב ג ד ה ו');
    }
  }

  // ---------- Admin: import ----------
  const adminHtml = G.ADMIN_HTML_FOR_TEST || null;
  G.openAdmin_('import');
  let a = await page(env.ui.lastDialog, { width: 980, height: 680 }, false);
  const d = past[0], d2 = past[1];
  const wa = ['[' + d.split('-').reverse().join('/') + ', 07:45:12] שמואל: מניין שחרית ' + d.slice(8,10) + '/' + d.slice(5,7),
    '1. כהן', '2. משה לוי', '3) הרב פרידמן 🙏', '- גולדשטיין, שניאורסון', 'תודה לכולם!', '',
    d2.slice(8,10) + '.' + d2.slice(5,7), 'כהן משה', 'לויי', 'גולדשטין', 'אברהם רבינוביץ', '',
    'רבינוביץ'].join('\n');
  await a.fill('#waText', wa);
  await a.click('#parseBtn'); await a.waitForTimeout(500);
  await a.screenshot({ path: 'shots/a1-import.png', fullPage: true });
  console.log('import bar:', await a.textContent('#barMsg'), '| btn disabled:', await a.isDisabled('#barBtn'));
  await a.waitForTimeout(100);
  console.log('import bar after date fix:', await a.textContent('#barMsg'));
  await a.click('#barBtn'); await a.waitForTimeout(700);
  await a.screenshot({ path: 'shots/a2-review.png', fullPage: true });
  console.log('review summary:', await a.textContent('#revSummary'), '| bar:', await a.textContent('#barMsg'));
  await a.click('#confirmAll'); await a.waitForTimeout(200);
  console.log('after confirm-all:', await a.textContent('#barMsg'));
  // pick the first candidate for any undecided review group and fill a phone for a new person
  const groups = await a.$$('.group');
  for (const g of groups) {
    const raw = await g.$eval('.g-raw', e => e.textContent);
    if (raw === 'שניאורסון') { const t = await g.$('[data-k=phone]'); if (t) await t.fill('058-7777777'); }
    const conf = await g.$('[data-k=confirm]');
    if (conf && !(await conf.isChecked())) await conf.click();
  }
  await a.waitForTimeout(200);
  await a.screenshot({ path: 'shots/a3-review-ready.png', fullPage: true });
  console.log('ready:', await a.textContent('#barMsg'));
  await a.click('#barBtn'); await a.waitForTimeout(800);
  console.log('after save note:', (await a.textContent('#revNote')).trim());
  await a.screenshot({ path: 'shots/a4-after-save.png', fullPage: true });
  await a.close();

  // ---------- Other dialogs ----------
  env.web.url = 'https://script.google.com/macros/s/AKfyc_EXAMPLE/exec';
  G.menuKioskLink();
  a = await page(env.ui.lastDialog, { width: 560, height: 470 }, false); await a.screenshot({ path: 'shots/d1-link.png' }); await a.close();
  env.ui.nextPrompt = ''; G.menuWeekly();
  a = await page(env.ui.lastDialog, { width: 520, height: 520 }, false); await a.screenshot({ path: 'shots/d2-weekly-text.png' }); await a.close();
  await browser.close();
  console.log('PEOPLE:', JSON.stringify(env.ss.getSheetByName('אנשים').getRange(2,1,env.ss.getSheetByName('אנשים').getLastRow()-1,5).getValues().map(r=>r.join('/'))));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
})();
