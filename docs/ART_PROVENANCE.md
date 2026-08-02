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
