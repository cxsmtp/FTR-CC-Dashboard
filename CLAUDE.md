# Working on the FTR Credits Command Center

Rules from the owner, for every change:

- **No update may ever need a server restart.** Versions change by handover (server/launch.js holds the port; the
  running version drains and hands over its in-memory state; the new one takes the connections). Anything new that
  lives only in memory must be handed over (`handoff()` / `adopt()` in server/app.js and server/calculator.js), and
  nothing may require stopping the container or the launcher to take effect.
- Updates are checked every 15 minutes and verified against checksums kept on first sight (server/updates.js).
- Every action is recorded in the audit log.
- No "What is new" pop-up: release notes live on the About page only.
- Every table can be sorted low to high and back, and filtered by each column with a multi-select (public/app.js
  `enhanceTable`, applied to every table with a header). New tables need a `<thead>`; use `data-sort` / `data-v` on
  cells whose text is not what they should sort or filter by.
- Every page keeps the work being done: settings save by themselves ("Changes save as you type") and go back to the
  last known good setting when a new one does not work; anything typed into any other form is kept as it is typed
  (public/app.js drafts) until the form is sent.
- Terms of use, the licence and the user guide open in the app (the reading overlay), never as a bare file.
- Run `npm test` before pushing.
