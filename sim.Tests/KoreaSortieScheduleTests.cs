using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The Panther's sortie: that it exists, that it starts on the deck, and that the schedule which
/// flies it can say the one thing its predecessor could not — "add power".
/// </summary>
public class KoreaSortieScheduleTests {
    private static ITerrainSurface ProductionTerrain(BeatSetup beat) {
        ITerrainSurface truth = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        var apron = new TrainingTerrainApronSurface(
            truth, marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0);
        MissionEnvironmentContract environment = beat.EnvironmentIdentity;
        return new TranslatedTerrainSurface(
            apron,
            -environment.TerrainSourceAnchorEastM,
            -environment.TerrainSourceAnchorNorthM);
    }

    private static SortieReference PantherReference() {
        AircraftParams air = FlightModel.F9F2Panther;
        return new SortieReference(
            ApproachSpeedMps: SortieSchedule.ApproachSpeedMps(air.MassKg, air),
            ClimbSpeedMps: 130.0,
            TransitSpeedMps: 160.0,
            TransitHeightM: 4_500.0,
            StabiliseHeightM: 110.0,
            GlideslopeRad: 3.5 * Math.PI / 180.0,
            DragToWeight: 0.12,
            SpoolUpTauS: air.SpoolUpTau);
    }

    [Fact]
    public void ThePantherApproachSpeedReproducesTheMeasuredHundredAndFourteenKnots() {
        AircraftParams air = FlightModel.F9F2Panther;
        double approachKt = SortieSchedule.ApproachSpeedMps(air.MassKg, air) * AirData.MpsToKnots;

        // A pilot's account of the VF-51 pattern, twice in one passage of running prose:
        // gear and flaps on the downwind, 114 kt in the groove. The model reproduces it from a
        // full-flap CL increment and an on-speed margin rather than storing the number.
        Assert.InRange(approachKt, 113.0, 115.0);

        // And it must NOT be the clean-stall derivation, which is the trap: 1.14 x clean gives
        // this aeroplane 129 kt, fifteen knots fast onto a deck with no bolter.
        double cleanDerived = 1.14 * AirData.StallSpeedKias(air.MassKg, air);
        Assert.True(cleanDerived - approachKt > 12.0,
            $"clean-stall derivation {cleanDerived:F1} kt should be far above measured {approachKt:F1} kt");
    }

    [Fact]
    public void EveryOtherAirframeKeepsTheApproachSpeedItAlreadyHad() {
        // The defaults are the legacy expression exactly: zero flap increment, 1.14 margin. An
        // airframe that has not measured its own approach must not move because the Panther did.
        foreach (AircraftParams air in new[] { FlightModel.Sabre, FlightModel.GliderStrike }) {
            Assert.Equal(0.0, air.ApproachFlapCLIncrement);
            Assert.Equal(1.14, air.ApproachStallMargin);
            Assert.Equal(
                1.14 * AirData.StallSpeedKias(air.MassKg, air) / AirData.MpsToKnots,
                SortieSchedule.ApproachSpeedMps(air.MassKg, air), 6);
        }
    }

    [Fact]
    public void TheScheduleCanAskForMorePowerNotOnlyLess() {
        SortieReference r = PantherReference();

        // THE defect this module exists to fix. The previous solve took Math.Min before
        // differencing, so its energy error was non-negative by construction and its commanded
        // power could never exceed 0.5 — an approach instrument that could only say "come back".
        // Low and slow at four kilometres out must ask for power.
        SortieScheduleState low = SortieSchedule.Solve(
            SortieLeg.Recovery, heightAboveDeckM: 60.0, trueAirspeedMps: 70.0,
            distanceToGoM: 4_000.0, r);
        Assert.True(low.CommandedPower01 > 0.5,
            $"low and slow should command ADD power, got {low.CommandedPower01:F3}");

        // High and fast on the same geometry must ask for less.
        SortieScheduleState high = SortieSchedule.Solve(
            SortieLeg.Recovery, heightAboveDeckM: 1_500.0, trueAirspeedMps: 180.0,
            distanceToGoM: 4_000.0, r);
        Assert.True(high.CommandedPower01 < 0.5,
            $"high and fast should command REDUCE power, got {high.CommandedPower01:F3}");
        Assert.Equal(SortieLimit.Energy, high.Limit);
    }

