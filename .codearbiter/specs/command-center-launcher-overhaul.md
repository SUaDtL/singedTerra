# Command Center Launcher Overhaul

**Task:** `ux.pregame.0001`
**Status:** approved by the user on 2026-09-17
**Approval source:** the user's “PLEASE IMPLEMENT THIS PLAN” instruction and subsequent selection of `$ca-sprint`; this artifact faithfully materializes that approved scope without adding product destinations or gameplay behavior.
**Supersedes:** the flat deployment chooser and positional pre-game layout established by `deployment-choice-front-door.md` and `pregame-command-shell.md`. Their launch, focus, account, room, and lifecycle guarantees remain obligations.

## Problem

The current launcher exposes too many equally weighted concepts at once. It is informative to a player who already understands the game, but it makes a new or returning player parse campaign state, operation choices, local setup, online setup, loadout, account state, and launch actions before they know which decision matters. The result is a crowded launcher rather than a legible command console.

The fix is systemic rather than positional: the launcher needs durable information architecture, explicit lifecycle ownership, and extension seams that keep future campaigns and modes from recreating the same crowding.

## Decision

Three routes were considered.

1. Restyle and reorder the existing flat chooser. This is the least expensive route, but it preserves the structural cause: every destination and launch action still competes on one surface.
2. Build a typed two-level command center with a persistent category rail, a category-owned item library, and one selected preparation workspace. Existing Campaign, Quick Operations, Local, and Online owners mount inside the shell and retain their state and launch semantics.
3. Add a runtime plugin/router and global pre-game store. This offers maximum theoretical extension, but adds a new dependency and state authority without a demonstrated need.

**SMARTS:** route 2 is strong. It is reliable because domain/network owners stay intact; maintainable because navigation and content contributions have typed seams; testable through registry, lifecycle, DOM, and browser geometry contracts; available without new runtime dependencies or backend changes; scalable because ordinary content growth does not change shell markup or CSS; and aligned with the player's request for a legible, extensible launcher. Route 1 cannot satisfy the information-architecture outcome. Route 3 exceeds the stated boundary.

## Scope

- Establish the unscaled application-surface lifecycle and the responsive Campaigns / Skirmishes / Multiplayer command shell.
- Introduce typed category, item, mounted-view, context-resolution, and session-selection seams while retaining existing domain owners.
- Deliver Ash Road's real save-aware preparation workspace, including revision-safe restart, as the first visually accepted slice.
- Adapt Quick Operations, First Salvo, imported challenges, Local Battle, and Online flows after that visual gate.
- Apply and prove the admitted command-console materials, responsive hierarchy, accessibility, focus, and launch/return behavior.

### Out of scope

- No gameplay, campaign rules, protocol, account schema, backend, migration, Supabase, deterministic-engine, or save-payload format changes.
- No new runtime dependency or dynamic plugin loader.
- No merge or deployment without separate user authorization.
- No structural battle-console change. The wind face's inert arrow sockets remain a separate recorded follow-up.

## Product model

### Global command shell

- Wide/landscape layouts expose a persistent category rail with exactly **Campaigns**, **Skirmishes**, and **Multiplayer**.
- Narrow and portrait layouts expose the same categories through an accessible **Modes** sheet; it is not a separate navigation model.
- Each category owns a content library. Selecting a library item mounts exactly one preparation workspace with one clear primary action.
- Account/commander status remains in global header chrome. Do not invent Settings, Armory, Records, or other standalone destinations.
- Only a genuinely new player intent justifies a new top-level category. New campaigns, operations, or multiplayer room variants remain items within the existing categories.

### Context and memory

- Initial entry priority is: explicit invite or rejoin, compatible Ash Road campaign save, First Salvo, then Standard Quick Duel.
- A validated imported seed challenge is an explicit contextual Skirmishes entry and must not silently replace the normal priority chain.
- Category/item selection is remembered in `sessionStorage` only. Invalid, unavailable, or obsolete stored identifiers fall back through the same contextual priority rules.
- Failed launches, account refreshes, asynchronous campaign-save checks, and match return preserve the initiating category, item, and meaningful focus target.

