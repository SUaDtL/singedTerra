"""Own only the performance framework's four temporary build files.

The caller must wait for its Unity child to exit before leaving this scope.
Existing assets are never accepted as disposable framework output.
"""
import hashlib
from pathlib import Path


NAMES = tuple(name + suffix for name in
              ('PerformanceTestRunInfo.json', 'PerformanceTestRunSettings.json')
              for suffix in ('', '.meta'))


def checked(path, *, directory=False):
    for parent in (path, *path.parents):
        if parent.is_symlink() or parent.is_junction():
            raise RuntimeError('Linked build-resource path: ' + str(parent))
    if path.exists() and not (path.is_dir() if directory else path.is_file()):
        raise RuntimeError('Unexpected build-resource type: ' + str(path))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class PerformanceResources:
    def __init__(self, project, *, child_exited=lambda: True):
        self.folder = Path(project) / 'Assets/Resources'
        self.meta = self.folder.with_suffix('.meta')
        self.receipt = {'status': 'not-started', 'removed': {}, 'restoredMeta': False}
        self.child_exited = child_exited

    def __enter__(self):
        checked(self.folder, directory=True)
        checked(self.meta)
        for name in NAMES:
            path = self.folder / name
            checked(path)
            if path.exists():
                raise RuntimeError('Pre-existing performance build resource: ' + str(path))
        self.existed = self.folder.exists()
        self.original_meta = self.meta.read_bytes() if self.meta.exists() else None
        self.receipt.update(status='active', directoryExisted=self.existed,
                            metaBefore=hashlib.sha256(self.original_meta).hexdigest()
                            if self.original_meta is not None else None)
        # Prevent the framework's recursive directory cleanup: this owner creates
        # the empty folder first and later removes it only with rmdir().
        self.folder.mkdir(exist_ok=True)
        return self

    def __exit__(self, kind, value, traceback):
        try:
            if not self.child_exited():
                raise RuntimeError('Unity child exit unconfirmed; build resources preserved')
            checked(self.folder, directory=True)
            checked(self.meta)
            for name in NAMES:
                checked(self.folder / name)
            for name in NAMES:
                path = self.folder / name
                if path.exists():
                    self.receipt['removed'][name] = digest(path)
                    path.unlink()
            if not self.existed and self.folder.exists():
                if any(self.folder.iterdir()):
                    raise RuntimeError('Unexpected assets in owned Resources folder; preserved')
                self.folder.rmdir()
            if self.original_meta is None:
                if self.meta.exists():
                    self.receipt['removed']['Resources.meta'] = digest(self.meta)
                    self.meta.unlink()
            elif not self.meta.exists() or self.meta.read_bytes() != self.original_meta:
                self.meta.write_bytes(self.original_meta)
                self.receipt['restoredMeta'] = True
            self.receipt['status'] = 'restored'
        except Exception as error:
            self.receipt.update(status='failed', error=str(error))
            raise
        return False
