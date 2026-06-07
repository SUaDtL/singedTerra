<!-- singedTerra — README -->
<p align="center">
  <img src="docs/assets/banner.svg" width="820" alt="singedTerra — a love letter to Scorched Earth (1991). Two pixel-art tanks duel across scorched, destructible terrain at dusk while a wind-bent shell arcs toward a 16-bit airburst." />
</p>

<h1 align="center">singedTerra</h1>

<p align="center">
  <em>A browser-based, turn-based artillery duel — and a love letter to <strong>Scorched Earth</strong> (1991).</em>
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Canvas 2D" src="https://img.shields.io/badge/render-Canvas%202D-ff7a1f">
  <img alt="Supabase" src="https://img.shields.io/badge/netcode-Supabase%20lockstep-3ecf8e?logo=supabase&logoColor=white">
  <img alt="Determinism" src="https://img.shields.io/badge/determinism-7%20harnesses%20green-ffd23f">
  <img alt="No deps" src="https://img.shields.io/badge/game%20engine-zero%20runtime%20deps-9b59b6">
  <img alt="Status" src="https://img.shields.io/badge/status-Sprint%204%20%C2%B7%20Combat%20Depth-e84d4d">
</p>

---

## 💛 A love letter to Scorched Earth

In 1991, Wendell Hicken's **Scorched Earth** — *"The Mother of All Games"* — taught a generation
that the most fun you could have with a PC was lobbing a Baby Missile over a procedurally-generated
hill, missing by *that much*, watching the wind flip on you, and adjusting your angle by one degree.
Funky Bombs. Dirt Clods. The Death's Head. Buying shields between rounds with money you didn't really have.

**singedTerra** is my homage to that game. Not a fork, not a reskin — a from-scratch rebuild in
modern TypeScript that chases the *feel*: the satisfying arc, the destructible ground, the cruel wind,
the "one more turn" of a hot-seat match. It aims to feel a touch nicer than the VGA original
(smoother bursts, a readable HUD) **without** losing the charm of geometric tanks and a terrain you
can blow a hole straight through.

> The name is a play on the original: *singed earth* for *Scorched Earth*. 🔥

---

## ✨ What it is

- 🎯 **Turn-based artillery** — aim by angle (`0°=right, 90°=up`) and power (`0–100`), account for wind, fire.
- ⛰️ **Truly destructible terrain** — a per-pixel bitmap. Craters are real holes; tanks get **buried**, slide, and fall when the ground under them is blown away.
- 🌬️ **Cruel, fair wind** — a gentle per-turn drift (seeded, never random) that nudges every shell sideways.
- 🧨 **A growing arsenal** — 7 of 11 weapons live, each with its own blast, color, and behavior, on a **finite ammo economy**.
- 👥 **Two ways to play** — *hot-seat* (2–4 players, one tab) and *online* (each player on their own browser) over Supabase.
- 🧮 **Deterministic by design** — the same seed + the same inputs always produce byte-identical results. This is the whole architecture (see below).
- 🪶 **No game framework, no GPU** — vanilla TypeScript + the Canvas 2D API. Runs happily on a t3.micro.

---

## 🎮 Controls

| Input | Action |
|---|---|
| `←` / `→` | Adjust **angle** |
| `↑` / `↓` | Adjust **power** |
| `Space` | **Fire** |
| `Tab` / `Q` | Cycle weapon (accelerator) |
| **Click the weapon strip** | Select a weapon directly (shows live ammo) |
| **Menu** (side panel) / **Main Menu** (game-over) | Quit the game back to the lobby |

Input is accepted only on your turn, only while aiming — never mid-flight.

---

## 🧨 The arsenal

Each weapon is a data definition (`shared/src/engine/WeaponSystem.ts`): a **detonation** profile (radius,
damage, color, burst style) and an optional **behavior** (e.g. airburst split). The engine's single
`detonate()` primitive reads them, so new weapons are mostly data — no new draw code.

