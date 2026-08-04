# Plan: keep the impact monitor visible on reduced-motion profiles

- [x] 1. Change the existing impact-monitor regression from suppression to visibility and run it RED against the current renderer.
- [x] 2. Remove only the `reduceMotion` early-return condition from `drawImpactMonitor`; retain all other reduced-motion gates.
- [x] 3. Run focused tests, full client/type/build/check/E2E gates, diff hygiene, and the state-free secret scan.
- [x] 4. Package the spec, plan, sprint log, tests, and final diff for adversarial review; resolve all Critical, High, and merge-blocking findings.
- [ ] 5. Deliver through an exact-head PR and verify hosted checks and Pages production smoke.
