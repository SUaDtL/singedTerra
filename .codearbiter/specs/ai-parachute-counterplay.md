# Spec: AI Parachute counterplay

## Outcome

Hard AI can deterministically buy one Parachute through the existing accessory buy action when the purchase is affordable and terrain-collapse risk makes it valuable, then continue its ordinary planned turn.

## Acceptance criteria

1. The planner remains pure and deterministic for identical state, seed, difficulty, and gravity.
2. A selected Parachute purchase is represented by the existing `buy` action shape and does not add a network action kind.
3. Easy and medium AI behavior remains unchanged; hard AI never buys when unaffordable or already stocked.
4. The hot-seat driver forwards the accessory purchase before the ordinary weapon aim/fire sequence.
5. Existing AI, deterministic, typecheck, client, Edge, build, and E2E checks remain green.

## Boundaries

Only `shared/src/engine/AI.ts`, the hot-seat AI driver, and AI tests/harnesses plus governance artifacts. No Edge authorization, schema, migration, dependency, secret, or auth changes.
