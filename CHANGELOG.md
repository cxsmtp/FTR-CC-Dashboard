# FTR Credits Command Center: versions

Each version is shown as CC-xx.xx.xx, with the calculator's CxMissionZero version. Newest first.

## CC-01.36.00 — 2026-11-11

- **Shared means: with whom.** Marking a report shared asks for the **email address(es) of whom it was shared with**, typed right where you clicked: the Accounts list (double-click Customer), the account page (its strip and each report’s row), the calculator’s **Generated reports** (Mark) and **Report ready**. Enter saves, Esc puts it back; an address that is not one is refused. Who it went to shows beside the date everywhere. No pop-ups.
- **A customer’s version is shared by itself.** Uploading the version the customer sent back records it as shared (it came from them), and the report they had been sent too, if it was not marked yet.

## CC-01.35.00 — 2026-11-11

- **Accounts: Customer shared is marked in the cell itself**, as the name is: double-click, type how and to whom (optional), **✓ Shared** or Enter; on a shared one, **Not shared** undoes it. No pop-up.

## CC-01.34.00 — 2026-11-11

- **Accounts: change it right in the list, with a double-click.** **Account** (rename, as in Salesforce), **Accountable SE** (from the team’s SEs), **Sold** (record a sale of credits now, against the primary report and the account’s opportunity, or the opportunity link you give) and **Customer** (the primary report shared with the customer, with how and to whom, or not any more). Enter or leaving the cell saves, Esc puts it back; a single click still opens the account. Every change is in the audit log.
- Nothing about an existing instance changes with this version: data and settings stay as they are.

## CC-01.33.00 — 2026-11-11

- **People: many at once, and no Manage menu needed for the everyday changes.**
  - Tick people (the box on top ticks everyone the filters show, across pages) and a bar offers: **Role**, **Team**, **Access on**, **Access off**, **Send welcome**, **Reset passwords** (the new temporary passwords download once, as a sheet), **Sign out everywhere**, **Unlock**, **Remove**. Each change is made and audited person by person; what could not be done is said, with why.
  - **Role and team change right in the row**, from their own lists. Manage is still there for the rest.
- **Customer Success** (a new built-in role): works out projections and reports for their team’s accounts, always for the **Sales Engineer they choose as accountable**. Until one is chosen, the calculator marks the SE list and no report is generated; Customer Success is never offered as the accountable SE. Their home page is the calculator.

## CC-01.32.00 — 2026-11-11

- **CxOne API audit explains every call that did not succeed** — why, what was done, and what happens next time — on the row itself and in **Why calls did not succeed**, one line per kind of failure with how often it happened.
  - Each gets a verdict: **Needs attention**, **Recovered by itself** or **Expected**. The card on top counts only what needs attention (the aim: 0), with what recovered and what was avoided beside it.
  - The 404s on `/api/sast-metadata/:id` were never lost: those scans have no SAST metadata, and their lines of code were already taken from the scan itself. They now show as recovered.
- **It learns, and does not repeat.** Each tenant’s lessons are kept (and carried across versions):
  - a scan without SAST metadata is not asked for it again;
  - an optional API the tenant does not offer, or refuses to the key, is not asked again for a week;
  - a tenant that asked to slow down is read with at most 6 calls at once from then on.
  - Calls avoided are counted, never made, and never failures.
- **Filters apply as you change them**; **Apply** is still there for a change made midway. Outcome can now show **Needs attention**, **Recovered by itself** or **Any that did not succeed**.

## CC-01.31.00 — 2026-11-11

- **Fusion engines & rates** (Administration → Fusion engines & rates, for leaders and above): the credits per 10K lines of code for each AI engine, applied by the calculator by itself.
  - **For everyone (Admin):** Opus 5.5 = 2, Opus 4.7 = 2.5, Haiku 4.5 = 1.5 to start, and the **default engine** for Fusion (Opus 5.5). Add an engine, change a rate or the default: it saves as you type, and a change that does not work goes back to the last good one.
  - **For a team (leaders and above):** a team’s own rate for any engine and its own default engine, used by its people and the teams below it. **↺ Back to the Admin’s rate** removes the team’s own. The page shows the rate that applies and where it comes from.
  - **Seen without a rate:** an engine a customer’s Checkmarx One offers that has no rate is listed (first and last seen, tenant, by whom), to set for everyone or for a team. Opus 5.0 and Mythos 5.1 start listed as needing a rate.
  - **In the calculator:** each engine gets its rate when Checkmarx One is read and when an account opens; a new account starts on the team’s default engine; a rate typed in the calculator for one customer is kept. Every change is in the audit log.
