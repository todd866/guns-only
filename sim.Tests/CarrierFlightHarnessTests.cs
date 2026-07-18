using System;
using System.Collections.Generic;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// FULL-FLIGHT HARNESS — the test that was missing. It drives the ACTUAL carrier beat end to end
/// exactly as WebBridge.Advance does (real spawn, real Carrier, the BurbleField wake, and the
/// dynamic approach↔fight mode switch), then asserts on OUTCOMES a unit test can't see: can you fly
/// away from the spawn, does the deck classifier lie, can a competent pilot actually trap. These are
/// the "spot the fail before the pilot does" checks — every one corresponds to a real report:
/// "deployed me behind the carrier, I can't fly anywhere", "pitch-up doesn't work out of approach",
/// a RampStrike logged 122 ft up.
public class CarrierFlightHarnessTests {
    readonly ITestOutputHelper _o;
    public CarrierFlightHarnessTests(ITestOutputHelper o) => _o = o;

    /// The rig IS the web bridge's inner loop, headless.
    sealed class CarrierRig {
        public readonly AircraftSim Player;
        public readonly IBandit Bandit;
        public readonly Carrier Ship;
        public readonly GunKill Fight = new();
        public readonly ArrestmentModel Arrestment = new();
        readonly DetentLayer _d = new() { Variant = ValleyVariant.PhysicsOnly };   // parity with the carrier beat
        readonly KeyGrammar _keys = new();
        readonly AircraftParams _air = FlightModel.Sabre;
        readonly DoctrineAdvice _advice = new(1.0, 0.0, "carrier recovery");
        double _t;
        bool _waveOffArmed = true;
        bool _triggerDown;
        double _waveOffUntil = double.NegativeInfinity;
        const double Dt = 1.0 / 120.0;
        public Carrier.Recovery Recovery = Carrier.Recovery.Flying;
        public bool ApproachMode { get; private set; }
        public bool Terminal => Recovery is Carrier.Recovery.RampStrike or Carrier.Recovery.InTheWater
            || (Recovery == Carrier.Recovery.Trap
                && Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Stopped)
            || Fight.Outcome == FightOutcome.Splash;

        public CarrierRig(Carrier.DeckConfiguration configuration = Carrier.DeckConfiguration.Axial) {
            var beat = Beats.CarrierApproach(configuration);
            Ship = beat.Carrier!;
            Player = new AircraftSim(beat.Player, beat.PlayerAir) {
                Wind = new BurbleField(Ship,
                    new TurbulenceField(intensityMps: 3.0, outerScaleM: 80.0, intermittency: 0.6, seed: 0xB0A7),
                    sinkMps: 1.8)
            };
            Bandit = beat.CreateBandit();
        }

        public void Key(GKey k, bool down) {
            _keys.Feed(k, down, _t);
            if (k == GKey.Trigger) _triggerDown = down;
        }
        public AircraftState S => Player.State;
        public AircraftState B => Bandit.State;
        public double TimeSeconds => _t / 1000.0;
        public double SpeedKt => S.Speed * 1.94384;
        public double GammaDeg => S.Gamma * 57.29578;
        public double Throttle => _d.Throttle;
        public string Mode => _t < _waveOffUntil ? "WAVE-OFF" : ApproachMode ? "APPROACH" : "FREE";
        public LsoAdvice? LsoCall => Lso.AdviseForMode(Ship, S, Player.AngleOfAttackRad,
            DetentLayer.OnSpeedAoARad, Mode == "APPROACH", Mode == "WAVE-OFF");
        public string EmittedContext => LsoCall?.Call ?? Lso.FreeFlightCall;
        public bool InApproachSlot => Ship.InApproachSlot(S);
        public bool GunWindow => CameraSolver.GunWindow(S, B);
        public double RangeM => Geometry.Range(S, B);
        public double AngleOffDeg => Geometry.AngleOff(S, B) * 57.29578;
        public double GunAimErrorDeg => Math.Acos(Math.Clamp(Player.BodyForward.Dot(Fight.LeadDirection), -1.0, 1.0)) * 57.29578;
        public (double along, double cross, double height) Deck => Ship.LandingFrame(
            Arrestment.IsActive ? Arrestment.Position : S.Position);
        public double GlideslopeErrorM {
            get {
                var (along, _, height) = Deck;
                double lineH = Math.Max(0.0, -Ship.DeckLengthM * 0.2 - along) * 0.06116;
                return lineH - height;
            }
        }

