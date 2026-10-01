using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

// Partial of SimulationSession: Opponents.
public sealed partial class SimulationSession {
    public double OpponentEffectiveWingSpanM =>
        OpponentPresent ? _bandit.EffectiveWingSpanM : double.NaN;

    public bool OpponentPresent => _beat is not null
        && _beat.InitialOpponent.HasValue
        && _bandit is not null;
    public IBandit Bandit => OpponentPresent
        ? _bandit
        : throw new InvalidOperationException(
            "The active mission does not stage an opponent.");
    /// Opponents beyond the primary — the 1v2 and beyond.
    public IReadOnlyList<Wingman> Wingmen => _wingmen;
    public AircraftState SelectedOpponentState {
        get {
            if (!OpponentPresent)
                throw new InvalidOperationException(
                    "The active mission does not stage an opponent.");
            Wingman? wingman = _wingmen.FirstOrDefault(wingman =>
                wingman.PlayerGunTargetId == _selectedPlayerGunTargetId);
            return wingman?.Bandit.State ?? _bandit.State;
        }
    }
    public bool SelectedOpponentAlive => OpponentPresent
        && IsPlayerGunTargetLive(_selectedPlayerGunTargetId);
    public double SelectedOpponentHealth =>
        OpponentPresent ? _gunKill.TargetHealthFor(_selectedPlayerGunTargetId) : 0.0;
    public bool PrimaryOpponentAlive =>
        OpponentPresent
        && _opponentTerminalState == AircraftTerminalState.Flying
        && _gunKill.DamageFor(_primaryOpponentGunTargetId).TargetAlive;
    public double PrimaryOpponentHealth =>
        OpponentPresent ? _gunKill.TargetHealthFor(_primaryOpponentGunTargetId) : 0.0;
    /// Every opponent still fighting, primary first. One entry for an ordinary duel.
    public int LiveOpponentCount =>
        (OpponentPresent && _opponentTerminalState == AircraftTerminalState.Flying ? 1 : 0)
        + _wingmen.Count(static wingman => wingman.StillFighting);
    public DroneRaidEvaluation? DroneRaidEvaluation => _droneRaidEvaluation;
    public CombatHandoffPhase CombatHandoffPhase => _combatHandoffPhase;
    /// True only while a valid active F-22 continuous fight can still accept the command.
    public bool CombatHandoffAvailable =>
        _combatHandoffPhase == CombatHandoffPhase.Available
        && Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying
        && (LiveOpponentCount > 0
            || OpponentReplacementPending
            || (TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)
                && _beat.RecoveryPlan is not null)
            || (_beat.FirstRunValley is not null && _beat.RecoveryPlan is not null)
            || (_billedSortieComplete && _beat.RecoveryPlan is not null));
    /// Latched from the accepted rising edge through recovery.
    public bool CombatHandoffRequested =>
        _combatHandoffPhase >= CombatHandoffPhase.Requested;
    /// True once the relief actor has accepted combat custody, including completed/lost outcomes.
    public bool CombatHandoffActive =>
        _combatHandoffPhase >= CombatHandoffPhase.ReliefEngaged;
    public int ReliefKills => _reliefKills;
    public ReliefFighter? Relief => _reliefFighter;
    public bool ContinuousCombat => _beat.ContinuousCombat is not null;
    public FormationTacticalRole PrimaryFormationRole =>
        _bandit is not null
        && _opponentTerminalState == AircraftTerminalState.Flying
        && !_bandit.CatastrophicallyDamaged
        && _bandit is IFormationDirectiveSink sink
            ? sink.FormationDirective.Role
            : FormationTacticalRole.Independent;
    public FormationTacticalRole WingmanFormationRole(int index) =>
        index >= 0
        && index < _wingmen.Count
        && _wingmen[index].StillFighting
        && _wingmen[index].Bandit is IFormationDirectiveSink sink
            ? sink.FormationDirective.Role
            : FormationTacticalRole.Independent;
    public double? FormationCoordinationAgeSeconds =>
        _enemyPairCoordinator.Active
            ? _enemyPairCoordinator.SharedContactAgeTicks * FixedDeltaSeconds
            : null;
    /// The BEHAVIOURAL fallback window, published as formation_coordination_stale: the shared
    /// picture is older than the collection interval, so each pilot flies on its own senses until
    /// the next delivery lands. Entered once per refresh cycle in completely normal operation —
    /// true in 8% of the Build 264 rows on a ~1.2 s period, which is the sawtooth, not a fault.
    ///
    /// It keeps this name and this meaning ON PURPOSE. It is noisy but it is INFORMATIVE: it says
    /// how much of the fight the two ships spent uncoordinated, and that is a real behavioural
    /// measurement. Quietly redefining the field to a health threshold would have made a
    /// 264-vs-265 comparison read the resulting ~0% as a sim fix. The fault signal is the separate
    /// FormationCoordinationHealthStale below.
    public bool FormationCoordinationStale =>
        _enemyPairCoordinator.Active
        && _enemyPairCoordinator.SharedContactStale;
    /// Genuine coordination staleness — a scheduled shared-picture delivery was MISSED — published
    /// as the NEW formation_coordination_health_stale. This is the one to alarm on.
    public bool FormationCoordinationHealthStale =>
        _enemyPairCoordinator.Active
        && _enemyPairCoordinator.SharedContactHealthStale;
    public int EngagementNumber => _engagementNumber;
    public EngagementReport? LastEngagementReport =>
        _engagementReports.Count == 0 ? null : _engagementReports[^1];
    public IReadOnlyList<EngagementReport> EngagementReports => _engagementReports;
    public DirectorPhase DirectorPhase => _fightDirector.Phase;
    public LearnerBands LearnerBands => _fightDirector.Bands;
    public SpawnSpec? LastDirectorSpawn { get; private set; }
    /// The capability of the aircraft ACTUALLY FLYING, not the one the beat staged. Presentation
    /// read Beat.BanditAircraft directly, so the HUD and telemetry reported a Su-27S no matter what
    /// was really out there — the Su-35S at the Ace rung, a director-uprated mount, or the 15 G
    /// machine spike. That is a lie to the pilot about the thing trying to kill them, and it also
    /// made the mount escalation impossible to verify from a production tape.
    public AircraftCapability CurrentBanditCapability =>
        LastDirectorSpawn is { } spawn
            ? _beat.BanditAircraftForMount(spawn.Skill, spawn.Mount)
            : _beat.BanditAircraftForSkill(_beat.BanditSkill);
    /// The mount the director last staged, for debrief and telemetry.
    public BanditMount CurrentBanditMount =>
        LastDirectorSpawn?.Mount ?? BanditMount.Baseline;
    public int DirectorWalkoverStreak => _fightDirector.WalkoverStreak;
    /// Current difficulty rung. Telemetry and debrief read it. The HUD does not print a grade.
    public int DifficultyRung => _fightDirector.Rung;
    /// Carry the pacing estimate across a page reload. See FightDirector.ExportState.
    public string ExportDirectorState() => _fightDirector.ExportState();
    public bool TryImportDirectorState(string? state) =>
        _fightDirector.TryImportState(state);
    /// Stash a blob to apply after the next StartBeat reset and before the opening spawn.
    /// StartBeat clears the director on purpose; restoring after StageBeat would miss that spawn.
    public void ArmDirectorStateForNextStage(string? state) =>
        _directorStateForNextStage = string.IsNullOrWhiteSpace(state) ? null : state;

    static bool UsesDifficultyRamp(BeatSetup beat) =>
        beat.FirstRunValley is not null
        || IsVisualMergeSortie(beat);

    static bool IsVisualMergeSortie(BeatSetup beat) =>
        beat.MissionIdentity.Id
            == "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1";

    void ApplyArmedDirectorState(BeatSetup beat) {
        if (_directorStateForNextStage is null) return;
        if (!UsesDifficultyRamp(beat)) {
            _directorStateForNextStage = null;
            return;
        }
        _fightDirector.TryImportState(_directorStateForNextStage);
        _directorStateForNextStage = null;
    }
    public bool OpponentReplacementPending =>
        OpponentPresent
        && !CombatHandoffRequested
        && (_beat.ContinuousCombat is not null
            || _wingmen.Any(static wingman => wingman.StillFighting))
        && Lifecycle == LifecycleState.Active
        && _playerTerminalState == AircraftTerminalState.Flying
        && _opponentTerminalState != AircraftTerminalState.Flying
        && double.IsFinite(_nextOpponentSpawnAtMs);
    public double OpponentReplacementSeconds => OpponentReplacementPending
        ? Math.Max(0.0, (_nextOpponentSpawnAtMs - _simTimeMs) / 1000.0)
        : 0.0;
    public AircraftTerminalState OpponentTerminalState => _opponentTerminalState;
    /// A completed staged raid has no authoritative target even though its last mission-killed or
    /// leaked vehicle is not integrated through the ordinary one-opponent terminal state machine.
    public bool OpponentBodyPresent => _droneRaidEvaluation is {
        Finished: true, OwnshipLost: false
    } ? false : OpponentPresent
        && _opponentTerminalState != AircraftTerminalState.Settled;
    public ImpactSurface OpponentImpactSurface => _opponentImpactSurface;
    /// The detached opponent wreck that backs formation snapshot slot <paramref name="index"/>
    /// once live wingmen run out. Production Build 260: the instant the player killed the
    /// primary, promotion moved the surviving wingman into the opponent slot and detached the
    /// dead airframe into a list neither wire format projected — so w1_present dropped to 0 at
    /// exactly the kill tick and the falling jet blinked out of the world. Formation slots fill
    /// with live wingmen first (their existing order, untouched), then with wrecks that still
    /// physically exist in the air or tumbling on contact. Settled and simulation-bounded hulks
    /// stay off the wire, which is the same quiet exit the pre-formation replacement flow
    /// always had.
    ///
    /// SLOT OWNERSHIP FOLLOWS THE AIRFRAME, NEVER ITS LIST INDEX. The wreck list mutates
    /// constantly under a live fight: an egressing wreck is removed mid-step, an overflowing
    /// list evicts a settled hulk, and a wreck simply coming to rest drops out of the eligible
    /// set. Every one of those shifts the positional offset of every LATER wreck, so a still
    /// falling airframe would migrate w3 to w2 in a single tick — and since the renderer is keyed
    /// by SLOT (app.js reads w1x/w2x/w3x) with no entity id projected for these slots, that
    /// migration teleports the wreck across the sky with nothing able to detect the substitution.
    /// A wreck therefore keeps the slot it was first granted for as long as it stays eligible and
    /// a live wingman has not claimed that slot back.
    public DetachedOpponentWreck? DetachedWreckForFormationSlot(int index) {
        if (index < 0 || index >= FormationWireSlotCount) return null;
        ReconcileWreckFormationSlots();
        foreach (DetachedOpponentWreck wreck in _detachedOpponentWrecks)
            if (_wreckFormationSlots.TryGetValue(wreck, out int slot) && slot == index)
                return wreck;
        return null;
    }

    /// Settled and simulation-bounded hulks stay off the wire, which is the same quiet exit the
    /// pre-formation replacement flow always had.
    static bool WreckOccupiesFormationSlot(DetachedOpponentWreck wreck) =>
        wreck.TerminalState is not (AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded);

    /// Idempotent, and a pure function of the wreck list, the live wingman count and the slots
    /// already granted — both wire writers call it every frame and must agree.
    void ReconcileWreckFormationSlots() {
        if (_wreckFormationSlots.Count > 0) {
            _wreckFormationSlotEvictions.Clear();
            foreach (KeyValuePair<DetachedOpponentWreck, int> held in _wreckFormationSlots) {
                // A live wingman outranks a wreck for the low slots (their existing order is
                // untouched), and a wreck that left the eligible set surrenders its slot.
                if (held.Value >= _wingmen.Count
                    && WreckOccupiesFormationSlot(held.Key)
                    && _detachedOpponentWrecks.Contains(held.Key)) continue;
                _wreckFormationSlotEvictions.Add(held.Key);
            }
            foreach (DetachedOpponentWreck evicted in _wreckFormationSlotEvictions)
                _wreckFormationSlots.Remove(evicted);
            _wreckFormationSlotEvictions.Clear();
        }
        foreach (DetachedOpponentWreck wreck in _detachedOpponentWrecks) {
            if (!WreckOccupiesFormationSlot(wreck)
                || _wreckFormationSlots.ContainsKey(wreck)) continue;
            for (int slot = _wingmen.Count; slot < FormationWireSlotCount; slot++) {
                if (_wreckFormationSlots.ContainsValue(slot)) continue;
                _wreckFormationSlots[wreck] = slot;
                break;
            }
        }
    }

    public IReadOnlyList<DetachedOpponentWreck> DetachedOpponentWrecks =>
        _detachedOpponentWrecks;
    public bool OpponentTriggerDown => _opponentTriggerDown;

    bool RequestCombatHandoff(MissionRtbReason reason) {
        if (!CombatHandoffAvailable) return false;

        _returnToBaseReason = reason;
        _combatHandoffPhase = CombatHandoffPhase.Requested;
        bool finiteArenaAlreadyClear = LiveOpponentCount == 0
            && (TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id)
                || _beat.FirstRunValley is not null);
        // Successor suppression is authoritative on the input edge, before another fixed tick can
        // observe an expired replacement timer.
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        Trigger(false);
        // KNOCK IT OFF is also an immediate ceasefire boundary. Do not leave the previous fixed
        // tick's trigger latches visible (or firing in a host snapshot) until the next StepCore.
        // Already-airborne rounds remain physical and are drained by the handoff state machine.
        _opponentTriggerDown = false;
        foreach (Wingman wingman in _wingmen)
            wingman.TriggerDown = false;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _playerGunTargetPadlockRollAssistSelected = false;
        _playerGunTargetPadlockRollAssistTargetId = 0;
        _padlockRollAssist.Reset();
        ClearFormationCoordination();
        CompleteInterruptedEngagementForHandoff();
        if (finiteArenaAlreadyClear) {
            _combatHandoffPhase = CombatHandoffPhase.PlayerRtb;
            ShowTransition(_beat.FirstRunValley is not null
                ? "PAIR DOWN · FLY THE HOME CORRIDOR"
                : ReplacementBudgetExhausted
                    ? "FIGHT COMPLETE · RTB CARRIER"
                    : "KNOCK IT OFF · RTB CARRIER", 2800.0);
            return true;
        }
        bool reliefRequired = LiveOpponentCount > 0 || OpponentReplacementPending;
        ShowTransition(reliefRequired
            ? reason == MissionRtbReason.BingoFuel
                ? "BINGO · KNOCK IT OFF · RELIEF INBOUND · RTB"
                : "KNOCK IT OFF · RELIEF INBOUND · RTB"
            : reason == MissionRtbReason.BingoFuel
                ? "BINGO · FIGHT COMPLETE · FLY THE HOME CORRIDOR"
                : "FIGHT COMPLETE · FLY THE HOME CORRIDOR", 3200.0);
        return true;
    }

    /// <summary>
    /// Move handoff authority only at a fixed-tick boundary. Each public phase is held for at
    /// least one production tick, which makes replay, presentation and tests observe the same
    /// monotonic sequence regardless of host input batching.
    /// </summary>
    void AdvanceCombatHandoffAtTickBoundary() {
        switch (_combatHandoffPhase) {
            case CombatHandoffPhase.Requested:
                // A finite Top Gun fight can finish before the pilot calls RTB or reaches Bingo.
                // There is then no opponent custody to transfer and no honest relief actor to
                // announce; arm recovery directly while retaining the same RTB lifecycle.
                if (LiveOpponentCount <= 0 && !OpponentReplacementPending) {
                    _combatHandoffPhase = CombatHandoffPhase.PlayerRtb;
                    return;
                }
                SpawnReliefAndRetargetOpponents();
                _combatHandoffPhase = CombatHandoffPhase.Drain;
                return;

            case CombatHandoffPhase.Drain:
                // Enemy old rounds already remain in their player-bound retired guns. Only the
                // player's gun owns enemy damage, so its rounds are the atomic-transfer boundary.
                if (_gunKill.RoundsInFlight.Count != 0) return;
                ArmReliefGunFromPlayerDamage();
                _combatHandoffPhase = CombatHandoffPhase.ReliefEngaged;
                ShowTransition("RELIEF HAS THE FIGHT · RETURN TO BASE", 3200.0);
                return;

            case CombatHandoffPhase.ReliefEngaged:
                _combatHandoffPhase = CombatHandoffPhase.PlayerRtb;
                return;

            case CombatHandoffPhase.PlayerRtb:
                // A completed finite fight can enter RTB without ever spawning relief. Keep that
                // honest no-relief route in PlayerRtb until the runway model records recovery;
                // opponent absence alone cannot manufacture a relief-complete state or cue.
                if (_reliefFighter is null) return;
                if (LiveOpponentCount == 0) {
                    _combatHandoffPhase = CombatHandoffPhase.ReliefComplete;
                    ShowTransition("RELIEF COMPLETE · CONTINUE RTB", 2600.0);
                } else if (!_reliefFighter.StillFighting) {
                    _combatHandoffPhase = CombatHandoffPhase.ReliefLost;
                    ShowTransition("RELIEF LOST · CONTINUE RTB", 3000.0);
                }
                return;
        }
    }

    void SpawnReliefAndRetargetOpponents() {
        if (LiveOpponentCount <= 0) return;

        AircraftState target = SelectedOpponentAlive
            ? SelectedOpponentState
            : _bandit.State;
        int deterministicSeed = Math.Max(1, _engagementNumber * 4 + 1);
        double reliefSpeedMps = Math.Max(
            180.0,
            BeatSetup.CornerTrueAirspeedMps(
                _beat.PlayerAir, target.Position.Y));
        ReactiveBandit actor = ReactiveBandit.SpawnForMerge(
            target,
            _beat.PlayerAir,
            deterministicSeed,
            reliefSpeedMps,
            PilotSkill.Ace,
            _terrainSurface);
        actor.Wind = _player.Wind;
        actor.Atmosphere = _player.AtmosphereModel;
        long spawnSequence = ++_reliefSpawnSequence;
        _reliefFighter = new ReliefFighter(actor, spawnSequence);
        ConfigureLookaheadCadence(actor, 2_000_000L + spawnSequence);
        _reliefThreatState = actor.State;
        _reliefThreatStateValid = true;

        RetargetOpponentGun(
            _primaryOpponentGunTargetId, _bandit, _opponentGun);
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            RetargetOpponentGun(
                wingman.PlayerGunTargetId, wingman.Bandit, wingman.Gun);
        }
    }

    void RetargetOpponentGun(long enemyTargetId, IBandit shooter, GunKill sourceGun) {
        if (sourceGun.Outcome != FightOutcome.Flying) return;
        if (sourceGun.RoundsInFlight.Count > 0)
            _retiredOpponentGuns.Add(new RetiredOpponentGun(shooter, sourceGun));
        GunKill reliefTargetingGun = sourceGun.CreateForRetargetedTarget();
        _reliefTargetingOpponentGuns[enemyTargetId] =
            new ReliefTargetingOpponentGun(shooter, reliefTargetingGun);
    }

    List<long> LiveOpponentTargetIds() {
        var targetIds = new List<long>(1 + _wingmen.Count);
        if (_opponentTerminalState == AircraftTerminalState.Flying
            && !_bandit.CatastrophicallyDamaged)
            targetIds.Add(_primaryOpponentGunTargetId);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.StillFighting)
                targetIds.Add(wingman.PlayerGunTargetId);
        }
        return targetIds;
    }

    void ArmReliefGunFromPlayerDamage() {
        if (_reliefFighter is not { StillFighting: true } relief) return;
        List<long> liveTargetIds = LiveOpponentTargetIds();
        if (liveTargetIds.Count == 0) return;
        long selectedTargetId = liveTargetIds.Contains(_selectedPlayerGunTargetId)
            ? _selectedPlayerGunTargetId
            : liveTargetIds[0];
        CombatConfig combat = _beat.CombatRules;
        relief.Gun = _gunKill.CreateForFreshShooterAgainstTargets(
            liveTargetIds,
            selectedTargetId,
            combat.PlayerAmmo,
            combat.PlayerGunProfile.EffectiveHitRadiusM,
            combat.PlayerGunProfile);
    }

    /// <summary>
    /// Apply presentation-measured compute pressure to throwaway opponent forecasts. Fixed-tick
    /// flight, guns, damage, terrain recovery, candidate count, and forecast horizon stay
    /// authoritative; coarser forecast integration may select a different candidate maneuver.
    /// The selected level is explicit input so an identical level tape remains replayable.
    /// </summary>
    public void SetAiComputeLevel(AiComputeLevel level) {
        if (!Enum.IsDefined(level))
            throw new ArgumentOutOfRangeException(nameof(level));
        _aiComputeLevel = level;
        // Calling this host boundary is also the explicit opt-in to amortized lookahead. Session
        // consumers which never supply presentation pressure retain the historical synchronous
        // policy boundary, including tick-zero decision-recording semantics. The browser calls
        // this even for Full, so production still receives bounded per-tick forecast work.
        _incrementalAiPlanningEnabled = true;
    }

    public bool SetArenaHandicap(BanditSkillProfile profile, PilotSkill skillLabel) {
        _arenaHandicapProfile = profile;
        _arenaHandicapSkill = skillLabel;
        _arenaHandicapActive = true;
        // StartBeat may have already staged a 1v2 before the matchmaker reply arrived. Multiplayer
        // is always 1v1 — drop any wingmen when the handicap lands.
        ClearWingmen();
        return ApplyArenaHandicapToPrimaryBandit();
    }

    public void ClearArenaHandicap() {
        _arenaHandicapProfile = null;
        _arenaHandicapActive = false;
        _arenaHandicapSkill = PilotSkill.Competent;
    }

    public bool ArenaHandicapActive => _arenaHandicapActive;

    bool ApplyArenaHandicapToPrimaryBandit() {
        if (!_arenaHandicapActive || _arenaHandicapProfile is not { } profile) return false;
        if (!OpponentPresent) return false;
        return _bandit switch {
            ReactiveBandit reactive => ReplacePrimaryBandit(new ReactiveBandit(
                reactive.State, reactive.AircraftParameters, _arenaHandicapSkill, _terrainSurface,
                profile: profile) {
                Wind = reactive.Wind,
                Atmosphere = reactive.Atmosphere,
            }),
            NeutralMergeBandit merge => ReplacePrimaryBandit(new NeutralMergeBandit(
                merge.State,
                merge.FightAircraftParameters ?? merge.BriefedAircraftParameters,
                _arenaHandicapSkill,
                _terrainSurface,
                profile: profile) {
                Wind = merge.Wind,
                Atmosphere = merge.Atmosphere,
            }),
            _ => false,
        };
    }

    bool ReplacePrimaryBandit(IBandit next) {
        switch (next) {
            case ReactiveBandit reactive:
                reactive.ConfigureAiPlanning(
                    _aiComputeLevel, _incrementalAiPlanningEnabled);
                break;
            case NeutralMergeBandit merge:
                merge.ConfigureAiPlanning(
                    _aiComputeLevel, _incrementalAiPlanningEnabled);
                break;
        }
        _bandit = next;
        return true;
    }

    void StepPrimaryOpponent(in ActorObservation observation, double dt) {
        if (_firstRunValleyRuntime?.ParkOpponents == true) return;
        if (_opponentTerminalState == AircraftTerminalState.SimulationBounded) return;
        _bandit.Step(observation, dt);
    }

    void ConfigureAdaptiveAiPlanning() {
        if (_bandit is IAdaptiveAiPlanner primary)
            primary.ConfigureAiPlanning(
                _aiComputeLevel, _incrementalAiPlanningEnabled);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Bandit is IAdaptiveAiPlanner support)
                support.ConfigureAiPlanning(
                    _aiComputeLevel, _incrementalAiPlanningEnabled);
        }
        if (_reliefFighter is {
                StillFighting: true,
                Actor: IAdaptiveAiPlanner relief })
            relief.ConfigureAiPlanning(
                _aiComputeLevel, _incrementalAiPlanningEnabled);
    }

    void UpdateFormationCoordination() {
        bool eligibleBeat = _beat.ContinuousCombat is not null
            && (_beat.UsesReactiveBandit || _beat.UsesNeutralMergeBandit)
            && !CombatHandoffRequested;
        if (!eligibleBeat
            || _playerTerminalState != AircraftTerminalState.Flying
            || _opponentTerminalState != AircraftTerminalState.Flying
            || _bandit.CatastrophicallyDamaged
            || _bandit is not IFormationDirectiveSink primarySink) {
            ClearFormationCoordination();
            return;
        }

        Wingman? support = null;
        int liveSupportCount = 0;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            liveSupportCount++;
            support = wingman;
        }
        if (liveSupportCount != 1
            || support is null
            || support.Bandit is not IFormationDirectiveSink supportSink) {
            ClearFormationCoordination();
            return;
        }

        // THE PAIR TURNS TOGETHER. The co-operative opening can brief ships to present, but
        // graduation was per-aircraft: each ship privately waited for the player to hold the gun
        // funnel on ITSELF. The player naturally spends that funnel on the primary, so a
        // presenting wingman was never tracked, never graduated, and paraded its fixed
        // 15-degree present orbit out of the fight forever — Build 244 production: beyond 10 km
        // for 68.8% of its live time while the player fought the lead. Every tactic-level fix
        // was a bit-identical no-op because a presenting airframe does not fly the tactic
        // layer's commands at all (CommandForFlight substitutes PresentCommand). The moment any
        // member of the pair is fighting, the whole pair fights; both calls are one-way no-ops
        // on an actor already fighting.
        if (_bandit.Presenting != support.Bandit.Presenting) {
            _bandit.EndPresentation();
            support.Bandit.EndPresentation();
        }

        ActorObservation sharedContact =
            ObservePlayer(_player.State);
        _enemyPairCoordinator.Step(
            _tick,
            sharedContact,
            new FormationCoordinationMember(
                _primaryOpponentGunTargetId, _bandit.State),
            new FormationCoordinationMember(
                support.PlayerGunTargetId, support.Bandit.State));
        primarySink.AcceptFormationDirective(
            _enemyPairCoordinator.DirectiveFor(
                _primaryOpponentGunTargetId, _tick));
        supportSink.AcceptFormationDirective(
            _enemyPairCoordinator.DirectiveFor(
                support.PlayerGunTargetId, _tick));
    }

    void ClearFormationCoordination() {
        _enemyPairCoordinator.Reset();
        if (_bandit is IFormationDirectiveSink primarySink)
            primarySink.AcceptFormationDirective(default);
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Bandit is IFormationDirectiveSink supportSink)
                supportSink.AcceptFormationDirective(default);
        }
    }

    bool SupportsCombatHandoff =>
        OpponentPresent
        && _beat.ContinuousCombat is not null
        && (_beat.PlayerAircraft.Id == AircraftCapability.F22ASurrogate.Id
            || TopGunFightRuntime.IsTopGunMission(_beat.MissionIdentity.Id));

    /// Take the primary out of the fight without needing a gun solution. Test seam only — it
    /// drives the same path a real gun kill does, so promotion and wave staging are exercised
    /// rather than simulated.
    public void ForceOpponentDefeatForTest() {
        if (!OpponentPresent
            || _opponentTerminalState != AircraftTerminalState.Flying) return;
        _killCount++;
        BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
    }

    /// Stage the rest of the formation alongside the primary. Each gets its own controller, its
    /// own magazine, and a merge position offset from the leader so they arrive as a pair rather
    /// than a single contact — a formation the pilot has to split, which is the entire point.
    void StageWingmen(in SpawnSpec spec, int engagementNumber) {
        ClearWingmen();
        if (_beat.ContinuousCombat is null) return;
        int ceiling = System.Math.Max(1, _beat.ContinuousCombat.MaximumFormationSize);
        int extra = System.Math.Max(0,
            System.Math.Min(spec.FormationSize, ceiling) - 1);
        if (extra == 0) return;

        CombatConfig combat = _beat.CombatRules;
        AircraftParams air = _beat.BanditAirForMount(spec.Skill, spec.Mount);
        for (int index = 0; index < extra; index++) {
            IBandit wing = _beat.FirstRunValley is not null && _bandit is not null
                ? CreateFirstRunValleyWingman(spec, air, index)
                : _beat.CreateNextBandit(
                    _player.State, engagementNumber + WingmanSpawnStride * (index + 1),
                    _terrainSurface, spec, wingLead: _bandit?.State);
            wing.Wind = _player.Wind;
            wing.Atmosphere = _player.AtmosphereModel;
            var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);
            _wingmen.Add(new Wingman(
                wing, gun, spec.Skill, AllocateOpponentGunTargetId()));
        }
    }

    /// The surveyed mouth pair is a co-altitude presenting formation. SpawnForMerge still lifts
    /// replacements 600 m AGL so they clear ridges on a high merge; that put dash-2 500 m above
    /// the parked leader and broke the pop-out picture.
    IBandit CreateFirstRunValleyWingman(SpawnSpec spec, AircraftParams air, int index) {
        AircraftState lead = _bandit.State;
        const double FightingWingRangeM = 1_200.0;
        const double FortyFiveDegreeComponent = 0.70710678118654752;
        double side = (index & 1) == 0 ? 1.0 : -1.0;
        double component = FightingWingRangeM * FortyFiveDegreeComponent;
        var leadForward = new Vec3D(Math.Sin(lead.Chi), 0.0, Math.Cos(lead.Chi));
        var leadRight = new Vec3D(Math.Cos(lead.Chi), 0.0, -Math.Sin(lead.Chi));
        Vec3D position = lead.Position
            - leadForward * component
            + leadRight * (side * component);
        position = position with { Y = lead.Position.Y };
        var initial = new AircraftState(
            position, lead.Speed, 0.0, lead.Chi, 0.0, air.MassKg);
        return _beat.UsesNeutralMergeBandit
            ? new NeutralMergeBandit(
                initial, air, spec.Skill, _terrainSurface,
                profile: spec.Boss ? BanditSkillProfile.Boss() : null,
                doctrineIndex: spec.DoctrineIndex,
                presenting: true)
            : new ReactiveBandit(
                initial, air, spec.Skill, _terrainSurface,
                engagementNumber: 2 + index,
                profile: spec.Boss ? BanditSkillProfile.Boss() : null,
                doctrineIndex: spec.DoctrineIndex,
                presenting: true);
    }

    void StageScriptedFormation(int formationSize) {
        CombatConfig combat = _beat.CombatRules;
        int boundedSize = Math.Clamp(formationSize, 1, 6);
        for (int index = 1; index < boundedSize; index++) {
            IBandit aircraft = _beat.CreateScriptedFormationBandit(index, _terrainSurface);
            aircraft.Wind = _player.Wind;
            aircraft.Atmosphere = _player.AtmosphereModel;
            var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM,
                combat.OpponentGunProfile);
            _wingmen.Add(new Wingman(
                aircraft, gun, _beat.BanditSkill, AllocateOpponentGunTargetId()));
        }
    }

    void ConfigureFormationLookaheadCadence() {
        if (_beat.ContinuousCombat is null || _wingmen.Count != 1) return;
        ConfigureLookaheadCadence(_bandit, _primaryOpponentGunTargetId);
        ConfigureLookaheadCadence(
            _wingmen[0].Bandit,
            _wingmen[0].PlayerGunTargetId);
    }

    static void ConfigureLookaheadCadence(IBandit bandit, long actorId) {
        int cadence = ReactiveBandit.LookaheadDecisionCadenceTicks;
        int actorLane = (int)(actorId % cadence);
        // Five ticks keeps adjacent formation IDs off the same two-tick render frame while
        // remaining coprime to the twelve-tick cadence, so every actor ID maps deterministically.
        int phase = actorLane * 5 % cadence;
        switch (bandit) {
            case NeutralMergeBandit merge:
                merge.ConfigureLookaheadCadencePhase(phase);
                break;
            case ReactiveBandit reactive:
                reactive.ConfigureLookaheadCadencePhase(phase);
                break;
        }
    }

    void ClearWingmen() {
        ClearFormationCoordination();
        foreach (Wingman wingman in _wingmen) {
            if (wingman.Gun.RoundsInFlight.Count > 0)
                _retiredOpponentGuns.Add(
                    new RetiredOpponentGun(wingman.Bandit, wingman.Gun));

            AircraftTerminalState terminalState = wingman.TerminalState;
            if (terminalState == AircraftTerminalState.Flying
                && wingman.Bandit.CatastrophicallyDamaged)
                terminalState = AircraftTerminalState.DestroyedAirborne;
            if (terminalState == AircraftTerminalState.Flying) continue;
            _detachedOpponentWrecks.Add(new DetachedOpponentWreck(
                wingman.Bandit,
                wingman.PlayerGunTargetId,
                terminalState,
                wingman.ImpactSurface));
        }
        while (_detachedOpponentWrecks.Count > 8) {
            int settledIndex = _detachedOpponentWrecks.FindIndex(
                static wreck => wreck.TerminalState is AircraftTerminalState.Settled
                    or AircraftTerminalState.SimulationBounded);
            if (settledIndex < 0) break;
            _detachedOpponentWrecks.RemoveAt(settledIndex);
        }
        _wingmen.Clear();
    }

    void StepReliefFighter() {
        if (_reliefFighter is not { } relief
            || relief.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
            return;

        AircraftState previousState = relief.State;
        _reliefThreatState = previousState;
        _reliefThreatStateValid = true;
        if (AtmosphereBoundaryReached(previousState, relief.Actor.Atmosphere)) {
            relief.TriggerDown = false;
            relief.TerminalState = AircraftTerminalState.SimulationBounded;
            relief.ImpactSurface = ImpactSurface.SimulationBoundary;
            EmitEvent(SessionEventType.TerminalLimitReached,
                CombatRole.None, CombatRole.Relief,
                surface: ImpactSurface.SimulationBoundary,
                entitySequence: relief.SpawnSequence,
                kinematics: previousState);
            return;
        }
        if (relief.TerminalState == AircraftTerminalState.Flying
            && relief.Actor.CatastrophicallyDamaged)
            relief.TerminalState = AircraftTerminalState.DestroyedAirborne;

        long targetId = IsOpponentTargetLiveForHandoff(
            _selectedPlayerGunTargetId)
                ? _selectedPlayerGunTargetId
                : _primaryOpponentGunTargetId;
        AircraftState targetState = OpponentTargetStateForHandoff(targetId);
        relief.Actor.Step(
            ActorObservation.Capture(
                targetState,
                _tick,
                contactIdentity: PolicyContactIdentity(
                    targetId,
                    PolicyContactClass.Opponent)),
            FixedDeltaSeconds);
        AircraftState currentState = relief.State;

        if (relief.TerminalState == AircraftTerminalState.Flying) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                relief.TriggerDown = false;
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Relief,
                    surface: contact.surface,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                CombatRole source = LiveOpponentCount > 0
                    ? CombatRole.Opponent : CombatRole.None;
                relief.ApplyCatastrophicDamage(handedness: 1);
                EmitEvent(SessionEventType.Destroyed,
                    source, CombatRole.Relief,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                relief.Actor.ApplySurfaceImpact(
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contactCarrier,
                    _terrainSurface);
                relief.TerminalState = AircraftTerminalState.Impacted;
                relief.ImpactSurface = contact.surface;
            }
        } else if (relief.TerminalState
                == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Relief,
                    surface: contact.surface,
                    entitySequence: relief.SpawnSequence,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                relief.Actor.ApplySurfaceImpact(
                    contact.surface,
                    contact.velocity,
                    contact.height,
                    contactCarrier,
                    _terrainSurface);
                relief.TerminalState = AircraftTerminalState.Impacted;
                relief.ImpactSurface = contact.surface;
            }
        }
        if (relief.TerminalState == AircraftTerminalState.Impacted
            && relief.Actor.WreckSurfaceChangedThisStep) {
            relief.ImpactSurface = relief.Actor.WreckSurface;
            EmitEvent(SessionEventType.Impact,
                CombatRole.None, CombatRole.Relief,
                surface: relief.ImpactSurface,
                entitySequence: relief.SpawnSequence,
                kinematics: relief.State);
        }
        if (relief.TerminalState == AircraftTerminalState.Impacted
            && relief.Actor.WreckSettled) {
            relief.TerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled,
                CombatRole.None, CombatRole.Relief,
                surface: relief.ImpactSurface,
                entitySequence: relief.SpawnSequence,
                kinematics: relief.State);
        }
    }

    /// Fly every additional opponent and let each shoot at the player independently. Their hits
    /// land in the SHARED pool (PlayerHitsTaken): two aircraft putting rounds into one pilot must
    /// kill them together, not each need a full magazine of their own.
    void StepWingmen(in AircraftState playerState) {
        if (_firstRunValleyRuntime?.ParkOpponents == true) return;
        if (_wingmen.Count == 0) return;
        bool weaponsReleased = !WeaponsInhibited && !TerminalPhaseActive
            && _playerTerminalState == AircraftTerminalState.Flying
            && !CombatHandoffRequested
            && !PlayerRtbActive;
        foreach (Wingman wingman in _wingmen) {
            AircraftState wingmanState = wingman.Bandit.State;
            if (wingman.TerminalState == AircraftTerminalState.Flying
                && wingman.Bandit.CatastrophicallyDamaged) {
                wingman.Defeated = true;
                wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            }
            if (wingman.TerminalState is not AircraftTerminalState.Settled
                    and not AircraftTerminalState.SimulationBounded
                && AtmosphereBoundaryReached(
                    wingmanState, wingman.Bandit.Atmosphere)) {
                wingman.Defeated = true;
                wingman.SimulationBounded = true;
                wingman.TerminalState = AircraftTerminalState.SimulationBounded;
                wingman.ImpactSurface = ImpactSurface.SimulationBoundary;
                wingman.TriggerDown = false;
                EmitEvent(SessionEventType.TerminalLimitReached,
                    CombatRole.None, CombatRole.Opponent,
                    surface: ImpactSurface.SimulationBoundary,
                    entitySequence: wingman.PlayerGunTargetId,
                    kinematics: wingmanState);
            }

            ActorObservation observation = ThreatObservationFor(
                playerState, wingmanState);
            if (!_reliefTargetingOpponentGuns.ContainsKey(
                    wingman.PlayerGunTargetId)) {
                bool trigger = wingman.StillFighting
                    && weaponsReleased
                    && wingman.Gun.AmmoRemaining > 0
                    && wingman.Gun.TargetAlive
                    && !wingman.Bandit.CatastrophicallyDamaged
                    && wingman.Bandit.WantsToFire(observation);
                wingman.TriggerDown = trigger;
                // A destroyed shooter cannot launch another round, but every round it already
                // fired remains physical. Stepping the gun on every tick also clears per-step hit
                // evidence, so a terminal aircraft cannot report the same hit twice.
                wingman.Gun.Step(
                    trigger, wingmanState, playerState, FixedDeltaSeconds);
                RecordHitsOnPlayer(wingman.Gun.HitsThisStep);
            }

            if (wingman.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;

            wingman.Bandit.Step(observation, FixedDeltaSeconds);
            ObserveWingmanTerminalPhysics(wingman, wingmanState);
        }
    }

    void ObserveWingmanTerminalPhysics(
        Wingman wingman, in AircraftState previousState) {
        AircraftState currentState = wingman.Bandit.State;
        if (wingman.TerminalState == AircraftTerminalState.DestroyedAirborne) {
            var contact = DetectImpact(previousState, currentState);
            if (contact.surface != ImpactSurface.None) {
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Opponent,
                    surface: contact.surface,
                    entitySequence: wingman.PlayerGunTargetId,
                    kinematics: currentState);
                Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                    or ImpactSurface.CarrierStructure ? _carrier : null;
                wingman.Bandit.ApplySurfaceImpact(contact.surface,
                    contact.velocity, contact.height, contactCarrier, _terrainSurface);
                wingman.TerminalState = AircraftTerminalState.Impacted;
                wingman.ImpactSurface = contact.surface;
            }
        }
        if (wingman.TerminalState == AircraftTerminalState.Impacted
            && wingman.Bandit.WreckSurfaceChangedThisStep) {
            wingman.ImpactSurface = wingman.Bandit.WreckSurface;
            EmitEvent(SessionEventType.Impact,
                CombatRole.None, CombatRole.Opponent,
                surface: wingman.ImpactSurface,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }
        if (wingman.TerminalState == AircraftTerminalState.Impacted
            && wingman.Bandit.WreckSettled) {
            wingman.TerminalState = AircraftTerminalState.Settled;
            EmitEvent(SessionEventType.Settled,
                CombatRole.None, CombatRole.Opponent,
                surface: wingman.ImpactSurface,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }
    }

    /// When the aircraft the pilot is fighting goes down but its formation has not, promote the
    /// nearest survivor so every cue keeps tracking a live threat instead of a wreck.
    bool TryPromoteWingmanToPrimary() {
        if (_opponentTerminalState == AircraftTerminalState.Flying) return false;
        Wingman? next = null;
        double nearest = double.PositiveInfinity;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting) continue;
            double rangeM = Geometry.Range(_player.State, wingman.Bandit.State);
            if (rangeM >= nearest) continue;
            nearest = rangeM;
            next = wingman;
        }
        if (next is null) return false;

        long previousSelection = _selectedPlayerGunTargetId;
        GunKill retiringGun = _opponentGun;
        IBandit retiringBandit = _bandit;
        _wingmen.Remove(next);
        if (retiringGun.RoundsInFlight.Count > 0
            && !_retiredOpponentGuns.Any(retired =>
                ReferenceEquals(retired.Gun, retiringGun)))
            _retiredOpponentGuns.Add(
                new RetiredOpponentGun(retiringBandit, retiringGun));
        // The retiring primary keeps falling as a detached wreck exactly as it would in a duel.
        DetachCurrentOpponent(_opponentTerminalState, _opponentImpactSurface);
        _bandit = next.Bandit;
        // Promotion is an irreversible combat event. A sparring wingman left in presentation
        // mode ignores every tactical command and flies its 15-degree setup turn indefinitely.
        _bandit.EndPresentation();
        _opponentGun = next.Gun;
        _primaryOpponentGunTargetId = next.PlayerGunTargetId;
        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _opponentTriggerDown = next.TriggerDown;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        _terminalStartedAtMs = double.PositiveInfinity;
        _pendingOutcome = SortieOutcome.None;
        if (IsPlayerGunTargetLive(previousSelection))
            SelectPlayerGunTarget(previousSelection);
        else
            SelectPlayerGunTarget(_primaryOpponentGunTargetId);
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        ClearFormationCoordination();
        ShowTransition("WINGMAN ENGAGED · V PADLOCK", 2200.0);
        return true;
    }

    bool IsOpponentTargetLiveForHandoff(long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return _opponentTerminalState == AircraftTerminalState.Flying
                && !_bandit.CatastrophicallyDamaged;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman?.StillFighting ?? false;
    }

    AircraftState OpponentTargetStateForHandoff(long targetId) {
        if (targetId == _primaryOpponentGunTargetId) return _bandit.State;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman?.Bandit.State ?? _bandit.State;
    }

    int CaptureReliefGunTargets() {
        int count = 1 + _wingmen.Count;
        if (_reliefGunTargets.Length < count)
            Array.Resize(ref _reliefGunTargets,
                Math.Max(count, _reliefGunTargets.Length * 2));
        _reliefGunTargets[0] = new GunTarget(
            _primaryOpponentGunTargetId,
            _bandit.State,
            Damageable: IsOpponentTargetLiveForHandoff(
                _primaryOpponentGunTargetId));
        for (int index = 0; index < _wingmen.Count; index++) {
            Wingman wingman = _wingmen[index];
            _reliefGunTargets[index + 1] = new GunTarget(
                wingman.PlayerGunTargetId,
                wingman.Bandit.State,
                Damageable: wingman.StillFighting);
        }
        return count;
    }

    void EnsureSelectedReliefGunTarget(GunKill gun) {
        if (IsOpponentTargetLiveForHandoff(gun.SelectedTargetId)) return;
        if (IsOpponentTargetLiveForHandoff(_primaryOpponentGunTargetId)) {
            gun.SelectTarget(_primaryOpponentGunTargetId);
            return;
        }
        Wingman? liveWingman = _wingmen.FirstOrDefault(
            static wingman => wingman.StillFighting);
        if (liveWingman is not null) {
            gun.SelectTarget(liveWingman.PlayerGunTargetId);
            return;
        }
        // Keep one real actor selected while the last airborne rounds age out. It is supplied as
        // non-damageable below, so this is identity continuity rather than resurrecting a target.
        gun.SelectTarget(_primaryOpponentGunTargetId);
    }

    bool ReplacementBudgetExhausted =>
        _beat.FirstRunValley is not null
        || (_beat.ContinuousCombat is { MaximumEngagements: > 0 } combat
            && _engagementNumber >= combat.MaximumEngagements);

    void ObserveDroneRaidTarget(double completedTimeSeconds) {
        DroneRaidEvaluation? evaluation = _droneRaidEvaluation;
        if (evaluation is null || !evaluation.Started || evaluation.Finished) return;

        if (evaluation.HasLeaked(_bandit.State))
            ResolveDroneRaidTarget(neutralized: false, completedTimeSeconds);
        if (Lifecycle != LifecycleState.Active || evaluation.Finished) return;
        evaluation.Step(completedTimeSeconds, _player.State, _bandit.State,
            _gunKill.GunSolution, _gunKill.RoundsFired);
    }

    void ResolveDroneRaidTarget(bool neutralized, double completedTimeSeconds) {
        DroneRaidEvaluation? evaluation = _droneRaidEvaluation;
        DroneRaidScenarioDefinition? definition = _beat.DroneRaid;
        if (evaluation is null || definition is null || evaluation.Finished) return;

        if (neutralized) {
            evaluation.RecordNeutralized(completedTimeSeconds, _gunKill.RoundsFired);
            _killCount++;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Player, CombatRole.Opponent);
        } else {
            DetachCurrentOpponent(AircraftTerminalState.Flying, ImpactSurface.None);
            evaluation.RecordLeaked(completedTimeSeconds, _gunKill.RoundsFired);
            EmitEvent(SessionEventType.RaidTargetLeaked,
                CombatRole.Opponent, CombatRole.None,
                count: _droneRaidTargetIndex + 1);
        }

        if (evaluation.Finished) {
            _outcome = evaluation.ZeroLeakers
                ? SortieOutcome.Victory : SortieOutcome.Defeat;
            _pendingOutcome = _outcome;
            EmitEvent(SessionEventType.SortieFinished,
                CombatRole.None, CombatRole.None, outcome: _outcome);
            ClearHeldInput();
            Lifecycle = LifecycleState.Finished;
            return;
        }

        _droneRaidTargetIndex++;
        AircraftState nextState = definition.Targets[_droneRaidTargetIndex];
        _bandit = new RailBandit(nextState, _beat.BanditAir, _beat.BanditTimeline) {
            Wind = _player.Wind,
            Atmosphere = _player.AtmosphereModel
        };
        _gunKill = neutralized
            ? _gunKill.CreateForStagedNextTarget()
            : _gunKill.CreateForRetargetedTarget();
        _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
        _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
        RegisterFormationGunTargets();
        _gunKill.SelectTarget(_selectedPlayerGunTargetId);
        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = _closureSmooth = 0.0;
        ShowTransition(evaluation.Cue, 2200.0);
    }

    void StepDetachedOpponentWrecks() {
        for (int i = _detachedOpponentWrecks.Count - 1; i >= 0; i--) {
            DetachedOpponentWreck wreck = _detachedOpponentWrecks[i];
            if (wreck.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;

            AircraftState previous = wreck.Actor.State;
            if (AtmosphereBoundaryReached(previous, wreck.Actor.Atmosphere)) {
                wreck.TerminalState = AircraftTerminalState.SimulationBounded;
                wreck.ImpactSurface = ImpactSurface.SimulationBoundary;
                EmitEvent(SessionEventType.TerminalLimitReached,
                    CombatRole.None, CombatRole.Opponent,
                    surface: ImpactSurface.SimulationBoundary,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: previous);
                continue;
            }
            wreck.Actor.Step(ObservePlayer(_player.State), FixedDeltaSeconds);
            AircraftState current = wreck.Actor.State;
            if (wreck.TerminalState == AircraftTerminalState.Flying
                && Geometry.Range(_player.State, current)
                    > DetachedOpponentEgressRangeM) {
                _detachedOpponentWrecks.RemoveAt(i);
                continue;
            }
            if (wreck.TerminalState == AircraftTerminalState.DestroyedAirborne) {
                var contact = DetectImpact(previous, current);
                if (contact.surface != ImpactSurface.None) {
                    EmitEvent(SessionEventType.Impact,
                        CombatRole.None, CombatRole.Opponent,
                        surface: contact.surface,
                        entitySequence: wreck.SpawnSequence,
                        kinematics: current);
                    Carrier? contactCarrier = contact.surface is ImpactSurface.FlightDeck
                        or ImpactSurface.CarrierStructure ? _carrier : null;
                    wreck.Actor.ApplySurfaceImpact(contact.surface,
                        contact.velocity, contact.height, contactCarrier, _terrainSurface);
                    wreck.TerminalState = AircraftTerminalState.Impacted;
                    wreck.ImpactSurface = contact.surface;
                }
            }
            if (wreck.TerminalState == AircraftTerminalState.Impacted
                && wreck.Actor.WreckSurfaceChangedThisStep) {
                wreck.ImpactSurface = wreck.Actor.WreckSurface;
                EmitEvent(SessionEventType.Impact,
                    CombatRole.None, CombatRole.Opponent,
                    surface: wreck.ImpactSurface,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: wreck.Actor.State);
            }
            if (wreck.TerminalState == AircraftTerminalState.Impacted
                && wreck.Actor.WreckSettled) {
                wreck.TerminalState = AircraftTerminalState.Settled;
                EmitEvent(SessionEventType.Settled,
                    CombatRole.None, CombatRole.Opponent,
                    surface: wreck.ImpactSurface,
                    entitySequence: wreck.SpawnSequence,
                    kinematics: wreck.Actor.State);
            }
        }
    }

    bool DetachedOpponentWrecksResolved => _detachedOpponentWrecks.All(
        static wreck => wreck.TerminalState is AircraftTerminalState.Settled
            or AircraftTerminalState.SimulationBounded);

    bool TrySpawnContinuousOpponent(double completedTimeMs) {
        if (!OpponentReplacementPending || completedTimeMs < _nextOpponentSpawnAtMs)
            return false;

        // A formation is not beaten because its leader is: promote a survivor and keep the SAME
        // engagement running. Only when the last of them is down does a replacement wave stage,
        // so a 1v2 counts as one fight and one entry in the pilot's record.
        if (_wingmen.Any(static wingman => wingman.StillFighting)) {
            if (TryPromoteWingmanToPrimary()) {
                _nextOpponentSpawnAtMs = double.NegativeInfinity;
                return true;
            }
        }
        if (_beat.ContinuousCombat is null
            || _beat.FirstRunValley is not null
            || ReplacementBudgetExhausted) {
            // The cap still has to record the kill that filled it. Otherwise two gun
            // kills never reach rung 3, and the next sortie cannot open on the pair.
            CompleteEngagementIfEnded();
            _nextOpponentSpawnAtMs = double.NegativeInfinity;
            return false;
        }

        int nextEngagement = _engagementNumber + 1;
        CompleteEngagementIfEnded();
        DetachCurrentOpponent(_opponentTerminalState, _opponentImpactSurface);
        SpawnSpec directorSpawn = UsesDifficultyRamp(_beat)
            ? _sortieOpeningSpawn is { } held
                ? held with { Sparring = false }
                : _fightDirector.NextSpawn(nextEngagement)
            : new SpawnSpec(
                _beat.BanditSkill, 0, false, "authored successor",
                FormationSize: 2);
        LastDirectorSpawn = directorSpawn;
        _bandit = _beat.CreateNextBandit(
            _player.State, nextEngagement, _terrainSurface, directorSpawn);
        ApplyArenaHandicapToPrimaryBandit();
        _primaryOpponentGunTargetId = AllocateOpponentGunTargetId();
        _selectedPlayerGunTargetId = _primaryOpponentGunTargetId;
        if (!_arenaHandicapActive)
            StageWingmen(directorSpawn, nextEngagement);
        ConfigureFormationLookaheadCadence();
        // Spike opponents of either flavour (cat or machine) carry the report quarantine: an
        // expected loss to one must not crater the ordinary-fight skill estimate.
        bool spikeOpponent = directorSpawn.Boss || directorSpawn.Machine;
        _bandit.Wind = _player.Wind;
        _bandit.Atmosphere = _player.AtmosphereModel;
        _gunKill = _gunKill.Outcome == FightOutcome.Splash
            ? _gunKill.CreateForStagedNextTarget()
            : _gunKill.CreateForRetargetedTarget();
        RegisterFormationGunTargets();
        _gunKill.SelectTarget(_selectedPlayerGunTargetId);
        CombatConfig combat = _beat.CombatRules;
        _opponentGun = _opponentGun.CreateForFreshShooterAgainstSameTarget(
            combat.OpponentAmmo,
            combat.OpponentGunProfile.EffectiveHitRadiusM,
            combat.OpponentGunProfile);
        _visualMergeEvaluation = _beat.VisualMergeEvaluation is { } evaluation
            ? new VisualMergeEvaluation(evaluation)
            : null;
        _visualMergeEvaluation?.Step(_player.State, _bandit.State,
            _player.AtmosphereModel, 0.0, _player.AirspeedMps);
        if (_triggerDown)
            _visualMergeEvaluation?.ObserveTriggerPressed(_player.State, _bandit.State);

        _opponentTerminalState = AircraftTerminalState.Flying;
        _opponentImpactSurface = ImpactSurface.None;
        _opponentTriggerDown = false;
        _pendingOutcome = SortieOutcome.None;
        _terminalStartedAtMs = double.PositiveInfinity;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        _splashCueUntilMs = double.NegativeInfinity;
        _engagementNumber = nextEngagement;
        StartEngagementCounters(directorSpawn.Skill, spikeOpponent);
        _banditSpawnSequence++;
        _padlockRollAssist.Reset();
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = _closureSmooth = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        EmitEvent(SessionEventType.OpponentSpawned,
            CombatRole.None, CombatRole.Opponent, count: nextEngagement);
        ShowTransition($"BANDIT {nextEngagement} INBOUND · V PADLOCK", 2600.0);
        return true;
    }

    void StartEngagementCounters(PilotSkill opponentSkill, bool opponentWasBoss) {
        _engagementCounters = new EngagementCounters {
            Active = true,
            EngagementNumber = _engagementNumber,
            OpponentSkill = opponentSkill,
            OpponentWasBoss = opponentWasBoss,
            PlayerHitsTakenAtStart = PlayerHitsTaken,
            ShotsTotalAtStart = _shotsTotal,
            ShotsInWindowAtStart = _shotsInWindow,
            OvershootsAtStart = _visualMergeEvaluation?.Overshoots ?? 0,
            GcasActivationsAtStart = _autoGcasState.ActivationCount,
            PlayerHitsScoredAtStart = _sortiePlayerHits,
            TimeToFirstHitSeconds = double.NaN,
        };
        if (_firstRunValleyRuntime is not { WeaponsCold: true }
            && double.IsNaN(_weaponsHotAtSeconds))
            _weaponsHotAtSeconds = TimeSeconds;
    }

    void AccumulateEngagementCounters() {
        // Deliberately before the engagement-active guard: the sortie ledgers span engagements and
        // must keep counting between them, which is the whole point of having them. A drone raid
        // never starts engagement counters at all, so behind the guard every raid would report
        // zero rounds fired. Pinned by
        // SortieGunLedgerTests.SortieLedgersAccrueOnASortieThatNeverStartsEngagementCounters.
        AccumulateSortieLedgers();
        if (!_engagementCounters.Active) return;
        _engagementCounters.DurationSeconds += FixedDeltaSeconds;
        if ((_opponentTerminalState == AircraftTerminalState.Flying
                && _opponentGun.GunSolution)
            || _wingmen.Any(static wingman =>
                wingman.StillFighting && wingman.Gun.GunSolution))
            _engagementCounters.SolutionSecondsConceded += FixedDeltaSeconds;
    }

    void CompleteEngagementIfEnded() {
        if (!_engagementCounters.Active) return;
        bool playerLost = _playerTerminalState != AircraftTerminalState.Flying;
        bool opponentLost = _opponentTerminalState != AircraftTerminalState.Flying
            && !_wingmen.Any(static wingman => wingman.StillFighting);
        if (!playerLost && !opponentLost) return;

        SortieOutcome outcome = playerLost && opponentLost ? SortieOutcome.Draw
            : opponentLost ? SortieOutcome.Victory
            : SortieOutcome.Defeat;
        EngagementReport report = BuildEngagementReport(
            outcome, EngagementEndReason.CombatResult);
        _engagementReports.Add(report);
        // Only the F-22 ramp (visual merge and the valley) moves rungs. Other
        // beats still record the fight for the learner, without fading their assist.
        if (report.EligibleForLearning)
            _fightDirector.Observe(in report, advanceRamp: UsesDifficultyRamp(_beat));
        _engagementCounters.Active = false;
    }

    void CompleteInterruptedEngagementForHandoff() {
        if (!_engagementCounters.Active) return;
        EngagementReport report = BuildEngagementReport(
            SortieOutcome.None, EngagementEndReason.PlayerHandoff);
        _engagementReports.Add(report);
        // Deliberately no FightDirector.Observe: the pilot ended the sample before either combatant
        // won, so treating it as a draw/loss would corrupt both pacing and the skill estimate.
        _engagementCounters.Active = false;
    }

    EngagementReport BuildEngagementReport(
        SortieOutcome outcome,
        EngagementEndReason endReason) =>
        new(
            _engagementCounters.EngagementNumber,
            _engagementCounters.OpponentSkill,
            _engagementCounters.OpponentWasBoss,
            outcome,
            _engagementCounters.DurationSeconds,
            _engagementCounters.SolutionSecondsConceded,
            Math.Max(0,
                PlayerHitsTaken - _engagementCounters.PlayerHitsTakenAtStart),
            Math.Max(0, _shotsTotal - _engagementCounters.ShotsTotalAtStart),
            Math.Max(0, _shotsInWindow - _engagementCounters.ShotsInWindowAtStart),
            Math.Max(0, (_visualMergeEvaluation?.Overshoots ?? 0)
                - _engagementCounters.OvershootsAtStart),
            _visualMergeEvaluation?.MinimumEnergyKias ?? double.PositiveInfinity,
            Math.Max(0, _autoGcasState.ActivationCount
                - _engagementCounters.GcasActivationsAtStart),
            endReason,
            HitsScored: Math.Max(0,
                _sortiePlayerHits - _engagementCounters.PlayerHitsScoredAtStart),
            TimeToFirstHitSeconds: _engagementCounters.TimeToFirstHitSeconds,
            GunKills: outcome == SortieOutcome.Victory && _gunKill.SplashedByGunfire
                ? 1 : 0);

    void DetachCurrentOpponent(AircraftTerminalState terminalState,
        ImpactSurface impactSurface) {
        _detachedOpponentWrecks.Add(new DetachedOpponentWreck(
            _bandit, _banditSpawnSequence, terminalState, impactSurface));
        while (_detachedOpponentWrecks.Count > 8) {
            int settledIndex = _detachedOpponentWrecks.FindIndex(
                static wreck => wreck.TerminalState is AircraftTerminalState.Settled
                    or AircraftTerminalState.SimulationBounded);
            if (settledIndex < 0) break;
            _detachedOpponentWrecks.RemoveAt(settledIndex);
        }
    }

    void ForceDetachedOpponentTerminalLimits() {
        foreach (DetachedOpponentWreck wreck in _detachedOpponentWrecks) {
            if (wreck.TerminalState is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
                continue;
            wreck.TerminalState = AircraftTerminalState.SimulationBounded;
            if (wreck.ImpactSurface == ImpactSurface.None)
                wreck.ImpactSurface = ImpactSurface.SimulationBoundary;
            EmitEvent(SessionEventType.TerminalLimitReached,
                CombatRole.None, CombatRole.Opponent,
                surface: ImpactSurface.SimulationBoundary,
                entitySequence: wreck.SpawnSequence,
                kinematics: wreck.Actor.State);
        }
    }

    void ForceTerminalLimit(CombatRole target, bool includeFlying = false) {
        AircraftTerminalState state = target == CombatRole.Player
            ? _playerTerminalState : _opponentTerminalState;
        if ((!includeFlying && state == AircraftTerminalState.Flying)
            || state is AircraftTerminalState.Settled
                or AircraftTerminalState.SimulationBounded)
            return;
        EmitEvent(SessionEventType.TerminalLimitReached, CombatRole.None, target,
            surface: ImpactSurface.SimulationBoundary);
        if (target == CombatRole.Player) {
            _playerTerminalState = AircraftTerminalState.SimulationBounded;
            if (_playerImpactSurface == ImpactSurface.None)
                _playerImpactSurface = ImpactSurface.SimulationBoundary;
            FinalizeRapierServiceLife(
                RapierServiceLifeTerminationReason.OwnshipDestroyed);
        } else {
            _opponentTerminalState = AircraftTerminalState.SimulationBounded;
            if (_opponentImpactSurface == ImpactSurface.None)
                _opponentImpactSurface = ImpactSurface.SimulationBoundary;
        }
    }
}
