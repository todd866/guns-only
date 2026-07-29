using System.Globalization;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public enum MissionRadioPriority { Routine = 0, Advisory = 1, Urgent = 2 }

public enum MissionRadioChannel { Tactical = 0, Tower = 1, Approach = 2, Guard = 3 }

/// <summary>
/// One deterministic R/T transmission. The simulation owns the words and timing; presentation
/// may render captions, play a catalog clip, or use device speech without inventing a second script.
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
    IReadOnlyList<SessionEvent> Events);

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

    public static string SpokenCallsign(int flight, int position) =>
        $"Rapier {DigitGroup(flight.ToString(CultureInfo.InvariantCulture))} "
        + DigitGroup(position.ToString(CultureInfo.InvariantCulture));

    public static string DisplayCallsign(int flight, int position) =>
        $"RAPIER {flight}-{position}";

    static string NumberBelowTen(int number) {
        if (number is < 0 or > 9) throw new ArgumentOutOfRangeException(nameof(number));
        return Digits[number];
    }
}

/// <summary>
/// Shared event-driven radio director for every sortie. It speaks only facts represented by
/// authoritative simulation state. Brevity words are attached to the event they actually mean:
/// GUNS to gun employment, FOX TWO to an IR missile launch, SPLASH to destruction, and fuel calls
/// only at the configured JOKER/BINGO thresholds.
/// </summary>
public sealed class MissionRadioDirector {
    const string Player = "RAPIER 1-1";
    const string PlayerSpoken = "Rapier One One";
    const string TowerFrequency = "305.500 UHF";
    const string ApproachFrequency = "281.800 UHF";
    const string TacticalFrequency = "251.000 UHF";

    readonly List<PendingCall> _queue = [];
    readonly Dictionary<string, string> _trafficLegs = [];
    MissionRadioTransmission _current = MissionRadioTransmission.Silent;
    string _playerLeg = "";
    bool _initialized;
    bool _catapultActive;
    bool _gearUnsafeOnFinal;
    bool _joker;
    bool _bingo;
    bool _gunBurstActive;
    bool _missionFinished;
    bool _recoveryApproach;
    Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    ArrestmentModel.ArrestmentPhase _arrestmentPhase;
    RapierMissionPhase _rapierPhase = RapierMissionPhase.Unavailable;
    int _gunRoundsFired;
    int _missilesRemaining;
    int _dronesRemaining;
    int _gunAmmoRemaining;
    long _lastEventSequence;
    double _lastGunEmploymentAtSeconds = double.NegativeInfinity;
    double _lastLsoCallAtSeconds = double.NegativeInfinity;
    string _lsoCall = "";
    double _notBeforeSeconds;
    long _sequence;

    readonly record struct PendingCall(
        string Id,
        MissionRadioChannel Channel,
        string ChannelLabel,
        string FrequencyLabel,
        string Speaker,
        string Callsign,
        string Text,
        string Voice,
        MissionRadioPriority Priority);

    public void Reset() {
        _queue.Clear();
        _trafficLegs.Clear();
        _current = MissionRadioTransmission.Silent;
        _playerLeg = "";
        _initialized = false;
        _catapultActive = false;
        _gearUnsafeOnFinal = false;
        _joker = false;
        _bingo = false;
        _gunBurstActive = false;
        _missionFinished = false;
        _recoveryApproach = false;
        _recovery = Carrier.Recovery.Flying;
        _arrestmentPhase = ArrestmentModel.ArrestmentPhase.None;
        _rapierPhase = RapierMissionPhase.Unavailable;
        _gunRoundsFired = 0;
        _missilesRemaining = 0;
        _dronesRemaining = 0;
        _gunAmmoRemaining = 0;
        _lastEventSequence = 0;
        _lastGunEmploymentAtSeconds = double.NegativeInfinity;
        _lastLsoCallAtSeconds = double.NegativeInfinity;
        _lsoCall = "";
        _notBeforeSeconds = 0.0;
        _sequence = 0;
    }

