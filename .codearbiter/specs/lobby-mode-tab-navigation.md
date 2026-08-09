# Lobby mode tab navigation

**Task:** `ux.menu.0002`, first behavioral item in the player UX overhaul roadmap.

## Problem

The lobby presents Hot Seat and Play Online as visually selected buttons, but they do not express their tab relationship or identify the setup surface they replace. Keyboard users have no predictable left/right navigation between play modes. This makes the game's first navigation choice less structured than the new Command Menu.

## Decision

Keep the existing visual tabs and all hot-seat and online flows. Give the two mode controls an explicit tablist, selected-tab state, linked tabpanel, and Left/Right/Home/End navigation. Selecting a tab replaces only the current setup panel and restores focus to the selected tab after the synchronous lobby rerender.

## Acceptance criteria

1. Hot Seat and Play Online expose `role=tab`, stable ids, `aria-selected`, and `aria-controls` inside one labelled `role=tablist`.
2. The active setup surface exposes `role=tabpanel`, a stable id, and `aria-labelledby` for its active tab.
3. Arrow Left/Right and Home/End switch modes in cyclic visual order and leave focus on the new selected tab.
4. Pointer activation still routes through the existing mode callback. Hot-seat setup, online create/join/browse/waiting, Garage, rejoin, account, and controls behavior remain unchanged.
5. Desktop, landscape touch, and compact browser layouts remain framed with no overflow.
