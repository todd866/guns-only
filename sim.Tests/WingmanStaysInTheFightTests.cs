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

    /// The same cold-visitor opening with the formation clamped to the primary alone. The 2v1
    /// contract cannot judge the PRIMARY's gunnery — the wingman kills the fixture player around
    /// t=50 s and ends the fight before a strayed lead gets back. Alone, the primary owns the
    /// whole window, so whether the cold primary converts is answered unambiguously (measured:
    /// it does — its post-pass separation peaks 6 m under the 3.5 km Return latch, so it stays
    /// in ordinary BFM; the 2v1's Bracket leg is what pushes the lead past that latch).
    static BeatSetup OneShipFixture() {
        BeatSetup beat = Beats.ModernVisualMerge();
        return beat with {
            ContinuousCombat = beat.ContinuousCombat! with { MaximumFormationSize = 1 },
        };
    }

    sealed record Sample(
        double T, double PlayerToLead, double PlayerToWing, double LeadToWing,
        string WingTactic, string WingRole, bool PlayerAlive,
        bool StillFighting, string TerminalState, int WingCount,
        string LeadTactic, double LeadRadius, double WingRadius,
        int WingContactAgeTicks, double WingSpeed, double WingAltitude,
        PilotCommand WingCommand, double LeadSpeed, double PlayerSpeed,
        bool LeadPresenting, bool WingPresenting, bool SessionActive,
        int LeadRounds, int WingRounds, bool LeadTrigger, bool WingTrigger,
        double LeadNoseErrDeg, double LeadLeadErrDeg, bool RoeHold,
        double LeadAltitude, double LeadGammaDeg, PilotCommand LeadCommand);

    /// The two-ship fixture with a player durable enough to be judged against BOTH opponents.
    /// With the production 3-hit rule the wingman kills the fixture player at t≈50 s, which ends
    /// the fight while a recovering lead is still 4-5 km out on a ~95 m/s stern-chase closure —
    /// so a both-ships gunnery contract would always end before its second subject got measured.
    /// Durability changes only how long the window lasts, never what the bandits are asked to do.
    static BeatSetup DurablePlayerTwoShipFixture() {
        BeatSetup beat = TwoShipFixture();
        return beat with {
            Combat = beat.CombatRules with { PlayerHitsToDefeat = 30 },
        };
    }

    static System.Collections.Generic.List<Sample> Fly(double seconds,
        double playerThrottle = 0.2, double playerRoll = 0.0,
        double playerRollPulseSeconds = 0.0,
        Func<BeatSetup>? fixture = null) {
        var session = new SimulationSession();
        session.StartBeat(fixture ?? TwoShipFixture);
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
            // The primary in a ModernVisualMerge beat is a NeutralMergeBandit, not a
            // ReactiveBandit — a direct cast reads "?" forever. The trace interface is the
            // honest seam: it forwards to the post-pass fight once the merge gate opens.
            var leadReactive = session.Bandit as IBanditDecisionTraceSource;
            samples.Add(new Sample(
                tick * Dt,
                Geometry.Range(p, lead), Geometry.Range(p, w), Geometry.Range(lead, w),
                reactive?.Tactic.ToString() ?? "?",
                reactive?.PolicyMemory.FormationRole.ToString() ?? "?",
                // The wingman's gun target is the player, so this is "player still alive".
                wing.Gun.TargetAlive,
                wing.StillFighting, wing.TerminalState.ToString(), session.Wingmen.Count,
                leadReactive is not null
                    ? $"{leadReactive.PolicyMemory.Tactic}/{leadReactive.PolicyMemory.FormationRole}"
                    : "?",
                HorizontalRange(lead.Position, leadSpawn),
                HorizontalRange(w.Position, wingSpawn),
                reactive?.PolicyMemory.FormationSharedContactAgeTicks ?? -1,
                w.Speed, w.Position.Y,
                reactive?.LastCommand ?? default,
                lead.Speed, p.Speed,
                session.Bandit.Presenting, wing.Bandit.Presenting,
                session.Lifecycle == SimulationSession.LifecycleState.Active,
                session.OpponentPresent ? session.OpponentGun.RoundsFired : 0,
                wing.Gun.RoundsFired,
                session.OpponentTriggerDown, wing.TriggerDown,
                BanditFireControl.NoseErrorRad(lead, ActorObservation.Capture(p, tick))
                    * 180.0 / Math.PI,
                BanditFireControl.LeadNoseErrorRad(lead, ActorObservation.Capture(p, tick))
                    * 180.0 / Math.PI,
                session.WeaponsInhibited,
                lead.Position.Y, lead.Gamma * 180.0 / Math.PI,
                leadReactive?.AppliedCommand ?? default));
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
            "   t(s)  p->lead  p->wing lead->wing  Lpres Wpres  live  Ltactic/role           "
            + "  Lrad  Wtactic   Wrole      "
            + "  Wrad  age   Wspd   Walt   Lspd   Pspd    Wg  Wbank  Wthr  Lrnd  Wrnd  trig");
        foreach (var x in s) {
            _output.WriteLine(
                $"{x.T,7:F0} {x.PlayerToLead,8:F0} {x.PlayerToWing,8:F0} {x.LeadToWing,10:F0}"
                + $"  {(x.LeadPresenting ? "P" : "-"),5} {(x.WingPresenting ? "P" : "-"),5}"
                + $" {(x.SessionActive ? "a" : "-")}{(x.PlayerAlive ? "p" : "-")}{(x.StillFighting ? "w" : "-")}"
                + $"  {x.LeadTactic,-22}"
                + $" {x.LeadRadius,6:F0}  {x.WingTactic,-8} {x.WingRole,-11}"
                + $" {x.WingRadius,6:F0} {x.WingContactAgeTicks,4} {x.WingSpeed,6:F1} {x.WingAltitude,6:F0}"
                + $" {x.LeadSpeed,6:F1} {x.PlayerSpeed,6:F1}"
                + $" {x.WingCommand.GDemand,5:F1} {x.WingCommand.BankTarget,6:F2} {x.WingCommand.Throttle,5:F2}"
                + $" {x.LeadRounds,5} {x.WingRounds,5}  {(x.LeadTrigger ? "L" : "-")}{(x.WingTrigger ? "W" : "-")}"
                + $" {x.LeadNoseErrDeg,6:F1} {x.LeadLeadErrDeg,6:F1} {(x.RoeHold ? "H" : "-")}"
                + $" {x.LeadAltitude,6:F0} {x.LeadGammaDeg,5:F0}"
                + $" {x.LeadCommand.GDemand,5:F1} {x.LeadCommand.BankTarget,6:F2} {x.LeadCommand.Throttle,5:F2}");
        }
        double minutes = s[^1].T / 60.0;
        _output.WriteLine(
            $"TOTALS lead={s[^1].LeadRounds} rounds ({s[^1].LeadRounds / minutes:F1}/min)"
            + $"  wing={s[^1].WingRounds} rounds ({s[^1].WingRounds / minutes:F1}/min)"
            + $" over {s[^1].T:F0} s");
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

    sealed record SoloSample(
        double T, double Range, string Tactic, int Rounds, bool Trigger,
        double NoseErrDeg, double AltM, double GammaDeg, PilotCommand Command,
        bool PlayerAlive, bool SessionActive);

    static System.Collections.Generic.List<SoloSample> FlySolo(double seconds) {
        var session = new SimulationSession();
        session.StartBeat(OneShipFixture);
        var samples = new System.Collections.Generic.List<SoloSample>();
        const double Dt = 1.0 / 120.0;
        int ticks = (int)Math.Ceiling(seconds / Dt);
        session.Begin();
        session.SetAnalogThrottleControl(0.2);
        for (int tick = 0; tick < ticks; tick++) {
            session.Advance(Dt);
            if (tick % 120 != 0) continue;
            AircraftState p = session.Player.State;
            AircraftState lead = session.Bandit.State;
            var trace = session.Bandit as IBanditDecisionTraceSource;
            samples.Add(new SoloSample(
                tick * Dt,
                Geometry.Range(p, lead),
                trace?.PolicyMemory.Tactic.ToString() ?? "?",
                session.OpponentPresent ? session.OpponentGun.RoundsFired : 0,
                session.OpponentTriggerDown,
                BanditFireControl.NoseErrorRad(lead, ActorObservation.Capture(p, tick))
                    * 180.0 / Math.PI,
                lead.Position.Y, lead.Gamma * 180.0 / Math.PI,
                trace?.AppliedCommand ?? default,
                session.PlayerAlive,
                session.Lifecycle == SimulationSession.LifecycleState.Active));
        }
        return samples;
    }

    [Fact]
    public void ReportColdPrimaryConversionOverASortie() {
        var s = FlySolo(240.0);
        _output.WriteLine("   t(s)    range  tactic    rnd trig  noseErr    alt  gamma     g   bank   thr");
        foreach (var x in s) {
            _output.WriteLine(
                $"{x.T,7:F0} {x.Range,8:F0}  {x.Tactic,-8} {x.Rounds,4}  {(x.Trigger ? "T" : "-")} "
                + $" {x.NoseErrDeg,7:F1} {x.AltM,6:F0} {x.GammaDeg,6:F0}"
                + $" {x.Command.GDemand,5:F1} {x.Command.BankTarget,6:F2} {x.Command.Throttle,5:F2}");
        }
        _output.WriteLine($"TOTAL rounds={s[^1].Rounds} over {s[^1].T:F0} s");
    }

    /// THE CONTROL for the 2v1 zero below: alone, the SAME cold opening converts. The solo
    /// primary's post-pass separation peaks at 3,494 m — six metres under the 3,500 m Return
    /// latch — so it stays in ordinary BFM, turns through the reversal, and guns the fixture
    /// player down (45 rounds by t≈68 s, measured). This is what proves the 2v1 lead's zero is
    /// formation-induced (the Bracket leg pushes it past the latch) and not a gunnery defect:
    /// same tier, same airframe, same player, one variable. If THIS test ever fails, the cold
    /// opening broke at a layer below the formation — look at the merge/BFM path first.
    [Fact]
    public void TheColdPrimaryFiresOnTheOpeningEngagement() {
        var s = FlySolo(180.0);
        Assert.NotEmpty(s);
        var alive = s.Where(x => x.SessionActive && x.PlayerAlive).ToList();
        Assert.True(alive.Count >= 60,
            $"the fixture only kept the session alive {alive.Count} sampled seconds — the "
            + "contract judged nothing");
        Assert.True(alive[^1].Rounds > 0,
            $"the cold-start primary fired {alive[^1].Rounds} rounds in {alive[^1].T:F0} s of a "
            + "live opening engagement — the bandit declined the fight (final range "
            + $"{alive[^1].Range:F0} m, altitude {alive[^1].AltM:F0} m, tactic {alive[^1].Tactic})");
    }

    /// THE COLD OPENING MUST SHOOT BACK — BOTH OF THEM. Production Builds 260 and 263 (owner
    /// flights, both cold page loads, ~110 s of real fight each): opponent_rounds_fired 0 and
    /// opponent_gun_firing true in 0 of 4,383 snapshot rows, while the player scored 3 hits and
    /// a kill. Two independent causes, one per ship:
    ///
    ///   WINGMAN — briefed Presenting and never graduated (fixed by pair graduation; the 2v1
    ///   contract above pins it). PRIMARY — after the 9 km pass the Bracket leg carries it past
    ///   the 3.5 km Return latch, and ReengageCommand's angle-proportional G at the 74-degree
    ///   bank cap turned "re-engage" into a full-burner climbing spiral (measured: 3.7 km to
    ///   8.5 km altitude, nose 54-95 degrees off, range pinned above the latch forever). The
    ///   solo control above shows the same primary converting when the latch never captures it.
    ///
    /// Doctrine (owner, 2026-08-02): "bandits have to attack, otherwise what's the point." A
    /// cold visitor's first fight is the product, and this is the shape every cold visitor
    /// meets. Rounds fired is the production telemetry field that measured the defect
    /// (opponent_rounds_fired / w1 gun state), so rounds fired is what the contract pins.
    [Fact]
    public void BothColdOpponentsFireWhileThePlayerIsAlive() {
        var s = Fly(240.0, fixture: DurablePlayerTwoShipFixture);
        Assert.NotEmpty(s);
        var alive = s.Where(x => x.SessionActive && x.PlayerAlive).ToList();
        Assert.True(alive.Count >= 30,
            $"the fixture only kept the fight alive {alive.Count} sampled seconds — the "
            + "contract judged nothing");
        int leadRounds = alive[^1].LeadRounds;
        int wingRounds = alive[^1].WingRounds;
        _output.WriteLine(
            $"cold 1v2, durable fixture: lead={leadRounds} rounds, wing={wingRounds} rounds "
            + $"across {alive[^1].T:F0} s of live fight");
        Assert.True(wingRounds > 0,
            $"the wingman fired {wingRounds} rounds across {alive[^1].T:F0} s of live fight — "
            + "the cold pair's second ship never attacked (production Builds 260/263 shape)");
        Assert.True(leadRounds > 0,
            $"the primary fired {leadRounds} rounds across {alive[^1].T:F0} s of live fight — "
            + "the cold pair's lead never attacked (production Builds 260/263 shape; last "
            + $"sample: range {alive[^1].PlayerToLead:F0} m, tactic {alive[^1].LeadTactic}, "
            + $"altitude {alive[^1].LeadAltitude:F0} m)");
    }
}
