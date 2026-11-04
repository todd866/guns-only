"""Original fictional air-base models; no reference-game geometry or textures."""
import math
import bpy
from build_assets import empty, box, tube, cylinder, finish, PALETTE
PALETTE.update({'airframe':('#7E9290',.55,.43),'panel':('#536A6B',.45,.57),'plaster':('#B6AE94',0,.9),'roof':('#555B55',.12,.84),'brick':('#786956',0,.9)})

def ellipsoid(name,at,scale,colour,parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,location=at)
    o=bpy.context.object;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,colour,parent)

def plate(name,outline,thickness,colour,parent):
    # XY footprint with a manufactured airfoil edge, not a zero-thickness plane.
    n=len(outline);verts=[(x,y,z+dz) for dz in (-thickness/2,thickness/2) for x,y,z in outline]
    faces=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    return finish(o,name,colour,parent,.025)

def aircraft():
    root=empty('Aircraft_Root')
    # A fictional small jet: narrow fuselage, swept wing, rounded nose, split canopy.
    ellipsoid('Fuselage',(0,0,1.25),(.72,4.1,.57),'airframe',root)
    ellipsoid('Nose',(0,3.35,1.24),(.5,1.3,.42),'airframe',root)
    ellipsoid('CockpitSeal',(0,1.35,1.73),(.49,1.28,.18),'graphite',root)
    ellipsoid('Canopy',(0,1.42,1.79),(.44,1.15,.32),'glass',root)
    for y in (.9,1.9):
        tube('CanopyHoop',[(-.43,y,1.79),(-.32,y,2.02),(0,y,2.12),(.32,y,2.02),(.43,y,1.79)],.022,'alloy',root)
    for side in (-1,1):
        plate('Wing',[(side*.5,1,1.22),(side*5,-.4,1.22),(side*4.8,-1.3,1.22),(side*.6,-1.6,1.22)],.13,'airframe',root)
        plate('Flap',[(side*.9,-1.25,1.3),(side*4.5,-1.03,1.3),(side*4.4,-1.2,1.3),(side*.9,-1.48,1.3)],.008,'panel',root)
        plate('Stabilizer',[(side*.2,-2.9,1.35),(side*2,-3.6,1.35),(side*1.8,-4,1.35),(side*.2,-3.8,1.35)],.09,'airframe',root)
        tube('GearStrut',[(side*.8,-.9,1.2),(side*1,-1,.26)],.065,'alloy',root)
        cylinder('MainTire',(side*1,-1,.25),.25,.19,'rubber',root,'X',24)
        cylinder('MainHub',(side*1.105,-1,.25),.13,.025,'alloy',root,'X',16)
        # Original neutral identification stripes and servicing panels.
        plate('WingStripe',[(side*3.3,.09,1.295),(side*3.55,.02,1.295),(side*3.55,-1.1,1.295),(side*3.3,-1.12,1.295)],.005,'ivory',root)
        tube('PanelSeam',[(side*.63,y,1.57) for y in (-2,-1,0,.5)],.008,'panel',root)
        ellipsoid('Intake',(side*.59,.3,1.15),(.16,.65,.29),'graphite',root)
    # Tail is a real tapered fin; rotate its thin plate upright.
    fin=plate('TailFin',[(0,-2.8,1.6),(0,-3.4,3.15),(0,-4,3.15),(0,-3.9,1.5)],.1,'panel',root)
    # plate extrusion above is Z; build explicit fin with X thickness instead.
    for v in fin.data.vertices:v.co.x += .055 if v.index>=4 else -.055
    cylinder('Exhaust',(0,-3.9,1.25),.38,.28,'graphite',root,'Y',24)
    cylinder('ExhaustLip',(0,-4.05,1.25),.41,.07,'alloy',root,'Y',24)
    tube('NoseStrut',[(0,2.6,1),(0,2.6,.20)],.045,'alloy',root)
    cylinder('NoseTire',(0,2.6,.20),.2,.13,'rubber',root,'X',20)
    return root

def quarters():
    root=empty('Quarters_Root')
    box('Foundation',(0,0,.2),(8,8,.4),'brick',root,.025)
    box('Walls',(0,0,2.65),(7.8,7.8,4.9),'plaster',root,.02)
    # Sloping roof, with fascia, ridge cap and visible standing seams.
    for side in (-1,1):
        o=box('Roof',(side*2.05,0,5.5),(4.5,8.5,.16),'roof',root,.015);o.rotation_euler.y=side*.31
        for y in range(-4,5):
            tube('RoofSeam',[(0,y,6.16),(side*4.25,y,4.8)],.018,'panel',root)
    box('Ridge',(0,0,6.19),(.14,8.6,.12),'panel',root,.03)
    for side in (-1,1):
        y=side*3.93
        for x in (-2.35,2.35):
            box('WindowFrame',(x,y,2.8),(1.7,.12,1.75),'ivory',root,.015)
            box('WindowGlass',(x,y+side*.075,2.8),(1.48,.035,1.54),'glass',root,.004)
            box('WindowSill',(x,y+side*.10,1.93),(1.9,.25,.09),'brick',root,.01)
            box('WindowMullion',(x,y+side*.10,2.8),(.055,.04,1.56),'ivory',root,.003)
            box('WindowCrossbar',(x,y+side*.11,2.8),(1.5,.04,.055),'ivory',root,.003)
        box('DoorFrame',(0,y,1.4),(1.35,.12,2.5),'ivory',root,.015)
        box('Door',(0,y+side*.07,1.38),(1.13,.05,2.3),'teal',root,.008)
        box('DoorInset',(0,y+side*.10,1.9),(.8,.025,.7),'glass',root,.003)
        cylinder('DoorHandle',(.4,y+side*.13,1.3),.035,.04,'alloy',root,'Y',12)
        box('DoorCanopy',(0,y+side*.2,2.8),(1.8,.5,.12),'roof',root,.02)
        tube('Gutter',[(-4.1,side*4.14,4.9),(4.1,side*4.14,4.9)],.07,'panel',root)
        tube('Drainpipe',[(3.65,y,4.9),(3.65,y,.3)],.045,'panel',root)
    # Street-facing side elevations carry the same human-scale window detail.
    for side in (-1,1):
        x=side*3.93
        for y in (-2.3,2.3):
            box('SideFrame',(x,y,2.8),(.12,1.7,1.75),'ivory',root,.015)
            box('SideGlass',(x+side*.075,y,2.8),(.035,1.48,1.54),'glass',root,.004)
            box('SideSill',(x+side*.10,y,1.93),(.25,1.9,.09),'brick',root,.01)
            box('SideMullion',(x+side*.10,y,2.8),(.04,.055,1.56),'ivory',root,.003)
            box('SideCrossbar',(x+side*.11,y,2.8),(.04,1.5,.055),'ivory',root,.003)
    box('Chimney',(2,1.8,5.8),(.65,.65,1.2),'brick',root,.025)
    box('ChimneyCap',(2,1.8,6.45),(.85,.85,.12),'roof',root,.02)
    for z in (.7,4.6):box('WallBand',(0,0,z),(7.94,7.94,.1),'brick',root,.005)
    return root
