# Store card containment

Date: 2026-08-09
Task: reliability.store.0001
Origin: production screenshot `codex-clipboard-d398dd4e-5f72-47a2-b46a-1908ef776588.png`

## Problem

The in-turn Store renders accessory effect copy twice: once as the card summary
and again inside the purchase button. The Parachute effect is long enough that
the non-shrinking button takes its max-content width, crushes the information
column, and crosses the card border at compact landscape geometry.

## Required behavior

- Every visible Store card must contain its information column and purchase
  control without overlap at every supported Playwright viewport.
- Purchase controls retain the price and canonical bundle quantity; the card
  summary remains the effect explanation.
- Existing affordability, arms-level locking, purchase callbacks, catalog
  grouping, scrolling, keyboard behavior, and coarse-pointer target floors stay
  unchanged.

## Acceptance criteria

1. A real-browser regression test fails on the current production layout by
   proving at least one card child crosses its card or overlaps its sibling.
2. After the fix, all Store cards contain both direct children and preserve a
   non-overlapping horizontal gap across the complete viewport matrix.
3. Accessory purchase controls show price plus `+bundleSize`; Parachute therefore
   shows `$4,000` and `+1`, while its existing summary still explains the 25%
   fall-damage behavior.
4. Focused DOM and browser tests, the complete client test/coverage matrix,
   deterministic checks, Edge tests, build, audit, and hosted exact-head checks
   pass.

## Boundaries

In scope: Store card DOM, Store CSS interaction, compact browser geometry, and
causal regression tests. Out of scope: economy values, engine behavior,
round-over shop structure, auth/progression, Supabase, migrations, dependencies,
and unrelated visual redesign.
