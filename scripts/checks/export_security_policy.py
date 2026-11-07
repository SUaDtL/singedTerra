"""Regenerate CI's policy projection through the selected installed native writer.

Usage: python -B scripts/checks/export_security_policy.py --plugin-root <installed-ca-codex-root>
The repository never selects an executable or parses native HTML policy data.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plugin-root', type=Path, required=True)
    args = parser.parse_args()
    plugin = args.plugin_root.resolve(strict=True)
    if not (plugin / '.codex-plugin/plugin.json').is_file():
        parser.error('Select an installed ca-codex package, not project code')
    sys.path.insert(0, str(plugin / 'hooks'))
    from _artifactlib import ArtifactClient, helper_installation

    root = Path(__file__).resolve().parents[2]
    client = ArtifactClient(root, helper_installation(str(plugin / 'hooks/_artifactlib.py')))
    artifact = 'CTX-SECURITY-CONTROLS'
    path = '.codearbiter/context/security-controls.html'
    before = client.call('identity', {'artifact_id': artifact})
    if before['path'] != path:
        raise RuntimeError('Unexpected native security-policy path')
    digest = hashlib.sha256((root / path).read_bytes()).hexdigest()
    records = []
    for entry in client.outline(artifact):
        if entry['kind'] != 'records' or entry.get('retired'):
            continue
        record = client.call('read', {'artifact_id': artifact, 'symbol': entry['id'], 'mode': 'exact', 'budget': 65536})['record']
        if not isinstance(record.get('statement'), str) or not record['statement'].strip():
            raise RuntimeError('Native policy record has no statement')
        records.append({'id': record['id'], 'statement': record['statement']})
    after = client.call('identity', {'artifact_id': artifact})
    if not records or before != after or digest != hashlib.sha256((root / path).read_bytes()).hexdigest():
        raise RuntimeError('Native policy changed during export, or contains no active records')
    receipt = {
        'schema': 'singedterra.security-policy-export/v1',
        'source': {'path': path, 'sha256': digest},
        'artifactId': artifact, 'modelSha256': before['model_sha256'],
        'revision': before['revision'],
        'generatedBy': 'scripts/checks/export_security_policy.py via installed ArtifactClient native reads',
        'owner': 'Generated validation input; edit native knowledge through its writer, then regenerate.',
        'records': records,
    }
    target = root / 'scripts/checks/fixtures/security-controls-policy.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(receipt, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Exported {len(records)} native policy records; source SHA-256 {digest}')


if __name__ == '__main__':
    main()
