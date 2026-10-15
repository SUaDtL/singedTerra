"""Check gallery metadata URL boundaries in an owned local Chrome instance.

From campaign-unity, use:
    python docs/visual-review-01/verify_gallery_urls.py docs/visual-review-01/browser-<stamp>/index.html
Optional --revision reads the same gallery from an immutable Git revision for red proof.
Fixtures and receipts remain under ignored Evidence; the supplied package is read-only.
"""
from pathlib import Path
import argparse
import copy
import datetime
import hashlib
import html
import json
import re
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT / 'Tools'))
from native_chrome import NativeChrome
from playwright.sync_api import sync_playwright

DATA = re.compile(r'(<script id="evidence-data" type="application/json">)(.*?)(</script>)', re.DOTALL)
SINKS = (
    ('comparison link', '#pair a.still', 'href', 'still'),
    ('comparison image', '#pair img', 'src', 'still'),
    ('motion video', '#clips video', 'src', 'motion'),
    ('frame metadata link', '#clips .card-foot a', 'href', 'metadata'),
    ('capture archive link', '#archive a', 'href', 'still'),
)
PREFIX = {'still': 'stills/', 'motion': 'motion/', 'metadata': 'metadata/'}
EXTENSION = {'still': '.png', 'motion': '.mp4', 'metadata': '.json'}
HOSTILE_LABEL = '<img data-gallery-injected="true" src="missing" onerror="document.documentElement.dataset.galleryExecuted=1">'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def hashes(directory):
    return {path.relative_to(directory).as_posix(): digest(path)
            for path in sorted(directory.rglob('*')) if path.is_file()}


def hostile_cases():
    cases = {
        'javascript scheme': "javascript:document.documentElement.dataset.galleryExecuted=1",
        'mixed-case scheme': "JaVaScRiPt:document.documentElement.dataset.galleryExecuted=1",
        'data document': 'data:text/html,%3Cscript%3Edocument.documentElement.dataset.galleryExecuted=1%3C/script%3E',
        'external HTTPS': 'https://gallery-regression.invalid/asset',
        'protocol-relative URL': '//gallery-regression.invalid/asset',
        'absolute local URL': 'file:///C:/gallery-regression-missing',
        'absolute path': '/gallery-regression-missing',
        'null value': None,
        'numeric value': 7,
        'object value': {'path': 'asset'},
    }
    for name, value in cases.items():
        yield name, {kind: value for kind in PREFIX}
    for name, stem in (
        ('parent traversal', '../gallery-regression-missing'),
        ('nested path', 'nested/gallery-regression-missing'),
        ('backslash traversal', '..\\gallery-regression-missing'),
        ('encoded traversal', '%2e%2e%2fgallery-regression-missing'),
        ('encoded backslash', '%2e%2e%5cgallery-regression-missing'),
        ('double-encoded traversal', '%252e%252e%252fgallery-regression-missing'),
        ('markup in filename', 'asset" onerror="document.documentElement.dataset.galleryExecuted=1'),
        ('leading whitespace', ' asset'),
        ('control character', 'asset\nname'),
        ('trailing stem newline', 'asset\n'),
    ):
        yield name, {kind: prefix + stem + EXTENSION[kind] for kind, prefix in PREFIX.items()}
    yield 'query suffix', {kind: prefix + 'asset' + EXTENSION[kind] + '?other=1' for kind, prefix in PREFIX.items()}
    yield 'fragment suffix', {kind: prefix + 'asset' + EXTENSION[kind] + '#other' for kind, prefix in PREFIX.items()}
    yield 'wrong extension', {kind: prefix + 'asset.html' for kind, prefix in PREFIX.items()}
    yield 'wrong directory', {kind: 'elsewhere/asset' + EXTENSION[kind] for kind in PREFIX}


