namespace GunsOnly.Sim.Okanagan;

/// <summary>
/// Retain a keyboard press which began and ended between authority advances. Durations are
/// consumed on fixed ticks, never stretched to the host's render-frame duration.
/// </summary>
public sealed class FireBossControlTapBuffer
{
    readonly int[] _remainingTicks = new int[3];
    readonly double[] _directions = new double[3];
    readonly long[] _appliedTicks = new long[3];

    public long PitchTicks => _appliedTicks[0];
    public long RollTicks => _appliedTicks[1];
    public long YawTicks => _appliedTicks[2];

    public void Queue(int axis, double direction, double durationSeconds)
    {
        if (axis < 0 || axis > 2) throw new ArgumentOutOfRangeException(nameof(axis));
        if (!double.IsFinite(direction) || Math.Abs(direction) != 1.0)
            throw new ArgumentOutOfRangeException(nameof(direction));
        if (!double.IsFinite(durationSeconds) || durationSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(durationSeconds));
        int ticks = (int)Math.Ceiling(Math.Clamp(durationSeconds,
            2 * FireBossDynamics.FixedDeltaSeconds, 0.1) / FireBossDynamics.FixedDeltaSeconds - 1e-9);
        // One bounded pending impulse per axis: a burst cannot build a delayed control backlog.
        if (_remainingTicks[axis] > 0 && _directions[axis] != direction)
        {
            _remainingTicks[axis] = 0;
            return;
        }
        _directions[axis] = direction;
        _remainingTicks[axis] = Math.Max(_remainingTicks[axis], ticks);
    }

    public FireBossPilotCommand Apply(in FireBossPilotCommand held) => held with {
        Pitch = ApplyAxis(0, held.Pitch),
        Roll = ApplyAxis(1, held.Roll),
        Yaw = ApplyAxis(2, held.Yaw),
    };

    double ApplyAxis(int axis, double held)
    {
        if (Math.Abs(held) > 1e-6)
        {
            _remainingTicks[axis] = 0;
            return held;
        }
        if (_remainingTicks[axis] == 0) return held;
        _remainingTicks[axis]--;
        _appliedTicks[axis]++;
        return _directions[axis];
    }

    public void Clear() => Array.Clear(_remainingTicks);

    public void Reset()
    {
        Clear();
        Array.Clear(_appliedTicks);
    }
}
