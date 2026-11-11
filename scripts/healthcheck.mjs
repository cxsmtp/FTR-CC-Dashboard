// The container's health check: the server answers /healthz on its own port (https or http, a self-signed certificate is fine here).
import http from 'node:http';
import https from 'node:https';

const port = Number(process.env.PORT || 7443);
const tryOnce = (lib) =>
  new Promise((resolve) => {
    const req = lib.get({ host: '127.0.0.1', port, path: '/healthz', rejectUnauthorized: false, timeout: 4000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 || (res.statusCode >= 300 && res.statusCode < 400));
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => req.destroy());
  });
process.exit((await tryOnce(https)) || (await tryOnce(http)) ? 0 : 1);
