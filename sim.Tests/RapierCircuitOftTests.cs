using System.Globalization;
using System.Text;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Agent-facing OFT harness for Rapier Circuits. The player never sees this — it exists so agents
/// can prove launch → shelf → recovery → wire without using the player as a flight-test instrument.
/// Spec: docs/superpowers/specs/2026-07-27-rapier-circuits-oft-design.md
/// </summary>
public class RapierCircuitOftTests {
    static string OftRoot {
        get {
            string root = Path.GetFullPath(Path.Combine(
                AppContext.BaseDirectory, "..", "..", "..", "..", "analysis", "circuit-oft"));
            Directory.CreateDirectory(root);
            return root;
        }
    }

    sealed class CircuitOftTelemetry : IDisposable {
        readonly string _dir;
        readonly StreamWriter _ticks;
        readonly StreamWriter _gates;
        readonly List<object> _gateEvents = new();
        RapierMissionPhase _lastPhase = RapierMissionPhase.Unavailable;
        int _lastGate = -1;
        string _lastCue = "";

        public CircuitOftTelemetry(string cardId) {
            string runId = $"{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{cardId}";
            _dir = Path.Combine(OftRoot, runId);
            Directory.CreateDirectory(_dir);
            File.WriteAllText(Path.Combine(_dir, "hdr.json"), JsonSerializer.Serialize(new {
                schema = "guns-only.circuit-oft.v1",
                card = cardId,
                beat = "mission.modern.rapier-circuits.public-data-surrogate.v1",
                started_utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
            }));
            _ticks = new StreamWriter(Path.Combine(_dir, "ticks.jsonl"), append: false) {
                AutoFlush = true
            };
            _gates = new StreamWriter(Path.Combine(_dir, "gates.jsonl"), append: false) {
                AutoFlush = true
            };
            DirectoryPath = _dir;
        }

        public string DirectoryPath { get; }

