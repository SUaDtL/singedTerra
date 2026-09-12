# R06 — atomic room-command evidence

**Task:** R06 — Introduce an atomic, revision-checked room-command transaction

**Base SHA:** `dad0c506f3b780b4ed6eb362df89a39c1161f509`

**Result SHA:** the recovery integration commit containing this receipt, identified by Git history

**Branch:** author `codex/recovery-v2-r06`; integration `codex/evidence-recovery-v2`

**Worker:** `gpt-5.6-sol` / `xhigh` (runtime selection independently verified by the parent)
**Date:** 2026-09-10

## Result and transaction contract

Migration `021_atomic_room_commands.sql` adds nullable v2 metadata to `room_actions`, a unique logical-intent index, and the service-role-only `submit_room_command_v2` function. The transaction locks one room row, authenticates the current submitter against `room_seats`, authorizes self or a valid `easy`/`medium`/`hard` CPU actor, checks the room's command protocol and historical ruleset, resolves an existing intent, then checks active status and expected log revision before appending one row and advancing the legacy cursor when the command ends a turn.

The room revision is the next action sequence, `COALESCE(MAX(seq) + 1, 0)`, computed under the room lock. It is command concurrency metadata and is distinct from both `commandProtocolVersion` and the historical engine/ruleset versions. No engine or ruleset version is changed, and no existing room is upgraded.

Logical identity is `(room_id, command_version, intent_id)`. Equality for an existing intent includes intended actor, expected revision, canonical action, turn-ending state, next-index hint, and round-over hint. The authenticated submitter is stored as public diagnostic metadata but excluded from equality and the receipt, so two different authorized clients driving the same CPU seat deduplicate. Reusing the same identity with a changed actor or payload returns `intent_conflict`. Authentication, current membership, and self-or-CPU authorization occur before any existing receipt is exposed. Current room status, turn, and revision are deliberately checked after the receipt lookup so a valid identical retry can recover its committed receipt after the room advances or finishes.

The Edge handler canonicalizes v2 action fields before the RPC. The SQL function strips any caller-provided actor binding, derives a positional tank id from the stored roster, appends one of three roles, and rejects unknown action fields. Seat credentials are compared inside the transaction and never enter `room_actions`, receipts, responses, or logs.

- `engine-seat` binds ordinary combat and normal-turn commands to the current engine seat.
- `shop-seat` binds a ROUND_OVER purchase to its explicit tank.
- `transition-initiator` attributes `next_round` to the authenticated member who requested the global transition. It does not impersonate the opener, so a non-opener human can continue an ordinary casual match.

Shared replay validates these bindings before any engine mutation. Legacy rows without a binding replay unchanged.

## Compatibility and rollout boundary

Protocol omission means v1. `create_room` stores explicit v1 unless a caller explicitly requests v2. `join_room` requires exact requested/stored compatibility and returns the resolved version without mutating an old room. A rematch retains explicit v2 or materializes v1 in the successor when the predecessor omitted the field. The v1 submit path continues to use migration 004 and rejects a v2 room; the v2 path bypasses legacy active-room and turn prereads so committed retries reach the locked receipt path.

The compatible rollout order is migration 021 first, then the updated room lifecycle and submit functions, then the separately owned R07 client transition that explicitly creates/joins v2 rooms and reuses stable command identities. Old clients remain on v1 rooms, new v2 clients refuse v1 rooms, and old rooms remain v1. The existing casual `nextActiveIndex` and `roundOver` hints are retained and applied coherently under the lock; this task does not claim server-authoritative physics. R08 remains responsible for finish/score persistence, and R19 remains responsible for broader runtime documentation reconciliation.

Before any v2 room activation, rollback may deploy the prior v1-only Edge code and then remove the unused function/index/nullable columns in a new controlled schema operation. After a v2 room exists, retain its receipts and fix forward with another additive migration. Never edit migration 021 after application, and never reinterpret historical rows.

## Regression-first and database evidence

The legacy RED used the production migration-004 RPC in two persistent `psql` sessions. Both sessions emitted the same stale pre-read `1:0:0` (active index, turn, next log revision) before release. `npm run check:database` then exited 1 because two independent rows were appended where the oracle required one: expected `1`, actual `2`.

The green harness starts the repository's pinned, disposable, no-published-port PostgreSQL 15 container and applies migrations 001, 002, 003, 004, 010, 016–021 in order while preserving every previous rematch and verified-deployment case. Its internal synchronization labels are `command-A`/`command-B`, `finish-first`/`finish-first-command`, and `action-first`/`action-first-finish`; these are historical test labels, not currently live execution handles. Both command sessions prove revision 0 before release. The production v2 RPC then returns byte-identical receipts to different CPU proxy submitters, stores one row, and advances the cursor once.

The same real RPC/constraint suite proves:

- same-intent changed actor and changed payload conflict;
- stale revision, bad credential, human proxy, null AI metadata, and unknown AI metadata reject;
- SQL-null protocol/revision and a missing action type reject, and incomplete v2 metadata violates the table constraint;
- arbitrary action fields cannot enter the public log, and `anon` cannot execute the function;
- active-seat movement, ordinary buy, per-tank shop buy, and non-opener `next_round` bind correctly and remain turn-neutral;
- a new command on a finished room rejects while an authenticated identical committed retry returns the original receipt;
- finish-first yields no action row, while action-first commits one row and finish observes it in the opposite coherent lock order.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check:database` against legacy migration 004 before implementation | exit 1; both stale reads were `1:0:0`; expected one row, actual two |
| `npm ci --ignore-scripts --no-fund` | exit 0; 178 locked packages installed, 0 vulnerabilities, no manifest or lockfile change |
| focused Deno R06/lifecycle suite during implementation | final exit 0; 122 passed |
| `npm run typecheck` | exit 0 |
| first `npm run check` | exit 1; the new shop-binding assertion looked for the wrong error wording; production replay had rejected before mutation |
| final `npm run check` | exit 0 |
| first `npm run check:edge` | exit 1; the closed generated-type contract correctly required the new RPC/options/action/row assertions |
| final pre-review `npm run check:edge` | exit 0; 377 passed |
| final `npm run check:database` | exit 0; atomic receipts, stale-preread serialization, action/finish ordering, ACL, rematch, and verified start/resume passed |
| `npm run test:client` | exit 0; 200 files / 1,789 tests passed |
| `npm run build` | exit 0; existing large-chunk warnings retained |
| `git diff --check` | exit 0 |
| state-free secret scan | exit 0 with synthetic-fixture keyword findings in the database and envelope negative tests; these exact findings remain for fresh security-review classification |
| review-correction RED: `deno test --allow-env supabase/functions/submit_action/live.test.ts --filter "locked v2 turn refusal"` | exit 1; the v2 locked refusal returned 403 but emitted no ADR-0008 warning |
| review-correction GREEN: same focused command | exit 0; 1 passed |
| post-correction focused submit/protocol/type Deno suite | exit 0; 84 passed |
| post-correction `npm run check:edge` | exit 0; 378 passed |
| post-correction `npm run typecheck` | exit 0 |

## Acceptance mapping

- **R06 AC1:** Two synchronized stale CPU proxies share one deterministic intent and produce one action row, one cursor advance, and one receipt.
- **R06 AC2:** Identical retries return the committed receipt; changed actor or action under the same room/protocol/intent identity conflicts.
- **R06 AC3:** Human, shop, transition, and combat commands carry explicit revision/identity semantics and replay actor bindings. Turn-neutral commands leave the cursor unchanged.
- **R06 AC4:** Room status and action admission share the room lock. Both action-first and finish-first schedules have one coherent result.
- **R06 AC5:** The evidence invokes the production PostgreSQL function over real persistent connections; mocked conflict responses are not used as the acceptance oracle.

## Changed paths

- `.codearbiter/reports/recovery-v2-r06-evidence.md`
- `scripts/checks/database-postgres.mjs`
- `scripts/checks/lockstep.mjs`
- `shared/src/net/roomCommand.ts`
- `shared/src/net/replay.ts`
- `supabase/functions/_shared/commandProtocol.ts`
- `supabase/functions/_shared/commandProtocol.test.ts`
- `supabase/functions/_shared/database.types.ts`
- `supabase/functions/_shared/database.types.test.ts`
- `supabase/functions/create_room/index.ts`
- `supabase/functions/create_room/handler.test.ts`
- `supabase/functions/join_room/index.ts`
- `supabase/functions/join_room/handler.test.ts`
- `supabase/functions/restart_game/index.ts`
- `supabase/functions/restart_game/restart_game.test.ts`
- `supabase/functions/submit_action/index.ts`
- `supabase/functions/submit_action/index.test.ts`
- `supabase/functions/submit_action/live.test.ts`
- `supabase/functions/submit_action/validate.ts`
- `supabase/functions/submit_action/validate.test.ts`
- `supabase/migrations/021_atomic_room_commands.sql`

The exact existing test paths extended are `scripts/checks/database-postgres.mjs`, `scripts/checks/lockstep.mjs`, `supabase/functions/_shared/database.types.test.ts`, `supabase/functions/create_room/handler.test.ts`, `supabase/functions/join_room/handler.test.ts`, `supabase/functions/restart_game/restart_game.test.ts`, `supabase/functions/submit_action/index.test.ts`, `supabase/functions/submit_action/live.test.ts`, and `supabase/functions/submit_action/validate.test.ts`. The new test path is `supabase/functions/_shared/commandProtocol.test.ts`.

## Sprint auto-decisions for parent ledger

| Decision | SMARTS verdict | Confidence and intent |
| --- | --- | --- |
| Use room/protocol/intent uniqueness; include the actor in deterministic CPU IDs and equality, exclude proxy submitter metadata | S5 M5 A5 R5 T5 Satisfaction5; directly proves multi-proxy deduplication and changed-actor conflict | high; per approved R06 correction |
| Authenticate and authorize before receipt lookup, then allow an identical receipt before current status/turn/revision checks | S5 M5 A5 R5 T5 Satisfaction5; prevents receipt disclosure while preserving lost-response recovery | high; per approved R06 security boundary |
| Model `next_round` as transition-initiator attribution and ROUND_OVER buy as shop-seat binding | S5 M5 A5 R5 T5 Satisfaction5; preserves existing casual behavior without human combat proxying | high; per parent compatibility steer and existing authorization contract |
| Default absence to protocol v1, require exact joins, and materialize the resolved version only in new rooms/rematches/responses | S5 M5 A5 R5 T5 Satisfaction5; supports staged rollout without upgrading existing rooms or historical rules | high; per approved compatibility requirement |
| Retain the migration after v2 activation and fix forward | S5 M5 A5 R5 T5 Satisfaction5; preserves durable receipts and migration immutability | high; per R06 rollback policy |

## Review, remaining risks, and limits

Fresh independent Astra/high review session `01a089c3-0d08-7a63-9e13-a171d752d00b` and parent triage returned a generic PASS with one MEDIUM/DEFERRABLE finding: the v2 early RPC response omitted the structured `not_your_turn` warning retained by ADR-0008. The parent required correction before integration. A production-handler regression first failed because no warning was emitted. The minimal correction now logs exactly the public room id, intended actor id, and locked refusal code. Unique sentinels prove the seat credential, intent/request envelope, action, current revision, internal detail, and raw RPC object do not appear. It performs no additional room read and does not alter the SQL transaction or response.

Parent independently reran the unchanged real database harness and the 377-test Edge suite before this bounded correction; both exited 0. Author post-correction checks are recorded above. A new independent Astra/high review of the corrected frozen diff remains pending.

No production schema migration, Edge deployment, client activation, live room, staging, commit, remote action, or release occurred. This implementation prepares protocol v2 but does not activate it because R07 owns the client envelope/retry transition. R08's finish-score atomic persistence remains separate. The existing build chunk-size warnings remain.

## Parent integration acceptance, 2026-09-10

Fresh corrected-diff reviewer `/root/r06_corrected_review`, session `01a089da-5a24-7981-bfdb-c2b04fcc5c91`, was verified `gpt-6-astra / high`. All five matched units (migration, security, auth/crypto, coverage, architecture) completed with no findings. Separate finding-triage and verdict-aggregator returned PASS, zero findings and no missing/deferred units. The reviewer independently passed125 focused Deno tests, lockstep and whitespace checks. It inspected the real database harness while preserving the distinction from parent-executed database proof.

The unchanged scanner produced seven synthetic fixture matches: database harness lines122/167/169/180 are explicitly seeded disposable credentials, line138 is an invalid-credential negative, line147 is an unknown-field persistence-rejection sentinel, and submit_action/validate.test.ts line54 rejects a forbidden envelope field. Independent auth review classified all as noncredentials under the project's Secrets, Auth/identity and Database access controls. No fixture obfuscation, scanner change or override was used. The real secret path remains the existing seat credential passed from the authenticated request into the service-only SQL check, with no new persistence or log sink.

Parent verified matching baseline blobs for all16 tracked files, no collisions for all5 additions, and exact copied bytes for all21 files before integration atop `f88eebafa687a12ecc53599e505a04f5297d6431`. Fresh integrated results:

| Command | Exit and evidence |
|---|---|
| npm run check | 0; session26267; complete deterministic and static gates |
| npm run test:client | 0; session83975; 200 files/1817 tests |
| npm run build | 0; shared/client typecheck and production bundle |
| npm run check:edge | 0; session6941; 378 tests |
| npm run check:database | 0; session46829; real isolated PostgreSQL, stale-proxy receipts, both finish/action schedules, ACL and historical rematch/verified assertions |
| configured state-free secrets scan | 0; exact seven independently classified synthetic matches, no credential finding |
| git diff --check | 0 |

Logs: `C:/Users/brenn/AppData/Local/Temp/recovery-v2-r06-integrated-{check,test-client,build,check-edge,check-database}.log`. All listed test sessions are terminal. No numeric shared/Edge/SQL coverage is claimed; the declared numeric tooling is client-only.

AC020–024 are locally accepted for governed integration. Security and migration pass records may now be created from this genuinely reviewed exact diff. This acceptance does not apply migration021 to any production database or activate v2 clients. R07, R08 and R19 remain required; all rollout and rollback limits above remain in force.