| # | Weapon | Status | Blast | Notes |
|--:|---|:--:|---|---|
| 1 | 🟠 **Baby Missile** | ✅ | r18 · 34 dmg | The starter. **Unlimited** ammo. ~3 hits to kill. |
| 2 | 🔶 **Missile** | ✅ | r30 · 60 dmg | ~2 hits. The reliable workhorse. |
| 3 | 🔥 **Heavy Missile** | ✅ | r50 · 85 dmg | Big single shell. |
| 4 | 🟤 **Dirt Bomb** | ✅ | r50 · *raises* terrain | Builds cover instead of cratering it. |
| 5 | 🟡 **Cluster Bomb** | ✅ | 5 × r18 · 28 dmg | **Apex airburst** — splits at the top of its arc into a falling carpet. |
| 6 | ☢️ **Baby Nuke** | ✅ | r65 · 90 dmg | Now live (Sprint 4). |
| 7 | 💥 **Nuke** | ✅ | r90 · 100 dmg | Now live. A near-direct hit is a one-shot kill. |
| 8 | 🟣 **Bouncing Betty** | ✅ | r30 · 55 dmg | Bounces off terrain 3× (surface-normal reflection) before detonating. |
| 9 | 🟪 **Funky Bomb** | ✅ | 5 × split | Mid-flight (non-apex) age-triggered 5-way split. |
| 10 | 🟧 **Napalm** | ✅ | 5 × r40 · 65 dmg | Wide multi-cell carpet on impact. |
| 11 | 🔵 **Shield** | 🚧 | defensive | *Next up (Sprint 4 Slice 3)* — a destructible particle force-field. |

**Ammo economy.** `TankState.inventory` maps each weapon to `{ count, unlimited }`. Baby Missile is
unlimited; everything else starts at **9 rounds** (a generous sandbox loadout, tuned later). Firing a
finite weapon is rejected at zero and decrements on success — deterministically, so it survives
networked replay.

---

## 🏛️ Architecture — one engine, two execution contexts

The single most important design rule:

> **All game logic lives in `shared/` and runs in exactly one of two places.**

```
  client/  (Canvas renderer, input, HUD, lobby)  ─┐
  server/  (legacy authoritative path, superseded) ┼─►  shared/  (engine + types)
  supabase/ (Edge Function referee + Realtime)    ─┘
                                                         shared/ depends on NOTHING
```

- **Hot-seat:** the browser runs `shared/engine/*` directly via `HotSeatClient` — zero network, zero round-trips. `GameEngine` ticks on `requestAnimationFrame`.
- **Online:** **deterministic lockstep** over Supabase. There is *no* ticking authoritative server. Every client runs its own `GameEngine` and applies the same ordered **action log** (`seed + fire-actions`); a stateless Edge Function (`submit_action`) replays the engine purely to *referee* legality, then appends the row. Flight is **regenerated** locally on every client, not streamed.

`GameClient` hides which mode you're in from the renderer and input layers. That's *why* physics and
types live in `shared/` — so client and server physics can never drift apart.

### Determinism is a hard requirement 🔒

Lockstep only works if every machine computes identically. So the engine obeys strict rules:

- **Fixed 16 ms timestep** — hot-seat and networked produce identical results.
- **No `Math.random`, no `Date.now`, no wall-clock** anywhere in `shared/`.
- All randomness (terrain, wind) flows from a **seeded `mulberry32` PRNG** with MurmurHash3 seed mixing. Same seed ⇒ same game, every time.

```
       ·  ·  ·  ✦                        wind →  ◄──  -3.2
    ·              · ·                            angle 47°   power 72%
  ▟▙                   · ·                ╭─────────────────────────╮
 (red)                     · ·   ✺ 16-bit │  fixed 16ms · seeded RNG │
══════════════╗              · · airburst │  same seed = same game   │
  scorched    ╚════╗   ▟▙  ════════════   ╰─────────────────────────╯
  destructible      ╚══(blu)══════════════════
```

### Why a pixel bitmap for terrain?

Terrain is a **`Uint8Array` of `800 × 500`** (one bit of solidity per pixel: `0` = air, `1` = solid).
A point collides when its pixel is solid — `O(1)`. Explosions zero a disc of pixels (a real hole);
the Dirt Bomb sets them; gravity collapses unsupported columns and **buries** tanks. It serializes as
plain bytes for the action-log world, and only re-rasterizes the terrain polygon when a dirty flag is set
— meaningful CPU savings on a small box.

---

## ✅ The determinism harnesses

`npm run check` runs the full typecheck plus **8 deterministic test harnesses** (`scripts/checks/`).
They are the project's safety net — every change must keep them green:

| Harness | Proves |
|---|---|
| `determinism` | Same `(seed, actions)` ⇒ byte-identical final state |
| `collision` | OOB / ground / tank / swept-collision correctness (no tunneling) |
| `timestep` | Ticking is batch-invariant — no clock-derived `dt` |
| `turnstate` | Turn order, wind, health & winner reproducible for N=2/3/4 |
| `airburst` | Cluster splits into a deterministic symmetric fan; resolves once |
| `wind` | Seeded wind sequence reproducible; within cap; drift-bounded |
| `ammo` | Ammo gating + decrement; **live vs. replay byte-identical** |
| `motion` 🆕 | Bounce reflection, funky age-split & napalm fan — deterministic + replay-identical |

---

## 🚀 Quickstart

```bash
npm install            # install all workspaces (client / server / shared)

npm run dev            # Vite dev (client) + server, concurrently
npm run dev:client     # Vite on :5173

npm run build          # typecheck + server build + vite client build
npm run typecheck      # typecheck every workspace
npm run check          # typecheck + all 8 determinism harnesses  ← run before every commit
```

> Requires Node 20 LTS (see `.nvmrc`). Online play needs Supabase keys in `client/.env`
> (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — copy `client/.env.example`. Hot-seat needs nothing.

---

## 🗂️ Project layout

```
singedTerra/
├── shared/                 # the deterministic engine + types — depends on NOTHING
│   └── src/
│       ├── engine/         # GameEngine · Physics · Terrain · Tank · WeaponSystem · Random
│       └── types/          # GameState · PlayerAction · Events
├── client/                 # Canvas renderer, input, HUD, lobby (Vite)
│   └── src/
│       ├── renderer/       # Terrain / Tank / Projectile / HUD renderers + draw loop
│       ├── client/         # GameClient · HotSeatClient · NetworkClient
│       ├── input/  ui/  lib/
├── supabase/               # Edge Functions (submit_action referee, rooms, lobby) + migrations
├── server/                 # legacy Socket.io authoritative path — superseded by lockstep
├── scripts/checks/         # the 8 determinism harnesses
└── docs/                   # SPEC · TASKS · sprint plans · assets
```

---

## 🌐 Online play (Supabase deterministic lockstep)

No dedicated game server. The source of truth is an **ordered action log** in Postgres
(`room_actions`); game state is *(seed + the ordered list)*. Clients append committed turns, subscribe
via **Realtime**, and apply each action to their **local** `GameEngine` in sequence — reaching
byte-identical state. The `submit_action` **Edge Function** replays the pure `shared/` engine to confirm
it's your turn and the shot is legal before inserting the row. Because state is just a replayable log,
**reconnect, spectate, and async "play-by-mail" turns** all fall out for free.

---

## 🗺️ Status & roadmap

| Phase | State |
|---|---|
| **MVP0** — Bones (terrain, tanks, ballistics, craters) | ✅ Done |
| **MVP1** — It's a Game (turns, health, wind, HUD, hot-seat 2–4) | ✅ Done |
| **MVP2** — Networked (Supabase lockstep, lobbies, rooms) | ✅ Done |
| **Sprint 4** — Combat Depth (ammo, nukes, weapon strip, new-motion weapons) | ✅ Slices 0–2 done · shield (Slice 3) deferred |
| **Sprint 5** — Graphical overhaul (banner art direction, CRT, juice, side-panel HUD) | ✅ Done |
| **V1** — Shop, fuel, scoreboard, audio, mobile HUD | ⏳ Planned |

The living register is [`docs/TASKS.md`](docs/TASKS.md); the full design is [`docs/SPEC.md`](docs/SPEC.md);
recent sprints: [`docs/SPRINT4_COMBAT_DEPTH.md`](docs/SPRINT4_COMBAT_DEPTH.md) · [`docs/SPRINT5_GRAPHICS_OVERHAUL.md`](docs/SPRINT5_GRAPHICS_OVERHAUL.md).

---

## 🛠️ Tech stack

**TypeScript** (strict, throughout) · **Canvas 2D** (no game framework) · **Vite** (client) ·
**Supabase** (Postgres + Realtime + Edge Functions, lockstep netcode) · **npm workspaces** monorepo ·
zero runtime dependencies in the game engine.

---

## 🙏 Homage & credits

Built with deep affection for **Scorched Earth** by **Wendell Hicken** (1991), and the whole lineage of
artillery games it inspired — *Worms*, *Pocket Tanks*, *Gunbound*. The tanks here are geometric, the
explosions are pure canvas, and the wind will still betray you. That's the point.

> *singedTerra* — a personal project and a tribute. Not affiliated with or endorsed by the original authors.
