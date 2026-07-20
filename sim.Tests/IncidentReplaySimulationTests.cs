using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class IncidentReplaySimulationTests {
    static AircraftState StateFromVelocity(Vec3D position, Vec3D velocity) {
        double speed = velocity.Length;
        Vec3D direction = velocity * (1.0 / speed);
        return new AircraftState(position, speed,
            Math.Asin(Math.Clamp(direction.Y, -1.0, 1.0)),
            Math.Atan2(direction.X, direction.Z), 0.0,
            FlightModel.Sabre.MassKg);
    }

    [Fact]
    public void FrozenCarrierClipPreservesPreImpulseTouchdownThenPostImpactMotion() {
        BeatSetup setup = Beats.CarrierApproach();
        Carrier ship = setup.Carrier!;
        Vec3D position = ship.ShipPoint(
            along: ship.DeckLengthM * 0.5 - 10.0,
            cross: 0.0,
            height: 0.05);
        Vec3D desiredGroundVelocity = ship.DeckVelocityWorld
            + ship.Fwd * 70.0 + new Vec3D(0.0, -12.0, 0.0);
        Vec3D airVelocity = desiredGroundVelocity - ship.SteadyWindWorld;
        setup = setup with { Player = StateFromVelocity(position, airVelocity) };

        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();
        for (int i = 0; i < 2 * AircraftSim.TickHz
            && session.PlayerTerminalState == AircraftTerminalState.Flying; i++)
            session.StepFixed();

        Assert.Equal(AircraftTerminalState.Impacted, session.PlayerTerminalState);
        Assert.Equal(Carrier.Recovery.HardLanding, session.Touchdown.Recovery);
        double preImpulseSinkMps = session.Touchdown.SinkRateMps;
        double preImpulseClosureMps = session.Touchdown.ClosureMps;

        for (int i = 0; i < 20 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(
            session.IncidentReplay.FrozenClip);
        IncidentReplaySample incident = clip.Samples[clip.IncidentSampleIndex];

        Assert.Equal(SessionEventType.Impact, incident.EventType);
        Assert.Equal(ImpactSurface.FlightDeck, incident.EventSurface);
        SessionEvent impactEvent = session.RecentEvents.First(e =>
            e.Type == SessionEventType.Impact && e.Target == CombatRole.Player
                && e.Surface == ImpactSurface.FlightDeck);
        Assert.Equal(impactEvent.Tick, incident.Tick);
        IncidentReplayEvent recordedImpact = Assert.Single(clip.Events,
            replayEvent => replayEvent.Event.Sequence == impactEvent.Sequence);
        Assert.Equal(incident.Player.Position, recordedImpact.Position);
        Assert.Equal(incident.Player.VelocityVector(), recordedImpact.Velocity);
        IncidentReplayEvent collisionDestruction = Assert.Single(clip.Events,
            replayEvent => replayEvent.Event.Type == SessionEventType.Destroyed
                && replayEvent.Event.Target == CombatRole.Player
                && replayEvent.Event.Tick == impactEvent.Tick);
        Assert.True(collisionDestruction.Event.Sequence > recordedImpact.Event.Sequence);
        Assert.Equal(recordedImpact.Position, collisionDestruction.Position);
        Assert.Equal(recordedImpact.Velocity, collisionDestruction.Velocity);
        Assert.Equal(incident.Tick * SimulationSession.FixedDeltaSeconds,
            incident.TimeSeconds, 10);
        Assert.Equal(AircraftTerminalState.Flying, incident.TerminalState);
        Assert.Equal(Carrier.SolidCollision.FlightDeck, incident.CarrierSolid);
        Assert.Equal(Carrier.TouchdownGrade.Cut, incident.TouchdownGrade);
        Assert.True(incident.TouchdownDeviations.HasFlag(
            Carrier.TouchdownDeviation.UnsafeSinkRate));
        Assert.Equal(Carrier.TouchdownCorrection.WaveOffEarlier,
            incident.TouchdownPrimaryCorrection);
        Assert.Equal(Carrier.TouchdownAssessmentProfileId,
            incident.TouchdownAssessmentProfileId);
        Assert.Equal(preImpulseSinkMps, incident.DeckSinkRateMps, 10);
        Assert.Equal(preImpulseClosureMps, incident.DeckClosureMps, 10);
        Assert.True(incident.CommandAppliedToFlight);
        Assert.True(incident.CommandDirectLateralControl);
        Assert.True(clip.IncidentSampleIndex + 1 < clip.Samples.Count);
        IncidentReplaySample afterImpulse = clip.Samples[clip.IncidentSampleIndex + 1];
        Assert.Equal(AircraftTerminalState.Impacted, afterImpulse.TerminalState);
        Assert.False(afterImpulse.CommandAppliedToFlight);
        Assert.True(afterImpulse.CommandDirectLateralControl);
        Assert.Equal(0.0, afterImpulse.CommandRollControl, 10);
        Assert.Equal(incident.Tick + 1, afterImpulse.Tick);
        Assert.Equal(incident.TimeSeconds + SimulationSession.FixedDeltaSeconds,
            afterImpulse.TimeSeconds, 10);
        Assert.NotEqual(incident.Player.VelocityVector(),
            afterImpulse.Player.VelocityVector());
        for (int i = 1; i < clip.Samples.Count; i++) {
            Assert.True(clip.Samples[i].Tick > clip.Samples[i - 1].Tick);
            Assert.True(clip.Samples[i].TimeSeconds
                > clip.Samples[i - 1].TimeSeconds);
        }
    }

    [Fact]
    public void DeckCrashReplayPreservesSecondaryIslandContactSubtype() {
        BeatSetup setup = Beats.CarrierApproach();
        Carrier ship = setup.Carrier!;
        Vec3D position = ship.ShipPoint(
            along: 6.0, cross: 10.0, height: 0.05);
        Vec3D desiredGroundVelocity = ship.DeckVelocityWorld
            + ship.Fwd * 80.0 + new Vec3D(0.0, -12.0, 0.0);
        setup = setup with {
            Player = StateFromVelocity(position,
                desiredGroundVelocity - ship.SteadyWindWorld)
        };
        var session = new SimulationSession();
        session.StartBeat(() => setup);
        session.Begin();

        for (int i = 0; i < 20 * AircraftSim.TickHz
            && session.Lifecycle != SimulationSession.LifecycleState.Finished; i++)
            session.StepFixed();

        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(
            session.IncidentReplay.FrozenClip);
        int deckIndex = clip.Samples.ToList().FindIndex(sample =>
            sample.CarrierSolid == Carrier.SolidCollision.FlightDeck);
        int islandIndex = clip.Samples.ToList().FindIndex(sample =>
            sample.CarrierSolid == Carrier.SolidCollision.Island);
        Assert.True(deckIndex >= 0);
        Assert.True(islandIndex > deckIndex,
            "the replay must retain the island strike after the initial deck impact");
        Assert.Equal(ImpactSurface.CarrierStructure,
            clip.Samples[islandIndex].Surface);
    }
}
