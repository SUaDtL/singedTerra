# Battle Console Composition

**Status:** approved by standing improvement authority and live visual review
**Initiative:** `career.initiative.0001`
**Decision:** `console.composition.0001`

## Player outcome

The protected lower rail reads as one deliberate command console, not a
collection of cards repeating the same decision. A player sees their commander
and mobility, builds one complete firing solution, then commits one shot. Every
fact has a single visual home.

## SMARTS decision

1. Keep the current components and reduce font size or spacing. Rejected: the
   screenshot already has empty surface area while weapon, angle, power, and
   wind are repeated across the solution and commitment cards.
2. Replace the console with a minimal Fire-only bar. Rejected: it wastes the
   protected rail and removes useful aiming feedback.
3. Consolidate the duplicated firing facts and terminal action into one Fire
   Control surface, with a terminal phase cell rather than a rival Fire Ready
   card. Selected:
   Specific=5, Measurable=5, Achievable=5, Relevant=5, Time-bounded=4,
   Satisfaction=5. This directly resolves the visible unfinished composition
   without changing game authority.

## Contract

- The Commander zone contains the active commander identity, tank portrait,
  mobility, fuel, and movement controls. It does not repeat selected weapon,
  aim, power, or wind.
- The Fire Control zone is the only decision-state home for selected weapon
  and ammo, and the persistent **Armory — equip / buy weapons** gameplay
  route, angle,
  power, wind, trajectory guidance, and the controls that change them. Its
  angle/power controls include their current values, so no second summary is
  needed. The trajectory hint is compact metadata inside the solution, never a
  standalone row.
- Fire is the terminal cell of Fire Control. It carries phase ownership text,
  an optional concise action hint, and the single primary Fire action while
  controllable. It is not a separate Commitment, Ballistic Computer, or Fire
  Ready card, and it never repeats weapon, elevation, power, or wind values.
- During submitting, tracking, resolving, handoff, and recovery, the same zone
  replaces Fire with the existing truthful phase state. It does not expose a
  disabled or duplicate action.
- The Commander strip shrink-wraps identity, health/fuel, movement, and useful
  last-salvo context; it has no selected-weapon duplicate or blank rail height.
  The Match ledger docks only at >=1416:600. At ordinary desktop and touch
  aspects it is an Escape-closeable, focus-returning Match drawer so the stage
  remains 1200x600. It has no weapon, aim, power, Fire, Arsenal, or Store
  control.
- First Salvo still owns its coach ribbon. It temporarily takes the terminal
  coaching anchor while the single-owner solution remains visible; Skip or
  completion collapses the ribbon without a layout jump or restored duplicate
  readback.
- Existing callbacks, keyboard controls, mobile targets, renderer-owned aim
  guide, gameplay, network protocol, verified flow, Auth policy, schema,
  progression, and dependencies remain unchanged. Raising the shared protected
  floor also changes deterministic replay work, so verifier ceilings,
  diagnostics, and the `verified_replay_probe` plus
  `complete_verified_deployment` function bundles are updated and deployed
  together; no action-log or award semantics change.

## Acceptance criteria

1. DOM tests prove exactly one live visible weapon name, angle value, power
   value, and wind value in decision state, each owned by Firing Solution.
2. Fire Control contains exactly one primary action in decision state, no
   independent gauge/card or separate Commitment container, and no solution
   readback. Non-decision phases contain no Fire affordance.
3. Desktop, 900x520 fine-pointer, and Pixel landscape browser tests prove no
   clipping, overlap, document scrolling, blank full-height ledger, or touch
   target regression. They must compare actual rendered boxes, not just
   selector presence.
4. A real keyboard/pointer journey adjusts weapon, angle, power, and movement,
   fires once, sees the phase transition, and returns to a fresh decision state
   with no duplicated readback; it opens Armory and discovers buying weapons
   without entering Command Menu.
5. TDD, exact-diff adversarial review, hosted CI/CodeQL, Pages provenance, and
   production health complete delivery before acceptance.