- **CxOne API audit** (was Checkmarx One activity) now sits under **Work**.

## CC-01.30.00 — 2026-11-11

- **Overview cards in your order.** **Cards ▾** now lists the cards in the order shown: tick to show, drag ⠿ or use ▲ ▼ to move them. **Default** goes back to the standard set.
- **Credits sold and Still needed are off by default** (Projected credits, Accounts, Reports, Shared and No Salesforce link show); turn them on in **Cards ▾**. Anyone who already chose their cards keeps their choice.
- **The customer’s version is a raised, 3D button**, and stays on the bar when the account panel is folded, so the customer’s changed report can be brought in at any time.

## CC-01.29.00 — 2026-11-11

- **Mark a report shared right as it is made.** When a report is ready, the calculator asks **Shared with the customer?** with an optional note (how and to whom) and **Make it the account’s primary report** (ticked). Choose **✓ Shared with the customer** or **Not yet**.
- **Generated reports shows what was shared**: a **Shared** column with the date, **Mark** for those not shared yet, and **Undo**. The account page and the overview follow at once.
- **The account page, compact.** One strip with the primary report’s credits (T&R and Fusion beneath), whether it was shared (with **Mark shared**), sold, still needed and the reports. The Salesforce link, SE, Checkmarx One key and Impact sit as chips under the name; **Account details** (edit the link, SE, team, the key, delete) and **Record a sale** are folded away; the repeated tiles are gone.
- The demo organisation script works again with the stricter Salesforce link checks.

## CC-01.28.00 — 2026-11-11

- **Reports follow the platform’s theme.** The projection report, its live levers and the PDF summary are made in the command center’s own theme (Aurora, Ocean, Emerald, Sunset, Royal, Graphite or Command Center in its chosen colour), and open light or dark as you have it. The reader can still switch Light, Dark or Auto in the report.

## CC-01.27.00 — 2026-11-11

- **Command Center has a light view.** With the Command Center theme, **Light** is now the operations room by day: pale paper, dark ink, the same radar sweep, DEFCON strip and corner brackets. **Dark** stays the war room; **System** follows the computer.
- **Choose the Command Center’s colour**: green (as before), cyan, blue, amber, red or violet, under **Theme** once Command Center is picked. The radar, lines, glow and buttons follow it, by day and by night, on the dashboard and in the calculator; it is kept with you on every device.

## CC-01.26.00 — 2026-11-11

- **Git: paste the token, the platform is found.** The calculator's Git choice now has the token field itself: GitHub, GitLab, Bitbucket and Azure DevOps are told from the token (ghp_/github_pat_, glpat-, ATATT/BBDC-, AZDO or the 52-letter Azure form), and the button says **Connect to GitHub →** and so on. Only a token that says nothing asks for the host. Connect adds it, finds its organisations and counts the repositories; added tokens show as chips you can remove. Self-hosted servers and the Azure DevOps organisation go under Advanced.
- **Impact · Fusion is off by default.** Tick **Calculate Fusion’s impact** to see its figures and count them in the return and the report; its assumptions stay folded away.
- **Breach cost: simpler, beta, and only when asked.** No more IBM average × a chance per finding: a breach costs a share of the customer’s annual revenue (10% of ARR unless changed) × the breaches avoided. While Impact is on, each report first asks whether to add it (off unless you add it). In the report, its PDF and the slides it is marked **Beta · for projection only, based on feedback**.
- **Updates: “Latest published” shows the version again** straight after a handover; the release list is kept with the update state instead of waiting for the next check.

## CC-01.25.00 — 2026-11-11

