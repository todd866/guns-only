using System.Collections.Generic;
namespace GunsOnly.Sim.Doctrine;
public record BeatSetup(string Name, AircraftState Player, AircraftState Bandit, IExecutionLaw Law,
    List<(double T, PilotCommand Cmd)> BanditTimeline);

public sealed class RailBandit {
    readonly AircraftSim _sim; readonly List<(double T, PilotCommand Cmd)> _tl;
    public double T { get; private set; }
    public AircraftState State => _sim.State;
    public RailBandit(AircraftState initial, AircraftParams p, List<(double, PilotCommand)> timeline) {
        _sim = new AircraftSim(initial, p); _tl = timeline;
    }
    public void Step(double dt) {
        var cmd = _tl[0].Cmd;
        for (int i = _tl.Count - 1; i >= 0; i--) if (T >= _tl[i].T) { cmd = _tl[i].Cmd; break; }
        _sim.Step(cmd, dt); T += dt;
    }
}

public static class Beats {
    const double Alt = 3000;
    static AircraftState S(double x, double y, double z, double chi, double v) =>
        new(new Vec3D(x, y, z), v, 0, chi, 0, FlightModel.Sabre.MassKg);

    public static BeatSetup Perch() => new("Perch attack",
        Player: S(0, Alt + 300, -500, 0, 200),
        Bandit: S(0, Alt, 0, 0, 180),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
            (5.0, new PilotCommand(4.0, -1.10, 1.0, 0)),   // 4G left turn
            (25.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
        });

    public static BeatSetup BreakDefense() => new("Break defense",
        Player: S(0, Alt, 0, 0, 190),
        Bandit: S(80, Alt + 120, -700, 0, 230),           // high six, closing
        Law: new BreakLaw(+1),
        BanditTimeline: new() {
            (0.0, new PilotCommand(2.0, 0.35, 1.0, 0)),    // gentle lag curve toward player
            (8.0, new PilotCommand(4.5, 0.9, 1.0, 0)),
            (20.0, new PilotCommand(1.0, 0.0, 0.7, 0)),
        });

    public static BeatSetup Saddle() => new("Saddle + shot",
        Player: S(0, Alt, -250, 0, 185),
        Bandit: S(0, Alt, 0, 0, 175),
        Law: new GunsSaddleLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(2.0, 0.55, 0.9, 0)),    // lazy weave
            (4.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (8.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (12.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (16.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (20.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
        });
}
