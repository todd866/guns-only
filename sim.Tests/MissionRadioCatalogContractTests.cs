using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Every transmission the director can put on the air must exist verbatim in the recorded-speech
/// catalog (audio/radio/mission/lines.json). Captions and clips share one source of truth: if a
/// call's text diverges from its catalog id, a recorded clip would say something the aircraft is
/// not doing (Build 179 shipped exactly that bug for the unsafe-gear downwind call).
/// </summary>
public class MissionRadioCatalogContractTests {
    static readonly CircuitTrafficShip[] NoTraffic = [];
    static readonly SessionEvent[] NoEvents = [];

    sealed record CatalogLine(string Role, string Text, bool Dynamic);

    static Dictionary<string, CatalogLine> LoadCatalog() {
        string path = Path.Combine(
            TestRepository.Root, "audio", "radio", "mission", "lines.json");
        using JsonDocument document = JsonDocument.Parse(File.ReadAllText(path));
        var lines = new Dictionary<string, CatalogLine>(StringComparer.Ordinal);
        foreach (JsonElement line in document.RootElement.GetProperty("lines").EnumerateArray()) {
            lines[line.GetProperty("id").GetString()!] = new CatalogLine(
                line.GetProperty("role").GetString()!,
                line.GetProperty("text").GetString()!,
                line.TryGetProperty("dynamic", out JsonElement dynamicFlag)
                    && dynamicFlag.GetBoolean());
        }
        return lines;
    }

    static MissionRadioState State(
        double timeSeconds,
        bool pattern = true,
        RapierMissionPhase phase = RapierMissionPhase.Launch,
        bool catapult = false,
        string leg = "DEPART",
        IReadOnlyList<CircuitTrafficShip>? traffic = null,
        bool gearDownAndLocked = true,
        CircuitLandingIntent landingIntent = CircuitLandingIntent.FullStop,
        bool landingAuthorityAvailable = true,
        bool pilotGoingAround = false,
        bool recoveryApproach = false,
        bool maritimeRecovery = false,
        Carrier.Recovery recovery = Carrier.Recovery.Flying,
        ArrestmentModel.ArrestmentPhase arrestment = ArrestmentModel.ArrestmentPhase.None,
        int wire = 0,
        string lsoCall = "",
        LsoSeverity? lsoSeverity = null,
        int gunRounds = 0,
        int gunAmmo = 100,
        int missiles = 0,
        bool missileInFlight = false,
        int drones = 0,
        bool joker = false,
        bool bingo = false,
        IReadOnlyList<SessionEvent>? events = null,
        string checklistCall = "") => new(
            TimeSeconds: timeSeconds,
            MissionActive: true,
            RapierMissionAvailable: true,
            PatternOnly: pattern,
            RapierPhase: phase,
            CatapultActive: catapult,
            PlayerLeg: leg,
            Traffic: traffic ?? NoTraffic,
            GearDownAndLocked: gearDownAndLocked,
            PlayerLandingIntent: landingIntent,
            LandingAuthorityAvailable: landingAuthorityAvailable,
            PilotGoingAround: pilotGoingAround,
            RecoveryApproach: recoveryApproach,
            MaritimeRecovery: maritimeRecovery,
            Recovery: recovery,
            ArrestmentPhase: arrestment,
            CaughtWire: wire,
            LsoCall: lsoCall,
            LsoSeverity: lsoSeverity,
            GunRoundsFired: gunRounds,
            GunAmmoRemaining: gunAmmo,
            MissilesRemaining: missiles,
            MissileInFlight: missileInFlight,
            DronesRemaining: drones,
            Joker: joker,
            Bingo: bingo,
            Events: events ?? NoEvents,
            ChecklistCompletedCall: checklistCall);

    /// Pump at radio cadence. Large jumps deliberately expire stale calls now.
    static void Drain(
        MissionRadioDirector director,
        List<MissionRadioTransmission> collected,
        ref double clock,
        Func<double, MissionRadioState> state) {
        // Dedupe by value, not by sequence number: sequence counters restart per director,
        // so a fresh director's first call can collide with the previous director's last.
        for (int i = 0; i < 160; i++) {
            clock += 0.5;
            MissionRadioTransmission current = director.Step(state(clock));
            if (current.Active && (collected.Count == 0 || !collected[^1].Equals(current)))
                collected.Add(current);
        }
    }

