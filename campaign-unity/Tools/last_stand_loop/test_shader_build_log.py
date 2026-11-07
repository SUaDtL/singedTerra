"""A Unity BuildPlayer success marker must not mask shader compile failures."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / "campaign-unity" / "Tools"
sys.path.insert(0, str(TOOLS))
from unity_shader_log import accepts_log, shader_diagnostics, build_diagnostics, ASSET

INVALID_LOG = Path(__file__).resolve().parent / "fixtures" / "unity_shader_error.txt"


class ShaderBuildLogTests(unittest.TestCase):
    def reviewed_import_log(self):
        fixture = INVALID_LOG.with_name('unity_editor_import_warnings.txt').read_text(encoding='utf-8')
        return (fixture + 'ST_LS_EDITOR_SHADER_REVIEW package=17.3.0 sha256=6dd0b39320f30fca7b8d6fcc067820f469beab2480f977861f22e46225e78a3d\n'
                'ST_LS_PLAYER_BUILD_BEGIN target=android\n'
                'ST_LS_PLAYER_BUILD_END target=android result=Succeeded\n'
                'ST_LS_PLAYER_BUILD_PASS target=android configuration=development\n')

    def test_reviewed_editor_import_is_reported_without_rejecting_player(self):
        log = self.reviewed_import_log()
        self.assertEqual(len(shader_diagnostics(log)), 18)
        self.assertTrue(accepts_log(log, 'ST_LS_PLAYER_BUILD_PASS target=android'),
                        'Exact source-bound editor import warnings are not player compilation failures')

    def test_review_never_covers_errors_other_shaders_or_changed_source(self):
        log = self.reviewed_import_log()
        for changed in (log.replace('Shader warning', 'Shader error', 1),
                        log.replace("'TraceVirtualOffset'", "'GameShader'", 1),
                        log.replace('6dd0b393', '0dd0b393'),
                        log.replace('(on d3d11)', '(on vulkan)', 1),
                        log.replace('Fibonacci.hlsl(16)', 'Fibonacci.hlsl(17)', 1)):
            with self.subTest(change=changed[:120]):
                self.assertFalse(accepts_log(changed, 'ST_LS_PLAYER_BUILD_PASS target=android'))

    def test_review_requires_complete_unambiguous_import_and_player_phases(self):
        log = self.reviewed_import_log()
        warning = next(line for line in log.splitlines() if line.startswith('Shader warning'))
        for changed in (log.replace('Start importing Packages/', 'Unidentified import Packages/', 1),
                        log.replace('InitialRefreshV2', 'UnknownRefresh'),
                        log.replace('ST_LS_PLAYER_BUILD_END', 'MISSING_END'),
                        log.replace('ST_LS_PLAYER_BUILD_BEGIN target=android', 'ST_LS_PLAYER_BUILD_BEGIN target=windows'),
                        log.replace('BUILD_BEGIN target=android', 'BUILD_BEGIN target=windows').replace('BUILD_END target=android', 'BUILD_END target=windows'),
                        log + 'ST_LS_PLAYER_BUILD_BEGIN target=android\n',
                        log.replace('ST_LS_PLAYER_BUILD_END', warning + '\nST_LS_PLAYER_BUILD_END'),
                        log + warning + '\n'):
            with self.subTest(change=changed[-160:]):
                self.assertFalse(accepts_log(changed, 'ST_LS_PLAYER_BUILD_PASS target=android'))

    def test_next_importer_cannot_inherit_editor_warning_admission(self):
        log = self.reviewed_import_log()
        warning = next(line for line in log.splitlines() if line.startswith('Shader warning'))
        changed = log.replace(warning, 'Start importing Assets/Runtime.shader using Guid(test)\n' + warning, 1)
        self.assertFalse(accepts_log(changed, 'ST_LS_PLAYER_BUILD_PASS target=android'))

    def test_explicit_refresh_requires_exact_completed_import_phase(self):
        log = self.reviewed_import_log()
        self.assertFalse(build_diagnostics(log, 'ST_LS_PLAYER_BUILD_PASS target=android', require_refresh=True)['accepted'])
        warning = next(line for line in log.splitlines() if line.startswith('Shader warning'))
        import_phase = ('ST_LS_EDITOR_IMPORT_BEGIN asset=' + ASSET + '\n' + warning + '\n'
                        'ST_LS_EDITOR_IMPORT_END asset=' + ASSET + '\n')
        log = log.replace('ST_LS_PLAYER_BUILD_BEGIN', import_phase + 'ST_LS_PLAYER_BUILD_BEGIN')
        result = build_diagnostics(log, 'ST_LS_PLAYER_BUILD_PASS target=android', require_phases=True, require_refresh=True)
        self.assertTrue(result['accepted'])
        self.assertEqual(len(result['diagnostics']), 19)
        self.assertTrue(all(item['disposition'] == 'reviewed-editor-import' for item in result['diagnostics']))
        for changed in (log.replace('ST_LS_EDITOR_IMPORT_END', 'NO_IMPORT_END'),
                        log.replace('ST_LS_EDITOR_IMPORT_BEGIN asset=Packages/', 'ST_LS_EDITOR_IMPORT_BEGIN asset=Assets/')):
            self.assertFalse(build_diagnostics(changed, 'ST_LS_PLAYER_BUILD_PASS target=android', require_refresh=True)['accepted'])
        self.assertFalse(build_diagnostics('ST_LS_PLAYER_BUILD_PASS target=android',
                                         'ST_LS_PLAYER_BUILD_PASS target=android', require_phases=True)['accepted'])

    def test_build_rejects_real_shader_compiler_errors(self):
        log = INVALID_LOG.read_text(encoding="utf-8", errors="replace")
        self.assertIn("Shader error in 'Hidden/SingedTerra/WebGL/HDRDebugView'", log)
        self.assertIn("ST_LS_WEB_BUILD_PASS", log)
        self.assertFalse(accepts_log(log, "ST_LS_WEB_BUILD_PASS"),
                         "A successful BuildPlayer summary concealed shader compiler errors")
        self.assertEqual(len(shader_diagnostics(log)), 3)

    def test_clean_build_log_is_accepted(self):
        self.assertTrue(accepts_log("ST_LS_WEB_BUILD_PASS", "ST_LS_WEB_BUILD_PASS"))


if __name__ == "__main__":
    unittest.main()
