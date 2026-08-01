# Sprint spec: Direct Client Helper Vitest Coverage

> Proposed by Codex on 2026-08-01 under the maintainer's standing continuous-improvement goal. This bounded spec and plan use the maintainer's standing approval through one sprint-specific logged override.

## Problem

Issue #134 identifies two direct client test blind spots. `retry.ts` is exercised indirectly but its retry timing and exact failure contract are not pinned by colocated Vitest tests. `audioEdges.ts` has a root harness but no direct Vitest coverage, leaving its small truth tables outside the client coverage report.

## SMARTS decision

Add direct, dependency-free Vitest tests while retaining the existing root harnesses. Use fake timers for all delay behavior and table-driven cases for the pure audio helpers.

| Lens | Direct Vitest tests | Root harnesses only | Production rewrite |
|---|---|---|---|
| Scalable | Strong: fast colocated tests join the normal client suite. | Adequate, but coverage remains split. | Weak: unnecessary scope. |
| Maintainable | Strong: contracts live beside their helpers. | Adequate. | Weak: changes stable code for a testing gap. |
| Available | Strong: existing Vitest and fake timers suffice. | Strong. | Adequate. |
| Reliable | Strong: exact error identity and timing boundaries are pinned. | Adequate but indirect. | Weak: adds behavioral risk. |
| Testable | Strong: both helpers can reach complete branch coverage. | Weak for client coverage reporting. | Adequate. |
| Securable | Strong: no runtime, trust, dependency, or backend change. | Strong. | Strong. |

**Recommendation:** direct colocated Vitest tests, retaining root harnesses. Strength: **strong**.

## Acceptance criteria

1. `retry.ts` directly covers immediate success, transient retry success, exhausted failure with the exact final error object, attempts clamped to one, default delay timing, custom delay timing, and zero-delay retry without real wall-clock waits.
2. `audioEdges.ts` directly covers the complete fire-edge, Betty-hop, and out-of-bounds fizzle truth tables.
3. Focused tests use fake timers and leave no timer state behind.
4. Targeted coverage for both helpers is 100% statements, branches, functions, and lines, or the sprint records reviewed evidence for any unreachable remainder.
5. Root harnesses remain in place; the full deterministic, client, Edge, coverage, build, audit, secret-scan, and diff checks remain green.
6. One adversarial reviewer clears the exact package before PR-only delivery; issue #134 closes through the PR.

## Non-goals

- Production behavior changes or refactors.
- Removing or weakening root harnesses.
- Dependency, CI, backend, migration, telemetry, auth, crypto, or secret changes.
