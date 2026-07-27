using GunsOnly.Sim;
using Xunit;

public class PointsLedgerTests {
    [Fact]
    public void KillAndTrap_CreditsOutweighFuel() {
        var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
            Finished: true, PlayerAlive: true, BanditDestroyed: true,
            CleanRecovery: true, FuelBurnedLb: 800, PlayerLost: false), 0);
        Assert.Contains(slip.Lines, l => l.Code == "KILL" && l.Points == 100);
        Assert.Contains(slip.Lines, l => l.Code == "RECOVERY" && l.Points == 50);
        Assert.Contains(slip.Lines, l => l.Code == "FUEL" && l.Points == -80);
        Assert.Equal(70, slip.SortieNet);
        Assert.Equal(SortieClearance.Cleared, slip.Clearance);
    }

    [Fact]
    public void Loss_GroundsFromZero() {
        var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
            Finished: true, PlayerAlive: false, BanditDestroyed: false,
            CleanRecovery: false, FuelBurnedLb: 100, PlayerLost: true), 0);
        Assert.True(slip.BalanceAfter < PointsLedger.GroundedBelow);
        Assert.Equal(SortieClearance.Grounded, slip.Clearance);
    }

    [Fact]
    public void NegativeButAboveFloor_Defers() {
        var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
            Finished: true, PlayerAlive: true, BanditDestroyed: false,
            CleanRecovery: false, FuelBurnedLb: 200, PlayerLost: false), 0);
        Assert.Equal(SortieClearance.Deferred, slip.Clearance);
    }

    [Fact]
    public void Unfinished_IsNoOp() {
        var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
            Finished: false, PlayerAlive: true, BanditDestroyed: true,
            CleanRecovery: true, FuelBurnedLb: 500, PlayerLost: false), 40);
        Assert.Empty(slip.Lines);
        Assert.Equal(0, slip.SortieNet);
        Assert.Equal(40, slip.BalanceAfter);
        Assert.Equal(SortieClearance.Cleared, slip.Clearance);
    }
}
