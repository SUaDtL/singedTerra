# Public Room Browser Rules Context

## Problem

Public room rows currently show rounds, arms tier, and CPU count, but omit two already-supported match options: interest rate and sudden-death turn. Players can join a room without seeing those rules.

## Bounded outcome

The `list_rooms` public projection carries `interestRate` and `suddenDeathTurn` with safe legacy defaults, and the browser row renders concise labels for both options. Zero/absent values remain clearly represented as disabled rules rather than being mistaken for configured rules.

## Non-goals

- No auth, secrets, RLS, migration, service-role, or database query changes.
- No action-log, engine, room-creation, or join protocol changes.
- No redesign of the lobby layout or rules editor.

## Acceptance criteria

1. A listed room with non-zero options exposes and renders `Interest +N%` and `Sudden death Tn`.
2. A legacy room without either option maps to `interestRate: 0` and `suddenDeathTurn: 0`, and renders no misleading enabled-rule label.
3. Existing rounds, arms, CPU, identity, join, and layout behavior remains unchanged.
4. Mapper, label, client row, Edge, full local, hosted, and production checks remain green.
