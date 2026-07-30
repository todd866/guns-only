using System.Globalization;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public enum MissionRadioPriority { Routine = 0, Advisory = 1, Urgent = 2 }

public enum MissionRadioChannel { Tactical = 0, Tower = 1, Approach = 2, Guard = 3 }

[Flags]
public enum MissionRadioKnowledge {
    None = 0,
    Identity = 1 << 0,
    Position = 1 << 1,
    CurrentAuthority = 1 << 2,
    RequestOrIntent = 1 << 3,
    All = Identity | Position | CurrentAuthority | RequestOrIntent,
}

public enum MissionRadioAcknowledgment {
    None = 0,
    ImplicitByAction = 1,
    Callsign = 2,
    FullReadback = 3,
}

public readonly record struct MissionRadioTurnContract(
    string TransmissionId,
    MissionRadioKnowledge Establishes,
    bool AcknowledgesPriorAuthority = false);

public readonly record struct MissionRadioExchangeContract(
    string Id,
    MissionRadioKnowledge Inherits,
    string ContextBasis,
    MissionRadioKnowledge RequiredByClose,
    MissionRadioAcknowledgment Acknowledgment,
    string AcknowledgmentBasis,
    IReadOnlyList<MissionRadioTurnContract> Turns,
    MissionRadioContextSource ContextSource = MissionRadioContextSource.None,
    MissionRadioImplicitAcknowledgment ImplicitAcknowledgment =
        MissionRadioImplicitAcknowledgment.None,
    bool Repeatable = false) {
    public MissionRadioKnowledge KnowledgeAtClose =>
        Turns.Aggregate(Inherits, (knowledge, turn) => knowledge | turn.Establishes);
}

/// <summary>
/// Content contracts for transactions that change the shared mental model. A short call is
/// complete when inherited context plus the exchange closes the relevant uncertainty; it is not
/// complete merely because its prose resembles a real transmission.
/// </summary>
public static class MissionRadioExchangeContracts {
    public static readonly MissionRadioExchangeContract TacticalCheckIn = new(
        "tactical-check-in",
        MissionRadioKnowledge.None,
        "First contact on CONTROL: the pilot identifies the aircraft, reports airborne status, "
        + "and confirms the fragged intent before CONTROL confirms track correlation.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.None,
        "CONTROL's radar-contact response closes the check-in; no echo reply is required.",
        [
            new(
                "pilot-check-in",
                MissionRadioKnowledge.Identity
                | MissionRadioKnowledge.RequestOrIntent),
            new(
                "control-radar-contact",
                MissionRadioKnowledge.Position
                | MissionRadioKnowledge.CurrentAuthority),
        ]);

    public static readonly MissionRadioExchangeContract PatternEntry = new(
        "pattern-entry",
        MissionRadioKnowledge.None,
        "First contact on Tower: aircraft identity, pattern position, intent, and break authority "
        + "must be established on-frequency.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.ImplicitByAction,
        "Flying the approved break is the acknowledgment; an extra readback would add no state.",
        [
            new("pilot-initial",
                MissionRadioKnowledge.Identity
                | MissionRadioKnowledge.Position
                | MissionRadioKnowledge.RequestOrIntent),
            new("tower-break-approved", MissionRadioKnowledge.CurrentAuthority),
        ],
        ImplicitAcknowledgment: MissionRadioImplicitAcknowledgment.PatternBreakFlown);

    public static readonly MissionRadioExchangeContract LandingClearance = new(
        "landing-clearance",
        MissionRadioKnowledge.Identity
        | MissionRadioKnowledge.Position
        | MissionRadioKnowledge.RequestOrIntent,
        "Tower already owns the identified aircraft in the closed circuit and sees it on base; "
        + "the established recovery intent persists.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.Callsign,
        "A callsign-only reply confirms receipt of the new landing authority.",
        [
            new("tower-cleared-arrested-landing", MissionRadioKnowledge.CurrentAuthority),
            new("pilot-landing-ack", MissionRadioKnowledge.None, true),
        ],
        ContextSource: MissionRadioContextSource.SharedChannel,
        Repeatable: true);

    public static readonly MissionRadioExchangeContract TacticalCommit = new(
        "tactical-commit",
        MissionRadioKnowledge.Identity
        | MissionRadioKnowledge.Position
        | MissionRadioKnowledge.RequestOrIntent,
        "The established tactical net and correlated datalink track carry aircraft identity, "
        + "geometry, and mission intent before COMMIT.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.Callsign,
        "Controller-authority COMMIT requires a two-way callsign acknowledgment.",
        [
            new("control-commit-short", MissionRadioKnowledge.CurrentAuthority),
            new("pilot-commit-ack", MissionRadioKnowledge.None, true),
        ],
        ContextSource: MissionRadioContextSource.MissionDatalink);

    public static readonly MissionRadioExchangeContract RecoveryRequest = new(
        "recovery-request",
        MissionRadioKnowledge.None,
        "First contact on Approach: no aircraft-specific recovery context is assumed.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.ImplicitByAction,
        "Continuing the recovery is observable compliance with the controller response.",
        [
            new("pilot-recovery-request",
                MissionRadioKnowledge.Identity
                | MissionRadioKnowledge.Position
                | MissionRadioKnowledge.RequestOrIntent),
            new("approach-recovery-continue", MissionRadioKnowledge.CurrentAuthority),
        ],
        ImplicitAcknowledgment: MissionRadioImplicitAcknowledgment.RecoveryContinued);

    public static readonly MissionRadioExchangeContract BingoReturn = new(
        "bingo-return",
        MissionRadioKnowledge.Identity | MissionRadioKnowledge.Position,
        "The established tactical net and datalink retain aircraft identity and position.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.ImplicitByAction,
        "Turning for recovery is observable compliance with the RTB directive.",
        [
            new("pilot-bingo", MissionRadioKnowledge.RequestOrIntent),
            new("control-bingo-rtb", MissionRadioKnowledge.CurrentAuthority),
        ],
        ContextSource: MissionRadioContextSource.MissionDatalink,
        ImplicitAcknowledgment: MissionRadioImplicitAcknowledgment.ReturnInitiated);

    public static readonly MissionRadioExchangeContract WeaponsSafe = new(
        "weapons-safe",
        MissionRadioKnowledge.Identity
        | MissionRadioKnowledge.Position
        | MissionRadioKnowledge.CurrentAuthority,
        "The post-engagement tactical picture retains identity, geometry, and existing authority.",
        MissionRadioKnowledge.All,
        MissionRadioAcknowledgment.FullReadback,
        "The pilot explicitly confirms the requested switch state.",
        [
            new("control-confirm-safe", MissionRadioKnowledge.RequestOrIntent),
            new("pilot-switch-safe", MissionRadioKnowledge.None, true),
        ],
        ContextSource: MissionRadioContextSource.MissionDatalink);

    public static IReadOnlyList<MissionRadioExchangeContract> All { get; } = [
        TacticalCheckIn,
        PatternEntry,
        LandingClearance,
        TacticalCommit,
        RecoveryRequest,
        BingoReturn,
        WeaponsSafe,
    ];
}

/// <summary>
/// One deterministic R/T transmission. The simulation owns the words and timing; presentation
/// may render optional captions or play a catalog clip without inventing a second script.
/// </summary>
public readonly record struct MissionRadioTransmission(
    bool Active,
    long Sequence,
    string Id,
    MissionRadioChannel Channel,
    string ChannelLabel,
    string FrequencyLabel,
    string Speaker,
    string Callsign,
    string Text,
    string Voice,
    MissionRadioPriority Priority,
    double StartedAtSeconds,
    double EndsAtSeconds,
    bool AiGenerated) {
    public static MissionRadioTransmission Silent => new(
        false, 0, "", MissionRadioChannel.Tactical, "", "", "", "", "", "",
        MissionRadioPriority.Routine, 0.0, 0.0, false);
}

