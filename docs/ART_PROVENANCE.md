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
