# Recovery v2 R02 evidence

- Task: R02 — Make collapse regression scenarios fail when their prerequisites are absent
- Branch: `codex/recovery-v2-r02`
- Source/base revision: `df9d9958e88becd1a2bef51c4eb1ced2f49a91c3`
- Result revision: uncommitted working tree based on `df9d9958e88becd1a2bef51c4eb1ced2f49a91c3`; the parent owns commit and integration
- Worker: `gpt-5.6-sol`, high reasoning
- Date: 2026-09-09

## Changed paths

- `scripts/checks/collapse_flush.mjs`
- `scripts/checks/collapse_engine.mjs`
- `.codearbiter/reports/recovery-v2-r02-evidence.md`

No engine production file, package manifest, or lockfile changed. The approved unchanged-lock install populated ignored `node_modules` only.

## Obligation map

- AC-007: `collapse_flush.mjs` constructs Path B explicitly with seed `0x5eed1234`, missile angle 20/power 75, P2 on the deterministic terrain surface at x=754 with 1 HP, and a compact wall at x=765..770. The fixture begins fully settled. The real tank-impact blast cuts an air gap into that wall, producing unsupported dirt inside pending range x=715..774. A read-only copy observed through the real `flushSettleInstant()` seam must move before the synchronous terminal flush and must not move afterward. The harness also asserts direct `FIRING -> GAME_OVER`, no resting `RESOLVING` phase, and a decided winner; the observed result is `p1`.
- AC-008: `--path-b-nonlethal` changes only P2 health to 100. The same real shot deforms terrain but leaves P2 alive, and the harness exits 1 on the missing lethal prerequisite instead of skipping or passing.
- AC-009: `collapse_engine.mjs` runs two identical terminal fixtures in lockstep and compares phase, winner, terrain bytes, and tank state on every firing tick through direct `GAME_OVER`. Its existing cluster fixture continues to compare two nonterminal engines through every progressive `RESOLVING` tick and final transition.
- Negative control: `--path-b-delayed-terminal` wraps the actual runtime `resolve()` method and defers its first invocation. The real Path B source flushes and leaves the engine in `RESOLVING`; the next real tick invokes the original resolver and reaches `GAME_OVER`. The unchanged consequence oracle observes one delayed resolving tick and exits 1.
- Negative control: `--path-b-omit-flush` delegates every ordinary in-flight flush but omits the single real flush whose `pendingSettle` is non-null. The engine still reaches `GAME_OVER`, while the read-only terrain copy remains movable and the unchanged settled-terrain assertion exits 1.

## Red evidence

The pre-change harnesses both exited 0 despite missing the required branch:

- `npx tsx scripts/checks/collapse_flush.mjs` — exit 0; logged `P2alive=true`, `phase=RESOLVING`, then `SKIPPED` while the overall check passed.
- `npx tsx scripts/checks/collapse_engine.mjs` — exit 0; both missile and nuke fixtures left P2 alive, then logged `WARNING` while the overall check passed.

After changing only the missing-prerequisite outcomes from skip/warning to failures, before repairing either fixture:

- `npx tsx scripts/checks/collapse_flush.mjs` — exit 1: `fixture prerequisite failed: shot did not kill P2, so branch B was not exercised`.
- `npx tsx scripts/checks/collapse_engine.mjs` — exit 1: `fixture prerequisite failed: neither shot eliminated P2, so terminal collapse was not exercised`.

These failures matched the demonstrated oracle defect rather than an import, syntax, or runner error.

The first independent Astra/high review then found AC-007 only partial: the lethal shot had a pending range but created no unsupported dirt, so its flush assertion was vacuous. Adding only a read-only pre-flush movement requirement, before adding the constructed wall, produced the second required red:

- `npx tsx scripts/checks/collapse_flush.mjs` — exit 1 with `pendingRange={"xStart":715,"xEnd":774}`, `unsettledBeforeFlush=false`, and `fixture prerequisite failed: deformation created no unsupported dirt for the terminal flush to compact`.

## Green and mutation evidence

