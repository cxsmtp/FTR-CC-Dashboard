# FTR Credits Command Center: admin and hosting guide

Everything under **Settings** is for the **Admin** role only. HTTPS, single sign-on, updates, backups and settings can never be given to another role, not even to a leader's (the server refuses).

## Run it

```
cp .env.example .env      # set ADMIN_EMAIL and PUBLIC_URL (the https address people use)
npm ci --omit=dev
npm start                 # the launcher: starts the version chosen under Settings → Updates and keeps it running
```

With Docker: `docker compose up -d --build`. Port 8443 inside answers both https and http (http is redirected).

On the first start the Admin is created. Their one-time password is in `DATA_DIR/initial-admin-password.txt`, and the file is deleted once they choose their own. Locked out? Run `node scripts/reset-admin.mjs you@yourcompany.com`.

## Settings → HTTPS (from CxMissionZero)

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
  2. the launcher starts the new version on trial;
  3. if it does not come up within 150 s (`UPDATE_START_TIMEOUT_SECONDS`), or stops within 2 minutes, it is **rolled back by itself** to the version before. It is marked failed and never installed automatically again.
- **Roll back** to the built-in version or to any installed one, with **Switch to**.
- **Auto-update** (off by default) checks every 15 minutes and installs a newer release at the hour you choose.
- **Restart the server** restarts it under the launcher.

Making a release: bump `version` in package.json, add the CHANGELOG entry, and tag `v<version>`. The release workflow runs the tests, builds the archive (`scripts/make-release.mjs`) and publishes it. Behind a company proxy, set `HTTPS_PROXY`; the launcher sends the server's own calls through it.

## Settings → Backups & health

- **Backups:** nightly, before every version switch, and **Back up now**. They hold everything except the versions folder. The newest 14 are kept in `DATA_DIR/backups`. Set `BACKUP_PASSPHRASE` to seal them (AES-256-GCM); keep the passphrase safe.
- **Restore:** choose a backup file. It is checked, then a backup of what is there now is taken, then it is restored and the server restarts.
- **Audit log:** each event is chained to the one before by SHA-256. **Health** shows whether the chain is intact, or where it breaks. The log can be exported as CSV.
- **Troubleshooting report:** versions, health, settings in force, update events, backups and recent errors. It holds no secrets, keys or customer data.

## Settings → General and Roles

- **General:** the organisation name on reports, the default theme for everyone, and the Salesforce, Checkmarx One and git hosts the server may call. Addresses inside the network are never called.
- **Roles:** custom roles. Nobody can give permissions they do not hold, and the Admin-only ones cannot be given at all.
