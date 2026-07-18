using System.Runtime.InteropServices.JavaScript;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Web;

/// The JS-facing facade. Deliberately a mirror of bridge/SimBridge.cs (the Godot one): same
/// 120 Hz fixed step, same detent/doctrine wiring, same HUD field names — because the whole
/// point is that BOTH shells drive the identical kernel, so the same scenario run through
/// either must produce the same telemetry. The harness (bin/mission) already emits exactly
/// that artifact, which makes it a conformance suite between desktop and web for free.
///
/// Only rendering, input and HUD are new on this side. The physics is not a port: it is the
/// same compiled C# that passes the desktop suite, running in WebAssembly.
public static partial class WebBridge {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftSim _player = null!;
    static IBandit _bandit = null!;
    static BeatSetup _beat = null!;
    static KeyGrammar _keys = null!;
    static DetentLayer _detents = null!;
    static GunKill _gunKill = null!;
    static FuelModel _fuel = null!;
    static PromptTracker _prompts = null!;
    static PromptCue _cue;
    static DoctrineAdvice _advice = new(1.0, 0.0, "setup");
    static double _acc, _simTimeMs, _lastRange, _closureKts, _closureSmooth;
    static int _shotsTotal, _shotsInWindow;
    static bool _triggerDown;
    static int _beatIndex = 1;
    static bool _knockedOff;
    static Carrier? _carrier;
    // Meta progression intentionally survives StartBeat/restart. The kernel object owns only the
    // deterministic policy; this static shell field owns the pilot's session-long clean-trap count.
    static readonly RecoveryProgress _recoveryProgress = new();
    static RecoveryDifficulty _difficulty = DifficultyModel.ForLevel(0);
    static bool _recoveryAttemptActive;
    static bool _attemptHadSetback;
    static bool _attemptCleanRecorded;
    static Carrier.Recovery _recovery = Carrier.Recovery.Flying;
    static readonly ArrestmentModel _arrestment = new();
    static Carrier.DeckConfiguration _deckConfiguration = Carrier.DeckConfiguration.Axial;
    static bool _waveOffArmed;
    static double _waveOffUntilMs;
    /// The sortie is over: splash, recovery result, sea impact, or knock-it-off. The sim stops
    /// stepping. Before this, a 12G pull from inverted flew THROUGH the sea to -10,679 ft and
    /// kept integrating, because nothing ever checked.
    static bool Frozen => _knockedOff || (_player?.BelowGround ?? false)
        || _recovery is Carrier.Recovery.RampStrike or Carrier.Recovery.InTheWater
        || (_recovery == Carrier.Recovery.Trap
            && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped)
        || _gunKill?.Outcome == FightOutcome.Splash;

    static void FinishPreviousRecoveryAttempt() {
        if (!_recoveryAttemptActive) return;
        // A stopped trap wins the attempt even if the pilot waved off earlier. Otherwise a bolter
        // or wave-off is retained as one setback and eases the next approach.
        if (!_attemptCleanRecorded && _attemptHadSetback)
            _recoveryProgress.RecordSetback();
        _recoveryAttemptActive = false;
    }

    static void RecordStoppedTrap() {
        if (!_recoveryAttemptActive || _attemptCleanRecorded) return;
        _attemptCleanRecorded = true;
        _recoveryProgress.RecordCleanTrap();
    }

