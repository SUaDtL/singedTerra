# Impact monitor remains visible with reduced motion

## Problem

On mobile/accessibility profiles that report `prefers-reduced-motion: reduce`, the renderer suppresses the tactical impact monitor entirely. This removes useful shot-impact feedback even though the monitor is a static screen-space magnification, not an animation.

## Contract

- A live detonation continues to produce the impact monitor regardless of reduced-motion preference.
- Reduced-motion behavior for camera recoil, shake, flash, and animated effects is unchanged.
- No engine, network, Supabase, persistence, dependency, or action-log behavior changes.

## Acceptance

- A renderer regression test fails before the fix when `reduceMotion` is true.
- The same test passes after the minimal gate change.
- Existing impact-monitor and full local checks remain green.
