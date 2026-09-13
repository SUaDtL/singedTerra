# Product and system specification

This is the maintained contract for singedTerra. Historical sprint detail lives
under [`archive/`](archive/) and [`reports/`](reports/).

## Product

singedTerra is a browser-based, turn-based artillery game inspired by
*Scorched Earth* (1991).

The product must:

- preserve angle, power, wind, weapon choice, terrain, and economy as meaningful
  decisions;
- support 2–4 seats with any mix of local humans and deterministic CPU players;
- support hot-seat play without a backend;
- support online rooms through Supabase deterministic lockstep;
- fit supported desktop and landscape-touch viewports on one page;
- keep gameplay deterministic across live play and replay;
- use authored visual assets and game-specific effects without a game framework.

## Player flow

### Splash

The splash establishes the authored visual identity and accepts keyboard,
pointer, or touch input to enter the lobby.

### Lobby

Players enter through a deployment chooser. It exposes First Salvo, Quick Duel
vs CPU, Local Battle, and Play Online without allocating a room or verified
session on page load.

Hot-seat setup includes:

- 2–4 seats;
- name and color;
- Human or CPU control;
- per-seat tank Garage;
- advanced match settings;
- separate Local Battle, Practice vs CPU, and Verified Deployment tabs.

Practice selects from immutable Quick Duel operation descriptors. The operation
projects declared settings and an optional field order into an ordinary local
CPU match.

Verified Deployment requires an authenticated account and an eligible server
session. Crosswind Qualification is a separate server-admitted trial inside
that tab. Its client entry checks availability only after an explicit player
action.

Online setup includes:

- public room creation;
- private room creation;
- join by room code;
- browse public rooms;
- ready state and host start;
- CPU seats and shared match options.

### Garage

Each tank is composed from four slots:

- mobility;
- hull;
- turret;
- barrel.

Foundry, Ranger, Bulwark, and Jackal are complete presets. Players may mix
parts between those families. The roster preview and gameplay renderer use the
same selected cosmetic state.

## Match contract

### State machine

```text
LOBBY → PLAYER_TURN → FIRING → RESOLVING → ROUND_OVER → GAME_OVER
```

Input is accepted only during `PLAYER_TURN` and only from the local human who
owns the active seat.

### Turns

At the start of a playable turn:

- the active living tank is selected;
- a deterministic wind value is available;
- angle, power, weapon, fuel, ammo, credits, and health are visible;
- turn-neutral aim, power, movement, weapon selection, and purchase actions may
  occur;
- Fire or Shield commits and ends the turn.

Eliminated seats are skipped.

### Rounds

Matches support an odd best-of-N setting.

Carried between rounds:

- credits;
- inventory;
- round wins;
- kills;
- damage totals;
- tank cosmetics.

Reset for each new round:

- health;
- shield;
- fuel;
- positions;
- terrain;
- active projectiles and effects;
- per-round wind sequence.

The next round seed is derived from the match seed and round index.

## Combat

### Angle and power

- Angle uses degrees.
- `0° = right`.
- `90° = up`.
- `180° = left`.
- Base power is clamped to the tank's current power cap.

### Physics

Physics advances in fixed engine ticks, normally paced at 60 Hz in browser
play. Wall-clock delta time never enters physics. Gravity, wind, collision, wall
behavior, submunitions, tunneling, and area effects must produce the same result
for the same ordered inputs.

### Terrain

The battlefield is 1200×600 logical pixels. A `Uint8Array` stores solidity per
pixel.

The engine supports:

- constant-time point collision;
- swept projectile collision;
- destructive discs;
- terrain-raising discs;
- deterministic collapse;
- tank settlement and burial;
- open, reflective, and cross-arena wrap side walls.

### Damage and death

Blast damage falls with distance from the configured blast reach. Shields
absorb a finite pool of damage. Tanks at zero health are eliminated. The round
resolves when one living tank remains or no living tanks remain in free-for-all
play. Optional four-seat Team mode uses two teams, prevents friendly-fire
damage, and resolves when one living team or no living teams remain.

### Movement

Movement uses bounded integer steps through the same deterministic action and
replay path in both modes. It is turn-neutral.

Fuel spent equals distance actually traveled. Bounds, cliffs, terrain,
collisions, burial, death, phase, and remaining fuel may reject or shorten the
move.

## Weapons and economy

The canonical roster is defined in
[`shared/src/engine/WeaponSystem.ts`](../shared/src/engine/WeaponSystem.ts).

Implemented weapons:

- Baby Missile, Missile, Heavy Missile;
- Baby Nuke, Nuke;
- Dirt Bomb, Bouncing Betty, Funky Bomb;
- Napalm, Hot Napalm;
- Cluster Bomb, MIRV, Death's Head, Riot Bomb;
- Sandhog, Tracer;
- Shield, Heavy Shield.

