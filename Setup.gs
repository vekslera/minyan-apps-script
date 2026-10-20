/****************************************************************************************
 * מעקב נוכחות במניין  ·  Minyan attendance tracker  (Google Sheets + Apps Script)
 *
 * FILES (all share one global scope; the order of files in the editor does not matter)
 *   Setup.gs           menu, first-time setup, the הוראות (help) sheet
 *   Config.gs          sheet names, column layouts, settings labels, matching thresholds
 *   Kiosk.gs           the registration web page's server side (doGet + kiosk* functions)
 *   Admin.gs           WhatsApp import and review dialogs (admin* functions), registration-link dialog
 *   Matching.gs        who-is-this logic: phone first, then fuzzy Hebrew name matching
 *   Names.gs           first-name list and nicknames (מנדי = מנחם מענדל …)
 *   Data.gs            reading/writing the People, Attendance and Review sheets
 *   WhatsApp.gs        parser for pasted WhatsApp lists
 *   HebrewCalendar.gs  Hebrew calendar arithmetic, gematria, Hebrew-date parsing
 *   Reports.gs         weekly and final reports, lottery draw
 *   Duplicates.gs      finding and merging duplicate people
 *   Utils.gs           dates, settings, keys, small helpers
 *   Secrets.gs         YOUR private values (deployment ID, gabbai code …). Not in git — copy Secrets.gs.example.
 *   KioskPage.html, AdminPage.html, LinkDialog.html, WeeklyTextDialog.html, BadLinkPage.html   the pages
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
    .addItem('הגדרה ראשונית', 'setup')
    .addToUi();
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
  if (st.getLastRow() === 0) {
    const today = todayKey_(tz);
    st.getRange('B3:B4').setNumberFormat('dd/mm/yyyy');
    st.getRange('B8').setNumberFormat('@');
    st.getRange('E2:E').setNumberFormat('dd/mm/yyyy');
    const rows = [
      ['הגדרה', 'ערך', 'הסבר'],
      [SET.NAME, 'מניין שחרית', 'מוצג בראש דף הרישום'],
      [SET.START, keyToDate_(today, tz), 'היום הראשון שנספר'],
      [SET.END, keyToDate_(addDays_(today, 29), tz), 'היום האחרון שנספר'],
      [SET.PCT, 75, '75 = משתתפים בהגרלה מי שהגיע ל-75% מימי המניין ומעלה'],
      [SET.FROM, 5, 'שעה עגולה (0–23). מחוץ לשעות אפשר לרשום רק במצב גבאי'],
      [SET.TO, 11, ''],
      [SET.PIN, String(1000 + Math.floor(Math.random() * 9000)), 'לכניסה ל"מצב גבאי" בדף הרישום — רישום אחרים ותאריכים קודמים'],
      [SET.URL, '', 'אחרי הפריסה (Deploy) הדביקו כאן את כתובת ה-Web app'],
    ];
    st.getRange(1, 1, rows.length, 3).setValues(rows);
    st.getRange('E1').setValue('ימים ללא מניין (תאריך אחד בכל תא)');
    st.getRange('A1:E1').setFontWeight('bold').setBackground(HDR_BG);
    st.setColumnWidth(1, 230); st.setColumnWidth(2, 260); st.setColumnWidth(3, 420); st.setColumnWidth(5, 220);
  }

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

  // Remove the empty default sheet ("Sheet1" / "גיליון1").
  const ours = new Set(Object.values(SH));
  ss.getSheets().forEach(s => {
    if (!ours.has(s.getName()) && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  ss.getSheetByName(SH.HELP).activate();
  onOpen();

  ui.alert('ההגדרה הושלמה',
    'השלב הבא — פרסום דף הרישום:\n\n' +
    '1. בעורך הסקריפט: פריסה (Deploy) ← פריסה חדשה (New deployment) ← סוג: אפליקציית אינטרנט (Web app).\n' +
    '2. הפעלה בתור (Execute as): אני (Me).  גישה (Who has access): כל אחד (Anyone).\n' +
    '3. לחצו "פריסה" והעתיקו את הכתובת לגיליון "הגדרות", בשורה "' + SET.URL + '".\n' +
    '4. תפריט מניין ← קישור לדף הרישום.',
    ui.ButtonSet.OK);
}

function writeHelp_(sh) {
  sh.clear();
  const lines = [
    ['מעקב נוכחות במניין — הוראות שימוש'],
    [''],
    ['רישום יומי'],
    ['הטאבלט בבית הכנסת פתוח על דף הרישום. כל מתפלל מקיש מספר טלפון ולוחץ "רישום נוכחות". בפעם הראשונה ממלאים גם שם.'],
    ['מספר הטלפון הוא המזהה העיקרי. שדה החובה היחיד הוא שם משפחה. בזמן ההקלדה הדף מציע שמות שכבר רשומים.'],
    ['אפשר טלפון נייד או קווי ישראלי (05X, 07X, 02/03/04/08/09) ומספר אמריקאי (‎+1‎). אפשר להקליד עם מקפים, רווחים או קידומת בינלאומית.'],
    [''],
    ['מצב גבאי'],
    ['בתחתית דף הרישום: "מצב גבאי" + הקוד שבגיליון הגדרות. מאפשר לרשום אחרים, גם לתאריכים קודמים ומחוץ לשעות הרישום.'],
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
    ['דוח סופי: נוכחות לכל התקופה. משתתפים בהגרלה מי שהגיע ל-75% מימי המניין ומעלה (ניתן לשנות בהגדרות).'],
    ['ימי מניין: ראשון עד שישי. ימים שבהם אין רישום (למשל יום טוב) — רשמו בעמודה E בגיליון הגדרות.'],
    [''],
    ['כפילויות'],
    ['אם אותו אדם נרשם פעמיים בשמות שונים: תפריט מניין ← איתור כפילויות, מסמנים "למזג?" ← מיזוג הכפילויות המסומנות.'],
    [''],
    ['חשוב: לא לערוך ידנית את הגיליונות "נוכחות" ו"לבדיקה". מותר למחוק שורה שגויה בגיליון "נוכחות".'],
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true);
  sh.setColumnWidth(1, 820);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A3', 'A7', 'A10', 'A14', 'A18', 'A23'].forEach(a => sh.getRange(a).setFontWeight('bold').setBackground(HDR_BG));
}