    [Fact]
    public void TheLaunchLegCommandsEverythingTheEngineHas() {
        SortieReference r = PantherReference();
        SortieScheduleState onDeck = SortieSchedule.Solve(SortieLeg.OnDeck, 0, 0, 0, r);
        SortieScheduleState launch = SortieSchedule.Solve(SortieLeg.Launch, 5.0, 62.0, 0, r);

        // Full power before the stroke, not after it — the whole reason a two-sided command
        // matters is that the old one could not reach 1.0 at all.
        Assert.Equal(1.0, onDeck.CommandedPower01);
        Assert.Equal(1.0, launch.CommandedPower01);
        // Off the bow below climb speed the aircraft must accelerate, not climb.
        Assert.Equal(SortieLimit.Stall, launch.Limit);
    }

    [Fact]
    public void TargetHeightIsAboveTheDeckSoItCannotLandUnderground() {
        SortieReference r = PantherReference();
        SortieScheduleState groove = SortieSchedule.Solve(
            SortieLeg.Groove, heightAboveDeckM: 30.0, trueAirspeedMps: 58.0,
            distanceToGoM: 500.0, r);

        // 500 m out on a 3.5 degree slope is ~30 m ABOVE THE DECK. The predecessor published an
        // absolute 152.0 m MSL for every mission, which on the Rapier's 192 m strip was forty
        // metres underground; a height above the landing surface cannot express that.
        Assert.InRange(groove.TargetHeightM, 28.0, 33.0);
        Assert.Equal(0.0, SortieSchedule.Solve(
            SortieLeg.Groove, 0.0, 58.0, 0.0, r).TargetHeightM, 6);
    }

    [Fact]
    public void TheWaveOffWindowIsSetByTheEnginesSpoolNotByTheShip() {
        SortieReference panther = PantherReference();
        SortieReference axial = panther with { SpoolUpTauS = FlightModel.Sabre.SpoolUpTau };

        // 600 m at 58 m/s is ~10.3 s to the ramp. The Panther's centrifugal J42 eats 9 s of that
        // getting to 86% thrust; an axial engine eats half. That difference IS the beat.
        SortieScheduleState slow = SortieSchedule.Solve(SortieLeg.Groove, 40, 58, 600, panther);
        SortieScheduleState quick = SortieSchedule.Solve(SortieLeg.Groove, 40, 58, 600, axial);

        Assert.True(slow.WaveOffDecisionS < quick.WaveOffDecisionS,
            "a slower-spooling engine must demand an EARLIER decision");
        Assert.InRange(slow.WaveOffDecisionS, 0.5, 2.5);
        // Inside the spool window the decision is already gone.
        Assert.Equal(0.0, SortieSchedule.Solve(SortieLeg.Groove, 10, 58, 200, panther)
            .WaveOffDecisionS);
    }

    [Fact]
    public void TheKoreaSortieStartsOnTheCatapultAndFliesThePanther() {
        BeatSetup sortie = Beats.KoreaSortie();

        Assert.True(sortie.StartsOnCatapult, "a sortie begins on the deck, not on final");
        Assert.Equal(FlightModel.F9F2Panther, sortie.PlayerAir);
        Assert.Equal("aircraft.f9f2.v1", sortie.PlayerAircraft.Id);
        Assert.Equal(OpponentPresence.None, sortie.OpponentPresence);
        Assert.Null(sortie.InitialOpponent);
        Assert.Equal(Carrier.DeckConfiguration.Axial, sortie.Carrier!.Configuration);
        Assert.True(sortie.RecoveryCompletesSortie, "getting aboard should end the day");
        Assert.NotNull(sortie.RecoveryPlan);
        Assert.Equal(Ukraine2030sTheatre.KoreaCarrierCell, sortie.EnvironmentIdentity);
        Assert.Equal(Ukraine2030sTheatre.CoastalCell,
            Beats.KoreaCarrierApproach().EnvironmentIdentity);
        Assert.NotEqual(
            Beats.KoreaCarrierApproach().EnvironmentIdentity.LocationId,
            sortie.EnvironmentIdentity.LocationId);
    }

