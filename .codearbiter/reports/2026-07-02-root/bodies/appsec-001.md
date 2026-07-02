# Secret player-identity token (playerId) is world-readable via anon SELECT on rooms.players, defeating the referee's anti-impersonation gating

**Severity:** critical  |  **Confidence:** 0.85  |  **Effort:** L

**Where:**
- supabase/migrations/001_init.sql:56-76
- supabase/functions/join_room/index.ts:132-138
- client/src/client/NetworkClient.ts:682-712
- supabase/functions/submit_action/validate.ts:236-269

**Evidence:** The security model treats `playerId` (a server-minted crypto.randomUUID) as an unforgeable bearer identity: `submit_action/validate.ts` `authorizeAction()` rejects acting for another human unless `actingId === playerId`, and leave/update/ready/heartbeat all trust the body `playerId` as proof of identity. But that token is stored inside `rooms.players` JSONB (`{id,name,color,...}`) and the `rooms` table has `CREATE POLICY rooms_select_public ... FOR SELECT TO anon USING (true)` (001_init.sql:72-76) plus `REPLICA IDENTITY FULL` (line 56) so Realtime broadcasts the full row. Any holder of the (public-by-design, bundle-shipped) anon key can `select players from rooms` and read every seat's secret id. `NetworkClient.ts:682-712` does exactly this read over the anon client, and `join_room` returns every existing member's `id` to any joiner (index.ts:137). With a victim's id an attacker sets `playerId=actingId=victimId` and passes the membership + turn-ownership + "cannot act for another human" checks in `authorizeAction`, i.e. fires/shields/buys AS the victim, and can `leave_room`/`update_player`/`ready_up` on the victim's behalf.

**Impact:** Full cross-player impersonation and griefing on every networked room: submit turn actions as another human (bricking their turn / forcing bad shots), rename/recolor them, ready them up, or eject them from a waiting room. The documented load-bearing control ("a client cannot impersonate another human") does not hold, because its secret is public.

**Recommendation:** Stop exposing the identity secret through the public read path: either (a) split identity into a secret `token` never stored in the client-readable `players` array (keep only a public opaque seat id / display fields in rooms.players, hold the auth token in a service-only column or table), or (b) restrict the anon SELECT to non-secret columns via a VIEW / column projection and have clients read only that view. Do not rely on obscurity of the UUID. Route the model change via /ca:reconcile against ADR-0006 (ephemeral identity) since that ADR assumes the token is not disclosed.

**Acceptance criteria:**
- No code path reachable with only the anon key returns another player's authentication/identity token
- authorizeAction's "cannot act for another human" guard is backed by a secret the requester cannot obtain from a public read
- A test asserts a client holding only room-public data cannot submit an action authorized as a seat it does not own

<!-- dedup_key: appsec:supabase/migrations/001_init.sql:playerid-identity-token-world-readable · finding: appsec-001 -->
