"""Read-only T24 delivery checks against real localhost and retained source evidence.

Run with C:/Python314/python.exe -m unittest discover -s
campaign-unity/Tools/last_stand_shop -p test_shop_delivery.py -v.
Missing delivery or owner evidence is a failure, never a skip. No browser,
server, build, native acceptance or player storage is mutated by this module.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import unittest
from datetime import datetime
from urllib.parse import quote

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(os.environ.get('ST_SHOP_DELIVERY_EVIDENCE',
    'C:/Users/brenn/codearbiter-review-integration-20261006/'
    'mechanics-shop-feature-20261009/resume-20261011'))
DOCS = ROOT / 'campaign-unity/docs/last-stand-mechanics-shop'
PAYLOAD = ROOT / 'client/public/last-stand'
PREVIEW_DIST = Path('C:/Users/brenn/codearbiter-review-integration-20261006/'
                    'localhost-shop-preview-20261010-current/dist')
BUILD = 'Web-20261011T224056Z-4c13a4'
GAME_URL = 'http://127.0.0.1:5203/last-stand/'
SOURCE_CLOSURE = '770d3b5c3dc918252871a2964af87b4293624c21e656109f306c5719577e09a3'
MANIFEST_SHA256 = 'e9d6cdb848fb3f1bb9627494c5faf62f984e5502b1fb12cbd214588624a01c43'
PROFILES = {(1920, 1080), (1366, 768), (720, 640), (390, 844), (844, 390)}
# These are independently reviewed original records, not this task's future review.
PINS = {
    'FINAL-TERMINAL-SHOP-RUNTIME-HANDOFF.json':
        'dca9975285170e3be3ec5da814d0ba4e15c9afb7d8e6f9f92957b0ba7a6e86d8',
    'compact-reading-review/aggregate.md':
        'd4675d6c9a938c7ed5b42fc9c026963de153d49d34c806cd45a8822191fcdf1b',
    'reading-binding-review/aggregate.md':
        'ac7a3499f3b845a6bb730b9dac8b17e6a1b461fd18bf9ce5bc86d40cd3cfeffc',
    'terminal-level-review/aggregate-verdict.md':
        'e304a6ce93212102b2131bba6d161162e16dabf584826fba171e9422438c5b62',
    'terminal-final-review/aggregate.md':
        '8d19ef00f18daa6eea9531430ba25ad63dc672ffe4f04fb5de4eaa4173766fca',
    'terminal-observation-correction/launcher-final-index.json':
        'be68949161c9431525a1084bdf51c8848b53a2d35316ddac9558c50401f53b94',
    'terminal-observation-correction/repair-final-index.json':
        '147c10b50fcbe988a844bf34e7bbc2ceede8f48ad6482a612e9051a3ac087858',
    'terminal-observation-correction/states-final-index.json':
        '3dba773197bad91a3ff4ba4fe51f76ae07c5d76dfe04abf075fa0a09939cca0e',
    'terminal-observation-correction/media-witness-extracts.json':
        '5200ca6f81f1c2964e3b7fe1fdac25eb99b71aa18ebac46db78c34561891178d',
}
PLAYER_TESTS = (
    'test_shop_five_layouts_rendered_readability_and_input',
    'test_shop_native_focus_hidden_and_explicit_pause',
    'test_shop_normal_speed_both_fitting_media',
    'test_shop_player_headless_launch_is_explicit',
    'test_shop_player_option_dispatch',
    'test_shop_real_launcher_vertical', 'test_shop_real_repair_vertical',
    'test_shop_storage_faults_conflicts_and_terminal_refresh',
    'test_shop_terminal_retry_observation_waits_for_current_defeat',
)
MIME = {'.data': {'application/octet-stream'}, '.wasm': {'application/wasm'},
        '.js': {'text/javascript', 'application/javascript'}, '.html': {'text/html'},
        '.json': {'application/json'}, '.css': {'text/css'}, '.png': {'image/png'},
        '.ico': {'image/x-icon', 'image/vnd.microsoft.icon'}}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def regular(path):
    path = Path(path)
    require(path.is_file(), 'Required real file is absent: ' + str(path))
    require(all(not item.is_symlink() and not item.is_junction()
                for item in (path, *path.parents)), 'Linked evidence: ' + str(path))
    return path


def sha(path):
    # Stream immutable originals; do not load or duplicate multi-gigabyte reports.
    with regular(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_json(path):
    path = regular(path)
    require(path.stat().st_size < 8_000_000, 'Use the bound navigation index: ' + str(path))
    return json.loads(path.read_text(encoding='utf-8-sig'))


def assert_pin(path, expected):
    require(sha(path) == expected, 'Changed retained evidence: ' + str(path))


def packet_links():
    path = regular(DOCS / 'preview-review.md')
    text = path.read_text(encoding='utf-8')
    require(GAME_URL in text and BUILD in text, 'Player packet lacks exact current preview/build')
    links = re.findall(r'\]\((?:<([^>]+)>|([^\s)]+))\)', text)
    local = set()
    for bracketed, plain in links:
        target = bracketed or plain
        if target.startswith(('http://', 'https://')):
            continue
        destination = Path(target)
        if not destination.is_absolute():
            destination = DOCS / destination
        local.add(regular(destination).resolve())
    return text, local


def assert_retained_checks():
    for name, expected in PINS.items():
        assert_pin(EVIDENCE / name, expected)
    handoff = read_json(EVIDENCE / 'FINAL-TERMINAL-SHOP-RUNTIME-HANDOFF.json')
    require(Path(handoff['worktree']).resolve() == ROOT and handoff['build'] == BUILD
            and handoff['source_closure'] == SOURCE_CLOSURE, 'Final runtime handoff differs')
    for name, expected in handoff['sources'].items():
        assert_pin(ROOT / name, expected)
    for pin in handoff['records'].values():
        require(regular(pin['path']).stat().st_size == pin['bytes'], 'Runtime report size changed')
        assert_pin(pin['path'], pin['sha256'])
    for stage, pin in handoff['fresh_root'].items():
        assert_pin(pin['path'], pin['sha256'])
        record = read_json(pin['path'])
        require(record == pin['result'] and record['status'] == 'pass'
                and record['source_unchanged'] is True, 'Failed retained root stage: ' + stage)
        for name, expected in record['hashes'].items():
            assert_pin(ROOT / name, expected)
        for command in record['commands']:
            require(command['exit'] == 0 and command['source_unchanged'] is True
                    and Path(command['cwd']).resolve() == ROOT,
                    'Failed or differently sourced prerequisite: ' + command['name'])
            for stream in ('stdout', 'stderr'):
                assert_pin(command[stream], command[stream + '_sha256'])
    command = handoff['fresh_root']['player']['result']['commands'][0]
    expected_argv = ['C:/Python314/python.exe', '-m', 'unittest', 'discover', '-s',
                     'campaign-unity/Tools/last_stand_shop', '-p', 'test_shop_player.py', '-v']
    require(command['argv'] == expected_argv, 'Full player invocation differs')
    output = regular(command['stderr']).read_text(encoding='utf-8')
    names = re.findall(r'^(test_\w+) \(test_shop_player.ShopPlayerTests\)', output, re.MULTILINE)
    require(names == list(PLAYER_TESTS) and len(re.findall(r'\.\.\. ok$', output, re.MULTILINE)) == 9
            and re.search(r'^Ran 9 tests in .*\n\nOK\s*$', output, re.MULTILINE),
            'All nine actual named player outcomes must pass without skips')
    # The prior independent result pins its three actual terminal unit reports.
    for name, expected in {
        'spec-terminal-report.md': '94c1f751c9b56875041da3fa223abf821d2d12b19831d9b366b06549b5c501e0',
        'coverage-review.md': '7b0db701b6613b878213221c31ce87d5d47ef7d5d160e61bfaa0c86421a57cb2',
        'design-report.md': '1d694f8f9055a59fca2c1f0690b7e408a2687745cf1f6fccb974a66448f96e2d',
    }.items():
        assert_pin(EVIDENCE / 'terminal-final-review' / name, expected)
    return handoff


def assert_review_material():
    text, links = packet_links()
    regular(DOCS / 'validation.md')
    handoff = assert_retained_checks()
    witnesses = read_json(EVIDENCE / 'terminal-observation-correction/media-witness-extracts.json')
    for fitting in ('launcher', 'repair'):
        index_path = EVIDENCE / f'terminal-observation-correction/{fitting}-final-index.json'
        index = read_json(index_path)
        require(index_path.resolve() in links, 'Missing current fitting index: ' + fitting)
        require(index['fitting'] == fitting and index['status'] == 'pass'
                and index['cleanup'] == 'complete' and index['binding']['build'] == BUILD,
                'Fitting index does not identify the qualified current runtime')
        for name, expected in index['binding']['input_files'].items():
            assert_pin(ROOT / name, expected)
        report = regular(index['report'])
        require(report.stat().st_size == index['report_bytes'], 'Original report size changed')
        # Hash the real originals without parsing their large graphics arrays.
        assert_pin(report, index['report_sha256'])
        require(Path(handoff['records'][fitting]['path']).resolve() in links,
                'Missing ordinary earned-fund fitting journey link')
        frame_profiles = set()
        for frame in index['frames']:
            path = report.parent / frame['file']
            if path.resolve() in links:
                assert_pin(path, frame['sha256'])
                frame_profiles.add(tuple(frame['viewport'][key] for key in ('width', 'height')))
        require(frame_profiles == PROFILES, 'Packet lacks matched images at all five sizes: ' + fitting)
        media = index['media']
        movie = report.parent / media['file']
        require(movie.resolve() in links, 'Missing actual fitting movie: ' + fitting)
        assert_pin(movie, media['sha256'])
        assert_pin(report.parent / media['raw'], media['raw_sha256'])
        require(media['mode'] == 'normal speed from captured timestamps'
                and media['frames'] == media['encoded_frames'] > 0
                and abs(media['duration_seconds'] - media['encoded_duration_seconds']) < 0.02,
                'Normal-speed media binding differs')
        witness = next(item for item in witnesses['extracts'] if item['fitting'] == fitting)
        require(witness['source_report_sha256'] == index['report_sha256'], 'Detached fitting witness')
        purchase = witness['objects']['$.witnesses.temporary_purchase']
        effect = witness['objects']['$.witnesses.temporary_effect']
        require(purchase == index['witnesses']['temporary_purchase']
                and effect == index['witnesses']['temporary_effect']
                and purchase['accepted'] is True and purchase['chargedScrap'] == 5
                and effect['tick'] > purchase['tick']
                and effect['fitting'].lower() == fitting, 'Actual purchase/effect witness differs')
    for marker in ('180-second', 'no Salvage', 'fast-loss', 'keep', 'change', 'mix',
                   'pending', 'layout', 'purchase clarity', 'playable'):
        require(marker in text, 'Missing player limitation or owner decision context: ' + marker)
    print('ST_SHOP_DELIVERY_REVIEW_MATERIAL_PASS', flush=True)


def fetch_exact(route, expected_file):
    connection = http.client.HTTPConnection('127.0.0.1', 5203, timeout=15)
    try:
        connection.request('GET', quote(route, safe='/'), headers={'Accept-Encoding': 'identity'})
        response = connection.getresponse()
        require(response.status == 200, 'Preview route did not return 200: ' + route)
        expected_size = regular(expected_file).stat().st_size
        digest = hashlib.sha256()
        size = 0
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            require(size <= expected_size, 'Served body exceeds exact packaged size: ' + route)
            digest.update(chunk)
        require(size == expected_size and digest.hexdigest() == sha(expected_file),
                'Served body differs from actual package: ' + route)
        raw_type = response.getheader('Content-Type')
        observed = (raw_type or '').split(';')[0].strip().lower()
        require(observed in MIME[Path(expected_file).suffix],
                f'Wrong served MIME for {route}: {raw_type!r} (missing/empty is invalid)')
        return {'route': route, 'sha256': digest.hexdigest(), 'bytes': size, 'mime': observed}
    finally:
        connection.close()


def assert_delivery_receipt(leaves):
    """Consume the actual root verify-served.py result contract after it runs."""
    record = read_json(EVIDENCE / 'user-preview-delivery/result.json')
    require(record['status'] == 'pass' and record['mode'] == 'final'
            and Path(record['build']).name == BUILD and record['source_sha256'] == SOURCE_CLOSURE
            and record['source_files'] == 3312 and Path(record['destination']) == PREVIEW_DIST,
            'Root final delivery result differs from the reviewed package')
    require(record['native_task_acceptance'] is False
            and record['browser_profile_save_touched'] is False,
            'Delivery cannot claim native acceptance or mutate personal state')
    require(len(record['leaves']) == len(leaves)
            and {row['route'] for row in record['leaves']} == {'/last-stand/' + name for name in leaves},
            'Final receipt must contain every exact package leaf once')
    for row in record['leaves']:
        name = row['route'].removeprefix('/last-stand/')
        require(row['status'] == 200 and row['sha256'] == leaves[name]
                and row['bytes'] == regular(PAYLOAD / name).stat().st_size
                and row['mime'] in MIME[Path(name).suffix]
                and row['url'] == 'http://127.0.0.1:5203' + row['route'],
                'Final HTTP receipt differs: ' + name)
    routes = record['routes']
    require([row['route'] for row in routes] ==
            ['/', '/singedTerra/', '/last-stand/', '/singedTerra/last-stand/'],
            'Final route coverage differs')
    for row in routes:
        expected = PAYLOAD / 'index.html' if row['route'] == '/last-stand/' else PREVIEW_DIST / 'index.html'
        require(row['status'] == 200 and row['mime'] == 'text/html'
                and row['sha256'] == sha(expected), 'Final route body differs')
    plan = read_json(EVIDENCE / 'user-preview-delivery/update-plan.json')
    before = read_json(EVIDENCE / 'user-preview-delivery/before.json')
    after = read_json(EVIDENCE / 'user-preview-delivery/after.json')
    require(record['changed'] == plan['changed'] and record['backups'] == plan['backups'],
            'Delivery preservation plan differs')
    for name, pin in before.items():
        preserved = Path(plan['backups'][name]) if name in plan['backups'] else PREVIEW_DIST / name
        assert_pin(preserved, pin['sha256'])
        if name not in plan['changed']:
            require(after[name] == pin, 'Unrelated preview input changed: ' + name)
    config = record['server_config']
    assert_pin(config['path'], config['sha256'])
    # Read ownership; never stop, start or reconfigure a listener here.
    query = ("$n=Get-NetTCPConnection -State Listen -LocalPort 5203; "
             "$ids=@($n.OwningProcess | Sort-Object -Unique); "
             "if($ids.Count -ne 1){throw 'Ambiguous listener'}; "
             "Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[0]) | "
             "Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress")
    observed = subprocess.run(['pwsh', '-NoProfile', '-Command', query],
                              capture_output=True, text=True, timeout=30, check=True)
    require(json.loads(observed.stdout) == record['listener'], 'Current listener differs from actual final receipt')
    command = record['listener']['CommandLine'].replace('\\', '/')
    require(str(PREVIEW_DIST).replace('\\', '/') in command
            and str(config['path']).replace('\\', '/') in command
            and '--port 5203' in command, 'Final listener is not the exact configured preview')


def assert_documented_text_acceptance(record, path, pin, binding, request_root):
    # This one observed normal-text decision answers the frozen review question.
    # The context records its interpretation; it grants no native authority.
    context_path = EVIDENCE / 'merge-20261012/owner-approval-context.json'
    assert_pin(context_path,
               '9b8a7f35803367d34a08be9b91518ea51e9ff82350c67834e1110c611e422873')
    context = read_json(context_path)
    require(Path(path).resolve() == Path(context['actual_user_record']).resolve()
            and pin == context['actual_user_record_sha256'],
            'Normal-text acceptance must be the exact observed owner record')
    require(Path(context['request_binding']).resolve() == (request_root / 'binding.json').resolve()
            and context['presented_packet_sha256'] == binding['packet_sha256']
            and context['build'] == BUILD
            and context['native_authority_claimed'] is False
            and context['unrelated_work_authorized'] is False,
            'Normal-text owner decision has a different review context')
    observed_id = {
        'message_id': 'msg_01a1300d-383e-7bf0-b9ba-6676a1e1307b',
        'turn_id': '01a1300d-311b-7471-af81-9a7036101c9b',
        'role': 'user',
    }
    message = record['payload']
    require(message['id'] == observed_id['message_id']
            and message['internal_chat_message_metadata_passthrough']['turn_id'] == observed_id['turn_id']
            and record['metadata']['retained_source']['id'] == observed_id
            and record['metadata']['retained_source']['complete'] is True,
            'Normal-text owner message identity differs')
    # Ambient browser context is not user intent. Only the request portion of
    # this hash-bound actual message supplies the exact reviewed approval quote.
    _, separator, user_text = message['content'][0]['text'].partition('\n## My request:\n')
    require(separator and user_text.strip() == context['quote'] == 'looks good i think it can merge',
            'PENDING: normal-text owner request does not contain the observed approval')


def assert_owner_acceptance():
    request_root = EVIDENCE / 'owner-review-request'
    assert_pin(request_root / 'request.json',
               'c4a227a25d7e6dd5f794f81ad023b59e0f1e88229163de3fc4876fa686f8bba5')
    assert_pin(request_root / 'binding.json',
               'd872bd1a5f15175553eb518f11514e97f563ed7d324a127642e69407caa9106b')
    request_record = read_json(request_root / 'request.json')
    request = request_record['payload']
    binding = read_json(request_root / 'binding.json')
    require(binding['build'] == BUILD and binding['source_sha256'] == SOURCE_CLOSURE
            and binding['source_files'] == 3312 and binding['native_task_acceptance'] is False,
            'Owner question has a different source/runtime context')
    assert_pin(binding['packet'], binding['packet_sha256'])
    assert_pin(binding['packet_snapshot'], binding['packet_sha256'])
    require(Path(binding['packet']).resolve() == (DOCS / 'preview-review.md').resolve(),
            'Owner question did not present this review packet')
    question = json.loads(request['arguments'])['questions'][binding['question_index']]
    path = os.environ.get('ST_SHOP_OWNER_ACCEPTANCE')
    pin = os.environ.get('ST_SHOP_OWNER_ACCEPTANCE_SHA256')
    require(path and pin, 'PENDING: actual owner keep/change/mix reply and host observation are absent')
    require(re.fullmatch(r'[0-9a-f]{64}', pin), 'Owner observation digest is invalid')
    assert_pin(path, pin)
    # Consume the actual public response_item message, not an authored acceptance
    # label. Root supplies its observed digest out of band. This is documentary
    # same-user evidence, not cryptographic or native workflow authority.
    try:
        record = read_json(path)
        require(isinstance(record, dict) and record.get('type') == 'response_item',
                'Owner evidence must be the actual public message record')
        message = record.get('payload', {})
        require(message.get('type') == 'message' and message.get('role') == 'user',
                'Only an actual role=user message can record the owner decision')
        content = message.get('content', [])
        require(len(content) == 1 and content[0].get('type') == 'input_text',
                'Expected the actual owner reply text')
        require(datetime.fromisoformat(record['timestamp']) >
                datetime.fromisoformat(request_record['timestamp']), 'Owner reply predates the question')
        match = re.fullmatch(r'<send_user_message_question_reply>\s*(\[.*\])\s*'
                             r'(?:</send_user_message_question_reply>)?\s*',
                             content[0]['text'], re.DOTALL)
        if match is None:
            assert_documented_text_acceptance(record, path, pin, binding, request_root)
            return
        answers = json.loads(match.group(1))
        require(isinstance(answers, list) and len(answers) == 1,
                'Expected one actual reply to the one owner question')
        answer = answers[0]
        require(json.loads(answer['questionItemId']) ==
                [request['name'], request['call_id'], binding['question_index']],
                'Owner reply belongs to another request')
        require(answer['question'] == question['title'], 'Owner reply question differs')
        require(answer['answer'] == question['options'][0],
                'PENDING: owner requested change/mix or has not explicitly kept all three')
    except (KeyError, TypeError, ValueError, AttributeError) as error:
        raise AssertionError('Malformed actual owner reply; acceptance is not established') from error


class ShopDeliveryTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f'{self._testMethodName} ({owner.__module__}.{owner.__qualname__})'

    def test_shop_served_exact_runtime_and_routes(self):
        packet_links()
        assert_pin(PAYLOAD / 'asset-manifest.json', MANIFEST_SHA256)
        manifest = read_json(PAYLOAD / 'asset-manifest.json')
        require(manifest['source']['build'] == BUILD
                and manifest['source']['sourceInventorySha256'] == SOURCE_CLOSURE,
                'Current package is not the reviewed runtime')
        sys.path.insert(0, str(ROOT / 'campaign-unity/Tools'))
        from build_web import source_binding
        source = source_binding()
        require(source['head'] == manifest['source']['sourceHead'], 'Current source HEAD differs')
        closure = source['closure']
        require(closure['sha256'] == SOURCE_CLOSURE, 'Current production source differs from runtime')
        web_docs = ROOT / 'campaign-unity/docs/last-stand-web'
        for name, field in (('source-lock.json', 'sourceLockSha256'),
                            ('receipt-sanitized.json', 'receiptSha256')):
            assert_pin(web_docs / name, manifest['source'][field])
        require(read_json(web_docs / 'source-lock.json')['closure'] == closure,
                'Complete source closure differs')
        leaves = dict(manifest['files'], **{'index.html': manifest['wrapperSha256'],
                      'asset-manifest.json': sha(PAYLOAD / 'asset-manifest.json')})
        require(len(leaves) == 18, 'Expected exact eighteen package leaves')
        for name, expected in leaves.items():
            assert_pin(PAYLOAD / name, expected)
            fetch_exact('/last-stand/' + name, PAYLOAD / name)
        fetch_exact('/last-stand/', PAYLOAD / 'index.html')
        # Current local root-base preview serves the parent SPA on this alias.
        # Verify its actual body; do not advertise it as a valid game alias.
        for route in ('/', '/singedTerra/', '/singedTerra/last-stand/'):
            fetch_exact(route, PREVIEW_DIST / 'index.html')
        require(sha(PREVIEW_DIST / 'index.html') != sha(PAYLOAD / 'index.html'),
                'Parent and dedicated game wrappers must remain distinct')
        assert_delivery_receipt(leaves)

    def test_shop_review_packet_and_actual_acceptance(self):
        assert_review_material()
        assert_owner_acceptance()


if __name__ == '__main__':
    unittest.main()
