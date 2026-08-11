# Plan: verified replay empty transport body fix

1. Reproduce the hosted zero-byte POST shape with a failing explicit empty-stream wrapper test.
2. Distinguish empty from non-empty transport streams with bounded reads after the existing rate-limit gate; cancel safely and preserve generic failures.
3. Add adversarial stream tests, then run focused and full local gates.
4. Give one adversarial reviewer the spec, plan, sprint/delivery evidence, tests, and exact staged diff; resolve all merge blockers.
5. Commit, obtain green exact-head hosted CI, merge, deploy, and verify the anonymous and authenticated production paths.
