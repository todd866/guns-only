using System.Text;
using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class IncidentReplayProjectionTests {
    static IncidentReplaySample Sample(long tick, double time,
        AircraftTerminalState terminal, ImpactSurface surface,
        SessionEventType eventType, long eventSequence,
        ArrestmentModel.ArrestmentFailureReason arrestmentFailure =
            ArrestmentModel.ArrestmentFailureReason.None) => new(
        Tick: tick,
        TimeSeconds: time,
        Player: new AircraftState(new Vec3D(time * 10.0, 20.0, time * 2.0),
            70.0, -0.04, 0.0, 0.0, FlightModel.Sabre.MassKg,
            QuaternionD.Identity),
        IndicatedAirspeedKts: 135.0,
        GroundSpeedKts: 104.0,
        AngleOfAttackDeg: 9.4,
        ThrottleCommand: 0.73,
        EnginePowerFraction: 0.68,
        FlightPathAngleDeg: -2.3,
        VerticalSpeedFpm: -560.0,
        NormalLoadFactor: 1.04,
        CommandGDemand: 1.05,
        CommandBankTargetDeg: 0.0,
        CommandRudder: 0.0,
        CommandRollControl: 0.0,
        HasCommandedPitch: true,
        CommandedPitchDeg: 7.0,
        DeckSinkRateMps: 3.8,
        DeckClosureMps: 54.0,
        DeckAlongM: -40.0,
        DeckCrossM: 1.2,
        DeckHeightM: terminal == AircraftTerminalState.Flying ? 5.0 : 0.0,
        CarrierPosition: new Vec3D(0.0, 20.0, time * 3.0),
        CarrierTouchdownPoint: new Vec3D(0.0, 20.0, time * 3.0 - 50.0),
        CarrierApproachCuePoint: new Vec3D(0.0, 20.0, time * 3.0 + 154.0),
        CarrierHeadingRad: 0.0,
        CarrierDeckPitchRad: 0.01,
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
        Recovery: terminal == AircraftTerminalState.Flying
            ? Carrier.Recovery.Flying : Carrier.Recovery.HardLanding,
        Hook: terminal == AircraftTerminalState.Flying
            ? Carrier.HookOutcome.None : Carrier.HookOutcome.Engaged,
        Wire: terminal == AircraftTerminalState.Flying ? 0 : 3,
        TerminalState: terminal,
        Surface: surface,
        EventSequence: eventSequence,
        EventType: eventType,
        EventSurface: surface,
        ArrestmentFailureReason: arrestmentFailure,
        ArrestmentInitialEnergyJ: arrestmentFailure
            == ArrestmentModel.ArrestmentFailureReason.None ? 0.0 : 15_800_000.0,
        ArrestmentAbsorbedEnergyJ: arrestmentFailure
            == ArrestmentModel.ArrestmentFailureReason.None ? 0.0 : 10_539_000.0,
        ArrestmentRemainingEnergyJ: arrestmentFailure
            == ArrestmentModel.ArrestmentFailureReason.None ? 0.0 : 5_261_000.0,
        ArrestmentEffectiveCapacityJ: 10_539_000.0,
        ArrestmentPeakLoadN: arrestmentFailure
            == ArrestmentModel.ArrestmentFailureReason.None ? 0.0 : 159_000.0,
        ArrestmentMaximumLineLoadN: 180_000.0,
        ArrestmentInitialClosureMps: 54.0,
        ArrestmentProfileId: "PROVISIONAL_KOREA_JET_V1",
        CarrierSolid: surface switch {
            ImpactSurface.FlightDeck => Carrier.SolidCollision.FlightDeck,
            ImpactSurface.CarrierStructure => Carrier.SolidCollision.Island,
            _ => Carrier.SolidCollision.None
        },
        TouchdownGrade: terminal == AircraftTerminalState.Flying
            ? Carrier.TouchdownGrade.None : Carrier.TouchdownGrade.Cut,
        TouchdownDeviations: terminal == AircraftTerminalState.Flying
            ? Carrier.TouchdownDeviation.None
            : Carrier.TouchdownDeviation.UnsafeSinkRate
                | Carrier.TouchdownDeviation.Lineup,
        TouchdownPrimaryCorrection: terminal == AircraftTerminalState.Flying
            ? Carrier.TouchdownCorrection.None
            : Carrier.TouchdownCorrection.WaveOffEarlier,
        TouchdownAssessmentProfileId: Carrier.TouchdownAssessmentProfileId,
        TouchdownAssessmentProfileVersion:
            Carrier.TouchdownAssessmentProfileVersion,
        TouchdownMinimumSinkRateMps: Carrier.MinTrapSinkMps,
        TouchdownHardSinkRateMps: Carrier.HardTrapSinkMps,
        TouchdownMaximumSinkRateMps: Carrier.MaxTrapSinkMps,
        TouchdownMaximumLineupM: Carrier.MaxTrapLineupM,
        TouchdownMinimumIndicatedAirspeedMps: Carrier.MinTrapAirspeedMps,
        TouchdownMaximumIndicatedAirspeedMps: Carrier.MaxTrapAirspeedMps,
        TouchdownMaximumClosureMps: Carrier.MaxTrapClosureMps,
        TouchdownOnSpeedAoaRad: DetentLayer.OnSpeedAoARad,
        TouchdownMaximumAoaErrorRad: Carrier.MaxOnSpeedAoaErrorRad,
        TouchdownAdaptiveDifficultyLevel: 3,
        TouchdownAdaptiveMaximumSinkRateMps:
            DifficultyModel.ForLevel(3).MaxTrapSinkMps,
        TouchdownAdaptiveMaximumLineupM:
            DifficultyModel.ForLevel(3).MaxTrapLineupErrorM,
        TouchdownAdaptiveMinimumIndicatedAirspeedMps:
            DifficultyModel.ForLevel(3).MinTrapSpeedMps,
        TouchdownAdaptiveMaximumIndicatedAirspeedMps:
            DifficultyModel.ForLevel(3).MaxTrapSpeedMps);

    static IncidentReplayEvent ReplayEvent(long tick, double time,
        SessionEventType type, long sequence, ImpactSurface surface,
        Vec3D? position = null, Vec3D? velocity = null) => new(
        new SessionEvent(sequence, tick, type, CombatRole.None, CombatRole.Player,
            0, SortieOutcome.None, surface),
        time,
        position ?? new Vec3D(time * 10.0, 20.0, time * 2.0),
        velocity ?? new Vec3D(70.0, -2.0, 4.0));

    [Fact]
    public void CompactProjectionHasStableSchemaFieldCountAndOneShotSource() {
        var recorder = new IncidentReplayRecorder();
        recorder.Observe(Sample(0, 0.0, AircraftTerminalState.Flying,
            ImpactSurface.None, SessionEventType.Hit, 0));
        recorder.ObserveEvent(ReplayEvent(120, 1.0, SessionEventType.Impact, 1,
            ImpactSurface.FlightDeck, new Vec3D(10.0, 20.0, 2.0),
            new Vec3D(70.0, -3.0, 4.0)));
        recorder.Observe(Sample(120, 1.0, AircraftTerminalState.Impacted,
            ImpactSurface.FlightDeck, SessionEventType.Impact, 1,
            ArrestmentModel.ArrestmentFailureReason.RunoutExhausted));
        recorder.ObserveEvent(ReplayEvent(240, 2.0, SessionEventType.Settled, 2,
            ImpactSurface.FlightDeck));
        recorder.Observe(Sample(240, 2.0, AircraftTerminalState.Settled,
            ImpactSurface.FlightDeck, SessionEventType.Settled, 2));
        int id = recorder.ClipId;

        Assert.True(recorder.TryConsume(id, out IncidentReplayClip clip));
        Assert.False(recorder.TryConsume(id, out _));
        using JsonDocument document = JsonDocument.Parse(
            IncidentReplayProjection.ToJson(clip));
        JsonElement root = document.RootElement;

        Assert.Equal(IncidentReplayProjection.Schema,
            root.GetProperty("schema").GetString());
        Assert.True(root.GetProperty("authoritative").GetBoolean());
        Assert.Equal(id, root.GetProperty("id").GetInt32());
        Assert.Equal("PROVISIONAL_KOREA_JET_V1",
            root.GetProperty("arrestment_profile").GetString());
        JsonElement assessment = root.GetProperty("touchdown_assessment");
        Assert.Equal(Carrier.TouchdownAssessmentProfileId,
            assessment.GetProperty("profile").GetString());
        Assert.Equal(Carrier.TouchdownAssessmentProfileVersion,
            assessment.GetProperty("version").GetInt32());
        Assert.Equal(Carrier.MaxTrapSinkMps * 196.8503937007874,
            assessment.GetProperty("limits").GetProperty("max_sink_fpm").GetDouble(), 1);
        Assert.Equal(3,
            assessment.GetProperty("adaptive_target").GetProperty("level").GetInt32());
        Assert.Equal(IncidentReplayProjection.FieldCount,
            root.GetProperty("fields").GetArrayLength());
        Assert.Equal(IncidentReplayProjection.EventFieldCount,
            root.GetProperty("event_fields").GetArrayLength());
        JsonElement events = root.GetProperty("events");
        Assert.Equal(2, events.GetArrayLength());
        foreach (JsonElement replayEvent in events.EnumerateArray())
            Assert.Equal(IncidentReplayProjection.EventFieldCount,
                replayEvent.GetArrayLength());
        Assert.Equal(0.0, events[0][0].GetDouble(), 4);
        Assert.Equal(120, events[0][1].GetInt64());
        Assert.Equal(1, events[0][2].GetInt64());
        Assert.Equal((int)SessionEventType.Impact, events[0][3].GetInt32());
        Assert.Equal((int)CombatRole.Player, events[0][5].GetInt32());
        Assert.Equal(10.0, events[0][9].GetDouble(), 3);
        Assert.Equal(-3.0, events[0][13].GetDouble(), 3);
        JsonElement rows = root.GetProperty("samples");
        Assert.Equal(3, rows.GetArrayLength());
        foreach (JsonElement row in rows.EnumerateArray())
            Assert.Equal(IncidentReplayProjection.FieldCount, row.GetArrayLength());
        Assert.Equal(0.0, rows[1][0].GetDouble(), 4);
        Assert.Equal(0.73, rows[1][39].GetDouble(), 3);
        Assert.Equal(1.04, rows[1][43].GetDouble(), 3);
        Assert.Equal((int)ArrestmentModel.ArrestmentFailureReason.RunoutExhausted,
            rows[1][64].GetInt32());
        Assert.Equal(15.8, rows[1][65].GetDouble(), 4);
        Assert.Equal(10.539, rows[1][68].GetDouble(), 4);
        Assert.Equal(54.0 * AirData.MpsToKnots, rows[1][71].GetDouble(), 2);
        Assert.Equal((int)Carrier.SolidCollision.FlightDeck,
            rows[1][72].GetInt32());
        Assert.Equal((int)Carrier.TouchdownGrade.Cut,
            rows[1][73].GetInt32());
        Assert.Equal((int)(Carrier.TouchdownDeviation.UnsafeSinkRate
            | Carrier.TouchdownDeviation.Lineup), rows[1][74].GetInt32());
        Assert.Equal((int)Carrier.TouchdownCorrection.WaveOffEarlier,
            rows[1][75].GetInt32());
    }

    [Fact]
    public void MaximumClipProjectionRemainsAQuarterMegabyteLocalPull() {
        IncidentReplaySample[] samples = Enumerable.Range(
                0, IncidentReplayRecorder.MaximumSamples)
            .Select(index => Sample(index, index / IncidentReplayRecorder.NominalSampleRateHz,
                index == IncidentReplayRecorder.MaximumSamples - 1
                    ? AircraftTerminalState.Settled
                    : AircraftTerminalState.Impacted,
                ImpactSurface.FlightDeck,
                index == 0 ? SessionEventType.Impact : SessionEventType.Destroyed,
                index + 1))
            .ToArray();
        IncidentReplayEvent[] events = Enumerable.Range(0,
                IncidentReplayRecorder.MaximumEvents)
            .Select(index => ReplayEvent(index + 1,
                index / IncidentReplayRecorder.NominalSampleRateHz,
                index == 0 ? SessionEventType.Impact : SessionEventType.Hit,
                index + 1,
                index == 0 ? ImpactSurface.FlightDeck : ImpactSurface.None))
            .ToArray();
        var clip = new IncidentReplayClip(42,
            IncidentReplayRecorder.NominalSampleRateHz, 0, samples, events);

        int utf8Bytes = Encoding.UTF8.GetByteCount(
            IncidentReplayProjection.ToJson(clip));

        Assert.InRange(utf8Bytes, 1, 256 * 1024);
    }
}
