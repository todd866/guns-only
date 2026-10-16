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
    readonly int latency, rtbAfter;
    readonly bool endAfterCombat;
    readonly double handsOff, aimBias;
    readonly Queue<(long Tick, AircraftState State, Vec3D Lead, bool Solution)> observations = new();
    readonly List<string> decisions = new();
    readonly RecoveryPilot recovery = new();
    readonly HudCuePilot hud;
    bool trigger, rtbObserved, bingoObserved;
    string mode = "setup", candidateMode = "setup";
    double candidateSince, decisionTime;
    double laterWaveDesiredAltitude = double.NaN;
    long targetId;
    public LabPilot(string name, int seed, ClonedPilotPolicy? clone, int rtbAfter, bool endAfterCombat = false) {
        this.name = name; this.clone = clone; this.rtbAfter = rtbAfter; this.endAfterCombat = endAfterCombat;
        casevac = new CasevacPilot(name, seed);
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

    public IReadOnlyList<string> Drive(SimulationSession s, double? perceivedSeconds = null) {
        decisions.Clear();
        decisionTime = perceivedSeconds ?? s.TimeSeconds;
        if (s.CasevacMission) { SetMode(casevac.Drive(s), decisionTime); return decisions; }
        if (!s.PlayerAlive) { Fire(s, false); return decisions; }
        if (endAfterCombat && s.FiniteCombatComplete && s.CanEndSortie && s.TryEndSortie()) {
            decisions.Add("End:combat-complete"); return decisions;
        }
        if (s.PlayerFuel.IsBingo && !bingoObserved) { bingoObserved = true; decisions.Add("bingo:acknowledge"); }
        bool empty = false;
        int ammo = int.MaxValue;
        if (s.OpponentPresent) {
            // Some specialist beats expose an opponent rail without staging a
            // player gun graph. Treat that as “ammo unknown”, not winchester.
            try { ammo = s.PlayerGun.AmmoRemaining; empty = ammo == 0; }
            catch (InvalidOperationException) { }
        }
        bool stayOrGo = LabStayOrGoPolicy.ShouldRequestRtb(new(
            s.EscalatingWavesEnabled,
            s.EngagementsWon,
            s.PlayerHealth,
            s.PlayerFuel.IsBingo,
            ammo,
            name));
        bool noviceDamageRtb = s.EscalatingWavesEnabled && name == "novice" && s.PlayerHealth < .999;
        bool combatBudgetRtb = !s.EscalatingWavesEnabled || name == "clone";
        if (s.ReturnToBaseAvailable && ((s.FiniteCombatComplete && stayOrGo) || noviceDamageRtb
            || s.PlayerFuel.IsBingo || empty || (combatBudgetRtb && s.TimeSeconds >= rtbAfter))) {
            if (s.TryRequestReturnToBase(s.PlayerFuel.IsBingo ? MissionRtbReason.BingoFuel : MissionRtbReason.PilotKnockItOff))
                decisions.Add("RTB:" + (s.FiniteCombatComplete ? "combat-complete" : s.PlayerFuel.IsBingo ? "bingo" : empty ? "ammo-empty" : "combat-budget"));
        }
        if (s.PlayerRtbActive && !rtbObserved) {
            if (!decisions.Any(d => d.StartsWith("RTB:"))) decisions.Add("RTB:accept-mission-handoff");
            rtbObserved = true;
        }
        bool bounceDefense = s.RtbBounceActive;
        if ((!s.PlayerRtbActive || bounceDefense) && TryLaterWaveSafety(s)) return decisions;
        if (!bounceDefense && name == "ace" && s.EscalatingWavesEnabled
            && s.IncomingWaveBearingRad is double bearing && s.LiveOpponentCount == 0) {
            double error = Math.IEEERemainder(bearing - s.Player.State.Chi, 2 * Math.PI);
            double contactBank = Math.Clamp(error * 1.8, -60 * Math.PI / 180, 60 * Math.PI / 180);
            double turnG = Math.Min(4, 1 / Math.Max(.5, Math.Cos(contactBank)));
            s.Controls.ScriptedPilotOverride = new PilotCommand(turnG, contactBank, 1, 0);
            Fire(s, false); SetMode("turn-contact", decisionTime); return decisions;
        }
        bool recover = !bounceDefense && (s.PlayerRtbActive || (!s.EscalatingWavesEnabled && !s.OpponentPresent && !s.Beat.StartsOnCatapult)
            || (!s.EscalatingWavesEnabled && s.Beat.RecoveryCompletesSortie && s.LiveOpponentCount == 0));
        if (recover) {
            Fire(s, false);
            SetMode(recovery.Drive(s), decisionTime);
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
            SetMode(s.TimeSeconds < hud.HandsOffSeconds ? "setup" : fire ? "shoot" : "track-cue", decisionTime);
            return decisions;
        }
        if (s.SelectedOpponentAlive) {
            observations.Enqueue((s.Tick, s.SelectedOpponentState, s.PlayerGun.LeadDirection, s.PlayerGun.GunSolution));
        }
        if (s.TimeSeconds < handsOff || observations.Count <= latency || !s.SelectedOpponentAlive) {
            s.Controls.ScriptedPilotOverride = new PilotCommand(1, 0, .9, 0);
            Fire(s, false);
            SetMode(s.TimeSeconds < handsOff ? "setup" : "search", decisionTime);
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
                SetMode(command.WantsToFire ? "shoot" : command.Command.GDemand > 3 ? "turn" : "extend", decisionTime);
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
            Fire(s, false); SetMode("terrain-escape", decisionTime); return decisions;
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
        SetMode(shot ? "shoot" : slow ? "energy-recovery" : angle > .2 ? "turn" : "pursue", decisionTime);
        return decisions;
    }
    bool TryLaterWaveSafety(SimulationSession s) {
        // The opening pair is deliberately unchanged. Once the ladder has paid
        // out two wins, preserve a competent pilot's flight path while turning
        // or fighting; the existing 4G terrain escape is a last-resort guard.
        if (name != "ace" || !s.EscalatingWavesEnabled || s.EngagementsWon < 2) return false;
        AircraftState own = s.Player.State;
        double clearance = ExperienceObserver.Clearance(s, own.Position);
        double aheadClearance = ExperienceObserver.Clearance(s, own.Position + own.VelocityVector() * 3);
        double ground = own.Position.Y - clearance;
        if (!double.IsFinite(laterWaveDesiredAltitude))
            laterWaveDesiredAltitude = Math.Clamp(Math.Max(own.Position.Y, ground + 2500), 2500, 10000);
        double verticalSpeed = own.VelocityVector().Y;
        double pulloutHeight = own.Speed * own.Speed / (9.81 * 5)
            * (1 - Math.Cos(Math.Min(0, own.Gamma)));
        bool warningRecovery = s.LiveOpponentCount == 0 && (own.Gamma < -5 * Math.PI / 180 || verticalSpeed < -20);
        bool steepOrLow = warningRecovery || clearance < 500
            || (verticalSpeed < 0 && Math.Min(clearance, aheadClearance) < pulloutHeight + 700);
        if (!steepOrLow) return false;
        double altitudeError = laterWaveDesiredAltitude - own.Position.Y;
        double g = Math.Clamp(1 + altitudeError * .0008 - verticalSpeed * .018, 1, 8);
        if (own.Gamma < -15 * Math.PI / 180) g = Math.Max(g, 6);
        s.Controls.ScriptedPilotOverride = new PilotCommand(g, 0, 1, 0);
        Fire(s, false); SetMode("later-wave-pullout", decisionTime);
        return true;
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

/// Human-model recovery inputs at 1x; the kernel owns steering while RTB AP is active.
public sealed class RecoveryPilot {
    readonly RecoverySteering steering = new();
    double lastThrottle = double.NaN;
    public string Drive(SimulationSession s) {
        if (s.PlayerRtbActive && s.TimeCompressionAvailable) {
            if (!s.RtbAutopilotActive) s.SetTimeCompressionEnabled(true);
            if (s.RtbAutopilotActive) {
                // Press Y and let go: no scripted command or input setters while AP flies.
                lastThrottle = double.NaN;
                return "RTB";
            }
        }
        string mode = steering.Drive(s);
        var command = steering.Command;
        s.SetAnalogPitchControl(0); s.SetAnalogRollControl(0);
        if (command.Throttle != lastThrottle) {
            s.SetAnalogThrottleControl(command.Throttle); lastThrottle = command.Throttle;
        }
        s.Controls.ScriptedPilotOverride = command;
        return mode;
    }
}
