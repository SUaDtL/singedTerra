# First Strike Tactical Objective

**Status:** approved under the standing continuous-improvement goal
**Date:** 2026-08-14
**Initiative:** `career.initiative.0001`

## Player outcome

A signed-in Commander sees one useful next-deployment purpose: in a Verified
Deployment, damage the CPU within the first three human salvos. The player sees
the objective in the career/deployment path, concise live progress, and an
explicit achieved or not-yet result in the existing After Action Report.

## SMARTS decision

Options considered:

1. Persist objective selection or completion and award XP. Rejected: it creates
   an entitlement/history trust surface and requires a separate Auth, schema,
   migration, and integrity decision.
2. Repeat the existing First Salvo control coach. Rejected: it teaches input but
   gives returning Commanders no named tactical reason to deploy.
3. Add a fixed, client-only First Strike objective evaluated from the existing
   deterministic verified-duel state. Selected: S=5, M=5, A=5, R=5, T=5,
   Satisfaction=5, confidence high. It teaches wind/aim/power adjustment, is
   observable in the real match, grants no authority, and is removable without
   touching persisted progression.

## Contract

- The objective is exactly: **Damage the CPU within your first three salvos.**
- It appears only for an authenticated, active Verified Deployment. Ordinary
  local, Quick Duel, networked, anonymous, expired, failed, and casual-continued
  games remain unchanged.
- The objective begins active for each fresh or resumed verified deployment but
  is not written to localStorage, the transcript, an Edge request, a room row,
  or an account summary.
- The human-salvo count is the existing verified transcript length. A successful
  state is a positive CPU-health delta recorded from an accepted human fire to
  that same human salvo's settled state, while that count is at most three.
  Current CPU health alone is not evidence.
- A third shot remains active while it is FIRING or RESOLVING. The objective
  becomes missed as soon as that undamaged third shot has resolved to the CPU turn or a
  terminal state without CPU damage. Success wins precedence at every boundary.
- The HUD may present only public tactic state: objective label, remaining human
  salvos while active, and achieved/missed result. It must not reveal seed,
  session id, transcript, account data, or hidden target state.
- The After Action Report adds status text only. It must not add focusable
  actions, alter completion/retry behavior, obscure verified awards, or claim an
  XP/reward for First Strike.

## Acceptance criteria

1. The signed-in dossier and Verified Deployment brief name First Strike and its
   three-salvo rule before launch; no ordinary mode gains career-objective copy.
2. A pure observer reports active, achieved, or missed from deterministic
   state/transcript facts, including a third-shot hit that settles after fire.
3. HUD progress and terminal report copy are accessible, contained, and leave
   the existing report focus/action order unchanged.
4. Fresh, resumed, expiry-casual, failed, anonymous, local, Quick Duel, and
   networked paths expose no objective state or result.
5. Causal RED/GREEN tests, adversarial review, exact-head CI, Pages deployment,
   and authenticated production proof complete before acceptance.

## Boundaries

Client presentation and deterministic client observation only. No Auth behavior,
account-summary contract, XP, rank, entitlement, server verifier, Edge function,
database, migration, dependency, action kind, transcript field, physics, AI, or
network protocol change.
