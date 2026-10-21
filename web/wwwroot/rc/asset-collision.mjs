// Convert already world-transformed GLB proxy bounds to the simulation's vertical AABBs.
// Keep asset-local coordinates out of the live course and reject malformed exports.
export function proxySolid(name, bounds) {
 const {min,max}=bounds;
 const values=[min.x,min.y,min.z,max.x,max.y,max.z];
 if(!values.every(Number.isFinite)||max.x<=min.x||max.y<=min.y||max.z<=min.z)
  throw new Error(`Invalid collision proxy bounds: ${name}`);
 return {name,x:(min.x+max.x)/2,z:(min.z+max.z)/2,w:max.x-min.x,d:max.z-min.z,minY:min.y,h:max.y};
}
