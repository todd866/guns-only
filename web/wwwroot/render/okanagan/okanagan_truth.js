// Hashes pin the original embedded bytes. Keep in sync with OkanaganTruthPayload when the
// authoritative content changes; tests compare both pins with the committed files.
export const OKANAGAN_TRUTH = Object.freeze([
  Object.freeze({ name: "okanagan-central.cdem.json", sha256: "1761332f521f506476d01fa31c9b669a5d5ee56bf5af56d17c6b44a19de1b7cd" }),
  Object.freeze({ name: "okanagan-central.world.json", sha256: "23175fcfc405f0e6c6bf0ca0c7f638ad0b892fecb76a3640552bc34865c01963" }),
  Object.freeze({ name: "okanagan-resorts.osm.json", sha256: "16cae455f25b343c85deb3bba4ad75e20031f769e5dc18a0a76fccde0284cf29" }),
]);

export async function loadOkanaganTruth({ fetchImpl = globalThis.fetch,
  cryptoImpl = globalThis.crypto, timeoutMs = 120_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const texts = await Promise.all(OKANAGAN_TRUTH.map(async ({ name, sha256 }) => {
      const response = await fetchImpl(`/content/packs/okanagan-fire/environment/${name}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Fire Boss truth unavailable (${response.status}): ${name}`);
      const bytes = await response.arrayBuffer();
      const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      if (actual !== sha256) throw new Error(`Fire Boss truth SHA-256 mismatch: ${name}`);
      // Preserve an optional BOM so the kernel re-encodes the identical verified bytes.
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }));
    return Object.freeze({ texts: Object.freeze(texts), data: texts.map(text => JSON.parse(text)) });
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