public readonly record struct MissionRadioState(
    double TimeSeconds,
    bool MissionActive,
    bool RapierMissionAvailable,
    bool PatternOnly,
    RapierMissionPhase RapierPhase,
    bool CatapultActive,
    string PlayerLeg,
    IReadOnlyList<CircuitTrafficShip> Traffic,
    bool GearDownAndLocked,
    bool RecoveryApproach,
    bool MaritimeRecovery,
    Carrier.Recovery Recovery,
    ArrestmentModel.ArrestmentPhase ArrestmentPhase,
    int CaughtWire,
    string LsoCall,
    LsoSeverity? LsoSeverity,
    int GunRoundsFired,
    int GunAmmoRemaining,
    int MissilesRemaining,
    bool MissileInFlight,
    int DronesRemaining,
    bool Joker,
    bool Bingo,
    IReadOnlyList<SessionEvent> Events,
    string ChecklistName = "",
    string ChecklistCompletedCall = "");

/// <summary>Formatting shared by authored calls and tests, following ICAO/military pronunciation.</summary>
public static class RadioPhraseology {
    static readonly string[] Digits =
        ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "niner"];

    public static string DigitGroup(string value) {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException("a digit group is required", nameof(value));
        var words = new List<string>(value.Length);
        foreach (char valueChar in value) {
            if (!char.IsAsciiDigit(valueChar))
                throw new ArgumentException("digit groups may contain only digits", nameof(value));
            words.Add(Digits[valueChar - '0']);
        }
        return string.Join(' ', words);
    }

    public static string Frequency(double megahertz) {
        if (!double.IsFinite(megahertz) || megahertz <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(megahertz));
        string formatted = megahertz.ToString("0.000", CultureInfo.InvariantCulture)
            .TrimEnd('0').TrimEnd('.');
        string[] parts = formatted.Split('.');
        string spoken = DigitGroup(parts[0]);
        return parts.Length == 1 ? spoken : $"{spoken} decimal {DigitGroup(parts[1])}";
    }

    public static string AltitudeFeet(int feet) {
        if (feet < 0) throw new ArgumentOutOfRangeException(nameof(feet));
        if (feet == 0) return "zero";
        if (feet < 10_000 && feet % 100 == 0) {
            int thousands = feet / 1000;
            int hundreds = feet % 1000 / 100;
            var words = new List<string>(4);
            if (thousands > 0) {
                words.Add(NumberBelowTen(thousands));
                words.Add("thousand");
            }
            if (hundreds > 0) {
                words.Add(NumberBelowTen(hundreds));
                words.Add("hundred");
            }
            return string.Join(' ', words);
        }
        int leading = feet / 1000;
        int trailingHundreds = feet % 1000;
        string result = $"{DigitGroup(leading.ToString(CultureInfo.InvariantCulture))} thousand";
        if (trailingHundreds > 0)
            result += $" {NumberBelowTen(trailingHundreds / 100)} hundred";
        return result;
    }

    /// GHOST is monosyllabic, so its number takes digit form ("Ghost one one"); a
    /// polysyllabic word would take group form ("Viper eleven"). See PHRASEOLOGY.md §2.2.
    public static string SpokenCallsign(int flight, int position) =>
        $"Ghost {DigitGroup(flight.ToString(CultureInfo.InvariantCulture))} "
        + DigitGroup(position.ToString(CultureInfo.InvariantCulture));

    public static string DisplayCallsign(int flight, int position) =>
        $"GHOST {flight}{position}";

    static string NumberBelowTen(int number) {
        if (number is < 0 or > 9) throw new ArgumentOutOfRangeException(nameof(number));
        return Digits[number];
    }

}

/// <summary>
/// Shared event-driven radio director for every sortie. It speaks only facts represented by
/// authoritative simulation state. Brevity words are emitted only when an operational recipient
/// needs the delta; a trigger squeeze is telemetry, not automatically a radio event.
/// </summary>
public sealed class MissionRadioDirector {
    const int DecisionHistoryLimit = 128;
    const string Player = "GHOST 11";
    const string PlayerSpoken = "Ghost One One";
    const string TowerFrequency = "305.500 UHF";
    const string ApproachFrequency = "281.800 UHF";
    const string TacticalFrequency = "251.000 UHF";

    readonly List<PendingCall> _queue = [];
    readonly Dictionary<string, TrafficRadioAgentState> _trafficAgents = [];
    readonly Dictionary<MissionRadioChannel, MissionRadioKnowledge> _sharedKnowledge = [];
    readonly Dictionary<long, ExchangeProgress> _exchanges = [];
    readonly List<MissionRadioDecision> _decisions = [];
    MissionRadioTransmission _current = MissionRadioTransmission.Silent;
    string _playerLeg = "";
    bool _initialized;
    bool _catapultActive;
    bool _playerInitialReported;
    bool _gearUnsafeOnFinal;
    bool _joker;
    bool _bingo;
    bool _missionFinished;
    bool _recoveryApproach;
    Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    ArrestmentModel.ArrestmentPhase _arrestmentPhase;
    RapierMissionPhase _rapierPhase = RapierMissionPhase.Unavailable;
    int _missilesRemaining;
    int _dronesRemaining;
    int _gunAmmoRemaining;
    long _lastEventSequence;
    double _lastLsoCallAtSeconds = double.NegativeInfinity;
    string _lsoCall = "";
    double _notBeforeSeconds;
    long _sequence;
    long _exchangeSequence;
    long _currentExchangeInstance;
    int _currentExchangeTurnIndex = -1;
    bool _launchClearanceComplete;

    sealed class TrafficRadioAgentState(
        string leg,
        bool gearDownAndLocked,
        long circuitNumber) {
        public string Leg { get; set; } = leg;
        public bool GearDownAndLocked { get; set; } = gearDownAndLocked;
        public long CircuitNumber { get; set; } = circuitNumber;
        public bool GearReportPending { get; set; }
        public long GearReportCircuitNumber { get; set; } = circuitNumber;
        public double GearReportDueAtSeconds { get; set; }
        public double GearReportExpiresAtSeconds { get; set; }
    }

    readonly record struct PendingCall(
        string Id,
        MissionRadioChannel Channel,
        string ChannelLabel,
        string FrequencyLabel,
        string Speaker,
        string Callsign,
        string Text,
        string Voice,
        MissionRadioPriority Priority,
        double EarliestAtSeconds,
        double ExpiresAtSeconds,
        long ExchangeInstance = 0,
        int ExchangeTurnIndex = -1,
        MissionRadioKnowledge Requires = MissionRadioKnowledge.None,
        MissionRadioKnowledge Establishes = MissionRadioKnowledge.None,
        bool AcknowledgesPriorAuthority = false);

    sealed class ExchangeProgress(
        long instance,
        MissionRadioExchangeContract contract,
        MissionRadioChannel channel,
        MissionRadioKnowledge knowledge,
        double nowSeconds) {
        public long Instance { get; } = instance;
        public MissionRadioExchangeContract Contract { get; } = contract;
        public MissionRadioChannel Channel { get; } = channel;
        public MissionRadioKnowledge Knowledge { get; set; } = knowledge;
        public bool AuthorityAcknowledged { get; set; }
        public MissionRadioExchangeStatus Status { get; set; } =
            MissionRadioExchangeStatus.Queued;
        public int TransmittedTurns { get; set; }
        public double UpdatedAtSeconds { get; set; } = nowSeconds;
        public string TerminalReason { get; set; } = "";

        public string Id => $"{Contract.Id}#{Instance}";

        public MissionRadioExchangeSnapshot Snapshot() => new(
            Instance,
            Contract.Id,
            Channel,
            Knowledge,
            Contract.RequiredByClose,
            AuthorityAcknowledged,
            Status,
            UpdatedAtSeconds,
            TerminalReason);
    }

