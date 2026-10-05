"""A Unity BuildPlayer success marker must not mask shader compile failures."""

from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / "campaign-unity" / "Tools"
sys.path.insert(0, str(TOOLS))
from unity_shader_log import accepts_log, shader_diagnostics

INVALID_LOG = Path(__file__).resolve().parent / "fixtures" / "unity_shader_error.txt"


class ShaderBuildLogTests(unittest.TestCase):
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
