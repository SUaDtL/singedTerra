"""Validate and index existing ST-KIT-01 artifacts. Does not regenerate meshes."""
from pathlib import Path
import json,hashlib,math,datetime
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
DOC=ROOT/'docs/parts-library-01'
CAT=ROOT/'Unity/Assets/Art/PartsLibrary/catalog.json'
catalog=json.loads(CAT.read_text());unity=json.loads((ROOT/'Unity/Assets/PartsLibrary/import-receipt.json').read_text())
measures={e['id']:e for e in unity['items']}
assert len(catalog['items'])==len(measures)==20
assert len({e['id'] for e in catalog['items']})==20
for e in catalog['items']:
    assert hashlib.sha256((ROOT/e['fbx']).read_bytes()).hexdigest()==e['fbx_sha256']
    assert (ROOT/e['prefab']).is_file() and (DOC/'previews'/f"{e['id']}.png").is_file()
    assert measures[e['id']]['triangles']>0 and e['triangles']>0  # report both counts; no identity claim
    assert all(math.isfinite(v) and v>0 for v in measures[e['id']]['size'].values())
assert hashlib.sha256((ROOT/catalog['source']).read_bytes()).hexdigest()==catalog['source_sha256']
for code in unity['assemblies']:
    assert (ROOT/f'Unity/Assets/PartsLibrary/Prefabs/{code}.prefab').is_file()
    assert (DOC/'previews'/f'{code}.png').is_file()
