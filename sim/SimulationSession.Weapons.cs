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

// Partial of SimulationSession: Weapons.
public sealed partial class SimulationSession {
    public GunKill PlayerGun => OpponentPresent && _gunKill is not null
        ? _gunKill
        : throw new InvalidOperationException(
            "The active mission does not stage a player combat weapon graph.");
    public GunKill OpponentGun => OpponentPresent && _opponentGun is not null
        ? _opponentGun
        : throw new InvalidOperationException(
            "The active mission does not stage an opponent combat weapon graph.");
    public IReadOnlyList<GunRound> FormationOpponentRoundsInFlight {
        get {
            _formationOpponentRoundsInFlight.Clear();
            if (!OpponentPresent) return _formationOpponentRoundsInFlight;
            if (!_reliefTargetingOpponentGuns.ContainsKey(_primaryOpponentGunTargetId))
                _formationOpponentRoundsInFlight.AddRange(_opponentGun.RoundsInFlight);
            foreach (Wingman wingman in _wingmen)
                if (!_reliefTargetingOpponentGuns.ContainsKey(wingman.PlayerGunTargetId))
                    _formationOpponentRoundsInFlight.AddRange(wingman.Gun.RoundsInFlight);
            foreach (RetiredOpponentGun retired in _retiredOpponentGuns)
                _formationOpponentRoundsInFlight.AddRange(retired.Gun.RoundsInFlight);
            foreach (ReliefTargetingOpponentGun gun in
                _reliefTargetingOpponentGuns.Values)
                _formationOpponentRoundsInFlight.AddRange(gun.Gun.RoundsInFlight);
            return _formationOpponentRoundsInFlight;
        }
    }
    /// True while ANY opponent ship — primary, wingman, retired or retargeted — has its trigger
    /// down with a usable gun. The primary-only OpponentTriggerDown answers a narrower question.
    public bool FormationOpponentGunFiring {
        get {
            if (!OpponentPresent || !PlayerAlive) return false;
            if (_opponentTriggerDown
                && _opponentGun is not null
                && _opponentGun.AmmoRemaining > 0
                && _opponentTerminalState == AircraftTerminalState.Flying)
                return true;
            foreach (Wingman wingman in _wingmen)
                if (wingman.TriggerDown
                    && wingman.StillFighting
                    && wingman.Gun.AmmoRemaining > 0)
                    return true;
            return false;
        }
    }
    /// Rounds the PLAYER has fired across the whole sortie. Unlike `rounds_fired`, which is the
    /// current engagement's weapon graph and resets at every engagement boundary, this is monotone.
    public int SortiePlayerRoundsFired => _sortiePlayerRoundsFired;
    /// Rounds the PLAYER has put into opponents across the whole sortie. Monotone; `hits` is not.
    public int SortiePlayerHits => _sortiePlayerHits;
    /// Rounds every opponent ship has fired across the whole sortie — primary, wingmen, retired
    /// guns and retargeted relief guns. Monotone; `opponent_rounds_fired` is the PRIMARY'S current
    /// gun only and resets at every engagement boundary.
    public int SortieOpponentRoundsFired => _sortieOpponentRoundsFired;
    /// Peak and trough normal load factor the player has flown this sortie. Airframe-agnostic and
    /// always live — the RapierServiceLife record is captured only on scripted-intercept missions
    /// and only exists once one has been finalized, which is why service_life_max_g reads 0 on an
    /// ordinary fighter sortie no matter how hard it was flown.
    public double SortiePeakLoadFactorG =>
        _sortieLoadFactorSeen ? _sortiePeakLoadFactorG : 0.0;
    public double SortieMinimumLoadFactorG =>
        _sortieLoadFactorSeen ? _sortieMinimumLoadFactorG : 0.0;
    /// Formation slot selected for the player's gun sight: 0 is the primary and 1..N are the
    /// additional contacts in their stable browser/render order.
    public int SelectedPlayerGunTargetSlot {
        get {
            if (_selectedPlayerGunTargetId == _primaryOpponentGunTargetId) return 0;
            int index = _wingmen.FindIndex(wingman =>
                wingman.PlayerGunTargetId == _selectedPlayerGunTargetId);
            return index < 0 ? 0 : index + 1;
        }
    }
    /// Total rounds the player has absorbed from ALL opponents in this sortie.
    public int PlayerHitsTaken => _playerHitsTaken;
    public int ShotsTotal => _shotsTotal;
    public int ShotsInWindow => _shotsInWindow;
    public bool TriggerDown => _triggerDown;
    public bool WeaponsInhibited => !OpponentPresent
        || (_visualMergeEvaluation?.WeaponsInhibited ?? false)
        || (_firstRunValleyRuntime?.WeaponsCold ?? false);
    public bool PlayerWeaponsAuthorized =>
        OpponentPresent
        && (_visualMergeEvaluation?.PlayerWeaponsAuthorized ?? true)
        && !(_firstRunValleyRuntime?.WeaponsCold ?? false)
        && !CombatHandoffRequested
        && !PlayerRtbActive
        && !_autoGcasState.Active
        && !_pilotTriggerInterlocked
        && _pilotPhysiology.State.ControlImpairment
            != PilotControlImpairment.Incapacitated;
    // Compatibility projection for the old transient HUD. Terminal destruction is represented by
    // ordered events plus Outcome; a frozen simulation clock must never hold a timed cue forever.
    public bool SplashCueActive => _simTimeMs < _splashCueUntilMs;

