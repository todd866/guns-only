#!/usr/bin/env python3
"""Saucer Springs neighbourhood skate plaza. Original geometry in park-centred metres.
North is Blender +Y / glTF -Z. Run Blender -b -t 3 --python this-file.
Reference documents and source-location identities are deliberately absent from this asset.
"""
import sys,math,json,random
from pathlib import Path
import bpy,bmesh
sys.path.insert(0,str(Path(__file__).parent/'districts'))
import common as c
R=Path(__file__).resolve().parents[3];random.seed(71)
bpy.ops.wm.read_factory_settings(use_empty=True)
c.ROOT=c.marker('Neighbourhood_Skate_Plaza',(0,0,0));c.ROOT.parent=None
c.PALETTE.update({k:(v,.65 if k=='steel' else 0,.38 if k=='steel' else .85) for k,v in {'path':'#9B9D95','floor':'#BFC1B5','concrete':'#BFC1B5','edge':'#D6D4C4','joint':'#929B94','teal':'#3EA49B','coral':'#DE876E','gold':'#E1B856','blue':'#467D99','ink':'#384C56','cream':'#EEE5C9','steel':'#738990','wood':'#A67B50','paint':'#FFFFFF'}.items()})
def add(m,g,up=False):c.vis('plaza',m).add(g,kind='up' if up else 'closed')
def box(m,x,y,z,w,d,h):add(m,c.box(x,y,z,w,d,h))
def phys(name,m,g,up=False):add(m,g,up);c.col('concrete',name,c.Geo().add(g,kind='up' if up else 'closed'))
def slab(pts,z0,z1):
 # The plaza outline is concave. Ear tessellation preserves its recesses; the
 # shared convex-only slab helper would incorrectly fill the eastern notch.
 from mathutils import Vector
 from mathutils.geometry import tessellate_polygon
 n=len(pts);v=[(x,y,z0) for x,y in pts]+[(x,y,z1) for x,y in pts];faces=[]
 for tri in tessellate_polygon([[Vector((x,y,0)) for x,y in pts]]):
  ids=[p if isinstance(p,int) else min(range(n),key=lambda i:(pts[i][0]-p.x)**2+(pts[i][1]-p.y)**2) for p in tri]
  faces.extend([tuple(reversed(ids)),tuple(n+i for i in ids)])
 for i in range(n):
  j=(i+1)%n;faces.append((i,j,n+j,n+i))
 return v,faces
# Local metre footprint and measured arrangement; vertical dimensions are designed for toys.
outline=[(-18.803,1.307),(-1.196,6.252),(.930,10.087),(3.749,12.814),(3.148,16.742),(12.206,19.238),(15.903,8.239),(10.912,6.668),(9.896,4.680),(10.219,-.218),(13.870,.429),(15.534,-6.919),(-13.951,-15.053)]
phys('continuous_concrete','floor',slab(outline,-.13,.14))
# The broad pad has poured-concrete expansion joints rather than a painted oval road.
a=.274;ca,sa=math.cos(a),math.sin(a)
def xf(p,origin):return (origin[0]+p[0]*ca-p[1]*sa,origin[1]+p[0]*sa+p[1]*ca,p[2])
def shape(g,origin):return c.transform(g,lambda p:xf(p,origin))
def lbox(m,origin,x,y,z,w,d,h):add(m,shape(c.box(x,y,z,w,d,h),origin))
def lphys(name,m,origin,x,y,z,w,d,h):phys(name,m,shape(c.box(x,y,z,w,d,h),origin))
def rail(origin,p,q,r=.04):
 p=xf(p,origin);q=xf(q,origin)
 # Low-poly round tubular railing aligned with its true segment, with closed caps.
 from mathutils import Vector
 axis=Vector(q)-Vector(p);u=axis.normalized().cross(Vector((0,0,1)))
 if u.length<.001:u=Vector((1,0,0))
 u.normalize();v=axis.normalized().cross(u);verts=[]
 for point in [Vector(p),Vector(q)]:
  for i in range(12):verts.append(tuple(point+r*(u*math.cos(i*math.tau/12)+v*math.sin(i*math.tau/12))))
 faces=[tuple(reversed(range(12))),tuple(range(12,24))]+[(i,(i+1)%12,(i+1)%12+12,i+12) for i in range(12)]
 add('steel',(verts,faces))
