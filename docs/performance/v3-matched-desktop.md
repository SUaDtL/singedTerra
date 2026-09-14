# Matched seeded-practice desktop measurements

Observed on 2026-09-14 for reassessment T14. Three matched cold/cache-retaining
pairs completed. No HUD asset/loading optimization is selected from this
desktop evidence. Physical-device and human observations remain deferred.

## Question and method

The preceding diagnostic used different entry routes and randomly seeded games.
This experiment asks whether repeatable desktop loading and shot timings can be
observed with the route, battlefield and input held constant.

Each pair used a fresh headed Chrome 152.0.7977.82 profile at 1440 by 900 on
Windows, with a Ryzen 9 9950X3D and 61.38 GiB reported system memory. Both entries
used the public `#challenge=ST1-CW-16` Crosswind practice link, its native Start
challenge button and first-salvo briefing. The second navigation retained HTTP
cache after clearing only application storage. No request interception, engine
override, account, room or reward command was used. An invalid external proxy
with a loopback bypass prevented successful external traffic.

All six pre-shot states matched: Crosswind Range, First Strike, round 1 of 3,
Player 1, Baby Missile, angle 45 degrees, power 50 and wind 0.1 left. Every native
Fire action disabled the control and returned to player-turn. The temporary
profiles were closed and removed. The first pair's two post-resolution captures
show the same battlefield and HUD state; this is not human visual acceptance.

## Observations

| Automated interval | Cold median | Cache-retaining median |
| --- | ---: | ---: |
| Navigation to first enabled Fire | 1,463.0 ms | 1,122.2 ms |
| Launch click to first enabled Fire | 383.4 ms | 184.0 ms |
| Enter battle click to first enabled Fire | 262.1 ms | 61.9 ms |
| Fire click to player-turn | 5,773.1 ms | 5,774.6 ms |

The paired navigation differences ranged from -683.1 to -330.1 ms; the paired
shot-resolution differences ranged from -18.3 to +3.6 ms. These are descriptive
observations from three ordered pairs, not a causal optimization benchmark.

Each cold entry recorded 41 HTTP 200 responses; each repeated entry recorded
41 HTTP 304 revalidations in CDP extra-info events. There were no disk-cache,
service-worker or prefetch flags. The two served-from-cache events were embedded
data images. Resource Timing reported 7,891,054 transfer bytes cold and 12,422
on the repeated navigation. These are local-server measurements, not production
Pages transfer savings. Decompressed response size is not decoded image or GPU
memory.

In the first cold entry, nine console PNG requests carried 2,509,028 encoded
body bytes. The three semantic atlases finished before enabled Fire. The six
other console PNG requests began after enabled Fire and completed shortly
afterward. Their combined size does not establish that they delayed input.

No JavaScript page exceptions, network transport failures or successful external
responses were recorded. Console errors corresponded to missing `/favicon.ico`
responses: two per cold entry and one per repeated entry. This separate static
asset defect warrants a small correction, not a performance claim.

## Evidence and limits

The sole preview served immutable release artifact `086af0c`, Pages run
`34882651320`, payload SHA-256
`865eeff677cd42888c8b2303b4a7c9ce47790d1a0d524291d8a98a69ed8b15bf`.
Root independently recomputed its 57-file payload digest and compared its HTML,
entry JavaScript and CSS against disk, preview and current public bytes. Client,
shared and package sources were unchanged through current main `93f2be6`.

The task-local `singedterra-t14-firstplay-20260914` evidence directory retains
the paired receipt and two captures. The reviewed runner hash is
`de56ed76a773de61dd0f310efe5fb9961b1aa2334fc51f4c84139d68534aa391`;
the raw receipt hash is
`566ceede9c2e43db7879d34a8457a9ef50ed374c3280bc28a737b07532d783c0`.
Terra/high prepared the runner and analyzed the receipt, Sol/high reviewed the
method, and Astra executed it and independently checked the evidence.

Navigation timings include automation and UI transitions. This is seeded
practice entry, not an untouched first-user observation. It does not measure
physical-phone behavior, native/GPU/audio memory, thermals, human comprehension
or input-to-photon latency. T14 remains open; T15-T18 are not advanced by it.
Rollback requires no product change: the experiment changed no runtime source.