        public void Step() {
            if (Arrestment.Phase == ArrestmentModel.ArrestmentPhase.Arrested) {
                Ship.Step(Dt);
                Arrestment.Step(Ship, Dt);
                _t += Dt * 1000.0;
                return;
            }
            bool inSlot = Ship.InApproachSlot(Player.State);
            ApproachMode = inSlot && _d.Throttle < 0.95;
            _d.ApproachMode = ApproachMode;
            if (ApproachMode) _waveOffArmed = true;
            else if (!inSlot && _d.Throttle < 0.95) _waveOffArmed = false;
            _d.GlideslopeErrorM = GlideslopeErrorM;   // spatial error to the wire-zone contact plane
            _d.Tick(_keys, _t, Player.State, _air, _advice, Dt);
            if (_waveOffArmed && _d.Throttle >= 0.95) {
                _waveOffUntil = _t + 5000.0;
                _waveOffArmed = false;
            }
            Fight.Step(_triggerDown, Player.State, Bandit.State, Dt);
            if (Fight.Outcome == FightOutcome.Splash) {
                _t += Dt * 1000.0;
                return;
            }
            Player.Step(_d.Command, Dt);
            if (Fight.BanditAlive) Bandit.Step(Player.State, Dt);
            Ship.Step(Dt);
            Recovery = Ship.Classify(Player.State);
            if (Recovery == Carrier.Recovery.Trap)
                Arrestment.Engage(Ship, Player.State, Player.BodyPitchRad);
            _t += Dt * 1000.0;
            if (!double.IsFinite(S.Position.Y) || !double.IsFinite(S.Speed))
                throw new InvalidOperationException($"non-finite state at t={_t / 1000:F1}s");
        }
        public void Run(double seconds) {
            for (double e = _t + seconds * 1000.0;
                 _t < e && !Terminal;) Step();
        }
    }

    static AircraftState CarrierState(Carrier ship, double along, double cross, double lowM) {
        double range = Math.Max(0.0, -ship.DeckLengthM * 0.2 - along);
        double height = range * 0.06116 - lowM;
        var p = ship.LandingPoint(along, cross, height);
        return new AircraftState(p, 70.0, -0.061, ship.LandingHeadingRad, 0.0, FlightModel.Sabre.MassKg);
    }

