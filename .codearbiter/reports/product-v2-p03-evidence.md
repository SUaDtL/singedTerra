# P03 selected practice pilot evidence

Date: 2026-09-13

Author: Sol/high

Base: `e49b424c67b2f1a09bd5593156f15117915e93df`

Branch: `codex/product-v2-p03`

## Scope and result

Last Light Siege now carries one immutable version-1 practice descriptor for
the existing Hold the Field Field Order. Anonymous Quick Duel selection keeps
the operation's existing best-of-three, sudden-death, battlefield and random
launch-seed configuration. The selected operation ID, objective ID and content
version travel through LobbyConfig into the live match and terminal projection.

The pilot reuses `FIELD_ORDER_CATALOG`, `createFieldOrderById`,
`observeFieldOrder` and `renderFieldOrder`. Ordinary match state is adapted to
the existing winner observation. It does not add a controller, persistence,
reward eligibility, protocol, backend, dependency, or storage path. Verified
deployment continues to own its separate replay-derived observation, recovery,
completion and receipt flow.

## TDD evidence

The approved four acceptance criteria were the complete Phase-1 obligation
set; no additional contract or security obligations were introduced.

The first targeted RED command was:

```text
npm -w @singedterra/client exec vitest run src/client/fieldOrder.test.ts src/client/quickOperations.test.ts src/ui/LobbyShellView.test.ts src/ui/Lobby.quickDuel.test.ts src/ui/HUD.fieldOrder.test.ts src/main.hotSeatProgression.test.ts
```

It exited 1 with 11 intended failures and 117 passing tests. The failures were
causal: the explicit-ID constructor, versioned Last Light descriptor, lobby
objective, independent HUD practice adapter/identity, human/CPU/draw lifecycle,
and fresh restart behavior did not yet exist. No pre-existing test failed.

A second causal RED for live battle identity ran
`npm -w @singedterra/client exec vitest run src/ui/HUD.fieldOrder.test.ts`.
It exited 1 with the new metadata assertion failing and the other nine tests
passing. The product then added the operation/objective/version projection; no
assertion was weakened between RED and GREEN.

## Acceptance coverage

1. `fieldOrder.test.ts` proves fresh explicit catalog construction and unknown-ID
   rejection. `quickOperations.test.ts` proves the one frozen, versioned pilot
   pairing and unchanged behavior for the other three operations.
2. `LobbyShellView.test.ts` and `Lobby.quickDuel.test.ts` prove anonymous card
   selection, shared briefing copy and the actual Last Light options. HUD and
   main lifecycle tests prove live and terminal presentation, human achievement,
   CPU/draw misses, and stable repeated terminal observation.
3. The main lifecycle compatibility suite and focused HUD/terminal/mode tests
   preserve verified state, ordinary routes and existing presentation. The full
   client and deterministic suites passed without modifying verified recovery,
   completion payload, receipt, network action, or backend files.
4. Launch tests bind operation ID `last-light-siege`, objective ID
   `hold-the-field`, content version `1`, exact settings and seed. The restart
   lifecycle test proves the same config and seed create a fresh unresolved
   objective after a completed result.

## Local verification

- Targeted GREEN: exit 0, 6 files and 128 tests passed.
- Focused compatibility: exit 0, 9 files and 169 tests passed.
- `npm run typecheck`: exit 0.
- `npm run test:client`: exit 0, 208 files and 1,938 tests passed.
- `npm run check`: exit 0, including backend release preflight, type checks and
  the complete deterministic harness chain.
- `npm run coverage:client`: exit 0 on Windows 11 / Node 24.18.0; 94.08% lines
  and 84.23% branches, above the Stage-1 60% thresholds.
- `npm run build`: exit 0; Vite transformed 2,733 modules and produced the
  production bundle. The existing chunk-size advisory remained non-blocking.
- Post-fixture correction targeted rerun: exit 0, 3 files and 84 tests passed.
- Parent-owned final prefixed build: exit 0 with `VITE_BASE=/singedTerra/`;
  all 60 files served by the sole preview matched `client/dist` byte-for-byte.
  The served inventory SHA-256 was
  `bb9a84258781d58fe0b6ffe0d91c5b11994232fef6024edc5247fab10a96572f`.
- `git diff --check`: exit 0. Git emitted only the repository's LF-to-CRLF
  working-copy notices.

## Browser proof

