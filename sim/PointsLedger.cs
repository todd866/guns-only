namespace GunsOnly.Sim;

public enum SortieClearance : byte {
    Cleared = 0,
    Deferred = 1,
    Grounded = 2,
}

public readonly record struct SortieLedgerFacts(
    bool Finished,
    bool PlayerAlive,
    bool BanditDestroyed,
    bool CleanRecovery,
    double FuelBurnedLb,
    bool PlayerLost);

public readonly record struct LedgerLine(string Code, string Label, int Points);

public sealed record PointsLedgerSlip(
    IReadOnlyList<LedgerLine> Lines,
    int SortieNet,
    int BalanceBefore,
    int BalanceAfter,
    SortieClearance Clearance);

/// <summary>
/// Fiction rate card for the eastern-authority sortie loop. Scores only facts already on the
/// finished-sortie record — no invented geofence or collateral rows.
/// </summary>
public static class PointsLedger {
    public const int CreditKill = 100;
    public const int CreditCleanRecovery = 50;
    public const int DebitLoss = -200;
    public const int FuelDebitPerTenLb = -1;
    public const int DeferredBelow = 0;
    public const int GroundedBelow = -150;

    public static PointsLedgerSlip Evaluate(SortieLedgerFacts facts, int balanceBefore) {
        if (!facts.Finished) {
            SortieClearance idle = ClearanceFor(balanceBefore);
            return new PointsLedgerSlip(
                Array.Empty<LedgerLine>(), 0, balanceBefore, balanceBefore, idle);
        }

        var lines = new List<LedgerLine>(4);
        if (facts.BanditDestroyed && facts.PlayerAlive && !facts.PlayerLost) {
            lines.Add(new LedgerLine("KILL", "Verified splash", CreditKill));
        }
        if (facts.CleanRecovery && facts.PlayerAlive && !facts.PlayerLost) {
            lines.Add(new LedgerLine("RECOVERY", "Clean recovery", CreditCleanRecovery));
        }
        if (facts.PlayerLost || !facts.PlayerAlive) {
            lines.Add(new LedgerLine("LOSS", "Asset not returned", DebitLoss));
        }
        double burned = Math.Max(0.0, facts.FuelBurnedLb);
        int fuelPoints = (int)Math.Floor(burned / 10.0) * FuelDebitPerTenLb;
        if (fuelPoints != 0) {
            lines.Add(new LedgerLine("FUEL", "Fuel burned", fuelPoints));
        }

        int net = 0;
        foreach (LedgerLine line in lines) net += line.Points;
        int after = balanceBefore + net;
        return new PointsLedgerSlip(lines, net, balanceBefore, after, ClearanceFor(after));
    }

    static SortieClearance ClearanceFor(int balance) {
        if (balance >= DeferredBelow) return SortieClearance.Cleared;
        if (balance >= GroundedBelow) return SortieClearance.Deferred;
        return SortieClearance.Grounded;
    }
}
