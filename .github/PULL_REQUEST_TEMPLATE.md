<!-- Thanks for contributing! Keep PRs focused; see CONTRIBUTING.md. -->

## Summary

<!-- What does this change and why? -->

## Type

- [ ] `feat` — new behavior
- [ ] `fix` — bug fix
- [ ] `chore` / docs / refactor (no behavior change)

## Gates (must pass)

- [ ] `npm run check` is green (typecheck + deterministic harnesses)
- [ ] `npm run check:edge` is green (Edge Function tests) — if backend touched
- [ ] `npm run build` is green

## Determinism impact

- [ ] No change to `shared/src/engine/` physics/replay, **or**
- [ ] Engine changed — added/extended a `scripts/checks/*.mjs` harness pinning the new behavior, and
      wired it into the `npm run check` chain. Confirmed identical output for an identical seed.

## Notes

<!-- Screenshots for UI changes, deploy notes for backend changes, anything reviewers should know. -->