font_path=Path('C:/Windows/Fonts/segoeui.ttf')
font=ImageFont.truetype(str(font_path),21);small=ImageFont.truetype(str(font_path),17)
title=ImageFont.truetype(str(font_path),34)
# These boards compose actual Blender renders; no font file is distributed.
board=Image.new('RGB',(2000,1570),(29,33,32));draw=ImageDraw.Draw(board)
draw.text((30,22),'singedTerra / FIELD KIT 01',font=title,fill=(210,178,106))
draw.text((30,72),'20 reusable mesh entries  |  6 retained + 14 new  |  art candidates, not an item economy',font=font,fill=(221,220,207))
for i,e in enumerate(catalog['items']):
    x=(i%5)*400+8;y=125+(i//5)*350
    image=Image.open(DOC/'previews'/f"{e['id']}.png").convert('RGB').resize((384,288))
    board.paste(image,(x,y))
    draw.text((x+5,y+294),e['id']+' / '+e['title'],font=small,fill=(236,231,210))
    draw.text((x+5,y+321),e['category']+'  |  '+format(measures[e['id']]['triangles'],',')+' tris',font=small,fill=(166,181,169))
board.save(DOC/'PARTS-CONTACT-SHEET.png')
examples=[('STK-S01','SERVICE / OLIVE'),('STK-S02','BULWARK / SLATE'),('STK-S03','FIRE SUPPORT / OXIDE')]
hero=Image.new('RGB',(1920,638),(29,33,32));draw=ImageDraw.Draw(hero)
draw.text((28,20),'One retained chassis. Three physical silhouettes.',font=title,fill=(210,178,106))
draw.text((28,68),'Assembly examples only; no class, starting loadout, rarity or upgrade rank is selected.',font=font,fill=(221,220,207))
for i,(code,label) in enumerate(examples):
    hero.paste(Image.open(DOC/'previews'/f'{code}.png').convert('RGB').resize((624,468)),(i*640+8,115))
    draw.text((i*640+22,594),code+'  /  '+label,font=font,fill=(236,231,210))
hero.save(DOC/'ASSEMBLY-CONTACT-SHEET.png')
lines=['---','document_id: ST-KIT-INDEX','document_revision: 1',
 'updated_on: 2026-09-25','repository: SUaDtL/singedTerra',
 'authoring_baseline_sha: 39e9d94bcf978e6b5a0946e5eded010e75629bc8',
 'scope: ST-KIT-01 art library, not gameplay catalogue','---','',
 '# singedTerra - Field Kit 01','',
 'Twenty reusable mesh entries, three paint finishes and three assembled examples. Six entries are extracted from the retained starter tank; fourteen are new original geometry. IDs are stable art references, not game-item, rarity, Skill or entitlement IDs.','',
 '![Assembly examples](docs/parts-library-01/ASSEMBLY-CONTACT-SHEET.png)','',
 '![All mesh entries](docs/parts-library-01/PARTS-CONTACT-SHEET.png)','',
 '## Status and scope','',
 'Blender generation and Unity import completed. Every entry has a separate FBX and Unity prefab; the source preserves editable component meshes and modifiers. The static Unity layout is available. The optional interactive gallery control append was blocked and remains unimplemented; there is no new Web build or gallery-input pass. These previews are Blender renders of actual meshes, not Unity screenshots.','',
 'Names suggest physical identities only. No damage, repair, heat, radar, movement, income, cover, inventory, purchase, unlock or new slot rules are attached. Field props are scenery; cosmetics carry no stats. Existing encounter rules and classic artillery are unchanged.','']
for category in ['Core','Gun','Module','Armor','Cosmetic','Field base']:
    lines += ['## '+category,'','| ID / preview | Piece | Art mount | Triangles | Width / height / depth, m | Files |','|---|---|---|---:|---|---|']
    for e in catalog['items']:
        if e['category']!=category: continue
        dims=' / '.join(f"{measures[e['id']]['size'][k]:.2f}" for k in 'xyz')
        lines.append(f"| [{e['id']}](docs/parts-library-01/previews/{e['id']}.png) | {e['title']} | `{e['mount']}` | {measures[e['id']]['triangles']:,} | {dims} | [FBX]({e['fbx']}) / [Prefab]({e['prefab']}) |")
    lines.append('')
lines += ['## Three assembly examples','',
 '| ID | Appearance | Reused pieces |','|---|---|---|',
 '| STK-S01 | Service, olive | H01 + T01 + U01 + G01 + M01 + C01 |',
 '| STK-S02 | Bulwark, slate | H01 + T01 + U01 + G02 + M04 + A01 + A02 + A03 |',
 '| STK-S03 | Fire support, oxide | H01 + T01 + U01 + G03 + M02 + C02 + C03 |','',
 'All abbreviated IDs above have the `STK-` prefix. Assembly prefabs are in `Unity/Assets/PartsLibrary/Prefabs/`. These are independently editable examples, not approved game classes. The three `KitPaint_Olive`, `KitPaint_Oxide`, and `KitPaint_Slate` materials tint the retained armor texture; non-armor materials keep their identity.','',
 '## Assembly and coordinate contract','',
 'Library Unity forward is -Z and up is +Y; dimensions use meters. FBX internal conversion transforms are retained inside identity wrapper prefabs. Do not replace those imported transforms with arbitrary scale=1 on every child. Art mount names are compatibility examples for this kit, not the selected hardware-slot taxonomy.','',
 '| Mount | Position in Unity | Parent |','|---|---|---|',
 '| chassis | (0, 0, 0) | assembly root |',
 '| turret-ring | (0, 1.77, 0) | assembly root; turret pose pivot |',
 '| gun-breech | (0, 0.46, -1.17) | turret pivot |',
 '| side-saddle | (1.34, 0.30, 0.40) | turret pivot |',
 '| hull-front, applique | (0, 1.14, -2.73) | assembly root |',
 '| hull-rear, rack | (0, 1.05, 2.64) | assembly root |','',
 'Cheek armor uses the turret origin. The pennant and unit plaque use the positions in `PartsLibraryImport.Assembly`. The static examples do not implement aiming, recoil, damage or interchangeable live equipment. Integrating a gun requires the existing presentation owner and explicit muzzle/recoil bindings; never infer gameplay from mesh dimensions.','']
lines += ['## Authoring and verification entry points','',
 '- Editable source: `ArtSource/PartsLibrary_01.blend`; each stable ID owns its own collection. Individual meshes/modifiers are retained. Existing original art was not replaced.',
 '- Machine-readable inventory: `Unity/Assets/Art/PartsLibrary/catalog.json`; includes provenance, source/FBX hashes, material names, mesh/triangle counts and authored bounds.',
 '- Unity measurements: `Unity/Assets/PartsLibrary/import-receipt.json`; actual transformed-vertex bounds and triangle counts, not only conservative Renderer bounds.',
 '- Static authoring layout: `Unity/Assets/PartsLibrary/PartsLibrary_Layout.unity`. Open it in Unity to inspect the 20 pieces and three assemblies. It is not the unfinished interactive gallery.',
 '- Generator: `Tools/build_parts_library.py`, run through Blender in a fresh task copy. It refuses existing library art/source outputs. Never regenerate over artist edits.',
 '- Import preparation: `PartsLibraryImport.Prepare` in `Unity/Assets/Editor/PartsLibraryImport.cs`; existing library directories are refused. Normal use loads saved prefabs rather than regenerating.',
 '- Preview and index tools: `Tools/render_parts_library.py` and `Tools/index_parts_library.py`. Preview creation also refuses an existing preview set.','',
 '## Limits to carry into the CLI handoff','',
 'Blender nominal triangulation totals 101,280; Unity reports 100,720. Nine entries differ. A separate FBX reimport reproduces the Blender counts and detects near-zero-area triangles in several meshes, but does not establish a complete importer face mapping. Both counts and the probe are retained; topology equivalence is NOT certified. No LODs, collision meshes, sockets for a general equipment system, animated track rig, production animation set, final texture atlas, mobile resource budget or cosmetic entitlement rules are certified. STK-T01 retains 50,432 triangles and is the largest optimization candidate; this is measured geometry, not proof of a performance defect. The static assembly and technical mount list are not a freeform tank-building system.','',
 'The existing FieldAssembly scene and encounter runtime are unchanged. Previous encounter/art/inspection passes remain tied to their existing build; they were not rerun as library tests. This asset pass compiled/imported in Unity but has no new browser/phone performance or final owner art acceptance. The existing six WebGL warnings and three shader diagnostics were not addressed.','',
 'The interactive gallery script append was blocked before completion and preserved outside Unity source. Its control methods were not completed through another route, executed or committed. The library, static layout, index and previews are independent deliverables; do not call the optional gallery finished.','',
 'Next product planning is separate: decide the first-run and first-upgrade experience using selected art IDs, then issue one bounded CLI-agent implementation slice. This index grants no progression, pricing, reward or release authority.','']
(ROOT/'PARTS-LIBRARY.md').write_text('\n'.join(lines),encoding='utf-8')
record={'schema':1,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mesh_entries':20,
 'retained_entries':6,'new_geometry_entries':14,'assemblies':3,'paint_finishes':3,'previews':23,
 'triangle_total':sum(e['triangles'] for e in catalog['items']),'source_and_fbx_hashes_match':True,
 'unity_triangle_counts_match':False,'unity_triangle_total':sum(x['triangles'] for x in unity['items']),'interactive_gallery_complete':False,'new_web_build':False}
(DOC/'index-checks.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
print('ST_KIT_INDEX_PASS '+json.dumps(record))
