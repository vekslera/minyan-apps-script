// Shared by the pages — DOM shortcuts.
// Declarations only — nothing runs when the file loads; the page calls the start function.

function $(id) { return document.getElementById(id); }
function show(el, on) { (typeof el === 'string' ? $(el) : el).hidden = !on; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
