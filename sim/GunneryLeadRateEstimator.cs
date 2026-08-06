namespace GunsOnly.Sim;

/// <summary>
/// Estimates the INERTIAL pitch rate of the ballistic lead line — the rate the nose has to already
/// be turning just to stay on the solution while both aircraft manoeuvre.
///
/// Why this exists (Build 264 owner verdict: the assist "doesn't assist that much on actually
/// getting guns kills"): <see cref="GunneryPitchAssist"/> asked for a pitch rate proportional to
/// the aim error alone, i.e. it referenced a STATIONARY target line. In a tracking turn the pilot's
/// own body pitch rate is already several times that request, so the residual
/// (requested - measured) went negative and the correction clamped to zero. The aid therefore did
/// nothing in exactly the window where a couple of degrees decide the kill, and only ever helped a
/// near-hands-off pilot. Re-basing the reference on the lead line's own rate makes the residual the
/// honest aiming error again — which is what a good pilot's hands are solving for.
///
/// The estimate is the body-frame rate of change of the lead's elevation, plus the measured body
/// pitch rate that the body frame itself is turning at. Filtered, clamped, and fail-closed to zero:
/// with no valid history the law behaves exactly as it did before.
/// </summary>
public sealed class GunneryLeadRateEstimator {
    public const double FilterSeconds = 0.20;
    /// <summary>
    /// Ceiling on the re-based reference. Above this the line is sweeping faster than any tracking
    /// solution is worth (a merge, a snapshot) and the aid must not chase it.
    /// </summary>
    public const double MaximumRateRadPerSecond = 0.60;
    /// <summary>A jump larger than this is a new target or a re-solve, not a rate.</summary>
    const double DiscontinuityRad = 0.35;

    bool _hasPrevious;
    double _previousPitchErrorRad;
    double _estimateRadPerSecond;

    public double EstimateRadPerSecond => _estimateRadPerSecond;
    public bool Valid => _hasPrevious;

    public void Reset() {
        _hasPrevious = false;
        _previousPitchErrorRad = 0.0;
        _estimateRadPerSecond = 0.0;
    }

    /// <summary>
    /// Advance the estimate and return the usable feed-forward rate. Returns zero on the first
    /// sample and after any discontinuity, so the caller degrades to the pure error law.
    /// </summary>
    public double Update(double pitchErrorRad, double measuredPitchRateRadPerSecond,
        double deltaSeconds) {
        double dt = System.Math.Clamp(
            double.IsFinite(deltaSeconds) ? deltaSeconds : 0.0, 0.0, 0.05);
        if (dt <= 0.0 || !double.IsFinite(pitchErrorRad)
            || !double.IsFinite(measuredPitchRateRadPerSecond)) {
            Reset();
            return 0.0;
        }

        double delta = pitchErrorRad - _previousPitchErrorRad;
        if (!_hasPrevious || System.Math.Abs(delta) > DiscontinuityRad) {
            _hasPrevious = true;
            _previousPitchErrorRad = pitchErrorRad;
            _estimateRadPerSecond = 0.0;
            return 0.0;
        }

        double raw = System.Math.Clamp(
            delta / dt + measuredPitchRateRadPerSecond,
            -MaximumRateRadPerSecond, MaximumRateRadPerSecond);
        double blend = 1.0 - System.Math.Exp(-dt / FilterSeconds);
        _estimateRadPerSecond += (raw - _estimateRadPerSecond) * blend;
        _previousPitchErrorRad = pitchErrorRad;
        return _estimateRadPerSecond;
    }
}
