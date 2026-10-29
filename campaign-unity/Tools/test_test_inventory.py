"""Missing, removed and unclassified suites must fail before CI execution."""
import json
from pathlib import Path
import tempfile
import unittest
from last_stand_test_inventory import inventory, command


class TestInventoryTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory(prefix="st-test-inventory-")
        self.addCleanup(self.folder.cleanup)
        self.root = Path(self.folder.name)
        self.manifest = self.root / "inventory.json"
        self.a = {"path": "test_a.py", "lane": "portable", "owner": "CI", "reason": "Actual domain checks", "cases": ["Example.test_one"]}
        (self.root / "test_a.py").write_text("class Example:\n    def test_one(self): pass\n", encoding="utf-8")

    def load(self, rows):
        self.manifest.write_text(json.dumps({"tests": rows}), encoding="utf-8")
        return inventory(self.root, self.manifest)

    def test_new_test_cannot_be_silently_omitted(self):
        (self.root / "test_b.py").write_text("", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "unclassified=.*test_b"):
            self.load([self.a])

    def test_removed_entry_or_removed_file_fails(self):
        with self.assertRaisesRegex(ValueError, "unclassified=.*test_a"):
            self.load([])
        (self.root / "test_a.py").unlink()
        with self.assertRaisesRegex(ValueError, "removed=.*test_a"):
            self.load([self.a])

    def test_unknown_empty_and_duplicate_classification_fails(self):
        for key, value in (("lane", "unknown"), ("owner", ""), ("reason", "")):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "Unclassified"):
                self.load([dict(self.a, **{key: value})])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.load([self.a, self.a])

    def test_alias_cannot_replace_its_executed_owner(self):
        alias = dict(self.a, lane="alias", alias_of="test_missing.py")
        with self.assertRaisesRegex(ValueError, "portable owner"):
            self.load([alias])

    def test_removed_or_unlisted_case_fails(self):
        for source in ("class Example: pass\n", "class Example:\n    def test_other(self): pass\n"):
            (self.root / "test_a.py").write_text(source, encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Removed or unclassified test case"):
                self.load([self.a])

    def test_valid_entry_has_exact_isolated_discovery_command(self):
        self.assertEqual(self.load([self.a]), [self.a])
        self.assertEqual(command("test_a.py", self.root)[1:],
                         ["-B", "-m", "unittest", "discover", "-s", str(self.root), "-p", "test_a.py", "-v"])

    def test_repository_inventory_is_complete(self):
        rows = {row['path']: row for row in inventory()}
        self.assertGreater(len(rows), 90)
        portable = rows['last_stand_shop/test_shop_player_portable.py']
        native = rows['last_stand_shop/test_shop_player.py']
        self.assertEqual(portable['lane'], 'portable')
        self.assertEqual(native['lane'], 'native-browser')
        self.assertEqual(portable['cases'], [
            'ShopPlayerTests.test_shop_player_headless_launch_is_explicit',
            'ShopPlayerTests.test_shop_player_option_dispatch',
            'ShopPlayerTests.test_shop_terminal_retry_observation_waits_for_current_defeat',
        ])
        self.assertEqual(native['cases'], [
            'ShopPlayerTests.test_shop_five_layouts_rendered_readability_and_input',
            'ShopPlayerTests.test_shop_native_focus_hidden_and_explicit_pause',
            'ShopPlayerTests.test_shop_normal_speed_both_fitting_media',
            'ShopPlayerTests.test_shop_real_launcher_vertical',
            'ShopPlayerTests.test_shop_real_repair_vertical',
            'ShopPlayerTests.test_shop_storage_faults_conflicts_and_terminal_refresh',
        ])
