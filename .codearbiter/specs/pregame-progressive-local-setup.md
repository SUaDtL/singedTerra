# Progressive Local Preparation

Task: `ux.pregame.0003`
Status: approved by the standing improvement goal
Date: 2026-08-10

## Player problem

Hot Seat is immediately playable with sensible defaults, but its first view still
opens with the full Crew Manifest. That makes a player inspect names, colors,
controllers, and vehicle parts before the interface communicates that the defaults
are already valid. The route reads as mandatory configuration instead of an
immediate local battle with optional depth.

## SMARTS decision

| Candidate | Specific | Measurable | Attainable | Relevant | Strong | Result |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Progressively disclose local customization | 5 | 5 | 5 | 5 | 4 | Selected |
| Rescale the whole fixed stage | 3 | 4 | 3 | 3 | 3 | Defer; broader responsive risk |
| Repair project-path navigation in one browser spec | 5 | 5 | 5 | 2 | 3 | Record as test hardening, not this player slice |

The selected slice removes preparation ceremony without changing defaults,
gameplay, or the one-click Quick Duel route. It is reversible and bounded to the
Hot Seat view plus its scoped presentation and browser contracts.

## Player outcome

Hot Seat first presents the valid default deployment as ready to launch. A single
accessible **Customize crew and battlefield** disclosure owns the existing player
count, player rows, vehicle choices, and Advanced Settings trigger. The dominant
**Deploy local battle** action remains visible outside that disclosure.

Opening customization reveals the existing controls in their existing order and
with their existing behavior. If validation fails, customization opens so the
player can see and correct the problem; the launch action remains disabled and the
error remains associated with the setup.

## Acceptance criteria

1. The Hot Seat route renders a concise ready-state summary naming the current
   player count and that the current setup may be launched immediately.
2. Crew Manifest and Battlefield Protocol are inside one native disclosure named
   **Customize crew and battlefield**, closed by default for a valid setup.
3. The disclosure is open whenever the current setup is invalid, so hidden invalid
   controls and correction guidance cannot block the player invisibly.
4. Player-count changes, player rows, Advanced Settings, validation, and launch
   callbacks retain their current behavior and DOM ownership.
5. **Deploy local battle** remains outside the disclosure, visible and dominant at
   supported desktop, Pixel touch, and small-window sizes.
6. Quick Duel, Online, account, Store, room, engine, persistence, Auth, Supabase,
   dependencies, and migrations do not change.

## Test-first proof

- A focused unit test must fail first because the ready summary and disclosure do
  not exist and the setup controls are always exposed.
- A production-bundle browser assertion must fail first because the crew manifest
  is visible before the disclosure is opened.
- Mutation proof must show that forcing the disclosure open by default causes the
  causal browser assertion to fail.

## Governance

Do not read or edit `.codearbiter/sprint-log.md` under the standing H-05 exception.
Persist sprint evidence in a UTF-8 report. Give one adversarial reviewer the spec,
plan, sprint evidence, tests, and exact final diff; resolve every Critical, High,
and merge-blocking finding before PR delivery.