- **Updates download again.** Release files now come from github.com's download links instead of GitHub's API, whose hourly limit for servers that do not sign in refused 1.24.0 with 403. If that limit is ever hit, the page says when it lifts (and that `UPDATE_GITHUB_TOKEN` raises it).
- **Nothing happens without the Salesforce link.** Connecting to Checkmarx One, reading projects and generating a report all wait until the account has its Salesforce opportunity or account link; the calculator locks those buttons and says why.
- **The link is checked as you paste it**: https on a Salesforce host, an opportunity (006…) or an account (001…), the Lightning object agreeing with the id, and the 18-character id's own checksum (a mistyped letter is caught). A good link saves by itself.
- **A sale needs its opportunity link**, prefilled when the account's own link is an opportunity; the sales table links to it, with the order number beneath.

## CC-01.24.00 — 2026-11-11

- **Every setting saves as you type, and goes back to the last good one when it does not work.**
  - **Email (SMTP)**: saved as you type, then tested with the mail server at once. If the server refuses the new settings, the last ones that worked come back, and the page says why. With nothing that worked before, the new settings stay, marked not tested. **Test connection** and **Send test email** are still there.
  - **Single sign-on**: saved as you type; a change the server refuses (a sign-in URL that is not one, a certificate that is not one) is not saved, and the page shows the last good values again.
  - **HTTPS**: the lowest TLS version and HSTS save as you change them. Uploading a certificate and Let’s Encrypt stay as buttons: they are actions, with files.
  - One way for all of them, with **Changes save as you type** on top and the result at the foot.
- **The default logo and browser icon** are the command center’s own (the tricolour jet), wherever Branding sets none.

## CC-01.23.00 — 2026-11-11

- **Your profile, as in CxMissionZero** (the menu under your name → **Your profile**), saved as you type:
  - your **picture** (PNG, JPEG or WebP, up to 200 KB), shown in the top bar and on People; or your initials;
  - who you are here: email, role, team, how you sign in, your last sign-in, and how many browsers you are signed in on, with **sign out everywhere else**;
  - your **name**;
  - your **time zone**: this computer’s, or one you choose; every date and time is then shown in it;
  - **your Impact figures** (currency, developers’ hourly rate, minutes to triage and to fix a finding by hand): where you turn Impact on for an account, it starts from these;
  - **your look** (when people may choose their own) and **your password** (for email and password sign-in).

## CC-01.22.00 — 2026-11-11

- **A compact Overview.** The heading and its controls share one line, and the seven numbers are small tiles with a picture each (a ring for what is sold, still needed, accounts with a report and shared; a split for T&R and Fusion; an icon for the rest), so they take a fifth of the screen instead of nearly half. **Cards ▾** chooses which tiles you see; your choice is kept for you, on every device. The top bar is slimmer too.
- **A home page per role, set in Roles & permissions.** Each role has a **Home page** (Overview, Calculator, Accounts, Checkmarx One activity or Quick guide): Sales Engineers land in the calculator, leaders, executives and Admins on the Overview, Sales on Accounts. Change it under People & roles → Roles & permissions → Rename/Edit; the matrix shows each role’s home.
- **Settings, reordered, with About in it.** General · Branding · Email (SMTP) · Single sign-on · HTTPS · Updates · Backups & health · About. Settings stays for Admins only; everyone else finds About at the foot of the menu.
- **Updates shows the newest three versions**, with **Show older versions** for the rest.
- **A default logo and browser icon**: `public/brand/default-logo.png`, when the build carries it, is used wherever Branding sets none.

## CC-01.21.00 — 2026-11-11

- **About, laid out as in CxMissionZero.** One panel: what the command center is for, then its facts (version, calculator, licence, project, the terms you accepted and when, the organisation), the note that your data stays on your own server, and the terms card. Below it, **What is new**: every version, the newest open.
- **Terms of use, the licence and the user guide in the app, in its look.** They open in one reading window with a tab each, from About, the foot of the menu (**About · Terms & license**, nothing more), the sign-in page, the quick guide and the calculator. No more bare files in a new tab.
- **Refresh, above Quick guide**, in the menu of every page (and no longer twice, in the top bar too).
- **Every page keeps your work.** What you type in a form (a person you are adding, a sale you are recording, a team you are making…) is kept as you type it, so leaving the page, a reload or a dropped connection loses nothing; it is cleared once the form is sent. A field filled in from what you typed before is marked in amber. Settings keep saving on the server as you change them.

