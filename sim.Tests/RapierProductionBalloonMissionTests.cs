using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Production contract for catalogue card 12. The random RapierGoFly laboratory intentionally
/// remains testable elsewhere; these tests pin the clean player-facing lesson and its one pass.
/// </summary>
public class RapierProductionBalloonMissionTests {
    const double BalloonAltitudeM = 33_500.0;
    readonly ITestOutputHelper _output;

    public RapierProductionBalloonMissionTests(ITestOutputHelper output) => _output = output;

    static AircraftState PlayerState(
        double altitudeM, double speedMps, double gamma = 0.0,
        double chi = 0.0, double zM = 0.0) =>
        new(new Vec3D(0.0, altitudeM, zM), speedMps, gamma, chi, 0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);

    static RapierMissionGuidance RawRapierGuidance(SimulationSession session) {
        // Diagnostic access until SimulationSession projects the already-public guidance field.
        System.Reflection.FieldInfo field = typeof(SimulationSession).GetField(
            "_rapierMissionGuidance",
            System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Rapier guidance field is unavailable");
        return (RapierMissionGuidance)(field.GetValue(session)
            ?? throw new InvalidOperationException("Rapier guidance is unavailable"));
    }

    static RapierMissionGuidance StepBalloon(
        RapierMissionDirector director,
        double altitudeM,
        double mach,
        double gamma,
        double contactRangeM,
        int liveOpponentCount = 1,
        double noseErrorDeg = 5.0,
        bool opening = false,
        double homeRangeM = 300_000.0,
        bool recovered = false,
        double? playerChiRad = null) {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speedMps = mach * air.SpeedOfSoundMps;
        AircraftState player = PlayerState(
            altitudeM, speedMps, gamma,
            playerChiRad ?? (opening ? Math.PI : 0.0));
        double verticalSeparationM = BalloonAltitudeM - altitudeM;
        double forwardSeparationM = Math.Sqrt(Math.Max(0.0,
            contactRangeM * contactRangeM
                - verticalSeparationM * verticalSeparationM));
        AircraftState balloon = new(
            new Vec3D(0.0, BalloonAltitudeM, forwardSeparationM),
            Speed: 8.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: FlightModel.HighAltitudeBalloonPublicDataSurrogate.MassKg);
        Vec3D home = new(0.0, 120.0, -homeRangeM);
        Vec3D recoveryInitial = new(0.0, 1_120.0, -Math.Max(16_000.0, homeRangeM - 20_000.0));
        return director.Step(
            player,
            balloon,
            speedMps,
            StandardAtmosphere1976.Instance,
            FlightModel.RapierPublicDataSurrogate,
            catapultActive: false,
            liveOpponentCount: liveOpponentCount,
            pursuitActive: false,
            pursuerCount: 0,
            pursuitRangeM: 0.0,
            home,
            recoveryInitial,
            recovered,
            patternOnly: false,
            zoomLobProfile: true,
            gunDroneEgress: false,
            job: RapierJobKind.Balloon,
            noseOnVelocityErrorDeg: noseErrorDeg,
            fuelLb: 5_000.0,
            reserveFuelLb: 1_200.0);
    }

    static void WalkToBallisticCoast(RapierMissionDirector director) {
        Assert.Equal(RapierMissionPhase.Climb,
            StepBalloon(director, 5_000.0, 0.9, 0.15, 300_000.0).Phase);
        Assert.Equal(RapierMissionPhase.Accelerate,
            StepBalloon(director, ReachFightDirector.ClimbTopM, 1.2, 0.08,
                280_000.0).Phase);
        Assert.Equal(RapierMissionPhase.RamClimb,
            StepBalloon(director, 16_000.0, 2.3, 0.07, 220_000.0).Phase);
        Assert.Equal(RapierMissionPhase.Intercept,
            StepBalloon(director, ReachFightDirector.BalloonDashAltitudeM,
                3.8, 0.01, 90_000.0).Phase);

        RapierMissionGuidance zoom = StepBalloon(
            director, ReachFightDirector.BalloonDashAltitudeM,
            RapierMissionDirector.BalloonDesignDashMach, 0.0,
            ReachFightDirector.BalloonZoomEntryRangeM - 1_000.0);
        Assert.Equal(RapierMissionPhase.ZoomPull, zoom.Phase);
        Assert.Equal(0.0, zoom.TargetGammaDeg, 6);
        Assert.InRange(zoom.Command.CommandedAlphaRad,
            RapierV2Design.InletDesignFlowIncidenceRad
                + RapierV2Design.InletUnstartTripDeviationRad,
            RapierMissionDirector.BalloonPullAlphaDeg * Math.PI / 180.0);
        Assert.Equal(0.0, zoom.Command.Throttle);
        Assert.False(zoom.Command.EnvelopeOverride);
        double inletDeviationRad = Math.Abs(zoom.Command.CommandedAlphaRad
            - RapierV2Design.InletDesignFlowIncidenceRad);
        Assert.True(inletDeviationRad > RapierV2Design.InletUnstartTripDeviationRad,
            "the stored-energy pull must truthfully accept a deliberate inlet unstart");
        Assert.Contains("IDLE PULL", zoom.Cue);
        Assert.Contains("PREDICT UNLOAD", zoom.Cue);
        Assert.DoesNotContain("γ→24°", zoom.Cue);

        // A finite 20-degree pull reaches this representative state; the production zero-lift
        // drag predictor sees the first conservative gun window twice before it unloads.
        const double unloadGammaRad = 14.58 * Math.PI / 180.0;
        RapierMissionGuidance firstPrediction = StepBalloon(
            director, 30_820.0, 3.43, unloadGammaRad, 13_820.0);
        Assert.Equal(RapierMissionPhase.ZoomPull, firstPrediction.Phase);
        RapierMissionGuidance coast = StepBalloon(
            director, 30_820.0, 3.43, unloadGammaRad, 13_820.0);
        Assert.Equal(RapierMissionPhase.ZoomCoast, coast.Phase);
        Assert.Equal(0.0, coast.Command.GDemand);
        Assert.Contains("ZERO-LIFT COAST", coast.Cue);
    }

    static void WalkToApexAttack(RapierMissionDirector director) {
        WalkToBallisticCoast(director);
        // At three kilometres the closing M3.2 shooter has an exact sub-1.9-second M61 lead whose
        // gravity-corrected bore error remains inside the 56 m balloon cone. Six kilometres was a
        // retired spherical-range fixture and cannot satisfy the production ballistic gate.
        RapierMissionGuidance attack = StepBalloon(
            director, BalloonAltitudeM, 3.2, 0.0, 3_000.0);
        Assert.Equal(RapierMissionPhase.Attack, attack.Phase);
    }

    [Fact]
    public void CatalogueCardIsDeterministicSingleGenuineBalloon() {
        BeatSetup first = Beats.BuiltIn(12);
        BeatSetup second = Beats.BuiltIn(12);
        ScriptedInterceptConfig mission = Assert.IsType<ScriptedInterceptConfig>(
            first.ScriptedIntercept);

        Assert.Equal(first.Name, second.Name);
        Assert.Equal(first.Bandit, second.Bandit);
        Assert.Equal("Rapier — high-altitude balloon intercept", first.Name);
        Assert.Equal(RapierJobKind.Balloon, mission.Job);
        Assert.Equal(1, mission.FormationSize);
        Assert.Equal(0, mission.ShortRangeMissiles);
        Assert.Equal(0, mission.DogfightingDrones);
        Assert.Equal(0, mission.PursuerCount);
        Assert.False(mission.AutomationDefaultEnabled);
        Assert.True(mission.RecoveryRequired);
        Assert.True(mission.ZoomLobProfile);
        Assert.False(mission.DeterministicSwarmWipe);
        Assert.Equal(RapierComputerFailure.None, mission.ComputerFailureAtZoomCoast);
        Assert.False(first.UsesReactiveBandit);
        Assert.False(first.OpenSegmentNav);
        Assert.Equal(first.PlayerAir.MaxThrustFraction, first.InitialThrottle, 6);

        Assert.Equal(FlightModel.HighAltitudeBalloonPublicDataSurrogate,
            first.BanditAir);
        Assert.NotEqual(FlightModel.GliderStrike, first.BanditAir);
        Assert.Equal(AircraftCapability.HighAltitudeWeatherBalloonTarget,
            first.BanditAircraft);
        Assert.Contains("high-altitude-weather-balloon",
            first.BanditAircraft.PresentationId);
        Assert.True(first.BanditAir.BuoyantVolumeM3 > 500_000.0);
        Assert.Equal(0.0, first.BanditAir.ThrustMaxN);
        Assert.InRange(first.Bandit.Position.Y,
            100_000.0 * 0.3048, 110_000.0 * 0.3048);
        Assert.Equal(-372_000.0, first.Bandit.Position.X, 6);
        Assert.Equal(186_000.0, first.Bandit.Position.Z, 6);
        Assert.InRange(first.Bandit.Speed, 0.0, 15.0);

        CombatConfig combat = first.CombatRules;
        Assert.Equal(0, combat.OpponentAmmo);
        Assert.Equal(1, combat.OpponentHitsToDefeat);
        Assert.Equal(120, combat.PlayerAmmo);
        Assert.Equal(56.0, combat.PlayerTargetHitRadiusM);
        Assert.False(combat.PlayerInfiniteAmmo);
        Assert.Equal(GunProfiles.M61A2PublicDataSurrogate, combat.PlayerGunProfile);
        Assert.Equal(MissionEconomicMode.Arcade, first.MissionIdentity.EconomicMode);
        double canonicalFuelLb = RapierV2Design.FuelCapacityKg * 2.20462262;
        Assert.Equal(canonicalFuelLb, first.FuelLoadout.CapacityLb, 3);
        Assert.Equal(canonicalFuelLb, first.FuelLoadout.InitialFuelLb, 3);
    }

    [Fact]
    public void ProductionStripLaunchesByCatapultAndArrestsAtRunwayMidpoint() {
        BeatSetup beat = Beats.BuiltIn(12);
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);

        Assert.True(beat.StartsOnCatapult);
        Assert.Equal(520.0, beat.CatapultStrokeM);
        Assert.Equal(120.0, beat.CatapultEndSpeedMps);
        Assert.Equal(12.0, beat.CatapultRampAngleRad!.Value * 180.0 / Math.PI, 6);
        double longitudinalAccelerationMps2 = beat.CatapultEndSpeedMps!.Value
            * beat.CatapultEndSpeedMps.Value / (2.0 * beat.CatapultStrokeM!.Value);
        double longitudinalG = longitudinalAccelerationMps2 / FlightModel.G0;
        double combinedG = Math.Sqrt(longitudinalG * longitudinalG
            + CatapultLaunchModel.RampNormalG * CatapultLaunchModel.RampNormalG);
        double deliveredEnergyJ = 0.5 * beat.Player.Mass
            * beat.CatapultEndSpeedMps.Value * beat.CatapultEndSpeedMps.Value;
        Assert.True(longitudinalG <= 6.0,
            $"launcher longitudinal acceleration is {longitudinalG:F2} g");
        Assert.True(combinedG <= beat.PlayerAir.PositiveStructuralLimitG,
            $"launcher combined acceleration is {combinedG:F2} g");
        Assert.InRange(deliveredEnergyJ, 85_000_000.0, 86_000_000.0);
        Assert.Equal(Carrier.PlatformKind.FixedArrestingStrip, strip.Kind);
        Assert.Equal(3_048.0, strip.DeckLengthM);
        Assert.Equal(0.0, strip.WireDatumAlongM);
        Assert.Equal(0.0, strip.WireAlongM(3));
        Assert.Equal(-strip.DeckLengthM * 0.35, strip.TouchdownAlongM, 6);
        Assert.True(beat.RecoveryCompletesSortie);
        Assert.NotNull(beat.RecoveryPlan);
    }

