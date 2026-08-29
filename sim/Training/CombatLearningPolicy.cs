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