    static CircuitTrafficShip Ship(string callsign, string leg) =>
        new(Present: true, Callsign: callsign, Leg: leg, X: 0.0, Y: 0.0, Z: 0.0, Chi: 0.0);

    [Fact]
    public void ExchangeContractsCloseRequiredUncertaintyAndDeclareAcknowledgments() {
        Dictionary<string, CatalogLine> catalog = LoadCatalog();

        foreach (MissionRadioExchangeContract exchange in MissionRadioExchangeContracts.All) {
            Assert.False(string.IsNullOrWhiteSpace(exchange.ContextBasis));
            Assert.False(string.IsNullOrWhiteSpace(exchange.AcknowledgmentBasis));
            Assert.Equal(
                MissionRadioKnowledge.None,
                exchange.RequiredByClose & ~exchange.KnowledgeAtClose);

            foreach (MissionRadioTurnContract turn in exchange.Turns)
                Assert.True(catalog.ContainsKey(turn.TransmissionId),
                    $"{exchange.Id} references missing catalog line {turn.TransmissionId}");

            int explicitAcknowledgments =
                exchange.Turns.Count(turn => turn.AcknowledgesPriorAuthority);
            if (exchange.Acknowledgment
                is MissionRadioAcknowledgment.Callsign
                or MissionRadioAcknowledgment.FullReadback) {
                Assert.Equal(1, explicitAcknowledgments);
                Assert.Equal(
                    MissionRadioImplicitAcknowledgment.None,
                    exchange.ImplicitAcknowledgment);
            } else {
                Assert.Equal(0, explicitAcknowledgments);
            }
            if (exchange.Acknowledgment == MissionRadioAcknowledgment.ImplicitByAction) {
                Assert.NotEqual(
                    MissionRadioImplicitAcknowledgment.None,
                    exchange.ImplicitAcknowledgment);
            }
            if (exchange.ContextSource == MissionRadioContextSource.None) {
                Assert.Equal(MissionRadioKnowledge.None, exchange.Inherits);
            }
        }
    }

