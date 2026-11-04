"""Separate review renders; run only after heavy-slot clearance.
blender --background ASSET.blend --python tools/rc/blender/render_review.py -- --kind buggy --out /tmp/rc-review
Never used as evidence of runtime Three.js appearance or frame pacing.
"""
import argparse
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector


def area(name,location,energy,size,colour,target):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=energy;data.shape='DISK';data.size=size;data.color=colour
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj)
    obj.location=location
    obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


def main():
    p=argparse.ArgumentParser();p.add_argument('--kind',choices=['buggy','hangar'],required=True);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);args.out.mkdir(parents=True,exist_ok=True)
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
    scene.render.resolution_x=1200;scene.render.resolution_y=800;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.world.color=(.07,.09,.10)
    for o in scene.objects:
        if o.name.startswith('COLLISION_'):o.hide_render=True
    camera_data=bpy.data.cameras.new('ReviewCamera');camera=bpy.data.objects.new('ReviewCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
    camera_data.lens=48
    if args.kind=='buggy':
        bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.232))
        plane=bpy.context.object;plane.name='ReviewGround'
        mat=bpy.data.materials.new('ReviewGround');mat.diffuse_color=(.18,.22,.23,1);plane.data.materials.append(mat)
        area('Key',(-1.5,1.5,2.5),190,2,(1,.82,.63),(0,0,0))
        area('Fill',(2,.2,1.2),100,2,(.61,.78,1),(0,0,0))
        area('Rim',(0,-2,1.5),160,1.5,(1,.72,.42),(0,0,.1))
        shots=[('hero',(1.25,-1.65,.65),(0,0,.08)),('front',(-.9,1.6,.55),(0,0,.08)),('side',(1.8,0,.40),(0,0,.1))]
    else:
        area('DoorDaylight',(0,14,5),1700,8,(.67,.8,1),(0,0,0))
        area('WarmService',(-4,0,6.8),1000,5,(1,.79,.53),(0,0,0))
        shots=[('lane',(0,8,.8),(0,-3,1.2)),('workbench',(-3,3,1.4),(-7.5,1,1.2)),('structure',(4,8,2),(0,0,5))]
    for name,position,target in shots:
        camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str((args.out/f'{args.kind}-{name}.png').resolve());bpy.ops.render.render(write_still=True)

if __name__=='__main__':main()
