import { AssetPipelineError, assetAssert, asAssetPipelineError } from "./errors.js?runtime=2";
import {
  lodMinimumPixelHeight,
  selectLodByProjectedPixelHeight,
  selectLodWithHysteresis,
} from "./lod.js?runtime=2";
import {
  cloneStaticGltfScene,
  createGltfLoaderAdapter,
  disposeGltfSource,
  disposeResourceSet,
  disposeSceneResources,
  selectGltfScene,
} from "./resource_utils.js?runtime=2";

const hasDocument = typeof document !== "undefined" && typeof document.baseURI === "string";
const DEFAULT_BASE_URL = hasDocument ? document.baseURI : import.meta.url;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeSceneResult(result, descriptorFields = []) {
  const fields = ["scene", ...descriptorFields];
  const isDescriptor = isRecord(result)
    && fields.some((field) => Object.prototype.hasOwnProperty.call(result, field));
  return isDescriptor ? result : { scene: result };
}

function resolveUrl(reference, baseUrl, path) {
  assetAssert(typeof reference === "string" && reference.length > 0, "INVALID_URL_REFERENCE",
    `${path} must be a non-empty URL string.`, { path, details: reference });
  try {
    return new URL(reference, baseUrl ?? DEFAULT_BASE_URL).href;
  } catch (error) {
    throw new AssetPipelineError("INVALID_URL_REFERENCE", `Could not resolve ${path}: ${reference}`, {
      path,
      details: { reference, baseUrl },
      cause: error,
    });
  }
}

function resolveAssetSource(reference, baseUrl, path) {
  if (typeof reference === "string" && reference.startsWith("procedural://")) return reference;
  return resolveUrl(reference, baseUrl, path);
}

function sameOriginVersionedUrl(reference, baseUrl, parameter, value, path) {
  const resolved = resolveUrl(reference, baseUrl, path);
  if (typeof value !== "string" || value.length === 0) return resolved;
  try {
    const url = new URL(resolved);
    const base = new URL(baseUrl ?? DEFAULT_BASE_URL);
    // Never mutate cross-origin or signed third-party asset URLs. Versioning the repository's
    // same-origin pack closure is sufficient to prevent stale manifests and GLBs after deploys.
    if ((url.protocol === "http:" || url.protocol === "https:") && url.origin === base.origin) {
      url.searchParams.set(parameter, value);
      return url.href;
    }
    return resolved;
  } catch {
    return resolved;
  }
}

function isProceduralSource(uri) {
  return typeof uri === "string" && uri.startsWith("procedural://");
}

function disposeInstancePayload(data, instance = null) {
  const scene = data.scene;
  if (typeof scene?.removeFromParent === "function") scene.removeFromParent();
  else if (scene?.parent && typeof scene.parent.remove === "function") scene.parent.remove(scene);
  if (typeof data.customDispose === "function") return data.customDispose(scene, instance);
  if (data.ownedResources !== undefined) return disposeResourceSet(data.ownedResources);
  if (data.ownership !== "external") return disposeSceneResources(scene);
  return undefined;
}

function sourceUri(source) {
  if (typeof source === "string") return source;
  if (isRecord(source)) return source.uri ?? source.url ?? source.src;
  return undefined;
}

function jsonReference(reference) {
  if (isRecord(reference) && typeof (reference.uri ?? reference.url ?? reference.src) === "string"
    && reference.assets === undefined && reference.assetProfile === undefined
    && reference.bindings === undefined) {
    return reference.uri ?? reference.url ?? reference.src;
  }
  return reference;
}

async function defaultFetchJson(url) {
  assetAssert(typeof fetch === "function", "FETCH_UNAVAILABLE",
    "No global fetch implementation is available; inject fetchJson into AssetRegistry.");
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new AssetPipelineError("JSON_FETCH_FAILED",
      `Failed to load ${url}: HTTP ${response.status} ${response.statusText}`,
      { details: { url, status: response.status } });
  }
  return response.json();
}

function normalizeAssetTable(rawAssets, path) {
  if (Array.isArray(rawAssets)) {
    const table = Object.create(null);
    for (let index = 0; index < rawAssets.length; index++) {
      const asset = rawAssets[index];
      assetAssert(isRecord(asset), "INVALID_ASSET_DESCRIPTOR", `${path}[${index}] must be an object.`, {
        path: `${path}[${index}]`,
      });
      const assetId = asset.assetId ?? asset.id;
      assetAssert(typeof assetId === "string" && assetId.length > 0, "MISSING_ASSET_ID",
        `${path}[${index}].assetId must be a non-empty string.`, { path: `${path}[${index}].assetId` });
      assetAssert(table[assetId] === undefined, "DUPLICATE_ASSET_ID",
        `Asset id "${assetId}" is declared more than once.`, { path: `${path}[${index}].assetId` });
      table[assetId] = asset;
    }
    return table;
  }
  assetAssert(isRecord(rawAssets), "INVALID_ASSET_TABLE", `${path} must be an object or array.`, { path });
  return rawAssets;
}

