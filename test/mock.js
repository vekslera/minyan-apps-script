// Minimal in-memory stand-ins for the Apps Script services the tracker uses.
const fs = require('fs'), vm = require('vm'), path = require('path'), crypto = require('crypto');

function colNum(letters) { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }

class Range {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  getSheet() { return this.sh; }
  getRow() { return this.r; } getColumn() { return this.c; } getLastRow() { return this.r + this.nr - 1; } getLastColumn() { return this.c + this.nc - 1; }
  // protection: sh.protections lists {row, col, description, warningOnly}; remove() takes one off
  protect() {
    const sh = this.sh, p = { row: this.r, col: this.c, description: '', warningOnly: false };
    const o = { setDescription: d => { p.description = d; return o; }, setWarningOnly: w => { p.warningOnly = w; return o; },
                getDescription: () => p.description, remove: () => { sh.protections = sh.protections.filter(x => x !== o); }, p: p };
    (sh.protections = sh.protections || []).push(o);
    return o;
  }
  setValues(vals) {
    if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error(`setValues size mismatch: range ${this.nr}x${this.nc}, data ${vals.length}x${vals[0].length}`);
    vals.forEach((row, i) => row.forEach((v, j) => this.sh.set(this.r + i, this.c + j, v)));
    return this;
  }
  setValue(v) { this.sh.set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, ''); return this; }
  clear() { return this.clearContent(); }
  insertCheckboxes() { for (let i = 0; i < this.nr; i++) this.sh.set(this.r + i, this.c, false); return this; }
}
['setNumberFormat', 'setFontWeight', 'setBackground', 'setFontColor', 'setFontSize', 'setHorizontalAlignment',
 'setNote', 'setDataValidation', 'setWrap', 'setBackgrounds'].forEach(m => { Range.prototype[m] = function () { return this; }; });

class Sheet {
  constructor(ss, name) { this.ss = ss; this.name = name; this.data = []; }
  getName() { return this.name; }
  set(r, c, v) { while (this.data.length < r) this.data.push([]); this.data[r - 1][c - 1] = v; }
  getLastRow() {
    for (let i = this.data.length - 1; i >= 0; i--) if ((this.data[i] || []).some(v => v !== '' && v !== undefined && v !== null)) return i + 1;
    return 0;
  }
  getLastColumn() { return this.data.reduce((m, r) => Math.max(m, r.length), 0); }
  getMaxRows() { return 1000; } getMaxColumns() { return 26; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
      const c1 = colNum(m[1]), r1 = m[2] ? +m[2] : 1;
      const c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : (m[3] || !m[2] ? 1000 : r1);
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    if (a < 1 || b < 1 || (c !== undefined && c < 1) || (d !== undefined && d < 1)) throw new Error(`bad range ${a},${b},${c},${d}`);
    return new Range(this, a, b, c || 1, d || 1);
  }
  clear() { this.data = []; return this; }
  getProtections() { return (this.protections || []).slice(); }
  activate() { return this; }
}
['setFrozenRows', 'setFrozenColumns', 'setColumnWidth', 'setColumnWidths', 'setRightToLeft'].forEach(m => { Sheet.prototype[m] = function () { return this; }; });

