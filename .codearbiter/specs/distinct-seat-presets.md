# Distinct Seat Presets Specification

## Intent

Make the authored Garage visible before a player customizes anything. Every
hot-seat seat starts with a different complete tank preset, so opponents are
immediately recognizable as Tracks, Spider Legs, Hover, and Dune Wheels instead
of appearing as identical Foundry tanks.

## Context and SMARTS selection

Production main at `74abdafd12b123b6ff4a6a5548bfa97683da6532` already
ships four authored, freely mixable tank kits. The current hot-seat initializer
assigns `DEFAULT_TANK_LOADOUT` to every human, hiding that variety in the first
match and making the battlefield silhouettes look duplicated. Three bounded
approaches were compared:

1. **Cycle authored presets by stable seat index.** Player 1 starts Foundry,
   Player 2 Ranger, Player 3 Bulwark, and Player 4 Jackal.
2. **Randomize initial loadouts.** More variety between sessions, but surprising
   defaults and a new randomization/persistence contract add no player value.
3. **Add more art.** More expensive and unnecessary until the four existing
   silhouettes are actually exposed by default.

Approach 1 wins. It is immediately visible, deterministic, reversible through
the existing Garage, and changes no simulation or network contract. Confidence
is high.

## Player contract

- A fresh two-player hot-seat lobby starts Player 1 with Foundry and Player 2
  with Ranger, making Tracks and Spider Legs visible without setup.
- Growing the roster assigns Player 3 Bulwark and Player 4 Jackal, exposing
  Hover and Dune Wheels at the same stable seat positions.
- Every Garage preset and per-part selector remains available for free. A player
  can replace any default before starting the match.
- Existing rows retain player edits when the roster grows. The feature does not
  silently reset an already customized player.
- The exact selected loadout still travels through the existing lobby config and
  renders in battle; loadouts remain presentation-only.
- Online self defaults and waiting-room state remain unchanged. Online bots keep
  their current authored preset cycling.

## Architecture

- Add one pure `seatPresetLoadout(index)` helper in the Lobby module. It selects
  `TANK_KIT_IDS[index % TANK_KIT_IDS.length]` and returns a fresh four-slot
  preset object through the existing `presetLoadout` path.
- Use that helper only when constructing a new hot-seat row: initial rows and
  rows added by increasing player count.
- Do not alter `DEFAULT_TANK_LOADOUT`, normalization, tank part catalog, asset
  atlas, engine state, or rendering geometry.

## Boundaries

- Client lobby defaults, exact causal tests, and player documentation only.
- No renderer asset or geometry change; no engine, physics, hitbox, replay,
  action log, network, Supabase, backend, dependency, lockfile, auth, crypto,
  secret, schema, migration, irreversible, or destructive change.
- No worktree or branch cleanup belongs to this slice.

## Acceptance

- Focused tests first fail against the all-Foundry initializer, then prove the
  exact four-seat sequence, distinct P1/P2 fresh-lobby preview signatures,
  fresh-object isolation, preservation of existing edits on roster growth, and
  exact submitted loadouts.
- A production Playwright route proves a fresh lobby visibly labels Player 1's
  four Foundry parts and Player 2's four Ranger parts without clicking a Garage
  control, then starts a match whose live tank states retain those presets.
- Complete client coverage, deterministic harnesses, Edge tests, production
  build, Playwright matrix, dependency audit, secret scan, adversarial review,
  exact-head hosted CI, PR-only squash merge, exact-SHA Pages provenance, live
  smoke, and localhost hygiene all pass.
