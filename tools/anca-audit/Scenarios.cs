using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.AncaAudit;

enum AuditActionKind {
    WaitSeconds,
    Sample,
    ReleaseWeaponsHold,
    TriggerPulse,
    HoldTrigger,
    KnockItOff,
    HoldKey,
    ReleaseKey,
    LaunchMissile,
    CommandGearUp,
    WaitUntilRadioId,
    WaitUntilChecklistId,
    WaitUntilPhase,
    WaitUntilLeg,
}

readonly record struct AuditAction(
    AuditActionKind Kind,
    double Seconds = 0,
    string Label = "",
    GKey Key = GKey.Trigger,
    string Match = "",
    double TimeoutSeconds = 60);

/// <param name="RequireRadioIds">
/// Catalog IDs that must appear in <c>radio_since_last_sample</c> across the run
/// (self-test / --strict). Empty means structural samples only.
/// </param>
readonly record struct AuditScenario(
    string Id,
    string Title,
    int BeatIndex,
    AuditAction[] Actions,
    Func<BeatSetup>? BeatFactory = null,
    string[]? RequireRadioIds = null);

/// <summary>Named situations that exercise ANCA rows and R/T under scripted pilot input.</summary>
static class Scenarios {
    public static IReadOnlyList<AuditScenario> All { get; } = [
        new("dogfight-merge", "F-22 visual merge — early SA, sparse R/T", 7, [
            Sample("spawn"),
            Wait(5), Sample("t+5s"),
            Wait(10), Sample("t+15s"),
            Act(AuditActionKind.KnockItOff),
            Wait(1), Sample("after-knock"),
        ]),
        new("dogfight-guns-hold", "Merge — hold release + trigger (no package Guns.)", 7, [
            Sample("spawn"),
            Wait(2),
            Act(AuditActionKind.ReleaseWeaponsHold),
            Act(AuditActionKind.HoldTrigger, seconds: 0.5),
            Wait(1), Sample("after-guns"),
        ]),
        new("rapier-launch", "Rapier intercept — automatic LAUNCH checklist", 10, [
            Sample("spawn"),
            Wait(2), Sample("t+2s"),
            Wait(8), Sample("t+10s"),
            Wait(20), Sample("t+30s"),
            Wait(30), Sample("t+60s"),
        ], RequireRadioIds: ["launch-cleared", "pilot-checklist-gear-up"]),
        new("rapier-radio-gear-up", "Rapier — wait for gear-up checklist radio", 10, [
            Sample("spawn"),
            WaitUntilRadio("pilot-checklist-gear-up", timeoutSeconds: 90),
            Sample("gear-up-call"),
            Wait(3), Sample("after-gear-up-call"),
        ], RequireRadioIds: ["pilot-checklist-gear-up"]),
        new("rapier-commit", "Rapier airborne intercept — COMMIT + CONTROL", 10, [
            Sample("spawn"),
            WaitUntilPhase("INTERCEPT", timeoutSeconds: 45),
            WaitUntilChecklist("COMMIT", timeoutSeconds: 10),
            WaitUntilRadio("control-commit-braa", timeoutSeconds: 20),
            Sample("commit"),
            Wait(4), Sample("commit+4s"),
        ], BeatFactory: AirborneInterceptCard,
            RequireRadioIds: ["control-commit-braa"]),
        new("rapier-guns", "Rapier Intercept — package Guns. once", 10, [
            Sample("spawn"),
            WaitUntilPhase("INTERCEPT", timeoutSeconds: 15),
            Sample("intercept"),
            Act(AuditActionKind.ReleaseWeaponsHold),
            Wait(0.25),
            Act(AuditActionKind.HoldTrigger, seconds: 0.6),
            WaitUntilRadio("pilot-guns", timeoutSeconds: 20),
            Sample("guns"),
            Wait(3), Sample("after-guns"),
        ], BeatFactory: AirborneInterceptCard,
            RequireRadioIds: ["pilot-guns"]),
        new("rapier-drone", "Rapier Attack — drone away + separating", 10, [
            Sample("spawn"),
            WaitUntilPhase("ATTACK", timeoutSeconds: 10),
            Sample("attack"),
            Act(AuditActionKind.ReleaseWeaponsHold),
            Act(AuditActionKind.TriggerPulse),
            WaitUntilRadio("pilot-drone-away", timeoutSeconds: 20),
            Sample("drone-away"),
            WaitUntilRadio("pilot-separating", timeoutSeconds: 30),
            Sample("separating"),
        ], BeatFactory: AirborneAttackCard,
            RequireRadioIds: ["pilot-drone-away", "pilot-separating"]),
        new("rapier-fox", "Rapier — Fox Two inside missile envelope", 10, [
            Sample("spawn"),
            Wait(0.5), Sample("armed"),
            Act(AuditActionKind.ReleaseWeaponsHold),
            Wait(0.25),
            Act(AuditActionKind.LaunchMissile),
            WaitUntilRadio("pilot-fox-two", timeoutSeconds: 20),
            Sample("fox"),
        ], BeatFactory: AirborneMissileCard,
            RequireRadioIds: ["pilot-fox-two"]),
        new("rapier-fuel", "Rapier — Joker then Bingo", 10, [
            Sample("spawn"),
            WaitUntilRadio("pilot-joker", timeoutSeconds: 120),
            Sample("joker"),
            WaitUntilRadio("pilot-bingo", timeoutSeconds: 180),
            Sample("bingo"),
            WaitUntilRadio("control-bingo-rtb", timeoutSeconds: 30),
            Sample("bingo-rtb"),
        ], BeatFactory: LowFuelInterceptCard,
            RequireRadioIds: ["pilot-joker", "pilot-bingo", "control-bingo-rtb"]),
        new("rapier-circuits", "Rapier circuits — ambient pattern through recovery", 11, [
            Sample("spawn"),
            Wait(30), Sample("t+30s"),
            Wait(30), Sample("t+60s"),
            Wait(60), Sample("t+120s"),
        ], RequireRadioIds: ["launch-cleared", "pilot-checklist-recovery-config"]),
        new("rapier-circuits-land", "Circuits — base 3 greens → clearance → Land", 11, [
            Sample("spawn"),
            WaitUntilRadio("pilot-base", timeoutSeconds: 240),
            Sample("base"),
            WaitUntilRadio("tower-cleared-arrested-landing", timeoutSeconds: 30),
            Sample("cleared"),
            WaitUntilRadio("pilot-land", timeoutSeconds: 30),
            Sample("land"),
        ], RequireRadioIds: [
            "pilot-base", "tower-cleared-arrested-landing", "pilot-land"]),
        new("rapier-waveoff-gear", "Circuits — gear unsafe on short final → waveoff", 11, [
            Sample("spawn"),
            WaitUntilLeg("SHORT_FINAL", timeoutSeconds: 240),
            Sample("short-final"),
            Act(AuditActionKind.CommandGearUp),
            Wait(0.5),
            Act(AuditActionKind.CommandGearUp),
            WaitUntilRadio("tower-waveoff-gear", timeoutSeconds: 20),
            Sample("waveoff"),
        ], RequireRadioIds: ["tower-waveoff-gear"]),
        new("rapier-bolter", "Circuits — firewall on short final → bolter", 11, [
            Sample("spawn"),
            WaitUntilLeg("SHORT_FINAL", timeoutSeconds: 240),
            Sample("short-final"),
            new(AuditActionKind.HoldKey, Key: GKey.ThrottleUp),
            WaitUntilRadio("tower-bolter", timeoutSeconds: 90),
            Sample("bolter"),
            new(AuditActionKind.ReleaseKey, Key: GKey.ThrottleUp),
        ], RequireRadioIds: ["tower-bolter"]),
        new("casevac-hide", "Medevac — ANCA panel hidden", 13, [
            Sample("spawn"),
            Wait(2), Sample("t+2s"),
        ]),
        new("carrier-recovery", "F-35C carrier approach — panel SA sample", 5, [
            Sample("spawn"),
            Wait(5), Sample("t+5s"),
            Wait(10), Sample("t+15s"),
        ]),
        new("rapier-go-fly", "Rapier go-fly — panel SA sample", 12, [
            Sample("spawn"),
            Wait(5), Sample("t+5s"),
            Wait(10), Sample("t+15s"),
        ]),
    ];

