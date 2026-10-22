# STRX Staking Leaderboard

STRX staking leaderboard built with React 19, TypeScript, SWR, and Vite. Data refreshes periodically; displayed balances and illustrative staking projections depend on the available source data.

## Routes

- `/`: leaderboard, search, tier filters, sorting, ten-row pagination, statistics, and activity.
- `/?user=<username>`: an account profile, including accounts without a snapshot stake.
- `/bridge`: bridge balance, market information, and paginated transfer history.

Leaderboard URLs preserve `q`, `tier`, and `sort`, including browser Back/Forward navigation. Themes, amount toggles, and sharing remain available.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_XPR_ENDPOINT` | XPR Network API base URL | `https://proton.eosusa.io` |

Create a `.env.local` file in the project root to override defaults:

```dotenv
VITE_XPR_ENDPOINT=https://your-custom-endpoint.example.com
```

Vite exposes `VITE_` variables to the browser. Keep credentials out of them.

## Development and builds

Use a Node.js runtime with native TypeScript type stripping for the local unit tests; these checks were verified with Node 24.11.1. Install the lockfile dependencies without lifecycle scripts or automatic advisory requests:

```sh
npm ci --no-audit --no-fund --ignore-scripts
npm run dev
```

`npm start` is an alias for the Vite development server at [http://localhost:3000](http://localhost:3000). Configuration lives in `vite.config.mts`.

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | TypeScript checks without emitting files |
| `npm run build` | Production output in `build/`, Vite manifest, then Workbox service-worker generation |
| `npm run check` | Typecheck and production build |
| `npm run preview` | Serve the existing production build locally |
| `npm run test:unit` | Node unit tests, including local build/hosting configuration checks |
| `npm run test:browser` | Synthetic browser acceptance against loopback build servers |
| `npm run perf:local` | Final cold fixture matrix, byte/CLS gates, and performance diagnostics |
| `npm run test:local` | Check, unit tests, browser tests, then diagnostics |

Build before tests that inspect generated assets or start the local production server. The runner also accepts `node scripts/run-local-tests.mjs unit --phase 7` and `node scripts/run-local-tests.mjs browser --phase 7`; omit `--phase` for all applicable tests. Baseline observation is a separate `baseline` mode and does not assert fixes.

Browser checks require the pinned Playwright 1.62.1 package and an already installed compatible Chromium executable. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when Chromium is outside Playwright's default installation. Replace the example path with your installed executable:

```powershell
$env:PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = 'C:/browsers/chromium/chrome-headless-shell.exe'
npm run test:browser
```

A missing browser or unavailable loopback port is an unrun check. Tests do not silently download a browser or kill another process. Browser fixtures intercept API responses and block unexpected external requests before network access. Generated logs, JSON measurements, and screenshots live under the ignored `plan/audit-evidence/` directory. Hosting rewrite tests simulate checked-in Vercel patterns locally; they do not verify a deployed Vercel site.

## Freshness and refresh intervals

SWR owns API caching. A successful network response records `fetchedAt`, the retrieval time used for the five-minute persisted-cache TTL. Snapshot `lastModified` is a separate source-publication timestamp parsed from Last-Modified; it can be `null`. Unknown source age is labelled unavailable and cannot be used as a transaction-reconciliation cutoff. Retrieval time never substitutes for source age.

Only validated shared resources persist. Account-specific history, balances, and pagination are excluded from persisted shared caching. Closing a page does not renew timestamps, and entries at least 300000 ms old do not restore. Valid restored content is labelled cached; failed revalidation preserves usable cached data with a Retry action. Missing financial data has an explicit unavailable/error state rather than an invented zero balance.

| Mounted resource | Refresh interval |
|------------------|------------------|
| Snapshot and new stakers | 120000 ms |
| Config, prices, rewards pool, shared balances, and market data | 300000 ms |
| Leaderboard recent actions | 30000 ms |
| Account actions and account balances | 60000 ms |
| Bridge history head | 120000 ms |
| Previously loaded historic bridge pages | No polling |

Resources belong to the active route. SWR deduplicates requests for 2000 ms, with three automatic retries at a 5000 ms base interval. API deadlines cover both fetching and JSON body parsing for 10000 ms. Browser visibility and connectivity can affect when polling runs.

## Installed offline behavior

The service worker registers after document load and browser idle, with a maximum 5000 ms scheduling delay. Installation precaches the shell and all static route chunks, including deferred route/chart code. This preserves installed offline navigation after complete precaching; it also means first installation still transfers those static chunks in the background.

API GETs use NetworkOnly; API POSTs are not cached by the worker. Offline API content is limited to valid persisted shared resources and data already held in the current session. Unavailable or expired data exposes an explicit state and Retry. First installation and update discovery do not automatically reload an active document. Updates wait for old controlled tabs to close naturally; unrelated origin caches are retained.

## Interpreting verification

Local acceptance uses synthetic data, not live financial or production API checks. CLS runs cover 390 x 844, 768 x 1024, and 1440 x 1000 with delayed responses, cold contexts, shift sources, and native-scale screenshots. Local CDP diagnostics use 4x CPU slowdown and 150 ms latency / 1.6 Mbps download. Their LCP candidates, long tasks, interaction samples, bytes, requests, and CLS describe those fixtures on that machine; they do not establish field INP, production Core Web Vitals, actual API latency, or a production speed improvement.

Critical/demand-loaded JavaScript and service-worker background downloads are reported separately. The chart is eligible near the viewport; About loads its native dialog when opened. Full static precaching still includes both.

Dependency advisory scanning is optional and separate from local acceptance. `npm audit` sends dependency metadata to `registry.npmjs.org` and requires explicit authorization for that disclosure. It has not been authorized by running these local checks. Do not interpret passing tests as a vulnerability-free claim or authorization to publish/deploy.

## Stack

The current package ranges are React/React DOM 19.2.8, TypeScript 7.0.2, Vite 8.2.2, SWR 2.5.1, Tailwind CSS 4.3.3, Recharts 3.10.1, and Workbox 7.4.1. Playwright is pinned exactly to 1.62.1 for development-only browser verification; `package-lock.json` records resolved dependencies.