Weapon definitions own blast, damage, visual style, price, bundle, arms level,
and optional deterministic behavior. Blast damage defaults to linear radial
falloff; a weapon may select a positive falloff exponent, preserving its center
peak and zero-damage edge while making interior hits more decisive. The engine
defaults to the legacy linear curve for mixed-version network compatibility;
hot-seat explicitly opts into the decisive Baby Missile and Missile curve.

Baby Missile is the unlimited starter. Finite weapons decrement on successful
fire. Purchases reject insufficient credits or disallowed arms level.

Damage and turn stipends award credits. Purchases are turn-neutral. Batteries
increase power capacity and Fuel Tanks increase current-round fuel.

## CPU players

CPU decisions use the shared deterministic AI planner.

- Easy, medium, and hard vary search and error policy.
- Every client computes the same CPU plan from the same state.
- Online clients may race to submit the same CPU action; sequence and referee
  rules allow exactly one committed result.
- CPU input never bypasses weapon, ammo, movement, economy, or turn contracts.

## Rendering and audio

### Battlefield

Canvas draw order:

1. authored sky and atmosphere;
2. terrain material and strata;
3. tanks and barrels;
4. projectiles, trails, and ground shadows;
5. fire, blast lighting, debris, and camera effects;
6. Canvas-local targeting guidance.

Terrain rendering uses `terrainVersion` as its dirty signal.

### HTML interface

HTML and CSS own the lobby and player controls. The battle console renders one
typed Preact semantic tree for live instruments and commands. Optional Pixi
decoration remains non-interactive beneath that tree. Canvas owns the
battlefield, terrain, tanks, projectiles, and effects.

Wide, standard, and compact projections share action semantics and stable
control identity. Armory, Settings, First Salvo help, round, and terminal
surfaces keep focus and modal ownership explicit. The page remains fitted and
scroll-free at supported landscape viewports.

### Audio

Audio is synthesized through the Web Audio API. It covers aim, weapon
selection, launch, impact material, explosions, wall reflections, napalm,
shield activation, and misses. Audio unlocks after a user gesture and supports
a persisted mute state.

## Network contract

### Canonical state

Online state is:

```text
room options + deterministic seed + ordered room_actions
```

The browser does not upload or download full `GameState` snapshots during
normal play.

### Referee

Supabase Edge Functions:

- validate input and room membership;
- enforce room and turn rules;
- allocate or verify action order;
- commit rows;
- manage lobby, heartbeat, ready, rematch, finish, and room-list operations.

They do not run projectile physics.

Every online room stores deterministic `rulesetVersion` and
`commandProtocolVersion` values. Current clients create ruleset 4, command
protocol 2 rooms. The backend recognizes stored rulesets 1 through 4 and
command protocols 1 and 2 for compatibility. Missing values resolve to legacy
version 1; malformed values fail closed. Create returns the server-resolved
options. Join rejects a mismatch before roster mutation, and action submission
rejects a mismatch before command insertion. Rejoin and rematch retain the
authoritative stored pair.

### Replay

`NetworkClient` fetches and applies committed rows in sequence. Out-of-order
rows remain buffered until the missing sequence arrives. Reconnect and refresh
for an existing seat rebuild state through the same shared replay adapter used
by live actions. New seats cannot join after a room starts.

### Persistence

Postgres stores rooms, ordered actions, and final match scores. Realtime
broadcasts room and action changes.

## Security

- No end-user account is required for hot-seat, practice, or casual online play.
- Casual player identity is ephemeral and room-scoped.
- Optional accounts own career presentation and verified-session eligibility.
- The public anon key may appear in the client bundle.
- Anonymous direct writes are denied through Row-Level Security.
- Mutations flow through Edge Functions using server-held credentials.
- Service-role credentials never enter client code, repository content, or
  logs.

Casual participation and verified replay are distinct evidence classes. Linking
an account to a casual room does not promote that result to verified evidence.
Verified rewards come only from immutable server receipts after bounded replay.

The Crosswind Qualification source is prepared with admission disabled. Its
backend release, hosted proof, and public enablement remain separate operations.
The client must show an honest unavailable state and must not estimate verified
totals or mint local rewards.

The accepted casual-room trust model is documented in
[SECURITY.md](../SECURITY.md).

## Verification

Required evidence depends on the changed contract:

- deterministic engine harnesses for shared behavior;
- Vitest for client state and DOM behavior;
- Deno tests for Edge Function contracts;
- Playwright for production layout, touch geometry, and Canvas integration;
- production build and secret scan before delivery.

CI must be green on the exact pull-request head.

## Operations

- The client builds to `client/dist`.
- GitHub Pages publishes the static client from `main`.
- Deployment provenance is written to `deploy-meta.json`.
- A stale-source guard blocks outdated Pages candidates.
- A post-deploy Chromium smoke test checks the live fitted HUD.
- Supabase migrations and Edge Functions deploy separately through
  `npm run deploy:backend`.

## Non-goals

- a long-running Node game server;
- server-streamed projectile state;
- server-authoritative physics;
- mandatory accounts for casual play;
- a game framework;
- nondeterministic visual state feeding back into gameplay.