    /// <summary>
    /// True once the shot crew has handed the aircraft to the launcher. Carrier-style launch
    /// control is visual, so this interlock never waits for a fictional radio clearance.
    /// </summary>
    public bool LaunchClearanceComplete => _launchClearanceComplete;

    public IReadOnlyList<MissionRadioDecision> Decisions => _decisions;

    public IReadOnlyList<MissionRadioExchangeSnapshot> ExchangeHistory =>
        _exchanges.Values
            .OrderBy(exchange => exchange.Instance)
            .Select(exchange => exchange.Snapshot())
            .ToArray();

    public MissionRadioKnowledge SharedKnowledge(MissionRadioChannel channel) =>
        _sharedKnowledge.GetValueOrDefault(channel);

    public void Reset() {
        _queue.Clear();
        _trafficAgents.Clear();
        _sharedKnowledge.Clear();
        _exchanges.Clear();
        _decisions.Clear();
        _current = MissionRadioTransmission.Silent;
        _playerLeg = "";
        _initialized = false;
        _catapultActive = false;
        _playerInitialReported = false;
        _gearUnsafeOnFinal = false;
        _joker = false;
        _bingo = false;
        _missionFinished = false;
        _recoveryApproach = false;
        _recovery = Carrier.Recovery.Flying;
        _arrestmentPhase = ArrestmentModel.ArrestmentPhase.None;
        _rapierPhase = RapierMissionPhase.Unavailable;
        _missilesRemaining = 0;
        _dronesRemaining = 0;
        _gunAmmoRemaining = 0;
        _lastEventSequence = 0;
        _lastLsoCallAtSeconds = double.NegativeInfinity;
        _lsoCall = "";
        _notBeforeSeconds = 0.0;
        _sequence = 0;
        _exchangeSequence = 0;
        _currentExchangeInstance = 0;
        _currentExchangeTurnIndex = -1;
        _launchClearanceComplete = false;
        DroppedRoutineCalls = 0;
    }

    public MissionRadioTransmission Step(in MissionRadioState state) {
        Observe(state);
        ObserveImplicitAcknowledgments(state);

        if (_current.Active && state.TimeSeconds < _current.EndsAtSeconds)
            return _current;
        if (_current.Active) {
            // Replies should feel like replies. Longer natural silence comes from authoring fewer
            // calls, not padding every exchange until its operational moment has passed.
            double gap = 0.18 + 0.17 * GapFraction(_sequence);
            _notBeforeSeconds = Math.Max(_notBeforeSeconds, _current.EndsAtSeconds + gap);
            _current = _current with { Active = false };
            _currentExchangeInstance = 0;
            _currentExchangeTurnIndex = -1;
        }
        ExpireStaleCalls(state.TimeSeconds);

        while (_queue.Count > 0) {
            PendingCall next = _queue[0];
            // Aviate hold + inter-call gap: do not key the mic until both are satisfied.
            if (state.TimeSeconds < _notBeforeSeconds
                || state.TimeSeconds < next.EarliestAtSeconds)
                return _current;

            _queue.RemoveAt(0);
            if (!TryBeginTransmission(next, state))
                continue;

            // Measured clip length wins over the word-count estimate: the browser hard-stops any
            // playing clip when the next sequence starts, so an underestimate truncates speech.
            double duration = MissionRadioClipDurations.TryGet(next.Id, out double measured)
                ? measured + 0.12
                : EstimateDurationSeconds(next.Text);
            _sequence++;
            _currentExchangeInstance = next.ExchangeInstance;
            _currentExchangeTurnIndex = next.ExchangeTurnIndex;
            _current = new MissionRadioTransmission(
                true,
                _sequence,
                next.Id,
                next.Channel,
                next.ChannelLabel,
                next.FrequencyLabel,
                next.Speaker,
                next.Callsign,
                next.Text,
                next.Voice,
                next.Priority,
                state.TimeSeconds,
                state.TimeSeconds + duration,
                true);
            ObserveImplicitAcknowledgments(state);
            return _current;
        }
        return _current;
    }

    void Observe(in MissionRadioState state) {
        string playerLeg = state.PlayerLeg ?? "";
        if (!_initialized) {
            _initialized = true;
            _catapultActive = state.CatapultActive;
            _playerLeg = playerLeg;
            _recovery = state.Recovery;
            _arrestmentPhase = state.ArrestmentPhase;
            _recoveryApproach = state.RecoveryApproach;
            _rapierPhase = state.RapierPhase;
            _joker = state.Joker;
            _bingo = state.Bingo;
            _gunAmmoRemaining = state.GunAmmoRemaining;
            _missilesRemaining = state.MissilesRemaining;
            _dronesRemaining = state.DronesRemaining;
            _lastEventSequence = 0;
            foreach (CircuitTrafficShip ship in state.Traffic) {
                _trafficAgents[ship.Callsign] = new TrafficRadioAgentState(
                    ship.Leg, ship.GearDownAndLocked, ship.CircuitNumber);
            }
            if (state.MissionActive && state.RapierMissionAvailable && state.CatapultActive)
                QueueLaunch(state);
            if (state.MissionActive && !state.PatternOnly && state.RecoveryApproach)
                QueueRecoveryCheckIn(state);
            // Airborne attach may init already in Intercept (DirectJoin / LevelDash). Check-in
            // happened before the playable beat; start with the operational delta, not a recap.
            if (state.MissionActive && state.RapierMissionAvailable && !state.CatapultActive
                && !state.PatternOnly
                && state.RapierPhase == RapierMissionPhase.Intercept) {
                QueueCommit(state);
            }
            ObserveEvents(state);
        } else {
            if (state.MissionActive && state.RapierMissionAvailable
                && !_catapultActive && state.CatapultActive)
                QueueLaunch(state);
            if (state.PatternOnly)
                ObservePattern(state, playerLeg);
            else
                ObserveTacticalMission(state);
            ObserveRecovery(state);
            ObserveLso(state);
            ObserveWeaponsAndFuel(state);
            ObserveChecklists(state);
            ObserveEvents(state);
        }

        _catapultActive = state.CatapultActive;
        _playerLeg = playerLeg;
        _gearUnsafeOnFinal = playerLeg is "SHORT_FINAL" or "WIRE_FINAL"
            && !state.GearDownAndLocked;
        _recovery = state.Recovery;
        _arrestmentPhase = state.ArrestmentPhase;
        _recoveryApproach = state.RecoveryApproach;
        _rapierPhase = state.RapierPhase;
        _joker = state.Joker;
        _bingo = state.Bingo;
        _gunAmmoRemaining = state.GunAmmoRemaining;
        _missilesRemaining = state.MissilesRemaining;
        _dronesRemaining = state.DronesRemaining;
    }

    void QueueLaunch(in MissionRadioState state) {
        _ = state;
        // Catapult launches are controlled by the shot crew's visual hand-signal sequence:
        // readiness salute, launch-bar/catapult state, then the shooter. There is no pilot radio
        // clearance to put late or out of order. The launcher may release immediately.
        _launchClearanceComplete = true;
    }

