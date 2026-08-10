# Pre-game Commander Dossier

## Goal

Make persistent player identity read as a first-class part of the pre-game command shell. An authenticated player must see the complete commander name, current level, and exact next XP milestone without opening the account dialog or encountering ellipsis at supported desktop and compact layouts.

## Player problem

Production at a 1024 by 576 compact viewport renders the masthead account record as `Commander SUaDtL - L...`. The identity and progression work is technically present but visually reduced to a cramped utility button on the first decision screen. This weakens both product coherence and the reason for a returning player to care about the account.

## Chosen design

The collapsed authenticated surface becomes a structured commander dossier:

- `COMMANDER DOSSIER` remains the identifying kicker.
- The disclosure contains separate commander-name and level elements instead of one unbreakable text node.
- A visible milestone states the exact XP remaining to the next level beside the existing semantic progress meter.
- Long valid display names wrap inside the dossier. They are never hidden by ellipsis.
- The whole dossier remains the single account-dialog trigger with one accessible name and `aria-expanded` state.

The existing opaque account dialog, sign-out action, account loading/error states, Auth session, progression arithmetic, and server-derived summary remain unchanged.

## Alternatives considered

1. Increase only the existing card width. Rejected because it consumes masthead space and still fails at narrower stage scales.
2. Keep the current single-line label and reduce its font. Rejected because it trades truncation for illegibility.
3. Structure the dossier so identity, level, and milestone can wrap independently. Chosen because it preserves information and adapts without changing shell ownership.

## SMARTS decision

The structured dossier is strong. Securable is unchanged because no credential or auth data moves. Maintainable improves through semantic sub-elements rather than more breakpoint-specific text clipping. Available and Scalable are neutral. Reliable and Testable improve because unit tests can prove exact identity/milestone semantics while browser tests prove rendered text containment at compact scale. Intent conforms to ADR-0011: password-based account identity remains separate from room authorization, and this slice changes presentation only.

## Acceptance criteria

1. An authenticated summary renders the complete commander display name, `Level N`, and exact `X XP to Level N+1` milestone in the collapsed masthead dossier.
2. The existing progress element retains exact value, max, and accessible commander/level context.
3. The dossier remains one disclosure that opens the existing Player Account dialog and accurately exposes `aria-expanded`.
4. A maximum-length 24-character display name has no clipped or ellipsized rendered text in desktop-fine, Pixel touch, and small-window projects.
5. The dossier remains contained inside the masthead and does not overlap the deployment chooser, mission brief, or Vehicle Bay.
6. Anonymous, unavailable-summary, loading, account-dialog, Auth, progression, and match-launch behavior do not change.

## Boundaries

Client account presentation, Lobby CSS, focused DOM tests, and real-browser geometry only. No authentication, authorization, credentials, Supabase functions, persistence, progression rules, migrations, dependencies, gameplay, or action protocol changes.

## Verification obligations

- RED unit proof for missing structured identity, level, and milestone elements.
- RED browser proof that the current compact single-line trigger clips a maximum-length commander name.
- Focused unit and browser GREEN runs.
- Mutation checks for removing the milestone, restoring `white-space: nowrap`, restoring ellipsis, and omitting the level element.
- Full client, engine/check, Edge, coverage, build, and Playwright matrix before commit.
- One adversarial reviewer receives this spec, the plan, sprint evidence, tests, and final diff.

## Governance note

The standing continuous-improvement goal explicitly approves this bounded spec and its plan. The malformed legacy `.codearbiter/sprint-log.md` is not read or rewritten; SMARTS, RED/GREEN, mutation, review, and matrix evidence is persisted in this spec and the slice report.
