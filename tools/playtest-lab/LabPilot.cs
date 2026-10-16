using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;

namespace GunsOnly.PlaytestLab;

/// Adapts BanditPressureReport's pursuit/energy controller, with delayed observations
/// as in FirstMergeOpeningAcceptanceTests. No writes to aircraft state or damage.
public sealed class LabPilot {
    readonly string name;
    readonly ClonedPilotPolicy? clone;
    readonly CasevacPilot casevac;
    readonly PathfinderPilot pathfinder;
    readonly int latency, rtbAfter;
    readonly double handsOff, aimBias;
    readonly Queue<(long Tick, AircraftState State, Vec3D Lead, bool Solution)> observations = new();
    readonly List<string> decisions = new();
    readonly RecoveryPilot recovery = new();
    readonly HudCuePilot hud;
    bool trigger, rtbObserved, bingoObserved;
    string mode = "setup", candidateMode = "setup";
    double candidateSince;
    long targetId;
    public LabPilot(string name, int seed, ClonedPilotPolicy? clone, int rtbAfter) {
        this.name = name; this.clone = clone; this.rtbAfter = rtbAfter;
        casevac = new CasevacPilot(name is "clone" or "novice" or "ace" ? name : "ace", seed);
        pathfinder = new PathfinderPilot(name, seed, rtbAfter);
        // Explicit integer PRNG: reproducible on all .NET 8 hosts, no global RNG.
        uint state = unchecked((uint)seed + 0x9e3779b9u);
        // Avalanche adjacent integer seeds before drawing; otherwise several nearby
        // seeds can quantize to the same 20 Hz clone start time.
        state = unchecked((state ^ (state >> 16)) * 0x85ebca6bu);
        state = unchecked((state ^ (state >> 13)) * 0xc2b2ae35u);
        state ^= state >> 16;
        double Draw() { state ^= state << 13; state ^= state >> 17; state ^= state << 5; return state / 4294967296.0; }
        double reaction = Draw(), start = Draw(), bias = Draw();
        latency = (int)Math.Round((name == "novice" ? .8 + .6 * reaction : .15 + .15 * reaction) * AircraftSim.TickHz);
        handsOff = name == "novice" ? 2 + 3 * start : .3 + 1.2 * start;
        aimBias = (bias - .5) * (name == "novice" ? 4 : .3) * Math.PI / 180;
        hud = new HudCuePilot(.20 + .1 * reaction, 1 + .35 * (seed % 8));
    }