    void ObservePattern(in MissionRadioState state, string playerLeg) {
        if (playerLeg.Length > 0 && playerLeg != _playerLeg)
            QueuePlayerLeg(playerLeg, state);

        foreach (CircuitTrafficShip ship in state.Traffic)
            ObserveTrafficAgent(state, ship);

        bool final = playerLeg is "SHORT_FINAL" or "WIRE_FINAL";
        bool gearUnsafe = final && !state.GearDownAndLocked;
        if (gearUnsafe && !_gearUnsafeOnFinal) {
            Enqueue(state, Tower(
                "tower-waveoff-gear", "RAPIER TOWER", Player,
                $"{PlayerSpoken}, go around. Gear unsafe.",
                "tower", MissionRadioPriority.Urgent), preempt: true);
        }
    }

    void ObserveTrafficAgent(
        in MissionRadioState state,
        in CircuitTrafficShip ship) {
        if (!_trafficAgents.TryGetValue(
            ship.Callsign, out TrafficRadioAgentState? agent)) {
            // Joining an already-live sortie must not manufacture a historical position report.
            _trafficAgents[ship.Callsign] = new TrafficRadioAgentState(
                ship.Leg, ship.GearDownAndLocked, ship.CircuitNumber);
            return;
        }

        bool enteredBase = agent.Leg != "BASE" && ship.Leg == "BASE";
        bool gearBecameSafeOnBase = agent.Leg == "BASE"
            && ship.Leg == "BASE"
            && !agent.GearDownAndLocked
            && ship.GearDownAndLocked;
        if ((enteredBase || gearBecameSafeOnBase)
            && ship.GearDownAndLocked) {
            // The agent reports the achieved configuration, not the nominal gate. A student who
            // is late with the handle remains correctly silent until the wheels are actually down.
            agent.GearReportPending = true;
            agent.GearReportCircuitNumber = ship.CircuitNumber;
            agent.GearReportDueAtSeconds =
                state.TimeSeconds + Math.Max(0.0, ship.RadioReactionSeconds);
            agent.GearReportExpiresAtSeconds = state.TimeSeconds + 6.0;
        }

        bool reportStillRelevant = ship.Leg == "BASE"
            && ship.GearDownAndLocked
            && ship.CircuitNumber == agent.GearReportCircuitNumber;
        if (agent.GearReportPending
            && (!reportStillRelevant
                || state.TimeSeconds > agent.GearReportExpiresAtSeconds)) {
            agent.GearReportPending = false;
        } else if (agent.GearReportPending
            && state.TimeSeconds >= agent.GearReportDueAtSeconds) {
            string id = $"traffic-{CallsignSlug(ship.Callsign)}-gear";
            string text = $"{SpokenTrafficCallsign(ship.Callsign)}, gear.";
            bool queued = Enqueue(state, Tower(
                id, NormalizedTrafficCallsign(ship.Callsign), "RAPIER TOWER",
                text, TrafficVoice(ship.Callsign), MissionRadioPriority.Routine));
            bool alreadyRepresented = _queue.Any(call => call.Id == id)
                || _current.Active && _current.Id == id;
            agent.GearReportPending = !queued && !alreadyRepresented;
            if (agent.GearReportPending)
                agent.GearReportDueAtSeconds = state.TimeSeconds + 0.75;
        }

        if (ship.Leg != "BASE"
            || !ship.GearDownAndLocked
            || ship.CircuitNumber != agent.GearReportCircuitNumber) {
            CancelQueuedTrafficCall(
                state.TimeSeconds,
                $"traffic-{CallsignSlug(ship.Callsign)}-gear",
                "aircraft left the reportable configuration gate before key-down");
        }

        agent.Leg = ship.Leg;
        agent.GearDownAndLocked = ship.GearDownAndLocked;
        agent.CircuitNumber = ship.CircuitNumber;
    }

    void CancelQueuedTrafficCall(
        double nowSeconds,
        string transmissionId,
        string reason) {
        foreach (PendingCall call in _queue
            .Where(call => call.ExchangeInstance == 0
                && call.Id == transmissionId)
            .ToArray()) {
            _queue.Remove(call);
            RecordDecision(
                nowSeconds,
                MissionRadioDecisionKind.Expired,
                call.Id,
                "",
                reason);
        }
    }

    void QueuePlayerLeg(string leg, in MissionRadioState state) {
        switch (leg) {
            case "DEPART":
                // Airborne + tower join already covered the climb-out; DEPART is silent.
                break;
            case "INITIAL":
                // Establish the pattern once. Subsequent closed circuits are already under Tower
                // control and do not need the same arrival exchange replayed every lap.
                if (!_playerInitialReported) {
                    _playerInitialReported = true;
                    EnqueueExchange(
                        state,
                        MissionRadioExchangeContracts.PatternEntry,
                        [
                            Tower(
                                "pilot-initial", Player, "RAPIER TOWER",
                                $"{PlayerSpoken}, initial.",
                                "pilot", MissionRadioPriority.Routine),
                            Tower(
                                "tower-break-approved", "RAPIER TOWER", Player,
                                $"{PlayerSpoken}, left break approved.",
                                "tower", MissionRadioPriority.Advisory),
                        ]);
                }
                break;
            // BREAK is flown, not spoken: the approval preceded it, and the maneuver
            // announces itself. (PHRASEOLOGY.md: responses to approvals are the jet moving.)
            case "DOWNWIND":
                // A working closed pattern does not narrate every leg. Tower breaks that silence
                // only for a configuration discrepancy.
                if (!state.GearDownAndLocked) {
                    Enqueue(state, Tower(
                        "tower-check-gear-downwind", "RAPIER TOWER", Player,
                        $"{PlayerSpoken}, check wheels down.",
                        "tower", MissionRadioPriority.Advisory));
                }
                break;
            case "BASE":
                // Sequence is machine-held; Tower can issue the landing clearance without a
                // redundant base report or an echo readback.
                if (state.GearDownAndLocked) {
                    EnqueueExchange(
                        state,
                        MissionRadioExchangeContracts.LandingClearance,
                        [
                            Tower(
                                "tower-cleared-arrested-landing", "RAPIER TOWER", Player,
                                $"{PlayerSpoken}, cable indicates up, cleared to land.",
                                "tower", MissionRadioPriority.Advisory),
                            Tower(
                                "pilot-landing-ack", Player, "RAPIER TOWER",
                                $"{PlayerSpoken}.",
                                "pilot", MissionRadioPriority.Routine),
                        ]);
                } else {
                    Enqueue(state, Tower(
                        "tower-continue-check-gear", "RAPIER TOWER", Player,
                        $"{PlayerSpoken}, continue, check wheels down.",
                        "tower", MissionRadioPriority.Advisory));
                }
                break;
            // SHORT_FINAL and WIRE_FINAL stay silent: seconds from the wire the pilot flies.
        }
    }

    void ObserveTacticalMission(in MissionRadioState state) {
        if (state.RapierMissionAvailable && _catapultActive && !state.CatapultActive) {
            EnqueueExchange(
                state,
                MissionRadioExchangeContracts.TacticalCheckIn,
                [
                    Tactical(
                        "pilot-check-in", Player, "CONTROL",
                        $"Control, {PlayerSpoken}, up as fragged.",
                        "pilot", MissionRadioPriority.Routine),
                    Tactical(
                        "control-radar-contact", "CONTROL", Player,
                        $"{PlayerSpoken}, radar contact.",
                        "controller", MissionRadioPriority.Routine),
                ]);
        }
        if (state.RapierPhase == _rapierPhase) return;
        switch (state.RapierPhase) {
            case RapierMissionPhase.Intercept:
                QueueCommit(state);
                break;
            case RapierMissionPhase.Escape:
                Enqueue(state, Tactical(
                    "pilot-separating", Player, "CONTROL",
                    $"{PlayerSpoken}, separating.",
                    "pilot", MissionRadioPriority.Advisory));
                break;
            case RapierMissionPhase.ReturnToBase:
                // Pilot states the want. CONTROL's roger is pure echo — omit it.
                Enqueue(state, Tactical(
                    "pilot-rtb", Player, "CONTROL",
                    $"Control, {PlayerSpoken}, RTB.",
                    "pilot", MissionRadioPriority.Advisory));
                break;
            case RapierMissionPhase.Recovery:
                QueueRecoveryCheckIn(state);
                break;
        }
    }

