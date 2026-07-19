using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class IncidentReplayRecorderTests {
    static IncidentReplaySample Sample(long tick,
        AircraftTerminalState terminal = AircraftTerminalState.Flying,
        ImpactSurface surface = ImpactSurface.None,
        long eventSequence = 0,
        SessionEventType eventType = SessionEventType.Hit,
        ImpactSurface eventSurface = ImpactSurface.None) {
        double time = tick / AircraftSim.TickHz;
        var attitude = QuaternionD.Identity;
        var state = new AircraftState(
            new Vec3D(time * 50.0, 20.0, time * 8.0),
            Speed: 70.0, Gamma: -0.04, Chi: 0.0, Bank: 0.0,
            Mass: FlightModel.Sabre.MassKg, BodyAttitude: attitude);
        return new IncidentReplaySample(
            tick, time, state,
            IndicatedAirspeedKts: 135.0,
            GroundSpeedKts: 105.0,
            AngleOfAttackDeg: 9.2,
            ThrottleCommand: 0.72,
            EnginePowerFraction: 0.68,
            FlightPathAngleDeg: -2.3,
            VerticalSpeedFpm: -550.0,
            NormalLoadFactor: 1.02,
            CommandGDemand: 1.05,
            CommandBankTargetDeg: 0.0,
            CommandRudder: 0.0,
            CommandRollControl: 0.0,
            HasCommandedPitch: true,
            CommandedPitchDeg: 7.0,
            DeckSinkRateMps: 3.7,
            DeckClosureMps: 54.0,
            DeckAlongM: -40.0,
            DeckCrossM: 1.0,
            DeckHeightM: 4.0,
            CarrierPosition: new Vec3D(0.0, 20.0, time * 3.0),
            CarrierTouchdownPoint: new Vec3D(0.0, 20.0, time * 3.0 - 50.0),
            CarrierApproachCuePoint: new Vec3D(0.0, 20.0, time * 3.0 + 154.0),
            CarrierHeadingRad: 0.0,
            CarrierDeckPitchRad: 0.0,
            CarrierDeckLengthM: 250.0,
            CarrierDeckWidthM: 30.0,
            GearHandle: LandingGearHandle.Down,
            GearFraction: 1.0,
            GearDownAndLocked: true,
            NoseGearFraction: 1.0,
            LeftGearFraction: 1.0,
            RightGearFraction: 1.0,
            NoseGearIndication: LandingGearIndication.DownLocked,
            LeftGearIndication: LandingGearIndication.DownLocked,
            RightGearIndication: LandingGearIndication.DownLocked,
            FlapLever: WingFlapLever.Hold,
            FlapDegrees: 38.0,
            LeftFlapDegrees: 38.0,
            RightFlapDegrees: 38.0,
            Recovery: Carrier.Recovery.Flying,
            Hook: Carrier.HookOutcome.None,
            Wire: 0,
            TerminalState: terminal,
            Surface: surface,
            EventSequence: eventSequence,
            EventType: eventType,
            EventSurface: eventSurface);
    }

    static IncidentReplayEvent ReplayEvent(long tick, long sequence,
        SessionEventType type, ImpactSurface surface = ImpactSurface.None,
        CombatRole source = CombatRole.None) {
        IncidentReplaySample sample = Sample(tick);
        return new IncidentReplayEvent(
            new SessionEvent(sequence, tick, type, source, CombatRole.Player,
                0, SortieOutcome.None, surface),
            sample.TimeSeconds,
            sample.Player.Position,
            sample.Player.VelocityVector());
    }

    static IncidentReplayClip RecordDeckIncident(IncidentReplayRecorder recorder,
        long impactTick = 1_800) {
        for (long tick = 0; tick < impactTick; tick++) recorder.Observe(Sample(tick));
        recorder.ObserveEvent(ReplayEvent(impactTick, 1,
            SessionEventType.Impact, ImpactSurface.FlightDeck));
        recorder.Observe(Sample(impactTick,
            AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
            eventSequence: 1, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.FlightDeck));
        recorder.ObserveEvent(ReplayEvent(impactTick + 1, 2,
            SessionEventType.Destroyed));
        for (long tick = impactTick + 1; tick < impactTick + 240; tick++)
            recorder.Observe(Sample(tick,
                AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
                eventSequence: 2, eventType: SessionEventType.Destroyed,
                eventSurface: ImpactSurface.None));
        recorder.ObserveEvent(ReplayEvent(impactTick + 240, 3,
            SessionEventType.Settled, ImpactSurface.FlightDeck));
        recorder.Observe(Sample(impactTick + 240,
            AircraftTerminalState.Settled, ImpactSurface.FlightDeck,
            eventSequence: 3, eventType: SessionEventType.Settled,
            eventSurface: ImpactSurface.FlightDeck));
        return Assert.IsType<IncidentReplayClip>(recorder.FrozenClip);
    }

    [Fact]
    public void RollingRecorderIsLowRateAndStrictlyBounded() {
        var recorder = new IncidentReplayRecorder();

        for (long tick = 0; tick < 12_000; tick++) recorder.Observe(Sample(tick));

        Assert.InRange(recorder.BufferedSampleCount, 1,
            IncidentReplayRecorder.MaximumSamples);
        Assert.Null(recorder.FrozenClip);
        Assert.False(recorder.ExportAvailable);
    }

    [Fact]
    public void CarrierClipKeepsPreRollAndFreezesOnlyAtSettled() {
        var recorder = new IncidentReplayRecorder();
        const long impactTick = 1_800;
        for (long tick = 0; tick < impactTick; tick++) recorder.Observe(Sample(tick));
        recorder.Observe(Sample(impactTick,
            AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
            eventSequence: 1, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.FlightDeck));

        Assert.Null(recorder.FrozenClip);
        recorder.Observe(Sample(impactTick + 120,
            AircraftTerminalState.Impacted, ImpactSurface.Water,
            eventSequence: 2, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.Water));
        Assert.Null(recorder.FrozenClip);

        recorder.Observe(Sample(impactTick + 240,
            AircraftTerminalState.Settled, ImpactSurface.Water,
            eventSequence: 3, eventType: SessionEventType.Settled,
            eventSurface: ImpactSurface.Water));
        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(recorder.FrozenClip);

        Assert.True(recorder.ExportAvailable);
        Assert.InRange(clip.Samples[0].TimeSeconds,
            impactTick / AircraftSim.TickHz - IncidentReplayRecorder.PreIncidentSeconds,
            impactTick / AircraftSim.TickHz - IncidentReplayRecorder.PreIncidentSeconds + 0.1);
        Assert.Equal(ImpactSurface.FlightDeck,
            clip.Samples[clip.IncidentSampleIndex].EventSurface);
        Assert.Equal(ImpactSurface.Water, clip.Samples[^1].Surface);
        Assert.Equal(AircraftTerminalState.Settled, clip.Samples[^1].TerminalState);
        Assert.True(clip.Samples.Count <= IncidentReplayRecorder.MaximumSamples);
        Assert.True(clip.Events.Count <= IncidentReplayRecorder.MaximumEvents);
    }

    [Fact]
    public void NumericalBoundaryFreezesLastStateWithoutInventingSettlement() {
        var recorder = new IncidentReplayRecorder();
        const long impactTick = 1_800;
        recorder.Observe(Sample(impactTick,
            AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
            eventSequence: 1, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.FlightDeck));
        recorder.Observe(Sample(impactTick + 120,
            AircraftTerminalState.SimulationBounded, ImpactSurface.SimulationBoundary,
            eventSequence: 2, eventType: SessionEventType.TerminalLimitReached,
            eventSurface: ImpactSurface.SimulationBoundary));

        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(recorder.FrozenClip);
        Assert.Equal(AircraftTerminalState.SimulationBounded,
            clip.Samples[^1].TerminalState);
        Assert.Equal(SessionEventType.TerminalLimitReached,
            clip.Samples[^1].EventType);
        Assert.DoesNotContain(clip.Samples,
            sample => sample.EventType == SessionEventType.Settled);
    }

    [Fact]
    public void WaterOnlyLossDoesNotBecomeCarrierIncidentReplay() {
        var recorder = new IncidentReplayRecorder();
        for (long tick = 0; tick < 600; tick++) recorder.Observe(Sample(tick));
        recorder.Observe(Sample(600,
            AircraftTerminalState.Impacted, ImpactSurface.Water,
            eventSequence: 1, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.Water));
        recorder.Observe(Sample(720,
            AircraftTerminalState.Settled, ImpactSurface.Water,
            eventSequence: 2, eventType: SessionEventType.Settled,
            eventSurface: ImpactSurface.Water));

        Assert.Null(recorder.FrozenClip);
        Assert.False(recorder.ExportAvailable);
    }

    [Fact]
    public void ClipExportIsOneShotAndIdentityIsMonotonicAcrossRestage() {
        var recorder = new IncidentReplayRecorder();
        IncidentReplayClip first = RecordDeckIncident(recorder);

        Assert.True(recorder.TryConsume(first.Id, out IncidentReplayClip exported));
        Assert.Same(first, exported);
        Assert.False(recorder.TryConsume(first.Id, out _));
        Assert.False(recorder.ExportAvailable);

        recorder.Reset();
        IncidentReplayClip second = RecordDeckIncident(recorder, impactTick: 2_400);
        Assert.True(second.Id > first.Id);
    }

    [Fact]
    public void IdenticalObservationsProduceBitIdenticalEvidence() {
        var a = new IncidentReplayRecorder();
        var b = new IncidentReplayRecorder();

        IncidentReplayClip clipA = RecordDeckIncident(a);
        IncidentReplayClip clipB = RecordDeckIncident(b);

        Assert.Equal(clipA.IncidentSampleIndex, clipB.IncidentSampleIndex);
        Assert.Equal(clipA.Samples, clipB.Samples);
        Assert.Equal(clipA.Events, clipB.Events);
    }

    [Fact]
    public void SameTickImpactAndDestructionRemainDistinctOrderedEvents() {
        var recorder = new IncidentReplayRecorder();
        const long impactTick = 1_200;
        for (long tick = 0; tick < impactTick; tick++) recorder.Observe(Sample(tick));

        IncidentReplayEvent impact = ReplayEvent(impactTick, 41,
            SessionEventType.Impact, ImpactSurface.FlightDeck);
        IncidentReplayEvent destroyed = ReplayEvent(impactTick, 42,
            SessionEventType.Destroyed);
        recorder.ObserveEvent(impact);
        recorder.Observe(Sample(impactTick,
            AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
            eventSequence: 41, eventType: SessionEventType.Impact,
            eventSurface: ImpactSurface.FlightDeck));
        recorder.ObserveEvent(destroyed);
        // The sample policy deliberately retains the pre-impulse contact state for this tick.
        recorder.Observe(Sample(impactTick,
            AircraftTerminalState.Impacted, ImpactSurface.FlightDeck,
            eventSequence: 42, eventType: SessionEventType.Destroyed));
        recorder.ObserveEvent(ReplayEvent(impactTick + 120, 43,
            SessionEventType.Settled, ImpactSurface.FlightDeck));
        recorder.Observe(Sample(impactTick + 120,
            AircraftTerminalState.Settled, ImpactSurface.FlightDeck,
            eventSequence: 43, eventType: SessionEventType.Settled,
            eventSurface: ImpactSurface.FlightDeck));

        IncidentReplayClip clip = Assert.IsType<IncidentReplayClip>(recorder.FrozenClip);
        Assert.Equal(41, clip.Samples[clip.IncidentSampleIndex].EventSequence);
        Assert.Collection(clip.Events,
            replayEvent => Assert.Equal(impact, replayEvent),
            replayEvent => Assert.Equal(destroyed, replayEvent),
            replayEvent => Assert.Equal(43, replayEvent.Event.Sequence));
        Assert.Equal(clip.Events[0].Event.Tick, clip.Events[1].Event.Tick);
        Assert.Equal(clip.Events[0].Position, clip.Events[1].Position);
        Assert.Equal(clip.Events[0].Velocity, clip.Events[1].Velocity);
    }
}
