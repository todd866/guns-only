// Authored 20-minute toy-world day, not a solar or astronomical simulation.
export function daylight(seconds,night=false){
 const phase=((seconds%1200)+1200)%1200/1200;
 const sun=night?-1:Math.cos(phase*Math.PI*2);
 const day=Math.max(0,Math.min(1,(sun+.2)/.65));
 return {day,night:1-day,sun:.3+3.1*day,ambient:.85+.5*day};
}
