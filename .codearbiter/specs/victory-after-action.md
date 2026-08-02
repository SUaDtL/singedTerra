# Victory After-Action Report

**Status:** Approved through the maintainer's standing passion-project sprint authority
**Task:** `hud.feature.0003`
**Date:** 2026-08-02

## Problem

The battlefield, Garage, and command rail now share a rich authored presentation,
but the final match state still collapses into a generic bordered box containing
only “Player wins!”, a plain score grid, and two buttons. The most consequential
moment in a match does not show the winning custom tank, does not clearly stage
the standings, and declares a modal without isolating the obscured game controls.

## Player outcome

Ending a match presents a cinematic but compact After-Action Report: the winner's
name, color, and exact assembled vehicle lead the composition; final standings
remain readable; replay/menu actions are obvious; keyboard and assistive-tech
users cannot fall through into the obscured battlefield.

## Scope

- Recompose the existing `GAME_OVER` HUD overlay as an authored report.
- Reuse the existing raster battlefield art, theme tokens, and
  `TankLoadoutPreview` painter; add no asset or dependency.
- Paint the winning tank's exact color/loadout and highlight its scoreboard row.
- Give draws honest neutral copy and no false winner portrait.
- Make the report a real modal: isolate underlying app siblings, focus the primary
  action on entry, contain focus to report actions, and release isolation on exit.
- Preserve Restart/online-rematch and Main Menu callbacks exactly.
- Add causal DOM and production-browser contracts, including reduced motion and
  the smallest supported landscape layout.
- Update the player guide with the final-report behavior.

## Non-goals

- No engine, winner calculation, scoring, round, replay, network, backend, auth,
  schema, migration, dependency, lockfile, or gameplay-rule change.
- No new reward, achievement, progression, sharing, or persistence system.
- No screenshot/export flow and no exact-shot replay inside the report.
- No redesign of the between-round shop or pause panel.

## Interaction contract

1. `GAME_OVER` opens one full-app report with `role="dialog"` and
   `aria-modal="true"`.
2. Underlying stage, HUD, and lobby surfaces are inert while the report is open.
3. The primary “Play again” action receives focus once on entry; Tab and Shift+Tab
   stay among the report's two actions.
4. “Play again” invokes the existing restart/rematch callback exactly once.
   “Main Menu” invokes the existing quit callback exactly once.
5. Leaving `GAME_OVER` or calling `hideEndScreens()` releases isolation and clears
   stale winner art/state.
6. A winner report exposes the exact winner name, team-color accent, assembled
   tank signature, and winner-highlighted score cells. A draw reports that no tank
   remains and hides the portrait.

## Visual contract

- The report uses the existing authored dusk battlefield raster as a dimmed stage,
  with ember/gold telemetry framing rather than a generic dialog box.
- A two-column logical layout pairs the winning tank hero with match outcome,
  standings, and actions; it remains fully fitted at Pixel 5 landscape and the
  existing desktop/small-window projects.
- Motion is presentation-only: a short panel/tank arrival may run normally, while
  `prefers-reduced-motion: reduce` disables it without hiding content.
- The document remains a clean single-page game with no page overflow.

## Acceptance

- Focused HUD tests first fail on the absent semantic report, exact tank preview,
  winner highlight, modal isolation/focus, draw behavior, and exactly-once actions.
- A production-bundle Playwright route first fails on the absent report and then
  proves art, fit, focus containment, Enter activation, reduced motion, and release.
- Existing end-screen callbacks and all full local gates stay green.
- One designated adversarial review reports no Critical, High, Important, or
  Medium findings before commit.
