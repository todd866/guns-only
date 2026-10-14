using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

/// Option A: one physical hit is the proof for rung 1. Loop audit #7 found that the proof was
/// only recorded when the ENGAGEMENT ended, so a pilot who hit and then went home (RTB
/// quarantines the unfinished fight) or closed the page lost it. Hits are now credited the tick
/// they land, positive-only, and never counted twice.
public class DirectorHitEvidenceTests {
    static AircraftState At(double z, double speed, double mass) => new(
        new Vec3D(0.0, 5486.4, z), speed, 0.0, 0.0, 0.0, mass);

    // Same close geometry as F22FiniteSortieTests, on the real visual-merge identity so the
    // F-22 ramp is live. hitsToDefeat decides whether a burst is a hit or a kill.
    static Func<BeatSetup> MergeAt(int hitsToDefeat) => () => {
        BeatSetup source = Beats.ModernVisualMerge();
        return source with {
            Player = At(0.0, 300.0, source.PlayerAir.MassKg),
            Bandit = At(160.0, 285.0, source.BanditAir.MassKg),
            UsesNeutralMergeBandit = false,
            UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = source.CombatRules with { OpponentHitsToDefeat = hitsToDefeat },
            ContinuousCombat = source.ContinuousCombat! with {
                ReplacementDelaySeconds = 0.2,
                MaximumFormationSize = 1,
            },
        };
    };

    static SimulationSession Started(Func<BeatSetup> beat, string? directorState = null) {
        var session = new SimulationSession();
        session.ArmDirectorStateForNextStage(directorState);
        session.StartBeat(beat);
        session.Begin();
        return session;
    }

