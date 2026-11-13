# FTR Credits Command Center: admin and hosting guide

Everything under **Settings** is for the **Admin** role only. HTTPS, single sign-on, updates, backups and settings can never be given to another role, not even to a leader's (the server refuses).

## Run it with Podman (two commands)

One command to get the image, one to run it.

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

```
cp .env.example .env      # set ADMIN_EMAIL and PUBLIC_URL (the https address people use)
npm ci --omit=dev
npm start                 # the launcher: starts the version chosen under Settings → Updates and keeps it running
```

With compose: `podman compose up -d` (port 7443; change the left side of the port mapping in compose.yaml).

On the first start the Admin is created. Their one-time password is in `DATA_DIR/initial-admin-password.txt`, and the file is deleted once they choose their own. Locked out? Run `node scripts/reset-admin.mjs you@yourcompany.com`.

## Settings → HTTPS

The server is **HTTPS by default**. It uses a self-signed certificate until you give it one; browsers warn until then. A single port answers both http and https: each connection's first byte says which it is.

1. **Your company certificate.** Upload the PEM files (certificate, chain and key, in any files) or one .pfx with its passphrase. **Check it** connects to it the way a browser would. It reports a wrong key, a missing intermediate, a name it does not cover, or an expired date before anyone meets it. **Check and put to use** installs it, and **Put the previous one back** undoes it.
2. **No certificate yet.** **Create a request** downloads a CSR for IT. You can also make a self-signed certificate for the names people use.
3. **Let's Encrypt.** For a public name that the internet reaches on port 80: give the names and an email, then accept the Subscriber Agreement. The certificate is renewed 30 days before it expires. You can also set `LETSENCRYPT_DOMAIN` and `LETSENCRYPT_EMAIL`.
4. **HTTP only / HTTP and HTTPS / HTTPS only.** Switch to HTTPS only from a page opened over https; that proves it works from your browser first.
5. **Hardening.** Choose the lowest TLS version (1.2 or 1.3), and HSTS once HTTPS only works with a trusted certificate.

You can also start with your files: `TLS_CERT_FILE` and `TLS_KEY_FILE` (or `TLS_PFX_FILE` and `TLS_PFX_PASSPHRASE`). `HTTPS=off` gives plain http, for a laptop or behind a proxy that does TLS.

## Settings → Single sign-on (SAML 2.0)

1. In your identity provider (Entra ID, Okta, Ping, ADFS), add an enterprise application (SAML):
   - **Entity ID** `https://<PUBLIC_URL host>/saml/metadata`;
   - **Reply URL** `https://<PUBLIC_URL host>/saml/acs`;
   - the work email as the NameID or an email attribute.
   Assign the people who use the command center. The service's metadata is at `/saml/metadata`.
2. Paste the provider's **SSO URL** and **signing certificate** (two during a rollover), and optionally its issuer.
3. Optional settings:
   - **Add people on their first sign-in**, with a role and team. Never as an Admin or anyone who manages people.
   - **Passwords for Admins only**: everyone else must use SSO, and Admins keep a way in if the identity provider is down.
4. Tick **Single sign-on is on**. The sign-in page then shows the SSO button.

Every assertion must be signed by that certificate, addressed to this service, recent, and an answer to a sign-in this server started. A replayed or unrequested answer is refused.

## Settings → Email (SMTP)

The mail server is used for "Forgot your password?" links and welcome emails. **Save**, then **Test connection**: nothing is sent until a test succeeds for exactly the settings in force. The password is kept encrypted (key in `DATA_DIR/secret.key`) and never shown again.

## Settings → Updates (checksums and rollback)

Releases come from this repository's GitHub Releases (`UPDATE_REPO`; `UPDATE_GITHUB_TOKEN` for a private one).

- **Check for updates** lists every release, with what is installed, running and failed.
- **Install** downloads `ftr-cc-dashboard-<version>.tar.gz` and `SHA256SUMS`. The archive must match its SHA-256, and every file must match the `MANIFEST.json` inside it, with nothing extra; otherwise the release is refused, with the reason. Files are checked again before every start.
- **Switch to** (or **Install and switch**):
  1. a backup is taken;
  2. the launcher loads the new version beside the running one, on trial, and hands it the traffic when it is up (no restart);
  3. if it does not come up within 150 s (`UPDATE_START_TIMEOUT_SECONDS`), or stops within 2 minutes, it is **rolled back by itself** to the version before. It is marked failed and never installed automatically again.
