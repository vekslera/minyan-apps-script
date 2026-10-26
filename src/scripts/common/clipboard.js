// Shared by the dialogs — copy text, with a fallback for browsers without the clipboard API.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function copyText(text, button, selectEl) {
  function ok() { button.textContent = 'הועתק ✓'; }
  function fallback() {
    try {
      if (selectEl && selectEl.select) selectEl.select();
      else if (selectEl) { var r = document.createRange(); r.selectNodeContents(selectEl); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      document.execCommand('copy'); ok();
    } catch (e) {}
  }
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
}
