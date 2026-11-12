"""Approved provenance boundary, exact byte preservation and fail-closed replies."""
import ast
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

TOOLS = Path(__file__).resolve().parent
OWNERS = ("last_stand_skills/generate_review_profiles.py",
          "last_stand_skills_combat/measure_acquisition.py",
          "last_stand_skills_combat/measure_balance.py",
          "last_stand_skills_combat/prove_skill_guards.py",
          "last_stand_skills_combat/test_acquisition.py")


class ApprovedProvenanceTests(unittest.TestCase):
    def test_skills_tools_use_the_approved_provenance_boundary(self):
        for name in OWNERS:
            tree = ast.parse((TOOLS / name).read_text(encoding="utf-8-sig"))
            imports = {alias.name for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
            imports |= {node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}
            self.assertNotIn("hashlib", imports, name + " must use the approved Node provenance boundary")
            self.assertFalse(any(isinstance(node, ast.Name) and node.id == "hashlib" for node in ast.walk(tree)), name)
        driver = (TOOLS / "last_stand_skills_combat/SkillAcquisitionMeasurements.cs").read_text()
        self.assertNotIn("B.Hash(", driver, "New acquisition provenance belongs to the approved Node boundary")

    def test_raw_vectors_and_lf_identity_preserve_bom_and_non_ascii(self):
        import last_stand_provenance as provenance
        self.assertEqual(provenance.hash_bytes([b"", b"abc"]), [
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"])
        lf = b"\xef\xbb\xbf// caf\xc3\xa9\nclass A {}\n"
        variants = [lf, lf.replace(b"\n", b"\r\n"), lf.replace(b"\n", b"\r")]
        raw = provenance.hash_bytes(variants)
        self.assertEqual(len(set(raw)), 3)
        self.assertEqual(provenance.hash_bytes(variants, normalize_lf=True), [raw[0]] * 3)
        self.assertNotEqual(provenance.hash_bytes([lf[3:]], normalize_lf=True)[0], raw[0])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "source.cs"; path.write_bytes(variants[1])
            bindings = provenance.source_bindings([path], Path(folder))
            self.assertEqual(bindings["sourceSha256"], {"source.cs": raw[1]})
            self.assertEqual(bindings["sourceLfSha256"], {"source.cs": raw[0]})
            self.assertEqual(path.read_bytes(), variants[1])

    def test_large_batch_uses_only_the_approved_cli_and_preserves_order(self):
        import last_stand_provenance as provenance
        with tempfile.TemporaryDirectory() as folder:
            paths = [Path(folder) / (str(n) + ".bin") for n in range(257)]
            for path in paths: path.write_bytes(b"abc")
            with mock.patch.object(provenance.subprocess, "run", wraps=subprocess.run) as run:
                result = provenance.hash_files(paths)
            self.assertEqual(list(result), paths)
            self.assertEqual(len(set(result.values())), 1)
            self.assertEqual(run.call_count, 2)
            for call in run.call_args_list:
                self.assertEqual(call.args[0], ["node", str(provenance.NODE_HELPER), "--hash-files"])
                self.assertLessEqual(len(json.loads(call.kwargs["input"])["paths"]), 256)

    def test_malformed_partial_or_substituted_replies_are_rejected(self):
        import last_stand_provenance as provenance
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "input"; path.write_bytes(b"abc")
            row = {"path": str(path.resolve()), "sha256": "0" * 64}
            invalid = ["not json", [], {}, {"files": [], "extra": True}, {"files": []},
                       {"files": [row, row]}, {"files": [{**row, "path": "substituted"}]},
                       {"files": [{**row, "sha256": "A" * 64}]},
                       {"files": [{**row, "extra": 1}]}, {"files": [{**row, "sha256": None}]},
                       '{"files":[],"files":[]}']
            for reply in invalid:
                with self.subTest(reply=reply), mock.patch.object(provenance.subprocess, "run", return_value=
                        subprocess.CompletedProcess([], 0, reply if isinstance(reply, str) else json.dumps(reply), "")):
                    with self.assertRaises(ValueError): provenance.hash_files([path])

    def test_failures_and_invalid_inputs_never_return_a_digest(self):
        import last_stand_provenance as provenance
        with tempfile.TemporaryDirectory() as folder:
            missing = Path(folder) / "missing"
            with self.assertRaises(subprocess.CalledProcessError): provenance.hash_files([missing])
            for failure in (subprocess.CalledProcessError(1, ["node"]), subprocess.TimeoutExpired(["node"], 30)):
                with mock.patch.object(provenance.subprocess, "run", side_effect=failure):
                    with self.assertRaises(type(failure)): provenance.hash_files([missing])
            with self.assertRaises(ValueError): provenance.hash_files([missing, missing])
            with self.assertRaises(TypeError): provenance.hash_bytes(["not bytes"])


if __name__ == "__main__": unittest.main()
