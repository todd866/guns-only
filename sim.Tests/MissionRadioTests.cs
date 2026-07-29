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

    [Fact]
    public void LaunchClearanceGetsAnExplicitReadbackBeforeDepartureTraffic() {
        var director = new MissionRadioDirector();

        MissionRadioTransmission clearance =
            director.Step(State(0.0, catapult: true));
        MissionRadioTransmission readback =
            director.Step(State(10.0, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission airborne =
            director.Step(State(20.0, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission patternInstruction =
            director.Step(State(30.0, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission initial =
            director.Step(State(40.0, catapult: false, leg: "INITIAL"));
        MissionRadioTransmission reportBreak =
            director.Step(State(50.0, catapult: false, leg: "INITIAL"));

        Assert.Equal("launch-cleared", clearance.Id);
        Assert.Equal("pilot-launch-readback", readback.Id);
        Assert.Equal("pilot-airborne", airborne.Id);
        Assert.Equal("tower-join-initial", patternInstruction.Id);
        Assert.Contains("report initial", patternInstruction.Text);
        Assert.Equal("pilot-initial", initial.Id);
        Assert.Equal("tower-report-break", reportBreak.Id);
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

        director.Step(State(0.0, traffic: [downwind]));
        MissionRadioTransmission call =
            director.Step(State(1.0, traffic: [onBase]));

        Assert.Equal("traffic-rapier-2-base", call.Id);
        Assert.Equal("RAPIER 1-2", call.Speaker);
        Assert.Equal("Rapier Tower, Rapier One Two, base.", call.Text);
    }

    [Fact]
    public void UnsafeGearOnFinalPreemptsRoutineCalls() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "DOWNWIND"));

        MissionRadioTransmission warning = director.Step(State(
            1.0, leg: "SHORT_FINAL", gearDownAndLocked: false));

        Assert.Equal("tower-waveoff-gear", warning.Id);
        Assert.Equal(MissionRadioPriority.Urgent, warning.Priority);
        Assert.Contains("gear unsafe", warning.Text);
    }

    [Fact]
    public void StoppedArrestmentAnnouncesTheCaughtWire() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, leg: "WIRE_FINAL"));

        MissionRadioTransmission trap = director.Step(State(
            1.0,
            leg: "WIRE_FINAL",
            recovery: Carrier.Recovery.Trap,
            arrestment: ArrestmentModel.ArrestmentPhase.Stopped,
            wire: 3));

        Assert.Equal("tower-trap-wire-3", trap.Id);
        Assert.Contains("wire three", trap.Text);
    }

    [Fact]
    public void GunCallRequiresActualRoundEmploymentAndRearamsBetweenBursts() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, rapier: false));

        MissionRadioTransmission first = director.Step(State(
            1.0, pattern: false, rapier: false, gunRounds: 4));
        MissionRadioTransmission steady = director.Step(State(
            10.0, pattern: false, rapier: false, gunRounds: 8));
        director.Step(State(
            20.0, pattern: false, rapier: false, gunRounds: 8));
        MissionRadioTransmission second = director.Step(State(
            21.0, pattern: false, rapier: false, gunRounds: 12));

        Assert.Equal("pilot-guns", first.Id);
        Assert.Equal(first.Sequence, steady.Sequence);
        Assert.Equal("pilot-guns", second.Id);
        Assert.True(second.Sequence > first.Sequence);
    }

    [Fact]
    public void FirstObservedTickDoesNotLoseGunEmployment() {
        var director = new MissionRadioDirector();

        MissionRadioTransmission call = director.Step(State(
            0.0, pattern: false, rapier: false, gunRounds: 4));

        Assert.Equal("pilot-guns", call.Id);
    }

    [Fact]
    public void MissileAndOrdnanceCallsUseDistinctDefinedMeanings() {
        var director = new MissionRadioDirector();
        director.Step(State(
            0.0, pattern: false, missiles: 1, gunAmmo: 100));

        MissionRadioTransmission fox = director.Step(State(
            1.0, pattern: false, missiles: 0, missileInFlight: true, gunAmmo: 100));
        MissionRadioTransmission remington = director.Step(State(
            10.0, pattern: false, missiles: 0, missileInFlight: true, gunAmmo: 100));

        Assert.Equal("pilot-fox-two", fox.Id);
        Assert.Equal("pilot-remington", remington.Id);
    }

    [Fact]
    public void BingoPreemptsRoutineTrafficAndQueuesReturnDirective() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false));
        director.Step(State(
            1.0, pattern: false, gunRounds: 4));

        MissionRadioTransmission bingo =
            director.Step(State(1.1, pattern: false, bingo: true));
        MissionRadioTransmission directive =
            director.Step(State(10.0, pattern: false, bingo: true));

        Assert.Equal("pilot-bingo", bingo.Id);
        Assert.Equal(MissionRadioPriority.Urgent, bingo.Priority);
        Assert.Equal("control-bingo-rtb", directive.Id);
    }

    [Fact]
    public void DestructionEventProducesSplashWithoutPollingForOutcome() {
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

        MissionRadioTransmission splash = director.Step(State(
            1.0, pattern: false, rapier: false, events: [destroyed]));

        Assert.Equal("pilot-splash", splash.Id);
        Assert.Equal("Rapier One One, splash one.", splash.Text);
    }

    [Fact]
    public void CarrierApproachAndPaddlesCallsUseTheSharedRadioOutsideCircuits() {
        var recoveryDirector = new MissionRadioDirector();
        MissionRadioTransmission checkIn = recoveryDirector.Step(State(
            0.0, pattern: false, rapier: false, recoveryApproach: true));

        var paddlesDirector = new MissionRadioDirector();
        paddlesDirector.Step(State(0.0, pattern: false, rapier: false));
        MissionRadioTransmission waveOff = paddlesDirector.Step(State(
            1.0, pattern: false, rapier: false,
            maritimeRecovery: true,
            lsoCall: "WAVE OFF, WAVE OFF",
            lsoSeverity: LsoSeverity.WaveOff));

        Assert.Equal("pilot-recovery-request", checkIn.Id);
        Assert.Equal(MissionRadioChannel.Approach, checkIn.Channel);
        Assert.Equal("lso-waveoff", waveOff.Id);
        Assert.Equal(MissionRadioPriority.Urgent, waveOff.Priority);
        Assert.Equal("PADDLES", waveOff.Speaker);
    }

    [Fact]
    public void FixedStripBolterStaysWithTowerInsteadOfInventingPaddles() {
        var director = new MissionRadioDirector();
        director.Step(State(0.0, pattern: false, rapier: false));

        MissionRadioTransmission bolter = director.Step(State(
            1.0, pattern: false, rapier: false,
            recovery: Carrier.Recovery.Bolter,
            maritimeRecovery: false));

        Assert.Equal("tower-bolter", bolter.Id);
        Assert.Equal("RAPIER TOWER", bolter.Speaker);
        Assert.Equal(MissionRadioChannel.Tower, bolter.Channel);
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
