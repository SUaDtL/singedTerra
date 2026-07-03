---
status: accepted
date: 2026-07-03
title: Split public seat-id from secret seat-token (authenticated actions)
decided-by: SUaDtL <brennonhuff@gmail.com>
supersedes: 0006
governs: supabase/functions/**, supabase/migrations/**, client/src/client/NetworkClient.ts, client/src/ui/Lobby.ts
---

# ADR-0009 — Split public seat-id from secret seat-token (authenticated actions)

## Status
Accepted (decided in-session 2026-07-03; supersedes ADR-0006's accepted-spoofing stance)

## Context
ADR-0006 accepted turn-action spoofing as a conscious trade-off, because `playerId` is publicly
readable. Tribunal finding appsec-001 (GH #83, CRITICAL) showed the exposure is broader than ADR-0006
weighed. The server-minted `playerId` serves double duty: it is both the public seat identifier (the
deterministic action-log key, and the display/turn identity every client needs) and the secret bearer
token every Edge Function trusts as proof of seat ownership. Because it lives in the `rooms.players`
JSONB — which is `anon`-`SELECT`able and Realtime-broadcast via `REPLICA IDENTITY FULL` — any anon-key
holder can read every seat's id. That id also authorizes the **non-turn-gated** functions
(`update_player`, `ready_up`, `leave_room`, `finish_game`) at any time, so an attacker can rename,
recolor, force-ready, eject, or record an arbitrary winner for any player — beyond the turn-gated
spoofing ADR-0006 accepted. A Postgres VIEW that hides the secret from `anon` `SELECT` is insufficient
because Realtime broadcasts the base-table row, not the view. The maintainer has elected to take the
minimal authenticated-actions step that ADR-0006 itself named as its successor.

## Decision
Split identity into two values:

1. **Public seat-id** (`players[].id`) — unchanged. Remains the deterministic action-log key and the
   display/turn identifier, still broadcast. Determinism and replay are unaffected.
2. **Secret per-seat token** — minted at `create_room`/`join_room`, returned once to the owning
   client, and stored in a new `room_seats` table whose RLS denies `anon` all access (service-role
   only). It never appears in any anon-readable path.

Every mutating Edge Function verifies, via a shared `verifySeatToken()` helper, that the presented
token maps to the acting seat before allowing the action. The action log continues to record the
public seat-id, so lockstep replay is untouched — the token is an authorization gate at the referee
only, never an engine input. The client persists the token in `localStorage` keyed by room id, which
also enables seat rejoin after refresh (unblocks #46).

## Alternatives considered
- **anon-restricted VIEW / column projection** — rejected: Realtime broadcasts the base-table row, so
  the secret still leaks over the subscription channel.
- **Narrow hardening (token-gate only the non-turn-gated functions)** — rejected: leaves turn-action
  spoofing intact; a partial fix that still fails the documented anti-impersonation control.
- **Full account auth / anonymous JWT** — rejected: still disproportionate at this stage; the seat
  token is the smaller authenticated-actions step ADR-0006 named as its successor.

## Consequences
Impersonation now requires the secret token, which is never in an anon-readable path, so the
"cannot act as another human" control actually holds. Determinism/replay unchanged. Every mutating
client request must now carry the token; a client that clears its `localStorage` loses the seat and
must re-join. One new table + RLS, a shared verifier, and a token field threaded through the mutating
functions and the client transport.

## Risks
A token leaked through a *different* channel (XSS, a logged request body, a shared link) still grants
seat control — the model narrows the exposure to the token, it does not make it unphishable. `localStorage`
persistence means the secret outlives the tab; a shared machine could hand a seat to the next user.
If the project later adds real accounts, this seat-token layer is subsumed by that auth and this ADR
would be superseded in turn.