### Owned contributions

Introduce compile-time contracts:

- `CommandCategoryContribution`: stable ID, label, semantic icon, ordering, availability, and item provider.
- `CommandItemContribution`: stable ID, summary, availability, and owned view factory.
- `MountedCommandView`: `update`, `focusDefault`, and idempotent `dispose`.
- `CampaignSavePresentation`: `checking`, `empty`, `compatible`, `incompatible`, `unavailable`, `restoring`, and `complete`.

The shell owns navigation, selection memory, focus restoration, and mounting only. It must not own campaign rules, operation validation, local player setup, account state, room networking, or launch payload creation. Replacing a mounted item disposes it exactly once; callbacks from a disposed view or stale asynchronous generation cannot mutate or redirect the active workspace.

### Application surfaces

- Move the pre-game root outside gameplay-scaled `#app`; the existing canvas/battle transform remains intact.
- Add an explicit `pregame | launching | battle` application-surface state.
- `pregame`: command center active; battle app inert and hidden from accessibility APIs; portrait preparation remains usable.
- `launching`: initiating workspace remains visible but inert/busy; the battle orientation rule may apply while acquisition occurs.
- `battle`: command center hidden/inert; battle app active; existing battle orientation behavior remains enforced.
- Launch success transitions to battle only after the existing session composition returns an active context. Launch failure restores the exact initiating workspace and focus rather than forcing Online recovery.

## Category workspaces

### Campaigns

- Ash Road is the first library item.
- The primary workspace leads with current mission, immediate objective, selected/carried kit, save status, and one Start/Resume action.
- A compatible save makes **Resume** primary. Starting a new run from a compatible save requires explicit confirmation and compare-and-swap replacement against the displayed save revision. A conflict preserves the newer save and reports a recoverable revision error; there is no raw-delete path.
- Empty, incompatible, unavailable, restoring, and complete saves receive truthful, distinct presentation and actions.
- Route map and deeper briefing are secondary expandable panels, not the first decision plane.

### Skirmishes

- `QUICK_OPERATIONS` is the content library.
- The selected operation workspace presents its summary and launch-relevant facts with one launch action.
- First Salvo and validated imported challenge flows remain explicit contextual entries and retain their current validation and payload owners.

### Multiplayer

- The library contains Local Battle and Online.
- Local mounts the existing crew, battlefield, Garage, and match-start flow.
- Online mounts the existing create, join, browse, waiting, invite, and rejoin flows.
- Room, auth, token, retry, generation, and cleanup semantics remain unchanged.

## Command-console visual system

- Use the supplied kit as a quality bar and material source, not authoritative product data or implementation instructions.
- Eligible kit assets are the validated nine-slice frames, material tiles, and semantic SVG icons. Existing repository campaign and battlefield art remains authoritative and is reused in place.
- Retain a dense tactile command-console character while enforcing one outer frame, one navigation frame, and internal panels only when they communicate a real boundary.
- Labels, facts, progress, focus, and controls remain semantic DOM/SVG. Gold denotes selection or action, green denotes truthful success/readiness, and red is reserved for danger or failure.
- All interactive targets are at least 44 CSS pixels in both dimensions; the primary action is larger and isolated from secondary controls.
- Controlled scrolling, readable type, visible focus, reduced-motion behavior, forced-colour fallbacks, long-label resilience, asset-failure fallback, and usable 200% zoom are required.
- Remove the replaced chooser and positional CSS instead of layering another override system.
- Campaign-checkpoint token alignment is allowed where isolated. The in-game battle console structure and behavior must not change.

## Supplied-kit validation boundary

