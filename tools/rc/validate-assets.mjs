import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion,Box3} from '../../web/wwwroot/vendor/three.module.js';
export function parseGLB(bytes){
 assert.equal(bytes.readUInt32LE(0),0x46546c67,'GLB magic');assert.equal(bytes.readUInt32LE(4),2,'glTF 2 required');assert.equal(bytes.readUInt32LE(8),bytes.length,'truncated GLB');
 const length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'first chunk must be JSON');return JSON.parse(bytes.subarray(20,20+length).toString('utf8').trim());
}
export function validateDocument(doc,contract,bytes){
 assert.ok(bytes<=contract.max_bytes,'file byte budget');
 assert.ok((doc.materials??[]).length<=contract.max_materials,'material budget');
 for(const b of doc.buffers??[])assert.ok(!b.uri,'external buffer forbidden');
 for(const image of doc.images??[])assert.ok(!image.uri,'external image forbidden');
 const names=new Set((doc.nodes??[]).map(n=>n.name));for(const name of contract.required_nodes)assert.ok(names.has(name),`missing ${name}`);
 let triangles=0,primitives=0;const bounds=new Box3(),positions={};
 function visit(id,parent){const node=doc.nodes[id];assert.ok(node,'bad child index');const local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));const world=parent.clone().multiply(local);positions[node.name]=new Vector3().setFromMatrixPosition(world).toArray();
  if(node.mesh!==undefined&&!node.name?.startsWith('COLLISION_'))for(const p of doc.meshes[node.mesh].primitives){assert.equal(p.mode??4,4,'only triangle primitives');const a=doc.accessors[p.attributes.POSITION];assert.ok(a.min&&a.max,'position accessor needs bounds');triangles+=(p.indices!==undefined?doc.accessors[p.indices].count:a.count)/3;primitives++;for(let mask=0;mask<8;mask++){const v=new Vector3(...a.min.map((n,i)=>mask&(1<<i)?a.max[i]:n)).applyMatrix4(world);assert.ok(v.toArray().every(Number.isFinite),'nonfinite bounds');bounds.expandByPoint(v);}}
  for(const c of node.children??[])visit(c,world);
 }
 for(const n of doc.scenes[doc.scene??0].nodes)visit(n,new Matrix4());
 if(contract.max_primitives!==undefined)assert.ok(primitives<=contract.max_primitives,`primitive budget ${primitives}`);
 assert.ok(triangles<=contract.max_triangles,`triangle budget ${triangles}`);const extent=bounds.getSize(new Vector3()).toArray();extent.forEach((v,i)=>assert.ok(v>0&&v<=contract.max_extent_m[i],`axis ${i} extent ${v}`));
 if(positions.RC_Root){for(const [name,x,z] of [['FL',-.29,-.25],['FR',.29,-.25],['RL',-.29,.25],['RR',.29,.25]]){const p=positions['Steer_'+name];assert.ok(p.every((v,i)=>Math.abs(v-[x,-.08,z][i])<.001),`bad wheel pivot ${name}: ${p}`);}}
 return {triangles,primitives,materials:(doc.materials??[]).length,bytes,extent,positions};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=process.argv[2];assert.ok(dir,'usage: node tools/rc/validate-assets.mjs ASSET_DIRECTORY');const contract=JSON.parse(fs.readFileSync(new URL('./asset-contract.json',import.meta.url)));const report={};for(const name of Object.keys(contract).filter(key=>contract[key]?.file)){const spec=contract[name],bytes=fs.readFileSync(path.join(dir,spec.file));report[name]=validateDocument(parseGLB(bytes),spec,bytes.length);}console.log(JSON.stringify(report,null,2));
}
