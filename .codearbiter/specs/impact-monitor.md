# Impact Monitor Specification

## Intent

Make every detonation readable at the moment it matters without changing the
fixed full-battlefield view players use to aim. The battlefield remains the
authoritative spatial context; a short-lived tactical monitor magnifies the
strongest live impact in otherwise-unused upper sky.

## Player contract

- While one or more explosion bursts are live, a compact top-center `IMPACT
  MONITOR` shows a close crop of the strongest active blast.
- The main battlefield remains fully visible and unchanged. The monitor never
  changes canvas coordinates, aim input, trajectory presentation, camera scale,
  hit location, damage radius, duration, or turn timing.
- The monitor copies the already-painted battlefield, so authored conventional
  explosions and every procedural special-weapon signature remain truthful.
- Multiple simultaneous impacts select the largest authoritative reach radius;
  equal radii select the newest burst.
- Impacts at every world edge remain centered as far as the bounded source crop
  permits, with no out-of-bounds sampling or stretched aspect ratio.
- Reduced-motion users retain the normal battlefield explosion but do not see
  the duplicated animated monitor.
- If scratch-canvas creation, a 2D context, a source copy, or final paint fails,
  the monitor disappears for that frame and normal rendering continues.

## Architecture

- `client/src/renderer/impactMonitor.ts` owns pure focus selection and bounded
  source/destination geometry. It reads renderer presentation data only.
- `client/src/renderer/ImpactMonitorPainter.ts` owns one reusable offscreen canvas,
  paints the complete framed inset there, then performs exactly one game-canvas
  composite. It allocates no canvas per frame and cannot leave a partial monitor
  behind when that final composite fails.
- `Renderer` calls the monitor after restoring the shaken world transform and
  before the canvas HUD no-op. The focus point includes the current world recoil
  offset so the copied explosion stays centered inside the monitor.
- No shared engine, physics, replay, action-log, network, Supabase, Edge Function,
  schema, migration, authorization, dependency, or lockfile change is allowed.

## Visual contract

- The monitor is 220 by 136 logical pixels, horizontally centered 18 pixels
  below the canvas top.
- A 144 by 88 logical-pixel world crop scales proportionally into a 198 by 121
  content viewport inside the monitor; the remaining pixels belong to its frame.
- The frame uses the existing dusk/gold palette, one restrained shadow, a crisp
  double-line border, and a small `IMPACT MONITOR` label. It must read as part of
  the ballistic-computer system rather than as a generic video overlay.
- The inset never covers the side HUD, leaves the outer battlefield frame
  untouched, and remains fully inside the 1200 by 600 logical canvas.

## Acceptance

- Pure tests pin strongest/newest selection, malformed input rejection, edge
  clamping, exact geometry, and zero-burst behavior.
- Painter tests pin one scratch allocation, reduced-motion suppression,
  source-copy ordering, final clip/frame operations, and fail-soft restoration.
- Renderer tests prove focus uses current recoil and that no monitor is drawn
  without a live burst.
- A real hot-seat browser route fires a conventional weapon and observes the
  offscreen monitor composite across desktop, small-window, and Pixel touch.
- Existing explosion, blast-reach, hit-stop, aim/input, rendering, deterministic,
  Edge, build, audit, review, hosted CI, merge, and Pages gates remain green.