- Source archive: `singedterra-command-ui-kit.zip`, SHA-256 `858E9C02BEEB9A9B23E9CEF71567BC6E4DF2B6E3196B72FB9E9C3CCF457F514D`.
- All entries declared in `CHECKSUMS.sha256` matched.
- All 40 manifest assets were classified (36 install, 4 reuse-existing); the four reuse-existing world-art digests matched repository files.
- Static SVG inspection found no scripts, event handlers, embedded raster images, `foreignObject`, text, or external references.
- The package's Python aggregate validator was not used as evidence because the host interpreter lacks its undeclared `bs4` dependency. No dependency will be installed for this sprint; digest, provenance, manifest, and static SVG checks are the admission evidence.
- The packet's Astra routing is rejected. Astra is banned for planning, implementation, and launcher review. It may be used only for an explicitly requested final campaign review.

## Acceptance criteria

1. **AC-01** The pre-game root is outside scaled `#app`, and one tested controller owns `pregame | launching | battle` state, inertness, accessibility visibility, and portrait-gate activation without changing the battle canvas transform.

2. **AC-02** The desktop shell exposes Campaigns, Skirmishes, and Multiplayer as an ordered category rail; narrow/portrait layouts expose the same category controls in a labelled, keyboard-operable Modes sheet.

3. **AC-03** Typed `CommandCategoryContribution`, `CommandItemContribution`, `MountedCommandView`, and seven-state `CampaignSavePresentation` contracts exist, and adding a fixture category/item requires no shell markup or shell-layout CSS change.

4. **AC-04** The shell mounts one owned view at a time, invokes idempotent disposal exactly once on replacement/destruction, rejects stale async callbacks, and returns focus to a stable item/category control when a view goes away.

5. **AC-05** Context resolution is deterministic and tested: invite/rejoin outranks compatible campaign, which outranks First Salvo, which outranks Standard Quick Duel; validated imported challenges remain explicit contextual Skirmishes entries.

6. **AC-06** Selection memory uses only the current browser session, records stable category/item IDs, survives account refresh and match return, and safely ignores invalid or unavailable values.

7. **AC-07** Account/commander status remains functional in global header chrome; no standalone Settings, Armory, or Records destination is added.

8. **AC-08** Ash Road leads with current mission, objective, selected/carried kit, truthful save presentation, and exactly one primary Start or Resume action; route map and deeper briefing are secondary expandable content.

9. **AC-09** Campaign saves visibly distinguish checking, empty, compatible, incompatible, unavailable, restoring, and complete states without converting errors into empty state.

10. **AC-10** A compatible save makes Resume primary. New Run requires confirmation and compare-and-swap replacement using the displayed revision; cancel changes nothing, and a revision conflict preserves the newer save and produces a recoverable error.

11. **AC-11** Skirmishes presents every `QUICK_OPERATIONS` item through the library/workspace pattern with selected facts and one launch action; First Salvo and imported challenge behavior remain valid.

12. **AC-12** Multiplayer exposes Local Battle and Online as library items and preserves current Local crew/Garage/start and Online create/join/browse/waiting/invite/rejoin semantics, including session generation and teardown guarantees.

13. **AC-13** A launch keeps its initiating workspace visible but inert/busy until acquisition succeeds. Failure restores the same category/item/focus and retry owner; success alone reveals the battle surface.

14. **AC-14** The command center uses admitted kit frames/materials/icons and existing repository art with semantic DOM/SVG, truthful gold/green/red usage, visible focus, and no duplicated chooser or positional override layer.

15. **AC-15** Pointer, keyboard, and touch interaction remain separated from battle input; every target is at least 44px, the primary action is larger, and controlled scroll keeps all actions reachable.

16. **AC-16** Wide, standard, compact-touch, narrow portrait, and short-landscape production bundles remain usable with long labels, missing decorative assets, reduced motion, forced colours, and 200% zoom.

17. **AC-17** The existing in-game battle console DOM ownership, layout behavior, and visual-regression tests remain unchanged except for isolated shared-token alignment explicitly proven not to alter structure.

