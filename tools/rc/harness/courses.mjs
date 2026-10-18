// Original SI-unit acceptance courses, not reconstructions of proprietary tracks.
const empty={solids:[],secrets:[],checkpoints:[[900,900,'unused']],bounds:{x:1000,z:1000}};
export const courses={
 flat:{...empty,ground:()=>0},
 ripple:{...empty,ground:(x,z)=>.035*(1+Math.sin(z*10))},
 jump:{...empty,ground:(x,z)=>Math.abs(x)<2&&z<0&&z>-4?(-z/4)*.6:0},
 wall:{...empty,ground:()=>0,solids:[{x:0,z:-10,w:10,d:.25,h:1}]},
 slalom:{...empty,ground:()=>0,checkpoints:[[0,0,'start'],[2,-8,'left'],[-2,-16,'right'],[2,-24,'left'],[0,-32,'finish']]},
};
export const tapes={
 acceleration:[{ticks:600,input:{throttle:1}}],
 brake:[{ticks:240,input:{throttle:1}},{ticks:240,input:{brake:true}}],
 reverse:[{ticks:600,input:{throttle:-1}}],
 turn:[{ticks:240,input:{throttle:1}},{ticks:360,input:{throttle:.4,steer:1}}],
 drift:[{ticks:240,input:{throttle:1}},{ticks:90,input:{throttle:.4,steer:1,brake:true}},{ticks:240,input:{throttle:1}}],
 jump:[{ticks:480,input:{throttle:1}}],
 wall:[{ticks:360,input:{throttle:1}}],
 ripple:[{ticks:480,input:{throttle:.7}}],
};
