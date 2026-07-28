// Compact U.S. Standard Atmosphere 1976 fallback for audio-only/replay snapshots which do not
// publish the simulation's authoritative thermodynamic state. Inputs are geometric altitude.

const EARTH_GEOPOTENTIAL_RADIUS_M = 6_356_766;
const MAX_GEOPOTENTIAL_ALTITUDE_M = 84_852;
const MIN_GEOMETRIC_ALTITUDE_M = -500;
const MAX_GEOMETRIC_ALTITUDE_M = EARTH_GEOPOTENTIAL_RADIUS_M
  * MAX_GEOPOTENTIAL_ALTITUDE_M
  / (EARTH_GEOPOTENTIAL_RADIUS_M - MAX_GEOPOTENTIAL_ALTITUDE_M);
const GRAVITY_MPS2 = 9.80665;
const GAS_CONSTANT = 287.05287;
const HEAT_CAPACITY_RATIO = 1.4;

const BASE_ALTITUDE_M = Object.freeze([
  0, 11_000, 20_000, 32_000, 47_000, 51_000, 71_000, 84_852,
]);
const BASE_TEMPERATURE_K = Object.freeze([
  288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.946,
]);
const BASE_PRESSURE_PA = Object.freeze([
  101_325, 22_632.06, 5_474.889, 868.0187, 110.9063, 66.93887, 3.956420, 0.373384,
]);
const LAPSE_RATE_K_PER_M = Object.freeze([
  -0.0065, 0, 0.0010, 0.0028, 0, -0.0028, -0.0020,
]);

export function standardAtmosphereState(geometricAltitudeM) {
  const requested = Number(geometricAltitudeM);
  const geometricAltitude = Math.max(
    MIN_GEOMETRIC_ALTITUDE_M,
    Math.min(
      MAX_GEOMETRIC_ALTITUDE_M,
      Number.isFinite(requested) ? requested : 0,
    ),
  );
  const geopotentialAltitude = EARTH_GEOPOTENTIAL_RADIUS_M * geometricAltitude
    / (EARTH_GEOPOTENTIAL_RADIUS_M + geometricAltitude);
  let layer = 0;
  while (
    layer < BASE_ALTITUDE_M.length - 1
    && geopotentialAltitude >= BASE_ALTITUDE_M[layer + 1]
  ) {
    layer += 1;
  }

  const lapse = LAPSE_RATE_K_PER_M[
    Math.min(layer, LAPSE_RATE_K_PER_M.length - 1)
  ];
  const baseTemperature = BASE_TEMPERATURE_K[layer];
  const deltaAltitude = geopotentialAltitude - BASE_ALTITUDE_M[layer];
  const temperatureK = baseTemperature + lapse * deltaAltitude;
  const pressurePa = Math.abs(lapse) < 1e-15
    ? BASE_PRESSURE_PA[layer] * Math.exp(
      -GRAVITY_MPS2 * deltaAltitude / (GAS_CONSTANT * baseTemperature),
    )
    : BASE_PRESSURE_PA[layer] * Math.pow(
      baseTemperature / temperatureK,
      GRAVITY_MPS2 / (GAS_CONSTANT * lapse),
    );

  return {
    geometricAltitudeM: geometricAltitude,
    geopotentialAltitudeM: geopotentialAltitude,
    temperatureK,
    pressurePa,
    density: pressurePa / (GAS_CONSTANT * temperatureK),
    speedOfSoundMps: Math.sqrt(HEAT_CAPACITY_RATIO * GAS_CONSTANT * temperatureK),
  };
}

export function standardAtmosphereDensity(geometricAltitudeM) {
  return standardAtmosphereState(geometricAltitudeM).density;
}
