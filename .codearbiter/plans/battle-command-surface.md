# Battle Command Surface — implementation plan

**Initiative:** Make the protected lower third the game's persistent next-decision surface.

**Decision receipt — SMARTS:** Expand the protected arena band and consolidate the battle HUD instead of moving the existing fire controls into a larger strip. Specific=5, Measurable=5, Achievable=4, Relevant=5, Time-bounded=4, Satisfaction=5; confidence high. The outcome is a player who can understand the current battle decision, set up a shot, see its resolution, and recover a verified result without hunting across duplicated panels.

## Product contract

The lower command surface is not a keyboard legend and not a second copy of the side panel. It is the only persistent decision surface during a battle.

1. **Command state (left):** active commander, health/fuel, selected weapon, and at most one contextual constraint (for example, a First Strike remaining-salvos line). It does not repeat the full roster.
2. **Solution (center):** the actual selected weapon, elevation, power, and wind controls/readouts. A range or impact cue is permitted only when it is derived from the same deterministic engine path; no cosmetic pseudo-prediction.
3. **Commitment (right):** one unmistakable next action. It changes honestly by phase: `Fire`, `Watching impact`, `CPU turn`, `Continue`, or an explicitly named recovery action. Store, arsenal, diagnostics, and chat are progressive disclosure from the command surface, not permanent peers of Fire.
4. **Side panel:** match ledger only — round, roster, and collapsed secondary access. It must not compete with the rail for active-turn control.
5. **Entry and coaching:** replace the floating instruction treatment with a short operational briefing before the first decision. The First Salvo coach becomes an anchored, dismissible callout above the relevant command-zone control; it may not cover the battlefield, aiming lane, or primary action.
6. **Outcome and recovery:** the same rail transforms during flight, CPU handoff, and terminal/verified-retry states; it never leaves an actionable-looking Fire control visible when input is unavailable.

## Slice order

### T-01 — Reserve a real command band (engine + layout)

- RED: shared terrain/physics and renderer geometry tests show that a 260px logical command band is protected; all 2–4 player rendered tank envelopes, recoil poses, projectile floor impacts, terrain deformation, and Sandhog entry stop above it.
- GREEN: move the canonical protected floor from 500 to 340 logical pixels, reserving the 260 logical pixels required for the full command surface, and derive the rail top/height from that shared boundary. Do not introduce CSS-only geometry constants.
- Update deterministic replay fixtures deliberately, including verifier parity and Edge bundle deployment scope. This is a shared-engine compatibility change, not a cosmetic CSS adjustment.

### T-02 — Establish the battle command state model

- RED: pure state-projection tests cover entry, human decision, firing/resolution, CPU turn, terminal report, verified retryable completion, expiry, and casual continuation.
- GREEN: derive one immutable `BattleCommandState` from existing game and verified-deployment state. It supplies explicit labels/availability to the rail; it cannot contain account identity, transcript, transport diagnostics, or unauthoritative prediction.
- Keep the model independent of layout so hot-seat and networked paths consume the same player-facing state.

### T-03 — Build the three-zone desktop console

- RED: DOM and real-browser tests require the lower rail to own command state, solution, and commitment; the right shell must no longer contain a competing turn console.
- GREEN: build the three semantic zones around existing controls rather than recreating callbacks. Maintain direct mouse adjustment for elevation/power, weapon access, movement, store access, and Fire.
- The ordinary aiming layout exposes no more than one primary action. Secondary operations live behind a compact Command Menu/drawer with deterministic focus return.

### T-04 — State transformations, entry briefing, and recovery

- RED: browser and DOM tests prove that the command rail changes without height jumps or stale enabled controls through firing, resolving, CPU handoff, game-over, and verified retry.
- GREEN: transform the commitment zone into phase-appropriate status/action; anchor First Salvo guidance to the rail; move operational-briefing content into the entry overlay. Retire duplicates from the side panel and floating overlay.
- Preserve the existing retry verification action inside the reachable terminal report and explain unavailable input in the rail rather than silently disabling it.

### T-05 — Responsive/touch parity and visual proof

- RED: desktop, compact, and Pixel-touch visual tests cover no document scroll, safe-area containment, 44px rendered touch targets, visible primary action, and all configured/default 2–4 player spawn columns plus the 36px chassis envelope.
- GREEN: collapse labels before controls on narrow screens. Retain active turn, weapon, one contextual metric, and primary action; route secondary tools to the menu. No horizontal touch scrolling.
- Verify focus order: command state → solution → commitment → command menu, including focus restoration after coach, drawer, report, and retry activation.

## Completion evidence

- Fresh full client, shared deterministic, Edge, typecheck, and rendering suites; the reviewer must receive the spec, this plan, sprint receipt, tests, and exact diff.
- Exact-head hosted CI, CodeQL, rendering/browser guards, and Pages must pass after merge.
- Deploy the compatible Edge verifier functions after the shared-floor change, verify current production metadata, then capture a fresh hot-seat and online-browser command-surface journey. The proof must distinguish visual geometry from network behavior and must not claim a verified award without completing one.

## Rejection criteria

Reject the implementation if it merely relocates angle/power/fire widgets, duplicates equal-weight active-turn information across two panels, creates page overflow, covers a tank/aim lane, hides essential recovery behind a decorative report, or renders a disabled Fire action without explaining the current phase.
