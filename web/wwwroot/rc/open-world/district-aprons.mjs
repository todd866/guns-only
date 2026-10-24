import {districtOffset} from './district-zones.mjs';

// The exported floor ends inside the visual shell at BX/School. Housing has a
// 10 cm raised gravel floor. Join each real floor to the surrounding terrain;
// these same quads provide the visible threshold and wheel collision.
const APRONS={
 housing:{x:[0,6],z:[80,82],y:[.1,0],surface:'concrete',color:'#b7b1a0'},
 bx:{x:[0,6],z:[43,43.3],y:[0,0],surface:'tile',color:'#d7ccad'},
 school:{x:[7.9,13.9],z:[46,46.06],y:[0,0],surface:'tile',color:'#d0c7b3'},
};
export function districtApron(id){
 const a=APRONS[id],[x,y,z]=districtOffset(id),[left,right]=a.x,[inner,outer]=a.z;
 return {surface:a.surface,color:a.color,vertices:[
  [x+left,y+a.y[0],z+inner],[x+left,y+a.y[1],z+outer],
  [x+right,y+a.y[1],z+outer],[x+right,y+a.y[0],z+inner],
 ]};
}