    /// Hold the trigger from just behind the bandit until the first physical hit banks.
    static void FireUntilHit(SimulationSession session) {
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 4 * AircraftSim.TickHz && session.SortiePlayerHits == 0; i++) {
            AircraftState bandit = session.Bandit.State;
            session.Player.AdoptExternalKinematics(bandit with {
                Position = bandit.Position + new Vec3D(0, 0, -140),
                Speed = bandit.Speed + 5,
                Chi = 0,
            });
            session.StepFixed();
        }
        session.FeedKey(GKey.Trigger, false);
        Assert.True(session.SortiePlayerHits > 0);
    }

    [Fact]
    public void HitThenRtbKeepsTheEarnedRungAndTheSortieContract() {
        SimulationSession session = Started(MergeAt(10_000));
        Assert.Equal(0, session.DifficultyRung);
        Assert.Equal(0, session.SortieContractRung);
        FireUntilHit(session);
        Assert.Equal(1, session.DifficultyRung);
        int hits = session.SortiePlayerHits;
        Assert.Equal(hits, session.DirectorHits);
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff));
        for (int i = 0; i < AircraftSim.TickHz; i++) session.StepFixed();
        // Rounds already in the air may still land during the handoff drain. Those stay in the
        // sortie ledger; the ramp's evidence is what landed while the fight was the pilot's.
        Assert.Equal(hits, session.DirectorHits);
        Assert.Equal(1, session.DifficultyRung);
        // The sortie in progress keeps what it was staged with.
        Assert.Equal(0, session.SortieContractRung);
        Assert.Equal(PilotSkill.Competent, session.SortieOpponentSkill);
        Assert.Equal(PilotSkill.Veteran, session.EarnedOpening.Skill);

        // Next sortie opens on the earned rung.
        SimulationSession next = Started(MergeAt(10_000), session.ExportDirectorState());
        Assert.Equal(1, next.SortieContractRung);
        Assert.Equal(PilotSkill.Veteran, next.SortieOpponentSkill);
        Assert.Equal(hits, next.DirectorHits);
    }

    [Fact]
    public void HitThenPageCloseIsAlreadyInTheExportedState() {
        SimulationSession session = Started(MergeAt(10_000));
        FireUntilHit(session);
        // pagehide saves the export mid-fight; no engagement has ended.
        Assert.Empty(session.EngagementReports);
        var restored = new FightDirector();
        Assert.True(restored.TryImportState(session.ExportDirectorState()));
        Assert.Equal(1, restored.Rung);
        Assert.Equal(session.SortiePlayerHits, restored.Hits);
    }

    [Fact]
    public void NoHitAbandonmentNeitherPromotesNorDemotes() {
        var history = new FightDirector();
        // One hitless defeat on record: abandoning must not add a second one.
        history.Observe(new EngagementReport(1, PilotSkill.Competent, false,
            SortieOutcome.Defeat, 30, 2, 3, 40, 0, 0, 300, 0));
        Assert.Equal(1, history.HitlessDefeatStreak);
        string before = history.ExportState();
        SimulationSession session = Started(MergeAt(10_000), before);
        for (int i = 0; i < AircraftSim.TickHz; i++) session.StepFixed();
        Assert.True(session.TryRequestReturnToBase(MissionRtbReason.PilotKnockItOff));
        for (int i = 0; i < AircraftSim.TickHz; i++) session.StepFixed();
        Assert.Equal(0, session.SortiePlayerHits);
        // Staging alone moves the pacing phase (Calm -> Build) exactly as before this change, so
        // compare the ramp evidence rather than the whole blob.
        var after = new FightDirector();
        Assert.True(after.TryImportState(session.ExportDirectorState()));
        Assert.Equal(history.Rung, after.Rung);
        Assert.Equal(history.Hits, after.Hits);
        Assert.Equal(history.Kills, after.Kills);
        Assert.Equal(1, after.HitlessDefeatStreak);
    }

    [Fact]
    public void HitsCreditedLiveAreNotCountedAgainWhenTheFightEnds() {
        // One hit kills: the hit is credited on the tick it banks, then the same engagement
        // closes as a gun kill through Observe. Two kills fill the cap.
        SimulationSession session = Started(MergeAt(1));
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 40 * AircraftSim.TickHz && session.KillCount < 2; i++) {
            if (session.OpponentPresent && Geometry.Range(session.Player.State, session.Bandit.State) > 220.0) {
                AircraftState bandit = session.Bandit.State;
                AircraftState shooter = bandit with {
                    Position = bandit.Position - bandit.ForwardDir() * 140.0,
                    Speed = bandit.Speed + 20,
                };
                Assert.True(GunKill.TrySolveBallisticLead(shooter, bandit,
                    session.PlayerGun.Profile, out Vec3D lead, out _));
                Vec3D right = new Vec3D(0, 1, 0).Cross(lead).Normalized();
                session.Player.AdoptExternalKinematics(shooter with {
                    BodyAttitude = QuaternionD.FromFrame(right, lead.Cross(right), lead),
                });
            }
            session.StepFixed();
        }
        session.FeedKey(GKey.Trigger, false);
        Assert.Equal(2, session.KillCount);
        Assert.Equal(session.SortiePlayerHits, session.DirectorHits);
        Assert.Equal(2, session.DirectorKills);
        Assert.Equal(3, session.DifficultyRung);
        Assert.Equal(0, session.SortieContractRung);
    }

    [Fact]
    public void RepeatedExportImportNeverAddsHits() {
        SimulationSession session = Started(MergeAt(10_000));
        FireUntilHit(session);
        string first = session.ExportDirectorState();
        var director = new FightDirector();
        Assert.True(director.TryImportState(first));
        for (int i = 0; i < 4; i++) Assert.True(director.TryImportState(director.ExportState()));
        Assert.Equal(first, director.ExportState());
        // A restart re-arms the same blob: the hit is not re-credited by staging.
        SimulationSession again = Started(MergeAt(10_000), first);
        for (int i = 0; i < AircraftSim.TickHz; i++) again.StepFixed();
        Assert.Equal(session.SortiePlayerHits, again.DirectorHits);
    }

    [Fact]
    public void PracticeHitsNeverReachTheRamp() {
        SimulationSession session = Started(() => PracticeBeats.Create(PracticeExercise.Gunnery));
        session.FeedKey(GKey.Trigger, true);
        for (int i = 0; i < 10 * AircraftSim.TickHz
            && session.Lifecycle == SimulationSession.LifecycleState.Active; i++)
            session.StepFixed();
        Assert.True(session.SortiePlayerHits > 0);
        Assert.Equal(0, session.DirectorHits);
        Assert.Equal(0, session.DifficultyRung);
        Assert.Equal(-1, session.SortieContractRung);
        Assert.Equal(0, session.FiniteEngagementCap);
    }

    [Fact]
    public void AValleyHitDoesNotChangeTheAssistMidSortie() {
        // The valley reads its pitch-assist rung live; a mid-fight credit must pin it first.
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMergeFirstRun);
        session.Begin();
        AircraftParams before = session.GunneryPitchAssistAir();
        Assert.Equal(0, session.DifficultyRung);
        // Flying the canyon to the gate is out of scope here; drive the same credit seam the
        // gun ledger calls. After the rung moves, the sortie keeps the assist it started with.
        session.CreditDirectorHits(1, double.NaN);
        Assert.Equal(1, session.DifficultyRung);
        Assert.Equal(before, session.GunneryPitchAssistAir());
    }
}
