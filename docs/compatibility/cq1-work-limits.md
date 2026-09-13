# cq1 work accounting and configured internal caps

Current status, 2026-09-13: T05/T06 source/membership and T07 code/analytical caps
pass independent Sol review. The strict local performance gate passes all105/105
warmed samples after the parent meter optimization, maximum50.4339ms. Earlier
exploratory, full baseline and intermediate failures are retained below as history.
Challenge starts remain disabled. No hosted cost, retained artifact, deployment,
or worker-isolation claim follows from these local checks.

## Scope and units

`shared/src/net/verifiedChallengeWorkLimits.ts` owns the complete immutable
internal budget. The controller installs it before engine construction; no
request, descriptor, factory parameter, or ordinary check can increase it.
`VerificationWorkBudget` checks before every charged unit/bulk operation and
latches typed exhaustion across clones. The controller catches only that typed
error, including construction failure, discards its engine, and reports terminal
`work_limit`. It never resumes or interprets partial health as a clear. Unexpected
exceptions still propagate as errors. Controller work snapshots are diagnostic
and separate from the unchanged T04 replay-result/public descriptor shapes.

| Category | Source units counted |
| --- | --- |
| engineTicks | Live and cloned speculative engine ticks, before each tick. |
| cpuProbes | Each V3 probe before its clone allocation. |
| cpuCandidates | Generation, deduplication, simulation visits, and returned probe copies. |
| sweepSegments / sweepSamples / collisionChecks | Segment entries, sampled positions, and collision entries including the paired wrap endpoint. |
| terrainCells | Pixel/height scan iterations, cache fills, material queries, deformation and settle iterations. |
| terrainSteps | Terrain outer loops and settle substeps, including stationary scans. |
| engineSteps | Action/clone entries, explicit engine collection visits, collision tank visits, RNG replay, and inventory copies. |
| allocatedBytes / copiedBytes | Major typed buffers, terrain bitmap copies, and eight-byte numeric placement-line values, before allocation/copy. |

These are deterministic source units, not instructions, heap occupancy or elapsed
time. Small helper/object operations are bounded by two tanks, fixed inventory,
one Baby Missile and one round. Object headers, garbage collection and actual
isolate CPU/memory still require separately authorized runtime evidence.

## Analytical domain and tightened settlement proof

This derivation applies to complete accepted cq1 transcripts, not arbitrary engine
options or unbounded interactive aim changes. Repeated aim adjustments consume
budget too; only the canonical accepted fire pairs are replayed by verification.
No current-source semantics were changed to reduce work.

1. The objective stops after a positive human damage salvo, terminal engine state,
   or the third unsuccessful human salvo. Therefore at most three human and **two
   CPU** salvos execute. The public three-CPU outer limit remains unchanged; its
   third CPU response is unreachable under the ordered cq1 controller.
2. The V3 policy runs at most 60 probes per CPU selection, so `P=120` probes and
   `S=P+5=125` independent live/probe salvos bound the whole computation. Probe
   clones begin from the settled live state and are discarded after each probe.
3. Initially every terrain column is contiguous from its generated surface to the
   protected floor. cq1 admits only radius-18 Baby Missiles: no dirt, multi-shot,
   napalm, burrowing, terrain hazards or round regeneration. One disc removes at
   most 37 pixels from each of at most 37 columns. A settled column therefore
   needs at most 37 downward one-pixel substeps; after settling it is contiguous
   again. This invariant holds inductively for each live salvo and each clone.
4. Four substeps per animated call require at most `ceil(37/4)+1=11` calls,
   including a stationary confirmation. A column can spend at most 37 substeps
   moving, plus at most one stationary substep in each of the 11 calls: **48
   substeps per column**. Instant settlement needs at most 37 moving substeps and
   two stationary confirmations, also below 48. A substep scans 399 mutable rows.
5. Flight is capped at 240 ticks. A live salvo needs at most `240+11=251` ticks;
   each speculative probe already stops at 240 total ticks, including settlement.
   Thus `T=5*251+120*240=30055` engine ticks and `K=S*11=1375` settlement calls.
   The existing looser live guard (391/salvo, 2346 total) remains defense in depth.
6. Velocity components stay within 16.5 for the fixed power, drag, wind and gravity.
   An unsplit segment needs at most 24 samples. A wrap split can require **25
   samples and 26 collision checks**: `floor(t*N)+1 + ceil((1-t)*N) <= N+1`, plus
   the paired endpoint. At most two segments occur per tick. T05's left/right
   near-seam primitive cases attain 25/26; the old 24-sample candidate is invalid.

