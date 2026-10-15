param([string]$EditorRoot)

$ErrorActionPreference = 'Stop'
if (-not $EditorRoot) { throw 'Pass -EditorRoot for the pinned Unity 6000.3.24f1 installation' }
if (-not $EditorRoot.TrimEnd('\', '/').EndsWith('6000.3.24f1')) {
    throw 'The pure runner requires the pinned Unity 6000.3.24f1 installation'
}

$mono = Join-Path $EditorRoot 'Editor/Data/MonoBleedingEdge/bin/mono.exe'
$csc = Join-Path $EditorRoot 'Editor/Data/MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe'
$scripts = Join-Path $PSScriptRoot '../../Unity/Assets/Scripts'
$sources = @(
    (Join-Path $PSScriptRoot 'Program.cs'),
    (Join-Path $scripts 'EncounterModel.cs'),
    (Join-Path $scripts 'EncounterProfile.cs'),
    (Join-Path $scripts 'EncounterSession.cs')
)
$output = Join-Path $env:TEMP ('st-terminal-effect-drain-' + [guid]::NewGuid().ToString('N') + '.exe')
try {
    & $mono $csc -nologo "-out:$output" @sources
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $mono $output
    exit $LASTEXITCODE
}
finally {
    if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output }
}
