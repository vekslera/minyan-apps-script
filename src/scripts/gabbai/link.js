// Gabbai tools page — the registration link: QR code, copy, share.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function loadLink() {
  $('linkBox').innerHTML = '<div class="empty">טוען…</div>';
  call('Link', [], function (r) {
    if (!r.link) {
      $('linkBox').innerHTML = '<p>כתובת דף הרישום לא ידועה. בגיליון: מניין ← קישור לדף הרישום, או מלאו deploymentId בקובץ Secrets.gs.</p>';
      return;
    }
    $('linkBox').innerHTML = '<div id="qr"></div><b>הקישור לדף הרישום</b><div class="url" id="url">' + esc(r.link) + '</div>' +
      '<div class="actions"><a class="btn primary" href="' + esc(r.link) + '" target="_top">פתיחה</a>' +
      '<button class="btn" type="button" id="copyLink">העתקה</button>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(r.link) + '">שליחה בוואטסאפ</a></div>' +
      '<p class="g-meta" style="margin-top:14px">שמרו את הקישור לעצמכם. מי שאין לו את הקישור לא יכול להירשם.</p>' +
      '<p class="g-meta">כלי הגבאי (לסימנייה): <span class="url" id="toolsUrl" style="display:block">' + esc(r.tools) + '</span>' +
      '<button class="btn" type="button" id="copyTools">העתקת קישור כלי הגבאי</button></p>';
    try { new QRCode($('qr'), { text: r.link, width: 200, height: 200 }); } catch (e) { show('qr', false); }
    $('copyLink').onclick = function () { copyText(r.link, this, $('url')); };
    $('copyTools').onclick = function () { copyText(r.tools, this, $('toolsUrl')); };
  });
}