## CC-01.20.00 — 2026-11-11

- **The calculator starts with one compact panel instead of two large ones.** The customer is on one row (name as in Salesforce, the Salesforce link, the team and the accountable SE). Under it, **Data from: Checkmarx One · Git · cloc-fusion**: the Checkmarx One key, Remember and Connect sit on one line; **Git** and **cloc-fusion** open the calculator’s own Fusion · from Git and Fusion · cloc-fusion tabs and bring them into view. Impact, the kept key, the customer’s version and the reports summary share one thin line.
- **Once you Connect, the panel folds to one line**: the customer, its Salesforce link, team, accountable SE and the tenant, with **Edit** to open it again (and **Fold** to put it away by hand). Disconnecting opens it.
- **The customer’s name leads the status strip.**

## CC-01.19.00 — 2026-11-11

- **Branding (Settings → Branding), as in CxMissionZero**, saved as you type:
  - the **app name** and the line under it, and the **company name** (on every report);
  - the **company logo** and the **browser icon**: uploaded (PNG, JPEG, SVG or WebP, up to 200 KB) or from an https address, fetched once and kept on the server; an SVG is served so that nothing in it runs;
  - an **accent colour**, or the look’s own;
  - the **look of the app** for everyone, picked from cards that preview each look (light, dark or system);
  - **Let people choose their own look**: off, everyone sees the organisation’s look and Theme is not offered;
  - the **menu** down the left side or across the top.
  It applies everywhere at once, the sign-in page, the dashboard and the calculator included. A change the server refuses (an image too large or not an image, an address that is not https or leads to a private network, a colour that is not one) is not saved: the last good setting stays, and the page says why.
- The look for everyone and the company name moved here from General, so they are in one place.

## CC-01.18.00 — 2026-11-11

- **A top bar on every page, as in CxMissionZero.** **Jump to…** (or Ctrl K) finds a page, an account or a person as you type, and opens it with Enter. **↻** refreshes the page. Lights show at a glance whether you are connected to Checkmarx One (and to which tenant), whether email is set up and tested, whether git hosts are allowed for Fusion, and, for Admins, when a newer version is ready or the software integrity check failed; each opens where it is fixed. **◑** switches light and dark. Your name and role open a menu with Theme, Quick guide, About and Sign out. The calculator has the same bar.
- **No duplicates.** The person card at the foot of the menu is gone: Theme and Sign out are in the top bar’s menu. The menu now ends with Quick guide, the version (Admins: Versions and updates), and **About · Terms of use · License**, with the licence in a line.

## CC-01.17.00 — 2026-11-11

- **Update & recovery, laid out as in CxMissionZero.** Three cards on top: **Running**, **Latest published** (with **Update now** when a newer one is ready) and **Auto-update** (always on the newest; how often to check, saved as you type). Then **Software integrity**, the **Versions** table to update or roll back, and **Check for updates**, **Reload the server** and **Download troubleshooting report** together.
- **Software integrity: signed releases.** Each release’s file list (MANIFEST.json) is now signed by the release workflow with a GitHub build attestation (Sigstore, recorded in its public log). The server checks every running file against that list, and the list’s signature with GitHub, a few seconds after starting, every 6 hours and with **Check now**: **Genuine** shows the repository, branch and commit it was built from, the workflow run, when it was signed and its Sigstore log entry, how many files were checked and the list’s SHA-256. A changed, missing or added file, or a list nobody signed, is shown and recorded in the audit log. A copy built from the source (such as a podman build of the repository) says so; the next update installs a signed release. The signature checker is CxMissionZero’s.

## CC-01.16.01 — 2026-11-11

- **The look for everyone, chosen by sight.** Settings → General shows the same Light / Dark / System and palette swatches as **Theme**, Command Center included, and you see the change at once. **Apply to everyone now** replaces each person’s own choice with it; they can still choose again.
- **Settings → General saves as you change it**, with no Save button. A value the server refuses goes back to the last one saved, and says why.

## CC-01.16.00 — 2026-11-11

