# P04 tactical challenge verification

Observed 2026-09-13. Integrated source base `36003c0`.
Worker: gpt-5.6-terra/high. Independent reviewer: gpt-5.6-sol/high.
Parent owns integration, browser execution, and publication.

Crosswind Range asks for CPU damage within three human salvos. Caldera Run
requires a net opening displacement of 16 pixels and damage on the first
human salvo. Lean Arsenal asks for a best-of-three win with Level 0 restocks;
the ordinary opening inventory and 8,000 credits remain intact. All three
version-2 challenges use the proven seed 42 and remain practice-only.

The practice observer takes primitive snapshots before accepted human fire,
then records credited opponent damage after that shot settles. CPU actions,
rejected input, self damage, and environmental damage cannot satisfy it.
Last Light version 1, First Salvo, the verified three-entry rotation, engine,
backend, rewards, and network protocols retain their existing behavior.

## Legal action proof

`docs/feasibility/p04-tactical-challenges-v1.json` retains nine legal engine
transcripts: direct and wrap Crosswind hits, advance and retreat Caldera hits,
early-kit and conserved-kit Lean Arsenal wins, and three deliberate misses or
losses. Every trace is replayed through the production practice observer and
Field Order reducer. All expected outcomes and accepted-action assertions pass.
The receipt binds its base revision and 26 normalized UTF-8/LF SHA-256 source
and configuration fingerprints; independent review recomputed all 26 without
a mismatch. These hashes identify source, not authentication or game authority.

Run:
`npx --no-install tsx --tsconfig client/tsconfig.json scripts/feasibility/p04TacticalChallengeFeasibility.ts`.
The earlier invocation without the explicit tsconfig failed import resolution
and provides no product evidence. The original success-only receipt is retained
in the parent temporary evidence directory; the final receipt includes misses.

## Verification results

- Full client suite: 209 files, 1,958 tests PASS.
- Focused final objective and lifecycle boundaries: 100 tests PASS.
- Earlier integrated coverage: 94.02% lines, 83.88% branches; 1,953 tests PASS
  before five additional boundary tests were added.
- `npm run check`: PASS, including deterministic engine harnesses.
- `npm run build`: PASS, including shared/client strict type checks.
- Tactical challenge and Quick Duel browser suites: 30 PASS, no retries.
- Independent implementation, coverage, security, and auth/crypto reviews: PASS.

The nine tactical browser cases use real controls and accepted human shots:
Crosswind succeeds, Caldera succeeds after two movement inputs, and Caldera
misses without movement, on desktop, Pixel landscape, and small-window profiles.
The parent inspected all nine result captures: objective text remains visible,
wrapped, and contained. The other 21 cases cover operation launches, a real
shot, and the separately identified synthetic Last Light terminal fixture.
Lean Arsenal's full-match proof is engine execution, not a natural browser match.

Build and preview both used `VITE_BASE=/singedTerra/`. The sole preview listener
was PID 79904 at `http://127.0.0.1:5198/singedTerra/`. All 60 served files matched
the built files. Inventory SHA-256:
`d0fbca1ce125f0294b689f66683d962693c5f5a99d40cbbe3d6b85df3830c3c0`.
Browser execution denied external network access and used the synthetic
loopback backend origin. No production backend was contacted.

Raw logs are retained in the parent's temporary directory as
`product-v2-p04-final-client.log`, `product-v2-p04-check-final.log`,
`product-v2-p04-build.log`, `product-v2-p04-browser.log`,
`product-v2-p04-runtime-receipts-final.log`, and
`product-v2-p04-preview-binding.json`; browser images remain in `test-results/`.

## Limits and delivery

These results establish legal completion, bounded failure, and rendered client
behavior. Human understanding, tactical choice, retry interest, and physical
device usability require the separate consented study and device passes.
No reward-policy approval is inferred. Current checks precede final integration
with the corrected First Salvo browser oracles and later campaign branches.
Publication and final integration evidence will be recorded separately.

The clean merge of corrected P02 `990efa9` leaves all P04 production bytes
unchanged. The inherited entry test now expects five secondary operation cards,
including Lean Arsenal; First Salvo retains its primary entry. Independent
Sol/high integration review passed. The full pre-game browser suite passed
20 cases with one existing profile skip against the same bound P04 artifact.
The P02 anonymous seed-receipt opener and settled victory-animation measurement
were retained. Main's squash `c25baa4` is tree-identical to `990efa9`.
