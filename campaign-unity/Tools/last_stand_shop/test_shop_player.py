"""Real isolated-profile Shop journeys; no currency or level injection."""
import importlib.util
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

sys.dont_write_bytecode = True
WORKTREE = Path(__file__).resolve().parents[3]
TOOLS = WORKTREE / 'campaign-unity/Tools'
sys.path.insert(0, str(TOOLS))
spec = importlib.util.spec_from_file_location('shop_actual_loop_verifier', TOOLS / 'verify_last_stand_loop.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class ShopPlayerTests(unittest.TestCase):
    presentation_runs = None
    presentation_states_run = None

    def presentation_records(self):
        """One serial pair of real runs shared by the two distinct proof readers."""
        if type(self).presentation_runs is None:
            self.presentation_writer_integrity()
            retained = os.environ.get('ST_SHOP_PRESENTATION_RECORDS')
            paths = json.loads(retained) if retained else []
            if not retained:
                output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
                output.mkdir(parents=True, exist_ok=True)
                for fitting in ('launcher', 'repair'):
                    argv = [r'C:/Program Files/nodejs/node.exe',
                            str(WORKTREE / 'scripts/last-stand-playable-loop.mjs'), '--shop-player', fitting]
                    result = subprocess.run(argv, cwd=WORKTREE,
                        env=dict(os.environ, ST_SHOP_QUALIFICATION='presentation', GIT_OPTIONAL_LOCKS='0'),
                        capture_output=True, timeout=900)
                    (output / f'presentation-{fitting}.stdout.txt').write_bytes(result.stdout)
                    (output / f'presentation-{fitting}.stderr.txt').write_bytes(result.stderr)
                    (output / f'presentation-{fitting}.command.json').write_text(json.dumps({'argv': argv, 'cwd': str(WORKTREE),
                        'qualification': 'presentation', 'base_url': os.environ.get('ST_SHOP_PLAYER_BASE_URL'),
                        'evidence_root': os.environ['ST_SHOP_EVIDENCE_ROOT'], 'exit': result.returncode}, indent=2), encoding='utf8')
                    self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))
                    found = [line.split('=', 1)[1] for line in result.stdout.decode('utf8').splitlines()
                             if line.startswith('SHOP_PLAYER_RESULT=')]
                    self.assertEqual(len(found), 1)
                    paths.extend(found)
            self.assertEqual(len(paths), 2, 'Both fitting journeys are required')
            type(self).presentation_runs = [Path(path) for path in paths]
            self.assertTrue(all(path.resolve().is_relative_to(Path(os.environ['ST_SHOP_EVIDENCE_ROOT']).resolve())
                                for path in type(self).presentation_runs), 'Presentation reports leave the released evidence root')
        # Read one full report at a time. The presentation matrix retains every
        # real graphics observation; a parsed fitting pair need not coexist.
        return type(self).presentation_runs

    def presentation_writer_integrity(self):
        """The actual streamed writer retains complete nested observation values."""
        output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
        output.mkdir(parents=True, exist_ok=True)
        script = r"""
import assert from 'node:assert/strict';
import {readFileSync,openSync,writeSync,closeSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(process.argv[1],'utf8'),start=source.indexOf('export function writeShopPresentationJson(');
const end=source.indexOf('\n// Unity',start);assert.ok(start>=0&&end>start);
const sizes=[],actual=runInNewContext('('+source.slice(start,end).replace(/^export /,'')+')',{
 openSync,closeSync,writeSync(fd,text){sizes.push(text.length);return writeSync(fd,text);}});
const rows=Array.from({length:900},(_,n)=>({seq:n,raw:'Observed glyph Î© '.repeat(180),values:[0,false,null,undefined,n+.5]}));
const expected={records:rows,missing:undefined,phase:'actual fixture',nested:{empty:[],object:{},finite:Infinity}};
actual(process.argv[2],expected);
assert.deepEqual(JSON.parse(readFileSync(process.argv[2],'utf8')),JSON.parse(JSON.stringify(expected)));
assert.ok(sizes.length>1&&sizes.every(size=>size<=1024*1024),'Writer must flush bounded complete batches');
const cyclic={};cyclic.self=cyclic;assert.throws(()=>actual(process.argv[3],cyclic),/Circular/);
console.log('PASS complete_streamed_json_unicode_nested_900_records_and_cycle_refusal');
"""
        argv = [r'C:/Program Files/nodejs/node.exe', '--input-type=module', '-e', script,
                str(WORKTREE / 'e2e/helpers/lastStandJourney.mjs'), str(output / 'writer-values.json'),
                str(output / 'writer-rejected-cycle.json')]
        result = subprocess.run(argv, cwd=WORKTREE, capture_output=True, timeout=30)
        (output / 'writer.stdout.txt').write_bytes(result.stdout)
        (output / 'writer.stderr.txt').write_bytes(result.stderr)
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))

    def presentation_state_record(self):
        if type(self).presentation_states_run is None:
            retained = os.environ.get('ST_SHOP_PRESENTATION_STATES_RECORD')
            if retained:
                path = Path(retained)
            else:
                output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
                argv = [r'C:/Program Files/nodejs/node.exe', str(WORKTREE / 'scripts/last-stand-playable-loop.mjs'), '--shop-player', 'repair']
                result = subprocess.run(argv, cwd=WORKTREE,
                    env=dict(os.environ, ST_SHOP_QUALIFICATION='presentation-states', GIT_OPTIONAL_LOCKS='0'),
                    capture_output=True, timeout=180)
                (output / 'presentation-states.stdout.txt').write_bytes(result.stdout)
                (output / 'presentation-states.stderr.txt').write_bytes(result.stderr)
                (output / 'presentation-states.command.json').write_text(json.dumps({'argv': argv, 'cwd': str(WORKTREE),
                    'qualification': 'presentation-states', 'base_url': os.environ.get('ST_SHOP_PLAYER_BASE_URL'),
                    'evidence_root': os.environ['ST_SHOP_EVIDENCE_ROOT'], 'exit': result.returncode}, indent=2), encoding='utf8')
                self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))
                found = [line.split('=', 1)[1] for line in result.stdout.decode('utf8').splitlines() if line.startswith('SHOP_PLAYER_RESULT=')]
                self.assertEqual(len(found), 1)
                path = Path(found[0])
            self.assertTrue(path.resolve().is_relative_to(Path(os.environ['ST_SHOP_EVIDENCE_ROOT']).resolve()))
            type(self).presentation_states_run = path
        path = type(self).presentation_states_run
        with path.open(encoding='utf8') as stream:
            return path, json.load(stream)

    def presentation_pixel_sensitivity(self, path, report):
        """A genuine positive frame precedes every focused negative control."""
        frame = report['presentation']['frames'][0]
        source = next(r for r in report['records']['controlsOnly'] if r['seq'] == frame['layout_seq'])
        graphics = json.loads(source['raw'].split('ST_LS_HUD_LAYOUT ', 1)[1])['graphics']
        verifier._verify_shop_frame_pixels(frame, graphics, path.parent)
        full = next(index for index, text in enumerate(frame['texts']) if text['full'])
        for defect in ('missing-contrast', 'missing-glyph', 'missing-background', 'false-pixels', 'antialias-background', '12px-text'):
            changed, changed_graphics = copy.deepcopy(frame), copy.deepcopy(graphics)
            text = changed['texts'][full]
            if defect == 'missing-contrast':
                text.pop('contrast')
            elif defect == 'missing-glyph':
                text['contrast']['core_pixels'] = 0
            elif defect == 'missing-background':
                text['contrast']['background_regions'] = 0
            elif defect == 'false-pixels':
                text['contrast']['foreground']['rgb'] = [0, 0, 0]
            elif defect == 'antialias-background':
                text['contrast']['background']['patch'] = []
            else:
                text['font_css'] = 12
                next(g for g in changed_graphics if g['path'] == text['path'])['fontCssSize'] = 12
            with self.assertRaises((ValueError, AssertionError), msg=defect):
                verifier._verify_shop_frame_pixels(changed, changed_graphics, path.parent)
            print('PASS presentation_pixel_rejection ' + defect, flush=True)
        # Exact normal-text threshold, independent of antialias selection.
        self.assertGreaterEqual(verifier._shop_normal_text_contrast([117, 117, 117], [255, 255, 255]), 4.5)
        with self.assertRaisesRegex(ValueError, 'below 4.5'):
            verifier._shop_normal_text_contrast([120, 120, 120], [255, 255, 255])
        print('PASS presentation_pixel_rejection below-4.5-normal-text', flush=True)

    def presentation_state_sensitivity(self, path, report):
        """Deleting the lower Armor evidence must invalidate a genuine state set."""
        verifier.verify_shop_presentation_states(report, path.parent)
        frames = report['presentation']['frames']
        lower = [frame for frame in frames if frame['phase'] == 'save-disabled'
                 and frame['viewport'] == {'width': 844, 'height': 390}
                 and any(text['path'].endswith('/ShopCard_armorBuyText') and text['full']
                         for text in frame['texts'])]
        changed = dict(report, presentation=dict(report['presentation'],
                       frames=[frame for frame in frames if frame not in lower]))
        print('STATE lower Armor evidence frames removed: ' + str(len(lower)), flush=True)
        with self.assertRaisesRegex(ValueError, 'Unreachable/unmeasured state text or control region'):
            verifier.verify_shop_presentation_states(changed, path.parent)
        print('PASS presentation_state_rejection missing-lower-Armor-frame', flush=True)

    def presentation_media_sensitivity(self, path, report):
        """Exercise real media bytes, retaining every positive and fault fixture."""
        import ast
        import inspect
        import shutil
        import textwrap
        import uuid

        verifier.verify_shop_media(report, path.parent)
        output = Path(os.environ['ST_SHOP_TEST_EVIDENCE']) / ('media-guards-' + report['fitting'] + '-' + uuid.uuid4().hex[:8])
        output.mkdir(parents=True, exist_ok=False)
        presentation = report['presentation']
        media = presentation['media']
        raw = json.loads((path.parent / media['raw']).read_bytes())
        # Copy just the small movie/frame proof, never the gigabyte observations.
        for name in (media['file'], media['raw']):
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path.parent / name, target)
        raw_parent = (output / media['raw']).parent
        for frame in raw['frames']:
            target = raw_parent / frame['file']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile((path.parent / media['raw']).parent / frame['file'], target)
        verifier.verify_shop_media(report, output)
        print('PASS media_genuine_positive ' + report['fitting'], flush=True)

        def changed_media(**fields):
            return dict(report, presentation=dict(presentation, media=dict(media, **fields)))

        def changed_raw(label, frames, hashes=None):
            target = raw_parent / (label + '.json')
            target.write_text(json.dumps(dict(raw, frames=frames)), encoding='utf8')
            return changed_media(raw=str(target.relative_to(output)), raw_sha256=verifier.digest(target),
                                 frame_sha256=media['frame_sha256'] if hashes is None else hashes)

        cases = []
        def add(label, changed, message, mutation=True):
            cases.append((label, changed, message, mutation))

        span = 'Movie does not span actual purchase and subsequent combat effect'
        begin = dict(presentation['media_begin'], t=report['witnesses']['temporary_purchase']['t'])
        add('purchase-outside-document-interval', dict(report, presentation=dict(presentation, media_begin=begin)), span, False)
        end = dict(presentation['media_end'], t=report['witnesses']['temporary_effect']['t'])
        add('effect-outside-document-interval', dict(report, presentation=dict(presentation, media_end=end)), span, False)
        begin = dict(presentation['media_begin'], timeOrigin=presentation['media_begin']['timeOrigin'] + 1)
        add('foreign-document', dict(report, presentation=dict(presentation, media_begin=begin)), span)
        integrity = 'Movie/frame evidence missing or changed'
        add('changed-movie-hash', changed_media(sha256='0' * 64), integrity)
        add('changed-manifest-hash', changed_media(raw_sha256='0' * 64), integrity, False)
        add('movie-outside-directory', changed_media(file=str(path.parent / media['file'])), integrity, False)
        add('manifest-outside-directory', changed_media(raw=str(path.parent / media['raw'])), integrity, False)
        count = 'Movie drops or duplicates independent captured frames'
        add('encoded-frame-count', changed_media(encoded_frames=media['frames'] - 1), count)
        timing = 'Movie is not at actual normal-speed timestamps'
        frames = list(raw['frames'])
        frames[1] = dict(frames[1], timestamp=frames[0]['timestamp'])
        add('non-increasing-timestamps', changed_raw('non-increasing', frames), timing)
        frames = list(raw['frames'])
        frames[1] = dict(frames[1], timestamp=float('nan'))
        add('nonfinite-timestamp', changed_raw('nonfinite', frames), timing, False)
        add('wrong-captured-duration', changed_media(duration_seconds=media['duration_seconds'] + 1), timing, False)
        add('short-encoded-duration', changed_media(encoded_duration_seconds=media['encoded_duration_seconds'] - 1), timing, False)
        add('wrong-speed-mode', changed_media(mode='fixed frame rate'), timing, False)
        frames = [dict(frame, timestamp=frame['timestamp'] + 100) for frame in raw['frames']]
        add('captured-frames-omit-purchase', changed_raw('outside-span', frames),
            'Actual captured frame span omits the purchase/effect')
        begin = dict(presentation['media_begin'], t=presentation['media_begin']['t'] - 2000)
        add('wrong-document-elapsed', dict(report, presentation=dict(presentation, media_begin=begin)),
            'Recorded movie elapsed time differs from real document time')
        hashes = dict(media['frame_sha256'])
        hashes.pop(raw['frames'][0]['file'])
        add('missing-frame-hash', changed_media(frame_sha256=hashes), 'Independent captured frame hashes are incomplete', False)
        hashes = dict(media['frame_sha256'], **{'unobserved-frame.jpg': '0' * 64})
        add('foreign-frame-hash', changed_media(frame_sha256=hashes), 'Independent captured frame hashes are incomplete')
        frame_integrity = 'Independent captured frame is absent or changed'
        hashes = dict(media['frame_sha256'])
        hashes[raw['frames'][0]['file']] = '0' * 64
        add('changed-independent-frame', changed_media(frame_sha256=hashes), frame_integrity)
        for label, filename in (('missing-independent-frame', 'missing-frame.jpg'),
                                ('frame-outside-directory', '../outside-frame.jpg')):
            frames = list(raw['frames'])
            original = frames[0]['file']
            frames[0] = dict(frames[0], file=filename)
            hashes = dict(media['frame_sha256'])
            hashes[filename] = hashes.pop(original)
            if label == 'frame-outside-directory':
                shutil.copyfile(raw_parent / original, output / 'outside-frame.jpg')
            add(label, changed_raw(label, frames, hashes), frame_integrity, False)
        # A genuinely encoded faster movie exercises ffprobe, not its metadata.
        faster = output / 'faster-negative.mp4'
        argv = ['ffmpeg', '-v', 'error', '-i', str(output / media['file']), '-vf', 'setpts=0.5*PTS',
                '-fps_mode', 'passthrough', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', str(faster)]
        encoded = subprocess.run(argv, capture_output=True, timeout=60)
        (output / 'faster-command.json').write_text(json.dumps({'argv': argv, 'exit': encoded.returncode}), encoding='utf8')
        (output / 'faster.stderr.txt').write_bytes(encoded.stderr)
        self.assertEqual(encoded.returncode, 0, encoded.stderr.decode('utf8', 'replace'))
        add('actual-encoded-duration', changed_media(file=faster.name, sha256=verifier.digest(faster)),
            'Actual encoded movie does not match its retained timestamped frames')

        outcomes = []
        for label, changed, message, mutation in cases:
            def rejection(check):
                with self.assertRaisesRegex(ValueError, message):
                    check(changed, output)
            rejection(verifier.verify_shop_media)
            outcome = {'case': label, 'expected_rejection': message, 'rejected': True}
            print('PASS media_rejection ' + label, flush=True)
            if mutation:
                tree = ast.parse(textwrap.dedent(inspect.getsource(verifier.verify_shop_media)))
                guards = [node for node in ast.walk(tree) if isinstance(node, ast.Call)
                          and isinstance(node.func, ast.Name) and node.func.id == 'require'
                          and len(node.args) == 2 and isinstance(node.args[1], ast.Constant) and node.args[1].value == message]
                self.assertEqual(len(guards), 1, 'One actual named safeguard per mutation')
                guards[0].args[0] = ast.Constant(value=True)
                tree = ast.fix_missing_locations(tree)
                source = ast.unparse(tree)
                (output / (label + '-mutant.py')).write_text(source, encoding='utf8')
                namespace = dict(verifier.verify_shop_media.__globals__)
                exec(compile(tree, '<removed media safeguard: ' + label + '>', 'exec'), namespace)
                with self.assertRaisesRegex(AssertionError, 'ValueError not raised'):
                    rejection(namespace['verify_shop_media'])
                outcome['removed_safeguard_killed'] = True
                print('PASS media_mutation_killed ' + label, flush=True)
            outcomes.append(outcome)
        verifier.verify_shop_media(report, path.parent)
        (output / 'outcomes.json').write_text(json.dumps({'source_report': str(path),
            'input_files': report['binding']['input_files'], 'cases': outcomes,
            'original_positive_still_passes': True}, indent=2), encoding='utf8')

    def test_shop_five_layouts_rendered_readability_and_input(self):
        fittings = set()
        for index, path in enumerate(self.presentation_records()):
            with path.open(encoding='utf8') as stream:
                report = json.load(stream)
            fittings.add(report['fitting'])
            verifier.verify_shop_presentation(report, path.parent)
            print('PASS shop_five_layouts_rendered_readability_and_input ' + report['fitting'] + ' ' + str(path), flush=True)
            if index == 0:
                self.presentation_pixel_sensitivity(path, report)
            del report
        self.assertEqual(fittings, {'launcher', 'repair'})
        path, report = self.presentation_state_record()
        verifier.verify_shop_presentation_states(report, path.parent)
        self.presentation_state_sensitivity(path, report)
        with self.assertRaisesRegex(AssertionError, 'Missing real Shop journey contract'):
            verifier.verify_shop_vertical(report)
        print('PASS shop_current_capped_and_save_disabled_presentation ' + str(path), flush=True)

    def test_shop_normal_speed_both_fitting_media(self):
        fittings = set()
        for index, path in enumerate(self.presentation_records()):
            with path.open(encoding='utf8') as stream:
                report = json.load(stream)
            fittings.add(report['fitting'])
            verifier.verify_shop_media(report, path.parent)
            if index == 0:
                self.presentation_media_sensitivity(path, report)
            print('PASS shop_normal_speed_both_fitting_media ' + report['fitting'] + ' ' + str(path), flush=True)
            del report
        self.assertEqual(fittings, {'launcher', 'repair'})

    def __str__(self):
        return f'{self._testMethodName} ({type(self).__module__}.{type(self).__qualname__})'

    def journey(self, fitting):
        node = Path(r'C:/Program Files/nodejs/node.exe')
        argv = [str(node), str(WORKTREE / 'scripts/last-stand-playable-loop.mjs'), '--shop-player', fitting]
        result = subprocess.run(argv, cwd=WORKTREE, env=dict(os.environ, GIT_OPTIONAL_LOCKS='0'),
                                capture_output=True, timeout=350)
        output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
        output.mkdir(parents=True, exist_ok=True)
        (output / f'{fitting}.stdout.txt').write_bytes(result.stdout)
        (output / f'{fitting}.stderr.txt').write_bytes(result.stderr)
        (output / f'{fitting}.command.json').write_text(json.dumps({'argv': argv, 'cwd': str(WORKTREE),
            'exit': result.returncode}, indent=2), encoding='utf8')
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))
        paths = [line.split('=', 1)[1] for line in result.stdout.decode('utf8').splitlines()
                 if line.startswith('SHOP_PLAYER_RESULT=')]
        self.assertEqual(len(paths), 1, 'Exactly one actual player result must be retained')
        path = Path(paths[0])
        self.assertTrue(path.resolve().is_relative_to(Path(os.environ['ST_SHOP_EVIDENCE_ROOT']).resolve()))
        report = json.loads(path.read_bytes())
        verifier.verify_shop_vertical(report)
        self.assertTrue(report.get('witnesses', {}).get('temporary_purchase', {}).get('accepted'),
                        'Actual earned-fund five-Scrap temporary purchase is absent from the real journey')
        self.assertEqual(report['fitting'], fitting)
        self.assertTrue(report['witnesses']['temporary_effect']['events'])
        self.assertEqual(report['witnesses']['claim_after']['credits'], 1)
        self.assertEqual(report['witnesses']['permanent_after']['credits'], 0)
        self.assertEqual(report['witnesses']['reload']['permanentLevels'][report['track']], 1)
        self.assertEqual(report['witnesses']['redeploy']['scrap'], 0)
        self.assertEqual(report['witnesses']['redeploy_card']['n'], 0)
        self.assertTrue(report['witnesses']['permanent_effect']['events'])
        print('PASS real_shop_vertical ' + fitting + ' ' + str(path), flush=True)

    def test_shop_real_launcher_vertical(self):
        self.journey('launcher')

    def test_shop_real_repair_vertical(self):
        self.journey('repair')

    def test_shop_native_focus_hidden_and_explicit_pause(self):
        """A real precondition plus the complete source-bound native scenario."""
        precondition = Path(os.environ['ST_SHOP_NATIVE_PRECONDITION'])
        report = json.loads(precondition.read_bytes())
        self.assertEqual(report.get('status'), 'pass',
                         'Native visibility remains unqualified: ' + str(precondition) + ' ' + report.get('error', ''))
        self.assertEqual(report.get('cleanup'), 'complete')
        self.assertEqual(report.get('after', {}).get('hidden'), False)
        self.assertEqual(report.get('after', {}).get('focused'), True)
        output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
        output.mkdir(parents=True, exist_ok=True)
        argv = [r'C:/Program Files/nodejs/node.exe', str(WORKTREE / 'scripts/last-stand-playable-loop.mjs'),
                '--shop-player', 'repair']
        environment = dict(os.environ, ST_SHOP_QUALIFICATION='background-native', GIT_OPTIONAL_LOCKS='0')
        environment['ST_SHOP_COMPILED_BOUNDARIES'] = json.dumps(
            verifier.bind_shop_compiled_boundaries(os.environ['ST_SHOP_COMPILED_EVIDENCE']))
        result = subprocess.run(argv, cwd=WORKTREE, env=environment, capture_output=True, timeout=600)
        (output / 'native.stdout.txt').write_bytes(result.stdout)
        (output / 'native.stderr.txt').write_bytes(result.stderr)
        (output / 'native.command.json').write_text(json.dumps({'argv': argv, 'cwd': str(WORKTREE),
            'exit': result.returncode, 'qualification': 'background-native'}, indent=2), encoding='utf8')
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))
        paths = [line.split('=', 1)[1] for line in result.stdout.decode('utf8').splitlines()
                 if line.startswith('SHOP_PLAYER_RESULT=')]
        self.assertEqual(len(paths), 1)
        path = Path(paths[0])
        self.assertTrue(path.resolve().is_relative_to(Path(os.environ['ST_SHOP_EVIDENCE_ROOT']).resolve()))
        actual = verifier.verify_shop_recovery(json.loads(path.read_bytes()), require_native=True)
        self.assertEqual(actual['verification_method'], 'compiled-and-browser/v1')
        self.assertEqual(actual['gameplay']['purchase_boundary']['kind'], 'caught-up')
        self.assertTrue(actual['terminal_case']['defeat']['documentHidden'])
        self.assertFalse(actual['terminal_case']['defeat']['documentFocused'])
        print('PASS real_shop_native_focus_hidden_pause ' + str(path), flush=True)

    def test_shop_storage_faults_conflicts_and_terminal_refresh(self):
        """Real storage bridge, actual controls, elapsed Pause and terminal lifecycle."""
        output = Path(os.environ['ST_SHOP_TEST_EVIDENCE'])
        output.mkdir(parents=True, exist_ok=True)
        argv = [r'C:/Program Files/nodejs/node.exe', str(WORKTREE / 'scripts/last-stand-playable-loop.mjs'),
                '--shop-player', 'repair']
        environment = dict(os.environ, ST_SHOP_QUALIFICATION='background-storage', GIT_OPTIONAL_LOCKS='0')
        environment['ST_SHOP_COMPILED_BOUNDARIES'] = json.dumps(
            verifier.bind_shop_compiled_boundaries(os.environ['ST_SHOP_COMPILED_EVIDENCE']))
        result = subprocess.run(argv, cwd=WORKTREE, env=environment, capture_output=True, timeout=500)
        (output / 'recovery.stdout.txt').write_bytes(result.stdout)
        (output / 'recovery.stderr.txt').write_bytes(result.stderr)
        (output / 'recovery.command.json').write_text(json.dumps({'argv': argv, 'cwd': str(WORKTREE),
            'exit': result.returncode, 'qualification': 'background-storage'}, indent=2), encoding='utf8')
        self.assertEqual(result.returncode, 0, result.stdout.decode('utf8', 'replace') + result.stderr.decode('utf8', 'replace'))
        paths = [line.split('=', 1)[1] for line in result.stdout.decode('utf8').splitlines()
                 if line.startswith('SHOP_PLAYER_RESULT=')]
        self.assertEqual(len(paths), 1)
        path = Path(paths[0])
        self.assertTrue(path.resolve().is_relative_to(Path(os.environ['ST_SHOP_EVIDENCE_ROOT']).resolve()))
        report = json.loads(path.read_bytes())
        self.assertEqual(report.get('schema'), 'singedterra-shop-recovery/v2',
                         'Actual journey omitted the requested background/storage recovery behavior')
        verifier.verify_shop_recovery(report)
        self.assertEqual(set(report['storage_cases']), {'migration-denied', 'claim-uncertain',
            'permanent-denied', 'permanent-uncertain', 'permanent-mismatch', 'external-conflict',
            'reservation-denied', 'defeat-uncertain'})
        self.assertGreaterEqual(report['pause']['elapsed_ms'], 10000)
        self.assertEqual(report['gameplay']['redeploy']['scrap'], 0)
        self.assertTrue(all(card['n'] == 0 for card in report['gameplay']['redeploy']['cards']))
        final = report['terminal_case']
        self.assertEqual(final['final_step']['combat']['tick'], final['defeat']['tick'])
        self.assertEqual(set(report['compiled_boundaries']['methods']), {'RunSettle', 'RunIncome'})
        self.assertEqual(final['terminal']['finalAccounting']['spentScrap'],
                         sum(row['result']['chargedScrap'] for row in final['purchases'] if row['result']['accepted']))
        self.assertEqual(final['claimed']['storage']['data']['credits'], 2)
        print('PASS real_shop_storage_pause_recovery ' + str(path), flush=True)
