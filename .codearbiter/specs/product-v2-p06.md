# P06 short-height battle-console legibility

**Approval:** The maintainer's authorized v2 campaign continuation, relayed for
this isolated worktree, approves this bounded P06 correction. Base:
`05b2bf162efb994f99746d1ab93692b3d9ce2988`.

## Observed problem

The retained P03 `pixel-touch` screenshots show a real rendered Last Light
Siege battle with three compact-console labels that no longer read cleanly:
`Baby Missile` is ellipsized to `Bab...`, `Armory` breaks inside the word, and
`Settings` breaks inside the word. The defect repeats in both the live and
restart captures. The same labels remain intact in the retained `desktop-fine`
and `small-window` captures.

The existing short-height rule in
`client/src/ui/battleConsole/components/CompactConsole.module.css` enlarges
copy inside two narrow action bays and permits wrapping anywhere. The compact
Preact component, industrial chassis, input ownership, responsive projection,
Canvas battlefield, Pixi layer, and authored assets remain the correct owners.

## Acceptance criteria

1. **P06-AC1:** In the existing `pixel-touch` Last Light Siege battle, at a
   viewport height that activates the current `max-height: 360px` rule,
   `Baby Missile` is completely visible within its button on no more than two
   word-level lines, its ammo amount, unit, and weapon-cycle cue remain complete
   within the same content box on no more than two word-level lines, and
   `Armory` and `Settings` each occupy exactly one text line inside their
   content boxes. Each visible label retains at least 14 physical CSS pixels of
   computed type. Representative finite counts `0`, `12`, and `999` preserve
   the same metadata and action; they are coverage examples, not an ammo cap.
2. **P06-AC2:** The correction changes only the existing short-height compact
   label presentation and the weapon metadata's minimal semantic line grouping.
   All ten compact controls keep at least the established 44 CSS-pixel physical
   target size, the chassis remains inside the viewport, and no gameplay intent,
   responsive projection, battlefield allocation, renderer, dependency, font,
   or image asset changes.

## Implementation boundary

Production scope is two existing files:
`client/src/ui/battleConsole/components/CompactConsole.module.css`, inside
`@media (max-height: 360px)`, and the weapon metadata children in
`client/src/ui/battleConsole/components/CompactConsole.tsx`. Use the stable
`data-battle-console-target-key` attribute and preserve the button's accessible
name and `weapon-next` dispatch. The metadata may use minimal spans to group its
amount and cycle cue above its unit without compressed word spacing. Preserve
the current grid, fixed control dimensions, transform, industrial colors and
borders, and all asset URLs. A smaller type size that falls below the existing
14-physical-pixel readability floor is not an acceptable fit.

## Evidence boundary

The retained screenshots are genuine Chromium-rendered game screens. Pixel
Touch remains device emulation, not a physical-mobile observation. R17 supplies
desktop timing and resource evidence for this P03 build; it does not prove
physical-mobile usability, GPU cost, decoded residency, energy, or thermal
behavior.

## Verification and rollback

Add the browser geometry regression before changing production code and obtain
parent-owned RED evidence against the unchanged P03 bundle. Keep unlimited ammo
in that browser fixture and cover representative finite metadata through the
focused compact component test. The parent then reruns the exact browser
regression, the retained three-profile screenshots, and applicable full checks,
including the hosted Linux boundary that exposed the wider fallback font.
Before/after geometry and resource requests remain parent-owned evidence.
Rollback restores the single inline metadata node in `CompactConsole.tsx` and
deletes the added declarations inside the existing short-height block.
