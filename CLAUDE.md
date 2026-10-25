# CLAUDE.md — working on this project

Minyan attendance tracker: a Google Sheet with a bound Apps Script project. People register at the shul on a web page (phone / tablet); the gabbai reviews, imports WhatsApp lists, and produces reports, the report to the Rebbe and a lottery. Hebrew interface, English code and docs. The README is the full manual; this file is what a new session needs first.

## How the owner works (follow it)

- **One step at a time.** When given a list, do one step, then: update the README, commit, report briefly, and **wait for approval** before the next step. Small related items may share a commit when the user agrees.
- **Ask before building** only when a wrong guess is expensive; otherwise build and state the choices made.
- **README with every change**: install, daily use, settings table, troubleshooting, files table, tests. Also the Hebrew help sheet (`writeHelp_` in `Setup.gs`) when users see the change.
- **Interface 100% Hebrew.** Code, comments, README and commit messages in English.
- **Never use a real value as an example** — not in docs, UI text, tests or comments. A value the user mentions may become the real password (this happened once and the history had to be rewritten). Use neutral placeholders (`testcode9`, `''`).
- Commits: author `Alex <vekslera@gmail.com>`; end the message with the Co-Authored-By / session trailer.

## Layout

- `*.gs` — server code, one global scope; load order must not matter (only constants at load time).
  `Kiosk.gs` registration page (`doGet`, `kiosk*`), `Gabbai.gs` tools page (`gabbai*`, needs a session),
  `Admin.gs` Sheet dialogs (`admin*`, admin token) + the shared import/review core, `Reports.gs`,
  `Duplicates.gs`, `Location.gs`, `Auth.gs`, `Data.gs`, `Matching.gs`, `Names.gs`, `WhatsApp.gs`,
  `HebrewCalendar.gs`, `Utils.gs` (settings, page assembly, cache), `Config.gs`, `Setup.gs` (menu, setup, help sheet).
- `*Page.html` / `*Dialog.html` — pages. `scripts/**/*.js` — browser code. `styles/tools.html` — shared CSS.
- One implementation per feature, thin wrappers per surface (Sheet menu / dialogs vs. web tools).
- `test/` — Node tests against a simulated Sheet (`test/mock.js`); never uploaded.

## Apps Script traps (all were hit)

- **Read project files with `HtmlService.createTemplateFromFile(name).getRawContent()`**, never
  `createHtmlOutputFromFile(name).getContent()`: Google strips comments and turns `<` into `&lt;` in plain
  script files → "Unexpected token ';'" and a page stuck on "טוען…". `page_()` / `fileText_()` in `Utils.gs`.
- **Nothing may depend on a comment** (markers are tags: `<script data-shared></script>`, `data-include`).
- Every `scripts/**/*.js` starts with a `//` line (`clientScript_` checks it) and holds **declarations only**;
  each page calls one `startX()`.
- `.clasp.json` needs `"scriptExtensions": [".gs"], "htmlExtensions": [".html", ".js"]`.
- File names unique **ignoring the extension** (`Admin.gs` vs `AdminPage.html`).
- Web context: no `SpreadsheetApp.getUi()`, no `sheet.activate()`, never return `Date` objects to the page.
- Sheets turns `8:30` typed into a cell into a 1899 time value — hour cells are text (`parseHour_`, `fmtHour_`).
- `doGet` completing in Executions with no follow-up `kioskInit` = a browser-side error (each page shows a red bar).

## Settings and secrets

- `Secrets.gs` (git-ignored): only set-once values — `ownerAccount`, `deploymentId` (the single source of the
  page address), `kioskKey`, `locationLog` (reserved). Template: `Secrets.gs.example`.
- The הגדרות sheet: everything the gabbai changes (name, period, thresholds, hours, shul point, radius, GPS
  tolerance, no-minyan dates in column E). Rows are found by label (`SET`, `SET_ROWS` in `Config.gs`);
  new rows go **at the end** so existing rows keep their places. `setup()` (`migrateSettings_`) puts the
  sheet in the current layout, keeps values, and is safe to re-run.
- The gabbai code: document properties only (`GABBAI_PIN`) — never in the Sheet, never in git.
- Thresholds: lottery and report to the Rebbe; **0 = switched off** (tool stays visible, marked "כבוי").

## Privacy

- Registrants' coordinates are used once for the check and **never stored**; only "outside, ~850 מ׳" for
  entries sent for approval. A test asserts no coordinate outside הגדרות (which holds only the shul's point).

## Tests (run before every commit)

```bash
node test/e2e.js        # → "ALL OK" (server logic, every feature block)
node test/ui.js         # Playwright pages; also: gabbai.js, mobile.js, location.js, device.js, profile.js
```
The mock imitates Google's quirks (comment stripping, `<` escaping, no UI in web context, Date detector).
When the live app behaves differently from the tests, first teach the mock the quirk and reproduce it.

## Deploying (done by the owner, on his laptop)

`deploy.cmd` (double-click) or `.\deploy.ps1 "msg"` = `clasp push -f` + a new version of the **same**
deployment (the link and printed QR codes stay valid). Never create a new deployment. After a settings-layout
change, run **מניין → הגדרה ראשונית** once. Then `git push`.

## When working through the remote device bridge

- Edit in the cloud copy, run the tests there, then stage the changed files under a fresh folder
  (`/mnt/user-data/outputs/cN/`) and write them to the laptop; verify md5 sums; run `node test/e2e.js` there; commit there.
- The laptop sandbox has no Google/GitHub credentials: the owner deploys and pushes.
- Git there may leave `.git/*.lock` files unless deletion is allowed in the folder; clear only locks this session left.
