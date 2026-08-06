namespace GunsOnly.Sim;

/// <summary>
/// Observable truth about whether the human has COMMITTED the lateral axis, and whether that
/// commitment has just reversed. Every machine contribution to roll reads this; nothing else needs
/// to re-derive "is the pilot flying a reversal right now" from geometry.
/// </summary>
/// <param name="Committed">The pilot is holding a deliberate lateral input.</param>
/// <param name="CommittedSign">+1 right, -1 left, 0 when not committed.</param>
/// <param name="Reversing">Inside the lockout that follows a commanded direction reversal.</param>
/// <param name="Authority01">
/// The fraction of its normal authority a roll-axis assist may use. Zero through a reversal, then
/// blended back so re-acquisition is bumpless.
/// </param>
public readonly record struct PilotLateralCommitmentState(
    bool Committed,
    double CommittedSign,
    bool Reversing,
    double SecondsSinceReversal,
    double Authority01) {
    public static PilotLateralCommitmentState Neutral { get; } =
        new(false, 0.0, false, double.PositiveInfinity, 1.0);

    /// <summary>
    /// Scale a proposed roll-axis contribution by this state: zero through a reversal, and never
    /// opposing a lateral input the pilot is actively holding. An assist may help the pilot's own
    /// roll along; it may never push back against it.
    /// </summary>
    public double Gate(double rollContribution) {
        if (!double.IsFinite(rollContribution)) return 0.0;
        double gated = rollContribution * Authority01;
        if (CommittedSign != 0.0
            && System.Math.Sign(gated) == -System.Math.Sign(CommittedSign))
            return 0.0;
        return gated;
    }
}

/// <summary>
/// Detects deliberate, sustained pilot lateral input and — the point of the class — the moment that
/// input REVERSES direction.
///
/// Owner, 2026-08-06, flying Build 264: "the steering assist for f-22 is still way too annoying, eg
/// it tries to turn early on reversals." Both roll-axis assists gated purely on instantaneous
/// geometry: a reversal sweeps the target across the canopy, so the geometric predicate is
/// transiently satisfied mid-sweep and the law grabs the ailerons for the plane the pilot is in the
/// act of LEAVING. A reversal is precisely when the pilot is changing their mind; nothing automatic
/// belongs on that axis until they have finished.
///
/// The rule is intent, not geometry: hold an input long enough to mean it and the axis is yours;
/// flip that input and the machine is off the axis entirely until the new attitude settles.
/// </summary>
public sealed class PilotLateralCommitment {
    /// <summary>Input magnitude that counts as deliberate rather than trim noise.</summary>
    public const double CommitControl = 0.15;
    /// <summary>Hysteresis: commitment survives down to here before it is considered released.</summary>
    public const double ReleaseControl = 0.06;
    /// <summary>How long the input must be held before it counts as commitment.</summary>
    public const double CommitSeconds = 0.10;
    /// <summary>
    /// How long the roll axis stays entirely the pilot's after a commanded direction reversal.
    /// Sized to a real reversal: an F-22 rolling through ~120 deg at combat rates takes about a
    /// second, and the assist must not re-enter until that roll has stopped.
    /// </summary>
    public const double ReversalLockoutSeconds = 1.20;
    /// <summary>Bumpless re-entry after the lockout expires.</summary>
    public const double ReversalBlendSeconds = 0.40;
    /// <summary>
    /// How long a released commitment is remembered. Beyond this the next input is a fresh
    /// commitment rather than a reversal of the previous one, so a lazy S-turn a minute later does
    /// not read as a reversal.
    /// </summary>
    public const double CommitmentMemorySeconds = 3.0;

    double _candidateSign;
    double _candidateSeconds;
    double _committedSign;
    double _secondsSinceCommitment = double.PositiveInfinity;
    double _secondsSinceReversal = double.PositiveInfinity;

    public PilotLateralCommitmentState State { get; private set; } =
        PilotLateralCommitmentState.Neutral;

    public void Reset() {
        _candidateSign = 0.0;
        _candidateSeconds = 0.0;
        _committedSign = 0.0;
        _secondsSinceCommitment = double.PositiveInfinity;
        _secondsSinceReversal = double.PositiveInfinity;
        State = PilotLateralCommitmentState.Neutral;
    }

    public PilotLateralCommitmentState Step(double rawPilotRollControl, double deltaSeconds) {
        double dt = System.Math.Clamp(
            double.IsFinite(deltaSeconds) ? deltaSeconds : 0.0, 0.0, 0.05);
        double control = double.IsFinite(rawPilotRollControl)
            ? System.Math.Clamp(rawPilotRollControl, -1.0, 1.0) : 0.0;
        double magnitude = System.Math.Abs(control);
        double sign = System.Math.Sign(control);

        _secondsSinceCommitment += dt;
        _secondsSinceReversal += dt;

        if (magnitude >= CommitControl && sign != 0.0) {
            // A deliberate input that CONTRADICTS a recent commitment is a reversal the instant it
            // appears: there is nothing ambiguous about it, and waiting out a dwell would leave the
            // machine on the axis for exactly the tenth of a second the pilot is changing their
            // mind. The dwell exists only to establish a first commitment out of noise.
            bool contradictsRecentCommitment = _committedSign != 0.0
                && sign != _committedSign
                && _secondsSinceCommitment <= CommitmentMemorySeconds;
            if (contradictsRecentCommitment) {
                _secondsSinceReversal = 0.0;
                _candidateSign = sign;
                _candidateSeconds = CommitSeconds;
                _committedSign = sign;
                _secondsSinceCommitment = 0.0;
            } else {
                if (sign == _candidateSign) _candidateSeconds += dt;
                else {
                    _candidateSign = sign;
                    _candidateSeconds = dt;
                }
                if (_candidateSeconds + 1e-12 >= CommitSeconds) {
                    _committedSign = sign;
                    _secondsSinceCommitment = 0.0;
                }
            }
        } else if (magnitude < ReleaseControl) {
            _candidateSign = 0.0;
            _candidateSeconds = 0.0;
        }

        bool committed = _committedSign != 0.0
            && magnitude >= ReleaseControl
            && System.Math.Sign(control) == _committedSign;
        bool reversing = _secondsSinceReversal < ReversalLockoutSeconds;
        double authority = reversing
            ? 0.0
            : Smoothstep01((_secondsSinceReversal - ReversalLockoutSeconds)
                / ReversalBlendSeconds);

        State = new PilotLateralCommitmentState(
            Committed: committed,
            CommittedSign: committed ? _committedSign : 0.0,
            Reversing: reversing,
            SecondsSinceReversal: _secondsSinceReversal,
            Authority01: authority);
        return State;
    }

    static double Smoothstep01(double value) {
        if (!double.IsFinite(value)) return 1.0;
        double x = System.Math.Clamp(value, 0.0, 1.0);
        return x * x * (3.0 - 2.0 * x);
    }
}
