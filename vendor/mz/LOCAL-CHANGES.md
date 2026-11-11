# Changes made here, not yet in CxMissionZero

`scripts/sync-mz.mjs` copies MZ over these files; carry these into MZ first, or re-apply them after a sync.

- **Impact · Fusion is opt-in** (`countFusion`, off by default): `public/calculator/model.js` (IMPACT_DEFAULTS,
  impactSettings), `levers.js` (leverData), `page.js` (currentFusionImpact, the `calc-imp-fusion-on` switch),
  `public/index.html` (the switch, the assumptions folded in `calc-imp-fusion-box`).
- **Breach cost, beta**: breaches avoided × a share of the customer's ARR (10% by default) instead of IBM's average
  × a chance per finding. Off by default; asked before each report while Impact is on (`askBreach` in page.js); marked
  beta in the Impact tab, the report (report.js `.beta-tag`, `.beta-note`), the explanation (explain.js) and the slides.
