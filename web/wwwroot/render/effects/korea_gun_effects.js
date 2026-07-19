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
      item.mesh.traverse((object) => {
        if (object.material) object.material.opacity = opacity * (item.opacity ?? 1);
      });
      if (phase >= 1) this.#remove(index);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    while (this.items.length) this.#remove(this.items.length - 1);
    for (const geometry of Object.values(this.geometries)) geometry.dispose();
    this.group.removeFromParent();
  }

  #material(color, opacity = 1, blending = this.THREE.AdditiveBlending) {
    return new this.THREE.MeshBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending,
      toneMapped: false,
    });
  }

  #orient(mesh, direction, axis = null) {
    const source = axis ?? new this.THREE.Vector3(0, 1, 0);
    mesh.quaternion.setFromUnitVectors(source, direction.clone().normalize());
  }

  #track(mesh, settings) {
    this.group.add(mesh);
    this.items.push({ mesh, age: 0, ...settings });
    return mesh;
  }

  #gunFire(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.weapon.gun-fire.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const direction = asVector(THREE, payload.direction, new THREE.Vector3(0, 0, -1)).normalize();
    const flash = new THREE.Group();
    flash.position.copy(position);
    this.#orient(flash, direction);
    const outer = new THREE.Mesh(this.geometries.flash, this.#material(settings.muzzleFlash.color, 0.78));
    outer.scale.set(settings.muzzleFlash.radiusMetres, settings.muzzleFlash.lengthMetres, settings.muzzleFlash.radiusMetres);
    outer.position.y = settings.muzzleFlash.lengthMetres * 0.48;
    const core = new THREE.Mesh(this.geometries.sphere, this.#material(settings.muzzleFlash.coreColor, 0.95));
    core.scale.setScalar(settings.muzzleFlash.radiusMetres * 1.4);
    flash.add(outer, core);
    if (this.quality.dynamicLights) {
      const light = new THREE.PointLight(settings.muzzleFlash.coreColor,
        settings.muzzleFlash.lightIntensity, settings.muzzleFlash.lightRangeMetres, 2);
      flash.add(light);
    }
    this.#track(flash, { lifetime: settings.muzzleFlash.lifetimeSeconds, opacity: 1 });

    if (payload.tracer === false) return;
    const tracerSettings = settings.tracer;
    const tracer = new THREE.Mesh(this.geometries.tracer, this.#material(tracerSettings.color, 0.95));
    tracer.scale.set(tracerSettings.radiusMetres, tracerSettings.lengthMetres, tracerSettings.radiusMetres);
    tracer.position.copy(position).addScaledVector(direction, tracerSettings.lengthMetres * 0.5);
    this.#orient(tracer, direction);
    this.#track(tracer, {
      lifetime: tracerSettings.lifetimeSeconds,
      velocity: direction.multiplyScalar(tracerSettings.speedMetresPerSecond),
      opacity: 0.95,
    });
  }

  #impact(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.weapon.gun-impact.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const normal = asVector(THREE, payload.normal, new THREE.Vector3(0, 1, 0)).normalize();
    const rng = makeRng(payload.seed ?? 1);
    const flash = new THREE.Mesh(this.geometries.sphere, this.#material(settings.flash.color, 0.92));
    flash.position.copy(position);
    this.#track(flash, { lifetime: settings.flash.lifetimeSeconds, growth: [0.2, settings.flash.radiusMetres] });
    const count = Math.max(1, Math.round(settings.spark.count * this.quality.particleMultiplier));
    for (let index = 0; index < count; index++) {
      const tangent = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const direction = tangent.addScaledVector(normal, 0.7 + rng() * 1.1).normalize();
      const spark = new THREE.Mesh(this.geometries.spark, this.#material(settings.spark.color, 0.95));
      spark.position.copy(position);
      spark.scale.setScalar(0.025 + rng() * 0.05);
      this.#track(spark, {
        lifetime: randomRange(rng, settings.spark.lifetimeSeconds),
        velocity: direction.multiplyScalar(randomRange(rng, settings.spark.speedMetresPerSecond)),
        gravity: settings.spark.gravityMetresPerSecondSquared,
        spin: new THREE.Vector3(rng() * 9, rng() * 9, rng() * 9),
      });
    }
  }

  #destroyed(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.vehicle.destroyed.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const velocity = asVector(THREE, payload.velocity, new THREE.Vector3());
    const rng = makeRng(payload.seed ?? 7);
    const fireball = new THREE.Mesh(this.geometries.sphere, this.#material(settings.fireball.outerColor, 0.86));
    fireball.position.copy(position);
    this.#track(fireball, {
      lifetime: settings.fireball.lifetimeSeconds,
      velocity: velocity.clone().multiplyScalar(0.12),
      growth: [settings.fireball.startRadiusMetres, settings.fireball.endRadiusMetres],
    });
    const smokeCount = Math.max(2, Math.round(settings.smoke.count * this.quality.particleMultiplier));
    for (let index = 0; index < smokeCount; index++) {
      const smoke = new THREE.Mesh(this.geometries.sphere,
        this.#material(settings.smoke.color, 0.38, THREE.NormalBlending));
      smoke.position.copy(position).add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5));
      const lifetime = randomRange(rng, settings.smoke.lifetimeSeconds);
      this.#track(smoke, {
        lifetime,
        velocity: velocity.clone().multiplyScalar(0.08).add(new THREE.Vector3(
          (rng() - 0.5) * 2.4,
          settings.smoke.riseMetresPerSecond * (0.72 + rng() * 0.5),
          (rng() - 0.5) * 2.4,
        )),
        growth: [settings.smoke.startRadiusMetres, settings.smoke.endRadiusMetres],
        opacity: 0.38,
      });
    }
    const debrisCount = Math.max(3, Math.round(settings.debris.count * this.quality.particleMultiplier));
    for (let index = 0; index < debrisCount; index++) {
      const debris = new THREE.Mesh(this.geometries.debris,
        this.#material(settings.debris.color, 1, THREE.NormalBlending));
      debris.position.copy(position);
      debris.scale.setScalar(0.12 + rng() * 0.35);
      const direction = new THREE.Vector3(rng() * 2 - 1, rng() * 1.5 - 0.15, rng() * 2 - 1).normalize();
      this.#track(debris, {
        lifetime: randomRange(rng, settings.debris.lifetimeSeconds),
        velocity: velocity.clone().multiplyScalar(0.22)
          .add(direction.multiplyScalar(randomRange(rng, settings.debris.speedMetresPerSecond))),
        gravity: 9.81,
        spin: new THREE.Vector3(rng() * 7, rng() * 7, rng() * 7),
      });
    }
  }

  #wake(payload) {
    const THREE = this.THREE;
    const settings = this.profile.events["event.platform.wake.v1"];
    const position = asVector(THREE, payload.position, new THREE.Vector3());
    const direction = asVector(THREE, payload.direction, new THREE.Vector3(0, 0, 1)).normalize();
    const wake = new THREE.Mesh(this.geometries.wake,
      this.#material(settings.color, settings.opacity, THREE.NormalBlending));
    wake.position.copy(position).addScaledVector(direction, settings.lengthMetres * 0.5);
    wake.rotation.x = -Math.PI / 2;
    wake.rotation.z = Math.atan2(direction.x, direction.z);
    wake.scale.set(settings.widthMetres, settings.lengthMetres, 1);
    this.#track(wake, { lifetime: settings.lifetimeSeconds, opacity: settings.opacity });
  }

  #remove(index) {
    const [item] = this.items.splice(index, 1);
    item.mesh.removeFromParent();
    item.mesh.traverse((object) => object.material?.dispose?.());
  }
}
