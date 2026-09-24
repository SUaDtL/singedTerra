# Preparation workspace: useful information and responsive density

Document revision: 2. Inspected base: `793571911c0b38db6e5b20bc05fd96a4e5e413a5`.
Delivery branch: `codex/preparation-workspace-briefing`.

## Owner request and outcome

B requests the next PR to improve the large unused area in the right-hand
preparation workspace, using scenario information and better composition.
The Standard Duel screenshot is an example, not the complete affected-page list.
This is a separate UI slice; the merged weapon-balance PR is not reopened.

The player should understand the selected scenario, its rules and relevant
choices at a readable scale. Extra display space should improve that decision,
not merely stretch artwork, separate controls or introduce decorative filler.
Maintain the bronze/amber, retro tank-command aesthetic and keyboard/mouse/touch
access. Do not introduce a web-launcher aesthetic or imply new graphics fidelity.

## Bounded implementation

- Retain `PreparationFrame` as heading/body/action-dock owner. Keep one in-flow
  launch dock and the existing primary action component and actual callbacks.
- Improve Skirmish briefings using the existing selected operation, launch
  composition and field-order sources. Separate backdrop from mechanical
  conditions. Explain preset distinctions without new mechanics or rewards.
- Apply a coherent content-scale and setup/inspection layout policy to Local,
  Online and existing Verified workspaces where mounted. Keep route, account,
  room, input, pending-operation and cleanup owners intact.
- Preserve ordinary Campaign mounting and shared-frame behavior, but do not
  add dedicated Ash Road content, progression or persistence work. It is being
  replaced. Shared presentation changes may benefit it incidentally.
- Edit the relevant existing layout rules instead of stacking corrective CSS
  at the end or adding another shell, router or generic layout framework.

## Existing source entry points

`client/src/ui/PreparationFrame.ts`,
`client/src/ui/commandCenter/SkirmishCommandView.ts`,
`client/src/ui/commandCenter/MultiplayerCommandView.ts`,
`client/src/ui/commandCenter/CommandCenter.css`,
`client/src/ui/LobbyHotSeatView.ts`, `client/src/ui/LobbyCreateView.ts`,
`client/src/ui/LobbyPreparationSection.ts`, and the corresponding unit/browser
journeys. `quickOperations.ts`, `quickDuelLaunch.ts` and `fieldOrder.ts` remain
launch/content authority. Read actual defaults before exposing a fact; do not
create a second launch-settings resolver just for this view.

## Acceptance

1. Standard Duel and richer presets present a useful briefing, readable rule
   facts and their actual objective when applicable. Facts distinguish visual
   backdrop, terrain hazards, walls, match rounds and purchase restrictions.
2. Imported seed challenges retain validated source identity, seed, objective,
   errors and launch callback. Presentation never changes settings or validation.
3. Related setup controls and vehicle inspection form one intentional group.
   Wide windows gain useful type/control scale, not large gaps between groups.
4. The same heading/body/dock rules remain across retained modes. No duplicate
   primary buttons, floating footer, hidden validation or covered controls.
5. Responsive changes use available workspace dimensions. Whole regions stack
   before ordinary text fragments. No fixed aspect ratio forces essential
   information below inaccessible content or distorts the artwork.
6. Inspect matched wide, normal, intermediate, portrait and short-landscape
   states. Resize an edited workspace without reloading and preserve selections,
   control state, focus and one-shot callbacks. Test failed/missing artwork.
7. Use real repository fonts/assets in visual evidence when available. Record
   CSS viewport, DPR and tested source. Isolated-builder evidence is not a full
   app, physical-device or owner visual-acceptance claim.
8. Existing mode-specific action semantics, shared-frame tests, relevant client
   tests and browser journeys remain. Add tests for truthful briefing data,
   useful readable scale, reflow and cross-mode dock/body geometry.
9. Category text and icons stay inside the button's inner bevel on both the
   desktop rail and Modes sheet. Retain full accessible names, keyboard and
   touch selection. Longer future labels may wrap; do not clip or truncate them.

## Non-goals and safety

No combat or balance changes, new scenario, new engine/dependency, network
protocol, reward authority, save schema, campaign redesign, account redesign,
battle HUD rewrite, production deployment or merge. Do not fabricate map
previews, player records, difficulty ratings, time estimates, rewards or
statistics to occupy space. New copy is concise explanation of existing rules.

The PR is the delivery record, not a new execution ledger. Read current head
before writing and preserve concurrent branches. Complete-file closeout records
actual validation and its limits; green checks do not establish visual approval.
Revert this presentation slice without changing saved data or gameplay settings.

## Implementation checkpoint — September 24, 2026

Parent: `b656ac8b05ed6fcd64aad4514442b940200456f1`. That commit recorded scope
only. Earlier interrupted authoring produced a local seven-file package, not a
published implementation. B subsequently identified category text escaping its
frame and explicitly requested completing and committing this work to PR #522.

The implementation adds settings-derived Skirmish briefings and attached facts,
recomposes Local/Online setup and inspection using the existing frame, and gives
tank identity, illustration and part names separate rows. It retains authored
field orders, imported-challenge validation, actual callbacks and disposal.
`CommandCenterShell.ts::setIconLabel` now creates a real text span. The existing
navigation CSS budgets icon, gap, padding and bevels, and keeps sheet rows sized
to their content. No selector text is masked with ellipsis or hidden overflow.

New browser regression measures glyph rectangles against the inner content box:
outer button containment alone missed the reported defect. Ordinary category
names remain on one line across the tested rail/sheet sizes; a longer label and
missing icon are covered in the local growth fixture without changing routing.

Local original-source Chromium fixtures passed 44 workspace/viewport states,
22 vehicle-bay states, 81 content/input assertions and five controlled Verified
layouts. The navigation test first reproduced spill at five tested geometries,
then passed 16 widths/heights after correction. Forty-eight category taps and
16 keyboard navigation sequences passed, with edited state and focus retained.
Targeted strict TypeScript and staged whitespace checks passed. All uploaded
source blobs were compared to the tested local bytes.

Environment: Node 22.16.0, TypeScript 5.8.3 via an outside-repository source
adapter, system Chromium, repository assets and font fallbacks. The local
fixture assembles actual UI modules but supplies controlled account/storage
inputs and captures launch callbacks. It is not the normal Vite/main bootstrap,
real network service, physical-device or owner visual-acceptance evidence.
Canonical Node 24 client/build/Playwright checks must run independently in CI.
No dependency, package, engine, save, reward, backend or live settings changed.
