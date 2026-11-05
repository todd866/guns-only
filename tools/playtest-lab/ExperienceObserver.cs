using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.PlaytestLab;

public sealed class TimelineSecond {
    public double Second { get; set; }
    public double Duration { get; set; }
    public double SimSecond { get; set; }
    public double SimDuration { get; set; }
    public string Phase { get; set; } = "setup";
    public int Engagement { get; set; }
    public bool Threat { get; set; }
    public bool TargetInGunEnvelope { get; set; }
    public int RoundsFired { get; set; }
    public int HitsGiven { get; set; }
    public int HitsTaken { get; set; }
    public int Kills { get; set; }
    public int ShotNearMisses { get; set; }
    public int GroundNearMisses { get; set; }
    public double? G { get; set; }
    public double Energy { get; set; }
    public double ClearanceM { get; set; }
    public double AltitudeM { get; set; }
    public double SpeedMps { get; set; }
    public double HeadingRad { get; set; }
    public double? RunwayAlongM { get; set; }
    public double? RunwayCrossM { get; set; }
    public string RecoveryGate { get; set; } = "";
    public double CueHeadingErrorRad { get; set; }
    public double CueDistanceM { get; set; }
    public double BankRad { get; set; }
    public string CompressionInhibit { get; set; } = "";
    public string Gear { get; set; } = "";
    public double GearFraction { get; set; }
    public string PilotState { get; set; } = "";
    public double Tension { get; set; }
    public double DeadAirSeconds { get; set; }
    public double SimDeadAirSeconds { get; set; }
    public double ThreatSeconds { get; set; }
    public double SimThreatSeconds { get; set; }
    public double GunEnvelopeSeconds { get; set; }
    public double SimGunEnvelopeSeconds { get; set; }
    public Dictionary<string, double> PhaseSeconds { get; set; } = new();
    public Dictionary<string, double> SimPhaseSeconds { get; set; } = new();
    public List<string> Decisions { get; set; } = new();
    public List<string> Spectacles { get; set; } = new();
}
public sealed record EngagementTension(int Engagement, double Seconds, double SimSeconds, double Mean, double Peak);
public sealed record LabEvent(double Second, double SimSecond, string Kind, string Source, string Target, int Count);
public sealed class WaveContact {
    public int Wave { get; init; }
    public double PreviousWinSimSecond { get; init; }
    public double WarningSeconds { get; init; }
    public double? FirstThreatSimSecond { get; set; }
    public bool CanceledForRtb { get; set; }
}
public sealed class RunResult {
    public int SchemaVersion { get; init; } = 2;
    public int Beat { get; init; }
    public string Pilot { get; init; } = "";
    public int Seed { get; init; }
    public double Seconds { get; set; } // simulated, retained for schema-1 continuity
    public double PerceivedSeconds { get; set; }
    public Dictionary<int, double> CompressionSimSeconds { get; set; } = new();
    public Dictionary<string, double> CompressionInhibitSimSeconds { get; set; } = new();
    public double WallSeconds { get; set; }
    public bool Completed { get; set; }
    public string Outcome { get; set; } = "incomplete";
    public string SimOutcome { get; set; } = "None";
    public string TerminalState { get; set; } = "Flying";
    public bool Landed { get; set; }
    public bool SortieEndedEarly { get; set; }
    public bool CombatComplete { get; set; }
    public string RtbReason { get; set; } = "None";
    public string RunwayPhase { get; set; } = "Airborne";
    public string LandingDetail { get; set; } = "";
    public int Kills { get; set; }
    public int HitsGiven { get; set; }
    public int HitsTaken { get; set; }
    public int RoundsFired { get; set; }
    public int Decisions { get; set; }
    public int NearMisses => ShotNearMisses + GroundNearMisses;
    public int ShotNearMisses { get; set; }
    public int GroundNearMisses { get; set; }
    public double? TimeToFirstAction { get; set; }
    public double? SimTimeToFirstAction { get; set; }
    public double SimLongestDeadAirSeconds { get; set; }
    public double DeadAirSeconds { get; set; }
    public double SimDeadAirSeconds { get; set; }
    public double LongestDeadAirSeconds { get; set; }
    public double DeadAirExcludingRtbAutopilotSeconds { get; set; }
    public double SimDeadAirExcludingRtbAutopilotSeconds { get; set; }
    public double LongestDeadAirExcludingRtbAutopilotSeconds { get; set; }
    public double SimLongestDeadAirExcludingRtbAutopilotSeconds { get; set; }
    public int WavesWon { get; set; }
    public double CombatScore { get; set; }
    public double WaveScoreMultiplier { get; set; }
    public bool RtbBounceScheduled { get; set; }
    public bool RtbBounceSpawned { get; set; }
    public List<WaveContact> WaveContacts { get; set; } = new();
    public Dictionary<string, double> PhaseSeconds { get; set; } = new();
    public Dictionary<string, double> SimPhaseSeconds { get; set; } = new();
    public List<EngagementTension> EngagementTensions { get; set; } = new();
    public List<TimelineSecond> Timeline { get; set; } = new();
    public List<LabEvent> Events { get; set; } = new();
}

