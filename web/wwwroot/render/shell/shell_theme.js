export const SHELL_THEMES = Object.freeze(["glass", "canopy", "ink", "bezel"]);
export const SHELL_THEME_CLASSES = Object.freeze(
  SHELL_THEMES.map((name) => `shell-theme-${name}`),
);

/**
 * Parse `?shellTheme=<name>` from a Location, URL, or query/href string.
 * Returns one of `"glass" | "canopy" | "ink" | "bezel"`, or `null` when absent/invalid.
 */
export function resolveShellTheme(locationLike = globalThis.location) {
  try {
    const raw = typeof locationLike === "string"
      ? locationLike
      : locationLike?.href || locationLike?.search || "";
    if (!raw) return null;
    const url = new URL(raw, "https://guns-only.local/");
    const candidate = (url.searchParams.get("shellTheme") || "").trim().toLowerCase();
    return SHELL_THEMES.includes(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Synchronise the `shell-theme-<name>` class on `root` (typically `document.documentElement`).
 * Without a valid `?shellTheme=<name>` query and with no prior theme class on `root`, no DOM
 * mutation is performed so the default document remains byte-identical.
 */
export function applyShellTheme(
  root = globalThis.document?.documentElement,
  locationLike = globalThis.location,
) {
  const theme = resolveShellTheme(locationLike);
  const chosenClass = theme ? `shell-theme-${theme}` : null;
  const classList = root?.classList;
  if (!classList) return theme;
  const hasContains = typeof classList.contains === "function";
  for (const className of SHELL_THEME_CLASSES) {
    if (className !== chosenClass && (!hasContains || classList.contains(className))) {
      classList.remove?.(className);
    }
  }
  if (chosenClass && (!hasContains || !classList.contains(chosenClass))) {
    classList.add?.(chosenClass);
  }
  return theme;
}
