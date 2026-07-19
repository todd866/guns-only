import { loadKoreaGunEffects } from "../effects/korea_gun_effects.js";
import { loadKoreaEnvironment } from "../environment/korea_environment.js";

function packResourceUrl(relativePath, profileUrl, packVersion) {
  const url = new URL(relativePath, profileUrl);
  if (typeof packVersion === "string" && packVersion.length > 0) {
    url.searchParams.set("packVersion", packVersion);
  }
  return url.href;
}

/**
 * Bridge the Korea pack's authored environment into VisualRuntime's adapter contract. The
 * adapter owns only renderer resources: camera position and presentation time are consumed as
 * inputs and no simulation state is mutated.
 */
export function createKoreaEnvironmentFactory(THREE, options = {}) {
  const loadEnvironment = options.loadEnvironment ?? loadKoreaEnvironment;
  return async (context) => {
    const profileUrl = options.profileUrl ?? context.profileUrl;
    const tierId = context.qualityTier?.id ?? context.qualityTier;
    const requestedAnisotropy = Number(context.qualityTier?.settings?.anisotropy) || 1;
    const maximumAnisotropy = Number(context.renderer?.capabilities?.getMaxAnisotropy?.()) || 1;
    const fog = context.config?.environment?.fog ?? {};
    const environment = await loadEnvironment(THREE, {
      qualityTier: tierId,
      anisotropy: Math.min(requestedAnisotropy, maximumAnisotropy),
      fogColor: fog.color,
      fogNear: fog.nearMetres,
      fogFar: fog.farMetres,
      oceanUrl: packResourceUrl(
        "environment/ocean.material.json", profileUrl, options.packVersion,
      ),
      atmosphereUrl: packResourceUrl(
        "environment/atmosphere.material.json", profileUrl, options.packVersion,
      ),
      fetch: options.fetch,
    });
    context.scene.add(environment.group);
    let disposed = false;
    const adapter = {
      sourceId: "environment.korea-1950s.pack.v1",
      environment,
      update(frame, nextContext) {
        if (disposed) return;
        environment.update({
          timeSeconds: frame.elapsedSeconds,
          cameraPosition: nextContext.camera.position,
          sunDirection: typeof options.sunDirection === "function"
            ? options.sunDirection(frame, nextContext)
            : options.sunDirection,
        });
      },
      diagnostics() {
        return Object.freeze({
          sourceId: adapter.sourceId,
          qualityTier: tierId,
          cloudLayers: environment.clouds?.length ?? 0,
          disposed,
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        environment.dispose();
        options.onDeactivated?.(adapter, context);
      },
    };
    options.onActivated?.(adapter, context);
    return adapter;
  };
}

/** Translate VisualRuntime effect dispatches into the pack-local Korea effects implementation. */
export function createKoreaEffectsFactory(THREE, options = {}) {
  const loadEffects = options.loadEffects ?? loadKoreaGunEffects;
  return async (context) => {
    const profileUrl = options.profileUrl ?? context.profileUrl;
    const tierId = context.qualityTier?.id ?? context.qualityTier;
    const effects = await loadEffects(THREE, {
      qualityTier: tierId,
      profileUrl: packResourceUrl(
        "effects/guns.effects.json", profileUrl, options.packVersion,
      ),
      fetch: options.fetch,
    });
    context.scene.add(effects.group);
    let disposed = false;
    const adapter = {
      sourceId: "effects.korea-1950s.guns.v1",
      effects,
      handleEvent({ eventId, payload }) {
        if (disposed || !effects.profile?.events?.[eventId]) return false;
        effects.emit(eventId, payload);
        return true;
      },
      update(frame) {
        if (!disposed) effects.update(frame.deltaSeconds);
      },
      clear() {
        if (!disposed) effects.clear();
      },
      diagnostics() {
        return Object.freeze({
          sourceId: adapter.sourceId,
          qualityTier: tierId,
          activeItems: effects.items?.length ?? 0,
          disposed,
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        effects.dispose();
        options.onDeactivated?.(adapter, context);
      },
    };
    options.onActivated?.(adapter, context);
    return adapter;
  };
}

export { packResourceUrl };