    public static bool TryFind(string id, out AuditScenario scenario) {
        foreach (AuditScenario candidate in All) {
            if (candidate.Id.Equals(id, StringComparison.OrdinalIgnoreCase)) {
                scenario = candidate;
                return true;
            }
        }
        scenario = default;
        return false;
    }

    static AuditAction Wait(double seconds) =>
        new(AuditActionKind.WaitSeconds, Seconds: seconds);

    static AuditAction Sample(string label) =>
        new(AuditActionKind.Sample, Label: label);

    static AuditAction Act(AuditActionKind kind, double seconds = 0) =>
        new(kind, Seconds: seconds);

    static AuditAction WaitUntilRadio(string id, double timeoutSeconds) =>
        new(AuditActionKind.WaitUntilRadioId, Match: id, TimeoutSeconds: timeoutSeconds);

    static AuditAction WaitUntilChecklist(string name, double timeoutSeconds) =>
        new(AuditActionKind.WaitUntilChecklistId, Match: name, TimeoutSeconds: timeoutSeconds);

    static AuditAction WaitUntilPhase(string phase, double timeoutSeconds) =>
        new(AuditActionKind.WaitUntilPhase, Match: phase, TimeoutSeconds: timeoutSeconds);

    static AuditAction WaitUntilLeg(string leg, double timeoutSeconds) =>
        new(AuditActionKind.WaitUntilLeg, Match: leg, TimeoutSeconds: timeoutSeconds);

    public static SimulationSession Open(AuditScenario scenario) {
        var session = new SimulationSession();
        if (scenario.BeatFactory is { } factory) {
            session.StartBeat(factory, KoreaWeatherPresets.ForBeat(scenario.BeatIndex));
        } else {
            session.StartBeat(
                scenario.BeatIndex,
                KoreaWeatherPresets.ForBeat(scenario.BeatIndex),
                Carrier.DeckConfiguration.Angled);
        }
        session.Begin();
        return session;
    }

