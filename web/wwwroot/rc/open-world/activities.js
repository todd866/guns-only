import {createAlienWorld} from './alien-world.js';
import {buildBattleArenas} from './battle-arenas.js';
import {createClassicCourses} from './classic-courses.js';
import {buildWavepoolBeach} from './wavepool.js';
import {createExpansionVenues} from './expansion-venues.js';
import {createPortal} from './portal.js';
import {createSkatestreet} from './skatestreet.js';
import {createSkateHangar} from './skate-hangar.js';
// The same collision and visual collection is used by runtime and driving acceptance.
export function buildActivities(scene,world,{alienUnlocked=()=>false}={}){const beach=buildWavepoolBeach(scene,world),venues=createExpansionVenues(scene,world),portal=createPortal(scene,world,alienUnlocked);const classic=createClassicCourses(scene,world),arenas=buildBattleArenas(scene,world);const alien=createAlienWorld(scene,world),hangar=createSkateHangar(scene,world),skatestreet=createSkatestreet(scene,world);let time=0;return {
 update(t,pos){time=t;alien.update(t);classic.update(t);beach.update(t,pos);venues.update(t);portal.update(t,pos);},
 step(car,dt){for(const hit of [...venues.stepHazards(car,dt,time),...classic.stepHazards(car,dt,time)]){const n=Math.hypot(...hit.push)||1;const decay=Math.pow(hit.speedScale,dt*6);car.vel[0]=car.vel[0]*decay+hit.push[0]/n*dt*5;car.vel[2]=car.vel[2]*decay+hit.push[2]/n*dt*5;}},
 dispose(){skatestreet.dispose();hangar.dispose();alien.dispose();arenas.dispose();classic.dispose();beach.dispose();venues.dispose();portal.dispose();}
};}
