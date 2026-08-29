/**
 * Standalone experiences own separate documents, so ordinary in-memory shell state cannot follow
 * them. The one query value that must cross that boundary is the explicit silent-audio QA clamp:
 * it protects a shared machine, while every other source-page query belongs to the page being
 * left and must not leak into the destination.
 */
export function explicitSilentAudioQa(locationLike = globalThis.location) {
  try {
    const current = new URL(locationLike?.href || "https://invalid.local/");
    return current.searchParams.get("audioQa") === "silent";
  } catch {
    return false;
  }
}

/**
 * Resolve an authored standalone destination while carrying only `audioQa=silent` from the
 * current page. Destination-owned parameters such as `program` and `menu` remain intact.
 */
export function standaloneNavigationHref(
  destination,
  locationLike = globalThis.location,
) {
  let current;
  try {
    current = new URL(locationLike?.href || "https://invalid.local/");
  } catch {
    current = new URL("https://invalid.local/");
  }
  const target = new URL(destination, current);
  target.searchParams.delete("audioQa");
  if (explicitSilentAudioQa(current)) target.searchParams.set("audioQa", "silent");
  return target.href;
}

/**
 * Clamp every same-origin catalogue link in a standalone document before it becomes interactive.
 * This also covers preview-only pages whose main experience module is deliberately not loaded.
 */
export function syncStandaloneReturnLinks(
  documentLike = globalThis.document,
  locationLike = globalThis.location,
) {
  if (typeof documentLike?.querySelectorAll !== "function") return 0;
  let current;
  try {
    current = new URL(locationLike?.href || "https://invalid.local/");
  } catch {
    return 0;
  }
  let synced = 0;
  for (const anchor of documentLike.querySelectorAll("a[href]")) {
    const authored = anchor.getAttribute?.("href");
    if (!authored) continue;
    let target;
    try {
      target = new URL(authored, current);
    } catch {
      continue;
    }
    if (target.origin !== current.origin || target.pathname !== "/") continue;
    anchor.href = standaloneNavigationHref(authored, current);
    synced += 1;
  }
  return synced;
}
