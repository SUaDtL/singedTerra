# Authenticated lobby identity coherence plan

**Status:** Approved under standing sprint authority on 2026-08-11
**Spec:** `.codearbiter/specs/authenticated-lobby-identity.md`

| ID | Work | Verification | Status |
|---|---|---|---|
| T-01 | Add account-state and online-form RED tests for initial/later profile defaults, editable precedence, profile refresh, sign-out privacy, anonymous behavior, and over-limit names. | Focused Lobby tests fail on absent provenance/default behavior. | ACCEPTED |
| T-02 | Add a victory-report RED test for the actual rendered hidden state. | The handoff reports a non-none computed display before correction. | ACCEPTED |
| T-03 | Implement explicit online-name provenance and account-state synchronization without changing seat authorization. | T-01 tests pass without weakening existing transport assertions. | ACCEPTED |
| T-04 | Make the hidden progression handoff override its authored grid layout. | T-02 and existing anonymous handoff tests pass. | ACCEPTED |
| T-05 | Run focused tests, typecheck, full client/engine/Edge/build/audit gates, and rendered browser checks. | Fresh outputs are green and recorded. | ACCEPTED |
| T-06 | Freeze spec, plan, sprint log, RED/GREEN evidence, tests, and exact diff for adversarial and auth-boundary review; remediate every blocker. | Exact-final reviewers return no Critical, High, or merge blocker. | ACCEPTED |
| T-07 | Close the preceding diagnostics production receipt, commit through the sanctioned gate, open a PR, require exact-head hosted green, merge under standing authority, publish Pages, and verify production. | Reviewed tree equals merged tree; exact-main deployment and live behavior pass. | IN PROGRESS |

## Test order

T-01 and T-02 establish causal RED before production edits. T-03 and T-04 are the minimum GREEN implementation. T-05 through T-07 are mandatory verification and delivery work.

## Boundary proof

The slice modifies client state synchronization, client validation, HUD CSS, tests, and governance evidence only. It does not alter Auth, JWT handling, room authorization, seat-token storage, Edge contracts, database state, dependencies, or secrets.