    [Fact]
    public void BalloonZoomIsLockedBehindLegalMachFourThinAirCondition() {
        AtmosphericState shelf = StandardAtmosphere1976.Instance.Sample(
            ReachFightDirector.BalloonDashAltitudeM);
        double speedMps = RapierMissionDirector.BalloonDesignDashMach
            * shelf.SpeedOfSoundMps;
        double qPa = 0.5 * shelf.DensityKgM3 * speedMps * speedMps;
        CombinedCycleThrustFractions thrust = TurboRamjetPerformanceMap.ThrustComponents(
            RapierMissionDirector.BalloonDesignDashMach,
            shelf.TemperatureK, shelf.DensityKgM3);

        Assert.Equal(RapierV2Design.DesignMach,
            RapierMissionDirector.BalloonDesignDashMach, 6);
        Assert.Equal(RapierV2Design.DesignMach,
            ReachFightDirector.BalloonZoomGateMach, 6);
        Assert.True(ReachFightDirector.BalloonZoomGateMach >= 4.0);
        Assert.True(qPa < RapierAerodynamics.HighDynamicPressurePlacardPa,
            $"M4 shelf must be below the 550 KIAS placard: {qPa / 1000.0:F1} kPa");
        Assert.True(thrust.Ramjet > 0.0,
            "the ram stream, not a turbine-only fiction, must still be producing thrust at M4");
        Assert.True(TurboRamjetPerformanceMap.RamSpillStartMach
            > RapierMissionDirector.BalloonDesignDashMach);

        var reachFight = new ReachFightDirector();
        ReachFightDecision tooSlow = reachFight.Decide(
            RapierMissionPhase.Intercept,
            ReachFightDirector.BalloonDashAltitudeM,
            mach: 3.95,
            qPa,
            gammaRad: 0.0,
            // Even ordinary attack range must not bypass the lesson.
            contactRangeM: 20_000.0,
            fuelLb: 5_000.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: true,
            lobSkip: 0,
            inZoomPhases: false,
            apexBalloonProfile: true);
        Assert.Equal(RapierMissionPhase.Intercept, tooSlow.SuggestedPhase);
        Assert.Equal("balloon_m4_dash", tooSlow.PhaseReason);

        ReachFightDecision earned = reachFight.Decide(
            RapierMissionPhase.Intercept,
            ReachFightDirector.BalloonDashAltitudeM,
            mach: RapierMissionDirector.BalloonDesignDashMach,
            qPa,
            gammaRad: 0.0,
            contactRangeM: ReachFightDirector.BalloonZoomEntryRangeM,
            fuelLb: 5_000.0,
            reserveFuelLb: 1_200.0,
            zoomLobPreferred: true,
            lobSkip: 0,
            inZoomPhases: false,
            apexBalloonProfile: true);
        Assert.Equal(RapierMissionPhase.ZoomPull, earned.SuggestedPhase);
        Assert.Equal("balloon_zoom_entry", earned.PhaseReason);

        var mission = new RapierMissionDirector();
        RapierMissionGuidance climb = StepBalloon(
            mission, 5_000.0, 0.9, 0.15, 300_000.0);
        Assert.Equal(RapierMissionPhase.Climb, climb.Phase);
        Assert.Contains("RIDE 35 KPA", climb.Cue);
        Assert.DoesNotContain("M2.2", climb.Cue);
        Assert.DoesNotContain("FL560", climb.Cue);
        RapierMissionGuidance accelerate = StepBalloon(
            mission, ReachFightDirector.ClimbTopM, 1.2, 0.08, 280_000.0);
        Assert.Equal(RapierMissionPhase.Accelerate, accelerate.Phase);
        Assert.Contains("35 KPA", accelerate.Cue);
        Assert.DoesNotContain("M2.2", accelerate.Cue);
        Assert.DoesNotContain("FL700", accelerate.Cue);
        RapierMissionGuidance ramClimb = StepBalloon(
            mission, 16_000.0, 2.3, 0.07, 220_000.0);
        Assert.Equal(RapierMissionPhase.RamClimb, ramClimb.Phase);
        Assert.Equal(RapierV2Design.DesignMach, ramClimb.AuthoredTargetMach, 6);
        AtmosphericState ramAir = StandardAtmosphere1976.Instance.Sample(16_000.0);
        double expectedRamAltitudeM = EnergySchedule.ClimbScheduleAltitudeM(
            StandardAtmosphere1976.Instance,
            2.3 * ramAir.SpeedOfSoundMps
                + RapierMissionDirector.RapierScheduleSpeedLeadMps(
                    2.3 * ramAir.SpeedOfSoundMps),
            ReachFightDirector.ClimbTopM);
        Assert.Equal(expectedRamAltitudeM / 0.3048,
            ramClimb.TargetAltitudeFt, 6);
        Assert.Contains("35 KPA", ramClimb.Cue);
        Assert.Contains("24 KM", ramClimb.Cue);
        Assert.DoesNotContain("FL700", ramClimb.Cue);
        RapierMissionGuidance dash = StepBalloon(
            mission, ReachFightDirector.BalloonDashAltitudeM,
            3.8, 0.01, 90_000.0);
        Assert.Equal(RapierMissionPhase.Intercept, dash.Phase);
        Assert.Equal(RapierV2Design.DesignMach, dash.AuthoredTargetMach, 6);
        Assert.Equal(RapierV2Design.DesignMach, dash.CommandedMach, 6);
        Assert.Contains("24 KM SHELF", dash.Cue);
        Assert.DoesNotContain("FL700", dash.Cue);
        Assert.True(dash.SkinMachLimit > RapierV2Design.DesignMach,
            "the effective warm-panel screen must preserve the canonical M4.2 design point");
    }

