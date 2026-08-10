# Anonymous progression handoff

## Status

Approved under the user's standing continuous-improvement authority on 2026-08-10.

## Problem

Quick Duel is the recommended first match, but an anonymous player reaches the After Action Report with no durable result and no explanation of how later local matches can count. The game should offer an honest route into the existing account flow without implying that the completed match can be credited retroactively.

## Player outcome

After an anonymous human completes a local match, the After Action Report shows a secondary prompt that says **“Sign in to record future matches.”** Its **“Sign in”** action leaves the completed match, returns to the existing pregame shell, opens the existing Player Account overlay in sign-in mode, and focuses the email field.

## Acceptance criteria

1. An anonymous completed hot-seat match whose Player 1 seat is human shows the handoff exactly once.
2. The handoff copy explicitly limits recording to future matches and never claims XP, credit, or retroactive attribution for the completed match.
3. Activating **Sign in** tears down the completed game, opens the existing Player Account overlay in sign-in mode, and places focus in its email field.
4. A server-confirmed signed-in progression result continues to show the existing earned-XP milestone and does not show the anonymous handoff.
5. Network games, deterministic E2E fixtures, an AI-owned Player 1 seat, stale async completions after replacement/quit, and duplicate terminal frames do not show the handoff.
6. The victory dialog focus loop includes the optional Sign in action only while it is visible and preserves Play again and Main Menu behavior.
7. Desktop, landscape-touch, and compact browser profiles keep the prompt and all actions visible, contained, keyboard-operable, and free of overlap.

## Design

- Extend the existing one-shot hot-seat progression reporter with an `onUnrecorded` result callback. It runs only when the existing report resolves to `null`; the main composition decides whether that null currently represents an anonymous account.
- Expose two narrow Lobby capabilities: query whether the current account state is anonymous, and show the existing account overlay directly in sign-in mode.
- Let HUD own only the optional After Action prompt, action, focus-loop membership, and presentation. Main owns game teardown and the HUD-to-Lobby transition.
- Keep the prompt hidden by default and clear it whenever the victory report is retired or a trusted progression receipt is shown.

## Recorded intent

- **ADR-0011:** conform. The handoff reuses password-based Supabase Auth; it adds no provider, credential, recovery, or backend behavior.
- **ADR-0012:** conform. Anonymous results are not persisted and receive no XP, rewards, ranks, entitlements, or anti-cheat claim.
- **ADR-0004:** conform. The prompt remains DOM-based HUD content over the canvas.
- No unresolved `CONFIRM-NN` item governs this client-only presentation slice.

## Exclusions

- No retroactive progression or completed-result carryover.
- No auth, Supabase, schema, migration, function, secret, or progression-formula change.
- No network progression, gameplay tuning, rewards, unlocks, rank, entitlement, or broader lobby redesign.
- No dependency or asset change.

## SMARTS decision

**Options:** (A) direct After Action handoff to the existing account overlay; (B) passive Main Menu reminder; (C) retroactively credit the completed match after sign-in.

**Verdict:** choose A, strong/high confidence. It is specific and observable, immediately follows the moment of demonstrated value, reuses the existing UI and auth boundary, and is reversible. B is easier but too easy to miss. C creates a new trust and attribution protocol, contradicts the honest future-only requirement, and is excluded by ADR-0012's ceiling.
