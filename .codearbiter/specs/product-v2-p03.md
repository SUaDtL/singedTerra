# P03 selected practice pilot

The owner authorized continuing the original improvement plan on 2026-09-13.
This implements P03's existing four acceptance criteria. The audit input is
reference data, not independent authority. Author: Sol/high; independent reviewer:
Astra/high. Base: e49b424c67b2f1a09bd5593156f15117915e93df.

## Player problem and bounded decision

Anonymous players can choose a Quick Operation, but its match lacks the explicit
Field Order objective currently tied to verified account progression. Give one
existing operation a visible practice objective using the existing owners.

Pilot: pair Last Light Siege with the existing Hold the Field objective (win the
duel). Keep the current operation selection, random seed at launch, and same-seed
Play Again. This is one curated content pairing, not an independent objective
picker. Reuse the current operation options and the Field Order reducer/copy.
Carry the chosen condition/objective IDs and a small content version through
launch, match, and terminal presentation. No backend reward eligibility changes.

## Acceptance criteria

1. Reuse FIELD_ORDER_CATALOG, observeFieldOrder and renderFieldOrder. Add only
   the explicit-ID constructor/descriptor needed by this practice pairing.
2. An anonymous Last Light Siege choice launches its existing conditions and
   displays the same objective in lobby, battle, and terminal. Human win is
   achieved; CPU win or draw is missed. Repeated terminal observation is stable.
3. Verified account-count rotation, recovery, completion payloads and historical
   receipts are unchanged. Ordinary local/network play and other Quick Operations
   retain their current objective behavior.
4. The selected IDs, existing rules/options, content version and launch seed are
   reproducible. Play Again resets objective state with the same match config and
   seed. No new objective framework, controller, dependency or storage is added.

## Implementation boundary

Expected existing seams: quickOperations.ts, fieldOrder.ts, LobbyShellView.ts,
Lobby.ts, and their tests. Preflight also demonstrated main.ts and HUD.ts must
connect the practice observation and presentation independently of verified
progression; this extends the path list only as necessary to implement the stated
end-to-end behavior. TerminalMatchView.ts should reuse existing projection copy.
Do not refactor unrelated match ownership or cleanup lifecycle code.

## Verification and rollback

Write a causal failing regression before implementation, then targeted pure,
lobby, lifecycle/HUD/terminal and same-seed restart checks. Run existing verified
compatibility tests, full client tests, engine/type checks and build. Browser
proof must use anonymous ordinary selection and real pointer interaction, with
wide, standard and compact layout/focus/overflow checks. Parent owns the sole
localhost; no second server. Emulation is not physical-device proof.

Independent Astra review follows frozen source and actual checks. Remove the
pilot registration and its practice adapter to roll back; preserve the existing
operations, reducers and verified route. Merge/publication remains a separate
approved delivery action.
