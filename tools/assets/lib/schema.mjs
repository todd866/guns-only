import path from "node:path";
import { readJson, walkFiles } from "./common.mjs";

function typeMatches(value, expected) {
  switch (expected) {
    case "null": return value === null;
    case "array": return Array.isArray(value);
    case "object": return value !== null && typeof value === "object" && !Array.isArray(value);
    case "integer": return Number.isInteger(value);
    case "number": return typeof value === "number" && Number.isFinite(value);
    default: return typeof value === expected;
  }
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pointerGet(root, pointer) {
  if (pointer === "" || pointer === "#") return root;
  const raw = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (!raw.startsWith("/")) return undefined;
  let value = root;
  for (const encoded of raw.slice(1).split("/")) {
    const key = decodeURIComponent(encoded).replaceAll("~1", "/").replaceAll("~0", "~");
    if (value === null || typeof value !== "object" || !(key in value)) return undefined;
    value = value[key];
  }
  return value;
}

export async function loadSchemas(schemaDirectory) {
  const schemas = {
    directory: path.resolve(schemaDirectory),
    byFile: new Map(),
    byId: new Map(),
    files: [],
  };
  const files = (await walkFiles(schemaDirectory))
    .filter((file) => file.endsWith(".schema.json"))
    .sort((a, b) => a.localeCompare(b, "en"));
  for (const file of files) {
    const schema = await readJson(file);
    const absolute = path.resolve(file);
    schemas.byFile.set(absolute, schema);
    schemas.files.push(absolute);
    if (typeof schema.$id === "string" && schema.$id) schemas.byId.set(schema.$id, { file: absolute, schema });
  }
  return schemas;
}

const MANIFEST_SCHEMA_NAMES = new Map([
  ["pack.json", ["pack.schema.json", "content-pack.schema.json"]],
  ["visual-profile.json", ["visual-profile.schema.json", "visuals.schema.json", "profile.schema.json"]],
  ["visuals.json", ["visual-profile.schema.json", "visuals.schema.json", "profiles.schema.json", "profile.schema.json"]],
  ["asset-manifest.json", ["asset-manifest.schema.json", "assets.schema.json"]],
  ["license-set.json", ["asset-license-set.schema.json", "license-set.schema.json", "licenses.schema.json", "license-manifest.schema.json"]],
  ["licenses.json", ["asset-license-set.schema.json", "license-set.schema.json", "licenses.schema.json", "license-manifest.schema.json"]],
]);

export function findSchemaForManifest(manifestFile, document, schemas) {
  if (typeof document?.$schema === "string") {
    const byId = schemas.byId.get(document.$schema);
    if (byId) return byId;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(document.$schema)) {
      const candidate = path.resolve(path.dirname(manifestFile), document.$schema.split("#", 1)[0]);
      const schema = schemas.byFile.get(candidate);
      if (schema) return { file: candidate, schema };
    }
  }

  const wanted = MANIFEST_SCHEMA_NAMES.get(path.basename(manifestFile)) ?? [];
  for (const name of wanted) {
    const file = schemas.files.find((candidate) => path.basename(candidate) === name);
    if (file) return { file, schema: schemas.byFile.get(file) };
  }
  return null;
}

function resolveRef(reference, context) {
  const hashIndex = reference.indexOf("#");
  const documentPart = hashIndex >= 0 ? reference.slice(0, hashIndex) : reference;
  const fragment = hashIndex >= 0 ? reference.slice(hashIndex) : "#";
  let file = context.schemaFile;
  let root = context.rootSchema;

  if (documentPart) {
    const byId = context.schemas.byId.get(documentPart);
    if (byId) {
      file = byId.file;
      root = byId.schema;
    } else {
      const target = path.resolve(path.dirname(context.schemaFile), documentPart);
      root = context.schemas.byFile.get(target);
      file = target;
    }
  }
  if (!root) return null;
  const schema = pointerGet(root, fragment);
  return schema === undefined ? null : { schema, file, root };
}

