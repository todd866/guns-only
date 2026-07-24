using System;
using System.Collections.Generic;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The regression suite for the fly-ups that fired thousands of feet above the ground over REAL
/// Korean terrain while every flat-terrain test stayed green.
///
/// Production Build 95 telemetry (session web-1784876619376-780741, 2026-07-24) recorded three
/// fly-ups triggered at 6,990 / 7,798 / 7,545 ft AGL, which bottomed out 4,372 / 7,797 / 7,088 ft
/// clear of the ground. The flight state at the first trigger was a 73.6-degree dive at Mach 1.14
/// (731 KTAS) with 2,134 m (7,000 ft) of terrain clearance — a geometry a 14.6 G pull-out arrests
/// in roughly 1,000 m, so more than a kilometre of pull-out room was thrown away.
///
/// The telemetry's signature was that ImmediateRecoveryMinimumClearanceM ALTERNATED, frame to
/// frame, between a healthy ~1,400 m and exactly 30.48 m — the manoeuvring terrain buffer. A
/// clearance that is exactly the buffer, to the metre, is not a measurement; it is the "never
/// promise a save" clamp in Predict() firing on a trajectory that had in fact already bottomed out
/// and climbed away. These tests pin that clamp to what it is supposed to mean.
///
/// Every one of these cases runs over the shipped Korea grid, because that is the variable the
/// flat-terrain suites could not express: the clamp keyed off whether the ground TWENTY SECONDS
/// downrange happened to be sloping down.
/// </summary>
public class AutoGcasKoreaTerrainTriggerTests {
    readonly ITestOutputHelper _output;
    public AutoGcasKoreaTerrainTriggerTests(ITestOutputHelper output) => _output = output;

    static readonly AutoGcasCapabilityProfile Capability =
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate;
    static readonly AircraftParams Aircraft = FlightModel.F22APublicDataSurrogate;
    const double ManeuveringBufferM = 30.48;

    static ITerrainSurface Korea() => KoreaTerrainTruth.Load()
        ?? throw new InvalidOperationException("Korea terrain truth was not embedded");

    static double Radians(double degrees) => degrees * Math.PI / 180.0;

    /// <summary>
    /// A physically consistent diving attitude on an arbitrary heading. Mirrors the attitude
    /// construction in AutoGcasActivationSearch, with the flight path rotated to a real heading so
    /// the predicted ground track crosses real Korean relief rather than a single north-south line.
    /// </summary>
    static AircraftState Diving(Vec3D position, double speedMps, double gammaDeg,
        double headingDeg, double bankDeg) {
        double gamma = Radians(gammaDeg);
        double heading = Radians(headingDeg);
        double bank = Radians(bankDeg);
        double horizontal = Math.Cos(gamma);
        Vec3D forward = new(horizontal * Math.Sin(heading), Math.Sin(gamma),
            horizontal * Math.Cos(heading));
        Vec3D worldUp = new(0.0, 1.0, 0.0);
        Vec3D upPlane = worldUp - forward * forward.Dot(worldUp);
        Vec3D upReference = upPlane.Length < 1e-7
            ? new Vec3D(0.0, 0.0, -1.0) : upPlane.Normalized();
        Vec3D rightReference = upReference.Cross(forward).Normalized();
        Vec3D lift = (upReference * Math.Cos(bank)
            + rightReference * Math.Sin(bank)).Normalized();
        double dynamicPressure = AirData.TrueDynamicPressurePa(speedMps, position.Y);
        double alpha = Math.Clamp(Aircraft.MassKg * FlightModel.G0
                / Math.Max(dynamicPressure * Aircraft.WingAreaM2 * Aircraft.CLAlpha, 1e-9),
            Aircraft.CLMin / Aircraft.CLAlpha, Aircraft.CLMax / Aircraft.CLAlpha);
        Vec3D bodyForward = (forward * Math.Cos(alpha) + lift * Math.Sin(alpha)).Normalized();
        Vec3D bodyUp = (lift * Math.Cos(alpha) - forward * Math.Sin(alpha)).Normalized();
        QuaternionD attitude = QuaternionD.FromFrame(
            bodyUp.Cross(bodyForward).Normalized(), bodyUp, bodyForward);
        return new AircraftState(position, speedMps, gamma, heading, bank,
            Aircraft.MassKg, attitude, new BodyRates(0.0, 0.0, 0.0));
    }

