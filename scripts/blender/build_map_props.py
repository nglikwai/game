"""Rebuild the original Blender scenery kit and transparent game sprites.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup
     --python scripts/blender/build_map_props.py
All models and materials are created here; no downloaded models are required.
"""
import bpy
import math
import random
import sys
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'src/assets/maps'
SOURCE = ROOT / 'assets/blender'
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE.mkdir(parents=True, exist_ok=True)
random.seed(84)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Roughness'].default_value = .82
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return m


wood = material('Warm cedar bark', (.19, .105, .055))
wood_light = material('Bark ridges', (.34, .21, .095))
leaf = [material('Jade foliage ' + str(i), c) for i, c in enumerate([
    (.045, .16, .10), (.075, .25, .15), (.14, .34, .19), (.25, .44, .24)])]
pink = [material('Cherry petals ' + str(i), c) for i, c in enumerate([
    (.42, .15, .25), (.67, .28, .40), (.88, .48, .56), (.97, .68, .65)])]
stone = [material('Weathered stone ' + str(i), c) for i, c in enumerate([
    (.19, .235, .235), (.30, .37, .35), (.43, .49, .44), (.51, .55, .47)])]
moss = material('Moss', (.22, .35, .13))
brass = material('Aged brass', (.48, .32, .12))
glow = material('Amber lantern glass', (1, .47, .12), 2)
cursed_wood = material('Cursed bark', (.22, .15, .22))
roof_slate = material('Glazed midnight roof tiles', (.045, .12, .16))
plaster = material('Warm lime plaster', (.59, .56, .43))
rope = material('Straw rope', (.47, .34, .16))
violet = material('Spirit crystal', (.43, .12, .72), .5)


def finish(obj, name, mat):
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def ico(name, p, size, mat, detail=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=detail, radius=1, location=p)
    obj = bpy.context.object
    obj.scale = size
    return finish(obj, name, mat)


def cone(name, p, radius, top, depth, mat, vertices=10):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=top, depth=depth, location=p)
    return finish(bpy.context.object, name, mat)


