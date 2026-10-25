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
def phys(name,m,g,up=False):
 if m=='paint':c.vis(name,m).add(g,kind='up' if up else 'closed')
 else:add(m,g,up)
 c.col('concrete',name,c.Geo().add(g,kind='up' if up else 'closed'))
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
# Local metre footprint and image-traced arrangement; vertical dimensions are designed for toys.
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
# The four modules use one aligned metre frame. Their footprints come from
# image digitization; heights and transition radii remain explicit estimates.
FLOOR=.14
ORIGIN=(0,0)
def surface(name,material,urange,vrange,height,nu=24,nv=8,reverse_diagonal=False):
 # Closed heightfield: the identical surface supplies visuals and collision.
 # Side faces support raised lips; no hidden collision-only simplified ramp.
 u0,u1=urange;v0,v1=vrange
 vs=[xf((u0+(u1-u0)*i/nu,v0+(v1-v0)*j/nv,height(u0+(u1-u0)*i/nu,v0+(v1-v0)*j/nv)),ORIGIN) for j in range(nv+1) for i in range(nu+1)]
 fs=[]
 for j in range(nv):
  for i in range(nu):
   k=j*(nu+1)+i
   fs.extend([(k,k+1,k+nu+1),(k+1,k+nu+2,k+nu+1)] if reverse_diagonal else [(k,k+1,k+nu+2),(k,k+nu+2,k+nu+1)])
 rim=list(range(nu+1))+[j*(nu+1)+nu for j in range(1,nv+1)]+[nv*(nu+1)+i for i in range(nu-1,-1,-1)]+[j*(nu+1) for j in range(nv-1,0,-1)]
 base=len(vs)
 vs.extend((vs[k][0],vs[k][1],FLOOR-.02) for k in rim)
 for i,k in enumerate(rim):fs.append((k,rim[(i+1)%len(rim)],base+(i+1)%len(rim),base+i))
 fs.append(tuple(base+i for i in reversed(range(len(rim)))))
 phys(name,material,(vs,fs))
def bank(t,rise):
 t=max(0,min(1,t));toe=.16
 return FLOOR+rise*(t*t/(2*toe) if t<toe else t-toe/2)/(1-toe/2)
def quarter(t,rise=1.4):
 t=max(0,min(1,t))
 return FLOOR+rise*(1-math.sqrt(max(0,1-t*t)))
def aligned_box(name,mat,u,v,w,d,h):lphys(name,mat,ORIGIN,u,v,FLOOR,w,d,h)
# Western deck: bank / curved quarter / bank, with three broad stepped blocks.
aligned_box('western_deck','concrete',-16.9,.2,1.8,12.4,1.4)
for name,v0,v1,curved in [('west_bank_south',-3.8,-.8,False),('west_quarter',-.8,1.8,True),('west_bank_north',1.8,6.4,False)]:
 surface(name,'paint',(-16,-12.9),(v0,v1),lambda u,v,curved=curved:quarter((-12.9-u)/3.1) if curved else bank((-12.9-u)/3.1,1.4))
# Steps stay beside the rideable bank, with a clear flat route around their foot.
for i in range(4):
 u=-12.1-i*1.15
 aligned_box(f'west_step_{i}','concrete',u,-5.25,1.15,2.6,.35*(i+1))
# Low sloping end wall gives the deck its recognisable silhouette.
surface('west_step_side','paint',(-17.8,-11.5),(-6.72,-6.45),lambda u,v:FLOOR+.42+1.38*max(0,min(1,(-11.5-u)/6.3)),nu=12,nv=1)
rail(ORIGIN,(-16,-3.8,1.57),(-16,6.4,1.57),.035)
# Asymmetric central feature: higher table on the north, lower bank/rail lane,
# and a separate southern bank against a long side ledge. Flat lanes separate
# this module from both the western deck and eastern quarter.
def across(u,rise):
 return bank(min((u+6.3)/2.1,(.5-u)/2.1,1),rise)