    public static int Ticks(double seconds) =>
        Math.Max(1, (int)Math.Round(seconds * AircraftSim.TickHz));

    /// <summary>
    /// Airborne attach in the fight box: FL650 / M2.5 so ReachFight LevelDash or DirectJoin
    /// reaches Intercept without camping FL700. Contact ~85 km keeps Attack at bay while
    /// outscoring ZoomLob at this energy; MissionRadio init-commit covers airborne attach.
    /// </summary>
    static BeatSetup AirborneInterceptCard() {
        BeatSetup baseline = Beats.RapierIntercept();
        const double altitudeM = 65_000.0 * 0.3048;
        const double startNorthM = 300_000.0;
        // ~85 km: LevelDash beats ZoomLob at FL650/M2.5; still well outside 30 km Attack.
        const double contactRangeM = 85_000.0;
        double speedMps = 2.5 * StandardAtmosphere1976.Instance.Sample(altitudeM).SpeedOfSoundMps;
        return baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, altitudeM, startNorthM),
                Speed = speedMps,
                Gamma = 0.0,
                Chi = 0.0,
                Bank = 0.0,
            },
            Bandit = baseline.Bandit with {
                Position = new Vec3D(0.0, altitudeM, startNorthM + contactRangeM),
                Speed = 210.0,
                Gamma = 0.0,
                Chi = Math.PI,
                Bank = 0.0,
            },
            UsesReactiveBandit = false,
            StartsOnCatapult = false,
            Combat = baseline.CombatRules with { OpponentAmmo = 0 },
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 1,
                ShortRangeMissiles: 0,
                DogfightingDrones: 0,
                DeterministicSwarmWipe: false),
        };
    }

    /// <summary>Inside 30 km — Attack card for drone release.</summary>
    static BeatSetup AirborneAttackCard() {
        BeatSetup baseline = Beats.RapierIntercept();
        const double altitudeM = 12_000.0;
        const double startNorthM = 300_000.0;
        return baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, altitudeM, startNorthM),
                Speed = 350.0,
                Gamma = 0.0,
                Chi = 0.0,
                Bank = 0.0,
            },
            Bandit = baseline.Bandit with {
                Position = new Vec3D(0.0, altitudeM, startNorthM + 8_000.0),
                Speed = 210.0,
                Gamma = 0.0,
                Chi = Math.PI,
                Bank = 0.0,
            },
            UsesReactiveBandit = false,
            StartsOnCatapult = false,
            Combat = baseline.CombatRules with { OpponentAmmo = 0 },
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 4,
                DeterministicSwarmWipe: false),
        };
    }

    /// <summary>Missile envelope just outside Attack bubble? No — 12 km is Attack; Fox doesn't care.</summary>
    static BeatSetup AirborneMissileCard() {
        BeatSetup card = AirborneInterceptCard();
        const double altitudeM = 12_000.0;
        const double startNorthM = 300_000.0;
        const double missileRangeM = 12_000.0;
        return card with {
            Player = card.Player with {
                Position = new Vec3D(0.0, altitudeM, startNorthM),
                Speed = 350.0,
                Chi = 0.0,
            },
            Bandit = card.Bandit with {
                Position = new Vec3D(0.0, altitudeM, startNorthM + missileRangeM),
                Speed = 210.0,
                Chi = Math.PI,
            },
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 1,
                ShortRangeMissiles: 1,
                DogfightingDrones: 0,
                MissileMinimumRangeM: 600.0,
                MissileMaximumRangeM: 15_000.0),
        };
    }

    /// <summary>Airborne intercept starting just above Joker so fuel calls rise quickly.</summary>
    static BeatSetup LowFuelInterceptCard() {
        BeatSetup card = AirborneInterceptCard();
        return card with {
            Fuel = card.FuelLoadout with {
                InitialFuelLb = 1_230.0,
                JokerThresholdLb = 1_200.0,
                BingoThresholdLb = 1_000.0,
            },
        };
    }

    /// <summary>On short final with gear still up — tower waveoff.</summary>
    static BeatSetup CircuitsUnsafeFinalCard() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = (Carrier)baseline.Carrier!;
        Vec3D shortFinal = strip.LandingPoint(along: -900.0, cross: 0.0, height: 120.0);
        return baseline with {
            Player = baseline.Player with {
                Position = shortFinal,
                Speed = 95.0,
                Gamma = -3.5 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0,
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };
    }

    /// <summary>
    /// Hot / high short final so the hook misses — tower bolter. Speed above typical trap
    /// energy so capture fails while still in the wire box.
    /// </summary>
    static BeatSetup CircuitsBolterCard() {
        BeatSetup baseline = Beats.RapierCircuits();
        Carrier strip = (Carrier)baseline.Carrier!;
        Vec3D shortFinal = strip.LandingPoint(along: -600.0, cross: 0.0, height: 90.0);
        return baseline with {
            Player = baseline.Player with {
                Position = shortFinal,
                Speed = 140.0,
                Gamma = -2.0 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0,
            },
            StartsOnCatapult = false,
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 6_000.0 },
        };
    }
}