The old T05 600px/604-substep, 180-probe candidates were conservative review
inputs. The configured limits below use the proved cq1-specific contiguous-column
invariant and reachable terminal ordering; they are not selected corpus maxima.
Independent T07 review must assess this derivation before artifact freezing.

## Configured limits and finite corpus observations

| Category | Calculation | Configured cap | Observed maximum (21 cases) |
| --- | --- | ---: | ---: |
| engineTicks | T | 30,055 | 8,747 |
| cpuProbes | P | 120 | 98 |
| cpuCandidates | 2*(60 generation+60 dedupe+60 simulation+60 copies) | 480 | 436 |
| sweepSegments | 2*T | 60,110 | 8,446 |
| sweepSamples | 25*T | 751,375 | 64,198 |
| collisionChecks | 26*T | 781,430 | 64,199 |
| allocatedBytes | 750792+P*(2400+720000) | 87,438,792 | 71,545,992 |
| copiedBytes | P*720000 | 86,400,000 | 70,560,000 |
| terrainCells | Expanded below | 93,382,502 | 7,994,176 |
| terrainSteps | S*37*(11+48)+S*37+22+1200+1200+2*K | 282,672 | 35,049 |
| engineSteps | 2*(26*T)+3*T+P*289+S*15+3 | 1,689,583 | 142,617 |
| totalUnits | Sum of all category caps | 270,817,119 | 150,414,452 |

Initial allocation is cache 2400 + midpoint grid 16392 + heights 2400 + bitmap
720000 + placement numeric line 9600 = 750792 bytes. Each clone allocates a
2400-byte cache and copies a 720000-byte bitmap. This is cumulative traffic, not
simultaneously resident memory.

`terrainCells`:

```
initial midpoint/height/raster/surface/cache = 2047+1200+468000+480000+1200 = 952447
settle scans                                = S*37*48*399               = 88578000
deformation                                 = S*37*37                   =   171125
cache invalidation and clone fills          = K*1200+P*1200              =  1794000
tank surface scans                          = K*2*400                    =  1100000
tank material queries                       = K*4                        =     5500
collision pixel queries                     = 26*T                       =   781430
total                                                                    93382502
```

`engineSteps` reserves two tank visits per collision, one projectile and two
settling-tank visits per tick. Each clone reserves entry 1 + fall map 2 + at most
7 wind-RNG replay calls + tanks 2 + inventory items 36 + previous-shot wall
impacts 240 + explosion 1 = 289. The source resets impact/explosion collections
on every fire; Baby Missile has no projectile split, fire field, or extra blast.
The salvo allowance 15 covers four action entries, two damage visits, two fall
visits, up to six rotation visits, and one winner visit. Constructor/player
entries add 3. One-round/no-team/no-hazard cq1 cannot reach the separately metered
new-round, fire, bounce, team or drill loops.

## Corpus and refusal evidence

`fixtures/verified_challenge_workload.json` contains all 21 exact complete
transcripts, results/events and category counts: the nine unchanged T04 goldens
(first/third clear, third miss, both extreme angles at zero/full power, vertical,
and default), plus angles 1/89/91/179 crossed with powers 1/99/100. The new cases
exercise boundary misses, near-vertical long flights, wrap-direction edge
trajectories, and terminal human deaths. Requests stop at actual terminal state;
no post-terminal transcript is accepted. The corpus is finite, not combinatorial
three-shot enumeration or a proof that all domain maxima were observed.

`verified_challenge_workload.mjs` verifies the configured limits, every frozen
counter, all original T04 outcomes, exact clone-copy counts and live+probe tick
sums. Test-only faults at initial allocation, live tick, and CPU probe prove
terminal exhaustion, no further actions/ticks, discarded-engine access refusal,
and latched refusal even through a previously obtained engine reference. A plain
unexpected error is not relabelled `work_limit`. The ordinary harness does not
rewrite fixtures; `--record` is an explicit authoring operation.

RED: the workload assertion failed because the original cq1 controller had no
budget. GREEN: all 21 complete metered cases and exhaustion integration passed.
The focused objective harness also passed. At author handoff, full T04 batching,
exclusive timing and independent review were pending; all now pass as recorded below.
No engine source or T04 golden was edited in T07.

A separate source-primitive fixture cuts a radius-18 crater into a contiguous
column band and attains the 37-pixel center gap and exactly 11 animated calls.
It verifies the 48-substep accounting allowance and that every affected column
is contiguous again after settlement. This supports the source induction proof;
it is not labelled a reachable seed-42 gameplay fixture or timed corpus sample.

## Exploratory timing: known failure, not full gate evidence

