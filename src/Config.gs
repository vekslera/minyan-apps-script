// ======================================================================================
//  CONFIGURATION
//  Sheet names, column layouts, settings labels and matching thresholds.
// ======================================================================================

const SH = {
  HELP: 'הוראות', SETTINGS: 'הגדרות', PEOPLE: 'אנשים', ATT: 'נוכחות', PENDING: 'לבדיקה',
  DUPS: 'כפילויות', DRAWS: 'הגרלות', FINAL: 'דוח סופי',
};

const PEOPLE_HDR = ['מזהה', 'שם פרטי', 'שם משפחה', 'טלפון', 'איותים נוספים', 'נוסף בתאריך', 'הערות'];
const ATT_HDR    = ['תאריך', 'מזהה', 'שם', 'מקור', 'כפי שנרשם', 'זמן רישום'];
const PEND_HDR   = ['מזהה', 'זמן רישום', 'תאריך', 'מקור', 'כפי שנכתב', 'שם פרטי', 'שם משפחה', 'טלפון', 'הערה', 'סטטוס'];
const PQ = { ID: 0, LOGGED: 1, DATE: 2, SRC: 3, RAW: 4, FIRST: 5, LAST: 6, PHONE: 7, NOTE: 8, STATUS: 9 };
const DUPS_HDR   = ['מזהה להשאיר', 'שם', 'מזהה למזג לתוכו', 'שם', 'דמיון', 'למזג?', 'סטטוס'];
const DRAWS_HDR  = ['זמן ההגרלה', 'הזוכה', 'מזהה', 'נוכחות', 'מספר המשתתפים', 'המשתתפים'];

const SRC = { KIOSK: 'דף רישום', GABBAI: 'גבאי', WA: 'וואטסאפ' };

// Device types the registration page detects (not used in gabbai mode). 'kiosk' = the shul's own tablet,
// set with "&device=kiosk" on its link.
const DEVICES = ['mobile', 'tablet', 'desktop', 'kiosk'];
const DEVICE_LABELS = { mobile: 'נייד', tablet: 'טאבלט', desktop: 'מחשב', kiosk: 'טאבלט בית הכנסת' };
const ST  = { WAIT: 'ממתין', DONE: 'טופל', IGNORED: 'לא נרשם' };

const SET = {
  NAME:  'שם המניין',
  START: 'תחילת התקופה',
  END:   'סוף התקופה',
  PCT:   'אחוז נוכחות מינימלי להגרלה',
  REBBE: 'אחוז נוכחות מינימלי לדוח לרבי',
  DAYS:  'ימי המניין',
  FROM:  'רישום עצמי פתוח משעה',
  TO:    'רישום עצמי פתוח עד שעה',
  LAT:   'מיקום בית הכנסת — קו רוחב',
  LNG:   'מיקום בית הכנסת — קו אורך',
  RADIUS: 'רדיוס מותר (מטרים)',
  TOL:   'סטיית GPS מותרת (מטרים)',
  GNAME: 'שם הגבאי',
  GPHONE: 'טלפון הגבאי',
};
// The developer, on the printable QR sign (with the gabbai, or alone when the gabbai's details aren't set).
const DEVELOPER = { name: 'אלכס וקסלר', phone: '052-8353205' };
// Rows of older versions, read once by setup() to move their values (see migrateSettings_ in Setup.gs).
const OLD_SET = { PIN: 'קוד גבאי', URL: 'כתובת דף הרישום (Web app)' };
// The הגדרות sheet, top to bottom (column E holds the "no minyan" dates). setup() keeps this order.
const SET_ROWS = [
  [SET.NAME, 'מוצג בראש דף הרישום ובדוחות'],
  [SET.START, 'היום הראשון שנספר'],
  [SET.END, 'היום האחרון שנספר'],
  [SET.PCT, '75 = משתתפים בהגרלה מי שהגיע ל-75% מימי המניין ומעלה. 0 = ללא הגרלה (כבוי)'],
  [SET.FROM, 'שעה בקפיצות של חצי שעה, למשל 8:00 או 8:30. מחוץ לשעות אפשר לרשום רק במצב גבאי'],
  [SET.TO, ''],
  [SET.LAT, 'ריק = אין בדיקת מיקום. נקבע במדידה בכלי הגבאי ← מיקום בית הכנסת'],
  [SET.LNG, ''],
  [SET.RADIUS, 'רישום עצמי מטלפון/טאבלט רק בתוך המרחק הזה מבית הכנסת. מומלץ 40–60'],
  [SET.TOL, 'כמה אי-דיוק של ה-GPS נסלח מעבר לרדיוס. ריק = חצי רדיוס'],
  [SET.REBBE, '25 = נכללים בדוח לרבי מי שהגיע ל-25% מימי המניין ומעלה. 0 = ללא דוח (כבוי)'],
  [SET.DAYS, 'הימים בשבוע שבהם יש מניין, באותיות: א ב ג ד ה ו (ראשון עד שישי), או א-ה. רק בימים אלה יש רישום והם נספרים'],
  [SET.GNAME, 'מופיע בדף ה-QR להדפסה: למי לפנות מי שלא מצליח להירשם. ריק = רק פרטי המפתח'],
  [SET.GPHONE, 'טלפון לסמס, מופיע בדף ה-QR להדפסה'],
];

// Name-matching thresholds (0..1)
const MATCH = { AUTO: 0.88, SUGGEST: 0.55, GAP: 0.08, DUP: 0.75, PHONE_NAME: 0.6 };

const HEB_DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const HDR_BG = '#e8eef5';
const STOPWORDS = ['מניין', 'מנין', 'שחרית', 'רשימה', 'רשימת', 'נוכחים', 'נוכחות', 'רשומים', 'בוקר', 'תודה',
                   'יישר כח', 'יישר כוח', 'שכוייח', 'שכויח', 'הגיעו', 'ר"ח', 'ר״ח', 'ראש חודש', 'minyan', 'shacharit', 'attendance'];
const TITLES_RE = /^(?:הרב|הר"ר|הר״ר|הרה"ח|הרה״ח|הרה"ת|הרה״ת|רבי|ר'|ר׳|מר|rabbi|rav|reb|r'|mr\.?)\s+/i;
const INVISIBLE_RE = /[​-‏‪-‮⁦-⁩﻿]/g;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
