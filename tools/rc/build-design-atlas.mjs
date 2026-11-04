import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),folder=path.join(root,'docs/design/saucer-springs');
const data=JSON.parse(fs.readFileSync(path.join(folder,'design.json'),'utf8'));
data.roads=JSON.parse(fs.readFileSync(path.join(root,'web/wwwroot/rc/assets/world/overview.json'),'utf8')).roads;
const runways=new Map();
for(const name of fs.readdirSync(path.join(root,'web/wwwroot/rc/assets/world')).filter(n=>/^tile-.*\.json$/.test(n))){
 const tile=JSON.parse(fs.readFileSync(path.join(root,'web/wwwroot/rc/assets/world',name),'utf8'));
 for(const f of tile.features??[])if(f.properties?.aeroway==='runway')runways.set(f.id,f.geometry);
}
data.runways=[...runways.values()];
const template=fs.readFileSync(path.join(folder,'atlas-template.html'),'utf8');
fs.writeFileSync(path.join(folder,'index.html'),template.replace('/* DESIGN_DATA */',JSON.stringify(data).replace(/</g,'\\u003c')));
console.log(`Atlas: ${data.places.length} places, ${data.courses.length} courses, ${data.battles.length} arenas.`);
