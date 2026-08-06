using System;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The three ways this aircraft actually meets the ground, flown closed-loop at the real 120 Hz
/// authority cadence through the real prediction interval, and pinned by number.
///
/// Auto-GCAS was made cheap (2026-08-06: a broad phase against the terrain's own ceiling, a
/// narrow phase that only rolls the recovery trajectory once the pilot path has penetrated the
/// protection floor, and a bisection that stops once its answer is past every threshold anyone
/// reads). None of that is worth having if the save moved. These cases exist so a future change
/// to the cost cannot quietly move the trigger: they record WHERE the fly-up fires and HOW MUCH
/// ground it keeps, not merely that it fires.
///
/// The tolerances are tight on purpose — a metre or two of tick-quantisation, not an acceptance
/// band. A change that moves any of these numbers is a change to the save, and has to be argued
/// as one.
/// </summary>
public class AutoGcasImpactGeometryTests {
    readonly ITestOutputHelper _output;
    public AutoGcasImpactGeometryTests(ITestOutputHelper output) => _output = output;

    readonly record struct Outcome(
        bool Activated, double TriggerAltitudeM, double TriggerAglM,
        double TriggerSecond, double BottomAltitudeM, double BottomAglM,
        AircraftTerminalState Terminal);

    /// Flat ground at a given elevation, over a span no predicted path can leave.
    static ITerrainSurface Flat(double heightM) =>
        new BilinearHeightGrid(-200_000.0, -200_000.0, 400_000.0, 400_000.0,
            new double[,] { { heightM, heightM }, { heightM, heightM } });

    /// Ground that rises along +Z at a constant gradient — the classic "the valley floor came up
    /// to meet me" geometry, where the aircraft's own descent is gentle and the TERRAIN closes.
    static ITerrainSurface RisingGround(double baseHeightM, double riseM, double runM) {
        const int Points = 161;
        const double SpacingM = 500.0;      // 80 km of run
        const double OriginM = -20_000.0;
        var heights = new double[Points, Points];
        for (int north = 0; north < Points; north++) {
            double z = OriginM + north * SpacingM;
            double h = baseHeightM + Math.Max(0.0, z) * (riseM / runM);
            for (int east = 0; east < Points; east++) heights[north, east] = h;
        }
        return new BilinearHeightGrid(OriginM, OriginM, SpacingM, SpacingM, heights);
    }

    /// A single ridge standing across the flight path, with flat ground either side of it. Level
    /// flight into this is the geometry with no vertical cue at all: nothing about the aircraft's
    /// own state says anything is wrong until the wall is inside the recovery radius.
    static ITerrainSurface Ridge(double baseHeightM, double crestHeightM,
        double crestNorthM, double halfWidthM) {
        const int Points = 321;
        const double SpacingM = 250.0;      // 80 km of run
        const double OriginM = -20_000.0;
        var heights = new double[Points, Points];
        for (int north = 0; north < Points; north++) {
            double z = OriginM + north * SpacingM;
            double t = Math.Clamp(Math.Abs(z - crestNorthM) / halfWidthM, 0.0, 1.0);
            double shape = 1.0 - t * t * (3.0 - 2.0 * t);
            double h = baseHeightM + (crestHeightM - baseHeightM) * shape;
            for (int east = 0; east < Points; east++) heights[north, east] = h;
        }
        return new BilinearHeightGrid(OriginM, OriginM, SpacingM, SpacingM, heights);
    }

