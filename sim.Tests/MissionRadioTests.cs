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
    public void LaunchClearanceLeadsThePatternWithoutAnEchoReadback() {
        var director = new MissionRadioDirector();
        double clock = 0.0;

        MissionRadioTransmission clearance =
            director.Step(State(0.0, catapult: true));
        Assert.Equal("launch-cleared", clearance.Id);

        // End the stroke; ANCA hold delays airborne until after aviate.
        director.Step(State(10.0, catapult: false, leg: "INITIAL"));
        clock = 10.0;
        MissionRadioTransmission airborne = WaitFor(
            director, ref clock, "pilot-airborne",
            t => State(t, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission patternInstruction = WaitFor(
            director, ref clock, "tower-join-initial",
            t => State(t, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission initial = WaitFor(
            director, ref clock, "pilot-initial",
            t => State(t, catapult: false, leg: "INITIAL"));

        Assert.True(airborne.StartedAtSeconds >= 12.5,
            "airborne must wait for the aviate hold after the stroke");
        Assert.Contains("two thousand five hundred", patternInstruction.Text);
        Assert.DoesNotContain("report initial", patternInstruction.Text);
        Assert.Equal("pilot-initial", initial.Id);
        Assert.Equal("RAPIER 1-1", clearance.Callsign);
        Assert.Equal(MissionRadioChannel.Tower, clearance.Channel);
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
            director, ref clock, "traffic-rapier-2-base",
            t => State(t, traffic: [onBase]));

        Assert.Equal("RAPIER 1-2", call.Speaker);
        Assert.Equal("Rapier Tower, Rapier One Two, base.", call.Text);
        Assert.True(call.StartedAtSeconds >= 2.4);
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
    public void RapierInterceptVoicesGunsOncePerEngagement() {
        var director = new MissionRadioDirector();
        double clock = 0.0;
        director.Step(State(
            0.0, pattern: false, phase: RapierMissionPhase.Launch));
        director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        clock = 1.0;
        WaitFor(director, ref clock, "control-commit",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept));

        director.Step(State(
            clock + 1.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 4));
        clock += 1.0;
        MissionRadioTransmission first = WaitFor(
            director, ref clock, "pilot-guns",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 4));

        MissionRadioTransmission steady = director.Step(State(
            clock + 2.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 8));
        director.Step(State(
            clock + 12.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 8));
        MissionRadioTransmission secondBurst = director.Step(State(
            clock + 13.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 12));

        Assert.Equal("Guns.", first.Text);
        Assert.Equal(first.Sequence, steady.Sequence);
        Assert.Equal(first.Sequence, secondBurst.Sequence);
        Assert.True(first.StartedAtSeconds >= clock - 13.0 + 2.5,
            "guns must wait for the aviate hold after employment starts");

        director.Step(State(
            clock + 20.0, pattern: false, phase: RapierMissionPhase.Escape, gunRounds: 12));
        director.Step(State(
            clock + 30.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 12));
        clock += 30.0;
        WaitFor(director, ref clock, "control-commit",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 12));
        director.Step(State(
            clock + 1.0, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 16));
        clock += 1.0;
        MissionRadioTransmission nextEngagement = WaitFor(
            director, ref clock, "pilot-guns",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept, gunRounds: 16));

        Assert.True(nextEngagement.Sequence > first.Sequence);
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
        Assert.True(splash.StartedAtSeconds >= 3.5);
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
    public void PilotCallDoesNotKeyDuringTheAviateHold() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, phase: RapierMissionPhase.Launch));
        // Commit event at t=1 — must stay silent through the aviate window.
        MissionRadioTransmission duringHold = director.Step(State(
            1.0, pattern: false, phase: RapierMissionPhase.Intercept));
        MissionRadioTransmission stillHolding = director.Step(State(
            3.0, pattern: false, phase: RapierMissionPhase.Intercept));
        double clock = 3.0;
        MissionRadioTransmission commit = WaitFor(
            director, ref clock, "control-commit",
            t => State(t, pattern: false, phase: RapierMissionPhase.Intercept));

        Assert.False(duringHold.Active);
        Assert.False(stillHolding.Active);
        Assert.True(commit.StartedAtSeconds >= 3.7);
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
        Assert.Equal("Rapier one one",
            RadioPhraseology.SpokenCallsign(1, 1));
    }

    static CircuitTrafficShip Ship(string callsign, string leg) =>
        new(true, callsign, leg, 0.0, 800.0, 0.0, 0.0);
}
