"""Exercise the exporter metadata admission before any process is launched."""
from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_web


class Admitted(Exception):
    pass


class WebArtifactBindingTests(unittest.TestCase):
    def admission(self, binding):
        with tempfile.TemporaryDirectory(prefix="st-export-binding-") as temp:
            root = Path(temp)
            editor = root / "Unity.exe"
            editor.write_bytes(b"inert never executed")
            for name in ("FieldAssembly", "BattlefieldReview", "LastStandPrototype"):
                path = root / "Unity/Assets/Scenes" / (name + ".unity")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("inert scene")
            argv = ["build_web.py", "--editor", str(editor), "--scene", "last-stand",
                    "--approval-binding", json.dumps(binding)]
            with patch.object(build_web, "ROOT", root), patch.object(build_web, "PROJECT", root / "Unity"), \
                 patch.object(sys, "argv", argv), patch.object(build_web.os.environ, "copy", side_effect=Admitted), \
                 patch.object(build_web.subprocess, "Popen", side_effect=AssertionError("Must not launch")):
                build_web.main()

    def pair(self, scope):
        return {f"ST-LS-{scope}-{kind}": {"revision": 1, "model_sha256": "a" * 64,
                "normative_sha256": "b" * 64} for kind in ("SPEC", "PLAN")}

    def test_current_depth_and_retained_sprint_identities_are_metadata(self):
        for scope in ("INTEL", "DEPTH", "ARCH", "RESEARCH", "WAVES", "LOOP"):
            with self.subTest(scope=scope), self.assertRaises(Admitted):
                self.admission(self.pair(scope))

    def test_mixed_unknown_or_malformed_metadata_cannot_reach_build(self):
        mixed = self.pair("DEPTH")
        mixed["ST-LS-ARCH-PLAN"] = mixed.pop("ST-LS-DEPTH-PLAN")
        malformed = self.pair("DEPTH")
        malformed["ST-LS-DEPTH-SPEC"]["revision"] = True
        for value in ({}, mixed, self.pair("UNKNOWN"), malformed):
            with self.assertRaisesRegex(RuntimeError, "identity pair|approval metadata"):
                self.admission(value)
