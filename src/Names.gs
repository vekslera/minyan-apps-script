// ======================================================================================
//  FIRST NAMES & NICKNAMES
//  Used to tell a lone first name from a surname, and to match nicknames.
// ======================================================================================

// Each line: one name and its common forms/nicknames. The first word is the "canonical" form.
const NICKNAMES = [
  'מנחם מנדי מענדי מנדל מענדל מנדלה מענדלה מנחם_מנדל מנחם_מענדל',
  'שמואל שמוליק שמולי שמילי שמואלי', 'משה מוישי מויש מוישה מושיק', 'יוסף יוסי יוסל יוסלה יוסקה יוסיפון',
  'יצחק איציק איצה צחי איצי', 'אברהם אבי אברמי אברימי אברמל אברומי', 'יעקב יענקי יענקל קובי יאנקי יעקבי',
  'שניאור_זלמן זלמן זלמי שניאור שניאורי', 'ישראל סרולי שרולי ישראלי שרול', 'מרדכי מוטי מוטל מרדי',
  'דוד דודי דוידי', 'חיים חיימי חיימקה', 'שלמה שלומי שלומקה', 'אליהו אלי אליה', 'אהוד אודי',
  'יהודה יודי יודה', 'ישעיהו ישעיה שייע', 'נחום נחומי', 'מנשה מנשי', 'בנימין בני בנימי', 'פנחס פיני פיניע',
  'ברוך בוקי ברוכי', 'שבתאי שבי', 'יהושע שוקי שוע', 'צבי הירש הערשל צביקה צבי_הירש',
  'דב בער בערל דובי בערי דב_בער', 'אריה לייב לייבל ליבי אריה_לייב', 'זאב וולף וועלוול וולוול', 'מאיר מאירקה',
  'גרשון גרשי', 'שמעון שימי', 'אהרן אהרון אהרל אהרלה', 'נתן נתי', 'לוי לוי_יצחק לויק לוויק', 'יחיאל חילי',
  'מיכאל מיכי מיקי', 'גבריאל גבי', 'רפאל רפי', 'עמנואל מני', 'אלימלך מלך מלכי', 'זכריה זכי', 'שלום שלומי_שלום',
  'נחמן נחמי', 'אליעזר לייזר לייזי אלי_עזר', 'יחזקאל חזקי', 'ירחמיאל ירחמי', 'עזריאל עזרי', 'אוריאל אורי',
];
const FIRST_NAMES_EXTRA = ('אברהם יצחק יעקב משה אהרן דוד שלמה יוסף בנימין יהודה לוי שמעון ראובן נפתלי גד אשר יששכר זבולון דן ' +
  'שמואל אליהו אלישע ישעיהו ירמיהו יחזקאל דניאל עזרא נחמיה מרדכי חיים מנחם שניאור זלמן דובער ישראל מאיר ' +
  'פנחס גרשון שבתאי שלום ברוך נחום מנשה אפרים אליעזר אלעזר עמרם צבי זאב אריה דב יחיאל נתן נתנאל נחמן ' +
  'יונתן יהונתן יוחנן יוחאי יואל יואב יאיר יגאל יהושע יהוידע יוסי מנדי שמוליק מוטי איציק שלומי אבי אודי אורי ' +
  'אוריה אוראל אוריאל אלון אלעד אמיר אסף אייל איתי איתן ארז אריאל בועז בן בני גיא גל גלעד דור דורון הלל ' +
  'זיו חגי טל יאיר יובל יניב ירון כפיר לירון מתן מתניה מתתיהו נדב נועם עדי עידו עמית עמנואל עוז עומר ' +
  'רועי רון רז רפאל שגיא שחר שי שקד תומר אליאב אליקים אליצור אלחנן ברק הדר יהודה_לייב מיכאל גבריאל ' +
  'רחמים מסעוד מכלוף ניסים סעדיה שאול שמחה בצלאל זכריה צדוק עזריאל ירחמיאל אהרון יחזקאל שמריהו ' +
  'מענדל מנדל יענקי יוסל זלמי לייב בערל הירש הערשל שמעיה אליהו_חיים יעקב_יוסף').split(/\s+/);
// Built on first use, so this file does not depend on the order Apps Script loads files in.
function nickCanon_() {
  if (!nickCanon_.map) {
    const m = {};
    NICKNAMES.forEach(line => {
      const forms = line.split(/\s+/).map(f => norm_(f.replace(/_/g, ' ')));
      forms.forEach(f => { if (!m[f]) m[f] = forms[0]; });
    });
    nickCanon_.map = m;
  }
  return nickCanon_.map;
}
function firstNames_() {
  if (!firstNames_.set) {
    firstNames_.set = new Set(Object.keys(nickCanon_()).concat(FIRST_NAMES_EXTRA.map(f => norm_(f.replace(/_/g, ' ')))));
  }
  return firstNames_.set;
}
// Words that are common first names AND common surnames — a lone one could be either.
function alsoSurnames_() {
  if (!alsoSurnames_.set) {
    alsoSurnames_.set = new Set(['לוי', 'דוד', 'ישראל', 'אברהם', 'שמעון', 'יוסף', 'אהרן', 'אהרון', 'בנימין', 'שלום', 'נתן',
      'מאיר', 'גבריאל', 'רפאל', 'מיכאל', 'אליהו', 'שאול', 'יעקב', 'זכריה', 'עמר', 'בן', 'טל', 'גל', 'הלל', 'שמחה', 'ברוך']
      .map(x => norm_(x)));
  }
  return alsoSurnames_.set;
}

function isFirstName_(w) { return firstNames_().has(norm_(w)); }
function canonFirst_(s) { const n = norm_(s); return nickCanon_()[n] || n; }

/** First-name similarity that knows nicknames: מנדי = מנחם מענדל = מענדל, שמוליק = שמואל. */
function firstSim_(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ca = canonFirst_(a), cb = canonFirst_(b);
  if (ca === cb) return 0.95;
  // multi-word first names: any word in common (after nicknames) is a strong hint
  const ta = a.split(' ').map(canonFirst_), tb = b.split(' ').map(canonFirst_);
  if (ta.some(x => tb.indexOf(x) >= 0)) return 0.9;
  return sim_(a, b);
}