- `npx tsx scripts/checks/collapse_flush.mjs` — exit 0. Observed `firstPostFiringPhase=GAME_OVER`, `P2alive=false`, `resolvingTicks=0`, `terrainDeformed=true`, `unsettledBeforeShot=false`, one pending-terrain flush, `unsettledBeforeFlush=true`, pending range x=715..774, `unsettledAtEnd=false`, and `winner=p1`.
- `npx tsx scripts/checks/collapse_engine.mjs` — exit 0. Nonterminal engines remained byte-identical through 10 resolving ticks; terminal engines began with the same compact constructed wall, remained byte-identical through 78 firing ticks, reached direct `GAME_OVER`, and both finished with no unsupported dirt.
- `npx tsx scripts/checks/collapse_flush.mjs --path-b-nonlethal` — expected exit 1. Observed real deformation with P2 alive and failed the required lethal precondition.
- `npx tsx scripts/checks/collapse_flush.mjs --path-b-delayed-terminal` — expected exit 1. Observed `firstPostFiringPhase=RESOLVING`, `finalPhase=GAME_OVER`, `resolvingTicks=1`, and failed the no-delay assertion.
- `npx tsx scripts/checks/collapse_flush.mjs --path-b-omit-flush` — expected exit 1. Observed the real lethal deformation and direct `GAME_OVER`, but `unsettledAtEnd=true`; failed `terrain left UNSETTLED at GAME_OVER`.

## Repository gates

- `npm run test:client` before dependencies were installed — exit 1: `vitest` was not recognized. This environment failure is retained here.
- `npm ci --ignore-scripts --no-fund` — exit 0; 178 packages added from the unchanged lockfile, 0 vulnerabilities reported.
- `npm run test:client` — exit 0; 200 files and 1,779 tests passed. jsdom printed its existing canvas `getContext()` not-implemented diagnostics.
- `npm run check` — exit 0, including typecheck, gameover, collapse, collapse_engine, collapse_flush, fall-damage, verified replay/corpus, sandhog, and the remaining registered deterministic harnesses.
- `npm run build` — exit 0; typecheck passed and Vite built 2,739 modules. Existing large-chunk warnings remain informational.
- `git diff --check` — exit 0; Git printed only the checkout's LF-to-CRLF conversion warnings.

After correcting the Astra review finding, the final working tree was rerun:

- `npm run test:client` — exit 0; 200 files and 1,779 tests passed.
- `npm run check` — exit 0, including the corrected collapse fixtures and all registered deterministic harnesses.
- `npm run build` — exit 0; typecheck and the 2,739-module Vite build passed with the existing large-chunk warnings.

The project has no lint command. `.codearbiter/tech-stack.md` lists coverage only for the client Vitest surface (`npm run coverage:client`); the engine and pure-helper surface is verified by deterministic harnesses and has no coverage command. R02 changes only those harnesses, so the engine no-tooling exemption applies and the obligation proof above is the coverage evidence.

## Review, limits, and rollback

- Independent review: the first fresh `gpt-6-astra`/high review found one MEDIUM vacuous-compaction gap; the correction above is pending a new independent review.
- The ordinary green command observes `flushSettleInstant()` and delegates to the real implementation synchronously. The delayed-terminal mutation defers `resolve()` once; the omitted-flush mutation omits only the real pending-terrain flush. Both mutations are enabled solely by their explicit negative-control flags.
- This is a constructed source fixture: it controls target position, health, and a compact six-column terrain wall to guarantee lethal deformation plus real compaction. It does not claim that the original natural spawn/aim pair or an ordinary generated hill necessarily creates an overhang.
- Existing exploratory Path A/Path D construction skips and unrelated viewport-specific skips were not changed.
- Rollback: revert only the two harness changes and this receipt. No runtime code, schema, package, lock, remote, or production state requires rollback.


## Parent integration evidence

Integrated atop65fc62547630b789ebe430ad24405ee8e50f8706, preserving accepted R24/R25/R13. Parent independently executed both normal harnesses (exit0), nonlethal (exit1), deferred resolver (exit1), and omitted flush (exit1), reading each intended diagnostic. Fresh Astra/high final review, triage and aggregate passed AC007 through AC009; its sole LOW wording correction now distinguishes asserted non-null winner from observed p1. Source/test bytes are unchanged from review. Integrated client suite200files/1789tests and build/typecheck exit0; full check result will be recorded in the canonical ledger. Logs ../recovery-v2-r02-integrated-{client,build,check}.log are relative to the worktree root. This constructed source fixture is not a normal-player browser journey, and deterministic comparisons cover the explicitly asserted state projection.
