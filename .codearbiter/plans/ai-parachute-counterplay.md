# Plan: AI Parachute counterplay

1. RED: add deterministic planner tests for affordable, unaffordable, and already-stocked Parachute decisions plus driver action ordering.
2. GREEN: extend the pure AI plan with an optional accessory purchase and forward it through the existing hot-seat buy contract before aim/fire.
3. Verify focused AI tests, full client/harness/typecheck/build/E2E/secret checks, adversarial package review, exact-head hosted checks, merge, and production health.

## SMARTS decision

The existing accessory contract and AI buy-to-restock seam make this a small player-facing extension with no trust-boundary or persistence change. Hard AI only is the narrowest behavior change that adds counterplay without destabilizing easy/medium tuning.
