# FTR Credits Command Center — user guide

The command center is where every Sales Engineer works out the credits an account needs, keeps the projection reports, and where leaders see the whole picture. This guide takes about five minutes.

## 1. Your first sign-in

1. Your Admin gives you your work email and a **one-time password** (four groups of five characters).
2. Open the command center's address and sign in with them.
3. **Choose your own password.** At least 12 characters. A few words strung together are easy to remember and hard to guess.
4. **Accept the terms of use.** Read them first: projections are supporting information only, keys and tokens are for the projection only, and the command center is for internal use under the PolyForm Internal Use License 1.0.0. You are asked again whenever the terms change.
5. **Read the quick guide.** It shows the steps for your role. It is always under **Quick guide** in the menu.

**Forgot your password?** On the sign-in page, click **Forgot your password?** and enter your work email. A link to choose a new one arrives by email. It works once, for 30 minutes, and signs you out everywhere else. Nothing arrived? Check spam, or ask an Admin to reset it: they give you a new one-time password. Locked out after 5 wrong tries? Wait 15 minutes.

## 2. Who sees what

| You are | You see and work on |
| --- | --- |
| **Sales Engineer** | Every account of your team (region). Everyone in a team can open any of its accounts and generate projections for it. You cannot see other teams. |
| **Leader** | Your team and **every team below the teams you lead**, on the dashboards and in the calculator. For example, a regional director sees their 8 SEs; the VP sees every region and its leaders. |
| **Executive** | Every team. |
| **Viewer** | The dashboards of your team, read-only. |
| **Admin** | Everything, plus people, teams, roles, settings, audit log and backups. |

Teams form a tree (Global → EMEA → …). The Admin sets it up under **Teams** and chooses each team's leaders.

## 3. Making a projection (Sales Engineers)

1. Open **Calculator** in the menu. At the top, **Team (region)** is the team you are working in.
2. **Customer ▾ → + New customer** and type the account's name.
3. Paste the account's **Salesforce opportunity or account link** and **Save**. Copy it from the address bar of the opportunity (`…/Opportunity/006…`) or account (`…/Account/001…`) in Salesforce. **It is required: no report can be generated without it.** **Open in Salesforce ↗** opens it in a new tab.
4. Choose the **Accountable SE**: you by default.
5. Bring in the data:
   - **A Checkmarx One customer:** paste the API key they gave you and **Connect**, then **Read from Checkmarx One**. The key is held in the server's memory for your session only: it is never saved, logged or shown again. **Disconnect** forgets it at once, and so does signing out.
   - **A prospect not on Checkmarx One (Fusion forecast):**
     - **Fusion · from Git:** paste a **read-only** token for GitHub, GitLab, Bitbucket or Azure DevOps, pick the organisations and repositories, and count. The token is used only while the count runs.
     - **Fusion · cloc-fusion:** **Download cloc-fusion** and send it to the customer. They run it where their code is and send back the report, which you import here. Their code never leaves them.
     - Or drop the two weekly exports from Checkmarx One → Analytics.
6. Check the figures: Triage & remediation, the Fusion tab used (**Use this instead** picks which one counts), the extra % and bundles.
7. **Generate projection report.** It downloads the HTML report, and **Download PDF summary** gives the pages to present. Make as many reports as you need: each is kept.

### Impact (beta): soft savings for an account

Off by default, for each account. In the calculator, tick **Impact (beta)** in the account bar:

1. **Confirm the currency.** One is suggested from the account's name (GmbH → EUR, Pvt Ltd → INR…), its team or region, or your time zone. Confirm it or pick another. **Currency: … · change** changes it later.
2. On the **Impact** tab, set the **minutes to triage** a finding by hand, the **minutes to remediate** one, and the **developers' hourly rate**.
3. The tab shows the savings estimate from the triage and remediation forecast of the existing vulnerabilities. Reports for that account then carry a **What the credits give back** section and slide in the PDF summary: the soft savings.

Untick it and the account's reports carry no savings.

### The status strip

The strip at the top of the calculator stays in view as you work and when you generate a report. It shows:
- the Checkmarx One connection (tenant);
- where the account's data comes from (Checkmarx One, the exports, git or cloc-fusion);
- whether the Salesforce link is there;
- whether Impact is on;
- whether the account is ready to generate.

## 4. Primary and shared reports

Open **Accounts**, then the account:

- **Make primary** marks the report that stands for the account on every dashboard. **If none is marked, the latest report counts.**
- **Mark shared** records that you sent that report to the customer, with an optional note ("Emailed to the CISO, 12 Nov"). Leaders see how many reports went to customers.
- **Delete:** your own reports that were not shared yet. Leaders can delete any in their teams.

## 5. Dashboards (leaders)

- **Overview:** the credits projected from each account's primary report (T&R and Fusion), accounts with a report, reports generated, reports shared with customers, and accounts still missing a Salesforce link. The team tree rolls up every team below. **Click a team** to see its accounts, or **an SE** to see theirs. **All my teams ▾** narrows everything to one team.
- **Accounts:** search and filter by team, SE and status (missing Salesforce link, no report, not shared, shared, no primary). The **Opportunity/Account** chip opens Salesforce in a new tab. Click a row for the account's reports.
- **Accounts CSV / Reports CSV:** export what you see, for a forecast call or a spreadsheet.

## 6. Admins

- **People:** **Invite someone** with their role and team. A one-time password is shown **once**: give it to them over a channel only they read. **Edit** to change a role or team, reset a password, turn access off, or remove someone (their accounts stay with the team). Nobody can give a role with permissions they do not hold, and there is always one active Admin.
- **Teams:** make the tree, choose each team's region and leaders.
- **Settings & roles → Email server (SMTP):** the mail server, port, TLS, sign-in and from address. **Save**, then **Test connection**: nothing is sent until the test succeeds for exactly those settings. **Send test email** proves delivery. Choose who may reset a forgotten password by email (everyone; everyone but those who manage people; nobody). Links in emails point at the server's `PUBLIC_URL`. When email works, **Invite someone** can also send a welcome email (never the one-time password).
- **Settings & roles:** the organisation name on reports; the Salesforce, Checkmarx One and git hosts the server may call; custom roles; **Download backup**.
- **Audit log:** sign-ins, accounts and reports made, primary and shared marks, and every change to people, teams, roles and settings.
- Locked out of every Admin account? On the server: `node scripts/reset-admin.mjs you@yourcompany.com`.

## 7. Good practice

- Paste a customer's key only into the calculator, and only with their permission.
- Use read-only git tokens, and revoke them when the count is done.
- Keep the Salesforce link, the accountable SE, the primary report and the shared marks current: that is what your leaders forecast from.
- Figures are supporting information worked out from data at a moment in time. Checkmarx's own records are authoritative, and a projection is not a quote.
