using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Contract tests for the phase-level configuration task. These deliberately exercise the same
/// G/flap GKeys as the browser action harness: automation is the useful default, while a pilot
/// selection remains authoritative until the next real approach/combat phase change.
/// </summary>
public sealed class ConfigurationAutomationTests {
    [Fact]
    public void CarrierSortieStagesRecoveryConfigurationAsTheAutomaticDefault() {
        var session = new SimulationSession(5);

        Assert.True(session.ConfigurationAutomationEnabled);
        Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
        Assert.True(session.AutomaticGearSelection);
        Assert.True(session.AutomaticFlapSelection);
        Assert.False(session.ConfigurationTransitionActive);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        Assert.Equal(session.PlayerSystems.FullFlapDegrees,
            session.PlayerSystems.LeftFlapDegrees, precision: 12);
        Assert.Equal(session.PlayerSystems.Profile.UtilityHydraulicNominalPsi,
            session.PlayerSystems.UtilityHydraulicPressurePsi, precision: 12);
    }

    [Fact]
    public void ManualGearAndFlapSelectionsPersistUntilTheNextPhaseChange() {
        var session = new SimulationSession(5);
        session.Begin();
        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);

        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Up, session.PlayerSystems.FlapLever);
        Assert.True(session.AutomaticGearSelection);
        Assert.True(session.AutomaticFlapSelection);

        // G and the spring-loaded DOWN selector override only their own automation channel.
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.FeedKey(GKey.FlapDown, true);
        session.FeedKey(GKey.FlapDown, false);

        Assert.False(session.AutomaticGearSelection);
        Assert.False(session.AutomaticFlapSelection);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        Assert.Contains("MANUAL CONFIG", session.ConfigurationCue);

        // Re-selecting the same phase is not a magic reset behind the pilot's back.
        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
        Assert.False(session.AutomaticGearSelection);
        Assert.False(session.AutomaticFlapSelection);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
    }

    [Fact]
    public void ARealPhaseChangeRearmsBothAutomaticConfigurationChannels() {
        var session = new SimulationSession(5);
        session.Begin();
        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);
        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        session.FeedKey(GKey.FlapDown, true);
        session.FeedKey(GKey.FlapDown, false);
        Assert.False(session.AutomaticGearSelection);
        Assert.False(session.AutomaticFlapSelection);

        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Recovery);

        Assert.True(session.AutomaticGearSelection);
        Assert.True(session.AutomaticFlapSelection);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        // The aircraft was staged at full flap, so recovery needs no motor command after the reset.
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);

        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Combat);

        Assert.True(session.AutomaticGearSelection);
        Assert.True(session.AutomaticFlapSelection);
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Up, session.PlayerSystems.FlapLever);
        Assert.True(session.ConfigurationTransitionActive);
        Assert.StartsWith("AUTO CLEANUP", session.ConfigurationCue);
    }

    [Fact]
    public void MaintenanceRecoveryNeverHidesProcedureBehindConfigurationAutomation() {
        var session = new SimulationSession(6);

        Assert.False(session.ConfigurationAutomationEnabled);
        Assert.Equal(FlightConfigurationTarget.Combat, session.ConfigurationTarget);
        Assert.False(session.AutomaticGearSelection);
        Assert.False(session.AutomaticFlapSelection);
        Assert.Equal("", session.ConfigurationCue);

        session.SelectAutomaticConfigurationTarget(FlightConfigurationTarget.Recovery);

        Assert.Equal(FlightConfigurationTarget.Combat, session.ConfigurationTarget);
        Assert.Equal(LandingGearHandle.Up, session.PlayerSystems.GearHandle);
        Assert.Equal(WingFlapLever.Hold, session.PlayerSystems.FlapLever);
        Assert.Equal(0.0, session.PlayerSystems.UtilityHydraulicPressurePsi, precision: 12);
    }
}
