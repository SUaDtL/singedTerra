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
