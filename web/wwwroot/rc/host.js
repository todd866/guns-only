// Enter inside the existing shell; preserve its live mission and pause ownership.
export function openRC(setPaused, opener = document.getElementById('ready-rc')) {
  if (document.getElementById('rc-session')) return;
  const prior = opener || document.activeElement;
  setPaused(true);
  const frame = document.createElement('iframe');
  frame.id = 'rc-session';
  frame.title = 'RC Odyssey';
  frame.src = './rc/' + (new URLSearchParams(location.search).get('art') === 'review' ? '?art=review' : '');
  frame.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:100000;background:#172124';
  // Shell pause rendering queues its own focus; restore the entry after those microtasks.
  const close = event => {
    if (
      event.origin !== location.origin ||
      event.source !== frame.contentWindow ||
      event.data?.type !== 'guns-only-rc-exit'
    )
      return;
    window.removeEventListener('message', close);
    frame.remove();
    setPaused(false);
    setTimeout(() => prior?.focus(), 0);
  };
  window.addEventListener('message', close);
  document.body.append(frame);
  frame.addEventListener('load', () => frame.contentWindow.focus(), {once: true});
}
