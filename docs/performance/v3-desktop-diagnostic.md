# V3 desktop diagnostic

Observed 2026-09-14. No production optimization was selected from this bounded
desktop evidence. Physical-device and human first-play observations remain open.

The later [matched cold and cache-retaining desktop observation](v3-matched-desktop.md)
holds the public entry route and battlefield seed constant across three pairs.

## Candidate binding

The final desktop diagnostic ran against
`recovered-console-validation` at clean commit
`3d764a70ed508f9a2dccada3b83b84784b808ec8`. The served preview index and
`client/dist/index.html` both hashed to
`d193cadf86581ef30ab92d68255a2203903e87e61ffacee7f250b04643814822`.
The v2 runner hash is
`9566da0df943fe132d0ca9fa0babdc8483247b75c3c7e927b073d561f720117c`;
its concise receipt hash is
`35706a3765152ebccca9deda5143a4752a654eb674a8227ef85b08ea22c79fc1`.

## Corrected five-cycle desktop observation

The headed Chrome run used a fresh temporary profile. It used one discarded
no-disk warm-up snapshot before cycle 1 to control for first-snapshot inspector
initialization, while not eliminating every instrumentation effect. It then
ran five local match cycles. Each cycle made one real Fire action,
observed `player-turn -> firing -> player-turn`, and used the visible
Match-ledger command path to return to the lobby.

At stable lobby boundaries after two explicit GC passes separated by animation
frames, the observed counters were:

| Counter | Cycle 1 | Cycle 5 |
| --- | ---: | ---: |
| DOM nodes | 432 | 434 |
| JavaScript event listeners | 95 | 95 |
| Used JavaScript heap | 8.03 MiB | 8.94 MiB |
| Object nodes named `HTMLCanvasElement` or `OffscreenCanvas` | 5 | 5 |
| Object nodes labelled detached DOM | 0 | 0 |

The two retained v2 snapshots total 37.09 MB: cycle 1 is
`8407f4a8a300b7a0f4024fc2af58c0a497cbda843b315f8a7df927442e599d51`
and cycle 5 is
`4b951d4a678e169a636d88601173e5c519e47d15e210651929acc3c5b0e4daa4`.
They are bounded diagnostic artifacts, not repository blobs.

The stable DOM/listener and object-only canvas counts do not expose a
per-cycle growth signal in this one warmed desktop sequence. The 959,256-byte
used-heap difference remains unattributed; the two snapshots cannot causally
partition VM/JIT, browser telemetry or cache, route/mode warm-up, and
renderer-library cache state.

A separate source-shaped analysis, bound to the same snapshots and candidate,
found no recognized strongly rooted stale `HotSeatClient`, `InputHandler`,
gameplay renderer, `GameEngine`, frame clock, mounted battle-console
generation, or source-vetted battle DOM marker after either post-quit
boundary. The stable `MatchSessionLifecycle`, HUD, and audio-engine owners
were unchanged singletons. The battle-shaped cycle-5 matches were V8
`AllocationSite` boilerplates whose live-state fields were holes, so they were
kept separate from live-owner evidence. This supports no *observed* stale
owner in these five cycles; it does not establish global absence. Raw weak,
synthetic, and prototype graph paths are not ownership evidence.

The source-shaped attribution report is
`v2-source-attribution.md` SHA-256
`c0705a91fbbba5ccbbde9858ddf4360a7408e84ab0b45bb273d41c8abe505d76`,
with structured receipt SHA-256
`8f0f16eacc7970bd4c5a21d4e4f4181eebf9282105d3fe66de8f3ce97d154558`
and analyzer output SHA-256
`219648b7f761c4363c047e6bd14f4e81d937f5ad5a7cfd349b77675bbb9e77fa`.

## Current-candidate cold and reload first play

An independently reviewed first-play harness ran on the current clean source
commit `1f520b5cd917f9d0df04b7d5d18f3e811a4c97ff`, whose served and disk index
were both
`d193cadf86581ef30ab92d68255a2203903e87e61ffacee7f250b04643814822` and
whose served and disk entry JavaScript were both
`6bab2b18bbe33d71003e828e9bb33406aaf6d0cfe48a78ea8590c61fc2ae542c`.
The checkout status was empty. The no-interception runner SHA-256 was
`b26b60b0c54df023dc338ac6692bd4bb7ffcf8db93aa053de548928993dfb6ee` and
the raw receipt SHA-256 was
`301fa81b03d69656e856709a80960bec8a9fe5572287cdc0ecc1e4b788273654`.

In a fresh temporary Chrome profile, the first visible battle input arrived
at 1,475.4 ms after navigation and the selected First Salvo route accepted
Fire: the control disabled 40.7 ms after click and resolved back to
`player-turn` 6,419.6 ms after click. A same-page `reload()` in that profile
selected Quick Duel, exposed its first visible battle input at 1,080.3 ms,
disabled Fire after 57.5 ms, and resolved to `player-turn` after 6,113.2 ms.
The changing route is recorded rather than normalized away. These are two
automated desktop observations, not a before/after result or an estimate of
human first-play performance.

There was no request interception and no successful non-loopback response in
either condition. The reload navigation reported Performance Navigation
Timing `deliveryType: "cache"` and a 300-byte transfer size, compared with
the cold navigation's 1,655-byte transfer size. CDP
`requestServedFromCache` was set only for two embedded data-image URLs, so the
receipt does not claim a general HTTP-asset cache-hit rate or a production
Pages transfer saving. The post-resolution screenshot SHA-256 is
`49d747d2c8fa09cc43d0cb6802ae563c025a606a3ffa0ff21315e3ac747379b7`.

## Superseded harness artifact

An earlier forced-GC harness created undisposed Playwright `ElementHandle`s in
two Fire-control code paths. Heap review traced a strong DevTools/global-handle route through an
old Fire button and listener closure into an active battle-console generation.
That contaminates its ownership/retainer attribution; it must not support a
claim about product retention. The v2 harness uses locator-native operations
and page-side primitive results, disposing every `waitForFunction` handle in a
`finally` block. The original receipts and source-shaped attribution remain task-local. The two
contaminated heap snapshots were removed after their hashes and the cleanup
proof were recorded; only the two corrected snapshots remain.

## Scope and next evidence

Earlier cold/warm and first-play measurements are historical evidence from an
older runtime binding. They remain useful for the earlier entry observation,
but they do not bind this final candidate and are not a before/after comparison
for it.

The runner gives First Salvo priority when that control is visible, and otherwise
uses Quick Duel. It did not record the selected route for each of the five
cycles. The sequence therefore does not establish five same-mode journeys; any
route or mode effect remains a confound for this desktop observation.

No asset, loading, rendering, or lifecycle optimization is justified from these
bounded desktop traces alone. The open T14 evidence remains physical-phone and
human first-play validation, together with any future source-vetted attribution
needed to explain the residual desktop heap difference. This diagnostic does
not measure native/GPU/audio memory, thermals, power, input-to-photon latency,
or human usability, and it neither proves nor disproves a general leak.
