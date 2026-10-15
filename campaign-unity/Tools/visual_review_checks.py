"""Pure evidence validation for ST-VIS-01; none of these helpers controls the game."""
from pathlib import Path
import hashlib
import json
import math
import re


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def artifact_hashes(directory):
    return {path.relative_to(directory).as_posix(): digest(path)
            for path in sorted(Path(directory).rglob('*')) if path.is_file()}


def load_build(root, receipt):
    root, receipt = Path(root).resolve(), Path(receipt).resolve()
    require(receipt.is_relative_to(root / 'Evidence'), 'Expected this project\'s build receipt')
    source = json.loads(receipt.read_text(encoding='utf-8'))
    build = Path(source['build']).resolve()
    require(source['status'] == 'pass' and build.is_relative_to(root / 'Builds'), 'Build has not passed')
    require(source.get('scene') == 'Assets/Scenes/BattlefieldReview.unity', 'Receipt is not the review scene')
    require(source.get('source_before') and source['source_before'] == source.get('source_after'),
            'Build does not bind one unchanged source inventory')
    require(source['scene_before'] == source['scene_after'], 'Saved scene changed during export')
    for relative, expected in source['source_after']['files'].items():
        if relative.startswith(('Unity/Assets/', 'Unity/ProjectSettings/', 'Unity/Packages/')):
            path = (root / relative).resolve()
            require(path.is_relative_to(root / 'Unity') and path.is_file() and digest(path) == expected,
                    'Current Unity source differs from build: ' + relative)
    require(artifact_hashes(build) == source['artifacts'], 'Build bytes differ from receipt')
    log = (receipt.parent / 'unity-web.log').read_text(encoding='utf-8', errors='replace')
    markers = {}
    for tag in ('ST_ENC_MODEL_PASS', 'ST_VIS_MODEL_PASS', 'ST_VIS_SCENE_PASS'):
        matches = re.findall(re.escape(tag) + r' (\{[^\r\n]+\})', log)
        require(len(matches) == 1, 'Expected exactly one ' + tag + ' receipt')
        markers[tag] = json.loads(matches[0])
    require(markers['ST_VIS_MODEL_PASS']['rules'] == 'review-pacing-v1', 'Wrong review profile')
    require(markers['ST_VIS_SCENE_PASS']['scene'] == 'BattlefieldReview', 'Wrong saved comparison scene')
    require('ST_VIS_CHECKS_PASS' in log, 'Missing complete visual editor checks')
    require('ST_VIS_HUD_PASS' in log, 'Missing actual HUD geometry and state checks')
    require(len(markers['ST_VIS_MODEL_PASS']['summaries']) == 2, 'Expected both fitting outcomes')
    return source, build, markers


def validate_ring(state):
    require(state['scene'] == 'BattlefieldReview' and state['profile'] == 'review-pacing-v1',
            'Wrong review scene or profile')
    require(state['width'] > 0 and state['height'] > 0, 'Invalid render dimensions')
    require(len(state['ring']) >= 32, 'Incomplete all-around approach ring')
    for point in state['ring']:
        require(all(math.isfinite(point[axis]) for axis in ('x', 'y', 'z')), 'Non-finite ring projection')
        require(.025 <= point['x'] <= .975 and .13 <= point['y'] <= .87 and point['z'] > 0,
                'Approach ring clipped or outside reserved combat area')
    return {'samples': len(state['ring']), 'minimum_x': min(p['x'] for p in state['ring']),
            'maximum_x': max(p['x'] for p in state['ring']),
            'minimum_y': min(p['y'] for p in state['ring']), 'maximum_y': max(p['y'] for p in state['ring'])}


