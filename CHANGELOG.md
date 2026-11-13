# FTR Credits Command Center: versions

Each version is shown as CC-xx.xx.xx, with the calculator's CxMissionZero version. Newest first.

## CC-01.97.00 — 2026-11-13

- **No end date.** The calculator carried the licence gate of the product it came from, which would have shut it on
  1 January 2027 without an activation code. The gate is gone from the calculator.
- **Restoring a backup from the page works for backups of any real size.** The upload was held to 256 KB, so a backup
  over about 190 KB was refused as too large. Those who manage backups may now send up to 400 MB. After a restore the
  audit log goes on from the restored log's last line (it reported itself broken).
- **A malformed report can no longer hold the server up.** Reading an earlier report cut the page with patterns whose
  time grew with the square of a malformed file's size (half a megabyte took 14 seconds, for everyone). It is cut by
  position now: 6 MB of the same takes a tenth of a second, and real reports read exactly as before.
- **An update keeps more of what is in memory.** Password-reset links sent before an update go on working, a single
  sign-on begun before it ends well after it, and git counts are still there to read (one still running is ended, and
  says its repositories were not counted because of the update).
- **A request refused as too large is answered.** The sender was left waiting; it now gets the refusal and the
  connection is closed.

## CC-01.96.00 — 2026-11-12

- **The calculator page is half the size.** Its fonts were written into the page (509 KB of it, which barely
  compresses), so every visit downloaded them before anything showed. They are now their own files, named by their
  content: the browser fetches only the few the page uses (about 100 KB), after the page is drawn, and keeps them. The
  page goes from 789 KB to 411 KB. Reports keep their fonts inside, so they still open anywhere.
- **cloc-fusion 1.4.2.** The download hands out 1.4.2 (default GitHub connection named "github", the change-frequency
  scans as one compact strip); the change-frequency groups have their short names. Its reports are read as before.
- The dashboard's spreadsheet reader loads from this version's own address again (it was not found there).

## CC-01.95.00 — 2026-11-12

- **No more server freezes of several seconds.** The check that the installed versions' files are unchanged read and
  hashed every file of every version kept, holding up the whole server while it ran: on each page an Admin opened (the
  status lights) and on each update check. It now runs in the background, one file at a time, and remembers each
  version's answer (an installed version never changes); the status lights no longer touch it.
- **The calculator opens without a false start.** From the menu it starts fresh, as meant, without first saying it is
  opening the last account and asking for it. An account opened from the Accounts list is remembered with its team, so
  it is never asked for in another team (where it is not found) and then loaded again; an address naming an account
  of another team goes to that team at once.
- **No sideways scrolling.** The calculator's tables (repositories counted, Checkmarx One's projects, generated reports)
  and an account's reports fit their panel at any width from 1024 pixels: names, tags and labels wrap, number boxes and
  model pickers fit their column, Remove sits under the name.

## CC-01.94.00 — 2026-11-12

- **Faster page clicks on a far network.**
  - Connections stay open between clicks for 2 minutes (they closed after 5 seconds), so a page opened after reading
    another does not wait for a new connection and its secure handshake first.
  - Pages open at once from what was already loaded, however old, and ask for the latest behind it: when something
    changed, the page is drawn again in place (not while you type or a dialog is open). Saving anything still asks
    for everything fresh.
  - An account's side panel, Engines & rates, the audit log and the CxOne API audit are kept like the lists.
  - Pointing at a menu link or an account starts loading it before the click.
  - The default logo and icon are the same picture: fetched once, and kept by the browser for a day.
  - Measured with a 210 ms network: an account's side panel opens in about 60 ms (was about 270 ms), Accounts after a
    pause in about 70 ms (was about 320 ms).

## CC-01.93.00 — 2026-11-12

- **cloc-fusion report: two real buttons.** With cloc-fusion report picked as the source, **Browse their report** (filled)
  loads the customer's report, and **Download cloc-fusion** (outlined) gives the utility to send them; both small, on one
  line with the source picker.

## CC-01.92.00 — 2026-11-12

- **Three sources in the calculator: Checkmarx One, Git, cloc-fusion report.** Git takes the customer's read-only token.
  cloc-fusion report has, on one line, the upload (any file cloc-fusion writes: JSON, HTML, CSV or Markdown) and
  **Download cloc-fusion** to send to the customer, in place of the token.
- **One tab for counted code.** Repositories counted from git and those from a cloc-fusion report (or cloc results) land
  together on Fusion · from Git, as one estimate; the separate cloc-fusion tab is gone. An account that used the
  cloc-fusion estimate keeps it, now on that tab.
- **Scans by how often repositories change, on Fusion · from Git.** The same cards as Checkmarx One's (they are one
  setting), counting the repositories in each group by the commits on their default branch.
- **10K-LOC blocks explained.** Each repository is rounded up to whole blocks on its own (a 2,000-line one is a whole
  block), so the blocks can be more than the lines over 10K: the tile says both numbers.
- **Default Fusion scans per repository: 4**, for a repository whose commits are not known (was 12), with a shorter
  explanation. Accounts that already have a number keep it.

## CC-01.91.00 — 2026-11-12

