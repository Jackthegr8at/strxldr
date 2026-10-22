# STRX UI revamp — approved design

Goal: make staking analytics easy to scan and the leaderboard easy to reach. Preserve all calculations, resource ownership, URLs, data labels, source age, offline behavior and interactions.

Direction: a clean analytics dashboard, with STRX violet used deliberately for navigation, selection and key values. Light mode uses warm off-white surroundings and white surfaces; dark mode uses graphite surroundings and layered neutral surfaces. Avoid purple borders around every element, large empty cards and decorative animation. Use existing system typography with tabular numbers, strong readable headings and consistent muted text.

Composition:
- Compact brand/navigation header with direct Leaderboard and Bridge links, existing external links, theme and share actions. Keep accessible names and native modified-anchor behavior.
- Page heading/context + current primary action.
- Four headline metrics: Total Stakers, Total Staked (snapshot), Rewards Pool, STRX Price. Keep all other statistics in a compact supporting section below the primary leaderboard.
- Search, tier filters and ten-row semantic leaderboard close to the top. Preserve all tier identities/thresholds, toggles, columns, pagination, sort/query behavior and explorer links.
- Milestones, recent activity and new stakers below; distribution chart remains deferred and below the initial viewport. Use balanced section density and preserve stable geometry across loading/empty/error/ready states.
- Profile and bridge screens use the same shell, typography, surfaces and hierarchy; preserve every calculator/control/history behavior.

Responsive: 320/390/768/1440 widths; 2x2 primary metrics on phones, 4 across desktop. Compact tier filter grid/strip. Preserve usable labels, 44px targets for key controls, no document overflow; tables may scroll within a labelled container. No long decorative hero. No sidebar for only two primary routes.

Engineering: reuse React/Tailwind/SWR/Recharts, no new runtime dependencies/font downloads or network imagery. Semantic design tokens and authored component classes should replace conflicting utility overrides. Loading/unavailable/cached/Retry remain explicit. Keep chart/modal demand loading and worker behavior. Correctness, contrast and performance acceptance remain gates. Update test locators to stable semantic targets when document order changes; do not weaken behavior assertions.

Verification: typecheck/build/unit suites, rendered preservation/layout/contrast/route/worker tests, local cold performance matrix, screenshots both themes at mobile/tablet/desktop +320 edge. Synthetic data only. Review macro composition, density and contrast before final micro corrections. Publication and deployment require separate user instructions.
## Implemented layout decisions

- Headline metric cards reserve 132px; supporting cards 104px standard/160px market. Bridge metric rows reserve 192px to contain responsive price/change content without a fractional loaded-state expansion.
- Activity/milestone lists reserve 320px desktop/360px phone and use accessible internal scrolling; this deliberately trades bounded sparse-state whitespace for stable data arrival. Other profile empty states are concise.
- Primary metrics switch from 4 to 2 columns below 1024px. Phone tier controls form a horizontally scrollable native-button strip. Financial values retain their precision and do not break arbitrarily between digits.
- Transfer-history tables have a 720px minimum width in labelled scroll regions. The main table has stable column geometry and ten semantic rows, loading-only 600px reservation, compact empty results and wrapping pagination.
- Four route views are rendered in both themes at 320/390/768/1440. Existing selectors based on the last table were replaced with a stable leaderboard target after reordering. Behavioral assertions and CLS/byte gates remain intact.
