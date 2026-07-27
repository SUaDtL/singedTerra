# Impact Depth Parallax

## Problem

Explosion recoil currently translates the dusk sky, distant ridges, and
destructible battlefield by the same amount. The camera hit has energy, but the
single rigid plane makes an otherwise layered scene read flatter at the moment
when depth should feel strongest.

## Goal

Separate the existing background art into bounded far, middle, and battlefield
camera layers so blast recoil creates a brief sense of depth without adding
assets, simulation state, continuous animation, or network traffic.

## Requirements

1. A pure helper derives immutable, finite layer offsets from one camera
   displacement. Malformed displacement fails closed and hostile finite input
   is capped before scaling.
2. The far atmosphere (gradient, stars, cloud shelves, sun, and horizon haze)
   moves at `0.12x`; distant ridges and turn-start wind ribbons move at `0.35x`;
   terrain, tanks, projectiles, blasts, transient effects, and aiming aids keep
   the existing `1x` camera displacement.
3. At zero displacement, layer geometry and draw order remain unchanged:
   atmosphere, ridges/gusts, then the destructible battlefield.
4. Each layer owns a balanced Canvas save/translate/restore boundary. A layer
   cannot leak transforms, alpha, or compositing into the next one.
5. Existing shake/kick decay, reduced-motion suppression, idle redraw policy,
   oversized sky coverage, and the unshaken HTML HUD remain unchanged.
6. The feature is presentation-only. It does not change `GameState`, physics,
   terrain, replay, actions, dependencies, migrations, Edge Functions, or
   Supabase.

## Acceptance

- Pure tests prove zero, cardinal, diagonal, cap, non-finite, ratio, immutability,
  and source-nonmutation behavior.
- Renderer trace tests prove exact far/middle/world translations, strict layer
  order, unchanged zero-displacement geometry, and balanced Canvas state.
- Existing impact-kick, wind-gust, renderer, deterministic, Edge, build, and
  browser suites remain green.
- A real browser comparison shows the sky holding back, ridges moving partially,
  and the battlefield taking the full recoil without exposed backdrop strips or
  HUD motion.

## Non-goals

- Camera following, zoom, continuous cloud animation, procedural assets, or
  changes to explosion strength.
- Any synchronized cosmetic state or Supabase deployment.
