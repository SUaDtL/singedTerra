"""Enforce executable domain isolation and the single progression write owner.

These guards check dependencies/authority, not file size or cosmetic structure.
The negative controls introduce actual forbidden dependencies and write calls.
"""
from pathlib import Path
import re
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TOOLS))
from last_stand_source_closure import complete_sources
from last_stand_test_runtime import compile_csharp, run_csharp

SCRIPTS = TOOLS.parent / "Unity/Assets/Scripts"
PURE_ROOTS = ["Application/LastStandRunCoordinator.cs",
              "Application/LastStandResearchCoordinator.cs",
              "Application/LastStandPurchaseCoordinator.cs",
              "Content/LastStandContentManifest.cs", "LastStandShopPresentation.cs",
              "LastStandProgressionPlanner.cs", "LastStandHistoryComparison.cs"]
WRITE_PATTERNS = [
    r"\bProgression\s*\.\s*(?:Try\w*|Retry|Load)\s*\(",
    r"\bLastStandProgression\s*\.\s*Load\s*\(",
    r"\b(?:PlayerPrefs|LastStandStore|LastStandFileStorage|LastStandPreferencesStore)\b",
    r"\b(?:ILastStandStorage|ILastStandStorageOwnership)\b",
    r"\b(?:System\s*\.\s*)?IO\s*\.",
    r"\bWallet\s*(?:=(?!=)|\+=|-=|\+\+|--)",
]


def presentation_violations(text):
    # Remove comments and literals: prose and diagnostic field labels are not
    # authority. This is a focused tripwire backed by compiled behavioral checks.
    code = re.sub(r'@"(?:""|[^"])*"|"(?:\\.|[^"\\])*"|//[^\n]*|/\*.*?\*/',
                  " ", text, flags=re.S)
    return [pattern for pattern in WRITE_PATTERNS if re.search(pattern, code)]


class BoundaryTests(unittest.TestCase):
    def test_domain_compiles_without_unity(self):
        with tempfile.TemporaryDirectory(prefix="st-domain-boundary-") as folder:
            root = Path(folder)
            harness = root / "Boundary.cs"
            harness.write_text('''using System;
static class Boundary {
    static void Main() {
        foreach(var reference in typeof(SingedTerra.LastStand.LastStandRunCoordinator).Assembly.GetReferencedAssemblies())
            if(reference.Name.StartsWith("Unity") || reference.Name.StartsWith("Assembly-CSharp"))
                throw new Exception("Domain depends on presentation/platform assembly");
        Console.WriteLine("PASS domain isolation");
    }
}''', encoding="utf-8")
            sources = complete_sources(SCRIPTS, [SCRIPTS / name for name in PURE_ROOTS])
            executable = root / "Boundary.exe"
            compile_csharp(executable, [*sources, harness])
            result = run_csharp(executable)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout.strip(), "PASS domain isolation")
            # A real forbidden import in the production closure must not be
            # papered over with Unity stubs or by skipping compiler failures.
            changed = root / "LastStandRunCoordinator.cs"
            original = sources[0]
            changed.write_text("using UnityEngine;\n" + original.read_text(encoding="utf-8-sig"), encoding="utf-8")
            with self.assertRaisesRegex(AssertionError, "Compilation failed"):
                compile_csharp(root / "Forbidden.exe", [changed, *sources[1:], harness])

    def test_presentation_cannot_write_progression(self):
        paths = sorted({*SCRIPTS.rglob("LastStand*Hud.cs"),
                        *SCRIPTS.rglob("LastStand*View.cs"),
                        *SCRIPTS.rglob("LastStand*Observations.cs")})
        self.assertGreaterEqual(len(paths), 9, "Presentation owners disappeared from the boundary")
        for path in paths:
            with self.subTest(path=path.name):
                self.assertEqual(presentation_violations(path.read_text(encoding="utf-8-sig")), [])
        for forbidden in ["loop.Progression.TryPurchase(track);", "new LastStandStore();",
                          "PlayerPrefs.SetString(key,value);", "ILastStandStorage writer;",
                          "profile.Wallet += 3;", "System.IO.File.WriteAllText(path,value);"]:
            with self.subTest(forbidden=forbidden):
                self.assertTrue(presentation_violations(forbidden))
        self.assertFalse(presentation_violations('loop.Purchase(track); // Progression.TryPurchase()\n'
                                                'label.text="Wallet = 3";'))


if __name__ == "__main__":
    unittest.main()
