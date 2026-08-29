using System;
using GunsOnly.Sim;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// Contracts for the PLAYER's gun/steering assist, from the owner's Build-264 verdict: it was
/// intrusive AND ineffective, and the two compound. Intrusive is measured on the reversal window;
/// ineffective is measured as the conversion delta against both no assist at all and against the
/// timing fix alone.
///
/// Each run flag maps to one half of the fix, so each half can be attributed separately:
///   reversalGate     — the pilot-commitment gate (timing)
///   leadFeedForward  — the lead-line rate reference (effectiveness)
/// Both false reproduces the Build-264 law exactly.
public sealed class PlayerGunAssistTests {
    /// A dogfight is a chaotic closed loop — a 0.01 aileron difference on one tick relocates the
    /// whole fight thirty seconds later — so every reported figure is an ensemble over randomised
    /// entry geometry. Hits-per-round settles to about a point of run-to-run spread by twenty-four
    /// entries; a forty-entry sweep was used to confirm the direction of every delta below and
    /// moved no figure by more than two points.
    const int ReportRuns = 24;

    readonly ITestOutputHelper _output;

    public PlayerGunAssistTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void ReportAssistFunnelBeforeAndAfter() {
        foreach ((string name, double gain) pilot in new[] {
            ("soft", 22.0), ("hard", 45.0),
        }) {
            foreach (bool padlock in new[] { false, true }) {
                string mode = $"{pilot.name}/{(padlock ? "padlock" : "gunnery")}";
                _output.WriteLine(PlayerGunAssistHarness.RunEnsemble(
                    gunneryAssistEnabled: true, padlockSelected: padlock,
                    reversalGate: false, leadFeedForward: false,
                    runs: ReportRuns, pilotPitchGain: pilot.gain).Line($"{mode} BEFORE"));
                _output.WriteLine(PlayerGunAssistHarness.RunEnsemble(
                    gunneryAssistEnabled: true, padlockSelected: padlock,
                    reversalGate: true, leadFeedForward: true,
                    runs: ReportRuns, pilotPitchGain: pilot.gain).Line($"{mode} AFTER"));
                _output.WriteLine(PlayerGunAssistHarness.RunEnsemble(
                    gunneryAssistEnabled: false, padlockSelected: padlock,
                    reversalGate: true, leadFeedForward: true,
                    runs: ReportRuns, pilotPitchGain: pilot.gain).Line($"{mode} NO-ASSIST"));
            }
        }
    }

