# V3 bounded correctness acceptance proposal

Status: the correction runtime is published in main `086af0ceeda2cc80632defd9ca1a3282d6bfcc6e`. [Main CI](https://github.com/SUaDtL/singedTerra/actions/runs/34882651346) and all eight [Pages jobs](https://github.com/SUaDtL/singedTerra/actions/runs/34882651320), including the three transported-candidate browser lanes, publication and live smoke, passed on 2026-09-14. Independent public metadata and entry-file checks matched the tested artifact. T12 remains open for the owner's disposition of physical mouse/touch direction checks (T07) and phone impact/payoff recording (T09). This document does not declare the whole v3 campaign complete.

The correction release preserves the deterministic engine, retained verifier editions, applied migrations and current release pipeline. PR #505 is published as e292221b05f2ac2cc5c30543e47b0b4dd1f630e4; PR #506 adds reviewed retained-page recovery and label-independent console actions on candidate 3d764a70ed508f9a2dccada3b83b84784b808ec8.

| Task | Independent evidence and disposition |
| --- | --- |
| T00 | Immutable package checksums, schema, references, DAG and baseline/source comparison passed. |
| T01-T04 | Original-source regressions, independent review and real browser journeys passed. PR #505 candidate and main CI passed; public provenance and live smoke passed. |
| T05-T06 | Input capabilities and stock-versus-restock behavior reviewed, regression tested and browser exercised; merged and published through #501/#502. |
| T07 | Geometry correction is published and browser direction/no-fire checks passed. Actual physical mouse/touch check remains unobserved. |
| T08 | Chromium real persisted restoration and network credential/history revalidation passed. Current Windows WebKit completed two real history returns with persisted=false and functional fresh reconstruction; no WebKit persisted-path claim. Final focus/lifecycle review passed. PR #506 candidate CI passed. Implementation verified; publication is proven by the current release evidence below. |
| T09 | Published presentation correction starts verification independently, preserves impact before its report, and restores completed outcomes silently. Desktop normal/reduced-motion recordings and 21 qualification cases passed. Physical-phone frame-sequence recording, including reduced motion and deliberately slow verification, remains unobserved. |
| T10 | Collapse-flush path guards and independent burning prerequisites passed normal and negative controls; path B unchanged. Published through #505. |
| T11 | Exact PR #505 candidate passed 454 general browser cases and 83 product cases, with explicit profile skips. |

The exact PR #506 candidate CI and subsequent merged-main publication requirements now have evidence. Fresh validation of the unchanged current task state passed its schema, task references and 19-node dependency graph. T12 still requires explicit owner disposition of the outstanding physical checks before closure. No new P1 finding from the v3 report may remain silently ignored. Automated checks cannot be presented as those observations. T13 is verified and merged in this candidate as a separately scoped maintenance improvement. Its task criteria do not require publication; release provenance remains part of T12. T14-T18 remain the measured performance, actual-player, tactical, audio and distribution work; they are not implicitly accepted by this release proposal.

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

## Published artifact evidence

Pages run `34882651320`, attempt 1, published artifact `10364046132`, bound to source `086af0ceeda2cc80632defd9ca1a3282d6bfcc6e` and required CI `34882651346`. The independently recomputed payload SHA-256 is `865eeff677cd42888c8b2303b4a7c9ce47790d1a0d524291d8a98a69ed8b15bf`. All 58 extracted regular files were checked; the canonical payload covers 57 files and excludes its own release metadata. All 56 non-provenance files are byte-identical to the earlier PR #506 main candidate. Public HTTP verification separately matched both metadata files plus the HTML, entry JavaScript and entry CSS; it does not claim an independent download of every public asset.

The original main `1f520b5` Pages attempt 2 passed candidate testing but correctly refused publication after main advanced. The later `086af0c` run supplies the successful publication evidence. Local receipts are retained under `C:/Users/brenn/AppData/Local/Temp/singedterra-v3-release-086af0c/`: `candidate-receipt.json`, `runtime-comparison.json`, `public-receipt.json` and `local-preview-receipt.json`.

PRs #508/#509 changed CI selection and parallelization. Full PR CI measured 10m58s and 10m50s respectively, compared with PR #506's 22m53s. Documentation-only PRs now omit heavy work and CodeQL analysis while preserving required result validators and weekly security scans. No executing browser assertion or performance limit was removed. These delivery changes do not supply the physical-device, player or listening evidence required by T07, T09 and T14-T18.
