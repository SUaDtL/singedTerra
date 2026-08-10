# Spec: Deployment Choice Front Door

**Task:** `ux.pregame.0005`
**Status:** approved under the standing continuous-improvement authority

## Player problem

The shipped pre-game shell still asks a new player to interpret a selected setup form before choosing how to play. Production presents Quick Duel beside larger Hot Seat and Play Online tabs, then immediately exposes Local Battery, account, Vehicle Bay, and deployment controls. The fastest route to the artillery loop is implemented but visually subordinate to preparation.

## Decision

Present one focused deployment chooser after the splash. It contains three choices:

1. `Quick Duel vs CPU` — the dominant, one-action route into a standard player-versus-medium-CPU match.
2. `Local Battle` — opens the existing Hot Seat preparation flow.
3. `Play Online` — opens the existing online operation flow.

Local and Online preparation remain existing stateful views. Ordinary Local and Online create/join preparation gain a clear `Back to deployment choices` action and preserve their working values across chooser round trips. Active public-room Browse is a lifecycle exception: Back stops polling and resets Online to Create before exposing other modes. A committed Waiting Room is another lifecycle exception: it omits generic Back so the existing asynchronous Leave action remains the authoritative seat-cleanup path. A valid room-invite deep link continues to open the Online join flow directly, and a valid rejoin opportunity remains ahead of the chooser as the returning player's priority.

## SMARTS choice

| Approach | Player value | Scope fit | Testability | Reversibility | Risk | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Focused chooser before setup | 5 | 4 | 5 | 5 | 4 | Selected. Removes decision overload without rewriting any setup flow. |
| Keep the peer row and only enlarge Quick Duel | 3 | 5 | 4 | 5 | 5 | Rejected. It changes prominence but still shows configuration before a mode decision. |
| Introduce separate routed pages for every pre-game phase | 4 | 1 | 3 | 2 | 2 | Rejected. It expands navigation and state ownership beyond this bounded slice. |

Recommendation strength: strong. Intent comes from the adversarial player audit, the open whole-journey task, the user's menu-overhaul steering, and fresh production evidence on `ab690c8`.

## Acceptance criteria

1. After the splash, an ordinary entry shows a named deployment chooser containing exactly the three mode choices; Hot Seat and Online setup controls are absent.
2. Quick Duel is the single visually dominant chooser action and starts the existing duel through exactly one callback invocation.
3. Local Battle and Play Online each reveal only their existing preparation flow with one action.
4. Ordinary Local and Online create/join preparation provide a clearly named return action. Returning restores focus to the choice that opened the flow.
5. Chooser round trips preserve Local and Online create/join working configuration. Browse Back stops its poll and resets Online to Create; a committed Waiting Room exposes Leave rather than generic Back so room cleanup cannot be bypassed.
6. A validated rejoin opportunity remains before the chooser and is not demoted. A room-invite URL still opens the Online join flow directly.
7. Account overlays, Operations Settings, Garage, Store, and preparation behavior remain unchanged once their owning flow is open.
8. Desktop, compact fine-pointer, and landscape-touch browser oracles prove readable targets, Quick Duel prominence, containment, and no document overflow.
9. A mutation that restores the current peer-row hierarchy or renders setup on ordinary entry fails a causal test.

## Explicit exclusions

- No changes to Quick Duel gameplay, Hot Seat defaults, Online room behavior, account/progression, Auth, persistence, Supabase, Edge Functions, migrations, secrets, engine code, deterministic actions, assets, dependencies, or global stage scaling.
- No rewrite of Local or Online preparation forms.
- No tutorial, in-match HUD, impact-feedback, or progression work.
- No cleanup of historical branches or worktrees.

## Verification

Write failing shell and Lobby state tests first, then implement the smallest view-state seam. Add production-bundle browser tests at desktop, compact fine-pointer, and landscape-touch sizes. Run targeted tests, full client tests, `npm run check`, typecheck, build, audit, exact staged secret scan, and one adversarial exact-diff review package containing this spec, the plan, sprint evidence, tests, and final diff.

## Governance

No accepted ADR is superseded. ADR-0010's waiting-room credential ownership remains unchanged. Account/Auth decisions are presentation-adjacent but untouched. H-05 remains in force: malformed `.codearbiter/sprint-log.md` is neither read nor written; SMARTS and sprint evidence are recorded in this spec, the evidence report, and the review package.
