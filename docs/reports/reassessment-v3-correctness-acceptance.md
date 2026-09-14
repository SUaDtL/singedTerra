# V3 bounded correctness acceptance proposal

Status: reviewed PR #506 merged as `1f520b5cd917f9d0df04b7d5d18f3e811a4c97ff` on 2026-09-14 after exact candidate CI passed. Publication is tracked through [main CI](https://github.com/SUaDtL/singedTerra/actions/runs/34873412508) and [Pages](https://github.com/SUaDtL/singedTerra/actions/runs/34873412480); implementation verification alone does not establish publication. Physical mouse/touch direction checks (T07) and phone impact/payoff recording (T09) remain explicit follow-ups pending the owner's disposition. This document does not declare the whole v3 campaign complete.

The correction release preserves the deterministic engine, retained verifier editions, applied migrations and current release pipeline. PR #505 is published as e292221b05f2ac2cc5c30543e47b0b4dd1f630e4; PR #506 adds reviewed retained-page recovery and label-independent console actions on candidate 3d764a70ed508f9a2dccada3b83b84784b808ec8.

| Task | Independent evidence and disposition |
| --- | --- |
| T00 | Immutable package checksums, schema, references, DAG and baseline/source comparison passed. |
| T01-T04 | Original-source regressions, independent review and real browser journeys passed. PR #505 candidate and main CI passed; public provenance and live smoke passed. |
| T05-T06 | Input capabilities and stock-versus-restock behavior reviewed, regression tested and browser exercised; merged and published through #501/#502. |
| T07 | Geometry correction is published and browser direction/no-fire checks passed. Actual physical mouse/touch check remains unobserved. |
| T08 | Chromium real persisted restoration and network credential/history revalidation passed. Current Windows WebKit completed two real history returns with persisted=false and functional fresh reconstruction; no WebKit persisted-path claim. Final focus/lifecycle review passed. PR #506 candidate CI passed. Implementation verified; publication belongs to T12. |
| T09 | Published presentation correction starts verification independently, preserves impact before its report, and restores completed outcomes silently. Desktop normal/reduced-motion recordings and 21 qualification cases passed. Physical-phone frame-sequence recording, including reduced motion and deliberately slow verification, remains unobserved. |
| T10 | Collapse-flush path guards and independent burning prerequisites passed normal and negative controls; path B unchanged. Published through #505. |
| T11 | Exact PR #505 candidate passed 454 general browser cases and 83 product cases, with explicit profile skips. |

T12 can close only after current task-state schema/DAG validation, exact PR #506 candidate CI, merged-main CI, Pages transported-source/payload provenance, live smoke, and an explicit disposition of the outstanding physical checks. No new P1 finding from the v3 report may remain silently ignored. Automated checks cannot be presented as those observations. T13 is verified and merged in this candidate as a separately scoped maintenance improvement. Its task criteria do not require publication; release provenance remains part of T12. T14-T18 remain the measured performance, actual-player, tactical, audio and distribution work; they are not implicitly accepted by this release proposal.

Exact PR #506 CI run `34870930574` passed 462 general browser cases (45 profile skips), 83 product cases (27 profile skips), 2,207 client tests and all required jobs.

Candidate local validation: 2,207 client tests, 94.10% line/83.61% branch coverage including runtime TSX, 29 targeted browser cases plus 83 product cases, typecheck, build, engine and ST1 checks. Independent authentication, source, coverage and final focus/lifecycle review passed. The final correction aggregate is 47006de6c810bd8d6c65a588862f22bf4859a25cfa4c71ebdfa2f529e5572b06.

Production backend operations remain separately scoped. This correction introduces no backend deployment, reward-policy change, native platform, new audio service, telemetry collection or broad rendering rewrite. Rollback uses the existing compatible artifact procedure; no applied SQL rollback is implied.

The expanded browser suites exposed a delivery wait-budget mismatch: Pages stopped
polling after about 20 minutes while exact main CI needed about 23. The first
attempt published nothing; an unchanged-source rerun cleared the gate after CI
passed. The bounded correction allows 180 polls, nominally 30 minutes, inside a
35-minute gate job. It preserves exact-source/run/attempt requirements, terminal
failure handling, current-main freshness, artifact integrity and deployment
locking. Existing release-candidate, workflow and Pages structural checks passed.
This operational repair does not change the reassessment acceptance criteria.
