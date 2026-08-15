using System;
using System.Collections.Generic;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// A repeatable PLAYER-side gunnery instrument. The gun-conversion funnel measures the bandit; this
/// measures the human's assist stack — the gunnery pitch/lateral aid and the padlock roll trim — on
/// a scripted pilot flying a scripted bandit, with the same law composition order the live session
/// uses (<c>SimulationSession.cs:6573-6576</c>).
///
/// Two windows are separated, because the owner's two complaints live in different ones:
///   REVERSAL — the pilot has committed lateral input and has just flipped its direction. Anything
///              the assist does here is felt as the aircraft fighting the pilot.
///   TRACKING — pursuit, in gun range, inside a fine cone, pilot lateral input quiet. This is the
///              window where a few degrees decide the kill and the assist is supposed to earn its
///              keep.
/// </summary>
public static class PlayerGunAssistHarness {
    public const double Dt = 1.0 / AircraftSim.TickHz;
    public const double CommittedRollControl = 0.15;
    public const double ReversalWindowSeconds = 1.0;
    public const double TrackingConeDeg = 8.0;
    public const double TrackingRangeM = 900.0;
    public const double CommitmentMemorySeconds = 3.0;

    public sealed record Result(
        int Rounds,
        int Hits,
        double MedianTriggerLeadErrorDeg,
        double MedianTriggerRangeM,
        double ReversalSeconds,
        double ReversalAssistSeconds,
        double ReversalOpposingSeconds,
        double ReversalPeakAssistRoll,
        double TrackingSeconds,
        double TrackingAssistSeconds,
        double TrackingMeanAssistMagnitude,
        double MedianTrackingLeadErrorDeg,
        double TrackingMeanCorrectionG,
        double FiringConeSeconds,
        double DutyCycle01) {
        public double HitsPerRound => Rounds > 0 ? (double)Hits / Rounds : 0.0;
        public double ReversalEngagement01 => ReversalSeconds > 0.0
            ? ReversalAssistSeconds / ReversalSeconds : 0.0;
        public double ReversalOpposition01 => ReversalSeconds > 0.0
            ? ReversalOpposingSeconds / ReversalSeconds : 0.0;
        public double TrackingEngagement01 => TrackingSeconds > 0.0
            ? TrackingAssistSeconds / TrackingSeconds : 0.0;

        public string Line(string label) =>
            $"{label,-22} rounds={Rounds,4} hits={Hits,3} h/r={HitsPerRound,6:P1} "
            + $"trigLead={MedianTriggerLeadErrorDeg,5:F2}deg trigRng={MedianTriggerRangeM,5:F0}m | "
            + $"REV {ReversalSeconds,5:F1}s eng={ReversalEngagement01,6:P1} "
            + $"opp={ReversalOpposition01,6:P1} peak={ReversalPeakAssistRoll,5:F3} | "
            + $"TRK {TrackingSeconds,5:F1}s eng={TrackingEngagement01,6:P1} "
            + $"mag={TrackingMeanAssistMagnitude,5:F3} lead={MedianTrackingLeadErrorDeg,5:F2}deg "
            + $"dG={TrackingMeanCorrectionG,5:F2} | cone3={FiringConeSeconds,6:F1}s "
            + $"duty={DutyCycle01,6:P1}";
    }

