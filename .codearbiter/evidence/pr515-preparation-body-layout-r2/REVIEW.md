# PR #515 preparation body-layout correction

Production evidence captured from `http://localhost:4173/` at device-pixel
ratio 1. `manifest.json` records the native PNG dimensions and SHA-256 digest
for all 84 captures. The four transition columns straddle the measured
Campaign support split and nested mission-board reflow.

| State | 3440 x 1440 | 1440 x 900 | 1220 x 900 | 1180 x 900 | 900 x 720 | 820 x 720 | 844 x 390 |
|---|---|---|---|---|---|---|---|
| Campaign - new run | [wide](wide--campaign-empty--3440x1440.png) | [standard](intermediate--campaign-empty--1440x900.png) | [split](campaign-split-wide--campaign-empty--1220x900.png) | [support stack](campaign-split-stacked--campaign-empty--1180x900.png) | [mission split](mission-board-wide--campaign-empty--900x720.png) | [mission stack](mission-board-stacked--campaign-empty--820x720.png) | [compact](compact--campaign-empty--844x390.png) |
| Campaign - resume | [wide](wide--campaign-resume--3440x1440.png) | [standard](intermediate--campaign-resume--1440x900.png) | [split](campaign-split-wide--campaign-resume--1220x900.png) | [support stack](campaign-split-stacked--campaign-resume--1180x900.png) | [mission split](mission-board-wide--campaign-resume--900x720.png) | [mission stack](mission-board-stacked--campaign-resume--820x720.png) | [compact](compact--campaign-resume--844x390.png) |
| Skirmish - Standard Duel | [wide](wide--skirmish-standard--3440x1440.png) | [standard](intermediate--skirmish-standard--1440x900.png) | [1220](campaign-split-wide--skirmish-standard--1220x900.png) | [1180](campaign-split-stacked--skirmish-standard--1180x900.png) | [900](mission-board-wide--skirmish-standard--900x720.png) | [820](mission-board-stacked--skirmish-standard--820x720.png) | [compact](compact--skirmish-standard--844x390.png) |
| Skirmish - Crosswind Range | [wide](wide--skirmish-crosswind--3440x1440.png) | [standard](intermediate--skirmish-crosswind--1440x900.png) | [1220](campaign-split-wide--skirmish-crosswind--1220x900.png) | [1180](campaign-split-stacked--skirmish-crosswind--1180x900.png) | [900](mission-board-wide--skirmish-crosswind--900x720.png) | [820](mission-board-stacked--skirmish-crosswind--820x720.png) | [compact](compact--skirmish-crosswind--844x390.png) |
| Local Battle | [wide](wide--local-battle--3440x1440.png) | [standard](intermediate--local-battle--1440x900.png) | [1220](campaign-split-wide--local-battle--1220x900.png) | [1180](campaign-split-stacked--local-battle--1180x900.png) | [900](mission-board-wide--local-battle--900x720.png) | [820](mission-board-stacked--local-battle--820x720.png) | [compact](compact--local-battle--844x390.png) |
| Online - create | [wide](wide--online-create--3440x1440.png) | [standard](intermediate--online-create--1440x900.png) | [1220](campaign-split-wide--online-create--1220x900.png) | [1180](campaign-split-stacked--online-create--1180x900.png) | [900](mission-board-wide--online-create--900x720.png) | [820](mission-board-stacked--online-create--820x720.png) | [compact](compact--online-create--844x390.png) |

The same seven widths are also retained for Local four-player, Verified
Deployment, Verified Qualification, and Online join/browse/waiting states.

## Live resize and interaction

[Open the resize recording](live-resize-interaction.webm).

The recording preserves the edited Online name and visibility plus focused
Visibility control while resizing without reload, then repeats edit/focus
preservation in Local before traversing Skirmish and Campaign. The test also
asserts that the same mounted frame survives and every action dock stays in
normal layout flow.

## Review boundary

This is the replacement visual-acceptance packet for the body-layout migration.
The implementation and draft PR remain open and unmerged. No deployment is
included.
