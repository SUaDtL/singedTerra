"""Render the actual editable tank geometry without modifying source/assets."""
import argparse
from pathlib import Path
import sys
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--source", type=Path, default=ROOT / "ArtSource/LastStandTankKits_02.blend")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
output = args.output.resolve()
if output.exists():
    raise FileExistsError("Preserve previous rendered evidence: " + str(output))
output.mkdir(parents=True)
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()))
families = ("foundry", "ranger", "bulwark", "jackal")
for family in families:
    for slot in ("treads", "hull", "turret", "barrel"):
        root = bpy.data.objects[family + "-" + slot]
        root.location = (0,0,1.77) if slot == "turret" else (0,1.17,2.23) if slot == "barrel" else (0,0,0)

bpy.ops.mesh.primitive_plane_add(size=200)
floor = bpy.context.object
floor.name = "Review ground"
mat = bpy.data.materials.new("Review neutral ground");mat.diffuse_color=(.095,.105,.09,1)
floor.data.materials.append(mat)
floor.location.z=-.01
camera_data=bpy.data.cameras.new("Tank review camera")
camera=bpy.data.objects.new("Tank review camera",camera_data);bpy.context.scene.collection.objects.link(camera)
camera.location=(8,11,6.5)
camera.rotation_euler=(Vector((0,.25,1.2))-camera.location).to_track_quat("-Z","Y").to_euler()
camera_data.type="ORTHO";camera_data.ortho_scale=8.0
bpy.context.scene.camera=camera
for name,location,energy,size,color in (
    ("Large warm key",(2,4,8),1900,7,(1,.90,.74)),
    ("Cool soft fill",(-5,2,5),1400,6,(.71,.82,1)),
    ("Rear rim",(1,-5,7),2100,5,(1,.79,.48))):
    data=bpy.data.lights.new(name,"AREA");data.energy=energy;data.shape="DISK";data.size=size;data.color=color
    light=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(light);light.location=location
    light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat("-Z","Y").to_euler()
scene=bpy.context.scene
scene.render.engine="CYCLES";scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.world.color=(.16,.16,.16)
scene.render.resolution_x=1200;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
for family in families:
    for other in families:
        for slot in ("treads","hull","turret","barrel"):
            bpy.data.collections[other+"-"+slot].hide_render=other!=family
    scene.render.filepath=str(output/(family+".png"))
    bpy.ops.render.render(write_still=True)
print("ST_TANK_RENDER_PASS "+str(output))
