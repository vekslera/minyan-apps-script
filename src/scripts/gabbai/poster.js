// Gabbai tools page — the printable QR sign, an A4 PDF: בס"ד, the minyan's name, the lottery (prize, threshold),
// the report to the Rebbe, the period in Hebrew dates, a QR code to the registration page, how to register, and
// whom to ask (the gabbai, as set in הגדרות, and the developer). Data: gabbaiLink() + posterInfo_ (Poster.gs).
// The page is drawn on a canvas, so the browser lays out the Hebrew; jsPDF (loaded only when needed) wraps it in a PDF.
// Declarations only — nothing runs when the file loads; the page calls the start function.

var JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
var POSTER_DPI = 200;
var POSTER_FONT = 'Arial, "Noto Sans Hebrew", "Segoe UI", "Helvetica Neue", sans-serif';

/**
 * The sign's texts. r = gabbaiLink(): {link, name, gabbai: {name, phone}, dev: {name, phone},
 * prize, threshold, rebbe, from, to}. A switched-off lottery or report (0) and missing dates are left out.
 */
function posterTexts(r) {
  var g = r.gabbai || {}, dev = r.dev || {}, thr = Number(r.threshold) || 0, reb = Number(r.rebbe) || 0;
  var prize = String(r.prize || '').trim();
  var t = {
    top: 'בס"ד',
    title: String(r.name || '').trim() || 'רישום למניין',
    promo: thr > 0 ? (prize ? 'מבצע!!! הגרלה על ' + prize : 'מבצע!!! הגרלה!') : '',
    lottery: thr > 0 ? 'משתתפים בהגרלה: מי שהגיע ' + thr + '% מהתפילות.' : '',
    rebbe: reb > 0 ? 'יוזכרו בדו"ח מיוחד לרבי: מי שהגיע ' + reb + '% מהתפילות.' : '',
    dates: r.from && r.to ? 'תאריכי הרישום: מ' + r.from + ' עד ' + r.to + '.' : '',
    sub: 'סרקו את הקוד במצלמת הטלפון',
    steps: ['1. פותחים את המצלמה ומכוונים לקוד', '2. לוחצים על הקישור שמופיע', '3. מקישים מספר טלפון ← רישום נוכחות',
            '4. בפעם הראשונה ממלאים גם שם משפחה ושם פרטי'],
    ask: 'אין לך סמארטפון? המצלמה לא סורקת?'
  };
  if (g.name || g.phone) {                            // the gabbai (no title before his name); the developer for technical trouble
    t.who = g.name ? 'גש ל' + g.name + (g.phone ? ' או שלח סמס למספר' : '') : 'שלח סמס למספר';
    t.phone = g.phone || '';
    t.dev = 'תקלה טכנית? פנה ל' + dev.name + ', למספר ' + dev.phone;
  } else {                                            // no gabbai details: the developer, as on the first sign
    t.who = 'גש ל' + dev.name + ' או שלח סמס למספר';
    t.phone = dev.phone;
    t.dev = '';
  }
  return t;
}

