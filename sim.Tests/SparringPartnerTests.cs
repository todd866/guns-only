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
    public void RungZeroPresentDoesNotGraduateOnProximity() {
        var bandit = new ReactiveBandit(
            State(0.0, 1000.0, 0.0, 180.0), FlightModel.Sabre,
            PilotSkill.Competent, terrain: null, engagementNumber: 1,
            presenting: true, endPresentOnProximity: false);
        int ticks = (int)(10.0 * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            var player = State(1200.0, 1000.0, bandit.State.Position.Z, 180.0);
            bandit.Step(player, Dt);
        }
        Assert.True(bandit.Presenting);
        Assert.Equal(PilotSkill.Competent, bandit.Skill);
    }

    /// "Mostly passive, then it kills me, and it's boring" (owner, 2026-10-01). The Build 371 flight
    /// behind it was 70 s of a presenting rung-0 Competent and zero rounds. Whatever the player
    /// does — even staying out of range with the proximity latch off — the present ends.
    [Fact]
    public void ThePresentEndsByItsMaximumWhateverThePlayerDoes() {
        var bandit = new ReactiveBandit(
            State(0.0, 1000.0, 0.0, 180.0), FlightModel.Sabre,
            PilotSkill.Competent, terrain: null, engagementNumber: 1,
            presenting: true, endPresentOnProximity: false);
        var player = PlayerAstern(4000.0);
        int ticks = (int)((ReactiveBandit.PresentMaximumSeconds + 0.5) * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) bandit.Step(player, Dt);
        Assert.False(bandit.Presenting);
    }

    /// Production rung 0 graduates on proximity again: four seconds inside 1.5 km is "you are in
    /// the fight". Build 370 had removed that latch for rung 0 so the opener stayed a non-firing
    /// lead until tracked; the owner's verdict on that was "boring".
    [Fact]
    public void ProductionRungZeroGraduatesOnProximity() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.ModernVisualMerge());
        session.Begin();
        Assert.True(session.Bandit.Presenting);
        // The spawn is 1 km ahead, so the proximity latch (4 s inside 1.5 km) must fire well before
        // the 12 s cap could; graduating at the cap would mean the latch is still off.
        double limitS = ReactiveBandit.PresentProximitySeconds + 2.0;
        int ticks = (int)(limitS * AircraftSim.TickHz);
        for (int i = 0; i < ticks && session.Bandit.Presenting; i++) {
            // Hold station 1 km in trail: inside 1.5 km, outside the 900 m tracking funnel.
            AircraftState lead = session.Bandit.State;
            session.Player.AdoptExternalKinematics(lead with {
                Position = lead.Position - lead.ForwardDir() * 1_000.0 });
            session.Advance(Dt);
        }
        Assert.False(session.Bandit.Presenting,
            $"still presenting after {limitS:F0} s at {Geometry.Range(session.Player.State, session.Bandit.State):F0} m "
            + $"({session.Bandit.GetType().Name}, skill {(session.Bandit as NeutralMergeBandit)?.Skill}); "
            + "the rung-0 proximity latch is off");
    }

    /// A finished present must start the fight, not leave the scripted pass flying a straight line
    /// until the player happens to cross 900 m (review finding, 2026-10-01).
    [Fact]
    public void AFinishedPresentStartsTheFightEvenWithoutAMerge() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.ModernVisualMerge());
        session.Begin();
        var merge = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        int ticks = (int)((NeutralMergeBandit.MaximumAuthoredPassSeconds + 1.0) * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) session.Advance(Dt);
        Assert.False(merge.Presenting);
        Assert.True(merge.FirstPassComplete,
            "the authored pass is still flying: no fight began after the present ended");
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
    public void HangingInsideTheFightWithoutAGunSolutionStillGraduatesThePartner() {
        // Visitors find the bandit and never hold the 12-degree gun funnel, so a purely
        // tracking-gated present lasted the whole sortie and the Ace never fired. Four seconds
        // inside 1.5 km is "you are in the fight"; the pair must turn, gun hold or not.
        var bandit = SparringPartner();
        // HoldingAGunPosition uses 3 s against a 2 s hold for the same reason: 120 Hz
        // accumulation of 1/120 undershoots the integer second (480 ticks → 3.999… < 4).
        int ticks = (int)((ReactiveBandit.PresentProximitySeconds + 0.25) * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            // Abeam, co-speed: range stays ~1.2 km while the player's nose is 90 deg off the
            // bandit, so the tracking gate never fires and only proximity can graduate.
            var player = State(1200.0, 1000.0, bandit.State.Position.Z, 180.0);
            bandit.Step(player, Dt);
        }
        Assert.False(bandit.Presenting);
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