    public IReadOnlyList<string> Drive(SimulationSession s) {
        decisions.Clear();
        if (s.Pathfinder is not null) return pathfinder.Drive(s);
        if (s.CasevacMission) { SetMode(casevac.Drive(s), s.TimeSeconds); return decisions; }
        if (!s.PlayerAlive) { Fire(s, false); return decisions; }
        if (s.PlayerFuel.IsBingo && !bingoObserved) { bingoObserved = true; decisions.Add("bingo:acknowledge"); }
        bool empty = s.OpponentPresent && s.PlayerGun.AmmoRemaining == 0;
        if (s.ReturnToBaseAvailable && (s.FiniteCombatComplete || s.PlayerFuel.IsBingo || empty || s.TimeSeconds >= rtbAfter)) {
            if (s.TryRequestReturnToBase(s.PlayerFuel.IsBingo ? MissionRtbReason.BingoFuel : MissionRtbReason.PilotKnockItOff))
                decisions.Add("RTB:" + (s.FiniteCombatComplete ? "combat-complete" : s.PlayerFuel.IsBingo ? "bingo" : empty ? "ammo-empty" : "combat-budget"));
        }
        if (s.PlayerRtbActive && !rtbObserved) {
            if (!decisions.Any(d => d.StartsWith("RTB:"))) decisions.Add("RTB:accept-mission-handoff");
            rtbObserved = true;
        }
        bool recover = s.PlayerRtbActive || (!s.OpponentPresent && !s.Beat.StartsOnCatapult)
            || (s.Beat.RecoveryCompletesSortie && s.LiveOpponentCount == 0);
        if (recover) {
            Fire(s, false);
            SetMode(recovery.Drive(s), s.TimeSeconds);
            return decisions;
        }
        if (s.SelectedOpponentAlive && s.PlayerGun.SelectedTargetId != targetId) {
            observations.Clear();
            if (targetId != 0) decisions.Add("target:acquire-successor");
            targetId = s.PlayerGun.SelectedTargetId;
        }
        if (name == "ace" && ExperienceObserver.Clearance(s, s.Player.State.Position + s.Player.State.VelocityVector() * 8) > 600) {
            s.Controls.ScriptedPilotOverride = null;
            bool fire = hud.Drive(s);
            Fire(s, fire && s.PlayerWeaponsAuthorized);
            SetMode(s.TimeSeconds < hud.HandsOffSeconds ? "setup" : fire ? "shoot" : "track-cue", s.TimeSeconds);
            return decisions;
        }
        if (s.SelectedOpponentAlive) {
            observations.Enqueue((s.Tick, s.SelectedOpponentState, s.PlayerGun.LeadDirection, s.PlayerGun.GunSolution));
        }
        if (s.TimeSeconds < handsOff || observations.Count <= latency || !s.SelectedOpponentAlive) {
            s.Controls.ScriptedPilotOverride = new PilotCommand(1, 0, .9, 0);
            Fire(s, false);
            SetMode(s.TimeSeconds < handsOff ? "setup" : "search", s.TimeSeconds);
            if (!s.SelectedOpponentAlive) observations.Clear();
            return decisions;
        }
        var seen = observations.Dequeue();
        AircraftState own = s.Player.State;
        if (name == "clone") {
            if (s.Tick % 6 == 0) {
                var observation = CombatPolicyObservation.Capture(s.Tick, s.TimeSeconds, own,
                    // Use the synchronous feature contract it learned. Extra delayed-contact
                    // distortion would test a different observation distribution, not the clone.
                    ActorObservation.Capture(s.SelectedOpponentState, s.Tick), s.PlayerGun.AmmoRemaining, s.PlayerWeaponsAuthorized);
                CombatPolicyDecision command = clone!.Decide(observation);
                s.Controls.ScriptedPilotOverride = command.Command;
                Fire(s, command.WantsToFire && s.PlayerWeaponsAuthorized);
                SetMode(command.WantsToFire ? "shoot" : command.Command.GDemand > 3 ? "turn" : "extend", s.TimeSeconds);
            }
            return decisions;
        }
        double maxG = name == "novice" ? 3.2 : 8;
        double maxBank = (name == "novice" ? 65 : 110) * Math.PI / 180;
        double range = (seen.State.Position - own.Position).Length;
        Vec3D aim = seen.State.Position + seen.State.VelocityVector() * (range / 1000 * (name == "novice" ? .25 : .9));
        aim += new Vec3D(0, Math.Sin(aimBias) * range, 0);
        double aheadClearance = ExperienceObserver.Clearance(s, own.Position + own.VelocityVector() * 3);
        if (Math.Min(ExperienceObserver.Clearance(s, own.Position), aheadClearance) < (name == "novice" ? 220 : 500)) {
            s.Controls.ScriptedPilotOverride = new PilotCommand(Math.Min(maxG, 4), 0, 1, 0);
            Fire(s, false); SetMode("terrain-escape", s.TimeSeconds); return decisions;
        }
        double angle = Math.Acos(Math.Clamp(own.ForwardDir().Dot((aim - own.Position).Normalized()), -1, 1));
        double bank = Math.Clamp(Geometry.BankToPlaceLiftVectorOn(own, aim), -maxBank, maxBank);
        double g = Math.Clamp(1 + angle * (name == "novice" ? 1.8 : 3), .5, maxG);
        // The novice keeps pulling while slow; the ace unloads to recover energy.
        bool slow = name == "ace" && own.Speed < 200;
        if (slow) g = 1;
        double throttle = name == "novice" ? .67 : own.Speed < 270 ? 1 : .9;
        s.Controls.ScriptedPilotOverride = new PilotCommand(g, bank, throttle, 0);
        bool shot = range is > 120 and < 850 && (name == "ace" ? seen.Solution || angle < 1.5 * Math.PI / 180 : angle < 4 * Math.PI / 180);
        Fire(s, shot && s.PlayerWeaponsAuthorized);
        SetMode(shot ? "shoot" : slow ? "energy-recovery" : angle > .2 ? "turn" : "pursue", s.TimeSeconds);
        return decisions;
    }
    void SetMode(string next, double seconds) {
        if (next != candidateMode) { candidateMode = next; candidateSince = seconds; }
        // A stable tactical change is a decision; servo flutter at 120 Hz is not.
        if (next != mode && seconds - candidateSince >= .5) {
            decisions.Add("mode:" + mode + "->" + next); mode = next;
        }
    }
    void Fire(SimulationSession s, bool value) {
        if (trigger == value) return;
        trigger = value; s.FeedKey(GKey.Trigger, value);
    }
}

