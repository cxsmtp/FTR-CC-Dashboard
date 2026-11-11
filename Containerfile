# FTR Credits Command Center. Build:  podman build -t ftr-cc-dashboard .
# Run (HTTPS on 7443; choose your own host port on the left of -p):
#   podman run -d --name ftr-cc -p 7443:7443 -v ftr-cc-data:/data -e ADMIN_EMAIL=you@yourcompany.com --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true ftr-cc-dashboard
FROM docker.io/library/node:22-alpine
# git: Fusion · from Git counts code with it. tini: signals and zombie processes handled properly.
RUN apk add --no-cache git tini
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
# The app is read-only; everything it keeps lives in /data (one volume to back up).
RUN mkdir -p /data && chown node:node /data && chmod -R a-w /app
USER node
ENV NODE_ENV=production DATA_DIR=/data PORT=7443 HTTPS=on
EXPOSE 7443
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD ["node", "scripts/healthcheck.mjs"]
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/launch.js"]
