using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// A closed-loop synthetic pilot: it FLIES, it does not replay.
///
/// Replaying a recorded track is a counterfactual — the human flew against the bandit of the day,
/// so pushing that path through a changed bandit tests a fight that never happened. A pilot that
/// reacts closes the loop, which is the only way to ask "can this bandit be fought" rather than
/// "what does it do near a fixed trajectory".
///
/// <see cref="PilotProfile.Cohort"/> is CALIBRATED, not invented. Its numbers come from 124,731
/// samples across 64 real production sorties (see tools/telemetry/extract_bfm_fixtures.py for the
/// decode path). That cohort's signature is specific and unflattering: median commanded G of 1.0,
/// median flight path climbing 15 degrees, 90th-percentile bank past 144 degrees. They roll past
/// vertical, point the nose up, run the afterburner and almost never pull. It is what actually
/// arrives from a link, so it is what the bandit must be measured against.
///
/// NOT A MODEL OF THIS PROJECT'S AUTHOR. The telemetry cache holds no flown desktop sortie — its
/// three macOS sessions are a trimmed jet sitting at 10,000 ft. Fitting an author profile needs
/// recorded sorties that do not exist yet; <see cref="PilotProfile.Competent"/> is a hand-specified
/// BFM baseline standing in for "someone who is actually trying", not a fit to anybody.
public readonly record struct PilotProfile(
    string Name,
    double MaxG,
    double MaxBankRad,
    /// Seconds between seeing a picture and acting on it.
    double ReactionLatencyS,
    /// 0 = pure pursuit (nose on the bandit), 1 = full lead for the gun's time of flight.
    double LeadFraction,
    /// Added flight-path bias in radians. The cohort's median gamma is +15 degrees: they climb
    /// out of every fight whether or not it helps.
    double ClimbBiasRad,
    /// Below this speed the pilot stops pulling and unloads to rebuild. The cohort effectively
    /// has none, which is why it arrives slow and stays slow.
    double EnergyFloorMps) {

    /// Fitted to 64 real production sorties. See the class remarks for the measured percentiles.
    public static readonly PilotProfile Cohort = new(
        Name: "cohort",
        MaxG: 4.1,                     // measured p90 of g_cmd; the p50 is 1.0
        MaxBankRad: 2.51,              // 144 deg, measured p90 of |bank_deg|
        ReactionLatencyS: 0.60,        // touch control on a phone, through a browser
        LeadFraction: 0.0,             // pure pursuit at best; the cohort scored no kills
        ClimbBiasRad: 0.27,            // +15.6 deg, the measured median flight path
        EnergyFloorMps: 0.0);

    /// A hand-specified baseline for "someone who is actually trying". Not fitted to anyone.
    public static readonly PilotProfile Competent = new(
        Name: "competent",
        MaxG: 8.0,
        MaxBankRad: 1.75,
        ReactionLatencyS: 0.25,
        LeadFraction: 0.8,
        ClimbBiasRad: 0.0,
        EnergyFloorMps: 165.0);
}

/// Flies an ordinary AircraftSim against a contact using only pilot controls — no kinematic
/// shortcuts, the same contract the bandit itself obeys.
public sealed class SyntheticPilot {
    readonly AircraftSim _sim;
    readonly PilotProfile _profile;
    readonly AircraftParams _params;
    readonly Queue<AircraftState> _seen = new();
    readonly int _latencyTicks;

    public SyntheticPilot(AircraftState initial, AircraftParams parameters, PilotProfile profile) {
        _sim = new AircraftSim(initial, parameters);
        _params = parameters;
        _profile = profile;
        _latencyTicks = System.Math.Max(1,
            (int)System.Math.Round(profile.ReactionLatencyS * AircraftSim.TickHz));
    }

    public AircraftState State => _sim.State;
    public PilotCommand LastCommand { get; private set; } = new(1.0, 0.0, 0.9, 0.0);

    public void Step(in AircraftState contact, double dt) {
        // Everything this pilot knows is one reaction time old. Feeding the live state instead is
        // how a synthetic opponent becomes accidentally superhuman.
        _seen.Enqueue(contact);
        AircraftState believed = _seen.Count > _latencyTicks ? _seen.Dequeue() : _seen.Peek();

        LastCommand = Decide(believed);
        _sim.Step(LastCommand, dt);
    }

    PilotCommand Decide(in AircraftState contact) {
        var own = _sim.State;
        var toContact = contact.Position - own.Position;
        double range = toContact.Length;

        // Lead for the gun's time of flight, scaled by how much of it this pilot actually takes.
        var aim = contact.Position;
        if (_profile.LeadFraction > 0.0 && range > 1.0) {
            double tof = range / 1000.0;      // ~1000 m/s closing-ish; a pilot's rule of thumb
            aim += contact.VelocityVector() * (tof * _profile.LeadFraction);
        }
        if (_profile.ClimbBiasRad > 0.0)
            aim += new Vec3D(0.0, range * System.Math.Sin(_profile.ClimbBiasRad), 0.0);

        // Do not fly into the sea. This is the one thing every pilot in the corpus does.
        if (own.Position.Y < 400.0)
            aim = aim with { Y = System.Math.Max(aim.Y, 900.0) };

        var line = (aim - own.Position).Normalized();
        double angleOff = System.Math.Acos(
            System.Math.Clamp(own.ForwardDir().Dot(line), -1.0, 1.0));

        double bank = System.Math.Clamp(
            Geometry.BankToPlaceLiftVectorOn(own, aim),
            -_profile.MaxBankRad, _profile.MaxBankRad);

        // Pull in proportion to the angle, capped by the profile — and stop pulling when slow,
        // which is the discipline the cohort does not have.
        double g = 1.0 + angleOff * 2.4;
        if (_profile.EnergyFloorMps > 0.0 && own.Speed < _profile.EnergyFloorMps) g = 1.0;
        g = System.Math.Clamp(g, 0.5,
            System.Math.Min(_profile.MaxG, System.Math.Max(1.05,
                FlightModel.NzAeroMax(own, _params))));

        double throttle = own.Speed < 320.0 ? 1.0 : 0.85;
        return new PilotCommand(g, bank, throttle, 0.0);
    }
}
