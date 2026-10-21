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
  const ctx = loadCtx_(ss);
  const r = weeklyReport_(ctx, end);
  showReportText_(ctx, r.text, 'דוח שבועי — טקסט להדבקה בוואטסאפ');
}

/** Writes the weekly sheet (7 days ending on endKey) and returns the WhatsApp text. Shared with the web tools. */
function weeklyReport_(ctx, endKey, fromWeb) {
  const stats = computeStats_(ctx, addDays_(endKey, -6), endKey);
  const sheetName = 'שבוע עד ' + endKey.slice(8, 10) + '.' + endKey.slice(5, 7);
  writeReport_(ctx, sheetName, 'נוכחות שבועית — ' + fmtKey_(stats.start) + ' עד ' + fmtKey_(stats.end), stats, false, fromWeb);
  return { text: weeklyText_(ctx, stats), sheet: sheetName, days: stats.days.length, people: stats.rows.length,
           missing: stats.missing.map(fmtShort_), pending: countPending_(ctx.ss) };
}

/** The dialog with a ready-to-paste text; warns when entries are still waiting for review. */
function showReportText_(ctx, text, title) {
  const pending = countPending_(ctx.ss);
  const note = pending ? '<p class="warn">שימו לב: ' + pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו.</p>' : '';
  const html = page_('ReportTextDialog').replace('__TEXT__', () => escHtml_(text)).replace('__NOTE__', () => note);
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(520).setHeight(560), title);
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
  if (!ctx.settings.start || !ctx.settings.end) { SpreadsheetApp.getUi().alert(NO_PERIOD); return; }
  showReportText_(ctx, finalReport_(ctx).text, 'סיכום התקופה — טקסט להדבקה בוואטסאפ');
}

const NO_PERIOD = 'נא למלא תחילת וסוף התקופה בגיליון הגדרות';

/** Writes the final-summary sheet and returns the WhatsApp text. Shared with the web tools. */
function finalReport_(ctx, fromWeb) {
  const s = ctx.settings;
  if (!s.start || !s.end) throw new Error(NO_PERIOD);
  const stats = computeStats_(ctx, s.start, s.end);
  const soFar = s.end > todayKey_(ctx.tz) ? ' (עד היום)' : '';
  writeReport_(ctx, SH.FINAL, 'נוכחות לתקופה' + soFar, stats, true, fromWeb);
  return { text: finalText_(ctx, stats, !!soFar), sheet: SH.FINAL, days: stats.days.length, people: stats.rows.length,
           eligible: stats.rows.filter(r => r.eligible).length, missing: stats.missing.map(fmtShort_),
           pending: countPending_(ctx.ss) };
}

/** Short summary for WhatsApp: who is in the lottery, and how many came but did not reach the threshold. */
function finalText_(ctx, stats, soFar) {
  const n = stats.days.length;
  const eligible = stats.rows.filter(r => r.eligible);
  const others = stats.rows.length - eligible.length;
  const lines = ['*' + ctx.settings.name + ' — סיכום התקופה ' + fmtShort_(stats.start) + ' עד ' + fmtShort_(stats.end) +
                 (soFar ? ' (עד היום)' : '') + '*',
                 n + ' ימי מניין · בהגרלה משתתפים מי שהגיעו ל-' + stats.threshold + '% ומעלה', ''];
  if (eligible.length) {
    lines.push('✓ משתתפים בהגרלה (' + eligible.length + '):');
    eligible.forEach((r, i) => lines.push((i + 1) + '. ' + displayName_(r.person) + ' — ' + r.count + '/' + n +
                                         ' (' + Math.round(r.pct * 100) + '%)'));
  } else {
    lines.push('עדיין אין מי שהגיע ל-' + stats.threshold + '% מימי המניין.');
  }
  if (others) {
    const who = others === 1 ? 'מתפלל אחד השתתף' : others + ' מתפללים השתתפו';
    lines.push('', (eligible.length ? 'עוד ' : '') + who + ' במניין בתקופה.');
  }
  lines.push('', 'יישר כח לכל המתפללים!');
  return lines.join('\n');
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

function writeReport_(ctx, sheetName, title, stats, withEligibility, fromWeb) {
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
      sh.getRange(6, 1, data.length, fixed.length)
        .setBackgrounds(stats.rows.map(r => fixed.map(() => r.eligible ? '#dcfce7' : null)));
    }
    if (dayHdr.length) sh.getRange(6, fixed.length + 1, data.length, dayHdr.length).setHorizontalAlignment('center');
  }
  sh.setFrozenRows(5);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 170);
  if (dayHdr.length) sh.setColumnWidths(fixed.length + 1, dayHdr.length, 58);
  if (!fromWeb) sh.activate();                 // from the web page nobody is looking at the Sheet
}