# Main rectangle's western banks: segmented low ramps and an upper deck.
west=(-15.522,-3.638)
lphys('western_deck','concrete',west,-.9,0,.14,1.2,10.7,.85)
# Smooth transition from eastern flat to western bank; top deck remains avoidable.
vs=[]
for i in range(25):
 t=i/24;x=1.6-2*t;h=.14+.85*(1-math.cos(t*math.pi/2))
 vs.extend([xf((x,-5.35,h),west),xf((x,5.35,h),west)])
fs=[(2*i,2*i+2,2*i+3,2*i+1) for i in range(24)]
phys('west_transition','paint',(vs,fs),True)
rail(west,(-.4,-5.35,1.01),(-.4,5.35,1.01))
# Central funbox/hubba: flat top, approach bank, opposite bank and a raised long ledge.
centre=(-3.691,.983)
lphys('central_deck','concrete',centre,0,0,.14,5.5,2.4,.66)
def bank_height(t):
 # Rounded toe joins flat concrete; the straight upper bank carries momentum
 # through the lip rather than easing the car flat before takeoff.
 u=1-t;toe=.18
 return .14+.66*(u*u/(2*toe) if u<toe else u-toe/2)/(1-toe/2)
for side in [-1,1]:
 vs=[]
 for i in range(25):
  t=i/24;y=side*(1.2+1.9*t);h=bank_height(t)
  vs.extend([xf((-2.75,y,h),centre),xf((2.75,y,h),centre)])
 fs=[(2*i,2*i+2,2*i+3,2*i+1) for i in range(24)]
 phys(f'central_bank_{side}','concrete',(vs,fs),True)
# The western end joins the two long banks around a convex 90-degree hip.
# All three faces meet at the same deck height; the diagonal ridges are rideable
# takeoff edges, with a broad adjoining face to land on. No wall across the runout.
vs=[]
for i in range(25):
 t=i/24;h=bank_height(t)
 vs.extend([xf((-2.75-1.9*t,-1.2,h),centre),xf((-2.75-1.9*t,1.2,h),centre)])
phys('central_west_bank','concrete',(vs,[(2*i,2*i+2,2*i+3,2*i+1) for i in range(24)]),True)
for side in [-1,1]:
 vs=[]
 for j in range(25):
  for i in range(25):
   u=i/24;v=j/24
   vs.append(xf((-2.75-1.9*u,side*(1.2+1.9*v),bank_height(max(u,v))),centre))
 fs=[]
 for j in range(24):
  for i in range(24):
   a=j*25+i
   # Split along the convex diagonal, so the two bank planes retain a true hip.
   fs.extend([(a,a+1,a+26),(a,a+26,a+25)])
 phys(f'central_hip_{side}','concrete',(vs,fs),True)
lphys('central_hubba','paint',centre,2.48,0,.14,.52,5.9,.98)
lbox('steel',centre,2.48,0,1.12,.55,6,.045)
# Long descending tubular rail beside the central bank, matching its layout.
rail(centre,(-1.6,-2.75,.61),(-1.6,2.75,1.22))
for y,z in [(-2.4,.65),(0,.92),(2.4,1.18)]:rail(centre,(-1.6,y,.3),(-1.6,y,z),.033)
# Southern manual ledge with a short rail, aligned to the concrete pad.
south=(-.364,-8.537)
lphys('southern_manual_pad','paint',south,0,0,.14,8.5,1.25,.36)
lbox('steel',south,0,-.61,.50,8.5,.055,.035)
rail(south,(-1.2,0,.98),(1.2,0,.98))
for x in [-1.0,1.0]:rail(south,(x,0,.5),(x,0,.98),.033)
# The narrow north-east shoulder is a three-sided curved bowl, open toward the main pad.
# No vertical wall crosses the mouth: continuous ground-level access remains at west/southwest.
bowl=(8.555,12.953)
def bowl_wall(axis,sign,start,end,outer):
 vs=[];steps=24
 for j in range(steps+1):
  t=j/steps;d=1.35*t;h=.14+1.12*(1-math.sqrt(max(0,1-t*t)))
  for k in range(17):
   along=start+(end-start)*k/16
   x,y=(sign*(outer-1.35+d),along) if axis=='x' else (along,sign*(outer-1.35+d))
   vs.append(xf((x,y,h),bowl))
 fs=[]
 for j in range(steps):
  for k in range(16):
   v=j*17+k;fs.append((v,v+1,v+18,v+17))
 phys(f'bowl_{axis}_{sign}','paint',(vs,fs),True)
 if axis=='x':p,q=(sign*outer,start,1.29),(sign*outer,end,1.29)
 else:p,q=(start,sign*outer,1.29),(end,sign*outer,1.29)
 rail(bowl,p,q,.045)
 # Thin supporting rear face; not an obstruction at the open mouth.
 p0,q0=(*p[:2],.14),(*q[:2],.14)
 add('edge',shape(([p0,q0,q,p],[(0,1,2,3)]),bowl))
