# Recovered console entry, 2026-09-13

This engineering report records a bounded recovery implementation under
SUaDtL's standing instruction to finish useful unfinished work and merge it.
That instruction authorizes completing the recovery fix; it is not a statement
selecting eager Preact or a new framework boundary. The loading adjustment is
the implementers' response to the reproduced failure. This report is not an ADR,
an acceptance or supersession record. Local validation is recorded below;
production publication remains a separate step.

## Failure and correction

An already loaded page can outlive a static-host deployment that removes its
deferred console chunk. When the semantic mount itself is deferred, the request
can fail before command controls exist. Reporting compositor fallback cannot
supply a semantic owner that never mounted, and subsequent HUD updates do not
recover the failed mount.

The correction makes the existing semantic mount available through the startup
dependency graph. Preact, component code, and scoped CSS may load and evaluate
at startup. The HUD already constructs an idle lifecycle coordinator at startup.
That coordinator has no active generation; `enter()` creates the generation's
resource ledger and the mount acquires `preactRoots`, `portalOwners`,
`semanticKeySets`, `intentBridges`, and `controllerAdapters`. Before first battle
entry there are no mounted semantic roots/effects or acquired generation
resources. The zero-resource claim concerns the classes in
`battleConsoleResourceClasses`, not the existence of the idle coordinator or
ordinary startup JavaScript allocations. One Preact tree remains the semantic
and input owner;
Canvas 2D still owns the battlefield and the engine still owns game behavior.

Optional Pixi and its CSP-support module remain deferred inside the existing
process-owned admission operation. The CSP-support import completes before
renderer initialization. Before first battle entry there are zero requests or
evaluation
for those modules and zero compositor texture requests. Generations retain
removable waiters, abort/deadline handling, stale-result checks, and destruction
of unclaimed late applications. No CSP relaxation, new dependency, or change to
the separate config-gated Supabase loading boundary is part of this fix.

## Architecture and evidence boundary

[ADR-0018](../../.codearbiter/decisions/0018-preact-battle-console-semantic-ownership.md)
and the original startup/AC-37 requirements in the
[integrated console specification](../../.codearbiter/specs/battle-console-integrated-visual-system.md)
explicitly require lazy Preact. The new loading behavior is a narrow variance
from that requirement. Neither record is retroactively accepted, superseded,
or rewritten by this report. The specification's dated implementation addendum
identifies how the current candidate differs while preserving its original text.

Earlier frozen artifacts and results remain historical evidence. Their
zero-Preact startup claim and exactly-one deferred semantic entry request do
not describe the changed implementation. Fresh validation must:

- Measure startup JavaScript/CSS size and module evaluation, including Preact,
  compatibility helpers, component code, and imported runtime data.
- Prove zero mounted semantic roots/effects and acquired generation resources
  before first battle entry, while allowing the existing idle coordinator, and zero
  optional Pixi/CSP-support requests or evaluation and compositor texture requests.
- Bind startup and battle-entry closures to actual served bytes, retaining the
  separate Supabase boundary and unchanged CSP.
- Exercise usable semantic commands after deferred presentation chunks fail,
  plus existing held-import, timeout, abort, late-completion, and teardown cases.
- Check repeat entry without duplicate successful module/texture requests and
  account for startup semantic code in game-only resource comparisons without
  relaxing existing performance or resource budgets.

## Local validation

The regression first reached local battle entry with subsequent JavaScript
requests returning HTTP 404 and failed because no semantic owner appeared.
After the correction, all three browser profiles mounted the controls and
accepted Fire despite a missing deferred presentation chunk.

- The focused lifecycle and retirement suite passed 40 tests.
- Full verification passed 2,128 client tests, 476 Edge tests, deterministic
  engine checks, typecheck, and the production build with Vite 8.3.0.
- The five-layout battle-console suite passed 83 tests, with 27 existing
  profile-conditional skips. The combined lobby, recovery, and authenticated
  preparation suite passed 77 tests, with four existing conditional skips.
- Startup observation and the emitted bundle graph were joined to the same
  configured production build by entry filename, decoded length, and matching
  graph, disk, and HTTP-response SHA-256. There was no mounted semantic owner,
  Pixi module request, or compositor texture request before first battle entry.

The controlled before/after comparison used Vite 8.2.2 and identical local
public configuration on both sides:

| Startup resource | Before, encoded bytes | After, encoded bytes | Increase |
|---|---:|---:|---:|
| Entry JavaScript | 195,155 | 222,334 | 27,179 |
| Entry CSS | 7,371 | 12,187 | 4,816 |

The configured Supabase chunk retained its filename and byte counts. This
configuration permits that separate account client to load; it does not imply
that Supabase is required for hot-seat simulation.

The later Vite 8.3.0 build, including the preparation-spacing correction, had
1,016,258 decoded entry bytes and 222,245 encoded entry bytes. Its graph and
served entry were verified together. These figures describe local verification
builds, not production transfer measurements or a startup-latency benchmark.

The missing-JavaScript regression does not establish complete offline operation,
survival of every missing asset, or recovery from arbitrary semantic-rendering
exceptions. The held-import regression stalls Pixi after the CSP-support stage;
both awaited imports share the reviewed admission owner, but the test does not
separately stall CSP support.
