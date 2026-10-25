// Deterministic transport copies; authored GLBs remain the source for export/physics tools.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
export const modelAssetRoot=fileURLToPath(new URL('../../web/wwwroot/rc/assets/',import.meta.url));
export function modelFiles(root=modelAssetRoot){return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?modelFiles(path.join(root,e.name)):e.name.endsWith('.glb')?[path.join(root,e.name)]:[]).sort();}
export function compressModels(root=modelAssetRoot){
 return modelFiles(root).map(file=>{const source=fs.readFileSync(file),data=zlib.gzipSync(source,{level:6,mtime:0});fs.writeFileSync(`${file}.gz`,data);return {file,raw:source.length,bytes:data.length};});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const results=compressModels(process.argv[2]?path.resolve(process.argv[2]):undefined);
 console.log(JSON.stringify({models:results.length,raw:results.reduce((n,r)=>n+r.raw,0),compressed:results.reduce((n,r)=>n+r.bytes,0)}));
}
