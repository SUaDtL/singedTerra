"""Authored geometry contract; Unity separately checks actual imported meshes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("tank_art_contract", TOOLS / "tank_art_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class TankArtTests(unittest.TestCase):
    def test_refuses_existing_source_or_output_without_modifying_them(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source, output = root / "source.blend", root / "assets"
            source.write_bytes(b"original source")
            with self.assertRaises(FileExistsError):
                contract.require_new_outputs(source, output)
            self.assertEqual(source.read_bytes(), b"original source")
            self.assertFalse(output.exists())
            source.unlink()
            output.mkdir()
            with self.assertRaises(FileExistsError):
                contract.require_new_outputs(source, output)

    def test_all_compositions_require_all_slots_and_budget(self):
        rows = [dict(id=f"{family}-{slot}", family=family, slot=slot,
                     triangles=100, meshes=2, muzzle=[0, 3.294, 0] if slot == "barrel" else None)
                for family in contract.FAMILIES for slot in contract.SLOTS]
        self.assertEqual(contract.validate_parts(rows)["compositions"], 256)
        with self.assertRaises(ValueError):
            contract.validate_parts(rows[:-1])
        rows[0]["triangles"] = 25000
        with self.assertRaises(ValueError):
            contract.validate_parts(rows)

    def test_rejects_displaced_muzzle_or_duplicate_family(self):
        rows = [dict(id=f"{family}-{slot}", family=family, slot=slot,
                     triangles=100, meshes=2, muzzle=[0, 3.294, 0] if slot == "barrel" else None)
                for family in contract.FAMILIES for slot in contract.SLOTS]
        rows[3]["muzzle"] = [0, 3.30, 0]
        with self.assertRaises(ValueError):
            contract.validate_parts(rows)
        rows[3]["muzzle"] = [0, 3.294, 0]
        rows[-1] = rows[0]
        with self.assertRaises(ValueError):
            contract.validate_parts(rows)

    def test_generated_models_and_textures_match_authored_manifest(self):
        root = TOOLS.parent / "Unity/Assets/TankKits02"
        catalog = json.loads((root / "catalog.json").read_text(encoding="utf-8"))
        contract.validate_files(catalog, root, TOOLS.parent)
        self.assertEqual(contract.validate_parts(catalog["parts"])["compositions"], 256)
        self.assertEqual(len(catalog["materials"]), 6)
        self.assertTrue(all(len(item["textures"]) == 3 for item in catalog["materials"]))
        self.assertTrue(all(part["minimum_signed_mesh_volume"] > 0 for part in catalog["parts"]))


if __name__ == "__main__":
    unittest.main()