    [Fact]
    public void BalloonEnergyDirectorLeadsTheMovingScheduleAndProtectsQBeforeThePlacard() {
        var director = new RapierMissionDirector();
        Assert.Equal(RapierMissionPhase.Climb,
            StepBalloon(director, 5_000.0, 0.9, 0.15, 300_000.0).Phase);
        Assert.Equal(RapierMissionPhase.Accelerate,
            StepBalloon(director, ReachFightDirector.ClimbTopM,
                1.2, 0.08, 280_000.0).Phase);

        const double highQAltitudeM = 12_500.0;
        const double highQMach = 2.3;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(highQAltitudeM);
        double speedMps = highQMach * air.SpeedOfSoundMps;
        double qPa = 0.5 * air.DensityKgM3 * speedMps * speedMps;
        Assert.True(qPa > RapierMissionDirector.RapierQProtectionHardPa);

        RapierMissionGuidance protectedClimb = StepBalloon(
            director, highQAltitudeM, highQMach, 0.0, 220_000.0);
        Assert.Equal(RapierMissionPhase.RamClimb, protectedClimb.Phase);
        Assert.Equal(RapierMissionDirector.RapierQProtectionGammaDeg,
            protectedClimb.TargetGammaDeg, 6);
        Assert.Equal(0.0, protectedClimb.Command.Throttle, 6);

        double currentSpeedScheduleM = EnergySchedule.ClimbScheduleAltitudeM(
            StandardAtmosphere1976.Instance, speedMps, ReachFightDirector.ClimbTopM);
        Assert.True(protectedClimb.TargetAltitudeFt * 0.3048 > currentSpeedScheduleM,
            "the production profile must lead the rising schedule instead of chasing it");
    }

    [Fact]
    public void ApexWindowIsOneOwnshipGunPassWithNoAutomaticWeapon() {
        var director = new RapierMissionDirector();
        WalkToApexAttack(director);

        RapierMissionGuidance attack = StepBalloon(
            director, BalloonAltitudeM, 3.2, 0.0, 5_000.0);
        Assert.Equal(RapierMissionPhase.Attack, attack.Phase);
        Assert.Equal("balloon_ballistic_body_axis_window", attack.PhaseReason);
        Assert.Contains("GUNS", attack.Cue);
        Assert.Contains("ONE PASS", attack.Cue);
        Assert.DoesNotContain("DRONE", attack.Cue);
        Assert.DoesNotContain("AUTO", attack.Cue);
        Assert.Equal(0.0, attack.Command.Throttle);
        Assert.Equal(1, attack.LobSkipMax);

        RapierMissionGuidance afterHit = StepBalloon(
            director, BalloonAltitudeM, 3.1, 0.0, 4_000.0,
            liveOpponentCount: 0);
        Assert.Equal(RapierMissionPhase.ReenterAlign, afterHit.Phase);
        Assert.Equal("balloon_hit_reenter", afterHit.PhaseReason);
    }