    void ObserveRecovery(in MissionRadioState state) {
        if (!_recoveryApproach && state.RecoveryApproach && !state.PatternOnly)
            QueueRecoveryCheckIn(state);
        if (state.Recovery == Carrier.Recovery.Bolter
            && _recovery != Carrier.Recovery.Bolter) {
            PendingCall bolter = !state.MaritimeRecovery
                ? Tower(
                    "tower-bolter", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, go around.",
                    "tower", MissionRadioPriority.Urgent)
                : Approach(
                    "lso-bolter", "PADDLES", Player,
                    "Bolter.",
                    "lso", MissionRadioPriority.Urgent);
            Enqueue(state, bolter, preempt: true);
        }
        if (state.ArrestmentPhase == ArrestmentModel.ArrestmentPhase.Stopped
            && _arrestmentPhase != ArrestmentModel.ArrestmentPhase.Stopped) {
            // The wire number is an internal LSO datum, never a radio call (PHRASEOLOGY.md
            // §3.3): surface it on the debrief panel instead. Tower speaks only when the
            // jet must actually hold; a trap rolling into the relaunch catapult, and every
            // maritime trap (the deck crew owns the jet), recover in radio silence.
            if (!state.MaritimeRecovery && !state.CatapultActive) {
                Enqueue(state, Tower(
                    "tower-hold-position", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, hold position.",
                    "tower", MissionRadioPriority.Advisory));
            }
        }
    }

    void ObserveLso(in MissionRadioState state) {
        string call = state.LsoCall ?? "";
        if (call.Length == 0) {
            _lsoCall = "";
            return;
        }
        if (call == _lsoCall) return;
        _lsoCall = call;

        bool waveOff = state.LsoSeverity == LsoSeverity.WaveOff;
        if (!waveOff && state.TimeSeconds - _lastLsoCallAtSeconds < 1.5) return;
        PendingCall? transmission = call switch {
            "WAVE OFF, WAVE OFF" => Approach(
                "lso-waveoff", "PADDLES", Player,
                "Wave off.", "lso", MissionRadioPriority.Urgent),
            "ADD POWER NOW" => Approach(
                "lso-add-power", "PADDLES", Player,
                "A little power.", "lso", MissionRadioPriority.Advisory),
            "POWER" => Approach(
                "lso-power", "PADDLES", Player,
                "Power.", "lso", MissionRadioPriority.Advisory),
            "YOU'RE LOW" => Approach(
                "lso-low", "PADDLES", Player,
                "You're low.", "lso", MissionRadioPriority.Advisory),
            "YOU'RE HIGH" => Approach(
                "lso-high", "PADDLES", Player,
                "You're high.", "lso", MissionRadioPriority.Advisory),
            "FAST" => Approach(
                "lso-fast", "PADDLES", Player,
                "You're fast.", "lso", MissionRadioPriority.Advisory),
            "COME LEFT" => Approach(
                "lso-come-left", "PADDLES", Player,
                "Left for lineup.", "lso", MissionRadioPriority.Advisory),
            "COME RIGHT" => Approach(
                "lso-come-right", "PADDLES", Player,
                "Right for lineup.", "lso", MissionRadioPriority.Advisory),
            _ => null,
        };
        if (transmission is not { } selected) return;
        _lastLsoCallAtSeconds = state.TimeSeconds;
        Enqueue(state, selected, preempt: waveOff);
    }

    void QueueRecoveryCheckIn(in MissionRadioState state) {
        EnqueueExchange(
            state,
            MissionRadioExchangeContracts.RecoveryRequest,
            [
                Approach(
                    "pilot-recovery-request", Player, "RAPIER APPROACH",
                    $"Rapier Approach, {PlayerSpoken}, inbound, request recovery.",
                    "pilot", MissionRadioPriority.Routine),
                Approach(
                    "approach-recovery-continue", "RAPIER APPROACH", Player,
                    $"{PlayerSpoken}, continue.",
                    "controller", MissionRadioPriority.Advisory),
            ]);
    }

    void QueueCommit(in MissionRadioState state) {
        // The correlated group and geometry already exist on the tactical display/datalink.
        // Current ACC doctrine permits the controller's directive to end "[flight] COMMIT";
        // the fighter acknowledges with callsign only. Do not invent a cinematic engage order.
        EnqueueExchange(
            state,
            MissionRadioExchangeContracts.TacticalCommit,
            [
                Tactical(
                    "control-commit-short", "CONTROL", Player,
                    "Ghost, commit.",
                    "controller", MissionRadioPriority.Advisory),
                Tactical(
                    "pilot-commit-ack", Player, "CONTROL",
                    $"{PlayerSpoken}.",
                    "pilot", MissionRadioPriority.Routine),
            ]);
    }

    void ObserveWeaponsAndFuel(in MissionRadioState state) {
        if (state.MissilesRemaining < _missilesRemaining && state.MissileInFlight) {
            Enqueue(state, Tactical(
                "pilot-fox-two", Player, "PACKAGE",
                "Fox Two.",
                "pilot", MissionRadioPriority.Advisory), preempt: true);
        }
        if (state.DronesRemaining < _dronesRemaining) {
            Enqueue(state, Tactical(
                "pilot-drone-away", Player, "PACKAGE",
                "Drone away.",
                "pilot", MissionRadioPriority.Advisory), preempt: true);
        }

        bool hadAirToAirOrdnance = _missilesRemaining + _dronesRemaining > 0;
        bool hasAirToAirOrdnance = state.MissilesRemaining + state.DronesRemaining > 0;
        bool hadAnyOrdnance = hadAirToAirOrdnance || _gunAmmoRemaining > 0;
        bool hasAnyOrdnance = hasAirToAirOrdnance || state.GunAmmoRemaining > 0;
        if (hadAirToAirOrdnance && !hasAirToAirOrdnance && state.GunAmmoRemaining > 0) {
            Enqueue(state, Tactical(
                "pilot-remington", Player, "PACKAGE",
                "Remington.",
                "pilot", MissionRadioPriority.Advisory));
        }
        if (hadAnyOrdnance && !hasAnyOrdnance) {
            Enqueue(state, Tactical(
                "pilot-winchester", Player, "PACKAGE",
                "Winchester.",
                "pilot", MissionRadioPriority.Advisory));
        }

        if (!_joker && state.Joker && !state.Bingo) {
            Enqueue(state, Tactical(
                "pilot-joker", Player, "CONTROL",
                $"{PlayerSpoken}, Joker.",
                "pilot", MissionRadioPriority.Advisory));
        }
        if (!_bingo && state.Bingo) {
            EnqueueExchange(
                state,
                MissionRadioExchangeContracts.BingoReturn,
                [
                    Tactical(
                        "pilot-bingo", Player, "CONTROL",
                        $"{PlayerSpoken}, Bingo.",
                        "pilot", MissionRadioPriority.Urgent),
                    Tactical(
                        "control-bingo-rtb", "CONTROL", Player,
                        $"{PlayerSpoken}, RTB.",
                        "controller", MissionRadioPriority.Urgent),
                ],
                preempt: true);
        }
    }

    /// <summary>
    /// Someone in the fiction needs the shared model (Rapier package / tactical net).
    /// Classic guns-only has no package — trigger and splash stay off the air.
    /// </summary>
    static bool PackageAudience(in MissionRadioState state) =>
        state.RapierMissionAvailable && !state.PatternOnly;