surface('central_high_table','concrete',(-6.3,.5),(3.0,5.9),lambda u,v:across(u,.98),nu=40,nv=4)
surface('central_low_bank','paint',(-6.3,.5),(-1.1,3.0),lambda u,v:across(u,.62),nu=40,nv=6)
surface('central_south_bank','concrete',(-5.7,-.2),(-3.6,-1.63),lambda u,v:bank(min((u+5.7)/1.65,(-.2-u)/1.65,1),.54),nu=32,nv=4)
# Ledge follows the bank profile at its ends instead of becoming a freestanding box.
surface('central_divider','paint',(-5.7,-.2),(-1.63,-1.1),lambda u,v:bank(min((u+5.7)/1.65,(-.2-u)/1.65,1),.54)+.46,nu=32,nv=1)
for u0,u1 in [(-5.7,-4.05),(-4.05,-1.85),(-1.85,-.2)]:
 rail(ORIGIN,(u0,-1.365,bank(min((u0+5.7)/1.65,(-.2-u0)/1.65,1),.54)+.49),(u1,-1.365,bank(min((u1+5.7)/1.65,(-.2-u1)/1.65,1),.54)+.49),.025)
# Bent handrail follows the lower bank, leaving the higher table unobstructed.
rail_points=[(-5.8,.7,across(-5.8,.62)+.52),(-4.2,.7,across(-4.2,.62)+.52),(-1.6,.7,across(-1.6,.62)+.52),(0,.7,across(0,.62)+.52)]
for pp,qq in zip(rail_points,rail_points[1:]):rail(ORIGIN,pp,qq,.035)
for u,v,h in rail_points:rail(ORIGIN,(u,v,across(u,.62)),(u,v,h),.025)
# Offset manual pads with a short raised middle step; flat rail is on the slab.
aligned_box('manual_pad_west','paint',-4.85,-8.65,3.7,1.25,.36)
aligned_box('manual_pad_east','paint',.55,-8.05,3.7,1.25,.36)
aligned_box('manual_middle_step','paint',-2.1,-7.9,2.4,1.0,.62)
for u,v,w,d in [(-4.85,-8.65,3.7,1.25),(.55,-8.05,3.7,1.25),(-2.1,-7.9,2.4,1.0)]:
 for edge in [-1,1]:lbox('steel',ORIGIN,u,v+edge*d/2,FLOOR+(.62 if w==2.4 else .36),w,.035,.025)
rail(ORIGIN,(-4.9,-5.65,.77),(-1.1,-5.65,.77))
for u in [-4.8,-1.2]:rail(ORIGIN,(u,-5.65,FLOOR),(u,-5.65,.77),.03)
# Eastern quarter and bowl share the same lip height, transition run and hip.
# The low bowl mouth faces west. Its southern wall turns into the long quarter,
# so the transfer is across the actual convex junction, not an invented ramp.
LIP_U=8.2;LIP_V=6.7;RUN=2.0;RISE=1.4
surface('east_quarter','paint',(LIP_U-RUN,LIP_U),(-3.4,LIP_V),lambda u,v:quarter((u-(LIP_U-RUN))/RUN),nu=40,nv=20)
# Broad upper deck is filled only outside the bowl; no plane bridges its hollow.
phys('east_upper_deck','path',shape(slab([(8.2,-3.4),(13.25,-3.4),(12.2,3.45),(17.3,3.65),(17.1,6.7),(8.2,6.7)],FLOOR,FLOOR+RISE),ORIGIN))
surface('bowl_south','paint',(8.2,13.4),(6.7,8.7),lambda u,v:quarter((8.7-v)/RUN),nu=16,nv=32)
surface('bowl_north','paint',(7.8,13.4),(11.8,13.8),lambda u,v:quarter((v-11.8)/RUN),nu=16,nv=32)
surface('bowl_east','paint',(13.4,15.4),(8.7,11.8),lambda u,v:quarter((u-13.4)/RUN),nu=32,nv=12)
# Concave bowl corners use polar sections, preserving shared wall seams.
for sign,vc in [(-1,8.7),(1,11.8)]:
 vs=[]
 for j in range(25):
  r=RUN*j/24
  for i in range(25):
   theta=math.pi*.5*i/24
   vs.append(xf((13.4+r*math.cos(theta),vc+sign*r*math.sin(theta),quarter(r/RUN)),ORIGIN))
 fs=[]
 for j in range(24):
  for i in range(24):
   k=j*25+i;fs.extend([(k,k+1,k+26),(k,k+26,k+25)])
 phys(f'bowl_corner_{sign}','paint',(vs,fs),True)