    [Fact]
    public void AttackRequiresBothPredictiveProvenanceAndLiveBodyAxisSolution() {
        var bodyAxisOnly = new RapierMissionDirector();
        Assert.Equal(RapierMissionPhase.Climb,
            StepBalloon(bodyAxisOnly, 5_000.0, 0.9, 0.15, 300_000.0).Phase);
        Assert.Equal(RapierMissionPhase.Accelerate,
            StepBalloon(bodyAxisOnly, ReachFightDirector.ClimbTopM,
                1.2, 0.08, 280_000.0).Phase);
        Assert.Equal(RapierMissionPhase.RamClimb,
            StepBalloon(bodyAxisOnly, 16_000.0, 2.3, 0.07, 220_000.0).Phase);
        Assert.Equal(RapierMissionPhase.Intercept,
            StepBalloon(bodyAxisOnly, ReachFightDirector.BalloonDashAltitudeM,
                3.8, 0.01, 90_000.0).Phase);
        Assert.Equal(RapierMissionPhase.ZoomPull,
            StepBalloon(bodyAxisOnly, ReachFightDirector.BalloonDashAltitudeM,
                RapierMissionDirector.BalloonDesignDashMach, 0.0,
                ReachFightDirector.BalloonZoomEntryRangeM - 1_000.0).Phase);

        // Cross the target aft without ever earning the predictor's unload provenance. This
        // reaches the real ZoomCoast gate; merely presenting an aligned solution while still in
        // ZoomPull would return before that gate and would not prove the conjunction below.
        RapierMissionGuidance overshootCoast = StepBalloon(
            bodyAxisOnly, ReachFightDirector.BalloonDashAltitudeM,
            RapierMissionDirector.BalloonDesignDashMach, 0.0, 50_000.0,
            opening: true);
        Assert.Equal(RapierMissionPhase.ZoomCoast, overshootCoast.Phase);
        Assert.Equal("balloon_pull_overshoot_coast", overshootCoast.PhaseReason);
        RapierMissionGuidance noProvenance = StepBalloon(
            bodyAxisOnly, BalloonAltitudeM, 3.2, 0.0, 3_000.0);
        Assert.Equal(RapierMissionPhase.ZoomCoast, noProvenance.Phase);
        Assert.NotEqual("balloon_ballistic_body_axis_window", noProvenance.PhaseReason);

        var provenanceOnly = new RapierMissionDirector();
        WalkToBallisticCoast(provenanceOnly);
        const double offAxisChiRad = 4.0 * Math.PI / 180.0;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(BalloonAltitudeM);
        AircraftState player = PlayerState(
            BalloonAltitudeM, 3.2 * air.SpeedOfSoundMps,
            gamma: 0.0, chi: offAxisChiRad);
        AircraftState balloon = new(
            new Vec3D(0.0, BalloonAltitudeM, 3_000.0),
            Speed: 8.0, Gamma: 0.0, Chi: 0.0, Bank: 0.0,
            Mass: FlightModel.HighAltitudeBalloonPublicDataSurrogate.MassKg);
        GunBallisticSolution offAxis = GunKill.EvaluateBallisticLead(
            player, balloon, GunProfiles.M61A2PublicDataSurrogate,
            RapierMissionDirector.BalloonTargetHitRadiusM);
        Assert.True(offAxis.HasLeadSolution);
        Assert.False(offAxis.BodyAxisOnSolution);

        RapierMissionGuidance noBodyAxis = StepBalloon(
            provenanceOnly, BalloonAltitudeM, 3.2, 0.0, 3_000.0,
            playerChiRad: offAxisChiRad);
        Assert.Equal(RapierMissionPhase.ZoomCoast, noBodyAxis.Phase);
        Assert.NotEqual(RapierMissionPhase.Attack, noBodyAxis.Phase);
    }

    [Fact]
    public void MissStillReentersRelightsReturnsAndOffersHonestRecovery() {
        var director = new RapierMissionDirector();
        WalkToApexAttack(director);

        // The balloon is still alive, but it is now behind the aircraft. That is a miss, not
        // permission to turn back or an invented kill.
        RapierMissionGuidance reenter = StepBalloon(
            director, BalloonAltitudeM, 3.0, 0.0, 6_000.0,
            liveOpponentCount: 1, opening: true);
        Assert.Equal(RapierMissionPhase.ReenterAlign, reenter.Phase);
        Assert.Equal("balloon_pass_missed_reenter", reenter.PhaseReason);
        Assert.Contains("PASS COMPLETE", reenter.Cue);

        RapierMissionGuidance dip = StepBalloon(
            director, 23_000.0, 2.5, -0.08, 35_000.0,
            liveOpponentCount: 1, noseErrorDeg: 5.0, opening: true);
        Assert.Equal(RapierMissionPhase.DipRelight, dip.Phase);
        Assert.Equal("balloon_dip_for_relight", dip.PhaseReason);
        Assert.Equal(4_000.0, RapierMissionDirector.RelightDynamicPressurePa);
        Assert.Contains("BUILD Q", dip.Cue);

        RapierMissionGuidance returning = StepBalloon(
            director, 23_000.0, 2.5, -0.02, 60_000.0,
            liveOpponentCount: 1, noseErrorDeg: 3.0, opening: true,
            homeRangeM: 300_000.0);
        Assert.Equal(RapierMissionPhase.ReturnToBase, returning.Phase);
        Assert.Equal("balloon_ram_relit_rtb", returning.PhaseReason);
        Assert.Contains("M2.0 / FL750", returning.Cue);

        RapierMissionGuidance recovery = StepBalloon(
            director, 15_000.0, 1.5, -0.03, 120_000.0,
            liveOpponentCount: 1, noseErrorDeg: 3.0, opening: true,
            homeRangeM: 100_000.0);
        Assert.Equal(RapierMissionPhase.Recovery, recovery.Phase);
        Assert.Equal("balloon_home_leq_150km", recovery.PhaseReason);
        Assert.Contains("RECOVERY", recovery.Cue);
    }

