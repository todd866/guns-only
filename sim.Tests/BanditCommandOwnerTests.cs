using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// WHICH LAW IS ACTUALLY FLYING THE AIRCRAFT?
///
/// `Tactic` is not a command owner and cannot be used as one: at least three branches set
/// `Tactic = Return`, including the one that dispatches LowBlockPerchCommand. Three separate
/// containment fixes failed on 2026-08-29 because each guessed the owner from `Tactic` instead of
/// measuring it. `CommandOwner` publishes the law that produced `LastCommand` on the tick that
/// produced it, so a tape can say what flew.
public class BanditCommandOwnerTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double MergeAltitudeM = 3048.0;
    static readonly AircraftParams BanditAir = FlightModel.Su27SPublicDataSurrogate;
    static readonly AircraftParams PlayerAir = FlightModel.F22APublicDataSurrogate;

    static ReactiveBandit StagedBandit(PilotSkill skill) => new(
        new AircraftState(new Vec3D(0.0, MergeAltitudeM + 60.0, 0.0),
            BeatSetup.CornerTrueAirspeedMps(BanditAir, MergeAltitudeM),
            0.0, 0.0, 0.0, BanditAir.MassKg),
        BanditAir, skill);

    static PilotCommand LevelChase(AircraftState player, in Vec3D banditPos, double holdAltM) {
        double bearing = System.Math.Atan2(banditPos.X - player.Position.X,
            banditPos.Z - player.Position.Z);
        double error = System.Math.Atan2(System.Math.Sin(bearing - player.Chi),
            System.Math.Cos(bearing - player.Chi));
        double bank = System.Math.Clamp(error * 2.0, -1.0, 1.0);
        double altError = holdAltM - player.Position.Y;
        double g = System.Math.Clamp(1.0 / System.Math.Cos(bank) + altError * 0.002, 0.5, 6.0);
        return new PilotCommand(g, bank, 1.0, 0.0);
    }

    /// Every tick that produces a command must name its owner. This is the guard that keeps a
    /// newly added `LastCommand = ...` site from going dark: it fails on the first unlabelled tick
    /// rather than silently reporting Unset in a tape months later.
    [Theory]
    [InlineData(PilotSkill.Novice)]
    [InlineData(PilotSkill.Competent)]
    [InlineData(PilotSkill.Veteran)]
    [InlineData(PilotSkill.Ace)]
    public void EveryFlownTickNamesTheLawThatFlewIt(PilotSkill skill) {
        const double PlayerHoldM = 4592.0;
        var bandit = StagedBandit(skill);
        var player = new AircraftSim(
            new AircraftState(new Vec3D(0.0, PlayerHoldM, -2000.0), 300.0, 0.0, 0.0, 0.0,
                PlayerAir.MassKg),
            PlayerAir);

        for (int tick = 0; tick <= 120 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(LevelChase(player.State, bandit.State.Position, PlayerHoldM), Dt);
            Assert.True(bandit.CommandOwner != BanditCommandOwner.Unset,
                $"{skill} left tick {tick} unlabelled — a LastCommand site publishes no owner");
        }
    }

    /// The distinction the failed fixes needed: Tactic says Return while a different law flies.
    [Fact]
    public void TacticReturnDoesNotImplyTheReturnLawIsFlying() {
        const double PlayerHoldM = 4592.0;
        var bandit = StagedBandit(PilotSkill.Ace);
        var player = new AircraftSim(
            new AircraftState(new Vec3D(0.0, PlayerHoldM, -2000.0), 300.0, 0.0, 0.0, 0.0,
                PlayerAir.MassKg),
            PlayerAir);

        var ownersUnderTacticReturn = new System.Collections.Generic.HashSet<BanditCommandOwner>();
        for (int tick = 0; tick <= 180 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(player.State, tick), Dt);
            player.Step(LevelChase(player.State, bandit.State.Position, PlayerHoldM), Dt);
            if (bandit.Tactic == BanditTactic.Return)
                ownersUnderTacticReturn.Add(bandit.CommandOwner);
        }

        Assert.True(ownersUnderTacticReturn.Count > 1,
            "if Tactic=Return named exactly one law this instrumentation would be unnecessary; "
            + $"observed {string.Join(", ", ownersUnderTacticReturn)}");
    }
}
