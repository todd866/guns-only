using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class DoctrineTests {
    static AircraftState At(Vec3D pos, double chi, double speed = 180) =>
        new(pos, speed, 0, chi, 0, FlightModel.Sabre.MassKg);

    [Fact] public void BankLawZeroWhenTargetDirectlyAbovePathAndZeroBank() {
        var own = At(Vec3D.Zero, 0);
        double bank = Geometry.BankToPlaceLiftVectorOn(own, new Vec3D(0, 1000, 500));
        Assert.InRange(System.Math.Abs(bank), 0, 0.05);
    }
    [Fact] public void BankLawNinetyWhenTargetAbeamRight() {
        var own = At(Vec3D.Zero, 0);
        double bank = Geometry.BankToPlaceLiftVectorOn(own, new Vec3D(1000, 0, 200));
        Assert.InRange(bank, 1.35, 1.75); // ~ +90 deg
    }
    [Fact] public void PurePursuitReducesAngleOff() {
        var own = At(Vec3D.Zero, 0, 200);
        var bandit = At(new Vec3D(800, 150, 1500), 0.6, 170);
        var ownSim = new AircraftSim(own, FlightModel.Sabre);
        var banditSim = new AircraftSim(bandit, FlightModel.Sabre);
        var law = new PurePursuitLaw();
        double a0 = Geometry.AngleOff(ownSim.State, banditSim.State);
        for (int i = 0; i < 1200; i++) { // 10 s
            var adv = law.Advise(ownSim.State, banditSim.State, FlightModel.Sabre);
            ownSim.Step(new PilotCommand(adv.RecommendedG, adv.RecommendedBank, 1.0, 0), 1.0/AircraftSim.TickHz);
            banditSim.Step(new PilotCommand(1.0, 0, 0.8, 0), 1.0/AircraftSim.TickHz);
        }
        Assert.True(Geometry.AngleOff(ownSim.State, banditSim.State) < a0 * 0.5,
            "pursuit law failed to halve angle-off in 10 s");
    }
    [Fact] public void BreakLawCommandsMaxPerformIntoDirection() {
        var own = At(Vec3D.Zero, 0, 220);
        var adv = new BreakLaw(+1).Advise(own, At(new Vec3D(0, 100, -900), 0), FlightModel.Sabre);
        Assert.Equal(Protection.MaxPerformG(own, FlightModel.Sabre), adv.RecommendedG, 3);
        Assert.InRange(adv.RecommendedBank, 1.2, 1.6); // hard right bank
    }
    [Fact] public void GunsLawAimsAheadOfCrossingTarget() {
        var own = At(Vec3D.Zero, 0, 220);
        var bandit = At(new Vec3D(0, 0, 600), System.Math.PI/2, 170); // 600 m ahead, crossing right
        var pure = new PurePursuitLaw().Advise(own, bandit, FlightModel.Sabre);
        var guns = new GunsSaddleLaw().Advise(own, bandit, FlightModel.Sabre);
        Assert.True(guns.RecommendedBank > pure.RecommendedBank - 0.35, "lead should bank toward the crossing side at least as much");
        Assert.NotEqual(pure.RecommendedBank, guns.RecommendedBank, 3);
    }
    [Fact] public void PursuitLawsDoNotThrowWhenEnergyDepleted() {
        var slow = At(Vec3D.Zero, 0, 60); // MaxPerformG < 1 here
        var bandit = At(new Vec3D(500, 100, 800), 0.4);
        var mp = Protection.MaxPerformG(slow, FlightModel.Sabre);
        Assert.True(mp < 1.0);
        var pure = new PurePursuitLaw().Advise(slow, bandit, FlightModel.Sabre);
        var guns = new GunsSaddleLaw().Advise(slow, bandit, FlightModel.Sabre);
        Assert.Equal(mp, pure.RecommendedG, 9);
        Assert.Equal(mp, guns.RecommendedG, 9);
    }
}
