// Fictional game-space placement. Reference provenance is kept outside the game.
export const RESIDENTIAL_BOUNDS=[-3518,-1753,-2327,-360];
export const RESIDENTIAL_PARK={anchor:[-3026.085,0,-786.64],yaw:-Math.PI/10};
export const inResidential=p=>p[0]>=RESIDENTIAL_BOUNDS[0]&&p[0]<=RESIDENTIAL_BOUNDS[2]&&p[2]>=RESIDENTIAL_BOUNDS[1]&&p[2]<=RESIDENTIAL_BOUNDS[3];
export const parkPoint=([x,y,z])=>{const {anchor:a,yaw}=RESIDENTIAL_PARK,c=Math.cos(yaw),s=Math.sin(yaw);return [a[0]+x*c+z*s,y,a[2]-x*s+z*c];};
export const RESIDENTIAL_START={pos:parkPoint([6,.15,8.7]),yaw:-.78-RESIDENTIAL_PARK.yaw};