function childPath(base, key) {
  return typeof key === "number" ? `${base}[${key}]` : `${base}.${key}`;
}

function validateNode(value, schema, instancePath, context, errors, depth = 0) {
  if (depth > 128) {
    errors.push({ code: "schema.depth", path: instancePath, message: "schema recursion exceeded 128 levels" });
    return;
  }
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push({ code: "schema.false", path: instancePath, message: "value is disallowed by schema" });
    return;
  }
  if (schema === null || typeof schema !== "object") return;

  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(schema.$ref, context);
    if (!resolved) {
      errors.push({ code: "schema.ref", path: instancePath, message: `cannot resolve $ref '${schema.$ref}'` });
      return;
    }
    validateNode(value, resolved.schema, instancePath, {
      ...context,
      schemaFile: resolved.file,
      rootSchema: resolved.root,
    }, errors, depth + 1);
    return;
  }

  if (Array.isArray(schema.allOf)) {
    for (const candidate of schema.allOf) validateNode(value, candidate, instancePath, context, errors, depth + 1);
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.filter((candidate) => {
      const local = [];
      validateNode(value, candidate, instancePath, context, local, depth + 1);
      return local.length === 0;
    });
    if (matches.length === 0) errors.push({ code: "schema.anyOf", path: instancePath, message: "must match at least one anyOf branch" });
  }
  if (Array.isArray(schema.oneOf)) {
    const count = schema.oneOf.reduce((sum, candidate) => {
      const local = [];
      validateNode(value, candidate, instancePath, context, local, depth + 1);
      return sum + (local.length === 0 ? 1 : 0);
    }, 0);
    if (count !== 1) errors.push({ code: "schema.oneOf", path: instancePath, message: `must match exactly one oneOf branch (matched ${count})` });
  }
  if (schema.not !== undefined) {
    const local = [];
    validateNode(value, schema.not, instancePath, context, local, depth + 1);
    if (local.length === 0) errors.push({ code: "schema.not", path: instancePath, message: "must not match the disallowed schema" });
  }
  if (schema.if !== undefined) {
    const local = [];
    validateNode(value, schema.if, instancePath, context, local, depth + 1);
    const branch = local.length === 0 ? schema.then : schema.else;
    if (branch !== undefined) validateNode(value, branch, instancePath, context, errors, depth + 1);
  }

  if (schema.const !== undefined && !equalJson(value, schema.const)) {
    errors.push({ code: "schema.const", path: instancePath, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => equalJson(value, item))) {
    errors.push({ code: "schema.enum", path: instancePath, message: `must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}` });
  }

  const types = schema.type === undefined ? [] : (Array.isArray(schema.type) ? schema.type : [schema.type]);
  if (types.length && !types.some((expected) => typeMatches(value, expected))) {
    errors.push({ code: "schema.type", path: instancePath, message: `must be ${types.join(" or ")}` });
    return;
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      errors.push({ code: "schema.minLength", path: instancePath, message: `must contain at least ${schema.minLength} characters` });
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      errors.push({ code: "schema.maxLength", path: instancePath, message: `must contain at most ${schema.maxLength} characters` });
    }
    if (typeof schema.pattern === "string") {
      let pattern;
      try { pattern = new RegExp(schema.pattern, "u"); } catch { pattern = null; }
      if (pattern && !pattern.test(value)) errors.push({ code: "schema.pattern", path: instancePath, message: `must match /${schema.pattern}/` });
    }
    if (schema.format === "uri" || schema.format === "uri-reference") {
      try { new URL(value, schema.format === "uri-reference" ? "https://example.invalid/" : undefined); }
      catch { errors.push({ code: "schema.format", path: instancePath, message: `must be a valid ${schema.format}` }); }
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push({ code: "schema.minimum", path: instancePath, message: `must be >= ${schema.minimum}` });
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push({ code: "schema.maximum", path: instancePath, message: `must be <= ${schema.maximum}` });
    if (Number.isFinite(schema.exclusiveMinimum) && value <= schema.exclusiveMinimum) errors.push({ code: "schema.exclusiveMinimum", path: instancePath, message: `must be > ${schema.exclusiveMinimum}` });
    if (Number.isFinite(schema.exclusiveMaximum) && value >= schema.exclusiveMaximum) errors.push({ code: "schema.exclusiveMaximum", path: instancePath, message: `must be < ${schema.exclusiveMaximum}` });
    if (Number.isFinite(schema.multipleOf) && schema.multipleOf > 0) {
      const quotient = value / schema.multipleOf;
      if (Math.abs(quotient - Math.round(quotient)) > 1e-10) errors.push({ code: "schema.multipleOf", path: instancePath, message: `must be a multiple of ${schema.multipleOf}` });
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push({ code: "schema.minItems", path: instancePath, message: `must contain at least ${schema.minItems} items` });
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) errors.push({ code: "schema.maxItems", path: instancePath, message: `must contain at most ${schema.maxItems} items` });
    if (schema.uniqueItems === true) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) errors.push({ code: "schema.uniqueItems", path: instancePath, message: "must contain unique items" });
    }
    if (Array.isArray(schema.prefixItems)) {
      schema.prefixItems.forEach((candidate, index) => {
        if (index < value.length) validateNode(value[index], candidate, childPath(instancePath, index), context, errors, depth + 1);
      });
    }
    if (schema.items && !Array.isArray(schema.items)) {
      value.forEach((item, index) => validateNode(item, schema.items, childPath(instancePath, index), context, errors, depth + 1));
    }
    if (schema.contains !== undefined) {
      const count = value.reduce((sum, item, index) => {
        const local = [];
        validateNode(item, schema.contains, childPath(instancePath, index), context, local, depth + 1);
        return sum + (local.length === 0 ? 1 : 0);
      }, 0);
      const minimum = Number.isInteger(schema.minContains) ? schema.minContains : 1;
      const maximum = Number.isInteger(schema.maxContains) ? schema.maxContains : Infinity;
      if (count < minimum || count > maximum) errors.push({ code: "schema.contains", path: instancePath, message: `must contain ${minimum}..${maximum === Infinity ? "∞" : maximum} matching items` });
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) errors.push({ code: "schema.required", path: instancePath, message: `missing required property '${key}'` });
      }
    }
    for (const [key, candidate] of Object.entries(properties)) {
      if (key in value) validateNode(value[key], candidate, childPath(instancePath, key), context, errors, depth + 1);
    }
    const patterns = Object.entries(schema.patternProperties ?? {}).map(([pattern, candidate]) => [new RegExp(pattern, "u"), candidate]);
    for (const [key, item] of Object.entries(value)) {
      const matchingPatterns = patterns.filter(([pattern]) => pattern.test(key));
      for (const [, candidate] of matchingPatterns) validateNode(item, candidate, childPath(instancePath, key), context, errors, depth + 1);
      if (!(key in properties) && matchingPatterns.length === 0) {
        if (schema.additionalProperties === false) errors.push({ code: "schema.additionalProperties", path: childPath(instancePath, key), message: "additional property is not allowed" });
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateNode(item, schema.additionalProperties, childPath(instancePath, key), context, errors, depth + 1);
      }
    }
    if (schema.propertyNames) {
      for (const key of Object.keys(value)) validateNode(key, schema.propertyNames, childPath(instancePath, key), context, errors, depth + 1);
    }
    for (const [key, required] of Object.entries(schema.dependentRequired ?? {})) {
      if (!(key in value) || !Array.isArray(required)) continue;
      for (const dependency of required) {
        if (!(dependency in value)) errors.push({ code: "schema.dependentRequired", path: instancePath, message: `'${key}' requires property '${dependency}'` });
      }
    }
  }
}

export function validateSchema(document, schemaRecord, schemas) {
  const errors = [];
  validateNode(document, schemaRecord.schema, "$", {
    schemas,
    schemaFile: schemaRecord.file,
    rootSchema: schemaRecord.schema,
  }, errors);
  return errors;
}
