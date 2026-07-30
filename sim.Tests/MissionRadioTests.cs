using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class MissionRadioTests {
    static readonly CircuitTrafficShip[] NoTraffic = [];
    static readonly SessionEvent[] NoEvents = [];

    static MissionRadioState State(
        double timeSeconds,
        bool pattern = true,
        bool rapier = true,
        RapierMissionPhase phase = RapierMissionPhase.Launch,
        bool catapult = false,
        string leg = "DEPART",
        IReadOnlyList<CircuitTrafficShip>? traffic = null,
        bool gearDownAndLocked = true,
        bool recoveryApproach = false,
        bool maritimeRecovery = false,
        Carrier.Recovery recovery = Carrier.Recovery.Flying,
        ArrestmentModel.ArrestmentPhase arrestment =
            ArrestmentModel.ArrestmentPhase.None,
        int wire = 0,
        string lsoCall = "",
        LsoSeverity? lsoSeverity = null,
        int gunRounds = 0,
        int gunAmmo = 100,
        int missiles = 0,
        bool missileInFlight = false,
        int drones = 0,
        bool joker = false,
        bool bingo = false,
        IReadOnlyList<SessionEvent>? events = null) => new(
            TimeSeconds: timeSeconds,
            MissionActive: true,
            RapierMissionAvailable: rapier,
            PatternOnly: pattern,
            RapierPhase: phase,
            CatapultActive: catapult,
            PlayerLeg: leg,
            Traffic: traffic ?? NoTraffic,
            GearDownAndLocked: gearDownAndLocked,
            RecoveryApproach: recoveryApproach,
            MaritimeRecovery: maritimeRecovery,
            Recovery: recovery,
            ArrestmentPhase: arrestment,
            CaughtWire: wire,
            LsoCall: lsoCall,
            LsoSeverity: lsoSeverity,
            GunRoundsFired: gunRounds,
            GunAmmoRemaining: gunAmmo,
            MissilesRemaining: missiles,
            MissileInFlight: missileInFlight,
            DronesRemaining: drones,
            Joker: joker,
            Bingo: bingo,
            Events: events ?? NoEvents);

    /// Advance until a new transmission with the expected id keys the mic (ANCA holds + gaps).
    static MissionRadioTransmission WaitFor(
        MissionRadioDirector director,
        ref double clock,
        string expectedId,
        Func<double, MissionRadioState> state,
        double step = 1.0,
        int maxSteps = 60) {
        long seen = 0;
        for (int i = 0; i < maxSteps; i++) {
            clock += step;
            MissionRadioTransmission tx = director.Step(state(clock));
            if (tx.Active && tx.Sequence != seen) {
                seen = tx.Sequence;
                if (tx.Id == expectedId) return tx;
            }
        }
        throw new Xunit.Sdk.XunitException(
            $"timed out waiting for '{expectedId}' (last clock {clock:0.0}s)");
    }

    [Fact]
    public void VisualShotCrewReleasesTheLauncherWithoutRadio() {
        var director = new MissionRadioDirector();
        double clock = 0.0;

        MissionRadioTransmission launch =
            director.Step(State(0.0, catapult: true));
        Assert.False(launch.Active);
        Assert.True(director.LaunchClearanceComplete);

        // Once airborne, pattern R/T begins at the first reportable gate.
        clock += 1.0;
        director.Step(State(clock, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission initial = WaitFor(
            director, ref clock, "pilot-initial",
            t => State(t, catapult: false, leg: "INITIAL"));

        Assert.Equal("pilot-initial", initial.Id);
        Assert.Equal("GHOST 11", initial.Speaker);
        Assert.Equal(MissionRadioChannel.Tower, initial.Channel);
    }

    [Fact]
    public void HoldingASteadyStateDoesNotGenerateTimedRadioSpam() {
        var director = new MissionRadioDirector();

        MissionRadioTransmission first =
            director.Step(State(0.0, pattern: false, rapier: false));
        MissionRadioTransmission later =
            director.Step(State(100.0, pattern: false, rapier: false));

        Assert.False(first.Active);
        Assert.False(later.Active);
        Assert.Equal(0, later.Sequence);
    }

    [Fact]
    public void TrafficReportsOnlyWhenCrossingAReportableLeg() {
        var director = new MissionRadioDirector();
        CircuitTrafficShip downwind = Ship("RAPIER 2", "DOWNWIND");
        CircuitTrafficShip onBase = Ship("RAPIER 2", "BASE");
        double clock = 0.0;

        director.Step(State(0.0, traffic: [downwind]));
        director.Step(State(1.0, traffic: [onBase]));
        clock = 1.0;
        MissionRadioTransmission call = WaitFor(
            director, ref clock, "traffic-rapier-2-gear",
            t => State(t, traffic: [onBase]));

        Assert.Equal("GHOST 12", call.Speaker);
        Assert.Equal("Ghost One Two, gear.", call.Text);
        Assert.True(call.StartedAtSeconds >= 1.25);
    }

    [Fact]
    public void TrafficReportsConfigurationOnlyAfterTheGearIsActuallySafe() {
        var director = new MissionRadioDirector();
        CircuitTrafficShip downwind = Ship(
            "RAPIER 2", "DOWNWIND", gearDownAndLocked: false);
        CircuitTrafficShip configuring = Ship(
            "RAPIER 2", "BASE", gearDownAndLocked: false);
        CircuitTrafficShip configured = Ship(
            "RAPIER 2", "BASE", gearDownAndLocked: true);
        double clock = 0.0;

        director.Step(State(clock, traffic: [downwind]));
        for (int step = 1; step <= 20; step++) {
            clock = step * 0.1;
            MissionRadioTransmission silent =
                director.Step(State(clock, traffic: [configuring]));
            Assert.NotEqual("traffic-rapier-2-gear", silent.Id);
        }

        MissionRadioTransmission call = WaitFor(
            director, ref clock, "traffic-rapier-2-gear",
            t => State(t, traffic: [configured]),
            step: 0.1);

        Assert.Equal("Ghost One Two, gear.", call.Text);
    }

    [Fact]
    public void IndependentTrafficCallsCanCreateShortFrequencySaturation() {
        var director = new MissionRadioDirector();
        CircuitTrafficShip[] downwind = [
            Ship("RAPIER 2", "DOWNWIND", reactionSeconds: 0.55),
            Ship("RAPIER 3", "DOWNWIND", reactionSeconds: 0.24),
            Ship("RAPIER 4", "DOWNWIND", reactionSeconds: 0.32),
        ];
        CircuitTrafficShip[] onBase = [
            Ship("RAPIER 2", "BASE", reactionSeconds: 0.55),
            Ship("RAPIER 3", "BASE", reactionSeconds: 0.24),
            Ship("RAPIER 4", "BASE", reactionSeconds: 0.32),
        ];
        director.Step(State(0.0, traffic: downwind));
        director.Step(State(1.0, traffic: onBase));

        double clock = 1.0;
        long seenSequence = 0;
        var heard = new List<MissionRadioTransmission>();
        for (int step = 0; step < 160 && heard.Count < 3; step++) {
            clock += 0.1;
            MissionRadioTransmission current =
                director.Step(State(clock, traffic: onBase));
            if (current.Active && current.Sequence != seenSequence) {
                seenSequence = current.Sequence;
                heard.Add(current);
            }
        }

        Assert.Equal(
            [
                "traffic-rapier-3-gear",
                "traffic-rapier-4-gear",
                "traffic-rapier-2-gear",
            ],
            heard.Select(call => call.Id));
        Assert.True(heard[^1].StartedAtSeconds - heard[0].StartedAtSeconds < 10.0);
        for (int index = 1; index < heard.Count; index++)
            Assert.True(heard[index].StartedAtSeconds >= heard[index - 1].EndsAtSeconds);
    }

    [Fact]
    public void TrafficIntentExpiresWhenTheAircraftLeavesBaseBeforeKeying() {
        var director = new MissionRadioDirector();
        CircuitTrafficShip downwind = Ship(
            "RAPIER 2", "DOWNWIND", reactionSeconds: 0.0);
        CircuitTrafficShip onBase = Ship(
            "RAPIER 2", "BASE", reactionSeconds: 0.0);
        CircuitTrafficShip onFinal = Ship(
            "RAPIER 2", "SHORT_FINAL", reactionSeconds: 0.0);

        director.Step(State(0.0, traffic: [downwind]));
        director.Step(State(1.0, traffic: [onBase]));
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Queued
                && decision.TransmissionId == "traffic-rapier-2-gear");
        for (int step = 1; step <= 80; step++) {
            double clock = 1.0 + step * 0.1;
            MissionRadioTransmission current =
                director.Step(State(clock, traffic: [onFinal]));
            Assert.NotEqual("traffic-rapier-2-gear", current.Id);
        }
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Expired
                && decision.TransmissionId == "traffic-rapier-2-gear"
                && decision.Reason.Contains("left the reportable"));
    }

    [Fact]
    public void UrgentSafetyCallTakesTheFrequencyFromQueuedTraffic() {
        var director = new MissionRadioDirector();
        CircuitTrafficShip downwind = Ship(
            "RAPIER 2", "DOWNWIND", reactionSeconds: 0.0);
        CircuitTrafficShip onBase = Ship(
            "RAPIER 2", "BASE", reactionSeconds: 0.0);

        director.Step(State(0.0, leg: "DOWNWIND", traffic: [downwind]));
        director.Step(State(1.0, leg: "DOWNWIND", traffic: [onBase]));
        double clock = 1.1;
        MissionRadioTransmission urgent = director.Step(State(
            clock,
            leg: "SHORT_FINAL",
            traffic: [onBase],
            gearDownAndLocked: false));
        if (!urgent.Active) {
            urgent = WaitFor(
                director, ref clock, "tower-waveoff-gear",
                t => State(
                    t,
                    leg: "SHORT_FINAL",
                    traffic: [onBase],
                    gearDownAndLocked: false),
                step: 0.1);
        }

        Assert.Equal("tower-waveoff-gear", urgent.Id);
        Assert.Equal(MissionRadioPriority.Urgent, urgent.Priority);
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Preempted
                && decision.TransmissionId == "traffic-rapier-2-gear");
    }

    [Fact]
    public void GeneratedTrafficMakesAtMostOneRelevantGearCallPerAircraftPerCircuit() {
        var director = new MissionRadioDirector();
        var home = new Vec3D(1_000.0, 40.0, 2_000.0);
        var initial = new Vec3D(1_000.0, 1_040.0, -14_000.0);
        CircuitTrafficShip[] traffic =
            CircuitPatternTraffic.Evaluate(0.0, home, initial);
        director.Step(State(0.0, traffic: traffic));

        long seenSequence = 0;
        var heardCircuits = new HashSet<(string Callsign, long Circuit)>();
        for (int tick = 1; tick <= 12_000; tick++) {
            double clock = tick * 0.1;
            traffic = CircuitPatternTraffic.Evaluate(clock, home, initial);
            MissionRadioTransmission current =
                director.Step(State(clock, traffic: traffic));
            if (!current.Active
                || current.Sequence == seenSequence
                || !current.Id.StartsWith("traffic-", StringComparison.Ordinal))
                continue;

            seenSequence = current.Sequence;
            CircuitTrafficShip ship = Assert.Single(
                traffic,
                candidate => candidate.Callsign switch {
                    "RAPIER 2" => current.Id == "traffic-rapier-2-gear",
                    "RAPIER 3" => current.Id == "traffic-rapier-3-gear",
                    "RAPIER 4" => current.Id == "traffic-rapier-4-gear",
                    _ => false,
                });
            Assert.Equal("BASE", ship.Leg);
            Assert.True(ship.GearDownAndLocked);
            Assert.True(
                heardCircuits.Add((ship.Callsign, ship.CircuitNumber)),
                $"{ship.Callsign} reported gear twice on circuit {ship.CircuitNumber}");
        }

        Assert.Contains(heardCircuits, report => report.Callsign == "RAPIER 2");
        Assert.Contains(heardCircuits, report => report.Callsign == "RAPIER 3");
        Assert.Contains(heardCircuits, report => report.Callsign == "RAPIER 4");
    }

    [Fact]
    public void UnsafeGearOnFinalPreemptsRoutineCalls() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "DOWNWIND"));
        double clock = 0.0;
        director.Step(State(1.0, leg: "SHORT_FINAL", gearDownAndLocked: false));
        clock = 1.0;
        MissionRadioTransmission warning = WaitFor(
            director, ref clock, "tower-waveoff-gear",
            t => State(t, leg: "SHORT_FINAL", gearDownAndLocked: false),
            step: 0.25);

        Assert.Equal(MissionRadioPriority.Urgent, warning.Priority);
        Assert.Contains("go around", warning.Text);
        Assert.Contains("Gear unsafe", warning.Text);
    }

    [Fact]
    public void StoppedArrestmentOrdersHoldWithoutTheWireNumber() {
        // The wire number is an internal LSO datum, never a radio call (PHRASEOLOGY.md §3.3).
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "WIRE_FINAL"));
        double clock = 0.0;
        director.Step(State(
            1.0,
            leg: "WIRE_FINAL",
            recovery: Carrier.Recovery.Trap,
            arrestment: ArrestmentModel.ArrestmentPhase.Stopped,
            wire: 3));
        clock = 1.0;
        MissionRadioTransmission trap = WaitFor(
            director, ref clock, "tower-hold-position",
            t => State(
                t, leg: "WIRE_FINAL",
                recovery: Carrier.Recovery.Trap,
                arrestment: ArrestmentModel.ArrestmentPhase.Stopped,
                wire: 3));

        Assert.Contains("hold position", trap.Text);
        Assert.DoesNotContain("wire", trap.Text);
    }

    [Fact]
    public void ClassicDogfightNeverCallsGunsOnTheTrigger() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, rapier: false));

        MissionRadioTransmission first = director.Step(State(
            1.0, pattern: false, rapier: false, gunRounds: 4));
        director.Step(State(
            20.0, pattern: false, rapier: false, gunRounds: 4));
        MissionRadioTransmission second = director.Step(State(
            21.0, pattern: false, rapier: false, gunRounds: 12));

        Assert.False(first.Active);
        Assert.False(second.Active);
    }

    [Fact]
    public void RapierInterceptTriggerRemainsSilentWithoutAnOperationalRecipient() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            0.0, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        clock = 1.0;
        WaitFor(director, ref clock, "control-commit-short",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept));
        WaitFor(director, ref clock, "pilot-commit-ack",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept));

        MissionRadioExchangeSnapshot commit = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "tactical-commit");
        Assert.Equal(MissionRadioExchangeStatus.Complete, commit.Status);
        Assert.True(commit.KnowledgeClosed);
        Assert.True(commit.AuthorityAcknowledged);

        for (int step = 1; step <= 40; step++) {
            MissionRadioTransmission transmission = director.Step(State(
                clock + step * 0.25,
                pattern: false,
                phase: RapierMissionPhase.Intercept,
                gunRounds: step * 4));
            Assert.NotEqual("pilot-guns", transmission.Id);
        }
    }

    [Fact]
    public void AttachingMidBurstDoesNotInventADogfightGunsCall() {
        var director = new MissionRadioDirector();

        MissionRadioTransmission call = director.Step(State(
            0.0, pattern: false, rapier: false, gunRounds: 4));

        Assert.False(call.Active);
    }

    [Fact]
    public void MissileAndOrdnanceCallsUsePackageBrevity() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            0.0, pattern: false, missiles: 1, gunAmmo: 100));
        director.Step(State(
            1.0, pattern: false, missiles: 0, missileInFlight: true, gunAmmo: 100));
        clock = 1.0;
        MissionRadioTransmission fox = WaitFor(
            director, ref clock, "pilot-fox-two",
            t => State(t, pattern: false, missiles: 0, missileInFlight: true, gunAmmo: 100));
        MissionRadioTransmission remington = WaitFor(
            director, ref clock, "pilot-remington",
            t => State(t, pattern: false, missiles: 0, missileInFlight: true, gunAmmo: 100));

        Assert.Equal("Fox Two.", fox.Text);
        Assert.Equal("Remington.", remington.Text);
    }

    [Fact]
    public void BingoPreemptsRoutineTrafficAndQueuesReturnDirective() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(0.0, pattern: false));
        director.Step(State(1.0, pattern: false, gunRounds: 4));
        director.Step(State(1.1, pattern: false, bingo: true));
        clock = 1.1;
        MissionRadioTransmission bingo = WaitFor(
            director, ref clock, "pilot-bingo",
            t => State(t, pattern: false, bingo: true),
            step: 0.25);
        MissionRadioTransmission directive = WaitFor(
            director, ref clock, "control-bingo-rtb",
            t => State(t, pattern: false, bingo: true));

        Assert.Equal(MissionRadioPriority.Urgent, bingo.Priority);
        Assert.Equal("control-bingo-rtb", directive.Id);
    }

    [Fact]
    public void ClassicDogfightKeepsSplashOffTheAir() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, rapier: false));
        var destroyed = new SessionEvent(
            Sequence: 4,
            Tick: 20,
            Type: SessionEventType.Destroyed,
            Source: CombatRole.Player,
            Target: CombatRole.Opponent,
            Count: 1,
            Outcome: SortieOutcome.None);

        MissionRadioTransmission call = director.Step(State(
            1.0, pattern: false, rapier: false, events: [destroyed]));

        Assert.False(call.Active);
    }

    [Fact]
    public void RapierPackageSplashUsesBrevityWithoutPollingForOutcome() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(0.0, pattern: false));
        var destroyed = new SessionEvent(
            Sequence: 4,
            Tick: 20,
            Type: SessionEventType.Destroyed,
            Source: CombatRole.Player,
            Target: CombatRole.Opponent,
            Count: 1,
            Outcome: SortieOutcome.None);

        director.Step(State(1.0, pattern: false, events: [destroyed]));
        clock = 1.0;
        MissionRadioTransmission splash = WaitFor(
            director, ref clock, "pilot-splash",
            t => State(t, pattern: false, events: [destroyed]));

        Assert.Equal("Splash one.", splash.Text);
        Assert.True(splash.StartedAtSeconds <= 2.25);
    }

    [Fact]
    public void CarrierApproachAndPaddlesCallsUseTheSharedRadioOutsideCircuits() {
        var recoveryDirector = new MissionRadioDirector();
        double clock = 0.0;
        recoveryDirector.Step(State(
            0.0, pattern: false, rapier: false, recoveryApproach: true));
        MissionRadioTransmission checkIn = WaitFor(
            recoveryDirector, ref clock, "pilot-recovery-request",
            t => State(t, pattern: false, rapier: false, recoveryApproach: true));

        var paddlesDirector = new MissionRadioDirector();
        paddlesDirector.Step(State(0.0, pattern: false, rapier: false));
        clock = 0.0;
        paddlesDirector.Step(State(
            1.0, pattern: false, rapier: false,
            maritimeRecovery: true,
            lsoCall: "WAVE OFF, WAVE OFF",
            lsoSeverity: LsoSeverity.WaveOff));
        clock = 1.0;
        MissionRadioTransmission waveOff = WaitFor(
            paddlesDirector, ref clock, "lso-waveoff",
            t => State(
                t, pattern: false, rapier: false,
                maritimeRecovery: true,
                lsoCall: "WAVE OFF, WAVE OFF",
                lsoSeverity: LsoSeverity.WaveOff),
            step: 0.25);

        Assert.Equal(MissionRadioChannel.Approach, checkIn.Channel);
        Assert.Equal(MissionRadioPriority.Urgent, waveOff.Priority);
        Assert.Equal("PADDLES", waveOff.Speaker);
    }

    [Fact]
    public void FixedStripBolterStaysWithTowerInsteadOfInventingPaddles() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(0.0, pattern: false, rapier: false));
        director.Step(State(
            1.0, pattern: false, rapier: false,
            recovery: Carrier.Recovery.Bolter,
            maritimeRecovery: false));
        clock = 1.0;
        MissionRadioTransmission bolter = WaitFor(
            director, ref clock, "tower-bolter",
            t => State(
                t, pattern: false, rapier: false,
                recovery: Carrier.Recovery.Bolter,
                maritimeRecovery: false),
            step: 0.25);

        Assert.Equal("RAPIER TOWER", bolter.Speaker);
        Assert.Equal(MissionRadioChannel.Tower, bolter.Channel);
    }

    [Fact]
    public void TacticalCallUsesAShortHumanBeatInsteadOfArrivingLate() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, phase: RapierMissionPhase.Launch));
        // Commit event at t=1: a fractional beat preserves cadence without making it stale.
        MissionRadioTransmission duringHold = director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        MissionRadioTransmission stillHolding = director.Step(State(
            1.2, pattern: false, phase: RapierMissionPhase.Intercept));
        double clock = 1.2;
        MissionRadioTransmission commit = WaitFor(
            director, ref clock, "control-commit-short",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept),
            step: 0.1);

        Assert.False(duringHold.Active);
        Assert.False(stillHolding.Active);
        Assert.InRange(commit.StartedAtSeconds, 1.25, 1.5);
    }

    [Fact]
    public void TacticalCheckInUsesRadarCorrelationToCloseTheSharedPosition() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            clock,
            pattern: false,
            phase: RapierMissionPhase.Launch,
            catapult: true));
        director.Step(State(
            1.0,
            pattern: false,
            phase: RapierMissionPhase.Climb,
            catapult: false));
        clock = 1.0;

        WaitFor(
            director, ref clock, "pilot-check-in",
            t => State(
                t,
                pattern: false,
                phase: RapierMissionPhase.Climb,
                catapult: false),
            step: 0.1);
        MissionRadioKnowledge pilotCall =
            director.SharedKnowledge(MissionRadioChannel.Tactical);
        Assert.True(pilotCall.HasFlag(MissionRadioKnowledge.Identity));
        Assert.True(pilotCall.HasFlag(MissionRadioKnowledge.RequestOrIntent));
        Assert.False(pilotCall.HasFlag(MissionRadioKnowledge.Position));

        WaitFor(
            director, ref clock, "control-radar-contact",
            t => State(
                t,
                pattern: false,
                phase: RapierMissionPhase.Climb,
                catapult: false),
            step: 0.1);
        MissionRadioExchangeSnapshot checkIn = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "tactical-check-in");
        Assert.Equal(MissionRadioExchangeStatus.Complete, checkIn.Status);
        Assert.True(checkIn.KnowledgeClosed);
        Assert.Equal(
            MissionRadioKnowledge.All,
            director.SharedKnowledge(MissionRadioChannel.Tactical));
    }

    [Fact]
    public void PatternExchangeBuildsSharedKnowledgeOnlyAsCallsActuallyTransmit() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(clock, leg: "DEPART"));

        clock = 1.0;
        director.Step(State(clock, leg: "INITIAL"));
        MissionRadioExchangeSnapshot queued = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "pattern-entry");
        Assert.Equal(MissionRadioExchangeStatus.Queued, queued.Status);
        Assert.Equal(
            MissionRadioKnowledge.None,
            director.SharedKnowledge(MissionRadioChannel.Tower));

        WaitFor(
            director, ref clock, "pilot-initial",
            t => State(t, leg: "INITIAL"),
            step: 0.1);
        MissionRadioKnowledge afterInitial =
            director.SharedKnowledge(MissionRadioChannel.Tower);
        Assert.Equal(
            MissionRadioKnowledge.Identity
            | MissionRadioKnowledge.Position
            | MissionRadioKnowledge.RequestOrIntent,
            afterInitial);
        Assert.False(afterInitial.HasFlag(MissionRadioKnowledge.CurrentAuthority));

        WaitFor(
            director, ref clock, "tower-break-approved",
            t => State(t, leg: "INITIAL"),
            step: 0.1);
        MissionRadioExchangeSnapshot awaitingAction = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "pattern-entry");
        Assert.Equal(
            MissionRadioExchangeStatus.AwaitingAcknowledgment,
            awaitingAction.Status);
        Assert.True(awaitingAction.KnowledgeClosed);
        Assert.False(awaitingAction.AuthorityAcknowledged);

        clock += 0.1;
        director.Step(State(clock, leg: "BREAK"));
        MissionRadioExchangeSnapshot complete = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "pattern-entry");
        Assert.Equal(MissionRadioExchangeStatus.Complete, complete.Status);
        Assert.True(complete.AuthorityAcknowledged);
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind
                == MissionRadioDecisionKind.ImplicitAcknowledgment
                && decision.ExchangeId == complete.Id);
    }

    [Fact]
    public void LandingClearanceIsSuppressedWithoutAnEstablishedTowerPicture() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "DEPART"));

        director.Step(State(1.0, leg: "BASE"));
        MissionRadioTransmission result = director.Step(State(1.5, leg: "BASE"));

        Assert.False(result.Active);
        MissionRadioExchangeSnapshot landing = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "landing-clearance");
        Assert.Equal(MissionRadioExchangeStatus.Suppressed, landing.Status);
        Assert.Equal(MissionRadioKnowledge.None, landing.Knowledge);
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind
                == MissionRadioDecisionKind.SuppressedMissingContext
                && decision.TransmissionId == "tower-cleared-arrested-landing");
        Assert.DoesNotContain(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Transmitted
                && decision.TransmissionId == "pilot-landing-ack");
    }

    [Fact]
    public void ExpiredAuthorityExchangeNeverPlaysItsOrphanedAcknowledgment() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            clock, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        clock = 1.0;
        WaitFor(
            director, ref clock, "control-commit-short",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept),
            step: 0.1);

        clock += 20.0;
        MissionRadioTransmission late = director.Step(State(
            clock, pattern: false, phase: RapierMissionPhase.Intercept));

        Assert.False(late.Active);
        MissionRadioExchangeSnapshot commit = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "tactical-commit");
        Assert.Equal(MissionRadioExchangeStatus.Expired, commit.Status);
        Assert.True(commit.KnowledgeClosed);
        Assert.False(commit.AuthorityAcknowledged);
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Expired
                && decision.TransmissionId == "pilot-commit-ack");
        Assert.DoesNotContain(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Transmitted
                && decision.TransmissionId == "pilot-commit-ack");
    }

    [Fact]
    public void UrgentSafetyCallPreemptsAnUnspokenExchangeAndItsReadback() {
        var director = new MissionRadioDirector();
        director.Step(State(
            0.0, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));

        double clock = 1.05;
        director.Step(State(
            clock,
            pattern: false,
            phase: RapierMissionPhase.Intercept,
            lsoCall: "WAVE OFF, WAVE OFF",
            lsoSeverity: LsoSeverity.WaveOff));
        WaitFor(
            director, ref clock, "lso-waveoff",
            t => State(
                t,
                pattern: false,
                phase: RapierMissionPhase.Intercept,
                lsoCall: "WAVE OFF, WAVE OFF",
                lsoSeverity: LsoSeverity.WaveOff),
            step: 0.1);

        MissionRadioExchangeSnapshot commit = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "tactical-commit");
        Assert.Equal(MissionRadioExchangeStatus.Preempted, commit.Status);
        Assert.False(commit.Knowledge.HasFlag(MissionRadioKnowledge.CurrentAuthority));
        Assert.False(commit.AuthorityAcknowledged);
        Assert.DoesNotContain(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Transmitted
                && decision.TransmissionId is
                    "control-commit-short" or "pilot-commit-ack");
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Preempted
                && decision.TransmissionId == "pilot-commit-ack");
    }

    [Fact]
    public void UrgentSafetyCallRetractsClosureWhenItCutsOffTheReadback() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            clock, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        clock = 1.0;
        WaitFor(
            director, ref clock, "control-commit-short",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept),
            step: 0.1);
        WaitFor(
            director, ref clock, "pilot-commit-ack",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept),
            step: 0.1);

        clock += 0.05;
        director.Step(State(
            clock,
            pattern: false,
            phase: RapierMissionPhase.Intercept,
            lsoCall: "WAVE OFF, WAVE OFF",
            lsoSeverity: LsoSeverity.WaveOff));

        MissionRadioExchangeSnapshot commit = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "tactical-commit");
        Assert.Equal(MissionRadioExchangeStatus.Preempted, commit.Status);
        Assert.False(commit.AuthorityAcknowledged);
        Assert.DoesNotContain(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.ExchangeCompleted
                && decision.ExchangeId == commit.Id);
        Assert.Contains(
            director.Decisions,
            decision => decision.Kind == MissionRadioDecisionKind.Preempted
                && decision.TransmissionId == "pilot-commit-ack");
    }

    [Fact]
    public void BingoDirectiveClosesOnlyWhenTheAircraftActuallyStartsHome() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            clock, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept, bingo: true));
        clock = 1.0;
        WaitFor(
            director, ref clock, "pilot-bingo",
            t => State(
                t, pattern: false, phase: RapierMissionPhase.Intercept, bingo: true),
            step: 0.1);
        WaitFor(
            director, ref clock, "control-bingo-rtb",
            t => State(
                t, pattern: false, phase: RapierMissionPhase.Intercept, bingo: true),
            step: 0.1);

        MissionRadioExchangeSnapshot awaitingTurn = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "bingo-return");
        Assert.Equal(
            MissionRadioExchangeStatus.AwaitingAcknowledgment,
            awaitingTurn.Status);
        Assert.True(awaitingTurn.KnowledgeClosed);
        Assert.False(awaitingTurn.AuthorityAcknowledged);

        clock += 0.1;
        director.Step(State(
            clock,
            pattern: false,
            phase: RapierMissionPhase.ReturnToBase,
            bingo: true));
        MissionRadioExchangeSnapshot returning = Assert.Single(
            director.ExchangeHistory,
            exchange => exchange.ContractId == "bingo-return");
        Assert.Equal(MissionRadioExchangeStatus.Complete, returning.Status);
        Assert.True(returning.AuthorityAcknowledged);
    }

    [Fact]
    public void StalePatternCallsExpireInsteadOfNarratingAnOldLeg() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "DEPART"));
        director.Step(State(1.0, leg: "INITIAL"));

        MissionRadioTransmission late = director.Step(State(20.0, leg: "BASE"));

        Assert.False(late.Active);
    }

    [Theory]
    [InlineData("305", "three zero five")]
    [InlineData("19", "one niner")]
    public void DigitGroupsUseAviationPronunciation(string value, string expected) =>
        Assert.Equal(expected, RadioPhraseology.DigitGroup(value));

    [Fact]
    public void FrequencyAndAltitudeUseMilitaryAviationForm() {
        Assert.Equal("three zero five decimal five",
            RadioPhraseology.Frequency(305.5));
        Assert.Equal("two thousand five hundred",
            RadioPhraseology.AltitudeFeet(2_500));
        Assert.Equal("Ghost one one",
            RadioPhraseology.SpokenCallsign(1, 1));
    }

    static CircuitTrafficShip Ship(
        string callsign,
        string leg,
        bool gearDownAndLocked = true,
        double reactionSeconds = 0.0) =>
        new(
            true,
            callsign,
            leg,
            0.0,
            800.0,
            0.0,
            0.0,
            GearDownAndLocked: gearDownAndLocked,
            RadioReactionSeconds: reactionSeconds);
}