    static AutoGcasStepResult ColdStep(ITerrainSurface terrain, AircraftState aircraft) =>
        AutoGcasController.Step(1.0 / 20.0,
            AutoGcasState.Initial(true),
            new AutoGcasInput(
                Aircraft: aircraft,
                AircraftParameters: Aircraft,
                EffectivePilotCommand: new PilotCommand(1.0, 0.0, 1.0, 0.0),
                Terrain: terrain,
                IndicatedAirspeedMps: aircraft.Speed),
            Capability);

    /// <summary>
    /// Sample points spread across the shipped grid, well inside its bounds so a twenty-second
    /// predicted ground track cannot run off the edge and invalidate the prediction.
    ///
    /// <paramref name="maximumRiseAheadM"/> keeps the sweep honest. Height above the ground
    /// DIRECTLY BELOW is not the room a pull-out has when the dive is pointed at a mountain: the
    /// recovery travels downrange while it descends, so terrain rising ahead genuinely eats the
    /// margin and firing there can be correct. Bounding the rise along the dive heading isolates
    /// the cases where a fly-up is unambiguously wrong.
    /// </summary>
    static IEnumerable<(Vec3D Position, double Heading, double GroundM)> DiveSites(
        ITerrainSurface terrain, double aglM, double maximumRiseAheadM = double.PositiveInfinity) {
        TerrainBounds bounds = terrain.Bounds;
        const int grid = 7;
        double eastSpan = bounds.MaximumEastM - bounds.MinimumEastM;
        double northSpan = bounds.MaximumNorthM - bounds.MinimumNorthM;
        for (int ix = 1; ix <= grid; ix++) {
            for (int iz = 1; iz <= grid; iz++) {
                double east = bounds.MinimumEastM + eastSpan * ix / (grid + 1.0);
                double north = bounds.MinimumNorthM + northSpan * iz / (grid + 1.0);
                if (!terrain.TrySample(east, north, out TerrainSample surface)) continue;
                for (int h = 0; h < 8; h++) {
                    double heading = h * 45.0;
                    if (double.IsFinite(maximumRiseAheadM)
                        && RiseAhead(terrain, east, north, heading, surface.HeightM)
                            > maximumRiseAheadM) continue;
                    yield return (new Vec3D(east, surface.HeightM + aglM, north),
                        heading, surface.HeightM);
                }
            }
        }
    }

    /// <summary>Highest terrain within the pull-out footprint ahead, relative to the ground below.</summary>
    static double RiseAhead(ITerrainSurface terrain, double eastM, double northM,
        double headingDeg, double groundM) {
        double heading = Radians(headingDeg);
        double highest = groundM;
        for (double range = 0.0; range <= 4_000.0; range += 200.0) {
            double east = eastM + range * Math.Sin(heading);
            double north = northM + range * Math.Cos(heading);
            if (!terrain.TrySample(east, north, out TerrainSample sample)) return double.MaxValue;
            highest = Math.Max(highest, sample.HeightM);
        }
        return highest - groundM;
    }

