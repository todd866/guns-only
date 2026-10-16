using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.PlaytestLab;

/// Flies through the public analogue axes, target selector, trigger and RTB request.
/// No state adoption, mission.Engage, damage edits, or QA pause/aim helpers.
public sealed class PathfinderPilot {
    readonly string name;
    readonly double reaction, hesitation, aimBias, envelopeFeedbackDelay;
    readonly Queue<(double Time, Vec3D Aim, bool Solution)> pictures = new();
    readonly HashSet<int> skipped = new(), droneTried = new();
    readonly Dictionary<int, int> visits = new();
    readonly Dictionary<int, PathfinderFootprintClass> roe = new();
    readonly Dictionary<int, double> envelopeFeedback = new();
    readonly List<string> decisions = new();
    readonly RecoveryPilot recovery = new();
    int slot;
    bool trigger, passed;
    bool looping;
    int loopRelay;
    double nearest = double.PositiveInfinity, lastRoe = -10;
    public PathfinderPilot(string name, int seed, int budget) {
        this.name = name;
        uint rng = unchecked((uint)seed + 0x9e3779b9u);
        rng = unchecked((rng ^ (rng >> 16)) * 0x85ebca6bu);
        rng = unchecked((rng ^ (rng >> 13)) * 0xc2b2ae35u); rng ^= rng >> 16;
        double Draw() { rng ^= rng << 13; rng ^= rng >> 17; rng ^= rng << 5; return rng / 4294967296.0; }
        double a = Draw(), b = Draw(), c = Draw();
        reaction = name == "hunter-novice" ? .15 + .20 * a : .12 + .12 * a;
        hesitation = name == "hunter-novice" ? 2 + 3 * b : .3 + .5 * b;
        aimBias = (c - .5) * (name == "hunter-novice" ? .0018 : .00008);
        envelopeFeedbackDelay = .05 + .3 * a;
    }
    public IReadOnlyList<string> Drive(SimulationSession s) {
        decisions.Clear();
        var mission = s.Pathfinder!;
        if (!s.PlayerAlive) { Fire(s, false); return decisions; }
        if (s.PlayerRtbActive) { Fire(s, false); recovery.Drive(s); return decisions; }
        bool novice = name == "hunter-novice", ace = name == "hunter-ace";
        if (s.PlayerFuel.IsBingo || mission.Gun.AmmoRemaining == 0) {
            string reason = s.PlayerFuel.IsBingo ? "bingo" : "ammo-empty";
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
        if (looping && (!relay.RelayActive || relay.Escaped || (!receding && range < 12000))) {
            looping = false; passed = false; nearest = range;
            decisions.Add("loop:end:relay:" + loopRelay);
            s.FeedKey(GKey.Override, false);
        }
        bool moveOn = !looping && (!relay.RelayActive || skipped.Contains(relay.Id) || passed);
        if (moveOn) {
            visits[relay.Id] = visits.GetValueOrDefault(relay.Id) + 1;
            var candidate = mission.Balloons
                .Where(b => b.RelayActive && !b.Escaped && !skipped.Contains(b.Id)
                    && b.Id != relay.Id && (b.GondolaPosition - own.Position).Dot(own.VelocityVector()) > 0)
                .OrderBy(b => (b.GondolaPosition - own.Position).Length).FirstOrDefault();
            if (candidate is null) {
                // A deliberate reattack is a real turn through the public override input.
                // It ends on reacquisition, never by a timer that hides an unsuccessful loop.
                candidate = mission.Balloons.Where(b => b.RelayActive && !b.Escaped
                    && !skipped.Contains(b.Id) && visits.GetValueOrDefault(b.Id) < 3)
                    .OrderBy(b => (b.GondolaPosition - own.Position).Length).FirstOrDefault();
                if (candidate is not null) {
                    looping = true; loopRelay = candidate.Id;
                    decisions.Add("loop:start:relay:" + candidate.Id);
                    s.FeedKey(GKey.Override, true);
                }
            }
            if (candidate is null) {
                Fire(s, false);
                s.SetAnalogRollControl(Math.Clamp(-own.Bank * 2 - own.BodyRates.P, -.6, .6));
                s.SetAnalogPitchControl(0);
                s.SetAnalogYawControl(0);
                return decisions;
            }
            slot = mission.Balloons.Select((b, i) => (b, i)).First(x => x.b.Id == candidate.Id).i;
            s.SetPlayerGunTargetSlot(slot);
            decisions.Add("target:cycle:relay:" + candidate.Id);
            pictures.Clear(); nearest = double.PositiveInfinity; passed = false;
            relay = candidate; range = (relay.GondolaPosition - own.Position).Length;
        }
        bool clear = true;
        if (name != "reckless" && range < 12000 && s.TimeSeconds - lastRoe >= .5) {
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
        double relayHeadingError = Math.Abs(Wrap(Math.Atan2(offsetTo.X, offsetTo.Z) - s.Player.BodyYawRad));
        if (ace && relay.Id >= 3 && clear && relay.RelayActive && range is > 2000 and < 3000
            && (noseAngle > .02 || relayHeadingError > .02 || visits.GetValueOrDefault(relay.Id) > 0)
            && droneTried.Add(relay.Id)) {
            // A drone is a player action at the selected relay. The session owns stores,
            // release timing, flight and the resulting gun engagement; the lab only presses
            // the public action when the ace has reached a hard geometry decision.
            if (s.TryReleasePathfinderDrone()) decisions.Add("drone:release:relay:" + relay.Id);
            else decisions.Add("drone:release-rejected:relay:" + relay.Id);
        }
        // Novices initially aim at the visually dominant envelope; after one pass they try
        // the gondola. Both use incomplete lead and delayed observations. Reckless ignores
        // the footprint but can still aim, so ROE failure is distinguishable from aim failure.
        bool envelopeAim = novice && !mission.Balloons.Any(b => b.LeakFraction > 0 && visits.GetValueOrDefault(b.Id) > 0);
        if (envelopeAim && relay.LeakFraction > 0) envelopeFeedback.TryAdd(relay.Id, s.TimeSeconds);
        Vec3D aimPoint = envelopeAim ? relay.Position : relay.GondolaPosition;
        Vec3D aim = (aimPoint + (relay.Velocity - mission.Definition.Weather.Wind.Sample(own.Position)) * (range / Math.Max(300, own.Speed) * (novice ? .3 : 1)) - own.Position).Normalized();
        if (mission.Gun.HasLeadSolution && range < 4000) {
            if (novice) {
                double anticipation = Math.Min(.6, range / Math.Max(300, own.Speed) * .6);
                var predictedOwn = own with { Position = own.Position + own.VelocityVector() * anticipation };
                var componentTarget = relay.GondolaState with { Position = aimPoint + relay.Velocity * anticipation };
                // The novice points the sight at the box centroid. Ballistic compensation
                // still includes inherited vertical velocity; omitting it makes even the
                // forty-metre envelope impossible to hit during the setup bunt.
                aim = GunKill.EvaluateBallisticLead(predictedOwn, componentTarget, GunProfiles.M61A2PublicDataSurrogate, 1.4).LeadDirection;
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
            looping ? -1.415 : novice ? -.65 : -.95, looping ? 1.415 : novice ? .65 : .95);
        double bankError = Wrap(bankTarget - own.Bank);
        double roll = Math.Clamp(1.8 * bankError - .8 * own.BodyRates.P, looping ? -1.0 : -.6, looping ? 1.0 : .6);
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
            double desiredGamma = Math.Clamp((aimPoint.Y - 25 - own.Position.Y) / (own.Speed * 3), -.04, .04);
            desiredG = (Math.Cos(own.Gamma) + own.Speed / FlightModel.G0 * .5 * (desiredGamma - own.Gamma))
                / Math.Max(.5, Math.Cos(own.Bank));
        }
        if (forward < 0) desiredG = 1 / Math.Max(.5, Math.Cos(own.Bank));
        double limit = looping ? Protection.OverrideMaxG(own, s.Beat.PlayerAir, s.Player.AirspeedMps, mission.Definition.Weather.Atmosphere)
            : Protection.MaxPerformG(own, s.Beat.PlayerAir, s.Player.AirspeedMps, mission.Definition.Weather.Atmosphere);
        // Establish bank before the high-G turn. Pulling immediately while wings-level
        // trades the ram energy for a climb and can make a missed pearl unreachable.
        desiredG = looping ? Math.Abs(own.Bank) < .8 ? 1 : Math.Min(6.5, limit)
            : Math.Clamp(desiredG, -.5, novice ? 2.5 : 3.5);
        double floor = Math.Max(-1, FlightModel.NzAeroMin(own, s.Beat.PlayerAir, s.Player.AirspeedMps, mission.Definition.Weather.Atmosphere));
        double pitch = desiredG >= 1 ? (desiredG - 1) / Math.Max(.1, limit - 1) : (desiredG - 1) / (1 - floor);
        s.SetAnalogRollControl(roll); s.SetAnalogPitchControl(Math.Clamp(pitch, -1, 1));
        s.SetAnalogYawControl(range < 4000 && forward > .5
            ? Math.Clamp(headingError * 6 - own.BodyRates.R * .6, -.35, .35) : 0);
        double mach = s.Player.AirspeedMps / s.Player.AtmosphericState.SpeedOfSoundMps;
        s.SetAnalogThrottleControl(novice ? .85 : Math.Clamp(.94 + (3.6 - mach) * .4, .55, 1));
        // A shot is a normal held trigger. No automatic solution-to-hit conversion.
        double componentAngle = Math.Acos(Math.Clamp(s.Player.BodyForward.Dot((aimPoint - own.Position).Normalized()), -1, 1));
        bool fire = range < (novice ? 1200 : 900) && range > 60 && relay.RelayActive && clear
            && (!envelopeAim || !envelopeFeedback.TryGetValue(relay.Id, out double feedbackAt)
                || s.TimeSeconds - feedbackAt < envelopeFeedbackDelay)
            && (novice ? componentAngle < .06 : name == "reckless" ? noseAngle < .07 : mission.Gun.HasLeadSolution && Math.Acos(Math.Clamp(s.Player.BodyForward.Dot(mission.Gun.LeadDirection), -1, 1)) < .012);
        Fire(s, fire && s.PlayerWeaponsAuthorized);
        return decisions;
    }
    void Fire(SimulationSession s, bool value) {
        if (value == trigger) return;
        trigger = value; s.FeedKey(GKey.Trigger, value);
    }
    static double Wrap(double x) => Math.Atan2(Math.Sin(x), Math.Cos(x));
}
