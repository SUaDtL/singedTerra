# Authenticated Production Diagnostics Specification

**Status:** Approved under the maintainer's standing bounded-initiative authority and explicit durable-interface direction on 2026-08-11
**Governs:** client/src/client/ProductionDiagnostics.ts, client/src/client/ProductionDiagnostics.test.ts, client/src/ui/ProductionDiagnosticsView.ts, client/src/ui/ProductionDiagnosticsView.test.ts, client/src/ui/Lobby.ts, client/src/ui/Lobby.account.test.ts, client/src/ui/Lobby.anonymousAccount.test.ts, client/src/style.css, tests/**, .codearbiter/CONTEXT.md, .codearbiter/security-controls.md

## Problem

The maintainer can open the deployed game in a browser that already holds a Supabase account session, activate a durable diagnostics console, and execute authenticated production checks without extracting a token or entering credentials again. The console gives a stable, secret-free PASS or FAIL receipt that browser automation can read. Ordinary players never see the console unless they deliberately use its query parameter.

This closes the remaining production proof for `verified_replay_probe` and establishes the reusable verification surface expected for later authenticated functions.

## Approach

Add a URL-activated client diagnostics console with a compile-time check registry. It reuses the existing Supabase client session, validates each allowlisted response exactly, and projects only a sanitized receipt. This is preferred over a one-use browser command because it remains repeatable, reviewable, and extensible; the trade-off is a permanent but deliberately isolated client maintenance surface.

## Scope

In scope: the diagnostics runner, fixed verified-replay check, account-readiness handoff, true modal view, one-shot autorun, sanitized receipt copy, browser layout proof, security documentation, and authenticated production verification.

Out of scope: generic request composition, normal player navigation, new server behavior or data, and the separately queued account-to-online-name continuity repair.

## Design read

This is a web operations console for the maintainer and browser automation, in a restrained technical register that belongs to singedTerra's command-deck design. STRUCTURE 3, DENSITY 8, REGISTER 3, MOTION 1. It uses the existing dark CRT palette, type system, sharp gold rules, and modal layering. Status is conveyed by text and structure as well as color. No new image or decorative motion is warranted.

## Architecture

### Activation and containment

- `diagnostics=1` activates the console. It is not linked from ordinary game navigation.
- The console renders as a true modal layer over the lobby, not as content that reflows or displaces the game preparation surface.
- The modal has a heading, concise scope statement, account readiness, check list, primary Run checks action, Close action, and a receipt region with stable accessible labels.
- `autorun=1` is honored only when diagnostics are activated. It schedules exactly one run after the account state becomes authenticated and never loops on failure or rerender.
- Closing the console removes `diagnostics` and `autorun` from the current URL with `history.replaceState` while preserving unrelated query parameters and the document path/hash.

### Auth boundary

- The diagnostics backend imports the existing Supabase singleton lazily and calls `client.functions.invoke`.
- It must not call `auth.getSession`, read browser storage, construct an Authorization header, accept a credential argument, or expose a credential through state, DOM, logs, URL, clipboard, or receipt.
- Account state controls readiness: unavailable, loading, anonymous, authenticated-error, and authenticated have distinct non-secret UI states. Anonymous users are directed to the existing Account sign-in surface.
- Endpoint authentication remains authoritative. URL activation and a client-side authenticated state are usability gates, never authorization.

### Allowlisted checks

- The production registry is immutable and compile-time defined. The public runner API accepts no operator input; one Run action executes the entire captured registry and accepts no URL, check id, function name, method, headers, body, or parser.
- The first and initially sole check id is `verified-replay-runtime`.
- It invokes function `verified_replay_probe` with no body and no manual header.
- Its validator accepts only the exact versioned response contract: `ok: true`, probe version 1, engine version 1, ruleset version 3, and the pinned maximum-lifecycle and maximum-turn fixture outcomes already governed by the hosted-probe specification.
- Unknown, missing, extra, unsafe numeric, or contradictory response fields fail as `invalid_response`; function errors fail as `request_failed`; a ten-second bound fails as `timeout`.
- Raw exceptions and provider messages never enter diagnostics state, logs, DOM, or receipts.

### Runner lifecycle and receipts

- Runs are sequential and single-flight. A second Run action while active is disabled and causes no second request.
- Each run captures the immutable registry order and settles each registered check exactly once.
- Late completion from a timed-out, closed, superseded, signed-out, or disposed run cannot replace current state.
- A receipt has schema version 1, overall `PASS` or `FAIL`, and one result per registered check with only check id, label, status, bounded code, and validated public details.
- Receipts contain no user id, email, display name, access or refresh token, request/response headers, raw body, URL query, stack, raw error, timing measurement, database id, or gameplay seat token.
- Copy receipt is allowed only for the already-sanitized receipt projection. Clipboard failure is reported locally without changing the check result.

## Decided parameters

- Activation parameters are exactly `diagnostics=1` and optional `autorun=1`.
- The first check id is `verified-replay-runtime`; its fixed function is `verified_replay_probe` and it sends no body.
- Each check has a 10,000 ms settlement bound.
- Receipt schema version is 1 and contains no timestamps or durations.
- Checks run sequentially in immutable registry order and only one run is active.
- The console uses the existing lobby modal layer and existing command-deck design tokens.
- Closing uses `history.replaceState` and preserves unrelated URL state.

## Acceptance criteria

1. `ProductionDiagnostics` accepts no operator-selected check or request input, executes every descriptor in a frozen registry snapshot, invokes `verified_replay_probe` with no body or manual header, validates each response independently, and rejects malformed or widened responses with `invalid_response`.
2. Request rejection, thrown transport failures, and raw provider messages collapse to `request_failed`; no secret-like fixture appears in serialized state, DOM, logs, or copied receipt.
3. Each check has a ten-second timeout, only one run can be active, and late work from timeout, close, sign-out, supersession, or disposal cannot update the current receipt.
4. `diagnostics=1` produces an accessible modal over the lobby without changing base layout geometry. It is absent without the parameter and has no ordinary navigation link.
5. Account loading, unavailable, anonymous, authenticated-error, ready, running, pass, and fail states render distinct, usable instructions. Anonymous diagnostics can open the existing Account sign-in surface without collecting credentials themselves.
6. `autorun=1` runs once only after authenticated readiness, survives intermediate account loading rerenders, and does not rerun after completion, failure, close, or unrelated account refresh.
7. Closing removes only the two diagnostics query parameters and restores focus without reload. Keyboard Escape closes the modal, focus remains contained while open, and reduced-motion behavior remains static.
8. The modal is usable at desktop, compact landscape, and supported mobile-landscape widths with aligned rows, no overlap, no page reflow, and no horizontal overflow.
9. Existing account, lobby, hot-seat, online, anonymous, and no-Supabase paths remain unchanged when diagnostics are inactive.
10. Security controls and project context define the console as an allowlisted test interface, not an authorization control or generic request runner.
11. The final diff adds no Edge Function, migration, dependency, monitoring vendor, service-role access, progression write, rank award, reward, entitlement, or gameplay mutation, and the existing static, audit, type, and deterministic gates prove that boundary.
12. The final adversarial package contains this spec, the plan, sprint audit, RED/GREEN tests, browser/layout evidence, and final diff. Every Critical, High, and merge-blocking finding is resolved.
13. Exact reviewed PR-head CI is green before merge. GitHub Pages publishes the merged head, then Chrome with the existing signed-in session opens `?diagnostics=1`, runs the check without credential extraction, and displays a PASS receipt for `verified-replay-runtime`.

## Out of scope

- No generic endpoint, method, header, body, SQL, RPC, arbitrary fetch, script, or credential input.
- No new Edge Function, migration, dependency, monitoring vendor, service-role access, progression write, rank award, reward, entitlement, or gameplay mutation.
- No normal player menu entry and no claim that diagnostics activation is authorization.
- Account-to-online-name continuity and the false signed-out progression copy remain the next player-identity slice after this production-proof slice.

## Open questions

None.
