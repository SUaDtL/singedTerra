"""Render the actual editable ST-KIT-01 meshes; not concept-image generation."""
from pathlib import Path
import bpy, json, math
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/parts-library-01/previews'
if OUT.exists(): raise RuntimeError('Preview set exists; use fresh output, preserve prior renders')
OUT.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'ArtSource/PartsLibrary_01.blend'))
catalog=json.loads((ROOT/'Unity/Assets/Art/PartsLibrary/catalog.json').read_text())
roots={e['id']:bpy.data.objects[e['id']] for e in catalog['items']}
for root in roots.values(): root.location=(0,0,0)
bpy.context.view_layer.update()
def clone(code,parent,pos):
    root=bpy.data.objects.new(code+' instance',None);bpy.context.collection.objects.link(root)
    root.parent=parent;root.location=pos
    for source in roots[code].children:
        ob=source.copy();ob.data=source.data.copy();bpy.context.collection.objects.link(ob)
        ob.parent=root;ob.matrix_local=source.matrix_local.copy()
    return root

def assembly(code,gun,module,style):
    root=bpy.data.objects.new(code,None);bpy.context.collection.objects.link(root)
    clone('STK-H01',root,(0,0,0));clone('STK-T01',root,(0,0,0))
    turret=bpy.data.objects.new('TurretPivot',None);bpy.context.collection.objects.link(turret)
    turret.parent=root;turret.location=(0,0,1.77)
    clone('STK-U01',turret,(0,0,0));clone(gun,turret,(0,1.17,.46))
    clone(module,turret,(1.34,-.4,.30))
    if style==0: clone('STK-C01',root,(0,-2.64,1.05))
    if style==1:
        clone('STK-A01',root,(0,2.73,1.14));clone('STK-A02',root,(0,0,0));clone('STK-A03',turret,(0,0,0))
    if style==2:
        clone('STK-C02',turret,(-.72,-.60,1.0));clone('STK-C03',root,(0,2.98,1.13))
    if style:
        mat=bpy.data.materials['Armor'].copy();mat.name='KitPaint_'+('Slate' if style==1 else 'Oxide')
        p=mat.node_tree.nodes['Principled BSDF'];old=p.inputs['Base Color'].links[0].from_socket
        mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        mix.inputs[2].default_value=(.45,.63,1.12,1) if style==1 else (1,.40,.40,1)
        mat.node_tree.links.new(old,mix.inputs[1]);mat.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
        for ob in root.children_recursive:
            if ob.type=='MESH':
                for slot in ob.material_slots:
                    if slot.material.name=='Armor': slot.material=mat
    roots[code]=root
assembly('STK-S01','STK-G01','STK-M01',0)
assembly('STK-S02','STK-G02','STK-M04',1)
assembly('STK-S03','STK-G03','STK-M02',2)
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=768;scene.render.resolution_y=576;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.09,.105,.12,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
bpy.ops.object.camera_add();camera=bpy.context.object;scene.camera=camera
camera.data.type='ORTHO';camera.data.lens=45
for loc,energy,size in [((5,6,8),1400,6),((-5,2,5),1000,5),((1,-6,7),1700,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    ob=bpy.context.object;ob.data.energy=energy;ob.data.shape='DISK';ob.data.size=size
    ob.rotation_euler=(-ob.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=200)
floor=bpy.context.object;floor.name='Preview ground only'
mat=bpy.data.materials.new('Preview ground');mat.diffuse_color=(.12,.135,.14,1)
floor.data.materials.append(mat)
manifest=[]
for code,target in roots.items():
    for root in roots.values():
        for ob in [root]+list(root.children_recursive): ob.hide_render=(root!=target)
    bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
    points=[]
    for ob in target.children_recursive:
        if ob.type=='MESH':
            evaluated=ob.evaluated_get(deps)
            points += [evaluated.matrix_world@Vector(p) for p in evaluated.bound_box]
    lo=Vector([min(p[i] for p in points) for i in range(3)])
    hi=Vector([max(p[i] for p in points) for i in range(3)])
    center=(lo+hi)/2;size=max(hi-lo)
    camera.location=center+Vector((7,10,6));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.ortho_scale=max(.8,size*1.55);floor.location.z=lo.z-.04
    scene.render.filepath=str(OUT/(code+'.png'));bpy.ops.render.render(write_still=True)
    manifest.append({'id':code,'image':'previews/'+code+'.png','render':'Blender EEVEE actual editable meshes'})
(OUT.parent/'preview-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('ST_KIT_PREVIEWS_PASS '+str(len(manifest)))
