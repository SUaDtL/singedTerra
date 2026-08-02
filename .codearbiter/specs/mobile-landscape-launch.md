# Mobile Landscape Launch Specification

## Intent

Turn the phone-portrait dead end into a polished launch surface for the supported
mobile battlefield. Portrait players should see the same authored world and UI
hierarchy as the rest of the game, understand why landscape is required, and
have a one-tap progressive enhancement that attempts fullscreen landscape before
falling back to an honest manual-rotation instruction.

## Context and SMARTS selection

Production main at `df2aefce8a5accb65a6030445d71d78d10e172cf`
ships a strong Pixel-landscape Touch Command Deck, but a phone held upright sees
only a generic rotate glyph and one sentence on an almost empty backdrop. Live
and production-bundle review compared three bounded approaches:

1. **Build native portrait gameplay.** Highest theoretical reach, but the fixed
   1200x600 battlefield, 264px combat rail, global zoom contract, modal system,
   and touch deck would all need a multi-slice rearchitecture.
2. **Strengthen the supported landscape launch.** Reuse the authored hero art,
   explain the landscape benefit, and offer a one-tap fullscreen/orientation
   attempt with an explicit manual fallback.
3. **Polish the current glyph only.** Visually safer but leaves the transition
   into the playable touch surface inert.

Approach 2 wins. It materially improves the first mobile interaction, remains a
small reversible client slice, and does not pretend the current fixed battlefield
is portrait-ready. Confidence is high.

## Player contract

- After the title splash, a phone-narrow portrait viewport presents a branded
  mobile launch bay with authored battlefield art, concise landscape guidance,
  and a clearly named action.
- Activating the action attempts fullscreen first and then requests landscape
  orientation when the browser exposes that capability.
- Unsupported, denied, or partially supported browser APIs never throw into the
  application. The status text clearly asks the player to rotate manually.
- The action is a progressive enhancement only: physically rotating to landscape
  still reveals the existing game immediately without requiring the button.
- The inclusive 480px phone boundary and the existing 481px/laptop exceptions
  remain unchanged.
- Landscape, desktop, lobby, match, engine, input, and network behavior remain
  unchanged.

## Architecture

- Replace the minimal static `#portrait-warn` contents with semantic launch-bay
  markup in `client/index.html`, including the existing public splash art through
  Vite's `%BASE_URL%` path.
- Add a small `OrientationGate.ts` module. Its pure async request helper accepts
  optional fullscreen and orientation-lock ports, absorbs platform rejection,
  and returns a finite presentation result. Its DOM mount binds the one launch
  button and updates one live status region.
- Extend `style.css` with token-based portrait artwork, device/rotation motif,
  action, focus, reduced-motion, safe-area, and viewport-containment rules.
- Import the module from `main.ts`; it performs no work outside the existing
  phone-portrait media gate.

## Boundaries

- Client HTML, global CSS, one small UI helper, player docs, and causal tests.
- Reuse existing `client/public/splash-hero.png`; no generated or downloaded
  asset, dependency, lockfile, or package change.
- No native portrait battlefield claim; no canvas or HUD reflow; no engine,
  physics, input mapping, action log, network, Supabase, backend, auth, crypto,
  secret, schema, migration, irreversible, destructive, or spending change.
- No worktree or branch cleanup belongs to this slice.

## Acceptance

- Focused tests first fail because no orientation helper or launch action exists,
  then prove locked, fullscreen-only, manual, rejection, idempotent mount, and
  accessible status behavior without unhandled rejection.
- Production Chromium at 393x851 proves the launch artwork/action/status are
  visible, fitted, keyboard/touch actionable, and at least 44 physical pixels;
  480px warns, while 481px, 700px portrait, and 851x393 landscape stay unblocked.
- Reduced motion disables the rotation animation without hiding the device motif.
- Complete client coverage, deterministic harnesses, Edge tests, production
  build, Playwright matrix, dependency audit, secret scan, designated adversarial
  review, exact-head hosted CI, PR-only squash merge, exact-SHA Pages provenance,
  hosted live smoke, and localhost hygiene all pass.
