using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// Complete policy input at one combat decision boundary. Ownship state is legitimate
/// proprioception; the opponent remains a belief-limited <see cref="ActorObservation"/> so a
/// trainer cannot accidentally learn from target mass, body attitude, body rates, or damage truth.
/// </summary>
public readonly record struct CombatPolicyObservation(
    long Tick,
    double ElapsedSeconds,
    AircraftState Ownship,
    ActorObservation Contact,
    int OwnshipAmmoRemaining,
    bool WeaponsAuthorized) {

    public double RangeM => (Contact.Position - Ownship.Position).Length;

    /// <summary>Positive while the observed contact and ownship are closing.</summary>
    public double ClosingSpeedMps {
        get {
            Vec3D line = Contact.Position - Ownship.Position;
            double range = line.Length;
            if (!double.IsFinite(range) || range < 1e-9) return 0.0;
            Vec3D relativeVelocity = Contact.VelocityVector() - Ownship.VelocityVector();
            return -relativeVelocity.Dot(line * (1.0 / range));
        }
    }

    public double GunNoseErrorRad => BanditFireControl.NoseErrorRad(Ownship, Contact);

    public bool IsFinite => Tick >= 0
        && double.IsFinite(ElapsedSeconds) && ElapsedSeconds >= 0.0
        && Ownship.Position.IsFinite
        && double.IsFinite(Ownship.Speed) && Ownship.Speed >= 0.0
        && double.IsFinite(Ownship.Gamma)
        && double.IsFinite(Ownship.Chi)
        && double.IsFinite(Ownship.Bank)
        && double.IsFinite(Ownship.Mass) && Ownship.Mass > 0.0
        && Ownship.BodyAttitude.IsFinite
        && Ownship.BodyRates.IsFinite
        && Contact.IsFinite
        && OwnshipAmmoRemaining >= 0;

    public static CombatPolicyObservation Capture(long tick, double elapsedSeconds,
        in AircraftState ownship, in ActorObservation contact,
        int ownshipAmmoRemaining, bool weaponsAuthorized) {
        var observation = new CombatPolicyObservation(
            tick, elapsedSeconds, ownship, contact,
            ownshipAmmoRemaining, weaponsAuthorized);
        if (!observation.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(ownship),
                "A combat policy observation must contain finite, physically valid values.");
        return observation;
    }
}

/// <summary>
/// Library-neutral action applied during one combat transition. Maneuver selection is distinct
/// from maneuver application because high-skill policies deliberately hold a previously selected
/// command between lookahead decisions. Fire intent is likewise split into evaluation, policy
/// consumption, and physical authorization so a trainer never treats an inhibited trigger as a
/// shot or attributes a post-maneuver command to a pre-maneuver fire decision.
/// </summary>
public readonly record struct CombatAction(
    double GDemand,
    double BankTargetRad,
    double Throttle,
    double Rudder,
    bool ManeuverSelected,
    bool ManeuverApplied,
    bool FireIntentEvaluated,
    bool FireIntentConsumed,
    bool FireAuthorized) {

    public bool IsFinite => double.IsFinite(GDemand)
        && double.IsFinite(BankTargetRad)
        && double.IsFinite(Throttle)
        && double.IsFinite(Rudder)
        && (!ManeuverSelected || ManeuverApplied)
        && (!FireIntentConsumed || FireIntentEvaluated)
        && (!FireAuthorized || FireIntentConsumed);

    public PilotCommand ToPilotCommand() => new(
        GDemand, BankTargetRad, Throttle, Rudder);

    public static CombatAction Capture(in PilotCommand command,
        bool maneuverSelected,
        bool maneuverApplied,
        bool fireIntentEvaluated,
        bool fireIntentConsumed,
        bool fireAuthorized) {
        var action = new CombatAction(
            command.GDemand,
            command.BankTarget,
            command.Throttle,
            command.Rudder,
            maneuverSelected,
            maneuverApplied,
            fireIntentEvaluated,
            fireIntentConsumed,
            fireAuthorized);
        if (!action.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(command),
                "A combat action must be finite and have a consistent decision lifecycle.");
        return action;
    }
}

/// <summary>
/// Raw, replayable reward facts from the learning fighter's perspective. Keeping these components
/// beside the scalar reward lets an external trainer rescore a frozen dataset without re-running
/// physics or trusting an undocumented shaping constant.
/// </summary>
public readonly record struct CombatRewardComponents(
    double ElapsedSeconds,
    double GeometryPotentialDelta,
    double FiringEnvelopeSeconds,
    int RoundsFired,
    int HitsScored,
    int HitsReceived,
    bool OpponentDestroyed,
    bool OwnshipDestroyed) {

    public bool IsFinite => double.IsFinite(ElapsedSeconds) && ElapsedSeconds >= 0.0
        && double.IsFinite(GeometryPotentialDelta)
        && double.IsFinite(FiringEnvelopeSeconds) && FiringEnvelopeSeconds >= 0.0
        && RoundsFired >= 0
        && HitsScored >= 0
        && HitsReceived >= 0;
}