- **Command Center theme: the war room.** A seventh choice under **Theme** (and as the organisation’s default): phosphor green and amber on near-black, a radar sweeping over a grid with faint scan lines, HUD brackets on every panel and card, glowing monospace readouts, and a **DEFCON 5 · All systems nominal** strip across the top with the link, the operator on duty, the time in UTC to the second and the version. Alerts (such as accounts missing their Salesforce link) show in red. The calculator takes it too.

## CC-01.15.01 — 2026-11-11

- **The version at the foot of the menu opens Versions and updates** (Settings → Updates) for Admins, on every page including the calculator; for everyone else it opens About.

## CC-01.15.00 — 2026-11-11

- **Always on the newest version.** Auto-update can no longer be turned off or wait for an hour: the server looks for a new release every few minutes and switches to it by itself, without a restart. **Check for updates every … minutes** (15 unless an Admin sets 5 to 1,440) saves as you change it. **Check for updates** installs a newer release at once. A server that was told to wait for an hour (the old "At a set hour") now installs as soon as it finds one.
- **One Versions table, on the trusted checksums.** Releases, Roll back and Trusted checksums are now one table: each version with the SHA-256 kept the first time it was seen, when, and its state (running, built in, installed and verified, failed to start, checksum changed). Its one action: **Update now** for a newer version, **Roll back to this** for an older one, the built-in version included. Release notes show in short, with **more**, instead of raw text.
- **A rollback by hand stays put.** The version you rolled back from is not installed again by itself; the next newer release is.

## CC-01.14.00 — 2026-11-11

- **Every table sorts and filters.** Click a column’s heading (or ⇅) to sort low to high, again for high to low, again to clear: numbers, credits, percentages and dates sort as such, and words such as "No report" go last. The ⏷ by each heading filters the column by its values, several at once, with counts, a search and All / None; a bar above the table says how many rows show and clears the filters. It works on every table with headings: Accounts, the account’s reports and sales, Overview, People, the import check, Updates, Audit log and Checkmarx One activity; a sort stays as more rows are loaded.

## CC-01.13.00 — 2026-11-11

- **Checkmarx One activity, under Insight, for everyone.** Every call the command center makes to a customer’s Checkmarx One tenant is recorded: who it was for, the tenant and the account, the request (method and API path; never a key, query or response), the result and how long it took. So are connections (and refused keys), tenant reads (started, finished with the number of projects, or failed) and every report generated in the calculator. Everyone sees their own activity and that of the teams they see (an SE their team, a leader every team below, Executives and Admins all), with **Only me**, and filters by people, tenant, what, account (each a multi-select), outcome and dates. The last 30 days are summed up on top: calls, failures, average time, tenants, reads and reports. The log is kept apart from the audit log and rotated at 20 MB (`ACTIVITY_MAX_MB`).
- **Projection settings start collapsed** in the calculator: **Show settings** opens them, and the calculator remembers your choice. The **Read from Checkmarx One** button stays in view.
- **Email server: Test connection saves first**, so it always tests what the form says. Choosing port 465 ticks Implicit TLS, and 587 or 25 untick it; a port that needs STARTTLS with Implicit TLS ticked is refused, with what to change.

## CC-01.12.00 — 2026-11-11

- **Three quick guides, one per persona, six visual steps each.** **Sales Engineer** (from a customer’s name to a projection), **Leader** (your teams at a glance, and where to step in), and **Admin** (set it up once). Each step is an animated card with a picture and a **Go there** link. Your own guide is the first page after your first sign-in. Under **Quick guide** you also see the guides below you: an Admin all three, a Leader the Leader and Sales Engineer guides.
- **Quick guide sits just above your name**, at the foot of the menu, on every page including the calculator.
- **Rename any role**, the built-in ones and Admin too (People & roles → Roles & permissions → **Rename**). Who holds it and what it allows stay the same; Admin always holds every permission.

## CC-01.11.01 — 2026-11-11

- **Fixed: the menu moved on the calculator page.** Your name, Theme and Sign out sat higher in the calculator's menu than on the dashboard, and the menu items were spaced differently, so the menu jumped when moving between pages. It is now the same, to the pixel, on every page.

## CC-01.11.00 — 2026-11-11

