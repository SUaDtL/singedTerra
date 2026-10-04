"""Focused regression for the Last Stand WebGL console disposition."""
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True

from verify_last_stand_loop import classify_console


class ConsoleClassificationTests(unittest.TestCase):
    def test_split_known_renderer_notices_across_three_page_loads(self):
        details = [
            "Hidden/CoreSRP/CoreCopy shader is not supported on this GPU (none of subshaders/fallbacks are suitable)",
            "Hidden/Universal Render Pipeline/StencilDitherMaskSeed shader is not supported on this GPU (none of subshaders/fallbacks are suitable)",
            "Hidden/Universal/HDRDebugView shader is not supported on this GPU (none of subshaders/fallbacks are suitable)",
        ]
        messages = []
        for _page_load in range(3):
            for detail in details:
                messages.extend([
                    {"type": "log", "text": "ERROR: Shader "},
                    {"type": "log", "text": detail},
                ])
        result = classify_console(messages)
        self.assertEqual(result["status"], "pass-with-known-limitations")
        self.assertEqual(result["known_shader_notice_count"], 9)
        self.assertEqual(result["known_shader_notice_names"], [
            "Hidden/CoreSRP/CoreCopy",
            "Hidden/Universal Render Pipeline/StencilDitherMaskSeed",
            "Hidden/Universal/HDRDebugView",
        ])
        self.assertEqual(result["errors"], [])

    def test_unknown_shader_and_exception_fail_closed(self):
        for messages in (
            [{"type": "log", "text": "ERROR: Shader "},
             {"type": "log", "text": "Game/RequiredSurface shader is not supported on this GPU"}],
            [{"type": "log", "text": "ERROR: Shader "}],
            [{"type": "log", "text": "Hidden/CoreSRP/CoreCopy shader is not supported on this GPU (none of subshaders/fallbacks are suitable)"}],
            [{"type": "log", "text": "ERROR: Console failure"}],
            [{"type": "log", "text": "System.InvalidOperationException: broken"}],
            [{"type": "error", "text": "WebGL context lost"}],
            [{"type": "error", "text": "ERROR: Shader "},
             {"type": "log", "text": "Hidden/CoreSRP/CoreCopy shader is not supported on this GPU (none of subshaders/fallbacks are suitable)"}],
        ):
            with self.subTest(messages=messages):
                result = classify_console(messages)
                self.assertEqual(result["status"], "failed")
                self.assertTrue(result["errors"])


if __name__ == "__main__":
    unittest.main()
