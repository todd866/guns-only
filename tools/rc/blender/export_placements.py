"""Write a placement JSON (docs/rc-placements.md) from a Blender collection of empties named after kit props.
  Blender --background venue.blend --python tools/rc/blender/export_placements.py -- COLLECTION OUT.json [NAME]
Empty "bench.003" -> prop "bench". Blender (x, y, z) -> game (x, z, -y); rotation Z -> yaw (same sense).
Custom properties: variant (int), collide (bool, default true), snap (bool, default true: y = null)."""
import bpy, json, math, re, sys
coll, out, *rest = sys.argv[sys.argv.index('--') + 1:]
items = []
for o in sorted(bpy.data.collections[coll].all_objects, key=lambda o: o.name):
    if o.type != 'EMPTY': continue
    x, y, z = o.matrix_world.translation
    items.append({'prop': re.sub(r'\.\d+$', '', o.name),
                  'pos': [round(x, 3), None if o.get('snap', True) else round(z, 3), round(-y, 3)],
                  'yaw': round(math.degrees(o.matrix_world.to_euler('XYZ').z), 2),
                  'scale': round(o.matrix_world.to_scale().x, 3),
                  'variant': int(o.get('variant', 0)), 'collide': bool(o.get('collide', True))})
doc = {'version': 1, 'name': rest[0] if rest else coll, 'kit': 'kit/props.glb', 'items': items}
with open(out, 'w') as f:
    f.write('{\n' + ',\n'.join(f' {json.dumps(k)}: {json.dumps(v)}' for k, v in doc.items() if k != 'items')
            + ',\n "items": [\n' + ',\n'.join('  ' + json.dumps(i) for i in items) + '\n ]\n}\n')
print(f'export_placements: {len(items)} items -> {out}')
