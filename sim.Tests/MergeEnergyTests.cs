using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// Pilot report: "I'm literally winning on the first turn." If the merge is decided before any BFM
/// happens, every downstream tuning knob is downstream of a fight already lost — so this measures
/// the energy state each side is HANDED at the merge, before anyone makes a decision.
public class MergeEnergyTests {
    readonly ITestOutputHelper _out;
    public MergeEnergyTests(ITestOutputHelper output) => _out = output;

    [Fact]
    public void ReportStagedEnergyAgainstEachAirframesOwnCorner() {
        BeatSetup beat = Beats.ModernVisualMerge();
        double altitudeM = beat.Player.Position.Y;

        void Report(string name, AircraftParams air, double stagedTasMps) {
            double cornerKias = AirData.PositiveCornerSpeedKiasAtAltitude(
                air.MassKg, air, altitudeM);
            double cornerTas = AirData.TrueAirspeedForCalibratedAirspeedMps(
                cornerKias / AirData.MpsToKnots, altitudeM);
            double stagedKias =
                AirData.CalibratedAirspeedMps(stagedTasMps, altitudeM) * AirData.MpsToKnots;
            _out.WriteLine(
                $"{name,-26} staged {stagedTasMps,6:F1} m/s TAS ({stagedKias,6:F0} KIAS)   "
                + $"its own corner {cornerTas,6:F1} m/s TAS ({cornerKias,6:F0} KIAS)   "
                + $"delta {stagedTasMps - cornerTas,+7:F1} m/s "
                + $"({100.0 * (stagedTasMps - cornerTas) / cornerTas,+6:F1}%)");
        }

        Report("F-22A  (player)", FlightModel.F22APublicDataSurrogate, beat.Player.Speed);
        Report("Su-27S (baseline bandit)", FlightModel.Su27SPublicDataSurrogate,
            beat.Bandit.Speed);
        Report("Su-35S (uprated bandit)", FlightModel.Su35SPublicDataSurrogate,
            beat.Bandit.Speed);
    }
    // Pilot: "I should arrive at the exact config and power setting by default, it's slightly
    // annoying having to setup every time." Staged at corner SPEED but full military thrust, the
    // jet accelerates straight off corner and the pilot pulls power before every fight.
    [Fact]
    public void ThePlayerArrivesTrimmedForTheSpeedTheyAreStagedAt() {
        var session = new SimulationSession(7);
        double staged = session.Player.AirspeedMps;
        double throttle = session.Player.ThrustFraction;

        Assert.InRange(throttle, 0.01, 0.85);
        Assert.NotEqual(1.0, throttle, 3);

        // Fly a few seconds hands-off: a trimmed jet holds its speed instead of running away.
        session.Begin();
        for (int tick = 0; tick < AircraftSim.TickHz * 5; tick++) session.StepFixed();
        double drift = session.Player.AirspeedMps - staged;
        _out.WriteLine(
            $"staged {staged:F1} m/s at throttle {throttle:F3}; after 5 s hands-off "
            + $"{session.Player.AirspeedMps:F1} m/s (drift {drift:+0.0;-0.0} m/s)");
        Assert.InRange(drift, -12.0, 12.0);
    }

    [Fact]
    public void BothSidesNowStageWithinTheirOwnCornerBand() {
        BeatSetup beat = Beats.ModernVisualMerge();
        double banditCorner = BeatSetup.CornerTrueAirspeedMps(
            FlightModel.Su27SPublicDataSurrogate, beat.Player.Position.Y);
        Assert.Equal(banditCorner, beat.Bandit.Speed, 1);
        // The old staging was 285 m/s — 37.6% fast. Anything near it is the bug returning.
        Assert.True(beat.Bandit.Speed < 240.0,
            $"bandit staged {beat.Bandit.Speed:F1} m/s, above its own corner band");
    }

