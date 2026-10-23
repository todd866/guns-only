// The starter race follows the neighbourhood's connected public paths. The
// small skate plaza remains open for free play; its narrow hubba passage is
// not forced on eight racing cars. All coordinates are local game metres.
export const RESIDENTIAL_RACE_POINTS=[
 [-3040,-800.504],[-3011.412,-817.384],[-3009.604,-818.529],
 [-3011.261,-826.067],[-3011.369,-868.181],[-3034.786,-872.231],
 [-3052.312,-875.796],[-3066.801,-874.452],[-3073.446,-866.978],
 [-3076.516,-856.856],[-3087.495,-840.853],[-3088.354,-830.902],
 [-3091.395,-817.692],[-3112.41,-766.358],[-3111.698,-766.104],
 [-3108.161,-766.535],[-3095.337,-767.928],[-3088.138,-770.891],
 [-3085.416,-773.366],[-3083.547,-777.897],[-3080.08,-782.166],
 [-3072.983,-785.362],[-3061.153,-788.014],[-3040,-800.504],
];
export function residentialRace(event,world,makeCourse){
 const course=makeCourse({...event,points:RESIDENTIAL_RACE_POINTS,half:2.4},world);
 const {pos,yaw}=course.start;
 course.grid=Array.from({length:8},(_,i)=>{const row=Math.floor(i/2)*1.1,side=i%2?.45:-.45;return {pos:[pos[0]-Math.sin(yaw)*row+Math.cos(yaw)*side,pos[1],pos[2]+Math.cos(yaw)*row+Math.sin(yaw)*side],yaw};});
 // Closely spaced bends steer the AI, but don't create a wall of checkpoint arches.
 const keep=new Set([0,4,7,10,13,18,23]);
 course.checkpoints=course.checkpoints.filter((_,i)=>keep.has(i));
 return course;
}
