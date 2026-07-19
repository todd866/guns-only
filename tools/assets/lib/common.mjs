import { createHash } from "node:crypto";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function stableStringify(value, space = 2) {
  const seen = new Set();
  const normalize = (item) => {
    if (item === null || typeof item !== "object") return item;
    if (seen.has(item)) throw new TypeError("Cannot stringify a cyclic value");
    seen.add(item);
    let result;
    if (Array.isArray(item)) {
      result = item.map(normalize);
    } else {
      result = {};
      for (const key of Object.keys(item).sort()) result[key] = normalize(item[key]);
    }
    seen.delete(item);
    return result;
  };
  return `${JSON.stringify(normalize(value), null, space)}\n`;
}

export async function readJson(file) {
  const source = await readFile(file, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    const wrapped = new Error(`Invalid JSON in ${file}: ${error.message}`);
    wrapped.code = "INVALID_JSON";
    throw wrapped;
  }
}

export async function walkFiles(root) {
  const files = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  await visit(root);
  return files;
}

export function isExternalReference(value) {
  return typeof value === "string" && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

export function checkSafePath(value) {
  if (typeof value !== "string" || value.length === 0) return "must be a non-empty string";
  if (value.includes("\\")) return "must use POSIX '/' separators";
  if (value.includes("\0")) return "must not contain NUL";
  if (isExternalReference(value)) return "must be a local path, not a URL or URI";
  if (path.posix.isAbsolute(value)) return "must be relative";
  if (value.startsWith("./")) return "must not start with './'";
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    return "must be canonical and must not contain empty, '.' or '..' segments";
  }
  if (path.posix.normalize(value) !== value) return "must be a canonical POSIX path";
  return null;
}

export function isInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export function resolveReference(root, fromFile, reference) {
  const reason = checkSafePath(reference);
  if (reason) {
    const error = new Error(`Unsafe path '${reference}': ${reason}`);
    error.code = "UNSAFE_PATH";
    throw error;
  }
  const base = reference.startsWith("content/") || reference.startsWith("web/")
    ? path.resolve(root)
    : path.dirname(path.resolve(fromFile));
  const target = path.resolve(base, ...reference.split("/"));
  if (!isInside(root, target)) {
    const error = new Error(`Path '${reference}' resolves outside repository root`);
    error.code = "UNSAFE_PATH";
    throw error;
  }
  return target;
}

export function relativeToRoot(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (relative === "" || relative.startsWith("..")) {
    throw new Error(`File is not beneath repository root: ${file}`);
  }
  return toPosix(relative);
}

export async function fileInfo(file) {
  const data = await readFile(file);
  return {
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
    data,
  };
}

export async function pathExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function isRegularFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

export function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function displayCommand(command) {
  return command.map((part) => shellQuote(String(part))).join(" ");
}