    [Fact]
    public void EveryTransmissionTheDirectorEmitsExistsVerbatimInTheCatalog() {
        Dictionary<string, CatalogLine> catalog = LoadCatalog();
        var director = new MissionRadioDirector();
        var heard = new List<MissionRadioTransmission>();
        double clock = 0.0;

        // Visual shot-crew launch and the full clean pattern. Launch itself is radio-silent.
        MissionRadioTransmission first = director.Step(State(clock, catapult: true, leg: ""));
        if (first.Active) heard.Add(first);
        Drain(director, heard, ref clock, t => State(t, leg: "DEPART"));
        Drain(director, heard, ref clock, t => State(t, leg: "INITIAL"));
        Drain(director, heard, ref clock, t => State(t, leg: "BREAK"));
        Drain(director, heard, ref clock, t => State(t, leg: "CROSSWIND"));
        Drain(director, heard, ref clock, t => State(t, leg: "DOWNWIND"));
        Drain(director, heard, ref clock, t => State(t, leg: "BASE"));
        Drain(director, heard, ref clock, t => State(t, leg: "SHORT_FINAL"));
        Drain(director, heard, ref clock, t => State(
            t, leg: "ROLLOUT",
            arrestment: ArrestmentModel.ArrestmentPhase.Stopped, wire: 3));

        // A mission-authored non-default plan uses its own exact recorded transaction.
        var touchAndGoDirector = new MissionRadioDirector();
        double touchClock = 0.0;
        touchAndGoDirector.Step(State(
            touchClock,
            leg: "DOWNWIND",
            landingIntent: CircuitLandingIntent.TouchAndGo));
        Drain(touchAndGoDirector, heard, ref touchClock, t => State(
            t,
            leg: "BASE",
            landingIntent: CircuitLandingIntent.TouchAndGo));

        // Several traffic laps exercise each independent aircraft's landing transaction.
        foreach (string traffic_leg in new[] { "BASE", "SHORT_FINAL", "DEPART", "BASE", "SHORT_FINAL" }) {
            Drain(director, heard, ref clock, t => State(t, leg: "DOWNWIND", traffic: [
                Ship("RAPIER 2", traffic_leg),
                Ship("RAPIER 3", traffic_leg),
                Ship("RAPIER 4", traffic_leg),
            ]));
        }

        // The unsafe-gear pattern: honest downwind, tower challenge, unsafe base, waveoff.
        var unsafeDirector = new MissionRadioDirector();
        clock = 0.0;
        unsafeDirector.Step(State(clock, leg: ""));
        Drain(unsafeDirector, heard, ref clock,
            t => State(t, leg: "DOWNWIND", gearDownAndLocked: false));
        Drain(unsafeDirector, heard, ref clock,
            t => State(t, leg: "BASE", gearDownAndLocked: false));
        Drain(unsafeDirector, heard, ref clock,
            t => State(t, leg: "SHORT_FINAL", gearDownAndLocked: false));

        // A pilot-initiated discontinuation is a separate transaction from Tower's safety call.
        var goAroundDirector = new MissionRadioDirector();
        clock = 0.0;
        goAroundDirector.Step(State(clock, leg: "DEPART"));
        Drain(goAroundDirector, heard, ref clock, t => State(t, leg: "INITIAL"));
        Drain(goAroundDirector, heard, ref clock, t => State(t, leg: "BREAK"));
        Drain(goAroundDirector, heard, ref clock, t => State(
            t, leg: "DOWNWIND", pilotGoingAround: true));

        // Bolters and every wire, tower-side and LSO-side.
        foreach (bool maritime in new[] { false, true }) {
            var recoveryDirector = new MissionRadioDirector();
            clock = 0.0;
            recoveryDirector.Step(State(clock, leg: "SHORT_FINAL", maritimeRecovery: maritime));
            Drain(recoveryDirector, heard, ref clock, t => State(
                t, leg: "SHORT_FINAL", maritimeRecovery: maritime,
                recovery: Carrier.Recovery.Bolter));
            for (int wire = 1; wire <= 4; wire++) {
                int caught = wire;
                Drain(recoveryDirector, heard, ref clock, t => State(
                    t, leg: "ROLLOUT", maritimeRecovery: maritime,
                    arrestment: ArrestmentModel.ArrestmentPhase.Stopped, wire: caught));
                Drain(recoveryDirector, heard, ref clock, t => State(
                    t, leg: "SHORT_FINAL", maritimeRecovery: maritime));
            }
        }

        // Wire calls during an active relaunch cycle drop the "hold position".
        var relaunchDirector = new MissionRadioDirector();
        clock = 0.0;
        relaunchDirector.Step(State(clock, leg: "SHORT_FINAL"));
        for (int wire = 1; wire <= 4; wire++) {
            int caught = wire;
            Drain(relaunchDirector, heard, ref clock, t => State(
                t, leg: "ROLLOUT", catapult: true,
                arrestment: ArrestmentModel.ArrestmentPhase.Stopped, wire: caught));
            Drain(relaunchDirector, heard, ref clock, t => State(
                t, leg: "SHORT_FINAL", catapult: true));
        }

        // Every LSO cadence call.
        var lsoDirector = new MissionRadioDirector();
        clock = 0.0;
        foreach ((string call, LsoSeverity severity) in new[] {
            ("YOU'RE LOW", LsoSeverity.Correcting),
            ("ADD POWER NOW", LsoSeverity.Correcting),
            ("POWER", LsoSeverity.Correcting),
            ("YOU'RE HIGH", LsoSeverity.Correcting),
            ("FAST", LsoSeverity.Correcting),
            ("COME LEFT", LsoSeverity.Correcting),
            ("COME RIGHT", LsoSeverity.Correcting),
            ("WAVE OFF, WAVE OFF", LsoSeverity.WaveOff),
        }) {
            string lsoCall = call;
            LsoSeverity lsoSeverity = severity;
            Drain(lsoDirector, heard, ref clock, t => State(
                t, leg: "SHORT_FINAL", lsoCall: lsoCall, lsoSeverity: lsoSeverity));
            Drain(lsoDirector, heard, ref clock, t => State(t, leg: "SHORT_FINAL"));
        }

        // The tactical mission: commit, weapons, fuel, kill, RTB, recovery.
        var tacticalDirector = new MissionRadioDirector();
        clock = 0.0;
        tacticalDirector.Step(State(clock, pattern: false, catapult: true,
            missiles: 2, drones: 1));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept, missiles: 2, drones: 1));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            missiles: 2, drones: 1, gunRounds: 40));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            missiles: 1, drones: 1, missileInFlight: true, gunRounds: 40));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            missiles: 1, drones: 0, gunRounds: 40));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            missiles: 0, drones: 0, gunRounds: 40));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            missiles: 0, drones: 0, gunRounds: 40, gunAmmo: 0));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            gunAmmo: 0, joker: true));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Intercept,
            gunAmmo: 0, joker: true, bingo: true));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Escape, gunAmmo: 0,
            joker: true, bingo: true));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.ReturnToBase, gunAmmo: 0,
            joker: true, bingo: true));
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Recovery, gunAmmo: 0,
            joker: true, bingo: true));
        var splash = new SessionEvent(
            Sequence: 1, Tick: 1, Type: SessionEventType.Destroyed,
            Source: CombatRole.Player, Target: CombatRole.Opponent,
            Count: 1, Outcome: SortieOutcome.None);
        var finished = new SessionEvent(
            Sequence: 2, Tick: 2, Type: SessionEventType.SortieFinished,
            Source: CombatRole.Player, Target: CombatRole.Opponent,
            Count: 1, Outcome: SortieOutcome.Victory);
        Drain(tacticalDirector, heard, ref clock, t => State(
            t, pattern: false, phase: RapierMissionPhase.Recovery, gunAmmo: 0,
            joker: true, bingo: true, events: [splash, finished]));

        // The two checklist milestones arrive as one-tick tokens via the session.
        var checklistDirector = new MissionRadioDirector();
        clock = 0.0;
        checklistDirector.Step(State(clock, pattern: false, leg: ""));
        Drain(checklistDirector, heard, ref clock, t => State(
            t, pattern: false, checklistCall: "LAUNCH_GEAR_UP"));
        Drain(checklistDirector, heard, ref clock, t => State(
            t, pattern: false, checklistCall: "RECOVERY_GEAR_DOWN"));

        Assert.NotEmpty(heard);
        var offCatalog = new List<string>();
        foreach (MissionRadioTransmission transmission in heard) {
            if (!catalog.TryGetValue(transmission.Id, out CatalogLine? line)) {
                offCatalog.Add($"{transmission.Id}: id missing from catalog "
                    + $"(text: \"{transmission.Text}\")");
            } else if (!line.Dynamic
                && !string.Equals(line.Text, transmission.Text, StringComparison.Ordinal)) {
                offCatalog.Add($"{transmission.Id}: text diverged\n"
                    + $"  sim:     \"{transmission.Text}\"\n"
                    + $"  catalog: \"{line.Text}\"");
            }
        }
        Assert.True(offCatalog.Count == 0,
            "Transmissions off the recorded-speech catalog:\n" + string.Join("\n", offCatalog));

        // Exercise a representative slice of every authored subsystem. The catalog may retain
        // dormant takes while chatter is tuned down; the contract's primary direction is that
        // everything the director can emit has an exact recorded line.
        var heardIds = heard.Select(t => t.Id).ToHashSet(StringComparer.Ordinal);
        string[] required = [
            "pilot-initial",
            "tower-break-approved",
            "pilot-crosswind",
            "tower-cleared-arrested-landing",
            "pilot-landing-ack",
            "pilot-base-touch-and-go",
            "tower-cleared-touch-and-go",
            "pilot-touch-and-go-ack",
            "tower-waveoff-gear",
            "lso-waveoff",
            "control-commit-short",
            "pilot-commit-ack",
            "pilot-bingo",
        ];
        Assert.True(required.All(heardIds.Contains),
            "Representative radio coverage collapsed. Missing: "
            + string.Join(", ", required.Where(id => !heardIds.Contains(id))));
        Assert.DoesNotContain("launch-cleared", heardIds);
        Assert.DoesNotContain("pilot-launch-readback", heardIds);
        Assert.DoesNotContain("control-confirm-safe", heardIds);
        Assert.DoesNotContain("pilot-switch-safe", heardIds);

        // Content contracts are also runtime contracts: the director must emit each turn in
        // exchange order, not merely retain semantically valid lines in the catalog.
        foreach (MissionRadioExchangeContract exchange in MissionRadioExchangeContracts.All) {
            int cursor = -1;
            foreach (MissionRadioTurnContract turn in exchange.Turns) {
                cursor = heard.FindIndex(
                    cursor + 1,
                    transmission => transmission.Id == turn.TransmissionId);
                Assert.True(cursor >= 0,
                    $"{exchange.Id} never emitted ordered turn {turn.TransmissionId}");
            }
        }
    }
}
