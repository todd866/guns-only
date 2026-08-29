using System.Collections.Generic;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>What a policy decides on one tick: how to fly, and whether to shoot.</summary>
/// <remarks>
/// Fire INTENT, not authorization. The runner still applies the production ammunition, first-pass
/// and target-alive gates on top, exactly as it does for the hand-written behaviour policy, so a
/// learned policy cannot acquire weapons freedom the opponent it replaces does not have.
/// </remarks>
public readonly record struct CombatPolicyDecision(PilotCommand Command, bool WantsToFire) {
    public bool IsFinite =>
        double.IsFinite(Command.GDemand)
        && double.IsFinite(Command.BankTarget)
        && double.IsFinite(Command.Throttle)
        && double.IsFinite(Command.Rudder);
}

/// <summary>
/// The learning fighter's controller. <see cref="SeededCombatBatchRunner"/> owns the scenario,
/// physics, weapon, reward, recorder and dataset contracts; this is the one seam through which a
/// different controller — a learned policy, a scripted probe, an evaluation baseline — replaces the
/// hand-written <see cref="ReactiveBandit"/> tier without touching any of them.
/// </summary>
public interface ICombatLearningPolicy {
    CombatPolicyDecision Decide(in CombatPolicyObservation observation);
}

/// <summary>
/// The learning fighter as the runner drives it. <see cref="ReactiveBandit"/> already has this
/// shape, so the default path keeps flying the same object it always did and cannot drift from the
/// behaviour data recorded before this seam existed.
/// </summary>
public interface ICombatLearningActor {
    AircraftState State { get; }
    double ThrustFraction { get; }
    bool WantsToFire(in ActorObservation contact);
    void Step(in ActorObservation contact, double dt);
}

/// <summary>
/// Flies an <see cref="ICombatLearningPolicy"/> on an ordinary <see cref="AircraftSim"/>. The
/// policy supplies pilot controls only — no kinematic shortcut, wall clock or random source enters
/// the kernel — so a learned fighter is bound by the same aerodynamics and structural limits as the
/// opponent it is replacing.
/// </summary>
public sealed class CombatPolicyActor : ICombatLearningActor {
    readonly AircraftSim _sim;
    readonly ICombatLearningPolicy _policy;
    readonly int _ammo;
    bool _wantsToFire;

    public CombatPolicyActor(in AircraftState start, AircraftParams air,
        ICombatLearningPolicy policy, int ammo) {
        _sim = new AircraftSim(start, air);
        _policy = policy ?? throw new System.ArgumentNullException(nameof(policy));
        _ammo = ammo;
    }

    public AircraftState State => _sim.State;
    public double ThrustFraction => _sim.ThrustFraction;

    /// The runner asks for fire intent before it steps flight, so the decision taken here is the
    /// one both answers come from — a policy cannot see a different world for shooting than for
    /// flying.
    public bool WantsToFire(in ActorObservation contact) => _wantsToFire;

    public void Decide(in CombatPolicyObservation observation) {
        CombatPolicyDecision decision = _policy.Decide(observation);
        if (!decision.IsFinite)
            throw new System.InvalidOperationException(
                "A learning policy returned a non-finite command; the kernel will not fly it.");
        LastCommand = decision.Command;
        _wantsToFire = decision.WantsToFire;
    }

    public PilotCommand LastCommand { get; private set; } = new(1.0, 0.0, 0.85, 0.0);

    public void Step(in ActorObservation contact, double dt) => _sim.Step(LastCommand, dt);

    public int Ammo => _ammo;
}

/// <summary>Adapts the hand-written opponent to the actor seam. Identity, by construction.</summary>
public sealed class ReactiveBanditActor : ICombatLearningActor {
    readonly ReactiveBandit _bandit;
    public ReactiveBanditActor(ReactiveBandit bandit) => _bandit = bandit;
    public ReactiveBandit Bandit => _bandit;
    public AircraftState State => _bandit.State;
    public double ThrustFraction => _bandit.ThrustFraction;
    public bool WantsToFire(in ActorObservation contact) => _bandit.WantsToFire(contact);
    public void Step(in ActorObservation contact, double dt) => _bandit.Step(contact, dt);
}

/// <summary>A staged real engagement: the geometry, and the pilot's own inputs through it.</summary>
public readonly record struct OwnerEngagement(
    CombatTrainingScenario Scenario, IReadOnlyList<TimedPilotCommand> OwnerInputs);

/// <summary>One recorded stick-and-throttle sample, at its offset from the engagement entry.</summary>
public readonly record struct TimedPilotCommand(
    double TimeSeconds, PilotCommand Command, bool Firing);

/// <summary>
/// Replays a pilot's ACTUAL recorded inputs, so an engagement can be graded against the human who
/// flew it rather than against a scripted stand-in.
/// </summary>
/// <remarks>
/// OPEN LOOP, AND THAT IS THE WHOLE CAVEAT. These are the controls the pilot used against the
/// opponent he actually met. The moment the opponent under test does something the tape did not
/// contain, the replay is flying a fight that is no longer happening — faithful at the merge and
/// decreasingly so afterwards. It is a strictly better defender than a script for the opening
/// geometry and it is not the pilot. Treat a long replay as evidence about the first seconds.
/// </remarks>
public sealed class RecordedInputPolicy : ICombatLearningPolicy {
    readonly IReadOnlyList<TimedPilotCommand> _inputs;
    int _cursor;

    public RecordedInputPolicy(IReadOnlyList<TimedPilotCommand> inputs) {
        if (inputs is null || inputs.Count == 0)
            throw new System.ArgumentException("A replay needs at least one recorded command.",
                nameof(inputs));
        _inputs = inputs;
    }

    /// <summary>Seconds of recorded input available; beyond this the last command is held.</summary>
    public double SpanSeconds => _inputs[^1].TimeSeconds;

    public CombatPolicyDecision Decide(in CombatPolicyObservation observation) {
        // The runner steps monotonically, so a cursor walk is enough and keeps replay O(1)/tick.
        while (_cursor + 1 < _inputs.Count
            && _inputs[_cursor + 1].TimeSeconds <= observation.ElapsedSeconds)
            _cursor++;
        TimedPilotCommand sample = _inputs[_cursor];
        return new CombatPolicyDecision(sample.Command, sample.Firing);
    }
}
