# Ash Road performance evidence

Status: named-desktop engineering measurement. Targets and observations are deliberately separated; physical-phone and browser cold/warm-cache evidence remain pending owner/device work.

## Environment and command

- Desktop: Windows `10.0.26200`, AMD Ryzen 9 9950X3D 16-Core Processor, 32 logical CPUs.
- Runtime: Node `v24.18.0`.
- Runner: `npx tsx --tsconfig client/tsconfig.json scripts/checks/campaign_performance.mjs --baseline-dist=<origin-main-source>/client/dist --baseline-source=<origin-main-source> --baseline-revision=ea574def3e8810c3eb9cf5c9ebe6905dd5ab9f23 --baseline-source-sha256=7f56067e126736b471bc349631c2193f9690f9917d64040c01a4ddf5d5f73c55 --baseline-artifact-sha256=26087eb00496eab1d5569af49746023760c03cd2d70356a2b06c1ff26895723b --current-revision=af647fd79f8124d9dd21e25a2cba7689299edcd8 --current-source-sha256=d13f73573f9255281855eed39e2cc67249e059e0e49d215f7b56a8edb2baaeb7 --current-artifact-sha256=219b924273b2ec24394ec80b24c544a9890ccff1c7430676e3f1c8eedbc2c9fa "--build-command=npm run build --workspace client"`.
- Production bundles: both current checkout and the archived `origin/main` source were built with the exact `npm run build --workspace client` command and warm dependency cache. The runner verifies the supplied revisions against `HEAD`/`origin/main`, verifies every baseline build input against its Git blob, repeats and hashes the complete current tracked/untracked build-input set, hashes every sorted emitted relative path, size, and file SHA-256, rejects a source or artifact mismatch, and records the combined source/revision/build/artifact binding.
- Revision boundary: `HEAD` resolves to the initial campaign commit `af647fd79f8124d9dd21e25a2cba7689299edcd8`, while `origin/main` remains `ea574def3e8810c3eb9cf5c9ebe6905dd5ab9f23`; the current worktree contains the final review corrections. The current artifact is therefore identified by its complete source and artifact manifests in addition to the committed revision.

## Targets

- Desktop campaign planning p95 below 50 ms.
- Physical-phone planning p95 below 120 ms.
- At most 4 live campaign zones, 8 objects, and 32 queued effects.
- No unbounded replay or plan work tied to render callbacks.

These are provisional engineering budgets from the brief, not measurements inherited from the packet.

## Measurements

Campaign AI used 20 warmed complete searches. Each search remained at the fixed 36-candidate/36-clone ceiling; the worst search simulated 3,767 bounded engine ticks and rejected no incomplete candidate.

| Measurement | p50 | p95 | max |
|---|---:|---:|---:|
| Campaign AI plan | 10.52 ms | 12.00 ms | 12.09 ms |
| Source encounter construction to first `PLAYER_TURN` | 1.29 ms | 2.31 ms | 3.67 ms |

The entry measurement covers source construction through the first controllable engine state for 40 samples across all four definitions. It excludes browser loading, network, and cache effects; named-browser cold/warm time-to-first-controllable-frame remains pending owner measurement.

Nine retained transcript replays produced these observed maxima:

| Collection/work item | Observed | Hard bound |
|---|---:|---:|
| Authored objects | 3 | 8 |
| Live campaign zones | 0 | 4 |
| Pending causal effects | 0 | 32 |
| Resolved causal effects retained | 2 | observed only; no independent retention cap |
| Simultaneous projectiles | 5 | existing weapon definition |
| Settlement ticks per accepted action | 200 | 1,200 |
| Replay commands per retained transcript | 17 | 256 receipt commands |

Replay command counts are accepted by the canonical `parseCampaignReplayCommands` receipt parser. The runner imports the exported `CAMPAIGN_RECEIPT_REPLAY_COMMAND_LIMIT`, requires it to remain 256, and proves a 257-command journal is refused. Zero live zones is an observation of these retained paths, not a configured cap. The four-zone policy remains enforced and tested separately. Likewise, the causal queue drains synchronously at settlement, so sampled pending depth is zero while the retained resolved ledger reaches two. The 32-item admission limit bounds the pending queue at each enqueue; it does not bound the accumulated resolved ledger.

## Bundle delta

| Artifact | Bytes |
|---|---:|
| `origin/main` production `client/dist` | 11,966,745 |
| Current production `client/dist` | 12,259,336 |
| Total production delta | +292,591 |
| New campaign art within current public tree | 163,082 |

| Build artifact | Source files | Source SHA-256 | Artifact files | Artifact SHA-256 | Source/revision/build/artifact binding SHA-256 |
|---|---:|---|---:|---|---|
| `origin/main` baseline | 449 | `7f56067e126736b471bc349631c2193f9690f9917d64040c01a4ddf5d5f73c55` | 56 | `26087eb00496eab1d5569af49746023760c03cd2d70356a2b06c1ff26895723b` | `850a2cd14895c40e7816cfcf71325be2b4328696bf542d4d7757b2887f5288a8` |
| Current dirty checkout | 510 | `d13f73573f9255281855eed39e2cc67249e059e0e49d215f7b56a8edb2baaeb7` | 62 | `219b924273b2ec24394ec80b24c544a9890ccff1c7430676e3f1c8eedbc2c9fa` | `49bffbfaaaf97d254d8ea02651ccb0fb33bb2cb1772a00ae47cbc508695ec122` |

Totals include Vite's emitted bundle-graph metadata. The identities above were verified by the runner, including an internal negative mismatch control; they identify the artifact/revision/build tuple but are not a reproducible-build claim. The remaining delta includes campaign code and metadata; no claim is made that the main entry is code-split or lazy. Campaign object art itself is requested only when a living campaign object is presented, and wreck-only scenes neither request nor wait on those assets.

## Interpretation and pending proof

The named desktop clears the provisional planning target with substantial headroom, and all observed collections/work stay inside their explicit bounds. This does not substitute for a real-phone p95/frame-stall run, a named browser cold/warm-cache comparison, or listening-room audio acceptance. Those remain explicit pending owner/device checks rather than inferred passes.
