"""Record owned Chrome's real CDP frame timestamps without replacing its context."""
from pathlib import Path
import base64
import json
import shutil
import subprocess
import time
from visual_review_checks import digest, frame_durations, require


class MotionCapture:
    def __init__(self, context, page, output, name):
        self.directory = Path(output) / name
        self.directory.mkdir(exist_ok=False)
        self.session = context.new_cdp_session(page)
        self.frames = []
        self.started = time.monotonic()
        self.stopped = False
        self.session.on('Page.screencastFrame', self.collect)
        self.session.send('Page.startScreencast', {'format': 'jpeg', 'quality': 88,
                          'maxWidth': 1600, 'maxHeight': 900, 'everyNthFrame': 2})

    def collect(self, event):
        try:
            if not self.stopped:
                filename = 'frame-%06d.jpg' % len(self.frames)
                (self.directory / filename).write_bytes(base64.b64decode(event['data'], validate=True))
                self.frames.append({'file': filename, 'timestamp': event['metadata']['timestamp'],
                                    'metadata': event['metadata']})
        finally:
            self.session.send('Page.screencastFrameAck', {'sessionId': event['sessionId']})

    def stop(self):
        if self.stopped:
            return
        self.session.send('Page.stopScreencast')
        self.stopped = True
        self.session.detach()
        metadata = {'method': 'CDP Page.screencastFrame from owned Chrome default context without focus emulation',
                    'playback': 'real frame timestamp durations; no simulation acceleration',
                    'wall_seconds': time.monotonic() - self.started, 'frames': self.frames}
        (self.directory / 'frames.json').write_text(json.dumps(metadata, indent=2, allow_nan=False), encoding='utf-8')

    def encode(self):
        self.stop()
        durations = frame_durations(self.frames)
        ffmpeg = shutil.which('ffmpeg')
        require(ffmpeg, 'Installed ffmpeg required to package normal-speed browser motion')
        # Filenames are generated locally above. Argument-list execution never invokes a shell.
        lines = ['ffconcat version 1.0']
        for frame, duration in zip(self.frames[:-1], durations):
            lines.extend(["file '" + frame['file'] + "'", 'option framerate 1000',
                          'duration %.9f' % duration])
        lines.extend(["file '" + self.frames[-1]['file'] + "'", 'option framerate 1000'])
        (self.directory / 'timeline.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
        destination = self.directory.with_suffix('.mp4')
        require(not destination.exists(), 'Refusing to replace an existing motion artifact')
        # Concat's default 25 fps image timebase drops real ~30 fps screencast frames.
        # Per-file 1 ms timestamps retain every captured frame at its observed time.
        # These filenames are generated above, so the concat option requires safe=0.
        command = [ffmpeg, '-hide_banner', '-nostdin', '-f', 'concat', '-safe', '0', '-i', 'timeline.txt',
                   '-fps_mode', 'vfr', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
                   '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-movflags', '+faststart', str(destination)]
        with (self.directory / 'ffmpeg.log').open('wb') as log:
            result = subprocess.run(command, cwd=self.directory, stdout=log, stderr=subprocess.STDOUT, timeout=90)
        require(result.returncode == 0 and destination.is_file(), 'Motion encoding failed; inspect raw frames/log')
        probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_frames',
                                '-show_entries', 'stream=nb_read_frames,duration', '-of', 'json', str(destination)],
                               capture_output=True, text=True, timeout=30)
        require(probe.returncode == 0, 'Could not verify encoded motion frame count')
        stream = json.loads(probe.stdout)['streams'][0]
        encoded_frames = int(stream['nb_read_frames'])
        encoded_duration = float(stream['duration'])
        require(encoded_frames == len(self.frames), 'Encoded motion dropped or duplicated real captured frames')
        require(abs(encoded_duration - sum(durations)) <= .25,
                'Encoded motion duration diverges from real frame timestamps')
        return {'path': destination.name, 'sha256': digest(destination), 'frames': len(self.frames),
                'encoded_frames': encoded_frames, 'encoded_duration_seconds': encoded_duration,
                'duration_seconds': sum(durations), 'minimum_frame_seconds': min(durations),
                'maximum_frame_seconds': max(durations), 'raw': self.directory.name + '/frames.json',
                'raw_sha256': digest(self.directory / 'frames.json'),
                'timeline_sha256': digest(self.directory / 'timeline.txt'),
                'mode': 'normal speed from recorded frame timestamps'}
