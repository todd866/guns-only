using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// A model of how THIS pilot actually flies the opening merge, extracted from production tapes
/// (Builds 104 and 106, engagement 1, from 3 km closure). The pilot's own description: "I pretty
/// much always make the same first turn, it's not that hard to model." The tapes agree — the
/// profile is near-identical across sorties:
///
///   run-in          wings near level (~25-29 deg bank), 1 G, throttle pulled BACK to 0.0-0.46
///                   (they are deliberately slowing toward corner, not arriving fast)
///   ~600 m          roll to 55-75 deg, command 9 G
///   through merge   85-90 deg bank, 9-12 G, minimum range ~100 m
///   egress          hold ~90 deg at 9-10 G, throttle to afterburner
///
/// This exists because every AI-vs-AI harness in the repo is DEGENERATE for merge questions: both
/// sides fly the same lookahead, reach nose-on within a tick of each other, and every merge draws
/// (AiThreatTests documents this in its own header). A scripted human breaks that symmetry, so a
/// staging or airframe change can finally be judged against the fight that is actually happening
/// rather than against a mirror.
///
/// It is a MODEL, not the pilot: it does not adapt, and beating it is not proof of anything beyond
/// beating this profile.
/// </summary>
public sealed class ScriptedMergePlayer {
    /// Range at which the break turn is committed, from the tapes.
    public const double BreakRangeM = 700.0;
    public const double BreakBankRad = 88.0 * System.Math.PI / 180.0;
    public const double BreakG = 9.0;
    /// Power setting held on the run-in: the pilot arrives slow on purpose.
    public const double RunInThrottle = 0.25;
    public const double EgressThrottle = 1.0;

    readonly AircraftSim _sim;
    bool _committed;
    double _breakSign;

    public ScriptedMergePlayer(in AircraftState start, AircraftParams parameters) {
        _sim = new AircraftSim(start, parameters);
        _sim.SeedEnginePowerFraction(RunInThrottle);
    }

    public AircraftState State => _sim.State;
    public bool Committed => _committed;
    public PilotCommand LastCommand { get; private set; }

    public void Step(in AircraftState bandit, double dt) {
        var toBandit = bandit.Position - State.Position;
        double rangeM = toBandit.Length;

        if (!_committed && rangeM <= BreakRangeM) {
            _committed = true;
            // Break INTO the bandit: sign chosen from which side it is passing, exactly as a pilot
            // picks the turn direction off the merge rather than from a coin flip.
            // Right-hand direction in the horizontal plane, from heading alone — the same basis
            // SpawnForMerge uses to offset a merge.
            var right = new Vec3D(
                System.Math.Cos(State.Chi), 0.0, -System.Math.Sin(State.Chi));
            double lateral = toBandit.Dot(right);
            _breakSign = lateral >= 0.0 ? 1.0 : -1.0;
        }

        LastCommand = _committed
            ? new PilotCommand(BreakG, _breakSign * BreakBankRad, EgressThrottle, 0.0)
            // Run-in: wings level, unloaded, power back to settle toward corner.
            : new PilotCommand(1.0, 0.0, RunInThrottle, 0.0);
        _sim.Step(LastCommand, dt);
    }
}
