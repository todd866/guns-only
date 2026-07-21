using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class PilotPhysiologySessionTests {
    static PilotPhysiologyProfile FastCalibrationProfile() {
        PilotConstitutionProfile pilot =
            PilotConstitutionProfile.ReferenceTrainedFastJet with {
                PositivePeripheralLossG = 1.20,
                PositiveBlackoutG = 1.30,
                PositiveLossOfConsciousnessG = 1.40,
                RetinalDepletionTimeSeconds = 0.08,
                CerebralDepletionTimeSeconds = 0.08,
                VisionRecovery90Seconds = 0.50,
                CerebralRecovery90Seconds = 0.80,
                AbsoluteIncapacitationSeconds = 0.75
            };
        return PilotPhysiologyProfile.UnprotectedReference with {
            Id = "physiology.test.fast-unprotected.v1",
            Pilot = pilot,
            Technique = PilotTechniqueProfile.TrainedAgsmSurrogate with {
                MaximumThresholdBenefitG = 0.25
            }
        };
    }

    [Fact]
    public void BuiltInErasSelectExplicitPilotProtectionProfiles() {
        var korea = new SimulationSession(1);
        var modern = new SimulationSession(7);

        Assert.Equal(PilotPhysiologyProfile.KoreaFastJetReference.Id,
            korea.PilotPhysiology.Profile.Id);
        Assert.Equal(PilotPhysiologyProfile.ModernFastJetReference.Id,
            modern.PilotPhysiology.Profile.Id);
        Assert.Equal(PilotOperationalState.Normal, modern.PilotState);
        Assert.Equal(1.0, modern.PilotPhysiologyState.ControlAuthority01, 12);
    }

    [Fact]
    public void NormalPhysiologyIsTransparentToTheActuatorCommand() {
        var session = new SimulationSession(7);
        session.Begin();
        session.StepFixed();

        PilotCommand requested = session.Controls.Command;
        PilotCommand applied = session.Player.LastAppliedCommand;
        Assert.Equal(requested.GDemand, applied.GDemand, 12);
        Assert.Equal(requested.RollControl, applied.RollControl, 12);
        Assert.Equal(requested.Rudder, applied.Rudder, 12);
        Assert.Equal(requested.Throttle, applied.Throttle, 12);
        Assert.False(session.PilotControlInterlocked);
        Assert.False(session.PilotTriggerInterlocked);
    }

    [Fact]
    public void GLocReleasesControlsAndGunUntilThePilotReleasesInputsAfterRecovery() {
        BeatSetup fragile = Beats.Perch() with {
            PlayerPhysiologyProfile = FastCalibrationProfile()
        };
        var session = new SimulationSession();
        session.StartBeat(() => fragile);
        session.Begin();
        session.FeedKey(GKey.FlapDown, true);
        session.FeedKey(GKey.EmergencyGearRelease, true);
        Assert.Equal(WingFlapLever.Down, session.PlayerSystems.FlapLever);
        Assert.True(session.PlayerSystems.EmergencyGearReleaseHeld);
        session.FeedKey(GKey.PullUp, true);
        session.FeedKey(GKey.ThrottleDown, true);
        session.FeedKey(GKey.Trigger, true);

        for (int tick = 0; tick < 4 * AircraftSim.TickHz
            && session.PilotGLocCount == 0; tick++)
            session.StepFixed();

        Assert.Equal(1, session.PilotGLocCount);
        Assert.Equal(PilotOperationalState.GLoc, session.PilotState);
        Assert.True(session.Controls.Command.GDemand > 1.5,
            "requested control must remain visible while physiology owns applied authority");
        Assert.True(session.PilotControlInterlocked);
        Assert.True(session.PilotTriggerInterlocked);
        Assert.False(session.PlayerWeaponsAuthorized);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        Assert.False(session.PlayerSystems.EmergencyGearReleaseHeld);

        double heldThrottle = session.Player.LastAppliedCommand.Throttle;
        double techniqueAtLoss = session.PilotPhysiologyState.TechniqueEngagement01;
        LandingGearHandle heldGear = session.PlayerSystems.GearHandle;
        WingFlapLever heldFlaps = session.PlayerSystems.FlapLever;
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.FlapDown, true);
        session.FeedKey(GKey.EmergencyGearRelease, true);

        for (int tick = 0; tick < AircraftSim.TickHz / 2; tick++)
            session.StepFixed();
        Assert.Equal(1.0, session.Player.LastAppliedCommand.GDemand, 9);
        Assert.Equal(0.0, session.Player.LastAppliedCommand.RollControl, 12);
        Assert.Equal(heldThrottle, session.Player.LastAppliedCommand.Throttle, 12);
        Assert.Equal(heldThrottle, session.Controls.Command.Throttle, 12);
        Assert.Equal(heldGear, session.PlayerSystems.GearHandle);
        Assert.Equal(heldFlaps, session.PlayerSystems.FlapLever);
        Assert.False(session.PlayerSystems.EmergencyGearReleaseHeld);
        Assert.True(session.PilotPhysiologyState.TechniqueEngagement01 < techniqueAtLoss,
            "active anti-G straining must decay while the pilot is unconscious");

        // A held browser key cannot manufacture a recovery pull. The pilot must first regain
        // useful function, then cross a real neutral input boundary.
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            session.StepFixed();
        Assert.True(session.PilotControlInterlocked);

        session.FeedKey(GKey.PullUp, false);
        session.FeedKey(GKey.ThrottleDown, false);
        for (int tick = 0; tick < 5 * AircraftSim.TickHz
            && session.PilotControlInterlocked; tick++)
            session.StepFixed();
        Assert.False(session.PilotControlInterlocked);
        Assert.True(session.PilotTriggerInterlocked,
            "a trigger held through G-LOC must not auto-fire on recovery");

        session.FeedKey(GKey.Trigger, false);
        Assert.False(session.PilotTriggerInterlocked);
    }
}
