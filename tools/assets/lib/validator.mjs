import path from "node:path";
import { stat } from "node:fs/promises";
import {
  ID_PATTERN,
  SHA256_PATTERN,
  checkSafePath,
  fileInfo,
  formatBytes,
  isExternalReference,
  isInside,
  isRegularFile,
  readJson,
  relativeToRoot,
  resolveReference,
  walkFiles,
} from "./common.mjs";
import { inspectModelFile } from "./glb.mjs";
import { findSchemaForManifest, loadSchemas, validateSchema } from "./schema.mjs";

const MANIFEST_NAMES = new Set(["pack.json", "visual-profile.json", "visuals.json", "asset-manifest.json", "license-set.json", "licenses.json"]);
const FORBIDDEN_LICENSES = new Set(["", "unknown", "noassertion", "none", "unlicensed"]);

const MODEL_BUDGETS = {
  lod0: { maxBytes: 32 * 1024 ** 2, maxTriangles: 40_000, maxVertices: 55_000, maxMaterials: 8, maxTextures: 12 },
  lod1: { maxBytes: 16 * 1024 ** 2, maxTriangles: 12_000, maxVertices: 18_000, maxMaterials: 6, maxTextures: 10 },
  lod2: { maxBytes: 8 * 1024 ** 2, maxTriangles: 2_500, maxVertices: 4_000, maxMaterials: 4, maxTextures: 6 },
};

const TYPE_BUDGETS = {
  aircraft: MODEL_BUDGETS,
  fighter: MODEL_BUDGETS,
  drone: MODEL_BUDGETS,
  glider: MODEL_BUDGETS,
  awacs: MODEL_BUDGETS,
  model: { default: { maxBytes: 64 * 1024 ** 2, maxTriangles: 60_000, maxVertices: 80_000, maxMaterials: 12, maxTextures: 16 } },
  mesh: { default: { maxBytes: 64 * 1024 ** 2, maxTriangles: 60_000, maxVertices: 80_000, maxMaterials: 12, maxTextures: 16 } },
  carrier: { default: { maxBytes: 96 * 1024 ** 2, maxTriangles: 140_000, maxVertices: 180_000, maxMaterials: 18, maxTextures: 24 } },
  terrain: { default: { maxBytes: 192 * 1024 ** 2 } },
  texture: { default: { maxBytes: 16 * 1024 ** 2 } },
  effect: { default: { maxBytes: 12 * 1024 ** 2 } },
  audio: { default: { maxBytes: 12 * 1024 ** 2 } },
};

function manifestKind(file) {
  switch (path.basename(file)) {
    case "pack.json": return "pack";
    case "visual-profile.json":
    case "visuals.json": return "visuals";
    case "asset-manifest.json": return "assets";
    case "license-set.json":
    case "licenses.json": return "licenses";
    default: return "unknown";
  }
}

function makeIssue(root, severity, code, file, pointer, message) {
  let displayFile;
  try { displayFile = relativeToRoot(root, file); }
  catch { displayFile = file; }
  return { severity, code, file: displayFile, path: pointer, message };
}

function sortIssues(items) {
  return items.sort((a, b) => [a.file, a.path, a.code, a.message].join("\0").localeCompare([b.file, b.path, b.code, b.message].join("\0"), "en"));
}

function schemaVersion(document) {
  if (document?.schemaVersion !== undefined && document?.version !== undefined
      && String(document.schemaVersion) !== String(document.version)) return { conflict: true };
  const value = document?.schemaVersion ?? document?.version;
  return { value, conflict: false };
}

function lodLevel(asset) {
  const value = asset?.lod;
  if (Number.isInteger(value) && value >= 0) return value;
  if (value && typeof value === "object") {
    const nested = value.level ?? value.index;
    if (Number.isInteger(nested) && nested >= 0) return nested;
  }
  if (typeof asset?.id === "string") {
    const match = asset.id.match(/(?:^|[._-])lod[._-]?(\d+)$/i);
    if (match) return Number(match[1]);
  }
  return null;
}

function lodGroup(asset) {
  if (typeof asset?.lodGroup === "string") return asset.lodGroup;
  if (asset?.lod && typeof asset.lod === "object" && typeof asset.lod.group === "string") return asset.lod.group;
  return typeof asset?.id === "string" ? asset.id.replace(/(?:[._-])lod[._-]?\d+$/i, "") : null;
}

function declaredBudget(budgets, ...names) {
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) return undefined;
  for (const name of names) if (budgets[name] !== undefined) return budgets[name];
  return undefined;
}

function defaultBudget(asset) {
  const type = String(asset?.kind ?? asset?.type ?? "").toLowerCase();
  const family = TYPE_BUDGETS[type];
  if (!family) return null;
  const level = lodLevel(asset);
  return family[`lod${Math.min(level ?? 0, 2)}`] ?? family.default ?? null;
}

function effectiveBudget(asset) {
  const fallback = defaultBudget(asset) ?? {};
  const declared = asset?.budgets && typeof asset.budgets === "object" ? asset.budgets : {};
  return {
    maxBytes: declaredBudget(declared, "maxBytes", "maxFileBytes", "bytes") ?? fallback.maxBytes,
    maxTriangles: declaredBudget(declared, "maxTriangles", "triangles") ?? fallback.maxTriangles,
    maxVertices: declaredBudget(declared, "maxVertices", "vertices") ?? fallback.maxVertices,
    maxMaterials: declaredBudget(declared, "maxMaterials", "materials") ?? fallback.maxMaterials,
    maxDrawCalls: declaredBudget(declared, "maxDrawCalls", "drawCalls") ?? fallback.maxDrawCalls,
    maxTextures: declaredBudget(declared, "maxTextures", "textures") ?? fallback.maxTextures,
    maxNodes: declaredBudget(declared, "maxNodes", "nodes") ?? fallback.maxNodes,
    requireMeshopt: declared.requireMeshopt === true,
    requireKtx2: declared.requireKtx2 === true,
    source: Object.keys(declared).length ? "manifest" : Object.keys(fallback).length ? "default" : "none",
  };
}

