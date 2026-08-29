using System.Collections.Generic;
using System.Globalization;
using System.Text.Json;

namespace GunsOnly.Sim.Training;

/// <summary>
/// Training and evaluation scenarios taken from the OWNER'S OWN FLIGHTS rather than a script.
/// </summary>
/// <remarks>
/// The gun-conversion contracts grade the opponent against a synthetic probe, and an opponent that
/// passes them lands a hit in about five percent of the owner's real sorties. Passing them is
/// therefore not evidence of a credible opponent, and training against that reward converges faster
/// onto the opponent that already exists. These scenarios are the geometries a competent human
/// actually presents: each one is the tick where a real engagement crossed inbound through 2.5 km
/// while genuinely closing, with both aircraft's measured states.
///
/// Produced by <c>tools/telemetry/owner_engagements.py</c>. The owner flies the F-22 surrogate, so
/// it stages as the runner's REFERENCE actor and the opponent as the LEARNING actor — the same role
/// split <see cref="CombatTrainingScenarioFactory"/> uses.
/// </remarks>
public static class OwnerEngagementScenarios {
    /// <summary>The bandit publishes no attitude of its own, so its heading and flight path come
    /// from a finite difference of position. Below this speed that estimate is not trustworthy and
    /// the engagement is skipped rather than staged from a guess.</summary>
    public const double MinimumEstimatedSpeedMps = 60.0;

    /// <summary>Upper bound on the same estimate. A restage or a contact switch between two
    /// samples moves the published position hundreds of metres in one 50 ms step, which
    /// differences to a several-thousand-metre-per-second "velocity". That is a teleport, not a
    /// merge, and staging it would invent a geometry the owner never flew.</summary>
    public const double MaximumEstimatedSpeedMps = 600.0;

    public static IReadOnlyList<CombatTrainingScenario> Load(string path) {
        var scenarios = new List<CombatTrainingScenario>();
        ulong index = 0;
        foreach (string line in System.IO.File.ReadLines(path)) {
            if (string.IsNullOrWhiteSpace(line)) continue;
            using JsonDocument document = JsonDocument.Parse(line);
            JsonElement root = document.RootElement;
            index++;
            if (TryScenario(root, index, out CombatTrainingScenario scenario))
                scenarios.Add(scenario);
        }
        return scenarios;
    }

    static bool TryScenario(JsonElement root, ulong index, out CombatTrainingScenario scenario) {
        scenario = default;
        if (!root.TryGetProperty("player", out JsonElement player)
            || !root.TryGetProperty("bandit", out JsonElement bandit))
            return false;

        if (!TryVec(player, out Vec3D playerPosition)) return false;
        if (!TryVec(bandit, out Vec3D banditPosition)) return false;

        double playerSpeedMps = Knots(Number(player, "true_airspeed_kts"));
        double playerChi = Radians(Number(player, "heading_deg"));
        double playerGamma = Radians(Number(player, "gamma_deg"));
        double playerBank = Radians(Number(player, "bank_deg"));
        if (!double.IsFinite(playerSpeedMps)
            || playerSpeedMps < MinimumEstimatedSpeedMps
            || playerSpeedMps > MaximumEstimatedSpeedMps)
            return false;

        if (!bandit.TryGetProperty("velocity_mps", out JsonElement velocity)
            || velocity.ValueKind != JsonValueKind.Array
            || velocity.GetArrayLength() != 3)
            return false;
        double vx = velocity[0].GetDouble();
        double vy = velocity[1].GetDouble();
        double vz = velocity[2].GetDouble();
        double banditSpeedMps = System.Math.Sqrt(vx * vx + vy * vy + vz * vz);
        if (!double.IsFinite(banditSpeedMps)
            || banditSpeedMps < MinimumEstimatedSpeedMps
            || banditSpeedMps > MaximumEstimatedSpeedMps)
            return false;
        double banditChi = System.Math.Atan2(vx, vz);
        double banditGamma = System.Math.Asin(System.Math.Clamp(vy / banditSpeedMps, -1.0, 1.0));

        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = FlightModel.Su27SPublicDataSurrogate;
        var reference = new AircraftState(playerPosition, playerSpeedMps,
            playerGamma, playerChi, playerBank, referenceAir.MassKg);
        // The opponent's bank is not published; a level entry is the honest default rather than a
        // fabricated one, and the controller rolls out of it within the first tenth of a second.
        var learning = new AircraftState(banditPosition, banditSpeedMps,
            banditGamma, banditChi, 0.0, learningAir.MassKg);

        if (!Supported(reference) || !Supported(learning)) return false;
        scenario = new CombatTrainingScenario(
            $"owner-engagement-{index:0000}", index, reference, learning, FirstPassSafe: false);
        return true;
    }

    static bool Supported(in AircraftState state) =>
        state.Position.IsFinite
        && double.IsFinite(state.Speed) && state.Speed > 0.0
        && state.Position.Y >= SeededCombatBatchRunner.MinimumSupportedAltitudeM
        && state.Position.Y <= SeededCombatBatchRunner.MaximumSupportedAltitudeM;

    static bool TryVec(JsonElement element, out Vec3D value) {
        value = default;
        double x = Number(element, "x"), y = Number(element, "y"), z = Number(element, "z");
        if (!double.IsFinite(x) || !double.IsFinite(y) || !double.IsFinite(z)) return false;
        value = new Vec3D(x, y, z);
        return true;
    }

    static double Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value)
            && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : double.NaN;

    static double Knots(double knots) => knots * 0.514444;
    static double Radians(double degrees) => degrees * System.Math.PI / 180.0;
}
