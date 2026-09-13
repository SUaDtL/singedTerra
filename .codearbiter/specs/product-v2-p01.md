# P01 manual product-evidence baseline

## Problem

The maintainer currently observes zero to two players at a time. There is no
honest, repeatable way to distinguish an observed guest entry, first shot,
completed match, or voluntary replay without introducing runtime analytics or
claiming retention from a tiny convenience sample.

## Approach

Keep the game completely outside the evidence path. A Node-builtins-only
validator and aggregator accepts a strict, manually entered session record and
produces raw-count reports; the accompanying templates explain how an observer
records a consented session. This costs a small offline script and deliberately
does not add telemetry, a client hook, a server endpoint, a package command, or
a dependency.

## Scope

In scope: an offline schema validator/aggregator, its Node test harness, and
manual observation/report templates. A record contains only an opaque generated
session sequence, calendar date, consent, initiating-player history, social
context, participant count, four observed outcomes, and session status.

Out of scope: app imports, gameplay behavior, data collection, remote storage,
accounts, network identifiers, analytics services, free-form notes, and claims
about retention, broad demand, or player satisfaction.

## Decided parameters

- Schema version is `p01-manual-v1`; session IDs are exactly `session-0001`
  style sequential opaque values, beginning at `session-0001` (`session-0000`
  is invalid).
- Records accept only documented keys. Names, emails, account IDs, room codes,
  URLs, tokens, and connection details have no accepted field or free-form
  escape hatch.
- `consent` must be `true`. The initiating player's history is exactly `new`,
  `returning`, or `unknown`; no group inference is made.
- Social context is `solo` or `friends`; participant count must agree with it.
- Each outcome is `yes`, `no`, or `not_observed`. `not_observed` is not treated
  as a negative outcome.
- One final record exists per session. A duplicate is rejected; an explicit
  correction replaces the matching `sessionId` rather than merging fields.
- A later stage may be `yes` only after the preceding observed stage is `yes`.
  Stage denominators distinguish eligible, known, and unknown observations.
- Owner-local raw retention for 30 days is a proposed policy only. No actual
  observation begins until the owner confirms consent and retention handling.

## Acceptance criteria

1. **P01-AC1:** A valid `p01-manual-v1` record validates; unknown keys, invalid
   ID/date/value/content, invalid causal progression, duplicates, and invalid
   corrections are rejected; an explicit same-ID correction replaces one row.
2. **P01-AC2:** The report gives raw total/known/unknown/eligible denominators
   for every stage, and separates initiating-player `new`/`returning`/`unknown`
   plus `solo`/`friends` segments without inferring a group history.
3. **P01-AC3:** The validator/aggregator is imported only from offline
   `scripts/` checks. No client, shared-engine, or Supabase source imports it,
   so manual-report failure cannot block a match.
4. **P01-AC4:** Templates prohibit tokens, names, emails, account IDs, room
   codes, URLs, and connection details; empty datasets report zeroes rather
   than NaN and contain no invented human record.

## Open questions

None blocks the local offline tooling. Actual data collection remains blocked
until the owner confirms the proposed consent and retention policy.

## Completeness challenge

The report can be mechanically correct while still representing too few or
non-representative sessions. It therefore retains raw counts, visible unknowns,
and a statement that these observations do not establish retention, broad
demand, or player satisfaction.
