# Verified replay empty transport body fix evidence

## Production finding

- PR #400 exact reviewed head `683bf415d104d92f9c24ac335938c5d7d0907246` passed every executed hosted check and merged as `0d9de59c5c1126e2f441782e81fd44c05dc7eb63`.
- Reviewed and merged trees are both `c0e019a6949f0c67b8ffea27b7fd1c231127c810`.
- Supabase successfully deployed `verified_replay_probe` version 1 as `ACTIVE`.
- A real zero-byte POST returned `400 {"error":"Request body not allowed"}` rather than reaching the expected anonymous 401 boundary.

## Test-first record

- RED: the new explicit closed empty-stream case failed with expected 200, actual 400 while all 52 prior shared-wrapper tests passed.
- First GREEN implementation accepted the empty stream but correctly exposed that the old cancellation assertion assumed a pre-read closed stream; the test fixture was tightened to keep an actual unread body outstanding.
- GREEN: focused shared-wrapper tests pass with empty transport acceptance and rejection of non-empty streams.

## Fresh verification

- `deno test --allow-env supabase/functions/_shared/mod.test.ts`: PASS, 55 tests.
- `deno check supabase/functions/verified_replay_probe/index.ts`: PASS.
- `npm run check`: PASS.
- `npm run check:edge`: PASS, 310 tests.
- `npm run test:client`: PASS, 153 files and 1220 tests.
- `npm run build`: PASS.
- `npm run audit:deps`: PASS, 0 vulnerabilities.
- `git diff --check`: PASS.

## SMARTS decisions

- Inspect at most eight chunks with a 25 ms deadline per read: 9/10. This recognizes the hosted empty-stream representation while bounding adversarial work and refusing uncertain/slow input.
- Inspect only after the existing rate-limit gate: 10/10. Rejected payloads remain metered before any body work.
- Ignore `content-length` as proof of emptiness: 10/10. The decision comes from stream bytes, not client-controlled metadata.
- Keep the generic 400 response and contain read/cancel errors: 10/10. No payload or infrastructure detail is exposed.

## Scope

Only the shared no-body wrapper, its focused tests, and governance evidence change. No secret, dependency, migration, crypto, replay, persistence, or client behavior changes.

## Adversarial correction record

- Initial exact-diff review found one High merge blocker: read deadlines were bounded, but an adversarial stream whose cancellation never settles could still hold the unauthenticated request open indefinitely.
- Correction: both request-body and reader cancellation now settle through a rejection-contained 25 ms deadline. A causal test supplies a stream whose read and cancel promises never settle and requires the wrapper to return its generic 400 inside a 250 ms external deadline without invoking the handler.
