# STRX UI revamp verification

Verified 2026-10-22. **PASS**: npm run test:local exited 0 after the final source changes. Typecheck/build, 28 unit tests, 41 browser tests and 42 cold performance runs pass, with zero failures, skips or TODOs. Exact local log: plan/audit-evidence/ui-revamp-final-gate.log.

## Delivered

Compact STRX navigation with active-route feedback; direct Leaderboard/Bridge links; four headline metrics; native tier filter buttons; ten-row semantic leaderboard before secondary analytics; supporting market metrics and balanced activity sections. Profile balances precede projection controls. Light and dark themes use semantic neutral surfaces, tabular numbers and restrained violet accents. All original financial calculations, resource hooks, cache/offline policies, URLs, filters, toggles, sharing and history traversal remain.

## Rendered and behavioral checks

- All four route views at 320,390,768,1440 pixels in both themes: 32 combinations, zero document overflow or contrast failures in the checked headings, financial metrics and neutral dark-background text. Home sort menu and native About dialog included. Market-label contrast improved from 2.22:1 to 4.95:1 in light mode.
- 27 cold homepage width/delay/repeat runs: maximum CLS 0. Ten nonzero-height rows, semantic layout, column alignment within 2px, empty/filter/page/amount states pass.
- Nine bridge width/delay cases: loaded geometry stable, history reachable, Next/Previous usable. Final full performance matrix maximum CLS 0.002371941 across all 42 runs.
- Native modal focus/inert background, keyboard restoration, both-theme persistence, account identity/simulation, exact tier/supply boundaries, explorer links, route ownership, API recovery, service-worker waiting/offline behavior and storage resilience pass.
- Initial critical homepage JS: 357269 raw / 115106 computed gzip bytes, below 550000/160000 budgets. Initial local image bodies: 3352 raw bytes. Removed floating desktop logo; no new dependencies/fonts/network imagery. Deferred chart/modal and background static precaching remain separately accounted in final/performance.json.

Evidence: plan/audit-evidence/theme-contrast/results.json and native viewport/full-page captures; phase7/cls.json and 54 captures; phase8/bridge-layout/cls.json; final/performance.json and 84 captures. Independent screenshot review corrected mobile table collisions, split financial values and zero-stake timing copy; no unresolved blocking visual defect in the reviewed corrected captures, qualitative 4/5. No computed rubric or full WCAG/field-performance conformance is claimed.

## Corrections found during verification

The initial JSX reorder accidentally inherited the chart's No Stake visibility condition onto the table; restored the always-mounted leaderboard and empty result. Bridge loaded card content expanded 0.22px; reserved 192px rows instead. Delayed visible rows/headers moved with data and pricing; explicit columns, 80px rows and a loading-only 600px reservation reduced homepage CLS to 0. Colored market text was then included in contrast acceptance and corrected for both themes. Exact financial values remain intact; tiny Free-tier thresholds retain six decimal places and unavailable zero-principal timing has explicit wording. Empty profile activity has concise messages.

Activity/milestone lists deliberately retain 320px desktop/360px mobile footprints to protect delayed-data stability. This leaves bounded whitespace for sparse data; all content scrolls accessibly. Transfer-history tables scroll internally at 720px minimum width; they do not compress text into overlapping cells. Main-table phone columns also scroll within a labelled region. Layout-sensitive tests use a stable leaderboard target instead of assuming it is the last table; behavior and performance assertions were retained.

## Scope and limits

Git diff whitespace check passes. Existing libraries, hooks, package files, APIs and service-worker source were not changed. Tests and the measurement script were updated for new document order and broader contrast coverage. Browser data is synthetic and external requests blocked. Production hosting, Safari, live API/field performance and external security auditing remain unrun. Verification was local; production deployment remains separate.
