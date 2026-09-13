# Product improvement integration evidence

Observed 2026-09-13. The integration combines the reviewed P04 tactical
challenges, P06 compact-console correction, and P11 after-action report.

The P06 merge retained exactly its seven accepted files. An ancestry conflict
in quickOperations.ts was resolved to retain P04's definitions; P06 had no
change to that file against its main base. P11 merged without conflicts and
preserved P04's practice observer, P02's entry, and the victory animation wait.
Independent Astra source/security review passed with no findings. Practice
Field Orders suppress P11's ordinary explanations and retain Play again.

The combined runtime passed 1,971 client tests in 209 files, strict types, and
the production build. The engine/release harness chain passed before the P11
merge; P11 adds no engine/backend code, and its application composition is
covered by the combined client and browser suites.

Final browser result: 354 PASS, 24 existing profile-specific/manual skips,
zero failures. The first run had one missed raw-coordinate First Salvo click;
the unchanged focused rerun passed. The test now awaits briefing removal and
uses a native canvas locator click, matching the existing touch path. All
exact action-count and no-fire assertions remain unchanged. Independent
review accepted this correction; 19 focused First Salvo cases and the final
complete suite passed. No product fix or retry allowance was added for it.

All 60 served files matched disk on the sole loopback preview. Inventory SHA:
`d2bad31a08a978da1099eaead8d9d8ee6f1119750e26062ffd1da029d93a4af3`.
The parent inspected actual combined Pixel terminal and replay captures:
explanations and buttons fit, while Baby Missile, Armory and Settings remain
readable on the restarted battle console. External network was denied.

Raw logs are retained as product-v2-p04-p06-p11-integrated-client.log,
product-v2-p04-p06-integration-check.log, and
product-v2-p04-p06-p11-integrated-browser-final.log in the host temporary
directory. Rejected-run evidence is retained separately. Individual feature
reports preserve the solver, causal failures, coverage, and visual boundaries.
The Linux hosted check remains required before merge; local Windows evidence
does not clear that platform boundary.

After the accepted P09 diagnostic was added, its pure analyzer and strict
harness types passed, and its real default-mode command remained skipped
without the manual measurement opt-in. Its tracked raw R17 artifacts and all
production code stayed unchanged; its separate report limits the no-change
decision to the measured desktop candidate.

The integration then adopted main2d366c7's reviewed Vitest/coverage5 pair and
explicit lifecycle call ledger. The full combined coverage run passed all
1,971 tests at 94.24% lines and 84.34% branches. Dependency groups and imported
tooling files match main; no production behavior changed during that refresh.

## Linux terminal-action correction

Hosted run34742177100 failed twice at Main Menu right667.328125 versus panel
right664.6875. Arial fallback reproduces the intrinsic flex minimum clamp locally:
action-row scroll655 versus client573. The new unchanged overflow assertion went
RED. A min-width-only probe was rejected because the primary text clipped.
The accepted correction adds scoped min-width0, primary flex-grow1.2 and wrapping
only on the primary label. Trebuchet, Arial, generic sans-serif and Verdana probes
retain complete text and44.4375px coarse targets.

The production build/typecheck passed. All60 served files match disk, inventory
5aa51585ce1fbd68f40765ca8738d00707ea9d4f71348186c0cc2e521e294a14.
Full browser run:355 passed,24 existing skips,2 failures. One was the parent omitting
the required expected-backend-origin environment variable. The other was a new
test incorrectly treating a font-dependent row height as the authored fine-pointer
minimum. The final test awaits arrival animation, uses the actual CSS minimum for
fine pointer, and retains an independent44px coarse minimum and10.5px font floor.
Corrected focused rerun covering both failures and the original authored report
across all three profiles:7 passed,2 existing profile skips. No production source
changed between those runs. Exact raw logs remain in Temp/product-v2-490-*.

This is combined full-suite and corrected focused evidence, not a claim that the
first full run was all green. Fresh hosted CI remains required before merge.
