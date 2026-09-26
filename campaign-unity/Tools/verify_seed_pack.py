"""Independent standard-library checks for Seed Pack 02 artifacts. No engine required."""
from pathlib import Path
import json,struct,hashlib,math
R=Path(__file__).resolve().parents[1]
cat=json.loads((R/'catalog.json').read_text());items=cat['items'];checks=[]
assert len(items)==29 and len({i['export_id'] for i in items})==29
assert len([i for i in items if i['lod']==0])==24
for i in items:
    for fmt in ['fbx','glb']:
        p=R/i[fmt];assert p.is_file(),p
        assert hashlib.sha256(p.read_bytes()).hexdigest()==i['sha256'][fmt],p
    data=(R/i['glb']).read_bytes();magic,version,length=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and length==len(data)
    n,kind=struct.unpack_from('<II',data,12);assert kind==0x4E4F534A
    g=json.loads(data[20:20+n]);assert all('uri' not in b for b in g.get('buffers',[]))
    assert all('uri' not in image for image in g.get('images',[]))
    triangles=0
    for mesh in g['meshes']:
        for p in mesh['primitives']:
            assert p.get('mode',4)==4;acc=g['accessors'][p['indices']];assert acc['count']%3==0
            triangles+=acc['count']//3
            pos=g['accessors'][p['attributes']['POSITION']];assert pos['count']>0
            assert all(math.isfinite(x) for x in pos['min']+pos['max'])
    assert triangles==i['triangles'],(i['export_id'],triangles,i['triangles'])
    checks.append({'id':i['export_id'],'hashes_match':True,'glb_triangles':triangles,'embedded_resources':True})
for base in [i for i in items if i['category']=='enemy' and i['lod']==0]:
    low=next(i for i in items if i['id']==base['id'] and i['lod']==1)
    assert 0<low['triangles']<base['triangles']
for i in items:
    if i['lod']==0:assert (R/'Previews'/(i['id']+'.png')).is_file()
receipt_path=R/'Evidence/unity-import-receipt.json'
unity=None
if receipt_path.exists():
    unity=json.loads(receipt_path.read_text());assert len(unity['items'])==29
    assert all(i['geometryMatch'] for i in unity['items']);assert unity['prefabs']==34
    assert (R/'singedTerra-SeedPack02.unitypackage').is_file()
report={'schema':1,'checks':checks,'base_assets':24,'lod1_variants':5,'blender_triangles_base':sum(i['triangles'] for i in items if i['lod']==0),'portable_exports_pass':True,'unity_import_receipt_present':unity is not None,'unity_imports':len(unity['items']) if unity else 0,'prefabs':unity['prefabs'] if unity else 0,'browser_or_device_test':False,'known_art_issue':'B05 endcap faces overlap; correction was not applied.'}
(R/'Evidence/pack-verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k!='checks'},indent=2))
