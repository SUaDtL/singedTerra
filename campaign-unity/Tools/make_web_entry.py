"""Apply the authored Web entry to one successful local Unity build."""
from pathlib import Path
import sys, shutil
root=Path(__file__).resolve().parents[1]
build=Path(sys.argv[1]).resolve()
if not build.is_relative_to(root/'Builds'):raise SystemExit('Expected task-owned build')
text=(root/'Tools/web-index-template.html').read_text(encoding='utf-8')
for token,pattern in [('LOADER','*.loader.js'),('FRAMEWORK','*.framework.js'),('DATA','*.data'),('WASM','*.wasm')]:
    paths=list((build/'Build').glob(pattern))
    if len(paths)!=1:raise SystemExit('Expected one '+pattern)
    text=text.replace('__'+token+'__',paths[0].relative_to(build).as_posix())
original=root/'Evidence'/('original-index-'+build.name+'.html')
if original.exists():raise SystemExit('Entry already processed; inspect before overwriting')
shutil.copy2(build/'index.html',original)
(build/'index.html').write_text(text,encoding='utf-8')
print('Web entry prepared at '+str(build))
