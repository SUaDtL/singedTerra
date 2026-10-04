"""Apply the authored Web entry to one successful local Unity build."""
from pathlib import Path
import argparse, shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('build',type=Path)
parser.add_argument('--scene',choices=('field','review','gallery','last-stand'),default='field')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
build=args.build.resolve()
if not build.is_relative_to(root/'Builds'):raise SystemExit('Expected task-owned build')
text=(root/'Tools/web-index-template.html').read_text(encoding='utf-8')
identity={'field':('Starter Tank','Loading field assembly','Interactive starter tank scene','Starter Tank Art Slice'),
          'review':('Battlefield Review','Loading battlefield review','Interactive battlefield review','Battlefield Review'),
          'gallery':('Parts Gallery','Loading parts gallery','Interactive parts gallery','Parts Gallery'),
          'last-stand':('Last Stand','Loading Last Stand','Interactive Last Stand','Last Stand Prototype')}[args.scene]
for token,value in zip(('TITLE','LOADING','CANVAS_LABEL','PRODUCT'),identity):
    text=text.replace('__'+token+'__',value)
for token,pattern in [('LOADER','*.loader.js'),('FRAMEWORK','*.framework.js'),('DATA','*.data'),('WASM','*.wasm')]:
    paths=list((build/'Build').glob(pattern))
    if len(paths)!=1:raise SystemExit('Expected one '+pattern)
    text=text.replace('__'+token+'__',paths[0].relative_to(build).as_posix())
original=root/'Evidence'/('original-index-'+build.name+'.html')
if original.exists():raise SystemExit('Entry already processed; inspect before overwriting')
shutil.copy2(build/'index.html',original)
(build/'index.html').write_text(text,encoding='utf-8')
print('Web entry prepared at '+str(build))
