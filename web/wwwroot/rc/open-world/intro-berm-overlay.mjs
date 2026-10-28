import {bankPoint} from './park-lines.mjs';

// Render-only path overlays for the intro park's generated lawn berm.
const PATHS = [
 [[-33.7762392637, 9.5298563054], [4.4544337885, -33.7734878954]],
 [[5.82, -35.42], [14.35, -23.38]],
 [[14.3474049557, -23.3767305891], [31.6501780234, .3013039823]],
 [[31.6501780234, .3013039823], [34.4791251386, 5.5226627347]],
 [[15.3843588041, 4.5317724111], [31.6501780234, .3013039823]],
];
const strip = ([a, b], width = 1.1) => {
 const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz), nx = -dz / length * width, nz = dx / length * width;
 return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]];
};
const strips = PATHS.map(segment => strip(segment));
const cross = (a, b, p) => (b[0] - a[0]) * (p[2] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const area = poly => poly.reduce((sum, p, i) => { const q = poly[(i + 1) % poly.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const clip = (polygon, boundary) => {
 let out = polygon, sign = Math.sign(area(boundary));
 for (let i = 0; i < boundary.length && out.length; i++) {
  const a = boundary[i], b = boundary[(i + 1) % boundary.length], input = out; out = [];
  for (let j = 0; j < input.length; j++) {
   const p = input[j], q = input[(j + 1) % input.length], dp = sign * cross(a, b, p), dq = sign * cross(a, b, q), pin = dp >= -1e-7, qin = dq >= -1e-7;
   if (pin) out.push(p);
   if (pin !== qin) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); }
  }
 }
 return out;
};
export function introBermOverlays(vertices) {
 const overlays = [];
 for (const boundary of strips) {
  const clipped = clip(vertices, boundary);
  for (let i = 1; i < clipped.length - 1; i++) overlays.push([clipped[0], clipped[i], clipped[i + 1]].map(v => [v[0], v[1] + .025, v[2]]));
 }
 return overlays;
}

// The coarse lawn cells cross the curved bowl outline and poke through its wall.
const bowl = [[7.8,6.7],[13.4,6.7]];
for (let i=1;i<=24;i++) { const a=-Math.PI/2+i*Math.PI/48;bowl.push([13.4+2*Math.cos(a),8.7+2*Math.sin(a)]); }
bowl.push([15.4,11.8]);
for (let i=1;i<=24;i++) { const a=i*Math.PI/48;bowl.push([13.4+2*Math.cos(a),11.8+2*Math.sin(a)]); }
bowl.push([7.8,13.8]);
const bowlBoundary=bowl.map(([u,v])=>{const [x,,z]=bankPoint(u,v);return [x,z];});
const bowlSign=Math.sign(area(bowlBoundary));
const halfPlane=(polygon,a,b,sign)=>{
 const out=[];
 for(let i=0;i<polygon.length;i++){
  const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=sign*cross(a,b,p),dq=sign*cross(a,b,q),pin=dp>=0,qin=dq>=0;
  if(pin)out.push(p);
  if(pin!==qin){const t=dp/(dp-dq);out.push(p.map((v,k)=>v+(q[k]-v)*t));}
 }
 return out;
};
export function clipIntroTurf(vertices) {
 let inside=vertices;const out=[];
 for(let i=0;i<bowlBoundary.length&&inside.length;i++){
  const a=bowlBoundary[i],b=bowlBoundary[(i+1)%bowlBoundary.length],outside=halfPlane(inside,a,b,-bowlSign);
  for(let j=1;j<outside.length-1;j++)out.push([outside[0],outside[j],outside[j+1]]);
  inside=halfPlane(inside,a,b,bowlSign);
 }
 return out;
}
