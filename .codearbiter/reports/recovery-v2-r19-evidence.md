# Recovery V2 R19 evidence

Date: 2026-09-12

## Bounded result

R19 reconciles the current architecture, development operations, and stack
reference with the accepted R07, R08, and R14 source already present at
`04e690404d0a115f84cb60b52b6769574390882d`. It changes no runtime code,
migration, release manifest, workflow, package file, remote setting, database,
or deployment.

The corrected documentation distinguishes the three version domains:

- Ordinary `rulesetVersion` is the deterministic room options and replay
  contract. `supabase/functions/_shared/ruleset.ts` accepts stored and requested
  versions 1 through 4, and `client/src/client/networkRuleset.ts` makes v4 the
  current new-room version.
- Ordinary `commandProtocolVersion` is the command-envelope and idempotency
  contract. `shared/src/net/roomCommand.ts` defines current v2 identity and
  revision metadata, while `supabase/functions/_shared/commandProtocol.ts`
  accepts legacy v1 and current v2.
- Verified Deployment uses a separate
  `contract/engine/ruleset` tuple. `shared/src/net/verifiedDuel.ts` dispatches
  `2/2/4` to CPU policy 2 and `3/3/4` to CPU policy 3. The legacy constants in
  `supabase/functions/_shared/verifiedDeployment.ts` retain `2/2/4` for their
  callers; the current start and completion handlers additionally accept the
  v3 capability.

`join_room` compares both ordinary values before a roster mutation, and the
v2 client supplies both on creation and join. This is the source basis for
AC-062: an incompatible active session receives a typed mismatch instead of a
silent replay through newer semantics.

`complete_verified_deployment` recognizes a completed historical `1/1/3`
context as an immutable receipt and returns it without replay. It replays only
accepted active `2/2/4` or `3/3/4` contexts. This preserves AC-063 without
claiming that old active sessions can run under the current engine.

V1 is the legacy drain boundary. Before V2 admission is enabled, V1 must be
disabled and drained. V2 and V3 have independent admission controls and may
both admit sessions. An unexpired active V2 or V3 session resumes only when the
client advertises that exact accepted tuple, even if new starts are disabled.
For a new session, migration 020 selects the highest enabled tuple the client
advertised.

For AC-064, migration 022 fixes every casual score receipt to
`casual_participant_reported`; `claim_match` returns that label and the client
rejects another explicit evidence tier. This account linkage never creates a
verified reward or modifies verified progression.

## Release and rollout boundary

`package.json` makes `npm run backend:release:check` the credential-free
proposal validator. The credentialed `npm run deploy:backend` validates first,
then applies migrations, noninteractive configuration, and the manifest's
explicit function inventory. `deploy` is an alias for that backend command,
not a combined backend/client release.

R14 supplies a protected workflow and local evidence only. No
`production-backend` environment or settings proof is recorded in this recovery,
and no backend deployment is claimed. The required sequence remains: deploy and
prove the compatible backend capability first, then obtain owner approval for a
client-bearing merge. That merge automatically triggers Pages publication; it
does not replace backend deployment.

## Verification and receipt

| Field | Value |
| --- | --- |
| Task | R19 |
| Base/result source | `04e690404d0a115f84cb60b52b6769574390882d` |
| Original author | `01a09691-0475-7483-931e-017463771366`, assigned `gpt-5.6-terra/high`. This correction does not attribute its own work to that author. |
| R19 candidate paths | `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, `.codearbiter/tech-stack.md`, and this receipt. The coexistence correction leases only `docs/ARCHITECTURE.md` and this receipt. |
| Original author commands | Transcript: `C:\Users\brenn\.codex\sessions\2026\09\12\rollout-2026-09-12T13-01-21-01a09691-0475-7483-931e-017463771366.jsonl`. `exec-13c1aa6e-5ed3-44f9-afe4-4332dc261e99` ran the `Select-String` `$sourceChecks` script for `networkRuleset`, `roomCommand`, `commandProtocol`, `join_room`, `verifiedDuel`, completion, claim, package, and workflow assertions, exit `0`. `exec-07e06cd5-78fd-4c3f-9a02-7f18a1bbbce6` ran `git diff --check` plus the candidate diff, exit `0`. `exec-75050d64-409c-4cbb-bb6c-7165c8ba5c63` ran `python "C:\Users\brenn\.codex\plugins\cache\codearbiter\ca-codex\0.9.10\hooks\preview.py" secrets`, exit `0`, stdout `[]`. `exec-4eecd8e6-5b1d-4b6f-a380-1d1008f466c2` ran the anti-slop dash check, exit `0`; `exec-9e0ea4e8-fcc6-4f2d-a4e8-5afe591d9bb6` ran the trailing-whitespace and Git blob-hash check, exit `0`. No install, build, full check, Edge check, database, browser, remote, or deployment command was run by the original author. |
| AC-062 proof inputs | `supabase/functions/join_room/index.ts`, `client/src/client/LobbyRoomController.ts`, `client/src/client/gameEngineOptions.ts`, `client/src/client/NetworkClient.ts`, and `supabase/migrations/021_atomic_room_commands.sql`. These show pre-mutation compatibility rejection, client refusal of incompatible rooms, engine construction refusal, action submission versions, and the database RPC's version checks. |
| Separate parent integration result | `npm run check:edge` exited `0` with `393 passed` and `0 failed`; log: `C:\Users\brenn\AppData\Local\Temp\recovery-v2-r19-integrated-edge.log`. This was not an original-author command. |
| Review | BLOCKED pending a fresh independent Sol/high review after this correction. |
| Risks | Source alignment is local. R04 hosted proof, R05 settings proof, the protected environment, and production backend capability evidence remain pending. |
| Rollback | Revert these four documentation paths to the last accurate version. No runtime state or receipt changes need rollback. |
