using System.Reflection;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class ActorObservationTests {
    static AircraftState State(double mass, QuaternionD attitude, BodyRates rates) => new(
        new Vec3D(700.0, 3100.0, 1400.0),
        235.0,
        Gamma: 0.08,
        Chi: 0.32,
        Bank: -0.45,
        Mass: mass,
        BodyAttitude: attitude,
        BodyRates: rates);

    [Fact]
    public void CaptureOmitsTruthOnlyFieldsAndCarriesTemporalAuthority() {
        AircraftState truth = State(
            mass: 19_700.0,
            attitude: QuaternionD.FromFrame(
                new Vec3D(1.0, 0.0, 0.0),
                new Vec3D(0.0, 0.0, -1.0),
                new Vec3D(0.0, 1.0, 0.0)),
            rates: new BodyRates(0.3, -0.2, 0.1));

        ActorObservation observation = ActorObservation.Capture(
            truth, sourceTick: 144, observationAgeTicks: 3, confidence: 0.72);

        Assert.Equal(truth.Position, observation.Position);
        Assert.Equal(truth.Speed, observation.Speed);
        Assert.Equal(truth.Gamma, observation.Gamma);
        Assert.Equal(truth.Chi, observation.Chi);
        Assert.Equal(truth.VelocityVector(), observation.VelocityVector());
        Assert.Equal(truth.ForwardDir(), observation.ForwardDir());
        Assert.Equal(truth.Bank, observation.Bank);
        Assert.Equal(144, observation.SourceTick);
        Assert.Equal(3, observation.ObservationAgeTicks);
        Assert.Equal(0.72, observation.Confidence);
        Assert.True(observation.IsFinite);

        string[] publicMembers = typeof(ActorObservation)
            .GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Select(property => property.Name)
            .ToArray();
        Assert.DoesNotContain(nameof(AircraftState.Mass), publicMembers);
        Assert.DoesNotContain(nameof(AircraftState.BodyAttitude), publicMembers);
        Assert.DoesNotContain(nameof(AircraftState.BodyRates), publicMembers);
    }

    [Fact]
    public void HiddenTruthCannotChangePolicyActionWhenObservationHistoryIsFixed() {
        QuaternionD firstAttitude = QuaternionD.Identity;
        QuaternionD secondAttitude = new QuaternionD(0.5, 0.5, 0.5, 0.5);
        AircraftState firstTruth = State(8_000.0, firstAttitude,
            new BodyRates(0.0, 0.0, 0.0));
        AircraftState secondTruth = State(80_000.0, secondAttitude,
            new BodyRates(4.0, -3.0, 2.0));
        ActorObservation firstObservation = ActorObservation.Capture(firstTruth, sourceTick: 20);
        ActorObservation secondObservation = ActorObservation.Capture(secondTruth, sourceTick: 20);
        Assert.Equal(firstObservation, secondObservation);

        AircraftState initial = new(
            new Vec3D(0.0, 3000.0, 0.0), 240.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        var first = new ReactiveBandit(initial,
            FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace);
        var second = new ReactiveBandit(initial,
            FlightModel.Su27SPublicDataSurrogate, PilotSkill.Ace);

        first.Step(firstObservation, SimulationSession.FixedDeltaSeconds);
        second.Step(secondObservation, SimulationSession.FixedDeltaSeconds);

        Assert.Equal(first.LastCommand, second.LastCommand);
        Assert.Equal(first.State, second.State);
    }

    [Fact]
    public void BanditContractConsumesObservationRatherThanAircraftTruth() {
        MethodInfo step = typeof(IBandit).GetMethod(nameof(IBandit.Step))!;
        MethodInfo fire = typeof(IBandit).GetMethod(nameof(IBandit.WantsToFire))!;

        Assert.Equal(typeof(ActorObservation), step.GetParameters()[0].ParameterType.GetElementType());
        Assert.Equal(typeof(ActorObservation), fire.GetParameters()[0].ParameterType.GetElementType());
    }
}