function makeEnv(opts) {
  opts = opts || {};
  const log = [];
  const ss = {
    sheets: [], tz: 'Asia/Jerusalem',
    getSpreadsheetTimeZone() { return this.tz; }, setSpreadsheetTimeZone(t) { this.tz = t; }, setSpreadsheetLocale() {},
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); return s; },
    getSheets() { return this.sheets.slice(); },
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); },
    toast(m) { log.push(['toast', m]); },
    id: 'ss1', getId() { return this.id; }, getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit'; }, getName() { return 'גיליון'; }, owner: 'minyan-owner@example.com',
    getOwner() { return this.owner ? { getEmail: () => this.owner } : null; },                      // set env.ss.id to act as a copy of the Sheet
  };
  ss.insertSheet('Sheet1');
  const props = {};
  const cacheStore = new Map();
  const ui = {
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' }, Button: { OK: 'OK', YES: 'YES', CANCEL: 'CANCEL' },
    alert(...a) { log.push(['alert', a.slice(0, 2).join(' | ')]); return ui.nextAlert || 'OK'; },
    prompt(t, m) { log.push(['prompt', t + ' | ' + m]); const r = ui.nextPrompt || '', b = ui.nextPromptButton || 'OK';
                   return { getSelectedButton: () => b, getResponseText: () => r }; },
    showModalDialog(h, title) { log.push(['dialog', title]); ui.lastDialog = h.html; },
    createMenu() { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; },
  };
  const web = { url: '' };
  const triggers = [], sent = [], ntfy = { status: 200 };
  const now = { offsetMs: 0 };
  const fmt = (d, tz, f) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map(p => [p.type, p.value]));
    if (f === 'yyyy-MM-dd') return `${parts.year}-${parts.month}-${parts.day}`;
    if (f === 'H') return String(Number(parts.hour) % 24);
    if (f === 'H:mm') return (Number(parts.hour) % 24) + ':' + parts.minute;
    if (f === 'HH:mm') return String(Number(parts.hour) % 24).padStart(2, '0') + ':' + parts.minute;
    throw new Error('fmt ' + f);
  };
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + now.offsetMs); }
    static now() { return RealDate.now() + now.offsetMs; }
  }
  // Like Google's HtmlService: an HtmlOutput's content has the comments in its scripts removed
  // (seen on the live page). So nothing may depend on a comment, e.g. a marker like /*X*/.
  const stripComments = code => code.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const stripInScripts = html => html.replace(/(<script>)([\s\S]*?)(<\/script>)/g, (m, a, code, b) => a + stripComments(code) + b);
  const htmlOut = raw => { const s = stripInScripts(raw); const o = { html: s, getContent: () => s }; ['setTitle', 'addMetaTag', 'setWidth', 'setHeight'].forEach(m => o[m] = () => o); return o; };
  const ctx = {
    console, Date: FakeDate, Set, Map, Math, JSON, Intl, Number, String, Array, Object, isNaN, RegExp, Error,
    SpreadsheetApp: { ProtectionType: { RANGE: 'RANGE', SHEET: 'SHEET' }, getActive: () => ss, getActiveSpreadsheet: () => ss, getUi: () => { if (ctx.__webContext) throw new Error('Cannot call SpreadsheetApp.getUi() from this context.'); return ui; }, flush() {} },
    Utilities: {
      formatDate: fmt,
      parseDate: (k, tz) => new FakeDate(k + 'T09:00:00Z'),
      getUuid: () => crypto.randomUUID(),
    },
    PropertiesService: { getDocumentProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; },
                                              getProperties: () => Object.assign({}, props), deleteAllProperties: () => { Object.keys(props).forEach(k => delete props[k]); } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    HtmlService: { createHtmlOutput: htmlOut },
    // Google reported a wrong /exec address in a copy of the Sheet; the code must never use it (see kioskLink_).
    ScriptApp: { getService: () => ({ getUrl: () => web.url || 'https://script.google.com/macros/s/AKfycbWRONG_reported_address/exec' }),
                 // time triggers: env.triggers lists what was created (this account's only, like Google)
                 getProjectTriggers: () => triggers.slice(),
                 newTrigger: fn => { const t = { fn: fn }; const b = { timeBased: () => b, everyDays: n => { t.days = n; return b; }, atHour: h => { t.hour = h; return b; },
                                                                      create: () => { triggers.push({ getHandlerFunction: () => fn, spec: t }); } }; return b; } },
    // ntfy: env.sent lists every request; env.ntfyStatus is the answer's code
    UrlFetchApp: { fetch: (url, o) => { sent.push({ url: url, body: JSON.parse(o.payload) }); return { getResponseCode: () => ntfy.status }; } },
    Logger: { log: m => log.push(['log', m]) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'test@example.com' }) },
    CacheService: { getScriptCache: () => ({
      get: k => (cacheStore.has(k) ? cacheStore.get(k) : null), put: (k, v) => { cacheStore.set(k, String(v)); },
      remove: k => { cacheStore.delete(k); }, removeAll: ks => ks.forEach(k => cacheStore.delete(k)) }) },
  };
  vm.createContext(ctx);
  // Load the split project like Apps Script does: every .gs file into one global scope.
  // Reverse alphabetical order on purpose, to prove nothing depends on load order.
  const dir = path.join(__dirname, '..', 'src');                     // the Apps Script project (rootDir in .clasp.json)
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.gs')).sort().reverse();
  // Apps Script ignores extensions: Admin.gs and Admin.html would clash on push.
  const walk = d => fs.readdirSync(path.join(dir, d), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? (['test', 'node_modules', '.git'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  const bases = walk('').filter(f => /\.(gs|html|js)$/.test(f)).map(f => f.replace(/\.[^.]+$/, '').toLowerCase());
  const dup = bases.filter((b, i) => bases.indexOf(b) !== i);
  if (dup.length) throw new Error('Duplicate Apps Script file names: ' + dup.join(', '));
  // Like Apps Script: an HTML-type file is found by its name without extension; scripts/*.js are HTML-type
  // files too (see "htmlExtensions" in .clasp.json.example).
  const projectFile = name => {
    const file = [name + '.html', name + '.js'].map(f => path.join(dir, f)).find(f => fs.existsSync(f));
    if (!file) throw new Error('No HTML file named ' + name + ' was found.');
    return file;
  };
  // Like Google: reading a file through createHtmlOutputFromFile rewrites it. In a file that is plain script
  // (no tags), the comments go and every "<" becomes "&lt;" — exactly what broke the live page.
  ctx.HtmlService.createHtmlOutputFromFile = name => {
    const file = projectFile(name), raw = fs.readFileSync(file, 'utf8');
    return htmlOut(file.endsWith('.js') ? stripComments(raw).replace(/</g, '&lt;') : raw);
  };
  // The template's raw content is the file exactly as written.
  ctx.HtmlService.createTemplateFromFile = name => {
    const raw = fs.readFileSync(projectFile(name), 'utf8');
    return { getRawContent: () => raw, evaluate: () => htmlOut(raw) };
  };
  ctx.HtmlService.createHtmlOutputFromFile.getContent = undefined;
  // Tests never read your real Secrets.gs; a test may pass its own values instead.
  for (const f of files) if (f !== 'Secrets.gs') vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  // var, not const: a test may empty it (env.ctx.SECRETS = {}) to act as if Secrets.gs was removed.
  if (opts.secrets) vm.runInContext('var SECRETS = ' + JSON.stringify(opts.secrets) + ';', ctx);
  // Maintainer.gs, as deploy-all writes it into a minyan's upload (never in src/)
  if (opts.maintainer) vm.runInContext('var MAINTAINER = ' + JSON.stringify(opts.maintainer) + ';', ctx);
  // A change typed by a person in the Sheet: write it, then fire the onEdit simple trigger like Google does.
  const userEdit = (sheetName, a1, value) => {
    const r = ss.getSheetByName(sheetName).getRange(a1);
    r.setValue(value);
    if (typeof ctx.onEdit === 'function') ctx.onEdit({ range: r, value });
  };
  return { ctx, ss, ui, log, props, now, cacheStore, userEdit, web, triggers, sent, ntfy };
}

module.exports = { makeEnv };