    // Card 12 teaches the body-fixed M61 problem. Its bounded mission director may steer toward
    // GunKill's authoritative lead, but the global dogfight magnet and assisted auto-trigger would
    // erase the lesson and let portrait touch score without a trigger edge.
    bool CardTwelveRequiresPilotGunTrigger =>
        _beat.MissionIdentity.Id
            == "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1";

    /// <summary>
    /// Pilot taps the GUNS SAFE annunciation: release the first-pass weapons hold and arm the
    /// gun. Subject to the same ownership boundaries as any pilot actuation — no reanimating a
    /// destroyed ownship and no acting through a G-LOC control interlock.
    /// </summary>
    public void ReleaseWeaponsHold() {
        if (Lifecycle != LifecycleState.Active) return;
        if (_playerTerminalState != AircraftTerminalState.Flying) return;
        if (_pilotControlInterlocked) return;
        _visualMergeEvaluation?.ReleaseFirstPassHold();
    }

    void Trigger(bool down) {
        if (!OpponentPresent) down = false;
        if (down && (CombatHandoffRequested || PlayerRtbActive)) down = false;
        if (_firstRunValleyRuntime is { } firstRun) {
            if (firstRun.WeaponsCold) down = false;
            else if (firstRun.Aim9Remaining > 0) {
                if (down && !_triggerDown) LaunchFoxTwo();
                down = false;
            }
        }
        if (down && !_triggerDown) {
            _shotsTotal++;
            AircraftState selectedTarget = SelectedOpponentState;
            if (CameraSolver.GunWindow(_player.State, selectedTarget)) _shotsInWindow++;
            // VisualMergeEvaluation is an actor-specific primary-opponent rubric. The selected
            // contact owns the actual shot-window count, but feeding a wingman's trigger geometry
            // into the primary-only projectile/overshoot state would mix two aircraft.
            _visualMergeEvaluation?.ObserveTriggerPressed(_player.State, _bandit.State);
        }
        if (!down) {
            _visualMergeEvaluation?.ObserveTriggerReleased();
            // G-LOC releases the pilot's grip even if the browser key remains electrically held.
            // Re-arming requires an observable release made after useful control has returned.
            if (_pilotPhysiology.State.ControlAuthority01 >= 0.55)
                _pilotTriggerInterlocked = false;
        }
        _triggerDown = down;
    }

    bool OpponentWeaponsAuthorized(bool allowNewFire = true) =>
        OpponentPresent
        && Lifecycle == LifecycleState.Active
        && allowNewFire
        && !PlayerRtbActive
        && !TerminalPhaseActive
        && !WeaponsInhibited
        && _beat.CombatRules.OpponentAmmo > 0
        && _opponentGun.AmmoRemaining > 0
        && _opponentGun.TargetAlive
        && !_bandit.CatastrophicallyDamaged;

    long AllocateOpponentGunTargetId() => _nextOpponentGunTargetId++;

    void RegisterFormationGunTargets() {
        _gunKill.RegisterTarget(_primaryOpponentGunTargetId);
        foreach (Wingman wingman in _wingmen)
            _gunKill.RegisterTarget(wingman.PlayerGunTargetId);
    }

