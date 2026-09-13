# P04 tactical challenges — bounded specification

**Status:** implemented local P04v2 slice; frozen for parent integration and review.

## Player outcome

Quick Operations gain three named, readable tactical challenges that ask for
different choices in the actual match. Each remains a local Quick Duel against
the existing Medium CPU, retains the normal same-seed Play Again route, and
does not create a reward, persistence, network, or engine-authority surface.

This proposal deliberately reuses the operation registry, existing explicit
Field Order construction, Lobby operation cards, HUD ledger, and After Action
Report. P03's Last Light Siege / Hold the Field pairing remains intact with its
existing content version and conditions. The verified account-count Field Order
catalog and its modulo rotation remain byte-for-byte ordered as they are now.

## Challenge set

### 1. Crosswind Range — ranging

Reuse the existing `crosswind-range` operation: wrap walls, Glassstorm world,
and normal deterministic wind.

- **Objective:** `First Strike` — damage the CPU within the first three human
  salvos.
- **Bound:** three settled human salvos; an accepted third fire remains active
  until it settles, then either records its damage or misses.
- **Two viable tactical approaches:** tune a direct arc against the current
  wind, or intentionally wrap a shot through the opposite wall. Neither
  route is prescribed in player copy.
- **Why retry:** a missed first estimate can be corrected through wind/power;
  same-seed Play Again makes calibration repeatable. Every new P04 launch also
  starts the solver-proven seed 42 rather than advertising an unsupported draw.

### 2. Caldera Run — terrain position

Reuse the existing `caldera-run` operation: lava hazards and the Obsidian
Caldera world. Do not claim that the art alone makes this a challenge.

- **Objective:** `Set the Position` — reach a net absolute horizontal
  displacement of at least 16 pixels from the opening position at the first
  accepted human fire, then damage the CPU with that first
  settled salvo.
- **Bound:** movement is restricted to the opening human turn; the first
  human salvo settles as achieved only when both the net displacement and
  positive damage facts are present, otherwise missed. Back-and-forth travel
  does not accumulate progress.
- **Two viable tactical approaches:** advance toward the centre to lower the
  shot and change the local firing line, or retreat to make a higher arc over
  the nearby terrain. Both spend existing fuel and must respect the live
  slope/lava geometry.
- **Why retry:** the player can select the opposite direction or a different
  firing solution after seeing whether the initial position created a safer
  line. This is not a requirement to find one hidden coordinate.

`16` is intentionally two ordinary eight-pixel movement inputs, not a new
movement rule. It remains provisional until the legal solver receipts below
confirm both directions are actually traversable in every supported seed.

### 3. Lean Arsenal — resource-constrained duel

Add one operation entry, `lean-arsenal`, through the existing Quick Operations
registry. Its only rule projection is `{ armsLevel: 0 }`; the existing Quick
Duel base already supplies its three rounds and normal fixed roster.

- **Objective:** `Make It Count` — win the best-of-three duel with Level 0
  restocks only.
- **Bound:** ordinary match completion: first tank to two round wins, with the
  existing per-round shop and normal terminal result.
- **Two viable tactical approaches:** spend the finite opening heavy/utility
  kit to create early damage and credits, or conserve it while relying on
  unlimited Baby Missiles and Level-0 Missile restocks for later rounds.
- **Why retry:** a different purchase/use sequence changes which finite tools
  remain after a round loss or victory; normal Play Again keeps the seed and
  lets the player test that choice directly.

`armsLevel: 0` gates purchases only. The engine still gives every tank its
existing opening inventory and 8,000 credits; P04 must not invent starting
inventory, credits, or tank-position options. The player-facing briefing must
say "Level 0 restocks only; preserve your opening kit", not imply a stripped
starting loadout.

## Content and observation boundary

The two existing operations are reused because their settings create the
actual range and terrain constraints. Adding visual variants of them would not
meet P04. Lean Arsenal is the one new entry because no current operation has
an `armsLevel` restriction. Retrofitting Last Light Siege is rejected: it
would change P03's explicitly preserved operation conditions merely to supply
the third prototype.

