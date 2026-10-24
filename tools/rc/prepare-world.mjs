// Reproducible offline build of the redistributable ODbL world database.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {compileWorldTiles,project} from './build-world-tiles.mjs';
import {BOUNDS} from '../../web/wwwroot/rc/open-world/catalog.mjs';
const input=process.argv[2];if(!input)throw Error('Usage: node tools/rc/prepare-world.mjs SOURCE.geojson [OUT]');
const out=process.argv[3]??'web/wwwroot/rc/assets/world',source=JSON.parse(fs.readFileSync(input,'utf8'));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'rc-world-'));
try{
 const allowed=source.features.filter(f=>{const p=f.properties,g=f.geometry;if(g.type==='Point')return false;return !!(p.building||p.highway||['apron','runway','taxiway'].includes(p.aeroway)||p.leisure||p.landuse==='grass'||p.amenity==='parking');});
 const file=path.join(tmp,'source.geojson');fs.writeFileSync(file,JSON.stringify({...source,features:allowed}));
 const staged=path.join(tmp,'tiles');const m=compileWorldTiles({input:file,out:staged});
 const tiles=m.tiles.filter(([x,z])=>(x+1)*256>=BOUNDS[0]&&x*256<=BOUNDS[2]&&(z+1)*256>=BOUNDS[1]&&z*256<=BOUNDS[3]);
 // Only this generated, marked directory may be replaced on subsequent builds.
 if(fs.existsSync(out)&&!fs.existsSync(path.join(out,'manifest.json')))throw Error('Refusing to replace an unmarked output directory');
 fs.mkdirSync(out,{recursive:true});for(const name of fs.readdirSync(out))if(/^tile-.*\.json$/.test(name))fs.unlinkSync(path.join(out,name));
 for(const [x,z]of tiles){const name=`tile-${x}-${z}.json`,tile=JSON.parse(fs.readFileSync(path.join(staged,name),'utf8'));fs.writeFileSync(path.join(out,name),JSON.stringify(tile,(_,v)=>typeof v==='number'?Math.round(v*100)/100:v));}
 Object.assign(m,{source:'Nellis OSM extract, 2026-10-21T12:42Z',bounds:BOUNDS,tiles,tileCount:tiles.length});fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(m,null,2)+'\n');
 const roads=allowed.filter(f=>f.geometry.type==='LineString'&&(f.properties.highway||f.properties.aeroway)).map(f=>({kind:f.properties.highway||f.properties.aeroway,points:f.geometry.coordinates.map(c=>project(c).map(v=>Math.round(v*10)/10))}));
 fs.writeFileSync(path.join(out,'overview.json'),JSON.stringify({bounds:BOUNDS,roads}));
 fs.writeFileSync(path.join(out,'LICENSE.md'),'# Nellis map data\n\n© OpenStreetMap contributors. Source extract: 21 October 2026.\n\nThis derived database is available under the Open Database License (ODbL) 1.0:\nhttps://opendatacommons.org/licenses/odbl/1-0/\nhttps://www.openstreetmap.org/copyright\n\nCoordinates use a local metre frame (+x east, +z south), origin 36.241303 N, 115.04465775 W. Building heights and gameplay clearings are authored approximations, not source measurements. The game perimeter is an authored bounded window, not the real base fence.\n');
 console.log(`${m.featureCount} source features; ${tiles.length} bounded tiles; ${roads.length} overview roads`);
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
