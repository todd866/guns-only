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
                ["gate"] = session.RapierRecoveryGate,
                ["cue"] = session.RapierMissionCue,
                ["x"] = s.Position.X,
                ["y"] = s.Position.Y,
                ["z"] = s.Position.Z,
                ["mach"] = Math.Round(mach, 3),
                ["ktas"] = Math.Round(tas * 1.94384, 1),
                ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
                ["fuel_lb"] = Math.Round(session.PlayerFuel.FuelLb, 1),
                ["bank_deg"] = Math.Round(s.Bank * 180.0 / Math.PI, 2),
                ["gamma_deg"] = Math.Round(s.Gamma * 180.0 / Math.PI, 2),
                ["automation"] = session.RapierAutomationActive,
                ["lifecycle"] = session.Lifecycle.ToString(),
                ["arrestment"] = session.Arrestment.Phase.ToString(),
                ["terminal"] = session.PlayerTerminalState.ToString(),
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
                    ["from_gate"] = _lastGate,
                    ["to_gate"] = session.RapierRecoveryGate,
                    ["cue"] = session.RapierMissionCue,
                    ["mach"] = Math.Round(mach, 3),
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
    }

    [Fact]
    public void OftWireCard_AutomationTrapsFromMarshalWithTelemetry() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        Vec3D marshal = strip.LandingPoint(along: -46_000.0, height: 3_700.0);
        BeatSetup card = baseline with {
            Player = baseline.Player with {
                Position = marshal,
                Speed = 180.0,
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
                + $"cue {session.RapierMissionCue} · "
                + $"pos ({session.Player.State.Position.X:F0},{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}) · "
                + $"{session.Player.AirspeedMps * 1.94384:F0} KTAS · "
                + $"telemetry {telemetry.DirectoryPath}";
        telemetry.Finish(trapped ? "PASS" : "ABORT", detail);

        Assert.True(trapped, detail);
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "ticks.jsonl")));
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "gates.jsonl")));
        Assert.Contains(RapierMissionPhase.Recovery, phases);
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
}
