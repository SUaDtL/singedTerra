# Ash Road owner playtest handoff

Status: ready for owner playtest. This is not a claim of owner acceptance, physical-device acceptance, release, deployment, or production publication.

## Start here

- Local production preview: `http://localhost:4173/` (IPv6 loopback listener on `::1:4173`).
- In Command Preparation, choose one of the three Ash Road loadouts and select **Start Ash Road**. Use **Resume Ash Road** to continue the retained device-local run.
- Draft review surface: GitHub PR #514, branch `codex/ash-road-chapter-one-current`.

## What to probe

1. Fuel Stop: try preserving both drums, then retry and intentionally detonate one. Confirm the refinery condition and supply difference are understandable.
2. Choose High Road or Salvage Pit, make one checkpoint service decision, and confirm the carried kit changes the next encounter.
3. In High Road, respond to the announced strike by movement, shield, relay destruction, or early elimination.
4. Reach Relay Ridge with a substantially different kit on a second run and confirm the relay/siege choices read differently.
5. Reload during a committed shot, resume, and confirm the action is neither lost nor duplicated.
6. If hull is below 60 after a success, use the explicitly free emergency patch and confirm the next encounter starts at 60 hull.

## Machine and visual evidence

- `npm run check` — PASS.
- `npm run test:client` — PASS, 249 files / 2,322 tests.
- `npm run check:edge` — PASS, 476 tests.
- `npm run build` — PASS, 2,790 modules transformed.
- All 18 `scripts/checks/campaign_*.mjs` source harnesses — PASS with the client tsconfig path mapping.
- Campaign browser matrix — PASS, 17 applicable cases with 4 intentional project-specific skips across desktop, Pixel touch, and small-window projects, serialized in 10.7 minutes.
- Backend release manifest — PASS, 46/46; manifest receipt `f92a4382bf07daf4b048d4591cac521665d1adb4f9abdc6e9aed84de3b3b3720`.
- ST1 compatibility — PASS, all 32 bound sources.
- Exact current source/artifact/binding identities: `c0cfc5dfb0eb00ff5bc999162af3b83144a4dbf24486e15f630ab7c09ba7f753`, `853fc11c7b5b0d30390762a796194364bdb60a2edc2cbc4d6e60364a98353953`, `0179abb38962cf72794b06cc5821578729cb4a26f913042343008867f5536d95`.
- Live visual inspection: the active campaign uses the existing ornate Match instrument as a readable Mission ledger; the aiming field and recoil-safe command deck contain no objective ribbon. Pump/refinery and relay art meet their canonical terrain support line using measured opaque footprints, and embedded black padding is absent. Desktop, Pixel landscape, and small-window browser journeys report no page overflow; portrait retains the existing rotation gate.

## Honest pending evidence

- Human comprehension and preference observations, including the proposed five-new-player formative session.
- Real-phone planning p95 and frame-stall observation.
- Named-browser cold/warm time-to-first-controllable comparison.
- Listening-room assessment of the four campaign cues.
- Subjective owner acceptance of final art and balance.

## Low-confidence decisions worth challenging

- The Mission ledger intentionally shows only the current objective, progress, imminent warning, and mechanically relevant protected/threat objects. Supplies and lower-priority telemetry stay at checkpoints rather than competing with fire controls.
- The free patch restores to 60 only after a successful encounter and cannot be applied twice to one attempt.
- Campaign Napalm zones remain supported but are not enabled merely to claim feature use; retained campaign paths currently observe zero live zones.
- Desktop AI planning and source construction clear provisional budgets, but device-level rendering conclusions are deliberately not inferred from desktop or emulation.

## Rollback

Disable the explicit Ash Road entry and return to the last tested ordinary-game artifact. Retain the versioned IndexedDB save and its content/profile metadata; do not delete local progress or reuse a version for different rules. No database rollback or backend deployment is involved.
