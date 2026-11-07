"""Run the real Node journey guards and retain their exact TAP evidence.

Run: C:/Python314/python.exe -m unittest discover -s campaign-unity/Tools/last_stand_ui -p test_journey_contracts.py -v
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
BACKGROUND = (
    "background guards reject frozen ticks and require separate native blur and hidden evidence",
    "background guards reject counted explicit Pause and automatic foreground resume",
    "background guards reject duplicate terminal staging and manual Claim awards",
    "background guards reject replay cues and empty rendered audio evidence",
)
BACKGROUND_PREREQUISITES = ("Linux current-source qualification reaches fresh model compilation",)
MAINTAINED = (
    "every required check validates classified work and the complete browser matrix",
    "Last Stand has one maintained shared journey and both entrypoints",
    "removed classification, result validation, shards and optionalized work are rejected",
    "all candidate shards prove the same bytes before and after execution",
    "candidate matrix rejects omitted coverage or digest verification",
    "rejects nonlocal, wrong-base and credentialed journey admission",
    "native Chrome enforces deny-external proxy before startup",
    "rejects escaped evidence parent before writing",
    "rejects resolved evidence junction escape before writing",
    "rejects external origin before fault or rejoin fixtures",
    "rejects unexpected backend methods, endpoints and awarding requests",
    "only the exact same-origin GET rejoin fixture is fulfilled",
    "rejects preflight redirects without following them",
    "bounds preflight response size and lifetime",
    "rejects missing or drifted served runtime and absent readiness",
    "rejects unplanned gameplay keys, cancels, edges, coordinates and hidden input",
    "JS cache revalidation accepts only exact same-load successful 304 fetch",
    "rejects unrelated console, page, HTTP and request errors in every fault scope",
    "only exact induced fault evidence is accepted while every unrelated error still fails",
    "process ancestry rejects reused parent PID and profile deletion rejects an owned wrong-prefix fixture",
    "teardown error is retained as a failed result before it propagates",
    "audio diagnostics retain missing capture before the original sample failure",
    "audio diagnostics retain stopped capture and exact inclusive window before failure",
    "audio diagnostics retain unavailable page errors without replacing the original read failure",
    "audio diagnostics retain absent observer without inventing a successful sample read",
    "audio diagnostics preserve sufficient sample energy and distinguish silence",
    "audio sample failure survives cleanup failure with both errors retained",
    "audio capture diagnostics observe lifecycle without starting stopped capture",
    "audio diagnostics bound capture details and errors while identifying the current document",
    "journey error survives persistence failure after successful cleanup",
    "journey error survives cleanup and persistence failures",
    "cleanup error takes precedence over persistence failure",
    "standalone persistence failure is retained in memory and propagates",
    "standalone cleanup failure still persists its failed report and propagates",
    "audio diagnostics retain latest sixteen snapshots and exact dropped count",
    "audio diagnostics bound long pathname and follow replacement document identity",
    "audio read failure retains recovered current document and the original error",
)


MAINTAINED_SUPPLEMENTAL = (
    "process ownership chronology rejects stale and ambiguous branches while retaining proven children",
    "process ownership rejects incomplete executable identities before retention and fresh adoption",
    "process ownership private matcher rejects incomplete executable identities",
)
# Preserve the original 37-name cohort above and the complete actual script order.
PREREQUISITES = (
    "product CI supplies required FFmpeg tools before the Last Stand journey",
    "product CI supplies the compiler for fresh current-source model qualification",
    "product CI proves its pinned browser sandbox before expensive UI checks",
)
# Reviewed fixed complete selection; deleting a Node case cannot erase its expectation.
MAINTAINED_COMPLETE = ('every CI and Pages browser installer prepares the official Ubuntu archive',
 'Ubuntu mirror repair preserves priorities, unrelated feeds and line endings',
 'Ubuntu mirror repair refuses unknown layouts and does not rewrite lookalike endpoints',
 'Ubuntu mirror file preparation changes only its admitted regular file',
 '15-minute CI partitions core, product, tier and every Campaigns viewport',
 'required CI runs current wave gate and checkpoint reader regressions',
 'required CI runs public parent configuration regressions',
 'every required check validates classified work and the complete browser matrix',
 'product CI supplies required FFmpeg tools before the Last Stand journey',
 'product CI supplies the compiler for fresh current-source model qualification',
 'product CI executes the complete inventoried portable domain regressions',
 'maintained checks retain parity, verifier negatives and background admission',
 'CI runs the combat and research evidence admission contracts',
 'product CI proves its pinned browser sandbox before expensive UI checks',
 'Last Stand has one maintained shared journey and both entrypoints',
 'removed classification, result validation, shards and optionalized work are rejected',
 'all candidate shards prove the same bytes before and after execution',
 'candidate matrix rejects omitted coverage or digest verification',
 'rejects nonlocal, wrong-base and credentialed journey admission',
 'native Chrome enforces deny-external proxy before startup',
 'rejects escaped evidence parent before writing',
 'rejects resolved evidence junction escape before writing',
 'rejects external origin before fault or rejoin fixtures',
 'rejects unexpected backend methods, endpoints and awarding requests',
 'only the exact same-origin GET rejoin fixture is fulfilled',
 'rejects preflight redirects without following them',
 'bounds preflight response size and lifetime',
 'rejects missing or drifted served runtime and absent readiness',
 'rejects unplanned gameplay keys, cancels, edges, coordinates and hidden input',
 'JS cache revalidation accepts only exact same-load successful 304 fetch',
 'rejects unrelated console, page, HTTP and request errors in every fault scope',
 'only exact induced fault evidence is accepted while every unrelated error still fails',
 'process ancestry rejects reused parent PID and profile deletion rejects an owned wrong-prefix fixture',
 'process ownership chronology rejects stale and ambiguous branches while retaining proven children',
 'teardown error is retained as a failed result before it propagates',
 'audio diagnostics retain missing capture before the original sample failure',
 'audio diagnostics retain stopped capture and exact inclusive window before failure',
 'audio diagnostics retain unavailable page errors without replacing the original read failure',
 'audio diagnostics retain absent observer without inventing a successful sample read',
 'audio diagnostics preserve sufficient sample energy and distinguish silence',
 'audio sample failure survives cleanup failure with both errors retained',
 'audio capture diagnostics observe lifecycle without starting stopped capture',
 'audio diagnostics bound capture details and errors while identifying the current document',
 'journey error survives persistence failure after successful cleanup',
 'journey error survives cleanup and persistence failures',
 'cleanup error takes precedence over persistence failure',
 'standalone persistence failure is retained in memory and propagates',
 'standalone cleanup failure still persists its failed report and propagates',
 'actual journey final evidence callback retains later raw files and failed report after console write '
 'failure',
 'actual journey final evidence callback preserves raw records when classification rejects',
 'actual journey final evidence callback retains compact failure when full result write fails',
 'actual journey final evidence callback attempts every artifact and stderr even when storage rejects all '
 'writes',
 'actual journey final evidence callback preserves successful raw evidence without failure diagnostics',
 'actual journey compact retention diagnostic bounds error text without truncating the full failed report',
 'actual journey evidence writer streams complete nested records without aggregate JSON stringification',
 'audio diagnostics retain latest sixteen snapshots and exact dropped count',
 'audio diagnostics bound long pathname and follow replacement document identity',
 'audio read failure retains recovered current document and the original error',
 'process ownership rejects incomplete executable identities before retention and fresh adoption',
 'process ownership private matcher rejects incomplete executable identities')
EXECUTABLE_VARIANTS = ("absent", "undefined", "empty", "null", "number", "boolean", "object", "array", "boxed string")
# Pinned existing child identities, not expectations learned from the TAP under test.
MAINTAINED_NESTED = {
    "actual journey evidence writer streams complete nested records without aggregate JSON stringification": ("LF", "CRLF"),
    MAINTAINED_SUPPLEMENTAL[0]: (
        "stale branch cannot authorize its descendants",
        "retained stale branch is pruned before destructive selection",
        "parent exit preserves proven valid children and prunes retained stale branch",
        "reused live parent cannot adopt new children but proven children survive",
        "changed executable is not the recorded live parent",
        "Windows submillisecond precision rejects earlier and admits equal or later stamps",
        "Linux decimal tick widths compare numerically",
        "Linux tick ordering retains integer precision",
        "retained ambiguous branch is pruned",
    ) + tuple("ambiguous child clock " + value for value in (
        "", "undefined", "unknown", "2026-02-30T22:10:56.0000000Z", "2026-10-10T22:10:56",
        "2026-10-10T22:10:56.0000000+00:00", "2026-10-10T22:10:56.12345678Z", "100", "100.1", "1e2",
    )) + ("ambiguous or mixed parent clock unknown", "ambiguous or mixed parent clock 100"),
    MAINTAINED_SUPPLEMENTAL[1]: tuple(
        variant + ": " + name for variant in EXECUTABLE_VARIANTS for name in (
            "new incomplete child and its grandchild rejected",
            "retained incomplete child cannot authorize new grandchild",
            "exited incomplete retained child and deeper branch pruned",
            "incomplete recorded root and matching live root rejected",
            "incomplete recorded root cannot retain complete descendants",
            "incomplete live root cannot authorize fresh adoption",
            "incomplete live retained parent cannot authorize fresh grandchild",
        )
    ) + (
        "complete Linux identity chain is admitted",
        "complete proven Linux orphans survive and live child adopts grandchild",
        "complete proven descendants survive all parent exits",
        "changed live executable cannot authorize a fresh child",
        "complete proven Windows orphan remains owned after root exits",
    ),
    MAINTAINED_SUPPLEMENTAL[2]: ("actual private matcher capture succeeds in an inert context",) + tuple(
        variant + ": " + name for variant in EXECUTABLE_VARIANTS for name in (
            "equal incomplete executable values on both sides", "incomplete left identity", "incomplete right identity",
        )
    ) + (
        "exact complete identity authorizes", "different left PID refuses", "different right PID refuses",
        "different left start refuses", "different right start refuses",
        "different left executable refuses", "different right executable refuses",
        "absent left identity refuses", "absent right identity refuses",
        "null left identity refuses", "null right identity refuses",
        "both absent identities refuse", "both null identities refuse", "null and absent identities refuse",
    ),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class JourneyContractTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    def guard_suite(self, script, expected, cohorts=None, nested=None):
        cohorts = cohorts or {"original": expected}
        nested = nested or {}
        expected_total = len(expected) + sum(len(children) for children in nested.values())
        node = shutil.which("node")
        self.assertIsNotNone(node, "Actual Node executable is required")
        parent = os.environ.get("LAST_STAND_JOURNEY_GUARD_EVIDENCE")
        if parent:
            Path(parent).mkdir(parents=True, exist_ok=True)
        output = Path(tempfile.mkdtemp(prefix=Path(script).stem + "-", dir=parent))
        argv = [node, "--test", "--test-reporter=tap", script]
        env = os.environ.copy()
        # The default maintained cohort is 37 original plus 3 mandatory supplements.
        env.pop("LAST_STAND_BOUNDARY_NATIVE", None)
        inputs = [script, "e2e/helpers/lastStandJourney.mjs", str(Path(__file__).relative_to(ROOT))]
        for key in ("LAST_STAND_GUARD_MODULE", "LAST_STAND_BACKGROUND_BASELINE_MODULE", "LAST_STAND_OBSERVATION_SOURCE"):
            if env.get(key):
                inputs.append(str(Path(env[key]).resolve()))
        if script.endswith("ciWorkflow.test.mjs"):
            inputs += [".github/workflows/ci.yml", ".github/workflows/deploy-pages.yml",
                       "e2e/last-stand-playable-loop.spec.ts", "scripts/last-stand-playable-loop.mjs",
                       "campaign-unity/Tools/verify_last_stand_loop.py"]
        before = {path: sha(ROOT / path) for path in inputs}
        result = subprocess.run(argv, cwd=ROOT, env=env, capture_output=True, timeout=120)
        (output / "stdout.tap").write_bytes(result.stdout)
        (output / "stderr.txt").write_bytes(result.stderr)
        after = {path: sha(ROOT / path) for path in inputs}
        tap = result.stdout.decode("utf-8-sig", errors="strict")
        names = re.findall(r"^ok \d+ - (.+)$", tap, re.MULTILINE)
        expected_tree = []
        for number, name in enumerate(expected, 1):
            expected_tree.append("# Subtest: " + name)
            for child_number, child in enumerate(nested.get(name, ()), 1):
                expected_tree += ["    # Subtest: " + child, f"    ok {child_number} - {child}"]
            if name in nested:
                expected_tree.append(f"    1..{len(nested[name])}")
            expected_tree.append(f"ok {number} - {name}")
        expected_tree.append(f"1..{len(expected)}")
        observed_tree = re.findall(r"^[ \t]*(?:# Subtest:|(?:not )?ok\b|1\.\.).*$", tap, re.MULTILINE)
        record = {"argv": argv, "cwd": str(ROOT), "exit": result.returncode,
                  "node_sha256": sha(node), "source_before": before, "source_after": after,
                  "stdout_sha256": sha(output / "stdout.tap"), "stderr_sha256": sha(output / "stderr.txt"),
                  "expected_names": expected, "observed_names": names,
                  "expected_nested_names": nested, "expected_total": expected_total,
                  "expected_outcome_tree": expected_tree, "observed_outcome_tree": observed_tree,
                  "cohorts": {key: {"expected_names": cohort,
                                    "observed_names": [name for name in names if name in cohort]}
                              for key, cohort in cohorts.items()}}
        (output / "invocation.json").write_text(json.dumps(record, indent=2), encoding="utf-8")
        print(f"ST_LS_GUARD_TAP={output / 'stdout.tap'}", flush=True)
        print(tap, end="", flush=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", errors="replace") + tap)
        self.assertEqual(before, after, "Source changed during actual Node guards")
        self.assertNotRegex(tap, r"(?im)^not ok\b|^Bail out!|^(?:ok|not ok) .*#\s*(SKIP|TODO)\b")
        self.assertEqual(names, list(expected), "Missing, duplicate, reordered or unknown actual TAP outcome")
        for name in expected:
            self.assertEqual(names.count(name), 1, "Named guard must run exactly once: " + name)
        self.assertEqual(observed_tree, expected_tree,
                         "Missing, duplicate, reordered, unknown or non-PASS actual TAP tree outcome/plan")
        for field, value in (("tests", expected_total), ("pass", expected_total), ("fail", 0),
                             ("cancelled", 0), ("skipped", 0), ("todo", 0)):
            self.assertEqual(re.findall(rf"^# {field} (\d+)$", tap, re.MULTILINE), [str(value)])
        self.assertEqual(re.findall(r"^1\.\.(\d+)$", tap, re.MULTILINE), [str(len(expected))])
        for key, cohort in cohorts.items():
            self.assertEqual([name for name in names if name in cohort], list(cohort),
                             "Missing, duplicate or reordered " + key + " cohort")


    def test_maintained_journey_guards(self):
        self.guard_suite("scripts/ci/ciWorkflow.test.mjs", MAINTAINED_COMPLETE,
                         {"original": MAINTAINED, "supplemental": MAINTAINED_SUPPLEMENTAL}, MAINTAINED_NESTED)

    def test_actual_python_wrapper_preserves_both_host_time_budgets(self):
        import ast
        from types import SimpleNamespace
        source = ast.parse((ROOT / 'campaign-unity/Tools/verify_last_stand_loop.py').read_text(encoding='utf-8'))
        actual = next(node for node in source.body if isinstance(node, ast.ClassDef) and node.name == 'LastStandWebTests')
        budget_result = subprocess.run(['node', '--input-type=module', '-e',
            "import {lastStandJourneyTimeBudget as budget} from './e2e/helpers/lastStandJourney.mjs';"
            "console.log(JSON.stringify(['win32','linux'].map(host=>budget(host).pythonMs/1000)));"],
            cwd=ROOT, capture_output=True, text=True, check=True, timeout=30)
        derived = dict(zip(['nt', 'posix'], json.loads(budget_result.stdout)))
        # Standalone clocks start before the actual 180-second web-server startup;
        # the outer Python owner also admits supervised cleanup.
        for host, minimum, maximum in [('nt', 2630, 2680), ('posix', 3830, 3880)]:
            calls = []
            def run(argv, **options):
                calls.append((argv, options))
                return SimpleNamespace(stdout='', stderr='', returncode=0)
            scope = {'unittest': unittest, 'ROOT': ROOT / 'campaign-unity', 'os': SimpleNamespace(name=host),
                     'subprocess': SimpleNamespace(run=run)}
            exec(compile(ast.Module(body=[actual], type_ignores=[]), '<actual Python entry>', 'exec'), scope)
            scope['LastStandWebTests']('test_defeat_buy_reload_redeploy').test_defeat_buy_reload_redeploy()
            self.assertEqual(len(calls), 1)
            self.assertGreater(calls[0][1]['timeout'], minimum, 'Outer wrapper must allow owned supervisor cleanup')
            self.assertLessEqual(calls[0][1]['timeout'], maximum)
            self.assertEqual(calls[0][1]['timeout'], derived[host], 'Actual Python wrapper must match the central host budget')
            self.assertEqual(calls[0][0][0], 'node')


if __name__ == "__main__":
    unittest.main()