def block(name, p, size, mat, bevel=.06):
    bpy.ops.mesh.primitive_cube_add(size=1, location=p)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(obj, name, mat)
    if bevel:
        mod = obj.modifiers.new('Worn edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return obj


def branch(a, b, radius, mat=wood):
    delta = Vector(b) - Vector(a)
    obj = cone('Branch', (Vector(a) + Vector(b)) / 2, radius, radius * .62, delta.length, mat, 8)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


def roots(mat=wood):
    for k in range(7):
        angle = k * math.tau / 7
        branch((0, 0, .25), (math.cos(angle) * 1.15, math.sin(angle) * .85, .07), .14, mat)


def pine():
    roots()
    cone('Trunk', (0, 0, 1.8), .28, .12, 3.6, wood)
    for j in range(5):
        z = 1.1 + j * .62
        radius = 1.65 - j * .25
        cone('Needle crown', (0, 0, z + .45), radius, .06, 1.4, leaf[min(3, j % 3 + 1)], 11)
        for k in range(7):
            angle = k * math.tau / 7 + j * .4
            ico('Needle tips', (math.cos(angle) * radius * .67, math.sin(angle) * radius * .67, z + .12),
                (.44, .42, .3), leaf[(j + k) % 4])


def sakura():
    roots()
    branch((0, 0, 0), (.13, .05, 2.8), .3)
    for k in range(11):
        angle = k * 2.4
        r = 1.12 if k < 8 else .5
        p = (math.cos(angle) * r, math.sin(angle) * r, 2.5 + (k % 3) * .32)
        branch((.05, 0, 1.5), p, .13)
        ico('Blossom cloud', p, (.92, .82, .72), pink[k % 4], 2)
        for j in range(3):
            ico('Petal cluster', (p[0] + random.uniform(-.65, .65), p[1] + random.uniform(-.65, .65), p[2] + .45),
                (.38, .36, .28), pink[(j + k + 1) % 4])


def bamboo():
    for k in range(8):
        x, y = random.uniform(-.9, .9), random.uniform(-.7, .7)
        height = random.uniform(2.5, 3.9)
        cone('Bamboo stalk', (x, y, height / 2), .09, .065, height, leaf[2], 7)
        for z in [.7, 1.35, 2.0, 2.65]:
            if z > height: continue
            cone('Bamboo node', (x, y, z), .105, .105, .06, leaf[3], 7)
        for j in range(4):
            angle = j * 1.9 + k
            end = (x + math.cos(angle) * .9, y + math.sin(angle) * .7, height - .3 + j * .07)
            branch((x, y, height - .65), end, .028, leaf[1])
            obj = ico('Lance leaf', end, (.52, .11, .045), leaf[(j + k) % 3 + 1])
            obj.rotation_euler.z = angle


def rocks():
    for k, (p, size) in enumerate([
        ((-.6, .2, .65), (1.05, .82, .9)), ((.65, .05, .5), (.9, .7, .72)), ((.05, -.65, .2), (.65, .4, .35))]):
        obj = ico('Faceted boulder', p, size, stone[k + 1], 1)
        obj.rotation_euler.z = k * .7
        ico('Moss cap', (p[0] - .1, p[1], p[2] + size[2] * .65), (size[0] * .62, size[1] * .6, .12), moss)


def pillar():
    block('Footing', (0, 0, .15), (1.9, 1.7, .3), stone[0])
    block('Plinth', (0, 0, .4), (1.6, 1.45, .25), stone[2])
    block('Shaft', (0, 0, 1.25), (1.1, 1.05, 1.5), stone[1])
    block('Crown', (0, 0, 2.1), (1.65, 1.5, .27), stone[3])
    for x in [-.32, .32]:
        block('Inset cedar face', (x, -.54, 1.3), (.12, .03, .9), brass, .015)
    ico('Crown moss', (-.3, .1, 2.28), (.64, .6, .12), moss)


def ruin():
    for k in range(3):
        block('Foundation', ((k - 1) * .8, .05, .16), (.76, 1.5, .32), stone[k])
    for row in range(2):
        for k in range(3 - row):
            obj = block('Broken masonry', ((k - .8) * .75 + row * .22, .15, .55 + row * .48), (.72, .84, .45), stone[(k + row + 1) % 4])
            obj.rotation_euler.z = random.uniform(-.06, .06)
    ico('Rubble', (1.05, -.4, .22), (.46, .45, .35), stone[1])
    ico('Ruins moss', (-.3, .15, 1.29), (.65, .38, .1), moss)


def lantern():
    block('Lantern plinth', (0, 0, .16), (1.4, 1.35, .32), stone[1])
    cone('Pedestal', (0, 0, .8), .38, .27, 1.1, stone[2], 8)
    block('Lamp base', (0, 0, 1.45), (1.1, 1.05, .23), stone[3])
    block('Warm glass', (0, 0, 1.85), (.72, .65, .66), glow, .02)
    for x in [-.43, .43]:
        for y in [-.39, .39]: block('Lamp frame', (x, y, 1.88), (.1, .1, .8), stone[0], .02)
    roof = cone('Pagoda roof', (0, 0, 2.45), 1.03, .16, .6, stone[1], 4)
    roof.rotation_euler.z = math.pi / 4
    ico('Roof finial', (0, 0, 2.85), (.15, .15, .2), brass)


def cursed_tree():
    roots(cursed_wood)
    branch((0, 0, .12), (.15, 0, 2.5), .43, cursed_wood)
    for k in range(9):
        angle = k * 2.4
        end = (math.cos(angle) * 1.85, math.sin(angle) * 1.45, 1.55 + (k % 3) * .55)
        mid = (end[0] * .6, end[1] * .6, end[2] - .5)
        branch((.1, 0, .8 + k % 3 * .3), mid, .18, cursed_wood)
        branch(mid, end, .12, cursed_wood)
        branch(mid, (end[0] * .85, end[1] * .85, end[2] + .55), .07, cursed_wood)
        if k % 2 == 0: ico('Spirit growth', end, (.24, .22, .38), violet)
    for x in [-.16, .16]: ico('Spirit eyes', (x, -.36, 1.0), (.085, .045, .15), violet)



def pagoda_roof(z, width, depth):
    # Layered flared eaves, with raised seams following each slope.
    roof = cone('Four flared roof slopes', (0, 0, z), width * .71, width * .12, depth, roof_slate, 4)
    roof.rotation_euler.z = math.pi / 4
    block('Wide eave lip', (0, 0, z - depth * .48), (width, width, .11), wood_light, .03)
    for side in [-1, 1]:
        for k in range(-3, 4):
            d = width * k / 9
            branch((d, side * width * .45, z - depth * .35), (d * .22, side * width * .1, z + depth * .43), .025, roof_slate)
            branch((side * width * .45, d, z - depth * .35), (side * width * .1, d * .22, z + depth * .43), .025, roof_slate)


def watchtower(main=False):
    w = 2.65 if main else 2.3
    block('Raised stone footing', (0, 0, .16), (w, w, .32), stone[1])
    block('Foundation rim', (0, 0, .36), (w * .91, w * .91, .16), stone[3])
    block('Plastered tower', (0, 0, .95), (w * .69, w * .69, 1.1), plaster)
    for x in [-1, 1]:
        for y in [-1, 1]: block('Cedar corner beam', (x * w * .34, y * w * .34, .96), (.15, .15, 1.25), wood)
    for side in [-1, 1]:
        block('Front firing slit', (side * .4, -w * .352, 1.0), (.16, .04, .35), wood, .015)
    for k in range(3):
        block('Front stone stair', (0, -w * .55 - k * .15, .28 - k * .07), (.8, .3, .16), stone[2])
    pagoda_roof(1.75, w * 1.15, .8)
    if main:
        block('Keep upper chamber', (0, 0, 2.22), (1.12, 1.12, .62), plaster)
        for x in [-.5, .5]:
            for y in [-.5, .5]: block('Upper pillar', (x, y, 2.22), (.1, .1, .7), wood)
        pagoda_roof(2.73, 1.75, .65)
    tip = 3.2 if main else 2.32
    branch((0, 0, tip - .2), (0, 0, tip + .2), .065, brass)
    ico('Gold roof finial', (0, 0, tip), (.12, .12, .17), brass)


def crate():
    block('Crate body', (0, 0, .7), (1.6, 1.5, 1.4), wood_light)
    for side in [-1, 1]:
        for k in range(5):
            block('End grain planks', (side * .81, -.6 + k * .3, .7), (.035, .26, 1.3), wood, .005)
            block('Front planks', (-.64 + k * .32, side * .76, .7), (.29, .035, 1.3), wood, .005)
        block('Iron band', (side * .55, 0, 1.43), (.12, 1.58, .07), stone[0], .015)
        block('Front frame', (0, side * .8, 1.3), (1.7, .1, .15), brass, .02)
    for a, b in [((-.65, -.83, .18), (.65, -.83, 1.2)), ((.65, -.83, .18), (-.65, -.83, 1.2))]: branch(a, b, .075, wood_light)


def barrel():
    cone('Barrel staves', (0, 0, .68), .7, .67, 1.36, wood_light, 12)
    for z in [.16, 1.14]: cone('Iron hoop', (0, 0, z), .72, .72, .13, stone[0], 12)
    cone('Recessed lid', (0, 0, 1.38), .62, .62, .04, wood, 12)
    for k in range(-2, 3): block('Lid plank', (k * .21, 0, 1.42), (.18, 1.03 - abs(k) * .14, .045), wood_light, .01)
    ico('Bung', (.21, .15, 1.46), (.08, .08, .025), brass)


def shrine():
    block('Shrine platform', (0, 0, .18), (3.5, 2.5, .36), stone[1])
    block('Cedar sanctuary', (0, 0, .8), (2.8, 1.9, 1.1), wood)
    for x in [-1, -.5, 0, .5, 1]: block('Latticed front screen', (x, -1, .9), (.06, .08, .95), wood_light, .01)
    before_roof = set(bpy.data.objects)
    pagoda_roof(1.8, 3.6, .8)
    for obj in set(bpy.data.objects) - before_roof:
        transform = Matrix.Diagonal((1, .68, 1, 1)) @ obj.matrix_world
        obj.data.transform(transform)
        obj.matrix_world = Matrix.Identity(4)
    for k in range(3): block('Shrine stair', (0, -1.35 - k * .18, .24 - k * .06), (1.4, .36, .14), stone[2])
    branch((-1.2, -1.1, 1.3), (1.2, -1.1, 1.3), .06, rope)
    for x in [-.7, 0, .7]: block('Paper prayer strip', (x, -1.12, 1.14), (.13, .035, .26), plaster, .005)


builders = {'pine': pine, 'sakura': sakura, 'bamboo': bamboo, 'rock': rocks,
            'pillar': pillar, 'ruin': ruin, 'lantern': lantern, 'cursed-tree': cursed_tree,
            'watchtower': watchtower, 'fortress': lambda: watchtower(True),
            'crate': crate, 'barrel': barrel, 'shrine': shrine}
collections = {}
for index, (name, builder) in enumerate(builders.items()):
    before = set(bpy.data.objects)
    builder()
    objects = set(bpy.data.objects) - before
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        for old in list(obj.users_collection): old.objects.unlink(obj)
        collection.objects.link(obj)
    collections[name] = collection

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.render.resolution_x = scene.render.resolution_y = 384
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '8'
scene.view_settings.view_transform = 'AgX'
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.5, .61, .7, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .6

bpy.ops.object.camera_add(location=(0, -7, 15))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 1.2)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 5.1
scene.camera = camera
for name, pos, energy, size, color in [
    ('Warm key', (-4, -5, 10), 1000, 6, (1, .86, .66)),
    ('Cool rim', (5, 3, 7), 850, 5, (.62, .8, 1)),
]:
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy; data.shape = 'DISK'; data.size = size; data.color = color
    light = bpy.data.objects.new(name, data); scene.collection.objects.link(light); light.location = pos
    light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()

selected = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
for name, collection in collections.items():
    if selected and name not in selected: continue
    for other in collections.values(): other.hide_render = other != collection
    scene.render.filepath = str(OUTPUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
    print('MAP_PROP_RENDERED', name, flush=True)

# Arrange the editable source as an asset shelf after rendering the overlapping export rig.
for index, collection in enumerate(collections.values()):
    collection.hide_render = False
    for obj in collection.objects: obj.location.x += (index % 4 - 1.5) * 6; obj.location.y += (index // 4) * 7
camera.location = (0, -12, 24)
camera.rotation_euler = (Vector((0, 3, 1)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.ortho_scale = 27
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'map-scenery.blend'))
print('MAP_KIT_COMPLETE', flush=True)
