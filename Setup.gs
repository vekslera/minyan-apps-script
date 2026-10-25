/****************************************************************************************
 * מעקב נוכחות במניין  ·  Minyan attendance tracker  (Google Sheets + Apps Script)
 *
 * FILES (all share one global scope; the order of files in the editor does not matter)
 *   Setup.gs           menu, first-time setup, the הוראות (help) sheet
 *   Config.gs          sheet names, column layouts, settings labels, matching thresholds
 *   Kiosk.gs           the registration web page's server side (doGet + kiosk* functions)
 *   Gabbai.gs          the gabbai tools web page's server side (gabbai* functions, need a gabbai session)
 *   Admin.gs           WhatsApp import and review dialogs (admin* functions), registration-link dialog
 *   Auth.gs            gabbai code, login sessions, lockout after wrong codes, changing the code
 *   Location.gs        location check for self-registration (coordinates are never stored)
 *   Matching.gs        who-is-this logic: phone first, then fuzzy Hebrew name matching
 *   Names.gs           first-name list and nicknames (מנדי = מנחם מענדל …)
 *   Data.gs            reading/writing the People, Attendance and Review sheets
 *   WhatsApp.gs        parser for pasted WhatsApp lists
 *   HebrewCalendar.gs  Hebrew calendar arithmetic, gematria, Hebrew-date parsing
 *   Reports.gs         weekly and final reports, lottery draw
 *   Duplicates.gs      finding and merging duplicate people
 *   Utils.gs           dates, settings, keys, small helpers
 *   Secrets.gs         YOUR private values (deployment ID, gabbai code …). Not in git — copy Secrets.gs.example.
 *   KioskPage.html, GabbaiPage.html, AdminPage.html, LinkDialog.html, ReportTextDialog.html, BadLinkPage.html   the pages
 *   styles/tools.html  styles shared by the import/review screens; the scripts folder  the browser code
 *   (Apps Script needs every file name unique across .gs and .html, hence the suffixes.)
 *
 * INSTALL — see README.md (manual copy into the editor, or `clasp push`).
 ****************************************************************************************/

// ======================================================================================
//  MENU & SETUP
//  The מניין menu, first-time setup() and the help sheet.
// ======================================================================================

function onOpen() {
  SpreadsheetApp.getUi().createMenu('מניין')
    .addItem('קישור לדף הרישום', 'menuKioskLink')
    .addItem('רישומים לבדיקה', 'menuReview')
    .addItem('ייבוא רשימה מוואטסאפ', 'menuImport')
    .addSeparator()
    .addItem('דוח שבועי', 'menuWeekly')
    .addItem('דוח סופי לתקופה', 'menuFinal')
    .addItem('הגרלה', 'menuDraw')
    .addSeparator()
    .addItem('איתור כפילויות', 'menuFindDuplicates')
    .addItem('מיזוג הכפילויות המסומנות', 'menuMerge')
    .addSeparator()
    .addItem('שינוי קוד גבאי', 'menuChangePin')
    .addItem('הגדרה ראשונית', 'setup')
    .addToUi();
}

/** Simple trigger: a manual edit of the people or settings sheet clears the cached copy. */
function onEdit(e) {
  try {
    const name = e && e.range ? e.range.getSheet().getName() : '';
    if (name === SH.PEOPLE || name === SH.SETTINGS) cacheClear_();
  } catch (err) {}
}

