# ST-ART-01 validation checkpoint - 2026-09-25 UTC

## New execution

The existing recoil-fixed stweb01 Web output passed a completed browser-only
verification (`browser-verify-20260925T040235Z-70b9c6`): 15 checks, five recoil
cycles, actual pointer controls, both fitting variants and camera views, resizing,
idle pause/resume, no observed browser errors or failed requests. Captures inspected.

A review snapshot then preserved 85 saved original-authoring files, the portable
Blender model, and the known corrected TankPresentation.cs. Eight saved files differ
between original and older build-copy trees; the original versions were retained,
except for the specifically reviewed recoil correction. The saved scene and material
changes were not silently replaced with generated versions.

Fresh build: `Web-20260925T040559Z-9f1c4a`, Unity 6000.3.24f1 / URP 17.3.0.
The same-version URP payload was restored from the installed editor into the new
project; no Library cache was copied. The saved-scene export and Web-entry stages
passed. FieldAssembly's SHA-256 remained unchanged before and after export:
`5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65`.

Fresh browser run: `browser-verify-20260925T040809Z-71fe67`, headed Chrome.
All 15 checks passed, including five measured recoil cycles. Observed peak range:
0.31997087597846985 to 0.31999996304512024 world units. Every recorded return error
was zero. The 1600x900 and 1280x720 captures were inspected; these are actual Web
frames, not Blender concept renders. Exact browser version, checks, source hashes
and build-file hashes are in [docs/validation.json](docs/validation.json).

## Retained failure and evidence limits

The original owner-run `recoil-local-20260925T034134Z-5fcbd4` workflow remains FAILED
at `Missing browser event: motion`. Its seven recoil observations and successful
build do not become a retroactive full-suite pass. The new verifier explicitly
foregrounds/focuses its test page, derives coordinates from the actual canvas box,
and holds mouse-down for 150 ms. That new run succeeds; the precise cause of the
original timeout was not separately isolated. No game-input code was changed to
make this suite pass, and no test runtime invokes game methods through JavaScript.

This is a bounded presentation check, not performance, battery/thermal, mobile,
full browser compatibility, accessibility or complete lifecycle certification.
No combat oracle was run because no combat is added. Positive owner appearance
feedback does not certify every asset, layout or eventual equipment design.
Visible refinement remains: rear-facing inspection, coarse terrain edges/props,
and regular track impressions. Four representative browser captures are in docs/.

## Preservation and review boundary

The original stterra editor still showed an unsaved FieldAssembly scene. It was
not closed, saved, regenerated or overwritten; unsaved work is not in this snapshot.
Old spikes, stterra and stweb01 originals, failed receipts and prior exports remain.
No copy-back into that editor or another user's worktree was performed.

Base governance was read at `7edc11ec094fe088dfa4a407aa4dbbf40875dd48`.
Only campaign-unity and its new scoped spec are added. Classic source, npm manifests,
accepted ADRs, prior execution ledgers and CI/deployment workflows are unchanged.
Existing repository CI must be read on the published PR head; it is not Unity
compilation evidence. No merge, public deployment, service change or Android work.

## Source hygiene

Python syntax checks and a bounded changed-file secret-pattern/payload scan passed.
The staged authored C#, Python, Markdown, HTML, JSON and Git-control files pass
`git diff --cached --check` for those types. The unrestricted whitespace check
reports Unity-serialized empty YAML fields with trailing spaces. They remain
unchanged to preserve the saved assets; no whitespace rule or CI gate was disabled.
Git applies the declared LF normalization to designated text files. Validation
source hashes identify the tested working-file bytes; the Git tree additionally
records the normalized source. This is not a claim that CRLF and LF hashes match.
