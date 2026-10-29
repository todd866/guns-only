// Preserve transmitter keys; add the same X/Z/Shift scheme as the local reference player.
export const DRIVE_KEYS = ['KeyW','KeyS','KeyA','KeyD','KeyX','KeyZ','ShiftLeft','ShiftRight','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
export function drivingInput(keys, pad = {}) {
 const held=(...codes)=>codes.some(code=>keys.has(code));
 return {throttle:Number(held('KeyW','ArrowUp','KeyX'))-Number(held('KeyS','ArrowDown')) || pad.throttle || 0,
 steer:Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft')) || pad.steer || 0,
 brake:held('KeyZ') || !!pad.brake,drift:held('ShiftLeft','ShiftRight') || !!pad.drift};
}
// Free-drive flight (Enter) uses the guns-only jet keys: ↑ push, ↓ pull, ←/→ roll, A/D rudder,
// W/S power, Space afterburner. On the ground Space is the afterburner alone.
export function flightInput(keys){
 const held=(...codes)=>codes.some(code=>keys.has(code));
 return {pitch:Number(held('ArrowDown'))-Number(held('ArrowUp')),roll:Number(held('ArrowRight'))-Number(held('ArrowLeft')),yaw:Number(held('KeyD'))-Number(held('KeyA')),power:Number(held('KeyW'))-Number(held('KeyS')),burner:held('Space')};
}
// Tricks on the wheels: ↑ + S wheelie, ↓ + W stoppie (the two keys would otherwise cancel).
export function trickInput(keys){return {wheelie:keys.has('ArrowUp')&&keys.has('KeyS'),stoppie:keys.has('ArrowDown')&&keys.has('KeyW')};}
