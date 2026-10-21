# Minyan attendance tracker (מעקב נוכחות במניין)

A Google Sheet plus Apps Script that tracks attendance at a weekday minyan and runs a lottery for regular attendees.

- **Registration page.** A Hebrew page for a tablet in the shul. A person types a phone number (or a surname) and taps "רישום נוכחות".
- **Gabbai mode.** The gabbai can register others, also for earlier dates.
- **WhatsApp import.** Paste the attendance lists posted in the WhatsApp group. Each name is matched to a known person, allowing for typos, nicknames and swapped first/last names.
- **Review screen.** Uncertain matches wait here. The gabbai confirms the person and adds or confirms the phone number.
- **Reports.** A weekly report and a final report for the whole period, each with a text ready to paste into WhatsApp.
- **Lottery.** Only people at or above the threshold (75% by default) take part, and every draw is logged.

Everything the users see is in Hebrew. The code and this README are in English.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Create the Sheet and its script project](#2-create-the-sheet-and-its-script-project)
3. [Upload the code](#3-upload-the-code): route A with clasp, or route B by copy-paste
4. [Run setup() and grant permissions](#4-run-setup-and-grant-permissions)
5. [Publish the registration page](#5-publish-the-registration-page-web-app)
6. [Fill in the settings](#6-fill-in-the-settings)
7. [Open the page on the tablet](#7-open-the-page-on-the-tablet)
8. [Daily use](#8-daily-use)
9. [Updating the code later](#9-updating-the-code-later)
10. [Troubleshooting](#10-troubleshooting)
11. [Files](#11-files) and [private settings](#12-private-settings-secretsgs)
12. [Local tests](#13-local-tests) and [performance notes](#14-performance-notes)

Google's menus are shown here as **English / עברית**, because the labels depend on your Google language setting.

---

## 1. What you need

- **A Google account** to own the Sheet. A dedicated account for the minyan is a good idea (for example `minyan.yourshul@gmail.com`): the registration page runs under this account, and the gabbai can be given access to it.
- **A computer with a browser.** The installation is done on a computer, not on the tablet.
- **For route A only:** [Node.js](https://nodejs.org) 22 or newer, and `clasp`, Google's command-line tool for Apps Script. Route B needs nothing besides the browser.

Sign in to Chrome with **only** the minyan account while installing, or use a separate Chrome profile for it. Apps Script misbehaves when several Google accounts are signed in at once ([§10](#10-troubleshooting)).

---

## 2. Create the Sheet and its script project

1. Go to <https://sheets.google.com> → **Blank spreadsheet / גיליון אלקטרוני ריק**.
2. Rename it (top left), e.g. `נוכחות מניין`.
3. Menu **Extensions / תוספים → Apps Script**. A new tab opens with the script editor. This script is *bound* to the Sheet.
4. Rename the project (top left, "Untitled project / פרויקט ללא שם"), e.g. `minyan-attendance`.

Keep both tabs (Sheet and editor) open.

---

## 3. Upload the code

### Route A: with clasp (recommended for developers)

**One-time setup on your computer:**

```bash
npm install -g @google/clasp
clasp --version            # 3.x
clasp login                # opens a browser: choose the minyan account and allow
```

- Enable the Apps Script API for that account at <https://script.google.com/home/usersettings>: **Google Apps Script API → On**.
- `clasp login` stores its token in your home folder (`~/.clasprc.json`), outside this project. No password is ever stored in the project.

**Connect this folder to the project:**

1. In the script editor: **Project Settings / הגדרות הפרויקט** (⚙ in the side bar) → **IDs / מזהים → Script ID / מזהה סקריפט** → **Copy**.
2. In this folder:
   ```bash
   cp .clasp.json.example .clasp.json          # Windows: copy .clasp.json.example .clasp.json
   cp Secrets.gs.example Secrets.gs            # Windows: copy Secrets.gs.example Secrets.gs
   ```
   Paste the Script ID into `.clasp.json`. Keep the two extension lines as they are:
   ```json
   {
     "scriptId": "1AbC…your-script-id…",
     "rootDir": ".",
     "scriptExtensions": [".gs"],
     "htmlExtensions": [".html", ".js"]
   }
   ```
   **The extension lines are required.** By default clasp uploads `.js` files as *server* code. These two lines make it upload the browser scripts in `scripts/` as HTML-type files instead ([§11](#11-files)). `deploy.ps1` / `deploy.sh` refuse to run without them.
   Both files are git-ignored. You will fill `Secrets.gs` in [step 6](#6-fill-in-the-settings).

**Push:**

```bash
clasp status      # lists what will be uploaded: 12 .gs files + Secrets.gs, 5 .html files, 15 scripts/…/*.js files, appsscript.json
clasp push -f     # -f overwrites the project's manifest without asking
```

- **Push replaces the whole online project with this folder.** The editor's default `Code.gs` disappears; that is expected.
- **Check the result.** Reload the editor tab: you should see the files listed in [§11](#11-files).

### Route B: copy-paste in the browser (no tools)

In the script editor:

1. Click the default file **`Code.gs`** → ⋮ → **Rename / שינוי שם** → `Setup`. Replace its content with the content of `Setup.gs`.
2. For each of the other `.gs` files (`Admin`, `Config`, `Data`, `Duplicates`, `HebrewCalendar`, `Kiosk`, `Matching`, `Names`, `Reports`, `Utils`, `WhatsApp`): **Files / קבצים → + → Script / סקריפט**. Type the name **without `.gs`** and paste the content.
3. For each `.html` file: **+ → HTML**. Type the name **exactly**, without `.html`: `KioskPage`, `AdminPage`, `LinkDialog`, `ReportTextDialog`, `BadLinkPage`, then paste.
4. For each file in the `scripts` folder: also **+ → HTML** (not Script). Type its path **without `.js`**, slashes included, e.g. `scripts/kiosk/main`. Paste the file's content as it is. All 15 files:
   `scripts/common/dom`, `scripts/common/clipboard`,
   `scripts/kiosk/helpers`, `scripts/kiosk/deviceDetection`, `scripts/kiosk/hebrewDate`, `scripts/kiosk/lookup`, `scripts/kiosk/registration`, `scripts/kiosk/gabbaiMode`, `scripts/kiosk/main`,
   `scripts/admin/helpers`, `scripts/admin/import`, `scripts/admin/review`, `scripts/admin/main`,
   `scripts/dialogs/linkDialog`, `scripts/dialogs/reportText`.
5. **Optional:** create `Secrets` (+ → Script) from `Secrets.gs.example`. Without it, everything is configured in the הגדרות sheet.
6. Save (Ctrl+S).

**File names must be unique, ignoring the extension.** Apps Script treats `Admin.gs` and `Admin.html` as the same name, so the HTML files carry `Page`/`Dialog` suffixes.

---

## 4. Run setup() and grant permissions

1. In the editor, open the file **Setup**. The function list only shows the open file's functions.
2. In the toolbar, choose **`setup`** in the function drop-down, then click **▷ Run / הפעלה**.
3. First time only, Google asks for permissions:
   - **Review permissions / בדיקת הרשאות** → choose the minyan account.
   - "Google hasn't verified this app / Google לא אימתה את האפליקציה הזו" → **Advanced / מתקדם** → **Go to … (unsafe) / מעבר אל … (לא בטוח)**. This warning is normal for your own script.
   - If permissions are listed with checkboxes, tick all of them (**Select all / בחירת הכול**), then **Continue / המשך**.
4. **Switch to the Sheet tab.** setup() finishes with a popup, "ההגדרה הושלמה", that appears in the Sheet, not in the editor. Click **OK**. Until you do, the editor's log stays at "Execution started" and eventually times out after 6 minutes.

**Result:** the Sheet now has the tabs **הוראות · הגדרות · אנשים · נוכחות · לבדיקה · כפילויות**, and a **מניין** menu appears in the menu bar. Reload the Sheet if you don't see the menu. Running `setup` again is safe: it never overwrites data, settings or the link key.

---

## 5. Publish the registration page (web app)

1. In the editor: **Deploy / פריסה → New deployment / פריסה חדשה**.
2. Click the ⚙ next to **Select type / בחירת סוג** → **Web app / אפליקציית אינטרנט**.
3. Set:
   - **Description:** e.g. `registration page`
   - **Execute as / הפעלה בתור:** **Me / אני (your-account@gmail.com)**
   - **Who has access / למי יש גישה:** **Anyone / כל אחד**. Not "Anyone with a Google account", because the tablet need not be signed in.
4. **Deploy / פריסה** (authorize again if asked).
5. Copy two things from the result screen:
   - the **Deployment ID / מזהה פריסה** (starts with `AKfycb…`);
   - the **Web app URL**, which is `https://script.google.com/macros/s/<Deployment ID>/exec`.

Create a **new** deployment only this once. Later code updates go to the **same** deployment ([§9](#9-updating-the-code-later)); otherwise the address changes and the tablet's link stops working.

Route A alternative: `clasp create-deployment -d "registration page"` prints the deployment ID.

---

## 6. Fill in the settings

**Option 1: `Secrets.gs`** (route A, or route B if you created the Secrets file). Fill in:

```js
const SECRETS = {
  ownerAccount: 'minyan.yourshul@gmail.com',
  deploymentId: 'AKfycb…',         // from step 5
  gabbaiPin: '2468',               // your choice; empty = use the code in the הגדרות sheet
  lotteryThreshold: 75,            // % of minyan days needed for the lottery; empty = use the הגדרות sheet
  kioskKey: '',                    // leave empty
};
```

Then upload it with `clasp push` (route B: just save the file).

**Option 2: the הגדרות sheet.** In the Sheet, open the **הגדרות** tab. The sheet is right-to-left, so column A is on the right.

| Row | Column A (setting) | What to put in **column B** |
|---|---|---|
| 2 | שם המניין | Shown at the top of the page, e.g. `מניין שחרית` |
| 3 | תחילת התקופה | First day of the lottery period |
| 4 | סוף התקופה | Last day of the period |
| 5 | אחוז נוכחות מינימלי להגרלה | `75` means 75% or more — ignored when `lotteryThreshold` is set in `Secrets.gs` |
| 6–7 | רישום עצמי פתוח משעה / עד שעה | Self-registration hours, e.g. `5` and `11`. The gabbai can register at any time |
| 8 | קוד גבאי | The gabbai code, if not set in `Secrets.gs` |
| 9 | כתובת דף הרישום (Web app) | The web-app URL from step 5, if `deploymentId` is not set in `Secrets.gs` |

- **Values go in column B.** Column C is only an explanation, and a value typed there is ignored.
- **Days with no minyan.** Column **E**, one date per cell, for weekdays with no registration (e.g. Yom Tov). They don't count toward the percentage.

---

## 7. Open the page on the tablet

1. In the Sheet: **מניין → קישור לדף הרישום**. A window shows the full link (ending in `?k=…`), a QR code, and the gabbai code.
2. Open that link on the tablet (scan the QR or send it), and add it to the home screen.
3. Test it: register yourself with your phone number. A row appears in the **נוכחות** tab.

- **Use the full link, with `?k=…`.** The bare `/exec` address deliberately shows "הקישור אינו תקין". The key keeps people who only know the address from registering from home.
- **Keep the full link private.** Anyone who has it can register.

---

### The device the page runs on

Outside gabbai mode, the page detects what it runs on: **טלפון נייד** (phone), **טאבלט** (tablet) or **מחשב** (desktop). It shows the result in small print under "מצב גבאי".

- **Where it's recorded.** Each self-registration stores it in the **מקור** column of the נוכחות sheet, for example `דף רישום · נייד`. Gabbai-mode registrations stay `גבאי`.
- **How it decides.** It uses the browser's own report (client hints, then the user-agent). An iPad that presents itself as a Mac is recognized by its touch screen.
- **The shul's own tablet.** Add `&device=kiosk` to the end of its link, i.e. `…/exec?k=…&device=kiosk`. That marks it as **טאבלט בית הכנסת** whatever the browser reports, so it is never treated as a private phone. The printed QR code should stay *without* this ending.

## 8. Daily use

The **הוראות** tab in the Sheet explains it in Hebrew. In short:

- **Tablet.** A person types a phone number and taps "רישום נוכחות". Israeli mobile, 07X and landline numbers and US/Canadian numbers (`+1`) are accepted, typed with or without dashes, spaces or a country code. The first time, they also type their name. The page suggests known names while typing.
- **Gabbai mode** ("מצב גבאי" at the bottom of the page, plus the code): register others, choose an earlier date, and register outside the self-registration hours.
- **מניין → ייבוא רשימה מוואטסאפ.** Paste the lists from WhatsApp; a date line such as `19/10` or `ח׳ חשוון` starts each day. Check the dates, then confirm the names in the review screen.
- **מניין → רישומים לבדיקה.** Entries the system wasn't sure about. Pick the right person, confirm or add the phone, and save.
- **מניין → דוח שבועי / דוח סופי לתקופה.** Each report opens as a new tab, together with a short text to paste into WhatsApp.
- **מניין → הגרלה.** Draws one winner among those at or above the threshold, and logs the draw in the **הגרלות** tab.
- **מניין → איתור כפילויות** finds people entered twice. Tick "למזג?" next to the real duplicates, then use **מיזוג הכפילויות המסומנות**.

---

## 9. Updating the code later

Menus and dialogs in the Sheet always use the latest uploaded code. The **registration page** runs the *deployed version*, so it needs one more step.

**Route A:**

```powershell
.\deploy.ps1 "what changed"      # Windows PowerShell
```
```bash
./deploy.sh "what changed"       # macOS / Linux
```

Both run `clasp push -f`, then `clasp update-deployment <deploymentId from Secrets.gs>`. The address and the tablet's link stay the same.

- **PowerShell may block the script.** If it says running scripts is disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

**Route B (browser):** **Deploy / פריסה → Manage deployments / ניהול פריסות** → select the web-app deployment → ✎ **Edit / עריכה** → **Version / גרסה: New version / גרסה חדשה** → **Deploy / פריסה**.

Don't create a new deployment for an update: it gets a new address.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Pages break with `ReferenceError: document is not defined` in **Executions**, or functions "not found" | `scripts/*.js` were uploaded as server code because `.clasp.json` lacks `"scriptExtensions": [".gs"]` and `"htmlExtensions": [".html", ".js"]`. Add them (see `.clasp.json.example`) and push again. |
| `clasp push`: "A file with this name already exists … Admin" | Two files with the same name ignoring extension (e.g. an old `Admin.html` next to `Admin.gs`). Delete the old file and push again. |
| `clasp push`: "User has not enabled the Apps Script API" | Turn it on at <https://script.google.com/home/usersettings>, wait a minute, retry. |
| setup() "Exceeded maximum execution time" | The "ההגדרה הושלמה" popup in the Sheet tab wasn't clicked. Run it again and click OK in the Sheet. |
| No **מניין** menu | Reload the Sheet. If it's still missing, setup() hasn't run successfully ([§4](#4-run-setup-and-grant-permissions)). |
| "דף הרישום עדיין לא פורסם" when opening the link dialog | No web-app address is known. Set `deploymentId` in `Secrets.gs`, or paste the URL into **column B, row 9** of הגדרות. |
| Page says "הקישור אינו תקין" | You opened the bare `/exec` address. Use the full link from **מניין → קישור לדף הרישום**. |
| Google page: "Sorry, unable to open the file at this time / מצטערים, לא ניתן לפתוח את הקובץ כרגע" | The address doesn't belong to an *active* deployment (an old or archived one, or a typo), or several Google accounts are signed in. Check **Deploy → Manage deployments** and compare the deployment ID with yours. Try a private window. In the editor, **Executions / ביצועים** shows a `doGet` row for every request that actually reached the script. |
| A registration shows "הרישום התקבל ויאושר על ידי הגבאי" | The system wasn't sure who it was. The entry waits in **מניין → רישומים לבדיקה**. |
| A day shows "אין אף רישום" in a report | Import that day's WhatsApp list, or add the date to column E of הגדרות if there was no minyan. |

---

## 11. Files

| File | What it holds |
|---|---|
| `Setup.gs` | The מניין menu, first-time `setup()`, the הוראות (help) sheet |
| `Config.gs` | Sheet names, column layouts, settings labels, matching thresholds |
| `Kiosk.gs` | Server side of the registration page (`doGet`, `kiosk*`) |
| `Admin.gs` | WhatsApp import and review dialogs (`admin*`), registration-link dialog |
| `Matching.gs` | Who-is-this logic: phone first, then fuzzy Hebrew name matching |
| `Names.gs` | First-name list and nicknames (מנדי = מנחם מענדל …) |
| `Data.gs` | Reading/writing the People, Attendance and Review sheets |
| `WhatsApp.gs` | Parser for pasted WhatsApp lists |
| `HebrewCalendar.gs` | Hebrew calendar arithmetic, gematria, Hebrew-date parsing |
| `Reports.gs` | Weekly and final reports, lottery draw |
| `Duplicates.gs` | Finding and merging duplicate people |
| `Utils.gs` | Dates, settings, keys, private-settings loader, small helpers |
| `KioskPage.html` | The registration page: markup and styles |
| `AdminPage.html` | Import + review dialog: markup and styles |
| `LinkDialog.html`, `ReportTextDialog.html`, `BadLinkPage.html` | Small dialogs/pages |
| `scripts/common/dom.js`, `clipboard.js` | Browser helpers shared by the pages |
| `scripts/kiosk/*.js` | Registration page: `helpers`, `deviceDetection`, `hebrewDate`, `lookup` (live suggestions), `registration` (submit/confirmation), `gabbaiMode`, `main` (state + `startKiosk()`) |
| `scripts/admin/*.js` | Import/review dialog: `helpers`, `import`, `review`, `main` (tabs + `startAdmin()`) |
| `scripts/dialogs/*.js` | `linkDialog` (QR + copy), `reportText` (copy) |
| `appsscript.json` | Manifest (time zone, V8, web-app access) |
| `Secrets.gs.example` | Template for your private `Secrets.gs` |
| `deploy.ps1`, `deploy.sh` | Push + update the existing web-app deployment |
| `.claspignore` | Keeps docs, tests and scripts out of `clasp push` |
| `test/` | Local tests against a simulated Sheet (not uploaded) |

All `.gs` files share one global scope, and nothing runs at load time across files, so the order of files in the editor doesn't matter.

### How the browser code is organized

Apps Script cannot serve a `.js` file to the browser: a page is one HTML document. So:

- **Where it lives.** The browser code is in `scripts/**/*.js`, plain JavaScript that your editor understands. `.clasp.json` (`"htmlExtensions": [".html", ".js"]`) uploads each one as an HTML-type file named by its path, e.g. `scripts/kiosk/main`.
- **How it gets into the page.** A page refers to it with `<script data-include="scripts/kiosk/main.js"></script>`. When the server builds the page (`page_()` in `Utils.gs`), it replaces that tag with the file's code. The page's small first `<script>` holds the values the server fills in (`KEY`, `TOKEN` …), and its last one calls the start function (`startKiosk()`, `startAdmin()` …).
- **Declarations only.** The files only declare functions and variables; nothing runs until the page calls its start function. Order between files therefore doesn't matter, and a file uploaded by mistake as server code can't break the project (a test checks this).
- **Code shared with the server.** Phone rules and name matching are not copied into `scripts/`. They are the server's own functions, sent into the page as text by `sharedJs_()` (the `/*__SHARED_JS__*/` marker in the page).

## 12. Private settings (`Secrets.gs`)

- **Where they live.** Private values live in `Secrets.gs`. It is in `.gitignore`, so it never reaches git, but `clasp push` uploads it and the script reads it at run time.
- **What it holds.** The owner account, the web-app deployment ID (the page address is built from it), the gabbai code, the lottery threshold and, optionally, a fixed link key.
- **Every value is optional.** An empty value falls back to the הגדרות sheet or to an automatically generated key.
- **Other private files.** `.clasp.json` (your Script ID) is also git-ignored.
- **No passwords.** None are stored anywhere in the project. `clasp login` keeps its token in your user folder (`~/.clasprc.json`), outside the repo.

## 13. Local tests

The tests run the real `.gs` files in Node.js against a simulated Sheet. They never use your real `Secrets.gs`.

```bash
node test/e2e.js           # end-to-end: registration, import, review, reports, settings  → "ALL OK"
node test/hebcal_check.js  # Hebrew calendar vs. the ICU calendar, 2023–2028
node test/ui.js            # renders the pages in Chromium; needs:  npm install playwright
node test/device.js        # device detection with emulated iPhone/Android/iPad/desktop browsers (Playwright)
node test/profile.js       # counts Google-service calls per action on a month of sample data
```

## 14. Performance notes

- **Each call to a Google service is the main cost**, roughly 30–150 ms on Google's servers. `test/profile.js` counts them per action.
- **Name suggestions run in the page.** The registration page matches names itself, against the list of names it gets once on load and refreshes every 5 minutes. That list never includes phone numbers. Typing never waits for the server; only a complete phone number is checked there.
- **Cache for read-only lookups.** People and settings are kept in the script cache for up to 10 minutes. The cache is cleared whenever the script writes, and by the `onEdit` trigger whenever someone edits the אנשים or הגדרות sheet by hand. Every write reads the sheet fresh, so the cache can never overwrite data.
- **Deleting rows by hand** fires no `onEdit`. The tablet may then show a deleted name for up to 10 minutes; registrations are not affected.
- **Large sheets load only when needed.** The attendance history and the review sheet are read only by actions that use them.
