# Sprint Plan — Graphical Overhaul (the "love letter" art direction)

> **ARCHIVED 2026-06-07 — COMPLETE.** All five slices shipped: `2ce5b3c` (pixel splash),
> `0a21c33` (Slice 0–1: tokens + CRT + dusk world), `b34794a` (Slice 2: projectiles +
> 16-bit explosions + juice), `17d3fc1` (Slice 4: lobby re-skin, "overhaul complete").
> Slice 3 (HUD) landed via the HUD-relocation commit `106953a` + backlog fixes
> P3-16/P3-13b/P2-11. Kept for reference; the banner palette in `client/src/ui/theme.ts`
> is now the shipped baseline any new UI must match. Superseded by the V1 gameplay sprints.

> Pulled AHEAD of Sprint 4 Slice 3 (shield), by user decision (2026-06-06). Slices 0–2
> of Sprint 4 are shipped (8/11 weapons, 8 determinism harnesses). This sprint makes the
> **whole game look like `docs/assets/banner.svg`** — the README banner / in-game splash.

## Goal

Re-skin singedTerra **across the board** to match the banner art: a dusk-palette,
vector-pixel, CRT-flecked **homage to Scorched Earth that does not *feel* like 1991**.
Retro aesthetic (chunky shapes, limited palette, scanlines, pixel-crisp edges) carried by
modern feel (smooth gradients, glow, eased motion, juice, readable type). The splash screen
already sets the bar; everything else should look like it belongs in the same frame.

**Guiding star:** *"that's the design, that's the vibe."* When in doubt, open `banner.svg`
and match it.

## Approach — DECIDED: vector-pixel hybrid

Redraw every surface as **crisp vector shapes** (Canvas 2D primitives + DOM/CSS) in the
banner palette, with real gradients + a CRT scanline/vignette overlay + chunky type — i.e.
*exactly what the SVG is*. NOT true low-res nearest-neighbor sprites (would feel too 1991),
NOT a recolor-only pass (not transformative enough). Pixel-faithful look, stays sharp at any
canvas scale, and cheap on a t3.micro (CRT is one CSS layer, not per-pixel canvas work).

## How we work (carried over — non-negotiable)