- **One account per Salesforce link.** An opportunity or account link already on an account cannot be given to another
  one. In the calculator (a new account's link, or a link saved on an account) and on an account's details, the link is
  checked first: "This account already exists", with the account, its SE and team, and the choice to open the account
  or its projection in the calculator. Someone who may not open it is told whose it is. The 15- and 18-character forms
  of a record id count as the same record. Accounts that already share a link keep it as it is; only a new use is
  refused.
- **Debt added against fixes, after loading a report.** The chart drew a single spike on a backward axis, from the
  months a report keeps. It now draws the report's own weekly rates over the months the figures cover, as the table
  under it. A report without weekly rates says so in place of the chart. Old reports' weeks are read whichever way
  their dates were written ("Jun 3" or "3 Jun").

## CC-01.90.00 — 2026-11-12

- **No more empty start screen while an account opens.** Opening the calculator on an account (from Accounts, a link, or the one open last), the page showed for a moment the start screen for a new account, as if the account were gone. It now says *Opening the account…* (with its name as soon as it is known) until the account is there.

## CC-01.89.00 — 2026-11-12

- **A report file with nothing to load says so.** A copy saved from the Command Center after an earlier report was brought in keeps only its totals. Uploaded under *A previous report* or *The customer's version*, it used to be kept and "loaded" with nothing happening. Now the dialog says *Nothing in it to load*, explains why, and asks for the original report file; the calculator is left as it is. When such a copy still shows its tables on its page, they are read and loaded.

## CC-01.88.00 — 2026-11-12

- **A Fusion engine without a rate is not used until it has one** (Mythos 5.1 and opus-5.0 for now). The calculator does not offer it, and projects, scan-frequency rules or a default set to it use the default engine with a rate instead, so they are no longer counted at 0 (test report #8: Kotak MF was understated). It is back by itself once the Admin sets its rate in Settings → Engines & rates, which still lists it under *Seen without a rate*. When no engine has a rate at all, none is taken away.

## CC-01.87.00 — 2026-11-12

The last items of the 12 November test report.

- **#15** An account's page offers the bin next to a report only to those who may delete it (a role with *Delete any report*, or whoever made it while it is not shared). The server refused the others already: a test now checks that a role that only looks is refused every change to an account, whatever it sends.
- **#14** Each role gets its own quick guide: Admins the Admin's, those who lead teams or look after people the Leader's, those who use the calculator the Sales Engineer's, and every role that only looks (Viewer, Sales, Tester and the like) a new short *Viewer* guide. Before, every role without the calculator got the Leader's.
- **#11** The page is told only what it uses about the person signed in: not their lock, status or record dates.

## CC-01.86.00 — 2026-11-12

Faster everywhere, and reports from earlier versions brought in whole.

- **Pages open faster, most of all over a slow link.** The dashboard's scripts and styles are kept by the browser until the next version, instead of being checked again on every page load (21 round trips fewer), and all of them are asked for at once. Who is signed in is asked for together with the page. On a link with 300 ms of latency, Accounts now shows in about 1 second instead of 2.3.
- **Moving between pages is near instant.** The lists most pages show (accounts, people, the dashboard) are fetched in the background once a page is up, and kept in memory for 30 seconds: Accounts and People open in a few tens of milliseconds instead of a round trip each. Anything changed clears them at once; nothing is written to the device.
- **The calculator opens faster.** The account to open is known from the start, so its figures, its details, the list and the connection's state are asked for together instead of one after another: about 1.3 seconds instead of 2 over the same link.
- **A report from an earlier version fills the calculator in full.** A report made before "Try other numbers" existed (only figures on its page) is read from its page, both under *A previous report* and *The customer's version*: the backlog and what it adds and fixes a month for each severity, the plan, the month-end backlog, the weekly rates, Fusion's models, scans and every project. Worked out again with today's model; the dialog shows that total against the one on the page (an earlier saving such as FAE is not counted). Upload the original file of such a report again to fill an account's calculator (ENBD, AD Ports).
- **Reload from uploaded reports no longer offers what it has done.** An account reloaded from its report shows *Up to date* and is not ticked again, until its calculator or its report changes. A report with its own figures but without "Try other numbers" is reloaded from those figures; one that keeps only its totals says so and how to fill it.
- Accounts: the T&R and Fusion breakup wraps onto two lines instead of widening the table; below 1200 pixels wide the *Customer* and *Last* columns give way, so the list never scrolls sideways.
- A row's ⋯ menu always opens inside the window and follows its button when the list scrolls.

## CC-01.85.00 — 2026-11-12

- **Account names are tidied as they are entered** (test report #13): spaces trimmed and single, a word typed in lower case written as a name is (*tata motors ltd* → *Tata Motors Ltd*), a short word with no vowel taken for an abbreviation (*hdfc bank* → *HDFC Bank*), the usual business words spelled their way (Ltd, GmbH, LLC, MF, IT). A word typed with capitals is kept as typed (ENBD, MAQTA, eBay). Names already there are not changed by the update: **Accounts → Tidy names** (Admin) lists the ones that would read better, to tick and rename.
- **The same customer twice is said before it happens** (#9): a new account whose name matches one already there, in any team and however written (*e.n.b.d*, *ENBD*), asks first, naming the team, the SE and the Salesforce record of the one there. It does not refuse: two opportunities of one customer are two accounts. *Tidy names* also lists the accounts that look like one twice.
- **Backups sealed from Settings** (#4): Settings → Backups & health, *Seal backups with a passphrase* (12 characters or more). From the next backup on, a backup cannot be read or restored without it. Kept sealed with this server's key and never shown again; no restart. BACKUP_PASSPHRASE, where set, still wins.

## CC-01.84.00 — 2026-11-12

- The Tejas card tells Checkmarx's growth story: *Tejas — built for speed, engineered for dominance. Every projection here is a sortie in Checkmarx's growth: one customer, one codebase, one credit at a time.*
- The quick guide's *Limits to know* shows in every guide, the Admin's too.

## CC-01.83.00 — 2026-11-12

One customer's data in another's account: the last line closed, and the accounts it reached put right in one click.

- **The server refuses a read saved into the wrong account.** Every Checkmarx One read is remembered with the account it was made for; saving it into any other account is refused, whatever the page sends, and recorded (cxone.read.misplaced). Kept across updates.
- **Reload from uploaded reports** (Accounts, Admin only). It lists every account with a report brought into it (a previous quote or a customer's version), what that report says next to what the calculator holds now, every one ticked. Reloading rebuilds each ticked account's calculator from its report, as an upload does since CC-01.81.00. Reports, sales, links and contacts stay. Each is recorded (account.reloaded). For HDFC Bank, ENBD and any account read while connected to another customer before CC-01.78.00.
- **Projects to read: every one, up to 1,000,000** (was 10,000). An account that still had the old 10,000 (saved with every account, though nobody chose it) now reads everything; a number someone typed stays. The quick guide's new *Limits to know* says what is not possible: an account keeps up to 32 MB (roughly 100,000 projects), a key reads one customer, an uploaded report brings months, not weeks.
- **Accounts open on the SE's own accounts.** A Sales Engineer sees the accounts they are accountable for first (*Every SE* shows the rest of their team); every other role sees every account its access allows.
- From the test report of 12 November:
  - *#18* The extra credits % shows wherever T&R and Fusion do: in Accounts (*T&R 76K · Fusion 132K · +30%*) and on Overview (*extra 62,397*), so the parts add up to the total.
  - *#7* A Sales Engineer's *shared* on Overview counts their accounts shared with the customer, not the shares they clicked.
  - *#16* Jump to finds people (for everyone, not only those who manage people) and every page under Settings by its name or its group; each word typed must match; it says when it is still loading.
  - *#17* CxOne API audit: *Only me* stays when applied, and the figures above the list follow the filters.
  - *#19* An account's headline credits are never cut ("270,388 cre…").
  - *#22* Audit log: *Refused* includes failed sign-ins and everything recorded as refused or failed.
  - *#21* Engines & rates: *Changes save as you type* only for those who can change them.
  - *#23* Every export says the file is on its way.
  - *#25* "1 account", "1 person".
  - *#3, #5* Settings → General: *Behind a reverse proxy*. Ticked, the audit log shows each person's own address instead of the proxy's, and browsers that came over HTTPS are sent HSTS. Applies at once, no restart.
- The SE quick guide no longer says teammates see an account at once (they see it once its first report is made, since CC-01.80.00).

## CC-01.82.00 — 2026-11-12

- **No account without its Salesforce link and a projection.** In the calculator, a new customer's name is not enough any more: the Salesforce link field sits next to it from the start, and Enter asks for the link when it is missing or not Salesforce's. The server refuses an account without a valid link too.
- **Kept for its maker alone until it has a projection.** With its name and link, the account is held only in the calculator of the person who started it, marked *Not saved yet: bring in data to keep it*. It is nowhere else, not in Accounts, Overview, dashboards or exports, and not for Admins. Its first projection (Checkmarx One read, the two exports or a report uploaded, code counted, or a project added) makes it an account: a draft, its SE's and the Admins' until its first report (CC-01.80.00).
- **Started and left with nothing for a day: discarded,** and recorded in the audit log (account.discarded). Accounts that exist already are not touched.

## CC-01.81.00 — 2026-11-12

- **An uploaded report fills the calculator.** Until now a report brought in (*A previous report*, or *The customer's version*) was only kept as a report: Triage & remediation, Fusion and the settings stayed as they were. Now, with *Load its figures into the calculator* ticked (the default), the calculator takes them from the report: the backlog by severity and its trend, the plan (findings chosen, false positives, findings to come, AI, pace, More found by Fusion), the projection period, Fusion's projects with their scans and models, the code counted from git or cloc-fusion, and the extra credits. The calculator then shows the report's own numbers, and everything can be changed from there.
- The status strip says *T&R: from an uploaded report*, and Triage & remediation says which report. A report keeps the backlog month by month, not week by week: read Checkmarx One again for the weekly detail.
- It replaces what the calculator held for that account (the dialog says so); untick it to keep the report only, as before. A customer's version, ticked *Load their version into the calculator*, loads their numbers the same way. Triage and remediation credits stay the Admin's.
- A report made without project names loads its Fusion projects as groups (*12 projects (the report kept no names)*), with the same credits.

## CC-01.80.00 — 2026-11-12

- **An account is its SE's until its first report.** While a Sales Engineer works on an account, nobody else sees it: not teammates, not leaders, not Sales or Customer Success. Only its accountable SE, whoever made it, and the Admins. The first report generated (or a previous quote or a customer's version brought in) publishes it to its team, as before. Once published it stays so, even if its reports are deleted.
- The server enforces it everywhere: Accounts, the account's page, the calculator's list, Overview and its figures, exports and the Jump to search. Someone opening a link to a draft is told it is still being prepared by its SE.
- Those who can see a draft see it marked: *Draft* next to its name in Accounts, a note on the account's page, and *Draft: only you and Admins see it* in the calculator's status strip.
- A leader cannot reassign the SE of a draft (they do not see it); an Admin can.
- **Applies to accounts already there:** an account with no report yet is now visible only to its SE, whoever made it, and the Admins, until one is generated. Nothing is changed in any account.
- **The Admin removes all calculations from an account.** *Remove all calculations…* in the account's ⋯ menu in Accounts and on its page (Admin only): the backlog read or uploaded, its trend, Fusion's projects, the code counted, the scope and the totals go; with *Also delete its reports* ticked, its reports too, and it is a draft again. The account, its Salesforce link, SE, team, contacts and sales stay. Recorded in the audit log (account.reset).
- **Calculator: Clear Checkmarx One data is easier to see**: a red-outlined button, no longer a faint link.
- The reading overlay (terms, licence, guide) closes when you go to another page, instead of staying over it.

## CC-01.79.00 — 2026-11-12

- **Calculator: Clear Checkmarx One data.** For an account that holds a read that was never its own (see CC-01.78.00), and has no tenant of its own to read again: the button, next to the account's tools at the top, takes out everything read from Checkmarx One: the backlog, its trend and the projects read. It asks first. Reports already made, projects typed by hand, the plan's settings and code counted from git or cloc-fusion stay. Shown only when the account holds such data; recorded in the audit log (account.cxone.cleared).

## CC-01.78.00 — 2026-11-12

One customer's Checkmarx One data can no longer end up in another customer's account.

- **What went wrong.** A connection to Checkmarx One, and the last read made with it, belonged to the person signed in, not to the account. Connected with one customer's key, opening another account and reading (or opening an account with nothing read yet, while a read made for another had just finished or was running) put the first customer's projects and findings into the second account.
- **A connection is for one account.** It is for the account it was made for. Open another account and the calculator says it is not connected for this one, naming the account the connection is for; reading is refused by the server with the same explanation, and recorded in the audit log (cxone.read.refused). Paste the account's own key, or use the key kept for it, to read it.
- **A read is for one account.** A read says which account it is for and is put into that account only: it is not followed, shown or applied in another, and a read finished for another account no longer "serves" an empty one. Changing what is counted (scope, engines, shares) is refused when the last read was for another account.
- **A kept key guards its account.** When a key is kept for an account, reading it while connected to another tenant is refused.
- Nothing saved is changed by this update. **An account that already holds another customer's data keeps it until it is read again with its own key**: open it, connect with its key, read, and check the reports made from it since.

## CC-01.77.00 — 2026-11-12

- **People: a reporting manager for everyone.** In a person's Manage panel, *Reports to* sets their manager: anyone with access, in any team, so the hierarchy of sales, SE and CSM leadership can be recorded as it is. The panel says whom they report to and who reports to them; the list shows "Reports to …" under the team.
- **Find and set it for many.** The People list has a *Reports to* filter: everyone under a person, at every level, or those who report to nobody. Select several people and set *Reports to* for all of them in the bar that appears.
- Nobody reports to themselves and no circle can be made (the message says why). When a manager is removed, their people report to that manager's own manager. Every change is in the audit log with the old and the new manager.
- Nobody has a manager until one is set, and it changes nothing else: what each person may see and do still comes from their role and their team.

## CC-01.76.00 — 2026-11-12

- **Calculator, from Git: no empty "How it is measured" bar.** The folded line shows only when repositories were counted in this session ("Repository by repository: 22 counted, 1 not · how it is measured"); with nothing counted it is not there.

## CC-01.75.00 — 2026-11-12

- **People: Manage opens beside the list, on half the page.** Instead of a small menu that the table cut off (with a scroller of its own), Manage slides a panel in from the right: who the person is (status, role, team, last sign-in), their name, title, role and team to change and save, and each thing that can be done for them as a button that says what it does: Sign in as, Reset password, Unlock now, Sign out everywhere, Turn access off or on, Remove. Close with ✕, Esc or a click outside.
- **Accounts: the row's ⋯ menu is never cut off.** It opens over the page, under its button or above it when there is no room below, and closes when the list scrolls.

## CC-01.74.00 — 2026-11-12

- **Calculator: no footer line.** "FTR Credits Command Center · Terms of use & license" and "Supporting information only" no longer show under the calculator. The terms and the licence are where they always are: under the version in the menu, and on the About page.

## CC-01.73.00 — 2026-11-12

- **Calculator: the tabs are a band across the page.** Triage & remediation, the Fusion tabs and Generated reports are now large buttons side by side over the full width, in a tinted band with its own border; the one in view is filled in the accent colour with a shadow. On a narrow screen they wrap onto two rows.

## CC-01.72.00 — 2026-11-12

- **Accounts: Delete the account, in the row's menu, for the Admin.** It asks first, naming the account, how many reports it has and the sales recorded on it; the account goes with its reports and sales, and the deletion is in the audit log. Only the Admin sees it in the list.

## CC-01.71.00 — 2026-11-12

- **Calculator: Projection settings without the white space.** The projects, Search options, "Every setting is applied" and Apply are on one line; the empty band above them and the explanation under them are gone while nothing waits to be applied. With changes waiting, the list of changes, Undo, Apply and the explanation show as before.
- **Calculator: the tabs stand out.** Triage & remediation, the Fusion tabs and Generated reports are a strip of their own, with the tab in view filled in the accent colour, so a new user does not miss them.

## CC-01.70.00 — 2026-11-12

- **Calculator, Code repositories: two things, side by side.** *Upload their cloc-fusion report* (the customer made it), or their read-only git token and *Connect to Git*. The switch between "with their token" and "cloc-fusion report" of CC-01.69.00 is gone. What the upload read shows right under it, and the calculator opens on its repositories.
- **Any report cloc-fusion makes is read: JSON, HTML, CSV or Markdown.** Each gives the same repositories, lines of code, commits, change frequency and developers. The JSON says the most (lines by language, so languages can be left out); the others give each repository's lines as one figure. Its list of contributors (cloc-fusion-contributors.csv) is not a report and is refused, as before. Several files can be given at once.

## CC-01.69.00 — 2026-11-12

- **Calculator: Git and cloc-fusion are one choice.** "Data from" offers Checkmarx One or **Code repositories**; under Code repositories, one small switch: *With their token* (counted here) or *cloc-fusion report* (the customer ran it and sent the file). The same in the meeting view. Nothing saved changes: accounts, their counted repositories and their reports are as they were.
- **cloc-fusion 1.4.1** (was 1.3.2): the page handed out by "Download cloc-fusion", and the engine that counts from git here. With it:
  - Minified and generated code is sized as Checkmarx sizes it: a file of 64 KB or more with over 512 bytes a line of code counts as its bytes divided by 40 (a 300 KB one-line bundle is 7,680 lines, not 1). This replaces the rule of CC-01.62.00 (one line for every 512 characters).
  - No file is dropped for its size: one over 1 MB is counted from its size instead of being skipped.
  - The customer's page says Calculate Fusion credits, has a Count minified files option (off, as before), and no longer shows criticality.
  - Repositories already counted keep their figures; the rule applies to what is counted from now on.

## CC-01.68.00 — 2026-11-12

- **Calculator: the count from git no longer makes the page long.** While repositories are counted, a small card at the right says how far the run is (4 of 23, and what it is on) and goes by itself when it ends. The list repository by repository, and how it is measured, are folded into one line at the bottom of the section ("Repository by repository: 22 counted, 1 not · how it is measured"): open it for any repository's detail, or with Details on the card.

## CC-01.67.00 — 2026-11-12

- **An account opens beside the list, not instead of it.** Click an account in Accounts and it opens as a wide side panel over the list: the same details, sales and reports, each table fitting the panel. Close it with ✕, Esc, a click outside or the browser's Back, and the list is where it was, with its search and filters. A link to an account still works: the list is drawn and the account opens on it.
- **Account team & emails.** Each account keeps who is on it: our people (AE, CSM…) and the customer's contacts, with name, email, role and side. The addresses its reports were shared with are shown too, and added to the list with one click. Add several emails at once (a comma between); remove with the bin. From the Accounts list: the row's menu, Account team & emails. Whoever works on the account may change it: the calculator's people, its accountable SE, and those who share reports or manage people. Changes are in the audit log with the addresses added and removed.
- When a report is marked shared from the account, the customer's contacts are offered as you type.
- Nothing is added to any account by the update: the list starts empty, and the shared-with addresses are only read from the reports.

## CC-01.66.00 — 2026-11-12

- **Accounts: the T&R and Fusion breakup is back.** Under each account's credits, in small type: how much is triage & remediation and how much is Fusion.
- **Download a report from the account.** Every report in an account's Reports list has a Download button: the same file the calculator makes (with its levers), without opening the calculator. Each download is in the audit log.
- **No more "Cannot set properties of null" page.** Opening another page while the first was still loading let the first one finish late and put that error (or itself) over the page just opened. Pages now open one at a time: the one loading finishes, then the last place asked for opens.

## CC-01.65.00 — 2026-11-12

- **Accounts follow their accountable SE.** An account is in the team of its accountable SE. Move a person to another team (People, in the list or in Edit) and their accounts move with them; the message says how many. Give an account a new accountable SE and it moves to that SE's team.
- **Accounts left behind earlier are caught up in one click.** When accounts are still in another team than their SE (from team changes made before this version), Accounts shows how many, lists them with where they are and where they go, and moves one or all of them with a click. For Admins and leaders who manage people, each for the teams they see.
- Every move is in the audit log (account.follow: the account, its SE, from which team to which, and why). The update itself moves nothing: accounts change team only when someone changes a person's team, an account's SE, or clicks Move.

## CC-01.64.00 — 2026-11-12

- **The plan by project: the projects scanned most often first.** The list is in order of how often each project is scanned (5+ a week at the top), then by open findings. When only part of a severity is in the plan (Customize per severity: say 2,000 of the High findings), that part is taken from the projects scanned most often first, in this order, until the number is reached: each cell shows what is counted of what is open ("214 of 225"), the Counted column the project's share, and the total row what the plan holds. The credits do not change with it: the plan's numbers are the same, now shown project by project.

## CC-01.63.00 — 2026-11-12

Triage & remediation planned the way Fusion is: by how often projects are scanned, and project by project. Every group and every project is counted in full until someone changes it, so no saved projection moves.

- **Scan-frequency groups as cards.** "Fusion scans by how often projects are scanned" is one row of nine small cards (5+ a week … Not in a year), each with its number of scans and how many projects are in it, in place of a nine-row table: about a sixth of the height. The model of a group shows only when one is set, or with **Model per group**. Criticality uses the same cards.
- **The same for triage & remediation.** On its tab, **Findings counted, by how often projects are scanned**: a % for each group (100 everywhere to start). **Active projects only** sets 100% for projects scanned at least monthly and 0% for the rest; **Every project** puts it back. It replaces yesterday's checkbox; a projection that had it ticked keeps exactly what it counted.
- **The plan by project** (was "Open vulnerabilities by project"): every project of the scope with how often it is scanned, how much of it is counted, and its open findings by severity. Untick a project to leave it out of triage & remediation (Fusion keeps it); **Count all**, **Count none**, and **Find a project**. The total row is what is counted, and the line above says how many projects are in full, in part and left out. The list scrolls inside its own frame, with its headings and total in view.
- The scope chosen at the top, the shares and the ticks work together: the backlog, its trend, the credits and the report follow all three. The report's assumptions say which groups are not counted in full and how many projects were left out by hand.
- These need a read from Checkmarx One (the two exports do not say which project a finding is in); with the exports the cards and the ticks are shown but cannot be changed. How often a project is *scanned* is what is known for triage & remediation; commits are known only for repositories counted from Git or cloc-fusion, which have no findings to triage.

## CC-01.62.00 — 2026-11-12

The calculator, for the two conversations it is used in: a customer already on Checkmarx One, and a new customer where only Fusion applies. Nothing saved changes: every new choice is off until someone makes it.

- **Triage & remediation: count only the active projects.** One checkbox on the Triage & remediation tab, with how often at least (once a month unless changed): ticked, the backlog and its trend are those of the projects scanned that often, and the page says how many that is ("46 of 60"). Fusion keeps every project. It needs a read from Checkmarx One (the two exports do not say which project a finding is in). The report's assumptions say so when it is on.
- **Repositories on top of Checkmarx One.** On the Git and cloc-fusion tabs, when some of the repositories counted are not projects in Checkmarx One (matched by name): what they add, in credits and as a percentage of Checkmarx One's Fusion credits, and **Add them on top of Checkmarx One**. Only those are added, so no code is counted twice; **Take them out** undoes it. The report names that part "Fusion — repositories not in Checkmarx One".
- **No estimate is swapped for a bigger one by itself.** The one in use stays. With nothing in use yet, it is Checkmarx One's once read, else the code counted. (Before, the highest of the three was picked automatically.)
- **No pricing table in the calculator.** Rates are the Admin's (Settings → Engines & rates): the "Fusion pricing" panel is gone from the three Fusion tabs, and engines without a rate are no longer offered in the model lists. A projection that already uses one keeps it.
- **A new customer, Fusion only.** With Git or cloc-fusion as the source, no Checkmarx One key and no backlog, the Triage & remediation tab, its half of the summary, the Checkmarx One Fusion tab and Impact are not shown; the status says "New customer · Fusion only". They come back with a key or the two exports.
- **Long lines count as several.** A line of code longer than 512 characters counts as one line per 512 characters, in the count from Git here and in the cloc-fusion tool handed to customers (its checksum changes with it), so minified or generated code weighs what it holds. Files named `*.min.js`, bundles, `node_modules` and build folders are still left out, and files over 2 MB skipped. Counts already made stay as they are until counted again.

## CC-01.61.00 — 2026-11-11

Two things shown wrongly in the calculator, put right. No figure, filter or saved setting changes.

- **Lines of code show whole.** In the Fusion project tables a figure of six or seven digits was cut to its first five (221,676 read as 22167, beside "23 blocks"). The field is now wide enough; the figures themselves were always right.
- **Engines counted**: with the two exports (no read from Checkmarx One) the six engine boxes could not be ticked; only the sentence that says why is shown now. After a read they are there to choose, as before.

## CC-01.60.00 — 2026-11-11

- **The calculator lines up.** The projection, its tabs and everything under them share one left and right edge with the account panel above (they sat inset before). The folded **Projection settings** is one line: its title and **Show settings**; the empty band under it is gone. On a narrow screen the tabs wrap onto a second line and nothing runs off the side.
- **Faster pages with big tables**: the small helper that sizes rings and bars now runs once per frame, not once for every piece of the page.
- **Inside**: the dashboard's code is one file per page (17 files in `public/js/`) where it was a single 3,700-line file; every reference between them is checked. Nothing changes in what the pages do.

## CC-01.59.00 — 2026-11-11

- **The calculator is this product's own.** Its code moved into the app's own `core/` folder, the script that copied it in from another product is gone, and About, the health check and the guides no longer name where it came from. Nothing changes in what it does. (The terms of use are left exactly as they are, so nobody is asked to accept them again.)

## CC-01.58.00 — 2026-11-11

The Standard look, rebuilt as one plain design system, and the first screens people meet made simple.

- **The Standard look**: one accent colour, plain panels, no gradients, glass or glow; one type family; controls of one height; quiet table headers and figures that line up. Light and dark. It is the same on the dashboard and on the calculator page. The Command Center look is as it was.
- **Sign-in is just the name and the form.** The headline, the description and the four feature cards are gone; on a phone the form is the first and only thing on the screen.
- **The calculator starts with one thing to do**: the customer's name (and the team it goes in). The Salesforce link, the data source, Impact and the rest appear once the account is open. The status strip, the dashed box and the "Click New" message no longer compete with it.
- **"In meeting with the customer" and "The customer's version"** are plain buttons in the Standard look.
- **Overview**: the rings show their share again (they were drawn empty), and the Projected credits card is just its figure.
- The calculator's footer no longer names where the calculator came from.

## CC-01.57.00 — 2026-11-11

Less to look at, the same work done. A first pass over the whole product: what is not needed is gone, and the menu is three pages and Settings.

- **The menu**: Overview, Accounts, Calculator, and **Settings**. Everything else is in Settings, with its own menu beside the page: People, Teams, Roles & permissions, Sign-in; Engines & rates; Audit log, CxOne API audit; General, Branding, Email, Single sign-on, HTTPS, Updates, Backups, Get help, About. Every page keeps its address, so links and bookmarks still work. Jump to (Ctrl K) lists them all.
- **Accounts: one line per account.** Name (with a link to Salesforce), accountable SE, credits, sold, still needed, customer, last report. The team and the T&R / Fusion split show when you point at a cell. A **pencil** in a cell changes it right there (it shows when you point at the row), and the **⋯** menu at the end of the row has everything: open, open in the calculator, rename, change the SE, record a sale, shared with the customer, mute. Double-click is gone; one click opens the account at once.
- **Rates are the Admin's, for everyone.** A team no longer has rates of its own, so a quote is the same whichever team makes it. Rates a team set before are no longer applied.
- **The breach cost is gone** from Impact, the report and the PDF: a share of the customer's revenue is not a figure to put in front of them. Impact itself is unchanged.
- **Get help is one form.** Say what is not working, or what you would like; it is emailed to the support address, which answers by replying to that email (the reply goes to you). What you sent is listed under the form. The conversation and statuses inside the app are gone; requests sent before are still listed.
- **Two looks**: Standard and Command Center, each in light or dark. Ocean, Emerald, Sunset, Royal and Graphite are gone; whoever had one sees Standard.
- **The top bar is quieter**: the Checkmarx One, Email and Git lights and the Refresh entry are gone. An Admin still sees when a newer version is ready.
- Branding no longer offers an accent colour (one set before still applies).

## CC-01.56.00 — 2026-11-11

- **More found by Fusion starts at 0%.** A new projection (and **Defaults**) no longer adds 5% more findings for Fusion; set it when the customer's own numbers support it. A projection saved before keeps its own %.

## CC-01.55.00 — 2026-11-11

Security, second pass (after the Checkmarx One rescan):

- **Teams are managed within your own teams.** "Manage teams" now reaches only the teams in the manager's scope: a team outside it cannot be changed, moved, deleted or given leaders, a team cannot be added at the top without seeing every team, and a leader must be someone from the teams managed. Admins and Executives (every team) work as before.
- **Roles are changed by their own id only**; a made-up id is refused instead of creating a role under it.
- **Load test**: the password for the simulated people lives only in the shell for the run, never in a file.
- Results of the load test after the fixes are in docs/performance.md.

## CC-01.54.00 — 2026-11-11

Security: a full Checkmarx One scan (SAST, SCA, IaC, containers, secrets, API security) and every real finding fixed.

- **Email library updated** (nodemailer 10.5.0): an address-parsing flaw (CVE-2026-125755, high) could send mail meant for one address to another domain.
- **Sign-in lock holds under a burst.** Wrong passwords sent all at once are counted while they are checked, so no more than 5 are tried before the account waits 15 minutes.
- **Logo and icon fetched from an address**: the server connects only to the addresses it checked (no second DNS answer can lead it to a private address), and stops reading at 200 KB.
- **Mail server test**: only mail ports (25, 465, 587, 2525, 1025), so it cannot be used to knock on other services. A port already saved stays as it is.
- **Signed release check**: the cached GitHub attestation is verified again (signature, certificate chain, transparency log) each time, never trusted from the file as it is.
- **Single sign-on errors**: why the identity provider's answer was refused goes to the server log for the Admin; the person sees that it failed.
- **The temporary password typed for a new person is never kept as a draft** in the browser, nor is any field named like a password, token or key.
- **Temporary-password sheets** (People → Reset passwords): a cell a spreadsheet would read as a formula is written as text.
- **Hardening**: the router's and the CxOne API audit's lookups cannot reach an object's prototype; the Let's Encrypt challenge answer carries the same protective headers as every other.
- **Container and CI**: a health check in `compose.yaml`; the port binding written out; `git` and `tini` pinned to their major versions; GitHub Actions pinned to the commits of the versions used.
- **Load test tool**: no password in the source (one is made per run) and the server's own certificate is checked instead of turning checks off. The test fixtures no longer carry anything shaped like a key or a password in a link.

## CC-01.53.00 — 2026-11-11

- **False positives: one small box.** The calculator's four "False positives %" fields (one per severity) and the report's four false-positive sliders are now a single small **False positives [30] %** box beside the per-severity results (in the report, beside "Count the findings still to come"). It sets every severity at once; 30% as before. The report no longer repeats it under the answer or on the key slide: it is said once, in the assumptions, and in the appendix.
- **Smoother levers in the report.** Dragging a slider now updates the panel's figures at every step and works the whole report out again once you let go or pause, instead of rewriting the report (charts and appendix) at every step. The page no longer moves while you drag.
- **Sign in as (Admin).** People → Manage → **Sign in as …**: an Admin sees and works in the Command Center exactly as that person does, for up to an hour, with an orange bar on every page and **Back to my own account**. Everything done meanwhile is recorded in the audit log as the Admin acting as that person; the person's password, profile, sessions and terms stay theirs, and it cannot be chained. A new Admin-only permission, "Sign in as someone else"; no other role gets it.

## CC-01.52.00 — 2026-11-11

- **In a meeting with the customer: choose where the data comes from.** The **Data from** choice (Checkmarx One, **Git**, cloc-fusion) now sits under the customer's name in the meeting view, so a Fusion-only opportunity can be worked out there: choose **Git**, take the customer's read-only token and connect, or choose cloc-fusion to bring in their report. The matching Fusion tab (from Git, or from cloc-fusion) opens with it. Nothing else of the frame is shown; "Remember for the account" stays out of the meeting view.

## CC-01.51.00 — 2026-11-11

- **Git: you see what happens.** After **Connect to GitHub** (GitLab, Bitbucket, Azure DevOps), everything the count says shows right under the token: finding the organisations, listing the repositories, counting (with its progress), the result, and, when it cannot go on, why (in red: the token refused, an organisation it may not read, a host the server may not reach…). The page also scrolls to the Fusion · from Git results. Before, the messages went to a folded part of the Fusion tab and the top kept saying it was counting.
- **Fusion-only customers**: with **Git** or **cloc-fusion** chosen as the data source, **Impact** and the Checkmarx One key line (and Refresh / Forget the key) are not shown, as they apply to Checkmarx One only; Impact stays in view while on, to turn it off.

## CC-01.50.00 — 2026-11-11

- **Get help: support cases and enhancement requests.** **Get help** in the menu (and in Jump to): **Submit a support case** (with its priority) or **Request an enhancement**. Each gets a number (SUP-0001, ENH-0001), a status (New, In progress, Waiting for reply, Completed, Declined) and a conversation.
  - Everyone follows their own requests; the support team (the Admin, and anyone given the new permission **Answer support cases & enhancements**) sees the queue, answers and moves each one on.
  - **Emails**: every new request and every answer from the person who raised it goes to **bhawani.singh@checkmarx.com** (and the support team); the person who raised it gets their number, every answer and every status change. Through the email server under Settings → Email (SMTP); if it cannot send, the request is kept and the page says so.
  - **Settings → Get help**: the support portal here, or plain email (each person’s email app opens, addressed to the support address, with a template); and the address requests go to. Saved as it changes. Everything is in the audit log.
- **Tejas.** Point at the jet logo: it shows itself, larger, with its line — “Tejas - Built for speed, engineered for dominance—Tejas turns every airspace into its own.” (Only while the jet is the logo.)

## CC-01.49.00 — 2026-11-11

- **No sideways scrolling anywhere.** Every panel, list and table fits its width at any screen size: text wraps or ends in …, and the tables were made to fit rather than scroll (checked on every page at 1280, 1366 and 1920 wide).
  - Accounts: T&R and Fusion now sit under the total credits of each account (two columns fewer); the row buttons read **Open** and **Mute** (their full wording on hover).
  - People: names and addresses wrap; the role and team lists take the room there is.
  - CxOne API audit: every column wraps.
- **A sleeker Overview.** **Sales Engineers** and **Largest projections** are two matching lists, the top six each, with a slim bar and no inner scrolling (all of them on Accounts); the largest projections show what was sold in green. **Latest reports** is gone (each account’s page and the Accounts list have them).

## CC-01.48.00 — 2026-11-11

- **Bring in a report generated before** (a quote already given), so every quote is kept. Once the account has its name and Salesforce link, **⇪ A previous report** in the calculator takes the report file: it shows whom it was made for (and says so when the name differs), when it was made and its credits; add whom it was shared with (optional) and keep it. It is kept as a **Previous quote**, with its own date and figures exactly as given: the account’s settings and today’s rates do not change it. It shows among the account’s reports, and the audit log records it.

## CC-01.47.00 — 2026-11-11

- **Mute an account from the forecast (Executives).** In the Accounts list, **Mute from forecast** leaves an account out of every dashboard figure: projected credits, sold, still needed, shared, the teams, the SEs and the largest projections. The account stays in the Accounts list, dimmed and marked **Muted** (who and when on hover), and **Unmute** brings it back. **Status → Muted from the forecast** lists them. A new permission, **Mute accounts from the forecast**, given to the Executive role (the Admin holds every permission); it can be given to other roles under Roles & permissions. Every mute and unmute is in the audit log.

## CC-01.46.00 — 2026-11-11

- **Open in calculator, right from the Accounts list.** Every row has its own **Open in calculator** button: one click and that account is open in the calculator, without going through its page first.

## CC-01.45.00 — 2026-11-11

- **Overview · Teams: the top team and its three biggest.** The team everything rolls up into (Global Solution Engineering) is one fixed line with its totals; below it, the three teams with the most projected credits, side by side, each with its share, people, accounts, shared, sold and to go. Other teams are a click away on Teams. No more scrolling inside the panel.
- **The Activity chart is gone from the Overview**: Teams takes the full width.

## CC-01.44.00 — 2026-11-11

- **The calculator always opens on a new calculation.** From the menu, the home page, **Open calculator** on the Overview or **New in calculator** on the Accounts page (and on a reload), nothing of the last calculation is shown: no account is open, the customer’s Checkmarx One key and git tokens from before are dropped, and the page waits for the new account’s name. Type a name to start one, or pick an existing account by its name. **Open in calculator** on an account page still opens that account.

## CC-01.43.00 — 2026-11-11

- **Connect reads Checkmarx One at once.** The moment the API key is given and connected, the calculator reads that customer’s tenant for the account open (as **Read from Checkmarx One** does), also when the account already had data. Before, it read only for an empty account, and could reuse a read made in the last minutes, even one made for another customer.

## CC-01.42.00 — 2026-11-11

- **Leaders change the accountable SE**, whoever made the projection: in the calculator, on the account page or in the Accounts list (double-click). Leaders and above may do it even where their role does not use the calculator; it is in the audit log.
- **The accountable SE records what was shared**: once they generate a report (or on any report of their account, whoever made it), they mark it shared with whom, from the Report ready card, Generated reports, the account page or the Accounts list, even where their role could not otherwise share reports. Everyone else keeps exactly the permissions they had.

## CC-01.41.00 — 2026-11-11

- **+ New starts a clean calculation.** The open projection is saved and closed, and nothing of it stays on the page: the account panel is emptied (name, Salesforce link, SE, reports), the customer’s Checkmarx One key and git tokens are dropped (a new customer is a new tenant), and the projection area waits for the new account’s name. Type it, Enter, and the new account opens on its own, clean. The previous account stays saved and opens again from its name.

## CC-01.40.00 — 2026-11-11

- **Triage & remediation credits are one rate for everyone, set by the Admin.** Under **Fusion engines & rates → Triage & remediation credits**, the Admin sets the credits to triage one finding and to remediate one, per severity (they save as you type). Everywhere else they are shown, never changed: the calculator’s **Customize per severity** and the report’s own levers are read-only, every projection uses the Admin’s figures whatever is sent, and a customer’s version never brings its own. They start at today’s figures (1 to triage, 3 to remediate), so nothing changes until the Admin changes them; every change is in the audit log.
- **Customer view** is gone from the calculator: **In meeting with the customer** replaces it.

## CC-01.39.00 — 2026-11-11

- **The calculator, aligned and sleek.** Every field and button in the account panel and in Projection settings has one height and one shape, and sits on one baseline per row; sizes follow the screen (34px controls on a laptop, up to 42px on a large monitor).
  - Account panel: name, Salesforce link (with Save and ↗), team and SE on one line; Data from, the key and Connect on the next; Impact and the key’s state on the left, then **Refresh**, **Forget the key**, **In meeting**, **The customer’s version** and **Fold** together on the right. Disconnect shows only once connected.
  - Folded: the customer, their link, team, SE and connection, then **In meeting**, **The customer’s version** and **Edit**, on one line.
  - Projection settings: lighter borders, a calmer totals card, the report options as one row of pills with **Generate projection report** on the right.
- **Findings still to come are off by default** for new projections (and for **Defaults**): tick **Count findings still to come** to count them. Projections already saved keep their own choice.

## CC-01.38.00 — 2026-11-11

- **The sign-in page fits one screen**, whatever the window: the headline, text, the four features and the sign-in card scale with its height (on a short window the features show their titles only).
- **Far less scrolling everywhere.** Tighter headings, panels, cards and table rows on every page. Long lists scroll inside their own panel with the column headers kept in view, so the page fits the window: Accounts now fits one screen (was three), CxOne API audit under two (was fourteen), the Overview one and a half (was three).
  - Overview: the cards in one row, a shorter activity chart, the teams, SEs and largest projections at a fixed height.
  - CxOne API audit: each explanation is one line; open it for what was done and what happens next time.

## CC-01.37.00 — 2026-11-11

- **In meeting with the customer.** A strong red button in the calculator (and on the folded bar) opens this customer’s calculator alone, in a new tab, to share on screen: your logo and organisation, the customer’s name and today’s date on top, then the projection, its settings, Triage & remediation, Fusion, Impact and **Generate projection report**, in your theme.
  - Nothing of ours is shown: no menu or top bar, no status lights, no Salesforce link, API key, git token, team or SE, no other customers or reports, no internal questions after a report is made.
  - **Leave meeting view** (faint, top right) closes the tab.

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
