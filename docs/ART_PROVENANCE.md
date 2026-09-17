# Art provenance

singedTerra's raster art is project-owned presentation material. It does not
change deterministic engine behavior, hit geometry, or network state.

## Authored battlefield panoramas

| Project asset | Origin | Production treatment |
| --- | --- | --- |
| `client/public/art/battlefield-backdrop.webp` | Existing project-generated Ember Dusk panorama | Opaque 1774x887 WebP |
| `client/public/art/battlefield-obsidian-caldera.webp` | Generated for this project with OpenAI's built-in image generation tool on 2026-08-02 | Inspected, encoded locally as opaque 1774x887 WebP |
| `client/public/art/battlefield-glassstorm-expanse.webp` | Generated for this project with OpenAI's built-in image generation tool on 2026-08-02 | Inspected, encoded locally as opaque 1774x887 WebP |

The two 2026-08-02 prompts used Ember Dusk only as a style/quality reference.
They requested distinct, center-safe 2:1 middle-distance worlds—one volcanic
obsidian caldera and one cold crystal/salt expanse—with open sky and a subdued
lower play band. Both prompts prohibited foreground terrain, tanks, vehicles,
people, weapons, projectiles, explosions, celestial bodies, text, UI, logos,
trademarks, and watermarks.

The source PNGs remain in the local Codex generation store recorded by the sprint
receipt. Only the optimized WebPs are shipped with the game.

## World-matched terrain materials

| Project asset | Origin | Production treatment |
| --- | --- | --- |
| `client/public/art/terrain-material.webp` | Existing project-generated Ember Dusk rock material | Existing opaque 256x256 WebP retained unchanged |
| `client/public/art/terrain-material-obsidian-caldera.webp` | Generated for this project with OpenAI's built-in image generation tool on 2026-08-02 | Inspected, edge-mirrored, locally encoded as a 15,642-byte opaque 256x256 WebP |
| `client/public/art/terrain-material-glassstorm-expanse.webp` | Generated for this project with OpenAI's built-in image generation tool on 2026-08-02 | Inspected, edge-mirrored, locally encoded as an 18,152-byte opaque 256x256 WebP |

The Obsidian prompt requested orthographic fractured volcanic glass and dense
black basalt with sparse restrained ember seams. The Glassstorm prompt requested
orthographic wind-scoured salt crust and translucent mineral plates with cool
blue-gray fractures and sparse icy teal inclusions. Both requested uniform
micro-to-medium texture density for downsampling and prohibited scenery,
horizons, objects, tanks, people, weapons, projectiles, explosions, smoke, text,
symbols, logos, UI, borders, watermarks, and transparent areas.

Source PNGs:

```text
C:/Users/brenn/.codex/generated_images/019f80b3-f72e-75c1-bbe6-edd1d70e47a7/exec-4bfbf8e2-d5e0-4ba8-9fd6-ca346c7c02ac.png
C:/Users/brenn/.codex/generated_images/019f80b3-f72e-75c1-bbe6-edd1d70e47a7/exec-142714b2-aaab-433b-86b4-d0a596ad1021.png
```

Only luminance modulation enters the renderer; the world profile supplies the
ground palette. This keeps material grain subtle, makes palette-only fallback
complete, and leaves terrain geometry and deterministic state untouched.

## Ash Road campaign family

These six assets were generated specifically for this project with OpenAI's
built-in image-generation tool on 2026-09-17. They use no third-party source
image, logo, typeface, or purchased material. The project may use the generated
outputs under the applicable OpenAI output terms. Canonical collision, health,
warning, and objective state remain code-owned; pending or failed image loads
retain the documented code-native fallback.

| Project asset | Generation record | Production treatment | SHA-256 |
| --- | --- | --- | --- |
| `client/public/art/campaign/ash-road-drum.webp` | `exec-3bb7913d-0bc5-4aca-89cd-1ecbb0d68fb6.png` | Contain-fit 256x256 transparent WebP, quality 82, alpha quality 90 | `cd3e66c5ba52db916892ff1d0977a2b33689a9464639550baea4e17fdd26343b` |
| `client/public/art/campaign/ash-road-refinery.webp` | `exec-37f418b2-6bfa-4f37-96f6-ce0399d026c7.png` | Contain-fit 320x256 transparent WebP, quality 82, alpha quality 90 | `ddd9435cf5d658fcc4c5e57e3f3b6b156ace7243d7bcd2606e6dce958213fe07` |
| `client/public/art/campaign/ash-road-relay.webp` | `exec-69301c18-dfc6-40a4-9b59-cd7ea6b156d1.png` | Contain-fit 256x256 transparent WebP, quality 82, alpha quality 90 | `073088ce09ca09825b09538a44cc9c88092b65815986f7e2978776fcd477c023` |
| `client/public/art/campaign/ash-road-cache.webp` | `exec-7d7c1a4e-b0ad-43f1-8d39-b586bc4d0efe.png` | Contain-fit 320x256 transparent WebP, quality 82, alpha quality 90 | `b99e7b43f75f8ba9498ce8e5579a0426912563e7b4dadb23aec5a231ef940050` |
| `client/public/art/campaign/ash-road-siege.webp` | `exec-184ad511-4f64-4b50-96c8-7dcad20baef7.png` | Contain-fit 384x256 transparent WebP, quality 82, alpha quality 90 | `2cd05a5a85744e5235634c3a2d140bbad4344a3270ba612db61e5ca87ffdda5d` |
| `client/public/art/campaign/ash-road-panorama.webp` | `exec-1c4a2d35-bc1e-42fa-b717-51d7dcf0b061.png` | Contain-fit 1440x480 opaque WebP, quality 82 | `28c61911c9d978dc3ea33c0abd10bcc6c8c4f32330a18711816bd1ec78389d4c` |

The object prompts requested isolated, orthographic, transparent, weathered
industrial subjects with rust-orange, soot-black, and muted-brass materials;
small-size silhouette readability; and no text, logos, watermarks, ground plane,
or extra objects. The siege prompt requested a left-facing, normal-hull tracked
gun with no crew or muzzle flash. The panorama prompt requested a 3:1 ash-desert
road, distant refinery/relay silhouettes, no characters or vehicles, and no fake
collidable foreground terrain. Source PNGs are retained in:

```text
C:/Users/brenn/.codex/generated_images/01a0ac50-5203-7750-87c2-35aa09c5722a/
```

Required damaged/failed/disabled states are composed from the shipped base art
plus deterministic Canvas health bars, crack marks, and a high-contrast failure
cross. Relay disabled is therefore structurally marked rather than represented
only by dimming. Siege warning state remains the canonical target region and
semantic text over the real 100-hull tank; the decorative image never changes
its collision or hull. The panorama and siege preview hide on load failure while
the existing battlefield and factual checkpoint UI remain complete.
