// Report text dialog — copy button. ReportTextDialog.html calls startReportText().
// Declarations only — nothing runs when the file loads; the page calls the start function.

function startReportText() {
  var t = document.getElementById('t');
  document.getElementById('copy').onclick = function () { t.select(); copyText(t.value, this, t); };
}
