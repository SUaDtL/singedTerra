---
arbiter: enabled
stage: 1
---

<!--INITIALIZED-->

# Project: singedTerra

A browser-based, turn-based artillery game — a homage to *Scorched Earth* (1991), hence
the name (*singed earth*). Two tanks (or up to four players) lob projectiles across a
destructible terrain, adjusting angle/power against wind and gravity.

## Purpose

Recreate the feel of classic artillery dueling in the browser, with both **hot-seat**
(all players in one tab) and **networked** (each player in their own browser) play, plus
single-player vs. deterministic AI bots. Built as a personal project / technical exercise.

## How it works (one-line architecture)

**One physics codebase, two execution contexts.** All game logic lives in `shared/`
(TypeScript, deterministic, fixed 16ms timestep). Hot-seat runs that engine directly;
networked play runs an identically-seeded copy of the *same* engine in every browser and
stays in sync via **deterministic lockstep** — the canonical game is `seed + an ordered
action log` (`room_actions` in Postgres), broadcast over Supabase Realtime. No `GameState`
is ever shipped over the wire. See `coding-standards.md` for the determinism rules and
layering; `tech-stack.md` for the stack; `security-controls.md` for the backend posture.

## Primary users

Casual players (the maintainer and friends) playing in a desktop or mobile browser. No
accounts — players join a room by a 4-character code.

## Scope

Implemented and playable today: hot-seat + networked play, AI opponents, best-of-N match
structure with a between-rounds shop/economy, multiple weapons, destructible terrain with
burial mechanics, audio + visual juice, and mobile/touch support. An ongoing review backlog
lives in `docs/REVIEW_BACKLOG.md`; build history in `docs/TASKS.md`; spec in `docs/SPEC.md`.

### Not building (current intent)

No items are hard-excluded, but none of the following is a current priority — treat each as
possible-future, not in scope now (confirmed with maintainer 2026-06-20):

- User accounts / real authentication (identity stays ephemeral, room-code based).
- Ranked matchmaking / global persistent leaderboards.
- A native mobile app (browser-only, including mobile web).
- Monetization (no payments, ads, or in-game purchases — it's a free game).

## Strategic direction (decided 2026-06-20)

The organizing principle is a **staged-seriousness ladder**: ship a friendly prototype
now, and let heavier commitments *gate in together* as the project proves it's worth
getting serious about (a strong "we play this all the time" signal, or a move toward a
mobile release). Architect so none of these is foreclosed, but build none ahead of need.

- **Cheat-protection (CONFIRM-01):** Trust-the-client now (referee validates turn
  ownership, never simulates). Plan for tiered protection — partial validation, then a
  server-authoritative engine — to gate in with seriousness. A mobile release would make
  it mandatory. Do not foreclose it.
- **Scale (CONFIRM-02):** Target **tens of rooms now**; keep the transport swappable
  (it already is, behind `NetworkClient` + the `seed + log` contract). Re-decide at the
  Realtime-limit / "going serious" trigger.
- **Backend (CONFIRM-03 — SMARTS A, 87.3):** **Stay on Supabase now**, do the in-place
  optimizations (atomic `seq` RPC, swap Postgres Changes → Realtime Broadcast). **Cloudflare
  Durable Objects / PartyKit is the designated successor** — spike it when Realtime limits
  bite or seriousness rises; the engine/replay contract won't change.
- **Roadmap (CONFIRM-04):** **Gameplay parity first** — Scorched Earth mechanics
  (movement/fuel, parachutes, batteries, arms-level, shields) lead; online-social
  (room browser, teams, spectator) follows.
- **Identity (CONFIRM-05):** Ephemeral name-on-join now; real identity + ranked profiles
  gate in *with* cheat-protection (shared trigger). Don't half-build it.

## Maturity

Stage **1** (prototype) per maintainer — despite being deployed to production (Netlify
client + Supabase backend) and playable, it is treated as an early/experimental solo
project with lighter gates.

## License

Intended **MIT** (open-source), not yet enacted — no `LICENSE`/`license` field exists and
packages are currently `private: true`. Follow-up tracked in `open-tasks.md`.
