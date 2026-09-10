// Fire Boss owns trim controls and a hopper readout beside the shared mobile telemetry strip.
// Keep its procedure cue clear of those rectangles without moving any other aircraft's HUD.
export function fireBossCueLayout({ width, height, textWidth, mobile = false,
  safeInsets = {}, desktopTop = 0 }) {
  const top = Math.max(0, Number(safeInsets.top) || 0);
  const left = mobile ? Math.max(0, Number(safeInsets.left) || 0) : 0;
  const right = mobile ? Math.max(0, Number(safeInsets.right) || 0) : 0;
  const panelWidth = Math.min(width - left - right - 48, Math.max(132, textWidth + 22));
  const x = left + (width - left - right - panelWidth) / 2;
  let y = desktopTop;
  if (mobile) {
    // Telemetry ends at safe-top + 51. A long landscape cue can also reach the trim controls
    // (92..254, 72..116) or the right-hand hopper (48..100 while dropping).
    const reachesTrim = x < left + 254 + 6 && x + panelWidth > left + 92 - 6;
    const reachesHopper = x + panelWidth > width - right - 144 - 6;
    y = top + (height >= width || reachesTrim || reachesHopper ? 122 : 57);
  }
  return { x, y, width: panelWidth, height: 22 };
}
