"""Inspect completed genuine Shop export observations; never rebuild inputs.

Set ST_SHOP_CODEARBITER_ROOT to the caller-confirmed installed plugin root.
"""
from pathlib import Path
import hashlib
import json
import os
import sys
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
UNITY_ROOT = ROOT / 'campaign-unity'
sys.path.insert(0, str(UNITY_ROOT / 'Tools'))
from build_web import source_binding, toolchain_binding
from unity_shader_log import accepts_log
sys.path.insert(0, str(UNITY_ROOT / 'Tools/last_stand_ui'))
from test_build_delivery import require, digest, regular, contained, read_json, inventory

BINDING = UNITY_ROOT / 'docs/last-stand-mechanics-shop/shop-native-binding.json'
DOCS = UNITY_ROOT / 'docs/last-stand-web'
PAYLOAD = ROOT / 'client/public/last-stand'
SHOP_IDS = {'ST-LS-SHOP-SPEC', 'ST-LS-SHOP-PLAN'}
LOOP_IDS = {'ST-LS-LOOP-SPEC', 'ST-LS-LOOP-PLAN'}
PREBUILD = ('scripts/checks/seed_challenge_compatibility.mjs',
            'scripts/assets/build-verified-challenge.mjs',
            'scripts/assets/verified-challenge.vite.config.mjs',
            'scripts/assets/verify-last-stand-source.mjs',
            'scripts/assets/verify-last-stand.mjs')
CONFIG = ('package.json', 'package-lock.json', 'client/package.json', 'shared/package.json',
          'client/index.html', 'client/vite.config.ts', 'tsconfig.base.json',
          'client/tsconfig.json', 'shared/tsconfig.json',
          'docs/compatibility/st1-source-manifest.json',
          'campaign-unity/docs/last-stand-web/source-lock.json',
          'campaign-unity/docs/last-stand-web/receipt-sanitized.json')


def normal_inputs():
    """TS includes, Vite public/HTML/config, and the actual npm prebuild graph."""
    result = {}
    for folder in ('client/src', 'shared/src', 'client/public'):
        result.update({folder + '/' + name: value for name, value in inventory(ROOT / folder).items()})
    for name in CONFIG + PREBUILD:
        result[name] = digest(regular(ROOT / name))
    for folder in ('', 'client/'):
        for leaf in ('.env', '.env.local', '.env.production', '.env.production.local', '.npmrc'):
            name = folder + leaf
            if (ROOT / name).exists():
                result[name] = digest(regular(ROOT / name))
    if (ROOT / 'shared/.npmrc').exists():
        result['shared/.npmrc'] = digest(regular(ROOT / 'shared/.npmrc'))
    return dict(sorted(result.items()))


def dependency_inputs():
    """Conservatively retain installed tool/dependency bytes, excluding output caches.

    The two workspace links are already bound through the source/public/config
    graph. Repo browser verification drivers are not production inputs.
    """
    result = {}
    def walk(folder, prefix):
        for path in sorted(folder.iterdir()):
            name = prefix + '/' + path.name
            if path.is_symlink() or path.is_junction():
                expected = {'node_modules/@singedterra/client': ROOT / 'client',
                            'node_modules/@singedterra/shared': ROOT / 'shared'}
                require(name in expected and path.resolve() == expected[name].resolve(),
                        'Unexpected linked dependency input: ' + name)
                result[name] = 'workspace:' + expected[name].relative_to(ROOT).as_posix()
            elif path.is_dir():
                if name not in ('node_modules/.vite', 'node_modules/.vite-temp', 'node_modules/.cache'):
                    walk(path, name)
            else:
                result[name] = digest(regular(path))
    walk(ROOT / 'node_modules', 'node_modules')
    return dict(sorted(result.items()))


def build_environment():
    return {key: hashlib.sha256(value.encode()).hexdigest()
            for key, value in sorted(os.environ.items())
            if key.startswith('VITE_') or key in ('NODE_OPTIONS', 'NODE_ENV', 'npm_config_ignore_scripts',
                                               'npm_config_script_shell')}


def load_binding():
    require(BINDING.is_file(), 'The real pre-task package has no current approved SHOP documentary binding')
    binding = read_json(BINDING)
    require(binding.get('schema') == 'singedterra-last-stand-shop-binding/v1'
            and binding.get('authority') == 'documentary-observation-only'
            and binding.get('task') == 'ST-LS-SHOP-PLAN#T-20'
            and binding.get('nativeReceipt') is False, 'SHOP documentary contract differs')
    return binding


def observed(binding, key):
    pin = binding[key]
    path = regular(pin['path'])
    require(digest(path) == pin['sha256'], 'Changed retained observation: ' + key)
    return read_json(path)


