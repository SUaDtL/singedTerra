# Account panel containment

Status: approved under standing sprint authority
Date: 2026-08-08
Task: reliability.account.0001

## Problem

The authenticated account panel always renders its complete match, level, and
XP dashboard as a transparent absolute overlay. In the compact production
layout it covers the Vehicle Bay and Ballistics controls, making both surfaces
look merged and substantially reducing readability.

## Contract

1. Authenticated accounts render as one compact, self-identifying account
   trigger by default; the detailed progression dashboard is absent until the
   player activates that trigger.
2. The trigger communicates its expanded state and includes the display name
   plus current level when a validated summary is available.
3. Activation opens the existing server-derived Matches, Recorded wins, Level,
   XP meter, exact remaining-XP copy, and Sign out action inside an opaque,
   bordered popover with an explicit Close action.
4. Closing returns to the compact trigger without signing out or changing the
   account snapshot.
5. The default compact trigger must not overlap the lobby's primary content at
   the compact/touch production scales. The open popover remains contained in
   the stage and readable.
6. Preserve anonymous account forms, unavailable/error states, account refresh,
   hot-seat/online setup, and progression semantics.

## Acceptance

- Focused DOM tests start RED for collapsed authenticated state, activation,
  explicit close, and unchanged detailed progression content.
- A compact browser oracle starts RED against the screenshot regression and
  proves the default trigger stays above/non-overlapping with primary lobby
  content.
- Open detail geometry remains contained and non-overlapping internally.
- Full client, deterministic, Edge, build, coverage, browser, audit, secret,
  and diff-hygiene gates pass.

## Non-goals

- Progression formula, account refresh, Auth, Supabase, schema, migration,
  Edge Function, dependency, lobby redesign, or gameplay changes.
