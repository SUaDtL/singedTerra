"""Observe five continuous earned Tier3 runs without changing canonical inputs."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time

from measure_combat_balance import HERE, PROJECT, TOOLS, sources, hashes, compile_csharp, run_csharp, CSC, MONO

BASELINE_RAW_SHA = "97faf58f8898d2f75fd53876950792884cc29266a5e77283f31663b9b778efc7"
HARNESS_LF_SHA = "3c97b77d4aaf9a68f8808645d9ad417b7040f396870ccf8ef29058a678382307"
BASELINE_LF_SHA = "acf5a0c4918f0f32d736fde9b2857eaa093d6749cf754f0d22866439665b9821"
# Derived once from all35 preserved historical raw inputs; only CRLF becomes LF.
BASELINE_INPUT_LF_SHA = {
    "Tools/last_stand_combat_depth/CombatBalanceChecks.cs": "ba75c6f433c113c3ae1caacd657d1e1a9859c4f22e5ed6d7a050fe1af77ba3de",
    "Tools/last_stand_combat_depth/CombatBalanceMeasurements.cs": "3c97b77d4aaf9a68f8808645d9ad417b7040f396870ccf8ef29058a678382307",
    "Tools/last_stand_combat_depth/measure_combat_balance.py": "b6fa6dcf9734799a343dc7d28e8b7a32e1c11ddc9b3cb44a69c41adafef48d0a",
    "Tools/last_stand_source_closure.py": "ffb5d8e598fa196573452bc64feece1621ca4f4ced709e2fb9831dd539797204",
    "Tools/last_stand_test_runtime.py": "13b9f5982edeb578206ec0ee3d97bc69fc7a014116379e69955454cf8ea11a29",
    "Unity/Assets/Scripts/Application/LastStandResearchCoordinator.cs": "03db8ca0cee40c627a299ea4d5cd7fa8d05286335b01c3b2674a8d88bdb40367",
    "Unity/Assets/Scripts/Content/LastStandEnemyCatalog.cs": "a33403fbae466fbe285bdea214a9b2a2ff9c89b1f91d930b50a7722a27b2e57c",
    "Unity/Assets/Scripts/Content/LastStandResearchDefinitions.cs": "ebe1922e4ff2bf4f7db5227500e380c2e22398aacdab45d6b681615927a87b74",
    "Unity/Assets/Scripts/Content/LastStandRunEdition.cs": "bebcce5919373aceb2bfb7929224dcf129ecd7e8f3acfce6730d5246a358cbbc",
    "Unity/Assets/Scripts/EncounterFoeKind.cs": "3fa0903618e22ec938dee8ac1029d95ebaaf9d7fe23128d80580f1bca54684d5",
    "Unity/Assets/Scripts/EncounterGeometry.cs": "3fdd1b0078be84898f1db50aba03c222e5012f119ca57c562899570a69cb8c98",
    "Unity/Assets/Scripts/EncounterModel.cs": "d02a3146077d7ae590341dfbd4efc3ab63ef19bafad105731c64990cc2579a72",
    "Unity/Assets/Scripts/EncounterProfile.cs": "905127ca7cfa25c12e9dbb41c619e1a95909dad3c347ce8dc462729eb7d24cb3",
    "Unity/Assets/Scripts/LastStandEconomyCatalog.cs": "23555af9618da47e8022dd4d9ab299de59ddbfa31ef174a2c9ef290485c733b6",
    "Unity/Assets/Scripts/LastStandLegacySave.cs": "b38fdc816dba108499cab8be707223b9e01673a9ca54b6fb590502ddb9bb4950",
    "Unity/Assets/Scripts/LastStandProgression.cs": "872ff0dd9281bddc40db804b581b3e5f3ebfb9f4677c7474be2d03db625ed10c",
    "Unity/Assets/Scripts/LastStandProgressionResearch.cs": "f45249e386fc40069078b0576739e6dae54a9fbdd9aae95243f5ba4b3105aa0a",
    "Unity/Assets/Scripts/LastStandProgressionResearchSave.cs": "f8de9ccd8a4b925354290213648596d5fb84dd9e22a6851ddb9c9a927249f956",
    "Unity/Assets/Scripts/LastStandProgressionSave.cs": "f2fd9d34a5abd6b041d8e6976068cb9fdd5fb4df282e4d1802b2f485e4603ca7",
    "Unity/Assets/Scripts/LastStandResearchCatalog.cs": "be74a188bc8269fb2bd13542f2fe6b9bfeaf7ead46e6c0637977c684b8a9604b",
    "Unity/Assets/Scripts/LastStandResearchClock.cs": "a1e053f2dfbbf51704ee3eb5b8080d98cbb395c50bcbbf23e43a90b2b6e6807b",
    "Unity/Assets/Scripts/LastStandResearchState.cs": "e95e4a176ba0d8520730984c1752957efce203f5f4c07dd3d6347c2604afdcf1",
    "Unity/Assets/Scripts/LastStandRewardCatalog.cs": "215beec45af8509b8952414953cd67a9db5c55ada80d2a3fa746579b77016458",
    "Unity/Assets/Scripts/LastStandRunCheckpoint.cs": "c84d1febc24c5b5a1a8193ea0f2bb239d40469c0186267adaff14ccebb4d851a",
    "Unity/Assets/Scripts/LastStandRunClock.cs": "d515c36912828d134d70f812052ee55f28150da8aa67f6a14fec8b391b80a94a",
    "Unity/Assets/Scripts/LastStandRunHistory.cs": "bb59be7e86e0d46605a8fac4e7b9bac3540a17c25d3f770c9765fab4d79b7848",
    "Unity/Assets/Scripts/LastStandSaveJson.cs": "c1ae679d79966955ac63d8d10f7c3d0e5643f7f84ed2c3b9a8a06b88386abbc5",
    "Unity/Assets/Scripts/LastStandSelection.cs": "8fb62bab29262306c0c1051764b2b0a6dfe787cf8729c51cbe3873b9fa8763ed",
    "Unity/Assets/Scripts/LastStandShopState.cs": "869fc62dc2ae993e76caf67f7464d180688cf23b219a1695004763b875aa393d",
    "Unity/Assets/Scripts/LastStandSpeedPolicy.cs": "844b286d8afdb26204fd49ea7f7e5a86d8d4aa72ecd5017aa792cbef5c4ed505",
    "Unity/Assets/Scripts/LastStandStore.cs": "a31fa97cb7fecdf0c6fea21eb646dc534eb8150796b9102b4ce6d03dce87de94",
    "Unity/Assets/Scripts/LastStandTierCatalog.cs": "c2e6f97dbc0e060461973eb0b2420c43738f91c6f24c8f60c521f9ab4cc8cc51",
    "Unity/Assets/Scripts/LastStandUpgradeCatalog.cs": "69b0112e7479ee74362545039a99065abf2454d44407792a6c77620441e99b48",
    "Unity/Assets/Scripts/LastStandWaveCatalog.cs": "a2e569e931596b6fa92d3f581884f600c3f6f80128a2b428a985ad01c2651be0",
    "Unity/Assets/Scripts/MechanicsShopModel.cs": "7c3ba5340a567bb9fce1dc0f08890dccf63f0d1adfd80910cf876e82c3496ac7"
}
CALIBRATED_RAW_SHA = "072c83cf31ff8a7fa321027cb46b6b344c49d2cbf2c1a02fbf32ad660d67eaa4"
CALIBRATED_LF_SHA = "f659e408aea24a1da95636b50a9eba72f328aa4483e192b5a4ca2413ee956a6f"
CALIBRATED_INPUT_LF_SHA = {
    "Tools/last_stand_combat_depth/CombatBalanceChecks.cs": "ba75c6f433c113c3ae1caacd657d1e1a9859c4f22e5ed6d7a050fe1af77ba3de",
    "Tools/last_stand_combat_depth/CombatBalanceMeasurements.cs": "3c97b77d4aaf9a68f8808645d9ad417b7040f396870ccf8ef29058a678382307",
    "Tools/last_stand_combat_depth/measure_combat_balance.py": "dee12c408e7d2b9770b6b47aaa3ec65ed36336eb5334d4e39354015d8cc06cc8",
    "Tools/last_stand_source_closure.py": "ffb5d8e598fa196573452bc64feece1621ca4f4ced709e2fb9831dd539797204",
    "Tools/last_stand_test_runtime.py": "13b9f5982edeb578206ec0ee3d97bc69fc7a014116379e69955454cf8ea11a29",
    "Unity/Assets/Scripts/Application/LastStandResearchCoordinator.cs": "03db8ca0cee40c627a299ea4d5cd7fa8d05286335b01c3b2674a8d88bdb40367",
    "Unity/Assets/Scripts/Content/LastStandEnemyCatalog.cs": "a33403fbae466fbe285bdea214a9b2a2ff9c89b1f91d930b50a7722a27b2e57c",
    "Unity/Assets/Scripts/Content/LastStandResearchDefinitions.cs": "ebe1922e4ff2bf4f7db5227500e380c2e22398aacdab45d6b681615927a87b74",
    "Unity/Assets/Scripts/Content/LastStandRunEdition.cs": "bebcce5919373aceb2bfb7929224dcf129ecd7e8f3acfce6730d5246a358cbbc",
    "Unity/Assets/Scripts/EncounterFoeKind.cs": "3fa0903618e22ec938dee8ac1029d95ebaaf9d7fe23128d80580f1bca54684d5",
    "Unity/Assets/Scripts/EncounterGeometry.cs": "3fdd1b0078be84898f1db50aba03c222e5012f119ca57c562899570a69cb8c98",
    "Unity/Assets/Scripts/EncounterModel.cs": "864dd594d00282e132bb10e23fa55fc842d2921a969e6e6269b4636166aa1332",
    "Unity/Assets/Scripts/EncounterProfile.cs": "d888eac0bf582b0b6a68c03626d35d3cf137511c65b0c84ef745e7907d5a4c47",
    "Unity/Assets/Scripts/LastStandEconomyCatalog.cs": "23555af9618da47e8022dd4d9ab299de59ddbfa31ef174a2c9ef290485c733b6",
    "Unity/Assets/Scripts/LastStandLegacySave.cs": "b38fdc816dba108499cab8be707223b9e01673a9ca54b6fb590502ddb9bb4950",
    "Unity/Assets/Scripts/LastStandProgression.cs": "872ff0dd9281bddc40db804b581b3e5f3ebfb9f4677c7474be2d03db625ed10c",
    "Unity/Assets/Scripts/LastStandProgressionResearch.cs": "f45249e386fc40069078b0576739e6dae54a9fbdd9aae95243f5ba4b3105aa0a",
    "Unity/Assets/Scripts/LastStandProgressionResearchSave.cs": "f8de9ccd8a4b925354290213648596d5fb84dd9e22a6851ddb9c9a927249f956",
    "Unity/Assets/Scripts/LastStandProgressionSave.cs": "f2fd9d34a5abd6b041d8e6976068cb9fdd5fb4df282e4d1802b2f485e4603ca7",
    "Unity/Assets/Scripts/LastStandResearchCatalog.cs": "be74a188bc8269fb2bd13542f2fe6b9bfeaf7ead46e6c0637977c684b8a9604b",
    "Unity/Assets/Scripts/LastStandResearchClock.cs": "a1e053f2dfbbf51704ee3eb5b8080d98cbb395c50bcbbf23e43a90b2b6e6807b",
    "Unity/Assets/Scripts/LastStandResearchState.cs": "e95e4a176ba0d8520730984c1752957efce203f5f4c07dd3d6347c2604afdcf1",
    "Unity/Assets/Scripts/LastStandRewardCatalog.cs": "215beec45af8509b8952414953cd67a9db5c55ada80d2a3fa746579b77016458",
    "Unity/Assets/Scripts/LastStandRunCheckpoint.cs": "c84d1febc24c5b5a1a8193ea0f2bb239d40469c0186267adaff14ccebb4d851a",
    "Unity/Assets/Scripts/LastStandRunClock.cs": "d515c36912828d134d70f812052ee55f28150da8aa67f6a14fec8b391b80a94a",
    "Unity/Assets/Scripts/LastStandRunHistory.cs": "bb59be7e86e0d46605a8fac4e7b9bac3540a17c25d3f770c9765fab4d79b7848",
    "Unity/Assets/Scripts/LastStandSaveJson.cs": "c1ae679d79966955ac63d8d10f7c3d0e5643f7f84ed2c3b9a8a06b88386abbc5",
    "Unity/Assets/Scripts/LastStandSelection.cs": "8fb62bab29262306c0c1051764b2b0a6dfe787cf8729c51cbe3873b9fa8763ed",
    "Unity/Assets/Scripts/LastStandShopState.cs": "869fc62dc2ae993e76caf67f7464d180688cf23b219a1695004763b875aa393d",
    "Unity/Assets/Scripts/LastStandSpeedPolicy.cs": "844b286d8afdb26204fd49ea7f7e5a86d8d4aa72ecd5017aa792cbef5c4ed505",
    "Unity/Assets/Scripts/LastStandStore.cs": "a31fa97cb7fecdf0c6fea21eb646dc534eb8150796b9102b4ce6d03dce87de94",
    "Unity/Assets/Scripts/LastStandTierCatalog.cs": "c2e6f97dbc0e060461973eb0b2420c43738f91c6f24c8f60c521f9ab4cc8cc51",
    "Unity/Assets/Scripts/LastStandUpgradeCatalog.cs": "aa51e8a6d54805c51bc712ebf56da93dee2e037672c36977d81ed2f9d7786c53",
    "Unity/Assets/Scripts/LastStandWaveCatalog.cs": "a2e569e931596b6fa92d3f581884f600c3f6f80128a2b428a985ad01c2651be0",
    "Unity/Assets/Scripts/MechanicsShopModel.cs": "7c3ba5340a567bb9fce1dc0f08890dccf63f0d1adfd80910cf876e82c3496ac7"
}
REPORT = PROJECT / "docs/last-stand-combat-depth/combat-balance-calibrated-report.json"
BINDINGS = {
    "baseline": {"raw": BASELINE_RAW_SHA, "lf": BASELINE_LF_SHA, "inputs": BASELINE_INPUT_LF_SHA, "report": PROJECT / "docs/last-stand-combat-depth/combat-balance-baseline-report.json"},
    "calibrated": {"raw": CALIBRATED_RAW_SHA, "lf": CALIBRATED_LF_SHA, "inputs": CALIBRATED_INPUT_LF_SHA, "report": REPORT},
}
ARCHIVE = PROJECT / "Evidence/combat-depth-planning-20261028/combat-balance-expanded-v2"
ANCHOR = "int priorKills=model.Kills;model.Step();effects.Observe(model);shop.ObserveAuthoritativeKills(model,p.ResearchRank(LastStandResearchTrackId.ScrapLogistics));"
INSERT = "int priorKills=model.Kills;CrowdedWaveMeasurements.Before(model,shop);model.Step();effects.Observe(model);shop.ObserveAuthoritativeKills(model,p.ResearchRank(LastStandResearchTrackId.ScrapLogistics));CrowdedWaveMeasurements.After(model,shop);"


def instrument(source):
    if hashlib.sha256(source.encode()).hexdigest() != HARNESS_LF_SHA:
        raise ValueError("Canonical harness changed before instrumentation")
    if source.count(ANCHOR) != 1 or source.count("public static int Main(string[] args)") != 1:
        raise ValueError("Observer seam is missing or ambiguous")
    return source.replace(ANCHOR, INSERT).replace("public static int Main(string[] args)", "public static int CanonicalMain(string[] args)")


def compile_observer(folder):
    canonical = HERE / "CombatBalanceMeasurements.cs"
    generated = folder / "CombatBalanceMeasurements.observed.cs"
    generated.write_text(instrument(canonical.read_text()), encoding="utf-8", newline="\n")
    paths = [generated if p == canonical else p for p in sources()] + [HERE / "CrowdedWaveMeasurements.cs"]
    exe = folder / "CrowdedWaves.exe"
    return exe, compile_csharp(exe, paths, warnings_as_errors=True), generated


def admit_canonical(data, project=PROJECT, archive=None, binding_name="calibrated"):
    # Preserve historical byte identities while accepting only checkout EOL
    # normalization. No whitespace/content normalization or current-source oracle.
    binding = BINDINGS[binding_name]
    if not binding["lf"] or hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest() != binding["lf"]:
        raise ValueError("Frozen canonical report changed")
    historical = archive / "combat-balance-report.json" if archive is not None else None
    if historical is not None and historical.is_file() and hashlib.sha256(historical.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != binding["lf"]:
        raise ValueError("Available historical archive differs from canonical report")
    canonical = json.loads(data)
    if set(canonical["sourceSha256"]) != set(binding["inputs"]):
        raise ValueError("Canonical input closure changed")
    for rel, digest in binding["inputs"].items():
        source = project / rel
        if not source.is_file() or hashlib.sha256(source.read_bytes().replace(b"\r\n", b"\n")).hexdigest() != digest:
            raise ValueError("Canonical source changed: " + rel)
    return canonical


def validate(report, canonical):
    seed = next(c["seed"] for c in canonical["unlockCohorts"] if c["trigger"] == "final-earned")
    if report["policyId"] != "crowded-tier3-281-300-v1" or report["parentProfileSha256"] != seed["profileSha256"] or report["cumulativeEarnedSalvage"] != seed["cumulativeEarnedSalvage"]:
        raise ValueError("Undeclared policy or foreign earned seed")
    original = {r["fitting"]: r for c in canonical["unlockCohorts"] if c["trigger"] == "final-earned" for r in c["supplementalComparisons"] if r["tier"] == 3}
    if {r["fitting"] for r in report["runs"]} != set(original) or len(report["runs"]) != 5:
        raise ValueError("All five original earned fitting branches required")
    for row in report["runs"]:
        prior = original[row["fitting"]]
        if row["parentProfileSha256"] != seed["profileSha256"] or row["oneTimeAllocation"] != prior["oneTimeAllocation"]:
            raise ValueError("Changed earned profile or allocation")
        run = row["run"]
        if run["tier"] != 3 or run["policy"] != "none" or run["speedHalfSteps"] != 2 or run["purchaseIntents"] != 0:
            raise ValueError("Undeclared comparison policy")
        for checkpoint in ("1", "100", "300"):
            if run["checkpoints"][checkpoint] != prior["checkpoints"][checkpoint]:
                raise ValueError("Observer changed actual continuous outcome")
        if run["outcome"] != "requested-boundary" or run["highestClearedWave"] != 300 or run["activeMilliseconds"] != run["ticks"] * 50 or run["spentScrap"] != 0 or run["earnedScrap"] != run["remainingScrap"] or run["salvageGross"] != run["repeatableSalvage"] + run["researchBonusSalvage"] + run["firstClearSalvage"]:
            raise ValueError("Continuous run admission or accounting changed")
        if [r["wave"] for r in row["waves"]] != list(range(281, 301)):
            raise ValueError("Required contiguous observed window omitted")
        prior_boundary = row["windowStart"]
        if prior_boundary["wave"] != 280:
            raise ValueError("Observed start must be actual wave280 boundary")
        last = prior_boundary["tick"]
        for wave in row["waves"]:
            if any(type(wave[k]) is not int or wave[k] < 0 for k in ("wave", "startTick", "endTick", "ticks", "startingHull", "endingHull", "minimumHull", "kills", "earnedScrap", "salvageGross", "peakLivingBeforeAttacks", "livingEnemyTickSum")):
                raise ValueError("Wave counters must be nonnegative integers")
            before, after = wave["beforeBoundary"], wave["afterBoundary"]
            if before != prior_boundary or before["wave"] != wave["wave"] - 1 or after["wave"] != wave["wave"]:
                raise ValueError("Disconnected actual wave boundaries")
            for boundary in (before, after):
                if any(type(boundary[k]) is not int or boundary[k] < 0 for k in ("tick", "hull", "maximumHull", "kills", "earnedScrap", "cumulativeGrossSalvage")) or not 0 < boundary["maximumHull"] <= 1000000000 or boundary["hull"] > boundary["maximumHull"]:
                    raise ValueError("Impossible cumulative boundary")
            if before["maximumHull"] != after["maximumHull"] or before["tick"] != wave["startTick"] or after["tick"] != wave["endTick"] or before["hull"] != wave["startingHull"] or after["hull"] != wave["endingHull"]:
                raise ValueError("Window metrics differ from actual boundaries")
            for delta, cumulative in (("kills", "kills"), ("earnedScrap", "earnedScrap"), ("salvageGross", "cumulativeGrossSalvage")):
                if type(wave[delta]) is not int or wave[delta] < 0 or after[cumulative] - before[cumulative] != wave[delta]:
                    raise ValueError("Unconserved wave currency/kills")
            if not 0 <= wave["minimumHull"] <= min(wave["startingHull"], wave["endingHull"]) or not 0 <= wave["peakLivingBeforeAttacks"] <= 32:
                raise ValueError("Impossible hull or model capacity")
            if wave["endTick"] - wave["startTick"] != wave["ticks"] or wave["ticks"] <= 0 or last is not None and wave["startTick"] != last:
                raise ValueError("Wave timeline is not continuous")
            last = wave["endTick"]
            effects = wave["roleEffects"]
            if any(type(effects[k]) is not int or effects[k] < 0 for k in ("restoredHull", "mortarMultiTargetCasts", "mortarAdditionalTargets", "railgunEffectiveArmorBypass")):
                raise ValueError("Negative role effect")
            for effect in effects["incomingDamageByEnemy"]:
                if not 0 <= effect["effectiveDamage"] <= effect["rawDamage"]:
                    raise ValueError("Impossible incoming damage")
            for effect in effects["damageByWeaponAndEnemy"]:
                if any(type(effect[k]) is not int or effect[k] < 0 for k in ("effectiveDamage", "kills", "armorPreventedDamage")):
                    raise ValueError("Impossible outgoing damage/kill attribution")
            incoming = sum(r["effectiveDamage"] for r in effects["incomingDamageByEnemy"])
            if wave["startingHull"] + effects["restoredHull"] - incoming != wave["endingHull"]:
                raise ValueError("Incoming pressure/healing is not conserved")
            if sum(r["kills"] for r in effects["damageByWeaponAndEnemy"]) != wave["kills"]:
                raise ValueError("Duplicate or omitted attributed kill")
            if wave["minimumHull"] > min(wave["startingHull"], wave["endingHull"]) or not 0 <= wave["livingEnemyTickSum"] <= wave["peakLivingBeforeAttacks"] * wave["ticks"]:
                raise ValueError("Impossible hull or living pressure")
            prior_boundary = after
        if last != run["ticks"]:
            raise ValueError("Observed window does not reach the claimed final tick")
        expected_endpoint = {"wave": 300, "tick": run["ticks"], "hull": run["finalHull"], "maximumHull": row["windowStart"]["maximumHull"], "kills": run["kills"], "earnedScrap": run["earnedScrap"], "cumulativeGrossSalvage": seed["cumulativeEarnedSalvage"] + run["salvageGross"]}
        if prior_boundary != expected_endpoint or run["finalHull"] != run["checkpoints"]["300"]["hull"] or run["earnedScrap"] != run["checkpoints"]["300"]["earnedScrap"] or run["salvageGross"] != run["checkpoints"]["300"]["salvageGross"]:
            raise ValueError("Observed endpoint differs from admitted final checkpoint")


def measure(destination, binding_name="calibrated"):
    binding = BINDINGS[binding_name]
    report_path = binding["report"]
    data = report_path.read_bytes()
    canonical = admit_canonical(data, archive=ARCHIVE if binding_name == "baseline" else None, binding_name=binding_name)
    seed = next(c["seed"] for c in canonical["unlockCohorts"] if c["trigger"] == "final-earned")
    paths = sources() + [HERE / "CrowdedWaveMeasurements.cs", Path(__file__), HERE / "test_crowded_waves.py", HERE / "measure_combat_balance.py", TOOLS / "last_stand_source_closure.py", TOOLS / "last_stand_test_runtime.py"]
    before = hashes(paths)
    tools = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)}
    with tempfile.TemporaryDirectory(prefix="st-crowded-waves-") as temp:
        folder = Path(temp)
        exe, build, generated = compile_observer(folder)
        profile = folder / "earned-profile.json"
        profile.write_text(seed["profileJson"], encoding="utf-8", newline="")
        args = [profile, seed["calendarMilliseconds"], seed["permanentSpent"], seed["researchSpent"], seed["cumulativeEarnedSalvage"]]
        start = time.monotonic()
        result = run_csharp(exe, args, timeout_seconds=120)
        if result.returncode:
            raise RuntimeError(result.stderr)
        elapsed = time.monotonic() - start
        report = json.loads(result.stdout)
        validate(report, canonical)
        generated_bytes = generated.read_bytes()
    if hashes(paths) != before or tools != {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (CSC, MONO)} or report_path.read_bytes() != data:
        raise RuntimeError("Observer sources/toolchain/canonical report changed")
    retained = PROJECT / ("Evidence/combat-depth-planning-20261028/crowded-wave-" + binding_name + "-generated-observer.cs")
    retained.parent.mkdir(parents=True, exist_ok=True)
    retained.write_bytes(generated_bytes)
    report.update(canonicalBinding=binding_name, canonicalReportSha256=binding["raw"], sourceSha256=before, toolSha256=tools,
                  canonicalReportObservedRawSha256=hashlib.sha256(data).hexdigest(), canonicalReportLfSha256=binding["lf"],
                  sourceLfSha256={str(p.relative_to(PROJECT)).replace("\\", "/"): hashlib.sha256(p.read_bytes().replace(b"\r\n", b"\n")).hexdigest() for p in paths},
                  canonicalSourceHistoricalRawSha256=canonical["sourceSha256"], canonicalSourceLfSha256=binding["inputs"],
                  sourceAdmission="Historical raw digests remain unchanged. Mandatory frozen report/input LF digests accept only CRLF-to-LF checkout conversion; observed raw and LF digests are recorded separately.",
                  generatedHarnessSha256=hashlib.sha256(generated_bytes).hexdigest(), generatedHarnessPath=str(retained), compileArgv=list(build.argv),
                  executionSeconds=elapsed, command=[sys.executable, *sys.orig_argv[1:]], cwd=str(Path.cwd()),
                  qualification="Bounded actual production-model observation; no coefficient change or live player/performance claim.",
                  observationDefinition="Wave duration includes production spawn gaps; livingEnemyTickSum samples living enemies after each step, peakLivingBeforeAttacks reconstructs pre-hit population from prior living plus actual spawns. Minimum hull includes the per-step Repair/incoming event order.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report":str(destination),"executionSeconds":elapsed,"runs":len(report["runs"]),"sourceFiles":len(before)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binding", choices=tuple(BINDINGS), default="calibrated")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.binding == "baseline" and args.output is None:
        parser.error("Historical baseline replay requires an explicit output; preserved reports are never overwritten")
    measure(args.output or PROJECT / "docs/last-stand-combat-depth/crowded-wave-calibrated-report.json", args.binding)
