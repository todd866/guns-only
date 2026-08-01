using System.Globalization;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Agent-facing OFT for the Rapier intercept energy ladder. Mirrors Circuits JSONL shape so
/// agents can verify Launch→Climb→Accelerate→RamClimb→Intercept without a human pilot.
/// Schema: guns-only.intercept-oft.v1
/// </summary>
public class RapierInterceptOftTests {
    static string OftRoot {
        get {
            string root = Path.Combine(
                TestRepository.Root, "analysis", "intercept-oft");
            Directory.CreateDirectory(root);
            return root;
        }
    }

    sealed class InterceptOftTelemetry : IDisposable {
        readonly StreamWriter _ticks;
        readonly StreamWriter _gates;
        RapierMissionPhase _lastPhase = RapierMissionPhase.Unavailable;
        string _lastReason = "";

        public InterceptOftTelemetry(string cardId) {
            string runId = $"{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{cardId}";
            DirectoryPath = Path.Combine(OftRoot, runId);
            Directory.CreateDirectory(DirectoryPath);
            File.WriteAllText(Path.Combine(DirectoryPath, "hdr.json"), JsonSerializer.Serialize(new {
                schema = "guns-only.intercept-oft.v1",
                card = cardId,
                beat = "mission.modern.rapier-intercept.public-data-surrogate.v1",
                started_utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
            }));
            _ticks = new StreamWriter(Path.Combine(DirectoryPath, "ticks.jsonl"), append: false) {
                AutoFlush = true
            };
            _gates = new StreamWriter(Path.Combine(DirectoryPath, "gates.jsonl"), append: false) {
                AutoFlush = true
            };
        }

        public string DirectoryPath { get; }