    /// Who wins the FIRST TURN — the question the pilot actually asked.
    ///
    /// DIAGNOSTIC ONLY, and it CANNOT answer that question: AI-vs-AI merges are symmetric by
    /// construction (both sides fly the same lookahead and cross nose-on within a tick of each
    /// other — the degenerate case AiThreatTests documents in its own header). It is kept because
    /// it prints the geometry, not because it discriminates. The staging fix rests on closed-form
    /// turn-rate arithmetic instead: omega = g*sqrt(n^2-1)/V gives the Su-27S 17.6 deg/s at the old
    /// 285 m/s staging and 24.3 deg/s at its 207 m/s corner, against the F-22A's 23.4 deg/s. That
    /// is a 2.5 second gift over 180 degrees of turn, every merge, and it is arithmetic rather than
    /// simulation. Only a real pilot can confirm the felt effect.
    static (double refFirstSeconds, double enemyFirstSeconds, double refBestDeg,
        double enemyBestDeg) FirstTurn(double banditStagedSpeedMps) {
        const double Dt = 1.0 / AircraftSim.TickHz;
        BeatSetup beat = Beats.ModernVisualMerge();
        var reference = new ReactiveBandit(
            beat.Player, FlightModel.F22APublicDataSurrogate, PilotSkill.Ace);
        var enemy = new ReactiveBandit(
            beat.Bandit with { Speed = banditStagedSpeedMps },
            FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace);
        double refFirst = double.PositiveInfinity, enemyFirst = double.PositiveInfinity;
        double refBest = 180.0, enemyBest = 180.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 40; tick++) {
            var refState = reference.State;
            var enemyState = enemy.State;
            var refObs = ActorObservation.Capture(refState, tick);
            var enemyObs = ActorObservation.Capture(enemyState, tick);
            double refDeg = BanditFireControl.NoseErrorRad(refState, enemyObs) * 180.0 / Math.PI;
            double enemyDeg = BanditFireControl.NoseErrorRad(enemyState, refObs) * 180.0 / Math.PI;
            double rangeM = Geometry.Range(refState, enemyState);
            if (rangeM < 2500.0) {
                refBest = Math.Min(refBest, refDeg);
                enemyBest = Math.Min(enemyBest, enemyDeg);
                if (refDeg < 30.0 && double.IsPositiveInfinity(refFirst)) refFirst = tick * Dt;
                if (enemyDeg < 30.0 && double.IsPositiveInfinity(enemyFirst)) enemyFirst = tick * Dt;
            }
            reference.Step(enemyObs, Dt);
            enemy.Step(refObs, Dt);
        }
        return (refFirst, enemyFirst, refBest, enemyBest);
    }

    [Fact]
    public void StagingTheBanditAtItsCornerChangesWhoWinsTheFirstTurn() {
        foreach ((string label, double speed) in new[] {
            ("OLD staging 285 m/s (37.6% fast)", 285.0),
            ("NEW staging at its own corner", 207.1) }) {
            var (refFirst, enemyFirst, refBest, enemyBest) = FirstTurn(speed);
            _out.WriteLine(
                $"{label,-34} player nose-on at {refFirst,6:F1}s (best {refBest,5:F1} deg)   "
                + $"bandit nose-on at {enemyFirst,6:F1}s (best {enemyBest,5:F1} deg)");
        }
    }

    /// The staging question settled against a MODEL OF THE PILOT rather than against a mirror.
    /// Reports, for each candidate bandit staging speed, how the fight actually goes.
    [Fact]
    public void JudgeBanditStagingAgainstTheScriptedHumanFirstTurn() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        BeatSetup beat = Beats.ModernVisualMerge();
        double corner = BeatSetup.CornerTrueAirspeedMps(
            FlightModel.Su27SPublicDataSurrogate, beat.Player.Position.Y);
        var bandCorner = AirData.PositiveCornerBandKiasAtAltitude(
            FlightModel.Su27SPublicDataSurrogate.MassKg,
            FlightModel.Su27SPublicDataSurrogate, beat.Player.Position.Y);
        double bandTopTas = AirData.TrueAirspeedForCalibratedAirspeedMps(
            bandCorner.MaxKias / AirData.MpsToKnots, beat.Player.Position.Y);
        _out.WriteLine(
            $"Su-27S corner {corner:F1} m/s; corner BAND top {bandTopTas:F1} m/s "
            + $"({bandCorner.MinKias:F0}-{bandCorner.MaxKias:F0} KIAS)");

        foreach ((string label, double speed) in new[] {
            ("old staging 285.0", 285.0),
            ("corner band top", bandTopTas),
            ("exact corner", corner) }) {
            var player = new ScriptedMergePlayer(
                beat.Player, FlightModel.F22APublicDataSurrogate);
            var bandit = new ReactiveBandit(
                beat.Bandit with { Speed = speed },
                FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace);
            double banditSolution = 0.0, playerSolution = 0.0, minRange = double.PositiveInfinity;
            double banditBest = 180.0;
            for (int tick = 0; tick < AircraftSim.TickHz * 60; tick++) {
                var playerState = player.State;
                var banditState = bandit.State;
                var playerObs = ActorObservation.Capture(playerState, tick);
                var banditObs = ActorObservation.Capture(banditState, tick);
                double rangeM = Geometry.Range(playerState, banditState);
                minRange = Math.Min(minRange, rangeM);
                if (rangeM >= BanditFireControl.MinimumRangeM
                    && rangeM <= BanditFireControl.MaximumRangeM) {
                    double banditDeg =
                        BanditFireControl.NoseErrorRad(banditState, playerObs) * 180.0 / Math.PI;
                    double playerDeg =
                        BanditFireControl.NoseErrorRad(playerState, banditObs) * 180.0 / Math.PI;
                    banditBest = Math.Min(banditBest, banditDeg);
                    if (banditDeg <= 3.0) banditSolution += Dt;
                    if (playerDeg <= 3.0) playerSolution += Dt;
                }
                player.Step(banditState, Dt);
                bandit.Step(playerObs, Dt);
            }
            _out.WriteLine(
                $"  {label,-18} staged {speed,6:F1} m/s  ->  bandit solution {banditSolution,5:F2}s "
                + $"(best {banditBest,5:F1} deg)   player solution {playerSolution,5:F2}s   "
                + $"min range {minRange,5:F0} m");
        }
    }

    /// Where the Ace actually loses the fight against the modelled human turn. Prints the angular
    /// history rather than a single summary number: a gross positional failure (never near the
    /// nose) and a fine-tracking failure (near but never inside the gate) demand opposite fixes,
    /// and every previous attempt guessed which one it was.
    [Fact]
    public void TraceWhereTheAceLosesTheModelledHumanFight() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        BeatSetup beat = Beats.ModernVisualMerge();
        var player = new ScriptedMergePlayer(beat.Player, FlightModel.F22APublicDataSurrogate);
        var bandit = new ReactiveBandit(
            beat.Bandit, FlightModel.Su35SPublicDataSurrogate, PilotSkill.Ace);
        BanditSkillProfile profile = BanditSkillProfile.For(PilotSkill.Ace);

        _out.WriteLine($"{"t",6} {"range",6} {"banditErr",10} {"leadErr",8} {"playerErr",10} {"tactic",-8}");
        double bestBody = 180.0, bestLead = 180.0, inBand = 0.0, inBody = 0.0;
        for (int tick = 0; tick < AircraftSim.TickHz * 45; tick++) {
            var playerState = player.State;
            var banditState = bandit.State;
            var playerObs = ActorObservation.Capture(playerState, tick);
            var banditObs = ActorObservation.Capture(banditState, tick);
            double rangeM = Geometry.Range(playerState, banditState);
            double bodyDeg =
                BanditFireControl.NoseErrorRad(banditState, playerObs) * 180.0 / Math.PI;
            double leadDeg =
                BanditFireControl.LeadNoseErrorRad(banditState, playerObs) * 180.0 / Math.PI;
            double playerDeg =
                BanditFireControl.NoseErrorRad(playerState, banditObs) * 180.0 / Math.PI;
            bool band = rangeM >= BanditFireControl.MinimumRangeM
                && rangeM <= BanditFireControl.MaximumRangeM;
            if (band) {
                inBand += Dt;
                bestBody = Math.Min(bestBody, bodyDeg);
                bestLead = Math.Min(bestLead, leadDeg);
                if (bodyDeg <= profile.FireConeDeg) inBody += Dt;
            }
            if (tick % (AircraftSim.TickHz / 2) == 0 && tick < AircraftSim.TickHz * 30)
                _out.WriteLine(
                    $"{tick * Dt,6:F1} {rangeM,6:F0} {bodyDeg,10:F1} {leadDeg,8:F1} "
                    + $"{playerDeg,10:F1} {bandit.Tactic,-8}");
            player.Step(banditState, Dt);
            bandit.Step(playerObs, Dt);
        }
        _out.WriteLine(
            $"SUMMARY in-band {inBand:F1}s | inside its {profile.FireConeDeg:F1} deg body gate "
            + $"{inBody:F2}s | best body {bestBody:F1} deg | best lead {bestLead:F1} deg");
    }

    /// Is the Ace's failure MYOPIA? It evaluates 1.25 s of future to choose a manoeuvre whose
    /// payoff is 6-10 s away, so a post-merge break — which costs the nose immediately and repays
    /// much later — can never score well. Sweep the horizon and watch the post-merge recovery.
    [Fact]
    public void SweepTheLookaheadHorizonAgainstTheModelledHuman() {
        const double Dt = 1.0 / AircraftSim.TickHz;
        BeatSetup beat = Beats.ModernVisualMerge();
        _out.WriteLine($"{"horizon",8} {"seconds",8} {"inBand",7} {"inGate",7} {"bestBody",9} "
            + $"{"errAt+6s",9} {"errAt+10s",10}");
        foreach (int horizonTicks in new[] { 150, 300, 600, 900, 1200 }) {
            var player = new ScriptedMergePlayer(beat.Player, FlightModel.F22APublicDataSurrogate);
            BanditSkillProfile profile = BanditSkillProfile.For(PilotSkill.Ace)
                with { LookaheadHorizonTicks = horizonTicks };
            var bandit = new ReactiveBandit(
                beat.Bandit, FlightModel.Su35SPublicDataSurrogate, PilotSkill.Ace,
                terrain: null, profile: profile);
            double inBand = 0.0, inGate = 0.0, best = 180.0;
            double mergeAt = double.NaN, errPlus6 = double.NaN, errPlus10 = double.NaN;
            double previousRange = double.PositiveInfinity;
            for (int tick = 0; tick < AircraftSim.TickHz * 45; tick++) {
                var playerState = player.State;
                var banditState = bandit.State;
                var playerObs = ActorObservation.Capture(playerState, tick);
                double rangeM = Geometry.Range(playerState, banditState);
                double bodyDeg =
                    BanditFireControl.NoseErrorRad(banditState, playerObs) * 180.0 / Math.PI;
                double now = tick * Dt;
                if (double.IsNaN(mergeAt) && rangeM > previousRange && previousRange < 400.0)
                    mergeAt = now;
                previousRange = rangeM;
                if (!double.IsNaN(mergeAt)) {
                    if (double.IsNaN(errPlus6) && now >= mergeAt + 6.0) errPlus6 = bodyDeg;
                    if (double.IsNaN(errPlus10) && now >= mergeAt + 10.0) errPlus10 = bodyDeg;
                }
                if (rangeM >= BanditFireControl.MinimumRangeM
                    && rangeM <= BanditFireControl.MaximumRangeM) {
                    inBand += Dt;
                    best = Math.Min(best, bodyDeg);
                    if (bodyDeg <= profile.FireConeDeg) inGate += Dt;
                }
                player.Step(banditState, Dt);
                bandit.Step(playerObs, Dt);
            }
            _out.WriteLine(
                $"{horizonTicks,8} {horizonTicks / 120.0,8:F2} {inBand,7:F2} {inGate,7:F2} "
                + $"{best,9:F1} {errPlus6,9:F1} {errPlus10,10:F1}");
        }
    }

}
