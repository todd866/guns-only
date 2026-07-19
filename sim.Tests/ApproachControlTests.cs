using System;
using System.Collections.Generic;
using GunsOnly.Sim;
using GunsOnly.Sim.Turbulence;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The APPROACH FEEL harness — closed-loop (detent + real sim + keys, as WebBridge.Advance drives
/// it). After several wrong turns the pilot cut to the bone: "it's really simple, down arrow should
/// give me visible pitch-up, up arrow pitch down, w/s throttle." A 1 s pull was moving the nose 0.2°
/// (a hidden CLmax cap strangled it). So the model is now DIRECT: the stick commands the NOSE (AoA),
/// the render draws the nose there, power flies the glidepath. We measure exactly his sentence:
///   1. VISIBLE PITCH  — a held pull visibly raises the nose (θ), a held push visibly lowers it.
///   2. SPRINGS ON-SPEED — hands-off the nose returns to the on-speed AoA and never sits at the stall.
///   3. POWER CLIMBS   — a pull spools thrust (the nudge), so nose-up actually climbs.
///   4. GLIDEPATH HOLD — hands-off, power holds the slope (no runaway sink into the ramp).
public class ApproachControlTests {
    readonly ITestOutputHelper _o;
    public ApproachControlTests(ITestOutputHelper o) => _o = o;

    const double Dt = 1.0 / 120.0;
    const double RadToDeg = 57.29578;
    const double GsRef = -0.061;

    static AircraftState Approach() =>
        new(new Vec3D(0, 110, -1500), 70.0, GsRef, 0.0, 0.0, FlightModel.Sabre.MassKg);
    static readonly DoctrineAdvice Ball = new(1.0, 0.0, "on the ball");
    sealed class ZeroWind : IWindField { public Vec3D Sample(Vec3D _) => Vec3D.Zero; }

    static (AircraftSim sim, DetentLayer d, KeyGrammar g) Rig(IWindField? wind) => (
        new AircraftSim(Approach(), FlightModel.Sabre) { Wind = wind },
        new DetentLayer { ApproachMode = true },
        new KeyGrammar());

    static double Step(AircraftSim sim, DetentLayer d, KeyGrammar g, double t) {
        d.Tick(g, t, sim.State, FlightModel.Sabre, Ball, Dt);
        sim.Step(d.Command, Dt);
        return t + Dt * 1000.0;
    }
    // Rendered nose = the COMMANDED ATTITUDE (θ) — a stable, directly-flown value.
    static double NoseDeg(AircraftSim s, DetentLayer d) => d.CommandedPitchRad * RadToDeg;
    static double AoaDeg(AircraftSim s, DetentLayer d) => (d.CommandedPitchRad - s.State.Gamma) * RadToDeg;
    static double StallAoaDeg => FlightModel.Sabre.CLMax / FlightModel.Sabre.CLAlpha * RadToDeg;   // ~14°

    // ---- 1. VISIBLE PITCH: down arrow raises the nose, up arrow lowers it — clearly. ----
    [Fact]
    public void StickMovesTheNoseVisibly() {
        var (sim, d, g) = Rig(null);
        double t = 0;
        for (; t < 1500; ) t = Step(sim, d, g, t);   // settle on-speed
        double nose0 = NoseDeg(sim, d);
        g.Feed(GKey.PullUp, true, t);
        for (double e = t + 900; t < e; ) t = Step(sim, d, g, t);   // hold pull 0.9 s
        double noseUp = NoseDeg(sim, d);
        g.Feed(GKey.PullUp, false, t);
        g.Feed(GKey.PushDown, true, t);
        for (double e = t + 1600; t < e; ) t = Step(sim, d, g, t);  // hold push 1.6 s
        double noseDn = NoseDeg(sim, d);
        _o.WriteLine($"VISIBLE PITCH: nose {nose0:F1}° --pull--> {noseUp:F1}° (+{noseUp - nose0:F1}°) --push--> {noseDn:F1}° ({noseDn - noseUp:F1}°)");
        Assert.True(noseUp - nose0 > 5.0, $"down arrow must VISIBLY raise the nose; only +{noseUp - nose0:F1}°");
        Assert.True(noseDn - noseUp < -5.0, $"up arrow must VISIBLY lower the nose; only {noseDn - noseUp:F1}°");
    }

    // ---- 2. SPRINGS ON-SPEED: hands-off the nose returns to on-speed AoA, never sits at the stall. ----
    [Fact]
    public void HandsOffSpringsToOnSpeedAoa() {
        var (sim, d, g) = Rig(null);
        double t = 0;
        // yank the nose up, release, let it settle
        g.Feed(GKey.PullUp, true, t);
        for (double e = t + 1500; t < e; ) t = Step(sim, d, g, t);
        g.Feed(GKey.PullUp, false, t);
        double maxAoa = 0;
        for (double e = t + 6000; t < e; ) { t = Step(sim, d, g, t); maxAoa = Math.Max(maxAoa, AoaDeg(sim, d)); }
        double settledAoa = AoaDeg(sim, d);
        _o.WriteLine($"SPRINGS ON-SPEED: settled AoA={settledAoa:F1}° (on-speed ~10.6°); peak AoA={maxAoa:F1}° (stall {StallAoaDeg:F1}°)");
        Assert.True(Math.Abs(settledAoa - 10.6) < 1.5, $"hands-off must trim back to on-speed AoA; settled {settledAoa:F1}°");
    }

    // ---- 2b. NOSE STEADY: the attitude must be steadier than the flight path in turbulence. ----
    // The pilot's whole complaint: "pitch bounces around while the VV lags — not how I'd fly it."
    // With the stick commanding ATTITUDE (not AoA), the nose is the stable reference and the flight
    // path wanders under it. So the nose's tick-to-tick jitter must be LESS than the flight path's.
    [Fact]
    public void NoseIsSteadierThanTheFlightPathInTurbulence() {
        var field = new TurbulenceField(intensityMps: 1.8, outerScaleM: 130.0, intermittency: 0.5, seed: 0xB0A7);
        var (sim, d, g) = Rig(field);
        double t = 0;
        for (; t < 1500; ) t = Step(sim, d, g, t);
        double prevNose = NoseDeg(sim, d), prevVv = sim.State.Gamma * RadToDeg, noseJit = 0, vvJit = 0; int n = 0;
        for (double e = t + 15000; t < e; ) {
            t = Step(sim, d, g, t);
            double nose = NoseDeg(sim, d), vv = sim.State.Gamma * RadToDeg;
            noseJit += (nose - prevNose) * (nose - prevNose); vvJit += (vv - prevVv) * (vv - prevVv);
            prevNose = nose; prevVv = vv; n++;
        }
        noseJit = Math.Sqrt(noseJit / n); vvJit = Math.Sqrt(vvJit / n);
        _o.WriteLine($"NOSE STEADY: nose(θ) jitter={noseJit:F4}°/tick  vs flight-path(γ) jitter={vvJit:F4}°/tick");
        Assert.True(noseJit < vvJit, $"the nose must be STEADIER than the flight path; nose {noseJit:F4} vs vv {vvJit:F4}");
    }

    // ---- 3. POWER CLIMBS: a pull spools thrust (the nudge) so nose-up actually climbs. ----
    [Fact]
    public void PullSpoolsPowerAndClimbs() {
        var (sim, d, g) = Rig(null);
        double t = 0;
        for (; t < 1500; ) t = Step(sim, d, g, t);
        double thr0 = d.Throttle, gamma0 = sim.State.Gamma * RadToDeg;
        g.Feed(GKey.PullUp, true, t);
        for (double e = t + 6000; t < e; ) t = Step(sim, d, g, t);
        _o.WriteLine($"POWER CLIMBS: throttle {thr0:F2}→{d.Throttle:F2}; flight path {gamma0:F1}°→{sim.State.Gamma * RadToDeg:F1}°");
        Assert.True(d.Throttle - thr0 > 0.15, $"a pull must spool power for the climb; throttle moved +{d.Throttle - thr0:F2}");
        Assert.True(sim.State.Gamma * RadToDeg - gamma0 > 1.0, $"a sustained pull must climb the flight path; γ moved +{sim.State.Gamma * RadToDeg - gamma0:F1}°");
    }

    // ---- SLOT: approach law engages in the groove, fight logic the moment you leave it. ----
    [Fact]
    public void ApproachSlotEngagesInTheGrooveAndReleasesOnBreakAway() {
        var ship = new Carrier(new Vec3D(0, 20, 0), 0, 3, 20, 250, 30);
        // In the slot: 800 m astern, lined up, on the ~3.5° glideslope, on-speed, descending.
        double gsH = 20 + (800 - 50) * 0.061;
        var inSlot = new AircraftState(new Vec3D(0, gsH, -800), 70, -0.061, 0, 0, FlightModel.Sabre.MassKg);
        // Broken away: same spot but pulled up into a climb and accelerating.
        var away = new AircraftState(new Vec3D(0, gsH, -800), 130, 0.20, 0, 0, FlightModel.Sabre.MassKg);
        // Off to the side (not lined up).
        var wide = new AircraftState(new Vec3D(400, gsH, -800), 70, -0.061, 0, 0, FlightModel.Sabre.MassKg);
        _o.WriteLine($"SLOT: inGroove={ship.InApproachSlot(inSlot)} climbingAway={ship.InApproachSlot(away)} offLine={ship.InApproachSlot(wide)}");
        Assert.True(ship.InApproachSlot(inSlot), "in the groove must engage approach law");
        Assert.False(ship.InApproachSlot(away), "pulling up into a climb must release to fight logic");
        Assert.False(ship.InApproachSlot(wide), "off the centreline must not be approach mode");
    }

    // ---- BURBLE: smooth air far out, rough only in the ship's wake (not the whole sky). ----
    [Fact]
    public void BurbleIsSmoothFarOutAndRoughInTheWake() {
        var ship = new Carrier(new Vec3D(0, 20, 0), 0, 3, 20, 250, 30);
        var burble = new BurbleField(ship, new TurbulenceField(intensityMps: 4.0, outerScaleM: 80.0, intermittency: 0.6, seed: 0xB0A7));
        double MagAt(double astern) {
            double h = 20 + Math.Abs(astern) * Math.Tan(3.5 * Math.PI / 180.0);   // glideslope height
            return (burble.Sample(new Vec3D(0, h, astern))
                - ship.SteadyWindWorld).Length;                                  // disturbance above steady WOD
        }
        double far = MagAt(-900), wake = MagAt(-150);
        _o.WriteLine($"BURBLE: |wind| at 900 m astern={far:F2} m/s (should be ~calm), in the wake (150 m)={wake:F2} m/s");
        Assert.True(far < 0.3, $"air must be near-smooth far from the ship; was {far:F2} m/s");
        Assert.True(wake > far + 1.0, $"the wake must be rougher than clear air; wake {wake:F2} vs far {far:F2}");
    }

    [Fact]
    public void InCloseBurbleCreatesAPowerCorrectableSettleBeforeTheRamp() {
        var ship = new Carrier(new Vec3D(0, 20, 0), 0, 3, 20, 250, 30);
        var burble = new BurbleField(ship, new ZeroWind(), sinkMps: 1.8);
        Vec3D OnSlope(double along) {
            double height = Math.Max(0.0, ship.TouchdownAlongM - along)
                * Carrier.GlideslopeSlope;
            return ship.LandingPoint(along, height: height);
        }

        var far = OnSlope(-600.0);
        var inClose = OnSlope(-185.0);
        double farSink = -(burble.Sample(far) - ship.SteadyWindWorld).Y;
        double closeSink = -(burble.Sample(inClose) - ship.SteadyWindWorld).Y;

        Assert.Equal(0.0, burble.InCloseStrength(far), 12);
        Assert.InRange(burble.InCloseStrength(inClose), 0.80, 1.0);
        Assert.InRange(farSink, -1e-12, 1e-12);
        Assert.InRange(closeSink, 1.9, 2.4);
        Assert.True(closeSink < Carrier.MinTrapSinkMps,
            "the burble adds a correction demand, not an unrecoverable vertical cliff by itself");
    }

    // ---- 4. GLIDEPATH HOLD: hands-off, power holds the slope (no runaway sink into the ramp). ----
    [Fact]
    public void HandsOffHoldsTheGlideslope() {
        var field = new TurbulenceField(intensityMps: 1.8, outerScaleM: 130.0, intermittency: 0.5, seed: 0xB0A7);
        var (sim, d, g) = Rig(field);
        double t = 0;
        for (; t < 1500; ) t = Step(sim, d, g, t);
        double worstLow = 0, sum = 0; int n = 0;
        for (double e = t + 30000; t < e; ) {
            t = Step(sim, d, g, t);
            double err = (sim.State.Gamma - GsRef) * RadToDeg;
            worstLow = Math.Min(worstLow, err); sum += err; n++;
        }
        double mean = sum / n;
        _o.WriteLine($"NO RUNAWAY: mean gamma-error={mean:F2}°  worst sink below slope={worstLow:F2}°");
        // Deliberately NOT a tight hands-off hold anymore — that was "too on-rails". The augmentation
        // only keeps it off the water; the PILOT flies the velocity vector onto the diamond for
        // precision. So this just guards against a catastrophic runaway sink in the measurement window.
        Assert.True(worstLow > -7.0, $"must not run away into the sea unattended; worst {worstLow:F2}° below slope");
    }
}