The parent-bound candidate was served from this worktree at
`http://127.0.0.1:5198/singedTerra/` by the already-running sole preview (PID
60956, session 12022). No additional localhost was started. The exact command
was:

```text
E2E_LIVE_URL=http://127.0.0.1:5198/singedTerra/ E2E_DENY_EXTERNAL_NETWORK=1 npx playwright test e2e/quick-duel-pacing.spec.ts
```

It exited 0 with 18/18 tests passing. The configured browser matrix was
1600x900 desktop fine pointer, 802x293 Pixel 5 landscape CSS viewport with
touch/coarse pointer, and 900x520 small-window fine pointer. Real pointer
selection checked focus, lobby objective copy and containment, then launched
the real Last Light configuration and checked the same shared copy and metadata
in the live ledger. The restart check now asserts both `Round 1 of 3` and the
`CPU 1` roster seat, preventing the fixture configuration regression found by
the first screenshot pass.

The terminal browser case is explicitly a presentation-and-restart fixture. It
proves the selected operation and achieved objective render in After Action and
that Play Again starts a fresh Last Light objective with its three-round CPU
roster. It is not evidence that browser shots naturally completed that match.
Human win, CPU win and draw outcome mapping, repeated-terminal idempotence, and
fresh same-seed restart are exercised against actual `GameState` lifecycle
inputs in `main.hotSeatProgression.test.ts`.

Twelve screenshots were captured and directly inspected: lobby, live ledger,
terminal fixture and restart for each of the three configured profiles. The
pilot objective and operation copy remained readable and contained at all
three actual dimensions. They are under these ignored artifact directories:

```text
test-results/quick-duel-pacing-Quick-Op-48de8-etained-in-the-match-ledger-{desktop-fine,pixel-touch,small-window}/
test-results/quick-duel-pacing-terminal-2ec1a--its-real-Last-Light-config-{desktop-fine,pixel-touch,small-window}/
```

One bounded natural-browser completion was attempted without adding a
production test seam. An angle-adjusted ordinary-shot driver reached the real
`Round 1: CPU 1 won. Round 2 of 3.` shop, then exposed a driver race with the
disabled controls. A different state-machine driver used default ordinary Fire
actions and stopped at its 30-human-shot bound with the terminal still hidden
(Player 1 had 5 HP). The exploratory failing test was removed; the final 18-test
browser suite above is green. This leaves natural full-match browser completion
outside the claimed evidence boundary rather than fabricating it from the
terminal fixture. The experimental drivers and failure receipts are preserved
at `test-results/p03-natural-browser-experiment/angle-driver-failure.md` and
`test-results/p03-natural-browser-experiment/default-fire-driver-failure.md`.

## Independent review and delivery boundary

The separate Astra/high reviewer passed all four acceptance criteria with no
findings. The reviewer independently reran the six focused files (128/128),
checked the frozen tracked diff, read the final browser receipt, and inspected
desktop terminal and touch restart screenshots. Parent inspection also covered
desktop live, touch restart, and small-window terminal images. The practice
objective is visible and contained; this is not blanket acceptance of the
pre-existing compact HUD layout.

Reviewed tracked diff SHA-256:
`c268683f28e7903e6afad18b4e68b016930993903eb0bfa36eae14da7b2f31b0`.
The original author receipt before this parent review appendix had SHA-256
`d48ee737dc1bbbbe6f2dbf86f66a05baa0cbb9464a6bf7cb07dfdc33a21b355d`.
No production source changed after that review. Read-only examination found no
health floor of five HP on this ordinary Quick Duel route; the incomplete
natural browser experiment does not establish such a defect.

The secrets scanner flagged an unchanged synthetic seat-token literal in a
mocked network test inherited from the base. Independent auth/security review
confirmed no credential or changed secret source/sink. The installed diff
scanner found zero sensitive added-line digests and no crypto change; no
security marker was required or created. Account-change invalidation and
verified-session ownership remain intact.

The parent owns commit and PR delivery under the user's campaign-continuation
instruction. Merge, publication, backend deployment and settings changes remain
separate actions.

The final parent commit-gate rerun passed after all source and fixture changes:
`npm run test:client -- --maxWorkers=4` exited 0 with 208 files / 1,938 tests
(16.62 seconds); `npm run check` exited 0 through the final Sandhog and Edge-CI
harnesses. Logs are retained in the host temporary directory as
`product-v2-p03-final-client.log` and `product-v2-p03-final-check.log`.
The staged whitespace check passed. No runtime source changed during delivery.
