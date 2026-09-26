"""ST-KIT-01 editable art. Run with Blender --background --python this file.
Writes only new library outputs; refuses to regenerate existing authored files.
"""
from pathlib import Path
import bpy, math, json, hashlib
from mathutils import Matrix, Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'Unity/Assets/Art/PartsLibrary'
SOURCE = ROOT / 'ArtSource/PartsLibrary_01.blend'
ORIGINAL = ROOT / 'ArtSource/StarterTank_and_Clearing.blend'
if OUT.exists() or SOURCE.exists():
    raise RuntimeError('Library exists: preserve edits; use a fresh copy for regeneration')
OUT.mkdir(parents=True); SOURCE.parent.mkdir(parents=True, exist_ok=True)
original_hash = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
old_objects = list(bpy.context.scene.objects)
materials = {m.name: m for m in bpy.data.materials}
entries = []; active = None

def material(name, color, metal=0, rough=.7):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.diffuse_color = (*color, 1)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    materials[name] = m
material('Canvas', (.30,.32,.21), 0, .95)
material('Oxide', (.38,.115,.065), .35, .72)
material('Warning', (.77,.51,.12), .15, .65)

def item(code, title, category, mount, description, source='new original geometry'):
    global active
    collection = bpy.data.collections.new(code)
    bpy.context.scene.collection.children.link(collection)
    active = bpy.data.objects.new(code, None); collection.objects.link(active)
    entries.append(dict(id=code, title=title, category=category, mount=mount,
        description=description, provenance=source, root=active, collection=collection))
    return active

def attach(ob, name, mat, bevel=.025):
    ob.name = name; ob.data.materials.append(materials[mat]); ob.parent = active
    for c in list(ob.users_collection): c.objects.unlink(ob)
    entries[-1]['collection'].objects.link(ob)
    if bevel:
        b = ob.modifiers.new('Edge bevel', 'BEVEL'); b.width=bevel; b.segments=2
        ob.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return ob

