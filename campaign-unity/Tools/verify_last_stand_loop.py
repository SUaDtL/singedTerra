"""One source-bound Last Stand Web build and normal-speed real-pointer loop."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from array import array
import base64
import datetime
import json
import math
import os
import statistics
import struct
import subprocess
import threading
import time
import unittest
import uuid
import zlib

from input_observer import install as observe_input, validate as validate_input
from native_chrome import NativeChrome
from visual_review_checks import artifact_hashes, digest, pointer, require
from visual_review_motion import MotionCapture

ROOT = Path(__file__).resolve().parents[1]
EDITOR = Path('C:/Users/brenn/singedTerra-engine-lab/tools/unity-6000.3.24f1/Editor/Unity.exe')
EVIDENCE = ROOT / 'Evidence' / 'last-stand-playable-loop' / 't03'
SAVE_KEY = 'singedTerra.lastStand.prototype.v1'
SPEC = {'revision': 4, 'model_sha256': '0fce3f7b2eb7f6743b3b5c5960b8fdece577c884403710bca32ea84427ddf1df',
        'normative_sha256': '58b5ecaec95493a38751a65320949dd846716b86abf46a6cab82a62161b694aa'}
PLAN = {'revision': 6, 'model_sha256': 'f912cf6d951328966555e3c2f9511fcaca3bbefc5c21d04de7c896f1920a7304',
        'normative_sha256': 'b8a8dd6156609bb6c14d5ce45ce34c8fb4124d37af806b240741e90e640f00b1'}


def _shop_png(path):
    """Decode the retained browser PNG directly; no new imaging dependency."""
    data = Path(path).read_bytes()
    require(data[:8] == b'\x89PNG\r\n\x1a\n', 'Expected actual screenshot PNG')
    offset, compressed, header = 8, bytearray(), None
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind, body = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        require(zlib.crc32(kind + body) & 0xffffffff == struct.unpack('>I', data[offset + 8 + length:offset + 12 + length])[0],
                'Screenshot PNG chunk corruption')
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif kind == b'IDAT':
            compressed.extend(body)
        offset += length + 12
        if kind == b'IEND':
            break
    require(header is not None and header[2] == 8 and header[3] in (2, 6) and header[4:] == (0, 0, 0),
            'Screenshot must be ordinary 8-bit RGB/RGBA PNG')
    width, height = header[:2]
    require(0 < width <= 4096 and 0 < height <= 4096, 'Screenshot dimensions exceed declared profiles')
    channels = 3 if header[3] == 2 else 4
    stride = width * channels
    raw = zlib.decompress(compressed)
    require(len(raw) == (stride + 1) * height, 'Screenshot pixel payload is incomplete')
    decoded, previous = bytearray(), bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        method, row = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        require(method in range(5), 'Unknown PNG filter')
        for x in range(stride):
            a, b, c = (row[x - channels] if x >= channels else 0), previous[x], (previous[x - channels] if x >= channels else 0)
            if method == 1:
                value = a
            elif method == 2:
                value = b
            elif method == 3:
                value = (a + b) // 2
            elif method == 4:
                p = a + b - c
                distances = (abs(p - a), abs(p - b), abs(p - c))
                value = (a, b, c)[distances.index(min(distances))]
            else:
                value = 0
            row[x] = (row[x] + value) & 255
        decoded.extend(row)
        previous = row

    def pixel(x, y):
        require(type(x) is int and type(y) is int and 0 <= x < width and 0 <= y < height, 'Pixel outside actual screenshot')
        position = (y * width + x) * channels
        return list(decoded[position:position + 3])
    return width, height, pixel


def _shop_contrast(left, right):
    def luminance(rgb):
        require(len(rgb) == 3 and all(type(c) is int and 0 <= c <= 255 for c in rgb), 'Invalid rendered RGB sample')
        channels = [c / 255 for c in rgb]
        return sum((c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4) * weight
                   for c, weight in zip(channels, (.2126, .7152, .0722)))
    a, b = luminance(left), luminance(right)
    return (max(a, b) + .05) / (min(a, b) + .05)


def _shop_normal_text_contrast(left, right):
    ratio = _shop_contrast(left, right)
    require(ratio >= 4.5, 'Actual rendered contrast is below 4.5:1')
    return ratio


def _verify_shop_frame_pixels(frame, graphics, directory):
    path = (Path(directory) / frame['file']).resolve()
    require(path.is_relative_to(Path(directory).resolve()) and digest(path) == frame['sha256'], 'Unbound rendered screenshot')
    width, height, pixel = _shop_png(path)
    viewport = frame['viewport']
    require((width, height) == (viewport['width'], viewport['height']), 'Screenshot is not at the declared CSS viewport scale')
    expected = {g['path']: g for g in graphics if g['active'] and g['kind'] == 'Text' and g['text'].strip()}
    measurements = frame['texts']
    require(len(measurements) == len(expected) and {t['path'] for t in measurements} == set(expected), 'Rendered text omitted from measurement')
    visible = set()
    for text in measurements:
        graphic = expected[text['path']]
        require(text['text'] == graphic['text'] and text['font_css'] == graphic['fontCssSize'], 'Rendered copy/font differs from full graphics')
        require(text['font_css'] >= 14 - .01, 'Rendered text is below 14 CSS pixels')
        if not text['full']:
            continue
        visible.add(text['path'])
        require(text['preferred_height_css'] == graphic['preferredHeightCss']
                and text['preferred_height_css'] <= text['box']['height'] + 1, 'Rendered text is vertically truncated')
        contrast = text.get('contrast', {})
        require(contrast.get('core_pixels', 0) >= 3 and contrast.get('background_regions', 0) > 0,
                'Absent or insufficient actual glyph/background evidence')
        foreground, background = contrast.get('foreground', {}), contrast.get('background', {})
        box = text['box']
        for sample in (foreground, background):
            require(all(k in sample for k in ('x', 'y', 'rgb')) and sample['rgb'] == pixel(sample['x'], sample['y']),
                    'Text contrast sample differs from retained screenshot pixels')
            require(box['x'] <= sample['x'] < box['x'] + box['width'] and box['y'] <= sample['y'] < box['y'] + box['height'],
                    'Text sample lies outside its actual rendered region')
        target = [255 * graphic['color'][k] * graphic['tint'][k] for k in ('r', 'g', 'b')]
        require(math.dist(foreground['rgb'], target) <= 28, 'Selected pixel is not an actual glyph core')
        anchor = background.get('anchor', {})
        require(set(anchor) == {'x', 'y'} and abs(anchor['x'] - background['x']) <= 6 and abs(anchor['y'] - background['y']) <= 6
                and math.dist(pixel(anchor['x'], anchor['y']), target) <= 28, 'Background is detached from an actual local glyph')
        patch = [pixel(x, y) for y in range(background['y'] - 1, background['y'] + 2)
                 for x in range(background['x'] - 1, background['x'] + 2)]
        require(background.get('patch') == patch and all(max(p[c] for p in patch) - min(p[c] for p in patch) <= 10 for c in range(3)),
                'Background sample is an antialiasing edge or lacks actual 3x3 evidence')
        ratio = _shop_normal_text_contrast(foreground['rgb'], background['rgb'])
        require(abs(ratio - contrast.get('ratio', 0)) < 1e-8 and ratio >= 4.5, 'Actual rendered contrast is below 4.5:1')
    return visible


def verify_shop_presentation(report, directory):
    """Bind rendered pixels, live geometry, input and economy to the real run."""
    presentation = report.get('presentation', {})
    require(presentation.get('frames'), 'Actual five-layout Shop frames are absent')
    verify_shop_vertical(report)
    require(presentation.get('schema') == 'singedterra-shop-presentation/v1' and presentation.get('owner_acceptance') is False,
            'Presentation is not a current observer or claims owner acceptance')
    viewports = {(1920, 1080), (1366, 768), (720, 640), (390, 844), (844, 390)}
    require({tuple(x) for x in presentation['viewports']} == viewports, 'Missing approved viewport')
    records = report['records']
    layouts = {row['seq']: row for row in records['controlsOnly']}
    states = {row['seq']: row for row in records['shopStates']}
    loops = {row['seq']: row for row in records['states']}
    groups, pixels_seen = {}, {}
    for frame in presentation['frames']:
        profile = (frame['viewport']['width'], frame['viewport']['height'])
        phase, category = frame['phase'], frame['category']
        require(profile in viewports and phase in ('garage', 'running', 'paused', 'workshop') and category in ('Attack', 'Defense', 'Utility'),
                'Undeclared presentation phase/profile/category')
        source = layouts.get(frame['layout_seq'])
        require(source and source['load'] == frame['load'] and not source['graphicsTruncated'], 'Incomplete or foreign graphics observation')
        layout = json.loads(source['raw'].split('ST_LS_HUD_LAYOUT ', 1)[1])
        require(frame['selection'] == layout['selection'], 'Frame selection differs from actual rendered layout')
        state, loop = states.get(frame['state_seq']), loops.get(frame['loop_seq'])
        require(state and loop and state['open'] and state['category'] == category and state['load'] == frame['load'], 'Frame not bound to the current real Shop state')
        require(state['phase'] == ('battle' if phase in ('running', 'paused') else phase)
                and bool(loop['paused']) == frame['paused'] == (phase == 'paused'), 'Layout phase/pause proof differs')
        require(source['timeOrigin'] == frame['before']['timeOrigin'] == frame['after']['timeOrigin']
                and source['t'] <= frame['before']['t'] <= frame['after']['t'], 'Screenshot and graphics belong to different documents/times')
        canvas = frame['canvas']
        require(abs(layout['width'] / layout['pixelRatio'] - canvas['width']) < 1
                and abs(layout['height'] / layout['pixelRatio'] - canvas['height']) < 1, 'Stale viewport coordinates')
        def rectangle(item):
            return {'x': canvas['x'] + item['x'] * canvas['width'] / layout['width'],
                    'y': canvas['y'] + item['y'] * canvas['height'] / layout['height'],
                    'width': item['width'] * canvas['width'] / layout['width'],
                    'height': item['height'] * canvas['height'] / layout['height']}
        def contains(outer, inner):
            return inner['x'] >= outer['x'] - .75 and inner['y'] >= outer['y'] - .75 and inner['x'] + inner['width'] <= outer['x'] + outer['width'] + .75 and inner['y'] + inner['height'] <= outer['y'] + outer['height'] + .75
        graphics = {g['path']: g for g in layout['graphics']}
        for text in frame['texts']:
            graphic = graphics[text['path']]
            box, clip = rectangle(graphic), rectangle(graphic['clip']) if graphic['hasClip'] else canvas
            require(text['box'] == box and text['clip'] == clip and text['full'] == (contains(clip, box) and contains(canvas, box)),
                    'Rendered geometry/full-visibility claim differs')
        enabled = [c for c in layout['controls'] + layout['shopControls'] if c['active']]
        require(frame['controls'] == [{'name': c['name'], 'enabled': c['interactable'], 'box': rectangle(c), 'label': c['accessibleLabel']} for c in enabled],
                'Rendered target inventory differs')
        require(all(c['box']['width'] >= 43.99 and c['box']['height'] >= 43.99 for c in frame['controls']), 'Actual target smaller than44CSSpx')
        for control in frame['controls']:
            if not control['name'].startswith('ShopCard_'):
                require(contains(canvas, control['box']), 'Required system control is clipped')
        unfitted = 'fieldRepair' if report['fitting'] == 'launcher' else 'launcherAttack'
        require(not any(c['name'] == 'ShopCard_' + unfitted + 'Buy' for c in enabled), 'Unfitted upgrade is visible/focusable')
        shell = frame['shell']
        require(shell['scrollWidth'] <= shell['clientWidth'] and shell['scrollHeight'] <= shell['clientHeight']
                and shell['return']['width'] >= 44 and shell['return']['height'] >= 44 and shell['return']['font'] >= 14,
                'Outer viewport or Return is clipped/undersized')
        if phase in ('running', 'paused'):
            require({'Pause', 'ToggleMute', 'ShopClose'}.issubset({c['name'] for c in enabled}), 'A required battle action is hidden')
            require(all(any(g['active'] and g['path'].endswith('/' + name) for g in layout['graphics']) for name in ('HullValue', 'ElapsedTime')),
                    'Hull or Time disappeared')
        require(all(c['n'] == 0 for c in state['cards']), 'Matrix inputs leaked into a temporary purchase')
        key = (phase, profile, category)
        groups.setdefault(key, []).append((frame, layout))
        pixels_seen.setdefault(key, set()).update(_verify_shop_frame_pixels(frame, layout['graphics'], directory))
    frames_by_file = {frame['file']: frame for frame in presentation['frames']}
    require(len(frames_by_file) == len(presentation['frames']), 'A screenshot was reused as another capture')
    focused_profiles = set()
    pressed_phases = set()
    for frame in presentation['frames']:
        if frame.get('treatment') == 'keyboard-focus':
            prior = frames_by_file.get(frame.get('comparison_frame'))
            require(prior and prior['viewport'] == frame['viewport'] and prior['phase'] == frame['phase']
                    and prior['category'] == frame['category'] and prior['load'] == frame['load']
                    and prior['after']['t'] < frame['before']['t']
                    and frame['selection'] == frame['focused_control'], 'Focus images are not a matched actual selection change')
            control = next((c for c in frame['controls'] if c['name'] == frame['focused_control']), None)
            require(control and control['enabled'] and any(c['name'] == control['name'] and c['box'] == control['box'] for c in prior['controls']),
                    'Focus comparison moved or hid the selected control')
            _, _, before_pixel = _shop_png(Path(directory) / prior['file'])
            _, _, after_pixel = _shop_png(Path(directory) / frame['file'])
            box, changed, samples = control['box'], 0, 0
            for y in range(math.ceil(box['y']), math.floor(box['y'] + box['height'])):
                for x in range(math.ceil(box['x']), math.floor(box['x'] + box['width'])):
                    if box['x'] + 6 < x < box['x'] + box['width'] - 6 and box['y'] + 6 < y < box['y'] + box['height'] - 6:
                        continue
                    samples += 1
                    changed += math.dist(before_pixel(x, y), after_pixel(x, y)) > 30
            require(frame.get('focus_pixels') == {'changed': changed, 'samples': samples, 'threshold': 30, 'band_css': 6}
                    and changed >= 10, 'Native keyboard focus lacks actual visible frame pixels')
            focused_profiles.add((frame['phase'], frame['viewport']['width'], frame['viewport']['height']))
        if frame.get('treatment') == 'pointer-pressed':
            require(any(action['name'] == frame['pressed_control'] and action['load'] == frame['load']
                        and action['before'] <= frame['before']['t'] <= frame['after']['t'] <= action['after'] for action in report['actions']),
                    'Pressed screenshot was not captured during an actual held purchase input')
            pressed_phases.add(frame['phase'])
    require(focused_profiles == {(phase, width, height) for phase in ('garage', 'running', 'paused', 'workshop')
                                 for width, height in viewports}, 'Missing visible keyboard-focus profile')
    require({'paused', 'workshop'} <= pressed_phases, 'Missing actual pressed purchase text/background rendering')
    expected_groups = {(phase, viewport, category) for phase in ('garage', 'running', 'paused', 'workshop')
                       for viewport in viewports for category in ('Attack', 'Defense', 'Utility')}
    require(set(groups) == expected_groups, 'Incomplete five-layout/four-phase/category rendered matrix')
    for key, rows in groups.items():
        required = {g['path'] for _, layout in rows for g in layout['graphics'] if g['active'] and g['kind'] == 'Text' and g['text'].strip()}
        require(required <= pixels_seen[key], 'Unreachable/unmeasured clipped text region')
        require(all(0 <= f['scroll_offset'] <= f['maximum_scroll'] + .1 for f, _ in rows), 'Panel scrolling exceeded its actual bound')
    inputs = presentation.get('inputs', [])
    for phase, profile in {(key[0], key[1]) for key in expected_groups}:
        gestures = [i for i in inputs if i.get('phase') == phase and (i.get('viewport', {}).get('width'), i.get('viewport', {}).get('height')) == profile]
        require({'keyboard', 'touch', 'close-return'} <= {i['kind'] for i in gestures}, 'Missing actual keyboard/touch/close exercise')
        require(any(i.get('code') == 'Enter' for i in gestures), 'Missing real keyboard activation')
    for gesture in inputs:
        after_layout = layouts.get(gesture.get('layout_after'))
        require(after_layout and after_layout['load'] == gesture['load'], 'Input outcome detached from actual layout')
        if gesture['kind'] == 'close-return':
            require(gesture['selection'] == after_layout['selection'] == 'ShopEntry', 'Close did not restore entry focus')
        if gesture['kind'] in ('keyboard', 'touch', 'drag'):
            events = records['input'][gesture['input_start']:gesture['input_end']]
            expected = ('keydown', 'keyup') if gesture['kind'] == 'keyboard' else ('pointerdown', 'pointerup')
            selected = [e for e in events if e['kind'] in expected]
            require([e['kind'] for e in selected] == list(expected) and all(e['load'] == gesture['load'] and e['target'] in ('unity-canvas', 'last-stand-return')
                    and e['timeOrigin'] == gesture['before']['timeOrigin'] == gesture['after']['timeOrigin']
                    and gesture['before']['t'] <= e['t'] <= gesture['after']['t'] and e['focused'] and not e['hidden'] for e in selected),
                    'Actual observed input pair is absent or foreign')
            if gesture['kind'] == 'keyboard':
                require(all(e['code'] == gesture['code'] for e in selected), 'Keyboard identity differs from observed edges')
                before_layout = layouts.get(gesture['layout_before'])
                require(before_layout and before_layout['selection'] == gesture['selection_before']
                        and after_layout['selection'] == gesture['selection_after'], 'Focus traversal is detached from actual selection')
            if gesture['kind'] == 'touch':
                before_layout = layouts.get(gesture['layout_before'])
                require(before_layout and any(c['name'] == gesture['name'] and c['active'] and c['interactable'] for c in before_layout['shopControls'])
                        and all(abs(e['x'] - gesture['x']) < .1 and abs(e['y'] - gesture['y']) < .1 for e in selected),
                        'Touch did not hit its observed actual enabled control')
            if gesture['kind'] == 'touch' or gesture.get('code') == 'Enter':
                expected_category = 'Utility' if gesture['kind'] == 'touch' else 'Defense'
                require(states[gesture['state_after']]['category'] == expected_category, 'Keyboard/touch did not activate the same category intent')
    focus = presentation.get('purchase_focus', {})
    layout = layouts.get(focus.get('layout_seq'))
    require(layout and focus['selection'] == layout['selection'], 'Purchase refresh focus evidence is missing')
    controls = layout['controls'] + layout['shopControls']
    selected = next((c for c in controls if c['name'] == layout['selection']), None)
    require(selected and selected['active'] and selected['interactable'], 'Purchase refresh focus is invalid')
    bought = next(c for c in controls if c['name'] == focus['name'])
    require(not bought['interactable'] or layout['selection'] == focus['name'], 'Refresh lost an enabled selected Buy')
    terminal = presentation.get('terminal', {})
    layout = layouts.get(terminal.get('layout_seq'))
    require(layout and layout['phase'] == 'result' and layout['selection'] == terminal['selection']
            and any(c['active'] and c['interactable'] and c['name'] == layout['selection'] for c in layout['controls'])
            and not layout['selection'].startswith('ShopCard_'), 'Terminal retained invalid purchase focus')
    return presentation


def verify_shop_presentation_states(report, directory):
    """Admit labeled compatibility/refusal visuals, never earned-run evidence."""
    require(report.get('schema') == 'singedterra-shop-presentation-states/v1' and report.get('seeded') is True
            and report.get('fixture_scope') == 'valid v1 capped-permanent compatibility and real storage denial; never earned-fund vertical evidence'
            and report.get('status') == 'pass' and report.get('cleanup') == 'complete' and report.get('owner_acceptance') is False,
            'Presentation fixture was mislabeled or incomplete')
    manifest_path = ROOT.parent / 'client/public/last-stand/asset-manifest.json'
    manifest = json.loads(manifest_path.read_bytes())
    binding = report['binding']
    require(binding['manifest_sha256'] == digest(manifest_path) and binding['build'] == manifest['source']['build']
            and binding['receipt_sha256'] == digest(ROOT.parent / manifest['source']['receipt'])
            and binding['shop_binding_sha256'] == digest(ROOT / 'docs/last-stand-mechanics-shop/shop-native-binding.json'),
            'Presentation fixtures use stale runtime/source')
    source_paths = ('e2e/helpers/lastStandJourney.mjs', 'scripts/last-stand-playable-loop.mjs',
                    'campaign-unity/Tools/verify_last_stand_loop.py', 'campaign-unity/Tools/last_stand_shop/test_shop_player.py',
                    'campaign-unity/Tools/last_stand_shop/test_shop_journey_guards.py')
    require(binding['input_files'] == {name: digest(ROOT.parent / name) for name in source_paths}, 'Stale presentation-state driver')
    served = dict(manifest['files'], **{'index.html': manifest['wrapperSha256'], 'asset-manifest.json': digest(manifest_path)})
    require(set(binding['served']) == set(served) and all(binding['served'][name]['sha256'] == value for name, value in served.items()),
            'Presentation fixture did not use the actual served artifact')
    require(report['initial_storage']['raw'] is None and report['fixture_origin'] == 'declared pre-existing v1 compatibility fixture in a fresh task-owned profile',
            'Compatibility fixture contaminated an existing profile')
    require(json.loads(report['fixture_raw']) == {'version': 1, 'credits': 1, 'permanentLevel': 3, 'nextRunId': 1,
                                                'lastFinalizedRunId': 0, 'pendingDefeat': None}, 'Undeclared capped-state fixture')
    records = report['records']
    events = records['storageEvents']
    require(any(event['op'] == 'snapshot' and event.get('label') == 'before-app' and event['load'] == 1
                and all(event.get(key) == value for key, value in report['initial_storage'].items()) for event in events),
            'Initial empty storage is not the actual pre-application observation')
    require(len([e for e in events if e['op'] == 'fixture']) == 1
            and next(e for e in events if e['op'] == 'fixture')['actual'] == report['fixture_raw'], 'Fixture bytes differ from actual storage input')
    for event in events:
        require({k: v for k, v in event.items() if k not in ('load', 'emittedRaw')} == json.loads(event['emittedRaw'].split('ST_TEST_STORAGE ', 1)[1]),
                'Storage observation differs from its raw emission')
    migrated = json.loads(report['migrated_storage']['raw'])
    require(migrated['version'] == 2 and migrated['credits'] == 1 and migrated['permanentLevels']['cannonAttack'] == 3
            and all(level == 0 for key, level in migrated['permanentLevels'].items() if key != 'cannonAttack'),
            'Actual migration did not retain only capped Cannon ownership')
    capped = report['capped_state']
    require(capped in records['shopStates'] and any(c['key'] == 'cannonAttack' and c['p'] == 3 and c['refusal'] == 'AtCap'
            and not c['canPurchase'] and not c['hasNextPrice'] for c in capped['cards']), 'Actual capped presentation is absent')
    require(report['denied_state'] in records['states'] and report['denied_state']['saveState'] == 'retry'
            and report['denied_shop'] in records['shopStates'] and report['denied_storage']['raw'] == report['migrated_storage']['raw']
            and any(e['op'] == 'set' and e['mode'] == 'denied' and e['outcome'] == 'throw' for e in events),
            'Save-disabled visual lacks actual failed persistence')
    require(report['recovered_state'] in records['states'] and report['recovered_state']['saveState'] == 'ready', 'Presentation fault did not recover')
    require(all(report['browser_evidence'][key] == [] for key in ('consoleErrors', 'requestErrors', 'httpErrors')),
            'Presentation fixture browser errors remain')
    require(not report.get('observer_failure') and not report.get('cleanup_error') and not records['combat'] and not records['purchases'],
            'Compatibility fixture was confused with earned-fund combat')
    layouts = {r['seq']: r for r in records['controlsOnly']}
    runtime = {r['seq']: r for r in records['runtime']}
    groups = {}
    for frame in report['presentation']['frames']:
        require(frame['phase'] in ('capped', 'save-disabled'), 'Undeclared presentation-state frame')
        source = layouts[frame['layout_seq']]
        require(not source['graphicsTruncated'] and runtime[source['seq']]['text'] == source['raw']
                and source['load'] == frame['load'] and source['timeOrigin'] == frame['before']['timeOrigin'] == frame['after']['timeOrigin'],
                'Presentation-state graphics are not current raw observations')
        layout = json.loads(source['raw'].split('ST_LS_HUD_LAYOUT ', 1)[1])
        graphics = layout['graphics']
        canvas = frame['canvas']
        require(source['t'] <= frame['before']['t'] <= frame['after']['t']
                and abs(layout['width'] / layout['pixelRatio'] - canvas['width']) < 1
                and abs(layout['height'] / layout['pixelRatio'] - canvas['height']) < 1,
                'Presentation-state screenshot has stale time or viewport geometry')
        def rectangle(item):
            return {'x': canvas['x'] + item['x'] * canvas['width'] / layout['width'],
                    'y': canvas['y'] + item['y'] * canvas['height'] / layout['height'],
                    'width': item['width'] * canvas['width'] / layout['width'],
                    'height': item['height'] * canvas['height'] / layout['height']}
        def contains(outer, inner):
            return (inner['x'] >= outer['x'] - .75 and inner['y'] >= outer['y'] - .75
                    and inner['x'] + inner['width'] <= outer['x'] + outer['width'] + .75
                    and inner['y'] + inner['height'] <= outer['y'] + outer['height'] + .75)
        by_path = {graphic['path']: graphic for graphic in graphics}
        for text in frame['texts']:
            graphic = by_path[text['path']]
            box, clip = rectangle(graphic), rectangle(graphic['clip']) if graphic['hasClip'] else canvas
            require(text['box'] == box and text['clip'] == clip
                    and text['full'] == (contains(clip, box) and contains(canvas, box)),
                    'State text geometry/full-visibility claim differs from raw graphics')
        active = [control for control in layout['controls'] + layout['shopControls'] if control['active']]
        require(frame['controls'] == [{'name': control['name'], 'enabled': control['interactable'],
                'box': rectangle(control), 'label': control['accessibleLabel']} for control in active],
                'State control inventory differs from raw enabled/disabled controls')
        controls_seen = set()
        for control in frame['controls']:
            require(control['box']['width'] >= 43.99 and control['box']['height'] >= 43.99,
                    'State target smaller than 44 CSS pixels')
            graphic = next((g for g in graphics if g['active'] and g['path'].endswith('/' + control['name'])), None)
            clip = rectangle(graphic['clip']) if graphic and graphic['hasClip'] else canvas
            if contains(clip, control['box']) and contains(canvas, control['box']):
                controls_seen.add(control['name'])
        require(0 <= frame['scroll_offset'] == layout['scrollOffset'] <= layout['maximumScrollOffset'] + .1
                and frame['maximum_scroll'] == layout['maximumScrollOffset'], 'State scroll exceeds its actual bound')
        visible = _verify_shop_frame_pixels(frame, graphics, directory)
        if frame['phase'] == 'capped':
            require(any('cannonAttackBuyText' in g['path'] and g['text'] == 'MAX' and g['path'] in visible for g in graphics),
                    'MAX not actually visible and measured')
        else:
            require(any(g['path'].endswith('/SaveStatus') and g['text'].strip() and g['path'] in visible for g in graphics),
                    'Actual save-disabled/refusal message not visible and measured')
        key = (frame['phase'], frame['viewport']['width'], frame['viewport']['height'], frame['category'])
        group = groups.setdefault(key, {'required_text': set(), 'seen_text': set(),
                                        'required_controls': set(), 'seen_controls': set()})
        group['required_text'].update(g['path'] for g in graphics if g['active'] and g['kind'] == 'Text' and g['text'].strip())
        group['seen_text'].update(visible)
        group['required_controls'].update(control['name'] for control in active)
        group['seen_controls'].update(controls_seen)
    require(set(groups) == {(label, width, height, 'Attack' if label == 'capped' else 'Defense') for label in ('capped', 'save-disabled')
                       for width, height in ((1920, 1080), (1366, 768), (720, 640), (390, 844), (844, 390))},
            'Missing current compatibility/refusal layout')
    for group in groups.values():
        require(group['required_text'] <= group['seen_text'] and group['required_controls'] <= group['seen_controls'],
                'Unreachable/unmeasured state text or control region')
    return report['presentation']


def verify_shop_media(report, directory):
    """Require the actual timestamped purchase-to-combat capture."""
    media = report.get('presentation', {}).get('media')
    require(isinstance(media, dict), 'Actual normal-speed purchase-to-combat media is absent')
    verify_shop_vertical(report)
    presentation = report['presentation']
    begin, end = presentation['media_begin'], presentation['media_end']
    purchase, effect = report['witnesses']['temporary_purchase'], report['witnesses']['temporary_effect']
    require(begin['timeOrigin'] == end['timeOrigin'] == purchase['timeOrigin'] == effect['timeOrigin']
            and begin['t'] < purchase['t'] < effect['t'] < end['t'], 'Movie does not span actual purchase and subsequent combat effect')
    directory = Path(directory).resolve()
    movie, raw = (directory / media['file']).resolve(), (directory / media['raw']).resolve()
    require(movie.is_relative_to(directory) and raw.is_relative_to(directory) and digest(movie) == media['sha256']
            and digest(raw) == media['raw_sha256'], 'Movie/frame evidence missing or changed')
    frames = json.loads(raw.read_bytes())['frames']
    require(len(frames) == media['frames'] == media['encoded_frames'] and len(frames) >= 2,
            'Movie drops or duplicates independent captured frames')
    deltas = [b['timestamp'] - a['timestamp'] for a, b in zip(frames, frames[1:])]
    require(all(delta > 0 for delta in deltas) and abs(sum(deltas) - media['duration_seconds']) < 1e-8
            and abs(media['encoded_duration_seconds'] - sum(deltas)) <= .25
            and media['mode'] == 'normal speed from captured timestamps', 'Movie is not at actual normal-speed timestamps')
    require(frames[0]['timestamp'] * 1000 <= purchase['timeOrigin'] + purchase['t']
            and frames[-1]['timestamp'] * 1000 >= effect['timeOrigin'] + effect['t'], 'Actual captured frame span omits the purchase/effect')
    require(abs(sum(deltas) - (end['t'] - begin['t']) / 1000) <= 1, 'Recorded movie elapsed time differs from real document time')
    require(set(media.get('frame_sha256', {})) == {frame['file'] for frame in frames}, 'Independent captured frame hashes are incomplete')
    for frame in frames:
        path = (raw.parent / frame['file']).resolve()
        require(path.is_relative_to(raw.parent) and path.is_file() and path.stat().st_size > 0
                and digest(path) == media['frame_sha256'][frame['file']], 'Independent captured frame is absent or changed')
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
                            '-show_entries', 'stream=nb_read_frames,duration', '-of', 'json', str(movie)],
                           capture_output=True, text=True, timeout=60, check=True)
    stream = json.loads(probe.stdout)['streams'][0]
    require(int(stream['nb_read_frames']) == len(frames) and abs(float(stream['duration']) - sum(deltas)) <= .25,
            'Actual encoded movie does not match its retained timestamped frames')
    return media


def verify_shop_vertical(report):
    """Admit a complete actual Shop journey, never a synthetic success receipt.

    Witnesses must be retained observations, with the emitted raw console stream,
    real pointer pairs, saved bytes, exact export and current driver sources all
    agreeing. Copied-record negative controls exercise this same admission path.
    """
    def require(condition, message):
        if not condition:
            raise AssertionError(message)

    require(isinstance(report, dict) and report.get('schema') == 'singedterra-shop-player/v1',
            'Missing real Shop journey contract')
    require(report.get('status') == 'pass' and report.get('cleanup') == 'complete'
            and report.get('normal_speed') is True and report.get('seeded') is False,
            'Shop journey did not complete honestly with owned cleanup')
    require(report.get('storage_scope') == 'fresh task-owned isolated profile', 'Non-isolated Shop profile')
    launch = report.get('browser_launch', {})
    require(report.get('execution_mode') == launch.get('launch_mode') == 'shop-headless'
            and launch.get('args', []).count('--headless=new') == 1
            and launch.get('focus') == 'headless actual document, noDefaults:true'
            and report.get('native_window_focus_claim') is False, 'Shop browser mode is not genuine declared headless Chrome')
    require(not report.get('observer_failure') and not report.get('cleanup_error'), 'Failed Shop observation or cleanup')
    fitting = report.get('fitting')
    require(fitting in ('launcher', 'repair'), 'Unknown Shop fitting')
    track, kind, amount, track_id = ('launcherAttack', 'Launcher', 16, 1) if fitting == 'launcher' else ('fieldRepair', 'Repair', 4, 5)
    require(report.get('track') == track, 'Journey track does not belong to fitting')
    binding, records, witnesses = report.get('binding'), report.get('records'), report.get('witnesses')
    require(all(isinstance(value, dict) for value in (binding, records, witnesses)), 'Partial Shop record')
    worktree = ROOT.parent
    manifest_path = worktree / 'client/public/last-stand/asset-manifest.json'
    manifest = json.loads(manifest_path.read_bytes())
    documentary_path = ROOT / 'docs/last-stand-mechanics-shop/shop-native-binding.json'
    documentary = json.loads(documentary_path.read_bytes())
    receipt_path = worktree / manifest['source']['receipt']
    expected_binding = {'manifest_sha256': digest(manifest_path), 'receipt_sha256': digest(receipt_path),
                        'shop_binding_sha256': digest(documentary_path),
                        'source_lock_sha256': manifest['source']['sourceLockSha256'],
                        'source_inventory_sha256': manifest['source']['sourceInventorySha256'],
                        'build': manifest['source']['build']}
    require(all(binding.get(key) == value for key, value in expected_binding.items()), 'Stale Shop runtime/export binding')
    require(documentary['package']['manifestSha256'] == expected_binding['manifest_sha256']
            and documentary['package']['sanitizedReceiptSha256'] == expected_binding['receipt_sha256'],
            'Shop documentary binding does not describe the actual runtime')
    source_paths = ('e2e/helpers/lastStandJourney.mjs', 'scripts/last-stand-playable-loop.mjs',
                    'campaign-unity/Tools/verify_last_stand_loop.py',
                    'campaign-unity/Tools/last_stand_shop/test_shop_player.py',
                    'campaign-unity/Tools/last_stand_shop/test_shop_journey_guards.py')
    require(binding.get('input_files') == {name: digest(worktree / name) for name in source_paths},
            'Shop journey driver source changed')
    expected_served = dict(manifest['files'], **{'index.html': manifest['wrapperSha256'],
                                              'asset-manifest.json': expected_binding['manifest_sha256']})
    served = binding.get('served', {})
    require(set(served) == set(expected_served) and all(served[name].get('sha256') == value
            and served[name].get('bytes', 0) > 0 for name, value in expected_served.items()),
            'Incomplete or old served Shop payload')
    require(set(binding.get('validation', {})) == {'verify-last-stand-source.mjs', 'verify-last-stand.mjs'}
            and all(binding['validation'].values()), 'Preserved runtime/source admission did not execute')
    require(report.get('checks') and all(item.get('pass') is True for item in report['checks']), 'Failed or absent Shop checks')
    browser = report.get('browser_evidence', {})
    require(all(key in browser and browser[key] == [] for key in ('consoleErrors', 'requestErrors', 'httpErrors')),
            'Shop browser/runtime errors are unresolved')

    def read_controls(raw):
        tag = 'ST_LS_HUD_LAYOUT '
        require(isinstance(raw, str) and raw.startswith(tag), 'Expected actual control diagnostic')
        payload = raw[len(tag):]
        boundary = payload.find(',"graphics":[')
        require(boundary > 0, 'Controls were not complete before graphics')
        fields = json.loads(payload[:boundary] + '}')
        headers = {'phase', 'coordinates', 'selection', 'width', 'height', 'pixelRatio',
                   'scrollOffset', 'maximumScrollOffset', 'controls', 'shopControls'}
        require(set(fields) == headers and fields['coordinates'] == 'top-left'
                and isinstance(fields['phase'], str) and isinstance(fields['selection'], str), 'Invalid controls header')
        require(all(type(fields[key]) in (int, float) and math.isfinite(fields[key]) and fields[key] >= 0
                    for key in ('width', 'height', 'pixelRatio', 'scrollOffset', 'maximumScrollOffset'))
                and min(fields['width'], fields['height'], fields['pixelRatio']) > 0, 'Invalid control dimensions')
        expected = {'controls': {'ToggleFitting', 'Deploy', 'Claim', 'Purchase', 'Redeploy', 'RetrySave', 'Pause', 'ToggleMute'},
                    'shopControls': {'ShopEntry', 'ShopClose', 'ShopTabAttack', 'ShopTabDefense', 'ShopTabUtility',
                    'ShopCard_cannonAttackBuy', 'ShopCard_launcherAttackBuy', 'ShopCard_hullCapacityBuy',
                    'ShopCard_armorBuy', 'ShopCard_cannonCycleBuy', 'ShopCard_fieldRepairBuy'}}
        for key, names in expected.items():
            values = fields[key]
            require(isinstance(values, list) and len(values) == len(names)
                    and {item['name'] for item in values} == names, 'Missing or repeated observed controls')
            for item in values:
                require(set(item) == {'name', 'label', 'accessibleLabel', 'mode', 'trackKey',
                        'x', 'y', 'width', 'height', 'active', 'interactable'}
                        and all(isinstance(item[name], str) for name in ('name', 'label', 'accessibleLabel', 'mode', 'trackKey'))
                        and all(type(item[name]) in (int, float) and math.isfinite(item[name]) for name in ('x', 'y', 'width', 'height'))
                        and min(item['width'], item['height']) >= 0
                        and type(item['active']) is bool and type(item['interactable']) is bool, 'Malformed control field')
        truncated = False
        try:
            complete = json.loads(payload)
            require(set(complete) == headers | {'graphics'} and isinstance(complete['graphics'], list), 'Unexpected diagnostic tail')
        except json.JSONDecodeError as error:
            suffix = payload[error.pos:]
            incomplete_literal = error.msg == 'Expecting value' and suffix in ('t', 'tr', 'tru', 'f', 'fa', 'fal', 'fals', 'n', 'nu', 'nul')
            incomplete_number = (error.msg == 'Expecting value' and suffix == '-') or (
                error.msg == "Expecting ',' delimiter" and suffix in ('.', 'e', 'E', 'e+', 'e-', 'E+', 'E-')
                and error.pos > 0 and payload[error.pos - 1].isdigit())
            require(len(raw) == 8190 and error.pos > boundary and (error.pos == len(payload)
                    or error.msg == 'Unterminated string starting at' or incomplete_literal or incomplete_number),
                    'Unexpected HUD truncation shape')
            truncated = True
        return dict(fields, observationScope='complete-controls-only', graphicsTruncated=truncated, raw=raw)

    tags = {'ST_LS_SHOP_STATE ': 'shopStates', 'ST_LS_SHOP_PURCHASE ': 'purchases',
            'ST_LS_SHOP_COMBAT ': 'combat', 'ST_LS_STATE ': 'states',
            'ST_ENC_STATE ': 'encounters', 'ST_LS_HUD_LAYOUT ': 'controlsOnly'}
    require(all(isinstance(records.get(key), list) and records[key] for key in (*tags.values(), 'runtime', 'storage', 'input')),
            'Missing actual raw Shop observations')
    derived = {key: [] for key in tags.values()}
    for seq, observation in enumerate(records['runtime']):
        require(observation.get('seq') == seq and observation.get('load') in (1, 2)
                and isinstance(observation.get('t'), (int, float)) and math.isfinite(observation['t'])
                and isinstance(observation.get('timeOrigin'), (int, float)), 'Invalid Shop observation identity')
        for tag, key in tags.items():
            if tag not in observation.get('text', ''):
                continue
            try:
                value = read_controls(observation['text']) if key == 'controlsOnly' else json.loads(observation['text'].split(tag)[1].split('\n')[0])
            except (ValueError, IndexError) as error:
                raise AssertionError('Malformed real Shop telemetry') from error
            value.update({field: observation[field] for field in ('seq', 'load', 't', 'timeOrigin')})
            derived[key].append(value)
    require(all(records[key] == value for key, value in derived.items()), 'Shop observations were seeded, changed or replayed')
    required = ('initial_storage', 'deploy', 'temporary_before', 'temporary_card_before', 'temporary_purchase',
                'temporary_after', 'temporary_effect', 'defeat', 'result', 'terminal', 'claim_before', 'claim_after',
                'permanent_before', 'permanent_state_after', 'permanent_card_before', 'permanent_card_after', 'permanent_after', 'reload', 'redeploy',
                'redeploy_card', 'permanent_effect')
    require(all(key in witnesses for key in required), 'Partial Shop vertical')
    for name, collection in (('deploy', 'shopStates'), ('temporary_before', 'shopStates'), ('temporary_after', 'shopStates'),
                             ('temporary_purchase', 'purchases'), ('temporary_effect', 'combat'), ('defeat', 'encounters'), ('result', 'states'),
                             ('terminal', 'shopStates'), ('permanent_before', 'shopStates'),
                             ('permanent_state_after', 'shopStates'), ('redeploy', 'shopStates'), ('permanent_effect', 'combat')):
        require(witnesses[name] in records[collection], 'Detached Shop witness: ' + name)

    keys = {'cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair'}
    def cards(state):
        values = state.get('cards', [])
        require(len(values) == 6 and {item.get('key') for item in values} == keys, 'Incomplete actual Shop catalog')
        return {item['key']: item for item in values}

    deploy, before, after, purchase = (witnesses[name] for name in ('deploy', 'temporary_before', 'temporary_after', 'temporary_purchase'))
    run_id = deploy['runId']
    require(run_id > 0 and deploy['tick'] == 0 and deploy['load'] == 1 and deploy['hasActiveLedger']
            and deploy['scrap'] == deploy['earnedScrap'] == deploy['spentScrap'] == deploy['uniqueKills'] == 0,
            'First active ledger was not genuinely empty')
    require(all(item['p'] == item['n'] == 0 for item in cards(deploy).values()), 'Seeded first-run levels')
    require(deploy['fitting'].lower() == fitting, 'Wrong first-run fitting')
    require(witnesses['temporary_card_before'] == cards(before)[track], 'Detached temporary card')
    old_card, new_card = cards(before)[track], cards(after)[track]
    require(old_card['eligible'] and old_card['canPurchase'] and old_card['n'] == old_card['p'] == 0
            and old_card['nextPrice'] == 5 and before['scrap'] >= 5 and before['uniqueKills'] >= 2,
            'Temporary purchase was not funded by actual kills')
    require(len(records['purchases']) == 1 and purchase['accepted'] is True and purchase['chargedScrap'] == 5
            and purchase['intentRunId'] == run_id and purchase['intentTrackId'] == track_id
            and purchase['intentVersion'] == before['version'] and purchase['resultVersion'] == after['version']
            and purchase['resultVersion'] > purchase['intentVersion'] and purchase['activationId'] > 0,
            'Temporary purchase was not one actual atomic activation')
    require(before['runId'] == after['runId'] == run_id and after['scrap'] == before['scrap'] - 5
            and after['spentScrap'] == before['spentScrap'] + 5 and after['earnedScrap'] == before['earnedScrap']
            and new_card['n'] == new_card['level'] == 1 and new_card['p'] == 0 and new_card['nextPrice'] == 10,
            'Temporary debit/level/next price differs')
    for state in records['shopStates']:
        if not state['hasActiveLedger'] or state['hasFinalAccounting']:
            require(state['scrap'] == 0, 'Spendable funds survived ledger teardown')
            continue
        require(state['earnedScrap'] == 3 * state['uniqueKills']
                and state['scrap'] == state['earnedScrap'] - state['spentScrap'], 'Run income does not conserve')
        # Pool slots are reused for later enemies. A terminal hit is identified
        # by its actual model tick and slot, never by the pool slot alone.
        killed = {(row['tick'], event['slot']) for row in records['combat'] if row['runId'] == state['runId']
                  and row['load'] == state['load'] and row['tick'] <= state['tick']
                  for event in row['events'] if event['kind'] in ('Cannon', 'Launcher') and event['killed']}
        require(len(killed) == state['uniqueKills'], 'Scrap is not supported by actual unique combat kills')
    for name, current_run, minimum_tick, expected_load in (('temporary_effect', run_id, purchase['tick'], 1),
            ('permanent_effect', witnesses['redeploy']['runId'], 0, 2)):
        effect = witnesses[name]
        require(effect['runId'] == current_run and effect['tick'] > minimum_tick and effect['load'] == expected_load
                and effect['fitting'].lower() == fitting and any(event['kind'] == kind and event['amount'] == amount
                    for event in effect['events']), 'Actual future upgraded combat effect absent: ' + name)
        require(effect['model']['launcherDamage' if fitting == 'launcher' else 'repairAmount'] == amount,
                'Effect differs from the authoritative combat projection')
    defeat, terminal = witnesses['defeat'], witnesses['terminal']
    encounter_deploys = [item for item in records['encounters'] if item['load'] == 1 and item['action'] == 'deploy'
                        and item['tick'] == 0 and item['seq'] <= deploy['seq']]
    result = witnesses['result']
    require(len(encounter_deploys) == 1 and defeat['run'] == encounter_deploys[0]['run']
            and defeat['load'] == 1 and defeat['status'] == 'Defeated' and defeat['action'] == 'terminal'
            and defeat['hp'] == 0 and 0 < defeat['tick'] < 3600 and not defeat['failed']
            and result['phase'] == 'result' and result['pendingRunId'] == run_id and result['wallet'] == 0,
            'No ordinary unclaimed defeat')
    require(defeat['t'] - encounter_deploys[0]['t'] >= defeat['tick'] * 50 - 100,
            'Combat advanced faster than its normal twenty ticks per second')
    accounting = terminal['finalAccounting']
    require(terminal['hasFinalAccounting'] and not terminal['open'] and terminal['scrap'] == 0
            and accounting['runId'] == run_id and accounting['uniqueKills'] == defeat['kills']
            and accounting['earnedScrap'] == 3 * defeat['kills'] and accounting['spentScrap'] == 5
            and accounting['finalScrap'] == accounting['earnedScrap'] - 5, 'Terminal accounting/cleanup differs')
    storage = {}
    for item in records['storage']:
        require(item['label'] not in storage, 'Repeated storage witness')
        require(item['data'] == (None if item['raw'] is None else json.loads(item['raw'])), 'Storage bytes differ from observation')
        storage[item['label']] = item
        if item['data'] is not None:
            value = item['data']
            require(set(value) == {'version', 'credits', 'permanentLevels', 'nextRunId', 'lastFinalizedRunId', 'pendingDefeat'}
                    and value['version'] == 2 and set(value['permanentLevels']) == keys
                    and all(type(level) is int and 0 <= level <= 3 for level in value['permanentLevels'].values()),
                    'Saved Shop record contains temporary or invalid state')
    require(witnesses['initial_storage'] == storage.get('initial'), 'Detached initial storage')
    for witness_name, label in (('claim_before', 'claim-before'), ('claim_after', 'claim-after'),
                               ('permanent_after', 'permanent-after'), ('reload', 'reload')):
        require(label in storage and witnesses[witness_name] == storage[label]['data'], 'Detached saved witness: ' + label)
    claim_before, claim_after = witnesses['claim_before'], witnesses['claim_after']
    require(claim_before['credits'] == 0 and claim_before['pendingDefeat'] == {'runId': run_id,
            'elapsedTicks': defeat['tick'], 'kills': defeat['kills'], 'reward': 1}, 'Defeat reward was not naturally saved')
    expected_claim = dict(claim_before, credits=1, pendingDefeat=None, lastFinalizedRunId=run_id)
    require(claim_after == expected_claim, 'Manual Claim changed or awarded unexpected state')
    permanent_before, permanent_after = witnesses['permanent_before'], witnesses['permanent_state_after']
    permanent_card_before, permanent_card_after = cards(permanent_before)[track], cards(permanent_after)[track]
    require(witnesses['permanent_card_before'] == permanent_card_before
            and witnesses['permanent_card_after'] == permanent_card_after
            and permanent_before['phase'] == permanent_after['phase'] == 'workshop'
            and permanent_before['mode'] == permanent_after['mode'] == 'Permanent'
            and permanent_before['load'] == permanent_after['load'] == 1
            and permanent_before['open'] and permanent_after['open']
            and permanent_before['salvage'] == 1 and permanent_after['salvage'] == 0
            and permanent_card_before['canPurchase'] and permanent_card_before['eligible']
            and permanent_card_before['nextPrice'] == 1 and permanent_card_before['p'] == permanent_card_before['n'] == 0
            and permanent_card_after['p'] == 1 and permanent_card_after['n'] == 0,
            'Permanent investment was not observed on the real compatible Shop card')
    permanent = dict(claim_after, credits=0, permanentLevels=dict(claim_after['permanentLevels'], **{track: 1}))
    require(witnesses['permanent_after'] == witnesses['reload'] == permanent
            and storage['permanent-after']['raw'] == storage['reload']['raw'], 'Permanent investment did not survive exact reload')
    redeploy = witnesses['redeploy']
    require(redeploy['load'] == 2 and redeploy['runId'] > run_id and redeploy['tick'] == 0 and redeploy['scrap'] == 0
            and all(item['n'] == 0 and item['p'] == (1 if key == track else 0) for key, item in cards(redeploy).items())
            and witnesses['redeploy_card'] == cards(redeploy)[track], 'Redeploy did not reset temporary state and retain P')
    actions = report.get('actions', [])
    require(actions and sum(action['name'] == 'Claim' for action in actions) == 1, 'Claim must be one explicit real control')
    bound_actions, used_edges = [], set()
    for action in actions:
        require(all(type(action.get(key)) in (int, float) and math.isfinite(action[key])
                    for key in ('before', 'after', 'x', 'y'))
                and 0 <= action['before'] < action['after'], 'Invalid action clock or coordinates')
        layout = next((item for item in records['controlsOnly'] if item['seq'] == action['layoutSeq']), None)
        require(layout is not None and layout['load'] == action['load'] and any(control['name'] == action['name']
                and control['active'] and control['interactable'] for control in layout['controls'] + layout['shopControls']),
                'Action did not target a real current enabled control')
        pair = [item for item in records['input'] if item['load'] == action['load'] and item.get('area') == 'gameplay'
                and item.get('kind') in ('pointerdown', 'pointerup') and action['before'] <= item['t'] <= action['after']
                and abs(item.get('x', -10000) - action['x']) < 1 and abs(item.get('y', -10000) - action['y']) < 1]
        require([item['kind'] for item in pair] == ['pointerdown', 'pointerup'], 'Actual pointer pair is missing or repeated')
        require(all(item.get('focused') is True and item.get('hidden') is False for item in pair),
                'Actual Shop input document was not visible and focused')
        require(layout['t'] <= action['before'] and pair[0]['t'] < pair[1]['t']
                and all(item.get('timeOrigin') == layout['timeOrigin'] and item.get('button') == 0
                        and item.get('target') == 'unity-canvas' for item in pair),
                'Action and pointer pair do not belong to the observed control document')
        edges = {records['input'].index(item) for item in pair}
        require(not used_edges.intersection(edges), 'Action pointer pair was reused')
        used_edges.update(edges)
        control = next(item for item in layout['controls'] + layout['shopControls'] if item['name'] == action['name'])
        bound_actions.append((action, layout, control, pair))
    claim_action = next(action for action in actions if action['name'] == 'Claim')
    require(claim_action['load'] == 1 and claim_action['before'] > defeat['t']
            and claim_action['after'] <= storage['claim-after']['t'], 'Claim was not manual after natural defeat')

    # Validate the whole required sequence, not merely whichever actions a
    # supplied report retained. Effects may arrive before the click helper's
    # final clock read; the actual pointer-up edge must precede each effect.
    buy = 'ShopCard_' + track + 'Buy'
    required_actions = (
        ('deploy', 'Deploy', 1, 'garage', 'Core', '',
         (storage['initial'],), (encounter_deploys[0], deploy)),
        ('temporary-buy', buy, 1, 'battle', 'Run', track,
         (before,), (after, purchase)),
        ('claim', 'Claim', 1, 'result', 'Core', '',
         (defeat, result, terminal, storage['claim-before']), (storage['claim-after'],)),
        ('permanent-buy', buy, 1, 'workshop', 'Permanent', track,
         (permanent_before, storage['claim-after']), (permanent_after, storage['permanent-after'])),
        ('redeploy', 'Deploy', 2, 'garage', 'Core', '',
         (storage['reload'],), (redeploy,)),
    )
    required_indices = []
    for label, name, load, phase, mode, control_track, preceding, following in required_actions:
        matches = [(index, bound) for index, bound in enumerate(bound_actions)
                   if bound[0]['name'] == name and bound[0]['load'] == load
                   and bound[1]['phase'] == phase and bound[2]['mode'] == mode
                   and bound[2]['trackKey'] == control_track]
        require(len(matches) == 1, 'Mandatory Shop action ' + label + ' is missing, repeated or in the wrong context')
        index, (action, layout, control, pair) = matches[0]
        require(all(item['load'] == load and item['timeOrigin'] == layout['timeOrigin']
                    for item in preceding + following)
                and max(item['t'] for item in preceding) <= action['before']
                and pair[1]['t'] <= min(item['t'] for item in following),
                'Mandatory Shop action ' + label + ' witness order differs')
        required_indices.append(index)
    require(required_indices == sorted(set(required_indices)), 'Mandatory Shop action order differs')
    require(purchase['actionId'] == buy and purchase['mode'] == 'Run'
            and all(item['load'] == 1 and item['phase'] == 'battle' and item['mode'] == 'Run' for item in (before, after)),
            'Mandatory Shop action temporary-buy does not match the accepted run purchase')
    return report

def _recovery_need(condition, message):
    if not condition:
        raise AssertionError(message)


SHOP_COMPILED_METHODS = {
    'RunSettle': ('test_settle_purchase_old_stats_and_debt_refusal', 'test_settle_pause_focus_close_and_stale_input'),
    'RunIncome': ('test_income_hidden_partition_and_terminal_snapshot', 'test_income_final_tick_refresh_and_next_run'),
}


def bind_shop_compiled_boundaries(evidence_root):
    """Bind existing actual Editor output; this never runs or invents a check."""
    methods = {}
    for path in Path(evidence_root).glob('*/invocation.json'):
        invocation = json.loads(path.read_bytes())
        argv = invocation.get('argv', [])
        for method in SHOP_COMPILED_METHODS:
            if 'LastStandShopChecks.' + method in argv:
                _recovery_need(method not in methods, 'RECOVERY_COMPILED: ambiguous ' + method)
                methods[method] = {'directory': str(path.parent.resolve()),
                    'files': {name: digest(path.parent / name) for name in ('invocation.json', 'result.json', 'unity-editor.log')}}
    value = {'schema': 'singedterra-shop-compiled-boundaries/v1', 'methods': methods}
    _verify_recovery_compiled(value)
    return value


def _verify_recovery_compiled(value):
    """Re-read exact RunSettle/RunIncome logs, results, archives and assemblies.

    Compiled setup remains compiled evidence. Both actual fitting loops and the
    128-step refusal/final-kill assertions live in the archived checks. Their
    passes cannot stand in for genuine browser/focus/storage observations.
    """
    need = lambda condition, message: _recovery_need(condition, 'RECOVERY_COMPILED: ' + message)
    need(isinstance(value, dict) and value.get('schema') == 'singedterra-shop-compiled-boundaries/v1'
         and isinstance(value.get('methods'), dict) and set(value['methods']) == set(SHOP_COMPILED_METHODS),
         'both actual method identities are required')
    worktree, project = ROOT.parent, ROOT / 'Unity'
    paths = [path for directory in ('Assets/Scripts', 'Assets/Editor', 'Assets/Scenes', 'ProjectSettings')
             for path in (project / directory).rglob('*') if path.is_file()]
    paths.extend(path for path in (project / 'Packages').glob('*.json') if path.is_file())
    sources = {path.relative_to(worktree).as_posix(): digest(path) for path in sorted(paths)}
    need('campaign-unity/Unity/Assets/Editor/LastStandShopChecks.cs' in sources, 'actual compiled checks source missing')
    try:
        for method, names in SHOP_COMPILED_METHODS.items():
            item = value['methods'][method]; directory = Path(item['directory'])
            need(directory.is_absolute() and set(item['files']) == {'invocation.json', 'result.json', 'unity-editor.log'},
                 'incomplete ' + method + ' artifact binding')
            need(all(digest(directory / name) == sha for name, sha in item['files'].items()), 'changed ' + method + ' artifact bytes')
            invocation = json.loads((directory / 'invocation.json').read_bytes())
            result = json.loads((directory / 'result.json').read_bytes())
            log_path = directory / 'unity-editor.log'; log = log_path.read_text(encoding='utf8', errors='strict')
            expected_argv = [str(EDITOR), '-batchmode', '-nographics', '-quit', '-projectPath', str(project),
                             '-executeMethod', 'LastStandShopChecks.' + method, '-logFile', str(log_path)]
            actual = invocation.get('argv', [])
            need(len(actual) == len(expected_argv) and all(
                 Path(left).resolve() == Path(right).resolve() if index in (0, 5, 9) else left == right
                 for index, (left, right) in enumerate(zip(actual, expected_argv)))
                 and Path(invocation.get('cwd', '')).resolve() == worktree.resolve()
                 and invocation.get('unity_sha256') == digest(EDITOR), 'wrong ' + method + ' invocation/tool binding')
            need(type(result.get('exit')) is int and result['exit'] == 0 and result.get('timed_out') is False
                 and result.get('source_unchanged') is True, 'failed or unfinished ' + method)
            need(invocation.get('source_sha256') == result.get('source_sha256_after') == sources,
                 'stale or incomplete ' + method + ' compiled source inventory')
            need(all(digest(directory / 'source-archive' / name) == sha for name, sha in sources.items()),
                 'changed ' + method + ' archived source')
            assemblies = result.get('compiled_assemblies_sha256', {})
            need(set(assemblies) == {'Assembly-CSharp.dll', 'Assembly-CSharp-Editor.dll'} and all(
                 digest(directory / 'compiled-assemblies' / name) == sha for name, sha in assemblies.items()),
                 'missing or changed ' + method + ' compiled assemblies')
            lines = log.splitlines()
            need(result.get('log_sha256') == digest(log_path) and lines.count('ST_LS_SHOP_COMPILED') == 1
                 and all(lines.count('ST_LS_SHOP_PASS ' + name) == 1 for name in names)
                 and not any('ST_LS_SHOP_FAIL' in line or 'error CS' in line for line in lines),
                 'missing/failed ' + method + ' named actual checks')
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise AssertionError('RECOVERY_COMPILED: unreadable or malformed bound artifacts') from error
    return value


def _verify_recovery_method(report):
    _recovery_need(isinstance(report, dict) and report.get('schema') == 'singedterra-shop-recovery/v2'
                   and report.get('verification_method') == 'compiled-and-browser/v1',
                   'RECOVERY_METHOD: current conjunctive compiled/browser method is required')
    _verify_recovery_compiled(report.get('compiled_boundaries'))


def _verify_recovery_confirmation(case, desired, events, action, label, publications=None):
    """Application reads, never observer snapshots, authorize publication."""
    recovered = case['recovered']
    candidates = publications or (recovered['state'], recovered['shop'])
    publication = min(candidates, key=lambda row: (row['t'], row.get('order', 0)))
    identity = (action['load'], action['timeOrigin'])
    before_publication = lambda row: (row['t'], row.get('order', 0)) < (publication['t'], publication.get('order', 0))
    successful = [row for row in events if (row.get('load'), row.get('timeOrigin')) == identity
                  and row.get('mode') == 'pass' and action['before'] <= row['t'] and before_publication(row)]
    candidate_writes = [row for row in events if row.get('op') == 'set' and row.get('value') is not None
                        and (row.get('load'), row.get('timeOrigin')) == identity
                        and before_publication(row) and json.loads(row['value']) == desired]
    raw = candidate_writes[-1]['value'] if candidate_writes else None
    # Uncertain candidates can be reconciled without writing again. The raw
    # candidate still comes from the actual earlier application write attempt.
    reads = [row for row in successful if row.get('op') == 'get' and row.get('outcome') == 'return'
             and row.get('value') == row.get('actual') == raw and raw is not None
             and any(write.get('outcome') == 'stored' and write.get('actual') == raw
                     and (write['t'], write.get('order', write.get('seq', 0))) <
                         (row['t'], row.get('order', row.get('seq', 0))) for write in candidate_writes)]
    if case['fault'] == 'denied':
        reads = [read for read in reads if any(write.get('op') == 'set' and write.get('outcome') == 'stored'
                 and write.get('actual') == write.get('value') == raw
                 and (write['t'], write.get('seq', 0)) < (read['t'], read.get('seq', 0))
                 for write in successful)]
    _recovery_need(bool(reads), 'RECOVERY_CONFIRMATION: ' + label)
    return reads[-1]


def _verify_recovery_pointer_target(action, layout, pair):
    """Project the observed named control into the measured canvas rectangle."""
    name, canvas = action['name'], action.get('canvas', {})
    _recovery_need(all(type(canvas.get(key)) in (int, float) and math.isfinite(canvas[key])
                       for key in ('x', 'y', 'width', 'height', 't'))
                   and canvas['width'] > 0 and canvas['height'] > 0
                   and (canvas.get('load'), canvas.get('timeOrigin'), canvas.get('layoutSeq')) ==
                       (layout['load'], layout['timeOrigin'], layout['seq'])
                   and layout['t'] <= canvas['t'] <= action['before'], 'RECOVERY_CONTROL_GEOMETRY: ' + name)
    targets = [row for row in layout['controls'] + layout['shopControls']
               if row['name'] == name and row['active'] and row['interactable']]
    _recovery_need(len(targets) == 1, 'RECOVERY_CONTROL_TARGET: ' + name)
    target = targets[0]
    x = canvas['x'] + target['x'] * canvas['width'] / layout['width']
    y = canvas['y'] + target['y'] * canvas['height'] / layout['height']
    width = target['width'] * canvas['width'] / layout['width']
    height = target['height'] * canvas['height'] / layout['height']
    _recovery_need(len(pair) == 2 and all(type(row.get('x')) in (int, float) and type(row.get('y')) in (int, float)
                   and x <= row['x'] <= x + width and y <= row['y'] <= y + height for row in pair),
                   'RECOVERY_CONTROL_TARGET: ' + name)


def _verify_recovery_catchup_purchase(report, records):
    """Require debt actually observed before or inside the real Buy handler."""
    game = report.get('gameplay', {})
    boundary = game.get('catchup_purchase', {})
    pending, settled = boundary.get('pending', {}), boundary.get('settled', {})
    attempt, result = boundary.get('attempt', {}), boundary.get('result', {})
    _recovery_need(boundary.get('status') == 'observed' and pending.get('catchingUp') is True
                   and pending.get('paused') is False and pending.get('status') == 'Running'
                   and pending.get('callbackSteps') == 128
                   and pending in records.get('encounters', []) and settled in records.get('encounters', [])
                   and attempt in report.get('actions', []) and result in records.get('purchases', [])
                   and boundary.get('before') in records.get('shopStates', []),
                   'RECOVERY_PENDING_DEBT: genuine pending purchase boundary is missing')
    following = [row for row in records['encounters'] if row['load'] == pending['load']
                 and row['t'] > pending['t'] and not row['catchingUp']]
    _recovery_need(pending['load'] == settled['load'] == attempt['load'] == result['load']
                   and pending['timeOrigin'] == settled['timeOrigin'] == attempt['timeOrigin'] == result['timeOrigin']
                   and attempt['name'] == result['actionId'] == 'ShopCard_fieldRepairBuy'
                   and result['mode'] == 'Run' and result['intentRunId'] == game['deploy']['runId']
                   and pending['t'] <= result['t'] and attempt['before'] < attempt['pointer_up_t'] <= result['t']
                   and attempt['pointer_up_t'] < settled['t'] and following and following[0] == settled
                   and not settled['paused'] and settled['status'] == 'Running'
                   and pending['tick'] < settled['tick'] and settled['callbackSteps'] <= 128,
                   'RECOVERY_PENDING_DEBT: Buy did not arrive before actual debt settlement')
    rows = [row for row in records['combat'] if row['load'] == pending['load']
            and boundary['before']['tick'] < row['tick'] <= settled['tick']]
    _recovery_need(rows and all(row['model']['repairAmount'] == 3 for row in rows),
                   'RECOVERY_PENDING_DEBT: old elapsed steps used new stats')
    accepted = game['purchase']
    complete = result['accepted'] is True and result == accepted and settled['t'] <= result['t']
    refused = result['accepted'] is False and result['chargedScrap'] == 0 \
        and result['refusal'] in ('CatchingUp', 'StaleVersion') and result['t'] < settled['t']
    _recovery_need(accepted['accepted'] is True and accepted['t'] >= settled['t']
                   and accepted['tick'] >= settled['tick'] and (complete or refused),
                   'RECOVERY_PENDING_DEBT: unresolved attempt charged or queued an effect')


def _verify_recovery_purchase_boundary(report, records):
    """A caught-up browser Buy never masquerades as the compiled debt case."""
    game = report['gameplay']; boundary = game.get('purchase_boundary', {})
    if boundary.get('kind') == 'pending-debt':
        _verify_recovery_catchup_purchase(report, records)
        return
    observed = boundary.get('encounter', {})
    action, result = report['actions'][game['purchase_action']], game['purchase']
    _recovery_need(boundary.get('kind') == 'caught-up' and not game.get('catchup_purchase')
                   and observed in records.get('encounters', []) and observed.get('catchingUp') is False
                   and observed.get('status') == 'Running'
                   and observed.get('load') == action['load'] == result['load']
                   and observed.get('timeOrigin') == action['timeOrigin'] == result['timeOrigin']
                   and observed['t'] <= action['before'] < action['pointer_up_t'] <= result['t']
                   and observed['tick'] <= result['tick']
                   and not any(row.get('catchingUp') for row in records['encounters']
                               if row['load'] == action['load'] and action['before'] <= row['t'] <= result['t']),
                   'RECOVERY_PURCHASE_BOUNDARY: caught-up input is missing, stale or actually pending')


def _verify_recovery_permanent_levels(state):
    keys = ('cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair')
    levels = state.get('permanentLevels')
    _recovery_need(isinstance(levels, list) and len(levels) == len(keys)
                   and all(type(value) is int and 0 <= value <= 3 for value in levels),
                   'RECOVERY_PROJECTION: missing or malformed committed permanent levels')
    return dict(zip(keys, levels))


def _verify_recovery_shop_projection(shop, records):
    levels = _verify_recovery_permanent_levels(shop)
    cards = shop.get('cards')
    _recovery_need(isinstance(cards, list), 'RECOVERY_PROJECTION: missing cards')
    if cards:
        _recovery_need(len(cards) == 6 and {row.get('key') for row in cards} == set(levels)
                       and all(type(row.get('trackId')) is int and row['trackId'] == list(levels).index(row['key'])
                               and type(row.get('p')) is int and row['p'] == levels[row['key']] for row in cards),
                       'RECOVERY_PROJECTION: incomplete or inconsistent rendered Shop cards')
        return levels
    # The HUD deliberately removes its card projection in result/blocked and
    # intermediate deployment phases. The independently emitted committed
    # levels remain observable; actual controls/state must confirm no spending.
    same = lambda row: row.get('load') == shop.get('load') and row.get('timeOrigin') == shop.get('timeOrigin')
    layouts = [row for row in records.get('controlsOnly', []) if same(row) and row['seq'] < shop['seq']]
    following = [row for row in records.get('states', []) if same(row) and row['seq'] > shop['seq']]
    layout, state = layouts[-1] if layouts else {}, following[0] if following else {}
    _recovery_need(shop.get('open') is False and shop.get('spendable') is False and shop.get('mode') == 'Permanent'
                   and shop.get('phase') in ('garage', 'workshop', 'result', 'settling', 'save-error')
                   and layout.get('phase') == state.get('phase') == shop['phase']
                   and layout.get('shopControls') and not any(row.get('active') and row.get('interactable') for row in layout['shopControls'])
                   and state.get('wallet') == shop.get('salvage') and state.get('level') == levels['cannonAttack']
                   and layout['t'] <= shop['t'] <= state['t'] and state['t'] - layout['t'] <= 1000
                   and not any(same(row) and shop['seq'] < row['seq'] < state['seq'] for row in records.get('shopStates', [])),
                   'RECOVERY_PROJECTION: empty cards lack current closed nonspendable state and controls')
    return levels


def _verify_recovery_terminal_away_start(report, records):
    game = report.get('terminal_case', {})
    ready = game.get('pre_hide', {})
    deploy, observed, clock = (ready.get(name, {}) for name in ('deploy', 'encounter', 'clock'))
    ledger, defeat = game.get('deploy', {}), game.get('defeat', {})
    begin = game.get('terminal_away', {}).get('begin', {})
    _recovery_need(deploy in records.get('encounters', []) and observed in records.get('encounters', [])
                   and defeat in records.get('encounters', []) and clock in records.get('clocks', [])
                   and begin in records.get('clocks', []) and ledger,
                   'RECOVERY_TERMINAL_START: actual pre-hide observations are missing')
    _recovery_need(all(row.get('load') == ledger.get('load') and row.get('timeOrigin') == ledger.get('timeOrigin')
                      for row in (deploy, observed, clock, begin, defeat))
                   and deploy.get('action') == 'deploy' and deploy.get('tick') == 0
                   and deploy.get('run') == observed.get('run') == defeat.get('run')
                   and observed.get('status') == 'Running' and observed.get('failed') is False
                   and observed.get('paused') is False and observed.get('catchingUp') is False
                   and 0 <= observed.get('callbackSteps', -1) <= 128
                   and 100 <= observed.get('hp', -1) < 120 and observed.get('kills', 0) > 0
                   and 0 < observed.get('tick', -1) < defeat.get('tick', -1)
                   and observed.get('documentHidden') is False and observed.get('documentFocused') is True
                   and clock.get('hidden') is False and clock.get('focused') is True
                   and begin.get('hidden') is True and begin.get('focused') is False
                   and defeat.get('documentHidden') is True and defeat.get('documentFocused') is False
                   and deploy['t'] <= ledger['t'] <= observed['t'] <= clock['t'] <= begin['t'] < defeat['t']
                   and clock['t'] - observed['t'] <= 1000 and begin['t'] - clock['t'] <= 2000,
                   'RECOVERY_TERMINAL_START: pre-hide combat is stale, terminal, foreign or unsettled')
    current = [row for row in records['encounters'] if row.get('load') == ledger['load']
               and row.get('timeOrigin') == ledger['timeOrigin'] and row.get('t', -1) <= clock['t']]
    _recovery_need(current and current[-1] == observed,
                   'RECOVERY_TERMINAL_START: pre-hide combat is not the current observation')


def _verify_recovery_terminal_boundaries(report, records, native):
    game = report.get('terminal_case', report.get('gameplay', {}))
    defeat, final = game.get('defeat', {}), game.get('final_step', {})
    combat = final.get('combat', {})
    mixed = report.get('schema') == 'singedterra-shop-recovery/v2'
    _recovery_need(combat in records.get('combat', []) and combat.get('tick') == defeat.get('tick')
                   and combat.get('load') == defeat.get('load')
                   and (mixed or any(row.get('kind') in ('Cannon', 'Launcher') and row.get('killed') is True
                           for row in combat.get('events', []))),
                   'RECOVERY_FINAL_STEP_KILL: actual terminal-step kill is missing')
    deploy, terminal = game['deploy'], game['terminal']
    killed = {(row['tick'], event['slot']) for row in records['combat'] if row['load'] == combat['load']
              and row['runId'] == deploy['runId'] and row['tick'] <= combat['tick'] for event in row['events']
              if event['kind'] in ('Cannon', 'Launcher') and event['killed']}
    accounting = terminal['finalAccounting']
    spent = sum(row['result']['chargedScrap'] for row in game['purchases'] if row['result']['accepted']) if mixed else 25
    _recovery_need(combat['runId'] == deploy['runId'] == accounting['runId']
                   and combat['t'] <= defeat['t'] <= terminal['t']
                   and defeat['action'] == 'terminal' and defeat['status'] == 'Defeated' and not defeat['failed']
                   and defeat['hp'] == 0 and 0 < defeat['tick'] < 3600
                   and defeat['t'] - deploy['t'] >= defeat['tick'] * 50 - 100
                   and terminal['hasFinalAccounting'] and not terminal['open'] and terminal['scrap'] == 0
                   and len(killed) == defeat['kills'] == accounting['uniqueKills']
                   and accounting['earnedScrap'] == 3 * len(killed) and accounting['spentScrap'] == spent
                   and accounting['finalScrap'] == 3 * len(killed) - spent,
                   'RECOVERY_FINAL_STEP_KILL: final kill was omitted or credited twice')
    prior = game['before']['storage']['data']
    expected = dict(prior, nextRunId=deploy['runId'] + 1,
                    pendingDefeat={'runId': deploy['runId'], 'elapsedTicks': defeat['tick'], 'kills': defeat['kills'], 'reward': 1})
    claimed = dict(expected, credits=prior['credits'] + 1, pendingDefeat=None, lastFinalizedRunId=deploy['runId'])
    _recovery_need(game['result']['storage']['data'] == expected and game['claimed']['storage']['data'] == claimed
                   and game['result']['state']['wallet'] == prior['credits']
                   and game['claimed']['state']['wallet'] == prior['credits'] + 1,
                   'RECOVERY_FINAL_STEP_KILL: final reward does not include exactly the terminal kill')
    if native:
        away = game.get('terminal_away', {})
        begin, end, returned = (away.get(name, {}) for name in ('begin', 'end', 'returned'))
        _recovery_need(away.get('status') == 'observed' and defeat.get('documentHidden') is True
                       and defeat.get('documentFocused') is False and begin.get('hidden') is end.get('hidden') is True
                       and begin.get('focused') is end.get('focused') is False
                       and begin.get('timeOrigin') == end.get('timeOrigin') == returned.get('timeOrigin') == defeat['timeOrigin']
                       and begin.get('load') == end.get('load') == returned.get('load') == defeat['load']
                       and begin['t'] <= defeat['t'] <= end['t'] < returned['t']
                       and returned.get('hidden') is False and returned.get('focused') is True
                       and all(row in records.get('clocks', []) for row in (begin, end, returned)),
                       'RECOVERY_UNFOCUSED_TERMINAL: actual hidden completion is missing')
        events = away.get('events', [])
        _recovery_need(events and all(row in records.get('input', []) and row.get('load') == begin['load']
                                     and row.get('timeOrigin') == begin['timeOrigin'] for row in events)
                       and any(row.get('globalTarget') is True and row.get('kind') == 'visibilitychange'
                               and row.get('hidden') is True and row.get('focused') is False and row['t'] <= begin['t'] for row in events)
                       and any(row.get('globalTarget') is True and row.get('kind') in ('focus', 'visibilitychange')
                               and row.get('hidden') is False and row.get('focused') is True and end['t'] <= row['t'] <= returned['t'] for row in events),
                       'RECOVERY_UNFOCUSED_TERMINAL: actual hidden/return transitions are missing')
        staged = away.get('staged', {})
        _recovery_need(all(staged.get(name) in records.get(collection, []) for name, collection in
                           (('state', 'states'), ('shop', 'shopStates'), ('storage', 'storage'), ('clock', 'clocks')))
                       and staged['state']['wallet'] == prior['credits'] and staged['storage']['data'] == expected
                       and staged['shop']['hasFinalAccounting'] is True and staged['shop']['scrap'] == 0
                       and staged['shop']['finalAccounting'] == accounting and staged['clock']['hidden'] is True
                       and staged['clock']['focused'] is False and defeat['t'] <= staged['storage']['t'] <= end['t']
                       and end['t'] < report['actions'][game['claim_action']]['before'],
                       'RECOVERY_UNFOCUSED_TERMINAL: hidden completion auto-claimed or redeployed')


def verify_shop_recovery(report, require_native=False):
    """Admit real storage/Pause evidence without promoting it to native proof.

    Compatibility fixtures are explicitly bounded to old records and conflict.
    The combat ledger must originate from a later null save and actual kills.
    Every effect is tied to its emitted witness, actual storage call and pointer.
    """
    def need(condition, message):
        if not condition:
            raise AssertionError(message)

    _verify_recovery_method(report)
    native = report.get('execution_mode') == 'native'
    need(report.get('native_qualified') is native and report.get('native_window_focus_claim') is native
         and (native or not require_native and not report.get('native_intervals')),
         'Genuine native blur/hidden qualification is required; emulated native evidence is inadmissible')
    need(report.get('limitations') == ([] if native else ['Native blur/hidden browser observations remain unqualified.']),
         'Native qualification limits are missing')
    need(report.get('status') == 'pass' and report.get('cleanup') == 'complete'
         and report.get('normal_speed') is True and report.get('owner_acceptance') is False
         and not report.get('observer_failure') and not report.get('cleanup_error'), 'Incomplete recovery or owned cleanup')
    launch = report.get('browser_launch', {})
    need(report.get('execution_mode') == launch.get('launch_mode') == ('native' if native else 'shop-headless')
         and launch.get('args', []).count('--headless=new') == (0 if native else 1)
         and launch.get('focus') == ('native default context, noDefaults:true' if native else 'headless actual document, noDefaults:true')
         and report.get('storage_scope') == 'fresh task-owned isolated profile', 'Recovery browser is not declared isolated Chrome')
    need(report.get('fixture_scope') == 'v1 compatibility and storage conflict only; fresh unseeded gameplay follows',
         'Unbounded recovery fixtures')
    worktree = ROOT.parent
    manifest_path = worktree / 'client/public/last-stand/asset-manifest.json'
    manifest = json.loads(manifest_path.read_bytes())
    documentary_path = ROOT / 'docs/last-stand-mechanics-shop/shop-native-binding.json'
    documentary = json.loads(documentary_path.read_bytes())
    expected = {'manifest_sha256': digest(manifest_path), 'receipt_sha256': digest(worktree / manifest['source']['receipt']),
                'shop_binding_sha256': digest(documentary_path), 'source_lock_sha256': manifest['source']['sourceLockSha256'],
                'source_inventory_sha256': manifest['source']['sourceInventorySha256'], 'build': manifest['source']['build']}
    binding = report.get('binding', {})
    need(all(binding.get(key) == value for key, value in expected.items())
         and documentary['package']['manifestSha256'] == expected['manifest_sha256']
         and documentary['package']['sanitizedReceiptSha256'] == expected['receipt_sha256'], 'Stale recovery runtime/export binding')
    paths = ('e2e/helpers/lastStandJourney.mjs', 'scripts/last-stand-playable-loop.mjs',
             'campaign-unity/Tools/verify_last_stand_loop.py', 'campaign-unity/Tools/last_stand_shop/test_shop_player.py',
             'campaign-unity/Tools/last_stand_shop/test_shop_journey_guards.py')
    need(binding.get('input_files') == {name: digest(worktree / name) for name in paths}, 'Recovery source changed')
    served = dict(manifest['files'], **{'index.html': manifest['wrapperSha256'], 'asset-manifest.json': expected['manifest_sha256']})
    need(set(binding.get('served', {})) == set(served) and all(binding['served'][key].get('sha256') == value
         and binding['served'][key].get('bytes', 0) > 0 for key, value in served.items()), 'Incomplete served recovery payload')
    need(set(binding.get('validation', {})) == {'verify-last-stand-source.mjs', 'verify-last-stand.mjs'}
         and all(binding['validation'].values()), 'Recovery source admission absent')
    need(report.get('checks') and all(item.get('pass') is True for item in report['checks']), 'Failed recovery checks')
    need(all(report.get('browser_evidence', {}).get(key) == [] for key in ('consoleErrors', 'requestErrors', 'httpErrors')),
         'Unresolved recovery browser errors')
    records = report.get('records', {})
    tags = {'ST_LS_SHOP_STATE ': 'shopStates', 'ST_LS_SHOP_PURCHASE ': 'purchases', 'ST_LS_SHOP_COMBAT ': 'combat',
            'ST_LS_STATE ': 'states', 'ST_ENC_STATE ': 'encounters', 'ST_LS_HUD_LAYOUT ': 'controlsOnly'}
    need(all(isinstance(records.get(key), list) and records[key] for key in (*tags.values(), 'runtime', 'input', 'storage', 'storageEvents', 'clocks')),
         'Missing actual recovery observations')
    origins, derived = {}, {key: [] for key in tags.values()}
    for seq, observation in enumerate(records['runtime']):
        load = observation.get('load')
        need(observation.get('seq') == seq and type(load) is int and load > 0
             and all(type(observation.get(key)) in (int, float) and math.isfinite(observation[key])
                     for key in ('t', 'timeOrigin')), 'Invalid recovery observation identity')
        need(origins.setdefault(load, observation['timeOrigin']) == observation['timeOrigin'], 'Recovery document clock changed')
        for tag, key in tags.items():
            if tag not in observation.get('text', ''):
                continue
            value = json.loads(observation['text'].split(tag)[1].split('\n')[0])
            if key == 'controlsOnly':
                need(isinstance(value.pop('graphics'), list), 'Recovery controls lack their complete raw tail')
                value.update(observationScope='complete-controls-only', graphicsTruncated=False, raw=observation['text'])
                need(value['coordinates'] == 'top-left' and value['width'] > 0 and value['height'] > 0
                     and len(value['controls']) == 8 and len(value['shopControls']) == 11, 'Incomplete recovery controls')
            value.update({field: observation[field] for field in ('seq', 'load', 't', 'timeOrigin', 'order', 'documentHidden', 'documentFocused')})
            derived[key].append(value)
    need(all(records[key] == value for key, value in derived.items()), 'Recovery witness differs from raw runtime emission')
    need(set(origins) == set(range(1, max(origins) + 1)) and len(set(origins.values())) == len(origins), 'Missing or replayed recovery document')
    for seq, event in enumerate(records['storageEvents']):
        need(event.get('seq') == seq and event.get('load') in origins
             and event.get('timeOrigin') == origins[event['load']], 'Storage event document differs')
        raw = event.get('emittedRaw', '')
        need(type(event.get('order')) is int and raw.startswith('ST_TEST_STORAGE ')
             and event == dict(json.loads(raw[16:]), load=event['load'], seq=seq, order=event['order'], emittedRaw=raw),
             'Storage event differs from raw bridge observation')
    need(records.get('geometry'), 'Missing measured recovery canvas geometry')
    for geometry in records['geometry']:
        raw = geometry.get('emittedRaw', '')
        need(raw.startswith('ST_TEST_GEOMETRY ') and geometry.get('load') in origins
             and geometry['timeOrigin'] == origins[geometry['load']]
             and geometry == dict(json.loads(raw[17:]), load=geometry['load'], emittedRaw=raw),
             'Recovery geometry differs from actual document measurement')
    keys = {'cannonAttack', 'launcherAttack', 'hullCapacity', 'armor', 'cannonCycle', 'fieldRepair'}
    for item in records['storage']:
        need(item.get('data') == (None if item.get('raw') is None else json.loads(item['raw'])), 'Storage bytes differ from witness')
        need(any(event.get('op') == 'snapshot' and all(event.get(key) == item[key]
                 for key in ('label', 'raw', 'load', 't', 'timeOrigin')) for event in records['storageEvents']), 'Detached storage snapshot witness')
        value = item['data']
        if value is not None and value.get('version') == 2:
            need(set(value) == {'version', 'credits', 'permanentLevels', 'nextRunId', 'lastFinalizedRunId', 'pendingDefeat'}
                 and set(value['permanentLevels']) == keys
                 and all(type(level) is int and 0 <= level <= 3 for level in value['permanentLevels'].values()),
                 'Temporary or unknown state persisted in storage')
        elif value is not None:
            need(set(value) == {'version', 'credits', 'permanentLevel', 'nextRunId', 'lastFinalizedRunId', 'pendingDefeat'}
                 and value['version'] == 1, 'Unknown storage fixture schema')

    def witness(value, collection, label):
        need(value in records[collection], 'Detached recovery ' + label + ' witness')

    def snapshot(value, label):
        need(isinstance(value, dict), 'Absent recovery snapshot: ' + label)
        for key, collection in (('state', 'states'), ('shop', 'shopStates'), ('storage', 'storage'), ('clock', 'clocks')):
            witness(value.get(key), collection, label + ' ' + key)
        load = value['clock']['load']
        need(all(value[key]['load'] == load and value[key]['timeOrigin'] == origins[load]
                 and value[key]['t'] <= value['clock']['t'] for key in ('state', 'shop', 'storage')),
             'Recovery snapshot mixed documents or clocks: ' + label)

    def cards(state):
        values = state.get('cards', [])
        need(len(values) == 6 and {item.get('key') for item in values} == keys, 'Incomplete recovery Shop cards')
        return {item['key']: item for item in values}

    for state in records['shopStates']:
        _verify_recovery_shop_projection(state, records)

    actions, bound, edges = report.get('actions', []), [], set()
    need(actions, 'Missing mandatory recovery actions')
    for action in actions:
        layout = next((row for row in records['controlsOnly'] if row['seq'] == action.get('layoutSeq')), None)
        need(layout is not None and action.get('load') == layout['load'] and layout['t'] <= action['before'] < action['after'],
             'Recovery action is detached from its control document')
        control = [row for row in layout['controls'] + layout['shopControls'] if row['name'] == action['name'] and row['active'] and row['interactable']]
        need(len(control) == 1, 'Recovery action did not target one enabled control')
        pair = [(index, row) for index, row in enumerate(records['input']) if row.get('load') == action['load']
                and row.get('area') == 'gameplay' and row.get('kind') in ('pointerdown', 'pointerup')
                and action['before'] <= row['t'] <= action['after']
                and abs(row.get('x', -10000) - action['x']) < 1 and abs(row.get('y', -10000) - action['y']) < 1]
        need([row['kind'] for _, row in pair] == ['pointerdown', 'pointerup']
             and all(row.get('timeOrigin') == layout['timeOrigin'] and row.get('button') == 0 and row.get('target') == 'unity-canvas'
                     and row.get('focused') is True and row.get('hidden') is False for _, row in pair), 'Actual recovery pointer pair is missing')
        need(not edges.intersection(index for index, _ in pair), 'Recovery pointer edge was reused')
        witness(action.get('canvas'), 'geometry', 'action canvas')
        need(action.get('timeOrigin') == layout['timeOrigin'] and action.get('pointer_up_t') == pair[-1][1]['t'],
             'Recovery action pointer/document identity differs')
        _verify_recovery_pointer_target(action, layout, [row for _, row in pair])
        edges.update(index for index, _ in pair)
        bound.append((action, layout, control[0], pair[-1][1]))

    used_actions = set()
    def action_at(index, name, before, following):
        need(type(index) is int and 0 <= index < len(bound) and index not in used_actions, 'Missing or reused mandatory recovery action ' + name)
        action, layout, control, up = bound[index]
        need(action['name'] == name and all(row['load'] == action['load'] and row['timeOrigin'] == layout['timeOrigin'] for row in before + following)
             and all(row['t'] <= action['before'] for row in before) and all(up['t'] <= row['t'] for row in following),
             'Mandatory recovery action/witness order differs: ' + name)
        used_actions.add(index)
        return control

    cases = report.get('storage_cases', {})
    need(set(cases) == {'migration-denied', 'claim-uncertain', 'permanent-denied', 'permanent-uncertain',
         'permanent-mismatch', 'external-conflict', 'reservation-denied', 'defeat-uncertain'}, 'Incomplete actual storage cases')
    for label, case in cases.items():
        failure, failed_shop, failed_storage = (case.get(key) for key in ('failure', 'failed_shop', 'failed_storage'))
        for value, collection in ((failure, 'states'), (failed_shop, 'shopStates'), (failed_storage, 'storage')):
            witness(value, collection, 'storage ' + label)
        need(failure['saveState'] == 'retry' and failure['saveError'], 'Unconfirmed storage published as ready: ' + label)
        snapshot(case['repeated_failure'], label + ' repeated failure')
        failure_data = failed_storage['data']
        if label == 'migration-denied':
            legacy = json.loads(case['fixture'])
            need(legacy == {'version': 1, 'credits': 2, 'permanentLevel': 1, 'nextRunId': 7, 'lastFinalizedRunId': 5,
                           'pendingDefeat': {'runId': 6, 'elapsedTicks': 120, 'kills': 2, 'reward': 1}}, 'Unexpected legacy fixture')
            need(failed_storage['raw'] == case['fixture'] and failure['wallet'] == 2 and failure['pendingRunId'] == 6
                 and _verify_recovery_permanent_levels(failed_shop) == {key: 1 if key == 'cannonAttack' else 0 for key in keys},
                 'Denied migration lost old wallet, pending reward or level')
            desired = dict(legacy)
            desired.pop('permanentLevel')
            desired.update(version=2, permanentLevels={key: 1 if key == 'cannonAttack' else 0 for key in keys})
        else:
            snapshot(case['before'], label + ' before')
            prior = case['before']['storage']['data']
            desired = json.loads(json.dumps(prior))
            need(failure['wallet'] == case['before']['state']['wallet']
                 and failure['pendingRunId'] == case['before']['state']['pendingRunId']
                 and _verify_recovery_permanent_levels(failed_shop) == prior['permanentLevels'],
                 'Unconfirmed storage changed published wallet, reward or permanent levels: ' + label)
            if label == 'claim-uncertain':
                desired.update(credits=prior['credits'] + 1, lastFinalizedRunId=prior['pendingDefeat']['runId'], pendingDefeat=None)
                action_at(case.get('action'), 'Claim', (case['before']['storage'],), (failure, failed_storage))
            elif label.startswith('permanent-') or label == 'external-conflict':
                desired['credits'] -= prior['permanentLevels']['armor'] + 1
                desired['permanentLevels']['armor'] += 1
                control = action_at(case.get('action'), 'ShopCard_armorBuy', (case['before']['shop'], case['before']['storage']), (failure, failed_storage))
                need(control['mode'] == 'Permanent' and control['trackKey'] == 'armor', 'Permanent storage fault bypassed actual Shop card')
            elif label == 'reservation-denied':
                desired['nextRunId'] += 1
                action_at(case.get('action'), 'Deploy', (case['before']['storage'],), (failure, failed_storage))
                need(failure['runId'] == 0 and not failed_shop['hasActiveLedger'], 'Unconfirmed reservation created an active run')
            else:
                game = report['gameplay']
                desired['pendingDefeat'] = {'runId': game['deploy']['runId'], 'elapsedTicks': game['defeat']['tick'],
                                          'kills': game['defeat']['kills'], 'reward': 1}
            need(failure_data == (prior if case['fault'] == 'denied' else desired), 'Actual failed storage bytes differ: ' + label)
        fault_events = [event for event in records['storageEvents'] if event['load'] == failure['load'] and event['mode'] == case['fault']
                        and event['t'] <= failed_storage['t']]
        writes = [event for event in fault_events if event['op'] == 'set']
        need(writes and json.loads(writes[-1]['value']) == desired, 'Storage fault did not reach the actual candidate write: ' + label)
        if case['fault'] == 'denied':
            need(writes[-1]['outcome'] == 'throw' and writes[-1]['actual'] == writes[-1]['before'], 'Denied storage write changed bytes')
        else:
            need(writes[-1]['outcome'] == 'stored' and writes[-1]['actual'] == writes[-1]['value'], 'Uncertain storage write was not real')
            reads = [event for event in fault_events if event['op'] == 'get' and event['t'] >= writes[-1]['t']]
            need(reads and (reads[-1]['outcome'] == 'throw' if case['fault'] == 'uncertain' else
                           reads[-1]['outcome'] == 'return' and reads[-1]['value'] != reads[-1]['actual']), 'Readback fault absent')
        repeated = case['repeated_failure']
        if label == 'external-conflict':
            snapshot(case['blocked'], 'conflict blocked')
            external = json.loads(case['external_raw'])
            need(external == dict(case['before']['storage']['data'], credits=9), 'Unexpected conflict fixture')
            for value in (case['blocked'], repeated):
                need(value['state']['saveState'] == 'blocked' and value['state']['wallet'] == failure['wallet']
                     and _verify_recovery_permanent_levels(value['shop']) == _verify_recovery_permanent_levels(failed_shop)
                     and value['storage']['raw'] == case['external_raw'], 'External conflict was overwritten or published')
            action_at(case['retry_action'], 'RetrySave', (failed_storage,), (case['blocked']['state'],))
            action_at(case['retry_failed_action'], 'RetrySave', (case['blocked']['storage'],), (repeated['state'],))
            snapshot(case['reload'], 'conflict reload')
            need(case['reload']['storage']['raw'] == case['external_raw'] and case['reload']['state']['wallet'] == 9
                 and case['reload']['storage']['data']['permanentLevels'] == external['permanentLevels'], 'Conflict reload changed external bytes')
            continue
        need(repeated['state']['saveState'] == 'retry' and repeated['state']['wallet'] == failure['wallet']
             and _verify_recovery_permanent_levels(repeated['shop']) == _verify_recovery_permanent_levels(failed_shop)
             and repeated['storage']['raw'] == failed_storage['raw'], 'Repeated failed Retry changed unconfirmed storage')
        action_at(case['retry_failed_action'], 'RetrySave', (failed_storage,), (repeated['state'],))
        recovered = case['recovered']; snapshot(recovered, label + ' recovered')
        action_at(case['retry_action'], 'RetrySave', (repeated['storage'],), (recovered['state'], recovered['storage']))
        retry = actions[case['retry_action']]
        # Any wallet or permanent-level change publishes state, including partial updates while retrying.
        publications = [row for row in records['states'] if row['load'] == retry['load']
                        and row['timeOrigin'] == retry['timeOrigin']
                        and retry['before'] <= row['t'] <= recovered['state']['t']
                        and (row['saveState'] == 'ready' or row['wallet'] != failure['wallet'])]
        publications += [row for row in records['shopStates'] if row['load'] == retry['load']
                         and row['timeOrigin'] == retry['timeOrigin']
                         and retry['before'] <= row['t'] <= recovered['shop']['t']
                         and (row['salvage'] != failed_shop['salvage'] or
                              row.get('permanentLevels') != failed_shop.get('permanentLevels') or
                              (row.get('cards') and failed_shop.get('cards') and
                               {key: card['p'] for key, card in cards(row).items()} !=
                               {key: card['p'] for key, card in cards(failed_shop).items()}))]
        _verify_recovery_confirmation(case, desired, records['storageEvents'], retry, label, publications)
        need(recovered['state']['saveState'] == 'ready' and recovered['storage']['data'] == desired
             and recovered['state']['wallet'] == desired['credits']
             and recovered['state']['pendingRunId'] == (desired['pendingDefeat']['runId'] if desired['pendingDefeat'] else 0)
             and _verify_recovery_permanent_levels(recovered['shop']) == desired['permanentLevels'],
             'Retry did not confirm exactly one storage change: ' + label)
        if 'reload' in case:
            snapshot(case['reload'], label + ' reload')
            need(case['reload']['storage']['data'] == desired and case['reload']['state']['wallet'] == desired['credits'],
                 'Storage recovery changed across reload: ' + label)

    game, pause = report['gameplay'], report['pause']
    for name in ('initial', 'closed', 'reopened', 'result', 'claimed', 'reload', 'unfinished_reload'):
        snapshot(game[name], 'gameplay ' + name)
    for name, collection in (('deploy', 'shopStates'), ('temporary_before', 'shopStates'), ('temporary_after', 'shopStates'),
                             ('purchase', 'purchases'), ('effect', 'combat'), ('defeat', 'encounters'), ('terminal', 'shopStates'), ('redeploy', 'shopStates')):
        witness(game[name], collection, 'gameplay ' + name)
    initial = game['initial']['storage']['data']
    need(initial == {'version': 2, 'credits': 0, 'permanentLevels': {key: 0 for key in keys}, 'nextRunId': 1,
                     'lastFinalizedRunId': 0, 'pendingDefeat': None}, 'Gameplay did not begin with a fresh zero record')
    fixtures = [event for event in records['storageEvents'] if event['op'] == 'fixture']
    need(len(fixtures) == 5 and fixtures[-1]['actual'] is None and fixtures[-1]['load'] < game['deploy']['load']
         and all(event['load'] < game['deploy']['load'] for event in fixtures), 'Storage fixtures leaked into gameplay')
    deploy, before, after, purchase = (game[name] for name in ('deploy', 'temporary_before', 'temporary_after', 'purchase'))
    need(deploy['tick'] == 0 and deploy['runId'] == 1 and deploy['hasActiveLedger'] and deploy['scrap'] == 0
         and all(row['p'] == row['n'] == 0 for row in cards(deploy).values()), 'Gameplay ledger was not empty')
    need(len([row for row in records['purchases'] if row['load'] == deploy['load'] and row['accepted']]) == 1 and purchase['accepted'] is True and purchase['chargedScrap'] == 5
         and purchase['intentRunId'] == deploy['runId'] and purchase['intentVersion'] == before['version']
         and purchase['intentTrackId'] == 5 and purchase['resultVersion'] == after['version'] > before['version']
         and before['scrap'] >= 5 and before['uniqueKills'] >= 2 and after['scrap'] == before['scrap'] - 5
         and after['earnedScrap'] == before['earnedScrap'] and after['spentScrap'] == before['spentScrap'] + 5
         and cards(before)['fieldRepair']['nextPrice'] == 5 and cards(after)['fieldRepair']['n'] == 1
         and cards(after)['fieldRepair']['nextPrice'] == 10, 'Recovery temporary purchase is not one earned atomic debit')
    control = action_at(game['purchase_action'], 'ShopCard_fieldRepairBuy', (before,), (purchase, after))
    need(control['mode'] == 'Run' and control['trackKey'] == 'fieldRepair', 'Recovery temporary purchase context differs')
    for state in records['shopStates']:
        if state['load'] < deploy['load']:
            continue
        if not state['hasActiveLedger'] or state['hasFinalAccounting']:
            need(state['scrap'] == 0, 'Spendable recovery funds survived teardown')
            continue
        need(state['earnedScrap'] == 3 * state['uniqueKills'] and state['scrap'] == state['earnedScrap'] - state['spentScrap'],
             'Recovery income does not conserve')
        killed = {(row['tick'], event['slot']) for row in records['combat'] if row['load'] == state['load']
                  and row['runId'] == state['runId'] and row['tick'] <= state['tick']
                  for event in row['events'] if event['kind'] in ('Cannon', 'Launcher') and event['killed']}
        need(len(killed) == state['uniqueKills'], 'Recovery Scrap lacks actual unique combat kills')
    for value in (game['closed']['shop'], game['reopened']['shop']):
        need(all(value[key] == after[key] for key in ('scrap', 'earnedScrap', 'spentScrap', 'uniqueKills', 'cards', 'runId')),
             'Shop reopen changed the paused run ledger')
    need(not game['closed']['shop']['open'] and game['reopened']['shop']['open'], 'Shop did not actually close and reopen')
    action_at(game['close_action'], 'ShopClose', (after,), (game['closed']['storage'],))
    for name, collection in (('before', 'states'), ('after', 'states'), ('resumed', 'states'), ('following', 'encounters'),
                             ('start', 'clocks'), ('end', 'clocks')):
        witness(pause[name], collection, 'Pause ' + name)
    need(pause['elapsed_ms'] == pause['end']['t'] - pause['start']['t'] >= 10000
         and pause['start']['load'] == pause['end']['load'] == deploy['load']
         and pause['start']['timeOrigin'] == pause['end']['timeOrigin']
         and pause['before']['paused'] and pause['after']['paused'] and not pause['resumed']['paused']
         and all(pause['before'][key] == pause['after'][key] == pause['resumed'][key] for key in ('tick', 'hull', 'kills')),
         'Pause counted elapsed time, changed the model, or resumed automatically')
    action_at(game['pause_action'], 'Pause', (deploy,), (pause['before'],))
    action_at(game['resume_action'], 'Pause', (pause['end'],), (pause['resumed'],))
    delta = pause['following']['tick'] - pause['resumed']['tick']
    elapsed = pause['following']['t'] - pause['resumed']['t']
    need(abs(delta - elapsed / 50) <= 1.01 and pause['following']['callbackSteps'] <= 128, 'Pause resume admitted dropped or extra clock debt')
    effect = game['effect']
    need(effect['load'] == deploy['load'] and effect['runId'] == deploy['runId'] and effect['tick'] > purchase['tick']
         and effect['model']['repairAmount'] == 4 and any(row['kind'] == 'Repair' and row['amount'] == 4 for row in effect['events']),
         'Future repaired combat effect absent')
    need(all(row['model']['repairAmount'] == 3 for row in records['combat'] if row['load'] == deploy['load'] and row['tick'] <= purchase['tick']),
         'New repair stats applied retroactively')
    defeat, terminal = game['defeat'], game['terminal']
    need(defeat['action'] == 'terminal' and defeat['status'] == 'Defeated' and defeat['hp'] == 0 and not defeat['failed']
         and 0 < defeat['tick'] < 3600 and defeat['t'] - deploy['t'] >= defeat['tick'] * 50 + pause['elapsed_ms'] - 100,
         'Recovery terminal was not a normal-speed ordinary defeat')
    accounting = terminal['finalAccounting']
    need(terminal['hasFinalAccounting'] and terminal['scrap'] == 0 and not terminal['open'] and accounting['runId'] == deploy['runId']
         and accounting['uniqueKills'] == defeat['kills'] and accounting['earnedScrap'] == 3 * defeat['kills']
         and accounting['spentScrap'] == 5 and accounting['finalScrap'] == 3 * defeat['kills'] - 5, 'Recovery terminal accounting differs')
    result_data = game['result']['storage']['data']
    need(result_data['credits'] == 0 and result_data['pendingDefeat'] == {'runId': 1, 'elapsedTicks': defeat['tick'], 'kills': defeat['kills'], 'reward': 1},
         'Ordinary defeat did not stage exactly one manual reward')
    need(len(game['refreshes']) == 3, 'Missing repeated real terminal refreshes')
    for value in game['refreshes']:
        snapshot(value, 'terminal refresh')
        need(value['storage']['data'] == result_data and value['shop']['finalAccounting'] == accounting
             and value['shop']['scrap'] == 0 and value['state']['wallet'] == 0 and value['state']['pendingRunId'] == 1,
             'Terminal refresh changed storage, replayed reward or accounting')
    action_at(game['claim_action'], 'Claim', (game['refreshes'][-1]['storage'],), (game['claimed']['state'], game['claimed']['storage']))
    claimed = dict(result_data, credits=1, pendingDefeat=None, lastFinalizedRunId=1)
    need(game['claimed']['storage']['data'] == game['reload']['storage']['data'] == claimed
         and game['claimed']['state']['wallet'] == 1, 'Manual Claim or reload duplicated the reward')
    action_at(game['redeploy_action'], 'Redeploy', (game['reload']['storage'],), (game['redeploy'],))
    need(game['redeploy']['runId'] == 2 and game['redeploy']['scrap'] == 0 and not game['redeploy']['hasFinalAccounting']
         and all(row['p'] == row['n'] == 0 for row in cards(game['redeploy']).values())
         and game['unfinished_reload']['storage']['data'] == dict(claimed, nextRunId=3)
         and not game['unfinished_reload']['shop']['hasActiveLedger'] and not game['unfinished_reload']['shop']['hasFinalAccounting'],
         'Redeploy or unfinished reload carried temporary state or replayed a reward')
    final_case = report.get('terminal_case', {})
    need(final_case, 'RECOVERY_FINAL_STEP_KILL: separate natural terminal run is missing')
    for name in ('before', 'result', 'claimed'):
        snapshot(final_case.get(name), 'final-step ' + name)
    for name, collection in (('deploy', 'shopStates'), ('defeat', 'encounters'), ('terminal', 'shopStates')):
        witness(final_case.get(name), collection, 'final-step ' + name)
    final_deploy = final_case['deploy']
    need(final_case['before']['storage']['data'] == game['unfinished_reload']['storage']['data']
         and final_deploy['runId'] == 3 and final_deploy['tick'] == final_deploy['scrap'] == 0
         and final_deploy['fitting'] == 'Repair' and all(row['p'] == row['n'] == 0 for row in cards(final_deploy).values()),
         'Natural terminal candidate did not start with earned-only funds and zero levels')
    action_at(final_case['deploy_action'], 'Redeploy', (final_case['before']['storage'],), (final_deploy,))
    candidates = final_case.get('purchases', [])
    need(isinstance(candidates, list), 'Natural terminal accepted purchase observations are missing')
    for row in candidates:
        for name, collection in (('paused', 'states'), ('resumed', 'states'), ('before', 'shopStates'), ('after', 'shopStates'), ('result', 'purchases')):
            witness(row[name], collection, 'final-step purchase ' + name)
        prior, following, result = row['before'], row['after'], row['result']
        price = cards(prior)[row['key']]['nextPrice']
        need(prior['runId'] == following['runId'] == result['intentRunId'] == 3 and result['accepted'] is True
             and result['intentVersion'] == prior['version'] and result['resultVersion'] == following['version'] > prior['version']
             and result['chargedScrap'] == price == cards(prior)[row['key']]['nextPrice']
             and prior['scrap'] >= price and following['scrap'] == prior['scrap'] - price
             and following['spentScrap'] == prior['spentScrap'] + price and following['earnedScrap'] == prior['earnedScrap']
             and all(card['p'] == 0 for card in cards(following).values())
             and cards(following)[row['key']]['n'] == cards(prior)[row['key']]['n'] + 1
             and row['paused']['paused'] is True and row['resumed']['paused'] is False
             and row['paused']['tick'] == prior['tick'] == result['tick'] == following['tick'] == row['resumed']['tick'],
             'Natural terminal candidate purchase lacks its paused earned atomic debit')
        action_at(row['pause_action'], 'Pause', (final_deploy,), (row['paused'],))
        control = action_at(row['action'], 'ShopCard_' + row['key'] + 'Buy', (prior,), (result, following))
        need(control['mode'] == 'Run' and control['trackKey'] == row['key'], 'Natural candidate Buy names another track')
        action_at(row['resume_action'], 'Pause', (following,), (row['resumed'],))
    accounted = [purchase, *[row['result'] for row in candidates]]
    boundary = game.get('catchup_purchase', {})
    if boundary.get('result') and boundary['result'] != purchase:
        accounted.append(boundary['result'])
        need(boundary['result']['accepted'] is False and boundary['result']['chargedScrap'] == 0,
             'Pending-debt attempt introduced an extra accepted purchase')
    need(len(records['purchases']) == len(accounted) and all(row in accounted for row in records['purchases']),
         'Recovery contains an unbound or repeated purchase')
    action_at(final_case['claim_action'], 'Claim', (final_case['result']['storage'],),
              (final_case['claimed']['state'], final_case['claimed']['storage']))
    for case in (game, final_case):
        ready = case.get('claim_ready', {})
        for name, collection in (('state', 'states'), ('layout', 'controlsOnly'), ('storage', 'storage')):
            witness(ready.get(name), collection, 'Claim readiness ' + name)
        state, layout, stored = (ready[name] for name in ('state', 'layout', 'storage'))
        claim = actions[case['claim_action']]
        need(state['phase'] == layout['phase'] == 'result' and state['saveState'] == 'ready'
             and state['pendingRunId'] == case['deploy']['runId']
             and stored['data'] == case['result']['storage']['data']
             and stored['data']['pendingDefeat']['runId'] == case['deploy']['runId']
             and stored['data']['pendingDefeat']['reward'] == 1
             and any(row['name'] == 'Claim' and row['active'] and row['interactable'] for row in layout['controls'])
             and all(row['load'] == claim['load'] and row['timeOrigin'] == claim['timeOrigin']
                     and case['defeat']['t'] <= row['t'] <= claim['before'] for row in (state, layout, stored)),
             'RECOVERY_CLAIM_READY: actual same-run result and Claim control were not ready')
    _verify_recovery_terminal_boundaries(report, records, native)
    _verify_recovery_purchase_boundary(report, records)
    if native:
        _verify_recovery_terminal_away_start(report, records)
        placements = report.get('native_window_placements', [])
        need(len(placements) == 2 and [item.get('role') for item in placements] == ['original', 'auxiliary-blur'],
             'Missing native owned window placement evidence')
        for item, left, width in zip(placements, (-3300, -1650), (1616, 1300)):
            need(item['requested'] == {'left': left, 'top': 10, 'width': width, 'height': 988}
                 and item['after']['windowId'] == item['before']['windowId']
                 and item['after']['bounds'] == dict(item['requested'], windowState='normal'), 'Native owned placement differs')
        preconditions = report.get('native_foreground_preconditions', [])
        need(preconditions and all(item.get('status') == 'verified' and item['document']['focused'] is True
             and item['document']['hidden'] is False and item['after']['foreground']['hwnd'] == item['window']['hwnd']
             and item['after']['foreground']['pid'] == item['owner']['root']['pid'] == launch['root']['pid']
             and item['owner']['profile'] == launch['profile'] for item in preconditions), 'Native window/document foreground assertion failed')
        inputs = [item for item in preconditions if item['role'] == 'shop-recovery-input']
        need(len(inputs) == len(actions), 'Native action precondition missing')
        for condition, (action, layout, _, _) in zip(inputs, bound):
            need(condition['kind'] == action['name'] and condition['document']['timeOrigin'] == layout['timeOrigin']
                 and condition['document']['t'] <= action['before'], 'Native action lost its actual owned foreground witness')
        activations = report.get('native_activations', [])
        need(activations and all(item.get('status') == 'verified' and item['method'] == 'owned-caption-SendInput'
             and item['activation']['accepted'] and item['activation']['input']['balanced']
             and item['activation']['snapshot']['foreground']['hwnd'] == item['window']['hwnd']
             and item['activation']['snapshot']['foreground']['pid'] == launch['root']['pid'] for item in activations),
             'Native physical activation proof absent')
        intervals = report.get('native_intervals', [])
        need([(row.get('kind'), row.get('paused')) for row in intervals] == [('blur', False), ('hidden', False), ('hidden', True)],
             'Separate native blur, hidden and explicit Pause intervals are required')
        for interval in intervals:
            need(interval.get('status') == 'pass' and not interval.get('emulated'), 'Unqualified native interval')
            for field, collection in (('before', 'encounters'), ('after', 'encounters'), ('shop_before', 'shopStates'),
                                      ('shop_after', 'shopStates'), ('begin', 'clocks'), ('end', 'clocks'), ('returned', 'clocks')):
                witness(interval.get(field), collection, 'native ' + field)
            first, last = interval['before'], interval['after']
            begin, end, returned = (interval[field] for field in ('begin', 'end', 'returned'))
            need(all(row['load'] == deploy['load'] and row['timeOrigin'] == deploy['timeOrigin'] for row in (first, last, begin, end, returned))
                 and first['run'] == last['run'] and first['t'] <= begin['t'] <= end['t'] <= returned['t']
                 and end['t'] - begin['t'] >= 10500 and first['status'] == last['status'] == 'Running',
                 'Native interval clock/run identity differs')
            need(begin['hidden'] is (interval['kind'] == 'hidden') and end['hidden'] is begin['hidden']
                 and begin['focused'] is end['focused'] is False and returned['hidden'] is False and returned['focused'] is True,
                 'Native document did not enter and leave the declared visibility state')
            events = interval.get('events', [])
            need(events and all(event in records['input'] for event in events), 'Detached native visibility events')
            transitions = [event for event in events if event.get('globalTarget') is True and first['t'] <= event['t'] <= last['t']
                           and event.get('load') == first['load'] and event.get('timeOrigin') == first['timeOrigin']]
            need(any(event.get('kind') == ('blur' if interval['kind'] == 'blur' else 'visibilitychange')
                     and event.get('focused') is False and event.get('hidden') is (interval['kind'] == 'hidden') for event in transitions)
                 and any(event.get('kind') in ('focus', 'visibilitychange') and event.get('focused') is True
                         and event.get('hidden') is False for event in transitions), 'Native loss/return event absent')
            if interval['paused']:
                need(first['paused'] and last['paused'] and first['reason'] == last['reason'] == 'user'
                     and all(first[key] == last[key] for key in ('tick', 'hp', 'kills', 'terminalElapsed'))
                     and pause['start']['t'] <= begin['t'] and end['t'] <= pause['end']['t'],
                     'Native hidden Pause advanced or resumed the model')
            else:
                need(not first['paused'] and not last['paused'] and not last['catchingUp']
                     and abs((last['tick'] - first['tick']) - (last['t'] - first['t']) / 50) <= 1.01
                     and 0 <= last['callbackSteps'] <= 128 and last['tick'] > first['tick']
                     and interval['shop_after']['earnedScrap'] > interval['shop_before']['earnedScrap']
                     and interval['shop_after']['spentScrap'] == 0 and last['t'] <= purchase['t'],
                     'Native background froze, dropped clock debt, minted income or applied a purchase early')
                need(all(row['callbackSteps'] <= 128 for row in records['encounters'] if row['load'] == first['load']
                         and first['t'] <= row['t'] <= last['t']), 'Native catch-up callback budget exceeded')
                need(all(row['model']['repairAmount'] == 3 for row in records['combat'] if row['load'] == first['load']
                         and first['tick'] < row['tick'] <= last['tick']), 'Native catch-up used newly purchased stats')
    return report


def classify_console(messages):
    """Fail closed on browser, Unity, and shader errors, including split messages."""
    errors = []
    consumed = set()
    for index, message in enumerate(messages):
        text = str(message.get('text', '')).strip()
        kind = message.get('type', '')
        if index in consumed:
            continue
        if kind == 'error':
            errors.append({'index': index, 'type': kind, 'text': text})
            continue
        if 'exception' in text.lower() or 'uncaught' in text.lower():
            errors.append({'index': index, 'type': kind, 'text': text})
            continue
        lowered = text.casefold()
        if lowered.startswith('[unitycache]') and (
                'not stored in the browser cache' in lowered or 'failed' in lowered or
                'error:' in lowered):
            errors.append({'index': index, 'type': kind, 'text': text,
                           'reason': 'Unity browser cache operation failed'})
            continue
        if text.casefold() == 'error: shader':
            error = {'index': index, 'type': kind, 'text': text}
            if index + 1 < len(messages):
                detail_message = messages[index + 1]
                detail = str(detail_message.get('text', '')).strip()
                if detail_message.get('type') == 'log' and detail:
                    error['detail'] = detail
                    consumed.add(index + 1)
            errors.append(error)
            continue
        if (lowered.startswith('error:') or 'shader is not supported' in lowered or
                ('shader' in lowered and ('error' in lowered or 'failed' in lowered))):
            errors.append({'index': index, 'type': kind, 'text': text,
                           'reason': 'unclassified error output'})

    return {
        'status': 'failed' if errors else 'pass',
        'errors': errors,
    }


def classify_request_failures(failures, messages):
    """Recognize only a 304 network abort whose same-load Unity cache read succeeded."""
    accepted, errors = [], []
    for failure in failures:
        success = (f"[UnityCache] '{failure['url']}' successfully revalidated "
                   "and served from the browser cache")
        if (failure['failure'] == 'net::ERR_ABORTED' and
                failure['response_status'] == 304 and
                failure['method'] == 'GET' and failure['resource_type'] == 'fetch' and
                failure['url'].endswith('.data') and
                any(message.get('type') == 'log' and message.get('load') == failure['load'] and
                    message.get('text') == success for message in messages)):
            accepted.append(failure)
        else:
            errors.append('request failed: ' + json.dumps(failure, sort_keys=True))
    return accepted, errors


# rAF timestamps come from the page's own clock. They measure delivered browser
# animation frames independently of CDP screencast transport and file encoding.
FRAME_PROBE = r"""(() => {
  let active = false;
  let frames = [];
  let generation = 0;
  function sample(t, current) {
    if (!active || current !== generation) return;
    if (frames.length < 30000) frames.push(t);
    requestAnimationFrame(next => sample(next, current));
  }
  window.__stFrameProbe = {
    start() {
      frames = []; active = true; generation++;
      const current = generation;
      requestAnimationFrame(t => sample(t, current));
      return performance.now();
    },
    stop() { active = false; generation++; return frames; }
  };
})()"""


def frame_timing(frames, begin, end):
    """Summarize callbacks within one named active-play window, without bridging boundaries."""
    selected = [value for value in frames if begin <= value <= end]
    require(len(selected) >= 30, 'Too few real animation frames in active-play window')
    gaps = [later - earlier for earlier, later in zip(selected, selected[1:])]
    require(all(math.isfinite(gap) and gap > 0 for gap in gaps), 'Invalid animation frame gap')
    ordered = sorted(gaps)
    return {'callbacks': len(selected), 'observed_seconds': (selected[-1] - selected[0]) / 1000,
            'median_ms': statistics.median(gaps),
            'p95_ms': ordered[math.ceil(len(ordered) * .95) - 1],
            'p99_ms': ordered[math.ceil(len(ordered) * .99) - 1],
            'max_ms': ordered[-1],
            'gaps_over_50ms': sum(gap > 50 for gap in gaps),
            'gaps_over_100ms': sum(gap > 100 for gap in gaps)}

# Test-page-only mirror of the signal actually connected to WebAudio output.
# Original connect is called first, with its original arguments and return value.
# The mirror has no path back into the game graph. Analyser samples and Opus bytes
# are captured from the same rendered signal; Unity event logs cannot fake them.
AUDIO_CAPTURE = r"""(() => {
  const original = AudioNode.prototype.connect;
  const originalDisconnect = AudioNode.prototype.disconnect;
  const captures = [];
  const byContext = new WeakMap();
  const mirrored = new WeakMap();
  const supported = typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  window.__stAudioCapture = {supported, captures, errors: []};
  if (!supported) return;
  AudioNode.prototype.connect = function(...args) {
    const result = original.apply(this, args);
    if (args[0] !== this.context.destination) return result;
    try {
      let capture = byContext.get(this.context);
      if (!capture) {
        const stream = this.context.createMediaStreamDestination();
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        const chunks = [];
        const recorder = new MediaRecorder(stream.stream, {mimeType:'audio/webm;codecs=opus'});
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = e => window.__stAudioCapture.errors.push(String(e.error || e));
        capture = {stream, analyser, recorder, chunks, samples: [], started: null};
        byContext.set(this.context, capture);
        captures.push(capture);
        const context = this.context;
        const startIfRunning = () => {
          if (context.state === 'running' && recorder.state === 'inactive' && capture.started === null) {
            capture.started = performance.now();
            recorder.start(1000);
          }
        };
        context.addEventListener('statechange', startIfRunning);
        startIfRunning();
        const values = new Float32Array(analyser.fftSize);
        capture.timer = setInterval(() => {
          analyser.getFloatTimeDomainData(values);
          let power = 0, peak = 0;
          for (const value of values) { power += value * value; peak = Math.max(peak, Math.abs(value)); }
          if (capture.samples.length < 30000)
            capture.samples.push({t:performance.now(), rms:Math.sqrt(power / values.length), peak});
        }, 20);
      }
      const outputIndex = args.length > 1 ? args[1] : 0;
      original.call(this, capture.stream, outputIndex);
      original.call(this, capture.analyser, outputIndex);
      mirrored.set(this, capture);
    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }
    return result;
  };
  AudioNode.prototype.disconnect = function(...args) {
    const result = originalDisconnect.apply(this, args);
    const capture = mirrored.get(this);
    if (!capture) return result;
    if (!args.length) { mirrored.delete(this); return result; }
    if (typeof args[0] === 'number' || args[0] !== this.context.destination) return result;
    try {
      const mirrorArgs = [capture.stream, ...args.slice(1)];
      originalDisconnect.apply(this, mirrorArgs);
      mirrorArgs[0] = capture.analyser;
      originalDisconnect.apply(this, mirrorArgs);
    } catch (error) { window.__stAudioCapture.errors.push(String(error)); }
    return result;
  };
  window.__stAudioCapture.finish = async () => {
    const result = [];
    for (const capture of captures) {
      clearInterval(capture.timer);
      if (capture.recorder.state !== 'inactive') {
        await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });
      }
      const bytes = new Uint8Array(await new Blob(capture.chunks, {type:'audio/webm'}).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 16384)
        binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      result.push({audio:btoa(binary), samples:capture.samples, started:capture.started,
        bytes:bytes.length, mime:'audio/webm;codecs=opus'});
    }
    return {supported, errors:window.__stAudioCapture.errors, captures:result};
  };
})();"""


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm'}

    def log_message(self, *args):
        pass


def build_once(output):
    require(EDITOR.is_file(), 'Pinned Unity editor missing')
    command = ['C:/Python314/python.exe', str(ROOT / 'Tools/build_web.py'), '--editor', str(EDITOR), '--scene', 'last-stand']
    completed = subprocess.run(command, cwd=ROOT.parent, capture_output=True, text=True, timeout=1500)
    (output / 'build-command.log').write_text(completed.stdout + '\n' + completed.stderr, encoding='utf-8')
    require(completed.returncode == 0, 'Last Stand build failed; inspect build-command.log')
    lines = [line[len('BUILD_EVIDENCE='):] for line in completed.stdout.splitlines() if line.startswith('BUILD_EVIDENCE=')]
    require(len(lines) == 1, 'Expected one build evidence path')
    receipt = Path(lines[0]) / 'result.json'
    require(receipt.is_file() and receipt.is_relative_to(EVIDENCE), 'Build receipt is not in task evidence')
    source = json.loads(receipt.read_text(encoding='utf-8'))
    build = Path(source['build']).resolve()
    require(source['status'] == 'pass' and build.is_relative_to(ROOT / 'Builds'), 'Build did not pass')
    require(source['scene'] == 'Assets/Scenes/LastStandPrototype.unity', 'Wrong saved scene')
    require(source['source_before'] == source['source_after'], 'Source changed during export')
    require(source['scene_before'] == source['scene_after'], 'Playable scene changed during export')
    require(source['protected_scenes_before'] == source['protected_scenes_after'], 'Protected scenes changed')
    require(source['approved_artifacts'] == {'ST-LS-LOOP-SPEC': SPEC, 'ST-LS-LOOP-PLAN': PLAN}, 'Wrong approved artifact identities')
    require(artifact_hashes(build) == source['artifacts'], 'Export bytes differ from source-bound receipt')
    for relative, expected in source['source_after']['files'].items():
        path = ROOT / relative
        require(path.is_file() and digest(path) == expected, 'Current build source differs: ' + relative)
    return receipt, build, source


def decoded_audio_energy(path, start_seconds, duration_seconds):
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-nostdin', '-i', str(path),
               '-ss', '%.3f' % max(0, start_seconds), '-t', '%.3f' % duration_seconds,
               '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', '-']
    decoded = subprocess.run(command, capture_output=True, timeout=60)
    require(decoded.returncode == 0 and len(decoded.stdout) >= 3200, 'Recorded WebAudio cannot be decoded or is too short')
    samples = array('h'); samples.frombytes(decoded.stdout)
    return {'samples': len(samples), 'rms': math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768,
            'peak': max(abs(value) for value in samples) / 32768,
            'method': 'ffmpeg decoded recorded Opus to mono 16 kHz PCM'}


class LastStandWebTests(unittest.TestCase):
    def test_defeat_buy_reload_redeploy(self):
        # The historical constants/build_once above remain immutable CP-01 helpers.
        # Normal T-06 proof consumes the already exported production runtime.
        runner = ROOT.parent / 'scripts' / 'last-stand-playable-loop.mjs'
        completed = subprocess.run(['node', str(runner)], cwd=ROOT.parent,
                                   capture_output=True, text=True, timeout=1300 if os.name == 'nt' else 660)
        print(completed.stdout, end='', flush=True)
        if completed.stderr:
            print(completed.stderr, end='', flush=True)
        self.assertEqual(completed.returncode, 0,
                         'Shared Last Stand production journey failed; inspect retained evidence')


if __name__ == '__main__':
    unittest.main()