/// <summary>Version-one scalarization of <see cref="CombatRewardComponents"/>.</summary>
public sealed record CombatRewardWeights(
    double OpponentDestroyedReward = 100.0,
    double OwnshipDestroyedPenalty = -100.0,
    double HitScoredReward = 15.0,
    double HitReceivedPenalty = -15.0,
    double FiringEnvelopeRewardPerSecond = 1.0,
    double GeometryPotentialScale = 0.25,
    double RoundFiredPenalty = -0.01,
    double TimePenaltyPerSecond = -0.002) {

    public static CombatRewardWeights Default { get; } = new();

    public bool IsFinite => double.IsFinite(OpponentDestroyedReward)
        && double.IsFinite(OwnshipDestroyedPenalty)
        && double.IsFinite(HitScoredReward)
        && double.IsFinite(HitReceivedPenalty)
        && double.IsFinite(FiringEnvelopeRewardPerSecond)
        && double.IsFinite(GeometryPotentialScale)
        && double.IsFinite(RoundFiredPenalty)
        && double.IsFinite(TimePenaltyPerSecond);
}

public static class CombatRewardModel {
    /// <summary>
    /// Reward-eligible gun geometry. The physical cone alone is insufficient: an empty, inhibited,
    /// or terminal gun cannot accrue authorized firing-envelope time.
    /// </summary>
    public static bool InAuthorizedFiringEnvelope(
        in CombatPolicyObservation observation) =>
        observation.WeaponsAuthorized
        && BanditFireControl.InFiringEnvelope(
            observation.Ownship, observation.Contact);

    /// <summary>
    /// Smooth bounded geometry potential. Potential differences provide aim/range learning signal
    /// without awarding a fabricated hit or kill.
    /// </summary>
    public static double GeometryPotential(in CombatPolicyObservation observation) {
        double alignment = System.Math.Cos(observation.GunNoseErrorRad);
        double range = observation.RangeM;
        double distanceFromEnvelope = range < BanditFireControl.MinimumRangeM
            ? BanditFireControl.MinimumRangeM - range
            : range > BanditFireControl.MaximumRangeM
                ? range - BanditFireControl.MaximumRangeM
                : 0.0;
        double rangeQuality = 1.0 - System.Math.Clamp(
            distanceFromEnvelope / BanditFireControl.MaximumRangeM, 0.0, 2.0);
        return alignment + rangeQuality;
    }

    public static double Score(in CombatRewardComponents components,
        CombatRewardWeights? weights = null) {
        if (!components.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(components));
        CombatRewardWeights selected = weights ?? CombatRewardWeights.Default;
        if (!selected.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(weights));

        return components.GeometryPotentialDelta * selected.GeometryPotentialScale
            + components.FiringEnvelopeSeconds * selected.FiringEnvelopeRewardPerSecond
            + components.RoundsFired * selected.RoundFiredPenalty
            + components.HitsScored * selected.HitScoredReward
            + components.HitsReceived * selected.HitReceivedPenalty
            + (components.OpponentDestroyed ? selected.OpponentDestroyedReward : 0.0)
            + (components.OwnshipDestroyed ? selected.OwnshipDestroyedPenalty : 0.0)
            + components.ElapsedSeconds * selected.TimePenaltyPerSecond;
    }
}

public enum CombatTerminalReason {
    None,
    OpponentDestroyed,
    OwnshipDestroyed,
    MutualDestruction,
    TimeLimit
}

/// <summary>One immutable (observation, action, reward, next observation, terminal) tuple.</summary>
public readonly record struct CombatTransition(
    long DecisionIndex,
    CombatPolicyObservation Observation,
    CombatAction Action,
    double Reward,
    CombatRewardComponents RewardComponents,
    CombatPolicyObservation NextObservation,
    bool Terminal,
    CombatTerminalReason TerminalReason);

/// <summary>One frozen, terminal, deterministic combat episode.</summary>
public sealed record CombatEpisode(
    int EpisodeIndex,
    string ScenarioId,
    ulong Seed,
    CombatTerminalReason TerminalReason,
    IReadOnlyList<CombatTransition> Transitions) {

    public double TotalReward => Transitions.Sum(transition => transition.Reward);
    public int RoundsFired => Transitions.Sum(
        transition => transition.RewardComponents.RoundsFired);
    public int HitsScored => Transitions.Sum(
        transition => transition.RewardComponents.HitsScored);
    public int HitsReceived => Transitions.Sum(
        transition => transition.RewardComponents.HitsReceived);
}
