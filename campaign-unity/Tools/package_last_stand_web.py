"""Freeze and stage one complete source-bound Last Stand export; preserve history."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys
import uuid

sys.dont_write_bytecode = True
from build_web import source_binding, toolchain_binding, inventory_digest
from make_web_entry import render_web_entry


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def stop(message):
    raise SystemExit(message)


def artifacts(root):
    result = {}
    for path in root.rglob('*'):
        if path.is_symlink() or path.is_junction():
            stop('Linked export/staged input')
        if path.is_dir():
            continue
        if not path.is_file():
            stop('Non-regular export/staged input')
        result[path.relative_to(root).as_posix()] = digest(path)
    return dict(sorted(result.items()))


def validate_export(record, repo, allow_wrapper_refresh=False):
    root = repo / 'campaign-unity'
    if (record.get('schema') != 'singedterra-last-stand-build/v2' or record.get('status') != 'pass'
            or record.get('scene') != 'Assets/Scenes/LastStandPrototype.unity'
            or record.get('source_before') != record.get('source_after')):
        stop('Fresh complete source export receipt required')
    source = record['source_after']
    current = source_binding(root)
    if current['closure'] != source.get('closure'):
        stop('Current source inventory differs from the exported source inventory')
    if not allow_wrapper_refresh and current['wrapperFiles'] != source.get('wrapperFiles'):
        stop('Current source wrapper inventory differs from exported wrapper inputs')
    if (record.get('toolchain_before') != record.get('toolchain_after')
            or not record.get('toolchain_before', {}).get('files')):
        stop('Complete matching toolchain before/after required')
    if (record.get('scene_before') != record.get('scene_after')
            or record.get('protected_scenes_before') != record.get('protected_scenes_after')
            or not any(stage.get('stage') == 'unity-web' and stage.get('exit') == 0 for stage in record.get('stages', []))):
        stop('Saved-scene and genuine export stages must pass unchanged')
    editor = Path(record.get('editor', ''))
    if not editor.is_file() or toolchain_binding(editor) != record['toolchain_after']:
        stop('Current toolchain inventory differs from exported toolchain')
    return source


def refresh_wrapper(receipt, record, repo, binding):
    """Reuse verified runtime; never rewrite original export evidence or source lock."""
    destination = repo / 'client/public/last-stand'
    docs = repo / 'campaign-unity/docs/last-stand-web'
    manifest = json.loads((destination / 'asset-manifest.json').read_text())
    sanitized = json.loads((docs / 'receipt-sanitized.json').read_text())
    if (manifest['source']['receiptSha256'] != digest(docs / 'receipt-sanitized.json')
            or manifest['source']['sourceLockSha256'] != digest(docs / 'source-lock.json')
            or sanitized.get('rawReceiptSha256') != digest(receipt)):
        stop('Original export evidence pin differs')
    runtime = {name: value for name, value in record['artifacts'].items() if name != 'index.html'}
    staged = artifacts(destination)
    if (manifest['files'] != runtime or {name:value for name,value in staged.items() if name not in ('index.html','asset-manifest.json')} != runtime
            or staged.get('index.html') != manifest.get('wrapperSha256')):
        stop('Staged runtime or existing wrapper differs; no refresh performed')
    wrapper = render_web_entry(Path(record['build']), 'last-stand', repo / 'campaign-unity')
    wrapper = wrapper.replace('</head>', '<link rel="icon" href="TemplateData/favicon.ico">\n</head>')
    wrapper_hash = hashlib.sha256(wrapper.encode('utf-8')).hexdigest()
    current = source_binding(repo / 'campaign-unity')
    plan = {'schema':'singedterra-last-stand-wrapper-refresh/v1', 'rawReceiptSha256':digest(receipt),
            'previousManifestSha256':digest(destination/'asset-manifest.json'),
            'destinationFiles':['index.html','asset-manifest.json'], 'runtimeFiles':runtime,
            'sourceInventorySha256':binding['closure']['sha256'],
            'wrapperFiles':current['wrapperFiles'], 'wrapperSha256':wrapper_hash}
    # New append-only evidence is frozen before either destination write.
    target = receipt.parent / ('wrapper-refresh-' + uuid.uuid4().hex + '.json')
    with target.open('x',encoding='utf-8',newline='\n') as stream:
        stream.write(json.dumps(plan,indent=2)+'\n')
    manifest['wrapperFiles']=current['wrapperFiles']; manifest['wrapperSha256']=wrapper_hash
    (destination/'index.html').write_text(wrapper,encoding='utf-8',newline='\n')
    (destination/'asset-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print('Refreshed wrapper only; original evidence unchanged: '+str(target))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--refresh-wrapper', action='store_true', help='Refresh only authored wrapper with append-only evidence')
    parser.add_argument('--freeze-only', action='store_true', help='Record exact staged names/hashes before copying')
    parser.add_argument('--stage-plan', type=Path, help='Consume the unchanged frozen destination plan')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    receipt = args.receipt.resolve()
    if not receipt.is_relative_to(repo / 'campaign-unity/Evidence') or receipt.is_symlink():
        stop('Expected a task-owned Web build receipt')
    record = json.loads(receipt.read_text(encoding='utf-8'))
    binding = validate_export(record, repo, allow_wrapper_refresh=args.refresh_wrapper)
    source = Path(record['build']).resolve()
    if not source.is_relative_to(repo / 'campaign-unity/Builds') or not source.is_dir():
        stop('Expected a fresh task-owned export')
    expected = dict(sorted(record['artifacts'].items()))
    if artifacts(source) != expected:
        stop('Export bytes differ from the source-bound build receipt')
    if args.refresh_wrapper:
        if args.freeze_only or args.stage_plan:
            stop('Wrapper refresh cannot consume or replace original staging plan')
        refresh_wrapper(receipt, record, repo, binding)
        return
    runtime = {name: value for name, value in expected.items() if name != 'index.html'}
    if not runtime or any(not re.fullmatch(r'(?:Build|TemplateData)/[A-Za-z0-9_.-]+', name) for name in runtime):
        stop('Receipt enumerates unexpected runtime paths')
    destination = repo / 'client/public/last-stand'
    wrapper = render_web_entry(source, 'last-stand', repo / 'campaign-unity')
    wrapper = wrapper.replace('</head>', '<link rel="icon" href="TemplateData/favicon.ico">\n</head>')
    wrapper_hash = hashlib.sha256(wrapper.encode('utf-8')).hexdigest()
    plan = {'schema': 'singedterra-last-stand-stage/v2', 'receiptSha256': digest(receipt),
            'destination': 'client/public/last-stand', 'files': runtime,
            'wrapperSha256': wrapper_hash, 'sourceInventorySha256': binding['closure']['sha256'],
            'previousFiles': artifacts(destination) if destination.exists() else {}}
    if any(name not in ('index.html', 'asset-manifest.json') and not re.fullmatch(r'(?:Build|TemplateData)/[A-Za-z0-9_.-]+', name) for name in plan['previousFiles']):
        stop('Unexpected existing staged file; preserve it and inspect before replacement')
    if args.freeze_only:
        if args.stage_plan:
            stop('Choose freeze or consume, not both')
        target = receipt.parent / 'staging-plan.json'
        if target.exists():
            stop('Staging plan already exists; preserve the frozen plan')
        target.write_text(json.dumps(plan, indent=2) + '\n', encoding='utf-8', newline='\n')
        print('Frozen destination names at ' + str(target))
        return
    if args.stage_plan is None:
        stop('Freeze exact destination names with --freeze-only before copying')
    frozen = args.stage_plan.resolve()
    if frozen != receipt.parent / 'staging-plan.json' or json.loads(frozen.read_text(encoding='utf-8')) != plan:
        stop('Frozen staging plan or destination changed; no copy performed')
    # Everything above is read-only. Copy only enumerated export leaves, and
    # remove only old enumerated staged leaves. Historical Builds/Evidence stay.
    destination.mkdir(parents=True, exist_ok=True)
    for name in runtime:
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((source / name).read_bytes())
        if digest(target) != runtime[name]:
            stop('Staged copy mismatch: ' + name)
    for name in plan['previousFiles']:
        if name not in runtime and name not in ('index.html', 'asset-manifest.json'):
            (destination / name).unlink()
    (destination / 'index.html').write_text(wrapper, encoding='utf-8', newline='\n')
    toolchain = record['toolchain_after']
    sanitized = {'schema': 'singedterra-last-stand-export/v2', 'complete': True, 'status': 'pass',
                 'build': source.name, 'scene': record['scene'], 'sourceHead': binding['head'],
                 'sourceBeforeSha256': record['source_before']['closure']['sha256'],
                 'sourceAfterSha256': binding['closure']['sha256'], 'sourceFiles': binding['closure']['files'],
                 'wrapperFiles': binding['wrapperFiles'], 'toolchain': toolchain, 'artifacts': expected,
                 'wrapperSha256': wrapper_hash, 'rawReceiptSha256': digest(receipt),
                 'evidence': receipt.relative_to(repo).as_posix(), 'approvedArtifacts': record['approved_artifacts'],
                 'sceneBeforeSha256': record['scene_before'], 'sceneAfterSha256': record['scene_after'],
                 'protectedScenesBefore': record['protected_scenes_before'],
                 'protectedScenesAfter': record['protected_scenes_after'], 'stages': record['stages']}
    docs = repo / 'campaign-unity/docs/last-stand-web'; docs.mkdir(parents=True, exist_ok=True)
    sanitized_path = docs / 'receipt-sanitized.json'
    sanitized_path.write_text(json.dumps(sanitized, indent=2) + '\n', encoding='utf-8', newline='\n')
    vendor = 'Unity/Packages/com.unity.render-pipelines.universal'
    vendor_files = {name: entry for name, entry in binding['closure']['files'].items() if name.startswith(vendor + '/')}
    lock = {'schema': 'singedterra-last-stand-source/v2', 'complete': True, 'closure': binding['closure'],
            'wrapperFiles': binding['wrapperFiles'], 'toolchain': toolchain, 'receiptSha256': digest(sanitized_path),
            'vendor': {'path': vendor, 'version': '17.3.0', 'sha256': inventory_digest(vendor_files)},
            'policy': {'runtimeRoots': 'All present Assets, ProjectSettings and Packages files including ignored URP; additions fail',
                       'exportTools': 'build_web.py imports unity_shader_log.py and unity_build_resources.py; other imports are stdlib',
                       'wrapper': 'build_web.py executes make_web_entry.py, which reads web-index-template.html; separately bound',
                       'excluded': 'Test/verifier/browser drivers and mutable native governance do not affect exported Unity bytes',
                       'absentVendor': 'Admitted only through this locally inspected complete receipt pin; absent bytes not inspected by CI',
                       'toolchain': 'Local before/after editor, full WebGLSupport, installed URP and Python executable raw hashes; CI does not inspect absent toolchain'}}
    lock_path = docs / 'source-lock.json'
    lock_path.write_text(json.dumps(lock, indent=2) + '\n', encoding='utf-8', newline='\n')
    manifest = {'schema': 'singedterra-last-stand-web/v1', 'source': {
        'build': source.name, 'receipt': sanitized_path.relative_to(repo).as_posix(), 'receiptSha256': digest(sanitized_path),
        'sourceLockSha256': digest(lock_path), 'sourceHead': binding['head'],
        'sourceInventorySha256': binding['closure']['sha256'], 'originalIndexSha256': expected['index.html']},
        'wrapperSha256': wrapper_hash, 'wrapperFiles': binding['wrapperFiles'], 'files': runtime}
    (destination / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('Staged verified Last Stand Web export at ' + str(destination))


if __name__ == '__main__':
    main()
