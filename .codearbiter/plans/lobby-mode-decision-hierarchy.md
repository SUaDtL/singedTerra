# Lobby Mode Decision Hierarchy Plan

Task: `ux.menu.0003`

## Constraints

- Client UI only. Keep existing tab semantics, rerender focus behavior, setup views, and callbacks.
- Add context as informative content, never another navigation or commit action.
- Preserve the established mode tab as the focused control after keyboard switching.
- Test first. The canonical sprint log cannot be appended because of the documented H-05 broken-UTF-8 defect; do not bypass the developer edit policy to work around it.

## Steps

1. Add a failing `LobbyShellView` test describing the Hot Seat and Online heading, explanation, DOM order, and noninteractive shape.
2. Add the minimal mode-context builder and styles in the existing lobby shell path. Extend tests to prove keyboard-driven rerenders retain the selected tab focus and update the context.
3. Run focused client tests, the full client suite, deterministic checks, production build, and existing lobby browser guardrails.
4. Give one adversarial reviewer the spec, this plan, sprint-log exception, tests, and exact final diff. Resolve merge-blocking findings, then repeat review on any changed final diff.
5. Commit, PR, exact-head hosted CI, guarded merge, Pages deployment, and production provenance health verification.