    /// <summary>
    /// One scripted engagement. The bandit flies a hard level turn and REVERSES it on a fixed
    /// schedule, so the scripted pilot is forced through real reversals; between reversals the
    /// geometry settles into a stable tracking pass.
    /// </summary>
    /// <param name="reversalGate">
    /// false reproduces the Build-264 law exactly (no pilot-commitment gate); true engages the fix.
    /// </param>
    /// <param name="leadFeedForward">
    /// false reproduces the Build-264 law exactly (error-nulling reference only); true re-bases the
    /// pitch reference on the measured lead-line rate.
    /// </param>
    public static Result Run(
        bool gunneryAssistEnabled,
        bool padlockSelected,
        bool reversalGate = true,
        bool leadFeedForward = true,
        double seconds = 60.0,
        double reversalPeriodSeconds = 6.0,
        int seed = 0,
        double pilotPitchGain = 22.0) {
        // A dogfight is a chaotic closed loop: a 0.01 aileron difference on one tick relocates the
        // whole fight thirty seconds later, so a SINGLE run cannot compare two control laws. Every
        // reported number is an ensemble over randomised entry geometry (see RunEnsemble).
        var random = new Random(seed * 7919 + 17);
        double Jitter(double span) => (random.NextDouble() * 2.0 - 1.0) * span;
        AircraftParams playerAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams banditAir = FlightModel.Su27SPublicDataSurrogate;
        CombatConfig combat = CombatConfig.ModernVisualMerge;

        // The player starts OFF the solution — offset, low, and pointed across the bandit — so that
        // every round of the measured conversion has to be earned by tracking. A dead-astern start
        // hands the pilot a free burst in the opening second and drowns the signal.
        var player = new AircraftSim(new AircraftState(
            new Vec3D(-600.0 + Jitter(250.0), 4300.0 + Jitter(200.0), -800.0 + Jitter(250.0)),
            250.0 + Jitter(20.0), 0.03 + Jitter(0.05), 0.55 + Jitter(0.25), 0.0,
            playerAir.MassKg),
            playerAir);
        var bandit = new AircraftSim(new AircraftState(
            new Vec3D(0.0, 4500.0, 0.0), 235.0 + Jitter(15.0), 0.0, Jitter(0.3), 0.0,
            banditAir.MassKg), banditAir);
        double banditGDemand = 3.0 + Jitter(0.8);
        double banditBankRad = (60.0 + Jitter(12.0)) * Math.PI / 180.0;
        double reversalPhase = random.NextDouble() * reversalPeriodSeconds;

        // Deliberately un-killable and un-emptiable: the instrument measures hits per round over a
        // whole pass, and a target that dies after three hits caps the very signal being measured.
        const int HitsToKillForMeasurement = 400;
        var gun = new GunKill(combat.PlayerAmmo, HitsToKillForMeasurement,
            combat.PlayerGunProfile.EffectiveHitRadiusM, combat.PlayerGunProfile,
            GunHeatConfig.PlayerInfiniteAmmo);
        var padlock = new PadlockRollAssist();
        var leadRate = new GunneryLeadRateEstimator();
        var commitment = new PilotLateralCommitment();

        var triggerLeadErrors = new List<double>();
        var triggerRanges = new List<double>();
        var trackingLeadErrors = new List<double>();
        double reversalSeconds = 0.0, reversalAssistSeconds = 0.0;
        double reversalOpposingSeconds = 0.0, reversalPeakAssist = 0.0;
        double trackingSeconds = 0.0, trackingAssistSeconds = 0.0;
        double trackingAssistMagnitude = 0.0;
        double trackingCorrectionG = 0.0;
        double firingConeSeconds = 0.0;
        double assistSeconds = 0.0;

        double heldRoll = 0.0, heldG = 1.0;
        double sinceInputSeconds = double.PositiveInfinity;
        double lastCommittedSign = 0.0;
        double sinceCommittedSeconds = double.PositiveInfinity;
        double sinceReversalSeconds = double.PositiveInfinity;

        int ticks = (int)Math.Ceiling(seconds / Dt);
        for (int tick = 0; tick < ticks; tick++) {
            double t = tick * Dt;

            // ---- scripted bandit: hard level turn, reversing on schedule -------------------
            double banditBank = (double.IsFinite(reversalPeriodSeconds)
                    && (int)((t + reversalPhase) / reversalPeriodSeconds) % 2 != 0 ? -1.0 : 1.0)
                * banditBankRad;
            bandit.Step(new PilotCommand(
                GDemand: banditGDemand, BankTarget: banditBank, Throttle: 1.0, Rudder: 0.0), Dt);

            AircraftState banditState = bandit.State;
            AircraftState playerState = player.State;
            gun.Step(false, playerState, banditState, 0.0); // refresh lead only
            double rangeM = Geometry.Range(playerState, banditState);

            Vec3D aimPoint = gun.HasLeadSolution
                ? gun.LeadDirection
                : (banditState.Position - playerState.Position).Normalized();
            Vec3D forward = player.BodyForward, up = player.BodyUp, right = player.BodyRight;
            double f = aimPoint.Dot(forward);
            double r = aimPoint.Dot(right);
            double u = aimPoint.Dot(up);
            double totalErrorRad = Math.Acos(Math.Clamp(f, -1.0, 1.0));
            double planeErrorRad = Math.Atan2(r, u);

            // ---- scripted pilot: coarse, human-cadence corrections ------------------------
            // Commands are refreshed at 8 Hz and quantised, which is what a real stick/keyboard
            // pilot delivers; a continuous ideal pilot would hide exactly the transient the
            // assist is supposed to help with.
            sinceInputSeconds += Dt;
            if (sinceInputSeconds >= 0.125) {
                sinceInputSeconds = 0.0;
                double desiredRoll = Math.Abs(planeErrorRad) < 0.05
                    ? 0.0 : Math.Clamp(1.6 * planeErrorRad, -1.0, 1.0);
                heldRoll = Math.Round(desiredRoll * 4.0) / 4.0;
                double pullError = Math.Max(0.0, totalErrorRad);
                heldG = f > 0.0
                    ? Math.Clamp(1.0 + pilotPitchGain * pullError, 1.0, 9.0)
                    : 5.0;
            }
            double rawPilotRoll = heldRoll;

            // ---- reversal bookkeeping (the pilot's own commanded lateral direction) --------
            double sign = Math.Abs(rawPilotRoll) >= CommittedRollControl
                ? Math.Sign(rawPilotRoll) : 0.0;
            sinceCommittedSeconds += Dt;
            // A reversal is a commanded lateral input that contradicts a RECENT one. A fresh input
            // after seconds of neutral stick is a new turn, not a reversal.
            if (sinceCommittedSeconds > CommitmentMemorySeconds) lastCommittedSign = 0.0;
            if (sign != 0.0) {
                if (lastCommittedSign != 0.0 && sign != lastCommittedSign)
                    sinceReversalSeconds = 0.0;
                lastCommittedSign = sign;
                sinceCommittedSeconds = 0.0;
            }
            sinceReversalSeconds += Dt;
            bool inReversal = sinceReversalSeconds <= ReversalWindowSeconds;
            bool inTracking = !inReversal
                && rangeM <= TrackingRangeM
                && totalErrorRad <= TrackingConeDeg * Math.PI / 180.0
                && Math.Abs(rawPilotRoll) < CommittedRollControl;

            var pilotCommand = new PilotCommand(
                GDemand: heldG, BankTarget: 0.0, Throttle: 1.2, Rudder: 0.0,
                RollControl: rawPilotRoll, DirectLateralControl: true);

            // ---- assist stack, in the live session's composition order --------------------
            PilotLateralCommitmentState stepped = commitment.Step(rawPilotRoll, Dt);
            PilotLateralCommitmentState? lateral = reversalGate ? stepped : null;
            GunneryPitchAssistResult gunnery = GunneryPitchAssist.Apply(
                pilotCommand, playerState, playerAir, player.AirspeedMps,
                player.AtmosphereModel, gun.LeadDirection, gun.HasLeadSolution,
                rangeM, gunneryAssistEnabled,
                // Selection merely arms padlock. Until its capture-only controller is actually
                // contributing, gunnery retains the roll axis (matching SimulationSession).
                lateralRollEnabled: !padlock.State.Active,
                closureMps: 0.0,
                leadRate: leadFeedForward ? leadRate : null,
                lateralCommitment: lateral,
                deltaSeconds: Dt);
            PilotCommand assisted = gunnery.Command;

            PadlockRollAssistResult padlockResult = padlock.Step(
                assisted, playerState, banditState.Position, 7,
                selected: padlockSelected, eligible: padlockSelected,
                rawPilotRoll, Dt,
                energy: null,
                captureRangeLimitM: combat.PlayerGunProfile.MuzzleVelocityMps
                    * combat.PlayerGunProfile.MaximumFlightSeconds,
                lateralCommitment: lateral);
            PilotCommand flight = padlockResult.Command;

            double assistRoll = (flight.RollControl - pilotCommand.RollControl)
                + (flight.SasRollControl - pilotCommand.SasRollControl);
            // Duty is measured on the ROLL axis, because that is the axis the pilot feels the
            // machine on and the one the complaint is about.
            if (Math.Abs(assistRoll) > 1e-4) assistSeconds += Dt;

            if (inReversal) {
                reversalSeconds += Dt;
                if (Math.Abs(assistRoll) > 1e-4) reversalAssistSeconds += Dt;
                if (sign != 0.0 && Math.Sign(assistRoll) == -sign
                    && Math.Abs(assistRoll) > 1e-4)
                    reversalOpposingSeconds += Dt;
                reversalPeakAssist = Math.Max(reversalPeakAssist, Math.Abs(assistRoll));
            } else if (inTracking) {
                trackingSeconds += Dt;
                trackingLeadErrors.Add(totalErrorRad * 180.0 / Math.PI);
                if (Math.Abs(assistRoll) > 1e-4
                    || Math.Abs(flight.GDemand - pilotCommand.GDemand) > 1e-3)
                    trackingAssistSeconds += Dt;
                trackingAssistMagnitude += Math.Abs(assistRoll) * Dt;
                trackingCorrectionG += (flight.GDemand - pilotCommand.GDemand) * Dt;
            }

            // ---- trigger + weapon step ----------------------------------------------------
            bool trigger = gun.TargetAlive
                && rangeM > 120.0 && rangeM < 900.0
                && totalErrorRad <= 3.0 * Math.PI / 180.0;
            if (rangeM > 120.0 && rangeM < 900.0
                && totalErrorRad <= 3.0 * Math.PI / 180.0)
                firingConeSeconds += Dt;
            if (trigger) {
                triggerLeadErrors.Add(totalErrorRad * 180.0 / Math.PI);
                triggerRanges.Add(rangeM);
            }
            gun.Step(trigger, playerState, banditState, Dt);

            player.Step(flight, Dt);
            if (player.BelowGround) break;
        }

        return new Result(
            Rounds: gun.RoundsFired,
            Hits: gun.HitCount,
            MedianTriggerLeadErrorDeg: Median(triggerLeadErrors),
            MedianTriggerRangeM: Median(triggerRanges),
            ReversalSeconds: reversalSeconds,
            ReversalAssistSeconds: reversalAssistSeconds,
            ReversalOpposingSeconds: reversalOpposingSeconds,
            ReversalPeakAssistRoll: reversalPeakAssist,
            TrackingSeconds: trackingSeconds,
            TrackingAssistSeconds: trackingAssistSeconds,
            TrackingMeanAssistMagnitude: trackingSeconds > 0.0
                ? trackingAssistMagnitude / trackingSeconds : 0.0,
            MedianTrackingLeadErrorDeg: Median(trackingLeadErrors),
            TrackingMeanCorrectionG: trackingSeconds > 0.0
                ? trackingCorrectionG / trackingSeconds : 0.0,
            FiringConeSeconds: firingConeSeconds,
            DutyCycle01: assistSeconds / Math.Max(seconds, 1e-9));
    }

