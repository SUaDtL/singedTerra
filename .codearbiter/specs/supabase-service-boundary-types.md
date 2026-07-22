# Supabase Service Boundary Types Sprint Spec

> Status: **APPROVED — 2026-07-22**
> Date: 2026-07-22
> Tracks: GitHub issue #59

## Goal

Replace the Edge Function service client's `any` boundary with a migration-derived `Database`
contract so unknown tables and columns fail during Deno checking instead of becoming runtime
`undefined` or `NaN` values.

## Why this is next

Issue #59 is the highest-value independent item not already covered by open PRs. The LobbySession
extraction in #128 should wait for PR #164's oracle to merge; issue #134's tractable client modules
are already covered by PRs #161 through #163 except for lower-value duplication; issue #109 is a
harmless CSS readability cleanup; and issue #125 would add a migration only for classification
comments. By contrast, `ServiceClient = any` currently disables type checking across every Edge
Function query and RPC.

This is a compile-time hardening sprint. It changes no database, request, response, authorization,
physics, or deployment behavior.

## Source-of-truth decision

The preferred Supabase CLI command was tested read-only against the linked project:

```powershell
npx --no-install supabase gen types typescript --project-id jdvxfxjpobtyasozxauh
```

The API returned `Project must be active and healthy.` The sprint will therefore check in a
generated-style schema contract derived from the repository's complete forward-only migration chain
(`001` through `010`). This is more reproducible than requiring a live remote project or local Docker
stack, and it keeps the type gate available in normal CI.

JSONB columns need application shapes that SQL introspection cannot infer. The contract will encode
the existing `StoredPlayer`, `StoredOptions`, committed-action, score-entry, and reap-trim shapes next
to the generated-style table and RPC definitions. `_shared/mod.ts` will re-export the existing public
type names so function imports do not churn.

## Design

### Schema contract

Create `supabase/functions/_shared/database.types.ts` as a type-only module containing:

- `Database.public.Tables` for `rooms`, `room_actions`, `match_scores`, `rate_limits`, and
  `room_seats`;
- exact `Row`, `Insert`, and `Update` shapes, including defaults and nullable columns;
- `Database.public.Functions` for `apply_room_reap`, `bump_rate_limit`, and
  `submit_room_action`;
- closed empty `Views`, `Enums`, and `CompositeTypes` maps;
- the structured JSONB contracts already enforced by Edge Function validation.

`RoomRow` becomes `Database['public']['Tables']['rooms']['Row']`, so it includes `seed`, `status`,
`active_player_index`, `turn`, `winner`, and `rematch_room_id` instead of describing only the five
columns used by one projection.

### Typed service client

`_shared/mod.ts` will import `SupabaseClient` from the already pinned
`@supabase/supabase-js@2.107.0` module, define `ServiceClient = SupabaseClient<Database>`, and call
`createClient<Database>()`. No package, import URL, lockfile, or dependency changes are needed.

The partial list-rooms query will use a truthful `Pick<RoomRow, ...>` projection rather than casting
five selected columns to a full row. Other Edge Function queries keep their current behavior and gain
inferred table, column, insert, update, and RPC argument types.

The pinned Supabase SDK validates selected columns through its result type rather than rejecting the
`.select()` call itself: an unknown projection produces `SelectQueryError<...>`. The compiler
contract therefore proves that this result cannot be consumed as typed room-row data. Table names,
insert/update payloads, RPC names, and RPC arguments remain direct call-site errors.

### Compiler sentinel

Create `supabase/functions/_shared/database.types.test.ts`. It will:

- reject `ServiceClient` if it regresses to `any`;
- use `@ts-expect-error` to prove an unknown table is rejected;
- use `@ts-expect-error` to prove an unknown room column is rejected;
- construct one complete `RoomRow`, making every current room column part of the checked contract.

These are compile-time obligations exercised by `deno test`, not source-text assertions.

## Alternatives rejected

### Keep `ServiceClient = any` and expand only `RoomRow`

