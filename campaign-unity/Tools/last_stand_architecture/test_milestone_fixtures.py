"""Keep actual earned-generator/browser admission in the portable Mono CI lane."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "last_stand_waves"))
from test_earned_milestone_fixtures import EarnedMilestoneFixtureTests
