# Changes made here, not yet in CxMissionZero

`scripts/sync-mz.mjs` copies MZ over these files; carry these into MZ first, or re-apply them after a sync.

- **Impact · Fusion is opt-in** (`countFusion`, off by default): `public/calculator/model.js` (IMPACT_DEFAULTS,
  impactSettings), `levers.js` (leverData), `page.js` (currentFusionImpact, the `calc-imp-fusion-on` switch),
  `public/index.html` (the switch, the assumptions folded in `calc-imp-fusion-box`).
- **Breach cost, beta**: breaches avoided × a share of the customer's ARR (10% by default) instead of IBM's average
  × a chance per finding. Off by default; asked before each report while Impact is on (`askBreach` in page.js); marked
  beta in the Impact tab, the report (report.js `.beta-tag`, `.beta-note`), the explanation (explain.js) and the slides.
- **Reports follow the command center's theme**: `public/look.js` registers its themes as file looks (`cc-aurora` …
  `cc-command`, Command Center in its chosen colour) and `reportLook` keeps the maker's light or dark for them;
  `page.js` `appLook()` hands them over when the page is the command center's (`html[data-cc]`). The HTML report,
  its live levers and the PDF summary all take it.
