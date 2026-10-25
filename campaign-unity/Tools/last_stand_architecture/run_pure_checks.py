"""Run all architecture regressions that need Python and Mono, without Unity.

New pure test modules are included automatically. Editor suites retain their
separate qualified-host entry points and are named here so discovery cannot
silently launch Unity in the portable CI lane.
"""
from pathlib import Path
import sys
import unittest


EDITOR_MODULES = frozenset({
    "test_ui_foundation",
    "test_observation_contract",
    "test_content_validation",
})


def main():
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    selected = []
    for path in sorted(root.glob("test_*.py")):
        if path.stem in EDITOR_MODULES:
            continue
        selected.append(path.stem)
        suite.addTests(loader.loadTestsFromName(path.stem))
    if not selected or not suite.countTestCases():
        raise RuntimeError("No pure architecture tests discovered")
    print("Pure modules: " + ", ".join(selected), flush=True)
    print("Separate Unity host suites: " + ", ".join(sorted(EDITOR_MODULES)), flush=True)
    return 0 if unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