    [JSExport]
    public static void StartBeat(int index) {
        FinishPreviousRecoveryAttempt();
        var variant = _detents?.Variant ?? ValleyVariant.DoctrineDeep;
        _beatIndex = index;
        _knockedOff = false;
        _beat = index switch {
            2 => Beats.BreakDefense(), 3 => Beats.Saddle(), 4 => Beats.BalloonStrike(),
            5 => Beats.CarrierApproach(_deckConfiguration), _ => Beats.Perch() };
        _carrier = _beat.Carrier;
        _difficulty = DifficultyModel.ForLevel(0);
        _recoveryAttemptActive = _carrier is not null;
        _attemptHadSetback = false;
        _attemptCleanRecorded = false;
        if (_carrier is not null) {
            _difficulty = _recoveryProgress.BeginAttempt();
            _carrier.ApplyDifficulty(_difficulty);
        }
        _recovery = Carrier.Recovery.Flying;
        _arrestment.Reset();
        _waveOffArmed = _carrier is not null;
        _waveOffUntilMs = double.NegativeInfinity;
        _player = new AircraftSim(_beat.Player, _beat.PlayerAir) {
            // Carrier: SMOOTH air, with the burble ONLY in the ship's wake (the last ~15 s) — the
            // whole sky was "the shittiest bumpiest day possible"; the wake is the tail generator,
            // not weather. Other beats: a light steady chop. Tunable by feel.
            Wind = _beat.Carrier is not null
                // The wake is a CHALLENGE, not a cliff: enough chop + sink to make you work the last
                // 10 s, not enough to kill a low approach outright (it "died the VV and crashed").
                ? new BurbleField(_beat.Carrier,
                      new TurbulenceField(intensityMps: _difficulty.BurbleIntensityMps,
                          outerScaleM: 80.0, intermittency: 0.6, seed: _difficulty.TurbulenceSeed),
                      sinkMps: _difficulty.BurbleSinkMps)
                : new TurbulenceField(intensityMps: 1.2, outerScaleM: 130.0, intermittency: 0.5, seed: 0xB0A7)
        };
        _bandit = _beat.CreateBandit();
        _gunKill = new GunKill();
        _fuel = new FuelModel();
        _keys = new KeyGrammar();
        // On the carrier beat, OUT of the slot is free flight — the pull must reach the aero limit,
        // not the ApproachLaw's 1 G doctrine valley (which strangled fight-logic pitch: firewall+pull
        // dove into the sea). PhysicsOnly = pull to max-perform. In the slot, ApproachMode overrides.
        _detents = new DetentLayer {
            Variant = _beat.Carrier is not null ? ValleyVariant.PhysicsOnly : variant,
            ApproachMode = _beat.Carrier is not null
        };
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _acc = 0; _shotsTotal = 0; _shotsInWindow = 0;
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = 0; _closureSmooth = 0;
        // _simTimeMs deliberately NOT reset: one monotonic clock for grammar timestamps.
    }

    [JSExport] public static void FeedKey(int gkey, bool pressed) {
        _keys.Feed((GKey)gkey, pressed, _simTimeMs);
        if (gkey == (int)GKey.Trigger) Trigger(pressed);
        if (!pressed) return;
        // The Godot shell routes these through InputAdapter signals; the web shell had no
        // equivalent, so both keys were inert while the legend claimed otherwise.
        if (gkey == (int)GKey.Restart) StartBeat(_beatIndex);
        else if (gkey == (int)GKey.KnockItOff) _knockedOff = true;
    }

    static void Trigger(bool down) {
        if (down && !_triggerDown) {
            _shotsTotal++;
            if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++;
        }
        _triggerDown = down;
    }

    [JSExport] public static void SetVariant(int v) => _detents.Variant = v == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep;
    [JSExport] public static int GetVariant() => _detents.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;
    [JSExport] public static int GetCleanTrapCount() => _recoveryProgress.CleanTrapCount;
    [JSExport] public static int GetDeckConfiguration() =>
        _deckConfiguration == Carrier.DeckConfiguration.Angled ? 1 : 0;
    [JSExport] public static void SetDeckConfiguration(int value) {
        _deckConfiguration = value == 1
            ? Carrier.DeckConfiguration.Angled
            : Carrier.DeckConfiguration.Axial;
        if (_beatIndex == 5) StartBeat(5);
    }
    [JSExport] public static void ToggleDeckConfiguration() =>
        SetDeckConfiguration(GetDeckConfiguration() == 0 ? 1 : 0);