function setup() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const owner = secret_('ownerAccount');
  let me = '';
  try { me = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (owner && me && owner.toLowerCase() !== me.toLowerCase()) {
    const go = ui.alert('חשבון Google שונה',
      'הסקריפט רץ בחשבון ' + me + ', אבל בקובץ Secrets.gs רשום ' + owner + '.\nלהמשיך בכל זאת?', ui.ButtonSet.YES_NO);
    if (go !== ui.Button.YES) return;
  }
  try { ss.setSpreadsheetTimeZone('Asia/Jerusalem'); } catch (e) {}
  try { ss.setSpreadsheetLocale('iw_IL'); } catch (e) {}
  const tz = ss.getSpreadsheetTimeZone();

  writeHelp_(ensureSheet_(ss, SH.HELP, null));

  const st = ensureSheet_(ss, SH.SETTINGS, null);
  const moved = migrateSettings_(st, tz);

  const people = ensureSheet_(ss, SH.PEOPLE, PEOPLE_HDR);
  people.getRange('D:D').setNumberFormat('@');
  people.getRange('F:F').setNumberFormat('dd/mm/yyyy');

  const att = ensureSheet_(ss, SH.ATT, ATT_HDR);
  att.getRange('A:A').setNumberFormat('dd/mm/yyyy');
  att.getRange('F:F').setNumberFormat('dd/mm/yyyy hh:mm');

  const pend = ensureSheet_(ss, SH.PENDING, PEND_HDR);
  pend.getRange('B:B').setNumberFormat('dd/mm/yyyy hh:mm');
  pend.getRange('C:C').setNumberFormat('dd/mm/yyyy');
  pend.getRange('H:H').setNumberFormat('@');

  ensureSheet_(ss, SH.DUPS, DUPS_HDR);

  kioskKey_(); adminToken_();
  cacheClear_();

  // Remove the empty default sheet ("Sheet1" / "גיליון1").
  const ours = new Set(Object.values(SH));
  ss.getSheets().forEach(s => {
    if (!ours.has(s.getName()) && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  ss.getSheetByName(SH.HELP).activate();
  onOpen();

  ui.alert('ההגדרה הושלמה',
    (moved.length ? 'עודכן:\n• ' + moved.join('\n• ') + '\n\n' : '') +
    (webAppUrlFromSecrets_() ? 'תפריט מניין ← קישור לדף הרישום.' :
    'השלב הבא — פרסום דף הרישום:\n\n' +
    '1. בעורך הסקריפט: פריסה (Deploy) ← פריסה חדשה (New deployment) ← סוג: אפליקציית אינטרנט (Web app).\n' +
    '2. הפעלה בתור (Execute as): אני (Me).  גישה (Who has access): כל אחד (Anyone).\n' +
    '3. לחצו "פריסה", העתיקו את מזהה הפריסה (Deployment ID) לקובץ Secrets.gs, בשורה deploymentId.\n' +
    '4. תפריט מניין ← קישור לדף הרישום.'),
    ui.ButtonSet.OK);
}

/**
 * Puts the הגדרות sheet in the current layout (SET_ROWS order), keeping every value and note already
 * there, and moves settings from older versions:
 *  - the gabbai code → script properties (from Secrets.gs gabbaiPin or the old "קוד גבאי" row; a new
 *    installation gets a random 6-digit code);
 *  - the shul's location → the sheet (from the gabbai's measurement in script properties, or Secrets.gs);
 *  - the lottery threshold → the sheet (from Secrets.gs lotteryThreshold);
 *  - the old "כתובת דף הרישום" row is dropped: the address comes from Secrets.gs deploymentId.
 * Safe to run again. Returns what it changed, in Hebrew, for the closing message.
 */
function migrateSettings_(st, tz) {
  const moved = [];
  const props = PropertiesService.getDocumentProperties();
  const lastA = Math.max(st.getLastRow(), 1);
  const old = {};
  const extra = [];
  st.getRange(1, 1, lastA, 3).getValues().forEach((r, i) => {
    const k = String(r[0]).trim();
    if (!k || i === 0) return;
    old[k] = { b: r[1], c: r[2] };
    if (!SET_ROWS.some(x => x[0] === k) && k !== OLD_SET.PIN && k !== OLD_SET.URL) extra.push([k, r[1], r[2]]);
  });
  const fresh = !Object.keys(old).length;

  // The gabbai code → out of sight.
  if (!gabbaiPin_()) {
    const fromOld = secret_('gabbaiPin') || String(old[OLD_SET.PIN] ? old[OLD_SET.PIN].b : '').trim();
    const pin = fromOld || newPin_();
    props.setProperty('GABBAI_PIN', pin);
    gabbaiPin_.v = pin;
    moved.push(fromOld ? 'קוד הגבאי הועבר למקום מוסתר (לא בגיליון). הקוד עצמו לא השתנה.'
                       : 'קוד הגבאי הראשוני: ' + pin + ' — לשינוי: מניין ← שינוי קוד גבאי.');
  }
  if (old[OLD_SET.URL]) moved.push('השורה "' + OLD_SET.URL + '" הוסרה: הכתובת נלקחת מ-deploymentId בקובץ Secrets.gs.');

  const value = {}, note = {};
  const today = todayKey_(tz);
  const defaults = {};
  defaults[SET.NAME] = 'מניין שחרית'; defaults[SET.START] = keyToDate_(today, tz); defaults[SET.END] = keyToDate_(addDays_(today, 29), tz);
  defaults[SET.PCT] = 75; defaults[SET.FROM] = 5; defaults[SET.TO] = 11;
  defaults[SET.LAT] = ''; defaults[SET.LNG] = ''; defaults[SET.RADIUS] = SHUL_SET.NEW_RADIUS; defaults[SET.TOL] = '';
  SET_ROWS.forEach(r => { value[r[0]] = old[r[0]] ? old[r[0]].b : defaults[r[0]]; note[r[0]] = old[r[0]] && String(old[r[0]].c) ? old[r[0]].c : r[1]; });
  if (/שעה עגולה/.test(String(note[SET.FROM]))) note[SET.FROM] = SET_ROWS.find(r => r[0] === SET.FROM)[1];   // older wording
  // Hours as text ("8:30"): a number stays as it is, a time typed into the cell becomes "H:MM".
  [SET.FROM, SET.TO].forEach(l => { const h = parseHour_(value[l], null, tz); if (h != null) value[l] = fmtHour_(h); });

  // The shul's location → the sheet.
  if (!old[SET.LAT]) {
    const a = oldShulArea_();
    if (a) {
      value[SET.LAT] = a.lat; value[SET.LNG] = a.lng; value[SET.RADIUS] = a.radius;
      if (a.note) note[SET.LAT] = a.note;
      moved.push('מיקום בית הכנסת והרדיוס (' + a.radius + ' מ׳) הועברו לגיליון.');
    }
    props.deleteProperty('SHUL_AREA');
  }
  // The lottery threshold → the sheet, once (afterwards the gabbai's value in the sheet is the only one).
  const thr = props.getProperty('SETTINGS_MOVED') ? 0 : secretPercent_('lotteryThreshold');
  if (thr && Number(value[SET.PCT]) !== thr) {
    value[SET.PCT] = thr;
    moved.push('אחוז הנוכחות להגרלה (' + thr + '%) הועבר מ-Secrets.gs לגיליון.');
  }

  props.setProperty('SETTINGS_MOVED', '1');
  const rows = [['הגדרה', 'ערך', 'הסבר']].concat(SET_ROWS.map(r => [r[0], value[r[0]], note[r[0]]])).concat(extra);
  st.getRange(1, 1, lastA, 3).clearContent();
  st.getRange(1, 1, rows.length, 3).setValues(rows);
  const row = label => SET_ROWS.findIndex(r => r[0] === label) + 2;
  st.getRange(row(SET.START), 2, 2, 1).setNumberFormat('dd/mm/yyyy');
  st.getRange(row(SET.FROM), 2, 2, 1).setNumberFormat('@');
  st.getRange(row(SET.LAT), 2, 2, 1).setNumberFormat('0.0000000');
  st.getRange(row(SET.RADIUS), 2, 2, 1).setNumberFormat('0');
  if (!st.getRange('E1').getValue()) {
    st.getRange('E1').setValue('ימים ללא מניין (תאריך אחד בכל תא)');
    st.getRange('E2:E').setNumberFormat('dd/mm/yyyy');
  }
  st.getRange('A1:E1').setFontWeight('bold').setBackground(HDR_BG);
  if (fresh) { st.setColumnWidth(1, 230); st.setColumnWidth(2, 260); st.setColumnWidth(3, 420); st.setColumnWidth(5, 220); }
  return moved;
}

function writeHelp_(sh) {
  sh.clear();
  const lines = [
    ['מעקב נוכחות במניין — הוראות שימוש'],
    [''],
    ['רישום יומי'],
    ['כל מתפלל סורק בבית הכנסת את קוד ה-QR (או פותח את הדף השמור בטלפון), מקיש מספר טלפון או שם משפחה ולוחץ "רישום נוכחות". בפעם הראשונה ממלאים גם שם. בטלפון המספר נשמר לפעם הבאה.'],
    ['מספר הטלפון הוא המזהה העיקרי. שדה החובה היחיד הוא שם משפחה. בזמן ההקלדה הדף מציע שמות שכבר רשומים.'],
    ['רישום עצמי — רק מטלפון נייד או מטאבלט, ומתוך בית הכנסת (בדיקת מיקום). מי שנמצא מחוץ לבית הכנסת יכול לנסות שוב או לשלוח לאישור הגבאי. מי שהמיקום אצלו כבוי מקבל הסבר מותאם לטלפון שלו וכפתור "אפשר מיקום". במחשב — רק במצב גבאי.'],
    ['בטאבלט של בית הכנסת: מוסיפים לסוף הקישור ‎&device=kiosk‎ — כך הוא מזוהה תמיד כטאבלט בית הכנסת ולא כטלפון פרטי.'],
    ['אפשר טלפון נייד או קווי ישראלי (05X, 07X, 02/03/04/08/09) ומספר אמריקאי (‎+1‎). אפשר להקליד עם מקפים, רווחים או קידומת בינלאומית.'],
    [''],
    ['מצב גבאי'],
    ['בתחתית דף הרישום: "מצב גבאי" + קוד הגבאי. מאפשר לרשום אחרים, גם לתאריכים קודמים ומחוץ לשעות הרישום.'],
    ['הקוד: לפחות 6 תווים. הוא שמור במקום מוסתר (לא בגיליון); בעל הגיליון רואה אותו בתפריט מניין ← קישור לדף הרישום. אפשר להחליף אותו (בכלי הגבאי, או כאן: מניין ← שינוי קוד גבאי). 3 קודים שגויים נועלים את הכניסה לדקה. "יציאה" מנתקת; אחרי 30 דקות ללא פעילות הניתוק אוטומטי.'],
    ['כלי גבאי בדפדפן ובטלפון: במצב גבאי לוחצים "כלי גבאי". שם: רישומים לבדיקה, ייבוא מוואטסאפ, דוחות עם טקסט לוואטסאפ, הגרלה, כפילויות, קישור ו-QR, מיקום בית הכנסת, הגדרות (שם, שעות רישום, תקופה, אחוז, ימים ללא מניין), שינוי קוד. אותם כלים גם בתפריט "מניין" כאן.'],
    ['מיקום בית הכנסת (בכלי הגבאי): עומדים באמצע האולם עם טלפון, "מדידה", ואז "קביעה כמיקום בית הכנסת". שם גם קובעים את הרדיוס (מומלץ 40–60 מ׳) ואת סטיית ה-GPS המותרת, ובודקים מרחק. הכול נשמר בגיליון "הגדרות".'],
    ['במצב גבאי יש כפתור "בדיקת מיקום": מראה את המרחק מבית הכנסת ואת דיוק המיקום. שימושי כדי לבדוק שהרדיוס מתאים.'],
    [''],
    ['רישומים לבדיקה'],
    ['כשהמערכת לא בטוחה מי נרשם (איות דומה, כמה אנשים באותו שם, טלפון של מישהו אחר) — הרישום ממתין לאישור.'],
    ['תפריט מניין ← רישומים לבדיקה. לכל שם בוחרים את האדם הנכון, מאשרים את הטלפון או מוסיפים טלפון, ושומרים.'],
    [''],
    ['ייבוא מוואטסאפ'],
    ['מעתיקים מהוואטסאפ את ההודעות עם הרשימות. תפריט מניין ← ייבוא רשימה מוואטסאפ ← מדביקים ← "ניתוח הטקסט".'],
    ['בודקים שהתאריכים נכונים, ממשיכים לבדיקה, ושם מאשרים כל שם ומוסיפים טלפון למי שחסר.'],
    [''],
    ['דוחות והגרלה'],
    ['דוח שבועי: נוכחות כל אחד ב-7 הימים האחרונים, וגם טקסט מוכן להדבקה בוואטסאפ.'],
    ['דוח סופי: נוכחות לכל התקופה, וגם סיכום קצר להדבקה בוואטסאפ. משתתפים בהגרלה מי שהגיע ל-75% מימי המניין ומעלה (ניתן לשנות בהגדרות).'],
    ['ימי מניין: ראשון עד שישי. ימים שבהם אין רישום (למשל יום טוב) — בכלי הגבאי ← הגדרות, או בעמודה E בגיליון הגדרות.'],
    ['הגדרות: כל ההגדרות שהגבאי משנה (שם, שעות, תקופה, אחוז, מיקום) נמצאות בגיליון "הגדרות" ובכלי הגבאי ← הגדרות. אחרי עדכון גרסה מריצים פעם אחת: מניין ← הגדרה ראשונית.'],
    [''],
    ['כפילויות'],
    ['אם אותו אדם נרשם פעמיים בשמות שונים: תפריט מניין ← איתור כפילויות, מסמנים "למזג?" ← מיזוג הכפילויות המסומנות.'],
    [''],
    ['חשוב: לא לערוך ידנית את הגיליונות "נוכחות" ו"לבדיקה". מותר למחוק שורה שגויה בגיליון "נוכחות".'],
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true);
  sh.setColumnWidth(1, 820);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  // Section titles: a short line right after an empty one (computed, so adding lines never shifts the bold).
  lines.forEach((l, i) => {
    if (i > 1 && !lines[i - 1][0] && l[0] && l[0].length < 30) sh.getRange(i + 1, 1).setFontWeight('bold').setBackground(HDR_BG);
  });
}
