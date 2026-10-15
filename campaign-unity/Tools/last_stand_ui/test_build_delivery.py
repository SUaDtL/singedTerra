"""Inspect completed source-bound UI export/package; never rebuild its inputs.

Run: C:/Python314/python.exe -m unittest discover -s
campaign-unity/Tools/last_stand_ui -p test_build_delivery.py -v
"""
from pathlib import Path
import copy
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
UNITY_ROOT = ROOT / 'campaign-unity'
TOOLS = UNITY_ROOT / 'Tools'
sys.path.insert(0, str(TOOLS))
from build_web import source_binding, toolchain_binding
from unity_shader_log import accepts_log

BINDING = UNITY_ROOT / 'docs/last-stand-ui/ui-native-binding.json'
DOCS = UNITY_ROOT / 'docs/last-stand-web'
PAYLOAD = ROOT / 'client/public/last-stand'
UI_SPEC = 'ST-LS-UI-SPEC'
UI_PLAN = 'ST-LS-UI-PLAN'
LOOP_IDS = {'ST-LS-LOOP-SPEC', 'ST-LS-LOOP-PLAN'}
PLUGIN = Path.home() / '.codex/plugins/cache/codearbiter/ca-codex/0.15.5'


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def regular(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and not path.is_junction(),
            'Missing or linked evidence: ' + str(path))
    for parent in path.parents:
        require(not parent.is_symlink() and not parent.is_junction(), 'Linked evidence parent')
    return path


def contained(name, base):
    require(isinstance(name, str) and name and '\\' not in name,
            'Invalid contained evidence path')
    require(not Path(name).is_absolute() and all(part not in ('', '.', '..') for part in name.split('/')),
            'Evidence path escapes its declared root')
    path = base / name
    require(path.resolve().is_relative_to(base.resolve()), 'Evidence path escapes its declared root')
    return regular(path)


