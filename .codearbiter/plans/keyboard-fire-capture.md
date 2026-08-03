# Plan: keyboard-fire-capture

1. RED: add a focused-control test whose child stops bubbling Space `keydown` and assert one fire action.
2. GREEN: register the existing InputHandler keydown listener in capture phase, preserving all existing target gating and cleanup.
3. Verify focused input tests, client tests, typecheck, harnesses, build, E2E, staged secret scan, adversarial review, exact-head hosted checks, merge, and production smoke.

## SMARTS decision

Selected because the user-reported failure is player-facing and the current bubbling listener cannot observe a stopped event. Scope is narrow, reversible, deterministic, and has no security, auth, dependency, migration, or spending impact.