18. **AC-18** Focused Vitest and Playwright suites, full client tests, deterministic checks, typecheck, build, dependency audit, secret scan, `git diff --check`, and exact-head PR review pass before completion.

19. **AC-19** The first delivery checkpoint contains the real shell and real Ash Road workspace on a draft PR, with direct wide/standard/compact/portrait visual evidence. Remaining Skirmishes/Multiplayer styling pauses for user visual acceptance of that system; the draft is explicitly marked incomplete at this checkpoint.

## Negative-space check

If every functional criterion passed while the command center still felt visually crowded or thematically wrong, the overhaul would still be broken. `AC-19` therefore makes direct visual acceptance of the real Ash Road vertical slice a product gate, not a screenshot formality. Separately, inert wind-arrow sockets in the battle console remain known work but are outside this sprint and do not invalidate the launcher.

## Governing records

- **Conform — ADR-0004:** pre-game presentation remains semantic DOM/CSS outside the canvas.
- **Conform — ADR-0010:** `LobbySession` retains token/resource lifetime; the new shell does not acquire network authority.
- **Conform — ADR-0011:** the authenticated player owner remains the identity authority and only feeds header presentation.
- **Conform — ADR-0016:** diagnostics remain opt-in, allowlisted, and absent from normal navigation.
- **Conform — ADR-0018:** the Preact battle console retains semantic ownership and remains structurally independent from the command center.
- **No ruling required — ADR-0019:** proposed status is not accepted authority; current verified-challenge behavior is nevertheless preserved as an explicit product constraint.

## Approved in-game command-menu extension — 2026-09-17

After accepting the Campaigns / Ash Road visual slice, the maintainer explicitly extended the
approved command-console treatment to the existing in-game **Command Menu** shown during battle.
This is a bounded visual and information-hierarchy extension, not a structural battle-console
change:

- Preserve the existing non-destructive local-input hold, network loop continuity, modal isolation,
  focus trap/restoration, Battle Settings handoff, conditional First Salvo replay, and lobby-return
  owners.
- Present one framed command deck with a linked command header, one dominant **Resume** action,
  subordinate Settings/Replay utilities, and a physically separated **Return to Lobby** action.
- Reuse the admitted command-center materials and semantic SVG icon seam. Keep controls as semantic
  DOM, maintain 44px minimum targets after battle scaling, and retain responsive short-landscape and
  compact-touch support.
- Do not restyle or restructure the live battle console, settings dialog, First Salvo briefing, or
  gameplay controls as part of this extension.

Acceptance is direct visual coherence with the accepted launcher system plus fresh unit/browser
proof of the retained lifecycle, keyboard, touch, focus, and containment behavior.

## Approved feature-interior revision — 2026-09-18

**Approval source:** the maintainer's “PR #515: finish the feature workspaces, not just the command
shell” brief and its explicit Local Battle + Garage-first visual gate. Under `$ca-sprint`, SMARTS
approved this bounded continuation at high confidence because the brief fixes the product outcome,
ownership boundaries, first slice, evidence matrix, and stop condition without an unresolved fork.

### Problem

The accepted command header, category shell, campaign workspace, and in-game Command Menu now form a
coherent command-console system, but Local Battle and the reusable Garage still present older form
blocks and cryptic controls inside that shell. A new or returning player cannot easily tell which
crew member is active, inspect that member's real tank, discover every appearance choice, or relate
the configured crew and rules to the single deployment decision.

The first affected caller is a local player preparing a two-to-four-seat battle. Done means Local
Battle reads as one battery-assembly workspace and the same appearance editor is understandable and
usable for both Local and Online owners. This revision does not yet restyle Online room access,
Verified Operations, Match settings, or the full commander dossier; those remain later slices after
the explicit visual gate.

### Approach