P03 currently proves only `hold-the-field` through its practice observation.
P04 therefore needs these minimum client-only seams:

1. Add a small immutable **practice-only definition list** adjacent to the
   existing explicit-ID accessor. It resolves `first-strike`, `set-the-position`,
   and `make-it-count` for P04 without changing `FIELD_ORDER_CATALOG`,
   `createFieldOrder(summary)`, or any account-count modulo result. It is
   content routed through the current Field Order representation, not a second
   objective framework. `set-the-position` owns public progress for opening
   travel and its first-salvo result; `make-it-count` uses the existing terminal
   winner fact.
2. Extend the existing practice descriptor union and immutable operation
   registry. Preserve Last Light's version-1 descriptor exactly; assign a new
   content version to the P04 descriptors rather than rewriting the old
   identity. Expand the operation settings projection only to include the
   already-supported `armsLevel` field.
3. Reuse the trusted accepted-action/settled-damage pattern from
   `VerifiedDuelController`, but do not reuse that controller or its verified
   contract. The current generic Quick Duel path has no accepted-action or
   per-shot damage owner: `HotSeatClient.sendAction` discards its engine boolean,
   `HotSeatProgressionReporter` observes only GAME_OVER, and renderer impact
   cues are visual and cannot distinguish CPU/lava damage. Add the smallest
   local practice recorder at the existing Quick Duel input forwarding seam in
   `main.ts`: capture primitive before/after snapshots only for an accepted
   human fire, bind a pending shot to that human, and compare its
   `human.totalDamage` before/after only when that same shot has settled. The
   first accepted fire captures net opening displacement. It supplies the
   existing reducer with settled human-salvo damage and position. CPU actions,
   rejected actions, lava,
   later explosions, and all verified/network routes remain outside the
   recorder.
4. Continue passing only rendered Field Order copy through the existing Lobby,
   HUD, and terminal owners. No action-log field, controller, engine method,
   store rule, API, dependency, schema, or reward is added.

## Acceptance criteria

1. The Lobby card, live ledger, and After Action Report make each challenge's
   condition understandable without a design document. The report remains
   non-actionable and preserves its existing focus order.
2. Crosswind applies the existing First Strike practice definition; Caldera records only
   net opening position at accepted human fire and settled first-human-salvo
   `human.totalDamage` delta;
   Lean Arsenal applies `armsLevel: 0` and observes its ordinary human win.
   Rejected actions and CPU actions cannot advance a challenge.
3. P03's Last Light Siege pairing, identifier, content version, settings,
   replay/restart behavior, and Hold the Field semantics are unchanged.
   Standard, Local Battle, online rooms, verified deployments, recovery,
   account progression, and protocol payloads gain no practice-challenge state.
4. Each published challenge has a declared, finite supported seed set and a
   legal real-`GameEngine` completion transcript for every seed. Each transcript
   reaches the stated achieved outcome before the engine's existing settlement
   cap and without state mutation or test-only setup. For Caldera, the evidence
   includes both advance and retreat route classes across the supported set.
5. Every supported seed also has a legal non-completing/retry transcript that
   resolves to a stable missed state or normal match result; no challenge
   softlocks or remains indefinitely active after its bound.
6. No new weapon code or modified weapon tuning is required.

## Seed strategy and evidence boundary

P13 v1 at `3b6b346` provides candidate seeds `17` and `42`. Its production
engine simulations terminated for Crosswind Range, Caldera Run, and the
arms-level-0 restricted-restock scenario, but P13 expressly does not establish
human completion and its level-0 seed 17 trace has a long non-damaging streak.
It is useful termination evidence only.

The P04 evaluator receipt at `docs/feasibility/p04-tactical-challenges-v1.json`
proves the published supported list **`[42]`**. It drives ordinary actions
against the exact two-seat Medium-CPU Quick Duel roster, with no state mutation
or test-only loadout:

