using System;
using System.Collections.Generic;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// A corner-case search harness for Auto-GCAS. It enumerates initial flight states across a
/// parameter grid — altitude above terrain, speed, dive angle, bank (upright→knife-edge→inverted),
/// roll rate, pilot G, and attentive-vs-passive — runs the predictor once from a cold Armed state,
/// and records whether it activated together with the margins that decision was made on. The point
/// is to make the whole activation boundary visible at once, so a fly-up that fires with a mile of
/// air underneath (a false save) shows up as data rather than as a one-off bug report.
///
/// A single cold Step captures the TRIGGER decision — the instant GCAS decides to fire — which is
/// the boundary this harness exists to map. It does not model the latched fly-up that follows.
/// </summary>
public static class AutoGcasActivationSearch {
    static readonly AutoGcasCapabilityProfile Capability =
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate;
    static readonly AircraftParams Aircraft = FlightModel.F22APublicDataSurrogate;

    public readonly record struct Scenario(
        double AglM,
        double SpeedMps,
        double GammaDeg,
        double BankDeg,
        double RollRateDegPerSec,
        double PilotGDemand,
        bool PilotActivelyFlying);

    public readonly record struct Sample(
        Scenario Scenario,
        AutoGcasPhase Phase,
        double TimeAvailableS,
        double ImmediateRecoveryClearanceM,
        double PilotMinClearanceM) {
        public bool Activated => Phase == AutoGcasPhase.FlyUp;
    }

    /// <summary>Flat terrain at a fixed height, so AGL is exact and terrain shape is not a variable.</summary>
    public static ITerrainSurface FlatTerrain(double heightM) =>
        new BilinearHeightGrid(-400_000.0, -400_000.0, 800_000.0, 800_000.0,
            new double[,] { { heightM, heightM }, { heightM, heightM } });

    /// <summary>
    /// Build an AircraftState whose body attitude matches the requested flight-path angle and bank,
    /// including fully inverted (bank 180°). Mirrors the attitude construction in AutoGcasTests so
    /// the predictor sees a physically consistent lift vector and body frame.
    /// </summary>
    public static AircraftState StateFor(Scenario s, double terrainHeightM) {
        double gamma = Radians(s.GammaDeg);
        double bank = Radians(s.BankDeg);
        Vec3D forward = new(0.0, Math.Sin(gamma), Math.Cos(gamma));
        Vec3D worldUp = new(0.0, 1.0, 0.0);
        Vec3D upPlane = worldUp - forward * forward.Dot(worldUp);
        Vec3D upReference = upPlane.Length < 1e-7
            ? new Vec3D(0.0, 0.0, -1.0) : upPlane.Normalized();
        Vec3D rightReference = upReference.Cross(forward).Normalized();
        Vec3D lift = (upReference * Math.Cos(bank)
            + rightReference * Math.Sin(bank)).Normalized();
        double dynamicPressure = AirData.TrueDynamicPressurePa(
            s.SpeedMps, terrainHeightM + s.AglM);
        double alpha = Math.Clamp(Aircraft.MassKg * FlightModel.G0
                / Math.Max(dynamicPressure * Aircraft.WingAreaM2 * Aircraft.CLAlpha, 1e-9),
            Aircraft.CLMin / Aircraft.CLAlpha, Aircraft.CLMax / Aircraft.CLAlpha);
        Vec3D bodyForward = (forward * Math.Cos(alpha) + lift * Math.Sin(alpha)).Normalized();
        Vec3D bodyUp = (lift * Math.Cos(alpha) - forward * Math.Sin(alpha)).Normalized();
        QuaternionD attitude = QuaternionD.FromFrame(
            bodyUp.Cross(bodyForward).Normalized(), bodyUp, bodyForward);
        return new AircraftState(
            new Vec3D(0.0, terrainHeightM + s.AglM, 0.0), s.SpeedMps,
            gamma, 0.0, bank, Aircraft.MassKg, attitude,
            new BodyRates(Radians(s.RollRateDegPerSec), 0.0, 0.0));
    }

    public static Sample Evaluate(Scenario s, double terrainHeightM = 460.0) {
        AircraftState aircraft = StateFor(s, terrainHeightM);
        var input = new AutoGcasInput(
            Aircraft: aircraft,
            AircraftParameters: Aircraft,
            EffectivePilotCommand: new PilotCommand(
                GDemand: s.PilotGDemand, BankTarget: 0.0, Throttle: 0.85,
                Rudder: 0.0, RollControl: 0.0, DirectLateralControl: true),
            Terrain: FlatTerrain(terrainHeightM),
            IndicatedAirspeedMps: AirData.EquivalentAirspeedMps(
                s.SpeedMps, terrainHeightM + s.AglM),
            PilotActivelyFlying: s.PilotActivelyFlying);
        AutoGcasStepResult result = AutoGcasController.Step(
            1.0 / 120.0, AutoGcasState.Initial(true), input, Capability);
        AutoGcasPrediction p = result.State.Prediction;
        return new Sample(s, result.State.Phase,
            p.TimeAvailableToAvoidGroundImpactSeconds,
            p.ImmediateRecoveryMinimumClearanceM,
            p.PilotMinimumClearanceM);
    }

    public static IEnumerable<Sample> Sweep(
        IEnumerable<Scenario> scenarios, double terrainHeightM = 460.0) {
        foreach (Scenario s in scenarios) yield return Evaluate(s, terrainHeightM);
    }

    /// <summary>The default corner-case grid: dives across altitude, speed, bank and roll, both modes.</summary>
    public static IEnumerable<Scenario> DefaultGrid() {
        double[] aglM = { 5_000, 3_000, 2_000, 1_200, 800, 400, 200 };
        double[] speedMps = { 180, 260, 340, 400 };
        double[] gammaDeg = { -10, -30, -50, -70, -85 };
        double[] bankDeg = { 0, 90, 135, 180 };
        double[] rollDeg = { 0, 150 };
        double[] gDemand = { 1.0, 7.0, -1.0 };
        foreach (double agl in aglM)
        foreach (double spd in speedMps)
        foreach (double gam in gammaDeg)
        foreach (double bnk in bankDeg)
        foreach (double roll in rollDeg)
        foreach (double g in gDemand)
        foreach (bool attentive in new[] { true, false })
            yield return new Scenario(agl, spd, gam, bnk, roll, g, attentive);
    }

    static double Radians(double degrees) => degrees * Math.PI / 180.0;
}
