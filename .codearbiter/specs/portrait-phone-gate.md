# Portrait Phone Gate Sprint Spec

> Status: **APPROVED — user approved 2026-07-21**
> Date: 2026-07-21
> Tracks: GitHub issue #108

## Goal

Show the rotate-to-landscape overlay only when the viewport is genuinely too narrow for portrait
play, without treating every coarse-pointer portrait viewport as a phone.

## Current defect

`client/src/style.css` currently activates `#portrait-warn` with:

```css
@media (pointer: coarse) and (orientation: portrait)
```

That device-input heuristic blocks a touchscreen laptop in a portrait-shaped but playable window.
The nearby `client/index.html` comment already describes the intended rule as portrait plus narrow
width, so the CSS and documented intent have drifted.

## Approved design

Use one CSS capability boundary:

```css
@media (orientation: portrait) and (max-width: 480px)
```

The rule deliberately ignores pointer type. It asks whether the rendered viewport is both portrait
and phone-narrow, not whether the device has touch hardware.

`480px` is the inclusive warning boundary. A `481px` portrait viewport remains playable. A viewport
at or below `480px` is warned even with a fine pointer because available layout width, not inferred
device identity, is the constraint.

## Alternatives rejected

### Keep coarse pointer and add a width condition

This fixes the reported laptop at common widths, but retains an irrelevant input-device condition.
A narrow phone or emulator with a fine primary pointer would bypass a warning intended to describe
layout capacity.

### Use portrait aspect ratio alone

A tall laptop window still has a portrait aspect ratio, so this preserves the reported false
positive.

### Detect phones in JavaScript

Touch, user-agent, and screen heuristics are fragile and would duplicate a responsibility that CSS
media queries already express. The overlay has no runtime state or event-flow requirement.

## SMARTS decision

| Lens | Width + orientation | Coarse + width | JavaScript device heuristic |
|---|---|---|---|
| Scalable | Strong: one CSS rule covers future devices. | Adequate: still couples layout to input hardware. | Weak: device heuristics accrete exceptions. |
| Maintainable | Strong: matches the existing HTML comment and overlay ownership. | Adequate: extra predicate needs explanation. | Weak: splits behavior across CSS and TypeScript. |
| Available | Strong: playable laptop-sized portrait windows remain available. | Strong for the reported coarse laptop. | Adequate: misclassification risk remains. |
| Reliable | Strong: exact inclusive viewport boundary. | Adequate: pointer reporting varies. | Weak: UA/touch inference is not a layout oracle. |
| Testable | Strong: Chromium can assert computed display at exact widths. | Strong: also testable, but more state combinations. | Adequate: requires mocked device heuristics. |
| Securable | Neutral: no trust boundary or data flow. | Neutral. | Neutral, with more client surface. |

Recommendation: width plus orientation. Strength: **strong**. Confidence: **high**.

## Architecture and boundaries

- `client/src/style.css` remains the sole behavior owner.
- `client/index.html` retains the existing overlay and updates its explanatory comment to name the
  inclusive `480px` boundary.
- `e2e/portrait-gate.spec.ts` drives the production bundle in real Chromium and reads computed
  visibility. It creates its own browser contexts so touch capability and viewport size are explicit
  without expanding the global Playwright project matrix.
- No TypeScript application code, game input, shared engine, Supabase code, dependency, lockfile, or
  deployment workflow changes.

## Acceptance criteria

### AC-1: phone-narrow portrait warns

A `393x851` portrait viewport shows `#portrait-warn` with touch enabled. The same narrow portrait
viewport also warns with a fine pointer, proving that width rather than pointer classification owns
the behavior.

### AC-2: touchscreen laptop portrait remains playable

A `700x900` portrait viewport with touch enabled keeps `#portrait-warn` hidden.

### AC-3: boundary is exact

A `480x900` portrait viewport shows the warning. A `481x900` portrait viewport hides it.

### AC-4: landscape never warns

An `851x393` touch viewport keeps the warning hidden.

### AC-5: production and regression gates stay green

Fresh verification before commit and PR:

```powershell
npm run check
npm run test:client
npm run check:edge
npm run build
npm run test:e2e
git diff --check
```

The PR references #108, remains unmerged, and is watched until all available checks are green.

## Non-goals

- Redesigning the overlay, its copy, icon, animation, or z-index.
- Changing compact-HUD or arsenal behavior.
- Detecting physical device class, screen size, or user agent.
- Supporting portrait gameplay below the approved width boundary.
- Adding a dependency or changing the lockfile.