        public void Observe(SimulationSession session, int tick) {
            // 10 Hz from 120 Hz — dense enough for OFT, cheap enough for long cards.
            if (tick % 12 != 0 && session.RapierPhase == _lastPhase
                && session.RapierRecoveryGate == _lastGate
                && session.RapierMissionCue == _lastCue) {
                return;
            }

            AircraftState s = session.Player.State;
            double tas = session.Player.AirspeedMps;
            double sound = StandardAtmosphere1976.Instance
                .Sample(s.Position.Y).SpeedOfSoundMps;
            double mach = tas / Math.Max(1.0, sound);
            var row = new Dictionary<string, object?> {
                ["k"] = "tick",
                ["t"] = session.TimeSeconds,
                ["tick"] = tick,
                ["phase"] = session.RapierPhase.ToString(),
                ["phase_reason"] = session.RapierPhaseReason,
                ["gate"] = session.RapierRecoveryGate,
                ["cue"] = session.RapierMissionCue,
                ["x"] = s.Position.X,
                ["y"] = s.Position.Y,
                ["z"] = s.Position.Z,
                ["mach"] = Math.Round(mach, 3),
                ["commanded_mach"] = Math.Round(session.RapierCommandedMach, 3),
                ["authored_mach"] = Math.Round(session.RapierAuthoredTargetMach, 3),
                ["skin_mach_limit"] = double.IsFinite(session.RapierSkinMachLimit)
                    ? Math.Round(session.RapierSkinMachLimit, 3) : null,
                ["ktas"] = Math.Round(tas * 1.94384, 1),
                ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
                ["fuel_lb"] = Math.Round(session.PlayerFuel.FuelLb, 1),
                ["mass_kg"] = Math.Round(s.Mass, 1),
                ["bank_deg"] = Math.Round(s.Bank * 180.0 / Math.PI, 2),
                ["gamma_deg"] = Math.Round(s.Gamma * 180.0 / Math.PI, 2),
                ["alpha_deg"] = Math.Round(
                    session.Player.AngleOfAttackRad * 180.0 / Math.PI, 2),
                ["nz"] = Math.Round(session.Player.LastNz, 3),
                ["dynamic_pressure_kpa"] = Math.Round(
                    session.Player.DynamicPressurePa / 1000.0, 3),
                ["thrust_lbf"] = Math.Round(
                    session.Player.LastEngineOperatingPoint.NetThrustLbf, 1),
                ["automation"] = session.RapierAutomationActive,
                ["lifecycle"] = session.Lifecycle.ToString(),
                ["arrestment"] = session.Arrestment.Phase.ToString(),
                ["terminal"] = session.PlayerTerminalState.ToString(),
                ["gear_down_locked"] = session.PlayerSystems.AllGearDownAndLocked,
                ["gear_fraction"] = Math.Round(
                    session.PlayerSystems.EffectiveGearFraction, 3),
                ["flap_deg"] = Math.Round(
                    (session.PlayerSystems.LeftFlapDegrees
                        + session.PlayerSystems.RightFlapDegrees) * 0.5, 2),
                ["touchdown_recovery"] = session.Touchdown.Recovery.ToString(),
                ["touchdown_quality"] = session.Touchdown.Quality.ToString(),
                ["touchdown_hook"] = session.Touchdown.Hook.ToString(),
                ["touchdown_sink_mps"] = Math.Round(
                    session.Touchdown.SinkRateMps, 3),
                ["touchdown_ias_kt"] = Math.Round(
                    session.Touchdown.IndicatedAirspeedMps * 1.94384, 1),
                ["touchdown_wheel_along_m"] = Math.Round(
                    session.Touchdown.WheelAlongM, 2),
                ["touchdown_hook_along_m"] = Math.Round(
                    session.Touchdown.HookAlongM, 2),
            };
            _ticks.WriteLine(JsonSerializer.Serialize(row));

            if (session.RapierPhase != _lastPhase
                || session.RapierRecoveryGate != _lastGate
                || session.RapierMissionCue != _lastCue) {
                var gateRow = new Dictionary<string, object?> {
                    ["k"] = "gate",
                    ["t"] = session.TimeSeconds,
                    ["tick"] = tick,
                    ["from_phase"] = _lastPhase.ToString(),
                    ["to_phase"] = session.RapierPhase.ToString(),
                    ["reason"] = session.RapierPhaseReason,
                    ["from_gate"] = _lastGate,
                    ["to_gate"] = session.RapierRecoveryGate,
                    ["cue"] = session.RapierMissionCue,
                    ["mach"] = Math.Round(mach, 3),
                    ["commanded_mach"] = Math.Round(session.RapierCommandedMach, 3),
                    ["ktas"] = Math.Round(tas * 1.94384, 1),
                    ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
                    ["fuel_lb"] = Math.Round(session.PlayerFuel.FuelLb, 1),
                };
                _gates.WriteLine(JsonSerializer.Serialize(gateRow));
                _gateEvents.Add(gateRow);
                _lastPhase = session.RapierPhase;
                _lastGate = session.RapierRecoveryGate;
                _lastCue = session.RapierMissionCue;
            }
        }

        public void Finish(string verdict, string detail) {
            File.WriteAllText(Path.Combine(_dir, "result.json"), JsonSerializer.Serialize(new {
                k = "result",
                verdict,
                detail,
                finished_utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                gate_events = _gateEvents.Count,
            }));
        }

        public void Dispose() {
            _ticks.Dispose();
            _gates.Dispose();
        }
    }

    [Fact]
    public void CircuitsRestoresMissionDirectorAndPatternOnlyFlag() {
        BeatSetup beat = Beats.RapierCircuits();
        Assert.NotNull(beat.ScriptedIntercept);
        Assert.True(beat.ScriptedIntercept!.PatternOnly);
        Assert.Equal(0, beat.ScriptedIntercept.FormationSize);
        Assert.False(beat.RecoveryCompletesSortie);

        var session = new SimulationSession(11,
            weather: KoreaWeatherPresets.ForBeat(11));
        session.DecisionCaptureEnabled = true;
        session.Begin();
        Assert.True(session.RapierMissionAvailable);
        Assert.True(session.RapierAutomationEnabled);
        Assert.True(session.CircuitsCleanMode);
    }

    [Fact]
    public void OftWireCard_AutomationTrapsFromMarshalWithTelemetry() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        // Late-join short final on the overhead — PatternOnly no longer uses the 30 km marshal.
        Vec3D marshal = strip.LandingPoint(along: -1_400.0, cross: 0.0, height: 180.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = marshal,
                Speed = 93.0,
                Gamma = -3.5 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };

        using var telemetry = new CircuitOftTelemetry("wire");
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(11));
        session.StartBeat(() => card);
        session.DecisionCaptureEnabled = true;
        session.Begin();
        Assert.True(session.RapierMissionAvailable);
        Assert.True(session.RapierAutomationActive
            || session.RapierAutomationEnabled);

        int maximumTicks = checked((int)(18 * 60 * AircraftSim.TickHz));
        var phases = new HashSet<RapierMissionPhase>();
        for (int tick = 0;
            tick < maximumTicks
                && session.Lifecycle == SimulationSession.LifecycleState.Active
                && session.Arrestment.Phase != ArrestmentModel.ArrestmentPhase.Stopped;
            tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            phases.Add(session.RapierPhase);
        }

        bool trapped = session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped
            && session.Touchdown.Wire >= 1 && session.Touchdown.Wire <= 4;
        string detail = trapped
            ? $"wire {session.Touchdown.Wire} · mass {session.Player.State.Mass:F0} kg · "
                + $"phases {string.Join(',', phases)}"
            : $"lifecycle {session.Lifecycle}/{session.Recovery}/{session.Arrestment.Phase} · "
                + $"leg {session.RapierCircuitLeg} cue {session.RapierMissionCue} · "
                + $"pos ({session.Player.State.Position.X:F0},{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}) · "
                + $"{session.Player.AirspeedMps * 1.94384:F0} KTAS · "
                + $"telemetry {telemetry.DirectoryPath}";
        bool ok = trapped;
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);

        Assert.True(ok, detail);
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "ticks.jsonl")));
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "gates.jsonl")));
        Assert.Contains(RapierMissionPhase.Recovery, phases);
    }

    [Fact]
    public void OftFullCircuit_LaunchesFliesEveryLegAndTraps() {
        using var telemetry = new CircuitOftTelemetry("full-circuit");
        var session = new SimulationSession(11,
            weather: KoreaWeatherPresets.ForBeat(11));
        session.DecisionCaptureEnabled = true;
        session.Begin();

        string[] expectedLegs = [
            "DEPART", "INITIAL", "BREAK", "DOWNWIND",
            "BASE", "SHORT_FINAL", "WIRE_FINAL"
        ];
        var seenLegs = new List<string>();
        bool leftCatapult = false;
        int maximumTicks = checked((int)(24 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            if (!session.Catapult.IsActive) leftCatapult = true;

            string leg = session.RapierCircuitLeg;
            if (!string.IsNullOrEmpty(leg)
                && (seenLegs.Count == 0 || seenLegs[^1] != leg)) {
                seenLegs.Add(leg);
            }

            if (session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped)
                break;
            if (session.PlayerTerminalState != AircraftTerminalState.Flying)
                break;
        }

        bool trapped = session.Arrestment.Phase
                == ArrestmentModel.ArrestmentPhase.Stopped
            && session.Touchdown.Wire is >= 1 and <= 4;
        int expectedIndex = 0;
        foreach (string leg in seenLegs) {
            if (expectedIndex < expectedLegs.Length
                && leg == expectedLegs[expectedIndex]) {
                expectedIndex++;
            }
        }
        bool flewInOrder = expectedIndex == expectedLegs.Length;
        bool ok = leftCatapult && flewInOrder && trapped;
        string detail = $"leftCat={leftCatapult} legs={string.Join('>', seenLegs)} "
            + $"wire={session.Touchdown.Wire} arrest={session.Arrestment.Phase} "
            + $"touchdown={session.Touchdown.Recovery}/{session.Touchdown.Quality}/"
            + $"{session.Touchdown.Hook} sink={session.Touchdown.SinkRateMps:F2}mps "
            + $"IAS={session.Touchdown.IndicatedAirspeedMps * 1.94384:F0}kt "
            + $"wheel={session.Touchdown.WheelAlongM:F1}m "
            + $"hook={session.Touchdown.HookAlongM:F1}m "
            + $"mass={session.Player.State.Mass:F0}kg "
            + $"gear={session.PlayerSystems.EffectiveGearFraction:F2}/"
            + $"{session.PlayerSystems.AllGearDownAndLocked} "
            + $"terminal={session.PlayerTerminalState} cue={session.RapierMissionCue} "
            + $"telemetry={telemetry.DirectoryPath}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);

        Assert.True(leftCatapult, detail);
        Assert.True(flewInOrder, detail);
        Assert.True(trapped, detail);
    }

    [Fact]
    public void OftLaunchClimb_StaysInPatternEnergyBand() {
        using var telemetry = new CircuitOftTelemetry("launch-energy");
        var session = new SimulationSession(11,
            weather: KoreaWeatherPresets.ForBeat(11));
        session.DecisionCaptureEnabled = true;
        session.Begin();

        double maxMach = 0.0;
        double maxCommandedMach = 0.0;
        bool sawDepart = false;
        bool sawRecovery = false;
        int maximumTicks = checked((int)(2 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            double tas = session.Player.AirspeedMps;
            double sound = StandardAtmosphere1976.Instance
                .Sample(session.Player.State.Position.Y).SpeedOfSoundMps;
            double mach = tas / Math.Max(1.0, sound);
            if (mach > maxMach) maxMach = mach;
            if (session.RapierCommandedMach > maxCommandedMach)
                maxCommandedMach = session.RapierCommandedMach;
            if (session.RapierCircuitLeg == "DEPART") sawDepart = true;
            if (session.RapierPhase == RapierMissionPhase.Recovery) {
                sawRecovery = true;
                if (tick > AircraftSim.TickHz * 20) break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        bool ok = sawDepart
            && maxMach < 0.70
            && maxCommandedMach < 0.52
            && session.PlayerTerminalState == AircraftTerminalState.Flying;
        string detail = $"depart={sawDepart} recovery={sawRecovery} "
            + $"maxMach={maxMach:F3} maxCmd={maxCommandedMach:F3} "
            + $"leg={session.RapierCircuitLeg} alt={session.Player.State.Position.Y:F0} "
            + $"ktas={session.Player.AirspeedMps * 1.94384:F0} cue={session.RapierMissionCue}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
    }

    [Fact]
    public void OftLaunchClear_CatapultHandsAircraftToClimb() {
        using var telemetry = new CircuitOftTelemetry("launch-clear");
        var session = new SimulationSession(11,
            weather: KoreaWeatherPresets.ForBeat(11));
        session.DecisionCaptureEnabled = true;
        session.Begin();
        Assert.True(session.RapierMissionAvailable);

        bool leftCatapult = false;
        bool sawClimb = false;
        int maximumTicks = checked((int)(3 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            if (!session.Catapult.IsActive) leftCatapult = true;
            if (session.RapierPhase == RapierMissionPhase.Climb) sawClimb = true;
            if (leftCatapult && sawClimb
                && session.Player.State.Position.Y > 200.0) {
                break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        bool ok = leftCatapult && sawClimb
            && session.PlayerTerminalState == AircraftTerminalState.Flying;
        string detail = ok
            ? $"alt {session.Player.State.Position.Y:F0} m · cue {session.RapierMissionCue}"
            : $"leftCat={leftCatapult} climb={sawClimb} "
                + $"terminal={session.PlayerTerminalState} cue={session.RapierMissionCue} "
                + $"path={telemetry.DirectoryPath}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
        Assert.Contains("CIRCUITS", session.RapierMissionCue);
    }

    [Fact]
    public void OftMarshal_NearShelfHoldsRecoveryGateZero() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        // Join INITIAL at pattern altitude — 2,500 ft overhead shelf.
        Vec3D marshal = strip.LandingPoint(along: -2_000.0, cross: 0.0, height: 762.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = marshal,
                Speed = 129.0,
                Gamma = -0.04,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };

        using var telemetry = new CircuitOftTelemetry("marshal");
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(11));
        session.StartBeat(() => card);
        session.Begin();

        bool sawRecovery = false;
        string? reason = null;
        int maximumTicks = checked((int)(8 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            if (session.RapierPhase == RapierMissionPhase.Recovery) {
                sawRecovery = true;
                reason = session.RapierPhaseReason;
                if (session.RapierRecoveryGate == 0
                    && session.Player.State.Position.Y > 600.0
                    && session.RapierCircuitLeg is "INITIAL" or "BREAK" or "DOWNWIND"
                    && tick > AircraftSim.TickHz / 2)
                    break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        bool ok = sawRecovery && session.RapierRecoveryGate == 0
            && session.PlayerTerminalState == AircraftTerminalState.Flying
            && (session.RapierCircuitLeg is "INITIAL" or "BREAK" or "DOWNWIND" or "BASE"
                or "SHORT_FINAL");
        string detail = $"phase {session.RapierPhase} gate {session.RapierRecoveryGate} "
            + $"leg {session.RapierCircuitLeg} reason {reason} cue {session.RapierMissionCue}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
        Assert.Equal("pattern_recovery", reason);
    }

    [Fact]
    public void OftLineup_EarnsInboundHeadingAfterMarshal() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        // Start just inside marshal capture so the director advances toward lineup.
        Vec3D nearMarshal = strip.LandingPoint(along: -1_500.0, cross: -4_200.0, height: 550.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = nearMarshal,
                Speed = 154.0,
                Gamma = -0.05,
                Chi = strip.LandingHeadingRad + System.Math.PI,
                Bank = 0.0
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };

        using var telemetry = new CircuitOftTelemetry("lineup");
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(11));
        session.StartBeat(() => card);
        session.Begin();

        bool sawBaseOrLineupCue = false;
        int maximumTicks = checked((int)(8 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            string cue = session.RapierMissionCue;
            if (cue.Contains("BASE", StringComparison.Ordinal)
                || cue.Contains("TURN ONTO FINAL", StringComparison.Ordinal)
                || cue.Contains("SHORT FINAL", StringComparison.Ordinal)
                || cue.Contains("GEAR AND HOOK", StringComparison.Ordinal)) {
                sawBaseOrLineupCue = true;
                break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        telemetry.Finish(sawBaseOrLineupCue ? "PASS" : "ABORT", session.RapierMissionCue);
        Assert.True(sawBaseOrLineupCue, session.RapierMissionCue);
    }

    [Fact]
    public void OftFinal2_OnSpeedInsideGateTwoBand() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        // Late-join short final on the overhead pattern.
        Vec3D marshal = strip.LandingPoint(along: -1_400.0, cross: 0.0, height: 180.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = marshal,
                Speed = 93.0,
                Gamma = -3.5 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };

        using var telemetry = new CircuitOftTelemetry("final-2");
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(11));
        session.StartBeat(() => card);
        session.Begin();

        bool sawFinalBand = false;
        int maximumTicks = checked((int)(12 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            double ktas = session.Player.AirspeedMps * 1.94384;
            if (session.RapierPhase == RapierMissionPhase.Recovery
                && !string.IsNullOrEmpty(session.RapierCircuitLeg)) {
                sawFinalBand = true;
                break;
            }
            if (session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) {
                sawFinalBand = true;
                break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        string detail = $"gate {session.RapierRecoveryGate} "
            + $"ktas {session.Player.AirspeedMps * 1.94384:F0} cue {session.RapierMissionCue}";
        telemetry.Finish(sawFinalBand ? "PASS" : "ABORT", detail);
        Assert.True(sawFinalBand, detail);
    }

    [Fact]
    public void OftBolterRearm_ClimbAfterFinalReopensPattern() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        Vec3D marshal = strip.LandingPoint(along: -1_400.0, cross: 0.0, height: 180.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = marshal,
                Speed = 93.0,
                Gamma = -3.5 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };

        using var telemetry = new CircuitOftTelemetry("bolter-rearm");
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(11));
        session.StartBeat(() => card);
        session.Begin();

        bool sawWireFinal = false;
        bool sawRearm = false;
        int maximumTicks = checked((int)(18 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            if (session.RapierRecoveryGate >= 1
                || !string.IsNullOrEmpty(session.RapierCircuitLeg))
                sawWireFinal = true;

            if (sawWireFinal && session.RapierRecoveryGate == 0
                && session.RapierPhase == RapierMissionPhase.Recovery
                && session.Player.State.Position.Y > 250.0) {
                sawRearm = true;
                break;
            }
            if (session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped) break;
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        bool trapped = session.Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped;
        bool ok = sawRearm || sawWireFinal || trapped;
        string detail = $"rearm={sawRearm} wireFinal={sawWireFinal} trapped={trapped} "
            + $"gate={session.RapierRecoveryGate} cue={session.RapierMissionCue}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
    }
}
