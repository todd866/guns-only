/** Full Chromium's headless mode can use the device GPU without opening a desktop window.
 * Keep the existing software CI executable/flags when hardware is false. Renderer qualification,
 * document visibility/focus and delivered-frame checks remain the responsibility of each gate.
 * No automatic headed fallback: foreground browser QA requires separate explicit authorization.
 */
export function perfBrowserLaunchOptions({ hardware = false, args = [] } = {}) {
  return {
    headless: true,
    ...(hardware ? { channel: "chromium" } : {}),
    args: [...args],
  };
}