function normalizeLods(assetId, descriptor, baseUrl) {
  let rawLods = descriptor.lods;
  if (isRecord(rawLods)) {
    rawLods = Object.entries(rawLods).map(([id, value]) => typeof value === "string"
      ? { id, source: value }
      : { id, ...value });
  }
  if (rawLods === undefined) {
    const sources = descriptor.sources;
    if (Array.isArray(sources)) {
      rawLods = sources.map((source, index) => typeof source === "string"
        ? { id: `lod${index}`, source }
        : source);
    } else if (isRecord(sources)) {
      rawLods = Object.entries(sources).map(([id, source]) => typeof source === "string"
        ? { id, source }
        : { id, ...source });
    } else {
      const uri = descriptor.uri ?? descriptor.url ?? descriptor.src ?? descriptor.source ?? sources;
      rawLods = uri === undefined ? [] : [{ id: "default", source: uri, minProjectedPixelHeight: 0 }];
    }
  }
  assetAssert(Array.isArray(rawLods), "INVALID_LOD_TABLE",
    `assets.${assetId}.lods must be an array or object.`, { path: `assets.${assetId}.lods` });

  const ids = new Set();
  const normalized = rawLods.map((rawLod, index) => {
    const path = `assets.${assetId}.lods[${index}]`;
    assetAssert(isRecord(rawLod), "INVALID_LOD", `${path} must be an object.`, { path });
    const id = String(rawLod.id ?? rawLod.level ?? `lod${index}`);
    assetAssert(!ids.has(id), "DUPLICATE_LOD_ID", `${path}.id duplicates "${id}".`, { path: `${path}.id` });
    ids.add(id);
    const rawSource = rawLod.source ?? rawLod.uri ?? rawLod.url ?? rawLod.src
      ?? descriptor.source ?? descriptor.uri ?? descriptor.url ?? descriptor.src;
    const uriRef = sourceUri(rawSource);
    assetAssert(uriRef !== undefined, "MISSING_MODEL_URI", `${path} has no model URI.`, { path });
    const resolvedUri = resolveAssetSource(uriRef, baseUrl, `${path}.source.uri`);
    const uri = isRecord(rawSource) && !isProceduralSource(resolvedUri)
      ? sameOriginVersionedUrl(resolvedUri, baseUrl, "sha256", rawSource.sha256, `${path}.source.uri`)
      : resolvedUri;
    const source = Object.freeze(isRecord(rawSource) ? { ...rawSource, uri } : { uri });
    return Object.freeze({
      ...rawLod,
      id,
      level: rawLod.level ?? id,
      source,
      uri,
      minProjectedPixelHeight: lodMinimumPixelHeight(rawLod, path),
    });
  });
  normalized.sort((a, b) => b.minProjectedPixelHeight - a.minProjectedPixelHeight);
  return Object.freeze(normalized);
}

function normalizeSources(assetId, descriptor, baseUrl) {
  const rawSources = descriptor.sources ?? [];
  assetAssert(Array.isArray(rawSources), "INVALID_ASSET_SOURCES",
    `assets.${assetId}.sources must be an array.`, { path: `assets.${assetId}.sources` });
  return Object.freeze(rawSources.map((rawSource, index) => {
    const path = `assets.${assetId}.sources[${index}]`;
    const uriRef = sourceUri(rawSource);
    assetAssert(typeof uriRef === "string" && uriRef.length > 0, "MISSING_ASSET_SOURCE_URI",
      `${path} has no source URI.`, { path: `${path}.uri` });
    const resolvedUri = resolveAssetSource(uriRef, baseUrl, `${path}.uri`);
    const uri = isRecord(rawSource) && !isProceduralSource(resolvedUri)
      ? sameOriginVersionedUrl(resolvedUri, baseUrl, "sha256", rawSource.sha256, `${path}.uri`)
      : resolvedUri;
    return Object.freeze(isRecord(rawSource) ? { ...rawSource, uri } : { uri });
  }));
}

