# Quick Operations

**Initiative:** `career.initiative.0001`
**Status:** approved by the standing continuous-improvement authority
**Decision:** `career.operations.0001`

## Player outcome

Quick Duel stops being one repeatedly identical exhibition match. Before launch, a
player can choose a short Operations card with a clear battlefield identity and
then play it through the ordinary deterministic Hot Seat engine. The card tells
the player what changes and why it matters; it does not promise rewards,
progression, or an alternate authority path.

## Contract

- Provide exactly three curated cards plus the existing standard Quick Duel:
  **Crosswind Range** (wraparound walls and wind-aided ranging), **Caldera Run** (lava hazard
  terrain), and **Last Light Siege** (best-of-three with a bounded sudden-death
  turn).
- Each card is a pure, immutable `GameOptions` projection with a stable id,
  player-facing title, concise briefing, and authored world. The selected card
  fixes only existing option fields; it creates no action type, random stream,
  persistence row, reward, or entitlement.
- Quick Duel launches its existing human-versus-Medium-CPU flow using the selected
  projection. Standard remains the default and keeps its current configuration.
- The operation identity is visible in the pre-launch card, in-match ledger, and
  After Action Report. It is presentation derived from the local config and
  never contributes to an account claim or verified-deployment evidence.
- Online rooms, Local Battle, verified deployments, anonymous progression,
  network protocol, Edge functions, schema, and auth are byte-path unchanged in
  this delivery. The pure catalog is deliberately reusable by a later online
  operations slice.

## Determinism and safety

Every changed value is already read from `GameOptions` by `GameEngine`. The
catalog owns no RNG; the regular game seed remains the only terrain/wind source.
The test oracle must prove each card creates a deterministic engine clone/replay
identical to a direct construction with the same selected options and action
log. Unknown ids fail closed to Standard.

## Acceptance evidence

1. Unit RED/GREEN proves the exact card catalog, immutable option projections,
   unknown-id fallback, and deterministic replay parity.
2. Lobby/HUD RED/GREEN proves selection, launch wiring, visible operation
   identity, and absence from every excluded route.
3. Desktop, compact fine-pointer, and Pixel browser paths choose each card,
   launch a real Quick Duel, retain the identity through a shot/report, and
   prove fitted/no-scroll/44px touch geometry.
4. Existing client, engine, Edge, and full browser matrices remain green.
5. One adversarial review clears the exact staged package before commit; exact
   PR-head CI, CodeQL, Pages provenance, and a production Quick Operations
   launch complete delivery.
