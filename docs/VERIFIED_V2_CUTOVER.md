# Verified V2 cutover and forward recovery

The battle-console branch includes commit `209b7c6`, which changes network rules to V4 and verified deployment to contract 2 / engine 2 / ruleset 4. Publish the client only after the matching backend is ready. Merging to `main` automatically starts GitHub Pages deployment; opening a PR does not.

This procedure follows the forward-only migration policy in [the migration conventions](../supabase/migrations/README.md). It preserves V1 records and avoids replaying V1 evidence with the V2 engine. Do not revert migration 017, delete results, or re-enable V1 after the transition.

## Observed production state

Read-only inspection on 2026-09-07 of project `jdvxfxjpobtyasozxauh` found migrations 001 through 016, with 017 absent. Downloaded `start_verified_deployment` source declares contract 1 / engine 1 / ruleset 3. V1 admissions are enabled, with zero unexpired verified sessions; its recorded `safe_after` is 2026-08-15 10:21:21 UTC.

There are 13 unfinished network room records: eight active legacy rooms, three active V2 rooms, and two waiting V2 rooms. Their latest action is dated 2026-08-15 07:05:51 UTC. These records do not establish that players are currently connected. Repeat the aggregate checks immediately before cutover; do not delete or cancel these rooms.

## Preparation and impact checks

Run from the reviewed checkout using its lockfile-pinned CLI (`npx --no-install supabase`). Verify `git rev-parse HEAD` and the linked project before any mutation. If this checkout is not linked, `supabase link --project-ref jdvxfxjpobtyasozxauh` creates local connection metadata. Do not copy credentials into commands, files, receipts, or logs. CLI credentials stay in their configured store; the optional Node operator scripts consume runtime environment credentials.

Read-only commands:

```powershell
npx --no-install supabase migration list --linked
npx --no-install supabase functions list --project-ref jdvxfxjpobtyasozxauh
npx --no-install supabase db query --linked "SELECT * FROM public.verified_deployment_drain_status(1::smallint);"
npx --no-install supabase db query --linked "SELECT status, options->>'rulesetVersion' AS ruleset_version, count(*) AS rooms FROM public.rooms WHERE status IN ('waiting','active') GROUP BY status, options->>'rulesetVersion';"
npx --no-install supabase db query --linked "SELECT max(a.created_at) AS latest_unfinished_action FROM public.room_actions a JOIN public.rooms r ON r.id=a.room_id WHERE r.status IN ('waiting','active');"
```

The new client refuses incompatible old rooms and rematches. Already-open old clients retain their old engine; the updated network referees continue accepting versions 1 through 4. Let those players finish in their existing tabs. A browser reload switches to the new client, which cannot join the old room. If fresh activity indicates users are affected, present this concrete impact and arrange a cutover window before publishing. Do not force refreshes or cancel sessions.

## Ordered cutover

1. Open the PR and finish exact-head review and CI. Keep it unmerged until backend readiness is recorded.
2. Disable only new V1 verified admissions:

   ```powershell
   npx --no-install supabase db query --linked "SELECT contract_version, starts_enabled FROM public.set_verified_deployment_starts(1::smallint, false);"
   npx --no-install supabase db query --linked "SELECT * FROM public.verified_deployment_drain_status(1::smallint);"
   ```

   Keep V1 functions and client serving existing sessions until `starts_enabled=false`, `unexpired_sessions=0`, and database time has reached `safe_after`. Poll status without changing active rows. The maximum session lifetime is 30 minutes; an old last start can already satisfy the time condition. Existing sessions may finish or expire normally. Do not deploy V2 replay code while V1 sessions remain eligible.
3. Run `npx --no-install supabase db push --dry-run --linked`. It must list only the reviewed pending migration 017. Stop on unexpected migrations. Apply with `npx --no-install supabase db push --linked`, then confirm 017 appears remotely and V2 starts remain disabled. Constraint replacement takes table locks and validates existing rows; execute during the drained window. Do not retry an uncertain result before checking the migration history.
4. Deploy the complete dependency closure from the same reviewed commit:

   ```powershell
   npx --no-install supabase functions deploy create_room join_room submit_action restart_game start_verified_deployment abandon_verified_deployment complete_verified_deployment account_summary verified_replay_probe --use-api --project-ref jdvxfxjpobtyasozxauh
   ```

   Record the deployed function versions and source revision. Do not change JWT verification, RLS, grants, or runtime secrets. The existing manual workflow can apply migration/functions but does not implement the drain or proof gates; it is not a substitute for these steps.
5. Run the authenticated, non-awarding `verified-replay-runtime` diagnostic against the updated backend using the reviewed client preview. Require both fixed replay workloads to pass. Check V4 room creation/join/fire/rematch with test participants, and retain sanitized evidence. Keep V2 admissions disabled if any check fails.
6. Merge only the exact reviewed green head, wait for Pages deployment, then confirm the deployed client build and basic local/online operation. Old-client account presentation can fail closed during this version transition because `account_summary` now returns V2 evidence; this does not alter stored results.
7. Recheck both drain statuses, then enable V2 using the SQL guard:

   ```powershell
   npx --no-install supabase db query --linked "SELECT contract_version, starts_enabled FROM public.set_verified_deployment_starts(2::smallint, true);"
   npx --no-install supabase db query --linked "SELECT * FROM public.verified_deployment_drain_status(2::smallint);"
   ```

   The guard requires V1 disabled and drained. Do not bypass it. Complete one authorized production V2 deployment and retry the identical completion evidence; verify one immutable award and the same receipt. Retain only sanitized results, not identities, tokens, or raw network headers.

## Forward recovery

Before migration 017, a failed preflight leaves V1 serving existing sessions. Keep new starts disabled while correcting the issue; no database rollback is required. Do not apply 017 until the reviewed cutover can proceed.

After migration 017, retain the widened version constraints and historical records. On a partial function deployment or failed replay proof, leave V2 disabled, keep Pages on the prior release, and redeploy the full nine-function closure from the reviewed V2 commit after correcting the fault. Never deploy the V1 verifier against newly admitted V2 sessions.

If a fault appears after V2 admission, stop new admissions immediately:

```powershell
npx --no-install supabase db query --linked "SELECT contract_version, starts_enabled FROM public.set_verified_deployment_starts(2::smallint, false);"
npx --no-install supabase db query --linked "SELECT * FROM public.verified_deployment_drain_status(2::smallint);"
```

Keep compatible V2 resume/completion handlers available so active sessions can finish. Do not cancel them or rewrite their transcript, status, expiry, result, or progression. Wait for zero unexpired V2 sessions and `safe_after` before a change to replay semantics. A semantics-preserving bug fix can redeploy the same V2 contract after its regression and replay checks pass. A change to deterministic semantics needs a new versioned contract and its own drain, not silent mutation of V2.

Recover frontend failures by deploying a known-good client compatible with contract 2 / engine 2 / ruleset 4. Do not use the pre-transition V1 client as a functional rollback. If no compatible build is available, leave verified starts disabled while shipping a forward fix; ordinary local play remains available. Preserve a compatible built artifact and its commit/deployment IDs before enabling V2.

For a schema defect, author a new numbered migration that repairs the object while preserving immutable receipts and existing ACLs. Do not edit applied 017 or restore an older database snapshot over newer awards. Apply the repair only after review and drain checks, rerun hosted replay and receipt-idempotency proof, then re-enable admissions through the guarded RPC. Record the incident, exact repair revision, migration history, function versions, Pages deployment, and admission status before declaring recovery complete.
