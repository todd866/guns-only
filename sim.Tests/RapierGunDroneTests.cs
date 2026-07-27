using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class RapierGunDroneTests {
    static int HotFrameSlotIndex(string name) {
        using JsonDocument layoutDocument = JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        foreach (JsonElement block in layoutDocument.RootElement.GetProperty("blocks")
            .EnumerateArray()) {
            foreach (JsonElement slot in block.GetProperty("slots").EnumerateArray()) {
                if (slot.GetProperty("name").GetString() == name)
                    return slot.GetProperty("index").GetInt32();
            }
        }
        throw new InvalidOperationException($"hot-frame slot {name} not found");
    }
    [Fact]
    public void GunDroneSurrogateMatchesVerticalSliceMassAndPropulsionCard() {
        AircraftParams drone = FlightModel.RapierGunDroneSurrogate;

        Assert.Equal(360.0, drone.MassKg, 0);
        Assert.Equal(4.0, drone.WingAreaM2, 3);
        Assert.Equal(1800.0, drone.ThrustMaxN, 0);
        Assert.Equal(1.0, drone.MaxThrustFraction, 3);
        Assert.Equal(593.15, drone.SkinTemperatureLimitK, 2);
        Assert.Equal(280.0, drone.FuelFreeMassKg, 0);
        Assert.InRange(drone.WingSpanM, 5.0, 6.0);
        Assert.True(drone.PositiveStructuralLimitG >= 4.0);
    }

    [Fact]
    public void SpawnSeparatesAftAndBelowCarrierThenCommitsAfterHold() {
        var carrier = new AircraftState(
            new Vec3D(0.0, 8_000.0, 0.0), 280.0, 0.0, 0.0, 0.0, 9_000.0);
        RapierGunDrone drone = RapierGunDrone.SpawnFrom(carrier);
        Assert.Equal(RapierGunDronePhase.Separate, drone.Phase);
        Assert.True(drone.Sim.State.Position.Y < carrier.Position.Y);
        Assert.True(drone.Sim.State.Position.Z < carrier.Position.Z - 10.0);
        Assert.False(drone.TurbineArmed);

        Vec3D pickup = new(-35_000.0, 180.0, -8_000.0);
        var target = new AircraftState(
            new Vec3D(500.0, 7_500.0, 2_000.0), 200.0, 0.0, Math.PI, 0.0, 20_000.0);
        const double dt = 1.0 / AircraftSim.TickHz;
        for (int i = 0; i < (int)(RapierGunDrone.SeparateHoldSeconds * AircraftSim.TickHz) + 5; i++)
            drone.Step(dt, target, targetAlive: true, pickup);

        Assert.Equal(RapierGunDronePhase.Commit, drone.Phase);
    }

    [Fact]
    public void TurbineArmsBelowMachAndAltitudeGate() {
        var carrier = new AircraftState(
            new Vec3D(0.0, 6_000.0, 0.0), 250.0, 0.0, 0.0, 0.0, 9_000.0);
        RapierGunDrone drone = RapierGunDrone.SpawnFrom(carrier);
        Vec3D pickup = new(-1_000.0, 200.0, 0.0);
        var target = new AircraftState(
            new Vec3D(0.0, 5_500.0, 3_000.0), 180.0, 0.0, Math.PI, 0.0, 20_000.0);
        const double dt = 1.0 / AircraftSim.TickHz;
        for (int i = 0; i < (int)(3.0 * AircraftSim.TickHz); i++)
            drone.Step(dt, target, targetAlive: true, pickup);

        Assert.True(drone.TurbineArmed);
        Assert.True(drone.LastAppliedCommand.Throttle > 0.0);
    }

    [Fact]
    public void CommitEndsToRtbAndRecoversInsidePickupVolume() {
        var carrier = new AircraftState(
            new Vec3D(0.0, 1_000.0, 0.0), 120.0, 0.0, 0.0, 0.0, 9_000.0);
        RapierGunDrone drone = RapierGunDrone.SpawnFrom(carrier);
        Vec3D pickup = drone.Sim.State.Position + new Vec3D(0.0, 0.0, 2_000.0);
        const double dt = 1.0 / AircraftSim.TickHz;

        for (int i = 0; i < (int)(RapierGunDrone.SeparateHoldSeconds * AircraftSim.TickHz) + 2; i++)
            drone.Step(dt, null, targetAlive: false, pickup);
        Assert.Equal(RapierGunDronePhase.Rtb, drone.Phase);

        for (int i = 0; i < (int)(90.0 * AircraftSim.TickHz); i++) {
            drone.Step(dt, null, targetAlive: false, pickup);
            if (drone.Phase == RapierGunDronePhase.Recovered) break;
        }

        Assert.Equal(RapierGunDronePhase.Recovered, drone.Phase);
    }

    static BeatSetup AirborneAttackCard(int formationSize = 4, bool wipe = false) {
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
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: formationSize,
                DeterministicSwarmWipe: wipe)
        };
    }

    [Fact]
    public void SessionReleaseSpawnsOnePhysicalDroneWithoutWipingFormation() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard());
        session.Begin();
        session.StepFixed();

        Assert.Equal(RapierMissionPhase.Attack, session.RapierPhase);
        Assert.Equal(4, session.LiveOpponentCount);
        Assert.Equal(4, session.RapierDogfightingDronesRemaining);

        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        Assert.Equal(3, session.RapierDogfightingDronesRemaining);
        Assert.NotNull(session.ActiveRapierGunDrone);
        Assert.True(session.ActiveRapierGunDrone!.StillActive);
        Assert.Equal(4, session.LiveOpponentCount);
        Assert.Equal(0, session.KillCount);
        Assert.Contains("DRONE", session.RapierMissionCue, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("FORMATION DESTROYED", session.TransitionCue,
            StringComparison.OrdinalIgnoreCase);
        Assert.Equal(RapierMissionPhase.Escape, session.RapierPhase);

        var buffer = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(buffer, session, 0.0, 0.0, false);
        string json = SnapshotProjection.BuildState(session, Carrier.DeckConfiguration.Angled,
            0.0, 0.0, false, null);
        using JsonDocument document = JsonDocument.Parse(json);
        Assert.Equal(1, document.RootElement.GetProperty("rd1_present").GetInt32());
        Assert.Equal(1, document.RootElement.GetProperty("rd1_alive").GetInt32());
        Assert.Equal(1.0, buffer[HotFrameSlotIndex("rd1_present")]);
        Assert.Equal(1.0, buffer[HotFrameSlotIndex("rd1_alive")]);
    }

    [Fact]
    public void DeterministicSwarmWipeStillAvailableForLegacyEgressCards() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard(wipe: true));
        session.Begin();
        session.StepFixed();
        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Equal(4, session.KillCount);
        Assert.True(session.RapierPursuitActive);
        Assert.Equal(0, session.RapierDogfightingDronesRemaining);
    }

    [Fact]
    public void ReleasedDronePromotesPrimaryBanditOffRailInsideThreatVolume() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard());
        session.Begin();
        session.StepFixed();
        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        Assert.True(session.RapierGunDroneThreatReactive);
        AircraftState before = session.Bandit.State;
        for (int i = 0; i < (int)(2.0 * AircraftSim.TickHz); i++)
            session.StepFixed();
        AircraftState after = session.Bandit.State;
        Assert.True(
            Math.Abs(after.Bank - before.Bank) > 1e-3
            || Math.Abs(after.Chi - before.Chi) > 1e-3
            || Math.Abs(after.Gamma - before.Gamma) > 1e-3,
            "primary stayed on pure rail after gun-drone release");
    }

    [Fact]
    public void GunDroneCanScoreHitsWithOrdinaryGunRules() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard(formationSize: 1));
        session.Begin();
        session.StepFixed();
        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        RapierGunDrone drone = session.ActiveRapierGunDrone
            ?? throw new InvalidOperationException("expected released drone");
        AircraftState bandit = session.Bandit.State;
        var noseOn = new AircraftState(
            bandit.Position - bandit.ForwardDir() * 350.0,
            bandit.Speed + 40.0,
            0.0,
            bandit.Chi,
            0.0,
            drone.Sim.State.Mass);
        drone.Sim.AdoptExternalKinematics(noseOn);

        int hitsBefore = session.KillCount;
        int ammoBefore = drone.Gun.AmmoRemaining;
        for (int i = 0; i < (int)(4.0 * AircraftSim.TickHz); i++) {
            session.StepFixed();
            if (session.LiveOpponentCount < 1 || drone.Gun.HitCount > 0) break;
        }

        Assert.True(
            drone.Gun.HitCount > 0
            || drone.Gun.AmmoRemaining < ammoBefore
            || session.KillCount > hitsBefore
            || session.LiveOpponentCount < 1,
            "drone never employed the gun against the assigned bandit");
    }
}