function menuDraw() {
  const ui = SpreadsheetApp.getUi();
  const ctx = loadCtx_(SpreadsheetApp.getActive());
  const s = ctx.settings;
  if (!s.start || !s.end) { ui.alert(NO_PERIOD); return; }
  const info = drawInfo_(ctx);
  if (!info.eligible.length) { ui.alert('עדיין אין מי שהגיע ל-' + info.threshold + '% מימי המניין'); return; }
  const ok = ui.alert('הגרלה',
    info.eligible.length + ' משתתפים (' + info.threshold + '% ומעלה מתוך ' + info.days + ' ימי מניין).' +
    (info.pending ? '\n\nשימו לב: ' + info.pending + ' רישומים ממתינים בבדיקה ועדיין לא נספרו.' : '') + '\n\nלהגריל עכשיו?',
    ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const w = draw_(ctx);
  ui.alert('הזוכה', w.name + '  (' + w.pct + '% נוכחות)\n\nההגרלה נשמרה בגיליון "' + SH.DRAWS + '".', ui.ButtonSet.OK);
}

/** Who takes part in the lottery for the period in הגדרות. */
function drawInfo_(ctx) {
  const s = ctx.settings;
  if (!s.start || !s.end) throw new Error(NO_PERIOD);
  const stats = computeStats_(ctx, s.start, s.end);
  return { start: fmtKey_(stats.start), end: fmtKey_(stats.end), days: stats.days.length, threshold: stats.threshold,
           eligible: stats.rows.filter(r => r.eligible).map(r => ({ name: displayName_(r.person), pct: Math.round(r.pct * 100) })),
           pending: countPending_(ctx.ss), last: lastDraw_(ctx.ss) };
}

/** Draws one winner among the eligible, logs the draw in the הגרלות sheet and returns the winner. */
function draw_(ctx) {
  const stats = computeStats_(ctx, ctx.settings.start, ctx.settings.end);
  const eligible = stats.rows.filter(r => r.eligible);
  if (!eligible.length) throw new Error('עדיין אין מי שהגיע ל-' + stats.threshold + '% מימי המניין');
  const w = eligible[Math.floor(Math.random() * eligible.length)];
  const log = ensureSheet_(ctx.ss, SH.DRAWS, DRAWS_HDR);
  appendRows_(log, [[new Date(), displayName_(w.person), w.person.id, Math.round(w.pct * 100) + '%',
                     eligible.length, eligible.map(r => displayName_(r.person)).join(', ')]]);
  return { name: displayName_(w.person), id: w.person.id, pct: Math.round(w.pct * 100), among: eligible.length };
}

/** The most recent draw in the log, so a second draw is a conscious decision. */
function lastDraw_(ss) {
  const sh = ss.getSheetByName(SH.DRAWS);
  const n = sh ? sh.getLastRow() : 0;
  if (n < 2) return null;
  const r = sh.getRange(n, 1, 1, 2).getValues()[0];
  const tz = ss.getSpreadsheetTimeZone();
  return { when: r[0] instanceof Date ? fmtKey_(toKey_(r[0], tz)) : String(r[0]), name: String(r[1]) };
}
