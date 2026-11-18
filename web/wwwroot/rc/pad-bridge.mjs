// The Mac app polls GameController and pushes that snapshot here. WebKit's Gamepad API
// stops updating once the window is not frontmost, so an unfocused page trusts the bridge.

export function selectPads({web = [], native = [], focused = true} = {}) {
  const live = list => (list ?? []).filter(pad => pad?.connected);
  const bridged = live(native);
  const browser = live(web);
  if (!focused && bridged.length) return bridged;
  if (browser.length) return browser;
  return bridged;
}

export function installPadBridge({
  onNative,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis,
  focus = () => globalThis.document?.hasFocus?.() !== false
} = {}) {
  if (!navigatorObject || navigatorObject.__rcPadsInstalled) return;
  const nativeGet = navigatorObject.getGamepads?.bind(navigatorObject);
  let bridged = Array.isArray(windowObject.__rcNativePadBuffer) ? windowObject.__rcNativePadBuffer : [];
  const publish = pads => {
    bridged = Array.isArray(pads) ? pads : [];
    windowObject.__rcNativePadBuffer = bridged;
    onNative?.(bridged);
  };
  windowObject.__rcNativePads = publish;
  const wrap = () => selectPads({web: nativeGet ? Array.from(nativeGet()) : [], native: bridged, focused: focus()});
  try {
    Object.defineProperty(navigatorObject, 'getGamepads', {configurable: true, writable: true, value: wrap});
  } catch {
    // A locked getGamepads (an embedder or test stub) keeps the plain API; never break boot over it.
    try {
      navigatorObject.getGamepads = wrap;
    } catch {
      return;
    }
  }
  navigatorObject.__rcPadsInstalled = true;
  if (bridged.length) onNative?.(bridged);
}
