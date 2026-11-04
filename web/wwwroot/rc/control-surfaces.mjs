// Suppress native selection/callouts on game controls, including dynamic nested labels.
// Reading text, external credit links and editable fields retain normal browser behavior.
export const GAME_CONTROL = 'button,[role="button"],[role="slider"],summary,#tracks a';
export function isGameControl(target) {
  return !!target?.closest?.(GAME_CONTROL) && !target.closest('input,textarea,[contenteditable="true"]');
}
export function protectGameControls(root = document) {
  const stop = e => {
    if (isGameControl(e.target)) e.preventDefault();
  };
  for (const type of ['selectstart', 'contextmenu', 'dragstart']) root.addEventListener(type, stop);
  return () => {
    for (const type of ['selectstart', 'contextmenu', 'dragstart']) root.removeEventListener(type, stop);
  };
}
