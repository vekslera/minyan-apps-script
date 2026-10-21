// Import/review dialog — state, tabs and start-up. AdminPage.html calls startAdmin().
// Declarations only — nothing runs when the file loads; the page calls the start function.

var S = { view: '', imp: null, groups: [], people: [], byId: {}, dec: {}, errors: {}, busy: false };

function go(v) {
  S.view = v;
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('on', t.getAttribute('data-v') === v); });
  show('v-import', v === 'import'); show('v-review', v === 'review');
  if (v === 'review') loadReview(); else renderImportBar();
}

function startAdmin() {
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.onclick = function () { go(t.getAttribute('data-v')); }; });
  $('parseBtn').onclick = parseImport;
  $('confirmAll').onclick = confirmCertainMatches;
  $('defDate').value = '';
  go(START === 'review' ? 'review' : 'import');
}
