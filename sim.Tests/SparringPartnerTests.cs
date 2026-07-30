using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// The opening 1v2 stays the hardest fight in the game — two Aces, per the pilot's standing
/// instruction. What changes is that they OPEN co-operative: BanditTactic.Present flies a stable
/// reference line the newcomer can join up on, and the pair turns on them the moment they hold a
/// gun position. Scaffolding is behavioural; the tier ladder is untouched.
public class SparringPartnerTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(double x, double y, double z, double speed, double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    /// Bandit at the origin tracking north (chi = 0 -> forward is +z).
    static ReactiveBandit SparringPartner() =>
        new(State(0.0, 1000.0, 0.0, 180.0), FlightModel.Sabre,
            PilotSkill.Ace, terrain: null, engagementNumber: 1,
            profile: null, doctrineIndex: null, presenting: true);

    /// Player astern at the given range, nose on the bandit.
    static AircraftState PlayerAstern(double rangeM) =>
        State(0.0, 1000.0, -rangeM, 180.0);

    [Fact]
    public void TheSparringPartnerOpensCooperative() {
        var bandit = SparringPartner();
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void ItStaysAnAceUnderneath() {
        // The scaffolding is behaviour, not tier. The doctrine that the opening fight is the
        // hardest one survives intact.
        var bandit = SparringPartner();
        Assert.Equal(PilotSkill.Ace, bandit.Skill);
    }

    [Fact]
    public void HoldingAGunPositionGraduatesThePartner() {
        var bandit = SparringPartner();
        var player = PlayerAstern(500.0);           // inside the 900 m funnel, nose on
        for (int i = 0; i < (int)(3.0 * AircraftSim.TickHz); i++) bandit.Step(player, Dt);
        Assert.False(bandit.Presenting);
    }

    [Fact]
    public void StayingOutOfRangeDoesNotGraduateThePartner() {
        var bandit = SparringPartner();
        var player = PlayerAstern(4000.0);          // outside the funnel envelope entirely
        for (int i = 0; i < (int)(10.0 * AircraftSim.TickHz); i++) bandit.Step(player, Dt);
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void BriefTrackingIsNotEnough() {
        var bandit = SparringPartner();
        var close = PlayerAstern(500.0);
        var far = PlayerAstern(4000.0);
        // One second on, one second off, repeatedly: never a sustained 2 s hold.
        for (int cycle = 0; cycle < 4; cycle++) {
            for (int i = 0; i < (int)(1.0 * AircraftSim.TickHz); i++) bandit.Step(close, Dt);
            for (int i = 0; i < (int)(1.0 * AircraftSim.TickHz); i++) bandit.Step(far, Dt);
        }
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void WithdrawalIsOneWay() {
        var bandit = SparringPartner();
        for (int i = 0; i < (int)(3.0 * AircraftSim.TickHz); i++) bandit.Step(PlayerAstern(500.0), Dt);
        Assert.False(bandit.Presenting);
        for (int i = 0; i < (int)(5.0 * AircraftSim.TickHz); i++) bandit.Step(PlayerAstern(6000.0), Dt);
        Assert.False(bandit.Presenting);            // scaffolding does not come back
    }

    [Fact]
    public void PresentingIsDeterministic() {
        var a = SparringPartner();
        var b = SparringPartner();
        var player = PlayerAstern(700.0);
        for (int i = 0; i < (int)(4.0 * AircraftSim.TickHz); i++) {
            a.Step(player, Dt);
            b.Step(player, Dt);
            Assert.Equal(a.Tactic, b.Tactic);
            Assert.Equal(a.Presenting, b.Presenting);
        }
    }

    [Fact]
    public void ASparringPartnerDoesNotShootYou() {
        var bandit = SparringPartner();
        // Player parked right in the bandit's own firing envelope: an ungated Ace would fire.
        var player = State(0.0, 1000.0, 400.0, 180.0, chi: System.Math.PI);
        var observed = new ActorObservation(
            player.Position, player.Speed, 0.0, player.Chi, 0.0, 0L, 0, 1.0);
        for (int i = 0; i < (int)(1.0 * AircraftSim.TickHz); i++) {
            Assert.False(bandit.WantsToFire(observed));
            bandit.Step(player, Dt);
        }
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void DefaultConstructionIsUnchangedByThisFeature() {
        var bandit = new ReactiveBandit(State(0.0, 1000.0, 0.0, 165.0), FlightModel.Sabre);
        Assert.False(bandit.Presenting);
        Assert.Equal(BanditTactic.Acquire, bandit.Tactic);
    }
}
