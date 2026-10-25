"""Real bounded save-codec coverage for UTC anchors and lifetime durations."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "last_stand_waves"))
from test_catalogs import execute


class SaveCodecTests(unittest.TestCase):
    def test_utc_and_lifetime_milliseconds_preserve_exact_integers(self):
        execute(Path(__file__).with_name("SaveCodecChecks.cs"), ["LastStandSaveJson.cs"], "elapsed")

    def test_wide_numbers_remain_bounded_without_coercing_old_fields(self):
        execute(Path(__file__).with_name("SaveCodecChecks.cs"), ["LastStandSaveJson.cs"], "bounds")