def completed_export(binding):
    pin = binding['export']
    path = contained(pin['receipt'], ROOT)
    require(digest(path) == pin['rawReceiptSha256'], 'Raw export receipt differs')
    record = read_json(path)
    require(record.get('schema') == 'singedterra-last-stand-build/v2' and record.get('status') == 'pass'
            and record.get('scene') == 'Assets/Scenes/LastStandPrototype.unity', 'Fresh saved-scene export did not pass')
    require(record['source_before'] == record['source_after'] == source_binding(), 'Current raw source differs from export')
    require(record['toolchain_before'] == record['toolchain_after']
            == toolchain_binding(Path(record['editor'])), 'Actual pinned export toolchain differs')
    require(record['scene_before'] == record['scene_after']
            and record['protected_scenes_before'] == record['protected_scenes_after'], 'Saved or protected scene drift')
    require(set(record['approved_artifacts']) == LOOP_IDS
            and record['approved_artifacts'] == binding['legacyExportObservations'], 'LOOP metadata was reinterpreted')
    require(record.get('android') is False and record.get('publish') is False, 'Unexpected export target')
    require(record['stages'] and all(stage['exit'] == 0 for stage in record['stages'])
            and {'editor-version', 'unity-web', 'web-entry'} <= {stage['stage'] for stage in record['stages']},
            'Original producer stage did not pass')
    log = regular(path.parent / 'unity-web.log').read_text(encoding='utf-8', errors='replace')
    require(accepts_log(log, 'ST_LS_WEB_BUILD_PASS'), 'Shader diagnostic admission failed')
    for marker in ('ST_ENC_MODEL_PASS', 'ST_LS_UNITY_PASS test_real_session_modes_and_damage',
                   'ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle',
                   'ST_LS_UNITY_PASS test_batched_frame_retains_shot_audio',
                   'ST_LS_UNITY_PASS test_same_tick_launcher_kill_keeps_impact_cue'):
        require(marker in log, 'Preserved model/build marker absent: ' + marker)
    return path, record


def assert_approvals(binding):
    before, after = observed(binding, 'nativeBefore'), observed(binding, 'nativeAfter')
    require(set(binding['approvedShop']) == SHOP_IDS, 'SHOP identity keys differ')
    require(binding['worktree'] == {'root': str(ROOT), 'head': source_binding()['head']}, 'Worktree identity differs')
    plugin_root = os.environ.get('ST_SHOP_CODEARBITER_ROOT')
    require(plugin_root, 'Set ST_SHOP_CODEARBITER_ROOT to the confirmed installed codeArbiter plugin root')
    plugin = Path(plugin_root)
    require(plugin.is_absolute(), 'ST_SHOP_CODEARBITER_ROOT must be an absolute installed plugin path')
    for leaf in ('hooks/_artifactlib.py', 'helpers/artifacts/release.json'):
        require((plugin / leaf).is_file(),
                'Incomplete ST_SHOP_CODEARBITER_ROOT package; missing ' + str(plugin / leaf))
    sys.path.insert(0, str(plugin / 'hooks'))
    from _artifactlib import ArtifactClient
    require(Path(sys.modules['_artifactlib'].__file__).resolve() == (plugin / 'hooks/_artifactlib.py').resolve(),
            'Loaded artifact bridge differs from ST_SHOP_CODEARBITER_ROOT; use a fresh Python process')
    client = ArtifactClient(str(ROOT), str(plugin / 'helpers/artifacts'))
    for aid in sorted(SHOP_IDS | LOOP_IDS):
        expected = binding['approvedShop'][aid] if aid in SHOP_IDS else binding['legacyExportObservations'][aid]
        for item in (before[aid]['approved'], after[aid]['approved'],
                     client.call('validate', {'artifact_id': aid, 'gate': 'approved'}, permit_invalid=True)):
            require(item['valid'] is True and item['authority']['authority_verified'] is True
                    and item['authority']['state'] == 'approved', 'Approved pair was not observed')
            require({key: item[key] for key in expected} == expected, 'Approved pair identity differs: ' + aid)
    pages = observed(binding, 'nativeContext')['pages']
    require(pages[-1]['context_complete'] is True and pages[-1]['context_ticket'], 'Incomplete native task context')
    context = next(item['record'] for page in pages for item in page['items']
                   if item['artifact_id'] == 'ST-LS-SHOP-PLAN' and item['kind'] == 'document_context')
    require(context['spec_ref']['artifact_id'] == 'ST-LS-SHOP-SPEC'
            and context['spec_ref']['binding_mode'] == 'approved_source'
            and context['spec_ref']['normative_sha256'] == binding['approvedShop']['ST-LS-SHOP-SPEC']['normative_sha256'],
            'SHOP plan-to-spec binding differs')