# Convex corner: paired quarter surfaces meet on a true diagonal ridge.
# Split cells along that ridge, avoiding little flat facets across the launch face.
surface('bowl_quarter_hip','paint',(6.2,8.2),(6.7,8.7),lambda u,v:quarter(1-max((8.2-u)/RUN,(v-6.7)/RUN)),nu=40,nv=40,reverse_diagonal=True)
# Narrow perimeter decks and coping establish the bowl's thickness.
arc_north=[(13.4+RUN*math.cos(math.pi*.5*(1-i/24)),11.8+RUN*math.sin(math.pi*.5*(1-i/24))) for i in range(25)]
phys('bowl_north_deck','concrete',shape(slab([(7.55,13.8)]+arc_north+[(16.7,11.8),(16.7,15.15),(7.55,15.15)],FLOOR,FLOOR+RISE),ORIGIN))
arc_south=[(13.4+RUN*math.cos(math.pi*.5*i/24),8.7-RUN*math.sin(math.pi*.5*i/24)) for i in range(25)]
phys('bowl_south_corner_deck','path',shape(slab(arc_south+[(17.1,6.7),(16.7,8.7)],FLOOR,FLOOR+RISE),ORIGIN))
aligned_box('bowl_east_deck','concrete',16.05,9.1,1.3,5.4,RISE)
for pp,qq in [((8.2,-3.4,1.57),(8.2,6.7,1.57)),((8.2,6.7,1.57),(13.4,6.7,1.57)),((15.4,8.7,1.57),(15.4,11.8,1.57)),((13.4,13.8,1.57),(7.8,13.8,1.57))]:rail(ORIGIN,pp,qq,.032)
for sign,vc in [(-1,8.7),(1,11.8)]:
 for i in range(24):
  aa=math.pi*.5*i/24;bb=math.pi*.5*(i+1)/24
  rail(ORIGIN,(13.4+RUN*math.cos(aa),vc+sign*RUN*math.sin(aa),1.57),(13.4+RUN*math.cos(bb),vc+sign*RUN*math.sin(bb),1.57),.032)
# Small ground chevrons suggest the bowl hip. They are cues, not driving assists.
for u,v in [(4.4,4.5),(4.9,5.0),(5.4,5.5)]:
 direction=(math.sqrt(.5),math.sqrt(.5));right=(-direction[1],direction[0]);pts=[]
 for along,side in [(.18,0),(-.10,-.14),(-.04,0),(-.10,.14)]:
  pts.append(xf((u+direction[0]*along+right[0]*side,v+direction[1]*along+right[1]*side,FLOOR+.006),ORIGIN))
 add('teal',(pts,[(0,1,2),(0,2,3)]),True)
# Continuous paved bench shoulder connected flush to the main concrete.
phys('bench_shoulder','path',slab([(12.206,19.238),(15.0,20.0),(19.0,7.7),(15.903,8.239)],-.12,.14))
# Traversable .14m pad edge: a broad smooth rolled apron around the union
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
 for p,n in zip(apron_loop,outward):vs.append((p[0]+n[0]*.9*t,p[1]+n[1]*.9*t,h))
faces=[]
for j in range(bands):
 for i in range(count):
  a=j*count+i;b=j*count+(i+1)%count;faces.append((a,b,b+count,a+count))
phys('rolled_perimeter_apron','floor',(vs,faces),True)
# Three concrete seats run along the outside bowl apron, parallel to its edge.
for v in [5.7,9.3,12.9]:
 lbox('concrete',ORIGIN,18.75,v,.46,.6,2.35,.15)
 for offset in [-.8,.8]:lbox('concrete',ORIGIN,18.75,v+offset,.14,.5,.22,.32)
# Starter lap follows the flat separation lanes and forgiving north apron.
# It does not climb the eastern quarter or force a bank/hip transfer.
route=c.Route([xf((u,v,0),ORIGIN)[:2] for u,v in [(3.5,-4.65),(4.8,0),(4.1,4.8),(1.1,6.5),(-7.4,6.5),(-10,3.5),(-10,-2.5),(-7.3,-4.65)]],[.65]*8)
for i,d in enumerate([0,route.length*.25,route.length*.5,route.length*.75]):
 p,t,n=route.at(d);c.marker(f'GATE_{i:02d}',(*p,.15),t,(.65,1,1),{'lap_order':i,'half_width_m':.65,'track_distance_m':d})
