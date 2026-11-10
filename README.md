# FTR Credits Command Center

The **Cx Credits Calculator**, hosted for every Sales Engineer, with team-based access and leadership dashboards.

[FTR-CreditCalculator](https://github.com/cxsmtp/FTR-CreditCalculator) is the standalone calculator one person runs on their own computer. The command center is the shared version: hosted once inside the company, it lets everyone sign in, work out the credits each account needs for **Triage & Remediation** and **Checkmarx Fusion**, and keep every report. Leaders see every projection their teams made and shared with customers.

- **The same calculator.** The page, the projection, the Checkmarx One reads, Fusion from git and cloc-fusion, and the reports and PDF are CxMissionZero's code, copied unchanged into `vendor/mz/` (currently **MZ-01.01.08**, the same code as the released FTR-CreditCalculator).
- **Accounts tied to Salesforce.** Every account carries its Salesforce **opportunity or account link**. It is required before a report can be generated, and it is one click away (new tab) everywhere.
- **Many reports, one primary.** SEs generate as many reports as they need and mark one **primary**; otherwise the **latest** counts. They also record which reports were **shared with the customer**.
- **Team structure and RBAC.** Teams form a tree (Global → regions → teams). Everyone in a team works on all of its accounts together. Leaders see every team below them; Executives and Admins see every team. Other teams' accounts are invisible. There are five roles (Admin, Executive, Leader, Sales Engineer, Viewer) plus custom roles, and nobody can grant what they do not hold.
- **Dashboards.** Projected credits from primary reports (T&R and Fusion), rolled up the team tree; per SE, per account, the largest projections, activity by month, accounts missing a Salesforce link; CSV export.
- **Prospects not on Checkmarx One.** A Fusion forecast from **git** (read-only token) or from the **cloc-fusion** report the prospect runs themselves.
- **Forgot your password? and email (from CxMissionZero).** An Admin sets up the SMTP server under Settings → Email server, tests it, and can send a test email. People can then reset a forgotten password with a one-time emailed link, and invites can send a welcome email. The one-time password itself is never emailed.
- **First sign-in.** A one-time password, then the person chooses their own, accepts the **terms of use**, and reads a **quick guide** for their role.
- **Licensing.** [PolyForm Internal Use License 1.0.0](LICENSE) with the [terms of use](TERMS.md), shown and accepted in the product.

Screens: sign-in · first sign-in (password → terms → quick guide) · Overview · Accounts · Account (primary, shared, Salesforce) · Calculator · People · Teams · Settings & roles · Audit log.

## Run it

Node.js 22 or later, and git (for Fusion · from Git). **No npm dependencies.**

```bash
cp .env.example .env    # set ADMIN_EMAIL and PUBLIC_URL at least
npm start
```

On the first start the server creates the Admin and writes their one-time password to `DATA_DIR/initial-admin-password.txt`. The file is deleted once they choose their own password. Sign in, then add the teams (**Teams**) and people (**People → Invite someone**).

With Docker or Podman:

```bash
docker compose up -d --build
docker compose exec command-center cat /data/initial-admin-password.txt
```

To try it with a fictional organisation (3 regions, 27 people, about 40 accounts):

```bash
DATA_DIR=./demo-data node scripts/demo-seed.mjs && DATA_DIR=./demo-data npm start
```

## Hosting it internally

| Setting | What it does |
| --- | --- |
| `PUBLIC_URL` | The address people use. Requests from any other origin are refused; with `https://`, cookies are `Secure`. |
| `TLS_CERT` / `TLS_KEY` | Serve https directly. Or put it behind your reverse proxy (TLS there) and set `TRUST_PROXY=true`. |
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
| `server/password-reset.js`, `server/mailer.js` | Forgotten passwords and the email server (from CxMissionZero) |
| `server/accounts.js` | Accounts (calculator customers + Salesforce, owner, team, primary) and reports (+ shared) |
| `server/calculator.js` | The hosted calculator page and each person's Checkmarx One and git reads |
| `client/` | The calculator's hosted entry and frame (replaces MZ's standalone.js) |
| `public/` | The dashboard |
| `vendor/mz/` | CxMissionZero's calculator, copied by `scripts/sync-mz.mjs` (see `vendor/mz/SOURCE.json`) |

## Licence

[PolyForm Internal Use License 1.0.0](LICENSE): for your organisation's internal business only. See [TERMS.md](TERMS.md). An independent project, not a Checkmarx product. Figures are supporting information only: Checkmarx's own records are authoritative.
