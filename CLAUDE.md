# CLAUDE.md

singedTerra is a playable browser artillery game with a shared deterministic
TypeScript engine, local and networked play, and a Supabase backend.

## Current task entry

For the authorized evidence-backed recovery v2, read the
[approved scope and acceptance criteria](.codearbiter/specs/evidence-recovery-v2.md),
then the [sole execution-status ledger](.codearbiter/plans/evidence-recovery-v2.md).
The parent owns that ledger and assigns exact write paths. Read
[Architecture](docs/ARCHITECTURE.md) for current owners and the source-of-truth map.
Verify the checkout and task evidence before changing code or repeating work.

[Software recovery](docs/SOFTWARE_RECOVERY.md) records previously delivered
packages and their evidence limits. Its older implementation plan and reusable
goal describe that prior program; they do not dispatch the current recovery or
authorize repeating completed packages. Existing backlogs remain context,
not additional execution ledgers.

## Working contracts

- Keep `GameSessionComposition`, `MatchSessionLifecycle`, and the existing room
  and presentation owners. Correct their assigned behavior without introducing
  another coordinator or mandatory file-size/module-count target.
- Preserve fixed-step deterministic physics and the room's versioned replay
  semantics. Ordinary online referees coordinate the action log; bounded
  verification-only Edge replay is a separate context.
- ADR-0018 defines one Preact semantic battle-console tree. Canvas 2D owns the
  gameplay world; lazy, non-interactive Pixi supplies decoration through the
  shared typed layout projection.
- Read [coding standards](.codearbiter/coding-standards.md),
  [security controls](.codearbiter/security-controls.md), and applicable accepted
  ADRs before touching their boundaries. Stale descriptive prose is corrected
  only within the approved task; an actual accepted-ADR conflict needs the owner.
- Preserve applied migrations, historical verified replay and immutable receipt
  compatibility, existing worktrees, and unrelated dirty work. Audit
  reproductions and old deployment checks are evidence of their recorded
  revision, not proof that a current correction has shipped.

## Commands and deployment

Resolve commands from the current root and workspace `package.json` files.
Common local checks are `npm run test:client`, `npm run check`,
`npm run typecheck`, and `npm run build`; Edge and disposable database checks
are `npm run check:edge` and `npm run check:database`. Select checks for the
assigned change and record what actually ran.

The client is a static Vite build hosted on GitHub Pages; Supabase provides
Edge Functions, Postgres, and Realtime. Current workflows and deployment scripts
define the executable release graph. The current recovery's operational limits
are in the approved scope above; historical commands are not new deployment
authorization.
