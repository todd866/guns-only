using System.Text.Json;
using GunsOnly.Sim.Medevac;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.Medevac;

public class MedevacSnapshotProjectionTests {
    static (MedevacScenarioDefinition Definition, MedevacEvacuationSession Session)
        BuiltIn() {
        MedevacScenarioDefinition definition =
            BuiltInMedevacScenarios.CommanderTraining;
        return (definition, new MedevacEvacuationSession(definition));
    }

    static JsonDocument Project(
        MedevacScenarioDefinition definition,
        MedevacEvacuationSession session,
        int revision = 1,
        bool paused = false) =>
        JsonDocument.Parse(MedevacSnapshotProjection.BuildState(
            definition,
            session.Snapshot,
            revision,
            paused));

    static void AdvanceUntil(
        MedevacEvacuationSession session,
        Func<MedevacEvacuationSnapshot, bool> predicate,
        int maximumSeconds = 300) {
        for (int second = 0; second <= maximumSeconds; second++) {
            if (predicate(session.Snapshot)) return;
            session.Advance();
        }
        Assert.Fail("Expected MEDEVAC state was not reached.");
    }

    [Fact]
    public void ReadyProjectionPinsAuthoritySchemaAndUnknownMedicalEvidence() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();

        using JsonDocument document = Project(definition, session, revision: 9);
        JsonElement root = document.RootElement;

        Assert.Equal("medevac.commander.v2",
            root.GetProperty("snapshot_schema_version").GetString());
        Assert.Equal(9, root.GetProperty("revision").GetInt32());
        Assert.Equal("READY", root.GetProperty("lifecycle").GetString());
        Assert.Equal("PLAYER",
            root.GetProperty("commander")
                .GetProperty("decision_authority").GetString());
        Assert.Equal("ADVISORY",
            root.GetProperty("rear_crew")
                .GetProperty("authority").GetString());
        Assert.Equal(2,
            root.GetProperty("aircraft")
                .GetProperty("patient_pod_capacity").GetInt32());
        Assert.Equal(0,
            root.GetProperty("aircraft")
                .GetProperty("onboard_request_ids").GetArrayLength());
        Assert.Equal(0,
            root.GetProperty("aircraft")
                .GetProperty("onboard_patient_ids").GetArrayLength());
        Assert.Equal(0,
            root.GetProperty("aircraft")
                .GetProperty("onboard_pod_ids").GetArrayLength());
        Assert.Equal(1, root.GetProperty("requests").GetArrayLength());
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            root.GetProperty("requests")[0].GetProperty("id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPatientId,
            root.GetProperty("requests")[0].GetProperty("patient_id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPodId,
            root.GetProperty("requests")[0].GetProperty("pod_id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPatientId,
            root.GetProperty("requests")[0]
                .GetProperty("patient_custody")
                .GetProperty("entity_id").GetString());
        Assert.Equal(1, root.GetProperty("patients").GetArrayLength());
        Assert.All(root.GetProperty("patients").EnumerateArray(),
            patient => Assert.Equal(JsonValueKind.Null,
                patient.GetProperty("medical").ValueKind));
        JsonElement begin = Assert.Single(
            root.GetProperty("decision").GetProperty("options").EnumerateArray());
        Assert.Equal("mission.begin", begin.GetProperty("command_id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            Assert.Single(begin.GetProperty("request_ids").EnumerateArray())
                .GetString());
        Assert.Equal(begin.GetProperty("id").GetString(),
            root.GetProperty("primary_action")
                .GetProperty("option_id").GetString());
    }

    [Fact]
    public void ActiveRendezvousUsesRemainingLegAndDoesNotDriftLate() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.Requests[0].Extraction.Phase
                == ExtractionDronePhase.OutboundToSite);

        using JsonDocument launch = Project(definition, session);
        Assert.Equal(0,
            launch.RootElement.GetProperty("rendezvous")
                .GetProperty("timing_delta_s").GetInt32());

        session.Advance(3);

        using JsonDocument underway = Project(definition, session);
        Assert.Equal(0,
            underway.RootElement.GetProperty("rendezvous")
                .GetProperty("timing_delta_s").GetInt32());
    }