        public void Observe(SimulationSession session, int tick) {
            if (tick % 12 != 0 && session.RapierPhase == _lastPhase
                && session.RapierPhaseReason == _lastReason)
                return;

            AircraftState s = session.Player.State;
            double tas = session.Player.AirspeedMps;
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(s.Position.Y);
            double sound = air.SpeedOfSoundMps;
            double mach = tas / Math.Max(1.0, sound);
            double stagnationTemperatureK = AirData.StagnationTemperatureK(
                mach, air.TemperatureK);
            var row = new Dictionary<string, object?> {
                ["k"] = "tick",
                ["t"] = session.TimeSeconds,
                ["tick"] = tick,
                ["phase"] = session.RapierPhase.ToString(),
                ["phase_reason"] = session.RapierPhaseReason,
                ["cue"] = session.RapierMissionCue,
                ["mach"] = Math.Round(mach, 3),
                ["dynamic_pressure_kpa"] = Math.Round(
                    session.Player.DynamicPressurePa / 1000.0, 3),
                ["commanded_mach"] = Math.Round(session.RapierCommandedMach, 3),
                ["authored_mach"] = Math.Round(session.RapierAuthoredTargetMach, 3),
                ["skin_mach_limit"] = double.IsFinite(session.RapierSkinMachLimit)
                    ? Math.Round(session.RapierSkinMachLimit, 3) : null,
                ["ambient_temp_c"] = Math.Round(air.TemperatureK - 273.15, 1),
                ["stagnation_temp_c"] = Math.Round(stagnationTemperatureK - 273.15, 1),
                ["adiabatic_wall_temp_c"] =
                    Math.Round(session.Player.AdiabaticWallTemperatureK - 273.15, 1),
                ["skin_temp_c"] = Math.Round(session.Player.SkinTemperatureK - 273.15, 1),
                ["binding_zone_equilibrium_c"] = Math.Round(
                    session.Player.AerothermalZoneEquilibriumTemperatureK - 273.15, 1),
                ["skin_limit_c"] = Math.Round(
                    session.Beat.PlayerAir.SkinTemperatureLimitK - 273.15, 1),
                ["ktas"] = Math.Round(tas * 1.94384, 1),
                ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
                ["fuel_lb"] = Math.Round(session.PlayerFuel.FuelLb, 1),
                ["automation"] = session.RapierAutomationActive,
                ["intention"] = session.RapierIntention,
                ["strategy"] = session.RapierStrategy,
            };
            _ticks.WriteLine(JsonSerializer.Serialize(row));

            if (session.RapierPhase != _lastPhase
                || session.RapierPhaseReason != _lastReason) {
                _gates.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?> {
                    ["k"] = "gate",
                    ["t"] = session.TimeSeconds,
                    ["from_phase"] = _lastPhase.ToString(),
                    ["to_phase"] = session.RapierPhase.ToString(),
                    ["reason"] = session.RapierPhaseReason,
                    ["mach"] = Math.Round(mach, 3),
                    ["commanded_mach"] = Math.Round(session.RapierCommandedMach, 3),
                    ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
                }));
                _lastPhase = session.RapierPhase;
                _lastReason = session.RapierPhaseReason;
            }
        }

        public void Finish(string verdict, string detail) {
            File.WriteAllText(Path.Combine(DirectoryPath, "result.json"), JsonSerializer.Serialize(new {
                k = "result",
                verdict,
                detail,
                finished_utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
            }));
        }

        public void Dispose() {
            _ticks.Dispose();
            _gates.Dispose();
        }
    }

    [Fact]
    public void OftEnergyLadder_ReachesInterceptWithFightingRoom() {
        using var telemetry = new InterceptOftTelemetry("energy-ladder");
        var session = new SimulationSession(10,
            weather: KoreaWeatherPresets.ForBeat(10));
        session.DecisionCaptureEnabled = false;
        session.Begin();

        var phases = new HashSet<RapierMissionPhase>();
        var reasons = new HashSet<string>();
        double rangeAtDashM = double.NaN;
        double dashMach = double.NaN;
        double dashAltitudeFt = double.NaN;
        double dashSkinC = double.NaN;
        double dashRecoveryC = double.NaN;
        double dashStagnationC = double.NaN;
        double maximumDynamicPressurePa = 0.0;
        double maximumBindingZoneTemperatureK = 0.0;
        // Two authored skips plus their physical relights now take about 13 minutes once the
        // canonical 55 kPa placard is actually obeyed. Fifteen minutes is the OFT budget; the old
        // twelve-minute cutoff depended on a 71 kPa transonic overspeed.
        int maximumTicks = checked((int)(15 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            telemetry.Observe(session, tick);
            phases.Add(session.RapierPhase);
            if (!string.IsNullOrEmpty(session.RapierPhaseReason))
                reasons.Add(session.RapierPhaseReason);

            double mach = session.Player.AirspeedMps
                / StandardAtmosphere1976.Instance.Sample(
                    session.Player.State.Position.Y).SpeedOfSoundMps;
            maximumDynamicPressurePa = Math.Max(
                maximumDynamicPressurePa, session.Player.DynamicPressurePa);
            maximumBindingZoneTemperatureK = Math.Max(
                maximumBindingZoneTemperatureK,
                session.Player.AerothermalZoneEquilibriumTemperatureK);
            // Intercept after a zoom/relight is an energy-positive M2.2 handoff, not an obsolete
            // fixed-altitude M2.7 sampling point. Record the first real handoff while there is
            // still range to fight; the authored target and local q/thermal caps remain separate.
            if (session.RapierPhase == RapierMissionPhase.Intercept
                && mach >= ReachFightDirector.LevelDashMinMach) {
                rangeAtDashM = (session.Bandit.State.Position
                    - session.Player.State.Position).Length;
                AtmosphericState dashAir = StandardAtmosphere1976.Instance.Sample(
                    session.Player.State.Position.Y);
                dashMach = mach;
                dashAltitudeFt = session.Player.State.Position.Y / 0.3048;
                dashSkinC = session.Player.SkinTemperatureK - 273.15;
                dashRecoveryC = session.Player.AdiabaticWallTemperatureK - 273.15;
                dashStagnationC =
                    AirData.StagnationTemperatureK(mach, dashAir.TemperatureK) - 273.15;
                break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        bool reachedIntercept = phases.Contains(RapierMissionPhase.Intercept);
        bool okReason = reasons.Contains("intercept_dash")
            || reasons.Contains("direct_join")
            || reasons.Contains("level_dash")
            || reasons.Contains("post_lob_intercept");
        // Goal-capable ReachFight may RamClimb, ZoomLob, or DirectJoin/LevelDash into Intercept.
        bool energyLadder = phases.Contains(RapierMissionPhase.RamClimb)
            || (phases.Contains(RapierMissionPhase.ZoomPull) && okReason)
            || reasons.Contains("intercept_dash")
            || reasons.Contains("direct_join")
            || reasons.Contains("level_dash");
        bool ok = phases.Contains(RapierMissionPhase.Accelerate)
            && energyLadder
            && reachedIntercept
            && rangeAtDashM > 40_000.0
            && okReason;
        string detail = ok
            ? $"range {rangeAtDashM / 1000.0:F0} km · phases {string.Join(',', phases)} · "
                + $"reasons {string.Join(',', reasons)}"
            : $"phases {string.Join(',', phases)} range={rangeAtDashM} "
                + $"path={telemetry.DirectoryPath}";
        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "ticks.jsonl")));
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "gates.jsonl")));
        string gates = File.ReadAllText(Path.Combine(telemetry.DirectoryPath, "gates.jsonl"));
        Assert.Contains("\"reason\"", gates);
        Assert.True(maximumDynamicPressurePa <= RapierV2Design.MaximumDynamicPressurePa + 1.0,
            $"OFT exceeded q placard: {maximumDynamicPressurePa / 1000.0:F2} kPa");
        Assert.True(maximumBindingZoneTemperatureK
                <= session.Beat.PlayerAir.SkinTemperatureLimitK + 0.1,
            $"OFT exceeded binding thermal limit: {maximumBindingZoneTemperatureK:F1} K");
        // This is the first energy-positive handoff after the physical zoom/relight, not the old
        // Build 174/175 fixed-FL700 thermal snapshot. Pin the current contract to named thresholds
        // and the v2 binding-zone equation instead of inheriting v1 Mach and temperature bands.
        Assert.InRange(dashMach,
            ReachFightDirector.LevelDashMinMach,
            ReachFightDirector.LevelDashMinMach + 0.01);
        Assert.True(double.IsFinite(dashAltitudeFt));
        Assert.True(dashStagnationC > dashRecoveryC,
            $"stagnation {dashStagnationC:F1} C must exceed recovered wall {dashRecoveryC:F1} C");
        Assert.True(dashRecoveryC > dashSkinC,
            $"recovered wall {dashRecoveryC:F1} C must exceed lagged skin {dashSkinC:F1} C");
        AtmosphericState handoffAir = StandardAtmosphere1976.Instance.Sample(
            session.Player.State.Position.Y);
        double expectedSkinMachLimit = AirData.MachLimitForEffectiveZoneTemperature(
            session.Beat.PlayerAir.SkinTemperatureLimitK,
            handoffAir.TemperatureK,
            session.Beat.PlayerAir.AerothermalLimitReference,
            session.Beat.PlayerAir.AerothermalAdiabaticRiseFraction);
        // Guidance is evaluated immediately before the fixed-step state integration observed
        // here, so compare the same equation to millimach precision across that one-tick altitude.
        Assert.Equal(expectedSkinMachLimit, session.RapierSkinMachLimit, 3);
        Assert.True(session.RapierSkinMachLimit > dashMach,
            $"v2 binding-zone cap M{session.RapierSkinMachLimit:F2} must leave handoff room above M{dashMach:F2}");
        Assert.Equal(RapierMissionDirector.MeasuredDashMach,
            session.RapierAuthoredTargetMach, 6);
        Assert.Contains($"M{session.RapierCommandedMach:F1}", session.RapierMissionCue);
        Assert.Contains("Q/THERM LIMITS", session.RapierMissionCue);
        Assert.DoesNotContain("FL700", session.RapierMissionCue);
    }
}
