# Proposed CONTEXT.md Product-Stage Refresh

**Reason:** `.codearbiter/CONTEXT.md` is protected by H-18 and Codex's
patch-only file tool cannot prove that an incremental patch preserves the
activation frontmatter. The maintainer requested this update; applying it still
requires the sanctioned protected-context write path or one explicitly logged
H-18 override.

## Preserve exactly

- The frontmatter remains:

  ```yaml
  ---
  arbiter: enabled
  stage: 1
  ---
  ```

- Preserve deterministic engine, network action-log, Supabase security,
  diagnostics, primary-user, current-scope, not-building, coverage, and license
  facts unless separately corrected by current source.
- CodeArbiter `stage: 1` remains a governance setting until the maintainer
  explicitly changes it. It must not be used to downgrade product ambition.

## Replace Purpose

Replace the “personal project / technical exercise” ending with:

> singedTerra is now a sustained game project. The maintainer has invested in
> its gameplay, production deployment, progression, security, and presentation
> and expects architectural choices to optimize for player experience,
> maintainability, and reliable delivery. Early proof-of-concept constraints
> remain historical evidence, not permanent bans on dependencies, rendering
> libraries, or deeper product work.

## Add UI architecture after the one-line architecture section

> **Battle HUD architecture (ADR-0017):** the gameplay world remains Canvas 2D,
> while a lazy-loaded, non-interactive PixiJS layer renders authored battle-HUD
> visuals from one typed layout/socket model. Semantic DOM remains the owner of
> text, focus, accessibility, dialogs, input, and gameplay callbacks. Sharp is a
> development-only deterministic asset compiler. The static Vite/GitHub Pages
> deployment model is unchanged.

## Replace Strategic direction heading and introduction

Use:

> ## Strategic direction (product-stage clarification 2026-08-21)
>
> singedTerra began under a staged-seriousness ladder intended to prevent a
> proof of concept from accumulating unnecessary paid infrastructure or broad
> dependencies. The project has crossed that product-interest threshold. The
> maintainer explicitly directs future architecture to favor making the game
> better and easier to sustain, including reviewed dependencies or rendering
> technology when they materially help. Costly hosted services, backend
> rewrites, and irreversible operational commitments still require explicit
> decisions; they do not imply a blanket ban on client libraries or tooling.

Retain the existing cheat-protection, scale, backend, roadmap, and identity
bullets as current bounded decisions, subject to their later ADRs.

## Replace Maturity introduction

Use:

> ## Maturity
>
> **Product maturity:** sustained playable game under active product and visual
> development, deployed publicly with hot-seat, networked play, accounts,
> progression, verification, and responsive browser support.
>
> **Governance maturity:** CodeArbiter remains configured at Stage 1 until the
> maintainer explicitly changes that setting. Stage 1 controls gate weight; it
> does not mean “throwaway prototype” and must not be cited to reject otherwise
> justified dependencies, visual systems, testing, or maintainability work.

## Required cross-links

- Link ADR-0017 and `.codearbiter/specs/battle-console-hybrid-compositor.md`.
- Note that ADR-0001, ADR-0004, ADR-0005, and ADR-0006 have forward
  supersession chains; see `.codearbiter/plans/prototype-era-adr-review.md`.
