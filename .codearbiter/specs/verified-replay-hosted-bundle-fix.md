# Verified replay hosted bundle fix

## Problem

The merged `verified_replay_probe` Edge Function passes local TypeScript and Deno checks, but Supabase's hosted bundler rejects extensionless relative imports in the reachable `shared/src` module graph. The function therefore cannot deploy.

## Bounded outcome

- Every relative import reachable from `supabase/functions/verified_replay_probe/index.ts` has an explicit file extension.
- A syntax-aware regression check fails if an extensionless relative import is reintroduced anywhere in that reachable graph.
- Existing client, engine, and Edge behavior remains unchanged.
- The hosted function bundles, deploys, rejects unauthenticated requests, and completes its authenticated deterministic replay probe.

## Out of scope

- Converting unrelated shared modules.
- Changing replay behavior, authentication, persistence, schemas, or dependencies.
- Cleaning the malformed legacy sprint log.

## Acceptance evidence

- RED: the new graph check reported 39 extensionless relative imports before production edits.
- GREEN: graph check, `deno check`, full deterministic checks, all Edge tests, all client tests, build, and dependency audit pass.
- One adversarial reviewer receives this spec, the plan, sprint evidence, test evidence, and final diff.
- Exact reviewed PR head is green before merge; the merged tree is deployed and production behavior is verified.
