"""Focused regression for the Last Stand WebGL console disposition."""
from pathlib import Path
import sys
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
sys.dont_write_bytecode = True

from verify_last_stand_loop import classify_console, classify_request_failures


class ConsoleClassificationTests(unittest.TestCase):
    def test_aborted_304_cache_revalidation_requires_same_load_success(self):
        url = "http://127.0.0.1:52763/Build/Web-current.data"
        failure = {'url': url, 'failure': 'net::ERR_ABORTED', 'method': 'GET',
                   'resource_type': 'fetch', 'response_status': 304, 'load': 2}
        success = {'type': 'log', 'load': 2, 'text':
                   f"[UnityCache] '{url}' successfully revalidated and served from the browser cache"}
        accepted, errors = classify_request_failures([failure], [success])
        self.assertEqual(errors, [])
        self.assertEqual(accepted, [failure])
        for changed in (
            {**failure, 'failure': 'net::ERR_CONNECTION_RESET'},
            {**failure, 'response_status': None},
            {**failure, 'method': 'POST'},
            {**failure, 'resource_type': 'script'},
            {**failure, 'url': url.replace('.data', '.wasm')},
        ):
            with self.subTest(changed=changed):
                self.assertEqual(classify_request_failures([changed], [success])[0], [])
                self.assertTrue(classify_request_failures([changed], [success])[1])
        for messages in ([], [{**success, 'load': 1}],
                         [{**success, 'text': success['text'].replace('successfully revalidated',
                                                                  'failed to revalidate')}],
                         [{**success, 'text': success['text'].replace(url, url + '-other')}],
                         [{**success, 'type': 'error'}]):
            with self.subTest(messages=messages):
                self.assertEqual(classify_request_failures([failure], messages)[0], [])
                self.assertTrue(classify_request_failures([failure], messages)[1])

    def test_split_renderer_shader_errors_fail_across_three_page_loads(self):
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
        self.assertEqual(result["status"], "failed")
        self.assertEqual(len(result["errors"]), 9)
        for error, detail in zip(result["errors"], details * 3):
            self.assertEqual(error["text"], "ERROR: Shader")
            self.assertEqual(error["detail"], detail)

    def test_clean_telemetry_passes(self):
        result = classify_console([{"type": "log", "text": "ST_LS_STATE {}"}])
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["errors"], [])

    def test_unity_cache_failed_operation_is_an_error(self):
        message = ("[UnityCache] 'http://127.0.0.1/game.data' successfully downloaded "
                   "but not stored in the browser cache due to the error: "
                   "InvalidAccessError: Failed to execute 'put' on 'Cache': Entry already exists.")
        result = classify_console([{"type": "log", "text": message}])
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["errors"][0]["text"], message)

    def test_unity_cache_store_and_revalidation_pass(self):
        result = classify_console([
            {"type": "log", "text": "[UnityCache] game.data successfully downloaded and stored in the browser cache"},
            {"type": "log", "text": "[UnityCache] game.data successfully revalidated and served from the browser cache"},
        ])
        self.assertEqual(result["status"], "pass")
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
