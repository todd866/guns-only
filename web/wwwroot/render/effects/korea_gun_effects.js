const DEFAULT_PROFILE_URL = "../../content/packs/korea-1950s/effects/guns.effects.json";

function makeRng(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function randomRange(rng, range) {
  return range[0] + (range[1] - range[0]) * rng();
}

function asVector(THREE, value, fallback) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3(value[0], value[1], value[2]);
  return fallback.clone();
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Effects profile request failed: ${response.status} ${url}`);
  return response.json();
}

export async function loadKoreaGunEffects(THREE, options = {}) {
  const url = new URL(options.profileUrl ?? DEFAULT_PROFILE_URL, options.baseUrl ?? import.meta.url).href;
  return new KoreaGunEffects(THREE, await fetchJson(url, options.fetch ?? fetch), options);
}

export class KoreaGunEffects {
  constructor(THREE, profile, options = {}) {
    this.THREE = THREE;
    this.profile = profile;
    this.qualityTier = options.qualityTier ?? "balanced";
    this.quality = profile.qualityTiers[this.qualityTier] ?? profile.qualityTiers.balanced;
    this.group = new THREE.Group();
    this.group.name = "KOREA_GUN_EFFECTS_ROOT";
    this.items = [];
    // Combat effects are intentionally short lived, but the old path still created and disposed
    // a MeshBasicMaterial (and usually a Mesh/Group) for every tracer, spark, smoke puff and piece
    // of debris. A sustained gun pass therefore turned visual feedback into a shader/material GC
    // workload. Keep a small per-kind object pool and a hard active-item ceiling instead. The
    // geometry was already shared; this closes the rest of the hot allocation path without
    // changing deterministic emission counts or trajectories.
    this.maximumItems = Math.max(1, Math.floor(Number(options.maximumItems)
      || (96 * Math.max(0.5, Number(this.quality.particleMultiplier) || 1))));
    this.maximumDrawCalls = Math.max(1, Math.floor(Number(options.maximumDrawCalls)
      || (this.maximumItems + 12)));
    const requestedLightLimit = Number(options.maximumDynamicLights);
    this.maximumDynamicLights = Math.max(0, Math.floor(Number.isFinite(requestedLightLimit)
      ? requestedLightLimit
      : (this.quality.dynamicLights ? (this.qualityTier === "desktop" ? 4 : 2) : 0)));
    this.activeDrawCalls = 0;
    this.activeDynamicLights = 0;
    this.maximumPooledPerKind = Math.max(2, Math.floor(
      Number(options.maximumPooledPerKind) || 32,
    ));
    this.pools = new Map();
    this.poolStats = {
      created: 0,
      reused: 0,
      evicted: 0,
      dropped: 0,
      peakActive: 0,
      peakDrawCalls: 0,
    };
    this.disposed = false;
    this.geometries = {
      flash: new THREE.ConeGeometry(1, 1, 10, 1, true),
      tracer: new THREE.CylinderGeometry(1, 0.55, 1, 7, 1, true),
      sphere: new THREE.IcosahedronGeometry(1, 2),
      spark: new THREE.TetrahedronGeometry(1, 0),
      debris: new THREE.TetrahedronGeometry(1, 0),
      wake: new THREE.PlaneGeometry(1, 1, 1, 10),
    };
  }

  emit(eventId, payload = {}) {
    if (this.disposed) return;
    if (eventId === "event.weapon.gun-fire.v1") this.#gunFire(payload);
    else if (eventId === "event.weapon.gun-impact.v1") this.#impact(payload);
    else if (eventId === "event.vehicle.destroyed.v1") this.#destroyed(payload);
    else if (eventId === "event.platform.wake.v1") this.#wake(payload);
  }

  update(deltaSeconds) {
    if (this.disposed) return;
    const delta = Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0));
    for (let index = this.items.length - 1; index >= 0; index--) {
      const item = this.items[index];
      item.age += delta;
      const phase = Math.min(1, item.age / item.lifetime);
      if (item.velocity) {
        item.mesh.position.addScaledVector(item.velocity, delta);
        item.velocity.y -= (item.gravity ?? 0) * delta;
      }
      if (item.spin) {
        item.mesh.rotation.x += item.spin.x * delta;
        item.mesh.rotation.y += item.spin.y * delta;
        item.mesh.rotation.z += item.spin.z * delta;
      }
      if (item.growth) {
        const scale = item.growth[0] + (item.growth[1] - item.growth[0]) * phase;
        item.mesh.scale.setScalar(scale);
      }
      const opacity = item.fadeIn && phase < item.fadeIn
        ? phase / item.fadeIn
        : Math.max(0, 1 - phase);
      for (const material of item.materials) {
        // Preserve authored/core-vs-outer opacity while fading the pooled object. Previously the
        // first update flattened every child material to the item's one opacity, so the muzzle
        // flash lost its hot core and smoke/wakes ignored their material-specific alpha.
        const baseOpacity = Number(material.userData?.gunsOnlyBaseOpacity);
        material.opacity = opacity * (Number.isFinite(baseOpacity) ? baseOpacity : 1);
      }
      if (phase >= 1) this.#remove(index);
    }
  }

  clear() {
    if (this.disposed) return;
    while (this.items.length) this.#remove(this.items.length - 1);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    while (this.items.length) this.#remove(this.items.length - 1, false);
    for (const pool of this.pools.values()) {
      for (const object of pool) this.#disposeObject(object);
    }
    this.pools.clear();
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.group.removeFromParent();
  }

  diagnostics() {
    let pooled = 0;
    for (const pool of this.pools.values()) pooled += pool.length;
    return Object.freeze({
      activeItems: this.items.length,
      maximumItems: this.maximumItems,
      activeDrawCalls: this.activeDrawCalls,
      maximumDrawCalls: this.maximumDrawCalls,
      activeDynamicLights: this.activeDynamicLights,
      maximumDynamicLights: this.maximumDynamicLights,
      pooledObjects: pooled,
      createdObjects: this.poolStats.created,
      reusedObjects: this.poolStats.reused,
      evictedItems: this.poolStats.evicted,
      droppedItems: this.poolStats.dropped,
      peakActiveItems: this.poolStats.peakActive,
      peakDrawCalls: this.poolStats.peakDrawCalls,
    });
  }

  #material(color, opacity = 1, blending = this.THREE.AdditiveBlending) {
    const material = new this.THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending,
      toneMapped: false,
    });
    material.userData.gunsOnlyBaseOpacity = opacity;
    return material;
  }

  #orient(mesh, direction, axis = null) {
    const source = axis ?? new this.THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(source, direction.clone().normalize());
  }

  #acquire(poolKey, factory) {
    const pool = this.pools.get(poolKey);
    const pooledObject = pool?.pop();
    const mesh = pooledObject ?? factory();
    if (pooledObject) this.poolStats.reused += 1;
    else this.poolStats.created += 1;
    mesh.visible = true;
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    this.#forEachMaterial(mesh, (material) => {
      const baseOpacity = Number(material.userData?.gunsOnlyBaseOpacity);
      if (Number.isFinite(baseOpacity)) material.opacity = baseOpacity;
    });
    return mesh;
  }

  #forEachMaterial(object, visit) {
    object.traverse((child) => {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) if (material) visit(material);
    });
  }

  #track(poolKey, mesh, settings) {
    const materials = [];
    const dynamicLights = [];
    let drawCalls = 0;
    mesh.traverse((object) => {
      if (object.isMesh) drawCalls += 1;
      if (object.isLight) dynamicLights.push(object);
    });
    this.#forEachMaterial(mesh, (material) => materials.push(material));

    const priority = Number(settings.priority) || 0;
    while (this.items.length >= this.maximumItems
      || this.activeDrawCalls + drawCalls > this.maximumDrawCalls) {
      let evictionIndex = -1;
      let evictionPriority = Infinity;
      for (let index = 0; index < this.items.length; index++) {
        if (this.items[index].priority < evictionPriority) {
          evictionPriority = this.items[index].priority;
          evictionIndex = index;
        }
      }
      // A low-value secondary particle must never evict the only hero cue. Pool the incoming
      // object instead when the active set is entirely more important than it is.
      if (evictionIndex < 0 || priority < evictionPriority) {
        for (const light of dynamicLights) light.visible = false;
        this.poolStats.dropped += 1;
        this.#poolObject(poolKey, mesh);
        return null;
      }
      this.poolStats.evicted += 1;
      this.#remove(evictionIndex);
    }

    let enabledLights = 0;
    for (const light of dynamicLights) {
      const enabled = enabledLights < dynamicLights.length
        && this.activeDynamicLights + enabledLights < this.maximumDynamicLights;
      light.visible = enabled;
      if (enabled) enabledLights += 1;
    }
    this.group.add(mesh);
    this.items.push({
      mesh,
      poolKey,
      materials,
      drawCalls,
      dynamicLights: enabledLights,
      priority,
      age: 0,
      ...settings,
    });
    this.activeDrawCalls += drawCalls;
    this.activeDynamicLights += enabledLights;
    this.poolStats.peakActive = Math.max(this.poolStats.peakActive, this.items.length);
    this.poolStats.peakDrawCalls = Math.max(this.poolStats.peakDrawCalls, this.activeDrawCalls);
    return mesh;
  }

  #gunFire(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.weapon.gun-fire.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const direction = asVector(THREE, payload.direction, new THREE.Vector3(0, 0, -1)).normalize();
    const flash = this.#acquire("muzzle-flash", () => {
      const object = new THREE.Group();
      const outer = new THREE.Mesh(this.geometries.flash,
        this.#material(settings.muzzleFlash.color, 0.78));
      outer.scale.set(settings.muzzleFlash.radiusMetres,
        settings.muzzleFlash.lengthMetres, settings.muzzleFlash.radiusMetres);
      outer.position.y = settings.muzzleFlash.lengthMetres * 0.48;
      const core = new THREE.Mesh(this.geometries.sphere,
        this.#material(settings.muzzleFlash.coreColor, 0.95));
      core.scale.setScalar(settings.muzzleFlash.radiusMetres * 1.4);
      object.add(outer, core);
      if (this.quality.dynamicLights) {
        const light = new THREE.PointLight(settings.muzzleFlash.coreColor,
          settings.muzzleFlash.lightIntensity, settings.muzzleFlash.lightRangeMetres, 2);
        object.add(light);
      }
      return object;
    });
    flash.position.copy(position);
    this.#orient(flash, direction);
    this.#track("muzzle-flash", flash, {
      lifetime: settings.muzzleFlash.lifetimeSeconds,
      priority: 110,
    });

    if (payload.tracer === false) return;
    const tracerSettings = settings.tracer;
    const tracer = this.#acquire("tracer", () => new THREE.Mesh(
      this.geometries.tracer, this.#material(tracerSettings.color, 0.95),
    ));
    tracer.scale.set(tracerSettings.radiusMetres, tracerSettings.lengthMetres, tracerSettings.radiusMetres);
    tracer.position.copy(position).addScaledVector(direction, tracerSettings.lengthMetres * 0.5);
    this.#orient(tracer, direction);
    this.#track("tracer", tracer, {
      lifetime: tracerSettings.lifetimeSeconds,
      velocity: direction.multiplyScalar(tracerSettings.speedMetresPerSecond),
      priority: 60,
    });
  }

  #impact(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.weapon.gun-impact.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const normal = asVector(THREE, payload.normal, new THREE.Vector3(0, 1, 0)).normalize();
    const rng = makeRng(payload.seed ?? 1);
    const flash = this.#acquire("impact-flash", () => new THREE.Mesh(
      this.geometries.sphere, this.#material(settings.flash.color, 0.92),
    ));
    flash.position.copy(position);
    this.#track("impact-flash", flash, {
      lifetime: settings.flash.lifetimeSeconds,
      growth: [0.2, settings.flash.radiusMetres],
      priority: 95,
    });
    const count = Math.max(1, Math.round(settings.spark.count * this.quality.particleMultiplier));
    for (let index = 0; index < count; index++) {
      const tangent = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const direction = tangent.addScaledVector(normal, 0.7 + rng() * 1.1).normalize();
      const spark = this.#acquire("spark", () => new THREE.Mesh(
        this.geometries.spark, this.#material(settings.spark.color, 0.95),
      ));
      spark.position.copy(position);
      spark.scale.setScalar(0.025 + rng() * 0.05);
      this.#track("spark", spark, {
        lifetime: randomRange(rng, settings.spark.lifetimeSeconds),
        velocity: direction.multiplyScalar(randomRange(rng, settings.spark.speedMetresPerSecond)),
        gravity: settings.spark.gravityMetresPerSecondSquared,
        spin: new THREE.Vector3(rng() * 9, rng() * 9, rng() * 9),
        priority: 40,
      });
    }
  }

  #destroyed(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.vehicle.destroyed.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const velocity = asVector(THREE, payload.velocity, new THREE.Vector3());
    const rng = makeRng(payload.seed ?? 7);
    const fireball = this.#acquire("fireball", () => {
      const object = new THREE.Group();
      const shell = new THREE.Mesh(
        this.geometries.sphere, this.#material(settings.fireball.outerColor, 0.78),
      );
      const core = new THREE.Mesh(
        this.geometries.sphere, this.#material(settings.fireball.innerColor, 0.96),
      );
      // A small incandescent core gives the destruction event depth and preserves its palette as
      // the orange shell expands. Both meshes share geometry and are pooled as one effect object;
      // its second draw is explicitly covered by the runtime draw-call ceiling.
      core.scale.setScalar(0.46);
      object.add(shell, core);
      return object;
    });
    fireball.position.copy(position);
    this.#track("fireball", fireball, {
      lifetime: settings.fireball.lifetimeSeconds,
      velocity: velocity.clone().multiplyScalar(0.12),
      growth: [settings.fireball.startRadiusMetres, settings.fireball.endRadiusMetres],
      priority: 120,
    });
    const smokeCount = Math.max(2, Math.round(settings.smoke.count * this.quality.particleMultiplier));
    for (let index = 0; index < smokeCount; index++) {
      const smoke = this.#acquire("smoke", () => new THREE.Mesh(
        this.geometries.sphere,
        this.#material(settings.smoke.color, 0.38, THREE.NormalBlending),
      ));
      smoke.position.copy(position).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5));
      const lifetime = randomRange(rng, settings.smoke.lifetimeSeconds);
      this.#track("smoke", smoke, {
        lifetime,
        velocity: velocity.clone().multiplyScalar(0.08).add(new THREE.Vector3(
          (rng() - 0.5) * 2.4,
          settings.smoke.riseMetresPerSecond * (0.72 + rng() * 0.5),
          (rng() - 0.5) * 2.4,
        )),
        growth: [settings.smoke.startRadiusMetres, settings.smoke.endRadiusMetres],
        priority: 10,
      });
    }
    const debrisCount = Math.max(3, Math.round(settings.debris.count * this.quality.particleMultiplier));
    for (let index = 0; index < debrisCount; index++) {
      const debris = this.#acquire("debris", () => new THREE.Mesh(
        this.geometries.debris,
        this.#material(settings.debris.color, 1, THREE.NormalBlending),
      ));
      debris.position.copy(position);
      debris.scale.setScalar(0.12 + rng() * 0.35);
      const direction = new THREE.Vector3(rng() * 2 - 1, rng() * 1.5 - 0.15, rng() * 2 - 1).normalize();
      this.#track("debris", debris, {
        lifetime: randomRange(rng, settings.debris.lifetimeSeconds),
        velocity: velocity.clone().multiplyScalar(0.22)
          .add(direction.multiplyScalar(randomRange(rng, settings.debris.speedMetresPerSecond))),
        gravity: 9.81,
        spin: new THREE.Vector3(rng() * 7, rng() * 7, rng() * 7),
        priority: 20,
      });
    }
  }

  #wake(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.platform.wake.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const direction = asVector(THREE, payload.direction, new THREE.Vector3(0, 0, 1)).normalize();
    const wake = this.#acquire("wake", () => new THREE.Mesh(
      this.geometries.wake,
      this.#material(settings.color, settings.opacity, THREE.NormalBlending),
    ));
    wake.position.copy(position).addScaledVector(direction, settings.lengthMetres * 0.5);
    wake.rotation.x = -Math.PI / 2;
    wake.rotation.z = Math.atan2(direction.x, direction.z);
    wake.scale.set(settings.widthMetres, settings.lengthMetres, 1);
    this.#track("wake", wake, { lifetime: settings.lifetimeSeconds, priority: 30 });
  }

  #disposeObject(object) {
    this.#forEachMaterial(object, (material) => material.dispose?.());
  }

  #poolObject(poolKey, object, retainInPool = true) {
    object.removeFromParent();
    const pool = this.pools.get(poolKey) ?? [];
    if (retainInPool && pool.length < this.maximumPooledPerKind) {
      object.visible = false;
      pool.push(object);
      this.pools.set(poolKey, pool);
    } else {
      this.#disposeObject(object);
    }
  }

  #remove(index, retainInPool = true) {
    const [item] = this.items.splice(index, 1);
    if (!item) return;
    this.activeDrawCalls = Math.max(0, this.activeDrawCalls - item.drawCalls);
    this.activeDynamicLights = Math.max(0, this.activeDynamicLights - item.dynamicLights);
    this.#poolObject(item.poolKey, item.mesh, retainInPool);
  }
}
