using System.Runtime.InteropServices;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Native;

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimFrame {
    public double sim_time_s;
    public long tick;
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double fwd_east;
    public double fwd_up;
    public double fwd_north;
    public double up_east;
    public double up_up;
    public double up_north;
    public double speed_mps;
    public double kcas;
    public double mach;
    public double alpha_deg;
    public double nz_g;
    public double throttle01;
    public double speedbrake01;
    public double gear_down01;
    public double flaps01;
    public double fuel_lb;
    public double player_health;
    public double guidance_next_alt_m;
    public double guidance_next_tas_mps;
    public double guidance_power01;
    public int lifecycle;
    public int outcome;
    public int player_alive;
    public int player_rtb_active;
    public int rtb_available;
    public int can_end_sortie;
    public int weight_on_wheels;
    public int runway_phase;
    public int buffet;
    public int ammo_remaining;
    public int rounds_fired;
    public int live_opponent_count;
    public int relief_kills;
    public int guidance_active;
    public int guidance_in_groove;
    public int guidance_pattern_leg;
    public int guidance_energy_state;
    public int guidance_gate_count;
    public int contact_count;
    public int tracer_count;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimContact {
    public double health;
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double fwd_east;
    public double fwd_up;
    public double fwd_north;
    public double up_east;
    public double up_up;
    public double up_north;
    public double speed_mps;
    public int role;
    public int alive;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimTracer {
    public double pos_east_m;
    public double pos_up_m;
    public double pos_north_m;
    public double vel_east_mps;
    public double vel_up_mps;
    public double vel_north_mps;
    public double age_s;
    public int id;
    public int friendly;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimApproachGate {
    public double east_m;
    public double north_m;
    public double up_m;
    public double half_m;
    public double target_alt_m;
    public double target_ktas;
    public double distance_to_go_m;
    public int pattern_leg;
    public int dirty_config;
    public int active;
    public int reserved0;
}

[StructLayout(LayoutKind.Sequential)]
public struct GunsSimRunway {
    public double threshold_east_m;
    public double threshold_up_m;
    public double threshold_north_m;
    public double heading_rad;
    public double length_m;
    public double width_m;
    public double touchdown_aim_along_m;
    public int present;
    public int reserved0;
}

internal sealed class SessionSlot {
    public readonly SimulationSession Session;
    public bool LastTrigger;

    public SessionSlot(SimulationSession session) {
        Session = session;
    }
}

public static unsafe class NativeBridge {
    const int AbiVersion = 1;
    const double RadToDeg = 180.0 / Math.PI;
    static readonly object SessionsLock = new();
    static readonly Dictionary<long, SessionSlot> Sessions = new();
    static long _nextHandle = 1;

    static SessionSlot? FindSlot(long handle) {
        if (handle <= 0) return null;
        lock (SessionsLock)
            return Sessions.TryGetValue(handle, out SessionSlot? slot) ? slot : null;
    }

    static void ExtractBasis(in AircraftState state, out Vec3D fwd, out Vec3D up) {
        if (state.BodyAttitude.LengthSquared > 1e-9) {
            fwd = state.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            up = state.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        } else {
            fwd = state.ForwardDir();
            up = new Vec3D(0.0, 1.0, 0.0);
        }
    }

    static int CountContacts(SimulationSession session) {
        int count = session.OpponentPresent ? 1 + session.Wingmen.Count : 0;
        if (session.Relief is not null) count++;
        return count;
    }

    static int CountTracers(SimulationSession session) {
        if (!session.OpponentPresent) return 0;
        int count = session.PlayerGun.RoundsInFlight.Count
            + session.FormationOpponentRoundsInFlight.Count;
        if (session.Relief?.Gun is { } reliefGun)
            count += reliefGun.RoundsInFlight.Count;
        return count;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_abi_version")]
    public static int AbiVersionExport() => AbiVersion;

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_create")]
    public static long Create(int beatIndex, int deckConfig) {
        try {
            Carrier.DeckConfiguration deck = deckConfig == 1
                ? Carrier.DeckConfiguration.Angled
                : Carrier.DeckConfiguration.Axial;
            WeatherProfile weather = KoreaWeatherPresets.ForBeat(beatIndex);
            var session = new SimulationSession(beatIndex, deck, weather);
            lock (SessionsLock) {
                long handle = _nextHandle++;
                Sessions[handle] = new SessionSlot(session);
                return handle;
            }
        } catch {
            return 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_destroy")]
    public static void Destroy(long handle) {
        if (handle <= 0) return;
        lock (SessionsLock)
            Sessions.Remove(handle);
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_begin")]
    public static void Begin(long handle) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session.Begin();
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_restart")]
    public static void Restart(long handle) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.LastTrigger = false;
            slot.Session.Restart();
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_paused")]
    public static void SetPaused(long handle, int paused) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session.SetPaused(paused != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_request_rtb")]
    public static int RequestRtb(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            return slot.Session.TryRequestReturnToBase() ? 1 : 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_end_sortie")]
    public static int EndSortie(long handle) {
        if (FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            return slot.Session.TryEndSortie() ? 1 : 0;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_controls")]
    public static void SetControls(
        long handle,
        double roll,
        double pitch,
        double yaw,
        double throttle01,
        int throttleOverride,
        int triggerDown) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            SimulationSession session = slot.Session;
            if (double.IsFinite(roll)) session.SetAnalogRollControl(Math.Clamp(roll, -1.0, 1.0));
            if (double.IsFinite(pitch)) session.SetAnalogPitchControl(Math.Clamp(pitch, -1.0, 1.0));
            if (double.IsFinite(yaw)) session.SetAnalogYawControl(Math.Clamp(yaw, -1.0, 1.0));
            if (throttleOverride != 0 && double.IsFinite(throttle01))
                session.SetAnalogThrottleControl(Math.Clamp(throttle01, 0.0, 1.0));
            if (triggerDown >= 0) {
                bool wantTrigger = triggerDown != 0;
                if (wantTrigger != slot.LastTrigger) {
                    slot.LastTrigger = wantTrigger;
                    session.FeedKey(GKey.Trigger, wantTrigger);
                }
            }
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_feed_key")]
    public static void FeedKey(long handle, int gkey, int pressed) {
        if (FindSlot(handle) is not { } slot) return;
        if (gkey < (int)GKey.PullUp || gkey > (int)GKey.TimeCompressionToggle) return;
        lock (slot) {
            GKey key = (GKey)gkey;
            if (key == GKey.Trigger) slot.LastTrigger = pressed != 0;
            slot.Session.FeedKey(key, pressed != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_assisted_flight")]
    public static void SetAssistedFlight(long handle, int enabled) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session.SetAssistedFlight(enabled != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_set_auto_gcas")]
    public static void SetAutoGcas(long handle, int enabled) {
        if (FindSlot(handle) is not { } slot) return;
        lock (slot) {
            slot.Session.SetAutoGcasEnabled(enabled != 0);
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_advance")]
    public static int Advance(long handle, double deltaSeconds, int maxCompression) {
        if (FindSlot(handle) is not { } slot) return 0;
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0) return 0;
        lock (slot) {
            return slot.Session.Advance(deltaSeconds, Math.Clamp(maxCompression, 1, 16));
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_frame")]
    public static int ReadFrame(long handle, GunsSimFrame* outFrame) {
        if (outFrame is null || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            SimulationSession session = slot.Session;
            AircraftSim player = session.Player;
            AircraftState s = session.Catapult.IsActive ? session.Catapult.State : player.State;
            Vec3D pos = session.Arrestment.IsActive && !session.Catapult.IsActive
                ? session.Arrestment.Position
                : s.Position;
            Vec3D vel = s.VelocityVector();
            ExtractBasis(s, out Vec3D fwd, out Vec3D up);

            double tasMps = player.AirspeedMps;
            IAtmosphereModel atmo = player.AtmosphereModel;
            double speedOfSound = Math.Max(atmo.Sample(pos.Y).SpeedOfSoundMps, 1e-6);
            double iasKts = player.IndicatedAirspeedMps * AirData.MpsToKnots;
            double mach = tasMps / speedOfSound;
            AirframeSystems systems = session.PlayerSystems;
            double flaps01 = systems.FullFlapDegrees > 1e-3
                ? Math.Clamp((systems.LeftFlapDegrees + systems.RightFlapDegrees)
                    / (2.0 * systems.FullFlapDegrees), 0.0, 1.0)
                : 0.0;
            ApproachGuidanceState guidance = session.ApproachGuidancePlan;

            outFrame->sim_time_s = session.TimeMilliseconds * 0.001;
            outFrame->tick = session.Tick;
            outFrame->pos_east_m = pos.X;
            outFrame->pos_up_m = pos.Y;
            outFrame->pos_north_m = pos.Z;
            outFrame->vel_east_mps = vel.X;
            outFrame->vel_up_mps = vel.Y;
            outFrame->vel_north_mps = vel.Z;
            outFrame->fwd_east = fwd.X;
            outFrame->fwd_up = fwd.Y;
            outFrame->fwd_north = fwd.Z;
            outFrame->up_east = up.X;
            outFrame->up_up = up.Y;
            outFrame->up_north = up.Z;
            outFrame->speed_mps = tasMps;
            outFrame->kcas = iasKts;
            outFrame->mach = mach;
            outFrame->alpha_deg = player.AngleOfAttackRad * RadToDeg;
            outFrame->nz_g = player.LastNz;
            outFrame->throttle01 = Math.Clamp(player.LastAppliedCommand.Throttle, 0.0, 1.5);
            outFrame->speedbrake01 = Math.Clamp(player.SpeedBrake, 0.0, 1.0);
            outFrame->gear_down01 = Math.Clamp(
                (systems.NoseGearPosition + systems.LeftMainGearPosition + systems.RightMainGearPosition) / 3.0,
                0.0,
                1.0);
            outFrame->flaps01 = flaps01;
            outFrame->fuel_lb = session.PlayerFuel.FuelLb;
            outFrame->player_health = session.PlayerHealth;
            outFrame->guidance_next_alt_m = guidance.NextAltitudeM;
            outFrame->guidance_next_tas_mps = guidance.NextTrueAirspeedMps;
            outFrame->guidance_power01 = guidance.Power01;
            outFrame->lifecycle = (int)session.Lifecycle;
            outFrame->outcome = (int)session.Outcome;
            outFrame->player_alive = session.PlayerAlive ? 1 : 0;
            outFrame->player_rtb_active = session.PlayerRtbActive ? 1 : 0;
            outFrame->rtb_available = session.ReturnToBaseAvailable ? 1 : 0;
            outFrame->can_end_sortie = session.CanEndSortie ? 1 : 0;
            outFrame->weight_on_wheels = session.RunwayWeightOnWheels ? 1 : 0;
            outFrame->runway_phase = (int)session.ConventionalRunwayPhase;
            outFrame->buffet = player.Buffet ? 1 : 0;
            outFrame->ammo_remaining = session.OpponentPresent ? session.PlayerGun.AmmoRemaining : 0;
            outFrame->rounds_fired = session.SortiePlayerRoundsFired;
            outFrame->live_opponent_count = session.LiveOpponentCount;
            outFrame->relief_kills = session.ReliefKills;
            outFrame->guidance_active = guidance.GuidanceActive ? 1 : 0;
            outFrame->guidance_in_groove = guidance.InGroove ? 1 : 0;
            outFrame->guidance_pattern_leg = (int)guidance.ActivePatternLeg;
            outFrame->guidance_energy_state = (int)guidance.EnergyState;
            outFrame->guidance_gate_count = guidance.Gates.Count;
            outFrame->contact_count = CountContacts(session);
            outFrame->tracer_count = CountTracers(session);
            return 1;
        }
    }

    static void WriteContact(
        GunsSimContact* dst,
        in AircraftState state,
        int role,
        bool alive,
        double health) {
        Vec3D vel = state.VelocityVector();
        ExtractBasis(state, out Vec3D fwd, out Vec3D up);
        dst->health = health;
        dst->pos_east_m = state.Position.X;
        dst->pos_up_m = state.Position.Y;
        dst->pos_north_m = state.Position.Z;
        dst->vel_east_mps = vel.X;
        dst->vel_up_mps = vel.Y;
        dst->vel_north_mps = vel.Z;
        dst->fwd_east = fwd.X;
        dst->fwd_up = fwd.Y;
        dst->fwd_north = fwd.Z;
        dst->up_east = up.X;
        dst->up_up = up.Y;
        dst->up_north = up.Z;
        dst->speed_mps = state.Speed;
        dst->role = role;
        dst->alive = alive ? 1 : 0;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_contacts")]
    public static int ReadContacts(long handle, GunsSimContact* outContacts, int maxCount) {
        if (outContacts is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            SimulationSession session = slot.Session;
            int written = 0;
            if (session.OpponentPresent && written < maxCount) {
                WriteContact(&outContacts[written++], session.Bandit.State, role: 1,
                    session.PrimaryOpponentAlive, session.PrimaryOpponentHealth);
                foreach (Wingman wingman in session.Wingmen) {
                    if (written >= maxCount) break;
                    WriteContact(&outContacts[written++], wingman.Bandit.State, role: 2,
                        wingman.StillFighting,
                        session.PlayerGun.TargetHealthFor(wingman.PlayerGunTargetId));
                }
            }
            if (session.Relief is { } relief && written < maxCount) {
                WriteContact(&outContacts[written++], relief.State, role: 3,
                    relief.StillFighting, 1.0);
            }
            return written;
        }
    }

    static void WriteTracer(GunsSimTracer* dst, in GunRound round, int friendly) {
        dst->pos_east_m = round.Position.X;
        dst->pos_up_m = round.Position.Y;
        dst->pos_north_m = round.Position.Z;
        dst->vel_east_mps = round.Velocity.X;
        dst->vel_up_mps = round.Velocity.Y;
        dst->vel_north_mps = round.Velocity.Z;
        dst->age_s = round.AgeSeconds;
        dst->id = round.Id;
        dst->friendly = friendly;
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_tracers")]
    public static int ReadTracers(long handle, GunsSimTracer* outTracers, int maxCount) {
        if (outTracers is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            SimulationSession session = slot.Session;
            if (!session.OpponentPresent) return 0;
            int written = 0;
            foreach (GunRound round in session.PlayerGun.RoundsInFlight) {
                if (written >= maxCount) return written;
                WriteTracer(&outTracers[written++], round, friendly: 1);
            }
            if (session.Relief?.Gun is { } reliefGun) {
                foreach (GunRound round in reliefGun.RoundsInFlight) {
                    if (written >= maxCount) return written;
                    WriteTracer(&outTracers[written++], round, friendly: 1);
                }
            }
            foreach (GunRound round in session.FormationOpponentRoundsInFlight) {
                if (written >= maxCount) return written;
                WriteTracer(&outTracers[written++], round, friendly: 0);
            }
            return written;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_gates")]
    public static int ReadGates(long handle, GunsSimApproachGate* outGates, int maxCount) {
        if (outGates is null || maxCount <= 0 || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            IReadOnlyList<WorldApproachGate> gates = slot.Session.ApproachGuidancePlan.Gates;
            int written = Math.Min(gates.Count, maxCount);
            for (int i = 0; i < written; i++) {
                WorldApproachGate g = gates[i];
                outGates[i].east_m = g.EastM;
                outGates[i].north_m = g.NorthM;
                outGates[i].up_m = g.UpM;
                outGates[i].half_m = g.HalfM;
                outGates[i].target_alt_m = g.TargetAltitudeM;
                outGates[i].target_ktas = g.TargetKtas;
                outGates[i].distance_to_go_m = g.DistanceToGoM;
                outGates[i].pattern_leg = (int)g.PatternLeg;
                outGates[i].dirty_config = g.DirtyConfig ? 1 : 0;
                outGates[i].active = g.Active ? 1 : 0;
                outGates[i].reserved0 = 0;
            }
            return written;
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "guns_sim_read_runway")]
    public static int ReadRunway(long handle, GunsSimRunway* outRunway) {
        if (outRunway is null || FindSlot(handle) is not { } slot) return 0;
        lock (slot) {
            ConventionalRunway? runway = slot.Session.ConventionalRunwayRecovery?.Runway;
            if (runway is null) {
                *outRunway = default;
                return 0;
            }
            outRunway->threshold_east_m = runway.Threshold.X;
            outRunway->threshold_up_m = runway.Threshold.Y;
            outRunway->threshold_north_m = runway.Threshold.Z;
            outRunway->heading_rad = runway.HeadingRad;
            outRunway->length_m = runway.LengthM;
            outRunway->width_m = runway.WidthM;
            outRunway->touchdown_aim_along_m = runway.TouchdownAimAlongM;
            outRunway->present = 1;
            outRunway->reserved0 = 0;
            return 1;
        }
    }
}