    [Fact]
    public void OptionalAutomationDemoPhysicallyEarnsMachFourAndTheApexWindow() {
        var session = new SimulationSession(
            beatIndex: 12,
            weather: KoreaWeatherPresets.ForBeat(12));
        session.DecisionCaptureEnabled = false;
        session.Begin();
        session.SetRapierAutomationEnabled(true);

        double initialFuelLb = session.PlayerFuel.FuelLb;
        double maximumMach = 0.0;
        double maximumDynamicPressurePa = 0.0;
        double maximumSkinTemperatureK = 0.0;
        double maximumThermalEquilibriumK = 0.0;
        double maximumZoomPullAlphaDeg = double.NegativeInfinity;
        double maximumZoomPullCommandedAlphaDeg = double.NegativeInfinity;
        double maximumZoomPullNz = double.NegativeInfinity;
        string maximumMachState = "";
        string firstMachThreeState = "";
        string firstMachThreePointFiveState = "";
        string firstLegalDashState = "";
        double[] energyThresholds = [0.8, 1.0, 1.2, 1.5, 2.0, 2.2];
        int nextEnergyThreshold = 0;
        var energyMilestones = new List<string>();
        bool sawZoom = false;
        bool sawApexWindow = false;
        bool shotCommitted = false;
        bool releaseTriggerAfterStep = false;
        bool sawPhysicalGunSolution = false;
        bool sawMachFourShelf = false;
        bool sawCatapultHold = session.Catapult.Phase
            == CatapultLaunchModel.LaunchPhase.Hold;
        bool sawCatapultStroke = session.Catapult.Phase
            == CatapultLaunchModel.LaunchPhase.Stroke;
        bool sawCatapultHandoff = false;
        double maximumCatapultDistanceM = session.Catapult.DistanceM;
        double maximumCatapultSpeedMps = session.Catapult.RelativeSpeedMps;
        bool sawInletUnstart = false;
        bool sawPhysicalRelightAfterUnstart = false;
        bool sawDipRelight = false;
        bool sawReturnToBase = false;
        bool sawRecovery = false;
        bool observedRecoveryEntry = false;
        bool cleanAtHighAltitudeRecoveryEntry = false;
        bool preRequestRecoveryConfigurationViolation = false;
        bool sawRecoveryConfigurationRequestUnderPlacard = false;
        bool sawRecoveryConfigurationRequestBeforeGateOne = false;
        bool configurationLockedBeforeGateOne = false;
        int attackEntries = 0;
        int triggerEdges = 0;
        int highestRecoveryGate = 0;
        int lastRecoveryGate = -1;
        var phaseTimeline = new List<string>();
        var recoveryTimeline = new List<string>();
        var zoomPullTimeline = new List<string>();
        var attackTimeline = new List<string>();
        RapierMissionDirector.BalloonCoastPrediction bestCoastPrediction = default;
        double bestPredictedRangeM = double.PositiveInfinity;
        string bestCoastPredictionState = "";
        RapierMissionPhase lastPhase = RapierMissionPhase.Unavailable;
        int maximumTicks = checked((int)(45 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            if (releaseTriggerAfterStep) {
                session.FeedKey(GKey.Trigger, false);
                releaseTriggerAfterStep = false;
            }
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(
                session.Player.State.Position.Y);
            double mach = session.Player.AirspeedMps / air.SpeedOfSoundMps;
            maximumDynamicPressurePa = Math.Max(
                maximumDynamicPressurePa, session.Player.DynamicPressurePa);
            maximumSkinTemperatureK = Math.Max(
                maximumSkinTemperatureK, session.Player.SkinTemperatureK);
            maximumThermalEquilibriumK = Math.Max(maximumThermalEquilibriumK,
                session.Player.AerothermalZoneEquilibriumTemperatureK);
            sawCatapultHold |= session.Catapult.Phase
                == CatapultLaunchModel.LaunchPhase.Hold;
            sawCatapultStroke |= session.Catapult.Phase
                == CatapultLaunchModel.LaunchPhase.Stroke;
            sawCatapultHandoff |= sawCatapultStroke
                && session.Catapult.Phase == CatapultLaunchModel.LaunchPhase.None
                && session.TimeSeconds < 20.0;
            maximumCatapultDistanceM = Math.Max(
                maximumCatapultDistanceM, session.Catapult.DistanceM);
            maximumCatapultSpeedMps = Math.Max(
                maximumCatapultSpeedMps, session.Catapult.RelativeSpeedMps);
            sawMachFourShelf |= session.RapierPhase is RapierMissionPhase.Intercept
                    or RapierMissionPhase.ZoomPull
                && mach >= ReachFightDirector.BalloonZoomGateMach - 0.02
                && session.Player.State.Position.Y >= 23_500.0
                && session.Player.State.Position.Y <= 25_500.0
                && session.Player.DynamicPressurePa >= 30_000.0
                && session.Player.DynamicPressurePa <= 42_000.0;
            sawInletUnstart |= session.Player.InletUnstarted;
            sawPhysicalRelightAfterUnstart |= sawInletUnstart
                && !session.Player.InletUnstarted
                && session.Player.DynamicPressurePa
                    >= RapierMissionDirector.RelightDynamicPressurePa
                && session.RapierRamjetThrustN > 1_000.0
                && session.RapierPhase is RapierMissionPhase.ReturnToBase
                    or RapierMissionPhase.Recovery;
            sawDipRelight |= session.RapierPhase == RapierMissionPhase.DipRelight;
            sawReturnToBase |= session.RapierPhase == RapierMissionPhase.ReturnToBase;
            sawRecovery |= session.RapierPhase == RapierMissionPhase.Recovery;
            if (!observedRecoveryEntry
                && session.RapierPhase == RapierMissionPhase.Recovery) {
                observedRecoveryEntry = true;
                cleanAtHighAltitudeRecoveryEntry =
                    session.Player.State.Position.Y > 20_000.0
                    && session.ConfigurationTarget == FlightConfigurationTarget.Combat
                    && session.PlayerSystems.AllGearUpAndLocked
                    && Math.Max(session.PlayerSystems.LeftFlapDegrees,
                        session.PlayerSystems.RightFlapDegrees) <= 0.25
                    && !session.Controls.ApproachMode
                    && !session.RapierRecoveryConfigurationRequested;
            }
            if (session.RapierPhase == RapierMissionPhase.Recovery
                && !session.RapierRecoveryConfigurationRequested) {
                preRequestRecoveryConfigurationViolation |=
                    session.ConfigurationTarget != FlightConfigurationTarget.Combat
                    || !session.PlayerSystems.AllGearUpAndLocked
                    || Math.Max(session.PlayerSystems.LeftFlapDegrees,
                        session.PlayerSystems.RightFlapDegrees) > 0.25
                    || session.Controls.ApproachMode;
            }
            if (session.RapierRecoveryConfigurationRequested) {
                double indicatedKts = session.Player.IndicatedAirspeedMps * 1.94384;
                sawRecoveryConfigurationRequestUnderPlacard |= indicatedKts
                    <= AirframeSystemsProfile.RapierSurrogate.GearAndFlapLimitKias;
                sawRecoveryConfigurationRequestBeforeGateOne |=
                    session.RapierRecoveryGate == 0;
            }
            configurationLockedBeforeGateOne |=
                session.RapierRecoveryConfigurationRequested
                && session.RapierRecoveryGate == 0
                && session.ConfigurationTarget == FlightConfigurationTarget.Recovery
                && session.PlayerSystems.AllGearDownAndLocked
                && Math.Min(session.PlayerSystems.LeftFlapDegrees,
                    session.PlayerSystems.RightFlapDegrees)
                    >= AirframeSystemsProfile.RapierSurrogate.FullFlapDegrees - 0.25
                && session.Controls.ApproachMode;
            if (session.RapierPhase == RapierMissionPhase.ZoomPull) {
                maximumZoomPullAlphaDeg = Math.Max(maximumZoomPullAlphaDeg,
                    session.Player.AngleOfAttackRad * 180.0 / Math.PI);
                maximumZoomPullCommandedAlphaDeg = Math.Max(
                    maximumZoomPullCommandedAlphaDeg,
                    RawRapierGuidance(session).Command.CommandedAlphaRad
                        * 180.0 / Math.PI);
                maximumZoomPullNz = Math.Max(maximumZoomPullNz, session.Player.LastNz);
            }
            highestRecoveryGate = Math.Max(highestRecoveryGate,
                session.RapierRecoveryGate);
            if (session.RapierRecoveryGate != lastRecoveryGate
                && session.RapierPhase == RapierMissionPhase.Recovery) {
                lastRecoveryGate = session.RapierRecoveryGate;
                recoveryTimeline.Add($"{session.TimeSeconds:F0}s gate{lastRecoveryGate} "
                    + $"P({session.Player.State.Position.X / 1000.0:F1},"
                    + $"{session.Player.State.Position.Y / 1000.0:F1},"
                    + $"{session.Player.State.Position.Z / 1000.0:F1}) "
                    + $"chi{session.Player.State.Chi * 180.0 / Math.PI:F1} "
                    + $"{session.RapierCircuitLeg} · {session.RapierMissionCue}");
            }
            if (mach > maximumMach) {
                maximumMach = mach;
                double alphaRad = session.Player.AngleOfAttackRad;
                double cl = FlightModel.LiftCoefficient(
                    alphaRad, FlightModel.RapierPublicDataSurrogate, mach);
                RapierMissionGuidance peakGuidance = RawRapierGuidance(session);
                maximumMachState = $"{session.TimeSeconds:F0}s {session.RapierPhase} "
                    + $"FL{session.Player.State.Position.Y / 30.48:F0} M{mach:F2} "
                    + $"gamma{session.Player.State.Gamma * 180.0 / Math.PI:F2}deg "
                    + $"cmdGamma{peakGuidance.TargetGammaDeg:F2}deg "
                    + $"G{peakGuidance.Command.GDemand:F2} "
                    + $"bank{session.Player.State.Bank * 180.0 / Math.PI:F2}deg "
                    + $"alpha{alphaRad * 180.0 / Math.PI:F2}deg CL{cl:F3} "
                    + $"q{session.Player.DynamicPressurePa / 1000.0:F1} "
                    + $"skin{session.Player.SkinTemperatureK:F0}K "
                    + $"eq{session.Player.AerothermalZoneEquilibriumTemperatureK:F0}K "
                    + $"fuel{session.PlayerFuel.FuelLb:F0}lb "
                    + $"cmd{peakGuidance.Command.Throttle:F2}/detent{session.Controls.Throttle:F2}"
                    + $"/spool{session.Player.ThrustFraction:F2} "
                    + $"T{session.Player.LastEngineOperatingPoint.NetThrustN / 1000.0:F1} "
                    + $"Tt{session.RapierTurbineThrustN / 1000.0:F1} "
                    + $"Tr{session.RapierRamjetThrustN / 1000.0:F1} "
                    + $"D{session.Player.LastAerodynamicDragN / 1000.0:F1}kN "
                    + $"inlet{session.Player.InletFlowRecovery:F3}/unstart{session.Player.InletUnstarted} "
                    + $"targetM{session.RapierTargetMach:F2}/FL{session.RapierTargetAltitudeFt / 100.0:F0} "
                    + $"balloonFL{session.Bandit.State.Position.Y / 30.48:F0} "
                    + $"R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0}km";
            }
            string Milestone() => $"{session.TimeSeconds:F0}s {session.RapierPhase} "
                + $"FL{session.Player.State.Position.Y / 30.48:F0} M{mach:F2} "
                + $"X{session.Player.State.Position.X / 1000.0:F0}km "
                + $"mass{session.Player.State.Mass:F0}kg fuel{session.PlayerFuel.FuelLb:F0}lb "
                + $"R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0}km";
            if (firstMachThreeState.Length == 0 && mach >= 3.0)
                firstMachThreeState = Milestone();
            if (firstMachThreePointFiveState.Length == 0 && mach >= 3.5)
                firstMachThreePointFiveState = Milestone();
            if (firstLegalDashState.Length == 0
                && mach >= ReachFightDirector.BalloonZoomGateMach - 0.02)
                firstLegalDashState = Milestone();
            while (nextEnergyThreshold < energyThresholds.Length
                && mach >= energyThresholds[nextEnergyThreshold]) {
                RapierMissionGuidance energyGuidance = RawRapierGuidance(session);
                energyMilestones.Add($"M{energyThresholds[nextEnergyThreshold]:F1} "
                    + $"{session.TimeSeconds:F0}s {session.RapierPhase} "
                    + $"FL{session.Player.State.Position.Y / 30.48:F0} "
                    + $"q{session.Player.DynamicPressurePa / 1000.0:F1}kPa "
                    + $"gamma{session.Player.State.Gamma * 180.0 / Math.PI:F1}/"
                    + $"{energyGuidance.TargetGammaDeg:F1}deg "
                    + $"cmd{energyGuidance.Command.Throttle:F2}"
                    + $"/detent{session.Controls.Throttle:F2}/spool{session.Player.ThrustFraction:F2} "
                    + $"T{session.Player.LastEngineOperatingPoint.NetThrustN / 1000.0:F1}/"
                    + $"D{session.Player.LastAerodynamicDragN / 1000.0:F1}kN "
                    + $"fuel{session.PlayerFuel.FuelLb:F0}lb "
                    + $"R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0}km");
                nextEnergyThreshold++;
            }
            if (session.RapierPhase == RapierMissionPhase.ZoomPull
                && tick % (5 * AircraftSim.TickHz) == 0) {
                RapierMissionGuidance zoomGuidance = RawRapierGuidance(session);
                RapierMissionDirector.BalloonCoastPrediction prediction =
                    RapierMissionDirector.PredictBalloonGunWindowAfterUnload(
                        session.Player.State, session.Bandit.State,
                        session.Player.AtmosphereModel,
                        FlightModel.RapierPublicDataSurrogate);
                if (prediction.ClosestRangeM < bestPredictedRangeM) {
                    bestPredictedRangeM = prediction.ClosestRangeM;
                    bestCoastPrediction = prediction;
                    bestCoastPredictionState = $"{session.TimeSeconds:F0}s "
                        + $"FL{session.Player.State.Position.Y / 30.48:F0} "
                        + $"M{mach:F2} R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F1}km "
                        + $"P({session.Player.State.Position.X / 1000.0:F1},"
                        + $"{session.Player.State.Position.Z / 1000.0:F1}) "
                        + $"T({session.Bandit.State.Position.X / 1000.0:F1},"
                        + $"{session.Bandit.State.Position.Z / 1000.0:F1}) "
                        + $"chi{session.Player.State.Chi * 180.0 / Math.PI:F1}";
                }
                zoomPullTimeline.Add($"{session.TimeSeconds:F0}s "
                    + $"FL{session.Player.State.Position.Y / 30.48:F0} "
                    + $"M{mach:F2} R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0} "
                    + $"gamma{session.Player.State.Gamma * 180.0 / Math.PI:F1}/"
                    + $"{zoomGuidance.TargetGammaDeg:F1} "
                    + $"G{session.Player.LastNz:F2}/{zoomGuidance.Command.GDemand:F2} "
                    + $"alpha{session.Player.AngleOfAttackRad * 180.0 / Math.PI:F1} "
                    + $"q{session.Player.DynamicPressurePa / 1000.0:F1} "
                    + $"inlet{session.Player.InletFlowRecovery:F3}/"
                    + $"{session.Player.InletUnstarted}");
            }
            if (session.RapierPhase == RapierMissionPhase.Attack
                && tick % Math.Max(1, AircraftSim.TickHz / 2) == 0) {
                RapierMissionGuidance attackGuidance = RawRapierGuidance(session);
                Vec3D delta = session.Bandit.State.Position - session.Player.State.Position;
                double targetBearingDeg = Math.Atan2(delta.X, delta.Z) * 180.0 / Math.PI;
                Vec3D gunForward = GunKill.GunDirection(session.Player.State);
                double boreErrorDeg = session.PlayerGun.HasLeadSolution
                    ? Math.Acos(Math.Clamp(
                        gunForward.Dot(session.PlayerGun.LeadDirection), -1.0, 1.0))
                        * 180.0 / Math.PI
                    : double.NaN;
                attackTimeline.Add($"{session.TimeSeconds:F1}s "
                    + $"R{delta.Length / 1000.0:F2}km dH{delta.Y:F0}m "
                    + $"gamma{session.Player.State.Gamma * 180.0 / Math.PI:F1}/"
                    + $"{attackGuidance.TargetGammaDeg:F1} alpha"
                    + $"{session.Player.AngleOfAttackRad * 180.0 / Math.PI:F1} "
                    + $"bank{session.Player.State.Bank * 180.0 / Math.PI:F1}/"
                    + $"{attackGuidance.Command.BankTarget * 180.0 / Math.PI:F1} "
                    + $"chi{session.Player.State.Chi * 180.0 / Math.PI:F1}/"
                    + $"{targetBearingDeg:F1} lead{session.PlayerGun.HasLeadSolution} "
                    + $"tof{session.PlayerGun.LeadTimeOfFlight:F2} bore{boreErrorDeg:F2}");
            }
            if (session.RapierPhase != lastPhase) {
                lastPhase = session.RapierPhase;
                if (lastPhase == RapierMissionPhase.Attack) attackEntries++;
                phaseTimeline.Add($"{session.TimeSeconds:F0}s {lastPhase} "
                    + $"FL{session.Player.State.Position.Y / 30.48:F0} M{mach:F2} "
                    + $"X{session.Player.State.Position.X / 1000.0:F0}km "
                    + $"R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0}");
            }
            sawZoom |= session.RapierPhase is RapierMissionPhase.ZoomPull
                or RapierMissionPhase.ZoomCoast;
            sawApexWindow |= session.RapierPhase == RapierMissionPhase.Attack
                && session.RapierPhaseReason == "balloon_ballistic_body_axis_window";
            sawPhysicalGunSolution |= session.RapierPhase == RapierMissionPhase.Attack
                && session.PlayerGun.InstantaneousGunSolution;
            if (!shotCommitted
                && session.RapierPhase == RapierMissionPhase.Attack
                && session.PlayerWeaponsAuthorized
                && session.SelectedOpponentAlive
                && session.PlayerGun.HasLeadSolution
                && session.PlayerGun.GunSolution
                && session.PlayerGun.InstantaneousGunSolution
                && session.PlayerGun.LeadTimeOfFlight
                    <= session.PlayerGun.Profile.MaximumFlightSeconds - 0.10) {
                session.FeedKey(GKey.Trigger, true);
                shotCommitted = true;
                triggerEdges++;
                releaseTriggerAfterStep = true;
            }
            if (session.Lifecycle != SimulationSession.LifecycleState.Active
                || session.PlayerTerminalState != AircraftTerminalState.Flying)
                break;
        }

        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        AtmosphericState finalAir = StandardAtmosphere1976.Instance.Sample(
            session.Player.State.Position.Y);
        double finalMach = session.Player.AirspeedMps / finalAir.SpeedOfSoundMps;
        RapierMissionGuidance rawGuidance = RawRapierGuidance(session);
        string finalState = $"final {session.RapierPhase} at {session.TimeSeconds:F0}s "
            + $"FL{session.Player.State.Position.Y / 30.48:F0} M{finalMach:F2} "
            + $"TAS {session.Player.AirspeedMps:F1} m/s "
            + $"q {session.Player.DynamicPressurePa / 1000.0:F1} kPa "
            + $"mass {session.Player.State.Mass:F0} kg / fuel {session.PlayerFuel.FuelLb:F0} lb "
            + $"gamma {session.Player.State.Gamma * 180.0 / Math.PI:F1}° "
            + $"cmd gamma {rawGuidance.TargetGammaDeg:F1}° G {rawGuidance.Command.GDemand:F2} "
            + $"throttle cmd/detent/spool {rawGuidance.Command.Throttle:F2}/"
            + $"{session.Controls.Throttle:F2}/{session.Player.ThrustFraction:F2} "
            + $"Tnet {session.Player.LastEngineOperatingPoint.NetThrustN / 1000.0:F1}kN "
            + $"Tturb {session.RapierTurbineThrustN / 1000.0:F1}kN "
            + $"Tram {session.RapierRamjetThrustN / 1000.0:F1}kN "
            + $"D {session.Player.LastAerodynamicDragN / 1000.0:F1}kN "
            + $"target M{session.RapierTargetMach:F2}/FL{session.RapierTargetAltitudeFt / 100.0:F0} "
            + $"reason {session.RapierPhaseReason}";
        _output.WriteLine($"trajectory [{string.Join(", ", phaseTimeline)}]");
        _output.WriteLine($"peak {maximumMachState}; q max "
            + $"{maximumDynamicPressurePa / 1000.0:F1} kPa; skin max "
            + $"{maximumSkinTemperatureK:F1} K; equilibrium max "
            + $"{maximumThermalEquilibriumK:F1} K");
        _output.WriteLine($"thresholds M3 [{firstMachThreeState}] M3.5 "
            + $"[{firstMachThreePointFiveState}] legal dash [{firstLegalDashState}]");
        _output.WriteLine($"energy ladder [{string.Join(", ", energyMilestones)}]");
        _output.WriteLine($"zoom pull [{string.Join(", ", zoomPullTimeline)}]");
        _output.WriteLine($"attack [{string.Join(", ", attackTimeline)}]");
        _output.WriteLine($"recovery [{string.Join(", ", recoveryTimeline)}]");
        _output.WriteLine(finalState + $" lifecycle {session.Lifecycle} / {session.Outcome} "
            + $"touchdown {session.Touchdown.Recovery}/{session.Touchdown.Hook}/"
            + $"W{session.Touchdown.Wire} arrest {session.Arrestment.Phase} "
            + $"fuel {session.PlayerFuel.FuelLb:F0}lb");
        _output.WriteLine($"best predicted coast [{bestCoastPredictionState}; "
            + $"miss {bestCoastPrediction.ClosestRangeM / 1000.0:F2}km "
            + $"vy {bestCoastPrediction.VerticalSpeedAtClosestMps:F0}m/s "
            + $"LOS {bestCoastPrediction.LosAngleAtClosestDeg:F1}deg "
            + $"t {bestCoastPrediction.TimeAtClosestSeconds:F1}s]");
        Assert.True(maximumDynamicPressurePa
                <= RapierV2Design.MaximumDynamicPressurePa + 1.0,
            $"automation exceeded maximum q: {maximumDynamicPressurePa / 1000.0:F2} kPa");
        Assert.True(maximumSkinTemperatureK
                <= FlightModel.RapierPublicDataSurrogate.SkinTemperatureLimitK + 0.1,
            $"binding-zone skin exceeded its limit: {maximumSkinTemperatureK:F1} K");
        Assert.True(maximumThermalEquilibriumK
                <= FlightModel.RapierPublicDataSurrogate.SkinTemperatureLimitK + 0.1,
            $"binding-zone equilibrium exceeded its limit: {maximumThermalEquilibriumK:F1} K");
        Assert.InRange(
            FlightModel.RapierPublicDataSurrogate.SkinTemperatureLimitK
                - maximumThermalEquilibriumK,
            0.0, 30.0);
        Assert.True(maximumMach >= ReachFightDirector.BalloonZoomGateMach - 0.02,
            $"automation never earned M4: max M{maximumMach:F2} "
                + $"{finalState} [{string.Join(", ", phaseTimeline)}]");
        Assert.True(sawZoom,
            $"automation never entered the zoom [{string.Join(", ", phaseTimeline)}]");
        Assert.True(sawMachFourShelf,
            "the sortie never occupied the 24 km / M4.2 / 30-42 kPa design shelf");
        Assert.True(sawCatapultHold);
        Assert.True(sawCatapultStroke);
        Assert.True(sawCatapultHandoff);
        Assert.Equal(520.0, maximumCatapultDistanceM, 6);
        Assert.Equal(120.0, maximumCatapultSpeedMps, 6);
        Assert.InRange(maximumZoomPullCommandedAlphaDeg, 19.0,
            RapierMissionDirector.BalloonPullAlphaDeg + 0.1);
        Assert.InRange(maximumZoomPullAlphaDeg, 19.0,
            FlightModel.AlphaAeroMax(FlightModel.RapierPublicDataSurrogate)
                * 180.0 / Math.PI + 0.1);
        Assert.InRange(maximumZoomPullNz, 0.0,
            RapierMissionDirector.BalloonPullMaximumG + 0.05);
        Assert.True(sawInletUnstart,
            "the idle stored-energy pull never caused the authored inlet unstart");
        Assert.True(sawPhysicalRelightAfterUnstart,
            "the ram stream never physically relit after the deliberate inlet unstart");
        Assert.True(sawApexWindow,
            $"automation never reached the apex gun window [{string.Join(", ", phaseTimeline)}]");
        Assert.True(sawPhysicalGunSolution,
            "the physical M61 solver never put the fixed gun on the balloon");
        Assert.True(shotCommitted, "the finite internal gun never received its one trigger edge");
        Assert.Equal(1, triggerEdges);
        Assert.Equal(1, attackEntries);
        Assert.True(session.PlayerGun.RoundsFired > 0,
            "the trigger edge did not launch a physical round");
        Assert.Equal(120 - session.PlayerGun.RoundsFired,
            session.PlayerGun.AmmoRemaining);
        Assert.False(session.PlayerGun.HasInfiniteAmmo);
        Assert.Equal(1, session.KillCount);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Contains(session.RecentEvents, item =>
            item.Type == SessionEventType.Hit
                && item.Source == CombatRole.Player
                && item.Target == CombatRole.Opponent);
        Assert.True(sawDipRelight);
        Assert.True(sawReturnToBase);
        Assert.True(sawRecovery);
        Assert.True(cleanAtHighAltitudeRecoveryEntry,
            "high-altitude recovery entry deployed approach configuration from low IAS alone");
        Assert.False(preRequestRecoveryConfigurationViolation,
            "recovery configuration changed before the director reached lineup provenance");
        Assert.True(sawRecoveryConfigurationRequestUnderPlacard,
            "lineup never requested recovery configuration below the real gear/flap placard");
        Assert.True(sawRecoveryConfigurationRequestBeforeGateOne);
        Assert.True(configurationLockedBeforeGateOne,
            "gear/flaps were not locked before the first physical recovery square");
        Assert.Equal(4, highestRecoveryGate);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
        Assert.InRange(session.TimeSeconds, 0.0, 45.0 * 60.0);
        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, session.Touchdown.Hook);
        Assert.InRange(session.Touchdown.Wire, 1, 4);
        Assert.Equal(session.Touchdown.Wire, session.Arrestment.CaughtWire);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped,
            session.Arrestment.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.None,
            session.Arrestment.FailureReason);
        Assert.True(session.Arrestment.InitialEnergyJ
            <= session.Arrestment.Capability.EffectiveEnergyCapacityJ + 1.0);
        Assert.True(session.Arrestment.PeakLoadN
            <= session.Arrestment.Capability.MaximumLineLoadN + 1.0);
        Assert.True(session.PlayerFuel.FuelLb < initialFuelLb);
        Assert.True(session.PlayerFuel.FuelLb
            > session.Beat.RecoveryPlan!.RequiredLandingReserveLb);
        Assert.True(session.PlayerFuel.MinimumFuelThresholdLb is not { } minimumFuelLb
            || session.PlayerFuel.FuelLb > minimumFuelLb);
        Assert.Contains(session.RecentEvents, item =>
            item.Type == SessionEventType.SortieFinished
                && item.Outcome == SortieOutcome.Victory);