    /// <summary>
    /// The trigger boundary itself. At the production geometry — a 73.6-degree dive at 376 m/s with
    /// 7,000 ft of clearance — a max-perform recovery arrests in roughly a kilometre, so Auto-GCAS
    /// must not fire ANYWHERE over the Korean grid, on any heading. The pre-fix predictor fired on
    /// a large fraction of these sites purely because distant terrain sloped up.
    /// </summary>
    [Fact]
    public void ProductionSteepDiveGeometryNeverFiresWithAKilometreOfPullOutRoomToSpare() {
        ITerrainSurface terrain = Korea();
        const double aglM = 2133.6;      // 7,000 ft — the production trigger clearance
        const double speedMps = 376.0;   // 731 KTAS
        const double gammaDeg = -73.6;

        int evaluated = 0, fired = 0, clampedToBuffer = 0, firedWithoutPenetration = 0;
        double worstRecoveryClearance = double.PositiveInfinity;
        var offenders = new List<string>();
        foreach (var site in DiveSites(terrain, aglM, maximumRiseAheadM: 150.0)) {
            AircraftState aircraft = Diving(site.Position, speedMps, gammaDeg,
                site.Heading, bankDeg: 5.0);
            AutoGcasStepResult result = ColdStep(terrain, aircraft);
            AutoGcasPrediction prediction = result.State.Prediction;
            if (!prediction.Valid) continue;
            evaluated++;
            double recovery = prediction.ImmediateRecoveryMinimumClearanceM;
            worstRecoveryClearance = Math.Min(worstRecoveryClearance, recovery);
            // An immediate-recovery clearance of EXACTLY the buffer is the clamp, not a measurement.
            if (Math.Abs(recovery - ManeuveringBufferM) < 1e-6) clampedToBuffer++;
            if (result.State.Phase != AutoGcasPhase.FlyUp) continue;
            fired++;
            // A fire is only defensible if the predicted recovery ACTUALLY penetrates terrain.
            if (recovery > 0.0) firedWithoutPenetration++;
            if (offenders.Count < 8)
                offenders.Add($"ground={site.GroundM:F0} m hdg={site.Heading:F0} " +
                    $"recoveryMin={recovery:F1} m tAvail={prediction
                        .TimeAvailableToAvoidGroundImpactSeconds:F3}");
        }

        _output.WriteLine($"evaluated={evaluated} fired={fired} " +
            $"firedWithoutPenetration={firedWithoutPenetration} " +
            $"clampedToBuffer={clampedToBuffer} worstRecoveryClearance={worstRecoveryClearance:F1} m");
        foreach (string offender in offenders) _output.WriteLine("  " + offender);

        Assert.True(evaluated >= 60,
            $"the sweep must actually exercise the grid (evaluated {evaluated})");
        // The defect itself: a clearance of EXACTLY the buffer is the clamp, not a measurement.
        Assert.True(clampedToBuffer == 0,
            $"{clampedToBuffer}/{evaluated} predictions reported an immediate-recovery clearance " +
            "of exactly the terrain buffer while a kilometre of air remained — the unsafe clamp " +
            "fired on a trajectory that had already bottomed out and climbed away");
        // Its consequence: firing with a kilometre of pull-out room and no real terrain in the way.
        Assert.True(firedWithoutPenetration == 0,
            $"{firedWithoutPenetration}/{evaluated} sites fired a fly-up even though the predicted " +
            "recovery never reached the terrain — this is the production Build 95 false save " +
            "(7,000 ft trigger, 4,372 ft bottom-out)");
        // Sites whose predicted recovery genuinely grazes rising ground may legitimately fire, but
        // they must stay rare; a large fraction would mean the predictor is still pessimistic.
        Assert.True(fired <= evaluated * 0.02,
            $"{fired}/{evaluated} sites fired — too many to be genuine terrain intersections");
    }