def assert_package(binding):
    receipt_path, record = completed_export(binding)
    build = Path(record['build'])
    require(build.resolve().is_relative_to((UNITY_ROOT / 'Builds').resolve()), 'Export escaped Builds')
    require(len(record['artifacts']) == 17 and inventory(build) == record['artifacts'], 'Exact 17 fresh export leaves differ')
    manifest = read_json(PAYLOAD / 'asset-manifest.json')
    lock, sanitized = read_json(DOCS / 'source-lock.json'), read_json(DOCS / 'receipt-sanitized.json')
    for name, path in (('manifestSha256', PAYLOAD / 'asset-manifest.json'),
                       ('sourceLockSha256', DOCS / 'source-lock.json'),
                       ('sanitizedReceiptSha256', DOCS / 'receipt-sanitized.json')):
        require(binding['package'][name] == digest(path), 'Packaged document pin differs: ' + name)
    require(sanitized['rawReceiptSha256'] == digest(receipt_path)
            and lock['closure'] == record['source_after']['closure'], 'Sanitized package source is stale')
    require(manifest['source']['build'] == build.name == sanitized['build'], 'Packaged build identity differs')
    runtime = {name: value for name, value in record['artifacts'].items() if name != 'index.html'}
    require(binding['package']['files'] == manifest['files'] == runtime, 'Packaged runtime manifest differs')
    require(inventory(PAYLOAD) == dict(runtime, **{'index.html': manifest['wrapperSha256'],
            'asset-manifest.json': digest(PAYLOAD / 'asset-manifest.json')}), 'Exact packaged leaves differ')
    for suffix in ('.loader.js', '.framework.js', '.data', '.wasm'):
        require(sum(name.startswith('Build/') and name.endswith(suffix) for name in runtime) == 1,
                'Expected exactly one runtime artifact: ' + suffix)
    plan_path = regular(receipt_path.parent / 'staging-plan.json')
    require(digest(plan_path) == binding['export']['stagingPlanSha256'], 'Frozen staging plan differs')
    plan = read_json(plan_path)
    require(plan['destination'] == 'client/public/last-stand' and plan['files'] == runtime
            and plan['receiptSha256'] == digest(receipt_path)
            and plan['sourceInventorySha256'] == lock['closure']['sha256'], 'Frozen staging contract differs')
    old = observed(binding, 'oldPackage')
    require(plan['previousFiles'] == old['payloadFiles'], 'Staged old leaves were not exactly preserved')
    for name, value in old['payloadFiles'].items():
        require(digest(contained('client/public/last-stand/' + name, Path(old['archiveRoot']))) == value,
                'Old packaged leaf archive differs')
    for name, value in old['documentFiles'].items():
        require(digest(contained(name, Path(old['archiveRoot']))) == value, 'Old document archive differs')


def assert_normal_checks(binding):
    checks = observed(binding, 'normalChecks')
    require(checks['schema'] == 'singedterra-shop-normal-checks/v1'
            and checks['inputsBefore'] == checks['inputsAfter'] == normal_inputs(), 'Normal production input closure is stale')
    require(checks['dependenciesBefore'] == checks['dependenciesAfter'] == dependency_inputs(), 'Installed dependency bytes differ')
    require(checks['environment'] == build_environment(), 'Normal build environment differs')
    require(checks['unitySourceBefore'] == checks['unitySourceAfter'] == source_binding(), 'Normal checks predate or changed Unity sources')
    require(checks['worktree'] == str(ROOT), 'Normal checks ran in another worktree')
    expected = [[binding['tools']['node']['path'], str(ROOT / 'scripts/assets/verify-last-stand-source.mjs')],
                [binding['tools']['node']['path'], str(ROOT / 'scripts/assets/verify-last-stand.mjs')],
                [binding['tools']['node']['path'], binding['tools']['npmCli']['path'], 'run', 'typecheck'],
                [binding['tools']['node']['path'], binding['tools']['npmCli']['path'], 'run', 'build']]
    require(len(checks['commands']) == 4, 'Missing unchanged normal command')
    for command, argv in zip(checks['commands'], expected):
        require(command['argv'] == argv and command['cwd'] == str(ROOT) and command['exit'] == 0
                and command['pid'] > 0 and command['completedUtc'] > command['startedUtc'], 'Normal command did not pass exactly')
        require(digest(regular(command['log'])) == command['logSha256'], 'Raw normal command log differs')
    for pin in binding['tools'].values():
        require(digest(regular(pin['path'])) == pin['sha256'], 'Pinned tool bytes differ')
    graph = observed(binding, 'productionGraph')
    require(graph['schema'] == 'singedterra-browser-bundle-graph/v1' and graph['chunks'], 'Actual Vite production graph missing')
    for chunk in graph['chunks']:
        require(not any('scripts/last-stand-' in item for item in chunk['modules']), 'Browser verification driver entered production')


class ShopBuildTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f'{self._testMethodName} ({owner.__module__}.{owner.__qualname__})'

    def test_shop_current_source_and_native_binding(self):
        binding = load_binding()
        assert_approvals(binding)
        completed_export(binding)

    def test_shop_packaged_runtime_and_normal_checks(self):
        require(read_json(DOCS / 'source-lock.json')['closure'] == source_binding()['closure'],
                'The genuine pre-task packaged runtime does not contain the reviewed current shop source')
        binding = load_binding()
        assert_package(binding)
        assert_normal_checks(binding)


if __name__ == '__main__':
    unittest.main()
