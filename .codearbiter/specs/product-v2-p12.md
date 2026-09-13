# P12: Credential-free seed challenge links

Status: APPROVED

Approval basis: the owner-authorized P12 implementation route and the independently
reviewed `product-v2-p12-preflight.md` are the accepted design boundary.

## Problem

Players cannot share a deterministic local challenge without creating a live room
or sharing private session material. P12 adds a small public seed contract for the
existing Last Light and P04 practice operations.

## Contract

- The only accepted code is `ST1-(LL|CW|CR|LA)-<canonical uppercase base36 uint32>`.
- Last Light accepts every uint32 seed. Crosswind Range, Caldera Run, and Lean
  Arsenal accept seed 42 only.
- The fragment is the sole challenge carrier. A URL with any query string is not
  admitted as a challenge, so `?join=` remains the live-room route.
- Parsing is local, bounded, exact, and inert on malformed, oversized, ambiguous,
  drifted, or unsupported input. It never falls back to Standard Duel.
- The payload contains only the ST1 version, operation tag, and seed. It contains
  no roster, name, account, room, session, credential, token, action log, result,
  or arbitrary configuration.

## Experience

- A valid link renders a distinct Seed Challenge callout in the ordinary chooser.
  It names the operation, existing Field Order, and decimal seed, and starts only
  after `Start challenge vs CPU` is activated.
- Invalid challenge material shows one generic lobby message and leaves ordinary
  lobby actions usable.
- Both local and imported supported practice operations expose `Copy challenge
  link` in the existing after-action modal. Clipboard success is announced. A
  missing or rejected Clipboard reveals and selects the canonical full URL.
- Imported challenges retain their origin through same-config restart and never
  record casual progression or offer the anonymous progression conversion handoff.
  Locally selected practice operations retain current progression behavior.
- P11 ordinary insights, practice Field Orders, network rematch, verified play,
  Local Battle, Standard Duel, and First Salvo keep their current ownership.

## Compatibility boundary

ST1 has its own checked-in source manifest. A named Node check enumerates all
current `shared/src/engine/**` and `shared/src/types/**` production sources plus
the explicit local client composition, operation, objective, hot-seat, and CPU
driver inputs. It compares exact sorted membership and SHA-256 hashes. `precheck`
and `prebuild` run it. Drift requires reviewed ST1 parity with a manifest update or
a new challenge generation; an ST1 code is never silently executed as a new
profile.

## Verification

Focused tests cover the codec matrix, exact registry binding, composition,
receiver UI, copy fallback/focus cleanup, same-config restart, imported-origin
progression suppression, and manifest membership/hash refusal. The parent owns
full client/check/build and browser acceptance.

## Non-goals

No backend, persistence, account field, live room, replay/action log, dependency,
generic share framework, native Web Share, QR code, or short-code paste UI.
