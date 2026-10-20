// ======================================================================================
//  REPORTS & LOTTERY
//  Weekly and final attendance reports, WhatsApp summary text, lottery draw.
// ======================================================================================

function menuWeekly() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive(), tz = ss.getSpreadsheetTimeZone();
  const resp = ui.prompt('דוח שבועי',
    'הדוח מכסה 7 ימים שמסתיימים בתאריך הזה (למשל 23/10/2026).\nהשאירו ריק עבור היום.', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const typed = resp.getResponseText().trim();
  const end = typed ? toKey_(typed, tz) : todayKey_(tz);
  if (!end) { ui.alert('התאריך אינו תקין'); return; }
  const start = addDays_(end, -6);
  const ctx = loadCtx_(ss);
  const stats = computeStats_(ctx, start, end);
  writeReport_(ctx, 'שבוע עד ' + end.slice(8, 10) + '.' + end.slice(5, 7),
               'נוכחות שבועית — ' + fmtKey_(start) + ' עד ' + fmtKey_(stats.end), stats, false);
  const text = weeklyText_(ctx, stats);
  ui.showModalDialog(HtmlService.createHtmlOutput(page_('WeeklyTextDialog').replace('__TEXT__', () => escHtml_(text))).setWidth(520).setHeight(520),
                     'טקסט להדבקה בוואטסאפ');
}

function weeklyText_(ctx, stats) {
  const lines = ['*' + ctx.settings.name + ' — נוכחות ' + fmtShort_(stats.start) + ' עד ' + fmtShort_(stats.end) + '*',
                 stats.days.length + ' ימי מניין', ''];
  stats.rows.forEach((r, i) => lines.push((i + 1) + '. ' + displayName_(r.person) + ' — ' + r.count + '/' + stats.days.length));
  if (!stats.rows.length) lines.push('(אין רישומים)');
  return lines.join('\n');
}

function menuFinal() {
  SpreadsheetApp.getUi();
  const ctx = loadCtx_(SpreadsheetApp.getActive());
  const s = ctx.settings;
  if (!s.start || !s.end) { SpreadsheetApp.getUi().alert('נא למלא תחילת וסוף התקופה בגיליון הגדרות'); return; }
  const stats = computeStats_(ctx, s.start, s.end);
  const soFar = s.end > todayKey_(ctx.tz) ? ' (עד היום)' : '';
  writeReport_(ctx, SH.FINAL, 'נוכחות לתקופה' + soFar, stats, true);
}

/** Minyan days = Sunday–Friday in the range, up to today, minus the "no minyan" dates. */
function computeStats_(ctx, startKey, endKey) {
  const today = todayKey_(ctx.tz);
  const last = endKey < today ? endKey : today;
  const days = [];
  for (let k = startKey; k <= last; k = addDays_(k, 1)) {
    if (dow_(k) !== 6 && !ctx.excluded.has(k)) days.push(k);
  }
  const daySet = new Set(days);
  const byPerson = {}, recorded = new Set();
  ctx.attRows.forEach(r => {
    const k = toKey_(r[0], ctx.tz), id = String(r[1]).trim();
    if (!daySet.has(k) || !ctx.byId[id]) return;
    recorded.add(k);
    (byPerson[id] = byPerson[id] || new Set()).add(k);
  });
  const thr = ctx.settings.threshold;
  const rows = Object.keys(byPerson).map(id => {
    const count = byPerson[id].size;
    return { person: ctx.byId[id], dates: byPerson[id], count: count,
             pct: days.length ? count / days.length : 0,
             eligible: days.length > 0 && count * 100 >= thr * days.length };
  }).sort((a, b) => b.pct - a.pct || displayName_(a.person).localeCompare(displayName_(b.person), 'he'));
  return { start: startKey, end: last < startKey ? startKey : last, days: days, rows: rows,
           missing: days.filter(d => !recorded.has(d)), threshold: thr };
}

