// Scripted driving for frame-rate checks (shared by the app rig and the Chrome comparison):
// full throttle with a weaving steer, through the game's own keyboard handling.
(() => {
  const send = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  send('keydown', 'KeyW'); let side = 0;
  window.__rcDriveTimer = setInterval(() => { send('keyup', side ? 'KeyA' : 'KeyD'); side ^= 1; send('keydown', side ? 'KeyA' : 'KeyD'); }, 900);
  return true;
})();
