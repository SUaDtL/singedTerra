# Documentation Overhaul

## Status

Approved as SUaDtL under the standing passion-project sprint authority.

## Problem

The README and core docs describe an older, smaller game. The root presentation
leads with obsolete SVG artwork, the weapon count and roadmap are stale, the
spec opens on a superseded Socket.io architecture, and completed mobile, audio,
Garage, Sandhog, visual, test, and deployment work is still listed as planned.

## Reader outcome

Give players, contributors, and operators a current, visually credible front
door that matches the shipped game and makes the right document easy to find.

## Acceptance contract

- README leads with the authored raster hero, a direct live-play link, and
  current gameplay and Garage screenshots.
- README describes the shipped game, controls, architecture, setup, verification
  commands, repository layout, and documentation map without becoming a second
  specification.
- `docs/README.md` separates current guides from dated records.
- Player, architecture, development, UI-system, specification, and delivery
  documents agree with current source and deployment workflows.
- The superseded Socket.io architecture is removed from the maintained spec.
- Completed Sprint 6 material moves to the archive, and obsolete README SVG
  assets are removed.
- Every changed user-facing document passes the codeArbiter anti-slop copy
  audit, relative-link validation, secret scan, and diff review.

## Boundaries

- Documentation and documentation assets only.
- No gameplay, UI behavior, dependency, migration, workflow, Supabase, or
  deployment change.
- Historical audit findings remain available and are labeled as dated records.