    void ObserveEvents(in MissionRadioState state) {
        foreach (SessionEvent sessionEvent in state.Events) {
            if (sessionEvent.Sequence <= _lastEventSequence) continue;
            _lastEventSequence = sessionEvent.Sequence;
            if (sessionEvent.Type == SessionEventType.Destroyed
                && sessionEvent.Source == CombatRole.Player
                && sessionEvent.Target == CombatRole.Opponent
                && PackageAudience(state)) {
                Enqueue(state, Tactical(
                    "pilot-splash", Player, "PACKAGE",
                    "Splash one.",
                    "pilot", MissionRadioPriority.Advisory));
            } else if (sessionEvent.Type == SessionEventType.SortieFinished
                && !_missionFinished) {
                _missionFinished = true;
                // Victory only — CONTROL congratulating a shoot-down fails audience and delta.
                if (sessionEvent.Outcome == SortieOutcome.Victory) {
                    // Real kill chains close administratively, not congratulatorily: C2
                    // queries weapons state, the pilot safes the switch (PHRASEOLOGY.md §3.4).
                    EnqueueExchange(
                        state,
                        MissionRadioExchangeContracts.WeaponsSafe,
                        [
                            Tactical(
                                "control-confirm-safe", "CONTROL", Player,
                                $"{PlayerSpoken}, confirm weapons safe.",
                                "controller", MissionRadioPriority.Advisory),
                            Tactical(
                                "pilot-switch-safe", Player, "CONTROL",
                                $"{PlayerSpoken}, switch is safe.",
                                "pilot", MissionRadioPriority.Routine),
                        ]);
                }
            }
        }
    }

    /// Checklist state belongs on ANCA. Speaking it would make radio a narration layer, so the
    /// one-tick completion tokens deliberately stay off-air.
    void ObserveChecklists(in MissionRadioState state) {
        _ = state;
    }

