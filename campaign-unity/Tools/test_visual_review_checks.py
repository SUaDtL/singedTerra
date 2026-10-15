"""Host checks for evidence rejection and pointer mapping, not Unity/browser proof."""
import copy
import math
import unittest
from visual_review_checks import frame_durations, pointer, validate_layout, validate_pair, validate_ring, validate_ring_clear_of_hud


class ReviewEvidenceChecks(unittest.TestCase):
    def state(self, treatment=0):
        return {'scene': 'BattlefieldReview', 'profile': 'review-pacing-v1', 'treatment': treatment,
                'snapshot': 'False|Running|160|120|3|2|4|0|0|0', 'tick': 160, 'paused': True,
                'width': 1600, 'height': 900, 'fullEffects': True,
                'ring': [{'x': .5 + .3 * math.sin(i * math.pi / 16),
                          'y': .5 + .3 * math.cos(i * math.pi / 16), 'z': 75} for i in range(32)]}

    def layout(self):
        names = ['SelectAsh', 'SelectIron', 'PauseEncounter', 'EncounterEffects', 'ReturnToInspection']
        return {'coordinates': 'top-left', 'width': 1600, 'height': 900,
                'controls': [{'name': name, 'label': name, 'x': 10 + i * 240, 'y': 20,
                              'width': 200, 'height': 50, 'active': True, 'interactable': True}
                             for i, name in enumerate(names)]}

    def test_matched_paused_pair_retains_fitting_and_snapshot_digest(self):
        pair = validate_pair(self.state(), self.state(1))
        self.assertEqual(pair['fitting'], 'repair')
        self.assertEqual(len(pair['snapshot_sha256']), 64)

    def test_changed_comparison_variables_are_rejected(self):
        for field, value in [('snapshot', 'True|Running|160'), ('tick', 161), ('width', 1280),
                             ('height', 720), ('fullEffects', False), ('paused', False),
                             ('profile', 'encounter-fixture-v1'), ('treatment', 0)]:
            with self.subTest(field=field):
                other = self.state(1); other[field] = value
                with self.assertRaises(ValueError):
                    validate_pair(self.state(), other)

    def test_clipped_nonfinite_or_incomplete_ring_rejected(self):
        for field, value in [('x', -.01), ('y', .99), ('z', -1), ('x', float('nan'))]:
            with self.subTest(field=field, value=value):
                state = self.state(); state['ring'][0][field] = value
                with self.assertRaises(ValueError):
                    validate_ring(state)
        state = self.state(); state['ring'].pop()
        with self.assertRaises(ValueError):
            validate_ring(state)

    def test_pointer_uses_actual_control_and_canvas_coordinates(self):
        point = pointer(self.layout(), 'SelectAsh', {'x': 5, 'y': 10, 'width': 800, 'height': 450})
        self.assertEqual(point, {'x': 60, 'y': 32.5})

    def test_pointer_refuses_inactive_disabled_duplicate_and_clipped_controls(self):
        for key, value in [('active', False), ('interactable', False), ('x', -4)]:
            with self.subTest(key=key):
                layout = self.layout(); layout['controls'][0][key] = value
                with self.assertRaises(ValueError):
                    pointer(layout, 'SelectAsh', {'x': 0, 'y': 0, 'width': 1600, 'height': 900})
        layout = self.layout(); layout['controls'].append(copy.deepcopy(layout['controls'][0]))
        with self.assertRaises(ValueError):
            pointer(layout, 'SelectAsh', {'x': 0, 'y': 0, 'width': 1600, 'height': 900})

    def test_layout_requires_combat_controls_and_rejects_overlap(self):
        self.assertEqual(len(validate_layout(self.layout(), True)['active_controls']), 5)
        layout = self.layout(); layout['controls'].pop()
        with self.assertRaises(ValueError):
            validate_layout(layout, True)
        layout = self.layout(); layout['controls'][1]['x'] = 20
        with self.assertRaises(ValueError):
            validate_layout(layout, True)

    def test_layout_rejects_inspection_command_leaking_into_combat(self):
        layout = self.layout()
        layout['controls'].append({'name': 'Attachment', 'label': 'Fit launcher', 'active': True,
                                   'interactable': True, 'x': 20, 'y': 500, 'width': 200, 'height': 50})
        with self.assertRaisesRegex(ValueError, 'Inspection controls'):
            validate_layout(layout, True)

    def test_motion_preserves_real_time_and_refuses_bad_timeline(self):
        self.assertEqual(frame_durations([{'timestamp': 12}, {'timestamp': 12.25}, {'timestamp': 13}]), [.25, .75])
        for times in ([12], [12, 12], [13, 12], [12, float('nan')]):
            with self.subTest(times=times), self.assertRaises(ValueError):
                frame_durations([{'timestamp': stamp} for stamp in times])

    def test_hud_occlusion_and_stale_resize_geometry_are_rejected(self):
        layout = self.layout()
        layout['panels'] = [{'name': 'Readout', 'active': True, 'x': 5, 'y': 5, 'width': 100, 'height': 50}]
        self.assertEqual(validate_ring_clear_of_hud(self.state(), layout)['panels'], ['Readout'])
        layout['panels'][0].update(x=750, y=170)
        with self.assertRaisesRegex(ValueError, 'obscured'):
            validate_ring_clear_of_hud(self.state(), layout)
        layout['width'] = 1280
        with self.assertRaisesRegex(ValueError, 'different sizes'):
            validate_ring_clear_of_hud(self.state(), layout)


if __name__ == '__main__':
    unittest.main()
