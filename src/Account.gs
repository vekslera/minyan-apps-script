// ======================================================================================
//  THE MINYAN'S GOOGLE ACCOUNT — a read-only row in הגדרות
//  setup() writes the address of the Sheet's owner (the minyan's own Google account) and protects the cell;
//  a manual change is put back at once (onEdit). Information only: nothing in the app depends on it.
//  The cell has "warning" protection, not a lock, so setup() run from any account can still rewrite the sheet.
// ======================================================================================

const ACCOUNT_LOCK = 'חשבון Google של המניין — נרשם אוטומטית';

/** The owner's address, or '' (a shared drive has no owner). */
function ownerAccount_(ss) {
  try { const o = ss.getOwner(); return o && o.getEmail ? String(o.getEmail() || '') : ''; } catch (e) { return ''; }
}

/** setup(): records the owner in its row, read-only. Returns a line for setup's message, or ''. */
function recordAccount_(ss) {
  const email = ownerAccount_(ss) || PropertiesService.getDocumentProperties().getProperty('ACCOUNT') || '';
  if (!email) return '';
  PropertiesService.getDocumentProperties().setProperty('ACCOUNT', email);
  const v = {}; v[SET.ACCOUNT] = email;
  setSettings_(v);
  try {
    const sh = sheet_(ss, SH.SETTINGS);
    const row = accountRow_(sh);
    if (!row) return '';
    sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => { if (p.getDescription() === ACCOUNT_LOCK) p.remove(); });
    const cell = sh.getRange(row, 2);
    cell.protect().setDescription(ACCOUNT_LOCK).setWarningOnly(true);
    cell.setBackground('#eeeeee');
  } catch (e) {}
  return '';
}

function accountRow_(sh) {
  const labels = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues().map(r => String(r[0]).trim());
  return labels.indexOf(SET.ACCOUNT) + 1;
}

/** onEdit: a manual change to the account cell is put back. */
function guardAccount_(e) {
  try {
    const r = e && e.range, sh = r && r.getSheet();
    if (!sh || sh.getName() !== SH.SETTINGS || r.getColumn() > 2 || r.getLastColumn() < 2) return;
    const row = accountRow_(sh);
    if (!row || row < r.getRow() || row > r.getLastRow()) return;
    const email = PropertiesService.getDocumentProperties().getProperty('ACCOUNT') || '';
    if (String(sh.getRange(row, 2).getValue()) !== email) sh.getRange(row, 2).setValue(email);
  } catch (err) {}
}
