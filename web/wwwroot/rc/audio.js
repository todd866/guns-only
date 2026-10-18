// Original synthesized electric motor: no sampled audio.
export class MotorAudio {
 constructor(){this.context=null;}
 start(){try{if(!this.context){const C=window.AudioContext||window.webkitAudioContext;this.context=new C();this.osc=this.context.createOscillator();this.gain=this.context.createGain();const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;this.osc.type='sawtooth';this.osc.connect(filter).connect(this.gain).connect(this.context.destination);this.gain.gain.value=0;this.osc.start();}this.context.resume();}catch{}}
 update(speed,paused){if(!this.context)return;const t=this.context.currentTime;this.osc.frequency.setTargetAtTime(95+speed*42,t,.07);this.gain.gain.setTargetAtTime(paused?0:.012+speed*.0015,t,.08);}
}
