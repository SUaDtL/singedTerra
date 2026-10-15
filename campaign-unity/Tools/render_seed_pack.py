"""Render the actual editable ST-KIT-02 geometry, not generated concept images."""
from pathlib import Path
import bpy,json,math
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'ArtSource/Ashfall_Outpost_02.blend'))
cat=json.loads((R/'catalog.json').read_text());items=[i for i in cat['items'] if i['lod']==0]
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=640;scene.render.resolution_y=480;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.world.color=(.25,.25,.25)
scene.view_settings.view_transform='AgX';scene.render.film_transparent=False
stage=bpy.data.collections.new('PreviewStage');scene.collection.children.link(stage)
for c in bpy.data.collections:
    if c.name.startswith('ST2-'):c.hide_render=True

def link(o):
    for c in list(o.users_collection):c.objects.unlink(o)
    stage.objects.link(o);return o
bpy.ops.object.camera_add();cam=link(bpy.context.object);cam.data.type='ORTHO';scene.camera=cam
bpy.ops.mesh.primitive_plane_add(size=200);floor=link(bpy.context.object);floor.location.z=-.12
mat=bpy.data.materials.new('Studio ground');mat.diffuse_color=(.085,.105,.105,1);mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.085,.105,.105,1);floor.data.materials.append(mat)
for name,pos,energy,size in [('Key',(6,8,13),2300,7),('Fill',(-8,3,7),1400,8),('Rim',(2,-8,11),2100,6)]:
    bpy.ops.object.light_add(type='AREA',location=pos);o=link(bpy.context.object);o.name=name;o.data.energy=energy;o.data.shape='DISK';o.data.size=size
    o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()

def aim(center,span):
    cam.location=Vector(center)+Vector((1.2,1.7,1.25))*span
    cam.rotation_euler=(Vector(center)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=span*1.65

for item in items:
    c=bpy.data.collections[item['id']];root=next(o for o in c.objects if o.parent is None)
    old=root.location.copy();root.location=(0,0,0);c.hide_render=False;bpy.context.view_layer.update()
    lo,hi=Vector(item['bounds_min']),Vector(item['bounds_max']);span=max(hi-lo)
    floor.location.z=lo.z-.04;aim((lo+hi)*.5,span)
    scene.render.filepath=str(R/'Previews'/(item['id']+'.png'));bpy.ops.render.render(write_still=True)
    c.hide_render=True;root.location=old;print('PREVIEW',item['id'],flush=True)

def instance(id,loc,angle=0):
    c=bpy.data.collections[id];mapping={}
    for o in c.objects:
        d=o.copy();stage.objects.link(d);mapping[o]=d
    for o,d in mapping.items():
        d.parent=mapping.get(o.parent);d.matrix_basis=o.matrix_basis.copy()
        if o.parent is None:d.location=loc;d.rotation_euler.z=angle
for x in [-8,0,8]:
    for y in [-8,0,8]:instance('ST2-T01',(x,y,0))
for id,loc,a in [('ST2-B01',(-7,-6,0),0),('ST2-B02',(5,-7,0),0),('ST2-B03',(0,-9,0),0),('ST2-B05',(10,-1,0),0),('ST2-B04',(-10,1,0),.2),('ST2-E01',(4,7,0),-.3),('ST2-E02',(-3,5,0),.18),('ST2-E03',(-7,1,0),-.15),('ST2-E04',(2,2,0),.2),('ST2-E05',(8,4,0),-.5),('ST2-T04',(-7,9,0),0),('ST2-T07',(11,8,0),0),('ST2-P01',(6,-1,0),0),('ST2-P04',(-1,-2,0),0),('ST2-P05',(-6,-2,0),0),('ST2-P06',(-9,5,0),0),('ST2-P07',(-10,7,0),.7),('ST2-P02',(0,-13,0),0),('ST2-P02',(4,-13,0),0)]:instance(id,loc,a)
floor.location.z=-.15;cam.location=(27,36,31);cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=43
for o in stage.objects:
    if o.type=='LIGHT':o.location*=2.5;o.data.energy*=8;o.data.size*=2.5
scene.render.resolution_x=1600;scene.render.resolution_y=1100;scene.cycles.samples=40
scene.render.filepath=str(R/'Previews/ASHFALL-OUTPOST.png');bpy.ops.render.render(write_still=True)
print('ST_KIT02_PREVIEWS_COMPLETE',flush=True)
