# P11 terminal facts and same-scenario experiment

**Approval:** The maintainer's authorized improvement campaign continuation,
relayed for this isolated worktree, approves this bounded P11 specification.

## Problem

An ordinary local After Action Report shows final standings and a generic Play
again action, but it does not identify the evidence-backed clinching round or
make clear that local restart repeats the current scenario.

## Decision

For an ordinary hot-seat terminal report with no Field Order result, show a
non-focusable factual clinching-round sentence only when the terminal state
proves that the final round winner also clinched the match. Pair it with one
fixed experiment: keep power fixed, change the opening angle, and compare where
the first shot lands. Relabel the existing local restart action `Replay same
scenario`.

## Scope and boundaries

- The existing `HUD.terminalProjection` remains the sole projection owner and
  `TerminalMatchView` remains the sole terminal/focus/isolation owner.
- Accepted facts are terminal `winner`/`winnerTeam`, `lastRoundWinnerId`/
  `lastRoundWinnerTeam`, `round`, `totalRounds`, and existing `roundWins`.
- A single-round outcome, draw/tie, missing winner, or mismatch between final
  round winner and match winner has no clinching explanation. P11 does not
  infer a shot, weapon, aim error, comeback, or cause from aggregate scores.
- P11 applies only to ordinary hot-seat terminal reports. Verified reports,
  network rematches, P03 practice Field Orders, and all existing terminal
  actions/identity/focus behavior retain their current presentation.
- No telemetry, persistence, reward, objective, new controller/framework,
  networking, dependency, or P04 tactical-challenge content is added.

## Acceptance criteria

1. A proven multi-round clinch renders an exact, factual round explanation;
   team wording uses the winning team. One-round, draw/tie, and final-round /
   match-winner mismatch cases render no invented explanation.
2. Eligible ordinary local reports render one non-focusable fixed experiment
   and label the existing restart action `Replay same scenario`.
3. Existing P03 Field Order, verified next-order/retry, and network terminal
   projection/action identity remain unchanged.
4. Restart continues to invoke the existing local same-config path; keyboard,
   touch, focus trap, and Main Menu behavior retain their existing owners.

## Evidence boundary

Source tests can prove factual projection, same-config routing, and accessible
controls. They cannot prove that players understand the explanation, attempt
the experiment, or replay voluntarily.
