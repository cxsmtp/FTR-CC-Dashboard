# FTR Credits Command Center: versions

Each version is shown as CC-xx.xx.xx, with the calculator's CxMissionZero version. Newest first.

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