    /// <summary>
    /// The reportable instrument: the same scripted pass flown over <paramref name="runs"/>
    /// randomised entry geometries, pooled. Counts sum, windows sum, medians are pooled medians.
    /// </summary>
    public static Result RunEnsemble(
        bool gunneryAssistEnabled,
        bool padlockSelected,
        bool reversalGate = true,
        bool leadFeedForward = true,
        int runs = 24,
        double seconds = 45.0,
        double reversalPeriodSeconds = 6.0,
        double pilotPitchGain = 22.0) {
        int rounds = 0, hits = 0;
        double triggerLead = 0.0, triggerRange = 0.0, trackingLead = 0.0;
        double triggerWeight = 0.0, trackingWeight = 0.0;
        double revS = 0.0, revAssistS = 0.0, revOppS = 0.0, revPeak = 0.0;
        double trkS = 0.0, trkAssistS = 0.0, trkMagnitude = 0.0, duty = 0.0;
        double trkCorrectionG = 0.0, coneS = 0.0;
        for (int seed = 1; seed <= runs; seed++) {
            Result run = Run(gunneryAssistEnabled, padlockSelected, reversalGate,
                leadFeedForward, seconds, reversalPeriodSeconds, seed, pilotPitchGain);
            rounds += run.Rounds;
            hits += run.Hits;
            if (!double.IsNaN(run.MedianTriggerLeadErrorDeg)) {
                triggerLead += run.MedianTriggerLeadErrorDeg;
                triggerRange += run.MedianTriggerRangeM;
                triggerWeight += 1.0;
            }
            if (!double.IsNaN(run.MedianTrackingLeadErrorDeg)) {
                trackingLead += run.MedianTrackingLeadErrorDeg * run.TrackingSeconds;
                trackingWeight += run.TrackingSeconds;
            }
            revS += run.ReversalSeconds;
            revAssistS += run.ReversalAssistSeconds;
            revOppS += run.ReversalOpposingSeconds;
            revPeak = Math.Max(revPeak, run.ReversalPeakAssistRoll);
            trkS += run.TrackingSeconds;
            trkAssistS += run.TrackingAssistSeconds;
            trkMagnitude += run.TrackingMeanAssistMagnitude * run.TrackingSeconds;
            trkCorrectionG += run.TrackingMeanCorrectionG * run.TrackingSeconds;
            coneS += run.FiringConeSeconds;
            duty += run.DutyCycle01;
        }
        return new Result(
            Rounds: rounds,
            Hits: hits,
            MedianTriggerLeadErrorDeg: triggerWeight > 0.0 ? triggerLead / triggerWeight : double.NaN,
            MedianTriggerRangeM: triggerWeight > 0.0 ? triggerRange / triggerWeight : double.NaN,
            ReversalSeconds: revS,
            ReversalAssistSeconds: revAssistS,
            ReversalOpposingSeconds: revOppS,
            ReversalPeakAssistRoll: revPeak,
            TrackingSeconds: trkS,
            TrackingAssistSeconds: trkAssistS,
            TrackingMeanAssistMagnitude: trkS > 0.0 ? trkMagnitude / trkS : 0.0,
            MedianTrackingLeadErrorDeg: trackingWeight > 0.0
                ? trackingLead / trackingWeight : double.NaN,
            TrackingMeanCorrectionG: trkS > 0.0 ? trkCorrectionG / trkS : 0.0,
            FiringConeSeconds: coneS,
            DutyCycle01: duty / Math.Max(runs, 1));
    }

    static double Median(List<double> values) {
        if (values.Count == 0) return double.NaN;
        values.Sort();
        return values[values.Count / 2];
    }
}
