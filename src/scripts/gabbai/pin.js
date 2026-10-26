// Gabbai tools page — changing the gabbai code. Everyone else is logged out; this page gets a fresh session.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function openPin() { $('pinCur').value = ''; $('pinNew').value = ''; $('pinNew2').value = ''; }
function savePin() {
  var cur = $('pinCur').value.trim(), next = $('pinNew').value, again = $('pinNew2').value;
  if (!cur || !next) return flash('pinNote', 'err', 'נא למלא את הקוד הנוכחי ואת הקוד החדש');
  if (next !== again) return flash('pinNote', 'err', 'הקוד החדש לא זהה בשתי הפעמים');
  wait('pinSave');
  call('ChangePin', [cur, next], function (r) {
    unwait();
    S.session = r.token; store('minyanSession', r.token);
    openPin();
    flash('pinNote', 'ok', 'קוד הגבאי שונה. כל שאר המכשירים נותקו ממצב גבאי.');
  });
}
