"""Current-wave information is read from actual combat and saved economy owners."""
from pathlib import Path
import sys
import unittest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "last_stand_waves"))
from test_catalogs import execute


class WaveInformationTests(unittest.TestCase):
    def test_current_wave_stats_rewards_and_read_only_projection(self):
        self.assertEqual(execute(HERE / "WaveInformationChecks.cs",
                                 ["LastStandWaveInformation.cs", "EncounterModel.cs"], "projection").strip(),
                         "PASS wave-information")