function writeReport_(ctx, sheetName, title, stats, withEligibility) {
  const ss = ctx.ss;
  let sh = ss.getSheetByName(sheetName);
  if (sh) sh.clear(); else { sh = ss.insertSheet(sheetName); sh.setRightToLeft(true); }

  const pending = countPending_(ss);
  const eligibleCount = stats.rows.filter(r => r.eligible).length;
  const info = 'תקופה: ' + fmtKey_(stats.start) + ' – ' + fmtKey_(stats.end) + '   ·   ימי מניין: ' + stats.days.length +
    (withEligibility ? '   ·   משתתפים בהגרלה (' + stats.threshold + '% ומעלה): ' + eligibleCount + ' מתוך ' + stats.rows.length : '');
  const warn = [];
  if (stats.missing.length) warn.push('אין אף רישום בימים: ' + stats.missing.map(fmtShort_).join(', ') +
                                      ' — יש לייבא את הרשימה מוואטסאפ, או לסמן כיום ללא מניין בהגדרות.');
  if (pending) warn.push(pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו.');

  sh.getRange(1, 1).setValue(title).setFontWeight('bold').setFontSize(14);
  sh.getRange(2, 1).setValue(info);
  if (warn.length) sh.getRange(3, 1).setValue('⚠ ' + warn.join('   ')).setFontColor('#9a5b00');

  const dayHdr = stats.days.map(k => HEB_DOW[dow_(k)] + ' ' + fmtShort_(k));
  const fixed = ['שם', 'מזהה', 'ימים', 'מתוך', 'אחוז'].concat(withEligibility ? ['בהגרלה'] : []);
  const header = fixed.concat(dayHdr);
  const data = stats.rows.map(r => [displayName_(r.person), r.person.id, r.count, stats.days.length, r.pct]
    .concat(withEligibility ? [r.eligible ? '✓' : ''] : [])
    .concat(stats.days.map(d => r.dates.has(d) ? '✓' : '')));

  sh.getRange(5, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground(HDR_BG);
  if (data.length) {
    sh.getRange(6, 1, data.length, header.length).setValues(data);
    sh.getRange(6, 5, data.length, 1).setNumberFormat('0%');
    if (withEligibility) {
      stats.rows.forEach((r, i) => { if (r.eligible) sh.getRange(6 + i, 1, 1, fixed.length).setBackground('#dcfce7'); });
    }
    if (dayHdr.length) sh.getRange(6, fixed.length + 1, data.length, dayHdr.length).setHorizontalAlignment('center');
  }
  sh.setFrozenRows(5);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  for (let c = fixed.length + 1; c <= header.length; c++) sh.setColumnWidth(c, 58);
  sh.activate();
}

function menuDraw() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const ctx = loadCtx_(ss);
  const s = ctx.settings;
  if (!s.start || !s.end) { ui.alert('נא למלא תחילת וסוף התקופה בגיליון הגדרות'); return; }
  const stats = computeStats_(ctx, s.start, s.end);
  const eligible = stats.rows.filter(r => r.eligible);
  if (!eligible.length) { ui.alert('עדיין אין מי שהגיע ל-' + s.threshold + '% מימי המניין'); return; }
  const pending = countPending_(ss);
  const ok = ui.alert('הגרלה',
    eligible.length + ' משתתפים (' + s.threshold + '% ומעלה מתוך ' + stats.days.length + ' ימי מניין).' +
    (pending ? '\n\nשימו לב: ' + pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו.' : '') + '\n\nלהגריל עכשיו?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const w = eligible[Math.floor(Math.random() * eligible.length)];
  const log = ensureSheet_(ss, SH.DRAWS, DRAWS_HDR);
  appendRows_(log, [[new Date(), displayName_(w.person), w.person.id, Math.round(w.pct * 100) + '%',
                     eligible.length, eligible.map(r => displayName_(r.person)).join(', ')]]);
  ui.alert('הזוכה', displayName_(w.person) + '  (' + Math.round(w.pct * 100) + '% נוכחות)\n\nההגרלה נשמרה בגיליון "' + SH.DRAWS + '".', ui.ButtonSet.OK);
}
