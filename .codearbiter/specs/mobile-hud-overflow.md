# Compact-Touch HUD Overflow Sprint Spec

> Status: **IMPLEMENTED — awaiting commit gate**
> Date: 2026-07-20
> Tracks: GitHub issue #107

## Goal

Keep the complete in-game HUD usable on common landscape phones without making a first-time
touch player discover that the arsenal continues below an unmarked scroll fold.

## Why this is next

The Pixel-sized landscape layout is a current player-facing defect with an existing real-browser
reproduction surface. It is independent of the newly merged AI search work, does not touch the
deterministic engine or network contract, and can be proven in Chromium rather than inferred from
DOM structure.

Two other candidates were considered:

- Issue #120 would strengthen tests around `NetworkClient`, but it is a testability investment rather
  than a player-visible repair.
- Issue #64 identifies a real allocation cost, but its proposed alive-seat scan is not equivalent for
  killing blows, burial transitions, deadlock release, or round resets. Exact replacement needs a
  deeper engine prediction design.

## Design decision

Use a responsive default with persistent user override:

1. On a compact coarse-pointer viewport (`pointer: coarse` and `max-height: 700px`), the arsenal
   starts collapsed only when no saved preference exists.
2. A saved expanded (`0`) or collapsed (`1`) preference always wins.
3. While the preference is still implicit, media-query changes update the default. This covers a
   phone that loads in portrait and rotates into landscape.
4. The first manual toggle makes the choice explicit for the current HUD and persists it. Later
   viewport changes do not undo the player's choice.
5. Expanded compact-touch layouts show a short scroll hint and a styled thin scrollbar. Desktop and
   fine-pointer compact windows keep their current presentation.

### Alternatives rejected

**Compact spacing only:** reducing every gap and control height risks touch-target and legibility
regressions, and still fails when player names or future controls add height.

**Move the arsenal into a drawer or modal:** this gives the most space but expands the scope into a
new interaction surface, modal focus behavior, and layering work already tracked elsewhere.

## SMARTS decision

| Lens | Responsive default | Compact spacing only | Drawer/modal |
|---|---|---|---|
| Scalable | Strong. Adapts to future HUD growth without assuming a fixed total height. | Weak. Every added row consumes the recovered spacing. | Strong. Arsenal height leaves the panel entirely. |
| Maintainable | Strong. One pure policy and one media-query boundary explain behavior. | Adequate. CSS stays local but accumulates compact overrides. | Weak. New state, focus, and overlay ownership expand the surface. |
| Available | Strong. First-visit controls fit while arsenal remains one tap away. | Adequate. Fit depends on content and viewport height. | Adequate. Arsenal remains reachable through another layer. |
| Reliable | Strong. Saved choices override responsive defaults deterministically. | Weak. Content growth can silently reintroduce overflow. | Adequate. More interaction states create more failure modes. |
| Testable | Strong. Pure matrix tests plus Chromium geometry and rotation checks. | Adequate. Geometry is testable but thresholds are brittle. | Adequate. Requires modal, focus, and layout coverage. |
| Securable | Indifferent. No security or trust boundary changes. | Indifferent. No security or trust boundary changes. | Indifferent. No security or trust boundary changes. |

Recommendation: responsive default. Strength: **strong**. Maintainable, Reliable, and Testable all
favor it, and no security or dependency cost offsets the result.

## Architecture and boundaries

### Pure preference policy

Create `client/src/ui/arsenalPreference.ts` with:

```ts
export const COMPACT_TOUCH_QUERY = '(pointer: coarse) and (max-height: 700px)';

export function resolveInitialArsenalCollapsed(
  storedValue: string | null,
  compactTouch: boolean,
): boolean;
```

The resolver returns `true` for stored `1`, `false` for stored `0`, and otherwise returns the
responsive `compactTouch` input. Unknown stored values behave like no preference.

### HUD lifecycle

`HUD` owns one `MediaQueryList` for `COMPACT_TOUCH_QUERY`. When its DOM is built, it reads the saved
preference, resolves the initial state, and subscribes to query changes. Query changes affect the
strip only while the preference is implicit. `toggleStripCollapsed()` marks the state explicit before
persisting and updating the DOM.

The app constructs one HUD for its lifetime, so one listener does not accumulate across matches.
No listener runs per frame.

### Scroll affordance

The arsenal header gains a non-interactive `Swipe panel to scroll` hint. CSS shows it only when the
compact-touch query matches and the arsenal is expanded. The same media query styles the HUD's
vertical scrollbar without changing desktop layout or the canvas.

## Acceptance criteria

### AC-1: first-visit compact touch fits

With no `st_arsenal_collapsed` key, the Pixel landscape project starts with:

- `.st-hud__strip--collapsed` present;
- toggle `aria-expanded="false"`;
- arsenal grid hidden;
- `#hud.scrollHeight <= #hud.clientHeight + 1`.

### AC-2: explicit preference wins

- Stored `0` starts expanded even on compact touch.
- Stored `1` starts collapsed on desktop and compact touch.
- An unknown value follows the responsive default.

### AC-3: rotation is handled

With no saved preference, moving from a non-matching viewport into compact touch collapses the strip.
Moving out expands it. After a manual toggle, later media-query changes leave the chosen state alone.

### AC-4: expanded compact touch is discoverably scrollable

When a compact-touch player expands the arsenal, the grid is visible, the scroll hint is visible,
and the toggle reports `aria-expanded="true"`. Collapsing hides the hint again.

### AC-5: existing layouts stay stable

With no saved preference, desktop-fine and small-window fine-pointer projects start expanded. Existing
instrument, child-crush, gauge, and active-row geometry guardrails remain green across all projects.

### AC-6: no gameplay or dependency change

No shared engine, action-log, Supabase, physics, input mapping, package version, or lockfile changes.
The state is UI-only and never enters deterministic replay.

### AC-7: verification

Fresh verification before commit and PR:

```powershell
npm run check
npm run test:client
npm run build
npx playwright test e2e/hud-layout.spec.ts
git diff --check
```

The PR closes #107 and remains open until CI is green. The sprint never merges or deploys.

## Error handling

- If `localStorage` reads or writes throw, the responsive default still works for the current HUD.
- If `matchMedia` is unavailable, the responsive input is false and the historical expanded default
  remains.
- Unknown stored values are ignored rather than treated as an explicit choice.

## Non-goals

- Redesigning the arsenal as a drawer or modal.
- Changing touch button size, game scale, portrait gating, or issue #108.
- Tightening all HUD padding and typography.
- Refactoring the full `HUD.ts` class.
- Addressing current dependency audit findings or Dependabot PRs.
