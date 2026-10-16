namespace GunsOnly.Sim.Doctrine;

/// Authored exercise pacing, not aircraft performance data. The first two engagements retain
/// their existing BFM lessons. Beyond that the same director spends earned success on numbers,
/// then pilot tier, mount and occasional ceiling demonstrations. No mid-fight counter-picking.
public readonly record struct SortieWave(int Number, SpawnSpec Spawn, double DelaySeconds,
    double BearingOffsetRad, double RangeM, double ScoreMultiplier);

public sealed partial class FightDirector {
    // Stateless keyed draws: retrying a preview or choosing RTB cannot consume the wave stream.
    internal static uint WaveDraw(int seed, int wave, uint lane) {
        uint n = unchecked((uint)seed ^ (uint)wave * 0x9e3779b9u ^ lane * 0x85ebca6bu);
        n = unchecked((n ^ (n >> 16)) * 0x7feb352du);
        n = unchecked((n ^ (n >> 15)) * 0x846ca68bu);
        return n ^ (n >> 16);
    }

    public static bool RtbBounceForSeed(int seed) => WaveDraw(seed, 0, 9) % 100 < 35;

    public SortieWave NextWave(int waveNumber, int seed) {
        if (waveNumber < 3) throw new ArgumentOutOfRangeException(nameof(waveNumber));
        uint draw = WaveDraw(seed, waveNumber, 1);
        PilotSkill skill = waveNumber == 3 ? PilotSkill.Veteran : PilotSkill.Ace;
        bool boss = waveNumber >= 7 && draw % 4 == 0;
        var spawn = new SpawnSpec(skill,
            (int)(draw % (uint)BanditSkillProfile.For(skill).DoctrineCount), boss,
            $"wave {waveNumber}: committed formation",
            Mount: waveNumber >= 4 ? BanditMount.Uprated : BanditMount.Baseline,
            FormationSize: waveNumber == 3 ? 2 : waveNumber == 4 ? 3 : 4,
            Committed: true,
            WingSkill: waveNumber == 4 ? PilotSkill.Veteran : skill,
            WingMount: waveNumber >= 6 ? BanditMount.Uprated : BanditMount.Baseline);
        // A short warning/turn interval precedes a physical 6–8 km ingress. Contact time
        // depends on the player's turn and closure; validate it from the lab tapes.
        double delay = 18 + WaveDraw(seed, waveNumber, 2) % 7;
        double bearing = (45 + WaveDraw(seed, waveNumber, 3) % 91) * Math.PI / 180;
        if ((draw & 1) != 0) bearing = -bearing;
        return new(waveNumber, spawn, delay, bearing,
            6000 + WaveDraw(seed, waveNumber, 4) % 2001, 1 + .5 * (waveNumber - 2));
    }
}
