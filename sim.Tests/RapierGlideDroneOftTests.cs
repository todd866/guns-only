using System.Globalization;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Agent-facing OFT for the Rapier glide-drone vertical slice. Mirrors intercept/circuit JSONL
/// shape so agents can verify release → separate/commit → turbine arm → RTB/pickup without a
/// human pilot. Schema: guns-only.glide-drone-oft.v1
/// </summary>
public class RapierGlideDroneOftTests {
    static string OftRoot {
        get {
            string root = Path.GetFullPath(Path.Combine(
                AppContext.BaseDirectory, "..", "..", "..", "..", "analysis", "glide-drone-oft"));
            Directory.CreateDirectory(root);
            return root;
        }
    }

    sealed class GlideDroneOftTelemetry : IDisposable {
        readonly StreamWriter _ticks;
        readonly StreamWriter _gates;
        RapierMissionPhase _lastMissionPhase = RapierMissionPhase.Unavailable;
        RapierGunDronePhase? _lastDronePhase;
        string _lastReason = "";
        string _lastCue = "";

        public GlideDroneOftTelemetry(string cardId) {
            string runId = $"{DateTime.UtcNow:yyyyMMddTHHmmssZ}-{cardId}";
            DirectoryPath = Path.Combine(OftRoot, runId);
            Directory.CreateDirectory(DirectoryPath);
            File.WriteAllText(Path.Combine(DirectoryPath, "hdr.json"), JsonSerializer.Serialize(new {
                schema = "guns-only.glide-drone-oft.v1",
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
            RapierGunDrone? drone = session.ActiveRapierGunDrone;
            RapierGunDronePhase? dronePhase = drone?.Phase;
            bool turbineArmed = drone?.TurbineArmed ?? false;
            double pickupRangeM = double.NaN;
            double droneMach = double.NaN;
            double droneAltFt = double.NaN;

            if (drone is not null) {
                AircraftState ds = drone.Sim.State;
                AtmosphericState air = StandardAtmosphere1976.Instance.Sample(ds.Position.Y);
                droneMach = drone.Sim.AirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
                droneAltFt = ds.Position.Y / 0.3048;
                Vec3D pickup = RapierGunDrone.PickupPoint(
                    session.Carrier?.Position ?? Vec3D.Zero);
                pickupRangeM = (pickup - ds.Position).Length;
            }

            if (tick % 12 != 0
                && session.RapierPhase == _lastMissionPhase
                && session.RapierPhaseReason == _lastReason
                && session.RapierMissionCue == _lastCue
                && dronePhase == _lastDronePhase) {
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
                ["cue"] = session.RapierMissionCue,
                ["drone_phase"] = dronePhase?.ToString(),
                ["turbine_armed"] = turbineArmed,
                ["drones_remaining"] = session.RapierDogfightingDronesRemaining,
                ["live_opponents"] = session.LiveOpponentCount,
                ["pickup_range_m"] = double.IsFinite(pickupRangeM)
                    ? Math.Round(pickupRangeM, 0) : null,
                ["drone_mach"] = double.IsFinite(droneMach)
                    ? Math.Round(droneMach, 3) : null,
                ["drone_alt_ft"] = double.IsFinite(droneAltFt)
                    ? Math.Round(droneAltFt, 0) : null,
                ["mach"] = Math.Round(mach, 3),
                ["alt_ft"] = Math.Round(s.Position.Y / 0.3048, 0),
            };
            _ticks.WriteLine(JsonSerializer.Serialize(row));

            if (session.RapierPhase != _lastMissionPhase
                || session.RapierPhaseReason != _lastReason
                || session.RapierMissionCue != _lastCue
                || dronePhase != _lastDronePhase) {
                _gates.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object?> {
                    ["k"] = "gate",
                    ["t"] = session.TimeSeconds,
                    ["tick"] = tick,
                    ["from_phase"] = _lastMissionPhase.ToString(),
                    ["to_phase"] = session.RapierPhase.ToString(),
                    ["reason"] = session.RapierPhaseReason,
                    ["from_drone_phase"] = _lastDronePhase?.ToString(),
                    ["to_drone_phase"] = dronePhase?.ToString(),
                    ["turbine_armed"] = turbineArmed,
                    ["drones_remaining"] = session.RapierDogfightingDronesRemaining,
                    ["live_opponents"] = session.LiveOpponentCount,
                    ["cue"] = session.RapierMissionCue,
                    ["pickup_range_m"] = double.IsFinite(pickupRangeM)
                        ? Math.Round(pickupRangeM, 0) : null,
                    ["drone_mach"] = double.IsFinite(droneMach)
                        ? Math.Round(droneMach, 3) : null,
                }));
                _lastMissionPhase = session.RapierPhase;
                _lastReason = session.RapierPhaseReason;
                _lastCue = session.RapierMissionCue;
                _lastDronePhase = dronePhase;
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

    static BeatSetup AirborneAttackCard(int formationSize = 4) {
        BeatSetup baseline = Beats.RapierIntercept();
        const double altitudeM = 12_000.0;
        const double startNorthM = 300_000.0;
        return baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, altitudeM, startNorthM),
                Speed = 350.0,
                Gamma = 0.0,
                Chi = 0.0,
                Bank = 0.0
            },
            Bandit = baseline.Bandit with {
                Position = new Vec3D(0.0, altitudeM, startNorthM + 8_000.0),
                Speed = 210.0,
                Gamma = 0.0,
                Chi = Math.PI,
                Bank = 0.0
            },
            UsesReactiveBandit = false,
            StartsOnCatapult = false,
            Combat = baseline.CombatRules with { OpponentAmmo = 0 },
            ScriptedIntercept = new ScriptedInterceptConfig(FormationSize: formationSize)
        };
    }

