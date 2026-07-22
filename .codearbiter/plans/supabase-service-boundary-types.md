# Supabase Service Boundary Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` and
> `superpowers:subagent-driven-development`; codeArbiter owns the final commit.
> **Status:** APPROVED — 2026-07-22.

**Goal:** Replace the Edge Function service client's `any` boundary with a complete,
migration-derived `Database` contract that Deno checks on every test run.

**Architecture:** A type-only `_shared/database.types.ts` owns table, RPC, and structured JSONB
contracts from migrations `001` through `010`. `_shared/mod.ts` creates
`SupabaseClient<Database>` and re-exports existing domain type names; one compile sentinel proves
the boundary is closed, while the list-rooms path uses a truthful partial-row projection.

**Tech stack:** Deno TypeScript, pinned `@supabase/supabase-js@2.107.0`, existing Deno tests and npm
verification commands; no new dependency or remote project requirement.

## Global constraints

- Do not run a migration, deploy Supabase, start Docker, or alter the remote project.
- Do not change endpoint behavior, HTTP output, SQL operations, RLS, authorization, or Realtime.
- Do not land explicit `any`, a `no-explicit-any` suppression, an unparameterized
  `SupabaseClient`, or a type cast that recreates the untyped service boundary. The temporary
  mutation proofs in Step 7 are the only exception and must be restored before GREEN.
- Keep all database schema types inside `supabase/functions/_shared/`; do not import browser or
  `shared/` engine modules into Deno.
- Encode the schema after migrations `001` through `010`, including all five tables and three RPCs.
- Preserve existing `_shared/mod.ts` type import names through type-only re-exports.
- No package manifest, lockfile, client/shared runtime, migration, workflow, or dependency change.
- codeArbiter owns commits; workers leave changes uncommitted.

## File map

- Create `supabase/functions/_shared/database.types.ts`: migration-derived `Database`, table rows,
  inserts/updates, relationships, RPCs, and structured JSONB contracts.
- Create `supabase/functions/_shared/database.types.test.ts`: compile-time non-`any`, unknown-table,
  unknown-column, and full-room-row sentinel plus one runtime Deno test registration.
- Modify `supabase/functions/_shared/mod.ts`: typed SDK import, generic client creation, and type
  re-exports; remove duplicate local stored-row declarations.
- Modify `supabase/functions/list_rooms/mapRoom.ts`: export a truthful five-column `ListedRoomRow`.
- Modify `supabase/functions/list_rooms/index.ts`: consume inferred partial rows without a full-row
  cast.
- Modify `supabase/functions/list_rooms/list_rooms.test.ts`: build `ListedRoomRow` fixtures instead
  of incomplete `RoomRow` fixtures.
- Append decisions and receipts to `.codearbiter/sprint-log.md`.

## Ledger

| ID | Deliverable | Depends on | Proof | Status |
|---|---|---|---|---|
| T1 | Migration-derived schema and typed service boundary | — | compiler REDs, 159-test Edge GREEN | ACCEPTED |
| T2 | Review closure, governed commit, PR, and green CI | T1 | full matrix, review fleet, commit/PR gates | IN_PROGRESS |

---

### Task 1: Close the Edge Function database type boundary

**Files:**

- Create: `supabase/functions/_shared/database.types.ts`
- Create: `supabase/functions/_shared/database.types.test.ts`
- Modify: `supabase/functions/_shared/mod.ts`
- Modify: `supabase/functions/list_rooms/mapRoom.ts`
- Modify: `supabase/functions/list_rooms/index.ts`
- Modify: `supabase/functions/list_rooms/list_rooms.test.ts`

**Interfaces:**

- Produces `Database`, `RoomRow`, `StoredPlayer`, `StoredOptions`, `StoredAction`,
  `StoredScoreEntry`, and `RoomReapTrim` from `_shared/database.types.ts`.
- Preserves imports of `ServiceClient`, `RoomRow`, `StoredPlayer`, and `StoredOptions` from
  `_shared/mod.ts` through type-only re-exports.
- Produces `ListedRoomRow = Pick<RoomRow, 'id' | 'code' | 'options' | 'players' |
  'created_at'>` from `list_rooms/mapRoom.ts`.

- [x] **Step 1: Write the failing compiler sentinel**

Create `supabase/functions/_shared/database.types.test.ts` with the following obligations:

- reject `ServiceClient` if it regresses to `any` or an unparameterized client;
- pin the exact five-table and three-RPC key sets and all RPC argument/return signatures;
- reject unknown tables, invalid inserts/updates, invalid RPC names, and invalid RPC arguments;
- prove an unknown selected column yields an error result that cannot be consumed as room-row data;
- pin structured JSONB fields as non-`any`, room requiredness/nullability, and every relationship's
  name, columns, referenced relation/columns, and cardinality;
- construct one complete `RoomRow`, making every current room column part of the checked contract.