Command: `node --import tsx scripts/checks/verified_challenge_benchmark.mjs --explore`.
2026-09-13T17:46:12.015Z; host `suadtl`; Windows 10.0.26200 x64;
Node v24.18.0; AMD Ryzen 9 9950X3D; 32 logical CPUs; host RAM 65,905,455,104 bytes.
This subset runs two cases and three warmed repetitions each. All eight calls
are retained below. Initial calls are not claimed to be cold processes.

| Case | Phase/sample | Elapsed ms | User CPU us | System CPU us | RSS bytes | Process max RSS KiB |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| first-clear | initial/0 | 25.705500 | 31000 | 16000 | 72724480 | 71836 |
| first-clear | warmed/1 | 21.690300 | 16000 | 0 | 74039296 | 72304 |
| first-clear | warmed/2 | 21.439100 | 16000 | 0 | 75923456 | 74240 |
| first-clear | warmed/3 | 22.450400 | 31000 | 0 | 75247616 | 75588 |
| third-miss | initial/0 | 178.435800 | 172000 | 94000 | 87048192 | 99656 |
| third-miss | warmed/1 | 167.844100 | 203000 | 15000 | 98471936 | 107392 |
| third-miss | warmed/2 | 167.858600 | 156000 | 0 | 102813696 | 115044 |
| third-miss | warmed/3 | 172.781400 | 188000 | 0 | 104251392 | 115812 |

The first-clear work is 1,573,500 units; third-miss is 148,832,262 units. Their
complete per-category counts are in the workload fixture and each emitted JSON
sample. Process RSS/max RSS are process observations, not per-replay peak memory
or a hosted isolate budget. All three warmed third-miss samples exceed 100ms.
No mean, selected sample, faster first-clear, or configured work cap changes that
failure. The author-handoff implementation was not locally affordable under the
reviewed performance contract; the later numeric-slot repair is recorded below.

The parent exclusively ran the full command without `--explore`.
It emits host/configuration metadata, each initial call, all five warmed samples
for every one of 21 cases, and every failure. Any warmed sample >=100ms makes it
exit nonzero after retaining all samples. Initial calls are labelled accurately;
no favorable sample selection or early exit suppresses later evidence. Normal
benchmarking cannot regenerate the fixture or widen limits.

T08 must inventory the actual bundled runtime closure and generator inputs,
including the controller's internal caps and actual tree-shaken dependencies.
Retained replay cannot import mutable current modules at runtime. Subsequent
ordinary builds verify the retained artifact rather than requiring mutable
current engine/career source hashes to stay frozen forever. Hosted capacity,
native deadline/cooldown proof, coordinated lease rollout and enablement remain
separate unresolved gates; starts stay disabled. The owner-selected native
architecture does not promise independent worker termination.

## Parent performance repair and complete local gate

The first complete run failed100/105 warmed samples. Replacing polymorphic object
reads/writes in the optional meter with numeric Float64 slots reduced cost without
changing any per-unit check or counter. An intermediate indexOf lookup still failed
2/105 samples (101.3016 and102.1043ms). A fixed exhaustive category switch removed
that lookup cost. Final105/105 warmed samples pass: minimum3.57ms, maximum50.43ms.
This is the full21-case corpus, five warmed samples each; no threshold, fixture,
work limit, gameplay rule or sample selection was changed.

Raw host metadata, initial calls, CPU/memory observations and every sample:
- C:/Users/brenn/AppData/Local/Temp/product-v2-p10-benchmark-baseline-tsx.log
- C:/Users/brenn/AppData/Local/Temp/product-v2-p10-benchmark-indexed-full.log
- C:/Users/brenn/AppData/Local/Temp/product-v2-p10-benchmark-slots-full.log

Final meter raw SHA25649be83d161a8f8dc6809081270815a81cde090d85669b56321b2f8f08b21a878.
Budget harness,21 complete workload fixtures,9 cq1 goldens across four batching
modes, and strict shared typecheck pass. Independent Sol review passes the code,
category derivation and baseline-to-final evidence parity. The
retained-artifact and hosted performance gates remain separate. The owner now
approved the Supabase-native deadline/cooldown contract in the canonical spec;
this local timing proves neither hosted capacity nor forced worker termination.

## Retained artifact local timing

The same full corpus was run exclusively with `--retained`, selecting the static
cq1 registry entry. All105 warmed samples passed, minimum2.8849ms and
maximum57.8396ms. Every result and work counter matched the frozen fixture.
Artifact SHA256: c9e3c55636a6cc2407cbc338e674ebfa0a3dd1285f3a95f72dd354fd3c348c81.
Raw126 calls, host metadata and all105 warmed measurements are retained in
`C:/Users/brenn/AppData/Local/Temp/product-v2-p10-benchmark-retained-full.log`.
The command is `npm run check:verified-challenge:benchmark -- --retained`.
This is Windows Node performance, not Supabase capacity or cold-isolate proof.