p,t,n=route.at(0)
for k in range(8):
 back=2.0+(k//2)*1.8;lat=(k%2-.5)*1.15
 c.marker(f'START_{k+1}',(p[0]-t[0]*back+n[0]*lat,p[1]-t[1]*back+n[1]*lat,.15),t,extras={'grid_slot':k+1,'player':k==0})
count=math.ceil(route.length/1.7)
for k in range(count):
 p,t,n=route.at(k*route.length/count);c.marker(f'AI_{k:03d}',(*p,.15),t,(.65,1,1),{'track_distance_m':k*route.length/count})
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
# Author paint UVs by feature before batching. A curved bank must not change
# projection direction halfway through a triangle strip and become pinstripes.
for o in objs:
 if o.data.materials[0].name!='paint':continue
 name=o.name
 strip=0 if ('east_quarter' in name or 'bowl_' in name) else 2 if 'manual_' in name else 1 if 'west_' in name else 3
 layer=o.data.uv_layers.new(name='UVMap')
 for polygon in o.data.polygons:
  top=polygon.normal.z>.995
  normal_u=polygon.normal.x*ca+polygon.normal.y*sa
  normal_v=-polygon.normal.x*sa+polygon.normal.y*ca
  for li in polygon.loop_indices:
   co=o.data.vertices[o.data.loops[li].vertex_index].co
   u=co.x*ca+co.y*sa;v=-co.x*sa+co.y*ca;h=co.z-FLOOR
   if strip==0:
    U=(v+3.4)/10.1 if 'east_quarter' in name else math.atan2(v-10.2,u-11.6)/math.tau+1
    V=h/RISE
    if abs(normal_v)>.995:U=(u-6.2)/10
    elif abs(normal_u)>.995:U=(v+3.4)/17.2
   elif strip==1:
    U=(u+17.8)/6.3 if 'step_side' in name else (v+6.7)/13.1
    V=h/1.8 if 'step_side' in name else h/RISE
    if abs(normal_v)>.995:U=(u+17.8)/6.3
    elif abs(normal_u)>.995:U=(v+6.7)/13.1
    if 'step_side' in name and polygon.normal.z>.1:U=(u+17.8)/6.3;V=(v+6.72)/.27
   elif strip==2:
    U=(u+6.7)/9.1;V=(v+9.6)/2.6 if top else h/.62
    if abs(normal_u)>.995:U=(v+9.6)/2.6
   else:
    U=(u+5.7)/5.5 if 'divider' in name else (v+1.1)/4.1
    V=(v+3.6)/9.5 if top else h/1.08
    if top or abs(normal_v)>.995:U=(u+6.3)/6.8
    elif abs(normal_u)>.995:U=(v+3.6)/9.5
    if 'divider' in name and polygon.normal.z>.1:U=(u+5.7)/5.5;V=(v+1.63)/.53
   layer.data[li].uv=(U,(strip+.035+max(0,min(1,V))*.93)/4)
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
info={'generator':'tools/rc/blender/skatepark.py','license':'MIT original procedural geometry','external_assets':['../materials/park-paint-atlas.png (original generated paint; runtime texture)'],'frame':'park-centred local metres; north=-Z','footprint':[[-18.803,-20.0],[19.0,15.053]],'roam_start':[6,.15,8.7],'roam_yaw':-.14889,'hip':{'height_m':RISE,'run_m':RUN,'angle_degrees':90,'kind':'bowl-to-quarter convex junction','dimensions':'inferred, not surveyed'},'modules':['western bank-quarter-bank and steps','asymmetric two-height central table and divider','offset manual pads and separate flat rail','connected east quarter, hip and open bowl'],'geometry_confidence':{'plan':'approximate image digitization','elevations_and_radii':'inferred, not surveyed','apron_and_race_line':'authored for forgiving RC play'},'paint_uv':'feature-authored before batching','rolled_apron':{'rise_m':.14,'run_m':.9,'profile':'smoothstep','purpose':'forgiving gameplay edge outside digitized slab'},'lap_length_m':route.length,'vertex_ao':ao,**stats}
out.with_suffix('.provenance.json').write_text(json.dumps(info,indent=2)+'\n')
print('SKATEPARK',json.dumps(info))
if '--render' in sys.argv:c.render_glb(out,R/'evidence/rc-open-world/skatepark',[('overview',(38,-49,42),(0,1,0),42),('toy-eye',(6,-12.7,1.8),(1,1,.6),24),('bowl',(1,3,6),(8,13,.5),32)])
