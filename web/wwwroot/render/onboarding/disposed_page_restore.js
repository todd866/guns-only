// Standalone routes dispose their renderer/audio graph on pagehide. A BFCache restoration
// cannot reuse that dead graph; reload to the authored brief before accepting flight input.
export function installDisposedPageRestore(target = window, reload = () => target.location.reload()) {
  const restore = (event) => { if (event.persisted === true) reload(); };
  target.addEventListener("pageshow", restore);
  return () => target.removeEventListener("pageshow", restore);
}
