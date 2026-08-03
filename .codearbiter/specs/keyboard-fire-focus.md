# Keyboard Fire After HUD Focus

## Problem

During active gameplay, clicking a HUD control leaves that native element focused. The global `InputHandler` currently exits for every native control, so Space and Enter stop reaching the game's fire binding until focus is moved elsewhere.

## Bounded outcome

Space and Spacebar continue to fire (or use the shield) after a player clicks a gameplay HUD button. Enter retains existing native activation for focused HUD controls, while continuing to fire from the game surface. A dedicated Fire control retains native semantic activation without producing a duplicate action. Text-entry controls and editable content retain their native keyboard behavior.

## Non-goals

- No changes to the action protocol, deterministic engine, network replay, auth, Supabase, or deployment configuration.
- No global focus reset or synthetic click behavior.
- No change to movement, aim, or weapon-cycle bindings while a native control is focused.

## Acceptance criteria

1. A focused non-fire gameplay button still receives Space through `InputHandler` as exactly one fire/use-shield action.
2. A focused dedicated Fire control still produces no duplicate global action when its semantic click is modeled.
3. Focused text-entry/editable controls remain excluded from game keyboard handling.
4. Existing keyboard, pointer, HUD, and browser suites remain green.