    static BeatSetup Beat(AircraftState player) => new(
        "Auto-GCAS Korea terrain trigger",
        Player: player,
        Bandit: new AircraftState(new Vec3D(20000.0, 3000.0, 20000.0),
            220.0, 0.0, Math.PI, 0.0, FlightModel.Su27SPublicDataSurrogate.MassKg),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.8, 0.0)) },
        PlayerParams: FlightModel.F22APublicDataSurrogate,
        BanditParams: FlightModel.Su27SPublicDataSurrogate,
        PlayerCapability: AircraftCapability.F22ASurrogate,
        BanditCapability: AircraftCapability.Su27SSurrogate,
        PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference);

    /// <summary>
    /// The pilot's actual acceptance spec, measured on the REAL 6DOF aircraft over the REAL Korea
    /// grid: "I want it bottoming out at like, 100 ft." Production Build 95 bottomed out at
    /// 4,372 ft. The corridor here is the two-tier protection floor (100 ft manoeuvring) up to a
    /// ceiling that still reads as a genuine last-instant save rather than an early bounce.
    /// </summary>
    [Theory]
    [InlineData(-73.6, 376.0)]   // the production geometry: 73.6-degree dive at Mach 1.14
    [InlineData(-55.0, 330.0)]
    [InlineData(-45.0, 280.0)]
    public void FlyUpOverKoreaBottomsOutNearTheProtectionFloor(double gammaDeg, double speedMps) {
        ITerrainSurface terrain = Korea();
        // Open, low-relief ground so the measurement is the RECOVERY, not a mountain in the way.
        const double eastM = -32_768.0;
        const double northM = 0.0;
        Assert.True(terrain.TrySample(eastM, northM, out TerrainSample surface));
        double rise = RiseAhead(terrain, eastM, northM, headingDeg: 0.0, surface.HeightM);
        Assert.True(rise <= 300.0, $"the measurement site must be open ground (rise {rise:F0} m)");

        var player = Diving(new Vec3D(eastM, surface.HeightM + 4_000.0, northM),
            speedMps, gammaDeg, headingDeg: 0.0, bankDeg: 0.0);
        var session = new SimulationSession();
        session.StartBeat(() => Beat(player));
        session.SetTerrainSurface(terrain);
        session.SetAssistedFlight(true);
        session.Begin();
        session.FeedKey(GKey.PushDown, true);

        double minimumAgl = double.PositiveInfinity;
        double triggerAgl = double.NaN;
        bool activated = false;
        for (int tick = 0; tick < 60 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; tick++) {
            session.StepFixed();
            Vec3D position = session.Player.State.Position;
            if (!terrain.TrySample(position.X, position.Z, out TerrainSample below)) break;
            double agl = position.Y - below.HeightM;
            if (!activated && session.AutoGcas.ActivationCount > 0) {
                activated = true;
                triggerAgl = agl;
                // A pilot who keeps pushing through the fly-up is choosing the ground; releasing
                // here measures the save itself, matching AutoGcasBottomOutCorridorTests.
                session.FeedKey(GKey.PushDown, false);
            }
            if (session.AutoGcas.Active) minimumAgl = Math.Min(minimumAgl, agl);
            if (session.CompletedAutoGcasFlyUpCount > 0) break;
        }

        _output.WriteLine($"gamma={gammaDeg} v={speedMps}: triggered at {triggerAgl:F0} m " +
            $"({triggerAgl * 3.28084:F0} ft) AGL, bottomed at {minimumAgl:F0} m " +
            $"({minimumAgl * 3.28084:F0} ft) AGL");
        Assert.True(activated, "the commanded dive must eventually trigger the fly-up");
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(minimumAgl >= 20.0,
            $"the fly-up came within {minimumAgl:F1} m of the ground");
        // Scale-free form of "last instant". A near-vertical supersonic dive physically needs
        // ~1,100 m to arrest, so an absolute ceiling would encode the geometry rather than the
        // timing; what the pilot's "bottom out at like, 100 ft" actually asks is that the
        // recovery consume essentially all the height that existed when it fired. Production
        // Build 95 consumed 38% of it (fired at 6,990 ft, bottomed at 4,372 ft).
        double consumed = 1.0 - minimumAgl / triggerAgl;
        Assert.True(consumed >= 0.85,
            $"the fly-up consumed only {consumed * 100.0:F0}% of the {triggerAgl * 3.28084:F0} ft " +
            $"it had at trigger, bottoming at {minimumAgl * 3.28084:F0} ft AGL — that is an early " +
            "bounce, not a last-instant save (production Build 95 consumed 38%)");
    }

    /// <summary>
    /// The clamp must still do its job. A dive that genuinely cannot be recovered has to read as
    /// unrecoverable, so the last-instant boundary is a real boundary and not merely a disabled one.
    /// </summary>
    [Fact]
    public void AnUnrecoverableDiveStillReadsAsUnrecoverable() {
        ITerrainSurface terrain = Korea();
        int evaluated = 0, fired = 0;
        foreach (var site in DiveSites(terrain, aglM: 120.0)) {
            AircraftState aircraft = Diving(site.Position, 300.0, -60.0,
                site.Heading, bankDeg: 0.0);
            AutoGcasStepResult result = ColdStep(terrain, aircraft);
            if (!result.State.Prediction.Valid) continue;
            evaluated++;
            if (result.State.Phase == AutoGcasPhase.FlyUp) fired++;
        }
        _output.WriteLine($"evaluated={evaluated} fired={fired}");
        Assert.True(evaluated >= 100, $"the sweep must exercise the grid (evaluated {evaluated})");
        Assert.True(fired == evaluated,
            $"only {fired}/{evaluated} unrecoverable 60-degree dives at 120 m AGL triggered — " +
            "the last-instant boundary has been disabled rather than corrected");
    }
}
