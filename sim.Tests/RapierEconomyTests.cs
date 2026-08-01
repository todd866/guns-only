using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class RapierEconomyTests {
    static RapierEconomicSortieFacts Facts(
        MissionEconomicMode mode = MissionEconomicMode.RapierOperations,
        bool finished = true,
        RapierJobKind target = RapierJobKind.Transport,
        bool targetNeutralized = true,
        bool cleanRecovery = true,
        bool playerLost = false,
        double fuelBurnedLb = 1_000.0,
        int roundsExpended = 40,
        bool inspection = false,
        RapierServiceLifeEvidenceStatus evidence =
            RapierServiceLifeEvidenceStatus.Complete) =>
        new(
            mode,
            finished,
            target,
            targetNeutralized,
            cleanRecovery,
            playerLost,
            fuelBurnedLb,
            roundsExpended,
            inspection,
            evidence);

    [Fact]
    public void ArcadeMissionsCannotCreateEconomicLines() {
        RapierEconomicSortieSlip slip = RapierEconomicModel.Evaluate(
            Facts(mode: MissionEconomicMode.Arcade));

        Assert.False(slip.Active);
        Assert.Empty(slip.Lines);
        Assert.Equal(0, slip.SortieNetCredits);
        Assert.Equal(MissionEconomicMode.Arcade,
            Beats.BuiltIn(7).MissionIdentity.EconomicMode);
        Assert.Equal(MissionEconomicMode.Arcade,
            Beats.BuiltIn(10).MissionIdentity.EconomicMode);
        Assert.Equal(MissionEconomicMode.Arcade,
            Beats.BuiltIn(11).MissionIdentity.EconomicMode);
        Assert.False(Beats.BuiltIn(7).MissionIdentity.AllowsTimeCompression);
        Assert.True(Beats.BuiltIn(10).MissionIdentity.AllowsTimeCompression);
        Assert.False(Beats.BuiltIn(11).MissionIdentity.AllowsTimeCompression);
    }

    [Fact]
    public void OnlyTheVariedRapierOperationsBeatOptsIntoEconomics() {
        BeatSetup beat = Beats.RapierGoFly(jobSeed: 2);

        Assert.Equal(MissionEconomicMode.RapierOperations,
            beat.MissionIdentity.EconomicMode);
        Assert.True(beat.MissionIdentity.AllowsTimeCompression);
        Assert.Equal(RapierJobKind.Transport, beat.ScriptedIntercept!.Job);
        Assert.Equal(AircraftCapability.TransportTargetPrototype,
            beat.BanditAircraft);
        Assert.Equal(FlightModel.TransportTargetPrototype, beat.BanditAir);
    }

    [Fact]
    public void SuccessfulTransportContractBooksObservedOperatingLines() {
        RapierEconomicSortieSlip slip = RapierEconomicModel.Evaluate(Facts());

        Assert.True(slip.Active);
        Assert.Equal(
            "rapier.target-contract.transport-aircraft.v1",
            slip.Target.Id);
        Assert.Contains(slip.Lines, line =>
            line.Code == "TARGET_NEUTRALIZED" && line.Credits == 160);
        Assert.Contains(slip.Lines, line =>
            line.Code == "ASSET_RETURNED" && line.Credits == 20);
        Assert.Contains(slip.Lines, line =>
            line.Code == "FUEL" && line.Credits == -20);
        Assert.Contains(slip.Lines, line =>
            line.Code == "AMMUNITION" && line.Credits == -2);
        Assert.Equal(158, slip.SortieNetCredits);
        Assert.False(slip.DamageCostComputed);
    }

    [Fact]
    public void KnownExceedanceReservesInspectionWithoutPricingDamage() {
        RapierEconomicSortieSlip slip = RapierEconomicModel.Evaluate(
            Facts(inspection: true));

        Assert.True(slip.InspectionReserved);
        Assert.Contains(slip.Lines, line =>
            line.Code == "EXCEEDANCE_INSPECTION"
            && line.Credits == RapierEconomicModel.ExceedanceInspectionDebit);
        Assert.False(slip.DamageCostComputed);
        Assert.DoesNotContain(slip.Lines, line =>
            line.Code.Contains("DAMAGE", StringComparison.Ordinal));
    }

    [Fact]
    public void ConfirmedLossDoesNotPretendAnInspectionWasPerformed() {
        RapierEconomicSortieSlip slip = RapierEconomicModel.Evaluate(
            Facts(
                cleanRecovery: false,
                playerLost: true,
                inspection: true));

        Assert.Contains(slip.Lines, line =>
            line.Code == "AIRFRAME_LOST"
            && line.Credits == RapierEconomicModel.AirframeLossDebit);
        Assert.DoesNotContain(slip.Lines, line =>
            line.Code == "EXCEEDANCE_INSPECTION");
        Assert.False(slip.InspectionReserved);
    }

    [Fact]
    public void EveryDealtTargetHasAStableDistinctContract() {
        RapierEconomicTargetContract[] contracts = [
            RapierEconomicModel.TargetContract(RapierJobKind.Balloon),
            RapierEconomicModel.TargetContract(RapierJobKind.Awacs),
            RapierEconomicModel.TargetContract(RapierJobKind.Transport),
            RapierEconomicModel.TargetContract(RapierJobKind.SwarmLob)
        ];

        Assert.Equal(contracts.Length,
            contracts.Select(contract => contract.Id).Distinct().Count());
        Assert.All(contracts, contract => {
            Assert.StartsWith("rapier.target-contract.", contract.Id);
            Assert.True(contract.NeutralizationCredit > 0);
        });
    }

    [Theory]
    [InlineData(4, RapierJobKind.Balloon,
        "aircraft.balloon-glider.prototype.v1")]
    [InlineData(1, RapierJobKind.Awacs,
        "aircraft.awacs-target.prototype.v1")]
    [InlineData(2, RapierJobKind.Transport,
        "aircraft.transport-target.prototype.v1")]
    [InlineData(3, RapierJobKind.SwarmLob,
        "aircraft.su27s.public-data-surrogate.v1")]
    public void OperationsDealerStagesEveryTargetArchetype(
        int seed, RapierJobKind expectedJob, string expectedCapabilityId) {
        BeatSetup beat = Beats.RapierGoFly(jobSeed: seed);

        Assert.Equal(expectedJob, beat.ScriptedIntercept!.Job);
        Assert.Equal(expectedCapabilityId, beat.BanditAircraft.Id);
        Assert.Equal(MissionEconomicMode.RapierOperations,
            beat.MissionIdentity.EconomicMode);
    }
}
