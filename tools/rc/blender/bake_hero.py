#!/usr/bin/env python3
"""Bake compact hero meshes from JSON into an editable Blender file and GLB.

Input positions are metres in a Y-up frame. The right-handed mapping (x,y,z)->(x,-z,y)
keeps triangle orientation (determinant +1). AO is deterministic corner data, not a texture.
"""
import argparse,json,math,sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def material(name,color,rough=.7,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
    base=n.new('ShaderNodeRGB');base.outputs[0].default_value=(*color,1);vc=n.new('ShaderNodeVertexColor');vc.layer_name='AO';mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;links=m.node_tree.links;links.new(base.outputs[0],mix.inputs[1]);links.new(vc.outputs['Color'],mix.inputs[2]);links.new(bs.outputs[0],out.inputs[0]);return m

def bake_ao(obj,bvh):
    me=obj.data
    if 'AO' in me.color_attributes:me.color_attributes.remove(me.color_attributes['AO'])
    ao=me.color_attributes.new(name='AO',type='FLOAT_COLOR',domain='CORNER');golden=math.pi*(3-math.sqrt(5))
    cache={}
    for loop in me.loops:
        vi=loop.vertex_index
        if vi not in cache:
            v=me.vertices[vi];n=v.normal.normalized();u=n.cross(Vector((0,1,0)))
            if u.length<.01:u=n.cross(Vector((1,0,0)))
            u.normalize();w=n.cross(u).normalized();clear=0
            for k in range(8):
                q=(k+.5)/8;theta=golden*k;rad=math.sqrt(max(0,1-q*q));d=(u*math.cos(theta)+w*math.sin(theta))*rad+n*q
                hit=bvh.ray_cast(v.co+n*.006,d,3.0)[0];clear+=0 if hit else 1
            cache[vi]=clear/8
        a=.25+.75*cache[vi];base=me.color_attributes.get('InputColor');c=base.data[loop.index].color if base else (1,1,1,1);ao.data[loop.index].color=(a*c[0],a*c[1],a*c[2],1)

def build(inp):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for spec in inp.get('meshes',[]):
        pos=spec['positions'];verts=[(pos[i],-pos[i+2],pos[i+1]) for i in range(0,len(pos),3)];idx=spec.get('indices');faces=[tuple(idx[i:i+3]) for i in range(0,len(idx),3)] if idx else [tuple(range(i,i+3)) for i in range(0,len(verts),3)]
        me=bpy.data.meshes.new(spec.get('name','HeroMesh'));me.from_pydata(verts,[],faces);me.materials.append(material(spec.get('name','HeroMaterial'),spec.get('color',[.65,.7,.72]),spec.get('roughness',.7),spec.get('metalness',0)));obj=bpy.data.objects.new(spec.get('name','Hero'),me);bpy.context.collection.objects.link(obj)
        if spec.get('colors'):
            colors=me.color_attributes.new(name='InputColor',type='FLOAT_COLOR',domain='CORNER')
            for loop in me.loops:colors.data[loop.index].color=(*spec['colors'][loop.vertex_index*3:loop.vertex_index*3+3],1)
        for p in me.polygons:p.use_smooth=inp.get('smooth',True)
        bevel=obj.modifiers.new('small edge bevel','BEVEL');bevel.width=.04;bevel.segments=2;bevel.limit_method='ANGLE';bevel.angle_limit=.35
        bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.modifier_apply(modifier=bevel.name) if inp.get('bevel',True) else obj.modifiers.remove(bevel);obj.select_set(False)
    vertices=[];faces=[]
    for obj in bpy.context.scene.objects:
        offset=len(vertices);vertices.extend([v.co for v in obj.data.vertices]);faces.extend([tuple(offset+i for i in p.vertices) for p in obj.data.polygons])
    bvh=BVHTree.FromPolygons(vertices,faces,all_triangles=False)
    for obj in bpy.context.scene.objects:
        bake_ao(obj,bvh)
        obj.data.color_attributes.active_color=obj.data.color_attributes['AO']
        if 'InputColor' in obj.data.color_attributes:obj.data.color_attributes.remove(obj.data.color_attributes['InputColor'])
        obj.data.color_attributes.active_color_index=0
        obj.data.color_attributes.render_color_index=0
    bpy.ops.wm.save_as_mainfile(filepath=build.blend)
    bpy.ops.export_scene.gltf(filepath=build.output,export_format='GLB',export_vertex_color='ACTIVE',export_all_vertex_colors=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);ap.add_argument('--blend',required=True);a=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);build.input=a.input;build.output=a.output;build.blend=a.blend;build(json.load(open(a.input)))