```ts
import type {
  Database,
  RoomRow,
  ServiceClient,
  StoredOptions,
  StoredPlayer,
} from './mod.ts'

type IsAny<T> = 0 extends (1 & T) ? true : false
type AssertFalse<T extends false> = T
type _ServiceClientMustNotBeAny = AssertFalse<IsAny<ServiceClient>>

function unknownTableIsRejected(client: ServiceClient): void {
  // @ts-expect-error The migration contract is a closed table-name set.
  client.from('missing_table')
}

function unknownRoomColumnIsRejected(room: RoomRow): void {
  // @ts-expect-error Columns absent from migrations must not compile.
  void room.missing_column
}

void unknownTableIsRejected
void unknownRoomColumnIsRejected

const options: StoredOptions = {
  maxPlayers: 3,
  maxWind: 7,
  gravity: 0.2,
  visibility: 'public',
  rounds: 3,
  armsLevel: 2,
  interestRate: 0.15,
  suddenDeathTurn: 12,
}

const players: StoredPlayer[] = [
  { id: 'human-1', name: 'Alice', color: '#e84d4d', ready: true, lastSeen: 100 },
  { id: 'bot-1', name: 'CPU', color: '#4d8ce8', ready: true, lastSeen: 100, ai: 'medium' },
]

const fullRoom: RoomRow = {
  id: '00000000-0000-4000-8000-000000000001',
  code: 'ABCD',
  seed: 42,
  status: 'waiting',
  options,
  players,
  active_player_index: 0,
  turn: 0,
  winner: null,
  created_at: '2026-07-22T00:00:00.000Z',
  rematch_room_id: null,
}

Deno.test('Database exposes the complete current rooms row', () => {
  const table: keyof Database['public']['Tables'] = 'rooms'
  if (table !== 'rooms' || fullRoom.active_player_index !== 0 || fullRoom.rematch_room_id !== null) {
    throw new Error('rooms contract mismatch')
  }
})
```

- [x] **Step 2: Run the sentinel to verify RED**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/database.types.test.ts
```

Expected: non-zero compile result because current `ServiceClient` is `any`, `RoomRow` lacks the full
column set, and `Database` is not exported. Record the exact diagnostics before implementation.

- [x] **Step 3: Add the migration-derived schema contract**

Create `supabase/functions/_shared/database.types.ts` with no runtime imports. Use these exact
structured JSONB contracts:

```ts
export type RoomStatus = 'waiting' | 'active' | 'finished'

export interface StoredPlayer {
  id: string
  name: string
  color: string
  ready: boolean
  lastSeen?: number
  ai?: 'easy' | 'medium' | 'hard'
}

export interface StoredOptions {
  maxPlayers: number
  maxWind: number
  gravity: number
  visibility?: 'public' | 'private'
  rounds?: number
  armsLevel?: number
  interestRate?: number
  suddenDeathTurn?: number
}

export type StoredAction =
  | { type: 'fire'; angle: number; power: number; weapon: string }
  | { type: 'use_shield' }
  | { type: 'buy'; weapon?: string; accessory?: string; tankId?: string }
  | { type: 'next_round' }

export interface StoredScoreEntry {
  tankId: string
  playerName: string
  roundWins: number
  kills: number
  totalDamage: number
}

export interface RoomReapTrim {
  id: string
  players: StoredPlayer[]
}
```

Define `Database.public.Tables` with the exact field matrix below. `Insert` makes only database-
defaulted or nullable fields optional; `Update` makes every field optional.

| Table | Row fields | Required Insert fields |
|---|---|---|
| `rooms` | `id:string`, `code:string`, `seed:number`, `status:RoomStatus`, `options:StoredOptions`, `players:StoredPlayer[]`, `active_player_index:number`, `turn:number`, `winner:string\|null`, `created_at:string`, `rematch_room_id:string\|null` | `code`, `seed` |
| `room_actions` | `id:string`, `room_id:string`, `seq:number`, `player_id:string`, `action:StoredAction`, `created_at:string` | `room_id`, `seq`, `player_id`, `action` |
| `match_scores` | `id:string`, `room_id:string`, `winner:string\|null`, `rounds:number`, `scoreboard:StoredScoreEntry[]`, `created_at:string` | `room_id`, `rounds`, `scoreboard` |
| `rate_limits` | `bucket:string`, `window_start:number`, `count:number` | `bucket`, `window_start` |
| `room_seats` | `room_id:string`, `seat_id:string`, `token:string`, `created_at:string` | `room_id`, `seat_id`, `token` |

Use the actual foreign-key relationships:

- `rooms.rematch_room_id -> rooms.id`;
- `room_actions.room_id -> rooms.id`;
- `match_scores.room_id -> rooms.id`;
- `room_seats.room_id -> rooms.id`.

Define the exact RPC contracts:

```ts
Functions: {
  apply_room_reap: {
    Args: { p_dead: string[]; p_trims: RoomReapTrim[] }
    Returns: undefined
  }
  bump_rate_limit: {
    Args: { p_bucket: string; p_window: number }
    Returns: number
  }
  submit_room_action: {
    Args: {
      p_room_id: string
      p_player_id: string
      p_action: StoredAction
      p_ends_turn: boolean
      p_next_index: number
      p_next_turn: number
    }
    Returns: number
  }
}
```

Set `Views`, `Enums`, and `CompositeTypes` to closed empty maps. Export:

```ts
export type RoomRow = Database['public']['Tables']['rooms']['Row']
```

- [x] **Step 4: Parameterize the service client and preserve public type names**

In `supabase/functions/_shared/mod.ts`, change the SDK and schema imports to:

```ts
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2.107.0'
import type { Database } from './database.types.ts'

