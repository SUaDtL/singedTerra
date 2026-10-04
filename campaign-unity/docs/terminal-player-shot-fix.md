# Terminal player shot correction

The terminal encounter tick paused `TankPresentation` while later frames aged
only `EncounterView` effects. If defeat interrupted a cannon shot, the player's
muzzle flash and barrel recoil could remain frozen. This correction advances
only those shot transients through the session's existing admitted-time path.
Combat, fitting, turret aim, camera and idle motion remain locked.

## Focused proof on Windows, October 4, 2026

The existing `EncounterPoseChecks` editor file now contains
`CheckTerminalFeedback`. It opens the saved review scene without saving it and
uses the imported tank with the actual `TankPresentation`, `EncounterSession`
and `EncounterView`. A presentation shot is deliberately started immediately
before each fitting's real final model tick; the check does not claim that every
natural defeat coincides with a shot.

Before production edits, the check compiled and failed with:

```text
Terminal shot check failed: terminal player shot must finish flash and return barrel home; fitting=False flash=True barrelOffset=0.0001559909
```

After the correction, the same assertions passed for both fittings. They check
active user pause, focus loss and explicit resume; terminal focus/application
suspension; a frozen model snapshot, fitting, aim and camera during draining;
return to inspection; and restored shot timing on redeployment.

The existing terminal-effect harness also passed its retained model outcomes,
View-effect draining, focus/application guards and technical-failure behavior.
Its presentation stub received only the new method and required fixture owner;
it does **not** prove the real player-shot behavior. The Unity check above does.

## Commands and results

From `C:\Users\brenn\st-art-pr`, with no Unity editor running:

```powershell
$editor = 'C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1\Editor\Unity.exe'
$project = 'C:\Users\brenn\st-art-pr\campaign-unity\Unity'
$evidence = 'C:\Users\brenn\st-art-pr\campaign-unity\Evidence\terminal-player-shot-20261004T1450'

# RED invocation, before production changes; the retained editor log records the failure.
& $editor -batchmode -quit -projectPath $project -executeMethod EncounterPoseChecks.CheckTerminalFeedback -logFile "$evidence\red.log"

# GREEN invocation, after production changes; wait for the editor and retain its exit code.
$run = Start-Process -FilePath $editor -ArgumentList @('-batchmode', '-quit', '-projectPath', $project, '-executeMethod', 'EncounterPoseChecks.CheckTerminalFeedback', '-logFile', "$evidence\green.log") -WindowStyle Hidden -Wait -PassThru
$run.ExitCode

powershell -NoProfile -File campaign-unity/Tools/terminal_effect_drain/run.ps1 -EditorRoot 'C:\Users\brenn\singedTerra-engine-lab\tools\unity-6000.3.24f1'
```

- RED: assertion failure above; overall exit code and duration were not retained
  by the asynchronous GUI launcher. Compilation succeeded in 3.31 seconds.
- GREEN: exit 0 in 7.56 seconds for the host command, including editor launch;
  `ST_ENC_TERMINAL_SHOT_PASS` records both fittings. Compilation succeeded in
  0.73 seconds.
- Existing terminal-effect harness: exit 0 in 3.02 seconds for the host command;
  `Terminal effect drain checks passed`.
- `git diff --check`: passed.

Raw logs and the pre-run scene hashes are retained under the ignored evidence
directory above as `red.log`, `green.log`, `session-green.log` and
`scenes-before.json`. No editor process remained after verification.

## Preservation and limits

Both saved scenes retained their exact SHA-256 bytes through RED and GREEN:

| Scene | SHA-256 |
|---|---|
| `BattlefieldReview.unity` | `024013749d3d53cb32844715ec6f5013bea8144417424561681cbb2263d22c2f` |
| `FieldAssembly.unity` | `5652aaba327cc7f26056a7ee033a98016a061e2de00e6176ea643441ca2adf65` |

No authored art, scene, tuning, legacy model, shop model or artifact-governance
record was edited. Numeric C# line and branch coverage is unmeasured. This is
an actual Unity editor behavior check, not a new terminal browser capture,
Web export, browser compatibility pass, performance measurement or owner visual
acceptance. The owner's A/B choice and normal-speed motion acceptance remain
pending. Live-player sessions remain deferred while the owner is remote.