- **Client-only. ZERO `shared/` changes.** All rendering lives in `client/`; the deterministic
  engine and the 8 harnesses are untouched. `npm run check` must stay green the whole sprint
  (it will, since we don't touch `shared/`), and `npm -w @singedterra/client run typecheck` +
  `npm run build` must pass at every slice boundary.
- **REVIEW-BEFORE-COMMIT:** no commit/push without an explicit ask.
- **Reuse the running Vite dev server** (HMR) for visual iteration — do NOT spawn new ones;
  on Windows kill by PID, not by cancelling the npm task.
- **Verification is visual** (no engine harness for pixels): each slice ends with a typecheck +
  build green AND a screenshot / dev-server look-see against the banner. Keep `prefers-reduced-motion`
  honored so motion never becomes a barrier.

---

## Slice 0 — Design-token foundation + global CRT layer (S/M)  ◄ do first

One source of truth for the look, shared by DOM and canvas, so nothing drifts.

- **Task 0.1 (S) Theme tokens.** Create `client/src/ui/theme.ts` exporting the canonical palette
  + type scale as TS constants (sky stops, gold `#ffd23f`, ember `#ff7a1f`, tank red `#e84d4d`,
  tank blue `#4d8ce8`, charcoal terrain ramp, text golds), so **canvas renderers** import the
  exact same values the DOM uses. Mirror them as CSS custom properties in `:root` in
  `client/src/style.css` for the DOM side. Single edit point for all future tuning.
- **Task 0.2 (S) Type system.** Define the font stack: a chunky **display** face for titles/headings,
  a **mono** for HUD numerics (angle/power/wind), and a clean **sans** for body — "retro accent,
  modern legibility." (Decision D1 below: bundle a display font vs. system stack.)
- **Task 0.3 (M) Global CRT chrome.** A single overlay layer over `#app` (scanlines + dusk vignette
  + faint ember bloom), as cheap CSS (the splash already prototypes this in `Splash.ts`). Pull that
  treatment out into a reusable layer applied to the whole app, intensity tunable (Decision D2),
  `prefers-reduced-motion`/low-end friendly.
- **Verify:** client typecheck + build green; the app frame (behind lobby/game) already reads as
  "banner world" with scanlines.

---

## Slice 1 — The canvas world (M/L)

Make the playfield itself look like the banner: sky, terrain, tanks.

- **Task 1.1 (S) Sky.** `Renderer.ts drawSky()` → the banner's multi-stop dusk gradient
  (indigo→magenta→ember→amber), optional pixel stars + a low pixel sun, drawn once / on resize.
- **Task 1.2 (M) Terrain.** `TerrainRenderer.ts` → scorched layered fill (charcoal→brown ramp) with
  a lit rim highlight along the surface (banner style), keeping the existing dirty-flag re-render.
  Pixel-crisp edges, no gradient mush.
- **Task 1.3 (M) Tanks.** `TankRenderer.ts` → banner-style tank: chunky body + tread + rotatable
  barrel in the per-player palette, a top highlight band, subtle pixel detailing, clear active-tank
  emphasis. Stay readable at 800×500.
- **Verify:** typecheck + build green; a 2-tank hot-seat frame is side-by-side indistinguishable in
  *vibe* from the banner.

---

## Slice 2 — Projectiles & explosions (the juice) (M/L)

Where "modern feel" earns its keep — motion + light the 1991 original never had.

- **Task 2.1 (M) Shell + trajectory.** `ProjectileRenderer.ts` → glowing shell (banner's gold/white
  core) + a fading dashed **trajectory trail** echoing the banner's arc. Handles the whole
  `projectiles[]` array (airburst submunitions, funky split) — purely visual, reads engine state.
- **Task 2.2 (L) Explosions.** Re-skin the event-driven burst to the banner's **16-bit airburst**:
  radial blast core + pixel **shrapnel spokes**, ember palette, per-`ExplosionStyle` look
  (`blast` vs `cluster`), driven by each `ExplosionEvent`'s `color`/`radius`/`durationFrames`
  (already in the contract — no engine change). Cluster/napalm fire N at once; must stay cheap.
- **Task 2.3 (S) Impact juice.** Subtle, tasteful screen-shake on detonation (scaled by radius),
  crater scorch tint, dirt-bomb upward puff — all client-only, `prefers-reduced-motion`-gated.
- **Verify:** typecheck + build green; firing each weapon (incl. cluster/funky/napalm/betty) looks
  like the banner's boom and *feels* alive.

---

## Slice 3 — HUD & in-game chrome (M)

The overlay that frames the action — already HTML/CSS over the canvas (SPEC §8), now on-theme.

- **Task 3.1 (M) HUD skin.** `HUD.ts` (+ `HUDRenderer.ts` if used) → health bars, the **wind gauge**
  (banner's top-right arrow + value), angle/power readouts (mono numerics), active-player banner,
  controls legend — all in the token palette with pixel-crisp framing.
- **Task 3.2 (S) Weapon strip restyle.** The Slice-1.3 weapon strip (`HUD.ts`) → banner-styled
  buttons: gold active highlight, ember on hover, ammo in mono, ∞ glyph for unlimited (keep behavior).
- **Task 3.3 (S) Turn/feedback motion.** Eased turn-transition + active-player pulse + damage
  flash — modern feel, reduced-motion safe.
- **Verify:** typecheck + build green; HUD reads as one piece with the canvas world.

---

## Slice 4 — Lobby, splash & game-over cohesion (M)

First and last impressions, made consistent end-to-end.

- **Task 4.1 (M) Lobby re-skin.** `Lobby.ts` (+ CSS) → both hot-seat and online tabs in the banner
  aesthetic: dusk panel, gold/ember controls, pixel framing, color-swatch picker matching tank palette.
- **Task 4.2 (S) Splash alignment.** Reconcile `Splash.ts` with the new `theme.ts` tokens so the
  splash, lobby, and game share exact values (the splash currently hardcodes a few — point them at
  the tokens).
- **Task 4.3 (S) Game-over screen.** Winner announcement + restart in-theme (banner title treatment),
  a satisfying end-of-match beat.
- **Verify:** typecheck + build green; splash → lobby → game → game-over is one cohesive, modern-retro
  experience.

---

## Decisions to lock (please confirm on review)

- **D1 — Display font.** Bundle one tasteful display/headline font (self-hosted, no external CDN at
  runtime) for titles, OR use a refined system stack only. *Recommendation:* bundle ONE display face
  for headings (keeps "modern, deliberate"), system mono for numerics, system sans for body.
- **D2 — CRT intensity.** Subtle (recommended — scanlines barely-there, soft vignette) vs. heavy
  (pronounced lines/curvature). Make it a single token so it's trivially dialable; ship subtle.
- **D3 — Juice level.** How much motion (screen-shake, pulses, parallax sky). *Recommendation:*
  tasteful default, all `prefers-reduced-motion`-gated.
- **D4 — Scope of "across the board."** Confirm Slices 0–4 cover it, or call out anything missing
  (e.g., favicon/title-tab, loading states, mobile/touch HUD — the last is a V1 item).

## Out of scope (deferred)

- **Audio / SFX** (Web Audio synth) — its own pass; pairs naturally with the juice but separate.
- **Sprint 4 Slice 3 (shield)** — resumes after this overhaul.
- **True low-res sprite mode** — explicitly not the chosen direction.
- **Mobile/touch HUD** — V1 roadmap item.

## Sequencing & verification gates

```
Slice 0 (tokens + CRT)  ──►  Slice 1 (world: sky/terrain/tanks)
                                  │
                                  ├─►  Slice 2 (projectiles + explosions + juice)
                                  ├─►  Slice 3 (HUD + chrome)
                                  └─►  Slice 4 (lobby + splash + game-over)
```

Slice 0 is the prerequisite (everything imports the tokens). Slices 1–4 can proceed in order or,
under an ultracode workflow, partly in parallel **by file ownership** (canvas renderers vs. DOM
UI are disjoint) once tokens are frozen. Each slice ends green on
`npm -w @singedterra/client run typecheck` + `npm run build`, plus a visual check against the banner.
No `shared/` edits, so the 8 engine harnesses stay green by construction.