bowl_wall('y',1,-3.9,2.55,3.1)
bowl_wall('x',1,-1.75,1.75,3.9)
bowl_wall('y',-1,-1.3,2.55,3.1)
# Rounded north-east and south-east transition corners instead of square intersections.
for sy in [-1,1]:
 vs=[]
 for j in range(17):
  t=j/16;r=1.35*t;h=.14+1.12*(1-math.sqrt(max(0,1-t*t)))
  for i in range(17):
   ang=math.pi/2*i/16;vs.append(xf((2.55+r*math.cos(ang),sy*(1.75+r*math.sin(ang)),h),bowl))
 fs=[]
 for j in range(16):
  for i in range(16):
   v=j*17+i;fs.append((v,v+1,v+18,v+17))
 phys(f'bowl_corner_{sy}','paint',(vs,fs),True)
 for i in range(16):
  aa=math.pi/2*i/16;bb=math.pi/2*(i+1)/16
  rail(bowl,(2.55+1.35*math.cos(aa),sy*(1.75+1.35*math.sin(aa)),1.29),(2.55+1.35*math.cos(bb),sy*(1.75+1.35*math.sin(bb)),1.29),.045)
# Three small ground-painted chevrons invite the diagonal bank transfer. They
# occupy the flat approach; the player is free to pass either side.
heading=(-math.cos(1),-math.sin(1));ridge=(-3.05,1.5)
for back in [3.0,2.4,1.8]:
 x=ridge[0]-heading[0]*back;y=ridge[1]-heading[1]*back
 right=(-heading[1],heading[0]);pts=[]
 for along,side in [(.18,0),(-.10,-.14),(-.04,0),(-.10,.14)]:
  pts.append(xf((x+heading[0]*along+right[0]*side,y+heading[1]*along+right[1]*side,.146),centre))
 add('teal',(pts,[(0,1,2),(0,2,3)]),True)
# Continuous paved bench shoulder connected flush to the main concrete.
phys('bench_shoulder','path',slab([(12.206,19.238),(15.0,20.0),(19.0,7.7),(15.903,8.239)],-.12,.14))
# Traversable .14m pad edge: a half-metre smooth rolled apron around the union
# of the measured slab and bench shoulder. Inner outline remains unchanged.
apron_loop=outline[:6]+[(15.0,20.0),(19.0,7.7)]+outline[6:]
area=sum(p[0]*q[1]-q[0]*p[1] for p,q in zip(apron_loop,apron_loop[1:]+apron_loop[:1]))
sign=1 if area>0 else -1
outward=[]
for i,p in enumerate(apron_loop):
 prev=apron_loop[i-1];nxt=apron_loop[(i+1)%len(apron_loop)]
 e1=(p[0]-prev[0],p[1]-prev[1]);e2=(nxt[0]-p[0],nxt[1]-p[1])
 n1=(sign*e1[1]/math.hypot(*e1),-sign*e1[0]/math.hypot(*e1))
 n2=(sign*e2[1]/math.hypot(*e2),-sign*e2[0]/math.hypot(*e2))
 bis=(n1[0]+n2[0],n1[1]+n2[1]);den=max(.25,bis[0]*n1[0]+bis[1]*n1[1])
 outward.append((bis[0]/den,bis[1]/den))
vs=[];bands=8;count=len(apron_loop)
for j in range(bands+1):
 t=j/bands;h=.14*(1-t*t*(3-2*t))
 for p,n in zip(apron_loop,outward):vs.append((p[0]+n[0]*.5*t,p[1]+n[1]*.5*t,h))
faces=[]
for j in range(bands):
 for i in range(count):
  a=j*count+i;b=j*count+(i+1)%count;faces.append((a,b,b+count,a+count))
phys('rolled_perimeter_apron','floor',(vs,faces),True)
# Existing paved northeast shoulder with its row of benches; all beside, never across, play space.
for x,z in [(14.563,-17.759),(15.672,-14.339),(17.013,-10.688)]:
 origin=(x,-z)
 for k in range(4):lbox('wood',origin,0,k*.10,.51,2.15,.08,.075)
 for dx in [-.77,.77]:lbox('ink',origin,dx,.15,.15,.07,.42,.34)
 for k in range(3):lbox('wood',origin,0,.41,.68+k*.12,2.15,.055,.08)
