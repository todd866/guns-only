using System;
using System.Linq;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The 2v1 instrument. The gun-conversion funnel is 1v1 and has never executed a line of the
/// formation code, which is why every formation defect this project has had was found by a human
/// flying and uploading telemetry rather than by the suite.
///
/// Owner, repeatedly, across Builds 238-244: "dash-2 just flies off into the sunset",
/// "wingman is still running away". Measured in production (session web-1785668651858-487412,
/// Build 244, 6,479 present-and-alive samples): the wingman ends up beyond 10 km for 68.8% of its
/// live time, median 22.6 km, max 48.8 km — while the PLAYER stays inside about 1 km of the lead
/// bandit throughout. It departs from BOTH aircraft, monotonically, twice per sortie.
///
/// Measuring all three pairwise distances is the point: player-to-wingman alone cannot distinguish
/// "the wingman left" from "the player left".
public sealed class WingmanStaysInTheFightTests {
    readonly ITestOutputHelper _output;

    public WingmanStaysInTheFightTests(ITestOutputHelper output) => _output = output;

    static BeatSetup TwoShipFixture() {
        BeatSetup beat = Beats.ModernVisualMerge();
        return beat with {
            ContinuousCombat = beat.ContinuousCombat! with { MaximumFormationSize = 2 },
        };
    }

    sealed record Sample(
        double T, double PlayerToLead, double PlayerToWing, double LeadToWing,
        string WingTactic, string WingRole, bool PlayerAlive,
        bool StillFighting, string TerminalState, int WingCount,
        string LeadTactic, double LeadRadius, double WingRadius,
        int WingContactAgeTicks, double WingSpeed, double WingAltitude,
        PilotCommand WingCommand, double LeadSpeed, double PlayerSpeed,
        bool LeadPresenting, bool WingPresenting, bool SessionActive);

    static System.Collections.Generic.List<Sample> Fly(double seconds,
        double playerThrottle = 0.2, double playerRoll = 0.0,
        double playerRollPulseSeconds = 0.0) {
        var session = new SimulationSession();
        session.StartBeat(TwoShipFixture);
        var samples = new System.Collections.Generic.List<Sample>();
        const double Dt = 1.0 / 120.0;
        int ticks = (int)Math.Ceiling(seconds / Dt);
        // Keep the player slow so the fight stays anchored where it started. The player's
        // behaviour is not the variable under test: what matters is whether the wingman stays
        // with the fight it is part of. An earlier version flew the player STRAIGHT at 0.9
        // throttle; the F-22 outran both bandits, so the player left the 5 km judging window
        // exactly when the wingman departed and the contract below passed vacuously. At 0.2
        // throttle the bandits can hold the player in the fight — the production shape of the
        // defect (Build 244: the player turned with the lead inside ~1 km for 57 minutes while
        // the wingman sat beyond 10 km). The roll arguments let an investigator bank the player
        // into an orbit instead; the contract path leaves them neutral.
        session.Begin();
        session.SetAnalogThrottleControl(playerThrottle);
        // Each ReactiveBandit's _fightCentre is its own spawn position; capture both before the
        // first Advance so the leash radius each pilot actually measures can be reported.
        Vec3D leadSpawn = session.Bandit.State.Position;
        Vec3D wingSpawn = session.Wingmen.Count > 0
            ? session.Wingmen[0].Bandit.State.Position
            : leadSpawn;
        bool wingSpawnSeen = session.Wingmen.Count > 0;
        for (int tick = 0; tick < ticks; tick++) {
            // A short aileron pulse, then neutral: raw analog roll is a rate command, so holding
            // it is a barrel roll into the ground. Establish a bank and let the assist keep it.
            session.SetAnalogRollControl(
                tick * Dt < playerRollPulseSeconds ? playerRoll : 0.0);
            session.Advance(Dt);
            if (!wingSpawnSeen && session.Wingmen.Count > 0) {
                wingSpawn = session.Wingmen[0].Bandit.State.Position;
                wingSpawnSeen = true;
            }
            if (tick % 120 != 0) continue;
            Wingman? wing = session.Wingmen.Count > 0 ? session.Wingmen[0] : null;
            if (wing is null) continue;
            AircraftState p = session.Player.State;
            AircraftState lead = session.Bandit.State;
            AircraftState w = wing.Bandit.State;
            var reactive = wing.Bandit as ReactiveBandit;
            var leadReactive = session.Bandit as ReactiveBandit;
            samples.Add(new Sample(
                tick * Dt,
                Geometry.Range(p, lead), Geometry.Range(p, w), Geometry.Range(lead, w),
                reactive?.Tactic.ToString() ?? "?",
                reactive?.PolicyMemory.FormationRole.ToString() ?? "?",
                // The wingman's gun target is the player, so this is "player still alive".
                wing.Gun.TargetAlive,
                wing.StillFighting, wing.TerminalState.ToString(), session.Wingmen.Count,
                leadReactive?.Tactic.ToString() ?? "?",
                HorizontalRange(lead.Position, leadSpawn),
                HorizontalRange(w.Position, wingSpawn),
                reactive?.PolicyMemory.FormationSharedContactAgeTicks ?? -1,
                w.Speed, w.Position.Y,
                reactive?.LastCommand ?? default,
                lead.Speed, p.Speed,
                session.Bandit.Presenting, wing.Bandit.Presenting,
                session.Lifecycle == SimulationSession.LifecycleState.Active));
        }
        return samples;
    }

