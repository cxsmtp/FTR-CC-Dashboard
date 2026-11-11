# FTR Credits Command Center — user guide

The command center is where every Sales Engineer works out the credits an account needs, keeps the projection reports, and where leaders see the whole picture. This guide takes about five minutes.

## 1. Your first sign-in

1. Your Admin gives you your work email and a **one-time password** (four groups of five characters).
2. Open the command center's address and sign in with them.
3. **Choose your own password.** At least 12 characters. A few words strung together are easy to remember and hard to guess.
4. **Accept the terms of use.** Read them first: projections are supporting information only, keys and tokens are for the projection only, and the command center is for internal use under the PolyForm Internal Use License 1.0.0. You are asked again whenever the terms change.
5. **Read your quick guide.** Six steps for your role (Sales Engineer, Leader or Admin). It is always under **Quick guide**, just above your name in the menu, with the guides for the roles below yours.

**Forgot your password?** On the sign-in page, click **Forgot your password?** and enter your work email. A link to choose a new one arrives by email. It works once, for 30 minutes, and signs you out everywhere else. Nothing arrived? Check spam, or ask an Admin to reset it: they give you a new one-time password. Locked out after 5 wrong tries? Wait 15 minutes.

### Single sign-on

If your Admin turned on single sign-on, click **Sign in with SSO** (or the name your Admin gave it) on the sign-in page and use your company account. You still accept the terms of use the first time.

### Your theme

**Theme** at the bottom of the menu: light, dark or your system's, in six palettes. The calculator has the same menu and the same theme: a change on any page follows you everywhere, on every device. The version (CC-xx.xx.xx) is under it: click it for **About** and what is new.

## 2. Who sees what

| You are | You see and work on |
| --- | --- |
| **Sales Engineer** | Every account of your team (region). Everyone in a team can open any of its accounts and generate projections for it. You cannot see other teams. |
| **Leader** | Your team and **every team below the teams you lead**, on the dashboards and in the calculator. For example, a regional director sees their 8 SEs; the VP sees every region and its leaders. |
| **Executive** | Every team. |
| **Sales** | The dashboards and accounts of their team: every projection and report, and recording credits sold. Not the calculator. |
| **Sales Leader** | As Sales, for every team below the ones they lead, and managing their sales people. |
| **Viewer** | The dashboards of your team, read-only. |
| **Admin** | Everything, plus people, teams, roles, settings, audit log and backups. |

Teams form a tree (Global → EMEA → …). The Admin sets it up under **Teams** and chooses each team's leaders.

## 3. Making a projection (Sales Engineers)

1. Open **Calculator** in the menu. At the top, **Team (region)** is the team you are working in.
2. Type the **Customer name, as in Salesforce**, and press Enter. As you type, your team's accounts are suggested: pick one to open it. To start another account, click **+ New**, type its name and press Enter. Changing the name of the account that is open renames it.
3. Next to it, paste the account's **Salesforce opportunity or account link** and **Save**. Copy it from the address bar of the opportunity (`…/Opportunity/006…`) or account (`…/Account/001…`) in Salesforce. **It is required: no report can be generated without it.** **Open in Salesforce ↗** opens it in a new tab.
4. Choose the **Accountable SE**: you by default.
5. Bring in the data, under **Data from** (Checkmarx One, Git or cloc-fusion); once connected the panel folds to one line, and **Edit** opens it again:
   - **A Checkmarx One customer:** paste the API key they gave you and **Connect**, then **Read from Checkmarx One**. The key is held in the server's memory for your session only: it is never saved, logged or shown again. **Disconnect** forgets it at once, and so does signing out.
   - **A prospect not on Checkmarx One (Fusion forecast):**
     - **Fusion · from Git:** paste a **read-only** token for GitHub, GitLab, Bitbucket or Azure DevOps, pick the organisations and repositories, and count. The token is used only while the count runs.
     - **Fusion · cloc-fusion:** **Download cloc-fusion** and send it to the customer. They run it where their code is and send back the report, which you import here. Their code never leaves them.
     - Or, if an Admin turned it on (Settings → General), drop the two weekly exports from Checkmarx One → Analytics in the collapsed section.
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

### Refresh a projection later

When you paste a customer's Checkmarx One key, tick **Remember this key for the account**. It is kept sealed on the server and never shown again. Next time anyone in your team opens the account, **↻ Refresh from Checkmarx One** reads the tenant again in one click, and you can leave the page while it reads. The account page has the same, as **Refresh in the calculator**. **Forget the key** removes it.

### The customer's own numbers

Customers can **Try other numbers** in the report you sent and **Download my version**. When they send that file back, use **Upload the customer's version** in the calculator or on the account page:
1. The calculator works their numbers out again and shows what they changed and the difference from what you sent.
2. Choose whether their version becomes the **primary report**, and whether their choices become the account's settings from now on.
3. It is kept as a report marked **Customer's version**, so you can see both.

## 4. Primary and shared reports

Open **Accounts**, then the account:

- **Make primary** marks the report that stands for the account on every dashboard. **If none is marked, the latest report counts.**
- **Mark shared** records that you sent that report to the customer, with an optional note ("Emailed to the CISO, 12 Nov"). Leaders see how many reports went to customers.
- **Delete:** your own reports that were not shared yet. Leaders can delete any in their teams.

### Credits sold

On the account page, **Credits sold** keeps what was actually sold, as one sale or many. Enter the credits, the date, and optionally the Salesforce opportunity or order, the report it was sold against, and a note. **Sold…** on a report row fills that report in. **Fill in what is still needed** puts the remainder in the credits box.

The projection is the primary report's total, so the account shows **sold so far**, **still needed** and **% sold**. Remove a sale you recorded with the bin icon; Leaders and above can remove anyone's.

## 5. Dashboards (leaders)

- **Overview:** the credits projected from each account's primary report (T&R and Fusion), **credits sold** and **still needed**, accounts with a report, reports generated, reports shared with customers, and accounts still missing a Salesforce link. The team tree rolls up every team below. **Click a team** to see its accounts, or **an SE** to see theirs. **All my teams ▾** narrows everything to one team.
- **Accounts:** search and filter by team, SE and status (missing Salesforce link, no report, not shared, shared, no primary). The **Opportunity/Account** chip opens Salesforce in a new tab. Click a row for the account's reports.
- **Accounts CSV / Reports CSV:** export what you see, for a forecast call or a spreadsheet.

## 5b. People & roles (Leaders, Executives, Admins)

**People & roles** in the menu:
- **People:**
  - **Add person** with their role, team and a temporary password (typed, or **Generate**), with an optional welcome email.
  - Filter by role, team and status: active, locked, off, or must set password.
  - **Manage** on a row: edit role, team or name; reset password; unlock now; sign out everywhere; turn access off; remove.
  - Leaders manage the people in the teams they lead; Executives and Admins manage everyone. Nobody can give a role with more than they hold.
- **Import people & teams** (a whole region at once):
  1. **Download the template.** It holds example rows, how to fill each column, the roles you can give, and your teams as they are now.
  2. Fill it in: one row per person, with **Email**, **Name**, **Title**, **Role**, **Team** and **Leads team**. The team is the path from the top, with `>` between teams, e.g. `Global SE > EMEA SE > EMEA North`. Put **yes** in Leads team for a team's leader. Missing teams are created.
  3. **Choose the filled-in sheet** (Excel or CSV). Every row is checked and shown: to create, already has access, or not possible, with the reason.
  4. **Create.** An Excel sheet downloads with each new person's **temporary password** and the sign-in address. Give each person only their own password, over a channel only they read. Delete the file once everyone has signed in. The passwords are shown nowhere else.
  Leaders import into the teams they lead. Only Executives and Admins create teams or choose leaders.
- **Roles & permissions:**
  - the matrix of what each role may do, with search and "show only the differences";
  - Executives and Admins tick and **Save role changes**, or make a **New role** (optionally starting from another);
  - Admin-only permissions (HTTPS, single sign-on, updates, backups, settings) stay with Admins.
- **Sign-in:** who may reset a forgotten password by email, single sign-on, and when idle sessions end.

### Reading in the background

Reading a large Checkmarx One tenant can take a while. It runs on the server, so you can leave the calculator and work elsewhere. The menu shows **Reading Checkmarx One** with its progress, then **Data for … is ready**. Click it, and the data is put into that account, ready for **Generate projection report**. Generating a report never blocks the page either: a small card in the corner follows it.

## 6. Admins

- **People:** **Invite someone** with their role and team. A one-time password is shown **once**: give it to them over a channel only they read. **Edit** to change a role or team, reset a password, turn access off, or remove someone (their accounts stay with the team). Nobody can give a role with permissions they do not hold, and there is always one active Admin.
- **Teams:** make the tree, choose each team's region and leaders.
- **Settings & roles → Email server (SMTP):** the mail server, port, TLS, sign-in and from address. **Save**, then **Test connection**: nothing is sent until the test succeeds for exactly those settings. **Send test email** proves delivery. Choose who may reset a forgotten password by email (everyone; everyone but those who manage people; nobody). Links in emails point at the server's `PUBLIC_URL`. When email works, **Invite someone** can also send a welcome email (never the one-time password).
- **Settings & roles:** the organisation name on reports; the Salesforce, Checkmarx One and git hosts the server may call; custom roles; **Download backup**.
- **Audit log:** every action, by everyone, and everything refused, with the reason. Filter by who, what, dates and outcome; **Older entries** pages back; **Check the log is intact** proves no entry was changed or removed; **Export CSV** exports what the filters show.
- Locked out of every Admin account? On the server: `node scripts/reset-admin.mjs you@yourcompany.com`.

## 7. Good practice

- Paste a customer's key only into the calculator, and only with their permission.
- Use read-only git tokens, and revoke them when the count is done.
- Keep the Salesforce link, the accountable SE, the primary report and the shared marks current: that is what your leaders forecast from.
- Figures are supporting information worked out from data at a moment in time. Checkmarx's own records are authoritative, and a projection is not a quote.