public sealed class ExperienceObserver {
    readonly Options options;
    readonly RunResult result;
    readonly Dictionary<int, (double Seconds, double SimSeconds, double Sum, double Peak)> engagements = new();
    readonly HashSet<GunKill> hostileGuns = new();
    readonly HashSet<GunRound> authoritativeRounds = new();
    readonly Dictionary<(GunKill Gun, int Id), ShotTrack> shots = new();
    readonly HashSet<(GunKill Gun, int Id)> liveShots = new();
    readonly List<(GunKill Gun, int Id)> retiredShots = new();
    TimelineSecond bin = new();
    int ticks, rounds, given, taken, kills;
    double gSum, energySum, tensionSum, deadRun, simDeadRun, perceived;
    double measuredDeadRun, measuredSimDeadRun;
    long eventCursor;
    bool lowGround;
    Vec3D playerBefore;
    sealed class ShotTrack {
        public Vec3D Relative;
        public double Closest = double.PositiveInfinity;
        public bool Counted;
        public double Radius;
    }
    public ExperienceObserver(Options options, string pilot, int seed) {
        this.options = options;
        result = new RunResult { Beat = options.Beat, Pilot = pilot, Seed = seed };
    }
    public void BeforeStep(SimulationSession s) {
        if (s.CasevacMission) return;
        playerBefore = s.Player.State.Position;
        if (!s.OpponentPresent) return;
        hostileGuns.Add(s.OpponentGun);
        foreach (var wing in s.Wingmen) hostileGuns.Add(wing.Gun);
        foreach (var gun in hostileGuns)
        foreach (var round in gun.RoundsInFlight) {
            var key = (gun, round.Id);
            if (!shots.ContainsKey(key)) shots[key] = new ShotTrack { Relative = round.Position - playerBefore, Radius = round.EffectiveHitRadiusM };
        }
    }
    // Called once per completed production tick. Factor is negotiated BEFORE that
    // tick; a safety hand-back at its end affects the next tick, never its dt.
    public void Observe(SimulationSession s, IReadOnlyList<string> decisions, int entryFactor = 1, string inhibitReason = "Unknown") {
        if (entryFactor is not (1 or 2 or 4 or 8)) throw new ArgumentOutOfRangeException(nameof(entryFactor));
        bool rotary = s.CasevacMission;
        double simDt = SortieRunner.Dt, dt = simDt / entryFactor;
        double simStart = ticks * simDt;
        bool alive = rotary ? s.CasevacFlight!.VehicleObservation.Flyable : s.PlayerAlive;
        Vec3D position = rotary ? s.CasevacFlight!.VehicleObservation.PositionWorldM : s.Player.State.Position;
        double speed = rotary ? s.CasevacFlight!.VehicleObservation.TrueAirspeedMps : s.Player.State.Speed;
        double clearance = rotary ? s.CasevacFlight!.LastTickObservation?.ClearanceM ?? 0 : Clearance(s, position);
        double g = rotary ? 0 : s.Player.LastNz;
        double energy = position.Y + speed * speed / (2 * FlightModel.G0);
        (bool threat, double proximity, double closure) = rotary ? (false, 0, 0) : Threat(s);
        // Keep arrival evidence separate from the broad action/dead-air proxy:
        // pilot decisions cannot reset this win-to-physical-threat clock.
        if (s.EscalatingWavesEnabled) {
            int nextWave = s.EngagementsWon + 1;
            if (s.IncomingWaveBearingRad is not null
                && !result.WaveContacts.Any(w => w.Wave == nextWave))
                result.WaveContacts.Add(new WaveContact {
                    Wave = nextWave,
                    PreviousWinSimSecond = s.TimeSeconds,
                    WarningSeconds = s.OpponentReplacementSeconds,
                });
            foreach (var contact in result.WaveContacts.Where(w => w.FirstThreatSimSecond is null && !w.CanceledForRtb)) {
                if (s.PlayerRtbActive || s.CombatHandoffRequested) contact.CanceledForRtb = true;
                else if (s.EngagementNumber == contact.Wave && threat)
                    contact.FirstThreatSimSecond = s.TimeSeconds;
            }
        }
        bool target = !rotary && s.SelectedOpponentAlive && s.PlayerWeaponsAuthorized && s.PlayerGun.GunSolution;
        string phase = Phase(s, threat);
        int dr = s.SortiePlayerRoundsFired - rounds, dh = s.SortiePlayerHits - given,
            dtaken = s.PlayerHitsTaken - taken, dk = s.KillCount - kills;
        rounds += dr; given += dh; taken += dtaken; kills += dk;
        int shotMisses = rotary ? 0 : ObserveShots(s);
        bool excludeGround = phase is "approach" or "landing" or "dead" or "finished";
        bool closeGround = alive && !excludeGround && clearance >= 0 && clearance < options.GroundMissM;
        int groundMisses = closeGround && !lowGround ? 1 : 0;
        if (closeGround) lowGround = true;
        else if (excludeGround || clearance >= options.GroundMissM + 25) lowGround = false;
        var spectacles = CaptureEvents(s, perceived, simStart, dt, simDt);
        foreach (string decision in decisions)
            result.Events.Add(new LabEvent(perceived + dt, simStart + simDt, "decision:" + decision, "pilot", "", 1));
        bool action = threat || target || dr > 0 || decisions.Count > 0 || spectacles.Count > 0
            || dh > 0 || dtaken > 0 || dk > 0 || shotMisses + groundMisses > 0;
        // First action is the start of the observed tick interval, as in schema 1;
        // event stamps remain authoritative tick-end times (at most one tick later).
        if (action && result.TimeToFirstAction is null) {
            result.TimeToFirstAction = perceived; result.SimTimeToFirstAction = simStart;
        }
        bool deliberateRtbAutopilot = !rotary && s.PlayerRtbActive && s.RtbAutopilotActive && !s.RtbBounceActive;
        if (action) deadRun = simDeadRun = 0;
        else {
            deadRun += dt; simDeadRun += simDt;
            result.DeadAirSeconds += dt; result.SimDeadAirSeconds += simDt;
            result.LongestDeadAirSeconds = Math.Max(result.LongestDeadAirSeconds, deadRun);
            result.SimLongestDeadAirSeconds = Math.Max(result.SimLongestDeadAirSeconds, simDeadRun);
        }
        if (action || deliberateRtbAutopilot) measuredDeadRun = measuredSimDeadRun = 0;
        else {
            measuredDeadRun += dt; measuredSimDeadRun += simDt;
            result.DeadAirExcludingRtbAutopilotSeconds += dt;
            result.SimDeadAirExcludingRtbAutopilotSeconds += simDt;
            result.LongestDeadAirExcludingRtbAutopilotSeconds = Math.Max(result.LongestDeadAirExcludingRtbAutopilotSeconds, measuredDeadRun);
            result.SimLongestDeadAirExcludingRtbAutopilotSeconds = Math.Max(result.SimLongestDeadAirExcludingRtbAutopilotSeconds, measuredSimDeadRun);
        }
        double tension = Math.Clamp(.35 * proximity + .15 * closure + (threat ? .25 : 0)
            + (threat && !rotary ? .15 * (1 - s.PlayerHealth) : 0)
            + (alive && !excludeGround ? .1 * Math.Clamp(1 - clearance / options.GroundMissM, 0, 1) : 0), 0, 1);
        if (shotMisses > 0) tension = Math.Max(.85, tension);
        if (dtaken > 0) tension = Math.Max(.95, tension);
        if (!rotary && alive && (!s.PlayerRtbActive || s.RtbBounceActive) && s.LiveOpponentCount > 0) {
            int engagement = s.EngagementNumber;
            var total = engagements.GetValueOrDefault(engagement);
            engagements[engagement] = (total.Seconds + dt, total.SimSeconds + simDt, total.Sum + tension * dt, Math.Max(total.Peak, tension));
        }
        result.PhaseSeconds[phase] = result.PhaseSeconds.GetValueOrDefault(phase) + dt;
        result.SimPhaseSeconds[phase] = result.SimPhaseSeconds.GetValueOrDefault(phase) + simDt;
        result.CompressionInhibitSimSeconds[inhibitReason] = result.CompressionInhibitSimSeconds.GetValueOrDefault(inhibitReason) + simDt;
        result.CompressionSimSeconds[entryFactor] = result.CompressionSimSeconds.GetValueOrDefault(entryFactor) + simDt;
        // A factor change may put a physics tick across a perceived-second edge.
        // Split duration/weighted observables, but count discrete events only once.
        double remaining = dt, used = 0;
        while (remaining > 1e-12) {
            if (bin.Duration == 0) { bin.Second = result.Timeline.Count; bin.SimSecond = simStart + used * entryFactor; }
            double piece = Math.Min(remaining, 1 - bin.Duration), simPiece = piece * entryFactor;
            bool last = remaining - piece < 1e-12;
            bin.ClearanceM = bin.Duration == 0 ? clearance : Math.Min(bin.ClearanceM, clearance);
            bin.Duration += piece; bin.SimDuration += simPiece;
            bin.PhaseSeconds[phase] = bin.PhaseSeconds.GetValueOrDefault(phase) + piece;
            bin.SimPhaseSeconds[phase] = bin.SimPhaseSeconds.GetValueOrDefault(phase) + simPiece;
            if (!action) { bin.DeadAirSeconds += piece; bin.SimDeadAirSeconds += simPiece; }
            bin.Threat |= threat; bin.TargetInGunEnvelope |= target;
            bin.ThreatSeconds += threat ? piece : 0; bin.SimThreatSeconds += threat ? simPiece : 0;
            bin.GunEnvelopeSeconds += target ? piece : 0; bin.SimGunEnvelopeSeconds += target ? simPiece : 0;
            if (last) {
                bin.RoundsFired += dr; bin.HitsGiven += dh; bin.HitsTaken += dtaken; bin.Kills += dk;
                bin.ShotNearMisses += shotMisses; bin.GroundNearMisses += groundMisses;
                bin.Decisions.AddRange(decisions); bin.Spectacles.AddRange(spectacles);
            }
            bin.Engagement = rotary || s.PlayerRtbActive || !alive ? 0 : s.EngagementNumber;
            bin.AltitudeM = position.Y; bin.SpeedMps = speed;
            bin.HeadingRad = rotary ? s.CasevacFlight!.VehicleObservation.YawRad : s.Player.State.Chi;
            if (!rotary && s.ConventionalRunwayRecovery is { } runway) {
                var frame = runway.Runway.Frame(position);
                bin.RunwayAlongM = frame.along; bin.RunwayCrossM = frame.cross;
            }
            bin.CompressionInhibit = inhibitReason;
            if (!rotary && s.ApproachGuidancePlan.Gates.Count > 0) {
                var cue = s.ApproachGuidancePlan.Gates[0];
                double dx = cue.EastM - position.X, dz = cue.NorthM - position.Z;
                bin.CueDistanceM = Math.Sqrt(dx * dx + dz * dz);
                bin.CueHeadingErrorRad = Math.IEEERemainder(Math.Atan2(dx, dz) - s.Player.State.Chi, 2 * Math.PI);
                bin.BankRad = s.Player.State.Bank;
            }
            bin.RecoveryGate = rotary ? s.CasevacFlight!.Snapshot.Phase.ToString() : s.ApproachGuidancePlan.NextLabel;
            if (!rotary) { bin.Gear = s.PlayerSystems.GearHandle.ToString(); bin.GearFraction = s.PlayerSystems.EffectiveGearFraction; bin.PilotState = s.PilotState + (s.PilotControlInterlocked ? ":interlocked" : ""); }
            gSum += g * piece; energySum += energy * piece; tensionSum += tension * piece;
            used += piece; remaining -= piece;
            if (bin.Duration >= 1 - 1e-12) Flush(rotary);
        }
        perceived += dt; ticks++;
    }
    List<string> CaptureEvents(SimulationSession s, double playerStart, double simStart, double playerDt, double simDt) {
        var spectacles = new List<string>();
        foreach (var e in s.RecentEvents) {
            if (e.Sequence <= eventCursor) continue;
            eventCursor = e.Sequence;
            double simTime = e.Tick * SortieRunner.Dt;
            double time = playerStart + (simDt > 0 ? Math.Clamp((simTime - simStart) / simDt, 0, 1) * playerDt : 0);
            string kind = e.Type.ToString();
            result.Events.Add(new LabEvent(time, simTime, kind, e.Source.ToString(), e.Target.ToString(), e.Count));
            if (e.Type is SessionEventType.Hit or SessionEventType.Destroyed or SessionEventType.Impact)
                spectacles.Add(e.Type is SessionEventType.Destroyed or SessionEventType.Impact
                    ? "explosion-proxy:" + kind + ":" + e.Target : "hit:" + e.Target);
        }
        return spectacles;
    }
    // End and CASEVAC acknowledgement can finish between physics ticks. Preserve
    // their events/decisions without inventing another tick or a landing duration.
    public void ObserveTerminal(SimulationSession s, IReadOnlyList<string> decisions) {
        CaptureEvents(s, perceived, ticks * SortieRunner.Dt, 0, 0);
        foreach (string decision in decisions)
            result.Events.Add(new LabEvent(perceived, ticks * SortieRunner.Dt, "decision:" + decision, "pilot", "", 1));
        var last = bin.Duration > 0 ? bin : result.Timeline.LastOrDefault();
        last?.Decisions.AddRange(decisions);
    }
    void Flush(bool rotary) {
        if (bin.Duration == 0) return;
        bin.Phase = bin.PhaseSeconds.OrderByDescending(x => x.Value).First().Key;
        bin.G = rotary ? null : gSum / bin.Duration;
        bin.Energy = energySum / bin.Duration;
        bin.Tension = tensionSum / bin.Duration;
        result.Timeline.Add(bin);
        bin = new TimelineSecond(); gSum = energySum = tensionSum = 0;
    }
    int ObserveShots(SimulationSession s) {
        int count = 0;
        liveShots.Clear();
        authoritativeRounds.Clear();
        foreach (var round in s.FormationOpponentRoundsInFlight)
            if (round.AimTargetId == 0) authoritativeRounds.Add(round); // legacy target 0 is the player; exclude relief-targeted rounds
        Vec3D player = s.Player.State.Position;
        foreach (var gun in hostileGuns) {
            foreach (var impact in gun.ImpactsThisStep) shots.Remove((gun, impact.RoundId));
            foreach (var round in gun.RoundsInFlight) {
                if (!authoritativeRounds.Contains(round)) continue;
                var key = (gun, round.Id); liveShots.Add(key);
                Vec3D relative = round.Position - player;
                if (!shots.TryGetValue(key, out var track)) {
                    // New round may have crossed the near-miss shell inside this tick.
                    track = new ShotTrack { Relative = relative - (round.Velocity - s.Player.State.VelocityVector()) * Math.Min(round.AgeSeconds, SortieRunner.Dt), Radius = round.EffectiveHitRadiusM };
                    shots[key] = track;
                }
                track.Closest = Math.Min(track.Closest, SegmentDistance(track.Relative, relative));
                // Only count once it is receding; a future actual hit is not a near miss.
                if (!track.Counted && relative.Dot(round.Velocity - s.Player.State.VelocityVector()) > 0
                    && track.Closest > track.Radius && track.Closest <= options.ShotMissM && s.PlayerAlive) {
                    count++; track.Counted = true;
                }
                track.Relative = relative;
            }
        }
        retiredShots.Clear();
        foreach (var (key, track) in shots) if (!liveShots.Contains(key)) retiredShots.Add(key);
        foreach (var key in retiredShots) shots.Remove(key);
        return count;
    }
    public static double SegmentDistance(Vec3D from, Vec3D to) {
        Vec3D d = to - from;
        double dd = d.Dot(d);
        double t = dd > 1e-12 ? Math.Clamp(-from.Dot(d) / dd, 0, 1) : 0;
        return (from + d * t).Length;
    }
    (bool Threat, double Proximity, double Closure) Threat(SimulationSession s) {
        if (!s.PlayerAlive || !s.OpponentPresent) return (false, 0, 0);
        bool threat = false;
        double proximity = 0, closure = 0;
        void Actor(AircraftState b, bool firing) {
            var p = s.Player.State;
            var delta = p.Position - b.Position;
            double range = delta.Length;
            if (range < 1e-6) return;
            Vec3D line = delta * (1 / range);
            double nose = Math.Acos(Math.Clamp(b.ForwardDir().Dot(line), -1, 1));
            threat |= (range < options.ThreatRangeM && nose < 35 * Math.PI / 180) || firing;
            proximity = Math.Max(proximity, Math.Clamp(1 - range / options.ThreatRangeM, 0, 1));
            if (range < options.ThreatRangeM) closure = Math.Max(closure, Math.Clamp(-(p.VelocityVector() - b.VelocityVector()).Dot(line) / 300, 0, 1));
        }
        if (s.PrimaryOpponentAlive) Actor(s.Bandit.State, s.OpponentTriggerDown);
        foreach (var w in s.Wingmen) if (w.StillFighting) Actor(w.Bandit.State, w.TriggerDown);
        return (threat, proximity, closure);
    }
    string Phase(SimulationSession s, bool threat) {
        if (s.Lifecycle == SimulationSession.LifecycleState.Finished) return "finished";
        if (s.CasevacMission) return s.CasevacFlight!.Snapshot.Phase switch {
            CasevacPhase.AircraftLost => "dead",
            CasevacPhase.PickupApproach or CasevacPhase.DropoffApproach => "approach",
            CasevacPhase.Loading or CasevacPhase.Handoff => "landing",
            CasevacPhase.Outbound or CasevacPhase.AbortReturn => "RTB",
            _ => "transit"
        };
        if (!s.PlayerAlive) return "dead";
        if (s.RunwayWeightOnWheels || s.ConventionalRunwayPhase == RunwayRecoveryPhase.Rollout || s.Recovery == Carrier.Recovery.Trap) return "landing";
        if ((s.PlayerRtbActive && !s.RtbBounceActive) || (!s.OpponentPresent && s.Beat.RecoveryCompletesSortie && !s.RtbBounceActive)) {
            var g = s.ApproachGuidancePlan;
            if (s.ConventionalRunwayRecovery is { } recovery) {
                var frame = recovery.Runway.Frame(s.Player.State.Position);
                double error = Math.Abs(Math.Atan2(Math.Sin(s.Player.State.Chi - recovery.Runway.HeadingRad), Math.Cos(s.Player.State.Chi - recovery.Runway.HeadingRad)));
                if (s.PlayerSystems.AllGearDownAndLocked && frame.along is > -13000 and < 2000
                    && Math.Abs(frame.cross) < 1800 && error < .5 && frame.height < 1000) return "approach";
            }
            return g.InGroove || g.ActivePatternLeg is ApproachPatternLeg.Base or ApproachPatternLeg.Final or ApproachPatternLeg.Threshold || s.Controls.ApproachMode ? "approach" : "RTB";
        }
        if (s.TimeSeconds < 1) return "setup";
        if (s.LiveOpponentCount == 0) return "transit";
        if (threat && (!s.PlayerGun.GunSolution || s.PlayerHealth < .5)) return "defensive";
        if (s.Bandit.Presenting || s.Bandit is NeutralMergeBandit { FirstPassComplete: false }) return "merge";
        return "fight";
    }
    public RunResult Finish(SimulationSession s, double wall) {
        Flush(s.CasevacMission);
        result.Seconds = ticks * SortieRunner.Dt; result.PerceivedSeconds = perceived; result.WallSeconds = wall;
        result.SortieEndedEarly = s.SortieEndedEarly;
        result.Completed = s.Lifecycle == SimulationSession.LifecycleState.Finished;
        result.SimOutcome = s.Outcome.ToString(); result.TerminalState = s.PlayerTerminalState.ToString();
        result.Landed = s.ConventionalRtbRecoveryCompleted || s.ConventionalRunwayPhase == RunwayRecoveryPhase.Recovered || s.Recovery == Carrier.Recovery.Trap;
        result.CombatComplete = s.FiniteCombatComplete;
        result.WavesWon = s.EngagementsWon;
        result.CombatScore = s.CombatScore;
        result.WaveScoreMultiplier = s.WaveScoreMultiplier;
        result.RtbBounceScheduled = s.RtbBounceScheduled;
        result.RtbBounceSpawned = s.RtbBounceSpawned;
        result.RtbReason = s.ReturnToBaseReason.ToString(); result.RunwayPhase = s.ConventionalRunwayPhase.ToString();
        result.LandingDetail = s.RunwayTouchdown.ToString();
        bool crashed = s.PlayerImpactSurface is ImpactSurface.Ground or ImpactSurface.Water or ImpactSurface.CarrierStructure or ImpactSurface.FlightDeck
            || s.ConventionalRunwayPhase is RunwayRecoveryPhase.Crashed or RunwayRecoveryPhase.Excursion;
        // A shot-down wreck touching the ground is a combat loss, not a second crash category.
        if (s.PlayerHitsTaken >= s.Beat.CombatRules.PlayerHitsToDefeat) crashed = false;
        result.Outcome = !result.Completed ? "incomplete" : crashed ? "crash" : s.Outcome switch {
            SortieOutcome.Victory => "win", SortieOutcome.Defeat => "loss",
            SortieOutcome.Draw => "draw", _ => result.Landed ? "recovered" : "draw"
        };
        result.RoundsFired = rounds; result.HitsGiven = given; result.HitsTaken = taken; result.Kills = kills;
        result.Decisions = result.Timeline.Sum(t => t.Decisions.Count);
        result.ShotNearMisses = result.Timeline.Sum(t => t.ShotNearMisses);
        result.GroundNearMisses = result.Timeline.Sum(t => t.GroundNearMisses);
        result.EngagementTensions = engagements.OrderBy(x => x.Key).Select(x => new EngagementTension(x.Key, x.Value.Seconds, x.Value.SimSeconds, x.Value.Sum / x.Value.Seconds, x.Value.Peak)).ToList();
        return result;
    }
    public static double Clearance(SimulationSession s, Vec3D position) {
        double ground = 0;
        if (s.Terrain is { } terrain && terrain.TryHeightM(position.X, position.Z, out double h)) ground = h;
        return position.Y - ground;
    }
}
