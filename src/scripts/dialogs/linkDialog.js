// "קישור לדף הרישום" dialog — QR code and copy button. LinkDialog.html calls startLinkDialog().
// Declarations only — nothing runs when the file loads; the page calls the start function.

function startLinkDialog() {
  var url = document.getElementById('url');
  try { new QRCode(document.getElementById('qr'), { text: url.textContent, width: 180, height: 180 }); } catch (e) {}
  document.getElementById('copy').onclick = function () { copyText(url.textContent, this, url); };
}