    /// Advance by real elapsed seconds; the kernel is stepped at a fixed 120 Hz internally.
    /// Catch-up is capped exactly as the Godot bridge caps it — a backgrounded tab must not
    /// replay minutes of sim on return.
    [JSExport]
    public static void Advance(double deltaSeconds) {
        if (Frozen) { _acc = 0; return; }
        _acc = Math.Min(_acc + deltaSeconds, 0.25);
        while (_acc >= Dt) {
            // Once the hook is in a wire, flight physics is finished. Keep translating the ship and
            // advance only the deterministic, deck-relative arrestment until it reaches zero speed.
            if (_carrier is not null
                && _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested) {
                _carrier.Step(Dt);
                _arrestment.Step(_carrier, Dt);
                _simTimeMs += Dt * 1000.0;
                _acc -= Dt;
                if (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) {
                    RecordStoppedTrap();
                    break;
                }
                continue;
            }
            // Approach law engages ONLY in the slot AND when you haven't firewalled to go around;
            // leave the groove or slam the throttle and the detent snaps to fight logic. Also feed the
            // SPATIAL glideslope height error (below the line to the wires) so power recaptures the path.
            if (_carrier is not null) {
                bool inSlot = _carrier.InApproachSlot(_player.State);
                _detents.ApproachMode = inSlot && _detents.Throttle < 0.95;
                if (_detents.ApproachMode) _waveOffArmed = true;
                else if (!inSlot && _detents.Throttle < 0.95) _waveOffArmed = false;
                var (gsAlong, _, gsHeight) = _carrier.LandingFrame(_player.State.Position);
                double gsLineH = Math.Max(0.0, -_carrier.DeckLengthM * 0.2 - gsAlong) * 0.06116;   // tan 3.5°
                _detents.GlideslopeErrorM = gsLineH - gsHeight;
            }
            _advice = _beat.Law.Advise(_player.State, _bandit.State, _beat.PlayerAir);
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir, _advice, Dt);
            if (_waveOffArmed && _detents.Throttle >= 0.95) {
                _waveOffUntilMs = _simTimeMs + 5000.0;
                _waveOffArmed = false;
                if (_recoveryAttemptActive) _attemptHadSetback = true;
            }
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            // GunKill samples both aircraft at the beginning of the fixed tick. Its continuous
            // round/target intersection then covers this exact dt before either aircraft advances.
            _gunKill.Step(_triggerDown, _player.State, _bandit.State, Dt);
            if (_gunKill.Outcome == FightOutcome.Splash) break;     // freeze at the real impact
            _player.Step(_detents.Command, Dt);
            _fuel.Step(Dt, _detents.Throttle, _player.ThrustFraction);
            if (_gunKill.BanditAlive) _bandit.Step(_player.State, Dt);
            if (_carrier is not null) {
                _carrier.Step(Dt);
                Carrier.Recovery contact = _carrier.Classify(_player.State, _difficulty);
                if (contact == Carrier.Recovery.Bolter) {
                    _attemptHadSetback = true;
                    _recovery = Carrier.Recovery.Bolter;
                } else if (_recovery == Carrier.Recovery.Bolter) {
                    // A rejected contact stays a bolter for the rest of the pass; it cannot become
                    // a trap on a later physics tick. Still allow a subsequent impact to terminate.
                    if (contact is Carrier.Recovery.RampStrike or Carrier.Recovery.InTheWater)
                        _recovery = contact;
                } else {
                    _recovery = contact;
                }
                if (_recovery == Carrier.Recovery.Trap) {
                    _arrestment.Engage(_carrier, _player.State, _player.BodyPitchRad);
                    _detents.ApproachMode = false;
                    if (_arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped)
                        RecordStoppedTrap();
                }
            }
            double rng = Geometry.Range(_player.State, _bandit.State);
            _closureKts = (_lastRange - rng) / Dt * 1.94384;
            _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
            _lastRange = rng;
            _simTimeMs += Dt * 1000.0;
            _acc -= Dt;
            if (_recovery is Carrier.Recovery.RampStrike or Carrier.Recovery.InTheWater) break;
        }
    }

    /// One flat state blob per frame. Sim frame is X=east, Y=up, Z=north; the JS side flips Z
    /// for three.js exactly as the Godot bridge does (Godot forward = -Z), so both shells put
    /// the world in the same handedness and a roll reads the same way in both.
    [JSExport]
    public static string GetState() {
        var s = _player.State;
        var b = _bandit.State;
        bool arrested = _arrestment.IsActive;
        Vec3D simulationPosition = arrested ? _arrestment.Position : s.Position;
        Vec3D playerPosition = simulationPosition;
        double displayedSpeedMps = arrested ? _arrestment.RelativeSpeedMps : s.Speed;
        bool waveOff = _carrier is not null && _simTimeMs < _waveOffUntilMs;
        string mode = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested ? "ARRESTED"
            : _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped ? "STOPPED"
            : waveOff ? "WAVE-OFF" : _detents.ApproachMode ? "APPROACH" : "FREE";
        string context = _advice.Context;
        string lsoJson = "";
        if (_carrier is not null && !arrested) {
            var lso = Lso.AdviseForMode(_carrier, s, _player.AngleOfAttackRad,
                DetentLayer.OnSpeedAoARad, mode == "APPROACH", waveOff);
            context = lso?.Call ?? Lso.FreeFlightCall;
            if (lso is { } paddles) {
                string severity = paddles.Severity switch {
                    LsoSeverity.OnBall => "ON_BALL",
                    LsoSeverity.Correcting => "CORRECTING",
                    _ => "WAVEOFF"
                };
                lsoJson = $"\"lso\":\"{paddles.Call}\",\"lso_severity\":\"{severity}\",";
            }
        }
        var bl = _bandit.LiftDir; var bf = b.ForwardDir();
        // Render the player from the integrated rigid-body attitude. The velocity vector remains
        // separate (aoa_deg/beta_deg below), so waterline-to-FPM separation is now physical.
        Vec3D pf, pl;
        _player.BodyFrame(out pf, out pl);
        double displayPitchRad = _player.BodyPitchRad;
        double displayBankRad = _player.BodyRollRad;
        double displayHeadingRad = _player.BodyYawRad;
        double displayGammaRad = s.Gamma;
        if (arrested && _carrier is not null) {
            displayPitchRad = _arrestment.NosePitchRad;
            displayBankRad = 0.0;
            displayHeadingRad = _carrier.LandingHeadingRad;
            displayGammaRad = 0.0;
            double cosPitch = Math.Cos(displayPitchRad);
            double sinPitch = Math.Sin(displayPitchRad);
            pf = _carrier.LandingFwd * cosPitch + new Vec3D(0, sinPitch, 0);
            pl = _carrier.LandingFwd * -sinPitch + new Vec3D(0, cosPitch, 0);
            context = _arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped
                ? "TRAPPED — STOPPED"
                : $"TRAP · WIRE {_arrestment.CaughtWire}";
        }
        // hand-built JSON: no serializer, no reflection, trim-safe, allocation-cheap.
        return "{"
            + $"\"t\":{_simTimeMs / 1000.0:F4},"
            + $"\"px\":{playerPosition.X:F3},\"py\":{playerPosition.Y:F3},\"pz\":{playerPosition.Z:F3},"
            + $"\"pfx\":{pf.X:F5},\"pfy\":{pf.Y:F5},\"pfz\":{pf.Z:F5},"
            + $"\"plx\":{pl.X:F5},\"ply\":{pl.Y:F5},\"plz\":{pl.Z:F5},"
            + $"\"bx\":{b.Position.X:F3},\"by\":{b.Position.Y:F3},\"bz\":{b.Position.Z:F3},"
            + $"\"bfx\":{bf.X:F5},\"bfy\":{bf.Y:F5},\"bfz\":{bf.Z:F5},"
            + $"\"blx\":{bl.X:F5},\"bly\":{bl.Y:F5},\"blz\":{bl.Z:F5},"
            + $"\"buffet_pitch_deg\":{_player.PitchBuffetRad * 57.2958:F3},\"buffet_roll_deg\":{_player.RollBuffetRad * 57.2958:F3},\"buffet_yaw_deg\":{_player.YawBuffetRad * 57.2958:F3},"
            + $"\"speed_kts\":{displayedSpeedMps * 1.94384:F2},\"alt_ft\":{playerPosition.Y * 3.28084:F1},"
            + $"\"g_actual\":{_player.LastNz:F3},\"g_cmd\":{_detents.Command.GDemand:F3},"
            + $"\"g_valley\":{_detents.ValleyG:F3},"
            + $"\"g_maxperform\":{Protection.MaxPerformG(s, _beat.PlayerAir):F3},"
            + $"\"g_hardmax\":{Protection.HardMaxG(s, _beat.PlayerAir):F3},"
            + $"\"sustained\":{Protection.SustainedG(s, _beat.PlayerAir):F3},"
            + $"\"sticky\":{_detents.StickyOffsetG:F2},\"tier\":{(int)_detents.Tier},"
            + $"\"variant\":{GetVariant()},\"buffet\":{(_player.Buffet ? "true" : "false")},"
            + $"\"prompt\":{(int)_cue},"
            + $"\"pitch_deg\":{displayPitchRad * 57.2958:F2},\"bank_deg\":{displayBankRad * 57.2958:F2},"
            + $"\"aoa_deg\":{_player.AngleOfAttackRad * 57.2958:F2},\"beta_deg\":{_player.SideslipRad * 57.2958:F2},\"gamma_deg\":{displayGammaRad * 57.2958:F2},"
            + $"\"heading_deg\":{((displayHeadingRad * 57.2958) % 360 + 360) % 360:F2},"
            + $"\"roll_rate_dps\":{s.BodyRates.P * 57.2958:F2},\"pitch_rate_dps\":{s.BodyRates.Q * 57.2958:F2},\"yaw_rate_dps\":{s.BodyRates.R * 57.2958:F2},"
            + $"\"angle_off_deg\":{Geometry.AngleOff(s, b) * 57.2958:F2},"
            + $"\"range_m\":{Geometry.Range(s, b):F1},\"closure_kts\":{_closureKts:F1},"
            + $"\"gun_window\":{(CameraSolver.GunWindow(s, b) ? "true" : "false")},"
            + $"\"gun_solution\":{(_gunKill.GunSolution ? "true" : "false")},"
            + $"\"lead_valid\":{(_gunKill.HasLeadSolution ? "true" : "false")},"
            + $"\"lead_x\":{_gunKill.LeadPipper.X:F3},\"lead_y\":{_gunKill.LeadPipper.Y:F3},\"lead_z\":{_gunKill.LeadPipper.Z:F3},"
            + $"\"lead_tof\":{_gunKill.LeadTimeOfFlight:F4},\"ammo\":{_gunKill.AmmoRemaining},"
            + $"\"rounds_fired\":{_gunKill.RoundsFired},\"hits\":{_gunKill.HitCount},"
            + $"\"hit\":{(_gunKill.HitThisStep ? "true" : "false")},"
            + $"\"gun_firing\":{(_triggerDown && _gunKill.AmmoRemaining > 0 && _gunKill.BanditAlive ? "true" : "false")},"
            + TracerJson()
            + $"\"kill_progress\":{_gunKill.KillProgress:F3},\"bandit_health\":{_gunKill.BanditHealth:F3},"
            + $"\"fight\":\"{_gunKill.Outcome}\",\"bandit_alive\":{(_gunKill.BanditAlive ? "true" : "false")},"
            + $"\"below_ground\":{(_player.BelowGround ? "true" : "false")},"
            + $"\"knocked_off\":{(_knockedOff ? "true" : "false")},"
            + $"\"frozen\":{(Frozen ? "true" : "false")},"
            + $"\"below_deck\":{(_player.BelowHardDeck ? "true" : "false")},"
            + $"\"shots_total\":{_shotsTotal},\"shots_in_window\":{_shotsInWindow},"
            + $"\"throttle\":{_detents.Throttle:F3},\"engine\":{_player.ThrustFraction:F3},"
            + $"\"fuel_lb\":{_fuel.FuelLb:F2},\"fuel_burn_lb_min\":{_fuel.BurnLbPerMinute:F2},"
            + $"\"fuel_trend_lb_min\":{_fuel.FuelTrendLbPerMinute:F2},"
            + $"\"fuel_capacity_lb\":{FuelModel.DefaultFuelLb:F1},\"fuel_bingo_lb\":{FuelModel.BingoFuelLb:F1},"
            + $"\"fuel_bingo\":{(_fuel.IsBingo ? "true" : "false")},"
            + $"\"approach\":{(_detents.ApproachMode ? "true" : "false")},"
            + $"\"mode\":\"{mode}\",\"wave_off\":{(waveOff ? "true" : "false")},"
            + lsoJson
            + CarrierJson(simulationPosition)
            + $"\"context\":\"{context}\",\"beat\":\"{_beat.Name}\""
            + "}";
    }

    // Flat numeric arrays keep the web side's hot path compact: [x,y,z,vx,vy,vz]. The gun's
    // lifetime/cadence naturally caps this below 40, but the explicit cap protects the render
    // contract if either tuning value changes later.
    static string TracerJson() {
        const int MaxRenderedTracers = 48;
        var rounds = _gunKill.RoundsInFlight;
        int first = Math.Max(0, rounds.Count - MaxRenderedTracers);
        var json = new System.Text.StringBuilder(32 + (rounds.Count - first) * 72);
        json.Append("\"tracers\":[");
        for (int i = first; i < rounds.Count; i++) {
            if (i != first) json.Append(',');
            var round = rounds[i];
            json.AppendFormat(System.Globalization.CultureInfo.InvariantCulture,
                "[{0:F3},{1:F3},{2:F3},{3:F3},{4:F3},{5:F3}]",
                round.Position.X, round.Position.Y, round.Position.Z,
                round.Velocity.X, round.Velocity.Y, round.Velocity.Z);
        }
        json.Append("],");
        return json.ToString();
    }

    // Carrier fields for the web to render the deck + resolve the aircraft against it + show the
    // trap/miss banner. Empty when the beat has no carrier.
    static string CarrierJson(in Vec3D playerPosition) {
        if (_carrier is null) return "";
        var c = _carrier;
        var (along, cross, height) = c.LandingFrame(playerPosition);
        string config = c.Configuration == Carrier.DeckConfiguration.Angled ? "ANGLED" : "AXIAL";
        string arrestPhase = _arrestment.Phase switch {
            ArrestmentModel.ArrestmentPhase.Arrested => "ARRESTED",
            ArrestmentModel.ArrestmentPhase.Stopped => "STOPPED",
            _ => "NONE"
        };
        return $"\"carrier\":true,"
            + $"\"cx\":{c.Position.X:F2},\"cy\":{c.Position.Y:F2},\"cz\":{c.Position.Z:F2},"
            + $"\"cheading\":{c.HeadingRad:F5},\"deck_len\":{c.DeckLengthM:F1},\"deck_w\":{c.DeckHalfWidthM * 2:F1},\"deck_alt\":{c.DeckAltM:F1},"
            + $"\"landing_heading\":{c.LandingHeadingRad:F5},\"deck_config\":\"{config}\","
            // LandingFrame h=0 is the recovery contact plane; put the aim diamond there too.
            + $"\"tx\":{c.TouchdownPoint.X:F2},\"ty\":{c.TouchdownPoint.Y:F2},\"tz\":{c.TouchdownPoint.Z:F2},"
            + $"\"deck_along\":{along:F1},\"deck_cross\":{cross:F1},\"deck_height\":{height:F1},"
            + $"\"difficulty_level\":{_difficulty.Level},\"difficulty_baseline\":{_difficulty.SkillBaselineLevel},"
            + $"\"difficulty_floor\":{_difficulty.FloorLevel},\"difficulty_attempt\":{_difficulty.AttemptIndex + 1},"
            + $"\"difficulty_variation\":{_difficulty.Variation},\"difficulty_label\":\"{_difficulty.Label}\","
            + $"\"difficulty_eased\":{(_difficulty.IsEased ? "true" : "false")},"
            + $"\"difficulty_spike\":{(_difficulty.IsSpike ? "true" : "false")},\"clean_traps\":{_recoveryProgress.CleanTrapCount},"
            + $"\"deck_pitch_deg\":{c.DeckPitchRad * 57.2958:F3},\"deck_heave_m\":{c.DeckHeaveM:F3},"
            + $"\"recovery\":\"{_recovery}\",\"wire\":{_arrestment.CaughtWire},"
            + $"\"arrest_phase\":\"{arrestPhase}\",\"arrest_speed_kts\":{_arrestment.RelativeSpeedMps * 1.94384:F2},"
            + $"\"arrest_time_s\":{_arrestment.ElapsedSeconds:F3},\"arrest_distance_m\":{_arrestment.DistanceM:F2},";
    }
}
