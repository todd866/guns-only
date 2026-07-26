using GunsOnly.Sim.Doctrine;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public class TimeCompressionTests {
    static TimeCompressionSafetyState UneventfulTransit() => new(
        PilotEnabled: true,
        SupportedSortie: true,
        SessionActive: true,
        EstablishedTransit: true,
        CatapultOrConfigurationTransition: false,
        ContactInsideLedThreatRange: false,
        GunSolutionInEitherDirection: false,
        AutoGcasActivityOrLead: false,
        DamagePresent: false,
        FuelThresholdOrLead: false,
        ControlInputBeyondTrim: false,
        RamTransitionLead: false);

    static SimulationSession EstablishedRapierCruise() {
        BeatSetup baseline = Beats.RapierIntercept();
        BeatSetup cruise = baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, 15_000.0, 0.0),
                // M1.35-ish is established supersonic transit but is not inside the M1.6
                // ram-light handover lead. A fixture at M2.7 accidentally tested transition
                // protection instead of uneventful cruise.
                Speed = 400.0,
                Gamma = 0.0,
                Chi = 0.0,
                Bank = 0.0
            },
            Carrier = null,
            StartsOnCatapult = false,
            ScriptedIntercept = null
        };
        var session = new SimulationSession();
        session.StartBeat(() => cruise);
        session.Begin();
        return session;
    }

    [Fact]
    public void UneventfulEstablishedTransitEngagesAtKernelAcceptedFactor() {
        var session = EstablishedRapierCruise();

        int selected = session.Advance(SimulationSession.FixedDeltaSeconds, 8);

        Assert.True(selected == 8,
            $"expected 8x, got {selected}x: {session.TimeCompressionInhibitReason}");
        Assert.True(session.TimeCompressionFactor == 8,
            $"compression handed back during quiet transit: "
                + session.TimeCompressionInhibitReason);
        Assert.True(session.TimeCompressionEligible);
        Assert.Equal(8, session.Tick);
    }

    [Fact]
    public void ContactThreatDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            ContactInsideLedThreatRange = true
        };
        Assert.Equal(TimeCompressionInhibitReason.ContactThreat,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void RamTransitionLeadDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            RamTransitionLead = true
        };
        Assert.Equal(TimeCompressionInhibitReason.RamTransition,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void AutoGcasLeadDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            AutoGcasActivityOrLead = true
        };
        Assert.Equal(TimeCompressionInhibitReason.AutoGcas,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void DamageDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            DamagePresent = true
        };
        Assert.Equal(TimeCompressionInhibitReason.Damage,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void FuelThresholdLeadDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            FuelThresholdOrLead = true
        };
        Assert.Equal(TimeCompressionInhibitReason.FuelThreshold,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void ControlInputDisengagesBeforeAnotherTick() {
        var session = EstablishedRapierCruise();
        Assert.Equal(8,
            session.Advance(SimulationSession.FixedDeltaSeconds, 8));

        long tickAtInput = session.Tick;
        session.FeedKey(GKey.PullUp, true);

        Assert.Equal(tickAtInput, session.Tick);
        Assert.Equal(1, session.TimeCompressionFactor);
        Assert.Equal(TimeCompressionInhibitReason.ControlInput,
            session.TimeCompressionInhibitReason);
    }

    [Fact]
    public void GunSolutionDisengagesIndividually() {
        TimeCompressionSafetyState state = UneventfulTransit() with {
            GunSolutionInEitherDirection = true
        };
        Assert.Equal(TimeCompressionInhibitReason.GunSolution,
            TimeCompressionPolicy.Evaluate(state));
    }

    [Fact]
    public void BatchedAndSingleRapierTicksProduceBitIdenticalState() {
        const int TickCount = 480;
        var batched = new SimulationSession(10);
        var singles = new SimulationSession(10);
        batched.Begin();
        singles.Begin();

        batched.StepFixed(TickCount);
        for (int tick = 0; tick < TickCount; tick++)
            singles.StepFixed();

        Assert.Equal(singles.Player.State, batched.Player.State);
        Assert.Equal(singles.Bandit.State, batched.Bandit.State);
        Assert.Equal(singles.PlayerFuel.FuelLb, batched.PlayerFuel.FuelLb);
        Assert.Equal(singles.RecentEvents, batched.RecentEvents);
        Assert.Equal(
            SnapshotProjection.BuildState(singles,
                Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null),
            SnapshotProjection.BuildState(batched,
                Carrier.DeckConfiguration.Angled, 0.0, 0.0, false, null));
    }
}
