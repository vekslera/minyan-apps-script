# Minyan attendance tracker (מעקב נוכחות במניין)

Built with Google Scripts · By **Alex Veksler** · [vekslera@gmail.com](mailto:vekslera@gmail.com) · +972-52-8353205

A Google Sheet plus Apps Script that tracks attendance at a weekday minyan and runs a lottery for regular attendees.

- **Registration page.** A Hebrew page that people open on their own phone or tablet, by scanning a QR code at the shul (or on a shul tablet, if there is one). A person types a phone number (or a surname) and taps "רישום נוכחות".
  - **Location check.** Self-registration must come from the shul. Someone outside is told so, and can retry or send the registration for the gabbai's approval. Coordinates are never stored.
  - **Remembered number.** On a phone, a number that was entered once is remembered for next time.
  - **Computers.** A computer can be used only in gabbai mode.
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
7. [Open the page and test it](#7-open-the-page-and-test-it)
8. [Daily use](#8-daily-use)
9. [Updating the code later](#9-updating-the-code-later)
10. [Troubleshooting](#10-troubleshooting)
11. [Files](#11-files) and [private settings](#12-private-settings-secretsgs)
12. [Local tests](#13-local-tests) and [performance notes](#14-performance-notes)
13. [More minyanim: the template](#15-more-minyanim-the-template) — a copy per minyan, with a one-page Hebrew guide

Google's menus are shown here as **English / עברית**, because the labels depend on your Google language setting.

---

## 1. What you need

- **A Google account** to own the Sheet. A dedicated account for the minyan is a good idea (for example `minyan.yourshul@gmail.com`): the registration page runs under this account, and the gabbai can be given access to it.
- **A computer with a browser.** The installation is done on a computer, not on a phone.
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
clasp status      # lists what will be uploaded: 15 .gs files + Secrets.gs, 7 .html files (one in styles/), 26 scripts/…/*.js files, appsscript.json
clasp push -f     # -f overwrites the project's manifest without asking
```

- **Push replaces the whole online project with this folder.** The editor's default `Code.gs` disappears; that is expected.
- **Check the result.** Reload the editor tab: you should see the files listed in [§11](#11-files).

### Route B: copy-paste in the browser (no tools)

In the script editor:

1. Click the default file **`Code.gs`** → ⋮ → **Rename / שינוי שם** → `Setup`. Replace its content with the content of `Setup.gs`.
2. For each of the other `.gs` files (`Admin`, `Auth`, `Config`, `Data`, `Duplicates`, `Gabbai`, `HebrewCalendar`, `Kiosk`, `Location`, `Matching`, `Names`, `Reports`, `Utils`, `WhatsApp`): **Files / קבצים → + → Script / סקריפט**. Type the name **without `.gs`** and paste the content.
3. For each `.html` file: **+ → HTML**. Type the name **exactly**, without `.html`: `KioskPage`, `GabbaiPage`, `AdminPage`, `LinkDialog`, `ReportTextDialog`, `BadLinkPage`, then paste. Also `styles/tools` (from `styles/tools.html`, slash included).
4. For each file in the `scripts` folder: also **+ → HTML** (not Script). Type its path **without `.js`**, slashes included, e.g. `scripts/kiosk/main`. Paste the file's content as it is. All 26 files:
   `scripts/common/dom`, `scripts/common/clipboard`, `scripts/common/timing`,
   `scripts/kiosk/helpers`, `scripts/kiosk/deviceDetection`, `scripts/kiosk/hebrewDate`, `scripts/kiosk/lookup`, `scripts/kiosk/registration`, `scripts/kiosk/gabbaiMode`, `scripts/kiosk/myPhone`, `scripts/kiosk/location`, `scripts/kiosk/main`,
   `scripts/admin/helpers`, `scripts/admin/import`, `scripts/admin/review`, `scripts/admin/main`,
   `scripts/gabbai/main`, `scripts/gabbai/reports`, `scripts/gabbai/draw`, `scripts/gabbai/duplicates`, `scripts/gabbai/link`, `scripts/gabbai/shul`, `scripts/gabbai/settings`, `scripts/gabbai/pin`,
   `scripts/dialogs/linkDialog`, `scripts/dialogs/reportText`.
5. **Recommended:** create `Secrets` (+ → Script) from `Secrets.gs.example`, for `deploymentId`. Everything else is configured in the הגדרות sheet and on the gabbai tools page.
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
   - **Who has access / למי יש גישה:** **Anyone / כל אחד**. Not "Anyone with a Google account", because people's phones need not be signed in to Google.
4. **Deploy / פריסה** (authorize again if asked).
5. Copy two things from the result screen:
   - the **Deployment ID / מזהה פריסה** (starts with `AKfycb…`);
   - the **Web app URL**, which is `https://script.google.com/macros/s/<Deployment ID>/exec`.

Create a **new** deployment only this once. Later code updates go to the **same** deployment ([§9](#9-updating-the-code-later)); otherwise the address changes and the links (and the printed QR code) stop working.

Route A alternative: `clasp create-deployment -d "registration page"` prints the deployment ID.

**Without `Secrets.gs`** (route B, or a copy made from the template): **מניין → קישור לדף הרישום** asks once for the Web app URL; paste it. It is kept in the script's properties, not in the sheet.

---

## 6. Fill in the settings

Settings come in two kinds:

- **Set once, by whoever installs the project** → `Secrets.gs`.
- **Things the gabbai may change** → the **הגדרות** sheet, or more simply the gabbai tools page (**הגדרות** and **מיקום בית הכנסת**, [§8](#gabbai-tools-page)). The gabbai code is the exception: it is kept hidden, see [Gabbai code and login](#gabbai-code-and-login).

**`Secrets.gs`** (route A, or route B if you created the Secrets file):

```js
const SECRETS = {
  ownerAccount: 'minyan.yourshul@gmail.com',
  deploymentId: 'AKfycb…',         // from step 5: the only source of the page address
  locationLog: false,              // reserved, not implemented yet
  kioskKey: '',                    // leave empty
};
```

Then upload it with `clasp push` (route B: just save the file).

**The הגדרות sheet.** The sheet is right-to-left, so column A is on the right. Rows are found by their label in column A, so their order doesn't matter, but `setup` keeps them in this order:

| Row | Column A (setting) | Column B |
|---|---|---|
| 2 | שם המניין | Shown at the top of the page and in the reports |
| 3 | תחילת התקופה | First day of the lottery period |
| 4 | סוף התקופה | Last day of the period |
| 5 | אחוז נוכחות מינימלי להגרלה | `75` means 75% or more. **`0` = no lottery** (switched off) |
| 6–7 | רישום עצמי פתוח משעה / עד שעה | Self-registration hours in half-hour steps, e.g. `8:30` and `11:00` (`8`, `8.5` also work). Kept as text. The gabbai can register at any time |
| 8–9 | מיקום בית הכנסת — קו רוחב / קו אורך | The shul's point. Empty = no location check. Best set by measuring in the shul ([below](#location-check-registering-from-the-shul)) |
| 10 | רדיוס מותר (מטרים) | Self-registration only within this distance; 40–60 is usually right |
| 11 | סטיית GPS מותרת (מטרים) | How much GPS inaccuracy is forgiven beyond the radius. Empty = half the radius |
| 12 | אחוז נוכחות מינימלי לדוח לרבי | Who is included in the report to the Rebbe, e.g. `25` = 25% or more of the minyan days (usually much lower than the lottery threshold). **`0` = no report** (switched off) |
| 13 | ימי המניין | The weekdays the minyan meets, as Hebrew letters: `א ב ג ד ה ו` (Sunday–Friday, the default) or a range like `א-ה` (Sunday–Thursday). Only these days count toward the percentages, and only on them is registration open (also in gabbai mode and in the WhatsApp import). Shabbat never. Unreadable or empty = Sunday–Friday |

- **Values go in column B.** Column C is only an explanation, and a value typed there is ignored.
- **Days with no minyan.** Column **E**, one date per cell, for single dates with no registration (e.g. Yom Tov). They don't count toward the percentage. Weekdays the minyan never meets go in row 13, not here.
- **Switching the lottery or the report off.** A threshold of `0` switches it off. The tool stays in the gabbai tools (greyed out, marked **כבוי**) and in the מניין menu (marked "(כבוי)"); choosing it explains how to switch it on again. With the lottery off, the period summary lists attendance without ✓ marks.
- **The gabbai code is not in this sheet.** A new installation gets a random 6-digit code; `setup` shows it once. Change it with **מניין → שינוי קוד גבאי**.

---

## 7. Open the page and test it

1. In the Sheet: **מניין → קישור לדף הרישום**. A window shows the full link (ending in `?k=…`), a QR code, and the gabbai code.
2. **Make it available to the people who come:**
   - **Their own phones.** Print the QR code and put it up in the shul. People scan it with the phone's camera and may add the page to the home screen.
   - **A shul tablet, if there is one.** Open the link with `&device=kiosk` added at the end, and add it to the home screen ([below](#the-device-the-page-runs-on)).
3. **Test it on a phone, standing in the shul:**
   - **Location.** Open the page, tap **מצב גבאי**, enter the code and press **בדיקת מיקום**. You should see the distance from the shul and "בתוך התחום ✓" ([location check](#location-check-registering-from-the-shul)).
   - **Registration.** Leave gabbai mode ("יציאה") and register yourself. A row appears in the **נוכחות** tab, with `דף רישום · נייד` in the מקור column.
   - **From a computer** only gabbai mode works. Self-registration there shows "רישום עצמי — מטלפון נייד או מטאבלט", by design.

- **Use the full link, with `?k=…`.** The bare `/exec` address deliberately shows "הקישור אינו תקין". The key keeps people who only know the address from registering from home.
- **Keep the full link private.** Anyone who has it can register.

---

### The device the page runs on

Outside gabbai mode, the page detects what it runs on: **טלפון נייד** (phone), **טאבלט** (tablet) or **מחשב** (desktop). It shows the result in small print under "מצב גבאי".

- **Where it's recorded.** Each self-registration stores it in the **מקור** column of the נוכחות sheet, for example `דף רישום · נייד`. Gabbai-mode registrations stay `גבאי`.
- **How it decides.** It uses the browser's own report (client hints, then the user-agent). An iPad that presents itself as a Mac is recognized by its touch screen.
- **The shul's own tablet.** Add `&device=kiosk` to the end of its link, i.e. `…/exec?k=…&device=kiosk`. That marks it as **טאבלט בית הכנסת** whatever the browser reports, so it is never treated as a private phone. The printed QR code should stay *without* this ending.

### Location check: registering from the shul

Once the shul's location is set, a **self-registration** must come from within a radius of it. The point, the radius and the GPS tolerance are rows of the **הגדרות** sheet, set on the gabbai tools page (**מיקום בית הכנסת**, below). With no point, there is no location check.

- **Who is checked.** Phones and tablets registering themselves. Gabbai mode and the shul's own tablet (`&device=kiosk`) are not checked. A **computer cannot self-register at all**: it shows "רישום עצמי — מטלפון נייד או מטאבלט" and works only in gabbai mode.
- **How it works.** The browser asks for location permission (the first time) when the person starts filling in the form, takes the reading while they type, and sends it with the registration. The server compares it with the shul's point. A reading older than 2 minutes is replaced by a fresh one.
- **GPS tolerance.** GPS indoors is often off by tens of metres, so the reading's accuracy is added to the radius, but at most the **GPS tolerance** setting (empty = half the radius; 0 = the radius only). With a 40 m radius and the default 20 m, someone 50 m away with ±15 m accuracy counts as inside, while a house 84 m away with ±30 m does not (40 + 20 = 60 m).
- **Outside the shul, or no position** (permission refused, GPS off): the person sees "נראה שאתה מחוץ לבית הכנסת" with the approximate distance, or "לא התקבל מיקום" with what to fix. Nothing is refused outright; there are two choices:
  - **"נסה שוב"** (outside) takes a new reading, for someone who has just walked in.
  - **No position** (location off, or the browser refused): the main button is **"שלח לאישור הגבאי"**, so nobody is stuck — a web page cannot switch the phone's location on, and people tend to press the big button without reading. Under it a smaller **"הפעלתי מיקום — נסה שוב"**, and the steps for that phone folded behind **"איך מפעילים מיקום?"** (iPhone: Settings → Privacy → Location Services, and the browser's permission; Android: the Location switch in quick settings, and the site permission behind the icon next to the address). If the retry still gets no position, a red line says so and the steps open.
  - **"שלח לאישור הגבאי"** puts the registration on the **רישומים לבדיקה** list. The note there says only `מחוץ לבית הכנסת (~850 מ׳)` or `ללא מיקום (…)`.
- **Privacy.** The page tells people so: under the button (where the check applies) and on the "לא התקבל מיקום" screen — "המיקום לא נשמר — הוא משמש רק לבדיקה שאתה בבית הכנסת". The coordinates are used once on the server for that comparison and are **never stored** anywhere. Only the outcome is kept, and only for entries sent for approval. A test checks that no coordinate ever reaches the spreadsheet.
- **Setting the location and the radius** — gabbai tools page → **מיקום בית הכנסת**:
  - **Measure in the shul.** Stand in the middle of the hall with a phone and tap **"מדידה"**. The page watches the GPS for up to 20 seconds and keeps the most precise reading; a reading worse than ±50 m is refused (typical of computers). Then **"קביעה כמיקום בית הכנסת"** (tap twice). The radius stays as it was, or 50 m the first time.
  - **Radius**, 20–1000 m. 40–60 m is usually right: the hall and the yard. **GPS tolerance**, 0–500 m, or empty for half the radius.
  - **"בדיקה"** shows your distance, the accuracy, and whether a registration from here would count as inside — exactly as a registration is judged. Nothing is stored.
  - **"כיבוי בדיקת המיקום"** (tap twice) clears the point; radius and tolerance stay for next time.
  - Everything is written to the הגדרות sheet, with the measurement's date and accuracy in column C. It's the shul's point, set on purpose; registrants' positions are still never stored.
- **Quick check in gabbai mode.** On the registration page, **"בדיקת מיקום"** shows the same distance test.
- **Reserved, not implemented yet:** `locationLog` in `Secrets.gs` and `logLocationCheck_()` in `Location.gs`. This is a hook for a future log of check *outcomes*, to investigate poor readings. Today it does nothing.

The location prompt runs inside Google's page frame. If a browser doesn't allow location there, every reading fails with "לא התקבל מיקום". Check this once with "בדיקת מיקום" on a real phone after deploying.

### On a personal phone

When the page runs on a **phone** (not the shul's tablet, not gabbai mode):

- **The phone number is optional**, as everywhere. Without it the person is identified by surname as usual.
- **If given, the number is remembered on that phone** after the first registration. On the next visit it is already filled in and recognized ("שלום, …"), so one tap on "רישום נוכחות" is enough.
- **"זה לא אני — להקליד מספר אחר"** clears the remembered number, for a phone shared within a family.
- **First use.** The field is marked as a phone-number field, so the phone's keyboard or autofill may offer the owner's number.
- **Why not detect the number automatically?** No web page can read the device's own phone number; browsers don't allow it.
- **When the number is forgotten.** It is kept in the browser's storage for this page. Clearing the browser data, or a private/incognito tab, forgets it; the person then simply types it again.

## 8. Daily use

The **הוראות** tab in the Sheet explains it in Hebrew. In short:

- **Phone or tablet, in the shul.** A person scans the QR code (or opens the saved page), types a phone number or a surname, and taps "רישום נוכחות". The page suggests known names while typing.
  - **Phone numbers.** Israeli mobile, 07X and landline numbers and US/Canadian numbers (`+1`) are accepted, typed with or without dashes, spaces or a country code. The number is optional; the first time, people also type their name.
  - **On a phone, the number is remembered** for next time.
  - **Location.** The phone asks for location permission the first time. Someone reported as outside the shul can retry, or send the registration for the gabbai's approval (it then appears in **רישומים לבדיקה**).
- **Gabbai mode** ("מצב גבאי" at the bottom of the page, plus the code): register others, choose an earlier date, and register outside the self-registration hours. See [Gabbai code and login](#gabbai-code-and-login).
- **Gabbai tools** (**"כלי גבאי"** in the gabbai bar, or the registration link with `&view=gabbai` added): the Sheet's tools in the browser, on a computer or a phone. See [Gabbai tools page](#gabbai-tools-page).

The same tools are in the Sheet's **מניין** menu:

- **מניין → ייבוא רשימה מוואטסאפ.** Paste the lists from WhatsApp; a date line such as `19/10` or `ח׳ חשוון` starts each day. Check the dates, then confirm the names in the review screen.
- **מניין → רישומים לבדיקה.** Entries the system wasn't sure about. Pick the right person, confirm or add the phone, and save.
- **מניין → דוח שבועי / דוח סופי לתקופה.** Each report opens as a new tab, together with a text to paste into WhatsApp: everyone who came, with days out of the minyan days (e.g. `משה כהן — 17/20`). In the period summary, ✓ marks those in the lottery, and the top line says how many days that takes.
- **מניין → דוח לרבי.** The names of everyone at or above the report threshold (default 25%), by surname, as text for WhatsApp. No new tab. (The exact contents and sending it by e-mail are still to come.)
- **מניין → הגרלה.** Draws one winner among those at or above the threshold, and logs the draw in the **הגרלות** tab.
- **מניין → איתור כפילויות** finds people entered twice. Tick "למזג?" next to the real duplicates, then use **מיזוג הכפילויות המסומנות**.

### Gabbai tools page

A web page with the gabbai's work, for when the Sheet isn't at hand. It needs the gabbai code, like gabbai mode.

- **How to open it.**
  - From the registration page: log in to gabbai mode, then tap **"כלי גבאי"** in the gabbai bar. The login carries over in the same browser tab.
  - Directly: the registration link with `&view=gabbai` at the end. **מניין → קישור לדף הרישום** and the page's own "קישור ו-QR" screen show it; bookmark it on your phone.
- **What's on it:**
  - **רישומים לבדיקה** and **ייבוא מוואטסאפ** — the same screens as in the Sheet. On a phone the import works too; a long list is easier on a computer.
  - **דוח שבועי** (choose the last day) and **סיכום התקופה** — the report tab is written in the Sheet, and the page shows the WhatsApp text with **העתקה** and **שליחה בוואטסאפ**.
  - **דוח לרבי** — the name list for the report to the Rebbe, with **העתקה** and **שליחה בוואטסאפ**. Its threshold is set on the **הגדרות** screen.
  - **הגרלה** — shows who takes part, warns about entries still waiting for review and about an earlier draw, and asks for a second tap before drawing. The draw is logged in **הגרלות**.
  - **כפילויות** — pairs that look like one person. Tick "למזג" and choose which record to keep (the one with more days is preselected); attendance moves to it.
  - **קישור ו-QR** — the registration link with a QR code, copy and share.
  - **הגדרות** — the minyan's name, the minyan's weekdays (a box per day, Sunday to Friday; at least one), the self-registration hours (half-hour steps: 8:00, 8:30, 9:00 …), the period, the lottery threshold, the report-to-the-Rebbe threshold, and the days without a minyan (add or remove dates). Saved to the הגדרות sheet.
  - **שינוי קוד גבאי** — asks for the current code; everyone else is logged out of gabbai mode, you stay in.
  - **יציאה** — logs out. After 30 minutes without activity the page logs out by itself.
- **What stays in the Sheet only:** editing the tabs by hand. Every setting can be changed on the tools page.

---

### Gabbai code and login

- **One code for everything in gabbai mode.** Use at least 6 characters. Letters and digits are fine; spaces are not.
- **Where it is kept:** hidden, in the script's properties — not in the Sheet (anyone who can open the Sheet would see it) and not in git. **מניין → קישור לדף הרישום** shows it to the Sheet's owner.
- **Changing it.** The gabbai can change it on the gabbai tools page (**שינוי קוד גבאי**), which asks for the current code again, or the owner via **מניין → שינוי קוד גבאי** in the Sheet. A change logs everyone out of gabbai mode.
- **Logging in and out.** Logging in gives the browser a session for 30 minutes after the last activity; the code itself is never kept in the browser. **"יציאה"** logs out at once. After 30 minutes without activity the page leaves gabbai mode by itself.
- **Wrong codes.** 3 wrong codes in a row lock gabbai login for **60 seconds**, for every device. This is a brake on guessing, since anyone with the page link could try.
- **Weak code warning.** A code shorter than 6 characters still works, but after logging in the page suggests changing it.

## 9. Updating the code later

Menus and dialogs in the Sheet always use the latest uploaded code. The **registration page** runs the *deployed version*, so it needs one more step.

**Route A:**

```powershell
.\deploy.ps1 "what changed"      # Windows PowerShell
```
```bash
./deploy.sh "what changed"       # macOS / Linux
```

Both run `clasp push -f`, then `clasp update-deployment <deploymentId from Secrets.gs>`. The address, the links and the printed QR code stay the same.

**Without a terminal:** double-click **`deploy.cmd`** in the project folder (Windows). It runs `deploy.ps1`, shows "DEPLOY OK" or "DEPLOY FAILED", and saves the output to `deploy-last.log`.

- **PowerShell may block the script.** If it says running scripts is disabled, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

**Route B (browser):** **Deploy / פריסה → Manage deployments / ניהול פריסות** → select the web-app deployment → ✎ **Edit / עריכה** → **Version / גרסה: New version / גרסה חדשה** → **Deploy / פריסה**.

Don't create a new deployment for an update: it gets a new address.

**After an update that changes the settings layout, run `setup` once** (**מניין → הגדרה ראשונית**). It is safe to run any time: it puts the הגדרות sheet in the current layout and keeps every value. Coming from a version that kept settings in `Secrets.gs`, it also moves them:

- the gabbai code → hidden in the script's properties (the code itself doesn't change);
- the shul's location and radius → the sheet (your measurement on the tools page, else `shulLat`/`shulLng`/`shulRadius`);
- the lottery threshold → the sheet;
- the old "כתובת דף הרישום" row is dropped from the sheet; its address is kept hidden (used only when `deploymentId` is empty).

Its closing message lists what moved. After that, `gabbaiPin`, `lotteryThreshold`, `shulLat`, `shulLng` and `shulRadius` can be deleted from your `Secrets.gs`; they are no longer read.

---

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Pages break with `ReferenceError: document is not defined` in **Executions**, or functions "not found" | `scripts/*.js` were uploaded as server code because `.clasp.json` lacks `"scriptExtensions": [".gs"]` and `"htmlExtensions": [".html", ".js"]`. Add them (see `.clasp.json.example`) and push again. |
| `clasp push`: "A file with this name already exists … Admin" | Two files with the same name ignoring extension (e.g. an old `Admin.html` next to `Admin.gs`). Delete the old file and push again. |
| `clasp push`: "User has not enabled the Apps Script API" | Turn it on at <https://script.google.com/home/usersettings>, wait a minute, retry. |
| setup() "Exceeded maximum execution time" | The "ההגדרה הושלמה" popup in the Sheet tab wasn't clicked. Run it again and click OK in the Sheet. |
| No **מניין** menu | Reload the Sheet. If it's still missing, setup() hasn't run successfully ([§4](#4-run-setup-and-grant-permissions)). |
| "חיבור דף הרישום" asks for an address | No web-app address is known yet. Paste the Web app URL from the deployment ([§5](#5-publish-the-registration-page-web-app)), or set `deploymentId` in `Secrets.gs` and push the code. |
| Page says "הקישור אינו תקין" | You opened the bare `/exec` address. Use the full link from **מניין → קישור לדף הרישום**. |
| Google page: "Sorry, unable to open the file at this time / מצטערים, לא ניתן לפתוח את הקובץ כרגע" | The address doesn't belong to an *active* deployment (an old or archived one, or a typo), or several Google accounts are signed in. Check **Deploy → Manage deployments** and compare the deployment ID with yours. Try a private window. In the editor, **Executions / ביצועים** shows a `doGet` row for every request that actually reached the script. |
| A registration shows "הרישום התקבל ויאושר על ידי הגבאי" | The system wasn't sure who it was, or the person sent it for approval from outside the shul. The entry waits in **מניין → רישומים לבדיקה**; its note says why. |
| "קוד שגוי 3 פעמים — הכניסה נעולה ל-60 שניות" | Wait a minute and type the code carefully; it is case-sensitive. If the code is lost, the Sheet's owner can set a new one: **מניין → שינוי קוד גבאי**. |
| "ההתחברות למצב גבאי הסתיימה" | The session ended: 30 minutes without activity, or the code was changed. Log in again. |
| The page stays on "טוען…", or shows a red bar "תקלה בדף" | The browser code failed. The red bar has the error message. If Executions shows `doGet` but no `kioskInit`, it's the browser side: open the page on a computer, press F12 → Console, and look for the error. |
| A computer shows "רישום עצמי — מטלפון נייד או מטאבלט" | By design: self-registration is for phones and tablets. On a computer use **מצב גבאי**. |
| Someone standing in the shul gets "נראה שאתה מחוץ לבית הכנסת" | Indoor GPS can be poor. They can press "נסה שוב" after a few seconds, or "שלח לאישור הגבאי". If it happens often, check with **בדיקת מיקום** (gabbai mode) and raise `shulRadius`, or correct `shulLat`/`shulLng`, in `Secrets.gs`. |
| Every phone gets "לא התקבל מיקום", even after allowing location | Location permission: phone settings → the browser → Location → allow, and in the browser the site's permission. If it still fails for everyone, the browser may not allow location inside Google's page frame; meanwhile clear `shulLat`/`shulLng` in `Secrets.gs` to turn the check off, and redeploy. |
| A person's number is no longer filled in | The browser's data was cleared, or a private tab was used. They type it once more. |
| A day shows "אין אף רישום" in a report | Import that day's WhatsApp list, or add the date to column E of הגדרות if there was no minyan. |

---

## 11. Files

| File | What it holds |
|---|---|
| `Setup.gs` | The מניין menu, `setup()` (first-time setup, and moving settings after an update), the הוראות (help) sheet |
| `Config.gs` | Sheet names, column layouts, settings labels, matching thresholds |
| `Kiosk.gs` | Server side of the registration page (`doGet`, `kiosk*`); `doGet` also serves the gabbai tools page |
| `Gabbai.gs` | Server side of the gabbai tools page (`gabbai*`, each needs a gabbai session), including the settings screen |
| `Admin.gs` | WhatsApp import and review (shared by the Sheet dialog and the tools page), registration-link dialog |
| `Auth.gs` | Gabbai code, login sessions, lockout after 3 wrong codes, changing the code |
| `Location.gs` | Location check for self-registration: distance to the shul, never storing registrants' coordinates; the gabbai's shul-location tools |
| `Matching.gs` | Who-is-this logic: phone first, then fuzzy Hebrew name matching |
| `Names.gs` | First-name list and nicknames (מנדי = מנחם מענדל …) |
| `Data.gs` | Reading/writing the People, Attendance and Review sheets |
| `WhatsApp.gs` | Parser for pasted WhatsApp lists |
| `HebrewCalendar.gs` | Hebrew calendar arithmetic, gematria, Hebrew-date parsing |
| `Reports.gs` | Weekly and final reports, lottery draw (shared by the Sheet menu and the tools page) |
| `Duplicates.gs` | Finding and merging duplicate people (shared by the Sheet menu and the tools page) |
| `Utils.gs` | Dates, settings, keys, private-settings loader, small helpers |
| `KioskPage.html` | The registration page: markup and styles |
| `GabbaiPage.html` | The gabbai tools page: markup and styles |
| `AdminPage.html` | Import + review dialog in the Sheet: markup |
| `styles/tools.html` | Styles of the import and review screens, shared by `AdminPage` and `GabbaiPage` |
| `LinkDialog.html`, `ReportTextDialog.html`, `BadLinkPage.html` | Small dialogs/pages |
| `scripts/common/dom.js`, `clipboard.js`, `timing.js` | Browser helpers shared by the pages; `timing.js` = the `&debug=1` timing panel |
| `scripts/kiosk/*.js` | Registration page: `helpers`, `deviceDetection`, `hebrewDate`, `lookup` (live suggestions), `registration` (submit/confirmation), `gabbaiMode`, `myPhone` (remembered number on a phone), `location` (location check, "outside the shul" panel, gabbai test), `main` (state + `startKiosk()`) |
| `scripts/admin/*.js` | Import and review screens: `helpers`, `import`, `review` (used by both pages), `main` (the Sheet dialog's tabs + `startAdmin()`) |
| `scripts/gabbai/*.js` | Gabbai tools page: `main` (login, navigation + `startGabbai()`), `reports`, `draw`, `duplicates`, `link`, `shul` (the shul's location), `settings`, `pin` |
| `scripts/dialogs/*.js` | `linkDialog` (QR + copy), `reportText` (copy) |
| `appsscript.json` | Manifest (time zone, V8, web-app access) |
| `Secrets.gs.example` | Template for your private `Secrets.gs` |
| `CLAUDE.md` | Notes for AI coding sessions (Claude): how the owner works, the Apps Script traps, tests, privacy rules |
| `deploy.ps1`, `deploy.sh` | Push + update the existing web-app deployment |
| `deploy.cmd` | Double-click version of `deploy.ps1` (Windows) |
| `template.ps1`, `template.cmd` | Upload the code to the template Sheet, **without `Secrets.gs`** ([§15](#15-more-minyanim-the-template)) |
| `INSTALL-he.md` | One-page Hebrew installation guide for a new minyan (from the template) |
| `.claspignore` | Keeps docs, tests and scripts out of `clasp push` |
| `test/` | Local tests against a simulated Sheet (not uploaded) |

All `.gs` files share one global scope, and nothing runs at load time across files, so the order of files in the editor doesn't matter.

### How the browser code is organized

Apps Script cannot serve a `.js` file to the browser: a page is one HTML document. So:

- **Where it lives.** The browser code is in `scripts/**/*.js`, plain JavaScript that your editor understands. `.clasp.json` (`"htmlExtensions": [".html", ".js"]`) uploads each one as an HTML-type file named by its path, e.g. `scripts/kiosk/main`.
- **How it gets into the page.** A page refers to it with `<script data-include="scripts/kiosk/main.js"></script>`. When the server builds the page (`page_()` in `Utils.gs`), it replaces that tag with the file's code. The page's small first `<script>` holds the values the server fills in (`KEY`, `TOKEN` …), and its last one calls the start function (`startKiosk()`, `startAdmin()`, `startGabbai()` …).
- **Read as written.** `page_()` reads every file with `HtmlService.createTemplateFromFile(name).getRawContent()`. The usual `createHtmlOutputFromFile(name).getContent()` does not return the file as written: Google removes the comments, and in a plain script file turns every `<` into `&lt;`, which breaks the code. For the same reason nothing may depend on a comment, so the shared-code marker is a tag, not a comment. The test mock (`test/mock.js`) behaves the same way, so the tests catch this.
- **Errors show on the page.** A small script at the top of each page shows any browser error in a red bar, instead of the page staying on "טוען…".
- **Shared styles.** `<link data-include="styles/tools.html">` is replaced the same way with that file's `<style>` block.
- **One screen, two pages.** The import and review scripts call the server through `call('GetPending', …)`. Each page sets `API`: the Sheet dialog sends it to `adminGetPending(TOKEN)`, the tools page to `gabbaiGetPending(KEY, session)`.
- **Declarations only.** The files only declare functions and variables; nothing runs until the page calls its start function. Order between files therefore doesn't matter, and a file uploaded by mistake as server code can't break the project (a test checks this).
- **Code shared with the server.** Phone rules and name matching are not copied into `scripts/`. They are the server's own functions, sent into the page as text by `sharedJs_()` (the `<script data-shared></script>` tag in the page).

## 12. Private settings (`Secrets.gs`)

- **Where they live.** Private values live in `Secrets.gs`. It is in `.gitignore`, so it never reaches git, but `clasp push` uploads it and the script reads it at run time.
- **What it holds.** Only values set once: the owner account, the web-app deployment ID (the single source of the page address) and, optionally, a fixed link key. What the gabbai may change is in the הגדרות sheet; the gabbai code is in the script's properties.
- **Every value is optional.** An empty `deploymentId` falls back to the address pasted once in **מניין → קישור לדף הרישום**, then to the address Google reports; an empty `kioskKey` to an automatically generated key.
- **Other private files.** `.clasp.json` (your Script ID) and `.clasp-template.json` (the template's) are also git-ignored.
- **No passwords.** None are stored anywhere in the project. `clasp login` keeps its token in your user folder (`~/.clasprc.json`), outside the repo.

## 13. Local tests

The tests run the real `.gs` files in Node.js against a simulated Sheet. They never use your real `Secrets.gs`.

```bash
node test/e2e.js           # end-to-end: registration, import, review, reports, settings  → "ALL OK"
node test/hebcal_check.js  # Hebrew calendar vs. the ICU calendar, 2023–2028
node test/ui.js            # renders the pages in Chromium; needs:  npm install playwright
node test/device.js        # device detection with emulated iPhone/Android/iPad/desktop browsers (Playwright)
node test/mobile.js        # personal-phone flow: optional, remembered, "זה לא אני", gabbai mode, shul tablet (Playwright)
node test/location.js      # location check with emulated GPS: inside, outside + retry, send for approval, no permission, computer (Playwright)
node test/gabbai.js        # gabbai tools page: login, every tool, logout; computer and phone width (Playwright)
node test/profile.js       # counts Google-service calls per action on a month of sample data
```

## 14. Performance notes

- **Measuring on a real phone: add `&debug=1` to the link** (registration page or gabbai tools). A small panel in the corner lists, in milliseconds from the moment the page frame started:
  - **server built the page** — the time `doGet` spent;
  - every **server call** (`kioskInit`, `kioskSubmit`, `gabbai…`), its total and, in brackets, the server's own share — the rest is Google's overhead and the network;
  - **GPS** and its accuracy, **form ready**, **tap: register**, **confirmation shown**.

  The panel shows about 4 lines and scrolls (the newest at the bottom); **hide** leaves a small "timing" tab to bring it back. **copy** puts the whole list on the clipboard (to send it on). The flag stays when moving between the registration page and the gabbai tools; the link for sharing (קישור ו-QR) never gets it. Without `&debug=1` nothing is shown or recorded. Not covered: the time before the page frame starts (Google's outer page loading).
- **Each call to a Google service is the main cost**, roughly 30–150 ms on Google's servers. `test/profile.js` counts them per action.
- **Today's data comes with the page.** `doGet` puts today's date, the hours and the name list into the registration page itself, so the form shows without a second server call (about a second sooner). Only a saved gabbai login is checked with the server first; the 5-minute refresh is a call as before.
- **The GPS starts before the tap.** On a phone that must register from the shul, the page takes the reading while the person types: at once if the phone already allows location, otherwise from the first tap into a field (so the permission question doesn't appear the moment the page opens). On "רישום נוכחות" a reading up to 2 minutes old is used at once; otherwise a fresh one is taken. "נסה שוב" and "הפעלתי מיקום — נסה שוב" always take a fresh one. The reading stops after 3 minutes, after the confirmation, and when the page leaves the screen (it starts again on return). As always it is sent only with the registration and never stored.
- **Name suggestions run in the page.** The registration page matches names itself, against the list of names it gets once on load and refreshes every 5 minutes. That list never includes phone numbers. Typing never waits for the server; only a complete phone number is checked there.
- **Cache for read-only lookups.** People and settings are kept in the script cache for up to 10 minutes. The cache is cleared whenever the script writes, and by the `onEdit` trigger whenever someone edits the אנשים or הגדרות sheet by hand. Every write reads the sheet fresh, so the cache can never overwrite data.
- **Deleting rows by hand** fires no `onEdit`. The registration page may then still suggest a deleted name for up to 10 minutes; registrations are not affected.
- **Large sheets load only when needed.** The attendance history and the review sheet are read only by actions that use them.

---

## 15. More minyanim: the template

Each minyan gets **its own copy** of the Sheet, in **its own Google account**: its own people, attendance, settings, gabbai code and registration page. They are made from one **template** Sheet that holds only the code.

**Making the template (once, on the developer's computer):**

1. In the developer's Google account: a new blank Sheet, e.g. `מניין — תבנית`. Don't run `setup` in it and don't deploy it: a copy starts from nothing.
2. **Extensions / תוספים → Apps Script → Project Settings ⚙ / הגדרות הפרויקט → Script ID** — copy it.
3. In the project folder, double-click **`template.cmd`** (or `.\template.ps1`). The first time it asks for the Script ID and keeps it in `.clasp-template.json` (git-ignored). It uploads the code **without `Secrets.gs`** (from a temporary folder), so no copy ever carries this minyan's address or private values. It refuses if the ID is the one in `.clasp.json`.
4. Sheet → **Share / שיתוף → General access: Anyone with the link, Viewer**. Copy the link and change its end from `/edit…` to **`/copy`**. That link opens Google's "Make a copy" page; the copy includes the script.

**After a code change:** run `template.cmd` again, so copies made from then on get the current code. (Existing copies are updated by `deploy-all`, planned.)

**Setting up a minyan from it:** the person with the minyan's Google account follows **[`INSTALL-he.md`](INSTALL-he.md)** (Hebrew, one page): copy → **מניין → הגדרה ראשונית** → publish the web app → paste its address in **מניין → קישור לדף הרישום** → settings and shul location on the tools page → share the Sheet with the developer as Editor, for updates and help.

**What makes a copy independent:**

- The template has no `Secrets.gs`, so a copy's address comes from the one pasted in **קישור לדף הרישום** (document property `WEB_URL`).
- `setup` records the Sheet's ID. If it later finds a different ID (the Sheet was copied, and Google copied the hidden values along), it drops them all and makes new ones: a new page key, a new gabbai code (shown once), no address until one is pasted. The original's links don't open the copy.
- Copy the **template**, never a minyan's working Sheet: that one has its `Secrets.gs`, people and attendance.

