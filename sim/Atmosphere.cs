namespace GunsOnly.Sim;
public static class Atmosphere {
    // ISA troposphere, simplified. PLACEHOLDER fidelity is fine for M0.
    public static double Density(double altM) {
        double t = 288.15 - 0.0065 * altM;
        double p = 101325.0 * System.Math.Pow(t / 288.15, 5.2561);
        return p / (287.05 * t);
    }
    public static double SpeedOfSound(double altM) {
        double t = 288.15 - 0.0065 * altM;
        return System.Math.Sqrt(1.4 * 287.05 * t);
    }
}