// Port of FirstMergeOpeningAcceptanceTests.HudPilot: delay the observed body-frame
// cue, NOT a world cue projected into the pilot's future attitude. Preserve the
// authored trim throttle during the opening instead of accelerating out of the shot.
public sealed class HudCuePilot(double reactionSeconds, double handsOffSeconds) {
    readonly Queue<(double Up, double Right, bool Solution, double Range, bool Valid)> seen = new();
    readonly int latency = Math.Max(1, (int)Math.Round(reactionSeconds * AircraftSim.TickHz));
    double pitch, roll;
    public double HandsOffSeconds => handsOffSeconds;
    public bool Drive(SimulationSession s) {
        bool valid = s.SelectedOpponentAlive;
        double up = 0, right = 0, range = double.PositiveInfinity;
        bool solution = false;
        if (valid) {
            Vec3D to = s.SelectedOpponentState.Position - s.Player.State.Position;
            range = to.Length;
            Vec3D cue = s.PlayerGun.HasLeadSolution ? s.PlayerGun.LeadDirection : to.Normalized();
            double cf = Math.Max(1e-6, cue.Dot(s.Player.BodyForward));
            up = Math.Atan2(cue.Dot(s.Player.BodyUp), cf) * 180 / Math.PI;
            right = Math.Atan2(cue.Dot(s.Player.BodyRight), cf) * 180 / Math.PI;
            if (cue.Dot(s.Player.BodyForward) <= 0) {
                up = Math.Sign(cue.Dot(s.Player.BodyUp) + 1e-9) * 90;
                right = Math.Sign(cue.Dot(s.Player.BodyRight)) * 90;
            }
            solution = s.PlayerGun.GunSolution;
        }
        seen.Enqueue((up, right, solution, range, valid));
        var picture = seen.Count > latency ? seen.Dequeue() : (Up: 0d, Right: 0d, Solution: false, Range: double.PositiveInfinity, Valid: false);
        double targetPitch = 0, targetRoll = 0;
        bool fire = false;
        if (picture.Valid && s.TimeSeconds >= handsOffSeconds) {
            targetRoll = Math.Clamp(.04 * picture.Right, -.35, .35);
            targetPitch = Math.Clamp(.045 * picture.Up, -.3, .6);
            fire = picture.Solution && picture.Range < 900;
        }
        double step = 3 * SortieRunner.Dt;
        pitch += Math.Clamp(targetPitch - pitch, -step, step);
        roll += Math.Clamp(targetRoll - roll, -step, step);
        if (s.TimeSeconds >= handsOffSeconds) { s.SetAnalogPitchControl(pitch); s.SetAnalogRollControl(roll); }
        return fire;
    }
}

