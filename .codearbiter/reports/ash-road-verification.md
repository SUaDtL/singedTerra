# Ash Road T-42 verification receipt

Status: ACCEPTED after correcting the sole ASTRA review findings. This is machine verification, not owner playtest, release, deployment, or physical-device acceptance.

## Fresh full gates

- `npm run typecheck` — PASS for shared and client.
- `npm run check` — PASS, including the complete deterministic engine suite, retained verified-challenge artifact and workload checks, backend release manifest validation, ST1 compatibility, and CPU policy corpora.
- `npm -w @singedterra/client run test -- --maxWorkers=1` — PASS: 248 files, 2,316 tests.
- `npm run check:edge` — PASS: 476 tests.
- `npm run build` — PASS: Vite production build, 2,789 modules transformed.
- `npm -w @singedterra/client exec vitest run src/assets/campaign/manifest.test.ts` — PASS: the six campaign assets remain hash-bound to their manifest and provenance record.
- All 18 `scripts/checks/campaign_*.mjs` harnesses — PASS through the source TypeScript runner, including both branches and a zero-start-supplies guaranteed-kit journey to the natural finale.
- `npx playwright test e2e/campaign-accessibility.spec.ts e2e/campaign-episode.spec.ts e2e/campaign-fuel-stop.spec.ts --workers=1` — PASS: 17 applicable cases and 4 intentional project-specific skips across desktop, Pixel touch, and small-window projects in 10.6 minutes.

The pre-review client run was launched concurrently with other CPU-heavy full gates and one CampaignClient timer case exceeded its bound. Its focused file immediately passed, and serial full client runs passed before and after the review corrections; the latest result is 2,314 tests. The serial result is the acceptance evidence; the resource-contention timeout is not concealed or represented as a product failure.

## Corrective coverage closed before acceptance

- Warning response discovery now certifies only causal movement or an available shield; it no longer treats an unproven source shot as automatically safe.
- A real source-engine route starts with zero supplies, uses only the guaranteed selected kit plus earned checkpoint economy, and reaches Relay Ridge's natural finale.
- The keyboard-only browser journey now performs the route choice, retain decision, and continue action through focused controls.
- IndexedDB request and transaction error paths reject and abort in focused tests.
- All four campaign audio cues bind to distinct, bounded production WebAudio profiles.
- The presentation contract now includes checkpoint fields plus route, service, and continue intents.

## Identity and bounded performance

- Backend `shared/src` digest: `96116f758eb485b730a7556e576955c24b55a69d72cf5361a5897b362b1d06d6`; backend release suite PASS 46/46 and manifest validation PASS.
- ST1 compatibility: PASS for all 32 bound sources; membership and enforcement are unchanged.
- Current build-input SHA-256: `d13f73573f9255281855eed39e2cc67249e059e0e49d215f7b56a8edb2baaeb7`.
- Current production artifact SHA-256: `219b924273b2ec24394ec80b24c544a9890ccff1c7430676e3f1c8eedbc2c9fa`.
- Source/revision/build/artifact binding: `49bffbfaaaf97d254d8ea02651ccb0fb33bb2cb1772a00ae47cbc508695ec122`.
- Production bundle: 12,259,336 bytes, +292,591 bytes over the exact `origin/main` baseline.
- Named-desktop campaign AI: p95 12.00 ms against the provisional 50 ms target; source construction to first controllable state p95 2.31 ms.

## Explicitly pending outside machine acceptance

- Physical-phone planning p95 and frame-stall observation.
- Named-browser cold/warm-cache time-to-first-controllable comparison.
- Listening-room audio and subjective art acceptance.
- A real owner/player session.

These pending items remain owner/device evidence and are not inferred from unit tests, emulation, screenshots, or bundle inspection.
