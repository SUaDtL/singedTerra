# Shot Commitment Loop

**Status:** approved under the standing continuous-improvement authority
**Date:** 2026-08-15
**Initiative:** `career.initiative.0001`

## Player outcome

During a controllable turn, the commitment region answers the immediate
question—what will this salvo use—before the player presses Fire. The space
then becomes the existing transmission, flight, impact, handoff, or recovery
state once a decision has been committed.

## SMARTS decision

1. Add a cosmetic reticle or estimated impact. Rejected: it would imply
   precision the deterministic renderer does not currently expose.
2. Add a second Fire or quick-action surface. Rejected: it fragments the one
   authoritative commitment action and repeats the prior command-deck failure.
3. Compose the real selected weapon, elevation, power, and wind into the
   existing commitment region. Selected: S=5, M=5, A=5, R=5, T=5,
   Satisfaction=5. It improves every turn, uses live state only, and keeps the
   current engine and transport contract intact.

## Contract

- The visible decision card presents only the selected weapon, current angle,
  current power, and formatted current wind already used by the firing
  solution. It does not predict impact, damage, or hit chance.
- The card is visible only for a local, input-allowed decision state unless an
  active First Salvo coach owns the same commitment region. The coach hides the
  card until Skip or coaching completion; the existing phase copy replaces it
  for submission, flight, resolving, handoff, and recovery. Stale values must
  not remain visible after Fire.
- Fire remains the sole enabled firing action. This work cannot add controls,
  hotkeys, transport calls, engine rules, Auth, schema, Edge, protocol, award,
  or dependency changes.
- The card is semantic (`Current firing solution`), updates through the real
  weapon-control path, and fits without overlap or scrolling at desktop,
  compact, and Pixel touch profiles.

## Acceptance criteria

1. Pure projection test proves a controllable decision has an exact readable
   shot summary, including sign-correct wind direction.
2. HUD test proves the four-field card is visible in decision and hidden when
   the primary action transitions to submission.
3. Real-browser coverage proves the card is live, follows a real Arsenal
   weapon change, has no overlap/overflow, and stays inside the commitment
   region across desktop, compact, and Pixel touch. It also proves an active
   First Salvo coach owns that region and the card returns after the coach.
4. Strict typecheck, focused client/browser tests, adversarial review,
   exact-head hosted CI/CodeQL/Pages, Pages deployment, and a bounded live
   smoke proof pass before delivery acceptance.
