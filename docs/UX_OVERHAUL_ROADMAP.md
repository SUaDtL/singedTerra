# Player UX overhaul roadmap

## Purpose

The game has grown through valuable individual systems: hot-seat setup, online rooms, the Garage, Arsenal, Store, Command Menu, First Salvo, after-action report, and account progression. Each works, but their relationships are not yet expressed as one deliberate player journey. This roadmap keeps the overhaul staged and shippable.

## Design read

This is a working navigation roadmap for players and maintainers. It keeps the game's dense field-console character while making the next action and the way back obvious.

## Product rules

1. Every screen has one clear primary action that states the immediate outcome.
2. Setup choices stay close to the thing they configure. Match actions stay in the combat shell. Secondary navigation stays in Command Menu.
3. Temporary surfaces explain their scope, preserve the underlying match, and return focus to the initiating action.
4. Touch and keyboard use the same action vocabulary, even when their physical controls differ.
5. Inventory, progression, and after-action information answer a player question before offering another action.

## Delivery sequence

| Order | Slice | Player outcome | Boundary |
|---|---|---|---|
| 1 | Lobby intent and setup hierarchy | A player can choose hot seat or online play, understand the selected setup, and start without scanning unrelated configuration. | Client UI and browser tests |
| 2 | Combat control hierarchy | Aim, power, movement, weapon, Fire, Arsenal, and Menu read as a deliberate combat system at desktop and landscape touch scales. | HUD, input presentation, browser tests |
| 3 | Store and Arsenal decision surfaces | Selecting a weapon or buying equipment makes price, inventory, and the next action easy to compare without cramped or overlapping cards. | HUD and browser tests |
| 4 | After-action and progression handoff | A completed match explains the result, earned progression, and the available next action without covering the primary report. | Client UI, authenticated view fixtures, browser tests |
| 5 | Cross-surface accessibility pass | Modal isolation, focus return, touch target size, labels, and compact layouts remain consistent across every surface. | Client UI, accessibility and browser tests |

## Current state

The Command Menu foundation is complete. It now owns secondary in-match navigation, puts Resume first, separates Return to Lobby, closes Store before opening, and restores focus correctly. The next behavioral slice begins with lobby intent and setup hierarchy. The existing Impact Monitor report was checked against the current landscape-touch production build and is not an outstanding defect.

## Guardrails

- Keep combat simulation, deterministic replay, network lockstep, Supabase contracts, and persistence outside UI-only slices.
- Do not replace direct tactical controls with a deep navigation tree.
- Prove each responsive claim in the built browser bundle at desktop, landscape touch, and compact desktop sizes.
- Keep every overhaul item independently reversible through its feature branch and PR.