    /// (a) The assist does not act during a commanded reversal. Padlock's Build-264 law
    /// demonstrably did; ordinary gunnery now deliberately owns no F-22 roll authority at all.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void AssistDoesNotTakeTheRollAxisDuringACommandedReversal(bool padlockSelected) {
        PlayerGunAssistHarness.Result before = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected,
            reversalGate: false, leadFeedForward: false);
        PlayerGunAssistHarness.Result after = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected,
            reversalGate: true, leadFeedForward: true);

        Assert.True(after.ReversalSeconds > 60.0,
            $"the scenario must actually contain reversals (got {after.ReversalSeconds:F1} s)");
        if (padlockSelected) {
            Assert.True(before.ReversalEngagement01 > 0.10,
                $"the Build-264 law engaged in only {before.ReversalEngagement01:P1} of the "
                + "reversal window, so this scenario does not reproduce the owner's complaint");
        } else {
            Assert.Equal(0.0, before.ReversalAssistSeconds);
            Assert.Equal(0.0, before.ReversalOpposingSeconds);
            Assert.Equal(0.0, before.ReversalPeakAssistRoll);
        }
        Assert.Equal(0.0, after.ReversalAssistSeconds);
        Assert.Equal(0.0, after.ReversalOpposingSeconds);
        Assert.Equal(0.0, after.ReversalPeakAssistRoll);
    }

    /// (b) It yields to pilot input: a machine roll contribution may never oppose a lateral input
    /// the pilot is actively holding.
    [Fact]
    public void RollAssistNeverOpposesACommittedPilotInput() {
        var commitment = new PilotLateralCommitment();
        PilotLateralCommitmentState state = default;
        for (int tick = 0; tick < 60; tick++)
            state = commitment.Step(0.6, PlayerGunAssistHarness.Dt);

        Assert.True(state.Committed);
        Assert.Equal(1.0, state.CommittedSign);
        Assert.Equal(0.0, state.Gate(-0.18));      // opposing: refused outright
        Assert.Equal(0.18, state.Gate(0.18), 10);  // helping: allowed
    }

    [Fact]
    public void CommandedReversalRemovesAllRollAuthorityAndBlendsBack() {
        var commitment = new PilotLateralCommitment();
        for (int tick = 0; tick < 120; tick++) commitment.Step(0.6, PlayerGunAssistHarness.Dt);

        // The reversal must register on the FIRST opposite tick: a dwell would leave the machine on
        // the axis for exactly the moment the pilot is changing their mind.
        PilotLateralCommitmentState reversed = commitment.Step(-0.6, PlayerGunAssistHarness.Dt);
        Assert.True(reversed.Reversing);
        Assert.Equal(0.0, reversed.Authority01);
        Assert.Equal(0.0, reversed.Gate(0.18));
        Assert.Equal(0.0, reversed.Gate(-0.18));

        // Hands off afterwards: authority must come back, and come back smoothly.
        double previous = 0.0;
        PilotLateralCommitmentState settled = reversed;
        int settleTicks = (int)Math.Ceiling(
            (PilotLateralCommitment.ReversalLockoutSeconds
                + PilotLateralCommitment.ReversalBlendSeconds + 0.2)
            / PlayerGunAssistHarness.Dt);
        for (int tick = 0; tick < settleTicks; tick++) {
            settled = commitment.Step(0.0, PlayerGunAssistHarness.Dt);
            Assert.True(settled.Authority01 >= previous - 1e-9,
                "authority must be monotone through the blend");
            Assert.InRange(settled.Authority01, 0.0, 1.0);
            previous = settled.Authority01;
        }
        Assert.Equal(1.0, settled.Authority01, 6);
        Assert.False(settled.Reversing);
    }

    /// A fresh input after a long neutral stretch is a new turn, not a reversal — otherwise the
    /// assist would stand down every time a pilot rolled the other way a minute later.
    [Fact]
    public void AStaleOppositeInputIsNotAReversal() {
        var commitment = new PilotLateralCommitment();
        for (int tick = 0; tick < 120; tick++) commitment.Step(0.6, PlayerGunAssistHarness.Dt);
        int neutralTicks = (int)Math.Ceiling(
            (PilotLateralCommitment.CommitmentMemorySeconds + 0.5)
            / PlayerGunAssistHarness.Dt);
        for (int tick = 0; tick < neutralTicks; tick++)
            commitment.Step(0.0, PlayerGunAssistHarness.Dt);

        PilotLateralCommitmentState fresh = commitment.Step(-0.6, PlayerGunAssistHarness.Dt);
        Assert.False(fresh.Reversing);
        Assert.Equal(1.0, fresh.Authority01);
    }

    /// (c) A scripted tracking pass converts measurably better WITH the assist than without.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TheAssistConvertsBetterThanNoAssist(bool padlockSelected) {
        PlayerGunAssistHarness.Result assisted = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected);
        PlayerGunAssistHarness.Result unassisted = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: false, padlockSelected: padlockSelected);

        Assert.True(assisted.HitsPerRound > unassisted.HitsPerRound,
            $"assisted {assisted.HitsPerRound:P1} ({assisted.Hits}/{assisted.Rounds}) vs "
            + $"unassisted {unassisted.HitsPerRound:P1} "
            + $"({unassisted.Hits}/{unassisted.Rounds})");
    }

    /// The effectiveness half must earn its own keep. Silencing the assist through reversals is a
    /// pure subtraction; if that were the whole change the aid would convert no better than before.
    /// The lead-rate reference is what buys back the last few degrees.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TheLeadRateReferenceConvertsBetterThanTheTimingFixAlone(bool padlockSelected) {
        PlayerGunAssistHarness.Result gateOnly = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected,
            reversalGate: true, leadFeedForward: false);
        PlayerGunAssistHarness.Result full = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected,
            reversalGate: true, leadFeedForward: true);

        Assert.True(full.HitsPerRound > gateOnly.HitsPerRound,
            $"full {full.HitsPerRound:P1} ({full.Hits}/{full.Rounds}) vs timing-fix-only "
            + $"{gateOnly.HitsPerRound:P1} ({gateOnly.Hits}/{gateOnly.Rounds})");
        Assert.True(full.MedianTrackingLeadErrorDeg < gateOnly.MedianTrackingLeadErrorDeg,
            $"tracking lead error {full.MedianTrackingLeadErrorDeg:F2} deg vs "
            + $"{gateOnly.MedianTrackingLeadErrorDeg:F2} deg");
    }

    /// (d) Duty cycle stays in a sane band. The assist must be felt where it converts and nowhere
    /// else; Build 264 flew 17.1% padlock-active and 8.2% gunnery over a whole sortie, and the
    /// complaint was that this was enough to be felt while returning nothing.
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void RollAxisDutyCycleStaysInASaneBand(bool padlockSelected) {
        PlayerGunAssistHarness.Result before = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected,
            reversalGate: false, leadFeedForward: false);
        PlayerGunAssistHarness.Result after = PlayerGunAssistHarness.RunEnsemble(
            gunneryAssistEnabled: true, padlockSelected: padlockSelected);

        if (padlockSelected) {
            Assert.InRange(after.DutyCycle01, 0.01, 0.35);
            Assert.True(after.DutyCycle01 < before.DutyCycle01,
                $"roll-axis duty {after.DutyCycle01:P1} vs Build-264 {before.DutyCycle01:P1}");
        } else {
            // Tape 415 retired the hidden F-22 gunnery roll correction. Pitch assist can remain
            // active, but both historical timing variants must now stay completely off roll.
            Assert.Equal(0.0, before.DutyCycle01);
            Assert.Equal(0.0, after.DutyCycle01);
        }
    }

    /// The mechanism behind the effectiveness half, isolated from the closed loop: inside a tracking
    /// turn the pilot's own body pitch rate exceeds the whole capture rate, so the Build-264
    /// reference produced a NEGATIVE residual and the correction clamped to nothing. The aid was
    /// structurally silent in exactly the window that converts.
    [Fact]
    public void LeadRateReferenceKeepsAuthorityInsideATrackingTurn() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        const double trackingPitchRate = 0.30;   // rad/s, a real tracking turn
        const double aimErrorRad = 0.05;         // ~2.9 deg of missing lead
        var aircraft = new AircraftSim(new AircraftState(
            new Vec3D(0.0, 5000.0, 0.0), 250.0, 0.0, 0.0, 0.0, parameters.MassKg)
            with { BodyRates = new BodyRates(0.0, trackingPitchRate, 0.0) }, parameters);
        Vec3D lead = (aircraft.BodyForward * Math.Cos(aimErrorRad)
            + aircraft.BodyUp * Math.Sin(aimErrorRad)).Normalized();
        var pilot = new PilotCommand(
            GDemand: 5.0, BankTarget: 0.0, Throttle: 1.2, Rudder: 0.0,
            RollControl: 0.0, DirectLateralControl: true);

        GunneryPitchAssistResult without = GunneryPitchAssist.Apply(
            pilot, aircraft.State, parameters, aircraft.AirspeedMps,
            aircraft.AtmosphereModel, lead, true, 600.0, true);
        Assert.True(without.State.PitchRateErrorRadPerSecond < 0.0);
        Assert.Equal(0.0, without.State.LoadFactorCorrectionG, 10);

        // A converged pursuit: the lead line is turning at exactly the pilot's tracking rate.
        var leadRate = new GunneryLeadRateEstimator();
        GunneryPitchAssistResult with = default;
        for (int tick = 0; tick < 240; tick++)
            with = GunneryPitchAssist.Apply(
                pilot, aircraft.State, parameters, aircraft.AirspeedMps,
                aircraft.AtmosphereModel, lead, true, 600.0, true,
                leadRate: leadRate, deltaSeconds: PlayerGunAssistHarness.Dt);

        Assert.True(with.State.PitchRateErrorRadPerSecond > 0.0,
            $"residual was {with.State.PitchRateErrorRadPerSecond:F4} rad/s");
        Assert.True(with.State.LoadFactorCorrectionG > 0.1,
            $"correction was {with.State.LoadFactorCorrectionG:F3} G");
        Assert.True(with.State.LoadFactorCorrectionG
            <= parameters.GunneryPitchAssistMaxCorrectionG + 1e-9);
    }

    /// Fail-closed: with no estimator supplied the pitch reference is exactly Build 264's.
    [Fact]
    public void WithoutAnEstimatorThePitchReferenceIsUnchanged() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        var aircraft = new AircraftSim(new AircraftState(
            new Vec3D(0.0, 5000.0, 0.0), 250.0, 0.0, 0.0, 0.0, parameters.MassKg), parameters);
        Vec3D lead = (aircraft.BodyForward * Math.Cos(0.08)
            + aircraft.BodyUp * Math.Sin(0.08)).Normalized();
        var pilot = new PilotCommand(
            GDemand: 1.0, BankTarget: 0.0, Throttle: 1.0, Rudder: 0.0,
            RollControl: 0.0, DirectLateralControl: true);

        GunneryPitchAssistResult legacy = GunneryPitchAssist.Apply(
            pilot, aircraft.State, parameters, aircraft.AirspeedMps,
            aircraft.AtmosphereModel, lead, true, 600.0, true);
        Assert.Equal(
            Math.Clamp(parameters.GunneryPitchAssistGainPerSecond * 0.08,
                -parameters.GunneryPitchAssistMaxRateRad,
                parameters.GunneryPitchAssistMaxRateRad),
            legacy.State.RequestedPitchRateRadPerSecond, 10);
    }
}