export function normalizeAssetManifest(rawManifest, options = {}) {
  assetAssert(isRecord(rawManifest), "INVALID_ASSET_MANIFEST", "Asset manifest must be a JSON object.");
  const rawAssets = normalizeAssetTable(rawManifest.assets, "assets");
  const assets = Object.create(null);
  for (const [assetId, rawDescriptor] of Object.entries(rawAssets)) {
    const path = `assets.${assetId}`;
    assetAssert(typeof assetId === "string" && assetId.length > 0, "MISSING_ASSET_ID",
      `${path} has an empty id.`, { path });
    assetAssert(isRecord(rawDescriptor), "INVALID_ASSET_DESCRIPTOR", `${path} must be an object.`, { path });
    const inferredKind = rawDescriptor.uri !== undefined || rawDescriptor.url !== undefined
      || rawDescriptor.src !== undefined || rawDescriptor.source !== undefined
      || rawDescriptor.sources !== undefined || rawDescriptor.lods !== undefined ? "gltf" : "procedural";
    const rawKind = String(rawDescriptor.kind ?? rawDescriptor.type ?? inferredKind).toLowerCase();
    const onlyFallback = rawDescriptor.status === "fallback_only"
      || rawDescriptor.fallback_only === true || rawDescriptor.fallbackOnly === true
      || rawKind === "fallback_only";
    const isModel = rawKind === "model" || rawKind === "gltf";
    const kind = isModel
      ? onlyFallback ? "procedural" : "gltf"
      : rawKind === "procedural" || rawKind === "fallback_only" ? "procedural" : rawKind;
    assetAssert(kind.length > 0, "UNSUPPORTED_ASSET_KIND",
      `${path}.kind must be a non-empty string.`, { path: `${path}.kind`, details: rawKind });
    const lods = kind === "gltf" ? normalizeLods(assetId, rawDescriptor, options.baseUrl) : Object.freeze([]);
    const sources = normalizeSources(assetId, rawDescriptor, options.baseUrl);
    assetAssert(kind !== "gltf" || lods.length > 0, "MISSING_LODS",
      `${path} must declare uri or lods.`, { path });
    const pluralFallback = Array.isArray(rawDescriptor.fallbacks)
      ? rawDescriptor.fallbacks.find((candidate) => {
        const uri = sourceUri(candidate);
        return candidate?.type === "procedural" || candidate?.type === "fallback_only"
          || isProceduralSource(uri);
      }) ?? rawDescriptor.fallbacks[0]
      : undefined;
    const fallbackCandidate = rawDescriptor.fallback ?? pluralFallback;
    const rawFallback = isRecord(fallbackCandidate)
      ? sourceUri(fallbackCandidate) ?? fallbackCandidate.id
      : fallbackCandidate;
    const directUri = sourceUri(rawDescriptor.source ?? rawDescriptor.uri ?? rawDescriptor.url ?? rawDescriptor.src);
    const directProcedural = isProceduralSource(directUri) ? directUri : undefined;
    const fallback = rawFallback === false || rawFallback === null
      ? null
      : String(rawFallback ?? rawDescriptor.fallbackFactory ?? directProcedural ?? assetId);
    const fallbackDeclared = fallback !== null && (fallbackCandidate !== undefined
      || rawDescriptor.fallbackFactory !== undefined || directProcedural !== undefined);
    assets[assetId] = Object.freeze({
      ...rawDescriptor,
      id: assetId,
      kind,
      resourceKind: rawKind,
      fallback,
      fallbackDeclared,
      lods,
      sources,
    });
  }
  return Object.freeze({
    ...rawManifest,
    id: String(rawManifest.manifestId ?? rawManifest.id ?? options.defaultId ?? "manifest"),
    assets: Object.freeze(assets),
  });
}

export function normalizeVisualProfile(rawProfile = {}, options = {}) {
  assetAssert(isRecord(rawProfile), "INVALID_VISUAL_PROFILE", "Visual profile must be a JSON object.");
  const profileBody = isRecord(rawProfile.assetProfile) ? rawProfile.assetProfile : rawProfile;
  const rawMappings = profileBody.assets ?? profileBody.aliases ?? profileBody.assetAliases ?? {};
  assetAssert(isRecord(rawMappings), "INVALID_PROFILE_ASSETS",
    "Visual profile assets/aliases must be an object.", { path: "assets" });
  const assets = Object.create(null);
  for (const [role, mapping] of Object.entries(rawMappings)) {
    if (typeof mapping === "string") {
      assets[role] = Object.freeze({ assetId: mapping });
      continue;
    }
    assetAssert(isRecord(mapping), "INVALID_PROFILE_MAPPING",
      `Visual profile mapping "${role}" must be a string or object.`, { path: `assets.${role}` });
    const assetId = mapping.assetId ?? mapping.asset ?? mapping.id;
    assetAssert(typeof assetId === "string" && assetId.length > 0, "MISSING_PROFILE_ASSET_ID",
      `Visual profile mapping "${role}" has no assetId.`, { path: `assets.${role}` });
    assets[role] = Object.freeze({ ...mapping, assetId });
  }
  const bindings = profileBody.bindings ?? [];
  assetAssert(Array.isArray(bindings), "INVALID_PROFILE_BINDINGS",
    "Visual profile assetProfile.bindings must be an array.", { path: "assetProfile.bindings" });
  for (let index = 0; index < bindings.length; index++) {
    const binding = bindings[index];
    const path = `assetProfile.bindings[${index}]`;
    assetAssert(isRecord(binding), "INVALID_PROFILE_BINDING", `${path} must be an object.`, { path });
    const role = binding.presentationId ?? binding.role ?? binding.slot ?? binding.binding
      ?? binding.semantic ?? binding.name ?? binding.id;
    assetAssert(typeof role === "string" && role.length > 0, "MISSING_PROFILE_BINDING_ROLE",
      `${path} must declare role/slot/binding/name/id.`, { path });
    assetAssert(typeof binding.assetId === "string" && binding.assetId.length > 0,
      "MISSING_PROFILE_ASSET_ID", `${path}.assetId must be a non-empty string.`, { path: `${path}.assetId` });
    assets[role] = Object.freeze({ ...binding, assetId: binding.assetId });
  }
  const rawScale = profileBody.lodPixelHeightScale ?? profileBody.lodScale ?? profileBody.lodBias ?? 1;
  const lodPixelHeightScale = Number(rawScale);
  assetAssert(Number.isFinite(lodPixelHeightScale) && lodPixelHeightScale > 0, "INVALID_LOD_SCALE",
    "Visual profile lodPixelHeightScale must be a finite number > 0.", { details: rawScale });
  return Object.freeze({
    ...rawProfile,
    id: String(rawProfile.profileId ?? rawProfile.id ?? profileBody.profileId
      ?? profileBody.id ?? options.defaultId ?? "default"),
    lodPixelHeightScale,
    assets: Object.freeze(assets),
  });
}