    bool IsPlayerGunTargetLive(long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return _opponentTerminalState == AircraftTerminalState.Flying
                && _gunKill.DamageFor(targetId).TargetAlive;
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman is not null
            && wingman.StillFighting
            && _gunKill.DamageFor(targetId).TargetAlive;
    }

    void SelectPlayerGunTarget(long targetId) {
        if (_selectedPlayerGunTargetId == targetId
            && _gunKill.SelectedTargetId == targetId)
            return;
        if (_selectedPlayerGunTargetId != targetId) {
            // A slot promotion or explicit retarget must never carry another physical aircraft's
            // captured lift plane across the identity boundary. The presentation may re-arm the
            // assist after its camera has acquired the new contact.
            _playerGunTargetPadlockRollAssistSelected = false;
            _playerGunTargetPadlockRollAssistTargetId = 0;
            _padlockRollAssist.Reset();
        }
        _selectedPlayerGunTargetId = targetId;
        _gunKill.SelectTarget(targetId);
        _lastRange = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = _closureSmooth = 0.0;
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
    }

    void EnsureSelectedPlayerGunTarget() {
        if (IsPlayerGunTargetLive(_selectedPlayerGunTargetId)) {
            _gunKill.SelectTarget(_selectedPlayerGunTargetId);
            return;
        }
        if (IsPlayerGunTargetLive(_primaryOpponentGunTargetId)) {
            SelectPlayerGunTarget(_primaryOpponentGunTargetId);
            return;
        }
        Wingman? liveWingman = _wingmen.FirstOrDefault(wingman =>
            IsPlayerGunTargetLive(wingman.PlayerGunTargetId));
        if (liveWingman is not null) {
            SelectPlayerGunTarget(liveWingman.PlayerGunTargetId);
            return;
        }

        // Keep a deterministic actor selected while the last kill resolves. It remains
        // non-damageable, but old rounds can still be advanced against any other supplied actor.
        SelectPlayerGunTarget(_primaryOpponentGunTargetId);
    }

    void UpdateSelectedTargetClosure() {
        double range = Geometry.Range(_player.State, SelectedOpponentState);
        _closureKts = (_lastRange - range) / FixedDeltaSeconds * 1.94384;
        _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
        _lastRange = range;
    }

    int CapturePlayerGunTargets(in AircraftState primaryState) {
        int count = 1 + _wingmen.Count;
        if (_playerGunTargets.Length < count)
            Array.Resize(ref _playerGunTargets, Math.Max(count, _playerGunTargets.Length * 2));
        _playerGunTargets[0] = new GunTarget(
            _primaryOpponentGunTargetId,
            primaryState,
            Damageable: _opponentTerminalState == AircraftTerminalState.Flying);
        for (int index = 0; index < _wingmen.Count; index++) {
            Wingman wingman = _wingmen[index];
            _playerGunTargets[index + 1] = new GunTarget(
                wingman.PlayerGunTargetId,
                wingman.Bandit.State,
                Damageable: wingman.StillFighting);
        }
        return count;
    }

