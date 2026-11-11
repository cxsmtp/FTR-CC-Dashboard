# Working on the FTR Credits Command Center

Rules from the owner, for every change:

- **No update may ever need a server restart.** Versions change by handover (server/launch.js holds the port; the
  running version drains and hands over its in-memory state; the new one takes the connections). Anything new that
  lives only in memory must be handed over (`handoff()` / `adopt()` in server/app.js and server/calculator.js), and
  nothing may require stopping the container or the launcher to take effect.
- **It is in production: an update never changes the instance.** People, roles given, teams, accounts, reports, sales,
  settings, themes and anything an Admin or a person set stay exactly as they are. Something new only fills a gap where
  nothing is set yet (a new default, a new built-in role); data changes only when someone changes it on a page.
- Updates are checked every 15 minutes and verified against checksums kept on first sight (server/updates.js).
- Every action is recorded in the audit log.
- No "What is new" pop-up: release notes live on the About page only.
- Every table can be sorted low to high and back, and filtered by each column with a multi-select (public/js/widgets.js
  `enhanceTable`, applied to every table with a header). New tables need a `<thead>`; use `data-sort` / `data-v` on
  cells whose text is not what they should sort or filter by.
- Every page keeps the work being done: settings save by themselves ("Changes save as you type") and go back to the
  last known good setting when a new one does not work; anything typed into any other form is kept as it is typed
  (public/js/widgets.js drafts) until the form is sent.
- Terms of use, the licence and the user guide open in the app (the reading overlay), never as a bare file.
- Run `npm test` before pushing.
- The calculator's code (core/) is this product's own: change it in place. Nothing is synced in from another product.
- Two looks: Standard (public/standard.css, the one design system: one accent, plain surfaces, no gradients) and
  Command Center. New screens are built for Standard first and must not bring back gradients, glass or glow there.
- The menu is Overview, Accounts, Calculator and Settings; anything else goes under Settings (public/js/shell.js
  `settingsNav`).
- The dashboard's code is one module per page in public/js/ (main.js is the router; core.js the shared helpers;
  shell.js the frame and menus; widgets.js tables, multi-selects and drafts). Add a page as its own file.