- **The customer's name, as in Salesforce, before the Salesforce link.** The calculator's **Customer ▾** picker is gone. In the account bar, type the account's name as Salesforce has it: your team's accounts are suggested as you type, and picking one opens it; **+ New** starts another account; changing the name of the open account renames it. The name and the Salesforce link now share the first row, with the team and the accountable SE below.
- The calculator's title is no longer cut off.

## CC-01.10.00 — 2026-11-11

- **Every action in the audit log.** Besides what was recorded before (sign-ins, accounts, reports, sales, people, teams, roles, settings, updates, backups), every other change is now recorded by the server itself, so nothing is missed: a theme changed, a Checkmarx One read started or disconnected, an account saved in the calculator (once a minute while it autosaves), a backup taken. So are exports and downloads (accounts and reports CSV, backups, the audit log itself, cloc-fusion) and every report opened. **Anything refused** is recorded too, with who tried, what, and the reason (for example an SE trying to change settings).
- **A new Audit log page.**
  - Filter by **who**, **what** (one action or a whole group, such as People or Checkmarx One), **from** and **to** dates, and **outcome** (done or refused), and search everything.
  - Each entry says in words what was done, with its details.
  - **Older entries** pages back through the whole log.
  - **Check the log is intact** walks the chain of every entry and says whether any was changed or removed.
  - **Export CSV** exports what the filters show.

## CC-01.09.00 — 2026-11-11

- **Updates without a restart.** The launcher now holds the port itself and passes every connection to the version that answers. A new version (an update, a rollback, a restored backup, or **Reload the server**) is loaded beside the running one; the running one finishes what it is answering, stops writing and hands over what it holds in memory: each person's Checkmarx One connection, reads not yet put into their account, and reads still running (started again at once). Then the new version takes the connections. Nobody is signed out, the port never closes, and nothing has to be read again. Tested with 20 clients working without pause through two reloads, over http and HTTPS: no request failed, and the longest wait was under 2 seconds.
- **If the new version does not come up, the running one carries on**, with nothing lost; the new one is marked failed and never installed automatically again.
- **No "What is new" pop-up after an update.** What changed is under **About** (the version at the bottom of the menu) for anyone who wants it.
- **Fixed: "That request came from another site."** With `PUBLIC_URL` set, changes such as **Reset password** were refused when the command center was opened by another name or address (an IP address, for example). Changes from the address the page was opened by are now accepted, as well as from `PUBLIC_URL`; other sites are still refused, and every change still needs the session's own token.

## CC-01.08.00 — 2026-11-11

- **The calculator is part of the dashboard.** It opens inside the command center's own menu, as every other page does: Overview, Accounts, People, Calculator, Quick guide, Teams, Settings and Audit log, with your name, **Theme**, **Sign out** and the version at the bottom.
- **One look everywhere.** The calculator takes the dashboard's colours, background, buttons and panels, in light, dark or your system's, and in each of the six palettes. **Theme** in the calculator is the same picker as on the dashboard and is saved to you, so a change on either page follows you to the other and to every device.
- **Updates checked every 15 minutes, always.** The server looks for new releases a minute after it starts and every 15 minutes after, whether or not auto-update is on; Settings → Updates says when a newer one is available.
- **Auto-update on by default, as soon as found.** A newer release is installed and switched to within 15 minutes, or at a set hour if an Admin prefers (Settings → Updates → When). A backup is taken first, and a version that does not come up is rolled back by itself, as before. Where an Admin had already chosen an hour or turned it off, that choice is kept.
- **Trusted checksums.** The first time a release is seen, its archive's SHA-256 and its SHA256SUMS are kept on the server and listed under **Trusted checksums**. If a release's checksums ever change afterwards (re-published or tampered with), it is marked and never installed, by hand or by itself. Installed versions are checked against the SHA-256 of every file at each check, and any change is recorded.
- **Background reads in the calculator's menu too.** A Checkmarx One read running on the server shows in the menu with its progress, wherever you are.

## CC-01.07.00 — 2026-11-11

- **Self-healing start.** Every data file is checked when the server starts.
  - A file that cannot be read is put aside and restored from the newest backup with a good copy.
  - An account or report that no backup has is set aside, so the server still starts.
  - People, teams or settings with no good copy stop the start and name the file, rather than guess.
  - Every repair is in the audit log and shown under Settings → Backups & health.
