# FTR Credits Command Center

The **Cx Credits Calculator**, hosted for every Sales Engineer, with team-based access and leadership dashboards.

[FTR-CreditCalculator](https://github.com/cxsmtp/FTR-CreditCalculator) is the standalone calculator one person runs on their own computer. The command center is the shared version: hosted once inside the company, it lets everyone sign in, work out the credits each account needs for **Triage & Remediation** and **Checkmarx Fusion**, and keep every report. Leaders see every projection their teams made and shared with customers.

- **The same calculator.** The page, the projection, the Checkmarx One reads, Fusion from git and cloc-fusion, and the reports and PDF are CxMissionZero's code, copied unchanged into `vendor/mz/` (currently **MZ-01.01.08**, the same code as the released FTR-CreditCalculator).
- **Accounts tied to Salesforce.** Every account carries its Salesforce **opportunity or account link**. It is required before a report can be generated, and it is one click away (new tab) everywhere.
- **One-click refresh and the customer's numbers.** A Checkmarx One key can be kept, sealed, per account, so the team refreshes its projection in one click. A customer's "Download my version" of a report can be uploaded: their numbers are worked out again, the changes shown, and their version kept (and optionally made the primary report and the account's settings).
- **Roles for the sales team** (Sales, Sales Leader), ready when they join.
- **Credits sold vs projected.** Record the credits actually sold per account, as one sale or many. Sold, still needed and % sold show on the account, roll up the team tree, and appear in the accounts list and CSV.
- **Many reports, one primary.** SEs generate as many reports as they need and mark one **primary**; otherwise the **latest** counts. They also record which reports were **shared with the customer**.
- **Team structure and RBAC.** Teams form a tree (Global → regions → teams). Everyone in a team works on all of its accounts together. Leaders see every team below them; Executives and Admins see every team. Other teams' accounts are invisible. There are five roles (Admin, Executive, Leader, Sales Engineer, Viewer) plus custom roles, and nobody can grant what they do not hold.
- **Dashboards.** Projected credits from primary reports (T&R and Fusion), rolled up the team tree; per SE, per account, the largest projections, activity by month, accounts missing a Salesforce link; CSV export.
- **Impact (beta), per account.** Off by default. The SE confirms a suggested currency (from the account's name, region or time zone) and sets the minutes to triage and to remediate a finding and the developers' hourly rate. The report and its PDF then show the soft savings of the triage and remediation forecast (MZ's own Impact section).
- **Status strip.** The Checkmarx One connection, the account's data sources, its Salesforce link, Impact and readiness, always on top in the calculator, including while a report is generated.
- **HTTPS by default, from CxMissionZero.** Upload the company certificate (PEM or .pfx) or get one from Let's Encrypt; switch between HTTP, HTTP + HTTPS and HTTPS only on one port; HSTS and the lowest TLS version.
- **Single sign-on (SAML 2.0)** with Entra ID, Okta, Ping or ADFS. Signed assertions only; people can optionally be added on their first sign-in; passwords can be kept for Admins only.
- **Updates with checksum checks and automatic rollback.** Releases come from GitHub Releases, checked against SHA256SUMS and a manifest of every file. A backup is taken before every switch. A version that does not come up is rolled back by itself. Roll back by hand to any version, and auto-update at a chosen hour.
- **Backups, health and audit integrity.** Nightly backups, sealed with a passphrase if set, that can be restored. A chained audit log you can verify. A troubleshooting report with no secrets.
- **Bulk onboarding.** Import people and the team structure from one Excel or CSV sheet, with a preview first, and get every new person's temporary password back as an Excel sheet.
- **People & roles, as in MZ, for Leaders, Executives and Admins.** Add, filter, unlock, sign out, reset and turn off people within each manager's scope. Roles are shown as a permissions matrix, and there is a Sign-in tab.
- **Background reads.** A Checkmarx One read keeps running when you leave the calculator. The dashboard shows its progress, and the data is applied to its account when you come back. Report generation never blocks the page.
- **The two exports behind a flag**, off by default.
- **Admin-only settings.** HTTPS, single sign-on, updates, backups and settings can never be given to another role, not even a leader's.
- **Themes and versions.** Six palettes in light, dark or the system's mode, kept per person; light by default. The version is shown as CC-xx.xx.xx, with an About page and "What is new" after each update.
- **Animated calculations.** Progress while reading Checkmarx One or counting code, a report-generating overlay, and totals that count up.
- **Prospects not on Checkmarx One.** A Fusion forecast from **git** (read-only token) or from the **cloc-fusion** report the prospect runs themselves.
- **Forgot your password? and email (from CxMissionZero).** An Admin sets up the SMTP server under Settings → Email server, tests it, and can send a test email. People can then reset a forgotten password with a one-time emailed link, and invites can send a welcome email. The one-time password itself is never emailed.
- **First sign-in.** A one-time password, then the person chooses their own, accepts the **terms of use**, and reads a **quick guide** for their role.
- **Licensing.** [PolyForm Internal Use License 1.0.0](LICENSE) with the [terms of use](TERMS.md), shown and accepted in the product.

Screens: sign-in · first sign-in (password → terms → quick guide) · Overview · Accounts · Account (primary, shared, Salesforce) · Calculator · People · Teams · Settings & roles · Audit log.

## Run it with Podman (two commands)

As with CxMissionZero: one command to get the image, one to run it.

**1. Get the image.**

From this repository:

```
podman build --format docker -t ftr-cc-dashboard https://github.com/cxsmtp/FTR-CC-Dashboard.git
```

Or, once a release is published to ghcr.io (see `.github/workflows/container.yml`):

```
podman pull ghcr.io/cxsmtp/ftr-cc-dashboard:latest
```

**2. Run it.** HTTPS on port 7443. The data goes in the `ftr-cc-data` volume and the backups in their own volume, `ftr-cc-backups`. If the container stops answering its health check, Podman restarts it.

Windows cmd, one line:

```
podman run -d --name ftr-cc --restart unless-stopped --health-on-failure=restart -p 7443:7443 -v ftr-cc-data:/data -v ftr-cc-backups:/backups -e BACKUP_DIR=/backups -e ADMIN_EMAIL=you@yourcompany.com -e PUBLIC_URL=https://cc.yourcompany.com:7443 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true ftr-cc-dashboard
```

bash:

```bash
podman run -d --name ftr-cc --restart unless-stopped --health-on-failure=restart -p 7443:7443 \
  -v ftr-cc-data:/data -v ftr-cc-backups:/backups -e BACKUP_DIR=/backups -e ADMIN_EMAIL=you@yourcompany.com -e PUBLIC_URL=https://cc.yourcompany.com:7443 \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true ftr-cc-dashboard
```

(With the ghcr.io image, put `ghcr.io/cxsmtp/ftr-cc-dashboard:latest` in place of `ftr-cc-dashboard` at the end.)

Open `https://<server>:7443`. The Admin's one-time password:

```
podman exec ftr-cc cat /data/initial-admin-password.txt
```

**Another port.**
- Change the left side of `-p`: `-p 9443:7443` serves `https://<server>:9443`.
- Or move the port inside the container too: `-e PORT=9443 -p 9443:9443`.

Keep `PUBLIC_URL` on the same port. Plain `http://` on that port is redirected to `https://`.

**Your certificate.** The server starts with a self-signed certificate. Upload yours under **Settings → HTTPS**, or get a free one from Let's Encrypt there. Or give your files at start: `-v C:\certs:/certs:ro -e TLS_CERT_FILE=/certs/server.crt -e TLS_KEY_FILE=/certs/server.key`.

**Updates.** Settings → Updates installs new releases, checked against their checksums, and rolls back by itself if one does not start. The versions are kept in the data volume.

To replace the image itself:

```
podman pull ghcr.io/cxsmtp/ftr-cc-dashboard:latest
```

```
podman rm -f ftr-cc
```

Then run step 2 again. The data stays in the volume.

**Backups and recovery, by themselves.**
- **Backups:** nightly, before every update or rollback, and before every restore. The newest 14 are kept in `/backups`.
- **Keep them on another disk.** Point the second volume at another disk or a network share, for example `-v /mnt/nas/ftr-cc:/backups`. Set `BACKUP_PASSPHRASE` to seal them.
- **Damaged data files** are restored from the newest good backup at start, with the damaged copy kept beside them. It is recorded in the audit log and shown under Settings → Backups & health.
- **A crash** is restarted by the launcher; **a version that fails to start** is rolled back.
- **A Checkmarx One read cut off by a restart** starts again by itself with the account's kept key.
- **A container that stops answering** is restarted by Podman (`--health-on-failure=restart`; Podman 4.6 or later, where systemd runs the health checks: Linux hosts and Podman machines on Windows and macOS).

**Size.** 1 vCPU and 1 GB is enough for 200 people working at once. See [Performance and sizing](docs/performance.md).

## Run it without a container

Node.js 22 or later, and git (for Fusion · from Git). **No npm dependencies.**

```bash
cp .env.example .env    # set ADMIN_EMAIL and PUBLIC_URL at least
npm start      # the launcher: HTTPS on PORT (7443 by default), updates and rollback
```

On the first start the server creates the Admin and writes their one-time password to `DATA_DIR/initial-admin-password.txt`. The file is deleted once they choose their own password. Sign in, then add the teams (**Teams**) and people (**People → Invite someone**).

To try it with a fictional organisation (3 regions, 27 people, about 40 accounts):

```bash
DATA_DIR=./demo-data node scripts/demo-seed.mjs && DATA_DIR=./demo-data npm start
```

Admins: see the **[admin and hosting guide](docs/ADMIN-GUIDE.md)** for HTTPS, single sign-on, email, updates and backups.

## Hosting it internally

| Setting | What it does |
| --- | --- |
| `PUBLIC_URL` | The address people use. Requests from any other origin are refused; with `https://`, cookies are `Secure`. |
| `HTTPS`, `TLS_CERT_FILE` / `TLS_KEY_FILE` (or `TLS_PFX_FILE`), `LETSENCRYPT_DOMAIN` | HTTPS is on by default (self-signed until you upload a certificate or get one from Let's Encrypt under Settings → HTTPS). `HTTPS=off` behind a reverse proxy that does TLS (then set `TRUST_PROXY=true`). |
| `UPDATE_REPO`, `UPDATE_GITHUB_TOKEN`, `HTTPS_PROXY` | Where releases come from, and the company proxy for outbound calls. |
| `BACKUP_PASSPHRASE` | Seals backups (AES-256-GCM). |
| `DATA_DIR` | Everything is kept here as JSON files. **Back it up** (or use Settings → Download backup). |
| `SESSION_IDLE_HOURS` | Sign-out after this long idle (8 hours by default). A session never lasts more than 7 days. |
| `SALESFORCE_HOSTS`, `CXONE_ALLOWED_HOSTS`, `GIT_ALLOWED_HOSTS` | The only hosts accepted for Salesforce links, Checkmarx One and git. Or set them in Settings. Addresses inside a network (private, loopback, link-local, metadata) are never called, so an API key or token cannot make the server call inside the company network. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Optional: the email server on the first start. Or set it in Settings → Email server. Either way an Admin tests it there before anything is sent. Reset links point only at `PUBLIC_URL`, which must be https. |
| `MZ_PRODUCT_CODE` | The calculator, like CxMissionZero, works until **31 December 2026** unless a product activation code is given. Given here, nobody has to type it. |

## Security

- Forgotten passwords (as CxMissionZero): a 256-bit one-time link to the account's own email. Only its hash is kept, in memory. It works once, for 30 minutes, and only while the password is unchanged; using it signs the account out everywhere. The answer never says whether an address has an account, and requests are rate-limited per address and per account. Admins can exclude people who manage people, or turn it off.
- The SMTP password is encrypted at rest (AES-256-GCM, key in `DATA_DIR/secret.key`) and never shown again; mail is sent only after a successful test of exactly the settings in force, and a password login always uses TLS.
- Passwords hashed with scrypt; 12 characters minimum; account locked 15 minutes after 5 wrong tries; sign-in rate limits per address and per account.
- Sessions: random tokens in an `HttpOnly`, `SameSite=Strict` cookie; only their SHA-256 is stored. CSRF token and Origin check on every change.
- Content Security Policy on every page: the dashboard runs only its own files; the calculator only its own scripts, pinned by hash.
- Customer API keys and git tokens are held in memory for the session (tokens only while a count runs). They are never written, logged or returned.
- RBAC is checked on the server for every request, and teams are isolated: another team's account answers *not found*.
- An append-only audit log of sign-ins, reports, primary and shared marks, and every administrative change.
- CSV exports neutralise spreadsheet formulas.

## Updating the calculator

Changes to the calculator are made in CxMissionZero. To take a new release:

```bash
node scripts/sync-mz.mjs /path/to/CxDetectionDateBaseReminder
npm test
```

## Develop

```bash
npm test     # node --test: RBAC, team isolation, Salesforce links, sessions, CSRF, exports
npm run dev
```

| Path | What |
| --- | --- |
| `server/app.js` | Routes: sign-in, dashboards, accounts, reports, people, teams, roles, settings, audit, the calculator's API |
| `server/rbac.js` | Permissions, roles, the team tree and scope |
| `server/iam.js` | People, passwords, sessions |
| `server/sso.js` | Single sign-on (SAML 2.0) |
| `server/updates.js`, `server/launch.js`, `scripts/make-release.mjs` | Checksum-verified updates, the launcher with rollback, release builds |
| `server/backup.js` | Backups and restore |
| `server/password-reset.js`, `server/mailer.js` | Forgotten passwords and the email server (from CxMissionZero) |
| `server/accounts.js` | Accounts (calculator customers + Salesforce, owner, team, primary) and reports (+ shared) |
| `server/calculator.js` | The hosted calculator page and each person's Checkmarx One and git reads |
| `client/` | The calculator's hosted entry and frame (replaces MZ's standalone.js) |
| `public/` | The dashboard |
| `vendor/mz/` | CxMissionZero's calculator, copied by `scripts/sync-mz.mjs` (see `vendor/mz/SOURCE.json`) |

## Licence

[PolyForm Internal Use License 1.0.0](LICENSE): for your organisation's internal business only. See [TERMS.md](TERMS.md). An independent project, not a Checkmarx product. Figures are supporting information only: Checkmarx's own records are authoritative.
