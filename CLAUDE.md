# Working on the FTR Credits Command Center

Rules from the owner, for every change:

- **No update may ever need a server restart.** Versions change by handover (server/launch.js holds the port; the
  running version drains and hands over its in-memory state; the new one takes the connections). Anything new that
  lives only in memory must be handed over (`handoff()` / `adopt()` in server/app.js and server/calculator.js), and
  nothing may require stopping the container or the launcher to take effect.
- Updates are checked every 15 minutes and verified against checksums kept on first sight (server/updates.js).
- Every action is recorded in the audit log.
- No "What is new" pop-up: release notes live on the About page only.
- Run `npm test` before pushing.
