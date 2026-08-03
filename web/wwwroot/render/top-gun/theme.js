/** Experience-scoped anime-1986 presentation for Top Gun (Ready + in-flight only). */
export const TOP_GUN_PRESENTATION_THEME_ID = "top-gun-anime-1986";

/**
 * Toggle cel sky grading and tape-chrome hooks on {@code root} (typically documentElement).
 * @param {HTMLElement} root
 * @param {boolean} [active=true]
 */
export function applyTopGunAnime1986(root, active = true) {
  if (!root) return;
  if (active) {
    root.dataset.presentationTheme = TOP_GUN_PRESENTATION_THEME_ID;
    root.classList.add("top-gun-anime-1986");
    return;
  }
  if (root.dataset.presentationTheme === TOP_GUN_PRESENTATION_THEME_ID)
    delete root.dataset.presentationTheme;
  root.classList.remove("top-gun-anime-1986");
}

/**
 * @param {{
 *   programNodeId?: string | null,
 *   presentationTheme?: string | null,
 *   readyVisible?: boolean,
 * }} context
 */
export function topGunAnime1986ThemeActive(context) {
  if (context.presentationTheme === TOP_GUN_PRESENTATION_THEME_ID) return true;
  return context.readyVisible === true && context.programNodeId === "top-gun";
}