def box(name, loc, size, mat='Armor', bevel=.025, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob=bpy.context.object; ob.scale=size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot: ob.rotation_euler=rot
    return attach(ob,name,mat,bevel)

def cyl(name, loc, radius, depth, mat='Steel', axis='Z', sides=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides,radius=radius,depth=depth,location=loc)
    ob=bpy.context.object
    if axis=='Y': ob.rotation_euler[0]=math.pi/2
    if axis=='X': ob.rotation_euler[1]=math.pi/2
    return attach(ob,name,mat,.012)

def extract(code,title,category,mount,names,pivot):
    item(code,title,category,mount,'Retained starter component; normalized assembly origin.',
         'derived from StarterTank_and_Clearing.blend')
    for name in names:
        owner=bpy.data.objects[name]
        objects=[o for o in owner.children if o.type=='MESH']
        if name.startswith('Track'): objects=[o for o in owner.children_recursive if o.type=='MESH']
        for src in objects:
            ob=src.copy(); ob.data=src.data.copy(); entries[-1]['collection'].objects.link(ob)
            ob.parent=active; ob.matrix_world=Matrix.Translation(-Vector(pivot)) @ src.matrix_world

bpy.context.view_layer.update()
extract('STK-H01','Service hull','Core','chassis',['Hull'],(0,0,0))
extract('STK-T01','Tracked running gear','Core','chassis',['Track_Left','Track_Right'],(0,0,0))
extract('STK-U01','Cast turret','Core','turret-ring',['TurretYaw'],(0,0,1.77))
extract('STK-G01','Long service cannon','Gun','gun-breech',['BarrelRecoil'],(0,1.17,2.23))
extract('STK-M01','Field repair unit','Module','side-saddle',['Attachment_Repair'],(1.34,-.4,2.07))
extract('STK-M02','Four-tube launcher','Module','side-saddle',['Attachment_Launcher'],(1.34,-.4,2.07))
for ob in old_objects: bpy.data.objects.remove(ob,do_unlink=True)

item('STK-G02','Stub siege cannon','Gun','gun-breech','Short reinforced barrel, vented sleeve and recessed bore; no selected damage.')
cyl('Breech',(0,.22,0),.34,.56,'Edge','Y',24)
cyl('Barrel sleeve',(0,.95,0),.285,1.15,'Armor','Y',24)
cyl('Muzzle collar',(0,1.64,0),.37,.32,'Steel','Y',24)
cyl('Recessed bore',(0,1.806,0),.235,.012,'Rubber','Y',24)
for y in [.5,.92,1.35]: cyl('Sleeve band',(0,y,0),.305,.085,'Brass','Y')
for sign in [-1,1]:
    for y in [.64,.90,1.16]: box('Cooling slot',(sign*.284,y,.04),(.016,.14,.14),'Soot',.008)

item('STK-G03','Twin autocannon','Gun','gun-breech','Paired barrels and ammunition boxes; visual candidate, no rate or ammunition rules.')
box('Breech cradle',(0,.15,0),(1.0,.7,.62),'Edge',.08)
for sign in [-1,1]:
    x=sign*.27
    cyl('Cannon barrel',(x,1.3,.02),.095,2.0,'Steel','Y',16)
    for y in [.55,.85,1.15]: cyl('Cooling jacket',(x,y,.02),.14,.16,'Edge','Y',16)
    cyl('Muzzle brake',(x,2.36,.02),.15,.28,'Brass','Y',16)
    cyl('Bore',(x,2.506,.02),.09,.012,'Rubber','Y',16)
    box('Feed cassette',(sign*.63,.05,-.05),(.35,.58,.55),'Armor',.035)
    for z in [-.22,-.06,.10]: box('Feed rib',(sign*.817,.05,z),(.018,.42,.045),'Brass',.007)

item('STK-M03','Survey radar','Module','side-saddle','A compact dish, console and mast. No targeting unlock or radar gameplay granted.')
box('Mount shoe',(0,0,.07),(.72,.84,.14),'Steel')
box('Control pedestal',(0,-.04,.26),(.60,.66,.28),'Armor',.05)
cyl('Mast',(0,0,.78),.085,.94)
box('Console bezel',(0,.30,.34),(.35,.065,.16),'Edge',.014)
box('Console glass',(0,.338,.34),(.26,.009,.095),'Optic',.005)
# A shallow curved dish, open toward +Y; no antenna collision/physics component.
v=[(0,-.15,1.34)]; n=24
for r,y in [(.3,-.08),(.60,.12)]:
    v.extend([(r*math.cos(i*math.tau/n),y,1.34+r*math.sin(i*math.tau/n)) for i in range(n)])
f=[(0,1+i,1+(i+1)%n) for i in range(n)]
f += [(1+i,25+i,25+(i+1)%n,1+(i+1)%n) for i in range(n)]
me=bpy.data.meshes.new('Dish');me.from_pydata(v,[],f);me.update()
ob=bpy.data.objects.new('Dish',me);bpy.context.collection.objects.link(ob);attach(ob,'Dish','Edge',0)
ob.modifiers.new('Dish thickness','SOLIDIFY').thickness=.035
cyl('Feed stalk',(0,.13,1.34),.035,.45,'Steel','Y',8)
cyl('Receiver',(0,.38,1.34),.10,.14,'Brass','Y',12)

item('STK-M04','Heat-exchanger pack','Module','side-saddle','Radiator fins, insulated reservoir and pipework; no heat-resource system selected.')
box('Saddle',(0,0,.07),(.74,.86,.14),'Steel')
box('Radiator core',(0,0,.46),(.58,.68,.65),'Soot',.025)
for y in [-.28,-.17,-.06,.05,.16,.27]: box('Cooling fin',(0,y,.48),(.70,.045,.64),'Edge',.009)
for x in [-.27,.27]: cyl('Header pipe',(x,0,.83),.09,.75,'Brass','Y')
box('Top shroud',(0,0,.88),(.76,.76,.08),'Armor')

item('STK-A01','Glacis applique','Armor','hull-front','Replaceable bolted front armor shape; not a selected defense-stat increment.')
box('Backing',(0,0,0),(2.22,.17,.70),'Steel',.04,(-.32,0,0))
for x in [-.73,0,.73]:
    box('Armor tile',(x,.12,.06),(.66,.20,.58),'Armor',.055,(-.32,0,0))
    for z in [-.13,.20]: cyl('Captive bolt',(x,.246,z),.042,.035,'Brass','Y',8)

item('STK-A02','Spaced side skirts','Armor','chassis','Paired standoff rails and panels. Pair is one art assembly, not two gameplay slots.')
for sign in [-1,1]:
    for y in [-1.86,-.62,.62,1.86]:
        box('Rail',(sign*2.12,y,1.18),(.30,.075,.10),'Steel')
        box('Panel',(sign*2.30,y,1.12),(.13,1.10,.88),'Edge',.04)
        box('Facing',(sign*2.385,y,1.12),(.055,.91,.70),'Armor',.025)
        for yy in [-.40,.40]: cyl('Fixing',(sign*2.425,y+yy,1.40),.036,.028,'Brass','X',8)

item('STK-A03','Turret cheek package','Armor','turret-ring','Two angled cheek arrays; a visible armor candidate rather than a rarity tier.')
for sign in [-1,1]:
    for y in [-.50,0,.50]:
        box('Standoff',(sign*1.24,y,.43),(.26,.28,.19),'Steel')
        box('Cheek tile',(sign*1.39,y,.46),(.20,.43,.48),'Armor',.045,(0,sign*.24,0))
        cyl('Retainer',(sign*1.51,y,.54),.04,.045,'Brass','X',8)

item('STK-C01','Crew stowage rack','Cosmetic','hull-rear','Bedroll, tool case and fuel cans; appearance only, no cargo bonus.')
box('Rack floor',(0,0,.04),(1.70,.72,.08),'Steel')
for x in [-.81,.81]: box('Rack rail',(x,0,.24),(.055,.76,.40),'Edge')
for y in [-.35,.35]: box('Rack rail',(0,y,.24),(1.70,.045,.40),'Edge')
cyl('Rolled canvas',(-.30,0,.37),.24,.90,'Canvas','X',16)
for x in [-.6,-.05]: cyl('Roll strap',(x,0,.37),.25,.055,'Leather' if 'Leather' in materials else 'Rubber','X')
box('Tool case',(.50,0,.25),(.45,.53,.38),'Oxide',.045)
box('Latch',(.50,.28,.27),(.08,.025,.10),'Brass',.009)

item('STK-C02','Identification pennant','Cosmetic','turret-rear','Rigid wind-shaped field pennant; no faction, rank or collection reward selected.')
cyl('Foot',(0,0,.04),.13,.08,'Edge')
cyl('Pole',(0,0,.84),.021,1.62,'Steel',sides=10)
v=[(0,0,1.48),(.70,.07,1.43),(.48,-.025,1.19),(.04,0,1.13)]
me=bpy.data.meshes.new('Pennant');me.from_pydata(v,[],[(0,1,2,3)]);me.update()
ob=bpy.data.objects.new('Pennant',me);bpy.context.collection.objects.link(ob);attach(ob,'Pennant','Oxide',0)
ob.modifiers.new('Fabric thickness','SOLIDIFY').thickness=.014
box('Pennant stripe',(.10,-.008,1.30),(.05,.026,.32),'Marking',.002)

item('STK-C03','Bolted unit plaque','Cosmetic','hull-front','Bronze twin-chevron unit mark; original emblem, no stat or entitlement.')
box('Plaque',(0,0,0),(.56,.055,.48),'Edge',.065)
for z in [-.05,.10]:
    for sign in [-1,1]: box('Chevron',(sign*.09,.040,z),(.25,.026,.046),'Brass',.006,(0,sign*.48,0))
for x in [-.22,.22]:
    for z in [-.17,.17]: cyl('Screw',(x,.045,z),.020,.020,'Marking','Y',8)

item('STK-B01','Sandbag wall','Field base','ground','Three staggered rows with tied ends; scenery only, no blocking or cover rules.')
for row in range(3):
    for i in range(4):
        x=(i-1.5)*.76+(row%2)*.20
        box('Filled sandbag',(x,0,.19+row*.30),(.86,.57,.36),'Canvas',.135,(0,.025*(i%2),.035*(row-1)))
        box('Tied end',(x+.40,0,.20+row*.30),(.04,.18,.08),'Rubber',.018)

item('STK-B02','Blast barrier','Field base','ground','Low concrete barrier with lift eyes and hazard stripes; no collision contract.')
box('Barrier footing',(0,0,.12),(3.0,.94,.24),'Concrete',.07)
box('Sloped body',(0,0,.62),(2.85,.53,1.00),'Concrete',.13)
box('Hazard face',(0,.283,.69),(2.25,.027,.28),'Soot',.012)
for x in [-.87,-.43,0,.43,.87]: box('Stripe',(x,.303,.69),(.17,.014,.25),'Warning',.002,(0,.45,0))
for x in [-.96,.96]: cyl('Lifting eye',(x,0,1.18),.10,.06,'Steel','Y',12)

item('STK-B03','Supply pallet','Field base','ground','Pallet, strapped transit cases and shell crate; scenery, not inventory or rewards.')
for x in [-.65,0,.65]: box('Pallet runner',(x,0,.10),(.16,1.24,.20),'Wood',.018)
for y in [-.50,-.25,0,.25,.50]: box('Deck board',(0,y,.25),(1.6,.19,.10),'Wood',.012)
for x in [-.42,.42]:
    box('Transit case',(x,0,.60),(.74,1.08,.59),'Armor',.035)
    for y in [-.37,.37]: box('Case strap',(x,y,.61),(.77,.055,.64),'Steel',.008)
box('Top crate',(0,0,1.12),(1.05,.72,.45),'Wood',.018)
for x in [-.38,.38]: box('Crate binding',(x,0,1.12),(.07,.76,.48),'Brass',.005)

item('STK-B04','Maintenance generator','Field base','ground','Engine, radiator, service hatch and hazard panel; scenery, no power currency.')
box('Skid',(0,0,.12),(2.25,1.35,.24),'Steel',.055)
box('Machine casing',(0,0,.72),(1.98,1.13,1.03),'Armor',.11)
for x in [-.67,-.45,-.23,-.01,.21]: box('Vent',(x,.578,.80),(.075,.026,.57),'Soot',.012)
box('Service door',(.63,.586,.72),(.42,.035,.73),'Edge',.025)
box('Door handle',(.67,.623,.79),(.15,.035,.04),'Brass',.008)
cyl('Exhaust',(-.75,-.29,1.37),.07,.65,'Steel')
cyl('Rain cap',(-.75,-.29,1.72),.13,.04,'Steel')
box('Instrument box',(.55,0,1.29),(.55,.42,.20),'Edge',.03)
box('Meter',(.55,.223,1.30),(.34,.015,.12),'Optic',.008)
for x in [-.90,.90]:
    for y in [-.48,.48]: cyl('Skid bolt',(x,y,.255),.048,.035,'Brass',sides=8)

if len(entries)!=20: raise RuntimeError('Expected exactly twenty mesh entries')
# Give the editable source an organized tray layout; runtime exports reset each root.
for i,e in enumerate(entries):
    e['root'].location=((i%5)*8,-(i//5)*8,0)
    for ob in e['root'].children:
        if ob.type=='MESH' and not ob.data.uv_layers:
            bpy.ops.object.select_all(action='DESELECT');ob.select_set(True)
            bpy.context.view_layer.objects.active=ob
            bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
            bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.scene.unit_settings.system='METRIC'
bpy.context.scene.unit_settings.scale_length=1
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
manifest={'schema':1,'revision':1,'scope':'ST-KIT-01 art only; no gameplay bindings',
          'source':'ArtSource/PartsLibrary_01.blend','original_source_sha256':original_hash,
          'blender':bpy.app.version_string,'blender_front':'+Y','blender_up':'+Z',
          'unity_front':'-Z','unity_up':'+Y','units':'meters','items':[]}
for e in entries:
    root=e['root']; root.location=(0,0,0); bpy.context.view_layer.update()
    groups={}
    for ob in list(root.children):
        if ob.type=='MESH': groups.setdefault(ob.data.materials[0].name,[]).append(ob)
    for mat,objects in groups.items():
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objects:
            bpy.context.view_layer.objects.active=ob
            for mod in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
            ob.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
        objects[0].name=e['id']+'_'+mat
    bpy.context.view_layer.update()
    meshes=[o for o in root.children if o.type=='MESH']
    points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices]
    if not points or any(not math.isfinite(c) for p in points for c in p):
        raise RuntimeError('Empty/nonfinite geometry: '+e['id'])
    minimum=[min(p[i] for p in points) for i in range(3)]
    maximum=[max(p[i] for p in points) for i in range(3)]
    row={k:v for k,v in e.items() if k not in ('root','collection')}
    row.update(fbx='Unity/Assets/Art/PartsLibrary/'+e['id']+'.fbx',
        prefab='Unity/Assets/PartsLibrary/Prefabs/'+e['id']+'.prefab',
        source_collection=e['id'],bounds_min=minimum,bounds_max=maximum,
        triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),
        meshes=len(meshes),materials=sorted(groups))
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [root]+meshes: ob.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.fbx(filepath=str(OUT/(e['id']+'.fbx')),use_selection=True,
        object_types={'MESH','EMPTY'},axis_forward='-Z',axis_up='Y',
        apply_unit_scale=True,bake_space_transform=False,add_leaf_bones=False,
        bake_anim=False,path_mode='RELATIVE',use_mesh_modifiers=True)
    row['fbx_sha256']=hashlib.sha256((OUT/(e['id']+'.fbx')).read_bytes()).hexdigest()
    manifest['items'].append(row)
manifest['materials']={name:{'color':list(m.diffuse_color),
    'metallic':m.node_tree.nodes['Principled BSDF'].inputs['Metallic'].default_value,
    'roughness':m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value}
    for name,m in materials.items() if name in {n for e in manifest['items'] for n in e['materials']}}
manifest['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
if hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()!=original_hash:
    raise RuntimeError('Original source changed')
(OUT/'catalog.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('ST_KIT_ART_PASS '+json.dumps({'items':len(entries),
      'triangles':sum(e['triangles'] for e in manifest['items']),
      'source':str(SOURCE),'original_unchanged':True}))
