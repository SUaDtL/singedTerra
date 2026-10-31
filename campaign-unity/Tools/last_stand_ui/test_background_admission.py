"""Background Node admission includes actual foreground probes on Windows.

Linux CI invokes the maintained Node suite after Mono setup. Windows execution
also requires an unobscured owned native window; source checks cannot replace it.
"""
import unittest
import test_journey_contracts as _guards

BACKGROUND_COMPLETE = ('native document readiness retains original caller admission controls',
 'native document readiness waits after one admitted activation and revalidates exact ownership',
 'Linux current-source qualification reaches fresh model compilation',
 'background guards reject frozen ticks and require separate native blur and hidden evidence',
 'background guards reject counted explicit Pause and automatic foreground resume',
 'background guards reject duplicate terminal staging and manual Claim awards',
 'background guards reject replay cues and empty rendered audio evidence',
 'inert placement uses the observed owned monitor instead of emulated screen dimensions',
 'inert placement rejects unsafe or mismatched ownership and geometry before tab activation',
 'inert placement native probe preserves physical context and exact process admission',
 'native activation pins process admission and keeps provider latency outside inserted input')


class BackgroundAdmissionTests(unittest.TestCase):
    guard_suite = _guards.JourneyContractTests.guard_suite

    def test_background_negative_controls(self):
        self.guard_suite("scripts/ci/lastStandBackground.test.mjs", BACKGROUND_COMPLETE,
                         {"original": _guards.BACKGROUND, "prerequisites": _guards.BACKGROUND_PREREQUISITES})
