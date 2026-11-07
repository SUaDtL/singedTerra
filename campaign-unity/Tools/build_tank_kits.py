"""Original modular tank art. Blender 5.2; never overwrite an authored output.

blender --background --factory-startup --disable-autoexec --python Tools/build_tank_kits.py
Editable bevels, named construction meshes, UVs and packed original textures are
saved before export meshes are consolidated. No downloaded or borrowed imagery.
"""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tank_art_contract import FAMILIES, SLOTS, MUZZLE, require_new_outputs, sha256, validate_parts

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--source-output", type=Path, default=ROOT / "ArtSource/LastStandTankKits_02.blend")
parser.add_argument("--asset-output", type=Path, default=ROOT / "Unity/Assets/TankKits02")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
SOURCE, OUT = args.source_output.resolve(), args.asset_output.resolve()
require_new_outputs(SOURCE, OUT)
OUT.mkdir(parents=True)
(OUT / "Models").mkdir()
(OUT / "Textures").mkdir()
SOURCE.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
entries, materials, material_rows = [], {}, []
active = None


def texture(name, kind, pixels):
    image = bpy.data.images.new(name + "-" + kind, 512, 512)
    if kind != "BaseColor":
        image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    path = OUT / "Textures" / (image.name + ".png")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return image, dict(kind=kind, path="Textures/" + path.name, sha256=sha256(path))