This improves one annotation but leaves every `.from()`, `.select()`, `.insert()`, `.update()`, and
`.rpc()` call unchecked. It does not solve issue #59.

### Require remote type generation in CI

This couples CI to Supabase project availability and credentials, and the linked project is currently
unable to generate types. It would also leave JSONB application shapes as generic JSON.

### Start a local Supabase Docker stack solely to generate types

This adds a slow infrastructure prerequisite for a static contract already determined by committed
migrations. It provides no additional runtime assurance for this change.

## SMARTS decision

| Lens | Migration-derived typed contract | Remote generation gate | RoomRow-only patch |
|---|---|---|---|
| Scalable | All tables and RPCs share one boundary. | Central, but tied to one live project. | Each function keeps local casts. |
| Maintainable | One checked file follows forward migrations. | Generated output is easy to refresh when available. | The central client remains untyped. |
| Available | Works offline and in CI. | Currently blocked by project health. | Works, but leaves the root defect. |
| Reliable | Compiler rejects table, column, payload, and RPC drift. | Same when the remote is reachable. | Only hand-written row consumers improve. |
| Testable | Deno compile sentinels and 158 behavior tests. | Requires credentials to reproduce generation. | Cannot prove the client stopped being `any`. |
| Securable | Tightens service-role code without exposing tokens. | Adds credential-bearing generation to CI. | Leaves privileged writes unchecked. |

Verdict: **migration-derived typed contract, strong; confidence high.** Maintainable, Available,
Reliable, Testable, and Securable dominate. The remote generator can refresh the checked-in contract
later without changing this boundary design.

## Acceptance criteria

### AC-1: complete schema contract

- `Database` covers all five migrated tables and all three migrated RPCs.
- `rooms.Row` includes every column present after migration `010`, with `winner` and
  `rematch_room_id` nullable.
- JSONB fields use the existing structured application contracts rather than `any`.

### AC-2: typed service client

- `ServiceClient` is `SupabaseClient<Database>` and `getServiceClient()` creates that generic client.
- Unknown table names, invalid inserts/updates, and invalid RPC names or arguments are direct
  compiler errors.
- Unknown selected columns produce a `SelectQueryError` result that cannot be consumed as typed
  room-row data.
- No new explicit `any`, `deno-lint-ignore no-explicit-any`, or broad untyped client alias is added.

### AC-3: truthful row projections

- `RoomRow` derives from the full `rooms.Row` contract.
- The list-rooms projection uses `Pick<RoomRow, 'id' | 'code' | 'options' | 'players' |
  'created_at'>` and does not cast a partial select to `RoomRow[]`.

### AC-4: mutation-sensitive compiler proof

- Regressing `ServiceClient` to `any` makes the focused Deno check fail.
- Removing or renaming `active_player_index` makes the compiler fail in the submit-action path.
- Removing or renaming `rematch_room_id` makes the compiler fail in the restart-game path.
- Unknown table and room-property probes compile only because their expected errors remain present;
  an unknown selected-column result cannot be consumed as typed room-row data.
- Compiler sentinels pin the exact table/RPC key sets and signatures, structured JSONB non-`any`
  fields, required/nullable room columns, insert/update rejection, and all foreign-key metadata.

### AC-5: behavioral parity

- All 158 existing Edge Function tests remain green, plus the new schema-contract test.
- The full repository verification matrix remains green.
- HTTP bodies/statuses, database statements, authorization, and Realtime behavior are unchanged.

### AC-6: scope and landing

- No migration, Supabase deployment, client/shared runtime, package manifest, lockfile, CI workflow,
  or dependency change occurs.
- The PR closes #59, stays open until available checks are green, and is not merged or deployed.

## Non-goals

- Activating, linking, migrating, or deploying a Supabase project.
- Typing the browser Supabase client or replacing `client/src/lib/SupabaseTypes.ts`.
- Adding runtime JSON validation beyond the guards already in the Edge Functions.
- Changing schema, RLS, service-role privileges, endpoint behavior, or error messages.
- Resolving the pre-existing npm audit findings surfaced during worktree setup.