/// Shared navigation/recovery adapter. Follows the published gate and energy schedule;
/// final pitch/speed feedback follows RecoveryProfileFlightTests. Physical contact and
/// debrief are exclusively the session's responsibility.
public sealed class RecoveryPilot {
    double speedIntegral;
    bool joinedFinal;
    bool goingAround;
    bool inbound;
    double outboundSide;
    public string Drive(SimulationSession s) {
        var own = s.Player.State;
        if (s.RunwayWeightOnWheels || s.ConventionalRunwayPhase == RunwayRecoveryPhase.Rollout
            || s.Recovery == Carrier.Recovery.Trap) {
            Apply(s, new PilotCommand(1, 0, 0, 0)); return "rollout";
        }
        var guidance = s.ApproachGuidancePlan;
        Vec3D destination;
        double targetSpeed, targetHeight;
        bool final = guidance.InGroove || guidance.ActivePatternLeg is ApproachPatternLeg.Final or ApproachPatternLeg.Threshold;
        if (guidance.Valid && guidance.Gates.Count > 0) {
            WorldApproachGate gate = guidance.Gates.FirstOrDefault(g => g.Active);
            if (gate.Id is null) gate = guidance.Gates[0];
            destination = new Vec3D(gate.EastM, gate.UpM, gate.NorthM);
            targetHeight = guidance.NextAltitudeM;
            targetSpeed = Math.Max(40, guidance.NextTrueAirspeedMps);
        } else if (s.Carrier is { } ship) {
            destination = ship.ApproachCuePoint;
            targetHeight = destination.Y;
            targetSpeed = 1.1 * SortieSchedule.ApproachTrueAirspeedMps(own.Mass, s.Beat.PlayerAir,
                s.Beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis, own.Position.Y);
        } else {
            destination = s.Beat.RecoveryPlan?.Position ?? own.Position + own.ForwardDir() * 10000;
            targetHeight = destination.Y + 500;
            targetSpeed = 200;
        }
        // Use a common, explicit straight-in join for the lab. Chasing the overhead
        // director's current gate alone can orbit a gate whose capture also requires
        // alignment with the NEXT leg. This controller owns navigation, never recovery
        // credit; the same production runway still decides touchdown and full stop.
        if (s.ConventionalRunwayRecovery is { } conventional) {
            var runway = conventional.Runway;
            var frame = runway.Frame(own.Position);
            double alignment = Math.Abs(Math.Atan2(Math.Sin(own.Chi - runway.HeadingRad), Math.Cos(own.Chi - runway.HeadingRad)));
            if (joinedFinal && frame.along > runway.TouchdownAimAlongM + 600) {
                joinedFinal = false; inbound = false; goingAround = true; speedIntegral = 0;
            }
            if (goingAround && frame.height > 450 && own.Speed > 130) goingAround = false;
            if (!goingAround && !joinedFinal && frame.along is < -3500 and > -16000 && Math.Abs(frame.cross) < 1600
                && alignment < .35 && frame.height is > 200 and < 950) joinedFinal = true;
            final = joinedFinal;
            // A fixed waypoint can become an endless orbit. Fly an outbound
            // parallel course, then a cross-track inbound intercept with room to turn.
            if (outboundSide == 0) outboundSide = frame.cross < 0 ? -1 : 1;
            if (!inbound && frame.along < -16000 && frame.height is > 200 and < 950) inbound = true;
            if (inbound && !final && frame.along > -3500) inbound = false;
            double course = inbound
                ? runway.HeadingRad + Math.Clamp(Math.Atan2(-frame.cross, 5000), -.8, .8)
                : runway.HeadingRad + Math.PI + Math.Clamp(Math.Atan2(frame.cross - outboundSide * 6000, 5000), -.8, .8);
            destination = own.Position + new Vec3D(Math.Sin(course), 0, Math.Cos(course)) * 5000;
            targetHeight = runway.Threshold.Y + 600;
            targetSpeed = 150;
            if (goingAround) destination = own.Position + own.ForwardDir() * 4000;
            if (!final && frame.height > 100 && s.PlayerSystems.GearHandle == LandingGearHandle.Down)
                Press(s, GKey.GearToggle);
        }
        double desiredGamma;
        double heightError = targetHeight - own.Position.Y;
        var delta = destination - own.Position;
        double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
        desiredGamma = Math.Clamp(Math.Atan2(heightError, Math.Max(500, horizontal)), -.14, .12);
        var profile = s.Beat.SystemsProfile ?? AirframeSystemsProfile.F86FResearchBasis;
        if (s.Player.IndicatedAirspeedMps * AirData.MpsToKnots < profile.GearAndFlapLimitKias - 5
            && (final || targetSpeed < 150)) {
            if (s.PlayerSystems.GearHandle != LandingGearHandle.Down) Press(s, GKey.GearToggle);
            if (s.PlayerSystems.LeftFlapDegrees < profile.FullFlapDegrees - 1 && s.Tick % 120 == 0) Press(s, GKey.FlapDown);
            if (s.Carrier is { IsMaritime: true } && s.PlayerSystems.HookHandle != TailhookHandle.Down) Press(s, GKey.HookToggle);
        }
        if (final && s.ConventionalRunwayRecovery is { } recovery) {
            var runway = recovery.Runway;
            var frame = runway.Frame(own.Position);
            double remaining = runway.TouchdownAimAlongM - frame.along;
            double glideHeight = recovery.ReferenceHeightM + Math.Max(0, remaining) * Math.Tan(3 * Math.PI / 180);
            heightError = glideHeight - frame.height;
            desiredGamma = -3 * Math.PI / 180 + Math.Clamp(heightError / 250, -.08, .08);
            if (remaining < 240) desiredGamma = -.012 + Math.Clamp(heightError / 180, -.035, .055);
            // Track the centreline with a lookahead, not a waypoint behind the aircraft.
            destination = runway.SurfacePoint(Math.Max(runway.TouchdownAimAlongM, frame.along + 900));
            delta = destination - own.Position;
            targetSpeed = SortieSchedule.ApproachTrueAirspeedMps(own.Mass, s.Beat.PlayerAir, profile, own.Position.Y);
        }
        double desiredHeading = Math.Atan2(delta.X, delta.Z);
        double headingError = Math.Atan2(Math.Sin(desiredHeading - own.Chi), Math.Cos(desiredHeading - own.Chi));
        double bank = Math.Clamp(headingError * 1.4, -.7, .7);
        double speedError = targetSpeed - s.Player.AirspeedMps;
        speedIntegral = Math.Clamp(speedIntegral + speedError * SortieRunner.Dt, -20, 20);
        double drag = SortieSchedule.RecoveryDragToWeight(own.Mass, s.Beat.PlayerAir, profile, own.Position.Y);
        double trimThrottle = Math.Clamp((drag + Math.Sin(desiredGamma)) * own.Mass * FlightModel.G0 / Math.Max(1, s.Beat.PlayerAir.ThrustMaxN), .04, .8);
        double throttle = Math.Clamp(trimThrottle + .018 * speedError + .0025 * speedIntegral, 0, 1);
        // The simulated gear actuator requires a turning engine. A long idle
        // deceleration can otherwise leave the selected gear physically retracted.
        if (s.PlayerSystems.GearHandle == LandingGearHandle.Down && !s.PlayerSystems.AllGearDownAndLocked)
            throttle = Math.Max(throttle, .08);
        double g = Math.Clamp((Math.Cos(own.Gamma) + own.Speed / FlightModel.G0 * .6 * (desiredGamma - own.Gamma))
            / Math.Max(.3, Math.Cos(own.Bank)), .2, 4);
        double pitch = double.NaN;
        if (final && Math.Abs(headingError) < .3 && Math.Abs(own.Bank) < .3) {
            double q = .5 * s.Player.AtmosphericState.DensityKgM3 * s.Player.AirspeedMps * s.Player.AirspeedMps;
            double cl = own.Mass * FlightModel.G0 / Math.Max(1, q * s.Beat.PlayerAir.WingAreaM2);
            double alpha = (cl - s.PlayerAerodynamicConfiguration.LiftCoefficientIncrement) / Math.Max(1e-6, s.Beat.PlayerAir.CLAlpha);
            pitch = Math.Clamp(desiredGamma + alpha, -5 * Math.PI / 180, 20 * Math.PI / 180);
        }
        Apply(s, new PilotCommand(g, bank, throttle, 0, CommandedPitchRad: pitch));
        return goingAround ? "go-around" : final ? "approach" : inbound ? "join-inbound" : "RTB";
    }
    static void Apply(SimulationSession s, PilotCommand command) {
        s.SetAnalogThrottleControl(command.Throttle);
        s.Controls.ScriptedPilotOverride = command;
    }
    static void Press(SimulationSession s, GKey key) { s.FeedKey(key, true); s.FeedKey(key, false); }
}