def run(gallery, revision):
    gallery = gallery.resolve()
    if gallery.name != 'index.html' or not gallery.is_relative_to(ROOT / 'docs/visual-review-01'):
        raise ValueError('Supply a generated gallery index.html under docs/visual-review-01')
    package = gallery.parent
    before = hashes(package)
    relative = gallery.relative_to(REPO).as_posix()
    if revision:
        commit = subprocess.check_output(['git', 'rev-parse', '--verify', revision + '^{commit}'], cwd=REPO, text=True).strip()
        source = subprocess.check_output(['git', 'show', commit + ':' + relative], cwd=REPO)
    else:
        commit = None
        source = gallery.read_bytes()
    source_text = source.decode('utf-8')
    match = DATA.search(source_text)
    if not match:
        raise ValueError('Gallery has no supported embedded evidence metadata')
    original = json.loads(match.group(2))
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:6]
    output = ROOT / 'Evidence' / ('gallery-url-regression-' + stamp)
    output.mkdir(exist_ok=False)
    checks, errors, network_attempts = [], [], []
    report = {'status': 'running', 'gallery': str(gallery), 'revision': commit,
              'source_sha256': hashlib.sha256(source).hexdigest(), 'test_sha256': digest(Path(__file__)),
              'package_sha256': before, 'checks': checks, 'errors': errors,
              'blocked_network_attempts': network_attempts, 'server_started': False,
              'browser_mode': 'owned-headless-new-no-overrides', 'owner_acceptance': False}
    native = None

    def check(value, name, detail=None):
        checks.append({'check': name, 'pass': bool(value), 'detail': detail})

    try:
        with sync_playwright() as playwright:
            try:
                native = NativeChrome(playwright, output, headless=True)
                report['browser_version'] = native.browser.version

                def refuse_network(route):
                    network_attempts.append(route.request.url)
                    route.abort('blockedbyclient')

                native.context.route(re.compile(r'^https?://'), refuse_network)
                page = native.context.pages[0]
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.set_viewport_size({'width': 1280, 'height': 720})
                for index, (name, values) in enumerate([('legitimate assets', None), *hostile_cases()]):
                    data = copy.deepcopy(original)
                    pair = next(pair for pair in data['pairs'] if pair['phase'] == 'early' and pair['fitting'] == 'repair')
                    data['pairs'] = [pair]
                    data['clips'] = [data['clips'][0]]
                    data['captures'] = [data['captures'][0]]
                    capture, clip = data['captures'][0], data['clips'][0]
                    if values is not None:
                        pair['left_asset'] = pair['right_asset'] = values['still']
                        clip['asset'], clip['metadata_asset'] = values['motion'], values['metadata']
                        capture['asset'] = values['still']
                    capture['path'] = HOSTILE_LABEL
                    data['provenance'] = HOSTILE_LABEL
                    encoded = json.dumps(data, ensure_ascii=True, allow_nan=False).replace('<', '\\u003c').replace('&', '\\u0026')
                    fixture = source_text[:match.start(2)] + encoded + source_text[match.end(2):]
                    base = html.escape(package.as_uri() + '/', quote=True)
                    fixture = fixture.replace('<title>', '<base href="' + base + '"><title>', 1)
                    fixture_path = output / ('case-' + str(index).zfill(2) + '.html')
                    fixture_path.write_bytes(fixture.encode('utf-8'))
                    page.goto(fixture_path.as_uri(), wait_until='domcontentloaded')
                    page.wait_for_function("document.querySelectorAll('#pair .card').length===2 && document.querySelectorAll('#clips video').length===1 && document.querySelectorAll('#archive a').length===1", timeout=5000)
                    expected = [pair['left_asset'], pair['left_asset'], clip['asset'], clip['metadata_asset'], capture['asset']]
                    for sink_index, (sink, selector, attribute, kind) in enumerate(SINKS):
                        actual = page.locator(selector).first.get_attribute(attribute)
                        wanted = expected[sink_index] if values is None else None
                        check(actual == wanted, name + ' / ' + sink,
                              {'attribute': attribute, 'expected': wanted, 'actual': actual, 'type': kind})
                    check(page.locator('#archive a').first.text_content() == HOSTILE_LABEL and
                          page.locator('#provenance').text_content() == HOSTILE_LABEL and
                          page.locator('[data-gallery-injected]').count() == 0 and
                          page.locator('html').get_attribute('data-gallery-executed') is None,
                          name + ' / hostile labels remain text without markup execution')
                check(not errors, 'no gallery script errors for valid or hostile metadata', errors)
                check(not network_attempts, 'metadata cannot request external resources', network_attempts)
                report['status'] = 'pass' if all(item['pass'] for item in checks) else 'failed'
            finally:
                if native is not None:
                    native.close()
    except BaseException as error:
        report.update(status='failed', error=type(error).__name__ + ': ' + str(error))
    finally:
        report['browser_closed'] = native is None or native.closed
        report['browser_forced'] = getattr(native, 'forced', False)
        report['package_unchanged'] = hashes(package) == before
        if not report['browser_closed'] or not report['package_unchanged']:
            report['status'] = 'failed'
        (output / 'result.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
        print(json.dumps({'status': report['status'], 'checks': len(checks),
                          'failed_checks': sum(not item['pass'] for item in checks), 'evidence': str(output),
                          'error': report.get('error'), 'browser_closed': report['browser_closed'],
                          'package_unchanged': report['package_unchanged']}, indent=2))
    return 0 if report['status'] == 'pass' else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gallery', type=Path)
    parser.add_argument('--revision', help='Read the gallery from this immutable Git revision for red proof')
    args = parser.parse_args()
    raise SystemExit(run(args.gallery, args.revision))