    static double PickupRangeM(SimulationSession session, RapierGunDrone drone) {
        Vec3D pickup = RapierGunDrone.PickupPoint(session.Carrier?.Position ?? Vec3D.Zero);
        return (pickup - drone.Sim.State.Position).Length;
    }

    static bool InsidePickupVolume(SimulationSession session, RapierGunDrone drone) {
        Vec3D pickup = RapierGunDrone.PickupPoint(session.Carrier?.Position ?? Vec3D.Zero);
        Vec3D delta = drone.Sim.State.Position - pickup;
        double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        return horizontal <= RapierGunDrone.PickupRadiusM
            && Math.Abs(delta.Y) <= RapierGunDrone.PickupAltitudeSlackM;
    }

    [Fact]
    public void OftReleaseToPickup_SeparatesArmsTurbineAndProgressesTowardPickup() {
        using var telemetry = new GlideDroneOftTelemetry("release-to-pickup");
        var session = new SimulationSession(10,
            weather: KoreaWeatherPresets.ForBeat(10));
        session.DecisionCaptureEnabled = false;
        session.StartBeat(() => AirborneAttackCard(formationSize: 1));
        session.Begin();
        session.StepFixed();

        Assert.Equal(RapierMissionPhase.Attack, session.RapierPhase);

        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        bool released = session.ActiveRapierGunDrone is not null;
        Assert.True(released, "expected gun-drone release on F");

        var dronePhases = new HashSet<RapierGunDronePhase>();
        bool leftSeparate = false;
        bool sawCommit = false;
        bool turbineArmed = false;
        bool gateSatisfied = false;
        bool insidePickup = false;
        bool rtbClosing = false;
        int releaseTick = 1;
        int rtbStartTick = -1;
        double rtbStartRangeM = double.NaN;
        double minimumRtbRangeM = double.NaN;
        RapierGunDronePhase lastSeenPhase = RapierGunDronePhase.Separate;

        int forceDefeatTick = releaseTick
            + (int)((RapierGunDrone.SeparateHoldSeconds + 2.0) * AircraftSim.TickHz);
        int maximumTicks = checked((int)(5 * 60 * AircraftSim.TickHz));

        for (int tick = 1; tick < maximumTicks; tick++) {
            if (tick == forceDefeatTick)
                session.ForceOpponentDefeatForTest();

            session.StepFixed();
            telemetry.Observe(session, tick);

            RapierGunDrone? drone = session.ActiveRapierGunDrone;
            if (drone is null) {
                if (lastSeenPhase == RapierGunDronePhase.Rtb && insidePickup)
                    break;
                continue;
            }

            lastSeenPhase = drone.Phase;
            dronePhases.Add(drone.Phase);
            if (drone.Phase != RapierGunDronePhase.Separate)
                leftSeparate = true;
            if (drone.Phase == RapierGunDronePhase.Commit)
                sawCommit = true;
            if (drone.TurbineArmed)
                turbineArmed = true;

            AircraftState ds = drone.Sim.State;
            AtmosphericState air = StandardAtmosphere1976.Instance.Sample(ds.Position.Y);
            double mach = drone.Sim.AirspeedMps / Math.Max(1.0, air.SpeedOfSoundMps);
            if (mach <= RapierGunDrone.TurbineArmMach
                && ds.Position.Y <= RapierGunDrone.TurbineArmAltitudeM)
                gateSatisfied = true;

            double rangeM = PickupRangeM(session, drone);
            if (InsidePickupVolume(session, drone))
                insidePickup = true;

            if (drone.Phase == RapierGunDronePhase.Rtb) {
                if (rtbStartTick < 0) {
                    rtbStartTick = tick;
                    rtbStartRangeM = rangeM;
                    minimumRtbRangeM = rangeM;
                } else {
                    minimumRtbRangeM = Math.Min(minimumRtbRangeM, rangeM);
                }
            }

            if (session.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }

        if (rtbStartTick >= 0 && double.IsFinite(rtbStartRangeM) && double.IsFinite(minimumRtbRangeM))
            rtbClosing = minimumRtbRangeM < rtbStartRangeM - 5_000.0;

        bool stillActiveOrDone = session.ActiveRapierGunDrone is not null
            || insidePickup
            || lastSeenPhase == RapierGunDronePhase.Rtb;

        bool ok = released
            && leftSeparate
            && sawCommit
            && (turbineArmed || gateSatisfied)
            && stillActiveOrDone
            && (insidePickup || rtbClosing || dronePhases.Contains(RapierGunDronePhase.Rtb));

        string detail = ok
            ? $"drone phases {string.Join(',', dronePhases)} · turbine={turbineArmed} · "
                + $"pickup={insidePickup} · rtb_close={rtbClosing} · "
                + $"range {minimumRtbRangeM / 1000.0:F0} km min"
            : $"released={released} separate={leftSeparate} commit={sawCommit} "
                + $"turbine={turbineArmed} gate={gateSatisfied} pickup={insidePickup} "
                + $"rtb={rtbClosing} phases={string.Join(',', dronePhases)} · "
                + $"path={telemetry.DirectoryPath}";

        telemetry.Finish(ok ? "PASS" : "ABORT", detail);
        Assert.True(ok, detail);
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "ticks.jsonl")));
        Assert.True(File.Exists(Path.Combine(telemetry.DirectoryPath, "gates.jsonl")));
        string gates = File.ReadAllText(Path.Combine(telemetry.DirectoryPath, "gates.jsonl"));
        Assert.Contains("\"drone_phase\"", File.ReadAllText(
            Path.Combine(telemetry.DirectoryPath, "ticks.jsonl")));
        Assert.Contains("\"to_drone_phase\"", gates);
    }
}
