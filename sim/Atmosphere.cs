namespace GunsOnly.Sim;

/// ISA to 20 km. The troposphere-only version was fine while nothing flew above ~36k ft, but
/// balloon-drop missions start at 60-70k — where a lapse-forever model claims 169 K instead of
/// 216.65 K, putting the speed of sound 13% out at 60k and 20% out at 70k (so a diving glider
/// would meet its Mach limit at the wrong speed). The stratosphere is isothermal; model it.
public static class Atmosphere {
    const double T0 = 288.15, P0 = 101325.0, L = 0.0065, R = 287.05, G = 9.80665;
    const double TropopauseM = 11000.0, TStrat = 216.65;
    static readonly double PTropopause = P0 * System.Math.Pow(TStrat / T0, G / (L * R));

    public static double Temperature(double altM) =>
        altM < TropopauseM ? T0 - L * altM : TStrat;   // isothermal 11-20 km

    public static double Pressure(double altM) =>
        altM < TropopauseM
            ? P0 * System.Math.Pow((T0 - L * altM) / T0, G / (L * R))
            : PTropopause * System.Math.Exp(-G * (altM - TropopauseM) / (R * TStrat));

    public static double Density(double altM) => Pressure(altM) / (R * Temperature(altM));

    public static double SpeedOfSound(double altM) => System.Math.Sqrt(1.4 * R * Temperature(altM));
}