/** Draws the A4 sign on a canvas (POSTER_DPI). Throws if the QR library is missing. */
function drawPoster(r) {
  var t = posterTexts(r);
  var mm = POSTER_DPI / 25.4, pt = POSTER_DPI / 72;
  var W = Math.round(210 * mm), H = Math.round(297 * mm), cx = W / 2;
  var c = document.createElement('canvas'); c.width = W; c.height = H;
  var x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.direction = 'rtl'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  function font(size, bold) { x.font = (bold ? 'bold ' : '') + Math.round(size * pt) + 'px ' + POSTER_FONT; }
  var drawing = true;
  function text(s, y, size, bold, color, maxW) {          // one centered line; shrinks to fit the width
    if (!drawing) return;
    var px = size;
    font(px, bold);
    while (maxW && px > 8 && x.measureText(s).width > maxW) { px -= 1; font(px, bold); }
    x.fillStyle = color || '#111';
    x.fillText(s, cx, y);
  }

  // The content is laid out twice: once to measure its height, then centered vertically (a sign without the
  // lottery, the report or the gabbai's details is shorter).
  var end = layout(0, false);
  var dy = Math.max(0, Math.round((H - 12 * mm - end - 30 * mm) / 2));
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  layout(dy, true);
  // בס"ד, top right
  x.textAlign = 'right'; font(13, true); x.fillStyle = '#111'; x.fillText(t.top, W - 14 * mm, 16 * mm); x.textAlign = 'center';
  return c;

  /** Draws everything below בס"ד from 36 mm + dy; returns where it ends. draw = false only measures. */
  function layout(dy, draw) {
  drawing = draw;
  var y = 36 * mm + dy;
  text(t.title, y, 34, true, '#111', 180 * mm);
  y += 4 * mm;
  if (t.promo) { y += 12 * mm; text(t.promo, y, 24, true, '#111', 180 * mm); }
  [t.lottery, t.rebbe, t.dates].forEach(function (s) { if (s) { y += 9.5 * mm; text(s, y, 15, false, '#111', 184 * mm); } });

  // how to register: the QR code (half its former size) in a rounded frame, then the steps
  y += 14 * mm;
  text(t.sub, y, 15, false, '#111');
  var box = 58 * mm, bx = cx - box / 2, by = y + 5 * mm, rad = 4 * mm, bw = 0.9 * mm;
  if (draw) {
  x.lineWidth = bw; x.strokeStyle = '#111';
  x.beginPath();
  x.moveTo(bx + rad, by); x.lineTo(bx + box - rad, by); x.arcTo(bx + box, by, bx + box, by + rad, rad);
  x.lineTo(bx + box, by + box - rad); x.arcTo(bx + box, by + box, bx + box - rad, by + box, rad);
  x.lineTo(bx + rad, by + box); x.arcTo(bx, by + box, bx, by + box - rad, rad);
  x.lineTo(bx, by + rad); x.arcTo(bx, by, bx + rad, by, rad);
  x.closePath(); x.stroke();
  var qs = Math.round(box - 2 * bw - 6 * mm);
  var holder = document.createElement('div');
  new QRCode(holder, { text: r.link, width: qs, height: qs, correctLevel: QRCode.CorrectLevel.M });
  var qc = holder.querySelector('canvas');
  if (!qc) throw new Error('QR');
  x.imageSmoothingEnabled = false;
  x.drawImage(qc, Math.round(cx - qs / 2), Math.round(by + (box - qs) / 2), qs, qs);
  }

  y = by + box + 10 * mm;
  t.steps.forEach(function (s, i) { if (i) y += 8 * mm; text(s, y, 15, false, '#111', 184 * mm); });

  // a wide line, then whom to ask (large and bold, as before), and the developer in a similar font
  y += 9 * mm;
  if (draw) { x.fillStyle = '#999'; x.fillRect(cx - 85 * mm, y, 170 * mm, 0.7 * mm); }
  y += 13 * mm;
  text(t.ask, y, 21, true, '#111', 184 * mm);
  y += 11 * mm;
  text(t.who, y, 21, true, '#111', 184 * mm);
  if (t.phone) {
    y += 13 * mm;
    x.direction = 'ltr'; text(t.phone, y, 26, true, '#111'); x.direction = 'rtl';
  }
  if (t.dev) { y += 14 * mm; text(t.dev, y, 19, true, '#111', 184 * mm); }
  return y;
  }
}

/** Loads jsPDF once. */
function loadJsPdf(ok, fail) {
  if (window.jspdf && window.jspdf.jsPDF) return ok();
  var s = document.createElement('script');
  s.src = JSPDF_URL; s.onload = ok; s.onerror = fail;
  document.head.appendChild(s);
}

/** The sign as a PDF Blob. */
function posterPdf(canvas) {
  var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
  return doc.output('blob');
}

/** "דף QR להדפסה": draws the sign, shows it, and offers the PDF (download, and share where the phone allows). */
function makePoster(r) {
  var out = $('posterBox');
  out.hidden = false;
  out.innerHTML = '<div class="empty">מכין את הדף…</div>';
  var canvas;
  try { canvas = drawPoster(r); }
  catch (e) { out.innerHTML = '<p class="msg err">לא ניתן ליצור את קוד ה-QR בדפדפן הזה.</p>'; return; }
  // English letters only: with Hebrew in the name, Chrome may save the file as "download", without ".pdf".
  var file = 'minyan-QR.pdf';
  out.innerHTML = '<img id="posterImg" alt="דף QR להדפסה" src="' + canvas.toDataURL('image/png') + '">' +
    '<div class="actions" id="posterActions"><span class="g-meta">מכין PDF…</span></div>' +
    '<p class="g-meta">אם ההורדה לא עובדת: לחיצה ארוכה על התמונה ← שמירה, ומדפיסים אותה.</p>';
  loadJsPdf(function () {
    var blob;
    try { blob = posterPdf(canvas); }
    catch (e) { $('posterActions').innerHTML = '<span class="msg err">יצירת ה-PDF נכשלה. אפשר לשמור את התמונה.</span>'; return; }
    var url = URL.createObjectURL(blob);
    $('posterActions').innerHTML = '<a class="btn primary" id="posterDownload" href="' + url + '" download="' + esc(file) + '">הורדת PDF</a>';
    var pdf = null;
    try { pdf = new File([blob], file, { type: 'application/pdf' }); } catch (e) {}
    if (pdf && navigator.canShare && navigator.canShare({ files: [pdf] })) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.textContent = 'שיתוף';
      b.onclick = function () { navigator.share({ files: [pdf], title: file }).catch(function () {}); };
      $('posterActions').appendChild(b);
    }
  }, function () {
    $('posterActions').innerHTML = '<span class="msg err">לא ניתן לטעון את יוצר ה-PDF. אפשר לשמור את התמונה.</span>';
  });
}