Retain `Lobby` and the existing feature builders as the state and callback owners, but recompose the
Local view around an explicit selected crew seat, a useful real-tank inspection bay, a readable
roster/rules region, and one adjacent Deploy action. Evolve `LobbyGarageView` into the one shared
appearance editor, using `paintTankLoadoutPreview` for its live assembled tank and preset thumbnails
and replacing cycle-only discovery with direct named choices for all legal variants.

The rejected alternatives are enlarging the two existing Local blocks or adding another CSS override
layer, both of which preserve the compositional defect, and introducing a new editor renderer or
draft state, which would duplicate working art/lifecycle ownership and change the explicitly retained
immediate-edit semantics.

### Scope

- Recompose Local Battle as a crew, vehicle, rules, and decision workspace using the existing local
  player/setup owners and exact launch payload.
- Make the selected seat visually and semantically explicit; editing Player 2 selects Player 2 as the
  inspection and Garage owner without mutating another seat.
- Reuse the real 2D painter at an intentional inspection size on a restrained workshop surface; remove
  the fake angular terrain and unrelated filler decoration.
- Make name, Human/CPU ownership, colour, and named appearance legible in the roster; preserve unique
  name/colour validation and two-to-four-seat behavior.
- Keep colour controls accessible but visually subordinate, with selected and unavailable/taken states
  distinguishable without relying on colour alone.
- Place a concise effective-rules summary and the sole Deploy action near the configured setup, with
  controlled scrolling for four players and short/portrait workspaces.
- Put the authoritative owner name and live assembled tank inside the shared Garage editor. Reuse its
  existing preview loading, fallback, stale-signature, and disposal behavior.
- Show Foundry, Ranger, Bulwark, and Jackal as named whole-tank presets with true painter thumbnails;
  show Mobility, Hull, Turret, and Barrel with direct named choices for every legal family variant.
- Preserve immediate edits, Done/Escape closure, focus restoration, local callbacks, and Online
  waiting-room busy/rejection/server-acknowledgement semantics. Do not add a misleading Cancel.
- Return native-size default and modified Local/Garage evidence at the requested desktop, standard,
  ultrawide, compact-landscape, portrait, and narrow-phone viewports, then stop for owner acceptance.

#### Out of scope for this acceptance slice

- No Online room-access, Verified Operations, Match settings, account/dossier, campaign, or battle
  console restyling beyond shared Garage integration needed to keep one editor.
- No gameplay, campaign, protocol, backend, account schema, save schema, dependency, merge, or deploy
  change.
- No new tank mechanics, statistics, costs, unlocks, progression, fake world data, 3D art, or
  photorealistic vehicle render.

### Decided parameters

- The current active owner defaults through the existing spotlight rule and changes when a seat's
  identity, controller, colour, appearance summary, or Customize action is used.
- The Garage remains a modal sibling inside the existing Lobby render/focus lifecycle; it does not
  introduce a second overlay framework or draft/commit owner.
- Body and control copy targets 14–16 CSS px, essential secondary labels at least 12 CSS px, and main
  targets at least 44×44 CSS px. A colour chip may be 20–24 px inside its larger button.
- Gold means current selection or safe action, green means truthful readiness/success, and red remains
  danger/failure. Keyboard focus is a separate visible state from selection.
- Responsive decisions use available workspace width and one deliberate scroll owner rather than
  global viewport assumptions or reduced type.
- The evidence matrix uses Chromium at CSS viewports 1920×1080, 1440×900, 3440×1440, 844×390,
  390×844, and 320×568 where the supported browser geometry permits, with viewport, DPR, zoom,
  browser, state, and commit recorded.

### Acceptance criteria

20. **AC-20** The accepted linked command header, category shell, Campaigns/Ash Road workspace, and
    in-game Command Menu remain behaviorally and visually unchanged; the revision records the exact
    baseline head before implementation.
