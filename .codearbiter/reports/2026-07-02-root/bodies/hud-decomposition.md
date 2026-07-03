# Decompose HUD.ts — 2120-LOC god module including a single ~590-LOC build() method

**Severity:** medium  |  **Confidence:** 0.8  |  **Effort:** L

**Where:**
- client/src/ui/HUD.ts:73-2105 (class)
- client/src/ui/HUD.ts:276-867 (build() method)

**Evidence:**

*HUD.build() monolithic method (architecture-002):* HUD.build() runs from line 276 to 866 (~590 LOC) as one method, imperatively constructing every HUD subtree in sequence: players column, round indicator, cockpit instrument cluster (SVG gauges), active-player, aim readout, store button + store modal, action strip, touch strip, controls legend, connection banner, toast, turn-watch, game-over overlay, round-over/scoreboard, and pause modal — then a single 4-line append at L860. This is monolith accretion inside an already-oversized 2120-LOC class.

*HUD.ts god module (architecture-003):* Single class HUD (2120 LOC, ~35 methods) is the container for many independent UI surfaces: cockpit instrument gauges (syncWind/syncAim + build), the store modal (toggleStore/syncStore + build), the end-of-round scoreboard (syncRoundOver/buildScoreboard L1253-1367), the pause modal (togglePause/isPaused), the networked connection banner + toast + turn-watch (setConnection/flashMessage/setTurnWatch), and touch controls (onTouch* + touchStrip). These are cohesive only in that they all overlay the canvas; each is a self-contained feature.

**Impact:** The single build() method cannot be reasoned about or tested piecewise; adding any HUD element means editing the middle of a 590-line function, and the many locally-scoped element variables all share one closure, raising the odds of cross-wiring. At the class level, modal, scoreboard, and gauge logic all share one class's private state and injected stylesheet, so a change to one surface risks the others and none can be tested independently. Second-largest file in the repo and high-churn — continued accretion.

**Recommendation:** Split build() into per-widget builder methods (buildPlayers, buildInstruments, buildStore, buildScoreboard, buildPause, ...) each returning its subtree, with build() reduced to composition + append. Extract the store modal, the round-over/scoreboard modal, and the pause modal into their own components that HUD composes, leaving HUD as the overlay coordinator. Gauge math already lives in gaugeMath.ts — mirror that separation for the modal DOM.

**Acceptance criteria:**
- build() no longer exceeds a normal method size and delegates to named per-widget builders
- each HUD widget subtree is produced by an independently-callable method
- store, scoreboard, and pause modals are separate modules composed by HUD
- HUD.ts drops meaningfully below the god-module LOC threshold
- each extracted modal is constructible/testable without instantiating the full HUD

<!-- dedup_key: architecture:client/src/ui/HUD.ts:build-monolithic-method · finding: architecture-002 -->
<!-- dedup_key: architecture:client/src/ui/HUD.ts:god-module-multi-surface · finding: architecture-003 -->
