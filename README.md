# Minyan attendance tracker — Apps Script project

Google Sheet + Apps Script. Users see everything in Hebrew; the code and this README are in English.

## Files

| File | What it holds |
|---|---|
| `Setup.gs` | The מניין menu, first-time `setup()`, the הוראות (help) sheet |
| `Config.gs` | Sheet names, column layouts, settings labels, matching thresholds |
| `Kiosk.gs` | Server side of the registration web page (`doGet`, `kiosk*`) |
| `Admin.gs` | WhatsApp import and review dialogs (`admin*`), registration-link dialog |
| `Matching.gs` | Who-is-this logic: phone first, then fuzzy Hebrew name matching |
| `Names.gs` | First-name list and nicknames (מנדי = מנחם מענדל …) |
| `Data.gs` | Reading/writing the People, Attendance and Review sheets |
| `WhatsApp.gs` | Parser for pasted WhatsApp lists |
| `HebrewCalendar.gs` | Hebrew calendar arithmetic, gematria, Hebrew-date parsing |
| `Reports.gs` | Weekly and final reports, lottery draw |
| `Duplicates.gs` | Finding and merging duplicate people |
| `Utils.gs` | Dates, settings, keys, small helpers |
| `KioskPage.html` | The registration page (tablet) |
| `AdminPage.html` | Import + review dialog |
| `LinkDialog.html`, `WeeklyTextDialog.html`, `BadLinkPage.html` | Small dialogs/pages |
| `appsscript.json` | Manifest (time zone, V8, web-app access) |
| `Secrets.gs` | **Your private values — not in git.** Copy from `Secrets.gs.example` |
| `deploy.ps1`, `deploy.sh` | Push + update the existing web-app deployment in one command |
| `test/` | Local tests (Node.js) against a simulated Sheet — not uploaded to Apps Script |

## Private settings (`Secrets.gs`)

Private values live in `Secrets.gs`, which is in `.gitignore` (so it never reaches git) but is uploaded by
`clasp push` and read by the script at run time. Start from the template:

```bash
cp Secrets.gs.example Secrets.gs     # Windows: copy Secrets.gs.example Secrets.gs
```

It holds the owner account, the web-app deployment ID (the page address is built from it), the gabbai code
and, optionally, a fixed link key. Every value is optional; an empty one falls back to the הגדרות sheet.
`.clasp.json` (your Script ID) is also git-ignored. No passwords are stored anywhere in the project —
`clasp login` keeps its token in your user folder (`~/.clasprc.json`), outside the repo.

File names must be unique across `.gs` and `.html` (Apps Script ignores the extension), hence the `Page`/`Dialog` suffixes.
All `.gs` files share one global scope, and nothing runs at load time across files,
so the order of files in the editor doesn't matter.

## Install — option A: copy into the editor (no tools needed)

1. New blank Google Sheet → **Extensions → Apps Script**.
2. Rename the default `Code.gs` to `Setup` and paste `Setup.gs` into it.
3. For every other `.gs` file: **+ → Script**, give it the same name **without** `.gs`, paste the content.
4. For every `.html` file: **+ → HTML**, same name **without** `.html` (exactly: `KioskPage`, `AdminPage`, `LinkDialog`, `WeeklyTextDialog`, `BadLinkPage`), paste.
5. Save, choose `setup` in the toolbar, **Run**, approve permissions.
6. **Deploy → New deployment → Web app** — Execute as: *Me*, Who has access: *Anyone*. Copy the URL into the הגדרות sheet (כתובת דף הרישום).
7. In the Sheet: **מניין → קישור לדף הרישום** → open the link / scan the QR on the tablet.

(`appsscript.json` is optional in this route; new projects already use V8. To edit it: Project Settings → "Show appsscript.json".)

## Install — option B: `clasp` (push all files at once)

```bash
npm install -g @google/clasp
clasp login
# once: enable the Apps Script API at https://script.google.com/home/usersettings
```

1. Create the Sheet and open **Extensions → Apps Script** once (this creates the bound project).
2. **Project Settings → Script ID** → copy it.
3. In this folder: `cp .clasp.json.example .clasp.json` and paste the ID.
4. `clasp push -f`
5. Continue from step 5 of option A.

## After changing the code

The web page runs the *deployed* version: **Deploy → Manage deployments → ✎ → Version: New version → Deploy**.
The URL stays the same. Menu functions and dialogs use the latest saved code immediately.
