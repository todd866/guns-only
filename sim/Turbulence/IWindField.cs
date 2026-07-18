namespace GunsOnly.Sim.Turbulence;

/// A wind/gust field: the air's velocity vector (m/s) at a world position. AircraftSim depends
/// on this interface, not on the concrete multifractal TurbulenceField, so the aero core is
/// decoupled from how the wind is generated — a steady wind, a test constant, or the eventual
/// ship-shaped burble (universal texture × placement envelope) all satisfy it.
public interface IWindField {
    Vec3D Sample(Vec3D worldPos);
}
