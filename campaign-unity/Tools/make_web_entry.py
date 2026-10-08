"""Apply the authored Web entry to one successful local Unity build."""
from pathlib import Path
import argparse
import shutil

IDENTITY = {
    'field': ('Starter Tank', 'Loading field assembly', 'Interactive starter tank scene', 'Starter Tank Art Slice'),
    'review': ('Battlefield Review', 'Loading battlefield review', 'Interactive battlefield review', 'Battlefield Review'),
    'gallery': ('Parts Gallery', 'Loading parts gallery', 'Interactive parts gallery', 'Parts Gallery'),
    'last-stand': ('Last Stand', 'Loading Last Stand', 'Interactive Last Stand', 'Last Stand Prototype'),
}
RETURN_STYLE = ''':root{--nav-height:52px}
#last-stand-nav{box-sizing:border-box;height:var(--nav-height);display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 max(16px,env(safe-area-inset-right)) 0 max(16px,env(safe-area-inset-left));border-bottom:1px solid #725b38;background:#242a26;color:#c5a25e;font-size:13px;font-weight:700;letter-spacing:.08em}
canvas{height:calc(100vh - var(--nav-height))}
#loading{top:var(--nav-height)}
#last-stand-return{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border:1px solid #a98a52;border-radius:4px;background:#303a31;color:#f2e3c5;font-size:13px;font-weight:700;letter-spacing:.02em;text-decoration:none;white-space:nowrap}
#last-stand-return:hover,#last-stand-return:focus-visible{background:#38443a;border-color:#d4b772;color:#fff3d8}
#last-stand-return:focus-visible{outline:3px solid #e7cb83;outline-offset:3px}
#last-stand-return .short{display:none}
#retry{display:none;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border:1px solid #a98a52;border-radius:4px;color:#f2e3c5;text-decoration:none}
#retry:hover,#retry:focus-visible{background:#38443a;color:#fff3d8}
#retry:focus-visible{outline:3px solid #e7cb83;outline-offset:3px}
@media(max-width:900px){#last-stand-return .full{display:none}#last-stand-return .short{display:inline}}
@media(max-width:560px){#last-stand-nav{padding-inline:10px;font-size:12px}#last-stand-return{padding:0 10px}}'''
LEGACY_BOOTSTRAP = """config.showBanner=(message,type)=>{console[type==='error'?'error':'warn'](message);if(type==='error')showError(message)};
function showError(message){document.querySelector('#loading').style.display='grid';document.querySelector('#status').textContent='Scene could not load';const e=document.querySelector('#error');e.style.display='block';e.textContent=String(message)}
createUnityInstance(canvas,config,p=>document.querySelector('#progress').value=p).then(()=>{document.querySelector('#loading').style.display='none';canvas.focus();console.info('ST_WEB_LOADED')}).catch(showError);"""
LAST_STAND_BOOTSTRAP = """config.showBanner=(message,type)=>{console[type==='error'?'error':'warn'](message);if(type==='error')showError(message)};
function showError(message){console.error('Last Stand load failed',message);document.querySelector('#loading').style.display='grid';document.querySelector('#status').textContent='Scene could not load';document.querySelector('#progress').style.display='none';const e=document.querySelector('#error');e.style.display='block';e.textContent='Last Stand could not start. Check your connection and try again.';document.querySelector('#retry').style.display='inline-flex'}
if(typeof createUnityInstance !== 'function')showError('Unity loader unavailable');
else Promise.resolve().then(()=>createUnityInstance(canvas,config,p=>document.querySelector('#progress').value=p)).then(()=>{document.querySelector('#loading').style.display='none';canvas.focus();console.info('ST_WEB_LOADED')}).catch(showError);"""

def render_web_entry(build: Path, scene: str, root: Path) -> str:
    text = (root / 'Tools/web-index-template.html').read_text(encoding='utf-8')
    for token, value in zip(('TITLE', 'LOADING', 'CANVAS_LABEL', 'PRODUCT'), IDENTITY[scene]):
        text = text.replace('__' + token + '__', value)
    last_stand = scene == 'last-stand'
    text = text.replace('__RETURN_STYLE__', RETURN_STYLE if last_stand else '')
    text = text.replace('__RETURN_LINK__',
                        '<nav id="last-stand-nav" aria-label="Last Stand navigation"><span>LAST STAND</span>'
                        '<a id="last-stand-return" href="../#campaigns/last-stand" aria-label="Return to Campaigns">'
                        '<span class="full" aria-hidden="true">← Return to Campaigns</span>'
                        '<span class="short" aria-hidden="true">← Campaigns</span></a></nav>'
                        if last_stand else '')
    text = text.replace('__RETRY_LINK__', '<a id="retry" href="">Retry</a>' if last_stand else '')
    text = text.replace('__BOOTSTRAP__', LAST_STAND_BOOTSTRAP if last_stand else LEGACY_BOOTSTRAP)
    for token, pattern in [('LOADER', '*.loader.js'), ('FRAMEWORK', '*.framework.js'),
                           ('DATA', '*.data'), ('WASM', '*.wasm')]:
        paths = list((build / 'Build').glob(pattern))
        if len(paths) != 1:
            raise SystemExit('Expected one ' + pattern)
        text = text.replace('__' + token + '__', paths[0].relative_to(build).as_posix())
    return text

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('build', type=Path)
    parser.add_argument('--scene', choices=IDENTITY, default='field')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    build = args.build.resolve()
    if not build.is_relative_to(root / 'Builds'):
        raise SystemExit('Expected task-owned build')
    text = render_web_entry(build, args.scene, root)
    original = root / 'Evidence' / ('original-index-' + build.name + '.html')
    if original.exists():
        raise SystemExit('Entry already processed; inspect before overwriting')
    shutil.copy2(build / 'index.html', original)
    (build / 'index.html').write_text(text, encoding='utf-8')
    print('Web entry prepared at ' + str(build))

if __name__ == '__main__':
    main()
