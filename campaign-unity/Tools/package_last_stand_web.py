"""Stage one receipt-verified Last Stand Web export for the normal site build."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil

from make_web_entry import render_web_entry


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--refresh-wrapper', action='store_true',
                        help='Update only the authored site wrapper around unchanged export assets')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    receipt = args.receipt.resolve()
    if not receipt.is_relative_to(repo / 'campaign-unity/Evidence'):
        raise SystemExit('Expected a task-owned Web build receipt')
    record = json.loads(receipt.read_text(encoding='utf-8'))
    source = Path(record['build']).resolve()
    if (record['status'] != 'pass' or
            record['scene'] != 'Assets/Scenes/LastStandPrototype.unity' or
            not source.is_relative_to(repo / 'campaign-unity/Builds') or
            record['source_before'] != record['source_after']):
        raise SystemExit('Receipt does not bind a passing Last Stand export')
    expected = record['artifacts']
    actual = {file.relative_to(source).as_posix(): digest(file)
              for file in source.rglob('*') if file.is_file()}
    if actual != expected:
        raise SystemExit('Export bytes differ from the source-bound build receipt')
    destination = repo / 'client/public/last-stand'
    if destination.exists():
        if not args.refresh_wrapper:
            raise SystemExit('Staged payload already exists; inspect before replacing')
        staged = {file.relative_to(destination).as_posix(): digest(file)
                  for file in destination.rglob('*') if file.is_file()
                  and file.name not in ('index.html', 'asset-manifest.json')}
        if staged != {name: value for name, value in expected.items() if name != 'index.html'}:
            raise SystemExit('Staged runtime assets differ from the verified export')
    elif args.refresh_wrapper:
        raise SystemExit('No staged payload to refresh')
    else:
        shutil.copytree(source, destination)
    wrapper = render_web_entry(destination, 'last-stand', repo / 'campaign-unity')
    wrapper = wrapper.replace('</head>', '<link rel="icon" href="TemplateData/favicon.ico">\n</head>')
    (destination / 'index.html').write_text(wrapper, encoding='utf-8', newline='\n')
    manifest = {
        'schema': 'singedterra-last-stand-web/v1',
        'source': {
            'build': source.name,
            'receipt': receipt.relative_to(repo).as_posix(),
            'receiptSha256': digest(receipt),
            'sourceHead': record['source_before']['head'],
            'sourceInventorySha256': record['source_before']['sha256'],
            'originalIndexSha256': expected['index.html'],
        },
        'wrapperSha256': digest(destination / 'index.html'),
        'files': {name: value for name, value in sorted(expected.items()) if name != 'index.html'},
    }
    (destination / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n',
                                                       encoding='utf-8', newline='\n')
    print('Staged verified Last Stand Web export at ' + str(destination))


if __name__ == '__main__':
    main()
