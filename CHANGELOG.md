# FTR Credits Command Center: versions

Each version is shown as CC-xx.xx.xx, with the calculator's CxMissionZero version. Newest first.

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
