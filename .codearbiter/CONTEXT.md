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
single-player vs. deterministic AI bots. singedTerra is now a sustained game project.
The maintainer has invested in its gameplay, production deployment, progression,
security, and presentation and expects architectural choices to optimize for player
experience, maintainability, and reliable delivery. Early proof-of-concept constraints
remain historical evidence, not permanent bans on dependencies, rendering libraries,
or deeper product work.

## How it works (one-line architecture)

**One physics codebase, two live contexts plus one verification-only context.** All game
logic lives in `shared/` (TypeScript, deterministic, fixed 16ms timestep). Hot-seat runs
that engine directly; networked play runs an identically-seeded copy of the *same* engine
in every browser and stays in sync via **deterministic lockstep** — the canonical game is
`seed + an ordered action log` (`room_actions` in Postgres), broadcast over Supabase
Realtime. A bounded Supabase Edge verifier may replay completed transcripts through that
same engine, but it is never in the live turn path and MUST NOT become a duplicate engine
or a general game server (ADR-0013). No `GameState` is ever shipped over the wire. See
`coding-standards.md` for the determinism rules and layering; `tech-stack.md` for the
stack; `security-controls.md` for the backend posture.

**Battle HUD architecture (ADR-0018, retaining ADR-0017's visual boundary):**
one Preact semantic tree renders typed `BattleConsolePresentationState` and
emits `BattleConsoleIntent` values to the controller/domain owner. Preact owns
text, focus, accessibility, dialogs, input, and portals; DOM nodes do not own
gameplay callbacks. Canvas 2D remains the gameplay-world renderer. Lazy,
non-interactive Pixi draws decoration from the same typed layout/socket
projection. Sharp remains a development-only deterministic asset compiler;
static Vite/GitHub Pages hosting is unchanged. See
[`decisions/0018-preact-battle-console-semantic-ownership.md`](decisions/0018-preact-battle-console-semantic-ownership.md)
for the precise supersession boundary.

**Current recovery:** follow the [approved scope](specs/evidence-recovery-v2.md)
and [sole execution ledger](plans/evidence-recovery-v2.md). The
[architecture owner map](../docs/ARCHITECTURE.md#existing-owners) retains
`GameSessionComposition`, `MatchSessionLifecycle`, the room workflow/subscription
owners, and existing presentation owners. Older plans and delivery records are
historical context, not instructions to recreate delivered components. Accepted
ADR conflicts require the owner; historical approval receipts are not inferred
from implementation or a green test.

ADR-0001, ADR-0004, ADR-0005, and ADR-0006 have forward supersession chains;
see
[`plans/prototype-era-adr-review.md`](plans/prototype-era-adr-review.md)
for the retained principles and superseded prototype-era absolutes.

The **authenticated production diagnostics console** is a maintainer/test interface activated
only by the exact `diagnostics=1` query parameter and absent from normal player navigation. Its
fixed compile-time allowlist currently contains only `verified-replay-runtime` mapped to
`verified_replay_probe`; it accepts no body, headers, arbitrary endpoint, method, or request
composition. It reuses the browser-managed Supabase session without becoming an authorization
or gameplay authority. A production authenticated PASS is operational runtime evidence only.

## Primary users

Casual players (the maintainer and friends) playing in a desktop or mobile browser.
Optional accounts provide durable profiles and future progression, while anonymous players
can still play hot-seat or join an online room by its 4-character code.

## Scope

Implemented and playable today: hot-seat + networked play, AI opponents, best-of-N match
structure with a between-rounds shop/economy, multiple weapons, destructible terrain with
burial mechanics, audio + visual juice, mobile/touch support, and optional Supabase password
accounts with owner-only durable profiles. Anonymous play remains supported. An ongoing review
backlog lives in `docs/REVIEW_BACKLOG.md`; build history in `docs/TASKS.md`; spec in `docs/SPEC.md`.

### Not building (current intent)

No items are hard-excluded, but none of the following is a current priority — treat each as
possible-future, not in scope now (updated with maintainer 2026-08-04):

- Google SSO and other federated login providers (password auth comes first per ADR-0011).
- Magic-link, OTP, resend, SMTP, and password-recovery email infrastructure.
- Ranked matchmaking / global persistent leaderboards (profile and trusted match linkage come first).
- A native mobile app (browser-only, including mobile web).
- Monetization (no payments, ads, or in-game purchases — it's a free game).

## Strategic direction (product-stage clarification 2026-08-21)

singedTerra began under a staged-seriousness ladder intended to prevent a
proof of concept from accumulating unnecessary paid infrastructure or broad
dependencies. The project has crossed that product-interest threshold. The
maintainer explicitly directs future architecture to favor making the game
better and easier to sustain, including reviewed dependencies or rendering
technology when they materially help. Costly hosted services, backend
rewrites, and irreversible operational commitments still require explicit
decisions; they do not imply a blanket ban on client libraries or tooling.

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
- **Identity (ADR-0011, supersedes CONFIRM-05):** Optional Supabase email/password accounts
  now, with email confirmation disabled initially and anonymous room-code play preserved.
  Account JWT identity remains separate from the per-seat gameplay token. Owner-only profiles
  are the foundation; authenticated match linkage and progression follow, with Google SSO later.

## Maturity

**Product maturity:** sustained playable game under active product and visual
development, deployed publicly with hot-seat, networked play, accounts,
progression, verification, and responsive browser support.

**Governance maturity:** CodeArbiter remains configured at Stage 1 until the
maintainer explicitly changes that setting. Stage 1 controls gate weight; it
does not mean “throwaway prototype” and must not be cited to reject otherwise
justified dependencies, visual systems, testing, or maintainability work.

**Coverage-denominator policy (decided 2026-07-03, maintainer):** the stage-1 ≥60%
client-coverage gate measures *assertable logic only*. `client/vite.config.ts`
`coverage.exclude` drops code a unit test cannot honestly cover — canvas rendering
(`renderer/*Renderer.ts`, `renderer/*Fx.ts`), WebAudio (`audio/AudioEngine.ts`), DOM
bootstrap (`main.ts`), and type-only files (`GameClient.ts`, `SupabaseTypes.ts`).
Rendering is verified by eye + Playwright, not draw-call assertions. Pure logic under
`renderer/` (strata, ringBuffer, audioEdges) and theme colour math stay IN the
denominator. Threshold itself is unchanged at 60%.

## License

Intended **MIT** (open-source), not yet enacted — no `LICENSE`/`license` field exists and
packages are currently `private: true`. Follow-up tracked in `open-tasks.md`.