    static double HorizontalRange(in Vec3D a, in Vec3D b) {
        double dx = a.X - b.X, dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    [Fact]
    public void ReportWingmanSeparationOverASortie() {
        var s = Fly(240.0);
        _output.WriteLine(
            "   t(s)  p->lead  p->wing lead->wing  Lpres Wpres  live   Lrad  Wtactic   Wrole      "
            + "  Wrad  age   Wspd   Walt   Lspd   Pspd    Wg  Wbank  Wthr");
        foreach (var x in s) {
            _output.WriteLine(
                $"{x.T,7:F0} {x.PlayerToLead,8:F0} {x.PlayerToWing,8:F0} {x.LeadToWing,10:F0}"
                + $"  {(x.LeadPresenting ? "P" : "-"),5} {(x.WingPresenting ? "P" : "-"),5}"
                + $" {(x.SessionActive ? "a" : "-")}{(x.PlayerAlive ? "p" : "-")}{(x.StillFighting ? "w" : "-")}"
                + $" {x.LeadRadius,6:F0}  {x.WingTactic,-8} {x.WingRole,-11}"
                + $" {x.WingRadius,6:F0} {x.WingContactAgeTicks,4} {x.WingSpeed,6:F1} {x.WingAltitude,6:F0}"
                + $" {x.LeadSpeed,6:F1} {x.PlayerSpeed,6:F1}"
                + $" {x.WingCommand.GDemand,5:F1} {x.WingCommand.BankTarget,6:F2} {x.WingCommand.Throttle,5:F2}");
        }
    }

    /// The contract. A wingman is part of a fight; it does not get to leave one that is still
    /// happening. 10 km is deliberately generous — it is five times the gun's maximum reach, so
    /// nothing inside it can be called "in the fight" by accident. Production measurement of the
    /// defect (Build 244, session web-1785668651858-487412, 57 minutes): the wingman was more than
    /// 10 km from the fight for **51.9%** of the 20,772 samples in which the player was engaged
    /// with the lead.
    ///
    /// Root cause, found by the per-tick instrument above: the cold-visitor opening briefs the
    /// WINGMAN Presenting and only the wingman. StartBeat passes the primary a null spec on a
    /// cold start (openingSpawn requires FightDirector.HasHistory) while StageWingmen falls back
    /// to NextSpawn(1), whose Sparring branch fires exactly when HasHistory is false — so the
    /// lead fought from tick one and the wingman presented. While Presenting the airframe flies
    /// PresentCommand regardless of what the tactic layer decides — which is why three
    /// decision-layer fixes produced bit-identical trajectories (the harness showed the wingman
    /// planning Return/Bracket while flying a fixed 15 deg bank out of the fight). Graduation was
    /// per-aircraft (the player must hold the 900 m/12 deg funnel on THAT ship for 2 s), so the
    /// never-tracked wingman presented forever. The fix graduates the pair together the moment
    /// their Presenting flags differ, which is what the director's own comment always promised
    /// ("then they turn together").
    [Fact]
    public void TheWingmanDoesNotAbandonAFightThePlayerIsStillIn() {
        var s = Fly(240.0);
        Assert.NotEmpty(s);
        // Only judge while there IS a fight: the session live (the fixture player eventually
        // dies to the now-committed pair, and a finished session repeats its last state forever —
        // frozen samples must not dilute the share), the player alive, the wingman still a
        // combatant, and the player within 8 km of EITHER opponent. Judging against the lead
        // alone let an earlier version pass vacuously when the player drifted out of that one
        // window; and post-fix the wingman is often the ship actually pressing the attack, which
        // is exactly the doctrine, not an excuse to stop judging. 8 km rather than gun range
        // because the lead's pursuit of this non-manoeuvring fixture player orbits at 5-8 km (its
        // separate, pre-existing wallow); the fight is demonstrably still here — which is
        // precisely when a departing wingman is abandoning it. Require a real window so the
        // assertion can never again pass by having nothing to judge.
        var engaged = s.Where(x => x.SessionActive
            && x.PlayerAlive
            && x.StillFighting
            && Math.Min(x.PlayerToLead, x.PlayerToWing) <= 8_000.0).ToList();
        Assert.True(engaged.Count >= 30,
            $"the fight only lasted {engaged.Count} sampled seconds; the fixture no longer "
            + "reproduces a live engagement, so the contract judged nothing");
        // The mechanism, pinned: by the end of the judged window the wingman must have graduated
        // from the co-operative opening — a presenting airframe ignores its own tactic layer, so
        // an ungraduated wingman can only ever leave. Judged at the END so a future soft opening
        // (both ships briefed, funnel-graduated mid-window) stays legal.
        Assert.False(engaged[^1].WingPresenting,
            "the wingman was still Presenting at the end of the engaged window — the pair never "
            + "graduated, which is the exact orphaning this contract exists to forbid");
        // Abandonment is the wingman being far from the PLAYER while the player is in a fight.
        // 10 km is deliberately generous — five times the gun's maximum reach.
        var abandoned = engaged.Where(x => x.PlayerToWing >= 10_000.0).ToList();
        double share = 100.0 * abandoned.Count / engaged.Count;
        Assert.True(share < 20.0,
            $"the wingman was more than 10 km from the fight for {share:F0}% of the time the "
            + $"player was engaged ({abandoned.Count}/{engaged.Count} samples); "
            + $"worst separation {(abandoned.Count > 0 ? abandoned.Max(a => a.PlayerToWing) : 0):F0} m");
    }
}
