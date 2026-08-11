# Authenticated Lobby Identity Coherence - Sprint Evidence

## Test-first record

- RED identity run: 6 failures / 74 passes. Initial and later authenticated states did not populate online names; profile updates and sign-out had no provenance behavior; 21-character create/join names reached transport.
- RED visibility run: the HUD stylesheet lacked an explicit `.st-hud__victory-progression-handoff[hidden]` rule.
- GREEN focused run: 3 files / 80 tests passed after explicit name provenance, local length validation, and authored hidden-state CSS.

## Implemented boundary

- Account `profile.displayName` supplies presentation-only defaults for online create and join.
- User edits become authoritative for the form and survive account refresh or sign-out.
- Profile-derived values track profile refresh and clear on anonymous/unavailable state.
- Names over the existing 20-character online contract remain visible and fail locally without network traffic or silent truncation.
- The anonymous progression handoff is explicitly `display: none` while hidden.
- No Auth, JWT, seat-token, Edge, database, migration, dependency, progression, or gameplay-authority contract changed.

## Fresh verification

- Focused Lobby/HUD tests: 80/80 PASS.
- Typecheck: PASS.
- Pre-review full client: 156 files / 1,366 tests PASS.
- Edge: 310/310 PASS.
- Deterministic and static `npm run check`: PASS.
- Dependency audit: zero vulnerabilities.
- Production build: PASS.
- Rendered victory matrix: 6/6 across desktop-fine, pixel-touch, and small-window; hidden authenticated/default prompt and visible anonymous prompt both proved.
- `git diff --check`: PASS with line-ending conversion warnings only.

## Review state

T-01 through T-05 are accepted. T-06 is in progress pending exact-diff adversarial and auth-boundary review.

## First adversarial correction

Leibniz returned BLOCK with two High and one Medium merge-blocking findings. Two behavioral findings were reproduced before production correction: a browse-name edit stayed profile-derived and was overwritten by account refresh, and an `authenticated-error` transition retained the prior profile's display name. New RED tests failed 2/2 for those exact reasons. Browse now routes through the shared user-provenance setter, and any non-authenticated state clears only profile-derived presentation data while preserving user overrides.

Corrected exact-state verification is complete: focused Lobby/HUD 82/82 PASS; full client 156 files / 1,368 tests PASS; `npm run check` PASS; Edge 310/310 PASS; typecheck and production build PASS; dependency audit reports zero vulnerabilities; rendered victory matrix 6/6 PASS; `git diff --check` PASS with line-ending warnings only. The remaining audit-integrity blocker is addressed by reconciling these results here and in the append-only sprint log, then regenerating the complete tracked/untracked freeze for narrow exact-state re-review.

Leibniz independently reproduced the audit-reconciled tracked diff object, shortstat, complete untracked set, and all non-self-referential hashes. Final verdict: PASS with zero Critical, High, Medium, Low, or merge-blocking findings. Browse provenance, authenticated-error privacy, transport behavior, authorization separation, and victory-handoff behavior remained correct. T-06 is ACCEPTED and T-07 delivery is IN PROGRESS.

## Committed-head coverage correction

The PR coverage auditor held delivery after commit `f070ece436d1dead069d2b2b5a92047a8a4f9f5e` because four behaviors were not directly mutation-resistant: join-form override provenance, every non-authenticated account transition, the exact 20/24-character boundaries, and authenticated create/join requests without manual name input. The correction adds only tests; production behavior is unchanged.

- All four non-authenticated states now prove profile-derived data clears while user overrides survive.
- Create and join now prove the authenticated profile name reaches transport without name input.
- Join-form edits now prove refresh and sign-out cannot clobber user provenance before transport.
- Exactly 20 characters now prove transport acceptance; an exact 24-character profile remains visible and is rejected locally without fetch.
- Mutation proof changed both production guards from `> 20` to `>= 20`; the two exact-20 tests failed, then passed after restoration. `client/src/ui/Lobby.ts` has no correction diff.
- Corrected focused Lobby/HUD result: 92/92 PASS.

The coverage auditor reproduced exact correction diff object `4dff4ccb5206690f1196c24fbcb108ff404b196e` and returned PASS with zero Critical, High, Medium, Low, or merge-blocking findings. All four committed-head gaps are closed. Fresh corrected verification passed focused Lobby/HUD 92/92, full client 1,378/1,378, `npm run check`, Edge 310/310, typecheck and production build, zero-vulnerability dependency audit, and `git diff --check` with line-ending warnings only.