    [Fact]
    public void ThePantherActuallyGetsOffTheDeck() {
        // Code gates are not gameplay gates. Everything above can pass while the aeroplane sits on
        // the bow, so fly it: stage the beat the menu launches and step the real kernel until the
        // catapult has finished with it.
        var session = new SimulationSession();
        session.StartBeat(Beats.KoreaSortie);
        ITerrainSurface terrain = ProductionTerrain(session.Beat);
        session.SetTerrainSurface(terrain);
        Carrier ship = session.Carrier!;

        Assert.True(terrain.TrySample(ship.Position.X, ship.Position.Z,
            out TerrainSample launchSurface));
        Assert.Equal(TerrainSurfaceKind.Water, launchSurface.Kind);
        Assert.Equal(0.0, launchSurface.HeightM, 6);

        double parkedHeight = ship.DeckFrame(session.Player.State.Position).height;
        // Spotted, brakes on: at rest RELATIVE TO THE DECK. Its world speed is the ship's 3 m/s,
        // because the aeroplane is riding a moving carrier — which is the whole difficulty here.
        Assert.Equal(ship.SpeedMps, session.Player.State.Speed, 1);

        session.Begin();

        bool sawStroke = false;
        bool stayedOverAuthoritativeWater = true;
        double bestHeight = parkedHeight;
        double bestSpeed = 0.0;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz; tick++) {
            session.StepFixed();
            sawStroke |= session.Catapult.IsActive;
            bestHeight = Math.Max(bestHeight, ship.DeckFrame(session.Player.State.Position).height);
            bestSpeed = Math.Max(bestSpeed, session.Player.State.Speed);
            Assert.True(terrain.TrySample(
                session.Player.State.Position.X,
                session.Player.State.Position.Z,
                out TerrainSample underAircraft));
            stayedOverAuthoritativeWater &= underAircraft.Kind == TerrainSurfaceKind.Water;
            if (session.PlayerTerminalState == AircraftTerminalState.Impacted) break;
        }

        Assert.True(sawStroke, "the catapult never fired — the beat is not actually on the cat");
        Assert.True(stayedOverAuthoritativeWater,
            "the authored launch route left the dedicated open-water terrain cell");
        terrain.TrySample(
            session.Player.State.Position.X,
            session.Player.State.Position.Z,
            out TerrainSample surface);
        Assert.True(session.PlayerTerminalState != AircraftTerminalState.Impacted,
            $"Panther impacted at {session.Player.State.Position}; "
                + $"terrain {surface.HeightM:F1} m ({surface.Kind})");
        // Off the bow and climbing away, not mushing into the sea off the end of a straight deck.
        Assert.True(bestHeight > parkedHeight + 30.0,
            $"only reached {bestHeight:F1} m above the deck (parked at {parkedHeight:F1})");
        // And at a speed the wing can actually use: comfortably above on-speed.
        double onSpeed = SortieSchedule.ApproachSpeedMps(
            FlightModel.F9F2Panther.MassKg, FlightModel.F9F2Panther);
        Assert.True(bestSpeed > onSpeed,
            $"never exceeded approach speed ({bestSpeed:F1} vs on-speed {onSpeed:F1} m/s)");
    }

    [Fact]
    public void ThePantherIsReachableFromTheBuiltInCatalogue() {
        // The whole point. Before this the F9F-2 and the paddles/LSO machinery built for it were
        // reachable only from a unit test.
        BeatSetup fromCatalogue = Beats.BuiltIn(14);

        Assert.Equal("aircraft.f9f2.v1", fromCatalogue.PlayerAircraft.Id);
        Assert.True(fromCatalogue.StartsOnCatapult);
        // And the recovery-only drill it grew out of is still there, unchanged.
        Assert.False(Beats.KoreaCarrierApproach().StartsOnCatapult);
    }

    [Fact]
    public void TheIndexTheMenuSendsSurvivesTheSessionsOwnValidator() {
        // Beats.BuiltIn(14) answering correctly is NOT enough. StartBeat validates the index
        // against LastBuiltInIndex and SILENTLY clamps a bad one to Perch — no throw, no warning.
        // That is how the browser reached a boot card reading "F9F-2 PANTHER / KOREA SORTIE" over
        // a running mission.perch-attack.v1 in an F-86 while every unit test was green.
        Assert.True(Beats.IsBuiltInIndex(14), "the menu sends 14; the validator must accept it");

        var session = new SimulationSession();
        session.StartBeat(14);

        Assert.Equal("aircraft.f9f2.v1", session.Beat.PlayerAircraft.Id);
        Assert.Equal("mission.korea.panther-sortie.v1", session.Beat.Mission!.Id);
        Assert.True(session.Beat.StartsOnCatapult);
    }
}