    public MissionRadioTransmission Step(in MissionRadioState state) {
        Observe(state);

        if (_current.Active && state.TimeSeconds < _current.EndsAtSeconds)
            return _current;
        if (_current.Active) {
            _notBeforeSeconds = Math.Max(_notBeforeSeconds, _current.EndsAtSeconds + 0.28);
            _current = _current with { Active = false };
        }
        if (_queue.Count == 0 || state.TimeSeconds < _notBeforeSeconds)
            return _current;

        PendingCall next = _queue[0];
        _queue.RemoveAt(0);
        double duration = EstimateDurationSeconds(next.Text);
        _sequence++;
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
            _gunRoundsFired = 0;
            _gunAmmoRemaining = state.GunAmmoRemaining;
            _missilesRemaining = state.MissilesRemaining;
            _dronesRemaining = state.DronesRemaining;
            _lastEventSequence = 0;
            foreach (CircuitTrafficShip ship in state.Traffic)
                _trafficLegs[ship.Callsign] = ship.Leg;
            if (state.MissionActive && state.RapierMissionAvailable && state.CatapultActive)
                QueueLaunch();
            if (state.MissionActive && !state.PatternOnly && state.RecoveryApproach)
                QueueRecoveryCheckIn();
            if (state.GunRoundsFired > 0) {
                Enqueue(Tactical(
                    "pilot-guns", Player, "PACKAGE",
                    $"{PlayerSpoken}, guns.",
                    "pilot", MissionRadioPriority.Advisory));
                _gunBurstActive = true;
                _lastGunEmploymentAtSeconds = state.TimeSeconds;
            }
            ObserveEvents(state);
        } else {
            if (state.PatternOnly)
                ObservePattern(state, playerLeg);
            else
                ObserveTacticalMission(state);
            ObserveRecovery(state);
            ObserveLso(state);
            ObserveWeaponsAndFuel(state);
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
        _gunRoundsFired = state.GunRoundsFired;
        _gunAmmoRemaining = state.GunAmmoRemaining;
        _missilesRemaining = state.MissilesRemaining;
        _dronesRemaining = state.DronesRemaining;
    }

    void QueueLaunch() {
        Enqueue(Tower(
            "launch-cleared", "LAUNCH", Player,
            $"{PlayerSpoken}, cleared for launch.",
            "launch", MissionRadioPriority.Advisory));
        Enqueue(Tower(
            "pilot-launch-readback", Player, "LAUNCH",
            $"Cleared for launch, {PlayerSpoken}.",
            "pilot", MissionRadioPriority.Routine));
    }

    void ObservePattern(in MissionRadioState state, string playerLeg) {
        if (_catapultActive && !state.CatapultActive) {
            Enqueue(Tower(
                "pilot-airborne", Player, "RAPIER TOWER",
                $"Rapier Tower, {PlayerSpoken}, airborne, joining initial.",
                "pilot", MissionRadioPriority.Routine));
            Enqueue(Tower(
                "tower-join-initial", "RAPIER TOWER", Player,
                $"{PlayerSpoken}, pattern altitude "
                    + $"{RadioPhraseology.AltitudeFeet(2_500)}, report initial. "
                    + "Traffic in the pattern.",
                "tower", MissionRadioPriority.Advisory));
        }
        if (playerLeg.Length > 0 && playerLeg != _playerLeg)
            QueuePlayerLeg(playerLeg, state);

        foreach (CircuitTrafficShip ship in state.Traffic) {
            _trafficLegs.TryGetValue(ship.Callsign, out string? previousLeg);
            if (previousLeg != ship.Leg && ship.Leg is "BASE" or "SHORT_FINAL") {
                string spokenLeg = ship.Leg == "SHORT_FINAL" ? "final" : "base";
                Enqueue(Tower(
                    $"traffic-{CallsignSlug(ship.Callsign)}-{spokenLeg}",
                    NormalizedTrafficCallsign(ship.Callsign), "RAPIER TOWER",
                    $"Rapier Tower, {SpokenTrafficCallsign(ship.Callsign)}, {spokenLeg}.",
                    "traffic", MissionRadioPriority.Routine));
            }
            _trafficLegs[ship.Callsign] = ship.Leg;
        }

        bool final = playerLeg is "SHORT_FINAL" or "WIRE_FINAL";
        bool gearUnsafe = final && !state.GearDownAndLocked;
        if (gearUnsafe && !_gearUnsafeOnFinal) {
            Enqueue(Tower(
                "tower-waveoff-gear", "RAPIER TOWER", Player,
                $"Wave off, wave off. {PlayerSpoken}, gear unsafe.",
                "tower", MissionRadioPriority.Urgent), preempt: true);
        }
    }

