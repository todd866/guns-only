using System.Text.Json;
using GunsOnly.Sim;

namespace GunsOnly.AncaAudit;

static class Runner {
    public static int Run(IEnumerable<AuditScenario> scenarios, TextWriter output) {
        int samples = 0;
        foreach (AuditScenario scenario in scenarios)
            samples += RunOne(scenario, output);
        return samples;
    }

    /// <summary>All radio IDs heard across a scenario (for --strict / self-test).</summary>
    public static HashSet<string> RunCollectingRadio(
        AuditScenario scenario, TextWriter output) {
        var heard = new HashSet<string>(StringComparer.Ordinal);
        RunOne(scenario, output, heard);
        return heard;
    }

    static int RunOne(
        AuditScenario scenario, TextWriter output, HashSet<string>? heardIds = null) {
        SimulationSession session = Scenarios.Open(scenario);
        long lastRadioSequence = 0;
        var radioLog = new List<object>();
        var scenarioHeard = new HashSet<string>(StringComparer.Ordinal);
        int sampleCount = 0;
        bool timedOut = false;

        void ObserveRadio() {
            MissionRadioTransmission radio = session.MissionRadio;
            if (!radio.Active || radio.Sequence <= lastRadioSequence) return;
            lastRadioSequence = radio.Sequence;
            scenarioHeard.Add(radio.Id);
            heardIds?.Add(radio.Id);
            radioLog.Add(new {
                t = session.TimeSeconds,
                id = radio.Id,
                speaker = radio.Speaker,
                callsign = radio.Callsign,
                channel = radio.ChannelLabel,
                frequency = radio.FrequencyLabel,
                text = radio.Text,
                voice = radio.Voice,
                priority = (int)radio.Priority,
                started_s = radio.StartedAtSeconds,
                ends_s = radio.EndsAtSeconds,
            });
        }

        void Emit(string label) {
            ObserveRadio();
            var payload = new Dictionary<string, object?> {
                ["scenario"] = scenario.Id,
                ["title"] = scenario.Title,
                ["beat_index"] = scenario.BeatIndex,
                ["sample"] = label,
                ["t"] = session.TimeSeconds,
                ["timed_out"] = timedOut,
                ["state"] = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
                    WireState.BuildJson(session)),
                ["radio_since_last_sample"] = radioLog.ToArray(),
            };
            output.WriteLine(JsonSerializer.Serialize(payload));
            radioLog.Clear();
            timedOut = false;
            sampleCount++;
        }

        foreach (AuditAction action in scenario.Actions) {
            switch (action.Kind) {
                case AuditActionKind.WaitSeconds:
                    StepSeconds(session, action.Seconds, ObserveRadio);
                    break;
                case AuditActionKind.Sample:
                    Emit(string.IsNullOrEmpty(action.Label) ? "sample" : action.Label);
                    break;
                case AuditActionKind.ReleaseWeaponsHold:
                    session.ReleaseWeaponsHold();
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.TriggerPulse:
                    session.FeedKey(GKey.Trigger, true);
                    session.StepFixed();
                    session.FeedKey(GKey.Trigger, false);
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.HoldTrigger:
                    session.FeedKey(GKey.Trigger, true);
                    StepSeconds(session, Math.Max(0.05, action.Seconds), ObserveRadio);
                    session.FeedKey(GKey.Trigger, false);
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.KnockItOff:
                    session.FeedKey(GKey.KnockItOff, true);
                    session.StepFixed();
                    session.FeedKey(GKey.KnockItOff, false);
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.HoldKey:
                    session.FeedKey(action.Key, true);
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.ReleaseKey:
                    session.FeedKey(action.Key, false);
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.LaunchMissile:
                    session.LaunchRapierShortRangeMissile();
                    session.StepFixed();
                    ObserveRadio();
                    break;
                case AuditActionKind.CommandGearUp:
                    ClaimAndGearUp(session);
                    ObserveRadio();
                    break;
                case AuditActionKind.WaitUntilRadioId:
                    // Succeed if the id is already on the air OR was heard earlier in this
                    // scenario (phase-change calls often fire during a prior WaitUntilRadio).
                    if (!WaitUntil(session, action.TimeoutSeconds, ObserveRadio,
                            () => scenarioHeard.Contains(action.Match))) {
                        timedOut = true;
                        Emit($"timeout-radio:{action.Match}");
                    }
                    break;
                case AuditActionKind.WaitUntilChecklistId:
                    if (!WaitUntil(session, action.TimeoutSeconds, ObserveRadio,
                            () => session.MissionChecklist.Active
                                && session.MissionChecklist.Name.Equals(
                                    action.Match, StringComparison.OrdinalIgnoreCase))) {
                        timedOut = true;
                        Emit($"timeout-checklist:{action.Match}");
                    }
                    break;
                case AuditActionKind.WaitUntilPhase:
                    if (!WaitUntil(session, action.TimeoutSeconds, ObserveRadio,
                            () => session.RapierPhase.ToString().Equals(
                                action.Match, StringComparison.OrdinalIgnoreCase))) {
                        timedOut = true;
                        Emit($"timeout-phase:{action.Match}");
                    }
                    break;
                case AuditActionKind.WaitUntilLeg:
                    if (!WaitUntil(session, action.TimeoutSeconds, ObserveRadio,
                            () => session.RapierCircuitLeg.Equals(
                                action.Match, StringComparison.OrdinalIgnoreCase))) {
                        timedOut = true;
                        Emit($"timeout-leg:{action.Match}");
                    }
                    break;
            }
        }

        return sampleCount;
    }

    static void ClaimAndGearUp(SimulationSession session) {
        // Stick input claims Rapier automation so config automation cannot put the gear back.
        session.FeedKey(GKey.PullUp, true);
        session.StepFixed();
        if (session.PlayerSystems.GearHandle != LandingGearHandle.Up) {
            session.FeedKey(GKey.GearToggle, true);
            session.StepFixed();
            session.FeedKey(GKey.GearToggle, false);
            session.StepFixed();
        }
        session.FeedKey(GKey.PullUp, false);
        session.StepFixed();
    }

    static void StepSeconds(SimulationSession session, double seconds, Action observe) {
        int ticks = Scenarios.Ticks(seconds);
        for (int i = 0; i < ticks; i++) {
            session.StepFixed();
            observe();
        }
    }

    static bool WaitUntil(
        SimulationSession session,
        double timeoutSeconds,
        Action observe,
        Func<bool> predicate) {
        int ticks = Scenarios.Ticks(timeoutSeconds);
        for (int i = 0; i < ticks; i++) {
            session.StepFixed();
            observe();
            if (predicate()) return true;
        }
        return predicate();
    }
}