def validate_pair(left, right):
    for state in (left, right):
        validate_ring(state)
        require(state['paused'] and bool(state['snapshot']), 'Comparison must contain a paused deployed snapshot')
    for field in ('scene', 'profile', 'snapshot', 'tick', 'width', 'height', 'fullEffects'):
        require(left[field] == right[field], 'Comparison changed ' + field)
    require({left['treatment'], right['treatment']} == {0, 1}, 'Expected both distinct treatments')
    fitting = left['snapshot'].split('|', 1)[0]
    require(fitting in ('True', 'False'), 'Snapshot is missing committed fitting')
    return {'tick': left['tick'], 'profile': left['profile'], 'fitting': 'launcher' if fitting == 'True' else 'repair',
            'width': left['width'], 'height': left['height'], 'fullEffects': left['fullEffects'],
            'snapshot_sha256': hashlib.sha256(left['snapshot'].encode()).hexdigest()}


def rectangle(item):
    values = [item[key] for key in ('x', 'y', 'width', 'height')]
    require(all(isinstance(value, (int, float)) and math.isfinite(value) for value in values),
            'Non-finite control rectangle')
    require(item['width'] > 0 and item['height'] > 0, 'Empty control rectangle')
    return values


def validate_layout(layout, battle):
    require(layout['coordinates'] == 'top-left', 'Unknown HUD coordinate convention')
    width, height = layout['width'], layout['height']
    require(width > 0 and height > 0, 'Invalid HUD dimensions')
    controls = [item for item in layout['controls'] if item['active']]
    names = [item['name'] for item in controls]
    require(len(names) == len(set(names)), 'Ambiguous active control names')
    required = {'SelectAsh', 'SelectIron', 'PauseEncounter', 'EncounterEffects', 'ReturnToInspection'} if battle else {'DeployEncounter', 'Attachment'}
    require(required.issubset(names), 'Missing controls for current mode')
    if battle:
        require(not {'Attachment', 'Preview', 'View', 'Motion'}.intersection(names), 'Inspection controls remain active in combat')
    for index, item in enumerate(controls):
        x, y, w, h = rectangle(item)
        require(x >= -.5 and y >= -.5 and x + w <= width + .5 and y + h <= height + .5,
                'Control clipped: ' + item['name'])
        require(bool(item['label'].strip()), 'Control has no readable label')
        for other in controls[index + 1:]:
            ox, oy, ow, oh = rectangle(other)
            overlap = min(x + w, ox + ow) - max(x, ox) > .5 and min(y + h, oy + oh) - max(y, oy) > .5
            require(not overlap, 'Controls overlap: ' + item['name'] + '/' + other['name'])
    return {'active_controls': names, 'width': width, 'height': height}


def pointer(layout, name, canvas):
    require(layout['coordinates'] == 'top-left', 'Unknown HUD coordinate convention')
    matches = [item for item in layout['controls'] if item['name'] == name and item['active'] and item['interactable']]
    require(len(matches) == 1, 'Expected one operable ' + name)
    x, y, width, height = rectangle(matches[0])
    require(x >= -.5 and y >= -.5 and x + width <= layout['width'] + .5 and y + height <= layout['height'] + .5,
            'Cannot target clipped control')
    return {'x': canvas['x'] + (x + width / 2) * canvas['width'] / layout['width'],
            'y': canvas['y'] + (y + height / 2) * canvas['height'] / layout['height']}


def validate_ring_clear_of_hud(state, layout):
    require((state['width'], state['height']) == (layout['width'], layout['height']),
            'HUD and projection came from different sizes')
    require(bool(layout.get('panels')), 'Missing combat panel geometry')
    for panel in layout['panels']:
        if not panel['active']:
            continue
        x, y, width, height = rectangle(panel)
        for point in state['ring']:
            px, py = point['x'] * state['width'], (1 - point['y']) * state['height']
            require(not (x <= px <= x + width and y <= py <= y + height),
                    'Approach ring obscured by ' + panel['name'])
    return {'panels': [panel['name'] for panel in layout['panels'] if panel['active']]}


def frame_durations(frames):
    require(len(frames) >= 2, 'Motion requires at least two real frames')
    timestamps = [frame['timestamp'] for frame in frames]
    require(all(math.isfinite(stamp) for stamp in timestamps), 'Non-finite screencast timestamp')
    durations = [later - earlier for earlier, later in zip(timestamps, timestamps[1:])]
    require(all(duration > 0 for duration in durations), 'Screencast timestamps must increase')
    return durations