    [Fact]
    public void BlockedExtractionProjectsExplicitRfChallengeWithoutClinicalLeaks() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);

        string json = MedevacSnapshotProjection.BuildState(
            definition, session.Snapshot, revision: 14, paused: false);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.Equal("DUSTOFF", root.GetProperty("mission_type").GetString());
        JsonElement extraction = root.GetProperty("extraction");
        Assert.True(extraction.GetProperty("rf_command_required").GetBoolean());
        Assert.Equal("AUTONOMOUS",
            extraction.GetProperty("link").GetProperty("mode").GetString());
        Assert.Equal(0, root.GetProperty("rf_exposure_training_units").GetInt32());

        JsonElement option = Assert.Single(
            root.GetProperty("decision").GetProperty("options").EnumerateArray());
        Assert.Equal("extraction.authorize-rf",
            option.GetProperty("command_id").GetString());
        Assert.True(option.GetProperty("requires_acknowledgement").GetBoolean());
        Assert.True(option.GetProperty("challenge").GetProperty("active").GetBoolean());

        Assert.DoesNotContain("blood_pressure", json,
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("heart_rate", json,
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("diagnosis", json,
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("survival", json,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TwoPodDecisionAdvertisesCapabilityMatchAndExplicitMismatchChallenge() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);
        session.ContinueCommittedCollection(acknowledgeReconsideration: true);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.ChooseReceivingFacility);

        using JsonDocument document = Project(definition, session, revision: 27);
        JsonElement root = document.RootElement;
        Assert.Equal(2,
            root.GetProperty("aircraft")
                .GetProperty("onboard_request_ids").GetArrayLength());
        Assert.Equal(new[] {
                BuiltInMedevacScenarios.FirstPodId,
                BuiltInMedevacScenarios.SecondPodId
            },
            root.GetProperty("aircraft")
                .GetProperty("onboard_pod_ids")
                .EnumerateArray()
                .Select(item => item.GetString())
                .ToArray());

        JsonElement[] options = root.GetProperty("decision")
            .GetProperty("options").EnumerateArray().ToArray();
        Assert.Equal(3, options.Length);
        Assert.Equal(3, options
            .Select(option => option.GetProperty("receiver_id").GetString())
            .Distinct(StringComparer.Ordinal)
            .Count());
        JsonElement surgical = Assert.Single(options,
            option => option.GetProperty("receiver_id").GetString()
                == BuiltInMedevacScenarios.SurgicalReceiverId);
        Assert.True(surgical.GetProperty("recommended").GetBoolean());
        Assert.False(surgical.GetProperty("requires_acknowledgement").GetBoolean());
        Assert.Equal(2, surgical.GetProperty("request_ids").GetArrayLength());
        Assert.Equal(2, surgical.GetProperty("pod_ids").GetArrayLength());
        Assert.Empty(surgical.GetProperty("remaining_pod_ids").EnumerateArray());

        JsonElement local = Assert.Single(options,
            option => option.GetProperty("receiver_id").GetString()
                == BuiltInMedevacScenarios.LocalHospitalId);
        Assert.True(local.GetProperty("requires_acknowledgement").GetBoolean());
        Assert.True(local.GetProperty("challenge").GetProperty("active").GetBoolean());
        Assert.Contains(
            "DAMAGE CONTROL SURGERY",
            local.GetProperty("detail").GetString() ?? "",
            StringComparison.Ordinal);

        JsonElement relay = Assert.Single(options,
            option => option.GetProperty("receiver_id").GetString()
                == BuiltInMedevacScenarios.TransportRelayId);
        Assert.False(relay.GetProperty("requires_acknowledgement").GetBoolean());
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            Assert.Single(relay.GetProperty("request_ids").EnumerateArray())
                .GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPodId,
            Assert.Single(relay.GetProperty("pod_ids").EnumerateArray())
                .GetString());
        Assert.Equal(BuiltInMedevacScenarios.SecondPodId,
            Assert.Single(relay.GetProperty("remaining_pod_ids").EnumerateArray())
                .GetString());
        Assert.Contains("POD-02 / PATIENT-02 remains aboard",
            relay.GetProperty("detail").GetString() ?? "",
            StringComparison.Ordinal);
        JsonElement relayReceiver = Assert.Single(
            root.GetProperty("receivers").EnumerateArray(),
            receiver => receiver.GetProperty("id").GetString()
                == BuiltInMedevacScenarios.TransportRelayId);
        Assert.Empty(relayReceiver.GetProperty("missing_capabilities").EnumerateArray());
        Assert.Equal("SUITABLE",
            relayReceiver.GetProperty("dominant_candidate")
                .GetProperty("suitability").GetString());
    }

    [Fact]
    public void WorseningReportProjectsRouteHoldContinueChallengeAndDiversionOptions() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);

        int routeSeconds = session.Snapshot.AirAmbulance.RouteSecondsRemaining;
        session.Advance(5);
        Assert.Equal(routeSeconds,
            session.Snapshot.AirAmbulance.RouteSecondsRemaining);

        string json = MedevacSnapshotProjection.BuildState(
            definition, session.Snapshot, revision: 31, paused: false);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.Equal("COLLECTION_REVIEW",
            root.GetProperty("decision").GetProperty("kind").GetString());
        Assert.Equal("ROUTE HOLD / MEDICAL RECONSIDERATION",
            root.GetProperty("aircraft")
                .GetProperty("automation_status").GetString());
        Assert.True(root.GetProperty("rear_crew")
            .GetProperty("challenge").GetProperty("active").GetBoolean());

        JsonElement[] options = root.GetProperty("decision")
            .GetProperty("options").EnumerateArray().ToArray();
        JsonElement continueOption = Assert.Single(options,
            option => option.GetProperty("command_id").GetString()
                == "decision.continue-collection");
        Assert.True(continueOption
            .GetProperty("requires_acknowledgement").GetBoolean());
        Assert.Equal(BuiltInMedevacScenarios.SecondRequestId,
            continueOption.GetProperty("committed_collection_request_id")
                .GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            continueOption.GetProperty("reconsideration_request_id")
                .GetString());
        Assert.Equal(BuiltInMedevacScenarios.SecondPatientId,
            Assert.Single(continueOption.GetProperty("patient_ids")
                .EnumerateArray()).GetString());
        Assert.Equal(BuiltInMedevacScenarios.SecondPodId,
            Assert.Single(continueOption.GetProperty("pod_ids")
                .EnumerateArray()).GetString());

        JsonElement[] diversionOptions = options.Where(option =>
            option.GetProperty("command_id").GetString()
                == "decision.deliver").ToArray();
        Assert.Equal(definition.ReceivingFacilities.Count,
            diversionOptions.Length);
        Assert.All(diversionOptions,
            option => Assert.Equal(
                BuiltInMedevacScenarios.SecondRequestId,
                option.GetProperty("committed_collection_request_id")
                    .GetString()));
        JsonElement recommended = Assert.Single(diversionOptions,
            option => option.GetProperty("recommended").GetBoolean());
        Assert.Equal(BuiltInMedevacScenarios.SurgicalReceiverId,
            recommended.GetProperty("receiver_id").GetString());
        Assert.DoesNotContain("diagnosis", json,
            StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("survival", json,
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void SelectiveRelayKeepsOtherPodAboardAndDebriefPreservesTypedAudits() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);
        session.ContinueCommittedCollection(acknowledgeReconsideration: true);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.ChooseReceivingFacility);

        session.ChooseDelivery(
            BuiltInMedevacScenarios.TransportRelayId,
            new[] { BuiltInMedevacScenarios.FirstRequestId });
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.CollectNextOrDeliver);

        Assert.Equal(new[] { BuiltInMedevacScenarios.SecondRequestId },
            session.Snapshot.AirAmbulance.OnboardRequestIds);
        Assert.Equal(new[] { BuiltInMedevacScenarios.SecondPatientId },
            session.Snapshot.AirAmbulance.OnboardPatientIds);
        Assert.Equal(new[] { BuiltInMedevacScenarios.SecondPodId },
            session.Snapshot.AirAmbulance.OnboardPodIds);

        session.ChooseDelivery(
            BuiltInMedevacScenarios.SurgicalReceiverId,
            new[] { BuiltInMedevacScenarios.SecondRequestId });
        AdvanceUntil(session, state =>
            state.Lifecycle == MedevacMissionLifecycle.Complete);

        using JsonDocument document = Project(definition, session, revision: 44);
        JsonElement root = document.RootElement;
        JsonElement[] decisions = root.GetProperty("debrief")
            .GetProperty("decisions").EnumerateArray().ToArray();

        JsonElement relay = Assert.Single(decisions,
            decision => decision.GetProperty("delivery_decision").ValueKind
                    != JsonValueKind.Null
                && decision.GetProperty("delivery_decision")
                    .GetProperty("receiver_id").GetString()
                    == BuiltInMedevacScenarios.TransportRelayId);
        JsonElement relayAudit = relay.GetProperty("delivery_decision");
        Assert.Equal(BuiltInMedevacScenarios.FirstPodId,
            Assert.Single(relayAudit.GetProperty("selected_pod_ids")
                .EnumerateArray()).GetString());
        Assert.Equal(JsonValueKind.Null,
            relayAudit.GetProperty("abandoned_collection_request_id").ValueKind);

        JsonElement continued = Assert.Single(decisions,
            decision => decision.GetProperty("reconsideration_decision").ValueKind
                != JsonValueKind.Null);
        JsonElement reconsideration =
            continued.GetProperty("reconsideration_decision");
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            reconsideration.GetProperty("triggering_request_id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.SecondRequestId,
            reconsideration.GetProperty("committed_collection_request_id")
                .GetString());
        Assert.True(reconsideration
            .GetProperty("worsening_acknowledged").GetBoolean());

        JsonElement firstPatient = Assert.Single(
            root.GetProperty("patients").EnumerateArray(),
            patient => patient.GetProperty("id").GetString()
                == BuiltInMedevacScenarios.FirstPatientId);
        Assert.Equal("PATIENT_TRANSPORT",
            firstPatient.GetProperty("custody")
                .GetProperty("custodian").GetString());
        JsonElement secondPatient = Assert.Single(
            root.GetProperty("patients").EnumerateArray(),
            patient => patient.GetProperty("id").GetString()
                == BuiltInMedevacScenarios.SecondPatientId);
        Assert.Equal("CLINICAL_FACILITY",
            secondPatient.GetProperty("custody")
                .GetProperty("custodian").GetString());
    }

    [Fact]
    public void DiversionAuditOwnsSelectedEntitiesAndAbandonedCollection() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);

        session.ChooseDelivery(
            BuiltInMedevacScenarios.SurgicalReceiverId,
            new[] { BuiltInMedevacScenarios.FirstRequestId });
        using JsonDocument document = Project(definition, session, revision: 38);
        JsonElement audit = Assert.Single(
            document.RootElement.GetProperty("events").EnumerateArray(),
            item => item.GetProperty("code").GetString()
                == "commander.divert-delivery")
            .GetProperty("delivery_decision");

        Assert.Equal(BuiltInMedevacScenarios.SurgicalReceiverId,
            audit.GetProperty("receiver_id").GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstRequestId,
            Assert.Single(audit.GetProperty("selected_request_ids")
                .EnumerateArray()).GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPatientId,
            Assert.Single(audit.GetProperty("selected_patient_ids")
                .EnumerateArray()).GetString());
        Assert.Equal(BuiltInMedevacScenarios.FirstPodId,
            Assert.Single(audit.GetProperty("selected_pod_ids")
                .EnumerateArray()).GetString());
        Assert.Equal(BuiltInMedevacScenarios.SecondRequestId,
            audit.GetProperty("abandoned_collection_request_id").GetString());
    }

    [Fact]
    public void NewMedicalEvidenceInvalidatesTheProjectedDecisionId() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);

        using JsonDocument before = Project(definition, session);
        string beforeId = before.RootElement.GetProperty("decision")
            .GetProperty("id").GetString()!;
        int firstRecordedAt = session.Snapshot.Requests[0].Medical!.RecordedAtSecond;
        AdvanceUntil(session, state =>
            state.Requests[0].Medical?.RecordedAtSecond > firstRecordedAt);

        using JsonDocument after = Project(definition, session);
        string afterId = after.RootElement.GetProperty("decision")
            .GetProperty("id").GetString()!;

        Assert.NotEqual(beforeId, afterId);
    }

    [Fact]
    public void EventWindowIsBoundedOrderedAndJsonContainsNoNonFiniteTokens() {
        (MedevacScenarioDefinition definition, MedevacEvacuationSession session) =
            BuiltIn();
        session.Begin(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state => state.Requests[0].Extraction.RfCommandRequired);
        session.CommandRfFallback(BuiltInMedevacScenarios.FirstRequestId);
        session.EjectShortRangeRepeater(BuiltInMedevacScenarios.FirstRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.CollectNextOrDeliver);
        session.ChooseCollectNext(BuiltInMedevacScenarios.SecondRequestId);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind
                == CommanderDecisionKind.ReconsiderCollectOrDeliver);
        session.ContinueCommittedCollection(acknowledgeReconsideration: true);
        AdvanceUntil(session, state =>
            state.CommanderDecision.Kind == CommanderDecisionKind.ChooseReceivingFacility);
        session.ChooseDelivery(BuiltInMedevacScenarios.SurgicalReceiverId);
        AdvanceUntil(session, state =>
            state.Lifecycle == MedevacMissionLifecycle.Complete);

        string json = MedevacSnapshotProjection.BuildState(
            definition, session.Snapshot, revision: 40, paused: false);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement[] events = document.RootElement.GetProperty("events")
            .EnumerateArray().ToArray();

        Assert.InRange(events.Length, 1, 18);
        long[] sequences = events.Select(item =>
            item.GetProperty("sequence").GetInt64()).ToArray();
        Assert.Equal(sequences.Order().ToArray(), sequences);
        Assert.DoesNotContain("NaN", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Infinity", json, StringComparison.Ordinal);
    }
}