    (AircraftState State, long EntitySequence) PlayerGunTargetEventContext(
        long targetId) {
        if (targetId == _primaryOpponentGunTargetId)
            return (_bandit.State, _banditSpawnSequence);
        Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
            candidate.PlayerGunTargetId == targetId);
        return wingman is null
            ? (_bandit.State, _banditSpawnSequence)
            : (wingman.Bandit.State, targetId);
    }

    void RecordHitsOnPlayer(int hits) {
        if (hits <= 0) return;
        _playerHitsTaken += hits;
        EmitEvent(SessionEventType.Hit, CombatRole.Opponent, CombatRole.Player, hits);
    }

    internal void RecordPlayerHitsForTest(int hits) => RecordHitsOnPlayer(hits);

    void StepWeapons(in AircraftState playerState, in AircraftState opponentState,
        bool playerTriggerHeld, bool allowNewFire = true) {
        bool weaponsReleased =
            allowNewFire && !WeaponsInhibited && !CombatHandoffRequested
            && !PlayerRtbActive;
        bool playerWeaponsAuthorized = weaponsReleased && PlayerWeaponsAuthorized;
        bool primaryRetargeted = _reliefTargetingOpponentGuns.ContainsKey(
            _primaryOpponentGunTargetId);
        bool opponentIntentEvaluated = weaponsReleased
            && !primaryRetargeted
            && _beat.CombatRules.OpponentAmmo > 0;
        bool opponentIntent = opponentIntentEvaluated
            && _bandit.WantsToFire(ObservePlayer(playerState));
        _opponentTriggerDown = opponentIntent
            && OpponentWeaponsAuthorized(allowNewFire);
        _decisionFireIntentEvaluatedThisTick = opponentIntentEvaluated;
        _decisionFireIntentConsumedThisTick = opponentIntent;
        _decisionFireAuthorizedThisTick = _opponentTriggerDown;

        // Both weapons receive the same beginning-of-tick world snapshot. Neither combatant gets
        // to observe the other's already-integrated future position or suppress same-tick return
        // fire by resolving its own hit first.
        EnsureSelectedPlayerGunTarget();
        int playerGunTargetCount = CapturePlayerGunTargets(opponentState);
        _gunKill.Step(playerWeaponsAuthorized && playerTriggerHeld,
            playerState,
            _selectedPlayerGunTargetId,
            _playerGunTargets.AsSpan(0, playerGunTargetCount),
            FixedDeltaSeconds);
        if (!primaryRetargeted)
            _opponentGun.Step(
                _opponentTriggerDown, opponentState, playerState, FixedDeltaSeconds);
        StepRetiredOpponentGuns(playerState);
        StepReliefTargetingOpponentGuns();
        StepReliefGun();
        _visualMergeEvaluation?.ObserveProjectileState(
            _gunKill.RoundsFired,
            _gunKill.DamageFor(_primaryOpponentGunTargetId).HitCount);

        foreach (IGrouping<long, GunImpact> impacts in
            _gunKill.ImpactsThisStep.GroupBy(static impact => impact.TargetId)) {
            var context = PlayerGunTargetEventContext(impacts.Key);
            EmitEvent(SessionEventType.Hit, CombatRole.Player, CombatRole.Opponent,
                impacts.Count(),
                entitySequence: context.EntitySequence,
                kinematics: context.State);
        }
        if (!primaryRetargeted)
            RecordHitsOnPlayer(_opponentGun.HitsThisStep);
    }

    void StepRetiredOpponentGuns(in AircraftState playerState) {
        for (int index = _retiredOpponentGuns.Count - 1; index >= 0; index--) {
            RetiredOpponentGun retired = _retiredOpponentGuns[index];
            retired.Gun.Step(
                false, retired.Shooter.State, playerState, FixedDeltaSeconds);
            RecordHitsOnPlayer(retired.Gun.HitsThisStep);
            if (retired.Gun.RoundsInFlight.Count == 0)
                _retiredOpponentGuns.RemoveAt(index);
        }
    }

    void StepReliefGun() {
        if (_reliefFighter is not { Gun: { } gun } relief) return;
        EnsureSelectedReliefGunTarget(gun);
        long targetId = gun.SelectedTargetId;
        AircraftState targetState = OpponentTargetStateForHandoff(targetId);
        bool trigger = relief.StillFighting
            && IsOpponentTargetLiveForHandoff(targetId)
            && gun.AmmoRemaining > 0
            && gun.TargetAlive
            && relief.Actor.WantsToFire(
                ActorObservation.Capture(targetState, _tick));
        relief.TriggerDown = trigger;
        int targetCount = CaptureReliefGunTargets();
        gun.Step(
            trigger,
            relief.State,
            targetId,
            _reliefGunTargets.AsSpan(0, targetCount),
            FixedDeltaSeconds);
        foreach (IGrouping<long, GunImpact> impacts in
            gun.ImpactsThisStep.GroupBy(static impact => impact.TargetId)) {
            var context = PlayerGunTargetEventContext(impacts.Key);
            EmitEvent(SessionEventType.Hit, CombatRole.Relief, CombatRole.Opponent,
                impacts.Count(),
                entitySequence: context.EntitySequence,
                kinematics: context.State);
        }
    }

    void StepReliefTargetingOpponentGuns() {
        if (_reliefFighter is not { } relief
            || _reliefTargetingOpponentGuns.Count == 0)
            return;
        AircraftState reliefState = relief.State;
        ActorObservation observation =
            ActorObservation.Capture(reliefState, _tick);
        foreach ((long shooterId, ReliefTargetingOpponentGun record) in
            _reliefTargetingOpponentGuns) {
            GunKill gun = record.Gun;
            gun.SelectTarget(relief.SpawnSequence);
            bool trigger = relief.StillFighting
                && IsOpponentTargetLiveForHandoff(shooterId)
                && !record.Shooter.CatastrophicallyDamaged
                && gun.AmmoRemaining > 0
                && gun.TargetAlive
                && record.Shooter.WantsToFire(observation);
            if (shooterId == _primaryOpponentGunTargetId)
                _opponentTriggerDown = trigger;
            Wingman? wingman = _wingmen.FirstOrDefault(candidate =>
                candidate.PlayerGunTargetId == shooterId);
            if (wingman is not null) wingman.TriggerDown = trigger;
            _reliefOpponentTarget[0] = new GunTarget(
                relief.SpawnSequence,
                reliefState,
                Damageable: relief.StillFighting);
            gun.Step(
                trigger,
                record.Shooter.State,
                relief.SpawnSequence,
                _reliefOpponentTarget,
                FixedDeltaSeconds);
            RecordHitsOnRelief(gun.HitsThisStep);
        }
    }

    void RecordHitsOnRelief(int hits) {
        if (hits <= 0 || _reliefFighter is not { } relief) return;
        relief.HitsTaken += hits;
        EmitEvent(SessionEventType.Hit, CombatRole.Opponent, CombatRole.Relief,
            hits,
            entitySequence: relief.SpawnSequence,
            kinematics: relief.State);
        if (relief.HitsTaken < _beat.CombatRules.PlayerHitsToDefeat
            || !relief.StillFighting)
            return;
        relief.ApplyCatastrophicDamage(handedness: 1);
        EmitEvent(SessionEventType.Destroyed,
            CombatRole.Opponent, CombatRole.Relief,
            entitySequence: relief.SpawnSequence,
            kinematics: relief.State);
    }

    internal void RecordReliefHitsForTest(int hits) => RecordHitsOnRelief(hits);
    internal GunKill? ReliefTargetingOpponentGunForTest(long targetId) =>
        _reliefTargetingOpponentGuns.TryGetValue(targetId, out var record)
            ? record.Gun
            : null;

    void ObserveReliefCombatDamage() {
        if (_reliefFighter?.Gun is not { } gun) return;
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting
                || gun.DamageFor(wingman.PlayerGunTargetId).Outcome
                    != FightOutcome.Splash)
                continue;
            wingman.Defeated = true;
            wingman.TriggerDown = false;
            wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            wingman.ImpactSurface = ImpactSurface.None;
            wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
            _reliefKills++;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Relief, CombatRole.Opponent,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }

        if (gun.DamageFor(_primaryOpponentGunTargetId).Outcome
                == FightOutcome.Splash
            && _opponentTerminalState == AircraftTerminalState.Flying) {
            _reliefKills++;
            BeginCatastrophicDamage(
                CombatRole.Opponent, CombatRole.Relief);
        }
    }

    void ObserveCombatDamage() {
        ObserveReliefCombatDamage();
        foreach (Wingman wingman in _wingmen) {
            if (!wingman.StillFighting
                || _gunKill.DamageFor(wingman.PlayerGunTargetId).Outcome
                    != FightOutcome.Splash)
                continue;
            wingman.Defeated = true;
            wingman.TriggerDown = false;
            wingman.TerminalState = AircraftTerminalState.DestroyedAirborne;
            wingman.ImpactSurface = ImpactSurface.None;
            wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
            _killCount++;
            _splashCueUntilMs = _simTimeMs + 3000.0;
            EmitEvent(SessionEventType.Destroyed,
                CombatRole.Player, CombatRole.Opponent,
                entitySequence: wingman.PlayerGunTargetId,
                kinematics: wingman.Bandit.State);
        }

        if (_enemyPairCoordinator.Active
            && (_opponentTerminalState != AircraftTerminalState.Flying
                || _bandit.CatastrophicallyDamaged
                || _wingmen.Count(static wingman => wingman.StillFighting) != 1))
            ClearFormationCoordination();

        if (_gunKill.DamageFor(_primaryOpponentGunTargetId).Outcome
                == FightOutcome.Splash
            && _opponentTerminalState == AircraftTerminalState.Flying) {
            if (_droneRaidEvaluation is { Finished: false }) {
                ResolveDroneRaidTarget(neutralized: true,
                    TimeSeconds + FixedDeltaSeconds);
            } else {
                _killCount++;
                BeginCatastrophicDamage(CombatRole.Opponent, CombatRole.Player);
            }
        }
        EnsureSelectedPlayerGunTarget();
        if (PlayerHitsTaken >= _beat.CombatRules.PlayerHitsToDefeat
            && _playerTerminalState == AircraftTerminalState.Flying) {
            if (_recoveryAttemptActive) _attemptHadSetback = true;
            BeginCatastrophicDamage(CombatRole.Player, CombatRole.Opponent);
        }
        UpdatePendingOutcome();
        CompleteEngagementIfEnded();
    }

    void BeginCatastrophicDamage(
        CombatRole target,
        CombatRole source,
        bool promoteFormationSurvivor = true) {
        _gunneryPitchAssistState = GunneryPitchAssistState.Inactive();
        _padlockRollAssist.Reset();
        if (target == CombatRole.Player) {
            if (_playerTerminalState != AircraftTerminalState.Flying) return;
            BeginTerminalClock();
            _droneRaidEvaluation?.RecordOwnshipLost(
                TimeSeconds + FixedDeltaSeconds, _gunKill.RoundsFired);
            _playerTerminalState = AircraftTerminalState.DestroyedAirborne;
            _player.EngineCombustionAvailable = false;
            _player.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
                PlayerAerodynamicConfiguration, handedness: -1);
            // Terminal ownship is no longer a tactical contact. Clear both the coordinator and
            // every held directive on the destruction edge, not one tick later (and never continue
            // radio updates against the falling wreck).
            ClearFormationCoordination();
        } else if (target == CombatRole.Opponent) {
            if (_opponentTerminalState != AircraftTerminalState.Flying) return;
            bool formationSurvivorRemains =
                _wingmen.Any(static wingman => wingman.StillFighting);
            // The billed cap is complete only when the last engagement is actually splashed
            // and nobody has already knocked it off. An early Bingo or O leaves the flag clear,
            // so the later full stop stays Discontinued.
            if (_beat.FirstRunValley is null
                && !CombatHandoffRequested
                && ReplacementBudgetExhausted
                && !formationSurvivorRemains
                && _playerTerminalState == AircraftTerminalState.Flying)
                _billedSortieComplete = true;
            // Kestrel is a finite first sortie: the mouth pair is the job. A replacement wave
            // here is how live 350 turned "guns / RTB" into the endless gym.
            bool nextWaveExpected = !CombatHandoffRequested
                && _beat.ContinuousCombat is not null
                && !ReplacementBudgetExhausted
                && !formationSurvivorRemains
                && _playerTerminalState == AircraftTerminalState.Flying;
            bool replacementExpected = formationSurvivorRemains || nextWaveExpected;
            BeginTerminalClock(
                clearHeldInput: !replacementExpected && !CombatHandoffRequested);
            _opponentTerminalState = AircraftTerminalState.DestroyedAirborne;
            _bandit.ApplyCatastrophicDamage(handedness: 1);
            ClearFormationCoordination();
            _splashCueUntilMs = _simTimeMs + 3000.0;
            if (replacementExpected) {
                double delaySeconds = _beat.ScriptedIntercept?.KillCameraSeconds
                    ?? _beat.ContinuousCombat!.ReplacementDelaySeconds;
                if (!double.IsFinite(delaySeconds) || delaySeconds < 0.0)
                    throw new InvalidOperationException(
                        "Continuous-combat replacement delay must be finite and non-negative.");
                _nextOpponentSpawnAtMs = _simTimeMs + delaySeconds * 1000.0;
            }
        } else return;
        EmitEvent(SessionEventType.Destroyed, source, target);
        if (target == CombatRole.Player)
            FinalizeRapierServiceLife(
                RapierServiceLifeTerminationReason.OwnshipDestroyed);
        if (target == CombatRole.Opponent
            && promoteFormationSurvivor
            && _playerTerminalState == AircraftTerminalState.Flying)
            TryPromoteWingmanToPrimary();
        if (target == CombatRole.Opponent)
            MaybeRequestFirstRunRecovery();
    }
}
