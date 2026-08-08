# Nanoid audit-gate repair

Status: approved under standing sprint authority
Date: 2026-08-08
Task: deps.audit.0002

## Problem

The locked Vite/PostCSS build graph resolves `nanoid@3.3.16`, which is in the
High-severity GHSA-2v37-7h3g-55p8 advisory range. The repository's mandatory
`npm run audit:deps` gate therefore fails before any product slice can merge.

## Contract

1. Keep the existing Vite and PostCSS versions unchanged.
2. Constrain their transitive nanoid resolution to independently reviewed
   `nanoid@3.3.18` in the root manifest and lockfile.
3. Run the reviewed dependency mutation with `--ignore-scripts`; add, approve,
   or execute no new or changed lifecycle script, and add no runtime dependency.
4. Preserve all product, engine, client, Edge, database, authentication, and
   deployment behavior.
5. Require registry integrity, signature and provenance evidence, a zero-High
   dependency audit, the full client suite, deterministic checks, production
   build, diff hygiene, and adversarial final review.

## Acceptance

- `npm ls nanoid postcss vite --all` resolves only `nanoid@3.3.18` through the
  existing PostCSS/Vite graph.
- `npm audit signatures` succeeds.
- `npm run audit:deps`, `npm run build`, `npm run test:client`, and
  `npm run check` all succeed.
- The product source diff is empty; the dependency diff contains only the root
  override and the nanoid lock entry.

## Non-goals

- Upgrade Vite, PostCSS, or another package.
- Add or approve install scripts.
- Change application behavior or adopt nanoid directly.
- Alter Supabase, authentication, schema, secrets, or deployment configuration.