    // ---- SA COHERENCE: FREE never emits paddles; real deviations own the approach call. ----
    [Fact]
    public void CarrierModeAndPaddlesCallStayCoherent() {
        var rig = new CarrierRig();
        rig.Step();
        Assert.Equal("APPROACH", rig.Mode);

        rig.Key(GKey.ThrottleUp, true);   // leave the slot, ride out the five-second wave-off latch
        rig.Run(7.0);
        _o.WriteLine($"SA FREE: mode={rig.Mode} context={rig.EmittedContext} recovery={rig.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);
        Assert.Equal("FREE", rig.Mode);
        Assert.Null(rig.LsoCall);
        Assert.Equal(Lso.FreeFlightCall, rig.EmittedContext);
        Assert.DoesNotContain("BALL", rig.EmittedContext, StringComparison.OrdinalIgnoreCase);

        var ship = Beats.CarrierApproach().Carrier!;
        var onGlideslope = CarrierState(ship, along: -800.0, cross: 0.0, lowM: 0.0);
        Assert.True(ship.InApproachSlot(onGlideslope));
        var ball = Lso.AdviseForMode(ship, onGlideslope, DetentLayer.OnSpeedAoARad,
            DetentLayer.OnSpeedAoARad, approachMode: true, waveOff: false);
        Assert.NotNull(ball);
        Assert.Equal(LsoSeverity.OnBall, ball.Value.Severity);
        Assert.Equal("ON THE BALL", ball.Value.Call);

        var lowSlow = CarrierState(ship, along: -1000.0, cross: 0.0, lowM: 10.0);
        var power = Lso.Advise(ship, lowSlow, DetentLayer.OnSpeedAoARad + 0.030,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal("POWER", power.Call);

        var grossLowSlow = CarrierState(ship, along: -400.0, cross: 0.0, lowM: 18.0);
        var unsafeCall = Lso.Advise(ship, grossLowSlow, DetentLayer.OnSpeedAoARad + 0.050,
            DetentLayer.OnSpeedAoARad);
        Assert.Equal(LsoSeverity.WaveOff, unsafeCall.Severity);
        Assert.Equal("WAVE OFF, WAVE OFF", unsafeCall.Call);
    }

    // ---- FLY AWAY: firewall + pull from the spawn must let you leave the boat, not trap you slow. ----
    [Fact]
    public void CanFlyAwayFromTheSpawn() {
        var rig = new CarrierRig();
        double alt0 = rig.S.Position.Y;
        rig.Key(GKey.ThrottleUp, true);   // firewall
        rig.Key(GKey.PullUp, true);       // pull up to climb away
        rig.Run(14.0);
        double alt1 = rig.S.Position.Y;
        _o.WriteLine($"FLY AWAY: alt {alt0:F0}→{alt1:F0} m  speed {rig.SpeedKt:F0} kt  gamma {rig.GammaDeg:F1}°  approachMode={rig.ApproachMode}  recovery={rig.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);           // must not die trying to leave
        Assert.False(rig.ApproachMode, "firewall+climb must drop you into FIGHT logic, not stay in approach");
        Assert.True(alt1 > alt0 + 60, $"you must be able to climb AWAY from the boat; alt only {alt0:F0}→{alt1:F0} m");
    }

    // ---- WAVE-OFF: firewall alone must leave approach law and establish a clean climb. ----
    [Fact]
    public void WaveOffCleanlyEscapesToFight() {
        var rig = new CarrierRig();
        double alt0 = rig.S.Position.Y;
        double gamma0 = rig.GammaDeg;
        double minAlt = alt0;
        bool escaped = false, climbing = false;
        rig.Key(GKey.ThrottleUp, true);

        for (int i = 0; i < 600 && rig.Recovery == Carrier.Recovery.Flying; i++) {
            rig.Step();
            minAlt = Math.Min(minAlt, rig.S.Position.Y);
            escaped |= !rig.ApproachMode;
            climbing |= escaped && rig.GammaDeg > 0.5 && rig.S.Position.Y > minAlt + 1.0;
            if (escaped && climbing) break;
        }

        _o.WriteLine($"WAVE OFF: alt {alt0:F1}→{rig.S.Position.Y:F1} m (min {minAlt:F1})  gamma {gamma0:F1}°→{rig.GammaDeg:F1}°  throttle={rig.Throttle:F2}  approachMode={rig.ApproachMode}  recovery={rig.Recovery}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);
        Assert.True(escaped, "firewall must exit approach law within five seconds");
        Assert.True(climbing, $"wave-off must establish a climb; gamma={rig.GammaDeg:F1}° alt={rig.S.Position.Y:F1} m min={minAlt:F1} m");
    }

    // ---- CLASSIFIER HONESTY: never report a RampStrike while well above the deck. ----
    [Fact]
    public void RecoveryNeverRampStrikesAboveTheDeck() {
        var rig = new CarrierRig();
        for (int i = 0; i < 5400 && rig.Recovery == Carrier.Recovery.Flying; i++) rig.Step();
        var (along, cross, h) = rig.Deck;
        _o.WriteLine($"CLASSIFIER: end recovery={rig.Recovery}  deckHeight={h:F1} m  along={along:F0} m");
        if (rig.Recovery is Carrier.Recovery.RampStrike or Carrier.Recovery.Trap)
            Assert.True(h < 2.5, $"a {rig.Recovery} must be a real deck contact (h≈0), not {h:F1} m above the deck");
    }

    // ---- WINNABLE: a competent pilot (fly the velocity vector at the touchdown point) must be able
    // to trap, not always ramp-strike. If this can't reach the deck cleanly, the approach is broken. ----
    [Theory]
    [InlineData(Carrier.DeckConfiguration.Axial)]
    [InlineData(Carrier.DeckConfiguration.Angled)]
    public void ACompetentPilotCanReachTheDeckAndStop(Carrier.DeckConfiguration configuration) {
        var rig = new CarrierRig(configuration);
        int steps = 0;
        while (!rig.Terminal && steps++ < 6500) {
            // Fly the VV at the active wire zone. Once it catches, the same loop continues through
            // the deterministic arrestment so Trap is terminal success only after a dead stop.
            if (rig.Recovery == Carrier.Recovery.Flying) {
                var toTd = rig.Ship.TouchdownPoint - rig.S.Position;
                double wantGamma = Math.Asin(Math.Clamp(toTd.Y / Math.Max(toTd.Length, 1), -1, 1));
                double err = rig.S.Gamma - wantGamma;                   // <0 = below the line, need up
                rig.Key(GKey.PullUp, err < -0.006);
                rig.Key(GKey.PushDown, err > 0.006);

                double wantPower = Math.Clamp(0.16 + 0.010 * rig.GlideslopeErrorM
                                                   + 0.026 * (70.0 - rig.S.Speed), 0.02, 0.90);
                rig.Key(GKey.ThrottleUp, rig.Throttle < wantPower - 0.015);
                rig.Key(GKey.ThrottleDown, rig.Throttle > wantPower + 0.015);
            }
            rig.Step();
        }
        var (along, cross, h) = rig.Deck;
        _o.WriteLine($"WINNABLE {configuration}: recovery={rig.Recovery}/{rig.Arrestment.Phase} wire={rig.Arrestment.CaughtWire} after {steps} steps  along={along:F0} cross={cross:F0} h={h:F1}  stop={rig.Arrestment.DistanceM:F1}m/{rig.Arrestment.ElapsedSeconds:F2}s");
        Assert.NotEqual(Carrier.Recovery.InTheWater, rig.Recovery);
        Assert.Equal(Carrier.Recovery.Trap, rig.Recovery);   // flying the VV at the wires must TRAP
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped, rig.Arrestment.Phase);
        Assert.InRange(rig.Arrestment.CaughtWire, 1, 4);
        Assert.Equal(0.0, rig.Arrestment.RelativeSpeedMps, 10);
        Assert.InRange(rig.Arrestment.DistanceM, 65.0, 90.0);
        Assert.InRange(rig.Arrestment.ElapsedSeconds, 2.0, 3.0);
    }

    // ---- FULL SORTIE: finals → max A/B → clean egress → lead pursuit → real ballistic gun kill. ----
    [Fact]
    public void PilotStartsOnFinalsFirewallsEgressesAndKills() {
        var rig = new CarrierRig();
        double finalsAlt = rig.S.Position.Y, finalsSpeed = rig.S.Speed;
        Vec3D banditStart = rig.B.Position;

        Assert.True(rig.InApproachSlot, "the sortie must genuinely start in the carrier groove");

        // The sortie brief says firewall on spawn; hold W before the first auto-throttle tick, just
        // as a player can while the beat comes alive.
        rig.Key(GKey.ThrottleUp, true);                         // firewall through max A/B
        bool leftApproachLaw = false;
        double freeAt = double.NaN;
        while (rig.TimeSeconds < 6.0 && rig.Recovery == Carrier.Recovery.Flying) {
            rig.Step();
            leftApproachLaw |= !rig.ApproachMode;
            if (rig.Mode == "FREE") { freeAt = rig.TimeSeconds; break; }
        }
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);
        Assert.True(leftApproachLaw, "firewall must hand control from approach law to fight law");
        Assert.True(double.IsFinite(freeAt), "the five-second wave-off must settle into FREE flight");
        Assert.InRange(freeAt, 0.0, 5.5);

        // Establish a shallow combat climb, then unload and let max A/B build fighting energy.
        while (rig.TimeSeconds < 40.0 && rig.Recovery == Carrier.Recovery.Flying
               && (rig.S.Position.Y < finalsAlt + 450.0 || rig.S.Speed < 130.0)) {
            rig.Key(GKey.PullUp, rig.S.Gamma < 0.09);
            rig.Key(GKey.PushDown, rig.S.Gamma > 0.18);
            rig.Step();
        }
        rig.Key(GKey.PullUp, false);
        rig.Key(GKey.PushDown, false);
        double egressAt = rig.TimeSeconds, egressAlt = rig.S.Position.Y, egressSpeedKt = rig.SpeedKt;
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);
        Assert.True(rig.Throttle > 1.25, $"firewall must reach max A/B; lever={rig.Throttle:F2}");
        Assert.True(rig.S.Position.Y > finalsAlt + 400.0,
            $"egress must gain useful altitude: {finalsAlt:F0}→{rig.S.Position.Y:F0} m");
        Assert.True(rig.S.Speed > Math.Max(125.0, finalsSpeed + 50.0),
            $"egress must build fighting energy: {finalsSpeed:F0}→{rig.S.Speed:F0} m/s");
        Assert.True(Finite(rig.S) && rig.S.Speed > 60.0, "the pilot must stay finite and flying");
        Assert.True(Math.Abs(rig.S.Bank) < 0.15, "the egress must be cleaned up wings-level before the intercept");
        double banditTravel = (rig.B.Position - banditStart).Length;
        Assert.True(banditTravel > 800.0 && rig.B.Speed > 85.0 && Math.Abs(rig.B.Chi) > 0.5,
            $"the reactive bogey must maneuver at fighter speed: travel={banditTravel:F0} m speed={rig.B.Speed:F0} m/s chi={rig.B.Chi:F2}");
        Assert.True(rig.Fight.BanditAlive);

        bool achievedLead = false;
        double leadAt = double.NaN, leadAvailableAt = double.NaN, firstHitAt = double.NaN;
        double minAimErrorDeg = double.PositiveInfinity, minRangeM = double.PositiveInfinity;
        // Keep integrating past the 75 s performance gate so a late outcome produces a useful
        // assertion instead of being indistinguishable from a loop cutoff; the assertion below
        // still requires the BUILD 25 intercept to splash before 75 s.
        while (rig.TimeSeconds < 100.0 && rig.Recovery == Carrier.Recovery.Flying
               && rig.Fight.Outcome == FightOutcome.Flying) {
            // Manage closure instead of idling merely because range is below 2.5 km. Against a
            // maneuvering fighter that old rule bled the pursuer below 50 m/s before it ever got
            // around the first turn. Preserve fighting speed, and pull power only for a real
            // high-closure overshoot inside snapshot range.
            var lineOfSight = (rig.B.Position - rig.S.Position).Normalized();
            double closureMps = (rig.S.VelocityVector() - rig.B.VelocityVector()).Dot(lineOfSight);
            bool brakeForOvershoot = rig.RangeM < 650.0 && closureMps > 45.0 && rig.S.Speed > 155.0;
            bool needCombatPower = !brakeForOvershoot
                && (rig.S.Speed < 150.0 || rig.RangeM > 1000.0 || closureMps < 15.0);
            rig.Key(GKey.ThrottleUp, needCombatPower);
            rig.Key(GKey.ThrottleDown, brakeForOvershoot);
            // Outside ballistic range, close in pure pursuit. Once a finite solution appears,
            // fly the actual lead point: this is the same pipper solution emitted to the HUD.
            Vec3D aimPoint = rig.Fight.HasLeadSolution ? rig.Fight.LeadPipper : rig.B.Position;
            bool deckRecovery = rig.S.Position.Y < 330.0;
            double wantBank = deckRecovery ? 0.0 : Geometry.BankToPlaceLiftVectorOn(rig.S, aimPoint);
            double bankError = Math.IEEERemainder(wantBank - rig.S.Bank, 2.0 * Math.PI);
            rig.Key(GKey.RollRight, bankError > 0.035);
            rig.Key(GKey.RollLeft, bankError < -0.035);
            var aimDirection = (aimPoint - rig.S.Position).Normalized();
            double aimError = Math.Acos(Math.Clamp(rig.Player.BodyForward.Dot(aimDirection), -1.0, 1.0));
            double verticalError = rig.Player.BodyUp.Dot(aimDirection);
            bool liftPlaneSet = Math.Abs(bankError) < 0.30;
            bool energyLow = rig.S.Speed < 115.0;
            bool pullForDeck = deckRecovery && liftPlaneSet && rig.S.Gamma < 0.08;
            // At low energy, unload and let max power rebuild speed instead of holding the
            // max-performance pull. The target can earn separation, but not an easy pilot stall.
            rig.Key(GKey.PullUp, pullForDeck || (!energyLow && !deckRecovery
                && liftPlaneSet && verticalError > 0.0018 && aimError > 0.0025));
            rig.Key(GKey.PushDown, !energyLow && !deckRecovery
                && liftPlaneSet && verticalError < -0.0018 && aimError > 0.0025);

            // The sight ring is a flyable two-degree capture cue; it authorizes a burst, but the
            // gun awards nothing unless individual trajectories actually cross the target sphere.
            bool onPipper = rig.Fight.HasLeadSolution && aimError < 0.035;
            if (rig.Fight.HasLeadSolution) {
                if (!double.IsFinite(leadAvailableAt)) leadAvailableAt = rig.TimeSeconds;
                minAimErrorDeg = Math.Min(minAimErrorDeg, rig.GunAimErrorDeg);
            }
            minRangeM = Math.Min(minRangeM, rig.RangeM);
            rig.Key(GKey.Trigger, onPipper);
            if (onPipper) {
                achievedLead = true;
                if (!double.IsFinite(leadAt)) leadAt = rig.TimeSeconds;
            }
            rig.Step();
            if (!double.IsFinite(firstHitAt) && rig.Fight.HitCount > 0) firstHitAt = rig.TimeSeconds;
        }

        _o.WriteLine($"FULL SORTIE: free={freeAt:F1}s egress={egressAt:F1}s/{egressSpeedKt:F0}kt/{egressAlt:F0}m "
            + $"leadAvail={leadAvailableAt:F1}s onPipper={leadAt:F1}s firstHit={firstHitAt:F1}s splash={rig.TimeSeconds:F1}s "
            + $"range={rig.RangeM:F0}m/min{minRangeM:F0}m aimErr={rig.GunAimErrorDeg:F2}°/min{minAimErrorDeg:F2}° "
            + $"rounds={rig.Fight.RoundsFired} hits={rig.Fight.HitCount} "
            + $"ammo={rig.Fight.AmmoRemaining} outcome={rig.Fight.Outcome}");
        Assert.Equal(Carrier.Recovery.Flying, rig.Recovery);
        Assert.True(achievedLead, "the pilot must close, fly the computed lead pipper, and fire on solution");
        Assert.True(rig.Fight.HitCount >= GunKill.DefaultHitsToKill, "only real round intersections may do damage");
        Assert.True(rig.Fight.RoundsFired > rig.Fight.HitCount, "the harness must permit honest misses, not award every trigger tick");
        Assert.True(firstHitAt > leadAt + 0.15, "damage must wait for round time-of-flight, not advance with trigger time");
        Assert.True(rig.Fight.AmmoRemaining < GunKill.DefaultAmmo, "a real finite magazine must feed the sortie");
        Assert.Equal(FightOutcome.Splash, rig.Fight.Outcome);
        Assert.False(rig.Fight.BanditAlive);
        Assert.Equal(1.0, rig.Fight.KillProgress, 10);
        Assert.True(rig.TimeSeconds < 75.0, "the tuned finals-to-splash intercept must stay well below BUILD 23's ~110 s");
    }

    static bool Finite(in AircraftState s) =>
        double.IsFinite(s.Position.X) && double.IsFinite(s.Position.Y) && double.IsFinite(s.Position.Z)
        && double.IsFinite(s.Speed) && double.IsFinite(s.Gamma) && double.IsFinite(s.Chi)
        && double.IsFinite(s.Bank) && s.BodyRates.IsFinite;
}
