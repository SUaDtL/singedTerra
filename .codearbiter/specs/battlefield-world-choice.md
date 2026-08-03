# Battlefield world choice

## Outcome

Let the lobby host choose one of the existing authored battlefield worlds before
starting a hot-seat game or creating a network room. Carry that choice through
the existing room-options contract so every network client renders the same
world. Keep world choice presentation-only: terrain generation, physics,
action logs, replay state, and deterministic engine inputs remain unchanged.

## Scope

- Add a closed `BattlefieldWorldId` catalog contract shared by the client and
  the persisted room-options shape.
- Add a world selector to the existing hot-seat and online advanced-settings
  controls, defaulting to the current deterministic selection behavior.
- Forward, normalize, store, echo, rematch, and consume the selected world for
  network rooms.
- Make renderer selection prefer the explicit world and fall back to the
  existing terrain-derived choice for legacy or malformed rooms.
- Add focused tests for catalog normalization, lobby serialization, network
  option propagation, rematch preservation, and renderer fallback.

## Non-goals and boundaries

- No new art assets, visual redesign, accounts, authentication, progression,
  database migration, dependency, secret, or Edge authorization change.
- No change to terrain seeds, terrain materials' physical behavior, physics,
  engine state, action types, or replay determinism.
- No persistent user preference in this slice; that is a later product track.

## Acceptance criteria

1. A hot-seat host can choose Ember Dusk, Obsidian Caldera, Glassstorm
   Expanse, or Automatic in the lobby, and the selected authored world is used
   in the started game.
2. A network host can choose the same values; the selected value is carried by
   room creation, join/rejoin, ready-up, and rematch, and every client uses the
   same world.
3. Automatic and all legacy/malformed/missing values retain the current
   terrain-derived selection exactly.
4. World choice is not included in engine physics inputs or action-log payloads.
5. Focused tests fail before the implementation and pass after it; the full
   typecheck, deterministic harnesses, Edge tests, client tests, build, and
   secrets scan remain green.