def read_json(path):
    try:
        return json.loads(regular(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise AssertionError('Invalid JSON evidence: ' + str(path)) from exc


def load_binding():
    require(BINDING.is_file(), 'Current approved UI feature binding is absent from the real pre-task package')
    binding = read_json(BINDING)
    require(binding.get('schema') == 'singedterra-last-stand-ui-binding/v1'
            and binding.get('authority') == 'documentary-observation-only'
            and binding.get('task') == 'ST-LS-UI-PLAN#T-10', 'UI documentary binding contract differs')
    return binding


def inventory(folder):
    result = {}
    for path in sorted(folder.rglob('*')):
        require(not path.is_symlink() and not path.is_junction(), 'Linked inventory input')
        if path.is_file():
            result[path.relative_to(folder).as_posix()] = digest(path)
    return result


def normal_inputs():
    result = {}
    for folder in ('client/src', 'shared/src', 'scripts', 'client/public/last-stand'):
        result.update({folder + '/' + name: value for name, value in inventory(ROOT / folder).items()})
    for name in ('package.json', 'package-lock.json', 'client/package.json', 'shared/package.json',
                 'client/vite.config.ts', 'tsconfig.base.json', 'client/tsconfig.json', 'shared/tsconfig.json'):
        result[name] = digest(regular(ROOT / name))
    return dict(sorted(result.items()))


def observed(binding, key):
    pin = binding[key]
    path = regular(pin['path'])
    require(digest(path) == pin['sha256'], 'Changed retained observation: ' + key)
    return read_json(path)


def completed_export(binding):
    pin = binding['export']
    path = contained(pin['receipt'], ROOT)
    require(digest(path) == pin['rawReceiptSha256'], 'Raw export receipt hash differs')
    record = read_json(path)
    require(record.get('schema') == 'singedterra-last-stand-build/v2'
            and record.get('status') == 'pass' and record.get('scene') == 'Assets/Scenes/LastStandPrototype.unity',
            'Complete passing saved-scene export required')
    require(record['source_before'] == record['source_after'], 'Export raw source changed')
    require(record['source_after']['closure']['sha256'] == pin['sourceClosureSha256'], 'Export source closure differs')
    require(record['toolchain_before'] == record['toolchain_after'], 'Export toolchain changed')
    require(record['scene_before'] == record['scene_after']
            and record['protected_scenes_before'] == record['protected_scenes_after'], 'Protected scene drift')
    require(set(record['approved_artifacts']) == LOOP_IDS, 'Legacy exporter identity keys were reinterpreted')
    require(record['approved_artifacts'] == binding['legacyExportObservations'], 'Legacy exporter observations differ')
    require(record.get('android') is False and record.get('publish') is False, 'Unexpected publication/build target')
    require(record.get('stages') and all(stage['exit'] == 0 for stage in record['stages'])
            and {'editor-version', 'unity-web', 'web-entry'} <= {stage['stage'] for stage in record['stages']},
            'Actual producer stages did not complete')
    log = regular(path.parent / 'unity-web.log').read_text(encoding='utf-8', errors='replace')
    require(accepts_log(log, 'ST_LS_WEB_BUILD_PASS'), 'Shader/build diagnostic admission failed')
    for marker in ('ST_ENC_MODEL_PASS', 'ST_LS_UNITY_PASS test_real_session_modes_and_damage',
                   'ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle',
                   'ST_LS_UNITY_PASS test_batched_frame_retains_shot_audio',
                   'ST_LS_UNITY_PASS test_same_tick_launcher_kill_keeps_impact_cue'):
        require(marker in log, 'Required original build/model marker absent: ' + marker)
    return path, record


def assert_feature_binding(binding, current_approvals=None):
    before = observed(binding, 'nativeBefore')
    after = observed(binding, 'nativeAfter')
    require(binding['worktree']['root'] == str(ROOT) and binding['worktree']['head'] == source_binding()['head'],
            'Worktree/source identity differs')
    for aid in (UI_SPEC, UI_PLAN):
        for observation in (before, after):
            approval = observation[aid]['approved']
            require(approval['valid'] is True and approval['authority']['authority_verified'] is True
                    and approval['authority']['state'] == 'approved', 'Current UI approval was not observed')
            require(approval['normative_sha256'] == binding['approvedUi'][aid]['normative_sha256'],
                    'UI normative observation differs')
        if current_approvals is not None:
            approval = current_approvals[aid]
            require(approval['valid'] is True and approval['authority']['authority_verified'] is True
                    and approval['normative_sha256'] == binding['approvedUi'][aid]['normative_sha256'],
                    'Current native UI approval is stale or invalid')
    require(set(binding['approvedUi']) == {UI_SPEC, UI_PLAN}, 'UI binding substituted legacy identity keys')
    for observation in (before, after):
        pages = observation['task_pages']
        require(pages[-1]['context_complete'] is True and pages[-1]['context_ticket'], 'Incomplete task context')
        context = next(item['record'] for page in pages for item in page['items']
                       if item['artifact_id'] == UI_PLAN and item['kind'] == 'document_context')
        require(context['spec_ref']['artifact_id'] == UI_SPEC
                and context['spec_ref']['binding_mode'] == 'approved_source'
                and context['spec_ref']['normative_sha256'] == binding['approvedUi'][UI_SPEC]['normative_sha256'],
                'Plan-to-spec approval binding differs')
    _, record = completed_export(binding)
    current = source_binding()
    require(current == record['source_after'], 'Current raw/portable source or generated meta inventory differs')
    require(binding['export']['toolchainSha256'] == record['toolchain_after']['sha256'], 'Toolchain binding differs')
    require(toolchain_binding(Path(record['editor'])) == record['toolchain_after'], 'Pinned actual toolchain drift')


def assert_package_binding(binding):
    receipt_path, record = completed_export(binding)
    build = Path(record['build'])
    require(build.resolve().is_relative_to((UNITY_ROOT / 'Builds').resolve())
            and not build.is_symlink() and not build.is_junction(), 'Export path escapes Builds')
    require(inventory(build) == record['artifacts'], 'Fresh export bytes differ from receipt')
    staged = read_json(PAYLOAD / 'asset-manifest.json')
    lock = read_json(DOCS / 'source-lock.json')
    sanitized = read_json(DOCS / 'receipt-sanitized.json')
    for name, path in (('manifestSha256', PAYLOAD / 'asset-manifest.json'),
                       ('sourceLockSha256', DOCS / 'source-lock.json'),
                       ('sanitizedReceiptSha256', DOCS / 'receipt-sanitized.json')):
        require(binding['package'][name] == digest(path), 'Packaged evidence pin differs: ' + name)
    require(sanitized['rawReceiptSha256'] == digest(receipt_path), 'Sanitized receipt is stale')
    require(lock['closure'] == record['source_after']['closure'] == source_binding()['closure'],
            'Packaged runtime is stale relative to actual current UI source')
    require(staged['source']['build'] == build.name == sanitized['build'], 'Packaged build identity differs')
    runtime = {name: value for name, value in record['artifacts'].items() if name != 'index.html'}
    require(binding['package']['files'] == staged['files'] == runtime, 'Packaged runtime manifest differs')
    require(inventory(PAYLOAD) == dict(runtime, **{'index.html': staged['wrapperSha256'],
            'asset-manifest.json': digest(PAYLOAD / 'asset-manifest.json')}), 'Staged runtime bytes/inventory differ')
    for suffix in ('.loader.js', '.framework.js', '.data', '.wasm'):
        require(sum(name.startswith('Build/') and name.endswith(suffix) for name in runtime) == 1,
                'Expected exactly one runtime artifact: ' + suffix)
    plan_path = regular(receipt_path.parent / 'staging-plan.json')
    require(digest(plan_path) == binding['export']['stagingPlanSha256'], 'Frozen staging plan differs')
    plan = read_json(plan_path)
    require(plan['destination'] == 'client/public/last-stand' and plan['files'] == runtime
            and plan['receiptSha256'] == digest(receipt_path)
            and plan['sourceInventorySha256'] == lock['closure']['sha256'], 'Enumerated staging plan binding differs')
    for script in ('verify-last-stand-source.mjs', 'verify-last-stand.mjs'):
        result = subprocess.run([binding['tools']['node']['path'], str(ROOT / 'scripts/assets' / script)],
                                cwd=ROOT, capture_output=True, text=True, timeout=120)
        require(result.returncode == 0, 'Unchanged validator failed: ' + result.stdout + result.stderr)


def assert_normal_checks(binding):
    checks = observed(binding, 'normalChecks')
    require(checks.get('schema') == 'singedterra-ui-normal-checks/v1'
            and checks['inputsBefore'] == checks['inputsAfter'] == normal_inputs(),
            'Normal production checks are stale relative to actual current source/package')
    require(checks['unitySourceBefore'] == checks['unitySourceAfter'] == source_binding(),
            'Normal build changed or predates exported Unity source')
    require(checks['worktree'] == str(ROOT), 'Normal checks ran in another worktree')
    expected = [str(ROOT / 'scripts/assets/verify-last-stand-source.mjs'),
                str(ROOT / 'scripts/assets/verify-last-stand.mjs'), 'typecheck', 'build']
    require(len(checks['commands']) == len(expected), 'Missing normal validator/typecheck/build command')
    for command, entrypoint in zip(checks['commands'], expected):
        argv = command['argv']
        require(command['cwd'] == str(ROOT) and command['exit'] == 0 and command['completedUtc'] > command['startedUtc'],
                'Normal production command did not complete successfully')
        require(argv[0] == binding['tools']['node']['path'], 'Command executable identity differs')
        if entrypoint in ('typecheck', 'build'):
            require(argv == [binding['tools']['node']['path'], binding['tools']['npmCli']['path'], 'run', entrypoint],
                    'Normal npm script was substituted')
        else:
            require(argv == [binding['tools']['node']['path'], entrypoint], 'Validator command was substituted')
        require(digest(regular(command['log'])) == command['logSha256'], 'Actual normal command output changed')
    for pin in binding['tools'].values():
        require(digest(regular(pin['path'])) == pin['sha256'], 'Command/tool bytes drifted')


class BuildDeliveryTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f"{self._testMethodName} ({owner.__module__}.{owner.__qualname__})"

    def test_current_source_and_feature_binding(self):
        binding = load_binding()
        sys.path.insert(0, str(PLUGIN / 'hooks'))
        from _artifactlib import ArtifactClient, helper_installation
        client = ArtifactClient(ROOT, helper_installation(str(PLUGIN / 'hooks/_artifactlib.py')))
        approvals = {aid: client.call('validate', {'artifact_id': aid, 'gate': 'approved'}, permit_invalid=True)
                     for aid in (UI_SPEC, UI_PLAN)}
        assert_feature_binding(binding, approvals)

    def test_packaged_runtime_and_receipt_match(self):
        lock = read_json(DOCS / 'source-lock.json')
        self.assertEqual(lock['closure'], source_binding()['closure'],
                         'The genuine existing packaged runtime does not contain current approved UI source')
        assert_package_binding(load_binding())

    def test_normal_production_build_checks(self):
        binding = load_binding()
        assert_normal_checks(binding)

    def test_rejects_stale_or_mismatched_binding(self):
        binding = load_binding()
        # Each counterexample starts from the actual completed candidate and
        # changes one claimed binding, retaining the genuine export and inputs.
        faults = [
            ('UI normative observation differs', assert_feature_binding,
             ('approvedUi', UI_SPEC, 'normative_sha256')),
            ('Raw export receipt hash differs', completed_export,
             ('export', 'rawReceiptSha256')),
            ('Export source closure differs', completed_export,
             ('export', 'sourceClosureSha256')),
            ('Packaged evidence pin differs', assert_package_binding,
             ('package', 'manifestSha256')),
        ]
        for expected, check, keys in faults:
            candidate = copy.deepcopy(binding)
            field = candidate
            for key in keys[:-1]:
                field = field[key]
            field[keys[-1]] = '0' * 64
            with self.subTest(expected=expected), self.assertRaisesRegex(AssertionError, expected):
                check(candidate)
        candidate = copy.deepcopy(binding)
        candidate['export']['receipt'] = '../outside/result.json'
        with self.assertRaisesRegex(AssertionError, 'escapes its declared root'):
            completed_export(candidate)
        checks = observed(binding, 'normalChecks')
        with tempfile.TemporaryDirectory(prefix='st-ui-normal-fault-') as temporary:
            fault = Path(temporary) / 'normal-checks.json'
            checks['inputsBefore']['package.json'] = '0' * 64
            checks['inputsAfter']['package.json'] = '0' * 64
            fault.write_text(json.dumps(checks), encoding='utf-8')
            candidate = copy.deepcopy(binding)
            candidate['normalChecks'] = {'path': str(fault), 'sha256': digest(fault)}
            with self.assertRaisesRegex(AssertionError, 'checks are stale'):
                assert_normal_checks(candidate)

            # Counterexample data copied from the genuine completed record;
            # the successful record and its actual source/tool/log pins stay intact.
            failed_checks = observed(binding, 'normalChecks')
            failed_checks['commands'][-1]['exit'] = 17
            failed_result = Path(temporary) / 'failed-production-build.json'
            failed_result.write_text(json.dumps(failed_checks), encoding='utf-8')
            candidate = copy.deepcopy(binding)
            candidate['normalChecks'] = {'path': str(failed_result), 'sha256': digest(failed_result)}
            with self.assertRaisesRegex(AssertionError, 'Normal production command did not complete successfully'):
                assert_normal_checks(candidate)


if __name__ == '__main__':
    unittest.main()
