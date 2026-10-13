using System.Text;
using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Acceptance for the rung-0 first gun lesson (docs/grok-overhaul/design/f22-opening.md).
///
/// The pilot here sees only what the HUD draws: where the lead cue sits relative to the gun line,
/// whether the solution cue is lit, and range. It perceives that picture a reaction time late,
/// moves the analog stick at a bounded rate through the same session inputs a phone or gamepad
/// uses (SetAnalogPitchControl / SetAnalogRollControl / Trigger), and every downstream layer —
/// assisted flight, gunnery assist, physiology, Auto-GCAS, the flight model, ballistics — runs as
/// it does for a human. No ScriptedPilotOverride, no state writes, no hitbox change.
///
/// This is a regression bound on the geometry, not a newcomer study: strangers are the real test.
/// </summary>
public class FirstMergeOpeningAcceptanceTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    readonly ITestOutputHelper _output;
    public FirstMergeOpeningAcceptanceTests(ITestOutputHelper output) => _output = output;

    public sealed record HudPilotProfile(
        string Name,
        double ReactionSeconds,
        double StickRatePerSecond,
        double HandsOffSeconds,
        /// Constant aim error the pilot carries (degrees, +up). A poor shot, not a tracking law.
        double AimBiasUpDeg = 0.0,
        /// Fire whenever the contact is inside this coarse window instead of on the solution cue.
        double SprayWindowDeg = 0.0);

    public sealed record OpeningRun(
        string Pilot,
        bool Assisted,
        double CoarseWindowSecondsBefore30,
        double SolutionSecondsBefore30,
        double FirstContactInViewSeconds,
        double FirstHitSeconds,
        int RoundsToFirstHit,
        int RoundsFired,
        int Hits,
        int Kills,
        double PresentEndedSeconds,
        bool BanditFought,
        double MinimumRangeM);

    /// The HUD-cue pilot. Error is the lead cue's position relative to the gun line, in the
    /// pilot's own body frame, captured when the frame was drawn and acted on ReactionSeconds
    /// later, and moves the stick toward the cue in proportion to how far off it is: the plainest
    /// thing a newcomer does with a thumb stick.
    public sealed class HudPilot {
        readonly HudPilotProfile _profile;
        readonly Queue<(double Up, double Right, bool Solution, double Range, bool Valid)> _seen = new();
        readonly int _latencyTicks;
        double _pitch, _roll;
        bool _trigger;
        int _tick;

        // Diagnostic reads only; the pilot still drives the ordinary session input path.
        public double PitchControl => _pitch;
        public double RollControl => _roll;

        public HudPilot(HudPilotProfile profile) {
            _profile = profile;
            _latencyTicks = Math.Max(1, (int)Math.Round(profile.ReactionSeconds / Dt));
        }

        public void Drive(SimulationSession session) {
            _tick++;
            AircraftSim own = session.Player;
            bool valid = session.OpponentPresent && session.SelectedOpponentAlive;
            double up = 0.0, right = 0.0, range = double.PositiveInfinity;
            bool solution = false;
            if (valid) {
                GunKill gun = session.PlayerGun;
                Vec3D toTarget = session.Bandit.State.Position - own.State.Position;
                range = toTarget.Length;
                Vec3D cue = gun.HasLeadSolution ? gun.LeadDirection : toTarget.Normalized();
                Vec3D f = own.BodyForward, u = own.BodyUp, r = own.BodyRight;
                double cf = Math.Max(1e-6, cue.Dot(f));
                up = Math.Atan2(cue.Dot(u), cf) * 180.0 / Math.PI - _profile.AimBiasUpDeg;
                right = Math.Atan2(cue.Dot(r), cf) * 180.0 / Math.PI;
                if (cue.Dot(f) <= 0.0) {
                    // Behind: the HUD shows the cue pinned at the edge; just say "far".
                    up = Math.Sign(cue.Dot(u) + 1e-9) * 90.0;
                    right = Math.Sign(cue.Dot(r)) * 90.0;
                }
                solution = gun.GunSolution;
            }
            _seen.Enqueue((up, right, solution, range, valid));
            (double Up, double Right, bool Solution, double Range, bool Valid) seen = _seen.Count > _latencyTicks
                ? _seen.Dequeue() : (0.0, 0.0, false, double.PositiveInfinity, false);

            double pitchTarget = 0.0, rollTarget = 0.0;
            bool fire = false;
            double hands = _tick * Dt;
            if (seen.Valid && hands >= _profile.HandsOffSeconds) {
                double error = Math.Sqrt(seen.Up * seen.Up + seen.Right * seen.Right);
                // "Move the stick toward the dot": the thumb goes where the cue is on the glass,
                // in proportion to how far away it is. Roll for sideways, pull/push for up/down.
                rollTarget = Math.Clamp(0.04 * seen.Right, -0.35, 0.35);
                pitchTarget = Math.Clamp(0.045 * seen.Up, -0.3, 0.6);
                fire = _profile.SprayWindowDeg > 0.0
                    ? seen.Range < 900.0 && error < _profile.SprayWindowDeg
                    : seen.Solution && seen.Range < 900.0;
            }
            double step = _profile.StickRatePerSecond * Dt;
            _pitch += Math.Clamp(pitchTarget - _pitch, -step, step);
            _roll += Math.Clamp(rollTarget - _roll, -step, step);
            if (hands >= _profile.HandsOffSeconds) {
                session.SetAnalogPitchControl(_pitch);
                session.SetAnalogRollControl(_roll);
            }
            if (fire != _trigger) {
                _trigger = fire;
                session.FeedKey(GKey.Trigger, fire);
            }
        }
    }

    sealed class GunWindow {
        public double CoarseSeconds { get; private set; }
        public double SolutionSeconds { get; private set; }

        public void Observe(SimulationSession session, double elapsedSeconds) {
            if (elapsedSeconds > 30.0 || !session.SelectedOpponentAlive
                || !session.PlayerWeaponsAuthorized) return;
            Vec3D toTarget = session.SelectedOpponentState.Position - session.Player.State.Position;
            double nose = Math.Acos(Math.Clamp(
                session.Player.BodyForward.Dot(toTarget.Normalized()), -1, 1));
            if (toTarget.Length < 800.0 && nose < 12.0 * Math.PI / 180.0) CoarseSeconds += Dt;
            if (session.PlayerGun.GunSolution) SolutionSeconds += Dt;
        }
    }

    [Fact]
    public void DestroyingAVisibleTargetStopsGunWindowAccumulation() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMerge);
        session.Begin();
        var pilot = new HudPilot(Pilots[0]);
        for (int tick = 0; tick < 12 * AircraftSim.TickHz && !session.PlayerGun.GunSolution; tick++) {
            pilot.Drive(session);
            session.StepFixed();
        }
        Assert.True(session.SelectedOpponentAlive);
        Assert.True(session.PlayerGun.GunSolution);
        var window = new GunWindow();
        window.Observe(session, Dt);
        Assert.Equal(Dt, window.CoarseSeconds);
        Assert.Equal(Dt, window.SolutionSeconds);
        Assert.True(session.PlayerGun.ApplyExternalDestruction(session.PlayerGun.SelectedTargetId));
        Assert.True(session.OpponentPresent); // Wreck visibility does not mean an engageable target.
        Assert.False(session.SelectedOpponentAlive);
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) window.Observe(session, (tick + 2) * Dt);
        Assert.Equal(Dt, window.CoarseSeconds);
        Assert.Equal(Dt, window.SolutionSeconds);
    }

    static readonly HudPilotProfile[] Pilots = Enumerable.Range(0, 8).Select(seed =>
        new HudPilotProfile(
            $"hud-s{seed}",
            ReactionSeconds: 0.20 + 0.05 * (seed % 4),          // 200..350 ms
            StickRatePerSecond: seed < 4 ? 3.0 : 1.8,            // full throw in 0.33..0.55 s
            HandsOffSeconds: 1.0 + 0.35 * seed)).ToArray();      // 1.0..3.45 s to find the stick

    public static OpeningRun Fly(HudPilotProfile profile, bool assisted, bool touch,
        double seconds = 45.0, Action<string>? trace = null, double? gunAssistScale = null) {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.ModernVisualMerge());
        if (gunAssistScale is double scale) session.PlayerGun.Gimbal = GunGimbalConfig.ForAssist(scale);
        session.SetTouchControlModality(touch);
        session.SetAssistedFlight(assisted);
        session.Begin();
        var pilot = new HudPilot(profile);
        var window = new GunWindow();
        double firstHit = double.NaN, presentEnded = double.NaN;
        double firstInView = double.NaN, minRange = double.PositiveInfinity;
        int roundsAtFirstHit = -1;
        bool fought = false;
        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++) {
            pilot.Drive(session);
            session.StepFixed();
            double t = (tick + 1) * Dt;
            if (!session.OpponentPresent) continue;
            AircraftState p = session.Player.State, b = session.Bandit.State;
            double range = Geometry.Range(p, b);
            minRange = Math.Min(minRange, range);
            Vec3D los = (b.Position - p.Position).Normalized();
            double nose = Math.Acos(Math.Clamp(session.Player.BodyForward.Dot(los), -1, 1));
            // Forward view: inside portrait's ~16.7 deg half-width horizontally is the strictest.
            if (double.IsNaN(firstInView) && nose < 16.0 * Math.PI / 180.0) firstInView = t;
            window.Observe(session, t);
            if (double.IsNaN(presentEnded) && !session.Bandit.Presenting) presentEnded = t;
            if (session.Bandit is NeutralMergeBandit merge && merge.FirstPassComplete
                && !merge.Presenting) fought = true;
            if (session.Bandit is ReactiveBandit) fought = true;
            if (double.IsNaN(firstHit) && session.SortiePlayerHits > 0) {
                firstHit = t;
                roundsAtFirstHit = session.SortiePlayerRoundsFired;
            }
            if (trace is not null && tick % 60 == 0) {
                PilotCommand requested = session.Controls.Command;
                PilotCommand applied = session.Player.LastAppliedCommand;
                GunneryPitchAssistState assist = session.GunneryPitchAssist;
                trace(FormattableString.Invariant(
                    $"t={t:F3} r={range:F0} nose={nose * 180 / Math.PI:F2} sol={session.PlayerGun.GunSolution} pres={session.Bandit.Presenting} rnds={session.SortiePlayerRoundsFired} hits={session.SortiePlayerHits} stick={pilot.RollControl:F4}/{pilot.PitchControl:F4} intent={session.Controls.PilotRollIntent:F4} roll={requested.RollControl:F4}/{applied.RollControl:F4} sas={applied.SasRollControl:F4} pitchG={requested.GDemand:F2}/{applied.GDemand:F2} G={session.Player.LastNz:F2} bank={p.Bank * 180 / Math.PI:F2} rollRate={p.BodyRates.P * 180 / Math.PI:F2} assist={assist.Status} unload={session.Controls.PilotUnloadIntent} spd={p.Speed:F0}/{b.Speed:F0}"));
            }
        }
        return new OpeningRun(profile.Name, assisted, window.CoarseSeconds, window.SolutionSeconds, firstInView, firstHit,
            roundsAtFirstHit, session.SortiePlayerRoundsFired, session.SortiePlayerHits,
            session.KillCount, presentEnded, fought, minRange);
    }

    string Describe(IEnumerable<OpeningRun> runs) {
        var text = new StringBuilder();
        foreach (OpeningRun run in runs)
            text.AppendLine(FormattableString.Invariant(
                $"{run.Pilot,-8} assisted={run.Assisted,-5} view={run.FirstContactInViewSeconds:F2}s coarse<30={run.CoarseWindowSecondsBefore30:F1}s sol<30={run.SolutionSecondsBefore30:F1}s firstHit={run.FirstHitSeconds:F2}s roundsToHit={run.RoundsToFirstHit} rounds={run.RoundsFired} hits={run.Hits} kills={run.Kills} presentEnd={run.PresentEndedSeconds:F2}s fought={run.BanditFought} minR={run.MinimumRangeM:F0}"));
        return text.ToString();
    }

    [Theory]
    [InlineData(true, true)]     // phone, either orientation (one contract per device)
    [InlineData(false, false)]   // desktop gamepad
    public void ADelayedInputHudPilotGetsAGunWindowAndARealHitInMostSeeds(bool assisted, bool touch) {
        var runs = Pilots.Select(pilot => Fly(pilot, assisted, touch)).ToList();
        _output.WriteLine(Describe(runs));
        Assert.All(runs, run => Assert.True(run.FirstContactInViewSeconds <= 20.0,
            $"{run.Pilot}: contact not in the forward view by 20 s"));
        Assert.All(runs, run => Assert.True(run.CoarseWindowSecondsBefore30 >= 2.0
            || (run.Kills > 0 && run.FirstHitSeconds < 2.0),
            $"{run.Pilot}: coarse gun window {run.CoarseWindowSecondsBefore30:F1} s before 30 s"));
        int hitSeeds = runs.Count(run => run.Hits > 0 && run.FirstHitSeconds <= 30.0);
        Assert.True(hitSeeds * 2 > runs.Count, $"only {hitSeeds}/{runs.Count} seeds hit before 30 s");
        Assert.All(runs, run => Assert.True(run.BanditFought,
            $"{run.Pilot}: the present never ended into a fight"));
        Assert.All(runs, run => Assert.True(run.PresentEndedSeconds <= ReactiveBandit.PresentMaximumSeconds + 0.1,
            $"{run.Pilot}: present lasted {run.PresentEndedSeconds:F2} s"));
    }

    /// At assist NONE a four-degree poor shot still misses. Full assist deliberately
    /// corrects this error under the owner's child-pilot acceptance; no volume is inflated.
    [Fact]
    public void APoorShotAtAssistNoneStillMisses() {
        var runs = new[] { 4.0, -4.0 }.Select(bias => Fly(
            new HudPilotProfile($"bias{bias:+0;-0}", 0.25, 3.0, 1.0,
                AimBiasUpDeg: bias, SprayWindowDeg: 12.0),
            assisted: false, touch: true, seconds: 12.0, gunAssistScale: 0)).ToList();
        _output.WriteLine(Describe(runs));
        Assert.All(runs, run => Assert.True(run.RoundsFired > 50,
            $"{run.Pilot}: the poor-shot pilot must actually fire ({run.RoundsFired} rounds)"));
        Assert.All(runs, run => Assert.Equal(0, run.Hits));
    }

    /// Hands off for the whole present: it still ends by the cap and the contact fights.
    [Fact]
    public void AHandsOffPlayerStillGetsAFight() {
        OpeningRun run = Fly(new HudPilotProfile("hands-off", 0.25, 3.0, HandsOffSeconds: 999.0),
            assisted: false, touch: false, seconds: 20.0);
        _output.WriteLine(Describe(new[] { run }));
        Assert.True(run.PresentEndedSeconds <= ReactiveBandit.PresentMaximumSeconds + 0.1);
        Assert.True(run.BanditFought);
        Assert.Equal(0, run.RoundsFired);
    }

    [Fact]
    public void TraceOneSeed() {
        if (System.Environment.GetEnvironmentVariable("OPENING_TRACE") != "1") return;
        foreach (bool assisted in new[] { true, false }) {
            _output.WriteLine($"--- assisted={assisted}");
            OpeningRun run = Fly(Pilots[int.Parse(System.Environment.GetEnvironmentVariable("OPENING_SEED") ?? "0")],
                assisted, touch: assisted, seconds: 30.0, trace: _output.WriteLine);
            _output.WriteLine(Describe(new[] { run }));
        }
    }
}