21. **AC-21** Local Battle presents a named crew-preparation workspace in which the roster, selected
    vehicle, effective rules, validation state, and one Deploy action read as one composition rather
    than two independent top-aligned widgets.
22. **AC-22** Every local seat exposes its real name, Human/CPU ownership, colour, and named appearance;
    selecting or editing Player 2 makes Player 2 the selected inspection/Garage owner and updates only
    Player 2's state and launch payload.
23. **AC-23** The selected owner is paired with a useful-size tank painted by the existing shared
    renderer, a truthful named build summary, and one Customize action on a restrained inspection
    surface with no fake angular terrain, invented statistics, or stretched canvas.
24. **AC-24** The two-seat default is readable without hunting, while four seats, mixed Human/CPU
    ownership, long names, and validation failures remain reachable through controlled scrolling with
    no clipped field, focus, or Deploy action.
25. **AC-25** Colour controls retain at least 44×44 CSS px hit areas with subordinate paint chips and
    programmatic names; selected and taken states use non-colour cues and preserve current uniqueness
    behavior.
26. **AC-26** The open Garage visibly identifies its authoritative owner and contains the live assembled
    tank at desktop, compact landscape, and portrait sizes, reusing painter fallback, late-load,
    signature, and detached-view cleanup behavior.
27. **AC-27** All four named whole-tank presets have true painter thumbnails, and Mobility, Hull,
    Turret, and Barrel each expose all four legal named variants as direct choices; cycling may remain
    supplemental but is not the only discovery or selection path.
28. **AC-28** The editor states that appearance is cosmetic and performance is unchanged. Immediate
    edits remain immediate, Done and Escape close accurately, focus returns to the initiating Customize
    control, and no Cancel implies rollback.
29. **AC-29** Local and Online creation/waiting owners use the same editor implementation. Existing
    selected-owner callbacks, Online busy prevention, rejection recovery, server acknowledgement, and
    stale/disposed-view guards remain causal in tests.
30. **AC-30** Pointer, keyboard, and touch can select owners, presets, slots, and direct variants; focus,
    selection, hover, scroll, modal trapping, Escape, and focus return remain distinguishable and
    operable at 200% reflow, reduced motion, forced colours, and missing/late preview art.
31. **AC-31** Native-size default and modified Local/Garage captures are produced for 1920×1080,
    1440×900, 3440×1440, 844×390, 390×844, and 320×568 where supported, with viewport, DPR, zoom,
    browser, state, and exact commit plus meaningful detail crops.
32. **AC-32** Focused Local/Garage tests, the full client suite, typecheck, deterministic checks, build,
    audit, secret scan, diff hygiene, and exact-head review pass without weakening existing behavioral
    assertions; PR #515 remains draft/open and no merge or deployment occurs.
33. **AC-33** The owner visually accepts the assembled Local + Garage slice before its treatment is
    propagated to Online room access, Verified Operations, Match settings, or the commander dossier.

### Open questions

None. The maintainer brief explicitly fixes the immediate-edit model, shared-editor ownership,
responsive evidence, visual stop, and all excluded product/transport boundaries.

### Negative-space check

Even if every structural, interaction, and containment test passed, the revision would still be
broken if it looked like enlarged legacy forms or another layer of brass boxes. `AC-33` therefore
keeps direct owner judgment of the full-size assembled screen as a hard product gate.

### Recorded-intent ruling

- **Conform — ADR-0004:** interactive labels and controls remain semantic DOM/CSS; Canvas is used only
  by the existing non-interactive tank painter.
- **Conform — ADR-0010:** `LobbySession` and `LobbyTransport` retain Online credential, generation,
  mutation, and acknowledgement ownership; the shared editor emits the existing intent only.
- **Conform — ADR-0011:** account and durable identity boundaries are untouched.
- **Conform — ADR-0018:** the battle console and its Preact semantic ownership are out of scope.
- **No collision — deferred remembered-selection precedence:** this revision does not alter command
  category/item memory or initial context priority.
