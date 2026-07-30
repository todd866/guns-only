using System.Globalization;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public enum MissionRadioPriority { Routine = 0, Advisory = 1, Urgent = 2 }

public enum MissionRadioChannel { Tactical = 0, Tower = 1, Approach = 2, Guard = 3 }

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
/// authoritative simulation state. Brevity words are attached to the event they actually mean:
/// GUNS to gun employment, FOX TWO to an IR missile launch, SPLASH to destruction, and fuel calls
/// only at the configured JOKER/BINGO thresholds.
/// </summary>
public sealed class MissionRadioDirector {
    const string Player = "GHOST 11";
    const string PlayerSpoken = "Ghost One One";
    const string TowerFrequency = "305.500 UHF";
    const string ApproachFrequency = "281.800 UHF";
    const string TacticalFrequency = "251.000 UHF";

    readonly List<PendingCall> _queue = [];
    readonly Dictionary<string, string> _trafficLegs = [];
    readonly Dictionary<string, int> _trafficLaps = [];
    MissionRadioTransmission _current = MissionRadioTransmission.Silent;
    string _playerLeg = "";
    bool _initialized;
    bool _catapultActive;
    bool _gearUnsafeOnFinal;
    bool _joker;
    bool _bingo;
    bool _gunBurstActive;
    bool _gunsCalledThisEngagement;
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
    double _lastAmbientTrafficAtSeconds = double.NegativeInfinity;
    string _lsoCall = "";
    double _notBeforeSeconds;
    long _sequence;
    bool _launchClearanceComplete;

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
        double ExpiresAtSeconds);

    /// <summary>
    /// True once the current launch clearance and its readback have both completed. The physical
    /// launcher consumes this edge; presentation settings never affect launch sequencing.
    /// </summary>
    public bool LaunchClearanceComplete => _launchClearanceComplete;

    public void Reset() {
        _queue.Clear();
        _trafficLegs.Clear();
        _trafficLaps.Clear();
        _current = MissionRadioTransmission.Silent;
        _playerLeg = "";
        _initialized = false;
        _catapultActive = false;
        _gearUnsafeOnFinal = false;
        _joker = false;
        _bingo = false;
        _gunBurstActive = false;
        _gunsCalledThisEngagement = false;
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
        _lastAmbientTrafficAtSeconds = double.NegativeInfinity;
        _lsoCall = "";
        _notBeforeSeconds = 0.0;
        _sequence = 0;
        _launchClearanceComplete = false;
        DroppedRoutineCalls = 0;
    }

    public MissionRadioTransmission Step(in MissionRadioState state) {
        Observe(state);

        if (_current.Active && state.TimeSeconds < _current.EndsAtSeconds)
            return _current;
        if (_current.Active) {
            if (_current.Id == "pilot-launch-readback")
                _launchClearanceComplete = true;
            // Replies should feel like replies. Longer natural silence comes from authoring fewer
            // calls, not padding every exchange until its operational moment has passed.
            double gap = 0.28 + 0.32 * GapFraction(_sequence);
            _notBeforeSeconds = Math.Max(_notBeforeSeconds, _current.EndsAtSeconds + gap);
            _current = _current with { Active = false };
        }
        double nowSeconds = state.TimeSeconds;
        _queue.RemoveAll(call => nowSeconds > call.ExpiresAtSeconds);
        if (_queue.Count == 0)
            return _current;

        PendingCall next = _queue[0];
        // Aviate hold + inter-call gap: do not key the mic until both are satisfied.
        if (state.TimeSeconds < _notBeforeSeconds
            || state.TimeSeconds < next.EarliestAtSeconds)
            return _current;

        _queue.RemoveAt(0);
        // Measured clip length wins over the word-count estimate: the browser hard-stops any
        // playing clip when the next sequence starts, so an underestimate truncates speech.
        double duration = MissionRadioClipDurations.TryGet(next.Id, out double measured)
            ? measured + 0.12
            : EstimateDurationSeconds(next.Text);
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
                QueueLaunch(state);
            if (state.MissionActive && !state.PatternOnly && state.RecoveryApproach)
                QueueRecoveryCheckIn(state);
            // Airborne attach may init already in Intercept (DirectJoin / LevelDash). The rising
            // edge in ObserveTacticalMission never fires on tick 0, so voice COMMIT once here.
            if (state.MissionActive && state.RapierMissionAvailable && !state.CatapultActive
                && !state.PatternOnly
                && state.RapierPhase == RapierMissionPhase.Intercept) {
                Enqueue(state, Tactical(
                    "pilot-check-in", Player, "CONTROL",
                    $"Control, {PlayerSpoken}, up as fragged.",
                    "pilot", MissionRadioPriority.Routine));
                Enqueue(state, Tactical(
                    "control-radar-contact", "CONTROL", Player,
                    $"{PlayerSpoken}, radar contact.",
                    "controller", MissionRadioPriority.Routine));
                Enqueue(state, Tactical(
                    "control-commit", "CONTROL", Player,
                    $"{PlayerSpoken}, hostile. You are ordered to engage.",
                    "controller", MissionRadioPriority.Advisory));
            }
            // Gun employment before the director existed is not a package call — see
            // ObserveWeaponsAndFuel. Classic dogfight / mid-burst attach stays silent.
            if (state.GunRoundsFired > 0) {
                _gunBurstActive = true;
                _lastGunEmploymentAtSeconds = state.TimeSeconds;
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
        _gunRoundsFired = state.GunRoundsFired;
        _gunAmmoRemaining = state.GunAmmoRemaining;
        _missilesRemaining = state.MissilesRemaining;
        _dronesRemaining = state.DronesRemaining;
    }

    void QueueLaunch(in MissionRadioState state) {
        _launchClearanceComplete = false;
        // Pre-stroke clearance: talk first, then aviate the shot (hold 0). A CLEARANCE is
        // the one transaction that earns a reply (AIM 4-4-7's model is operative item +
        // callsign) — same compressed house form as the landing take, "Land Ghost One One."
        Enqueue(state, Tower(
            "launch-cleared", "LAUNCH", Player,
            $"{PlayerSpoken}, cleared for launch.",
            "launch", MissionRadioPriority.Advisory));
        Enqueue(state, Tower(
            "pilot-launch-readback", Player, "LAUNCH",
            $"Launch {PlayerSpoken}.",
            "pilot", MissionRadioPriority.Routine));
    }

    void ObservePattern(in MissionRadioState state, string playerLeg) {
        if (playerLeg.Length > 0 && playerLeg != _playerLeg)
            QueuePlayerLeg(playerLeg, state);

        foreach (CircuitTrafficShip ship in state.Traffic) {
            _trafficLegs.TryGetValue(ship.Callsign, out string? previousLeg);
            if (previousLeg != ship.Leg && ship.Leg == "BASE"
                && state.TimeSeconds - _lastAmbientTrafficAtSeconds >= 45.0) {
                // Alternate phrasings lap to lap: full station call on the first circuit,
                // abbreviated on the next, like a real pattern settling into its rhythm.
                // The lap parity picks the catalog ID, so every text stays a recorded clip.
                _trafficLaps[ship.Callsign] =
                    _trafficLaps.GetValueOrDefault(ship.Callsign) + 1;
                bool abbreviated = _trafficLaps.GetValueOrDefault(ship.Callsign) % 2 == 0;
                string id = $"traffic-{CallsignSlug(ship.Callsign)}-base"
                    + (abbreviated ? "-alt" : "");
                string text = abbreviated
                    ? $"Tower, {SpokenTrafficCallsign(ship.Callsign)}, base, 3 greens."
                    : $"Rapier Tower, {SpokenTrafficCallsign(ship.Callsign)}, base.";
                Enqueue(state, Tower(
                    id, NormalizedTrafficCallsign(ship.Callsign), "RAPIER TOWER",
                    text, TrafficVoice(ship.Callsign), MissionRadioPriority.Routine));
                _lastAmbientTrafficAtSeconds = state.TimeSeconds;
            }
            _trafficLegs[ship.Callsign] = ship.Leg;
        }

        bool final = playerLeg is "SHORT_FINAL" or "WIRE_FINAL";
        bool gearUnsafe = final && !state.GearDownAndLocked;
        if (gearUnsafe && !_gearUnsafeOnFinal) {
            Enqueue(state, Tower(
                "tower-waveoff-gear", "RAPIER TOWER", Player,
                $"{PlayerSpoken}, go around. Gear unsafe.",
                "tower", MissionRadioPriority.Urgent), preempt: true);
        }
    }

    void QueuePlayerLeg(string leg, in MissionRadioState state) {
        switch (leg) {
            case "DEPART":
                // Airborne + tower join already covered the climb-out; DEPART is silent.
                break;
            case "INITIAL":
                // Initial announces itself; no "report break" prompt — BREAK will speak.
                Enqueue(state, Tower(
                    "pilot-initial", Player, "RAPIER TOWER",
                    $"{PlayerSpoken}, initial.",
                    "pilot", MissionRadioPriority.Routine));
                Enqueue(state, Tower(
                    "tower-break-approved", "RAPIER TOWER", Player,
                    $"{PlayerSpoken}, left break approved.",
                    "tower", MissionRadioPriority.Advisory));
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
                    Enqueue(state, Tower(
                        "tower-cleared-arrested-landing", "RAPIER TOWER", Player,
                        $"{PlayerSpoken}, cable indicates up, cleared to land.",
                        "tower", MissionRadioPriority.Advisory));
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
            Enqueue(state, Tactical(
                "pilot-check-in", Player, "CONTROL",
                $"Control, {PlayerSpoken}, up as fragged.",
                "pilot", MissionRadioPriority.Routine));
            Enqueue(state, Tactical(
                "control-radar-contact", "CONTROL", Player,
                $"{PlayerSpoken}, radar contact.",
                "controller", MissionRadioPriority.Routine));
        }
        if (state.RapierPhase == _rapierPhase) return;
        // A fresh Intercept engagement may voice one GUNS; later bursts stay silent.
        if (state.RapierPhase == RapierMissionPhase.Intercept)
            _gunsCalledThisEngagement = false;
        switch (state.RapierPhase) {
            case RapierMissionPhase.Intercept:
                Enqueue(state, Tactical(
                    "control-commit", "CONTROL", Player,
                    $"{PlayerSpoken}, hostile. You are ordered to engage.",
                    "controller", MissionRadioPriority.Advisory));
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
                "Waveoff.", "lso", MissionRadioPriority.Urgent),
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
        Enqueue(state, Approach(
            "pilot-recovery-request", Player, "RAPIER APPROACH",
            $"Rapier Approach, {PlayerSpoken}, inbound, request recovery.",
            "pilot", MissionRadioPriority.Routine));
        Enqueue(state, Approach(
            "approach-recovery-continue", "RAPIER APPROACH", Player,
            $"{PlayerSpoken}, continue.",
            "controller", MissionRadioPriority.Advisory));
    }

    void ObserveWeaponsAndFuel(in MissionRadioState state) {
        int firedDelta = state.GunRoundsFired - _gunRoundsFired;
        if (firedDelta > 0) {
            // GUNS is package deconfliction, not a trigger FX. Classic guns-only dogfight has
            // no package — every squeeze would just narrate the game. On Rapier Intercept,
            // voice it once per engagement so wing SA exists without machine-gunning the clip.
            if (PackageGunsContext(state) && !_gunsCalledThisEngagement && !_gunBurstActive) {
                _gunsCalledThisEngagement = true;
                Enqueue(state, Tactical(
                    "pilot-guns", Player, "PACKAGE",
                    "Guns.",
                    "pilot", MissionRadioPriority.Advisory), preempt: true);
            }
            _gunBurstActive = true;
            _lastGunEmploymentAtSeconds = state.TimeSeconds;
        } else if (_gunBurstActive
            && state.TimeSeconds - _lastGunEmploymentAtSeconds >= 0.40) {
            _gunBurstActive = false;
        }

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
            Enqueue(state, Tactical(
                "pilot-bingo", Player, "CONTROL",
                $"{PlayerSpoken}, Bingo.",
                "pilot", MissionRadioPriority.Urgent), preempt: true);
            Enqueue(state, Tactical(
                "control-bingo-rtb", "CONTROL", Player,
                $"{PlayerSpoken}, RTB.",
                "controller", MissionRadioPriority.Urgent));
        }
    }

    /// <summary>
    /// Package GUNS only when a Rapier tactical Intercept is live. Pattern school and the
    /// classic guns-only dogfight stay silent on the trigger.
    /// </summary>
    static bool PackageGunsContext(in MissionRadioState state) =>
        PackageAudience(state) && state.RapierPhase == RapierMissionPhase.Intercept;

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
                    Enqueue(state, Tactical(
                        "control-confirm-safe", "CONTROL", Player,
                        $"{PlayerSpoken}, confirm weapons safe.",
                        "controller", MissionRadioPriority.Advisory));
                    Enqueue(state, Tactical(
                        "pilot-switch-safe", Player, "CONTROL",
                        $"{PlayerSpoken}, switch is safe.",
                        "pilot", MissionRadioPriority.Routine));
                }
            }
        }
    }

    /// Checklist state belongs on ANCA. Speaking it would make radio a narration layer, so the
    /// one-tick completion tokens deliberately stay off-air.
    void ObserveChecklists(in MissionRadioState state) {
        _ = state;
    }

    void Enqueue(in MissionRadioState state, PendingCall call, bool preempt = false) {
        if (_queue.Any(item => item.Id == call.Id)
            || _current.Active && _current.Id == call.Id) return;

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

    /// <summary>
    /// Seconds to wait after the triggering event before this call may key the mic.
    /// Urgent and pre-stroke clearance are near-immediate; pilot/package waits for aviate.
    /// </summary>
    static double AviateHoldSeconds(in PendingCall call) {
        if (call.Priority == MissionRadioPriority.Urgent) return 0.10;
        // Clearance before the catapult stroke: talk, then aviate the shot.
        if (call.Id == "launch-cleared") return 0.0;
        // LSO is flying the pass with the pilot — short, not chatty.
        if (call.Voice == "lso") return 0.15;
        // Machine-keyed tactical calls should land on the event, with only a human-scale beat.
        if (call.Channel == MissionRadioChannel.Tactical) return 0.25;
        if (call.Voice is "pilot" or "controller") return 0.45;
        return 0.30;
    }

    static double StaleAfterSeconds(in PendingCall call) {
        if (call.Id is "launch-cleared" or "pilot-launch-readback") return 30.0;
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

    static string ShortTrafficCallsign(string callsign) => callsign switch {
        "RAPIER 2" or "GHOST 12" => "One Two",
        "RAPIER 3" or "GHOST 13" => "One Three",
        "RAPIER 4" or "GHOST 14" => "One Four",
        _ => callsign,
    };

    static string TrafficVoice(string callsign) => callsign switch {
        "RAPIER 2" or "RAPIER 1-2" => "traffic-two",
        "RAPIER 3" or "RAPIER 1-3" => "traffic-three",
        "RAPIER 4" or "RAPIER 1-4" => "traffic-four",
        _ => "traffic",
    };
}
