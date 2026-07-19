export class AssetPipelineError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AssetPipelineError";
    this.code = code;
    if (options.path !== undefined) this.path = options.path;
    if (options.details !== undefined) this.details = options.details;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function assetAssert(condition, code, message, options) {
  if (!condition) throw new AssetPipelineError(code, message, options);
}

export function asAssetPipelineError(error, code, message, options = {}) {
  if (error instanceof AssetPipelineError) return error;
  return new AssetPipelineError(code, message, { ...options, cause: error });
}
