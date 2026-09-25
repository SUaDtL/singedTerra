"""Independent checks of ST-ART-01 camera geometry; no Unity control or mutation."""
import math


def vector(value, axes='xyz'):
    result = tuple(float(value[key]) for key in axes)
    if not all(math.isfinite(x) for x in result):
        raise ValueError('Non-finite geometry')
    return result


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def normalized(a):
    length = math.sqrt(dot(a, a))
    if length < 1e-9 or not math.isfinite(length):
        raise ValueError('Degenerate camera basis')
    return tuple(x / length for x in a)


def project(anchor, camera, forward, width, height, fov):
    """Perspective projection for the saved no-roll camera; bottom-left pixels."""
    forward = normalized(forward)
    right = normalized(cross((0, 1, 0), forward))
    up = cross(forward, right)
    delta = tuple(x - y for x, y in zip(anchor, camera))
    depth = dot(delta, forward)
    if depth <= 0 or not (0 < fov < 180) or min(width, height) <= 0:
        raise ValueError('Invalid projection domain')
    focal = height / (2 * math.tan(math.radians(fov) / 2))
    return (width / 2 + focal * dot(delta, right) / depth,
            height / 2 + focal * dot(delta, up) / depth)


def validate_geometry(receipt, shown, fitting, fov):
    width, height = receipt['width'], receipt['height']
    camera = vector(receipt['cameraPosition'])
    forward = vector(receipt['cameraForward'])
    parts = receipt['parts']
    if len(parts) != 3 or {p['id'] for p in parts} != {'cannon', 'hull', 'fitting'}:
        raise ValueError('Missing or duplicate part')
    expected = {'cannon': ('BarrelRecoil', 'MAIN CANNON'),
                'hull': ('Hull', 'ARMORED HULL'),
                'fitting': ('Attachment_' + fitting.title(),
                            'FIELD REPAIR UNIT' if fitting == 'repair' else 'AUXILIARY LAUNCHER')}
    errors = []
    for part in parts:
        if (part['target'], part['label']) != expected[part['id']]:
            raise ValueError('Wrong part binding or label')
        if part['visible'] is not shown:
            raise ValueError('Incorrect part visibility')
        if not shown:
            continue
        anchor = vector(part['anchorWorld'])
        projected = project(anchor, camera, forward, width, height, fov)
        endpoint = vector(part['endpointScreen'], 'xy')
        reported = vector(part['anchorScreen'], 'xy')
        error = max(math.dist(projected, endpoint), math.dist(projected, reported))
        if error > 1.5:
            raise ValueError('Endpoint does not match independent projection')
        lo, hi = vector(part['panelMin'], 'xy'), vector(part['panelMax'], 'xy')
        if not (0 <= lo[0] < hi[0] <= width and 0 <= lo[1] < hi[1] <= height):
            raise ValueError('Part panel escapes canvas')
        errors.append(error)
    return max(errors, default=0)


def camera_matches(receipt, baseline, yaw, tolerance=.02):
    """Check the real camera position, not merely the requested-yaw marker."""
    x, y, z = vector(baseline['cameraPosition'])
    angle = math.radians(yaw)
    expected = (x * math.cos(angle) + z * math.sin(angle), y,
                z * math.cos(angle) - x * math.sin(angle))
    return math.dist(expected, vector(receipt['cameraPosition'])) <= tolerance
