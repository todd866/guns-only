using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.PlaytestLab;

/// Flies through the public analogue axes, target selector, trigger and RTB request.
/// No state adoption, mission.Engage, damage edits, or QA pause/aim helpers.
public sealed class PathfinderPilot {
    readonly string name;
    readonly int budget;
    readonly double reaction, hesitation, aimBias;
    readonly bool mistakesEnvelope;
    readonly Queue<(double Time, Vec3D Aim, bool Solution)> pictures = new();
    readonly HashSet<int> skipped = new(), droneTried = new();
    readonly Dictionary<int, int> visits = new();
    readonly Dictionary<int, PathfinderFootprintClass> roe = new();
    readonly List<string> decisions = new();
    readonly RecoveryPilot recovery = new();
    int slot;
    bool trigger, passed;
    double nearest = double.PositiveInfinity, lastRoe = -10;
    public PathfinderPilot(string name, int seed, int budget) {
        this.name = name; this.budget = budget;
        uint rng = unchecked((uint)seed + 0x9e3779b9u);
        rng = unchecked((rng ^ (rng >> 16)) * 0x85ebca6bu);
        rng = unchecked((rng ^ (rng >> 13)) * 0xc2b2ae35u); rng ^= rng >> 16;
        double Draw() { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return rng / 4294967296.0; }
        double a = Draw(), b = Draw(), c = Draw();
        reaction = name == "hunter-novice" ? .25 + .45 * a : .12 + .12 * a;
        mistakesEnvelope = Draw() < .65;
        hesitation = name == "hunter-novice" ? 2 + 3 * b : .3 + .5 * b;
        aimBias = (c - .5) * (name == "hunter-novice" ? .0018 : .00008);
    }
    public IReadOnlyList<string> Drive(SimulationSession s) {
        decisions.Clear();
        var mission = s.Pathfinder!;
        if (!s.PlayerAlive) { Fire(s, false); return decisions; }
        if (s.PlayerRtbActive) { Fire(s, false); recovery.Drive(s); return decisions; }
        bool novice = name == "hunter-novice", ace = name == "hunter-ace";
        if (s.PlayerFuel.IsBingo || mission.Gun.AmmoRemaining == 0 || s.TimeSeconds >= budget
            || mission.Balloons.All(b => !b.RelayActive || skipped.Contains(b.Id))) {
            string reason = s.PlayerFuel.IsBingo ? "bingo" : mission.Gun.AmmoRemaining == 0 ? "ammo-empty"
                : s.TimeSeconds >= budget ? "combat-budget" : "route-exhausted";
            if (s.TryRequestReturnToBase(s.PlayerFuel.IsBingo ? MissionRtbReason.BingoFuel : MissionRtbReason.PilotKnockItOff))
                decisions.Add("RTB:" + reason);
            Fire(s, false); return decisions;
        }
        var relay = mission.Balloons[slot];
        var own = s.Player.State;
        double range = (relay.GondolaPosition - own.Position).Length;
        nearest = Math.Min(nearest, range);
        bool receding = (relay.GondolaPosition - own.Position).Dot(own.VelocityVector() - relay.Velocity) < 0;
        if (nearest < 6000 && receding) passed = true;
        bool moveOn = !relay.RelayActive || skipped.Contains(relay.Id) || (passed && range > 6500);
        // A hard off-axis encounter can miss the entire 6 km pass sphere. Do not orbit an
        // unreachable waypoint indefinitely; make a bounded, visible retry decision.
        if (receding && range > 20000 && s.TimeSeconds > hesitation + 25 && nearest < 20000) moveOn = true;
        if (moveOn) {
            visits[relay.Id] = visits.GetValueOrDefault(relay.Id) + 1;
            if (visits[relay.Id] >= (novice ? 2 : 3)) skipped.Add(relay.Id);
            for (int offset = 1; offset <= mission.Balloons.Count; offset++) {
                int next = (slot + offset) % mission.Balloons.Count;
                var candidate = mission.Balloons[next];
                if (!candidate.RelayActive || skipped.Contains(candidate.Id)) continue;
                slot = next; s.SetPlayerGunTargetSlot(slot);
                decisions.Add("target:cycle:relay:" + candidate.Id);
                pictures.Clear(); nearest = double.PositiveInfinity; passed = false;
                break;
            }
            relay = mission.Balloons[slot]; range = (relay.GondolaPosition - own.Position).Length;
        }
        bool clear = true;
        if (name != "reckless" && s.TimeSeconds - lastRoe >= .5) {
            lastRoe = s.TimeSeconds;
            var classification = mission.ClassifyKill(relay);
            if (!roe.TryGetValue(relay.Id, out var before) || before != classification) {
                roe[relay.Id] = classification;
                decisions.Add("roe:" + (classification == PathfinderFootprintClass.Clear ? "clear:" : "skip-town:") + relay.Id);
            }
            if (classification != PathfinderFootprintClass.Clear) skipped.Add(relay.Id);
        }
        if (name != "reckless") clear = roe.GetValueOrDefault(relay.Id, PathfinderFootprintClass.Unknown) == PathfinderFootprintClass.Clear;
        Vec3D offsetTo = relay.GondolaPosition - own.Position;
        double noseAngle = Math.Acos(Math.Clamp(s.Player.BodyForward.Dot(offsetTo.Normalized()), -1, 1));
        if (ace && clear && relay.RelayActive && range < 12000
            && (noseAngle > .12 || visits.GetValueOrDefault(relay.Id) > 0) && droneTried.Add(relay.Id)) {
            // Phase 1 has no player release route: Trigger explicitly excludes Pathfinder
            // from the old formation sweep. This is a blocked policy choice, not a release
            // call, inventory change, or synthetic kill. Keep the capability gap in the tape.
            decisions.Add("drone:unavailable:relay:" + relay.Id);
        }
        // Novices initially aim at the visually dominant envelope; after one pass they try
        // the gondola. Both use incomplete lead and delayed observations. Reckless ignores
        // the footprint but can still aim, so ROE failure is distinguishable from aim failure.
        bool envelopeAim = novice && mistakesEnvelope && visits.GetValueOrDefault(relay.Id) == 0;
        Vec3D aimPoint = envelopeAim ? relay.Position : relay.GondolaPosition;
        Vec3D aim = (aimPoint + (relay.Velocity - mission.Definition.Weather.Wind.Sample(own.Position)) * (range / Math.Max(300, own.Speed) * (novice ? .3 : 1)) - own.Position).Normalized();
        if (mission.Gun.HasLeadSolution && range < 4000) {
            if (novice) {
                var componentTarget = relay.GondolaState with { Position = aimPoint };
                Vec3D fullLead = GunKill.EvaluateBallisticLead(own, componentTarget, GunProfiles.M61A2PublicDataSurrogate, 1.4).LeadDirection;
                aim = (aim * .25 + fullLead * .75).Normalized();
            }
            else {
                // Lead the sight's motion through the aircraft/stick response time. The
                // prediction uses current velocity only, not future simulation state.
                double anticipation = Math.Min(.6, range / Math.Max(300, own.Speed) * .6);
                var predictedOwn = own with { Position = own.Position + own.VelocityVector() * anticipation };
                var predictedTarget = relay.GondolaState with { Position = relay.GondolaPosition + relay.Velocity * anticipation };
                aim = GunKill.EvaluateBallisticLead(predictedOwn, predictedTarget, GunProfiles.M61A2PublicDataSurrogate, 1.4).LeadDirection;
            }
        }
        aim = (aim + new Vec3D(0, aimBias, 0)).Normalized();
        pictures.Enqueue((s.TimeSeconds, aim, mission.Gun.GunSolution));
        var seen = pictures.Peek();
        while (pictures.Count > 1 && pictures.Peek().Time < s.TimeSeconds - (novice ? reaction : 0)) seen = pictures.Dequeue();
        if (s.TimeSeconds < hesitation) { Fire(s, false); return decisions; }
        // Track the delayed line with ordinary stick axes. At ram speed, shallow bank and
        // modest G protect energy; speed control targets the authored M3.6 cruise.
        double desiredHeading = Math.Atan2(seen.Aim.X, seen.Aim.Z);
        double headingError = Wrap(desiredHeading - s.Player.BodyYawRad);
        double bankTarget = Math.Clamp(Math.Atan(own.Speed / FlightModel.G0 * headingError * (novice ? .045 : .10)),
            novice ? -.65 : -.95, novice ? .65 : .95);
        double bankError = Wrap(bankTarget - own.Bank);
        double roll = Math.Clamp(1.8 * bankError - .8 * own.BodyRates.P, -.6, .6);
        // Deliberate small stick pulses cross the published attitude-hold deadband.
        // Sub-deadband commands are otherwise cancelled by the Rapier roll hold.
        if (Math.Abs(bankError) > .002 && Math.Abs(roll) > .001) roll = Math.CopySign(Math.Max(.14, Math.Abs(roll)), roll);
        else roll = 0;
        double forward = seen.Aim.Dot(s.Player.BodyForward);
        double upError = Math.Atan2(seen.Aim.Dot(s.Player.BodyUp), Math.Max(.2, forward));
        double airMach = s.Player.AirspeedMps / s.Player.AtmosphericState.SpeedOfSoundMps;
        double q = .5 * s.Player.AtmosphericState.DensityKgM3 * s.Player.AirspeedMps * s.Player.AirspeedMps;
        double alphaTarget = s.Player.AngleOfAttackRad + upError - .08 * own.BodyRates.Q;
        double desiredG = q * s.Beat.PlayerAir.WingAreaM2
            * (s.Beat.PlayerAir.ZeroLiftCoefficient + FlightModel.EffectiveClAlpha(s.Beat.PlayerAir, airMach) * alphaTarget)
            / (own.Mass * FlightModel.G0);
        if (range > 4000) {
            // Set up a near-level pass slightly below the gondola, leaving the ram-regime
            // positive incidence room to put the gun bore on it without a steep bunt.
            double desiredGamma = Math.Clamp((aimPoint.Y - 5 - own.Position.Y) / (own.Speed * 3), -.04, .04);
            desiredG = (Math.Cos(own.Gamma) + own.Speed / FlightModel.G0 * .5 * (desiredGamma - own.Gamma))
                / Math.Max(.5, Math.Cos(own.Bank));
        }
        if (forward < 0) desiredG = 1 / Math.Max(.5, Math.Cos(own.Bank));
        desiredG = Math.Clamp(desiredG, -.5, novice ? 2.5 : 3.5);
        double limit = Protection.MaxPerformG(own, s.Beat.PlayerAir, s.Player.AirspeedMps, mission.Definition.Weather.Atmosphere);
        double floor = Math.Max(-1, FlightModel.NzAeroMin(own, s.Beat.PlayerAir, s.Player.AirspeedMps, mission.Definition.Weather.Atmosphere));
        double pitch = desiredG >= 1 ? (desiredG - 1) / Math.Max(.1, limit - 1) : (desiredG - 1) / (1 - floor);
        s.SetAnalogRollControl(roll); s.SetAnalogPitchControl(Math.Clamp(pitch, -1, 1));
        double mach = s.Player.AirspeedMps / s.Player.AtmosphericState.SpeedOfSoundMps;
        s.SetAnalogThrottleControl(novice ? .85 : Math.Clamp(.94 + (3.6 - mach) * .4, .55, 1));
        // A shot is a normal held trigger. No automatic solution-to-hit conversion.
        bool fire = range < (novice ? 1200 : 900) && range > 60 && relay.RelayActive && clear
            && (novice ? noseAngle < .04 : name == "reckless" ? noseAngle < .07 : mission.Gun.HasLeadSolution && Math.Acos(Math.Clamp(s.Player.BodyForward.Dot(mission.Gun.LeadDirection), -1, 1)) < .012);
        Fire(s, fire && s.PlayerWeaponsAuthorized);
        return decisions;
    }
    void Fire(SimulationSession s, bool value) {
        if (value == trigger) return;
        trigger = value; s.FeedKey(GKey.Trigger, value);
    }
    static double Wrap(double x) => Math.Atan2(Math.Sin(x), Math.Cos(x));
}
