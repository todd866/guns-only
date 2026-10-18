"""Original RC asset authoring. Run only when the shared Blender/build slot is free.
blender --background --factory-startup --python tools/rc/blender/build_assets.py -- --out web/wwwroot/rc/assets
No rendering, network, downloads or proprietary asset reads. Saves editable .blend and GLB.
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector

PALETTE = {
    'shell': ('#DFA438', .20, .30), 'ivory': ('#E8DDC1', .05, .45),
    'graphite': ('#243239', .45, .42), 'rubber': ('#151E24', .0, .90),
    'alloy': ('#A8B7B7', .80, .27), 'copper': ('#BE6D42', .65, .32),
    'glass': ('#244F63', .55, .16), 'teal': ('#5B7779', .35, .62),
    'concrete': ('#9DA39A', .0, .88), 'red': ('#A94F3C', .25, .43),
    'wood': ('#A9926B', .0, .72), 'light': ('#F2DFC0', .0, .32),
}
MATS = {}


def linear(v):
    return v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4


def material(name):
    if name in MATS:
        return MATS[name]
    colour, metal, rough = PALETTE[name]
    rgb = [linear(int(colour[i:i+2], 16) / 255) for i in (1, 3, 5)]
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    if name == 'light':
        shader.inputs['Emission Color'].default_value = (*rgb, 1)
        shader.inputs['Emission Strength'].default_value = 2
    MATS[name] = m
    return m


def empty(name, parent=None, at=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.location = at
    return o


def finish(o, name, colour, parent, bevel=0):
    o.name = name
    o.parent = parent
    o.data.materials.append(material(colour))
    if bevel:
        m = o.modifiers.new('Manufactured edge radius', 'BEVEL')
        m.width = bevel
        m.segments = 2
    for p in o.data.polygons:
        p.use_smooth = True
    if o.type == 'MESH':
        m = o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
        m.keep_sharp = True
    return o


def box(name, at, size, colour, parent, bevel=.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, name, colour, parent, bevel)


def cylinder(name, at, radius, depth, colour, parent, axis='Z', sides=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=depth, location=at)
    o = bpy.context.object
    if axis == 'X':
        o.rotation_euler.y = math.pi / 2
    elif axis == 'Y':
        o.rotation_euler.x = math.pi / 2
    return finish(o, name, colour, parent, .002)


def tube(name, points, radius, colour, parent, resolution=2):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = resolution
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for p, co in zip(spline.points, points):
        p.co = (*co, 1)
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    o.parent = parent
    o.data.materials.append(material(colour))
    return o


def loft(name, sections, colour, parent):
    # Cross sections (forward Y, half-width X, bottom Z, top Z).
    verts = [(x, y, z) for y, w, lo, hi in sections for x, z in [(-w, lo), (w, lo), (w, hi), (-w, hi)]]
    faces = [(0, 3, 2, 1)]
    for j in range(len(sections)-1):
        for i in range(4):
            faces.append((j*4+i, j*4+(i+1)%4, (j+1)*4+(i+1)%4, (j+1)*4+i))
    k = (len(sections)-1)*4
    faces.append((k, k+1, k+2, k+3))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    o = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(o)
    return finish(o, name, colour, parent, .012)


def proxy(name, at, size, parent):
    o = box(name, at, size, 'graphite', parent, 0)
    o['collision_proxy'] = True
    o['render'] = False
    return o


def buggy():
    root = empty('RC_Root')
    root['asset_version'] = 1
    body = empty('Body', root)
    loft('SculptedShell', [(.43,.11,.02,.085),(.30,.20,.02,.15),(.12,.205,.025,.18),(-.22,.19,.035,.17),(-.36,.14,.04,.10)], 'shell', body)
    loft('RakedCanopy', [(.22,.115,.14,.15),(.045,.13,.16,.285),(-.14,.11,.15,.275),(-.23,.10,.13,.15)], 'glass', body)
    box('CarbonChassis', (0,0,.005), (.31,.64,.032), 'graphite', body)
    for side in (-1, 1):
        tube('CanopyRail', [(side*.14,.23,.15),(side*.14,.045,.295),(side*.12,-.14,.29),(side*.12,-.26,.13)], .01, 'ivory', body)
        tube('SideNerf', [(side*.18,.30,.01),(side*.24,.18,.02),(side*.24,-.22,.02)], .012, 'graphite', body)
        box('NoseLamp', (side*.14,.366,.10), (.065,.022,.025), 'ivory', body)
        box('WingMount', (side*.15,-.34,.18), (.016,.035,.12), 'alloy', body)
        box('WingEndplate', (side*.245,-.37,.25), (.016,.15,.065), 'shell', body)
    box('RearWing', (0,-.37,.23), (.51,.13,.02), 'graphite', body)
    tube('FrontBumper', [(-.20,.43,.02),(0,.47,.005),(.20,.43,.02)], .014, 'graphite', body)
    tube('ReceiverWhip', [(.1,-.18,.18),(.1,-.2,.4),(.105,-.24,.59)], .003, 'graphite', body)
    box('NoseStripe', (0,.29,.157), (.055,.17,.006), 'ivory', body, .001)
    for name, x, y in [('FL',-.29,.25),('FR',.29,.25),('RL',-.29,-.25),('RR',.29,-.25)]:
        pivot = empty('Steer_'+name, root, (x,y,-.08))
        spin = empty('Wheel_'+name, pivot)
        cylinder('Tire_'+name, (0,0,0), .147, .135, 'rubber', spin, 'X', 24)
        for side in (-1,1):
            cylinder('Rim_'+name, (side*.073,0,0), .088, .014, 'alloy', spin, 'X')
            cylinder('Hub_'+name, (side*.084,0,0), .030, .016, 'copper', spin, 'X', 12)
            for j in range(6):
                a = j*math.pi/3
                o = box('SpokeInset', (side*.082,math.sin(a)*.054,math.cos(a)*.054), (.008,.018,.055), 'graphite', spin, .002)
                o.rotation_euler.x = -a
        for j in range(20):
            a = j*math.pi/10
            o = box('Tread_'+name, (0,math.sin(a)*.147,math.cos(a)*.147), (.14,.032,.015), 'rubber', spin, .002)
            o.rotation_euler.x = -a
        side = -1 if x < 0 else 1
        for dy in (-.06,.06):
            tube('Wishbone_'+name, [(side*.09,y+dy,.01),(x,y,-.07)], .008, 'alloy', body)
        tube('Damper_'+name, [(side*.17,y,.14),(x,y,-.03)], .012, 'alloy', body)
        points=[]
        for j in range(49):
            t=j/48
            points.append((side*(.17+.12*t)+math.cos(t*12*math.pi)*.018, y+math.sin(t*12*math.pi)*.018, .14-.17*t))
        tube('Coil_'+name, points, .004, 'copper', body, 1)
    proxy('COLLISION_body', (0,0,.10), (.44,.75,.23), root)
    return root


def hangar():
    root=empty('Hangar_Root')
    root['asset_version']=1
    box('Floor',(0,0,-.08),(18,22,.16),'concrete',root,.015)
    # Full-height frame, corrugated wall sections, a clear five-metre central lane.
    for i,y in enumerate(range(-10,11,4)):
        truss=empty(f'Truss_{i:02d}',root)
        for x in (-8.7,8.7):
            box('Column',(x,y,4),(.22,.30,8),'teal',truss,.01)
            box('ColumnShoe',(x,y,.4),(.4,.45,.8),'graphite',truss,.02)
        box('Crossbeam',(0,y,7.75),(17.5,.24,.25),'teal',truss,.01)
        for x in range(-8,8,2):
            tube('TrussWeb',[(x,y,7.7),(x+1,y,7.05),(x+2,y,7.7)],.045,'alloy',truss,1)
        for x in (-5,5):
            box('LampHousing',(x,y,7.5),(2.8,.5,.12),'graphite',truss,.015)
            box('LampDiffuser',(x,y,7.42),(2.6,.34,.03),'light',truss,.005)
    for x in (-8.9,8.9):
        box('WallPanel',(x,0,4),(.12,22,8),'teal',root,.008)
        for j in range(44):
            box('PanelRib',(x*.995,-10.75+j*.5,4),(.055,.035,7.7),'alloy',root,.003)
    for x in (-2.5,2.5):
        box('LanePaint',(x,0,.012),(.055,21,.008),'shell',root,0)
    for y in range(-10,11,2):
        box('ExpansionJoint',(0,y,.014),(17.7,.018,.006),'graphite',root,0)
    bench=empty('Workbench',root,(-7.5,1,0))
    box('BenchTop',(0,0,1.05),(2,3.2,.13),'wood',bench,.02)
    box('Cabinet',(0,0,.5),(1.8,3,1),'teal',bench,.025)
    for y in (-1,-.5,0,.5,1):
        box('DrawerFront',(0.92,y,.65),(.04,.45,.5),'graphite',bench,.01)
        box('DrawerPull',(0.95,y,.78),(.025,.28,.025),'alloy',bench,.005)
    box('PegBoard',(-.95,0,2.1),(.08,3,1.5),'wood',bench,.01)
    for y in (-1,-.5,0,.5,1):
        tube('HangingTool',[(-.89,y,1.8),(-.89,y,2.3)],.025,'alloy',bench,1)
    proxy('COLLISION_workbench',(-7.5,1,.55),(2,3.2,1.1),root)
    cart=empty('Toolbox',root,(7.4,-5,0))
    box('ToolChest',(0,0,.65),(1.05,.65,.95),'red',cart,.035)
    for z in (.4,.6,.8,1):
        box('Drawer',(0,-.335,z),(.91,.025,.14),'red',cart,.006)
        box('Handle',(0,-.36,z),(.7,.025,.025),'alloy',cart,.004)
    for x in (-.4,.4):
        for y in (-.24,.24):
            cylinder('Caster',(x,y,.12),.11,.07,'rubber',cart,'X',12)
    proxy('COLLISION_toolbox',(7.4,-5,.6),(1.1,.75,1.2),root)
    tube('AirHose',[(-7,.1,.06),(-5.8,-.3,.045),(-5.2,-1.3,.035),(-6.1,-2,.035),(-6.7,-1.1,.04)],.025,'copper',root,2)
    return root


def export(root,out,name):
    bpy.ops.object.select_all(action='DESELECT')
    members=[root,*root.children_recursive]
    for o in members:
        o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.wm.save_as_mainfile(filepath=str(out/(name+'.blend')))
    bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=True)
    for name,builder in [('buggy',buggy),('hangar-slice',hangar)]:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        root=builder()
        bpy.context.scene.unit_settings.system='METRIC'
        bpy.context.scene.unit_settings.scale_length=1
        export(root,out,name)
    (out/'provenance.json').write_text(json.dumps({'generator':'tools/rc/blender/build_assets.py','blender':bpy.app.version_string,'license':'MIT (original authored geometry/materials)','external_assets':[],'concept_usage':'reference only; never a mesh conversion'},indent=2)+'\n')

if __name__=='__main__':main()
