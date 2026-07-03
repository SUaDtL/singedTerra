---
status: accepted
date: 2026-06-21
title: No end-user auth — ephemeral identity, trust-client
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: none
governs: supabase/functions/**, supabase/migrations/**
---

# ADR-0006 — No end-user auth — ephemeral identity, trust-client

## Status
Accepted (formalizes the strategic-direction decision; recorded 2026-06-21)

## Context
singedTerra is a casual browser game with no accounts and no PII. Adding authentication would add
friction and a credential-management burden disproportionate to the stakes.

## Decision
**No end-user authentication** — no login, no Supabase Auth (GoTrue), no JWT verification. Identity is
a server-minted `crypto.randomUUID()` `playerId` issued at room create/join and passed in the request
body. The load-bearing control is the **database layer**: RLS denies all `anon` writes; every mutation
goes through a `service_role` Edge Function referee, and the service-role key never reaches the client.

## Alternatives considered
- **Full auth (accounts/JWT)** — friction + maintenance unjustified at this stage; rejected.
- **Anonymous JWTs** — adds a token lifecycle for little gain given RLS already gates writes; rejected.

## Consequences
Zero-friction play; no PII to protect. Accepted **Spoofing** consequence: `playerId` is visible in the
publicly-`SELECT`able action log, so a reader could submit an action *as* another player on that
player's turn — bounded by the turn-gate + `UNIQUE(room_id, seq)` + bot-only-proxy, and confined to a
casual room. See `.codearbiter/checkpoints/threat-model-public-2026-06-21.md`.

## Risks
If stakes ever rise (ranked play, accounts), the trust-client model needs revisiting — the mitigation
is signed/authenticated actions. This ADR would then be superseded.