function socketEntries(sockets) {
  if (Array.isArray(sockets)) return sockets.map((value) => {
    if (typeof value === "string") return { role: value, node: `SOCKET_${value.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}` };
    return { role: value?.id, node: value?.node };
  });
  if (!sockets || typeof sockets !== "object") return [];
  return Object.entries(sockets).map(([role, value]) => ({
    role,
    node: typeof value === "string" ? value : typeof value?.node === "string" ? value.node : null,
  }));
}

function collectTextureReferences(textures) {
  const found = [];
  if (Array.isArray(textures)) {
    textures.forEach((item, index) => {
      if (typeof item === "string") found.push({ value: item, path: `textures[${index}]` });
      else if (typeof item?.uri === "string") found.push({ value: item.uri, path: `textures[${index}].uri` });
    });
  } else if (textures && typeof textures === "object") {
    for (const [slot, item] of Object.entries(textures)) {
      if (typeof item === "string") found.push({ value: item, path: `textures.${slot}` });
      else if (typeof item?.uri === "string") found.push({ value: item.uri, path: `textures.${slot}.uri` });
    }
  }
  return found;
}

function lodPolicyEntries(policy) {
  const values = Array.isArray(policy) ? policy
    : Array.isArray(policy?.levels) ? policy.levels
      : Array.isArray(policy?.lods) ? policy.lods : [];
  return values.map((value, index) => {
    if (typeof value === "string") return { index, asset: value };
    return {
      index,
      asset: value?.asset ?? value?.id,
      level: value?.level ?? value?.lod,
      distance: value?.distanceM ?? value?.maxDistance ?? value?.distance,
      screen: value?.minScreenPixels ?? value?.screenPixels ?? value?.screenCoverage,
    };
  });
}

function pathLike(value) {
  return typeof value === "string" && (value.includes("/") || /\.[a-z0-9]{2,8}$/i.test(value));
}

function refUri(value) {
  return typeof value === "string" ? value : typeof value?.uri === "string" ? value.uri : null;
}

function manifestReferences(file, document) {
  const references = [];
  if (path.basename(file) === "pack.json") {
    for (const profile of document?.presentation?.profiles ?? []) {
      const uri = refUri(profile?.visualProfile);
      if (uri) references.push(uri);
    }
    const licenseUri = refUri(document?.licensing?.licenseSet);
    if (licenseUri) references.push(licenseUri);
    for (const field of ["visuals", "assetManifest", "licenseManifest"]) {
      const uri = refUri(document?.[field]);
      if (uri) references.push(uri);
    }
  }
  if (path.basename(file) === "visual-profile.json" || path.basename(file) === "visuals.json") {
    const uri = refUri(document?.assetProfile?.manifest);
    if (uri) references.push(uri);
  }
  return [...new Set(references)].sort();
}

