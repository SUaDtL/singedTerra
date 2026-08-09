# Lobby Mode Tab Navigation Plan

**Execution:** `ux.menu.0002` under standing approval.

## Constraints

- Client UI and tests only. No engine, network, Supabase, Auth, persistence, dependency, or gameplay-rule change.
- Preserve existing mode labels, callbacks, rendering order, and all online sub-views.
- Work test-first. The regression must fail because tab semantics and keyboard behavior are absent.

## Tasks

### 1. Define the observable mode-navigation contract

- [x] Add a RED `LobbyShellView` test for the tablist, tab ids, selected state, linked panel, and pointer routing.
- [x] Add a RED browser test for Arrow Left/Right/Home/End switching and focus return across the built lobby.

### 2. Implement the smallest semantic navigation layer

- [x] Add the labelled tablist and linked tabpanel in `LobbyShellView`.
- [x] Route tab key navigation through the existing callback, then focus the rerendered selected tab by its stable id.
- [x] Keep click activation, online wrappers, rejoin placement, and visual classes unchanged.

### 3. Verify and deliver

- [x] Run focused unit and browser coverage, then the relevant client, type, build, deterministic, layout, audit, and secret gates.
- [x] Give one adversarial reviewer the spec, plan, current sprint log, tests, and exact diff. Resolve all Critical, High, and merge-blocking findings before exact-head PR CI and guarded delivery.
