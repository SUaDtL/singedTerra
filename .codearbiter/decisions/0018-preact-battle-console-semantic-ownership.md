---
status: accepted
date: 2026-08-23
title: Replace battle-console semantic ownership with one Preact tree
decided-by: SUaDtL <SUaDtL@users.noreply.github.com>
supersedes: 0017-hybrid-pixi-hud-compositor
governs: client/src/main.ts, client/src/ui/HUD.ts, client/src/ui/battleConsole/*, client/src/ui/battleConsole/**/*, client/src/style.css, client/public/battle-*, scripts/assets/battle-console/*, scripts/assets/battle-console/**/*, package.json, client/package.json, package-lock.json
---

# ADR-0018 - Replace battle-console semantic ownership with one Preact tree

## Status
Accepted

## Context
ADR-0017 established the durable hybrid rendering boundary: gameplay remains in
Canvas 2D, PixiJS supplies lazy non-interactive console chrome, and accessible
HTML remains authoritative for semantics and input. It also assumed that the
existing imperative DOM surface, callback ownership, and node identities should
survive a component-by-component migration.

The approved full-console investigation found that assumption is not a sound
final architecture. The in-scope implementation distributes ownership across
imperatively created elements, selector-based application APIs, callbacks held
by DOM nodes, manual show/hide synchronization, and lifecycle paths that span
the command console, portals, settings, the first-salvo coach, and cross-owner
entry routes. Preserving exact nodes would preserve the coupling the rewrite is
intended to remove. Bolting a declarative layer beside that owner would add a
second lifecycle without establishing a single source of truth.

The binding product outcome is the complete 2083x408 battle-console reference,
including Commander and Fuel, Weapon and Armory, Ballistics, Fire Control, and
their shared chassis. The migration and acceptance unit is therefore the whole
console, not isolated components.

## Decision
Replace the in-scope imperative semantic owner with one Preact-owned semantic tree.

- The controller/domain layer owns game behavior and produces a callback-free
  `BattleConsolePresentationState`. Preact components render that state and emit
  typed `BattleConsoleIntent` values. DOM elements do not own domain behavior
  and are not passed among systems as application dependencies.
- One Preact root owns every in-scope semantic surface, including portaled
  settings and first-salvo coach content. Mount, update, focus restoration, and
  destroy follow one explicit battle lifecycle. Node identity is semantic and
  keyed only where user-visible continuity requires it; raw `HTMLElement`
  identity is not an application contract.
- The existing Canvas 2D renderer remains the sole gameplay-world renderer.
  PixiJS remains a lazy-loaded, non-interactive compositor beneath the semantic
  DOM and cannot own text, focus, dialogs, pointer/keyboard input, callbacks, or
  game state.
- Preact and Pixi consume one typed layout projection for wide, standard, and
  compact-touch modes. Replacement styles are component-scoped; styling
  selectors cannot become behavior APIs.
- The full console is migrated and accepted as one governed delivery. Temporary
  adapters may bridge the out-of-scope HUD facade to typed state and intents,
  but there is no permanent dual ownership and no component-by-component final
  state in which legacy and Preact trees co-own the console.
- Preact and the Pixi/asset path remain lazy on battle entry. Lobby and account
  routes retain their clean-load boundary, and the static GitHub Pages hosting
  model remains unchanged.
- Initialization is fail-soft. If the visual compositor or optional assets
  fail, the semantic DOM remains complete, operable, and accessible. Destruction
  removes roots, portals, effects, listeners, and compositor resources before a
  later battle receives a fresh lifecycle.

This decision supersedes ADR-0017's preservation of imperative callback/node
ownership and its component-by-component migration assumption. It retains the
rest of `0017-hybrid-pixi-hud-compositor`: Canvas 2D world authority, a
non-interactive Pixi visual layer, semantic DOM authority, deterministic Sharp
asset tooling, exact dependency governance, typed responsive layout, lazy
loading, accessibility, and static hosting.

## Alternatives considered
- **Preserve and harden the imperative DOM owner** - rejected because the
  approved audit found structural ownership, lifecycle, and synchronization
  debt rather than a healthy deliberately bounded DOM model.
- **Mount Preact beside the existing semantic owner** - rejected because it
  creates two render/lifecycle authorities and keeps selectors, raw nodes, and
  callback ownership as hidden application APIs.
- **Move semantics and interaction into PixiJS or Canvas 2D** - rejected because
  pixels cannot replace native focus, dialogs, text, accessibility, or robust
  keyboard and touch behavior.
- **Rewrite the gameplay renderer or deterministic engine** - rejected because
  neither is the source of the console ownership defect and both are explicitly
  outside this decision.

## Consequences
The target architecture has one owner for semantic rendering and one explicit
intent boundary to the game. Components can be recreated without invalidating
domain behavior, lifecycle cleanup becomes testable, and state-derived DOM
replaces manually synchronized presentation state.

The rewrite is intentionally larger than a visual patch. It requires a complete
semantic inventory, typed state and intent contracts, controlled portal and
focus behavior, component-scoped styling, and end-to-end parity evidence across
hot-seat and network journeys. The full-console reference and responsive
goldens remain binding; framework adoption alone is not evidence of completion.

PixiJS, Canvas 2D, deterministic engine/network behavior, static deployment,
accessibility, fail-soft operation, and exact dependency/toolchain gates remain
unchanged constraints. No accepted spec, plan, test result, or framework choice
substitutes for direct artifact-bound maintainer acceptance of the integrated
console.
