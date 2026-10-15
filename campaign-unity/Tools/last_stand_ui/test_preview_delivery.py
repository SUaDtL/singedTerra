"""Read-only proof of the actual owned preview and its honest review packet.

Run: C:/Python314/python.exe -m unittest discover -s
campaign-unity/Tools/last_stand_ui -p test_preview_delivery.py -v
No browser storage, process or served file is changed by verification.
"""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unittest
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
PAYLOAD = ROOT / 'client/public/last-stand'
PACKET = ROOT / 'campaign-unity/docs/last-stand-ui/preview-review.md'
OUT = Path('C:/Users/brenn/codearbiter-review-integration-20261006')
PREVIEW_ROOT = OUT / 'localhost-preview-20261007T1054'
ORIGIN = 'http://127.0.0.1:5198'
GAME = ORIGIN + '/singedTerra/last-stand/'
PROFILES = {'approved-standard', 'approved-wide', 'approved-portrait',
            'approved-landscape', 'approved-compact'}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def regular(path):
    path = Path(path)
    require(path.is_file(), 'Required evidence file is absent: ' + str(path))
    require(all(not item.is_symlink() and not item.is_junction()
                for item in (path, *path.parents)), 'Linked evidence is not admitted')
    return path


def digest(path):
    with regular(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def contained(base, name):
    require(isinstance(name, str) and name and '\\' not in name
            and not Path(name).is_absolute()
            and all(part not in ('', '.', '..') for part in name.split('/')),
            'Evidence path escapes its declared root')
    path = base / name
    require(path.resolve().is_relative_to(base.resolve()), 'Evidence path escapes its declared root')
    return regular(path)


def read_json(path):
    try:
        return json.loads(regular(path).read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        raise AssertionError('Malformed retained evidence: ' + str(path)) from exc


def pinned(pin, base=OUT):
    path = Path(pin['path'])
    require(path.resolve().is_relative_to(base.resolve()), 'Evidence locator escapes its approved root')
    require(digest(path) == pin['sha256'], 'Retained evidence bytes changed: ' + str(path))
    return path


def inventory(folder):
    folder = Path(folder)
    require(folder.is_dir() and all(not p.is_symlink() and not p.is_junction()
            for p in (folder, *folder.parents)), 'Inventory root is absent or linked')
    return {p.relative_to(folder).as_posix(): digest(p)
            for p in sorted(folder.rglob('*')) if p.is_file()}


def fetch_file(url, expected, mime):
    require(urlsplit(url).scheme == 'http' and urlsplit(url).netloc == '127.0.0.1:5198',
            'Preview verification is restricted to the owned loopback origin')
    try:
        with urlopen(Request(url, headers={'Cache-Control': 'no-cache', 'Accept-Encoding': 'identity'}),
                     timeout=30) as response:
            require(response.status == 200 and response.geturl() == url, 'Redirect or non-file HTTP response')
            header = response.headers.get('Content-Type')
            actual_mime = header.split(';', 1)[0].strip().lower() if header else None
            require(actual_mime in mime, 'Wrong MIME or SPA fallback for ' + url + ': ' + str(actual_mime))
            value = hashlib.sha256(response.read()).hexdigest()
            require(value == expected, 'HTTP bytes differ from approved packaged file: ' + url)
    except OSError as exc:
        raise AssertionError('Loopback file request failed: ' + url) from exc


def mime_for(name):
    if name.endswith('/'):
        return {'text/html'}
    suffix = Path(name).suffix
    return {'.js': {'text/javascript', 'application/javascript'}, '.wasm': {'application/wasm'},
            # The unchanged owned Vite static handler emits no Content-Type for
            # Unity .data; retain that actual binary response, never a SPA HTML body.
            '.data': {None, 'application/octet-stream'}, '.png': {'image/png'},
            '.ico': {'image/x-icon', 'image/vnd.microsoft.icon'}, '.css': {'text/css'},
            '.svg': {'image/svg+xml'}, '.webp': {'image/webp'}, '.json': {'application/json'},
            '.html': {'text/html'}}[suffix]


def package():
    binding = read_json(ROOT / 'campaign-unity/docs/last-stand-ui/ui-native-binding.json')
    manifest = read_json(PAYLOAD / 'asset-manifest.json')
    require(digest(PAYLOAD / 'asset-manifest.json') == binding['package']['manifestSha256']
            and digest(PAYLOAD / 'index.html') == manifest['wrapperSha256'] == binding['package']['wrapperSha256'],
            'Current export/package binding is stale')
    require(manifest['files'] == binding['package']['files'], 'Packaged runtime leaves differ')
    for name, expected in manifest['files'].items():
        require(digest(contained(PAYLOAD, name)) == expected, 'Packaged runtime bytes changed')
    return binding, manifest


def listener_snapshot():
    script = """$ErrorActionPreference='Stop';
$listener=@(Get-NetTCPConnection -LocalPort 5198 -State Listen);
if($listener.Count -ne 1){throw 'Expected one owned listener'};
$process=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$listener[0].OwningProcess);
@{pid=$process.ProcessId;created=$process.CreationDate.ToUniversalTime().ToString('o');
executable=$process.ExecutablePath;command=$process.CommandLine;parent=$process.ParentProcessId;
host=$listener[0].LocalAddress;port=$listener[0].LocalPort}|ConvertTo-Json -Compress"""
    run = subprocess.run(['C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
                          '-NoProfile', '-NonInteractive', '-Command', script],
                         capture_output=True, text=True, timeout=30)
    require(run.returncode == 0, 'Live preview ownership observation failed: ' + run.stderr)
    return json.loads(run.stdout)


def assert_owner(live, expected):
    for field in ('pid', 'executable', 'command', 'parent', 'host', 'port'):
        require(live[field] == expected[field], 'Owned preview identity differs: ' + field)
    require(datetime.fromisoformat(live['created']) == datetime.fromisoformat(expected['created']),
            'Owned preview process creation time differs')


def delivery_record():
    require(PACKET.is_file(), 'The actual source-bound owner review packet has not been delivered')
    text = regular(PACKET).read_text(encoding='utf-8')
    blocks = re.findall(r'```json\n(.*?)\n```', text, re.S)
    require(len(blocks) == 1, 'Exactly one unambiguous preview delivery locator is required')
    locator = json.loads(blocks[0])
    require(locator.get('schema') == 'singedterra-preview-review/v1', 'Unknown owner packet schema')
    record = read_json(pinned(locator['deliveryRecord']))
    require(record.get('schema') == 'singedterra-ui-preview-delivery/v1'
            and record['authority'] == 'ordinary-evidence-only', 'Delivery record grants no native authority')
    return record, text


def assert_review(record, text):
    require(record['fullLoop']['status'] in ('pending', 'red', 'pass'), 'Whole-loop outcome is unknown')
    require(record['overallReadiness'] == 'pending', 'Preview availability cannot confer overall readiness')
    require(record['ownerAcceptance'] == {'ui': 'pending', 'battlefield': 'pending',
            'motion': 'pending', 'listening': 'pending', 'wholeFeature': 'pending'},
            'Unobserved owner visual/motion/listening acceptance was inferred')
    if record['fullLoop']['status'] != 'pending':
        result = read_json(pinned(record['fullLoop']['result']))
        require(result['status'] == record['fullLoop']['status'], 'Full-loop result was relabelled')
    require('Overall playable-loop readiness remains blocked' in text
            and 'Owner visual, motion and listening decisions remain pending' in text,
            'The user-facing packet omits the readiness or subjective-acceptance boundary')
    for pin in record['preservedHistoricalEvidence']:
        pinned(pin)
    review = record['reviewEvidence']
    require(review['status'] == 'complete', 'Current matched phase/profile images and normal-speed movies are pending')
    rows = review['screenshots']
    pairs = {(row['phase'], row['profile']) for row in rows}
    require(pairs == {(phase, profile) for phase in ('garage', 'battle', 'defeat', 'workshop', 'recovery')
                     for profile in PROFILES}, 'Incomplete current matched phase/profile matrix')
    require(len(rows) == len(pairs), 'Duplicate matched review evidence')
    for row in rows + review['movies']:
        require(row['runtimeManifestSha256'] == record['package']['manifestSha256'],
                'Substituted or historical review media was labelled current')
        pinned(row)
    require(review['movies'] and all(row['playbackSpeed'] == 1 for row in review['movies']),
            'Normal-speed motion evidence is absent or retimed')
    require(review['audio']['status'] in ('measured', 'unmeasured'), 'Rendered audio status is missing')


class PreviewDeliveryTests(unittest.TestCase):
    def __str__(self):
        owner = type(self)
        return f'{self._testMethodName} ({owner.__module__}.{owner.__qualname__})'

    def test_served_wrapper_and_manifest_match(self):
        _, manifest = package()
        fetch_file(GAME, manifest['wrapperSha256'], {'text/html'})
        fetch_file(GAME + 'asset-manifest.json', digest(PAYLOAD / 'asset-manifest.json'), {'application/json'})
        record, _ = delivery_record()
        assert_owner(listener_snapshot(), record['owner'])
        require(record['servedRoot'] == str(PREVIEW_ROOT / 'dist'), 'Unexpected owned served root')
        require(record['previousRoot'] != record['servedRoot']
                and Path(record['previousRoot']).parent == PREVIEW_ROOT, 'Rollback root is not an owned sibling')
        require(inventory(record['previousRoot']) == record['previousInventory'],
                'The previous served copy is no longer exactly recoverable')
        for name, expected in record['appHttpFiles'].items():
            fetch_file(urljoin(ORIGIN, name), expected, mime_for(name))
        require('/singedTerra/' in record['appHttpFiles'] and len(record['appHttpFiles']) > 4,
                'Parent Return app entry and its actual asset graph were not verified')

    def test_served_runtime_bytes_match(self):
        _, manifest = package()
        for name, expected in manifest['files'].items():
            fetch_file(GAME + quote(name, safe='/'), expected, mime_for(name))
        require(len(manifest['files']) == 16, 'Runtime and TemplateData inventory is incomplete')

    def test_review_packet_preserves_honest_outcomes(self):
        binding, _ = package()
        record, text = delivery_record()
        require(record['package'] == binding['package'], 'Review packet names another runtime/package')
        require(record['rawReceiptSha256'] == binding['export']['rawReceiptSha256']
                and record['sourceClosureSha256'] == binding['export']['sourceClosureSha256'],
                'Review packet is detached from its actual export/source')
        assert_review(record, text)


if __name__ == '__main__':
    unittest.main()
