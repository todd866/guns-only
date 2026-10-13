using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// A deliberately small gunnery pilot for measurement fixtures. It consumes the same ballistic
/// lead evaluator as the gun sight, asks the real aircraft model to turn toward that lead, and
/// exposes a trigger decision. It never writes an aircraft pose or steers a projectile.
public readonly record struct GunOpportunityDecision(
    PilotCommand Command,
    bool Trigger,
    bool HasBallisticSolution,
    bool BodyAxisOnSolution,
    double BoreErrorRad);

public sealed class GunOpportunityPilot {
    readonly GunProfile _profile;
    readonly double _maxG;

    public GunOpportunityPilot(GunProfile? profile = null, double maxG = 7.0) {
        _profile = profile ?? GunProfiles.M61A2PublicDataSurrogate;
        _maxG = maxG;
    }

    public GunOpportunityDecision Drive(in AircraftState own, in AircraftState target) {
        GunBallisticSolution solution = GunKill.EvaluateBallisticLead(
            own, target, _profile, _profile.EffectiveHitRadiusM);
        Vec3D aim = solution.HasLeadSolution
            ? own.Position + solution.LeadDirection * Math.Max(1.0,
                (target.Position - own.Position).Length)
            : target.Position;
        Vec3D line = (aim - own.Position).Normalized();
        double bearing = Math.Atan2(line.X, line.Z);
        double error = Math.Atan2(Math.Sin(bearing - own.Chi), Math.Cos(bearing - own.Chi));
        double bank = Math.Clamp(error * 16.0, -1.25, 1.25);
        double pitch = Math.Atan2(line.Y, Math.Sqrt(line.X * line.X + line.Z * line.Z));
        Vec3D bore = GunKill.GunDirection(own);
        double borePitch = Math.Atan2(bore.Y, Math.Sqrt(bore.X * bore.X + bore.Z * bore.Z));
        double pitchRate = Math.Clamp((pitch - borePitch) / 0.4, -0.3, 0.3);
        double g = Math.Clamp((Math.Cos(own.Gamma) + pitchRate * own.Speed / FlightModel.G0)
            / Math.Max(0.3, Math.Cos(bank)), -0.2, _maxG);
        bool trigger = solution.HasLeadSolution && solution.BodyAxisOnSolution
            && (target.Position - own.Position).Length is >= 120.0 and <= 900.0;
        return new GunOpportunityDecision(
            new PilotCommand(g, bank, 1.0, 0.0),
            trigger, solution.HasLeadSolution, solution.BodyAxisOnSolution,
            solution.BoreErrorRad);
    }
}