export type {
  Database,
  RoomRow,
  StoredAction,
  StoredOptions,
  StoredPlayer,
  StoredScoreEntry,
  RoomReapTrim,
} from './database.types.ts'
```

Replace the untyped alias and constructor with:

```ts
export type ServiceClient = SupabaseClient<Database>

// inside getServiceClient()
_serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey)
```

Delete the duplicate local `StoredPlayer`, `StoredOptions`, and `RoomRow` declarations. Keep their
existing documentation either on the canonical types or in a short re-export comment. Do not change
the import URL or service-client cache lifecycle.

- [x] **Step 5: Make the list-rooms projection truthful**

In `supabase/functions/list_rooms/mapRoom.ts`, export and consume:

```ts
export type ListedRoomRow = Pick<
  RoomRow,
  'id' | 'code' | 'options' | 'players' | 'created_at'
>

export function mapListedRoom(row: ListedRoomRow, fresh: StoredPlayer[]): ListedRoom {
  // existing body unchanged
}
```

In `supabase/functions/list_rooms/index.ts`, import `ListedRoomRow` and replace the assertion with:

```ts
const rows: ListedRoomRow[] = candidates ?? []
```

In `supabase/functions/list_rooms/list_rooms.test.ts`, type the `room()` fixture as
`ListedRoomRow`, remove its incomplete `as RoomRow` assertion, and leave all behavioral expected
values unchanged.

- [x] **Step 6: Run the focused contract and Edge suite GREEN**

Run:

```powershell
deno test --allow-env supabase/functions/_shared/database.types.test.ts
npm run check:edge
```

Expected: focused 1/1 and full Edge 159/159. If the generic client exposes a real mismatch in an
existing function, correct only the local type or payload to match the unchanged runtime value. Do
not broaden `Database`, add `any`, or change behavior to silence the compiler.

- [x] **Step 7: Prove the compiler gate against independent mutations**

Apply and restore one invariant at a time, running `npm run check:edge` after each:

1. change `ServiceClient` back to `any`; expect the non-`any` assertion and unknown-table
   `@ts-expect-error` sentinel to fail compilation;
2. remove `active_player_index` from `rooms.Row`; expect the full-row sentinel and
   `submit_action/index.ts` to fail compilation;
3. remove `rematch_room_id` from `rooms.Row`; expect the full-row sentinel and
   `restart_game/index.ts` to fail compilation;
4. widen `ServiceClient` to unparameterized `SupabaseClient`; expect the unknown-table sentinel to
   report an unused `@ts-expect-error`.

Also prove that an unknown selected-column result cannot be assigned to the typed rooms-row result
shape; the pinned SDK reports the invalid projection through `SelectQueryError`, not at the
`.select()` call site.

Restore exact source after every mutation and rerun focused GREEN. Record the actual diagnostics.

- [x] **Step 8: Run task verification and request fresh task review**

```powershell
npm run check:edge
npm run typecheck
git diff --check
git diff --exit-code origin/main -- package.json client/package.json shared/package.json package-lock.json supabase/migrations .github/workflows
```

Task review must return spec compliance and code quality approval. Resolve every Critical/Important
finding and re-review before T1 is accepted.

---

### Task 2: Whole-branch verification and landing

- [x] **Step 1: Run final whole-diff review and coverage audit**

Provide the base-to-worktree diff, approved spec, plan, compiler RED receipts, and task report to
fresh reviewers. Zero Critical/Important and zero Critical/High/Medium coverage findings may remain.

- [x] **Step 2: Run the fresh full matrix**

```powershell
npm run check
npm run test:client
npm run coverage:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
git diff --exit-code origin/main -- package.json client/package.json shared/package.json package-lock.json supabase/migrations .github/workflows
```

- [x] **Step 3: Append receipts and run `$ca-commit`**

Record SMARTS, remote-generation availability, compiler mutation REDs, GREEN counts, reviews, and
protected-path hashes. Stage only the approved spec, plan, sprint receipt, schema/type files, and any
compiler-required Edge type-consumer edits. Classify as `refactor(supabase)` and use `Closes #59`.

- [ ] **Step 4: Run `$ca-pr`, PR coverage audit, and `$ca-watch`**

Open a ready PR that explains the migration-derived source and behavior-neutral boundary change.
Resolve PR-level coverage findings, push only reviewed fixes, and watch all available checks to
green. Do not merge or deploy.
