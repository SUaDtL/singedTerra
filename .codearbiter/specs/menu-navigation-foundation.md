# Command Menu Navigation Foundation

**Task:** `ux.menu.0001`, first bounded slice of the requested menu-system overhaul.

## Problem

The live game exposes secondary actions through separate Store, Arsenal, pause, round-shop, and game-over surfaces. The existing Menu button opens a minimally labelled pause panel, so players cannot predict what belongs there or how to return safely. This first slice establishes a coherent navigation foundation without moving combat-critical controls or rewriting the lobby.

## Decision

Replace the anonymous pause surface with a named **Command Menu**. It owns only secondary match navigation: Resume, contextual First Salvo help, and Return to Lobby. Resume is visually primary; the exit action is isolated as destructive navigation. Opening it closes the optional Store panel so only one voluntary modal is active. It preserves the current non-pausing behavior needed for networked lockstep and restores focus to the invoking Menu control when closed.

## In scope

- The desktop rail Menu button and touch-dock Menu button.
- The existing in-game pause/modal state, Store interaction, focus behavior, labels, and responsive layout.
- Player documentation and Canvas/HTML UI-system documentation.
- Unit and real-browser tests across desktop, landscape touch, and small-window layouts.

## Out of scope

- Lobby, account, garage, matchmaking, settings, persistence, engine/replay/network protocol, Supabase, Auth, new controls, or a Store/Arsenal redesign.
- Pausing the engine or blocking Realtime updates.
- A new menu framework, router, dependency, or visual-theme rewrite.

## Acceptance criteria

1. Both Menu entry points open exactly one modal headed **Command Menu** with an accessible label.
2. Resume is the primary first action. Return to Lobby is visually and semantically separated from ordinary navigation.
3. The First Salvo action is available only when the existing tutorial replay callback is available; its label explains the outcome.
4. Opening Command Menu closes an open Store and never leaves two voluntary modal panels interactive at once.
5. Closing Command Menu restores focus to the exact invoking Menu control and does not pause or alter simulation, turn, replay, Store economy, or network state.
6. Desktop, landscape touch, and small-window views keep the Command Menu readable, reachable, and free of document overflow or clipped controls.
7. Tests prove the named hierarchy, Store-close behavior, focus return, callback gating, and responsive geometry. Existing hot-seat and network behavior remains unchanged.
