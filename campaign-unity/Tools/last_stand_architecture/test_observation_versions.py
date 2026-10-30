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
                  for version in (1, 2))


def packet(contract):
    value = {"phase": "garage", "coordinates": "top-left", "selection": "", "width": 800, "height": 600,
             "pixelRatio": 1, "scrollOffset": 0, "maximumScrollOffset": 0,
             "settingsScrollOffset": 0, "settingsMaximumScrollOffset": 0}
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
            self.assertEqual(len(value["historyControls"]), 9 if contract is CONTRACTS[1] else 2)
            self.assertEqual("plannerControls" in value, contract is CONTRACTS[1])

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
        for change in changes:
            with self.subTest(change=change):
                value = packet(CONTRACTS[1]); change(value)
                with self.assertRaises((AssertionError, ValueError, KeyError, TypeError)):
                    self.read_controls(raw(value))
        source = raw(packet(CONTRACTS[1]))
        with self.assertRaises((AssertionError, ValueError)):
            self.read_controls(source[:-12])

    def test_duplicate_json_keys_are_not_silently_repaired(self):
        for contract in CONTRACTS:
            source = raw(packet(contract))
            for before, after in [('"phase":"garage"', '"phase":"garage","phase":"garage"'),
                ('"phase":"garage"', '"phase":"garage","ph\\u0061se":"garage"'),
                ('"width":44', '"width":44,"width":44')]:
                with self.assertRaisesRegex(AssertionError, "Duplicate JSON key"):
                    self.read_controls(source.replace(before, after, 1))