function selectProfileReference(rawPack, options) {
  if (options.visualProfile !== undefined) return options.visualProfile;
  const presentationProfiles = rawPack.presentation?.profiles;
  if (Array.isArray(presentationProfiles) && presentationProfiles.length > 0) {
    const wanted = options.profileId ?? rawPack.presentation.defaultPresentationProfileId
      ?? rawPack.presentation.defaultProfileId
      ?? rawPack.presentation.defaultProfile ?? rawPack.defaultProfileId;
    const selected = wanted === undefined
      ? presentationProfiles.find((candidate) => candidate?.default === true) ?? presentationProfiles[0]
      : presentationProfiles.find((candidate) => candidate?.profileId === wanted
        || candidate?.presentationProfileId === wanted || candidate?.id === wanted);
    assetAssert(selected, "UNKNOWN_VISUAL_PROFILE", `Presentation profile "${String(wanted)}" was not found.`);
    const reference = selected.visualProfile ?? selected.profile ?? selected;
    return jsonReference(reference);
  }
  if (rawPack.visualProfile !== undefined) return rawPack.visualProfile;
  if (rawPack.assetProfile !== undefined) return rawPack.assetProfile;
  if (rawPack.profile !== undefined) return rawPack.profile;
  const profiles = rawPack.profiles;
  if (profiles === undefined) return {};
  const wanted = options.profileId ?? rawPack.defaultProfile;
  if (Array.isArray(profiles)) {
    const selected = wanted === undefined
      ? profiles[0]
      : profiles.find((profile) => profile?.id === wanted || profile?.name === wanted);
    assetAssert(selected !== undefined, "UNKNOWN_VISUAL_PROFILE", `Visual profile "${wanted}" was not found.`);
    return selected.url ?? selected.src ?? selected.profile ?? selected;
  }
  assetAssert(isRecord(profiles), "INVALID_PROFILE_TABLE", "Pack profiles must be an object or array.");
  const key = wanted ?? Object.keys(profiles)[0];
  assetAssert(key !== undefined && profiles[key] !== undefined, "UNKNOWN_VISUAL_PROFILE",
    `Visual profile "${String(key)}" was not found.`);
  return profiles[key];
}

function selectManifestReference(rawPack, rawProfile, options) {
  if (options.manifest !== undefined) return jsonReference(options.manifest);
  const canonical = rawProfile.assetProfile?.manifest;
  if (canonical !== undefined) return jsonReference(canonical);
  if (rawProfile.manifest !== undefined) return jsonReference(rawProfile.manifest);
  if (rawPack.manifest !== undefined) return jsonReference(rawPack.manifest);
  if (rawPack.assetManifest !== undefined) return jsonReference(rawPack.assetManifest);
  if (rawPack.assets !== undefined) return rawPack;
  return undefined;
}

export class AssetInstance {
  constructor(metadata, release) {
    Object.assign(this, metadata);
    this._release = release;
    this._released = false;
    this._releasePromise = null;
  }

  get released() {
    return this._released;
  }

  release() {
    if (this._releasePromise) return this._releasePromise;
    this._released = true;
    try {
      this._releasePromise = Promise.resolve(this._release(this));
    } catch (error) {
      this._releasePromise = Promise.reject(error);
    }
    return this._releasePromise;
  }

  dispose() {
    return this.release();
  }
}

export class AssetRegistry {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.loadModel = options.loadModel || options.modelLoader
      ? createGltfLoaderAdapter(options.loadModel ?? options.modelLoader)
      : null;
    this.cloneScene = options.cloneScene ?? cloneStaticGltfScene;
    this.disposeModelSource = options.disposeModelSource ?? disposeGltfSource;
    this.cloneMaterials = options.cloneMaterials !== false;
    this.logger = options.logger ?? null;
    this._fallbackFactories = new Map();
    this._packs = new Map();
    this._activePack = null;
    this._modelCache = new Map();
    this._instances = new Set();
    this._pendingReleases = new Set();
    this._pendingModelDisposals = new Set();
    this._disposed = false;
    this._disposePromise = null;

