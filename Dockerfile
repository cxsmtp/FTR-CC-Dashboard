# FTR Credits Command Center: no dependencies beyond Node.js and git (git counts code for Fusion · from Git).
FROM node:22-alpine
RUN apk add --no-cache git tini && addgroup -S cc && adduser -S cc -G cc
WORKDIR /app
COPY --chown=cc:cc . .
RUN mkdir -p /data && chown cc:cc /data
USER cc
ENV NODE_ENV=production DATA_DIR=/data PORT=8443 HTTPS=on
EXPOSE 8443
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD wget --no-check-certificate -qO- https://127.0.0.1:8443/healthz || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/launch.js"]
