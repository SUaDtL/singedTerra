# Commander Operations Board

**Initiative:** `career.initiative.0001`
**Decision:** `career.operations.0002`
**Status:** approved by the standing continuous-improvement authority

## Player outcome

An authenticated Commander returns to one deliberate Battery surface rather
than a collection of unrelated launch controls. It answers three questions at
a glance: who am I now, what is my current verified order, and what can I do
next? A verified deployment remains the meaningful progression route; Quick
Operations are explicitly framed as local practice, not an alternate reward
path.

## SMARTS decision

1. Add more objectives or rewards first. Rejected: objective rotation already
   exists and a new reward or entitlement changes the authenticated authority
   surface before players can clearly understand the loop.
2. Redesign every anonymous and online lobby route. Rejected: that is a broad
   pregame initiative and risks regressions outside the active career outcome.
3. Compose the authenticated Battery around the existing truthful parts.
   Selected: Specific=5, Measurable=5, Achievable=4, Relevant=5,
   Time-bounded=4, Satisfaction=5; confidence high. It improves the whole
   return loop while leaving all game, receipt, and account authorities intact.

## Contract

- Authenticated Local Battle shows exactly one `Commander Operations` board.
  The existing Commander dossier remains immediately above it; the board
  consolidates the current Field Order, verified deployment controls, and a
  clearly labelled local-practice Quick Operations lane.
- The board owns layout and hierarchy only. It reads existing validated
  `AccountState`, `FieldOrder`, verified deployment state, and the immutable
  Quick Operations catalog. It does not calculate XP, rank, order selection,
  receipt validity, or a game configuration.
- The verified lane preserves its current start, resume, abandon-confirmation,
  expiry, busy, failure, and focus behavior. No action labels or authority
  checks are weakened.
- The practice lane launches only the existing Quick Duel route. Every card
  remains local, unsigned, and excluded from verified progression, account
  summary, online rooms, and After Action receipt claims.
- Anonymous, online, custom Local Battle, resumed verified deployment, expired
  deployment, and error states retain their existing routes. They do not render
  a fabricated Commander Operations claim.
- Desktop, compact fine-pointer, and landscape touch stay single-screen,
  keyboard reachable, readable, and free of document/lobby-card overflow.

## Acceptance evidence

1. RED/GREEN view and Lobby composition tests prove one authenticated board,
   exact content ownership/order, no duplicate launch actions, and every
   excluded-state absence.
2. Tests drive existing verified start/resume/abandon and Quick Operations
   callbacks through the board, proving no new configuration or progression
   path is introduced.
3. Browser journeys across desktop, compact, and Pixel show the board, launch
   a verified deployment and a local practice operation through their ordinary
   controls, then assert fit, focus order, touch targets, and no false reward
   language.
4. The client, deterministic, Edge, typecheck, and full browser matrices stay
   green. An adversarial review clears the exact diff before commit.
5. Exact-head hosted CI/CodeQL/Pages, merge, deployed provenance, and one
   authenticated production Battery-to-verified-launch observation complete the
   delivery record.

## Boundaries

Client composition and presentation only. No Auth policy, schema, migration,
Edge Function, action protocol, deterministic engine, reward formula,
dependency, or secret change is in scope.