        RapierServiceLifeSortieRecord serviceRecord = Assert.IsType<
            RapierServiceLifeSortieRecord>(session.RapierServiceLife.LatestRecord);
        Assert.Equal(RapierServiceLifeTerminationReason.SortieFinished,
            serviceRecord.TerminationReason);
        Assert.Equal(RapierServiceLifeEvidenceStatus.Complete,
            serviceRecord.EvidenceStatus);
        Assert.Equal(0, serviceRecord.GapTickCount);
        Assert.Equal(0,
            serviceRecord.Mechanical.DynamicPressureLimitExceedanceTicks);
        Assert.True(serviceRecord.Propulsion.InletUnstartEntries > 0);
        Assert.True(serviceRecord.Propulsion.InletUnstartTicks > 0);
        Assert.Equal(session.PlayerGun.RoundsFired,
            serviceRecord.Consumables.RoundsExpended);
    }

    [Fact]
    public void SafeTrapAfterTheOnePassMissIsARecoveredDrawNotVictory() {
        var session = new SimulationSession(
            beatIndex: 12,
            weather: KoreaWeatherPresets.ForBeat(12));
        session.DecisionCaptureEnabled = false;
        session.Begin();
        session.SetRapierAutomationEnabled(true);
        session.SetAssistedFlight(true);
        session.SetTouchControlModality(true);
        Assert.True(session.AssistedFlight,
            "the negative must exercise the real portrait assisted-flight request");

        bool sawAttack = false;
        bool sawMissReentry = false;
        bool sawRecovery = false;
        bool globalGunneryPitchAssistActivated = false;
        int maximumTicks = checked((int)(45 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks
            && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++) {
            session.StepFixed();
            globalGunneryPitchAssistActivated |= session.GunneryPitchAssist.Active;
            sawAttack |= session.RapierPhase == RapierMissionPhase.Attack;
            sawMissReentry |= sawAttack
                && session.LiveOpponentCount == 1
                && session.RapierPhase is RapierMissionPhase.ReenterAlign
                    or RapierMissionPhase.DipRelight
                    or RapierMissionPhase.ReturnToBase
                    or RapierMissionPhase.Recovery;
            sawRecovery |= session.RapierPhase == RapierMissionPhase.Recovery;
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        _output.WriteLine($"recovered miss: t={session.TimeSeconds:F1}s "
            + $"phase={session.RapierPhase} cue={session.RapierMissionCue} "
            + $"gate={session.RapierRecoveryGate} pos={session.Player.State.Position} "
            + $"heading={session.Player.State.Chi * 180.0 / Math.PI:F1}deg "
            + $"recovery={session.Recovery}/{session.Touchdown.Hook}/"
            + $"W{session.Touchdown.Wire}/{session.Arrestment.Phase} "
            + $"fuel={session.PlayerFuel.FuelLb:F0}lb outcome={session.Outcome}");

        Assert.True(sawMissReentry,
            "the live balloon did not remain authoritative through the one-pass re-entry path");
        Assert.True(sawRecovery);
        Assert.True(sawAttack,
            "mission-specific ballistic steering must still earn the exact attack window");
        Assert.False(globalGunneryPitchAssistActivated,
            "Card 12 must never inherit the global dogfight gunnery magnet");
        Assert.Equal(0, session.PlayerGun.RoundsFired);
        Assert.Equal(120, session.PlayerGun.AmmoRemaining);
        Assert.Equal(0, session.KillCount);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(SortieOutcome.Draw, session.Outcome);
        Assert.InRange(session.TimeSeconds, 0.0, 45.0 * 60.0);
        Assert.NotEqual(SortieOutcome.Victory, session.Outcome);
        Assert.Equal(Carrier.Recovery.Trap, session.Touchdown.Recovery);
        Assert.Equal(Carrier.HookOutcome.Engaged, session.Touchdown.Hook);
        Assert.InRange(session.Touchdown.Wire, 1, 4);
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped,
            session.Arrestment.Phase);
        Assert.Equal(ArrestmentModel.ArrestmentFailureReason.None,
            session.Arrestment.FailureReason);
        Assert.Contains(session.RecentEvents, item =>
            item.Type == SessionEventType.SortieFinished
                && item.Outcome == SortieOutcome.Draw);

        RapierServiceLifeSortieRecord serviceRecord = Assert.IsType<
            RapierServiceLifeSortieRecord>(session.RapierServiceLife.LatestRecord);
        Assert.Equal(RapierServiceLifeTerminationReason.SortieFinished,
            serviceRecord.TerminationReason);
        Assert.Equal(RapierServiceLifeEvidenceStatus.Complete,
            serviceRecord.EvidenceStatus);
        Assert.Equal(0, serviceRecord.GapTickCount);
        Assert.Equal(0, serviceRecord.Consumables.RoundsExpended);
    }
}
