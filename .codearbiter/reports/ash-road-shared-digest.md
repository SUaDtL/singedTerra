# Ash Road shared digest refresh

Status: backend manifest compatibility proof after the intentional Chapter One shared-engine changes.

## Digest

- Previous `verifiedReplayShared.sha256`: `4a8918572bfcc6cb428bdb07cc61834b832856f9647460d9798f523be15cf1b9`
- Current `shared/src` digest: `dccd6d715f90d764a6acc0191aec3d0438b48a1e8e2109e2156729962564e335`
- Manifest receipt SHA-256: `4bc2368b32ccc616ac8a277c2f86f64de297a23e59d62d5b03a693b3223defd6`

Only `verifiedReplayShared.sha256` changed in `supabase/backend-release-manifest.json`. Configuration, function-shared sources, migrations, Edge Functions, and declared compatibility remain byte-identical to `origin/main`.

The separate ST1 compatibility manifest was also refreshed for its nine intentionally changed, already-bound inputs (`createModeClient`, input capabilities, mode config, main, Lobby, `GameEngine`, Movement, Physics, and `GameState`) and given the reviewed disposition `ash-road-campaign-isolation-and-ordinary-parity-reviewed`. Its membership is unchanged; the ordinary-mode parity and protected challenge suites are the behavioral evidence for that disposition.

## Verification

`npm run backend:release:check` passed all 46 checks and manifest validation with Supabase CLI `2.105.0`.

- Migration-set digest: `79d25223f9630ba3c2696723ce2f2fd96c8064763234b939dd8873649f722f35`
- Function-set digest: `c75408aae31a1878d051e9e5c8f12a8f2817f7501b555dbf24e6311690b10724`

The changed shared surface is the campaign integration in `GameEngine`, `Movement`, `Physics`, and `GameState`, plus the new `shared/src/campaign` modules. The digest update records those reviewed deterministic-source changes; it does not claim a backend deployment or alter a backend contract.