# Flat, forgiving starter lap threads the main pad without forcing a ramp or the bowl.
route=c.Route([(5,-4),(9,-1),(7,4),(2,5.8),(-9,2.7),(-10,-1),(-8,-5),(2,-5)],[1.6]*8)
for i,d in enumerate([0,route.length*.25,route.length*.5,route.length*.75]):
 p,t,n=route.at(d);c.marker(f'GATE_{i:02d}',(*p,.15),t,(1.8,1,1),{'lap_order':i,'half_width_m':1.8,'track_distance_m':d})
p,t,n=route.at(0)
for k in range(8):
 back=2.0+(k//2)*1.8;lat=(k%2-.5)*1.15
 c.marker(f'START_{k+1}',(p[0]-t[0]*back+n[0]*lat,p[1]-t[1]*back+n[1]*lat,.15),t,extras={'grid_slot':k+1,'player':k==0})
count=math.ceil(route.length/1.7)
for k in range(count):
 p,t,n=route.at(k*route.length/count);c.marker(f'AI_{k:03d}',(*p,.15),t,(1.8,1,1),{'track_distance_m':k*route.length/count})
for k,fraction in enumerate([.13,.37,.61,.87]):
 p,t,n=route.at(route.length*fraction);c.marker(f'PICKUP_{k+1:02d}',(*p,.43),extras={'route':'main'})
c.marker('SPAWN_roam',(6,-8.7,.15),(-.15,1),extras={'purpose':'free-drive view toward park features and neighbourhood'})
c.ROOT['district']='skatepark';c.ROOT['base']='Saucer Springs AFB';c.ROOT['lap_length_m']=route.length
objs=c.flush_visuals()
# Broad open floor receives dynamic shadows in-game. Avoid baking giant interpolated
# triangles of false contact shadow across its planar expanse.
for o in objs:
 if o.data.materials[0].name=='floor':o.name='VIS_decal_floor'
# Subdivide broad concrete surfaces for coherent vertex AO and small mineral colour variation.
for o in objs:
 if o.data.materials[0].name in ['concrete','floor','paint']:
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  edges=[e for e in bm.edges if e.calc_length()>2]
  bmesh.ops.subdivide_edges(bm,edges=edges,cuts=5,use_grid_fill=True);bm.to_mesh(o.data);bm.free()
ao=c.bake_ao(objs,distance=1.4,samples=20,floor=.48)
for o in objs:
 if o.data.materials and o.data.materials[0].name in ['concrete','floor','paint']:
  attr=o.data.color_attributes['AO']
  for loop in o.data.loops:
   v=o.data.vertices[loop.vertex_index].co;grain=.96+.04*(math.sin(v.x*17.13+v.y*41.71)*43758.5453%1)
   color=attr.data[loop.index].color;attr.data[loop.index].color=(color[0]*grain,color[1]*grain,color[2]*grain,1)
bpy.context.preferences.filepaths.save_version=0
blend=R/'assets/rc/heroes/skatepark.blend';blend.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
stats=c.counts();c.join_visuals_by_material();out=R/'web/wwwroot/rc/assets/districts/skatepark.glb';c.export_glb(out)
info={'generator':'tools/rc/blender/skatepark.py','license':'MIT original procedural geometry','external_assets':['../materials/park-paint-atlas.png (original generated paint; runtime texture)'],'frame':'park-centred local metres; north=-Z','footprint':[[-18.803,-20.0],[19.0,15.053]],'roam_start':[6,.15,8.7],'roam_yaw':-.14889,'hip':{'height_m':.66,'run_m':1.9,'angle_degrees':90,'toe_fraction':.18},'rolled_apron':{'rise_m':.14,'run_m':.5,'profile':'smoothstep'},'lap_length_m':route.length,'vertex_ao':ao,**stats}
out.with_suffix('.provenance.json').write_text(json.dumps(info,indent=2)+'\n')
print('SKATEPARK',json.dumps(info))
if '--render' in sys.argv:c.render_glb(out,R/'evidence/rc-open-world/skatepark',[('overview',(38,-49,42),(0,1,0),42),('toy-eye',(6,-12.7,1.8),(1,1,.6),24),('bowl',(1,3,6),(8,13,.5),32)])
