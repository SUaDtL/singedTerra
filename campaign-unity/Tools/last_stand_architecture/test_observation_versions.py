"""Portable contract tests execute the maintained Python reader without a browser.

Synthetic packets prove admission and rejection only, never rendered UI evidence.
"""
import ast
from copy import deepcopy
import json
import math
from pathlib import Path
import unittest

TOOLS = Path(__file__).resolve().parents[1]
CONTRACTS = tuple(json.loads((TOOLS / f"contracts/last-stand-observation-v{version}.json").read_text(encoding="utf8"))
                  for version in (1, 2, 3, 4, 5, 6))
CONTINUITY_CONTROLS = ("DataExport", "DataImport", "DataPrevious", "DataGarage", "BackupCancel", "BackupReplace",
                       "HelpPrevious", "HelpNext", "MenuGuidance", "GuidanceDismiss", "HelpAction")


def packet(contract):
    value = {"phase": "garage", "coordinates": "top-left", "selection": "", "width": 800, "height": 600,
             "pixelRatio": 1, "scrollOffset": 0, "maximumScrollOffset": 0,
             "settingsScrollOffset": 0, "settingsMaximumScrollOffset": 0}
    if "schema" in contract["header"]:
        value = {"schema": contract["schema"], **value}
    for inventory in contract["inventories"]:
        value[inventory["field"]] = [dict(name=name, label=name, accessibleLabel=name, mode=inventory["field"],
            trackKey="", x=0, y=0, width=44, height=44, active=False, interactable=False) for name in inventory["names"]]
    value["graphics"] = []
    value.update({key: 0 for key in contract["tail"]})
    return value


def raw(value):
    return CONTRACTS[0]["tag"] + json.dumps(value, separators=(",", ":"))


class ObservationVersionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = ast.parse((TOOLS / "verify_last_stand_loop.py").read_text(encoding="utf8"))
        owner = next(n for n in source.body if isinstance(n, ast.FunctionDef) and n.name == "verify_shop_vertical")
        functions = [n for n in owner.body if isinstance(n, ast.FunctionDef) and n.name in ("require", "read_controls")]
        namespace = {"json": json, "math": math, "OBSERVATION_CONTRACTS": CONTRACTS}
        exec(compile(ast.Module(body=functions, type_ignores=[]), "<maintained observation reader>", "exec"), namespace)
        cls.read_controls = staticmethod(namespace["read_controls"])

    def test_retained_and_current_complete_shapes(self):
        for contract in CONTRACTS:
            source = raw(packet(contract))
            value = self.read_controls(source)
            self.assertEqual(value["raw"], source)
            self.assertFalse(value["graphicsTruncated"])
            self.assertEqual(len(value["historyControls"]), (2, 9, 10, 10, 10, 10)[CONTRACTS.index(contract)])
            self.assertEqual("plannerControls" in value, contract is not CONTRACTS[0])

    def test_incomplete_extra_repeated_and_malformed_current_refused(self):
        changes = [lambda p: p.pop("plannerControls"), lambda p: p.pop("plannerMaximumScrollOffset"),
            lambda p: p["plannerControls"].pop(),
            lambda p: p["plannerControls"].append(deepcopy(p["plannerControls"][0])),
            lambda p: p["historyControls"].pop(),
            lambda p: p["plannerControls"][0].update(width="44"),
            lambda p: p["plannerControls"][0].update(active=1),
            lambda p: p["plannerControls"][0].update(width=-1),
            lambda p: p["plannerControls"][0].update(extra=True),
            lambda p: p.update(plannerScrollOffset=-1), lambda p: p.update(unknown=True),
            lambda p: p.update(graphics=None)]
        for contract in CONTRACTS[1:]:
            for change in changes:
                with self.subTest(schema=contract['schema'],change=change):
                    value = packet(contract); change(value)
                    with self.assertRaises((AssertionError, ValueError, KeyError, TypeError)):
                        self.read_controls(raw(value))
            source = raw(packet(contract))
            with self.assertRaises((AssertionError, ValueError)):
                self.read_controls(source[:-12])

    def test_current_schema_cannot_be_downgraded_or_mislabeled(self):
        for change in (lambda p: p.pop("schema"),
                       lambda p: p.update(schema="singedterra-last-stand-observation/v2"),
                       lambda p: p.update(schema="unknown"),
                       lambda p: p["researchControls"].pop(next(i for i,row in enumerate(p["researchControls"]) if row['name']=='ResearchHelp')),
                       lambda p: p["historyControls"].pop(next(i for i,row in enumerate(p["historyControls"]) if row['name']=='RunHistoryHelp')),
                       lambda p: p.pop("researchListScrollOffset"),
                       lambda p: p.update(researchDetailMaximumScrollOffset="400"),
                       lambda p: p.update(researchListMaximumScrollOffset=-1)):
            with self.subTest(change=change):
                value=packet(CONTRACTS[-1]);change(value)
                with self.assertRaises((AssertionError,ValueError,KeyError,TypeError)):
                    self.read_controls(raw(value))

    def test_duplicate_json_keys_are_not_silently_repaired(self):
        for contract in CONTRACTS:
            source = raw(packet(contract))
            for before, after in [('"phase":"garage"', '"phase":"garage","phase":"garage"'),
                ('"phase":"garage"', '"phase":"garage","ph\\u0061se":"garage"'),
                ('"width":44', '"width":44,"width":44')]:
                with self.assertRaisesRegex(AssertionError, "Duplicate JSON key"):
                    self.read_controls(source.replace(before, after, 1))

    def test_continuity_requires_each_new_control_and_its_exact_version(self):
        current = packet(CONTRACTS[3])
        names = {row["name"] for row in current["settingsControls"]}
        self.assertEqual(len(current["settingsControls"]), 52)
        self.assertTrue(set(CONTINUITY_CONTROLS) <= names)
        self.assertEqual(sum(len(current[row["field"]]) for row in CONTRACTS[3]["inventories"]), 132)
        self.assertEqual(self.read_controls(raw(current))["schema"], CONTRACTS[3]["schema"])
        for name in CONTINUITY_CONTROLS:
            with self.subTest(missing=name):
                incomplete = deepcopy(current)
                incomplete["settingsControls"] = [row for row in incomplete["settingsControls"] if row["name"] != name]
                with self.assertRaisesRegex(AssertionError, "Missing or repeated observed controls"):
                    self.read_controls(raw(incomplete))
        for schema in ("singedterra-last-stand-observation/v3", "singedterra-last-stand-observation/v5", None):
            mislabeled = deepcopy(current)
            if schema is None:
                mislabeled.pop("schema")
            else:
                mislabeled["schema"] = schema
            with self.assertRaises((AssertionError, ValueError, KeyError, TypeError)):
                self.read_controls(raw(mislabeled))
        repeated = deepcopy(current)
        repeated["settingsControls"][-1] = deepcopy(repeated["settingsControls"][-2])
        with self.assertRaisesRegex(AssertionError, "Missing or repeated observed controls"):
            self.read_controls(raw(repeated))
        invented = deepcopy(current)
        invented["settingsControls"][-1]["name"] = "invented-backup-action"
        with self.assertRaisesRegex(AssertionError, "Missing or repeated observed controls"):
            self.read_controls(raw(invented))

    def test_appearance_v5_requires_every_control_and_scroll_field(self):
        current = packet(CONTRACTS[4])
        self.assertEqual(len(current["appearanceControls"]), 33)
        self.assertEqual(len(current["settingsControls"]), 53)
        self.assertEqual(sum(len(current[row["field"]]) for row in CONTRACTS[4]["inventories"]), 166)
        self.assertEqual(self.read_controls(raw(current))["schema"], "singedterra-last-stand-observation/v5")
        for name in [row["name"] for row in current["appearanceControls"]]:
            with self.subTest(missing=name):
                incomplete = deepcopy(current)
                incomplete["appearanceControls"] = [row for row in incomplete["appearanceControls"] if row["name"] != name]
                with self.assertRaisesRegex(AssertionError, "Missing or repeated observed controls"):
                    self.read_controls(raw(incomplete))
        for change in (lambda p: p.pop("appearanceControls"), lambda p: p.pop("appearanceScrollOffset"),
                       lambda p: p.update(appearanceMaximumScrollOffset="500"),
                       lambda p: p.update(appearanceScrollOffset=-1),
                       lambda p: p["appearanceControls"].append(deepcopy(p["appearanceControls"][0])),
                       lambda p: p["appearanceControls"][0].update(name="invented-appearance"),
                       lambda p: p["settingsControls"].pop(),
                       lambda p: p.update(schema="singedterra-last-stand-observation/v4"),
                       lambda p: p.update(schema="singedterra-last-stand-observation/v6")):
            changed = deepcopy(current); change(changed)
            with self.assertRaises((AssertionError, ValueError, KeyError, TypeError)):
                self.read_controls(raw(changed))

    def test_buildcraft_v6_requires_armory_and_expanded_research_exactly(self):
        current = packet(CONTRACTS[-1])
        self.assertEqual(self.read_controls(raw(current))["schema"], "singedterra-last-stand-observation/v6")
        self.assertEqual(len(current["armoryControls"]), 12)
        self.assertIn("ArmoryName", [row["name"] for row in current["armoryControls"]])
        self.assertNotIn("FittingNext", [row["name"] for row in current["controls"]])
        for field in ("armoryControls", "researchControls", "shopControls", "settingsControls", "controls"):
            for row in current[field]:
                with self.subTest(field=field, missing=row["name"]):
                    incomplete = deepcopy(current)
                    incomplete[field] = [item for item in incomplete[field] if item["name"] != row["name"]]
                    with self.assertRaisesRegex(AssertionError, "Missing or repeated observed controls"):
                        self.read_controls(raw(incomplete))
        for change in (lambda p: p.pop("armoryControls"), lambda p: p.pop("armoryScrollOffset"),
                       lambda p: p.update(armoryMaximumScrollOffset="500"), lambda p: p.update(armoryScrollOffset=-1),
                       lambda p: p["armoryControls"].append(deepcopy(p["armoryControls"][0])),
                       lambda p: p["armoryControls"][0].update(name="invented-armory"),
                       lambda p: p.update(schema="singedterra-last-stand-observation/v5")):
            changed = deepcopy(current); change(changed)
            with self.assertRaises((AssertionError, ValueError, KeyError, TypeError)):
                self.read_controls(raw(changed))
