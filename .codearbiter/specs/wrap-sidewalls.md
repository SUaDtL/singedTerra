# Wrap Sidewalls

**Status:** Approved under the standing passion-project sprint authority
**Date:** 2026-07-31
**Branch:** `codex/wrap-sidewalls`

## Problem

Reflective sidewalls added bank shots, but arena boundaries still offer only
two outcomes: miss or rebound. A classic artillery tactic is still missing:
leaving one side of the battlefield and entering from the other. That rule
creates flanking shots around terrain, gives wind a new strategic role, and
adds room variety without another weapon or economy subsystem.

## Scope decision

SMARTS compared three next slices:

| Lens | Wrap sidewalls | Full wall family | Guided first shot |
|---|---|---|---|
| Scalable | Indifferent. One deterministic room option does not change room scale. | Indifferent. Additional deterministic options do not change room scale. | Indifferent. Client guidance does not change room scale. |
| Maintainable | Strong. Extends the existing wall option, collision, rail, and lobby seams. | Adequate. Two new behaviors widen every wall-mode branch and test matrix. | Adequate. Adds tutorial lifecycle state across lobby, HUD, and input. |
| Available | Strong. Hot-seat and networked clients already share the required engine path. | Strong. The same shared engine path remains available. | Strong. Guidance remains local and requires no service. |
| Reliable | Strong. One shared transit primitive keeps live and AI trajectories aligned. | Adequate. Wrap and concrete impact semantics create two independent parity risks. | Strong. Client-only guidance cannot alter deterministic match state. |
| Testable | Strong. The existing wall harness already covers collision, clone, replay, AI, and rendering. | Adequate. A larger behavior matrix increases causal-test cost. | Adequate. Correctness depends on multi-step DOM and browser lifecycle coverage. |
| Securable | Indifferent. No auth, secret, persistence, or trust boundary changes. | Indifferent. No auth, secret, persistence, or trust boundary changes. | Indifferent. No auth, secret, persistence, or trust boundary changes. |

**Recommendation:** Add wrap sidewalls as one complete slice. Strength:
**strong**. Existing seams dominate Maintainable, Reliable, and Testable, while
the player-facing payoff is larger than the implementation surface.

## Goal

Add an opt-in wrap sidewall mode that transfers projectiles across the
battlefield edges with deterministic, readable, and strategically useful
behavior in hot-seat, networked, and CPU play.

## Player contract

- Room setup offers `Open`, `Reflective`, and `Wrap`; `Open` remains the
  default and existing rooms remain compatible.
- In wrap mode, a projectile crossing the left edge enters at the right edge,
  and a projectile crossing the right edge enters at the left edge.
- Transfer preserves horizontal and vertical velocity, age, weapon type,
  split state, bounce count, burrow state, wind, and gravity progression.
- The projectile consumes its complete fixed-tick movement. Any tank or terrain
  struck on the entry-side remainder of that movement resolves in the same
  tick, so wrapping cannot tunnel through an edge target or ridge.
- Transfer never explodes, deforms terrain, deals damage, or ends the turn by
  itself. The existing flight cap remains the safety bound.
- Paired violet portal rails identify the rule before the first shot. A
  transfer creates bounded accents at both exit and entry rails and a short
  procedural transfer cue distinct from the reflective ricochet.
- Reduced motion keeps the static portal rails and suppresses animated contact
  accents.
- Projectile trails break across the transfer instead of drawing a
  map-spanning streak.
- CPU shot search uses the same transit primitive and entry-side collision
  sweep as live execution.
- The short aim guide ends at the first portal contact. It shows the real path
  to the portal without drawing a false cross-map connector or solving the
  wrapped impact for the player.

## Technical contract

- Extend `WallMode` to `'open' | 'reflective' | 'wrap'`.
- Missing or invalid values normalize to `open` at every room boundary.
- Swept collision returns the same exact sidewall contact for `reflective` and
  `wrap`; open mode retains the legacy out-of-bounds miss.
- Add one shared deterministic `wrapSideWall` primitive. It maps the integrated
  endpoint by one battlefield width, preserves every non-position projectile
  field, and sweeps from the paired entry rail to that mapped endpoint using
  open-boundary collision semantics.
- Live execution and `simulateImpact` both call that primitive. Neither path
  owns a second wrap formula.
- Existing monotonic `wallImpacts` remain the render/audio edge. The renderer
  supplies the immutable room mode when dispatching a contact cue, avoiding a
  redundant event field.
- Room options remain JSON. No migration, action-log field, server-authoritative
  physics, or new dependency is introduced.

## Acceptance

- Engine coverage proves exact left/right transfer, velocity/state
  preservation, same-tick entry collision, default-open and reflective
  regression safety, repeated-wrap determinism, flight-cap resolution, clone
  independence, replay parity, and live/AI endpoint parity.
- Aim-guide coverage proves wrap mode ends at the exit rail without a
  cross-screen segment.
- Projectile rendering coverage proves a wrap discontinuity resets history.
- Renderer/audio coverage proves distinct static portal rails, paired bounded
  contact feedback, dedupe, mode-specific procedural audio, and reduced-motion
  behavior.
- Lobby, transport, network, create-room, rejoin, rematch, and Edge coverage
  proves `wrap` survives every option boundary while invalid values normalize
  to `open`.
- A production-browser check proves the setting is selectable and the wrap
  rails paint on the battlefield at desktop and coarse-pointer landscape
  profiles without page overflow.
- `npm run check`, `npm run test:client`, `npm run coverage:client`,
  `npm run check:edge`, `npm run test:e2e`, `npm run build`, audit, secret scan,
  and diff hygiene pass.

## Out of scope

- Concrete, ceiling, destructible, moving, or purchasable walls.
- Tank movement wrapping, terrain wrapping, blast wrapping, or cross-edge
  damage falloff.
- Showing the post-portal impact point in the aim guide.
- Database migrations, auth changes, new dependencies, merge, or deployment.
