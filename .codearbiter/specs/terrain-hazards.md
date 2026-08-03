# Deterministic Terrain Hazards Specification

## Goal

Add an opt-in lava hazard mode that makes selected terrain pools lethal while preserving the seed-plus-action deterministic lockstep contract.

## Acceptance criteria

1. `GameOptions.hazards` normalizes to `none` or `lava`; omitted and malformed values fail closed to `none` through hot-seat, network lobby, Edge storage, rejoin, and rematch paths. Network rooms carrying lava use ruleset version 3; legacy no-hazard rooms retain v1/v2 compatibility.
2. In `lava` mode, every client derives identical lava pixels from the existing terrain seed and round seed. Lava is represented by a documented terrain pixel value distinct from air and ordinary solid.
3. Lava is solid for terrain support and collision, but a tank touching an exposed lava pixel takes a named lethal hazard effect exactly once per resolution step. A projectile that contacts lava resolves as a lava impact; it does not pass through or damage the lava bitmap.
4. Ordinary blasts clear lava, Dirt Bomb fills ordinary solid only, terrain collapse preserves hazard pixels as supported ground, and legacy `none` terrain remains byte-identical to the current behavior.
5. The renderer paints lava with an authored high-contrast palette while preserving ordinary terrain materials, transparency, reduced-motion behavior, and dirty-version rendering.
6. Deterministic harnesses and client/Edge tests prove normalization, seed parity, collision and lethal contact, deformation/collapse semantics, renderer output, network/rematch propagation, and legacy back-compat. No new action kind, auth, persistence, migration, secret, or dependency is introduced.

## Boundaries

- This slice implements `lava` only. `water` is a separate future hazard mode.
- Keep the canonical `Uint8Array` terrain and existing replay contract; do not ship `GameState` over the network.
- No server physics or client-trusted damage authority is added. The existing client lockstep model remains unchanged.

## Safety and failure behavior

- Unsupported or malformed hazard values normalize to `none`.
- Legacy serialized terrain containing only `0` and `1` is interpreted exactly as before.
- Lava placement is deterministic, bounded away from the initial spawn corridors, and only uses existing terrain pixels; if a valid pool cannot be placed, the mode remains playable with no lava pixels.