- **Backups on their own disk.** `BACKUP_DIR` sends backups to a second volume or a network share, so losing one disk does not lose both. The container has a `/backups` volume for it. A backup that fails is reported in the audit log and in Backups & health. An update or rollback does not go ahead without its backup.
- **Reads resume after a restart.** A Checkmarx One read cut off by a restart starts again by itself with the account's kept key. Without a kept key, the dashboard says the read was cut off and to read again.
- **Podman restarts an unresponsive container.** The run command adds `--health-on-failure=restart`.

## CC-01.06.00 — 2026-11-11

- **Two commands with Podman, as CxMissionZero.** `podman build` (or `podman pull` from ghcr.io once published) and `podman run`, and it is live on HTTPS. The container runs as a non-root user on a read-only root filesystem, with all capabilities dropped and its data in one volume. It has a health check and starts through the launcher, so updates and rollback work inside it.
- **Port 7443 by default, and yours to choose.** Map any host port with `-p <yours>:7443`, or move the port with `-e PORT=…`. Plain http on the same port is redirected to https.
- **Tested with 200 people working at once.** Over HTTPS, with 1,000 accounts and 3,000 reports:
  - 124 requests a second with no errors;
  - every action within 15 ms at p95;
  - about a fifth of one core and 130–220 MB of memory, in the container and out.
  One core serves about five times that load. Sizing and how to run it yourself are in docs/performance.md (`loadtest/run.sh`).
- **Faster for everyone.** The 2 MB calculator page is now the same for every person, compressed once and cached by the browser; each person's settings come separately. The dashboard's files and large answers are compressed. The overview's roll-up is quicker on large organisations. With all this, CPU at 200 people fell from 39% to 21% of one core, and the slowest p95 from 37 ms to 10 ms.

## CC-01.05.00 — 2026-11-11

- **Refresh a projection in one click.** When connecting in the calculator, tick **Remember this key for the account**. The key is sealed on the server (AES-256-GCM) and never sent back to any browser. From then on, anyone in the team presses **↻ Refresh from Checkmarx One** in the calculator, or **Refresh in the calculator** on the account page. The tenant is read again and the projection worked out from what it holds today. Every use is in the audit log; **Forget the key** removes it.
- **The customer's own numbers.** When a customer tries other numbers in their report and sends back **Download my version**, upload it with **Upload the customer's version** (calculator or account page).
  - Only the report's figures are read, never its HTML or scripts. They are worked out again with the calculator's own model.
  - You see what they changed (period, plan by severity, false positives, prices, scans, extra %, bundles) and the difference from what was sent.
  - Their version becomes a report of the account, marked "Customer's version". It can be the primary report, and their choices can become the account's calculator settings from then on.
- **Ready for the sales team.** New built-in roles:
  - **Sales:** the dashboards and accounts of their team, every projection and report, and recording credits sold; not the calculator.
  - **Sales Leader:** the same for every team below the ones they lead, plus managing their sales people.
- **Sales stay on the account.** Credits sold are recorded against the account, so they carry over when the projection is refreshed or replaced by the customer's version.

## CC-01.04.00 — 2026-11-11

- **Import people and the team structure from one sheet.** People & roles → **Import people & teams** reads an Excel or CSV sheet with email, name, title, role, team path (e.g. `Global SE > EMEA SE > EMEA North`) and whether the person leads their team. Missing teams in the paths are created, and leaders are set.
- **Preview before anything changes.** Every row is checked first: to create, already has access (left as they are), or not possible, with the reason.
- **Temporary passwords as an Excel sheet.** The new people's temporary passwords and the sign-in address come back as a workbook made in your browser. The passwords appear only in that file and are never stored, logged or emailed. Welcome emails are optional.
- **A template to start from.** It holds example rows, how to fill each column, the roles you can give, and the teams as they are now.
- **The same rules as adding one person.** Leaders import only into the teams they lead, and only Executives and Admins create teams or choose leaders. Nobody gives a role with more than they hold. At most 1,000 rows at a time.

## CC-01.03.00 — 2026-11-11

