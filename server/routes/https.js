import { validName } from '../../core/src/acme.js';
import { HSTS_AGES } from '../../core/src/https-manager.js';
import { fail } from '../store.js';

/**
 * Settings → HTTPS: the mode, certificates, requests and Let's Encrypt.
 *
 * Part of the app (server/app.js), which calls it with `d`: what the app holds (its stores, guards and helpers),
 * read when used. What is named at the top is there before this runs; the rest is read as `d.name` where it is used.
 */
export function registerHttps(d) {
  const {
    acme, config, httpsManager, LETSENCRYPT_DOMAIN, perm, r, record,
  } = d;
  // ---- HTTPS (Settings → HTTPS), as the calculator runs it ----------------------------------------------------------------
  const hostOf = (req) => String(req.headers.host ?? '').trim().toLowerCase();
  function httpsHosts(req, extra = []) {
    const hosts = new Set();
    const add = (value) => {
      const host = String(value ?? '').trim().toLowerCase().replace(/^\[(.*)\](:\d+)?$/, '$1').replace(/^([^:]+):\d+$/, '$1');
      if (host && host.length < 254 && /^[a-z0-9.:*-]+$/.test(host)) hosts.add(host);
    };
    add(hostOf(req));
    try {
      add(new URL(config.publicUrl).hostname);
    } catch {}
    for (const host of Array.isArray(extra) ? extra.slice(0, 10) : []) add(host);
    return [...hosts];
  }
  const acmeView = (req) => ({ ...acme.status(), suggested: httpsHosts(req).filter(validName), fromEnvironment: LETSENCRYPT_DOMAIN });
  const httpsStatus = async (req) => {
    const host = hostOf(req) || `localhost:${config.port}`;
    return { ...(await httpsManager.status(httpsHosts(req))), viewing: { secure: Boolean(req.socket.encrypted), host, httpUrl: `http://${host}`, httpsUrl: `https://${host}` }, hstsAges: HSTS_AGES, acme: acmeView(req), publicUrl: config.publicUrl };
  };
  const tlsPerm = perm('security.https');
  r('GET', '/api/https', tlsPerm, (req) => httpsStatus(req));
  r('POST', '/api/https/inspect', tlsPerm, (req, ctx, body) => httpsManager.inspect({ files: body?.files, passphrase: String(body?.passphrase ?? ''), hosts: httpsHosts(req, body?.hosts) }));
  r('POST', '/api/https/certificate', tlsPerm, async (req, ctx, body) => {
    const report = await httpsManager.install({ files: body?.files, passphrase: String(body?.passphrase ?? ''), hosts: httpsHosts(req, body?.hosts), confirm: Boolean(body?.confirm), by: ctx.user.email });
    record(ctx, req, 'https.certificate', report.summary.subject, { names: report.summary.names, issuer: report.summary.issuer, validTo: report.summary.validTo, fingerprint: report.summary.fingerprint });
    return { report, status: await httpsStatus(req) };
  });
  r('POST', '/api/https/certificate/previous', tlsPerm, async (req, ctx) => {
    httpsManager.restorePrevious({ by: ctx.user.email });
    record(ctx, req, 'https.certificate.previous');
    return httpsStatus(req);
  });
  r('DELETE', '/api/https/certificate', tlsPerm, async (req, ctx, body, res, url) => {
    const fallback = httpsManager.removeUploaded({ confirm: url.searchParams.get('confirm') === '1', by: ctx.user.email });
    record(ctx, req, 'https.certificate.remove', '', { fallback });
    return httpsStatus(req);
  });
  r('POST', '/api/https/self-signed', tlsPerm, async (req, ctx, body) => {
    httpsManager.selfSign({ names: Array.isArray(body?.names) ? body.names : [], by: ctx.user.email });
    record(ctx, req, 'https.selfSigned', '', { names: body?.names });
    return httpsStatus(req);
  });
  r('POST', '/api/https/request', tlsPerm, async (req, ctx, body) => {
    const csr = httpsManager.createRequest({ names: Array.isArray(body?.names) ? body.names : httpsHosts(req), organization: body?.organization ?? '', by: ctx.user.email });
    record(ctx, req, 'https.request', '', { names: body?.names });
    return { csr, status: await httpsStatus(req) };
  });
  r('GET', '/api/https/request.csr', tlsPerm, () => {
    const csr = httpsManager.requestCsr();
    if (!csr) throw fail(404, 'No certificate request has been made here.');
    return { download: csr, name: 'command-center.csr', type: 'application/pkcs10' };
  });
  r('POST', '/api/https/mode', tlsPerm, async (req, ctx, body) => {
    const from = httpsManager.mode;
    httpsManager.setMode(String(body?.mode ?? ''), { secure: Boolean(req.socket.encrypted), confirm: Boolean(body?.confirm), by: ctx.user.email });
    record(ctx, req, 'https.mode', `${from} → ${httpsManager.mode}`);
    return httpsStatus(req);
  });
  r('POST', '/api/https/hardening', tlsPerm, async (req, ctx, body) => {
    httpsManager.setHardening({ ...(body?.hsts ? { hsts: body.hsts } : {}), ...(body?.minVersion ? { minVersion: body.minVersion } : {}) }, { by: ctx.user.email });
    record(ctx, req, 'https.hardening', '', { hsts: body?.hsts, minVersion: body?.minVersion });
    return httpsStatus(req);
  });
  r('POST', '/api/https/browser-check', tlsPerm, async (req, ctx, body) => {
    httpsManager.recordBrowserCheck({ ok: body?.ok, url: body?.url, by: ctx.user.email });
    return { ok: true };
  });
  r('GET', '/api/https/acme', tlsPerm, (req) => acmeView(req));
  r('POST', '/api/https/acme', tlsPerm, (req, ctx, body) => {
    acme.start({ names: body?.names, email: body?.email, staging: body?.staging === true, agree: body?.agree === true, skipPrecheck: body?.skipPrecheck === true, by: ctx.user.email });
    record(ctx, req, 'https.letsencrypt.request', acme.status().last?.names?.join(', ') ?? '', { staging: body?.staging === true });
    return acmeView(req);
  });
  r('POST', '/api/https/acme/renew', tlsPerm, (req, ctx) => {
    acme.renew({ by: ctx.user.email });
    record(ctx, req, 'https.letsencrypt.renew');
    return acmeView(req);
  });
  r('DELETE', '/api/https/acme', tlsPerm, (req, ctx) => {
    acme.disable();
    record(ctx, req, 'https.letsencrypt.off');
    return acmeView(req);
  });

  return { hostOf };
}