    void QueuePlayerLeg(string leg, in MissionRadioState state) {
        switch (leg) {
            case "DEPART":
                Enqueue(Tower(
                    "pilot-depart", Player, "RAPIER TOWER",
                    $"Rapier Tower, {PlayerSpoken}, airborne, climbing pattern altitude.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            case "INITIAL":
                Enqueue(Tower(
                    "pilot-initial", Player, "RAPIER TOWER",
                    $"Rapier Tower, {PlayerSpoken}, initial, full stop.",
                    "pilot", MissionRadioPriority.Routine));
                Enqueue(Tower(
                    "tower-report-break", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, report break.",
                    "tower", MissionRadioPriority.Advisory));
                break;
            case "BREAK":
                Enqueue(Tower(
                    "pilot-break", Player, "RAPIER TOWER",
                    $"{PlayerSpoken}, breaking.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            case "DOWNWIND":
                // The call reports the aircraft, not the checklist: an unsafe gear on downwind
                // is spoken honestly and draws the tower's challenge.
                Enqueue(Tower(
                    "pilot-downwind", Player, "RAPIER TOWER",
                    state.GearDownAndLocked
                        ? $"Rapier Tower, {PlayerSpoken}, downwind, gear down."
                        : $"Rapier Tower, {PlayerSpoken}, downwind.",
                    "pilot", MissionRadioPriority.Routine));
                if (!state.GearDownAndLocked) {
                    Enqueue(Tower(
                        "tower-check-gear-downwind", "RAPIER TOWER", Player,
                        $"{PlayerSpoken}, check gear down.",
                        "tower", MissionRadioPriority.Advisory));
                }
                Enqueue(Tower(
                    "tower-report-base", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, report base.",
                    "tower", MissionRadioPriority.Advisory));
                Enqueue(Tower(
                    "pilot-report-base-readback", Player, "RAPIER TOWER",
                    $"Wilco, {PlayerSpoken}.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            case "BASE":
                Enqueue(Tower(
                    "pilot-base", Player, "RAPIER TOWER",
                    state.GearDownAndLocked
                        ? $"Rapier Tower, {PlayerSpoken}, base, gear down and locked."
                        : $"Rapier Tower, {PlayerSpoken}, base, gear unsafe.",
                    "pilot", MissionRadioPriority.Routine));
                Enqueue(Tower(
                    "tower-cleared-arrested-landing", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, cleared to land. Arresting gear rigged.",
                    "tower", MissionRadioPriority.Advisory));
                Enqueue(Tower(
                    "pilot-landing-readback", Player, "RAPIER TOWER",
                    $"Cleared to land, {PlayerSpoken}.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            case "SHORT_FINAL":
                Enqueue(Tower(
                    "pilot-short-final", Player, "RAPIER TOWER",
                    $"{PlayerSpoken}, short final.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            // WIRE_FINAL is deliberately silent: seconds from the wire the pilot flies, not talks.
        }
    }

    void ObserveTacticalMission(in MissionRadioState state) {
        if (state.RapierMissionAvailable && _catapultActive && !state.CatapultActive) {
            Enqueue(Tower(
                "pilot-departure-airborne", Player, "RAPIER TOWER",
                $"Rapier Tower, {PlayerSpoken}, airborne.",
                "pilot", MissionRadioPriority.Routine));
            Enqueue(Tower(
                "tower-continue-departure", "RAPIER TOWER", Player,
                $"{PlayerSpoken}, continue departure.",
                "tower", MissionRadioPriority.Advisory));
        }
        if (state.RapierPhase == _rapierPhase) return;
        switch (state.RapierPhase) {
            case RapierMissionPhase.Intercept:
                Enqueue(Tactical(
                    "control-commit", "CONTROL", Player,
                    $"{PlayerSpoken}, commit.",
                    "controller", MissionRadioPriority.Advisory));
                Enqueue(Tactical(
                    "pilot-commit-readback", Player, "CONTROL",
                    $"Commit, {PlayerSpoken}.",
                    "pilot", MissionRadioPriority.Routine));
                break;
            case RapierMissionPhase.Escape:
                Enqueue(Tactical(
                    "pilot-separating", Player, "CONTROL",
                    $"{PlayerSpoken}, separating.",
                    "pilot", MissionRadioPriority.Advisory));
                break;
            case RapierMissionPhase.ReturnToBase:
                Enqueue(Tactical(
                    "pilot-rtb", Player, "CONTROL",
                    $"Control, {PlayerSpoken}, returning home plate.",
                    "pilot", MissionRadioPriority.Advisory));
                Enqueue(Tactical(
                    "control-rtb-roger", "CONTROL", Player,
                    $"{PlayerSpoken}, roger.",
                    "controller", MissionRadioPriority.Routine));
                break;
            case RapierMissionPhase.Recovery:
                QueueRecoveryCheckIn();
                break;
        }
    }

    void ObserveRecovery(in MissionRadioState state) {
        if (!_recoveryApproach && state.RecoveryApproach && !state.PatternOnly)
            QueueRecoveryCheckIn();
        if (state.Recovery == Carrier.Recovery.Bolter
            && _recovery != Carrier.Recovery.Bolter) {
            PendingCall bolter = !state.MaritimeRecovery
                ? Tower(
                    "tower-bolter", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, bolter. Go around.",
                    "tower", MissionRadioPriority.Urgent)
                : Approach(
                    "lso-bolter", "PADDLES", Player,
                    "Bolter, bolter.",
                    "lso", MissionRadioPriority.Urgent);
            Enqueue(bolter, preempt: true);
        }
        if (state.ArrestmentPhase == ArrestmentModel.ArrestmentPhase.Stopped
            && _arrestmentPhase != ArrestmentModel.ArrestmentPhase.Stopped) {
            int wire = Math.Clamp(state.CaughtWire, 1, 4);
            PendingCall wireCall = !state.MaritimeRecovery
                ? Tower(
                    $"tower-trap-wire-{wire}", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, wire {RadioPhraseology.DigitGroup(wire.ToString())}, hold position.",
                    "tower", MissionRadioPriority.Advisory)
                : Approach(
                    $"lso-wire-{wire}", "PADDLES", Player,
                    $"Wire {RadioPhraseology.DigitGroup(wire.ToString())}.",
                    "lso", MissionRadioPriority.Advisory);
            Enqueue(wireCall);
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
                "Wave off, wave off.", "lso", MissionRadioPriority.Urgent),
            "ADD POWER NOW" => Approach(
                "lso-add-power", "PADDLES", Player,
                "Add power.", "lso", MissionRadioPriority.Advisory),
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
                "Fast.", "lso", MissionRadioPriority.Advisory),
            "COME LEFT" => Approach(
                "lso-come-left", "PADDLES", Player,
                "Come left.", "lso", MissionRadioPriority.Advisory),
            "COME RIGHT" => Approach(
                "lso-come-right", "PADDLES", Player,
                "Come right.", "lso", MissionRadioPriority.Advisory),
            _ => null,
        };
        if (transmission is not { } selected) return;
        _lastLsoCallAtSeconds = state.TimeSeconds;
        Enqueue(selected, preempt: waveOff);
    }

    void QueueRecoveryCheckIn() {
        Enqueue(Approach(
            "pilot-recovery-request", Player, "RAPIER APPROACH",
            $"Rapier Approach, {PlayerSpoken}, recovery.",
            "pilot", MissionRadioPriority.Routine));
        Enqueue(Approach(
            "approach-recovery-continue", "RAPIER APPROACH", Player,
            $"{PlayerSpoken}, continue.",
            "controller", MissionRadioPriority.Advisory));
    }

    void ObserveWeaponsAndFuel(in MissionRadioState state) {
        int firedDelta = state.GunRoundsFired - _gunRoundsFired;
        if (firedDelta > 0) {
            if (!_gunBurstActive) {
                Enqueue(Tactical(
                    "pilot-guns", Player, "PACKAGE",
                    $"{PlayerSpoken}, guns.",
                    "pilot", MissionRadioPriority.Advisory));
            }
            _gunBurstActive = true;
            _lastGunEmploymentAtSeconds = state.TimeSeconds;
        } else if (_gunBurstActive
            && state.TimeSeconds - _lastGunEmploymentAtSeconds >= 0.40) {
            _gunBurstActive = false;
        }

        if (state.MissilesRemaining < _missilesRemaining && state.MissileInFlight) {
            Enqueue(Tactical(
                "pilot-fox-two", Player, "PACKAGE",
                $"{PlayerSpoken}, Fox Two.",
                "pilot", MissionRadioPriority.Advisory));
        }
        if (state.DronesRemaining < _dronesRemaining) {
            Enqueue(Tactical(
                "pilot-drone-away", Player, "PACKAGE",
                $"{PlayerSpoken}, drone away.",
                "pilot", MissionRadioPriority.Advisory));
        }

        bool hadAirToAirOrdnance = _missilesRemaining + _dronesRemaining > 0;
        bool hasAirToAirOrdnance = state.MissilesRemaining + state.DronesRemaining > 0;
        bool hadAnyOrdnance = hadAirToAirOrdnance || _gunAmmoRemaining > 0;
        bool hasAnyOrdnance = hasAirToAirOrdnance || state.GunAmmoRemaining > 0;
        if (hadAirToAirOrdnance && !hasAirToAirOrdnance && state.GunAmmoRemaining > 0) {
            Enqueue(Tactical(
                "pilot-remington", Player, "PACKAGE",
                $"{PlayerSpoken}, Remington.",
                "pilot", MissionRadioPriority.Advisory));
        }
        if (hadAnyOrdnance && !hasAnyOrdnance) {
            Enqueue(Tactical(
                "pilot-winchester", Player, "PACKAGE",
                $"{PlayerSpoken}, Winchester.",
                "pilot", MissionRadioPriority.Advisory));
        }

        if (!_joker && state.Joker && !state.Bingo) {
            Enqueue(Tactical(
                "pilot-joker", Player, "CONTROL",
                $"{PlayerSpoken}, Joker.",
                "pilot", MissionRadioPriority.Advisory));
        }
        if (!_bingo && state.Bingo) {
            Enqueue(Tactical(
                "pilot-bingo", Player, "CONTROL",
                $"{PlayerSpoken}, Bingo.",
                "pilot", MissionRadioPriority.Urgent), preempt: true);
            Enqueue(Tactical(
                "control-bingo-rtb", "CONTROL", Player,
                $"{PlayerSpoken}, return home plate.",
                "controller", MissionRadioPriority.Urgent));
        }
    }

    void ObserveEvents(in MissionRadioState state) {
        foreach (SessionEvent sessionEvent in state.Events) {
            if (sessionEvent.Sequence <= _lastEventSequence) continue;
            _lastEventSequence = sessionEvent.Sequence;
            if (sessionEvent.Type == SessionEventType.Destroyed
                && sessionEvent.Source == CombatRole.Player
                && sessionEvent.Target == CombatRole.Opponent) {
                Enqueue(Tactical(
                    "pilot-splash", Player, "PACKAGE",
                    $"{PlayerSpoken}, splash one.",
                    "pilot", MissionRadioPriority.Advisory));
            } else if (sessionEvent.Type == SessionEventType.SortieFinished
                && !_missionFinished) {
                _missionFinished = true;
                Enqueue(Tactical(
                    "control-mission-complete", "CONTROL", Player,
                    $"{PlayerSpoken}, mission complete.",
                    "controller", MissionRadioPriority.Advisory));
            }
        }
    }

    void Enqueue(PendingCall call, bool preempt = false) {
        if (_queue.Any(item => item.Id == call.Id)
            || _current.Active && _current.Id == call.Id) return;
        if (preempt) {
            _queue.RemoveAll(item => item.Priority != MissionRadioPriority.Urgent);
            _queue.Insert(0, call);
            if (_current.Active && _current.Priority != MissionRadioPriority.Urgent) {
                _current = MissionRadioTransmission.Silent with { Sequence = _sequence };
                _notBeforeSeconds = 0.0;
            }
        } else if (_queue.Count < 16) {
            _queue.Add(call);
        } else {
            DroppedRoutineCalls += 1;
        }
    }

    /// Routine calls discarded because the queue was saturated. A busy pattern losing calls is a
    /// tuning signal (queue depth, call volume), never a silent event.
    public int DroppedRoutineCalls { get; private set; }

    static PendingCall Tactical(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Tactical, "PACKAGE", TacticalFrequency,
            speaker, callsign, text, voice, priority);

    static PendingCall Tower(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Tower, "RAPIER TOWER", TowerFrequency,
            speaker, callsign, text, voice, priority);

    static PendingCall Approach(
        string id, string speaker, string callsign, string text, string voice,
        MissionRadioPriority priority) => new(
            id, MissionRadioChannel.Approach, "RAPIER APPROACH", ApproachFrequency,
            speaker, callsign, text, voice, priority);

    static double EstimateDurationSeconds(string text) {
        int words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
        return Math.Clamp(0.70 + words / 2.65, 1.35, 6.0);
    }

    static string CallsignSlug(string callsign) =>
        callsign.ToLowerInvariant().Replace(' ', '-');

    static string NormalizedTrafficCallsign(string callsign) => callsign switch {
        "RAPIER 2" => "RAPIER 1-2",
        "RAPIER 3" => "RAPIER 1-3",
        "RAPIER 4" => "RAPIER 1-4",
        _ => callsign,
    };

    static string SpokenTrafficCallsign(string callsign) => callsign switch {
        "RAPIER 2" or "RAPIER 1-2" => "Rapier One Two",
        "RAPIER 3" or "RAPIER 1-3" => "Rapier One Three",
        "RAPIER 4" or "RAPIER 1-4" => "Rapier One Four",
        _ => callsign,
    };
}
