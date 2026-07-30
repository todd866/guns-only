using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public readonly record struct RapierEconomicTargetContract(
    string Id,
    string Label,
    int NeutralizationCredit);

public readonly record struct RapierEconomicSortieFacts(
    MissionEconomicMode EconomicMode,
    bool Finished,
    RapierJobKind Target,
    bool TargetNeutralized,
    bool CleanRecovery,
    bool PlayerLost,
    double FuelBurnedLb,
    int RoundsExpended,
    bool ExceedanceInspectionRequired,
    RapierServiceLifeEvidenceStatus EvidenceStatus);

public readonly record struct RapierEconomicLine(
    string Category,
    string Code,
    string Label,
    int Credits);

public sealed record RapierEconomicSortieSlip(
    bool Active,
    string ModelId,
    string Currency,
    string PriceBasisId,
    RapierEconomicTargetContract Target,
    IReadOnlyList<RapierEconomicLine> Lines,
    int SortieNetCredits,
    bool InspectionReserved,
    bool DamageCostComputed);

/// <summary>
/// Pure fictional allocation-credit model for the Rapier operations mission. It books observed
/// consumables, target-contract value, confirmed aircraft loss, and an inspection reservation
/// when authoritative exposure crosses a review boundary. It never converts exposure into
/// component damage, repair cost, residual strength, or a whole-aircraft depreciation percentage.
/// </summary>
public static class RapierEconomicModel {
    public const string ModelId = "rapier.operations.allocation-credit.v1";
    public const string Currency = "ALLOCATION_CREDIT";
    public const string PriceBasisId =
        "fictional-eastern-authority-operating-budget.v1";
    public const int RecoveryCredit = 20;
    public const int AirframeLossDebit = -700;
    public const int ExceedanceInspectionDebit = -90;
    public const int EvidenceReconciliationDebit = -20;
    public const int FuelDebitStepLb = 50;
    public const int AmmunitionDebitStepRounds = 20;

    static readonly RapierEconomicTargetContract Formation = new(
        "rapier.target-contract.formation-intercept.v1",
        "Fighter formation",
        180);
    static readonly RapierEconomicTargetContract Balloon = new(
        "rapier.target-contract.high-altitude-balloon.v1",
        "High-altitude balloon",
        90);
    static readonly RapierEconomicTargetContract Awacs = new(
        "rapier.target-contract.airborne-enabler.v1",
        "Airborne early-warning aircraft",
        260);
    static readonly RapierEconomicTargetContract Transport = new(
        "rapier.target-contract.transport-aircraft.v1",
        "Transport aircraft",
        160);
    static readonly RapierEconomicTargetContract Swarm = new(
        "rapier.target-contract.swarm-carrier.v1",
        "Swarm carrier",
        200);

    public static RapierEconomicTargetContract TargetContract(
        RapierJobKind target) => target switch {
        RapierJobKind.Balloon => Balloon,
        RapierJobKind.Awacs => Awacs,
        RapierJobKind.Transport => Transport,
        RapierJobKind.SwarmLob => Swarm,
        _ => Formation
    };

    public static RapierEconomicSortieSlip Evaluate(
        in RapierEconomicSortieFacts facts) {
        RapierEconomicTargetContract target = TargetContract(facts.Target);
        if (facts.EconomicMode != MissionEconomicMode.RapierOperations) {
            return new RapierEconomicSortieSlip(
                Active: false,
                ModelId,
                Currency,
                PriceBasisId,
                target,
                Array.Empty<RapierEconomicLine>(),
                SortieNetCredits: 0,
                InspectionReserved: false,
                DamageCostComputed: false);
        }
        if (!facts.Finished) {
            return new RapierEconomicSortieSlip(
                Active: true,
                ModelId,
                Currency,
                PriceBasisId,
                target,
                Array.Empty<RapierEconomicLine>(),
                SortieNetCredits: 0,
                InspectionReserved: false,
                DamageCostComputed: false);
        }

        var lines = new List<RapierEconomicLine>(7);
        if (facts.TargetNeutralized) {
            lines.Add(new RapierEconomicLine(
                "CONTRACT",
                "TARGET_NEUTRALIZED",
                $"{target.Label} contract",
                target.NeutralizationCredit));
        }
        if (facts.CleanRecovery && !facts.PlayerLost) {
            lines.Add(new RapierEconomicLine(
                "RECOVERY",
                "ASSET_RETURNED",
                "Rapier returned to strip",
                RecoveryCredit));
        }
        if (facts.PlayerLost) {
            lines.Add(new RapierEconomicLine(
                "LOSS",
                "AIRFRAME_LOST",
                "Confirmed Rapier loss reserve",
                AirframeLossDebit));
        }

        double burnedLb = Math.Max(0.0, facts.FuelBurnedLb);
        int fuelCredits = -(int)Math.Floor(burnedLb / FuelDebitStepLb);
        if (fuelCredits != 0) {
            lines.Add(new RapierEconomicLine(
                "CONSUMABLE",
                "FUEL",
                "Fuel consumed",
                fuelCredits));
        }
        int rounds = Math.Max(0, facts.RoundsExpended);
        int ammunitionCredits =
            -(int)Math.Ceiling(rounds / (double)AmmunitionDebitStepRounds);
        if (ammunitionCredits != 0) {
            lines.Add(new RapierEconomicLine(
                "CONSUMABLE",
                "AMMUNITION",
                "Gun ammunition consumed",
                ammunitionCredits));
        }

        bool inspectionReserved =
            facts.ExceedanceInspectionRequired && !facts.PlayerLost;
        if (inspectionReserved) {
            lines.Add(new RapierEconomicLine(
                "INSPECTION",
                "EXCEEDANCE_INSPECTION",
                "Exceedance inspection reserved",
                ExceedanceInspectionDebit));
        }
        if (facts.EvidenceStatus == RapierServiceLifeEvidenceStatus.Gap
            && !facts.PlayerLost) {
            lines.Add(new RapierEconomicLine(
                "INSPECTION",
                "EVIDENCE_RECONCILIATION",
                "Usage-evidence reconciliation",
                EvidenceReconciliationDebit));
        }

        int net = 0;
        foreach (RapierEconomicLine line in lines)
            net = checked(net + line.Credits);
        return new RapierEconomicSortieSlip(
            Active: true,
            ModelId,
            Currency,
            PriceBasisId,
            target,
            lines,
            net,
            inspectionReserved,
            DamageCostComputed: false);
    }
}
