"""Keep player diagnostics strict; retain one reviewed upstream import warning set."""

import re


SHADER_DIAGNOSTIC = re.compile(r"(?m)^Shader (?:error|warning) in '[^\r\n]+")
ASSET = 'Packages/com.unity.render-pipelines.core/Editor/Lighting/ProbeVolume/VirtualOffset/TraceVirtualOffset.urtshader'
REVIEW = 'ST_LS_EDITOR_SHADER_REVIEW package=17.3.0 sha256=6dd0b39320f30fca7b8d6fcc067820f469beab2480f977861f22e46225e78a3d'
# These seven reviewed source files are bound by the Editor producer. Both cache
# fingerprints contain byte-identical reviewed inputs; retain the original path.
WARNING = re.compile(r"Shader warning in 'TraceVirtualOffset': conversion from larger type '(uint|float|float3)' to smaller type '(min16float|min16float3)', possible loss of data \[-Wconversion\] at [^\r\n]*Library/PackageCache/com\.unity\.render-pipelines\.core@(?:0bb36005e9ba|6c7e6aba313a)/ShaderLibrary/Sampling/(Fibonacci|Hammersley|Sampling)\.hlsl\((\d+)\) \(on d3d11\)")
SIGNATURES = {('uint', 'min16float', 'Fibonacci', n) for n in ('16', '27', '270', '277')} | {
    ('float', 'min16float', 'Hammersley', '25'),
    ('float3', 'min16float3', 'Sampling', '144'),
    *{('float', 'min16float', 'Sampling', n) for n in ('316', '317', '318')}}


def shader_diagnostics(log):
    return SHADER_DIAGNOSTIC.findall(log)


def build_diagnostics(log, marker, *, require_phases=False, require_refresh=False):
    lines = log.splitlines()
    begins = [(i, re.fullmatch(r'ST_LS_PLAYER_BUILD_BEGIN target=(android|windows|webgl)', line))
              for i, line in enumerate(lines) if line.startswith('ST_LS_PLAYER_BUILD_BEGIN')]
    ends = [(i, re.fullmatch(r'ST_LS_PLAYER_BUILD_END target=(android|windows|webgl) result=Succeeded', line))
            for i, line in enumerate(lines) if line.startswith('ST_LS_PLAYER_BUILD_END')]
    reviews = [(i, line) for i, line in enumerate(lines) if line.startswith('ST_LS_EDITOR_SHADER_REVIEW')]
    passes = [i for i, line in enumerate(lines) if line.startswith(marker)]
    expected_target = ('webgl' if marker.startswith('ST_LS_WEB_BUILD_PASS') else
                       next(iter(re.findall(r'(?:^| )target=(android|windows|webgl)(?: |$)', marker)), None))
    phases = (len(begins) == len(ends) == len(reviews) == len(passes) == 1
              and begins[0][1] is not None and ends[0][1] is not None
              and begins[0][1][1] == ends[0][1][1]
              and begins[0][1][1] == expected_target
              and reviews[0][1] == REVIEW
              and reviews[0][0] < begins[0][0] < ends[0][0] < passes[0])
    windows = []
    refreshed = False
    if phases:
        refreshes = [i for i, line in enumerate(lines) if 'Initiated by InitialRefreshV2(' in line]
        starts = [i for i, line in enumerate(lines) if line.startswith('Start importing ' + ASSET + ' using Guid(')]
        if len(refreshes) == 1 and refreshes[0] < reviews[0][0]:
            for start in starts:
                if start < refreshes[0]:
                    next_import = next((i for i in range(start + 1, refreshes[0])
                                        if lines[i].startswith('Start importing ')), refreshes[0])
                    windows.append((start, next_import))
        explicit_begin = [i for i, line in enumerate(lines) if line.startswith('ST_LS_EDITOR_IMPORT_BEGIN')]
        explicit_end = [i for i, line in enumerate(lines) if line.startswith('ST_LS_EDITOR_IMPORT_END')]
        if explicit_begin or explicit_end:
            valid = (len(explicit_begin) == len(explicit_end) == 1
                     and lines[explicit_begin[0]] == 'ST_LS_EDITOR_IMPORT_BEGIN asset=' + ASSET
                     and lines[explicit_end[0]] == 'ST_LS_EDITOR_IMPORT_END asset=' + ASSET
                     and reviews[0][0] < explicit_begin[0] < explicit_end[0] < begins[0][0])
            if valid:
                refreshed = True
                windows.append((explicit_begin[0], explicit_end[0]))
            else:
                phases = False
                windows = []
    diagnostics = []
    for i, line in enumerate(lines):
        if not SHADER_DIAGNOSTIC.fullmatch(line):
            continue
        warning = WARNING.fullmatch(line)
        reviewed = (phases and warning is not None and warning.groups() in SIGNATURES
                    and any(start < i < end for start, end in windows))
        diagnostics.append({'line': i + 1, 'message': line,
                            'disposition': 'reviewed-editor-import' if reviewed else 'blocking'})
    blocked = [item for item in diagnostics if item['disposition'] == 'blocking']
    phase_required = require_phases or require_refresh or bool(begins or ends or reviews)
    return {'schema': 'singedterra-shader-diagnostics/v1', 'phasesVerified': bool(phases),
            'editorImportRefreshed': refreshed, 'diagnostics': diagnostics,
            'accepted': marker in log and not blocked and (phases or not phase_required)
                        and (refreshed or not require_refresh)}


def accepts_log(log, marker):
    # Historical clean receipts predate phase markers and remain readable. New
    # build owners use require_phases=True; warning admission always needs phases.
    return build_diagnostics(log, marker)['accepted']