    /// A hands-off pilot — no roll, no rudder, a neutral 1 G — flown north from a given state,
    /// with Auto-GCAS the only thing between the aircraft and the ground.
    Outcome FlyHandsOff(ITerrainSurface terrain, Vec3D start,
        double speedMps, double gammaDeg, double seconds) {
        var session = new SimulationSession();
        session.StartBeat(() => new BeatSetup(
            "impact geometry",
            Player: new AircraftState(start, speedMps,
                gammaDeg * Math.PI / 180.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit: new AircraftState(new Vec3D(60_000.0, 8_000.0, 60_000.0),
                220.0, 0.0, Math.PI, 0.0, FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference));
        session.SetTerrainSurface(terrain);
        session.Begin();

        bool activated = false;
        double triggerAltitude = double.NaN, triggerAgl = double.NaN, triggerSecond = double.NaN;
        double bottomAltitude = double.PositiveInfinity, bottomAgl = double.PositiveInfinity;
        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            AircraftState state = session.Player.State;
            double groundM = terrain.TrySample(state.Position.X, state.Position.Z,
                out TerrainSample sample) ? sample.HeightM : 0.0;
            double aglM = state.Position.Y - groundM;
            if (!activated && session.AutoGcas.ActivationCount > 0) {
                activated = true;
                triggerAltitude = state.Position.Y;
                triggerAgl = aglM;
                triggerSecond = tick / (double)AircraftSim.TickHz;
            }
            if (activated) {
                bottomAltitude = Math.Min(bottomAltitude, state.Position.Y);
                bottomAgl = Math.Min(bottomAgl, aglM);
            }
            if (activated && state.VelocityVector().Y >= 0.0
                && aglM > triggerAgl + 300.0) break;
        }
        return new Outcome(activated, triggerAltitude, triggerAgl, triggerSecond,
            bottomAltitude, bottomAgl, session.PlayerTerminalState);
    }

    void Report(string name, in Outcome outcome) =>
        _output.WriteLine($"{name}: activated={outcome.Activated} "
            + $"trigger t={outcome.TriggerSecond:F3} s alt={outcome.TriggerAltitudeM:F1} m "
            + $"AGL={outcome.TriggerAglM:F1} m ({outcome.TriggerAglM * 3.28084:F0} ft)  "
            + $"bottom AGL={outcome.BottomAglM:F1} m ({outcome.BottomAglM * 3.28084:F0} ft)  "
            + $"terminal={outcome.Terminal}");

    /// <summary>
    /// Steep dive at altitude. The aircraft has thousands of feet under it at the entry and every
    /// one of them is going to be spent; the save is a pure last-instant commit.
    /// </summary>
    [Fact]
    public void ASteepDiveFromAltitudeFiresAtTheSamePointWithTheSameMargin() {
        Outcome outcome = FlyHandsOff(Flat(200.0),
            new Vec3D(0.0, 5_200.0, 0.0), speedMps: 320.0, gammaDeg: -62.0, seconds: 45.0);
        Report("steep dive", outcome);

        Assert.True(outcome.Activated, "a 62-degree hands-off dive must draw the fly-up");
        Assert.Equal(AircraftTerminalState.Flying, outcome.Terminal);
        Assert.True(outcome.BottomAglM > 0.0,
            $"the save touched the ground (bottomed at {outcome.BottomAglM:F1} m AGL)");
        // Pinned: the commit point and the ground it keeps. See the class comment before moving
        // either — they are the save, not a tolerance band.
        Assert.InRange(outcome.TriggerSecond, 13.83, 13.87);
        Assert.InRange(outcome.TriggerAglM, 668.0, 672.0);
        Assert.InRange(outcome.BottomAglM, 48.0, 51.0);
    }

    /// <summary>
    /// Low-level descent into rising ground. The pilot's own flight path is gentle — this is the
    /// case where the AIRCRAFT is not the problem and the ground is, and where a predictor that
    /// only looked at sink rate would see nothing at all.
    /// </summary>
    [Fact]
    public void ALowLevelDescentIntoRisingGroundFiresAtTheSamePointWithTheSameMargin() {
        // 1 in 12 upslope: 2,000 m of rise over 24 km, starting under the aircraft.
        Outcome outcome = FlyHandsOff(RisingGround(300.0, 2_000.0, 24_000.0),
            new Vec3D(0.0, 1_150.0, 0.0), speedMps: 300.0, gammaDeg: -4.0, seconds: 60.0);
        Report("rising ground", outcome);

        Assert.True(outcome.Activated,
            "a shallow descent into an upslope must draw the fly-up before the ground arrives");
        Assert.Equal(AircraftTerminalState.Flying, outcome.Terminal);
        Assert.True(outcome.BottomAglM > 0.0,
            $"the save touched the ground (bottomed at {outcome.BottomAglM:F1} m AGL)");
        Assert.InRange(outcome.TriggerSecond, 15.88, 15.92);
        Assert.InRange(outcome.TriggerAglM, 31.5, 34.5);
        Assert.InRange(outcome.BottomAglM, 4.0, 5.6);
    }

    /// <summary>
    /// High-speed level flight at a ridge. No sink rate, no bank, nothing wrong with the aircraft
    /// — the entire threat is a wall ahead, and the only thing that can see it is a path sweep at
    /// terrain resolution. This is the geometry a broad phase must never be allowed to skip.
    /// </summary>
    [Fact]
    public void LevelFlightAtARidgeFiresAtTheSamePointWithTheSameMargin() {
        Outcome outcome = FlyHandsOff(
            Ridge(baseHeightM: 200.0, crestHeightM: 1_500.0,
                crestNorthM: 14_000.0, halfWidthM: 2_500.0),
            new Vec3D(0.0, 900.0, 0.0), speedMps: 420.0, gammaDeg: 0.0, seconds: 45.0);
        Report("ridge", outcome);

        Assert.True(outcome.Activated,
            "level flight at a 1,500 m crest must draw the fly-up");
        Assert.Equal(AircraftTerminalState.Flying, outcome.Terminal);
        Assert.True(outcome.BottomAglM > 0.0,
            $"the save touched the ground (bottomed at {outcome.BottomAglM:F1} m AGL)");
        Assert.InRange(outcome.TriggerSecond, 29.48, 29.52);
        Assert.InRange(outcome.TriggerAglM, 700.0, 703.0);
        Assert.InRange(outcome.BottomAglM, 95.5, 98.5);
    }

    /// <summary>
    /// The counterweight. Every geometry above is a real impact; these are not, and the same
    /// system must sit silent through all of them. False fly-ups are the failure mode this file's
    /// optimisation could plausibly introduce — a clearance reported low enough to cross a
    /// threshold — so the cheap path is swept for them explicitly.
    /// </summary>
    [Fact]
    public void NoneOfTheSafeGeometriesDrawAFlyUp() {
        var offenders = new System.Collections.Generic.List<string>();
        int swept = 0;

        // A dogfight at altitude over the same rising ground: descending hard, but with an
        // enormous amount of air underneath.
        foreach (double altitudeM in new[] { 4_000.0, 6_000.0, 9_000.0, 12_000.0 })
        foreach (double gammaDeg in new[] { -10.0, -30.0, -50.0 }) {
            swept++;
            Outcome outcome = FlyHandsOff(RisingGround(300.0, 2_000.0, 24_000.0),
                new Vec3D(0.0, altitudeM, -18_000.0), 340.0, gammaDeg, seconds: 4.0);
            if (outcome.Activated)
                offenders.Add($"alt={altitudeM:F0} gamma={gammaDeg} "
                    + $"fired at {outcome.TriggerAglM:F0} m AGL");
        }

        // Deliberate fast low flying on a stable path over flat ground — the pilot spec's
        // 20 ft stable protection floor, which must not become a governor.
        foreach (double aglM in new[] { 150.0, 250.0, 400.0, 700.0 }) {
            swept++;
            Outcome outcome = FlyHandsOff(Flat(200.0),
                new Vec3D(0.0, 200.0 + aglM, 0.0), 380.0, 0.0, seconds: 8.0);
            if (outcome.Activated)
                offenders.Add($"level run at {aglM:F0} m AGL fired");
        }

        _output.WriteLine($"swept={swept} falseFlyUps={offenders.Count}");
        foreach (string offender in offenders) _output.WriteLine("  " + offender);
        Assert.True(offenders.Count == 0,
            $"{offenders.Count}/{swept} safe geometries drew a fly-up");
    }
}
