using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// THE BANDIT, FLOWN AGAINST REAL PEOPLE.
///
/// Everything else in this suite drives the AI with a synthetic player, and those were wrong in a
/// way that mattered: a scripted chaser holding altitude at full afterburner outruns a Flanker
/// whatever the AI decides, so the test graded the probe instead of the opponent. This replays
/// twelve REAL flight paths pulled from production telemetry — sorties that stall, that zoom to
/// 79,000 ft, that lose the bandit entirely and wander off to RTB.
///
/// The corpus those tracks were drawn from is the reason this file exists. Across 37 recorded
/// post-merge sorties: 49% opened past 3 NM, 22% past 7 NM, and 29% climbed above 19,550 ft — the
/// altitude that arms the anti-camp ceiling guard. The reported "he ran away to 7 NM" was never an
/// outlier; it was roughly one fight in five.
///
/// WHAT THESE TESTS MAY ASSERT. A recorded human flew against the bandit of the day, so pushing
/// that path through a changed bandit is a counterfactual — the human would have flown differently.
/// The tracks are therefore a realistic STRESS CORPUS, not an outcome oracle. Assert on what the
/// bandit does (containment, control health, whether it keeps its nose on the player); never on
/// kills, range histories, or anything that needs the human to react.
public class RealPlayerTrackTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double MergeAltitudeM = 3048.0;
    static readonly AircraftParams BanditAir = FlightModel.Su27SPublicDataSurrogate;
    static readonly AircraftParams PlayerAir = FlightModel.F22APublicDataSurrogate;

    sealed record Track(string Label, double[][] Samples, double SampleHz);

    static IReadOnlyList<Track> LoadTracks() {
        string path = Path.Combine(AppContext.BaseDirectory, "fixtures", "real-player-tracks.json");
        using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        double hz = root.GetProperty("sample_hz").GetDouble();
        var tracks = new List<Track>();
        foreach (var t in root.GetProperty("tracks").EnumerateArray()) {
            var samples = t.GetProperty("track").EnumerateArray()
                .Select(s => s.EnumerateArray().Select(v => v.GetDouble()).ToArray())
                .Where(s => s.Length >= 4)
                .ToArray();
            if (samples.Length >= 20)
                tracks.Add(new Track(t.GetProperty("label").GetString()!, samples, hz));
        }
        return tracks;
    }

    public static TheoryData<string> TrackLabels() {
        var data = new TheoryData<string>();
        foreach (var t in LoadTracks()) data.Add(t.Label);
        return data;
    }

    /// Reconstruct the player's kinematic state at an arbitrary sim time.
    ///
    /// Velocity comes from the POSITION stream, not the recorded gamma/heading fields. Those mix
    /// nose attitude with air-mass-relative flight path and, against the 24 kt wind present in the
    /// recordings, do not reconcile with ground track. Position is unambiguous and is already in
    /// sim world metres — verified: recorded merge starts read (1280, 3048, -4500), exactly the
    /// staging in Beats.ModernVisualMerge.
    static AircraftState PlayerAt(Track track, double seconds) {
        double x = seconds * track.SampleHz;
        int i = System.Math.Clamp((int)x, 0, track.Samples.Length - 2);
        double f = System.Math.Clamp(x - i, 0.0, 1.0);
        double[] a = track.Samples[i], b = track.Samples[i + 1];

        var pos = new Vec3D(a[0] + (b[0] - a[0]) * f,
                            a[1] + (b[1] - a[1]) * f,
                            a[2] + (b[2] - a[2]) * f);
        var vel = new Vec3D((b[0] - a[0]) * track.SampleHz,
                            (b[1] - a[1]) * track.SampleHz,
                            (b[2] - a[2]) * track.SampleHz);
        double speed = vel.Length;
        double gamma = speed > 1e-3
            ? System.Math.Asin(System.Math.Clamp(vel.Y / speed, -1.0, 1.0))
            : 0.0;
        double chi = System.Math.Atan2(vel.X, vel.Z);
        double bank = (a[3] + (b[3] - a[3]) * f) * System.Math.PI / 180.0;
        return new AircraftState(pos, speed, gamma, chi, bank, PlayerAir.MassKg);
    }

    static ReactiveBandit StagedBandit() => new(
        new AircraftState(new Vec3D(1520.0, MergeAltitudeM + 60.0, 4500.0),
            BeatSetup.CornerTrueAirspeedMps(BanditAir, MergeAltitudeM),
            0.0, System.Math.PI, 0.0, BanditAir.MassKg),
        BanditAir, PilotSkill.Ace);

    sealed record Replay(double LongestColdOpenS, double RollReversalsPerS,
        double MaxRadiusWhilePlayerGoneM, int Ticks);

    static Replay Fly(Track track) {
        var bandit = StagedBandit();
        double duration = (track.Samples.Length - 1) / track.SampleHz;
        var fightCentre = bandit.State.Position;

        int coldOpen = 0, longestColdOpen = 0, reversals = 0, ticks = 0;
        double previousRangeM = double.NaN, lastBank = 0.0, maxRadiusGone = 0.0;

        for (double t = 0.0; t < duration; t += Dt, ticks++) {
            var player = PlayerAt(track, t);
            bandit.Step(ActorObservation.Capture(player, ticks), Dt);

            var own = bandit.State;
            var toPlayer = player.Position - own.Position;
            double range = toPlayer.Length;

            bool cold = range > 1.0
                && own.ForwardDir().Dot(toPlayer * (1.0 / range)) < -0.5;
            bool opening = !double.IsNaN(previousRangeM) && range > previousRangeM;
            previousRangeM = range;

            // Only count it while a fight is plausibly still on. Past AbandonChaseRangeM the
            // player has left the area (one recorded track wanders 346 NM on an RTB) and holding
            // the arena is correct behaviour, not a runaway.
            if (range > 3500.0 && range <= 15_000.0 && cold && opening) {
                coldOpen++;
                longestColdOpen = System.Math.Max(longestColdOpen, coldOpen);
            } else {
                coldOpen = 0;
            }

            if (range > 15_000.0) {
                double dx = own.Position.X - fightCentre.X, dz = own.Position.Z - fightCentre.Z;
                maxRadiusGone = System.Math.Max(maxRadiusGone,
                    System.Math.Sqrt(dx * dx + dz * dz));
            }

            double bankCmd = bandit.LastCommand.BankTarget;
            if (ticks > 0 && System.Math.Abs(bankCmd) > 0.2 && System.Math.Abs(lastBank) > 0.2
                && System.Math.Sign(bankCmd) != System.Math.Sign(lastBank)) reversals++;
            lastBank = bankCmd;
        }

        double seconds = System.Math.Max(1.0, ticks / AircraftSim.TickHz);
        return new Replay(longestColdOpen / AircraftSim.TickHz, reversals / seconds,
            maxRadiusGone, ticks);
    }

    static Track Get(string label) => LoadTracks().Single(t => t.Label == label);

    [Theory]
    [MemberData(nameof(TrackLabels))]
    public void BanditNeverSustainsARunAgainstARealPlayer(string label) {
        Replay r = Fly(Get(label));
        Assert.True(r.Ticks > 0, "track produced no simulation");
        // The reported complaint, measured against a real flight path: nose cold, beyond gun
        // range, and still opening. A reversal legitimately looks like this for a few seconds.
        Assert.True(r.LongestColdOpenS < 20.0,
            $"{label}: bandit spent {r.LongestColdOpenS:F1} s continuously nose-cold and opening "
            + "beyond 3.5 km — that is the stern chase this corridor exists to prevent");
    }

    [Theory]
    [MemberData(nameof(TrackLabels))]
    public void BanditControlDoesNotChatterAgainstARealPlayer(string label) {
        Replay r = Fly(Get(label));
        // Controller health, corpus-wide. The nose-high recovery once aimed its roll at a point in
        // the vertical plane below the flight path, where the bank solution is +/-pi and the sign
        // is rounding noise: commanded bank alternated every tick at 120 Hz and the jet never
        // rolled at all. Any reappearance of that class of bug shows up here as a reversal rate
        // far above what real manoeuvring produces.
        Assert.True(r.RollReversalsPerS < 5.0,
            $"{label}: commanded bank reversed {r.RollReversalsPerS:F1} times per second — "
            + "the roll solution is chattering, not manoeuvring");
    }

    [Theory]
    [MemberData(nameof(TrackLabels))]
    public void BanditHoldsItsArenaWhenThePlayerLeaves(string label) {
        Replay r = Fly(Get(label));
        // A player who departs has disengaged; a guns-only opponent holds its fight volume rather
        // than following across the theatre. Without AbandonChaseRangeM the re-engage rule chased
        // the RTB track to 346 NM.
        Assert.True(r.MaxRadiusWhilePlayerGoneM < 20_000.0,
            $"{label}: bandit followed a departed player {r.MaxRadiusWhilePlayerGoneM / 1852.0:F1} "
            + "NM from its fight centre instead of holding the arena");
    }
}
