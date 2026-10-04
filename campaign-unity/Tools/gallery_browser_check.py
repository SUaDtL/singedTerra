"""Exercise the saved gallery Web build with real Chromium pointer input.

Run: python Tools/gallery_browser_check.py <fresh-web-build> <evidence-dir>
The loopback server and browser are owned by this process and always close.
"""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time

from playwright.sync_api import sync_playwright


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def run(build, evidence):
    require((build / 'index.html').is_file(), 'Web entry missing')
    evidence.mkdir(parents=True, exist_ok=False)
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(build))
    server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    states = []
    errors = []
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            try:
                page = browser.new_page(viewport={'width': 1600, 'height': 900}, device_scale_factor=1)
                def on_console(message):
                    line = message.text
                    if line.startswith('ST_KIT_GALLERY_STATE '):
                        states.append(json.loads(line.split(' ', 1)[1]))
                    elif message.type == 'error':
                        errors.append(line)
                page.on('console', on_console)
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(url, wait_until='load', timeout=60000)
                deadline = time.monotonic() + 120
                while not states and time.monotonic() < deadline:
                    page.wait_for_timeout(250)
                require(states and states[-1]['id'] == 'STK-H01', 'initial gallery selection')
                require(page.locator('#loading').evaluate('(node) => getComputedStyle(node).display') == 'none',
                        'Web loader dismissed')
                page.screenshot(path=str(evidence / 'initial.png'))

                def click_expect(x, y, action, predicate):
                    old_count = len(states)
                    page.mouse.click(x, y)
                    deadline = time.monotonic() + 10
                    while len(states) == old_count and time.monotonic() < deadline:
                        page.wait_for_timeout(100)
                    require(len(states) > old_count and states[-1]['action'] == action and predicate(states[-1]),
                            f'{action} pointer outcome: {states[old_count:]}')

                click_expect(705, 785, 'select', lambda state: state['id'] == 'STK-T01')
                click_expect(93, 128, 'select', lambda state: state['id'] == 'STK-H01')
                click_expect(250, 819, 'list_scroll', lambda state: state['id'] == 'STK-H01')
                click_expect(250, 819, 'list_scroll', lambda state: state['id'] == 'STK-H01')
                click_expect(93, 750, 'select', lambda state: state['id'] == 'STK-S03')
                click_expect(928, 785, 'assembly', lambda state: state['id'] == 'STK-S01' and state['assembly'])
                click_expect(1225, 785, 'paint', lambda state: state['paint'] == 'SLATE')
                click_expect(590, 845, 'orbit', lambda state: abs(state['yaw'] - 2) < .01)
                click_expect(810, 845, 'orbit', lambda state: abs(state['yaw'] - 32) < .01)
                page.mouse.move(840, 480)
                page.mouse.down()
                page.mouse.move(970, 480, steps=12)
                page.mouse.up()
                require(any(state['action'] == 'orbit' and state['yaw'] > 32 for state in states),
                        'model drag orbit')
                click_expect(1030, 845, 'orbit_reset', lambda state: abs(state['yaw'] - 32) < .01)
                page.screenshot(path=str(evidence / 'assembly-slate.png'))
                require(not errors, 'browser errors: ' + repr(errors))
                (evidence / 'result.json').write_text(json.dumps({
                    'status': 'pass', 'build': str(build), 'url': url,
                    'states': states, 'errors': errors,
                    'pointer': ['next', 'list-select', 'list-page-select', 'assembly', 'paint', 'orbit-left',
                                'orbit-right', 'drag-orbit', 'reset']
                }, indent=2), encoding='utf-8')
                print('ST_KIT_GALLERY_BROWSER_PASS ' + str(evidence))
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build', type=Path)
    parser.add_argument('evidence', type=Path)
    args = parser.parse_args()
    run(args.build.resolve(), args.evidence.resolve())