- **Roll back** to the built-in version or to any installed one, with **Switch to**.
- **Always on the newest version.** The server looks for a new release every 15 minutes (set **Check for updates every … minutes**, 5 to 1,440) and switches to it by itself, without a restart. **Check for updates** does it at once.
- **Versions:** every version with the SHA-256 kept the first time it was seen. **Update now** moves to a newer one, **Roll back to this** to an older one (the built-in one included); the version you rolled back from is not put back by itself until a newer release comes.
- **Trusted checksums:** the first time a release is seen, its archive's SHA-256 and its `SHA256SUMS` are kept on the server (`DATA_DIR/app/state.json`) and listed. If they ever change afterwards (a re-published or tampered release), the release is marked **Checksum changed: refused** and is never installed, by hand or automatically. Installed versions are re-checked file by file at each check; a change is recorded under Recent events, and that version will not start.
- **Reload the server** loads it again beside the running one and hands over, without a restart.
- **No restart, ever.** The launcher holds the port and passes every connection on. Every switch (an update, a rollback, a restored backup, a reload) loads the new version beside the running one; the running one finishes what it is answering and hands over each person's Checkmarx One connection and their reads; then the new one takes over. Nobody is signed out and the port never closes. If the new version does not come up, the running one carries on.

Making a release: bump `version` in package.json, add the CHANGELOG entry, and merge to `main`. The release workflow sees a version with no release yet, runs the tests, builds the archive (`scripts/make-release.mjs`) with its checksums and publishes it; every server finds it within 15 minutes. (A `v<version>` tag works too.) Behind a company proxy, set `HTTPS_PROXY`; the launcher sends the server's own calls through it.

## Settings → Backups & health

- **Backups:** nightly, before every version switch, and **Back up now**. They hold everything except the versions folder. The newest 14 are kept in `DATA_DIR/backups`. Set `BACKUP_PASSPHRASE` to seal them (AES-256-GCM); keep the passphrase safe.
- **Restore:** choose a backup file. It is checked, then a backup of what is there now is taken, then it is restored and the server restarts.
- **Audit log:** every action, by everyone, and everything refused, with the reason. Each event is chained to the one before by SHA-256: **Check the log is intact** (on the Audit log page) and **Health** show whether the chain is intact, or where it breaks. Filter by who, what, dates and outcome, and export what the filters show as CSV.
- **Troubleshooting report:** versions, health, settings in force, update events, backups and recent errors. It holds no secrets, keys or customer data.

## Settings → General and Roles

- **General:** the organisation name on reports, the default theme for everyone, and the Salesforce, Checkmarx One and git hosts the server may call. Addresses inside the network are never called.
- **Roles:** custom roles. Nobody can give permissions they do not hold, and the Admin-only ones cannot be given at all.

## Staging and production

One installation can be marked **Staging** or **Production** (Settings → Updates → *This installation is*). Not marked,
it behaves as it always has: it takes every published release.

**While the software is still being shaped (now).** Mark the one installation *Staging*. It takes every release as soon
as it is found and says "Staging" at the top of every page, so nobody takes it for the finished product.

**When it is ready for people to rely on.**

1. Mark that installation **Production**. From then on it takes only *promoted* releases.
2. Optionally give it hours to update in (for example 02:00 to 05:00, server time), so it never changes version while
   people work. Installing by hand from the Updates page is never held back.
3. Start a second installation beside it for trying versions first: the same image, its own port and its own data
   folder (`DATA_DIR`), with a recent backup of production restored into it (Settings → Backups). Mark it **Staging**.
4. Have releases published as *candidates*: add `"releaseChannel": "candidate"` to `package.json`. Each push is then a
   GitHub pre-release: staging installs it within its check interval, production does not.
5. When a candidate has run well on staging, **promote** it: GitHub → Actions → *release* → *Run workflow* → give its
   tag (for example `v1.105.0`). Production takes it at its next check, inside its hours.
6. An urgent fix: promote it at once, and install it by hand on production (Settings → Updates) if its hours are far.

Nothing of this changes an installation by itself: the mark and the hours are set by an Admin and recorded in the
audit log.

## Vulnerability estimate (Admins only)

Settings → Pricing → **Vulnerability estimate**. Internal: it is never in a report and no other role sees it.

For code that has only been counted (a cloc-fusion report, a git count), it estimates the findings a first scan would
report and their triage & remediation credits. It is drawn from this installation's own accounts: their projects'
lines of code against their open findings from Checkmarx One.

- **What your accounts say**: the findings per 1,000 lines across your accounts (low, typical, high: the 25th, 50th
  and 75th percentile), the new findings a month, and the test: each account predicted from the others and compared
  with what it really has. Read the test before quoting anything: it says how wide the spread really is.
- **An estimate** needs 8 accounts with 50,000 lines or more and a backlog from Checkmarx One. Until then, or for a
  customer your accounts do not resemble, type your own findings per 1,000 lines.
- Quote the range, not one number, and "typical" only where the customer has used a SAST tool before; an untouched
  codebase sits at the high end. The first scan replaces the estimate.