| Challenge | Seed 42 observed routes | Result |
| --- | --- | --- |
| Crosswind Range | direct Baby Missile: 30°/100; wrap Baby Missile: 105°/75 with one wall contact | Both damage CPU. |
| Caldera Run | advance 16 px then 30°/100; retreat 16 px then 30°/100 | Both credit positive human damage on the first settled salvo. |
| Lean Arsenal | early Heavy Missile use; conserved-kit route buys an allowed Level-0 Missile restock then opens with Baby Missile | Both win best-of-three as P1 under `armsLevel: 0`; every recorded action is accepted. |

Run `npx --no-install tsx --tsconfig client/tsconfig.json scripts/feasibility/p04TacticalChallengeFeasibility.ts`.
The receipt also replays three legal non-completing routes: three ranging misses,
a damaging Caldera opening with no displacement, and a Lean Arsenal CPU victory.
All nine traces are replayed through the production practice evidence helper and
Field Order reducer, with actor, phase, settlement, and expected outcome recorded.
The receipt binds the observed base revision plus normalized UTF-8/LF SHA-256
fingerprints for the evaluator, engine source, objective adapters, and TypeScript
configuration. The base revision alone is not the candidate source identity.
These are machine-executed legal routes. Human understanding, strategic choice,
and willingness to retry require the separate consented newcomer study.

The checked-in evaluator drives ordinary `PlayerAction`s into `GameEngine`
using each exact operation's resolved options and the Quick Duel
human/Medium-CPU roster. It records:

- seed, content version, fully resolved options, and a serializable action
  transcript;
- accepted action/result sequence, settlement ticks, phase progression, and
  terminal or objective result;
- a successful transcript for every challenge/seed, plus a deliberate retry
  path for every challenge/seed;
- for Crosswind, at least one direct and one wrapped successful route across
  the candidate set; for Caldera, both left and right opening movement route
  classes; and for Lean Arsenal, one early-kit and one conserved-kit route
  across the candidate set.

P04 is an explicit curated-seed mode: a version-2 challenge descriptor names
seed `42` at launch; it must not choose a fresh random seed and then advertise
an objective. The descriptor, operation ID, and selected seed survive same-seed
Play Again. P03 Last Light Siege and P02 First Salvo keep their ordinary
generated-seed behavior. A future candidate may join the finite list only with
the same evidence. No seed is advertised as supported merely because an
AI-vs-AI P13 observation reached `GAME_OVER`.

## Planned tests after approval

- Pure Field Order RED/GREEN cases: net displacement acceptance/rejection, first-fire
  boundary, delayed settlement, success-before-miss precedence, CPU exclusion,
  game-over result, and immutable rendered copy.
- Operation registry tests: expected post-integration six-entry catalog
  (Standard, P02 First Salvo, Crosswind, Caldera, Last Light, Lean Arsenal),
  immutable descriptors, old P03 version-1 pairing unchanged, `armsLevel: 0`
  composition, fallback, and deterministic clone/replay parity.
- Rotation preservation tests: every existing account-count input continues to
  select the same original `FIELD_ORDER_CATALOG` item; each P04 practice ID
  resolves only through the practice-only definition list.
- Main/lifecycle tests: one recorder session per local Quick Duel, accepted
  human-fire snapshot capture, reset on same-seed Play Again, no leakage to the
  excluded modes, and terminal stability across repeated frames.
- Lobby/HUD/terminal tests: selected card objective copy, concise live progress,
  achieved/missed report text, unchanged focus/action count, and no overflow.
- P04 solver harness plus focused/full client and engine checks. Browser proof
  uses the sole parent-owned localhost and exercises pointer/keyboard launch,
  movement, retry, and wide/standard/compact layouts; it does not treat a
  screenshot as completion proof.

## Scope exclusions and rollback

No new weapons, tuned constants, starting kit/credits/position settings,
network support, backend authority, persistence, rewards, difficulty selector,
or terrain generation change. Removing the three P04 registry descriptors and
their local observer/reducer branches rolls back the prototypes while retaining
the existing operations and P03 pairing.
