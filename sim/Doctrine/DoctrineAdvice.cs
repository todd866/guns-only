namespace GunsOnly.Sim.Doctrine;
public record DoctrineAdvice(double RecommendedG, double RecommendedBank, string Context);
public interface IExecutionLaw {
    DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit,
        in AircraftParams p, double airspeedMps = double.NaN);
}
