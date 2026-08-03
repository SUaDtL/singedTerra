# Spec: keyboard-fire-capture

## Outcome

Space remains a game-fire shortcut after a player interacts with any non-text HUD control, including controls whose descendants stop bubbling `keydown` events.

## Acceptance criteria

1. A Space key event targeted at a non-text HUD control still emits exactly one `fire` action (or `use_shield` for the shield weapon).
2. Text entry controls and the dedicated Fire buttons retain native keyboard behavior and do not receive a duplicate global action.
3. Existing keyboard, pointer, and full client test suites remain green.

## Boundaries

Only `InputHandler` keyboard event registration and focused-control regression tests. No gameplay, network, accessibility-label, or dependency changes.

## Non-goals

Do not alter the meaning of Enter, movement, aim, weapon cycling, or text entry.
