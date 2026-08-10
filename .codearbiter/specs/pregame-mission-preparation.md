# Pre-game mission preparation hierarchy

## Decision

SMARTS selects the primary match-setup routes as the next menu-system slice. They are the two journeys every player reaches before a match: Local Battery and Open Operation. The command shell, online operations board, and Vehicle Bay are now coherent, but the route bodies still present an undifferentiated stack of browser fields. This slice turns those fields into a shared, readable preparation sequence without changing any game or network contract.

Standing goal approval covers this bounded spec and plan. The known malformed UTF-8 sprint-log marker-root defect remains excluded under the sanctioned override; this slice does not read or modify that log.

## Outcome

Before starting a local match or creating an online room, a player can scan the preparation flow as named operational sections: crew and vehicle identity, match capacity and access, optional battlefield protocol, then one unambiguous deployment action. The desktop and compact routes retain the same dark squared command language and do not hide, overlap, or strand a control.

## Requirements

1. Local Battery groups player count and player rows beneath a named Crew Manifest section, keeps Battlefield Protocol as a labelled optional disclosure, and gives the final action a deployment-specific name.
2. Open Operation groups name/color and Vehicle Bay as Command Vehicle; player count, CPU opponents, and visibility as Operation Profile; and its optional settings as the same Battlefield Protocol disclosure.
3. Each section has an accessible label, concise operational heading, and contained descendants. Existing controls, values, DOM listeners, validation, keyboard semantics, and callbacks retain their current behavior.
4. The two route builders use one small shared presentation primitive for the section frame rather than separate one-off card treatments.
5. The shared frame and disclosure use the existing dark, squared command language: no rounded cheerful cards, new visual assets, or canvas work.
6. Compact and desktop browser contracts prove section visibility, order, containment, and clearance for the Local Battery and Open Operation journeys. A temporary style mutation that hides a section must fail the new visual contract.

## Non-goals

- No match-rule, balance, terrain, world-selection, loadout, account, authentication, persistence, backend, Supabase, migration, dependency, renderer, or generated-art change.
- No redesign of Join, Browse, Waiting Room, in-match HUD, Store, or Vehicle Bay editor behavior.
- No change to which Advanced/Protocol settings exist or to their serialization.

## Acceptance

Focused DOM tests prove the named hierarchy and existing callbacks. Production-bundle browser proof covers both routes across desktop, touch, and compact viewports, including the causal layout mutation. The full local suite passes. The final exact staged diff receives adversarial review with this spec, its plan, tests, and final diff, then hosted CI passes on the reviewed PR head before merge and Pages production health verifies matching deployment provenance.
