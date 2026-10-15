"""Passive, test-page-only pointer/focus evidence. Never dispatches a game command."""
import json
SCRIPT = r"""(() => {
  let count = 0;
  function record(e) {
    if (e.type === 'pointermove' && !e.buttons) return;
    if (e.type.startsWith('key') && !['Enter','Space','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code)) return;
    if (count++ >= 4096) return;
    console.log('ST_TEST_INPUT ' + JSON.stringify({kind:e.type, time:Date.now(),
      x:e.clientX, y:e.clientY, button:e.button, buttons:e.buttons,
      code:e.code && ['Enter','Space','Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code) ? e.code : undefined,
      target:e.target && e.target.id || '', focused:document.hasFocus(), hidden:document.hidden}));
  }
  for (const kind of ['pointerdown','pointerup','pointermove','pointercancel','keydown','keyup','focus','blur','visibilitychange'])
    window.addEventListener(kind, record, {capture:true, passive:true});
})();"""
def install(page):
    records = []
    def collect(message):
        if message.text.startswith('ST_TEST_INPUT '):
            records.append(json.loads(message.text[len('ST_TEST_INPUT '):]))
    page.on('console', collect)
    page.add_init_script(SCRIPT)
    return records

def validate(records, planned):
    """Require exactly one observed primary down/up pair per declared pointer action."""
    edges = [r for r in records if r['kind'] in ('pointerdown', 'pointerup')]
    if any(r['kind'] in ('pointercancel', 'keydown', 'keyup') for r in records):
        raise ValueError('Unexpected cancel or navigation/activation-key input')
    if len(edges) != 2 * len(planned):
        raise ValueError('Observed pointer count differs from planned actions')
    for index, intended in enumerate(planned):
        for offset, kind in enumerate(('pointerdown', 'pointerup')):
            actual = edges[index * 2 + offset]
            if actual['kind'] != kind or actual['button'] != 0 or actual['target'] != 'unity-canvas':
                raise ValueError('Unexpected pointer edge/button/target')
            if not actual['focused'] or actual['hidden']:
                raise ValueError('Pointer occurred outside the visible focused test page')
            if not all(abs(actual[axis] - intended[axis]) <= .1 for axis in ('x', 'y')):
                raise ValueError('Pointer coordinates differ from the planned action')
    return {'actions': len(planned), 'observed_edges': len(edges), 'matched': True}