- **Credits sold, against every projection.** Each account records the credits actually sold, as one sale or many: credits, date, an optional Salesforce opportunity or order, the report it was sold against, and a note. **Sold…** on a report fills that report in.
- **Sold and still needed, everywhere.** The account page shows the projection (its primary report), what was sold so far, what is still needed and the % sold. The overview adds **Credits sold** and **Still needed**, rolled up through the team tree and per Sales Engineer. The accounts list adds Sold and Still needed columns, with Projected-not-sold, Partly sold and Fully sold filters. The calculator's account bar and the accounts CSV show the same figures.
- **Who records sales.** Everyone who works on the account (Sales Engineers, Leaders, Executives, Admins) can record a sale. People remove the sales they recorded; Leaders and above remove anyone's. Every sale is in the audit log.

## CC-01.02.00 — 2026-11-11

- **People & roles, as in CxMissionZero, for Leaders, Executives and Admins.**
  - Add a person in the page, with a typed or generated temporary password and an optional welcome email.
  - Search and filter people by role, team and status: active, locked, off, or must set password.
  - Per person: edit, reset password, unlock now, sign out everywhere, turn access off, remove.
  - Leaders manage the people in the teams they lead; Executives and Admins manage everyone. Nobody can give more than they hold.
- **Roles & permissions as a matrix.** Tick, find a permission, show only the differences, then save. Executives and Admins change roles; Leaders see them read-only. Admin-only permissions stay with Admins.
- **Sign-in tab.** Who may reset a forgotten password by email, whether single sign-on is on, and how long an idle session lasts.
- **Reading Checkmarx One runs on its own.** The read keeps running on the server when you leave the calculator. The menu shows its progress anywhere in the dashboard, then "Data ready". When you come back, the data is put into the account it was read for, ready to generate.
- **Generating a report no longer blocks the page.** A small card in the corner follows it while you keep working.
- **The two Checkmarx One exports are behind a flag.** Off by default (Settings → General). When on, the section stays collapsed until opened.

## CC-01.01.00 — 2026-11-10

- **HTTPS by default, from CxMissionZero.** Under Settings → HTTPS you can upload the company certificate (PEM or .pfx), checked like a browser would check it. You can also create a request for IT, make a self-signed certificate, or get a free one from Let's Encrypt that renews by itself. The page switches between HTTP, HTTP + HTTPS and HTTPS only, on one port, and sets HSTS and the lowest TLS version.
- **Single sign-on (SAML 2.0).** Connect Entra ID, Okta, Ping or ADFS under Settings → Single sign-on. Every assertion must be signed. People can optionally be added on their first sign-in, with a role and team; never as Admins. Passwords can be kept for Admins only.
- **Updates with checksum checks and rollback.** Releases are installed only when they match their SHA-256 and the manifest of every file. A backup is taken before every switch. A version that does not come up is rolled back by itself. You can switch back to any earlier version, and auto-update runs at the hour you choose.
- **Backups and health.** Backups are taken nightly, before every switch and by hand, sealed with a passphrase if you set one, and can be downloaded and restored. The audit log is now chained, and its integrity can be checked. A troubleshooting report with no secrets can be downloaded.
- **Admin-only settings.** HTTPS, single sign-on, updates, backups and settings stay with the Admin role; leaders never get them.
- **Themes.** Six palettes in light, dark or the system's mode. Each person keeps their own choice; the Admin sets the default.
- **Versions.** The version is shown in the menu. The About page lists every version, and "What is new" appears once after an update.
- **Animated calculations.** Reading Checkmarx One, counting code and generating a report each show their progress. Totals count up as they change.

## CC-01.00.00 — 2026-11-10

- **The Cx Credits Calculator for every Sales Engineer.** It is CxMissionZero's calculator (MZ-01.01.08), hosted. Accounts and reports are kept per team.
- **Accounts tied to Salesforce.** An opportunity or account link is required before a report can be generated.
- **Primary and shared reports.** Each account has one primary report (otherwise the latest counts) and a record of what was shared with the customer.
- **Team RBAC and leadership dashboards.** Team members work on their team's accounts together. Leaders see every team below them.
- **Forgot your password? and SMTP**, from CxMissionZero.
- **Impact (beta)**, per account, with a currency suggested for the SE to confirm.
- **First sign-in.** A one-time password, then the terms of use and a quick guide. Licensed under the PolyForm Internal Use License 1.0.0.
