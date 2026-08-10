# Pregame overlay containment

Status: approved under standing sprint authority
Date: 2026-08-10
Task: `ux.pregame.0002`

## Player problem

The existing Account and Operations Settings implementation satisfies a narrow
fixed-position geometry test but still reads as unrelated cards stacked over a
busy page. The translucent backdrop leaves Vehicle Bay borders, terrain art,
controls, and other command frames visibly competing with the dialog. At
compact scales the result looks ghosted, and the Player Record appears to float
without belonging to either the base layout or a modal layer.

## SMARTS decision

Choose a stage-owned command overlay. When Account or Operations Settings is
open, it owns the complete lobby stage: the base lobby remains mounted and
inert for state/focus restoration but is visually suppressed, an opaque
tactical backdrop replaces it, and one contained command surface holds the
active task.

- Merely increasing the old translucent backdrop was rejected because the
  small floating-card composition would still look accidental.
- Turning Account and Settings into full navigation routes was rejected because
  it expands route/state scope and discards the useful modal close-and-return
  interaction the player requested.
- The selected approach is Specific to the reported ghosting and orphaned-card
  defects, Measurable in computed geometry and visual state, Attainable within
  the existing shared overlay primitive, Relevant to pregame coherence,
  Time-bounded to two overlays and their shared host, and Strong because it
  removes rather than cosmetically softens the competing composition.

## Contract

1. Account and Operations Settings use the same stage-modal primitive, with an
   explicit `account` or `operations` presentation variant.
2. An open overlay covers the complete rendered lobby stage. Its backdrop is
   visually opaque and uses the existing squared field-console language; base
   lobby panels, preview art, controls, and decorative pseudo-panels are not
   discernible through it.
3. The base lobby stays mounted, geometrically unchanged, and inert while the
   overlay is open. Closing restores its previous inert state and returns focus
   to the exact logical opener.
4. The dialog is contained inside the stage at desktop, Pixel landscape touch,
   and 900x520 fine-pointer compact layouts. It owns its own vertical scroll and
   cannot enlarge or push the stage.
5. Account uses a focused record/auth surface sized for its content. Operations
   uses a wider command surface whose field rows align to one shared
   label/control/explanation grid on desktop and collapse to one legible column
   under compact styling.
6. Existing AccountSession, credentials, progression, settings values,
   validation, serialization, lobby routes, gameplay, and transport behavior
   remain unchanged.
7. Backdrop click, visible Close, Escape, Tab/Shift+Tab containment, one-overlay
   ownership, and focus restoration remain intact.

## Acceptance evidence

- Focused DOM tests start RED for the missing variant/stage-modal contract.
- Production-bundle browser tests start RED because the current base lobby is
  still visually exposed and the current overlay root does not own the lobby
  stage in computed layout.
- Browser assertions cover Account and Operations Settings across
  `desktop-fine`, `pixel-touch`, and `small-window`: overlay/backdrop bounds,
  opaque base suppression, surface containment, operations alignment or compact
  stacking, scroll ownership, Escape, and restored focus.
- A causal mutation that re-exposes the base lobby or weakens the backdrop must
  fail the visual-state oracle.
- The exact staged package includes this spec, plan, sprint evidence, tests,
  mutation proof, and final diff for one adversarial reviewer. Every Critical,
  High, and merge-blocking finding is resolved before exact-head hosted CI,
  guarded merge, Pages deployment, and production provenance/health checks.

## Non-goals

- No full pregame menu redesign, route rewrite, new artwork, gameplay-loop
  change, progression feature, Auth/Supabase/backend/migration change, or
  dependency.
- No deletion or cleanup of historical branches/worktrees.
- Do not read or modify the malformed historical `.codearbiter/sprint-log.md`;
  this UTF-8 spec, plan, and delivery evidence are the scoped sprint record
  under the existing sanctioned exception.