function nestedStrings(value, pointer = "entrypoints") {
  if (typeof value === "string") return [{ value, pointer }];
  if (Array.isArray(value)) return value.flatMap((item, index) => nestedStrings(item, `${pointer}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => nestedStrings(item, `${pointer}.${key}`));
  return [];
}

async function discoverManifestFiles(root, explicitPacks, issues) {
  if (explicitPacks?.length) {
    const files = new Set();
    const queue = [];
    for (const input of explicitPacks) {
      const file = path.resolve(root, input);
      if (!isInside(root, file)) {
        issues.push(makeIssue(root, "error", "path.outsideRoot", file, "$", "explicit pack is outside repository root"));
        continue;
      }
      queue.push(file);
    }
    while (queue.length) {
      const file = queue.shift();
      if (files.has(file)) continue;
      files.add(file);
      let document;
      try { document = await readJson(file); }
      catch { continue; }
      for (const reference of manifestReferences(file, document)) {
        try { queue.push(resolveReference(root, file, reference)); }
        catch (error) { issues.push(makeIssue(root, "error", "path.unsafe", file, "$", error.message)); }
      }
    }
    return [...files].sort((a, b) => a.localeCompare(b, "en"));
  }
  const contentRoot = path.join(root, "content");
  return (await walkFiles(contentRoot))
    .filter((file) => MANIFEST_NAMES.has(path.basename(file)))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function addRuntimeReference(root, fromFile, reference, pointer, runtimeFiles, issues, options = {}) {
  if (typeof reference !== "string") return null;
  if (options.allowExternal && isExternalReference(reference)) return null;
  const reason = checkSafePath(reference);
  if (reason) {
    issues.push(makeIssue(root, "error", "path.unsafe", fromFile, pointer, `'${reference}' ${reason}`));
    return null;
  }
  let target;
  try { target = resolveReference(root, fromFile, reference); }
  catch (error) {
    issues.push(makeIssue(root, "error", "path.unsafe", fromFile, pointer, error.message));
    return null;
  }
  if (!(await isRegularFile(target))) {
    issues.push(makeIssue(root, "error", "path.missing", fromFile, pointer, `referenced file does not exist: ${reference}`));
    return null;
  }
  if (options.runtime !== false) runtimeFiles.add(target);
  return target;
}

function validateManifestHeader(root, record, issues) {
  const document = record.document;
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    issues.push(makeIssue(root, "error", "manifest.type", record.file, "$", "manifest root must be an object"));
    return;
  }
  const version = schemaVersion(document);
  if (version.conflict) issues.push(makeIssue(root, "error", "manifest.versionConflict", record.file, "$", "schemaVersion and version must match when both are present"));
  else if (version.value === undefined) issues.push(makeIssue(root, "error", "manifest.versionMissing", record.file, "$", "manifest must declare schemaVersion (or legacy version alias)"));
  else if (!(typeof version.value === "string" && version.value.length || Number.isInteger(version.value) && version.value >= 1)) {
    issues.push(makeIssue(root, "error", "manifest.versionType", record.file, "$", "schema version must be a non-empty string or positive integer"));
  }
}

function validateId(root, file, pointer, value, seen, issues) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    issues.push(makeIssue(root, "error", "id.invalid", file, pointer, "ID must contain lowercase alphanumeric kebab/snake/dot segments"));
    return false;
  }
  if (seen?.has(value)) issues.push(makeIssue(root, "error", "id.duplicate", file, pointer, `duplicate ID '${value}'`));
  seen?.add(value);
  return true;
}

function validateSockets(root, file, pointer, sockets, modelInfo, issues) {
  if (sockets === undefined) return;
  if (!Array.isArray(sockets) && (!sockets || typeof sockets !== "object")) {
    issues.push(makeIssue(root, "error", "socket.type", file, pointer, "sockets must be an array or object map"));
    return;
  }
  const seen = new Set();
  for (const entry of socketEntries(sockets)) {
    const itemPath = `${pointer}.${String(entry.role)}`;
    if (typeof entry.role !== "string" || !ID_PATTERN.test(entry.role)) {
      issues.push(makeIssue(root, "error", "socket.role", file, itemPath, `anchor ID '${String(entry.role)}' is not a valid content ID`));
      continue;
    }
    if (seen.has(entry.role)) issues.push(makeIssue(root, "error", "socket.duplicate", file, itemPath, `duplicate socket role '${entry.role}'`));
    seen.add(entry.role);
    const expected = `SOCKET_${entry.role.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
    if (entry.node !== expected) issues.push(makeIssue(root, "error", "socket.nodeName", file, itemPath, `node must be named '${expected}'`));
    if (modelInfo && !modelInfo.nodeNames.includes(expected)) issues.push(makeIssue(root, "error", "socket.nodeMissing", file, itemPath, `GLB does not contain node '${expected}'`));
  }
}

function validateLimit(root, file, pointer, label, actual, limit, issues) {
  if (limit === undefined) return;
  if (!Number.isInteger(limit) || limit < 0) {
    issues.push(makeIssue(root, "error", "budget.invalid", file, `${pointer}.${label}`, "budget must be a non-negative integer"));
    return;
  }
  if (Number.isFinite(actual) && actual > limit) {
    issues.push(makeIssue(root, "error", "budget.exceeded", file, `${pointer}.${label}`, `${label} ${actual.toLocaleString("en-US")} exceeds limit ${limit.toLocaleString("en-US")}`));
  }
}

async function validateAsset(root, record, asset, index, licenses, runtimeFiles, issues, warnings) {
  const pointer = `$.assets[${index}]`;
  if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
    issues.push(makeIssue(root, "error", "asset.type", record.file, pointer, "asset entry must be an object"));
    return null;
  }
  const kind = asset.kind ?? asset.type;
  if (typeof kind !== "string" || !ID_PATTERN.test(kind)) issues.push(makeIssue(root, "error", "asset.assetType", record.file, `${pointer}.kind`, "asset kind must be a lowercase ID"));
  const textureTargets = [];
  const sourceResults = [];
  const addSource = async (source, sourcePointer, runtime) => {
    if (!source || typeof source !== "object" || typeof source.uri !== "string") return null;
    const target = await addRuntimeReference(root, record.file, source.uri, `${sourcePointer}.uri`, runtimeFiles, issues, { runtime });
    if (!target) return null;
    const info = await fileInfo(target);
    const declaredBytes = source.sizeBytes ?? source.bytes;
    if (declaredBytes !== undefined && declaredBytes !== info.bytes) issues.push(makeIssue(root, "error", "asset.bytesMismatch", record.file, `${sourcePointer}.sizeBytes`, `declares ${declaredBytes} bytes; file contains ${info.bytes}`));
    if (source.sha256 !== undefined) {
      if (typeof source.sha256 !== "string" || !SHA256_PATTERN.test(source.sha256)) issues.push(makeIssue(root, "error", "asset.sha256Format", record.file, `${sourcePointer}.sha256`, "sha256 must be 64 lowercase hexadecimal characters"));
      else if (source.sha256 !== info.sha256) issues.push(makeIssue(root, "error", "asset.sha256Mismatch", record.file, `${sourcePointer}.sha256`, `declared digest does not match ${source.uri}`));
    }
    return { target, info, source };
  };
  if (Array.isArray(asset.sources)) {
    for (let sourceIndex = 0; sourceIndex < asset.sources.length; sourceIndex++) {
      const result = await addSource(asset.sources[sourceIndex], `${pointer}.sources[${sourceIndex}]`, true);
      if (result) sourceResults.push(result);
    }
  } else if (typeof asset.source === "string") {
    await addRuntimeReference(root, record.file, asset.source, `${pointer}.source`, runtimeFiles, issues, { allowExternal: true, runtime: false });
  }
  for (const texture of collectTextureReferences(asset.textures)) {
    const textureFile = await addRuntimeReference(root, record.file, texture.value, `${pointer}.${texture.path}`, runtimeFiles, issues);
    if (textureFile) textureTargets.push(textureFile);
  }

  const licenseId = asset.licenseRef ?? (typeof asset.license === "string" ? asset.license : asset.license?.id);
  let resolvedLicense = null;
  if (typeof licenseId !== "string" || FORBIDDEN_LICENSES.has(licenseId.toLowerCase())) {
    issues.push(makeIssue(root, "error", "license.missing", record.file, `${pointer}.licenseRef`, "asset must declare a real licenseRef"));
  } else if (licenses) {
    const entry = licenses.get(licenseId);
    resolvedLicense = entry ?? null;
    if (!entry) issues.push(makeIssue(root, "error", "license.unknown", record.file, `${pointer}.licenseRef`, `license '${licenseId}' is not in the pack license manifest`));
    else if (entry.redistributable !== true) issues.push(makeIssue(root, "error", "license.nonRedistributable", record.file, `${pointer}.licenseRef`, `license '${licenseId}' is not marked redistributable`));
  } else {
    warnings.push(makeIssue(root, "warning", "license.unresolved", record.file, `${pointer}.licenseRef`, `license '${licenseId}' cannot be resolved without licenses.json`));
  }

  const lodResults = [];
  if (Array.isArray(asset.lods)) {
    let previousPixels = Infinity;
    for (let lodIndex = 0; lodIndex < asset.lods.length; lodIndex++) {
      const lod = asset.lods[lodIndex];
      const lodPointer = `${pointer}.lods[${lodIndex}]`;
      if (!lod || typeof lod !== "object") continue;
      if (lod.level !== lodIndex) issues.push(makeIssue(root, "error", "lod.order", record.file, `${lodPointer}.level`, `LOD levels must be sequential from 0; expected ${lodIndex}`));
      if (!Number.isFinite(lod.minProjectedPixels) || lod.minProjectedPixels >= previousPixels) issues.push(makeIssue(root, "error", "lod.screen", record.file, `${lodPointer}.minProjectedPixels`, "minProjectedPixels must be finite and strictly descending"));
      else previousPixels = lod.minProjectedPixels;
      const source = await addSource(lod.source, `${lodPointer}.source`, true);
      let model = null;
      if (source) {
        try { model = await inspectModelFile(source.target); }
        catch (error) { issues.push(makeIssue(root, "error", "model.invalid", record.file, `${lodPointer}.source.uri`, error.message)); }
      }
      const budget = effectiveBudget({ ...asset, lod: lod.level, budgets: lod.budgets ?? asset.budgets });
      validateLimit(root, record.file, `${lodPointer}.budgets`, "maxBytes", source?.info.bytes, budget.maxBytes, issues);
      validateLimit(root, record.file, `${lodPointer}.budgets`, "triangles", model?.triangles, budget.maxTriangles, issues);
      validateLimit(root, record.file, `${lodPointer}.budgets`, "maxVertices", model?.vertices, budget.maxVertices, issues);
      validateLimit(root, record.file, `${lodPointer}.budgets`, "materials", model?.materials, budget.maxMaterials, issues);
      validateLimit(root, record.file, `${lodPointer}.budgets`, "drawCalls", model?.primitives, budget.maxDrawCalls, issues);
      validateLimit(root, record.file, `${lodPointer}.budgets`, "maxTextures", model?.textures, budget.maxTextures, issues);
      if (model) {
        if (model.cameras > 0) issues.push(makeIssue(root, "error", "model.camera", record.file, `${lodPointer}.source.uri`, `runtime GLB contains ${model.cameras} camera(s); export without cameras`));
        if (model.lights > 0) issues.push(makeIssue(root, "error", "model.light", record.file, `${lodPointer}.source.uri`, `runtime GLB contains ${model.lights} light(s); export without lights`));
        if (budget.requireMeshopt && !model.usesMeshopt) issues.push(makeIssue(root, "error", "budget.meshopt", record.file, `${lodPointer}.budgets`, "GLB does not use EXT_meshopt_compression"));
        if (budget.requireKtx2 && model.images > model.ktx2Images) issues.push(makeIssue(root, "error", "budget.ktx2", record.file, `${lodPointer}.budgets`, `${model.images - model.ktx2Images} image(s) are not KTX2`));
        for (const external of model.externalUris) await addRuntimeReference(root, source.target, external, `${lodPointer}.source.uri`, runtimeFiles, issues);
      }
      lodResults.push({ level: lod.level, pixels: lod.minProjectedPixels, ...source, model, budget });
    }
    if (asset.lods.length && asset.lods.at(-1)?.minProjectedPixels !== 0) issues.push(makeIssue(root, "error", "lod.finalThreshold", record.file, `${pointer}.lods[${asset.lods.length - 1}].minProjectedPixels`, "final authored LOD must have minProjectedPixels 0"));
    for (let lodIndex = 1; lodIndex < lodResults.length; lodIndex++) {
      const previous = lodResults[lodIndex - 1];
      const current = lodResults[lodIndex];
      if (previous.model && current.model && current.model.triangles > previous.model.triangles) issues.push(makeIssue(root, "error", "lod.triangles", record.file, `${pointer}.lods[${lodIndex}]`, "lower-detail LOD has more triangles than the previous LOD"));
    }
  }
  if (asset.status === "fallback_only" && asset.lods?.length) warnings.push(makeIssue(root, "warning", "asset.fallbackHasLods", record.file, `${pointer}.lods`, "fallback_only asset unexpectedly has authored LODs"));
  if (asset.status !== "fallback_only" && kind === "model" && lodResults.length === 0) issues.push(makeIssue(root, "error", "lod.missing", record.file, `${pointer}.lods`, "authored model needs at least one LOD"));
  const primary = lodResults[0] ?? sourceResults[0] ?? null;
  validateSockets(root, record.file, `${pointer}.anchors`, asset.anchors ?? asset.sockets, asset.status === "fallback_only" ? null : primary?.model, issues);
  if (resolvedLicense) {
    const appliesTo = new Set(Array.isArray(resolvedLicense.appliesTo) ? resolvedLicense.appliesTo : []);
    const references = [
      ...(asset.sources ?? []).map((source) => source?.uri),
      ...(asset.lods ?? []).map((lod) => lod?.source?.uri),
      ...(asset.fallbacks ?? []).map((fallback) => fallback?.uri),
    ].filter((value) => typeof value === "string");
    if (!appliesTo.has(asset.id)) {
      for (let referenceIndex = 0; referenceIndex < references.length; referenceIndex++) {
        const reference = references[referenceIndex];
        if (!appliesTo.has(reference)) issues.push(makeIssue(root, "error", "license.coverage", record.file, `${pointer}.licenseRef`, `license '${licenseId}' does not list asset '${asset.id}' or referenced URI '${reference}' in appliesTo`));
      }
    }
  }
  return {
    asset, index, target: primary?.target ?? null, textureTargets,
    info: primary?.info ?? null, model: primary?.model ?? null,
    budget: primary?.budget ?? effectiveBudget(asset), lodResults,
    level: 0, group: asset.id,
  };
}

function validateLicenseManifest(root, record, issues) {
  const entries = record.document?.entries ?? record.document?.licenses;
  if (!Array.isArray(entries)) {
    issues.push(makeIssue(root, "error", "license.entries", record.file, "$.entries", "entries must be an array"));
    return new Map();
  }
  const found = new Map();
  const ids = new Set();
  entries.forEach((entry, index) => {
    const pointer = `$.entries[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      issues.push(makeIssue(root, "error", "license.entry", record.file, pointer, "license entry must be an object"));
      return;
    }
    const id = entry.licenseId ?? entry.id;
    validateId(root, record.file, `${pointer}.licenseId`, id, ids, issues);
    if (entry.spdxExpression !== undefined && (typeof entry.spdxExpression !== "string" || FORBIDDEN_LICENSES.has(entry.spdxExpression.toLowerCase()))) {
      issues.push(makeIssue(root, "error", "license.spdx", record.file, `${pointer}.spdxExpression`, "SPDX expression must be explicit and may not be NOASSERTION"));
    }
    const allowed = entry.redistribution?.allowed ?? entry.redistributable;
    if (typeof allowed !== "boolean") issues.push(makeIssue(root, "error", "license.redistributable", record.file, `${pointer}.redistribution.allowed`, "redistribution.allowed must be true or false"));
    if (entry.sourceUri !== undefined && (typeof entry.sourceUri !== "string" || !isExternalReference(entry.sourceUri))) issues.push(makeIssue(root, "error", "license.url", record.file, `${pointer}.sourceUri`, "sourceUri must be an absolute or repository URI"));
    if (typeof id === "string") found.set(id, { ...entry, redistributable: allowed });
  });
  return found;
}

function validateLodGroups(root, record, assets, issues) {
  const groups = new Map();
  for (const item of assets) {
    if (!item || item.level === null || !item.group) continue;
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  for (const [group, items] of groups) {
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1];
      const current = items[index];
      if (current.level <= previous.level) issues.push(makeIssue(root, "error", "lod.order", record.file, `$.assets[${current.index}].lod`, `LOD group '${group}' must be listed in strictly increasing level order`));
      if (previous.model && current.model && current.level > previous.level) {
        if (current.model.triangles > previous.model.triangles) issues.push(makeIssue(root, "error", "lod.triangles", record.file, `$.assets[${current.index}].lod`, `LOD ${current.level} has more triangles than LOD ${previous.level}`));
        if (current.model.vertices > previous.model.vertices) issues.push(makeIssue(root, "error", "lod.vertices", record.file, `$.assets[${current.index}].lod`, `LOD ${current.level} has more vertices than LOD ${previous.level}`));
      }
    }
  }
}

function validateProfiles(root, record, assetMap, issues, warnings) {
  const profile = record.document;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return [];
  validateId(root, record.file, "$.profileId", profile.profileId, new Set(), issues);

  const requireAsset = (assetId, pointer, requiredAnchors = []) => {
    const asset = assetMap.get(assetId);
    if (!asset) {
      issues.push(makeIssue(root, "error", "profile.assetRef", record.file, pointer, `unknown asset ID '${String(assetId)}'`));
      return;
    }
    const anchors = new Set(socketEntries(asset.asset.anchors).map((entry) => entry.role));
    for (let index = 0; index < requiredAnchors.length; index++) {
      const anchor = requiredAnchors[index];
      if (!anchors.has(anchor)) issues.push(makeIssue(root, "error", "profile.anchorRef", record.file, `${pointer.replace(/\.assetId$/, "")}.requiredAnchors[${index}]`, `asset '${assetId}' does not declare anchor '${anchor}'`));
    }
  };

  const presentationIds = new Set();
  for (let index = 0; index < (profile.assetProfile?.bindings ?? []).length; index++) {
    const binding = profile.assetProfile.bindings[index];
    const pointer = `$.assetProfile.bindings[${index}]`;
    validateId(root, record.file, `${pointer}.presentationId`, binding?.presentationId, presentationIds, issues);
    requireAsset(binding?.assetId, `${pointer}.assetId`, Array.isArray(binding?.requiredAnchors) ? binding.requiredAnchors : []);
  }

  const eventIds = new Set();
  for (let index = 0; index < (profile.effectsProfile?.bindings ?? []).length; index++) {
    const binding = profile.effectsProfile.bindings[index];
    const pointer = `$.effectsProfile.bindings[${index}]`;
    validateId(root, record.file, `${pointer}.eventId`, binding?.eventId, eventIds, issues);
    requireAsset(binding?.assetId, `${pointer}.assetId`);
  }

  for (const [field, value] of [
    ["skyAssetId", profile.environment?.skyAssetId],
    ["surfaceAssetId", profile.environment?.surfaceAssetId],
    ["terrainAssetId", profile.environment?.terrainAssetId],
  ]) {
    if (value !== undefined) requireAsset(value, `$.environment.${field}`);
  }
  for (let index = 0; index < (profile.environment?.platformAssetIds ?? []).length; index++) {
    requireAsset(profile.environment.platformAssetIds[index], `$.environment.platformAssetIds[${index}]`);
  }

  const tierIds = new Set();
  let previousOrder = -1;
  for (let index = 0; index < (profile.qualityTiers ?? []).length; index++) {
    const tier = profile.qualityTiers[index];
    const pointer = `$.qualityTiers[${index}]`;
    validateId(root, record.file, `${pointer}.id`, tier?.id, tierIds, issues);
    if (!Number.isInteger(tier?.order) || tier.order <= previousOrder) {
      issues.push(makeIssue(root, "error", "profile.tierOrder", record.file, `${pointer}.order`, "quality tier order values must be integers in strictly increasing order"));
    } else previousOrder = tier.order;
  }
  if (!assetMap.size) warnings.push(makeIssue(root, "warning", "profile.assetsUnavailable", record.file, "$.assetProfile.manifest", "asset bindings could not be resolved because the manifest was not linked from a loaded pack"));
  return [profile];
}

export async function validateRepository(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const schemaDirectory = path.resolve(root, options.schemaDir ?? "content/schemas");
  const issues = [];
  const warnings = [];
  let schemas;
  try { schemas = await loadSchemas(schemaDirectory); }
  catch (error) {
    schemas = { directory: schemaDirectory, byFile: new Map(), byId: new Map(), files: [] };
    issues.push(makeIssue(root, "error", "schema.load", schemaDirectory, "$", error.message));
  }
  if (schemas.files.length === 0) warnings.push(makeIssue(root, "warning", "schema.none", schemaDirectory, "$", "no content/schemas/*.schema.json files were found; convention validation still ran"));

  const manifestFiles = await discoverManifestFiles(root, options.packs, issues);
  const records = new Map();
  for (const file of manifestFiles) {
    if (!(await isRegularFile(file))) {
      issues.push(makeIssue(root, "error", "manifest.missing", file, "$", "manifest file does not exist"));
      continue;
    }
    let document;
    try { document = await readJson(file); }
    catch (error) {
      issues.push(makeIssue(root, "error", "manifest.json", file, "$", error.message));
      continue;
    }
    const record = { file, document, kind: manifestKind(file), schema: null };
    records.set(file, record);
    validateManifestHeader(root, record, issues);
    const schema = findSchemaForManifest(file, document, schemas);
    if (!schema) warnings.push(makeIssue(root, "warning", "schema.missing", file, "$", `no schema found for ${path.basename(file)}`));
    else {
      record.schema = schema.file;
      for (const error of validateSchema(document, schema, schemas)) issues.push(makeIssue(root, "error", error.code, file, error.path, error.message));
    }
  }

  const licenseMaps = new Map();
  for (const record of records.values()) if (record.kind === "licenses") licenseMaps.set(record.file, validateLicenseManifest(root, record, issues));

  const assetResults = new Map();
  const runtimeFilesByManifest = new Map();
  for (const record of records.values()) {
    if (record.kind !== "assets") continue;
    const runtimeFiles = new Set([record.file]);
    runtimeFilesByManifest.set(record.file, runtimeFiles);
    const entries = record.document?.assets;
    if (!Array.isArray(entries)) {
      issues.push(makeIssue(root, "error", "asset.entries", record.file, "$.assets", "assets must be an array"));
      assetResults.set(record.file, []);
      continue;
    }
    const ids = new Set();
    const possibleLicenseRecord = [...records.values()].find((candidate) => candidate.kind === "licenses" && path.dirname(candidate.file) === path.dirname(record.file));
    const licenses = possibleLicenseRecord ? licenseMaps.get(possibleLicenseRecord.file) : null;
    const results = [];
    for (let index = 0; index < entries.length; index++) {
      validateId(root, record.file, `$.assets[${index}].id`, entries[index]?.id, ids, issues);
      const result = await validateAsset(root, record, entries[index], index, licenses, runtimeFiles, issues, warnings);
      if (result) results.push(result);
    }
    validateLodGroups(root, record, results, issues);
    assetResults.set(record.file, results);
  }

  const packClosures = [];
  const profileCounted = new Set();
  const packIds = new Set();
  for (const record of records.values()) {
    if (record.kind !== "pack") continue;
    const packId = record.document?.packId;
    validateId(root, record.file, "$.packId", packId, packIds, issues);
    if (typeof record.document?.displayName !== "string" || !record.document.displayName.trim()) issues.push(makeIssue(root, "error", "pack.displayName", record.file, "$.displayName", "pack displayName is required"));
    const closureFiles = new Set([record.file]);
    const packDirectory = path.dirname(record.file);
    const visualRecords = [];
    const assetRecords = [];
    const expectedDocumentId = (targetRecord) => ({ visuals: targetRecord.document?.profileId, assets: targetRecord.document?.manifestId, licenses: targetRecord.document?.licenseSetId })[targetRecord.kind];
    const linkManifest = async (fromRecord, reference, pointer, expectedKind) => {
      const uri = refUri(reference);
      if (!uri) {
        issues.push(makeIssue(root, "error", "pack.reference", fromRecord.file, pointer, "manifest reference must contain a local uri"));
        return null;
      }
      let target;
      try { target = resolveReference(root, fromRecord.file, uri); }
      catch (error) {
        issues.push(makeIssue(root, "error", "path.unsafe", fromRecord.file, `${pointer}.uri`, error.message));
        return null;
      }
      const targetRecord = records.get(target);
      if (!targetRecord) {
        issues.push(makeIssue(root, "error", "pack.referenceMissing", fromRecord.file, `${pointer}.uri`, `referenced manifest was not loaded: ${uri}`));
        return null;
      }
      if (targetRecord.kind !== expectedKind) {
        issues.push(makeIssue(root, "error", "pack.referenceKind", fromRecord.file, `${pointer}.uri`, `expected ${expectedKind} manifest, found ${targetRecord.kind}`));
        return null;
      }
      closureFiles.add(targetRecord.file);
      if (typeof reference === "object" && reference !== null) {
        const actualId = expectedDocumentId(targetRecord);
        if (reference.id !== actualId) issues.push(makeIssue(root, "error", "pack.referenceId", fromRecord.file, `${pointer}.id`, `reference ID '${String(reference.id)}' does not match target '${String(actualId)}'`));
        if (reference.sha256 !== undefined) {
          const info = await fileInfo(targetRecord.file);
          if (!SHA256_PATTERN.test(reference.sha256)) issues.push(makeIssue(root, "error", "asset.sha256Format", fromRecord.file, `${pointer}.sha256`, "sha256 must be 64 lowercase hexadecimal characters"));
          else if (reference.sha256 !== info.sha256) issues.push(makeIssue(root, "error", "asset.sha256Mismatch", fromRecord.file, `${pointer}.sha256`, `declared digest does not match ${uri}`));
        }
      }
      return targetRecord;
    };

    const licenseReference = record.document?.licensing?.licenseSet;
    const licenseRecord = await linkManifest(record, licenseReference, "$.licensing.licenseSet", "licenses");
    const licenseMap = licenseRecord ? licenseMaps.get(licenseRecord.file) : null;
    const presentationProfiles = Array.isArray(record.document?.presentation?.profiles) ? record.document.presentation.profiles : [];
    const presentationIds = new Set();
    for (let profileIndex = 0; profileIndex < presentationProfiles.length; profileIndex++) {
      const presentation = presentationProfiles[profileIndex];
      const profilePointer = `$.presentation.profiles[${profileIndex}]`;
      validateId(root, record.file, `${profilePointer}.id`, presentation?.id, presentationIds, issues);
      const visualRecord = await linkManifest(record, presentation?.visualProfile, `${profilePointer}.visualProfile`, "visuals");
      if (!visualRecord) continue;
      visualRecords.push(visualRecord);
      if (visualRecord.document?.packId !== packId) issues.push(makeIssue(root, "error", "pack.idMismatch", visualRecord.file, "$.packId", `visual profile packId must be '${packId}'`));
      if (visualRecord.document?.presentationProfileId !== presentation.id) issues.push(makeIssue(root, "error", "profile.presentationId", visualRecord.file, "$.presentationProfileId", `must match presentation profile '${presentation.id}'`));
      for (const [profileField, visualField] of [
        ["assetProfileId", "assetProfile"], ["effectsProfileId", "effectsProfile"],
      ]) {
        const actual = visualRecord.document?.[visualField]?.id;
        if (presentation?.[profileField] !== actual) issues.push(makeIssue(root, "error", "profile.linkedId", record.file, `${profilePointer}.${profileField}`, `must match visual profile ${visualField}.id '${String(actual)}'`));
      }
      for (const field of ["cameraProfileId", "hudProfileId", "inputProfileId", "audioProfileId"]) {
        const actual = visualRecord.document?.linkedProfiles?.[field];
        if (presentation?.[field] !== actual) issues.push(makeIssue(root, "error", "profile.linkedId", record.file, `${profilePointer}.${field}`, `must match visual profile linkedProfiles.${field} '${String(actual)}'`));
      }

      const assetRecord = await linkManifest(visualRecord, visualRecord.document?.assetProfile?.manifest, "$.assetProfile.manifest", "assets");
      if (!assetRecord) continue;
      assetRecords.push(assetRecord);
      if (assetRecord.document?.packId !== packId) issues.push(makeIssue(root, "error", "pack.idMismatch", assetRecord.file, "$.packId", `asset manifest packId must be '${packId}'`));
      const declaredLicense = assetRecord.document?.defaultLicenseSet;
      if (licenseRecord && (declaredLicense?.id !== licenseRecord.document?.licenseSetId || refUri(declaredLicense) !== path.relative(path.dirname(assetRecord.file), licenseRecord.file).split(path.sep).join("/"))) {
        issues.push(makeIssue(root, "error", "license.setMismatch", assetRecord.file, "$.defaultLicenseSet", "asset manifest defaultLicenseSet must reference the pack license set"));
      }
      const runtime = runtimeFilesByManifest.get(assetRecord.file) ?? new Set();
      runtime.forEach((file) => closureFiles.add(file));
      if (licenseMap) {
        for (const result of assetResults.get(assetRecord.file) ?? []) {
          const id = result.asset.licenseRef;
          const entry = licenseMap.get(id);
          if (!entry) issues.push(makeIssue(root, "error", "license.unknown", assetRecord.file, `$.assets[${result.index}].licenseRef`, `license '${String(id)}' is not in ${relativeToRoot(root, licenseRecord.file)}`));
          else if (entry.redistributable !== true) issues.push(makeIssue(root, "error", "license.nonRedistributable", assetRecord.file, `$.assets[${result.index}].licenseRef`, `license '${id}' is not redistributable`));
        }
      }
      const assetMap = new Map((assetResults.get(assetRecord.file) ?? []).map((item) => [item.asset.id, item]));
      validateProfiles(root, visualRecord, assetMap, issues, warnings);
      profileCounted.add(visualRecord.file);
    }
    const defaultPresentationId = record.document?.presentation?.defaultPresentationProfileId;
    if (typeof defaultPresentationId === "string" && !presentationIds.has(defaultPresentationId)) issues.push(makeIssue(root, "error", "pack.defaultProfile", record.file, "$.presentation.defaultPresentationProfileId", `default presentation profile '${defaultPresentationId}' is not declared in presentation.profiles`));

    for (const [collectionName, entries] of Object.entries({
      vehicleDefinitions: record.document?.content?.vehicleDefinitions ?? [],
      missionDefinitions: record.document?.content?.missionDefinitions ?? [],
    })) {
      for (let index = 0; index < entries.length; index++) {
        const uri = entries[index]?.uri;
        if (typeof uri === "string" && !isExternalReference(uri)) await addRuntimeReference(root, record.file, uri, `$.content.${collectionName}[${index}].uri`, closureFiles, issues);
      }
    }
    for (const file of closureFiles) {
      if (!isInside(packDirectory, file)) issues.push(makeIssue(root, "error", "pack.fileOutside", record.file, "$", `runtime file '${relativeToRoot(root, file)}' is outside the pack directory and cannot be staged safely`));
    }
    packClosures.push({
      id: packId,
      packFile: record.file,
      sourceDirectory: packDirectory,
      visualsFile: visualRecords[0]?.file ?? null,
      visualsFiles: [...new Set(visualRecords.map((item) => item.file))],
      assetManifestFile: assetRecords[0]?.file ?? null,
      assetManifestFiles: [...new Set(assetRecords.map((item) => item.file))],
      licenseManifestFile: licenseRecord?.file ?? null,
      runtimeFiles: [...closureFiles].sort((a, b) => a.localeCompare(b, "en")),
    });
  }

  for (const record of records.values()) {
    if (record.kind !== "visuals" || profileCounted.has(record.file)) continue;
    validateProfiles(root, record, new Map(), issues, warnings);
  }

  const assets = [...assetResults.values()].flat();
  // Account for the complete validated asset-source closure, not just the first source chosen as
  // an asset's inspection target. Terrain and other compound assets may own several runtime files;
  // a path set keeps shared textures/buffers from inflating the deploy-size signal.
  const assetManifestFiles = new Set(runtimeFilesByManifest.keys());
  const referencedFiles = new Set();
  for (const runtimeFiles of runtimeFilesByManifest.values()) {
    for (const file of runtimeFiles) {
      if (!assetManifestFiles.has(file)) referencedFiles.add(file);
    }
  }
  const referencedFileSizes = await Promise.all(
    [...referencedFiles].map(async (file) => (await stat(file)).size),
  );
  const totalBytes = referencedFileSizes.reduce((sum, bytes) => sum + bytes, 0);
  const totalTriangles = assets.reduce((sum, item) => sum + (item.model?.triangles ?? 0), 0);
  const summary = {
    schemas: schemas.files.length,
    manifests: records.size,
    packs: packClosures.length,
    profiles: [...records.values()].filter((item) => item.kind === "visuals").length,
    assets: assets.length,
    licenses: [...records.values()].filter((item) => item.kind === "licenses").reduce((sum, item) => sum + (Array.isArray(item.document?.entries) ? item.document.entries.length : Array.isArray(item.document?.licenses) ? item.document.licenses.length : 0), 0),
    referencedFiles: referencedFiles.size,
    referencedBytes: totalBytes,
    modelTriangles: totalTriangles,
  };
  sortIssues(issues);
  sortIssues(warnings);
  const strict = options.strict === true;
  return {
    ok: issues.length === 0 && (!strict || warnings.length === 0),
    root,
    strict,
    summary,
    errors: issues,
    warnings,
    manifests: [...records.values()].map((record) => ({
      file: relativeToRoot(root, record.file), kind: record.kind,
      schema: record.schema ? relativeToRoot(root, record.schema) : null,
    })).sort((a, b) => a.file.localeCompare(b.file, "en")),
    packClosures,
  };
}

export function publicReport(report) {
  return {
    ok: report.ok,
    strict: report.strict,
    summary: report.summary,
    manifests: report.manifests,
    errors: report.errors,
    warnings: report.warnings,
  };
}

export function formatValidationReport(report) {
  const status = report.ok ? "PASS" : "FAIL";
  const lines = [
    `Asset content validation: ${status}`,
    `Schemas ${report.summary.schemas} · documents ${report.summary.manifests} · packs ${report.summary.packs} · profiles ${report.summary.profiles}`,
    `Assets ${report.summary.assets} · licenses ${report.summary.licenses} · unique asset-source closure ${report.summary.referencedFiles} files / ${formatBytes(report.summary.referencedBytes)} · model triangles ${report.summary.modelTriangles.toLocaleString("en-US")}`,
  ];
  if (report.errors.length) {
    lines.push("", `Errors (${report.errors.length})`);
    for (const item of report.errors) lines.push(`  [${item.code}] ${item.file}${item.path === "$" ? "" : ` ${item.path}`}: ${item.message}`);
  }
  if (report.warnings.length) {
    lines.push("", `Warnings (${report.warnings.length})${report.strict ? " (fatal in --strict)" : ""}`);
    for (const item of report.warnings) lines.push(`  [${item.code}] ${item.file}${item.path === "$" ? "" : ` ${item.path}`}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}