    const factories = options.fallbackFactories ?? {};
    if (factories instanceof Map) {
      for (const [key, factory] of factories) this.registerFallbackFactory(key, factory);
    } else {
      for (const [key, factory] of Object.entries(factories)) this.registerFallbackFactory(key, factory);
    }
  }

  get activePack() {
    return this._activePack;
  }

  get disposed() {
    return this._disposed;
  }

  registerFallbackFactory(key, factory) {
    this._assertUsable();
    assetAssert(typeof key === "string" && key.length > 0, "INVALID_FALLBACK_KEY",
      "Fallback factory key must be a non-empty string.");
    assetAssert(typeof factory === "function", "INVALID_FALLBACK_FACTORY",
      `Fallback factory "${key}" must be a function.`);
    this._fallbackFactories.set(key, factory);
    return this;
  }

  unregisterFallbackFactory(key) {
    return this._fallbackFactories.delete(key);
  }

  async loadManifest(input, options = {}) {
    this._assertUsable();
    const resource = await this._readJson(input, options.baseUrl ?? this.baseUrl, "asset manifest");
    this._assertUsable();
    return normalizeAssetManifest(resource.value, {
      baseUrl: resource.sourceUrl ?? options.baseUrl ?? this.baseUrl,
      defaultId: options.defaultId,
    });
  }

  async loadVisualProfile(input, options = {}) {
    this._assertUsable();
    const resource = await this._readJson(input, options.baseUrl ?? this.baseUrl, "visual profile");
    this._assertUsable();
    return normalizeVisualProfile(resource.value, { defaultId: options.defaultId });
  }

  async loadPack(input, options = {}) {
    this._assertUsable();
    const packResource = await this._readJson(input, options.baseUrl ?? this.baseUrl, "asset pack");
    this._assertUsable();
    const rawPack = packResource.value;
    assetAssert(isRecord(rawPack), "INVALID_ASSET_PACK", "Asset pack must be a JSON object.");
    const packBase = packResource.sourceUrl ?? options.baseUrl ?? this.baseUrl;
    const profileRef = jsonReference(selectProfileReference(rawPack, options));
    const versionedProfileRef = typeof profileRef === "string"
      ? sameOriginVersionedUrl(profileRef, packBase, "packVersion",
        String(rawPack.packVersion ?? rawPack.version ?? ""), "visual profile")
      : profileRef;
    const profileResource = await this._readJson(versionedProfileRef, packBase, "visual profile");
    this._assertUsable();
    const manifestRef = selectManifestReference(rawPack, profileResource.value, options);
    assetAssert(manifestRef !== undefined, "MISSING_ASSET_MANIFEST",
      "Visual profile assetProfile.manifest or the asset pack must reference an asset manifest.");
    const profileBase = profileResource.sourceUrl ?? packBase;
    const manifestJsonRef = jsonReference(manifestRef);
    const profileVersion = String(profileResource.value.profileVersion
      ?? profileResource.value.version ?? "");
    const packVersion = String(rawPack.packVersion ?? rawPack.version ?? "");
    const packVersionedManifestRef = typeof manifestJsonRef === "string"
      ? sameOriginVersionedUrl(manifestJsonRef, profileBase, "packVersion", packVersion,
        "asset manifest")
      : manifestJsonRef;
    const versionedManifestRef = typeof packVersionedManifestRef === "string"
      ? sameOriginVersionedUrl(packVersionedManifestRef, profileBase, "profileVersion", profileVersion,
        "asset manifest")
      : packVersionedManifestRef;
    const manifestResource = await this._readJson(versionedManifestRef, profileBase, "asset manifest");
    this._assertUsable();
    const packId = String(rawPack.packId ?? rawPack.id ?? options.defaultId ?? "default");
    const manifest = normalizeAssetManifest(manifestResource.value, {
      baseUrl: manifestResource.sourceUrl ?? packBase,
      defaultId: `${packId}-manifest`,
    });
    const profile = normalizeVisualProfile(profileResource.value, {
      defaultId: options.profileId ?? `${packId}-default`,
    });
    const pack = Object.freeze({
      ...rawPack,
      id: packId,
      packId,
      manifest,
      profile,
      sourceUrl: packResource.sourceUrl,
    });
    this._packs.set(packId, pack);
    if (options.activate !== false) this._activePack = pack;
    return pack;
  }

  activatePack(packOrId) {
    this._assertUsable();
    const pack = this._resolvePack(packOrId);
    this._activePack = pack;
    return pack;
  }

  getAssetDescriptor(assetOrRole, options = {}) {
    const resolved = this._resolveAsset(assetOrRole, options);
    return resolved.descriptor;
  }

  selectLod(assetOrRole, projectedPixelHeight, options = {}) {
    const resolved = this._resolveAsset(assetOrRole, options);
    assetAssert(resolved.descriptor.kind === "gltf", "ASSET_HAS_NO_LODS",
      `Asset "${resolved.assetId}" has kind "${resolved.descriptor.kind}" and no model LODs.`);
    const optionScale = options.pixelHeightScale === undefined ? 1 : Number(options.pixelHeightScale);
    const mappingScale = resolved.mapping?.lodPixelHeightScale === undefined
      ? 1 : Number(resolved.mapping.lodPixelHeightScale);
    const selectionOptions = {
      pixelHeightScale: resolved.profile.lodPixelHeightScale * mappingScale * optionScale,
      hysteresis: options.hysteresis,
    };
    if (options.lodState && typeof options.lodState.select === "function") {
      return options.lodState.select(resolved.descriptor.lods, projectedPixelHeight, selectionOptions);
    }
    if (options.currentLod !== undefined && options.currentLod !== null) {
      return selectLodWithHysteresis(resolved.descriptor.lods, projectedPixelHeight,
        options.currentLod, selectionOptions);
    }
    return selectLodByProjectedPixelHeight(resolved.descriptor.lods, projectedPixelHeight, selectionOptions);
  }

  async preload(assetOrRole, options = {}) {
    this._assertUsable();
    const resolved = this._resolveAsset(assetOrRole, options);
    if (resolved.descriptor.kind !== "gltf") return null;
    const lod = this.selectLod(assetOrRole, options.projectedPixelHeight, options);
    if (isProceduralSource(lod.uri)) return null;
    const entry = this._getModelEntry(lod.uri, { ...resolved, lod });
    entry.claims++;
    try {
      const gltf = await entry.promise;
      this._assertUsable();
      return gltf;
    } finally {
      entry.claims--;
      this._maybeDisposeEntry(entry);
    }
  }

  async instantiate(assetOrRole, options = {}) {
    this._assertUsable();
    const resolved = this._resolveAsset(assetOrRole, options);
    const descriptor = resolved.descriptor;
    if (descriptor.kind === "procedural") {
      return this._instantiateFallback(resolved, options, null);
    }
    if (descriptor.kind !== "gltf") {
      const mappingDeclaresFallback = Object.prototype.hasOwnProperty.call(resolved.mapping ?? {}, "fallback")
        && resolved.mapping.fallback !== null && resolved.mapping.fallback !== false;
      const fallbackDeclared = mappingDeclaresFallback || descriptor.fallbackDeclared === true;
      const fallbackResolution = this._resolveFallback(resolved, options, true);
      if (fallbackDeclared && fallbackResolution.factory) {
        return this._instantiateFallback(resolved, options, null, null, fallbackResolution);
      }
      const fallbackMessage = fallbackDeclared
        ? `its declared procedural fallback "${String(fallbackResolution.fallbackKey)}" has no registered factory`
        : "it does not declare a procedural fallback";
      throw new AssetPipelineError("UNSUPPORTED_ASSET_KIND",
        `Asset "${resolved.assetId}" has unsupported runtime kind "${descriptor.kind}"; ${fallbackMessage}.`, {
          details: {
            assetId: resolved.assetId,
            kind: descriptor.kind,
            fallbackDeclared,
            fallbackKey: fallbackResolution.fallbackKey,
          },
        });
    }

    const lod = this.selectLod(assetOrRole, options.projectedPixelHeight, options);
    if (isProceduralSource(lod.uri)) {
      return this._instantiateFallback(resolved, { ...options, fallbackKey: lod.uri }, null, lod);
    }
    try {
      return await this._instantiateGltf(resolved, lod, options);
    } catch (error) {
      if (options.allowFallback === false) throw error;
      return this._instantiateFallback(resolved, options, error, lod);
    }
  }

  release(instance) {
    assetAssert(instance instanceof AssetInstance, "INVALID_ASSET_INSTANCE",
      "release() expects an AssetInstance returned by this registry.");
    return instance.release();
  }

  cacheStats() {
    let loading = 0;
    let ready = 0;
    let references = 0;
    for (const entry of this._modelCache.values()) {
      if (entry.status === "loading") loading++;
      if (entry.status === "ready") ready++;
      references += entry.references;
    }
    return Object.freeze({
      entries: this._modelCache.size,
      loading,
      ready,
      references,
      instances: this._instances.size,
    });
  }

  async clearModelCache() {
    const entries = [...this._modelCache.values()];
    for (const entry of entries) {
      entry.disposeWhenUnused = true;
      this._maybeDisposeEntry(entry);
    }
    await Promise.allSettled(entries.map(async (entry) => {
      await entry.promise.catch(() => undefined);
      this._maybeDisposeEntry(entry);
      if (entry.disposalPromise) await entry.disposalPromise;
    }));
    await this._drainPendingModelDisposals();
  }

  dispose() {
    if (this._disposePromise) return this._disposePromise;
    this._disposed = true;
    this._disposePromise = (async () => {
      const releases = [...this._instances].map((instance) => {
        try {
          return instance.release();
        } catch (error) {
          this.logger?.warn?.("Asset instance release failed during registry disposal.", error);
          return undefined;
        }
      });
      await Promise.allSettled(releases.map((release) => Promise.resolve(release)));
      await this._drainPendingReleases();
      await this.clearModelCache();
      this._packs.clear();
      this._activePack = null;
      this._fallbackFactories.clear();
    })();
    return this._disposePromise;
  }

  async _readJson(input, baseUrl, label) {
    if (typeof input !== "string") {
      assetAssert(isRecord(input), "INVALID_JSON_RESOURCE", `${label} must be a URL or JSON object.`);
      return { value: input, sourceUrl: null };
    }
    const sourceUrl = resolveUrl(input, baseUrl, label);
    try {
      const value = await this.fetchJson(sourceUrl);
      assetAssert(isRecord(value), "INVALID_JSON_RESOURCE", `${label} at ${sourceUrl} is not a JSON object.`);
      return { value, sourceUrl };
    } catch (error) {
      throw asAssetPipelineError(error, "JSON_FETCH_FAILED", `Failed to load ${label} from ${sourceUrl}.`, {
        details: { sourceUrl, label },
      });
    }
  }

  _resolvePack(packOrId) {
    if (isRecord(packOrId) && packOrId.manifest && packOrId.profile) return packOrId;
    if (typeof packOrId === "string") {
      const pack = this._packs.get(packOrId);
      assetAssert(pack, "UNKNOWN_ASSET_PACK", `Asset pack "${packOrId}" is not loaded.`);
      return pack;
    }
    assetAssert(this._activePack, "NO_ACTIVE_ASSET_PACK", "Load or activate an asset pack first.");
    return this._activePack;
  }

  _resolveAsset(assetOrRole, options) {
    this._assertUsable();
    assetAssert(typeof assetOrRole === "string" && assetOrRole.length > 0, "INVALID_ASSET_ID",
      "Asset id or profile role must be a non-empty string.");
    const pack = this._resolvePack(options.pack);
    const profile = options.profile ? normalizeVisualProfile(options.profile) : pack.profile;
    const mapping = profile.assets[assetOrRole] ?? null;
    const assetId = mapping?.assetId ?? assetOrRole;
    const descriptor = pack.manifest.assets[assetId];
    assetAssert(descriptor, "UNKNOWN_ASSET", `Asset "${assetId}" is not declared by pack "${pack.id}".`, {
      details: { requested: assetOrRole, assetId, packId: pack.id },
    });
    return { requested: assetOrRole, assetId, descriptor, mapping, profile, pack };
  }

  _getModelEntry(uri, context) {
    let entry = this._modelCache.get(uri);
    if (entry && entry.disposed !== true) return entry;
    assetAssert(this.loadModel, "MODEL_LOADER_UNAVAILABLE",
      `No model loader is configured for glTF asset ${context.assetId}.`);
    entry = {
      uri,
      status: "loading",
      gltf: null,
      references: 0,
      claims: 0,
      disposed: false,
      disposeWhenUnused: false,
      disposalPromise: null,
      promise: null,
    };
    entry.promise = Promise.resolve()
      .then(() => this.loadModel(uri, context))
      .then((gltf) => {
        assetAssert(gltf && typeof gltf === "object", "INVALID_GLTF",
          `Model loader returned no glTF object for ${uri}.`);
        entry.gltf = gltf;
        entry.status = "ready";
        this._maybeDisposeEntry(entry);
        return gltf;
      })
      .catch((error) => {
        entry.status = "failed";
        if (this._modelCache.get(uri) === entry) this._modelCache.delete(uri);
        throw asAssetPipelineError(error, "MODEL_LOAD_FAILED", `Failed to load glTF model ${uri}.`, {
          details: { uri, assetId: context.assetId },
        });
      });
    this._modelCache.set(uri, entry);
    return entry;
  }

  async _instantiateGltf(resolved, lod, options) {
    const entry = this._getModelEntry(lod.uri, { ...resolved, lod });
    entry.claims++;
    let transferred = false;
    let sourceReferenceAcquired = false;
    let cloneResult = null;
    try {
      const gltf = await entry.promise;
      assetAssert(!this._disposed, "ASSET_REGISTRY_DISPOSED", "AssetRegistry was disposed while loading a model.");
      const sourceScene = selectGltfScene(gltf, options.scene ?? lod.scene ?? resolved.descriptor.scene);
      cloneResult = await this.cloneScene(sourceScene, {
        gltf,
        descriptor: resolved.descriptor,
        lod,
        cloneMaterials: options.cloneMaterials ?? this.cloneMaterials,
      });
      cloneResult = normalizeSceneResult(cloneResult, ["ownedResources"]);
      assetAssert(cloneResult?.scene, "INVALID_SCENE_CLONE", "cloneScene returned no scene.");
      assetAssert(!this._disposed, "ASSET_REGISTRY_DISPOSED",
        "AssetRegistry was disposed while cloning a model instance.");
      entry.references++;
      sourceReferenceAcquired = true;
      const instance = this._registerInstance({
        ...resolved,
        scene: cloneResult.scene,
        lod,
        sourceUrl: lod.uri,
        fallback: false,
        ownedResources: cloneResult.ownedResources ?? [],
        sourceEntry: entry,
      });
      transferred = true;
      return instance;
    } catch (error) {
      if (cloneResult?.ownedResources) disposeResourceSet(cloneResult.ownedResources);
      if (sourceReferenceAcquired && !transferred) {
        entry.references = Math.max(0, entry.references - 1);
      }
      throw error;
    } finally {
      entry.claims--;
      if (!transferred) this._maybeDisposeEntry(entry);
    }
  }

  _resolveFallback(resolved, options, declaredOnly = false) {
    const fallbackReference = declaredOnly
      ? resolved.mapping?.fallback ?? (resolved.descriptor.fallbackDeclared
        ? resolved.descriptor.fallback
        : null)
      : options.fallbackKey ?? resolved.mapping?.fallback
        ?? resolved.descriptor.fallback ?? resolved.assetId;
    const fallbackKey = isRecord(fallbackReference)
      ? sourceUri(fallbackReference) ?? fallbackReference.id
      : fallbackReference;
    const fallbackDescriptor = isRecord(fallbackReference)
      ? fallbackReference
      : resolved.descriptor.fallbacks?.find((candidate) => {
        const candidateKey = isRecord(candidate) ? sourceUri(candidate) ?? candidate.id : candidate;
        return String(candidateKey) === String(fallbackKey);
      }) ?? null;
    const factory = fallbackKey === null ? null
      : this._fallbackFactories.get(String(fallbackKey)) ?? this._fallbackFactories.get("*");
    return { fallbackReference, fallbackKey, fallbackDescriptor, factory };
  }

  async _instantiateFallback(resolved, options, cause, lod = null, fallbackResolution = null) {
    const {
      fallbackKey,
      fallbackDescriptor,
      factory,
    } = fallbackResolution ?? this._resolveFallback(resolved, options);
    if (!factory) {
      if (cause) throw cause;
      throw new AssetPipelineError("FALLBACK_FACTORY_UNAVAILABLE",
        `No procedural fallback factory is registered for "${String(fallbackKey)}".`, {
          details: { assetId: resolved.assetId, fallbackKey },
        });
    }
    let result;
    try {
      result = await factory({
        registry: this,
        requested: resolved.requested,
        assetId: resolved.assetId,
        descriptor: resolved.descriptor,
        profile: resolved.profile,
        pack: resolved.pack,
        lod,
        fallback: fallbackDescriptor,
        parameters: fallbackDescriptor?.parameters ?? {},
        projectedPixelHeight: options.projectedPixelHeight,
        cause,
      });
    } catch (error) {
      throw asAssetPipelineError(error, "FALLBACK_FACTORY_FAILED",
        `Procedural fallback factory "${String(fallbackKey)}" failed.`, {
          details: { assetId: resolved.assetId, fallbackKey },
        });
    }
    const descriptor = normalizeSceneResult(result, ["ownedResources", "ownership", "dispose"]);
    if (!descriptor.scene || this._disposed) {
      try {
        await Promise.resolve(disposeInstancePayload({
          scene: descriptor.scene,
          ownedResources: descriptor.ownedResources,
          ownership: descriptor.ownership ?? "instance",
          customDispose: descriptor.dispose,
        }));
      } catch (error) {
        this.logger?.warn?.("Detached procedural fallback cleanup failed.", error);
      }
      assetAssert(descriptor.scene, "INVALID_FALLBACK_RESULT",
        `Procedural fallback factory "${String(fallbackKey)}" returned no scene.`);
      assetAssert(!this._disposed, "ASSET_REGISTRY_DISPOSED",
        "AssetRegistry was disposed while creating a procedural fallback.");
    }
    return this._registerInstance({
      ...resolved,
      scene: descriptor.scene,
      lod,
      sourceUrl: null,
      fallback: true,
      fallbackKey: String(fallbackKey),
      ownedResources: descriptor.ownedResources,
      ownership: descriptor.ownership ?? "instance",
      customDispose: descriptor.dispose,
      sourceEntry: null,
    });
  }

  _registerInstance(data) {
    const scene = data.scene;
    try {
      scene.userData = scene.userData ?? {};
      scene.userData.assetPipeline = {
        assetId: data.assetId,
        requested: data.requested,
        packId: data.pack.id,
        profileId: data.profile.id,
        lodId: data.lod?.id ?? null,
        fallback: data.fallback,
      };
    } catch {
      // Metadata is diagnostic only; frozen third-party nodes remain valid instances.
    }

    let instance;
    const release = () => {
      this._instances.delete(instance);
      let disposalResult;
      try {
        disposalResult = disposeInstancePayload(data, instance);
      } catch (error) {
        disposalResult = Promise.reject(error);
      } finally {
        if (data.sourceEntry) {
          data.sourceEntry.references = Math.max(0, data.sourceEntry.references - 1);
          this._maybeDisposeEntry(data.sourceEntry);
        }
      }
      return this._trackPendingRelease(disposalResult);
    };
    instance = new AssetInstance({
      scene,
      assetId: data.assetId,
      requestedAssetId: data.requested,
      packId: data.pack.id,
      profileId: data.profile.id,
      lod: data.lod,
      sourceUrl: data.sourceUrl,
      fallback: data.fallback,
      fallbackKey: data.fallbackKey ?? null,
    }, release);
    this._instances.add(instance);
    return instance;
  }

  _maybeDisposeEntry(entry) {
    if (!entry.disposeWhenUnused || entry.disposed || entry.status !== "ready"
      || entry.references > 0 || entry.claims > 0) return;
    entry.disposed = true;
    if (this._modelCache.get(entry.uri) === entry) this._modelCache.delete(entry.uri);
    const gltf = entry.gltf;
    entry.gltf = null;
    entry.disposalPromise = Promise.resolve()
      .then(() => this.disposeModelSource(gltf))
      .catch((error) => {
        this.logger?.warn?.(`Failed to dispose cached model ${entry.uri}.`, error);
      });
    this._pendingModelDisposals.add(entry.disposalPromise);
    entry.disposalPromise.then(
      () => this._pendingModelDisposals.delete(entry.disposalPromise),
      () => this._pendingModelDisposals.delete(entry.disposalPromise),
    );
  }

  _trackPendingRelease(result) {
    const releasePromise = Promise.resolve(result);
    this._pendingReleases.add(releasePromise);
    releasePromise.then(
      () => this._pendingReleases.delete(releasePromise),
      () => this._pendingReleases.delete(releasePromise),
    );
    return releasePromise;
  }

  async _drainPendingReleases() {
    while (this._pendingReleases.size > 0) {
      await Promise.allSettled([...this._pendingReleases]);
    }
  }

  async _drainPendingModelDisposals() {
    while (this._pendingModelDisposals.size > 0) {
      await Promise.allSettled([...this._pendingModelDisposals]);
    }
  }

  _assertUsable() {
    assetAssert(!this._disposed, "ASSET_REGISTRY_DISPOSED", "AssetRegistry has been disposed.");
  }
}
