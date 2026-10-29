"""Execution failure controls for the shared pure C# runner."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from last_stand_test_runtime import MONO, CSC, COMPILER_MODE, compile_csharp, discover_toolchain, run_csharp


class TestRuntimeTests(unittest.TestCase):
    def test_explicit_tools_survive_unavailable_default_discovery(self):
        with tempfile.TemporaryDirectory(prefix="st-runner-custom-only-") as folder:
            folder = Path(folder)
            environment = dict(os.environ, ST_CSHARP_MONO=str(folder / "absent-mono"),
                               ST_CSHARP_COMPILER=str(folder / "absent-compiler"))
            script = """
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from last_stand_test_runtime import MONO, CSC, compile_csharp, run_csharp
assert MONO is None and CSC is None
folder, mono, compiler, mode = Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]), sys.argv[5]
source, target = folder / 'Check.cs', folder / 'Check.exe'
source.write_text('class Check { static void Main() { System.Console.WriteLine("explicit-tools-pass"); } }')
build = compile_csharp(target, [source], mono=mono, compiler=compiler, compiler_mode=mode)
assert '-warnaserror+' in build.argv
result = run_csharp(target, mono=mono)
assert result.returncode == 0 and result.stdout.strip() == 'explicit-tools-pass'
for call in (lambda: compile_csharp(folder / 'Default.exe', [source]), lambda: run_csharp(target)):
    try: call()
    except RuntimeError as error: assert 'tool is unavailable' in str(error)
    else: raise AssertionError('Missing automatic tools must still fail at default use')
print('explicit-tools-pass; missing-defaults-refused')
"""
            result = subprocess.run([sys.executable, "-c", script, str(Path(__file__).resolve().parents[1]),
                                     str(folder), str(MONO), str(CSC), COMPILER_MODE],
                                    env=environment, text=True, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('missing-defaults-refused', result.stdout)

    def test_discovery_uses_explicit_tools_or_path_without_silent_skip(self):
        with tempfile.TemporaryDirectory(prefix="st-runner-discovery-") as folder:
            folder = Path(folder); mono = folder / "mono"; mcs = folder / "mcs"
            mono.write_bytes(b"discovery only"); mcs.write_bytes(b"discovery only")
            finder = lambda name: str({"mono": mono, "mcs": mcs}[name]) if name in ("mono", "mcs") else None
            self.assertEqual(discover_toolchain({}, "posix", finder), (mono.resolve(), mcs.resolve(), "direct"))
            explicit = {"ST_CSHARP_MONO": str(mono), "ST_CSHARP_COMPILER": str(mcs), "ST_CSHARP_COMPILER_MODE": "managed"}
            self.assertEqual(discover_toolchain(explicit, "posix", lambda _: None)[2], "managed")
            explicit["ST_CSHARP_COMPILER"] = str(folder / "missing")
            with self.assertRaises(RuntimeError):
                discover_toolchain(explicit, "posix", finder)
            with self.assertRaises(RuntimeError):
                discover_toolchain({}, "posix", lambda _: None)

    def test_explicit_sources_outputs_and_runtime_failure_are_preserved(self):
        with tempfile.TemporaryDirectory(prefix="st-runner-check-") as folder:
            folder = Path(folder); source = folder / "Check.cs"; target = folder / "Check.exe"
            source.write_text('using System; class Check { static int Main() { Console.WriteLine("actual-output"); return 7; } }')
            built = compile_csharp(target, [source])
            self.assertEqual(built.source_sha256[str(source.resolve())], hashlib.sha256(source.read_bytes()).hexdigest())
            result = run_csharp(target)
            self.assertEqual((result.returncode, result.stdout.strip()), (7, "actual-output"))

    def test_runner_propagates_compile_timeout_and_source_failures(self):
        with tempfile.TemporaryDirectory(prefix="st-runner-faults-") as folder:
            folder = Path(folder); source = folder / "Check.cs"; target = folder / "Check.exe"
            with self.assertRaisesRegex(AssertionError, "source is unavailable"):
                compile_csharp(target, [source])
            source.write_text("This is invalid C sharp")
            target.write_bytes(b"stale-executable")
            with self.assertRaisesRegex(AssertionError, "Compilation failed"):
                compile_csharp(target, [source])
            self.assertFalse(target.exists())
            source.write_text('using System.Threading; class Check { static void Main() { Thread.Sleep(10000); } }')
            compile_csharp(target, [source])
            with self.assertRaises(subprocess.TimeoutExpired):
                run_csharp(target, timeout_seconds=.1)
            compiler = folder / "slow_compiler.py"
            compiler.write_text("import time;time.sleep(10)")
            with self.assertRaises(subprocess.TimeoutExpired):
                compile_csharp(target, [source], mono=sys.executable, compiler=compiler, timeout_seconds=.1)
            self.assertFalse(target.exists())

    def test_source_change_during_compilation_rejects_output(self):
        with tempfile.TemporaryDirectory(prefix="st-runner-drift-") as folder:
            folder = Path(folder); source = folder / "Check.cs"; target = folder / "Check.exe"
            source.write_text("before")
            compiler = folder / "drifting_compiler.py"
            compiler.write_text("from pathlib import Path\nimport sys\n"
                                "Path(sys.argv[-1]).write_text('after')\n"
                                "out=next(x[5:] for x in sys.argv if x.startswith('-out:'))\n"
                                "Path(out).write_bytes(b'output')\n")
            with self.assertRaisesRegex(AssertionError, "sources changed"):
                compile_csharp(target, [source], mono=sys.executable, compiler=compiler)
            self.assertFalse(target.exists())
