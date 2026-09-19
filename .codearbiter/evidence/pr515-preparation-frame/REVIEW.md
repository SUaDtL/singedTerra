# PR #515 unified preparation-frame review

Production evidence captured from `http://localhost:4173/` at device-pixel ratio 1.
Every row uses the same three native viewport sizes; `manifest.json` records the
PNG dimensions and SHA-256 digest for all 36 screenshots.

| Preparation state | 3440 x 1440 | 1440 x 900 | 844 x 390 |
|---|---|---|---|
| Campaign - empty save | [wide](wide--campaign-empty--3440x1440.png) | [intermediate](intermediate--campaign-empty--1440x900.png) | [compact](compact--campaign-empty--844x390.png) |
| Campaign - resume | [wide](wide--campaign-resume--3440x1440.png) | [intermediate](intermediate--campaign-resume--1440x900.png) | [compact](compact--campaign-resume--844x390.png) |
| Skirmish - Standard Duel | [wide](wide--skirmish-standard--3440x1440.png) | [intermediate](intermediate--skirmish-standard--1440x900.png) | [compact](compact--skirmish-standard--844x390.png) |
| Skirmish - Crosswind Range | [wide](wide--skirmish-crosswind--3440x1440.png) | [intermediate](intermediate--skirmish-crosswind--1440x900.png) | [compact](compact--skirmish-crosswind--844x390.png) |
| Local - two players | [wide](wide--local-battle--3440x1440.png) | [intermediate](intermediate--local-battle--1440x900.png) | [compact](compact--local-battle--844x390.png) |
| Local - four players | [wide](wide--local-four-player--3440x1440.png) | [intermediate](intermediate--local-four-player--1440x900.png) | [compact](compact--local-four-player--844x390.png) |
| Verified - deployment | [wide](wide--verified-operations--3440x1440.png) | [intermediate](intermediate--verified-operations--1440x900.png) | [compact](compact--verified-operations--844x390.png) |
| Verified - qualification | [wide](wide--verified-qualification--3440x1440.png) | [intermediate](intermediate--verified-qualification--1440x900.png) | [compact](compact--verified-qualification--844x390.png) |
| Online - create | [wide](wide--online-create--3440x1440.png) | [intermediate](intermediate--online-create--1440x900.png) | [compact](compact--online-create--844x390.png) |
| Online - join | [wide](wide--online-join--3440x1440.png) | [intermediate](intermediate--online-join--1440x900.png) | [compact](compact--online-join--844x390.png) |
| Online - browse | [wide](wide--online-browse--3440x1440.png) | [intermediate](intermediate--online-browse--1440x900.png) | [compact](compact--online-browse--844x390.png) |
| Online - waiting | [wide](wide--online-waiting--3440x1440.png) | [intermediate](intermediate--online-waiting--1440x900.png) | [compact](compact--online-waiting--844x390.png) |

## Live resize and interaction

[Open the 7.28-second resize recording](live-resize-interaction.webm).

The recording changes Online name and visibility, retains the focused
Visibility control while resizing wide -> intermediate -> compact -> wide,
then repeats edit/focus preservation in Local before traversing Skirmish and
Campaign. The test also asserts that the same mounted frame survives each
resize and that every action dock remains in flow.

## Review boundary

This is the `G02` visual-acceptance packet. The implementation and draft PR
remain open and unmerged. No deployment is included.