    bool EnqueueExchange(
        in MissionRadioState state,
        MissionRadioExchangeContract contract,
        IReadOnlyList<PendingCall> calls,
        bool preempt = false) {
        if (calls.Count != contract.Turns.Count)
            throw new InvalidOperationException(
                $"{contract.Id} declares {contract.Turns.Count} turns but queued {calls.Count}");
        if (calls.Count == 0)
            throw new InvalidOperationException($"{contract.Id} has no turns");
        MissionRadioChannel channel = calls[0].Channel;
        if (calls.Any(call => call.Channel != channel))
            throw new InvalidOperationException(
                $"{contract.Id} crosses channels inside one exchange");

        bool duplicate = !contract.Repeatable && _exchanges.Values.Any(exchange =>
            exchange.Contract.Id == contract.Id
            && exchange.Status is MissionRadioExchangeStatus.Queued
                or MissionRadioExchangeStatus.InProgress
                or MissionRadioExchangeStatus.AwaitingAcknowledgment
                or MissionRadioExchangeStatus.Complete);
        if (duplicate) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.SuppressedDuplicate,
                calls[0].Id,
                contract.Id,
                "exchange already established or pending");
            return false;
        }

        long instance = ++_exchangeSequence;
        MissionRadioKnowledge initialKnowledge =
            contract.ContextSource == MissionRadioContextSource.MissionDatalink
                ? contract.Inherits
                : MissionRadioKnowledge.None;
        var progress = new ExchangeProgress(
            instance, contract, channel, initialKnowledge, state.TimeSeconds);
        _exchanges.Add(instance, progress);
        if (initialKnowledge != MissionRadioKnowledge.None)
            AddSharedKnowledge(channel, initialKnowledge);

        MissionRadioKnowledge required = contract.Inherits;
        for (int index = 0; index < calls.Count; index++) {
            MissionRadioTurnContract turn = contract.Turns[index];
            if (!StringComparer.Ordinal.Equals(calls[index].Id, turn.TransmissionId)) {
                AbandonExchange(
                    instance,
                    MissionRadioExchangeStatus.Suppressed,
                    MissionRadioDecisionKind.SuppressedMissingContext,
                    state.TimeSeconds,
                    calls[index].Id,
                    "queued turn does not match exchange contract");
                throw new InvalidOperationException(
                    $"{contract.Id} turn {index} expects {turn.TransmissionId}, "
                    + $"received {calls[index].Id}");
            }
            PendingCall call = calls[index] with {
                ExchangeInstance = instance,
                ExchangeTurnIndex = index,
                Requires = required,
                Establishes = turn.Establishes,
                AcknowledgesPriorAuthority = turn.AcknowledgesPriorAuthority,
            };
            if (!Enqueue(state, call, preempt && index == 0)) {
                AbandonExchange(
                    instance,
                    MissionRadioExchangeStatus.Suppressed,
                    MissionRadioDecisionKind.SuppressedMissingContext,
                    state.TimeSeconds,
                    call.Id,
                    "exchange turn could not be queued");
                return false;
            }
            required |= turn.Establishes;
        }
        return true;
    }

    bool TryBeginTransmission(PendingCall call, in MissionRadioState state) {
        if (call.ExchangeInstance == 0) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.Transmitted,
                call.Id,
                "",
                "standalone operational delta");
            return true;
        }
        if (!_exchanges.TryGetValue(call.ExchangeInstance, out ExchangeProgress? exchange)
            || IsTerminal(exchange.Status)) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.SuppressedMissingContext,
                call.Id,
                exchange?.Id ?? "",
                "exchange is no longer active");
            return false;
        }

        if (exchange.Contract.ContextSource == MissionRadioContextSource.SharedChannel) {
            exchange.Knowledge |=
                SharedKnowledge(exchange.Channel) & exchange.Contract.Inherits;
        }
        if (call.ExchangeTurnIndex != exchange.TransmittedTurns) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.SuppressedMissingContext,
                call.Id,
                exchange.Id,
                "prior exchange turn did not transmit");
            AbandonExchange(
                exchange.Instance,
                MissionRadioExchangeStatus.Suppressed,
                MissionRadioDecisionKind.SuppressedMissingContext,
                state.TimeSeconds,
                call.Id,
                "exchange order was not established");
            return false;
        }
        MissionRadioKnowledge missing = call.Requires & ~exchange.Knowledge;
        if (missing != MissionRadioKnowledge.None) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.SuppressedMissingContext,
                call.Id,
                exchange.Id,
                $"missing shared context: {missing}");
            AbandonExchange(
                exchange.Instance,
                MissionRadioExchangeStatus.Suppressed,
                MissionRadioDecisionKind.SuppressedMissingContext,
                state.TimeSeconds,
                call.Id,
                $"missing shared context: {missing}");
            return false;
        }

        exchange.Status = MissionRadioExchangeStatus.InProgress;
        exchange.Knowledge |= call.Establishes;
        exchange.AuthorityAcknowledged |= call.AcknowledgesPriorAuthority;
        exchange.TransmittedTurns++;
        exchange.UpdatedAtSeconds = state.TimeSeconds;
        AddSharedKnowledge(exchange.Channel, call.Establishes);
        RecordDecision(
            state.TimeSeconds,
            MissionRadioDecisionKind.Transmitted,
            call.Id,
            exchange.Id,
            call.AcknowledgesPriorAuthority
                ? "required acknowledgment"
                : $"establishes {call.Establishes}");

        if (exchange.TransmittedTurns == exchange.Contract.Turns.Count) {
            MissionRadioKnowledge stillMissing =
                exchange.Contract.RequiredByClose & ~exchange.Knowledge;
            if (stillMissing != MissionRadioKnowledge.None) {
                AbandonExchange(
                    exchange.Instance,
                    MissionRadioExchangeStatus.Suppressed,
                    MissionRadioDecisionKind.SuppressedMissingContext,
                    state.TimeSeconds,
                    call.Id,
                    $"contract closed without {stillMissing}");
                return false;
            }
            if (exchange.Contract.Acknowledgment
                is MissionRadioAcknowledgment.Callsign
                or MissionRadioAcknowledgment.FullReadback) {
                if (exchange.AuthorityAcknowledged)
                    CompleteExchange(exchange, state.TimeSeconds, "explicit acknowledgment");
                else
                    exchange.Status = MissionRadioExchangeStatus.AwaitingAcknowledgment;
            } else if (exchange.Contract.Acknowledgment
                == MissionRadioAcknowledgment.ImplicitByAction) {
                exchange.Status = MissionRadioExchangeStatus.AwaitingAcknowledgment;
            } else {
                CompleteExchange(exchange, state.TimeSeconds, "no acknowledgment required");
            }
        }
        return true;
    }

    void ObserveImplicitAcknowledgments(in MissionRadioState state) {
        foreach (ExchangeProgress exchange in _exchanges.Values
            .Where(exchange =>
                exchange.Status == MissionRadioExchangeStatus.AwaitingAcknowledgment)
            .ToArray()) {
            bool acknowledged = exchange.Contract.ImplicitAcknowledgment switch {
                MissionRadioImplicitAcknowledgment.PatternBreakFlown =>
                    (state.PlayerLeg ?? "") is
                        "BREAK" or "DOWNWIND" or "BASE" or "SHORT_FINAL"
                        or "WIRE_FINAL" or "ROLLOUT",
                MissionRadioImplicitAcknowledgment.RecoveryContinued =>
                    state.RecoveryApproach
                    || state.RapierPhase == RapierMissionPhase.Recovery,
                MissionRadioImplicitAcknowledgment.ReturnInitiated =>
                    state.RapierPhase is
                        RapierMissionPhase.ReturnToBase or RapierMissionPhase.Recovery,
                _ => false,
            };
            if (!acknowledged) continue;
            exchange.AuthorityAcknowledged = true;
            exchange.UpdatedAtSeconds = state.TimeSeconds;
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.ImplicitAcknowledgment,
                "",
                exchange.Id,
                exchange.Contract.AcknowledgmentBasis);
            CompleteExchange(exchange, state.TimeSeconds, "authority acknowledged by action");
        }
    }

    void CompleteExchange(
        ExchangeProgress exchange,
        double nowSeconds,
        string reason) {
        exchange.Status = MissionRadioExchangeStatus.Complete;
        exchange.UpdatedAtSeconds = nowSeconds;
        exchange.TerminalReason = reason;
        RecordDecision(
            nowSeconds,
            MissionRadioDecisionKind.ExchangeCompleted,
            "",
            exchange.Id,
            reason);
    }

    void ExpireStaleCalls(double nowSeconds) {
        while (true) {
            int index = _queue.FindIndex(call => nowSeconds > call.ExpiresAtSeconds);
            if (index < 0) return;
            PendingCall expired = _queue[index];
            if (expired.ExchangeInstance == 0) {
                _queue.RemoveAt(index);
                RecordDecision(
                    nowSeconds,
                    MissionRadioDecisionKind.Expired,
                    expired.Id,
                    "",
                    "operational moment passed before key-down");
                continue;
            }
            string exchangeId = _exchanges.TryGetValue(
                expired.ExchangeInstance, out ExchangeProgress? exchange)
                    ? exchange.Id
                    : "";
            RecordDecision(
                nowSeconds,
                MissionRadioDecisionKind.Expired,
                expired.Id,
                exchangeId,
                "exchange turn expired before key-down");
            AbandonExchange(
                expired.ExchangeInstance,
                MissionRadioExchangeStatus.Expired,
                MissionRadioDecisionKind.SuppressedMissingContext,
                nowSeconds,
                expired.Id,
                "exchange expired before required knowledge was closed");
        }
    }

    void AbandonExchange(
        long instance,
        MissionRadioExchangeStatus status,
        MissionRadioDecisionKind dependentDecision,
        double nowSeconds,
        string triggeringTransmissionId,
        string reason) {
        if (!_exchanges.TryGetValue(instance, out ExchangeProgress? exchange)
            || IsTerminal(exchange.Status))
            return;
        foreach (PendingCall dependent in _queue
            .Where(call => call.ExchangeInstance == instance)
            .ToArray()) {
            if (!StringComparer.Ordinal.Equals(
                dependent.Id, triggeringTransmissionId)) {
                RecordDecision(
                    nowSeconds,
                    dependentDecision,
                    dependent.Id,
                    exchange.Id,
                    reason);
            }
        }
        _queue.RemoveAll(call => call.ExchangeInstance == instance);
        exchange.Status = status;
        exchange.UpdatedAtSeconds = nowSeconds;
        exchange.TerminalReason = reason;
    }

    void PreemptQueuedNonUrgent(double nowSeconds) {
        long[] exchangeInstances = _queue
            .Where(call => call.Priority != MissionRadioPriority.Urgent
                && call.ExchangeInstance != 0)
            .Select(call => call.ExchangeInstance)
            .Distinct()
            .ToArray();
        foreach (long instance in exchangeInstances) {
            AbandonExchange(
                instance,
                MissionRadioExchangeStatus.Preempted,
                MissionRadioDecisionKind.Preempted,
                nowSeconds,
                "",
                "urgent safety call took the frequency");
        }
        foreach (PendingCall call in _queue
            .Where(call =>
                call.Priority != MissionRadioPriority.Urgent
                && call.ExchangeInstance == 0)
            .ToArray()) {
            _queue.Remove(call);
            RecordDecision(
                nowSeconds,
                MissionRadioDecisionKind.Preempted,
                call.Id,
                "",
                "urgent safety call took the frequency");
        }
    }

    void PreemptCurrent(double nowSeconds) {
        if (!_current.Active || _current.Priority == MissionRadioPriority.Urgent)
            return;
        string exchangeId = "";
        if (_currentExchangeInstance != 0
            && _exchanges.TryGetValue(
                _currentExchangeInstance, out ExchangeProgress? exchange)) {
            exchangeId = exchange.Id;
            if (_currentExchangeTurnIndex >= 0
                && _currentExchangeTurnIndex < exchange.Contract.Turns.Count) {
                // Completion is recorded at key-down so downstream turns can use the new
                // context immediately. If safety traffic cuts that final turn off, retract the
                // provisional closure before abandoning the exchange.
                if (exchange.Status == MissionRadioExchangeStatus.Complete
                    && exchange.TransmittedTurns == _currentExchangeTurnIndex + 1) {
                    exchange.Status = MissionRadioExchangeStatus.InProgress;
                    exchange.TerminalReason = "";
                    if (exchange.Contract.Acknowledgment
                        == MissionRadioAcknowledgment.ImplicitByAction) {
                        exchange.AuthorityAcknowledged = false;
                        _decisions.RemoveAll(decision =>
                            decision.ExchangeId == exchange.Id
                            && decision.Kind
                                == MissionRadioDecisionKind.ImplicitAcknowledgment);
                    }
                    _decisions.RemoveAll(decision =>
                        decision.ExchangeId == exchange.Id
                        && decision.Kind == MissionRadioDecisionKind.ExchangeCompleted);
                }
                MissionRadioTurnContract interrupted =
                    exchange.Contract.Turns[_currentExchangeTurnIndex];
                exchange.Knowledge &= ~interrupted.Establishes;
                if (interrupted.AcknowledgesPriorAuthority)
                    exchange.AuthorityAcknowledged = false;
                exchange.TransmittedTurns = _currentExchangeTurnIndex;
                RebuildSharedKnowledge(exchange.Channel);
            }
            AbandonExchange(
                exchange.Instance,
                MissionRadioExchangeStatus.Preempted,
                MissionRadioDecisionKind.Preempted,
                nowSeconds,
                _current.Id,
                "urgent safety call interrupted the transmission");
        }
        RecordDecision(
            nowSeconds,
            MissionRadioDecisionKind.Preempted,
            _current.Id,
            exchangeId,
            "urgent safety call interrupted the transmission");
        _current = MissionRadioTransmission.Silent with { Sequence = _sequence };
        _currentExchangeInstance = 0;
        _currentExchangeTurnIndex = -1;
        _notBeforeSeconds = 0.0;
    }

    void AddSharedKnowledge(
        MissionRadioChannel channel,
        MissionRadioKnowledge knowledge) {
        if (knowledge == MissionRadioKnowledge.None) return;
        _sharedKnowledge[channel] = SharedKnowledge(channel) | knowledge;
    }

    void RebuildSharedKnowledge(MissionRadioChannel channel) {
        MissionRadioKnowledge knowledge = MissionRadioKnowledge.None;
        foreach (ExchangeProgress exchange in _exchanges.Values
            .Where(exchange => exchange.Channel == channel)) {
            if (exchange.Contract.ContextSource == MissionRadioContextSource.MissionDatalink)
                knowledge |= exchange.Contract.Inherits;
            knowledge |= exchange.Knowledge;
        }
        _sharedKnowledge[channel] = knowledge;
    }

    void RecordDecision(
        double nowSeconds,
        MissionRadioDecisionKind kind,
        string transmissionId,
        string exchangeId,
        string reason) {
        if (_decisions.Count >= DecisionHistoryLimit)
            _decisions.RemoveAt(0);
        _decisions.Add(new MissionRadioDecision(
            nowSeconds, kind, transmissionId, exchangeId, reason));
    }

    static bool IsTerminal(MissionRadioExchangeStatus status) =>
        status is MissionRadioExchangeStatus.Complete
            or MissionRadioExchangeStatus.Expired
            or MissionRadioExchangeStatus.Preempted
            or MissionRadioExchangeStatus.Suppressed;

    bool Enqueue(in MissionRadioState state, PendingCall call, bool preempt = false) {
        if (_queue.Any(item => item.Id == call.Id)
            || _current.Active && _current.Id == call.Id) {
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.SuppressedDuplicate,
                call.Id,
                ExchangeId(call.ExchangeInstance),
                "transmission already active or queued");
            return false;
        }

        // ANCA sequencing: Aviate before Communicate. Routine speech waits after the event;
        // urgent stays nearly immediate. FIFO chaining keeps a tower reply from leapfrogging
        // the pilot call that shares the same beat.
        double earliest = state.TimeSeconds + AviateHoldSeconds(call);
        if (!preempt && _queue.Count > 0)
            earliest = Math.Max(earliest, _queue[^1].EarliestAtSeconds);
        call = call with {
            EarliestAtSeconds = earliest,
            ExpiresAtSeconds = state.TimeSeconds + StaleAfterSeconds(call),
        };

        if (preempt && call.Priority == MissionRadioPriority.Urgent) {
            PreemptQueuedNonUrgent(state.TimeSeconds);
            _queue.Insert(0, call);
            PreemptCurrent(state.TimeSeconds);
        } else if (preempt) {
            // An advisory employment delta may move to the front, but it cannot erase a phase
            // call or cut off an active speaker. Destructive preemption is reserved for safety.
            _queue.Insert(0, call);
        } else if (_queue.Count < 16) {
            _queue.Add(call);
        } else {
            DroppedRoutineCalls += 1;
            RecordDecision(
                state.TimeSeconds,
                MissionRadioDecisionKind.QueueFull,
                call.Id,
                ExchangeId(call.ExchangeInstance),
                "radio queue reached its bounded capacity");
            return false;
        }
        RecordDecision(
            state.TimeSeconds,
            MissionRadioDecisionKind.Queued,
            call.Id,
            ExchangeId(call.ExchangeInstance),
            "candidate passed audience, novelty, priority, and workload policy");
        return true;
    }

    string ExchangeId(long instance) =>
        instance != 0 && _exchanges.TryGetValue(instance, out ExchangeProgress? exchange)
            ? exchange.Id
            : "";

    /// <summary>
    /// Seconds to wait after the triggering event before this call may key the mic.
    /// Urgent and pre-stroke clearance are near-immediate; pilot/package waits for aviate.
    /// </summary>
    static double AviateHoldSeconds(in PendingCall call) {
        if (call.Priority == MissionRadioPriority.Urgent) return 0.10;
        // LSO is flying the pass with the pilot — short, not chatty.
        if (call.Voice == "lso") return 0.15;
        // Machine-keyed tactical calls should land on the event, with only a human-scale beat.
        if (call.Channel == MissionRadioChannel.Tactical) return 0.25;
        if (call.Voice is "pilot" or "controller") return 0.45;
        return 0.30;
    }

    static double StaleAfterSeconds(in PendingCall call) {
        if (call.Voice == "lso") return 3.0;
        if (call.Priority == MissionRadioPriority.Urgent) return 8.0;
        if (call.Id.StartsWith("traffic-", StringComparison.Ordinal)
            || call.Channel == MissionRadioChannel.Tower) return 8.0;
        return 15.0;
    }

    /// Routine calls discarded because the queue was saturated. A busy pattern losing calls is a
    /// tuning signal (queue depth, call volume), never a silent event.
    public int DroppedRoutineCalls { get; private set; }

    static PendingCall Tactical(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Tactical, "PACKAGE", TacticalFrequency,
            speaker, callsign, text, voice, priority, 0.0, double.PositiveInfinity);

    static PendingCall Tower(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Tower, "RAPIER TOWER", TowerFrequency,
            speaker, callsign, text, voice, priority, 0.0, double.PositiveInfinity);

    static PendingCall Approach(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Approach, "RAPIER APPROACH", ApproachFrequency,
            speaker, callsign, text, voice, priority, 0.0, double.PositiveInfinity);

    static double EstimateDurationSeconds(string text) {
        int words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Clamp(0.70 + words / 2.65, 1.35, 6.0);
    }

    static double GapFraction(long sequence) {
        unchecked {
            ulong hash = (ulong)sequence * 0x9E3779B97F4A7C15ul;
            hash ^= hash >> 29;
            return (hash & 0xFFFFFF) / (double)0x1000000;
        }
    }

    static string CallsignSlug(string callsign) =>
        callsign.ToLowerInvariant().Replace(' ', '-');

    static string NormalizedTrafficCallsign(string callsign) => callsign switch {
        "RAPIER 2" => "GHOST 12",
        "RAPIER 3" => "GHOST 13",
        "RAPIER 4" => "GHOST 14",
        _ => callsign,
    };

    // Static squadron slots speak group form ("Ghost Twelve"); only formation flights
    // with positional numbering would speak digits ("Ghost one two"). PHRASEOLOGY.md §2.2.
    static string SpokenTrafficCallsign(string callsign) => callsign switch {
        "RAPIER 2" or "GHOST 12" => "Ghost One Two",
        "RAPIER 3" or "GHOST 13" => "Ghost One Three",
        "RAPIER 4" or "GHOST 14" => "Ghost One Four",
        _ => callsign,
    };

    static string TrafficVoice(string callsign) => callsign switch {
        "RAPIER 2" or "RAPIER 1-2" => "traffic-two",
        "RAPIER 3" or "RAPIER 1-3" => "traffic-three",
        "RAPIER 4" or "RAPIER 1-4" => "traffic-four",
        _ => "traffic",
    };
}
