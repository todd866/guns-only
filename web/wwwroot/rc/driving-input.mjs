// Preserve transmitter keys; add the same X/Z/Shift scheme as the local reference player.
export const DRIVE_KEYS = ['KeyW','KeyS','KeyA','KeyD','KeyX','KeyZ','ShiftLeft','ShiftRight','Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
export function drivingInput(keys, pad = {}) {
 const held=(...codes)=>codes.some(code=>keys.has(code));
 return {throttle:Number(held('KeyW','ArrowUp','KeyX'))-Number(held('KeyS','ArrowDown')) || pad.throttle || 0,
 steer:Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft')) || pad.steer || 0,
 brake:held('Space','KeyZ') || !!pad.brake,drift:held('ShiftLeft','ShiftRight') || !!pad.drift};
}