def material(name, rgb, metallic, roughness, seed):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:512, 0:512]
    grain = rng.normal(0, .024, (512, 512))
    brushed = .018 * np.sin(xx * .31) + .014 * np.sin(yy * .11 + xx * .017)
    weathering = .09 * np.sin(xx*.037 + np.sin(yy*.031)*1.7) * np.sin(yy*.027+seed)
    scratches = ((xx * 13 + yy * 3 + seed) % 379 < 2) * .085
    value = np.clip(1 + grain + brushed + scratches + weathering, .72, 1.28)
    base = np.ones((512, 512, 4))
    base[:, :, :3] = np.array(rgb) * value[:, :, None]
    # Finely grained tangent normal and metallic/occlusion/smoothness map.
    dy, dx = np.gradient(grain + brushed)
    normal = np.ones((512, 512, 4))
    normal[:, :, 0] = .5 - dx * .65
    normal[:, :, 1] = .5 - dy * .65
    normal[:, :, 2] = 1
    mask = np.ones((512, 512, 4))
    mask[:, :, 0] = metallic
    mask[:, :, 1] = np.clip(.96 + grain, .88, 1)
    mask[:, :, 2] = 0
    mask[:, :, 3] = np.clip(1 - roughness + brushed * 2 + weathering*.6, .05, .9)
    images = [texture(name, kind, pixels) for kind, pixels in
              (("BaseColor", base), ("Normal", normal), ("Mask", mask))]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*rgb, 1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    color = nodes.new("ShaderNodeTexImage"); color.image = images[0][0]
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    tex_normal = nodes.new("ShaderNodeTexImage"); tex_normal.image = images[1][0]
    bump = nodes.new("ShaderNodeNormalMap")
    links.new(tex_normal.outputs["Color"], bump.inputs["Color"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    if name == "Optic":
        shader.inputs["Emission Color"].default_value = (*rgb, 1)
        shader.inputs["Emission Strength"].default_value = .8
    materials[name] = mat
    material_rows.append(dict(id=name, metallic=metallic, roughness=roughness,
                              textures=[entry for _, entry in images]))


material("Armor", (.25, .28, .19), .42, .58, 11)
material("Steel", (.075, .085, .080), .78, .42, 12)
material("Edge", (.32, .33, .28), .72, .43, 13)
material("Rubber", (.033, .037, .031), .03, .87, 14)
material("Brass", (.40, .255, .075), .65, .42, 15)
material("Optic", (.94, .49, .10), .15, .19, 16)


def item(family, slot):
    global active
    identity = f"{family}-{slot}"
    collection = bpy.data.collections.new(identity)
    bpy.context.scene.collection.children.link(collection)
    active = bpy.data.objects.new(identity, None)
    collection.objects.link(active)
    entries.append(dict(id=identity, family=family, slot=slot, root=active,
                        collection=collection, muzzle=list(MUZZLE) if slot == "barrel" else None))


def attach(obj, name, mat, bevel=0, segments=2):
    obj.name = name
    obj.parent = active
    obj.data.materials.append(materials[mat])
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    entries[-1]["collection"].objects.link(obj)
    if bevel:
        mod = obj.modifiers.new("Machined edge radius", "BEVEL")
        mod.width = bevel; mod.segments = segments
        if mat == "Armor":
            # Wear is physically localized to machined armor edges, not painted
            # randomly across broad faces. The exposed metal keeps its own PBR.
            obj.data.materials.append(materials["Edge"]);mod.material=1
        obj.modifiers.new("Face weighted normals", "WEIGHTED_NORMAL")
    return obj


def box(name, pos, size, mat="Armor", bevel=.025, rot=None, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot:
        obj.rotation_euler = rot
    return attach(obj, name, mat, bevel, segments)


def cylinder(name, pos, radius, depth, mat="Steel", axis="Z", sides=16, bevel=.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth, location=pos)
    obj = bpy.context.object
    if axis == "Y": obj.rotation_euler.x = math.pi / 2
    if axis == "X": obj.rotation_euler.y = math.pi / 2
    return attach(obj, name, mat, bevel)


def rod(name, start, end, radius=.06, mat="Steel", sides=12):
    delta = Vector(end) - Vector(start)
    obj = cylinder(name, (Vector(start) + Vector(end)) / 2, radius, delta.length, mat, sides=sides, bevel=0)
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def torus(name, pos, major, minor, mat="Rubber", axis="X", segments=24, rings=8):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments, minor_segments=rings,
                                   location=pos, major_radius=major, minor_radius=minor)
    obj = bpy.context.object
    if axis == "X": obj.rotation_euler.y = math.pi / 2
    if axis == "Y": obj.rotation_euler.x = math.pi / 2
    return attach(obj, name, mat)


def wedge(name, pos, width, length, height, mat="Armor", top_width=.78, top_length=.80):
    x, y, z = pos
    vertices = [(x + sx * width / 2 * factor, y + sy * length / 2 * longitudinal, z + level * height)
                for level, factor, longitudinal in ((0, 1, 1), (1, top_width, top_length))
                for sx, sy in ((-1,-1),(1,-1),(1,1),(-1,1))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return attach(obj, name, mat, .035)


def bolts(x_values, y, z):
    for x in x_values:
        cylinder("Recessed fastener", (x,y,z), .033, .028, "Brass", sides=8, bevel=0)


def tracks():
    for side in (-1,1):
        x = side * 1.70
        box("Suspension beam", (x,0,.68), (.48,4.20,.62), "Steel", .08)
        for y in (-1.72,-.86,0,.86,1.72):
            cylinder("Road wheel tire", (x,y,.69), .55, .59, "Rubber", "X", 20,0)
            cylinder("Road wheel rim", (x+side*.32,y,.69), .39, .055, "Edge", "X", 16,0)
            cylinder("Axle cap", (x+side*.36,y,.69), .15, .08, "Steel", "X", 12,0)
            for angle in (0,math.pi/2,math.pi,math.pi*1.5):
                cylinder("Wheel hub bolt",(x+side*.405,y+.23*math.cos(angle),.69+.23*math.sin(angle)),.034,.024,"Brass","X",6,0)
        # Continuous capsule tread path, with separate low-poly steel cleats.
        path=[]
        for i in range(14): path.append((-1.72 + i*3.44/13, .12, 0))
        for i in range(7):
            angle=-math.pi/2 + i*math.pi/6
            path.append((1.72+.58*math.cos(angle),.70+.58*math.sin(angle),angle+math.pi/2))
        for i in range(14): path.append((1.72-i*3.44/13,1.28,0))
        for i in range(7):
            angle=math.pi/2+i*math.pi/6
            path.append((-1.72+.58*math.cos(angle),.70+.58*math.sin(angle),angle+math.pi/2))
        for y,z,angle in path:
            box("Track shoe",(x,y,z),(.80,.23,.11),"Steel",.012,(-angle,0,0),1)
            box("Track cleat",(x,y,z+.065),(.83,.065,.045),"Edge",0,(-angle,0,0))
        for y in (-1.66,-.55,.55,1.66):
            box("Segmented fender backing",(x,y,1.37),(.91,1.08,.12),"Steel",.012)
            box("Replaceable fender plate",(x,y,1.44),(.88,1.03,.065),"Armor",.012)
            for offset in (-.33,.33):
                cylinder("Fender plate bolt",(x+side*.30,y+offset,1.485),.032,.024,"Steel",sides=6,bevel=0)


def legs():
    for side in (-1,1):
        for index,y in enumerate((-1.55,0,1.55)):
            hip=(side*1.05,y,1.13); knee=(side*2.05,y+(index-1)*.35,.95)
            ankle=(side*2.35,y+(index-1)*.52,.23)
            cylinder("Hip rotary housing",hip,.23,.36,"Edge","X")
            rod("Articulated upper leg",hip,knee,.14,"Steel")
            rod("Articulated shin",knee,ankle,.12,"Steel")
            rod("Exposed hydraulic piston",(side*1.15,y,1.34),(side*2.10,ankle[1],.48),.047,"Brass")
            cylinder("Knee pin",knee,.17,.31,"Edge","Y")
            box("Shoulder armor",(side*1.48,y,1.23),(.74,.43,.22),"Armor",.045,(0,side*.18,0))
            cylinder("Stabilizer foot",(ankle[0],ankle[1],.10),.29,.16,"Rubber",sides=12)
            cylinder("Foot rim",(ankle[0],ankle[1],.20),.24,.06,"Edge",sides=12)


def hover():
    for side in (-1,1):
        for y in (-1.42,1.42):
            x=side*1.67
            box("Hover cross beam",(side*.95,y,.68),(1.15,.39,.30),"Steel",.035)
            wedge("Hover pod armored cowl",(x,y,.39),1.05,2.02,.72,top_width=.78)
            box("Hover induction skirt",(x,y,.30),(1.0,1.83,.25),"Rubber",.10)
            box("Amber induction strip",(x+side*.50,y,.32),(.035,1.48,.08),"Optic",.008)
            for offset in (-.53,-.26,0,.26,.53):
                box("Pod cooling grille",(x,y+offset,1.12),(.58,.09,.025),"Steel",.008)
            box("Pod impact bumper",(x,y+(.94 if y>0 else -.94),.65),(.74,.12,.21),"Edge",.045)


def wheels():
    for side in (-1,1):
        for y in (-1.65,1.65):
            x=side*1.83
            torus("All terrain tire",(x,y,.72),.49,.23)
            cylinder("Wheel recess",(x+side*.10,y,.72),.40,.38,"Steel","X",20)
            cylinder("Five spoke wheel rim",(x+side*.34,y,.72),.29,.055,"Edge","X",10)
            cylinder("Wheel hub",(x+side*.38,y,.72),.12,.10,"Brass","X",10)
            for i in range(18):
                angle=i*math.tau/18
                box("Tire lug",(x,y+.68*math.cos(angle),.72+.68*math.sin(angle)),
                    (.43,.15,.11),"Rubber",0,(angle-math.pi/2,0,0))
            rod("Lower wishbone",(side*.85,y-.25,.48),(x,y,.64),.075)
            rod("Upper wishbone",(side*.85,y+.25,1.05),(x,y,.68),.065)
            rod("Suspension damper",(side*1.10,y,1.25),(side*1.68,y,.55),.065,"Brass")
            box("Short wheel arch",(x,y,1.53),(.78,1.42,.11),"Armor",.035)


def hull(family):
    width={"foundry":2.87,"ranger":2.42,"bulwark":3.00,"jackal":2.55}[family]
    length={"foundry":4.86,"ranger":4.60,"bulwark":4.90,"jackal":4.50}[family]
    wedge("Lower armored tub",(0,0,.75),width-.15,length-.14,.60,"Steel",.90,.91)
    heights={"foundry":.39,"ranger":.31,"bulwark":.44,"jackal":.30}
    wedge("Upper glacis",(0,.02,1.19),width,length,heights[family],top_width=.80,top_length=.78)
    cylinder("Universal turret ring",(0,0,1.68),.95,.16,"Steel",sides=32)
    cylinder("Turret race rim",(0,0,1.765),.86,.04,"Brass",sides=32,bevel=0)
    for side in (-1,1):
        box("Headlamp armored housing",(side*1.03,2.12,1.40),(.37,.34,.27),"Steel",.045)
        box("Headlamp lens",(side*1.03,2.30,1.40),(.24,.025,.12),"Optic",.012)
        box("Tow clevis plate",(side*.72,2.30,1.02),(.24,.16,.21),"Steel",.02)
        torus("Forged tow eye",(side*.72,2.43,1.02),.10,.034,"Edge","Y",12,6)
    box("Rear engine deck",(0,-1.60,1.53),(1.80,1.10,.15),"Steel",.025)
    for x in (-.70,-.50,-.30,-.10,.10,.30,.50,.70):
        box("Engine ventilation slat",(x,-1.60,1.62),(.11,.85,.065),"Edge",.008)
    bolts((-.92,.92),-1.10,1.63)
    # Panel seams and exposed fasteners are actual geometry with coherent
    # construction depth. They remain legible at the normal garage camera.
    for side in (-1,1):
        box("Glacis panel recess",(side*.51,1.56,1.60),(.93,.91,.04),"Steel",.012,(.15,0,0))
        box("Glacis access panel",(side*.51,1.56,1.63),(.88,.85,.045),"Armor",.012,(.15,0,0))
        for offset in (-.28,.28):
            cylinder("Access panel screw",(side*.51+offset,1.29,1.63),.029,.03,"Steel",sides=6,bevel=0)
        box("Recessed grille frame",(side*.73,-1.88,1.63),(.48,.36,.045),"Steel",.012)
        for y in (-1.98,-1.89,-1.80):
            box("Grille louver",(side*.73,y,1.67),(.40,.035,.035),"Edge",0)
    if family=="foundry":
        for side in (-1,1):
            for y in (-1.10,0,1.10):
                box("Bolted side plate",(side*1.38,y,1.34),(.10,.91,.40),"Armor",.022)
        box("Driver hatch surround",(0,.95,1.64),(.81,.50,.07),"Steel",.025)
        box("Driver hatch",(0,.95,1.69),(.72,.42,.055),"Armor",.018)
    elif family=="ranger":
        for side in (-1,1):
            rod("External chassis rail",(side*1.49,-1.90,1.25),(side*1.49,1.90,1.25),.065,"Edge")
            box("Recon tool case",(side*1.03,-1.49,1.62),(.44,.86,.22),"Armor",.025)
            box("Tool case clasp",(side*1.03,-1.03,1.62),(.14,.035,.11),"Brass",.008)
        box("Forward sensor band",(0,1.91,1.51),(1.45,.12,.14),"Steel",.02)
    elif family=="bulwark":
        for side in (-1,1):
            for y in (-1.50,-.50,.50,1.50):
                wedge("Spaced reactive cheek",(side*1.40,y,1.02),.36,.83,.51,"Armor",.75,.88)
        for side in (-1,1):
            box("Heavy glacis applique",(side*.50,1.77,1.73),(.94,.79,.14),"Armor",.028,(.17,0,0))
            box("Raised front bumper",(side*.82,2.34,1.11),(.90,.19,.26),"Edge",.025)
    else:
        for side in (-1,1):
            rod("Rear cage pillar",(side*.82,-1.00,1.57),(side*.82,-1.65,2.00),.055,"Edge")
            rod("Rear cage brace",(side*.82,-2.12,1.50),(side*.82,-1.65,2.00),.055,"Edge")
        rod("Rear roll hoop",(-.82,-1.65,2.0),(.82,-1.65,2.0),.055,"Edge")
        box("Recovery case",(0,-1.72,1.76),(.92,.60,.30),"Armor",.045)
        for x in (-.30,.30):box("Case hold down strap",(x,-1.72,1.77),(.055,.63,.34),"Steel",.008)


def turret(family):
    cylinder("Common yaw bearing",(0,0,.05),.83,.13,"Steel",sides=32)
    if family=="foundry":
        wedge("Cast armored cupola",(0,-.03,.10),2.12,1.98,.64,top_width=.76,top_length=.77)
    elif family=="ranger":
        pod=cylinder("Recon sensor pod",(0,-.12,.35),.86,.50,"Armor",sides=12,bevel=.025)
        pod.scale.y=1.12
        box("Optics bridge",(0,.29,.70),(1.25,.59,.18),"Steel",.045)
        for side in (-1,1):
            box("Rangefinder housing",(side*.42,.57,.73),(.42,.31,.24),"Armor",.025)
            box("Rangefinder lens",(side*.42,.735,.74),(.30,.025,.12),"Optic",.008)
        box("Sensor roof hatch",(0,-.33,.63),(.65,.58,.075),"Armor",.025)
    elif family=="bulwark":
        box("Low bunker turret",(0,-.10,.37),(2.14,1.89,.56),"Steel",.10)
        box("Bunker armored roof",(0,-.09,.69),(2.04,1.74,.14),"Armor",.045)
        for side in (-1,1):
            for y in (-.62,0,.62):
                box("Bunker side armor tile",(side*1.03,y,.40),(.16,.52,.45),"Armor",.028)
        box("Rectangular command hatch",(-.30,-.26,.81),(.70,.66,.11),"Armor",.035)
        rod("Command hatch handle",(-.49,-.26,.91),(-.12,-.26,.91),.03,"Steel",8)
    else:
        cylinder("Open turret ring",(0,-.08,.20),.78,.16,"Edge",sides=24,bevel=.01)
        box("Central stabilized gun cradle",(0,.26,.41),(.76,1.24,.34),"Steel",.045)
        for side in (-1,1):
            for y in (-.56,.49):rod("Open cage upright",(side*.67,y,.23),(side*.67,y,.78),.046,"Edge")
            rod("Cage upper rail",(side*.67,-.56,.78),(side*.67,.49,.78),.046,"Edge")
            box("Operator side shield",(side*.70,-.05,.48),(.11,.88,.29),"Armor",.024)
        rod("Cage rear rail",(-.67,-.56,.78),(.67,-.56,.78),.046,"Edge")
    box("Mantlet surround",(0,.91,.43),(.81,.49,.61),"Steel",.09)
    cylinder("Gun trunnion",(0,1.12,.46),.29,.68,"Edge","X",20)
    if family=="foundry":
        cylinder("Commander hatch",(-.30,-.31,.79),.38,.11,"Steel",sides=24)
        cylinder("Hatch armor",(-.30,-.31,.855),.31,.04,"Armor",sides=24)
        rod("Hatch grab handle",(-.46,-.31,.93),(-.14,-.31,.93),.028,"Steel",8)
    if family in ("foundry","bulwark"):
        box("Periscope body",(-.33,.26,.83),(.38,.30,.15),"Steel",.025)
        box("Periscope glass",(-.33,.42,.84),(.27,.025,.07),"Optic",.005)
    ax,ay,az = (-.55,-.49,.59) if family=="ranger" else (-.67,-.45,.78) if family=="jackal" else (-.72,-.65,.64)
    rod("Antenna base",(ax,ay,az),(ax,ay,az+.21),.055,"Brass")
    rod("Whip antenna",(ax,ay,az+.21),(ax,ay,1.56),.013,"Steel",8)
    box("Fitting saddle",(1.01,-.40,.22),(.35,.77,.16),"Steel",.025)
    if family=="foundry":
        box("Rear stowage bustle",(0,-1.01,.43),(1.48,.35,.42),"Armor",.045)
        for side in (-1,1):
            box("Cupola cheek recess",(side*.83,.27,.43),(.10,.75,.37),"Steel",.018,(0,side*.33,0))
            box("Cupola cheek applique",(side*.89,.27,.43),(.09,.68,.31),"Armor",.018,(0,side*.33,0))
    elif family=="ranger":
        for side in (-1,1):
            box("Angled sensor cheek",(side*.83,.20,.43),(.15,.72,.32),"Edge",.025,(0,side*.2,0))
        cylinder("Rear sensor drum",(.43,-.53,.69),.11,.24,"Steel","Y")
    elif family=="bulwark":
        for side in (-1,1):
            box("Reinforced front cheek",(side*.71,.65,.42),(.43,.55,.48),"Armor",.07,(0,0,-side*.12))
        box("Armored hatch rail",(0,-.77,.84),(1.46,.12,.13),"Edge",.025)
    else:
        rod("Turret bustle rail",(-.66,-1.02,.64),(.66,-1.02,.64),.045,"Edge")
        for side in (-1,1):
            rod("Bustle support",(side*.66,-.58,.41),(side*.66,-1.02,.64),.035,"Steel")
        box("External breech cover",(0,.11,.63),(.51,.59,.13),"Armor",.035)


def barrel(family):
    # All weapons end at exactly this fixed local plane. Bore is a hollow ring.
    length=MUZZLE[1]
    cylinder("Recoil sleeve",(0,.27,0),.215,.62,"Steel","Y",20)
    cylinder("Barrel tube",(0,1.77,0),.115,2.82,"Steel","Y",20,0)
    for y in (.61,1.02,2.49):
        cylinder("Barrel collar",(0,y,0),.157,.10,"Edge","Y",20,.006)
    if family=="foundry":
        cylinder("Service thermal jacket",(0,1.27,0),.165,1.12,"Armor","Y",20)
    elif family=="ranger":
        for side in (-1,1):
            box("Slotted long gun shroud",(side*.13,1.42,.05),(.06,1.46,.23),"Armor",.018)
        for y in (.87,1.13,1.39,1.65,1.91):
            box("Cooling aperture",(0,y,.18),(.21,.12,.025),"Rubber",.005)
    elif family=="bulwark":
        box("Heavy insulated jacket",(0,1.45,0),(.43,1.65,.38),"Armor",.065)
        for y in (.85,1.25,1.65,2.05):
            box("Jacket band",(0,y,0),(.46,.08,.42),"Edge",.025)
    else:
        for side in (-1,1):
            rod("Barrel brace",(side*.19,.30,-.05),(side*.19,2.33,-.05),.035,"Edge")
        cylinder("Short fluted shroud",(0,.93,0),.22,.66,"Armor","Y",12)
    # Ring mesh gives a real dark bore, unlike a painted solid cylinder cap.
    outer=.20 if family=="bulwark" else .16
    front=length; rear=length-.28
    vertices=[]
    for y,r in ((rear,outer),(front,outer),(front,.095),(rear,.095)):
        vertices += [(r*math.cos(i*math.tau/20),y,r*math.sin(i*math.tau/20)) for i in range(20)]
    faces=[]
    for layer in range(4):
        for i in range(20): faces.append(tuple(reversed((layer*20+i,layer*20+(i+1)%20,((layer+1)%4)*20+(i+1)%20,((layer+1)%4)*20+i))))
    mesh=bpy.data.meshes.new("Hollow muzzle brake");mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new("Hollow muzzle brake",mesh);bpy.context.collection.objects.link(obj)
    attach(obj,"Hollow muzzle brake","Edge")
    cylinder("Bore darkness",(0,rear+.003,0),.094,.006,"Rubber","Y",20,0)
    marker=bpy.data.objects.new("VisualMuzzle",None);entries[-1]["collection"].objects.link(marker)
    marker.parent=active;marker.location=MUZZLE


for family in FAMILIES:
    item(family,"treads"); dict(foundry=tracks,ranger=legs,bulwark=hover,jackal=wheels)[family]()
    item(family,"hull"); hull(family)
    item(family,"turret"); turret(family)
    item(family,"barrel"); barrel(family)

# Keep the editable construction layout organized and preserve each local origin.
for index,entry in enumerate(entries):
    entry["root"].location=((index%4)*9,-(index//4)*9,0)
    for obj in entry["root"].children:
        if obj.type != "MESH": continue
        mesh_check=bmesh.new();mesh_check.from_mesh(obj.data)
        volume=mesh_check.calc_volume(signed=True)
        closed=all(edge.is_manifold for edge in mesh_check.edges);mesh_check.free()
        if not closed or volume<=0:raise RuntimeError("Open or inward-facing construction mesh: "+obj.name)
        bpy.ops.object.select_all(action="DESELECT");obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.mode_set(mode="EDIT");bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.025)
        bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.scene.unit_settings.system="METRIC"
bpy.context.scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
catalog=dict(schema="singedterra-tank-kits/1",source="ArtSource/"+SOURCE.name,source_sha256=sha256(SOURCE),
             blender=bpy.app.version_string,units="meters",blender_forward="+Y",blender_up="+Z",
             unity_forward="-Z",unity_up="+Y",provenance="Original procedural geometry and seeded original textures; no third-party imagery or meshes",
             origins=dict(chassis=[0,0,0],turret=[0,0,1.77],barrel=[0,1.17,2.23]),
             materials=material_rows,parts=[])
for entry in entries:
    root=entry["root"];root.location=(0,0,0);bpy.context.view_layer.update()
    groups={}
    for obj in list(root.children):
        if obj.type=="MESH": groups.setdefault(obj.data.materials[0].name,[]).append(obj)
    for mat,objects in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            bpy.context.view_layer.objects.active=obj
            for mod in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();objects[0].name=entry["id"]+"_"+mat
        # Explicit triangulation makes Blender and Unity budgets agree.
        mod=objects[0].modifiers.new("Export triangles","TRIANGULATE")
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.update()
    meshes=[obj for obj in root.children if obj.type=="MESH"]
    points=[obj.matrix_world@vertex.co for obj in meshes for vertex in obj.data.vertices]
    row={key:value for key,value in entry.items() if key not in ("root","collection")}
    row.update(model="Models/"+entry["id"]+".fbx",triangles=sum(len(obj.data.polygons) for obj in meshes),
               meshes=len(meshes),materials=sorted(groups),bounds_min=[min(p[i] for p in points) for i in range(3)],
               bounds_max=[max(p[i] for p in points) for i in range(3)])
    volumes=[]
    for obj in meshes:
        check=bmesh.new();check.from_mesh(obj.data);volumes.append(check.calc_volume(signed=True));check.free()
    row["minimum_signed_mesh_volume"]=min(volumes)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [root]+list(root.children): obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.fbx(filepath=str(OUT/row["model"]),use_selection=True,object_types={"MESH","EMPTY"},
        axis_forward="-Z",axis_up="Y",apply_unit_scale=True,bake_space_transform=False,add_leaf_bones=False,
        bake_anim=False,path_mode="RELATIVE",use_mesh_modifiers=True)
    row["sha256"]=sha256(OUT/row["model"]);catalog["parts"].append(row)
catalog["budget"]=validate_parts(catalog["parts"])
(OUT/"catalog.json").write_text(json.dumps(catalog,indent=2)+"\n",encoding="utf-8")
print("ST_TANK_ART_PASS "+json.dumps(catalog["budget"]))
