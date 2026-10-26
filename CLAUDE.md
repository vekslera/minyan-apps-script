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

- `src/` is the whole Apps Script project (`"rootDir": "src"` in `.clasp.json`); file names in Google are relative
  to it (`scripts/kiosk/main`), so moving files *inside* `src/` renames them in Google. `deploy/` = update scripts
  (+ private `minyanim.json`), `docs/` = `INSTALL-he.md`, `test/` = tests. In `src/`:
- `*.gs` — server code, one global scope; load order must not matter (only constants at load time).
  `Kiosk.gs` registration page (`doGet`, `kiosk*`), `Gabbai.gs` tools page (`gabbai*`, needs a session),
  `Admin.gs` Sheet dialogs (`admin*`, admin token) + the shared import/review core, `Reports.gs`,
  `Duplicates.gs`, `Location.gs`, `Auth.gs`, `Data.gs`, `Matching.gs`, `Names.gs`, `WhatsApp.gs`,
  `HebrewCalendar.gs`, `Utils.gs` (settings, page assembly, cache), `Config.gs`, `Setup.gs` (menu, setup, help sheet),
  `Notify.gs` (email alerts + daily check + test alert; owns `doGet`, which wraps `doGet_` in `Kiosk.gs`),
  `Account.gs` (the read-only הגדרות row with the owner's Google account; `ACCOUNT` property; onEdit puts it back).
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
- A browser-side error shows as a red bar on the page; in Executions, `doGet` completes and nothing follows.
- Data a page needs at once goes **into the page** from `doGet` (`INIT`, via `scriptJson_` — safe inside `<script>`),
  not a second call: each `google.script.run` call costs about a second of Apps Script overhead.

## Speed and measuring

- `&debug=1` on any link shows a small timing panel (`scripts/common/timing.js`): page build, each call with the
  server's share (`_ms`, added by `withMs_`), GPS, form ready, confirmation. Ask the owner for a "copy" from a real
  phone before optimizing; the flag is kept on the links between the pages, never on the link for sharing.
- One registration takes ~3 s on Google; most of it is one unavoidable server call.

## UX lessons from real users

- **People press the big button without reading.** Never leave a screen whose main button can't succeed
  (a web page can't switch the phone's location on): the main button must always lead somewhere —
  e.g. "שלח לאישור הגבאי"; instructions go folded ("איך מפעילים מיקום?") under a smaller retry.
- **One location request at a time**: a fresh reading stops the early `watchPosition` first (a parallel request
  can hang). The early reading starts on load only if permission is already granted, else on the first tap into
  a field; it is used if under 2 minutes old; retries always take a fresh one.
- Small debug or helper overlays must not cover the form on a phone (the timing panel is ~4 lines and hideable).
- Downloaded file names in English letters only (`minyan-QR.pdf`): with Hebrew in the name Chrome may save the
  file as "download", without ".pdf".
- The printable QR sign (`scripts/gabbai/poster.js`) is drawn on a canvas in the browser (the browser shapes the
  Hebrew) and wrapped in a PDF by jsPDF from cdnjs — no server work and no new permission. The developer's
  details are `DEVELOPER` in `Config.gs`; the gabbai's are settings rows (`SET.GNAME`, `SET.GPHONE`).

## Settings and secrets

- `Secrets.gs` (git-ignored) is **legacy**: optional overrides (`ownerAccount`, `deploymentId`, `kioskKey`,
  `locationLog`). `setup` copies `deploymentId`/`kioskKey` into document properties (`WEB_URL`/`KIOSK_KEY`) so it
  can be retired without changing the link (README §15). New code must not need it.
- `minyanim.json` (git-ignored, private): per minyan name, scriptId, deploymentId, key (the full link), account
  (the owning Google account's address — never passwords).
  `deploy-all` opens each page with its key after updating; the bad-link page's title ("הקישור אינו תקין",
  `doGet`) is what it looks for, so keep that title distinct. The check reads only the `<title>`: Google's wrapper
  page is full of its own JavaScript, so never search its text for words like "TypeError" (that gave false alarms).
- The page address: `deploymentId`, else `WEB_URL` (pasted in **מניין → כתובת דף הרישום (הדבקה)** — how copies
  get it). **Never `ScriptApp.getService().getUrl()`**: in a copy it returned an /exec address that opens a Drive
  error page (the mock returns a wrong address on purpose).
- The הגדרות sheet: everything the gabbai changes (name, period, thresholds, hours, minyan weekdays, shul point,
  radius, GPS tolerance, no-minyan dates in column E). Rows are found by label (`SET`, `SET_ROWS` in `Config.gs`);
  new rows go **at the end** so existing rows keep their places. `setup()` (`migrateSettings_`) puts the
  sheet in the current layout, keeps values, and is safe to re-run.
- The gabbai code: document properties only (`GABBAI_PIN`) — never in the Sheet, never in git.
- Thresholds: lottery and report to the Rebbe (default 25); **0 = switched off** (tool stays visible, marked
  "כבוי", in the tools and in the Sheet menu). Hours are text in half-hour steps (`8:30`).
- Minyan weekdays (`ימי המניין`, Hebrew letters, default `א ב ג ד ה ו`): `s.days` = weekday numbers 0–5. A day
  counts when `isMinyanDay_` (a minyan weekday, not in column E); registration, gabbai mode and the import refuse
  other weekdays. Never test `dow_ === 6` alone for "is there a minyan".
- Scaling: decided on **option C** — a copy per minyan in the minyan's own Google account. New minyanim copy a
  **template** Sheet (code only, never set up or deployed) and follow `docs/INSTALL-he.md`. `deploy-all.ps1` updates
  everything in `minyanim.json`: push from a temp folder (`Secrets.gs` only to the entry with `.clasp.json`'s
  Script ID, and only while the file exists) + `update-deployment`, then opens the link with its key. It runs as the clasp account (**maintainer**, chosen by the owner):
  every Sheet is shared with it as Editor, and after an update each page runs as it, so it must authorize each
  project once, and again when an update adds a new permission (e.g. email). Code must work identically in every copy: per-minyan values live in the
  sheet or in document properties, never in code. `setup` drops all document properties when the Sheet ID changed
  (`forgetIfCopied_`), so a copy never shares a key or gabbai code. Keep `INSTALL-he.md` in step with the menus.

## Error alerts (email)

- New features go in **new files**, with one-line hooks in existing ones (the owner's rule). Example: `Notify.gs` +
  `scripts/common/report.js` (+ `deploy/maintainer.ps1`); hooks: `doGet` → `doGet_`, `installDailyCheck_()` in
  `setup`, `reportProblem(...)` in the pages' `call()` failure handlers and `window.onerror`.
- Reported: errors without Hebrew (the app's own user messages are Hebrew), page script errors, `doGet` failures;
  once an hour per place+message; numbers masked; never registrants' names/phones/places. Daily check ~22:00, once
  per day (`DAILY_CHECK` property) even with triggers from two accounts.
- Sent with `MailApp` to the maintainer's address: `deploy/maintainer.json` (git-ignored, set by `deploy-all -Alerts`),
  written as `Maintainer.gs` (`{email, minyan}`) into minyan uploads only (not the template). The short name starts
  every subject; the body ends with the minyan's Google account and Sheet link. No `MAINTAINER` → nothing is sent.
- **ntfy.sh doesn't work from Apps Script:** its free quota is per sender IP, and Google's shared IPs have used it
  up ("429 daily message quota reached"). Don't go back to it without an account/token.

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

All in `deploy/`: `deploy.cmd` (double-click) or `.\deploy\deploy.ps1 "msg"` = `clasp push -f` + a new version of
the **same** deployment (the link and printed QR codes stay valid). Never create a new deployment. With several
minyanim: `deploy-all.cmd` (all + the template) or `template.cmd` (template only). After a settings-layout change, run
**מניין → הגדרה ראשונית** once in each minyan. Then `git push`. Test the .ps1 scripts with PowerShell 7 and a fake
`clasp` on PATH; keep them Windows PowerShell 5.1-compatible (it is what `*.cmd` runs).

## When working through the remote device bridge

- Edit in the cloud copy, run the tests there, then stage the changed files under a fresh folder
  (`/mnt/user-data/outputs/cN/`) and write them to the laptop; verify md5 sums; run `node test/e2e.js` there; commit there.
- The laptop sandbox has no Google/GitHub credentials: the owner deploys and pushes.
- Git there may leave `.git/*.lock` files unless deletion is allowed in the folder; clear only locks this session left.
