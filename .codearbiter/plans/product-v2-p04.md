# P04 tactical challenges implementation plan

**Spec:** `.codearbiter/specs/product-v2-p04.md`
**Base:** `05b2bf162efb994f99746d1ab93692b3d9ce2988`
**Status:** integrated with P02 source; independent review, full client/engine/build checks, and 30 browser cases pass. Final branch integration and delivery remain parent-owned. See `.codearbiter/reports/product-v2-p04-evidence.md`.

| Task | Paths | Acceptance evidence |
| --- | --- | --- |
| T1 — Practice-only objective definitions | `client/src/client/fieldOrder.ts`, `fieldOrder.test.ts` | Complete: original three-entry verified rotation remains unchanged; explicit practice IDs resolve from the private list; position/final-result reducer boundaries are causal. |
| T2 — Accepted action and settled-damage helper | `client/src/client/practiceFieldOrder.ts`, its tests | Complete: only accepted human fire is tracked; immutable primitive snapshots preserve the pre-mutation boundary; settlement computes one `human.totalDamage` delta. |
| T3 — Curated operations | `quickOperations.ts`, tests, Lobby tests | Complete: Crosswind/Caldera and Lean Arsenal carry v2 seed 42 descriptors; P03 v1 Last Light and ordinary operation behavior remain unchanged. |
| T4 — Existing owner adapters | `main.ts` plus focused lifecycle tests | Complete: local Quick Duel initializes/resets the helper, emits existing Field Order/HUD/report copy, retains seed 42 on Play Again, and leaves verified/network paths alone. |
| T5 — Evidence and verification | P04 evaluator/receipt and focused/full client/type checks | Complete locally: bounded no-mutation solver and full client suite/type checks are green. Browser, server, build, commit, PR, deploy, and P02 junction are parent-owned. |

No generic objective controller, protocol action, persistence, reward, dependency,
or engine/weapon change is in scope. P02's First Salvo integration remains an
external junction; this branch must not implement or overwrite it.
