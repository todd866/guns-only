namespace GunsOnly.Sim.Okanagan;

public readonly record struct OkanaganFireCellSnapshot(
    int Column,
    int Row,
    double X,
    double Y,
    double Z,
    double Intensity,
    double Fuel,
    double Wetness,
    string FuelType);

/// <summary>
/// Deterministic game-scale spread authority using the Canadian FBP inputs that matter to the
/// sortie: fuel class, moisture, wind and slope. It is explicitly not an operational forecast.
/// </summary>
public sealed class OkanaganFireGrid
{
    public const int Columns = 44;
    public const int Rows = 44;
    public const double CellSizeM = 140.0;
    readonly Cell[,] _cells = new Cell[Columns, Rows];
    readonly Vec3D _centre = OkanaganGeo.ToWorld(49.850, -119.655, 0.0);
    readonly Vec3D _windTo = new(Math.Sin(25.0 * Math.PI / 180.0), 0.0,
        Math.Cos(25.0 * Math.PI / 180.0));
    double _accumulator;

    struct Cell
    {
        public double Fuel;
        public double Heat;
        public double Wetness;
        public double ElevationM;
        public string FuelType;
    }

    public OkanaganFireGrid()
    {
        for (int column = 0; column < Columns; column++)
        for (int row = 0; row < Rows; row++)
        {
            Vec3D position = CellPosition(column, row);
            uint hash = Hash((uint)(column * 73856093 ^ row * 19349663));
            double noise = (hash & 0xffff) / 65535.0;
            string fuelType = noise < 0.58 ? "C7" : noise < 0.82 ? "O1" : "M1";
            double fuel = fuelType switch { "C7" => 0.92, "O1" => 0.72, _ => 0.82 };
            _cells[column, row] = new Cell {
                Fuel = fuel * (0.86 + noise * 0.14),
                Heat = 0.0,
                Wetness = 0.19,
                ElevationM = OkanaganGeo.RepresentativeTerrainHeightM(position),
                FuelType = fuelType,
            };
        }

        // An elongated initial flank above West Kelowna: enough established fire to require
        // repeated work, but bounded so one player can make a visible difference.
        for (int column = 17; column <= 23; column++)
        for (int row = 18; row <= 26; row++)
        {
            double dx = (column - 20.0) / 3.2;
            double dz = (row - 22.0) / 5.0;
            if (dx * dx + dz * dz <= 1.0)
                _cells[column, row].Heat = 0.58 + 0.28 * (1.0 - dx * dx - dz * dz);
        }
    }

    public double TotalIntensity { get; private set; }
    public double EffectiveWaterKg { get; private set; }
    public double BurnedAreaHa { get; private set; }
    public int PopulationExposed { get; private set; }

    public void Step(double deltaSeconds)
    {
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        _accumulator += deltaSeconds;
        while (_accumulator >= 0.5)
        {
            AdvanceHalfSecond();
            _accumulator -= 0.5;
        }
    }

    public double ApplyWater(in Vec3D position, double waterKg)
    {
        if (waterKg <= 0.0 || !double.IsFinite(waterKg)) return 0.0;
        double effective = 0.0;
        const double radiusM = 185.0;
        int centreColumn = (int)Math.Round((position.X - _centre.X) / CellSizeM + (Columns - 1) / 2.0);
        int centreRow = (int)Math.Round((position.Z - _centre.Z) / CellSizeM + (Rows - 1) / 2.0);
        for (int column = centreColumn - 2; column <= centreColumn + 2; column++)
        for (int row = centreRow - 2; row <= centreRow + 2; row++)
        {
            if (column < 0 || column >= Columns || row < 0 || row >= Rows) continue;
            Vec3D cellPosition = CellPosition(column, row);
            double dx = cellPosition.X - position.X;
            double dz = cellPosition.Z - position.Z;
            double distance = Math.Sqrt(dx * dx + dz * dz);
            if (distance > radiusM) continue;
            double weight = Math.Max(0.0, 1.0 - distance / radiusM);
            ref Cell cell = ref _cells[column, row];
            double before = cell.Heat;
            double dose = waterKg * weight / 430.0;
            cell.Wetness = Math.Min(1.0, cell.Wetness + dose * 0.30);
            cell.Heat = Math.Max(0.0, cell.Heat - dose * 0.42);
            effective += Math.Max(0.0, before - cell.Heat) * waterKg * weight;
        }
        double credited = Math.Min(waterKg, effective / Math.Max(1.0, waterKg) * 760.0);
        EffectiveWaterKg += credited;
        return credited;
    }

    public IReadOnlyList<OkanaganFireCellSnapshot> ActiveCells(int maximum = 180)
    {
        var result = new List<OkanaganFireCellSnapshot>(maximum);
        for (int column = 0; column < Columns; column++)
        for (int row = 0; row < Rows; row++)
        {
            Cell cell = _cells[column, row];
            double intensity = Intensity(cell);
            if (intensity < 0.035 && cell.Fuel > 0.10) continue;
            Vec3D position = CellPosition(column, row);
            result.Add(new OkanaganFireCellSnapshot(column, row, position.X,
                cell.ElevationM, position.Z, intensity, cell.Fuel, cell.Wetness, cell.FuelType));
        }
        return result.OrderByDescending(cell => cell.Intensity).Take(maximum).ToArray();
    }

    void AdvanceHalfSecond()
    {
        double[,] additions = new double[Columns, Rows];
        TotalIntensity = 0.0;
        double burnedCells = 0.0;
        double nearestCommunityFire = double.PositiveInfinity;
        Vec3D westKelowna = OkanaganGeo.ToWorld(49.8625, -119.5833, 0.0);

        for (int column = 0; column < Columns; column++)
        for (int row = 0; row < Rows; row++)
        {
            ref Cell cell = ref _cells[column, row];
            cell.Wetness = Math.Max(0.12, cell.Wetness - 0.0012);
            double intensity = Intensity(cell);
            TotalIntensity += intensity;
            if (cell.Fuel < 0.10) burnedCells += 1.0;
            if (intensity < 0.08) continue;
            cell.Fuel = Math.Max(0.0, cell.Fuel - intensity * 0.0017);
            cell.Heat = Math.Max(0.0, cell.Heat - 0.0025 - cell.Wetness * 0.0020);
            Vec3D from = CellPosition(column, row);
            double communityDistance = HorizontalDistance(from, westKelowna);
            nearestCommunityFire = Math.Min(nearestCommunityFire, communityDistance);

            for (int dx = -1; dx <= 1; dx++)
            for (int dz = -1; dz <= 1; dz++)
            {
                if (dx == 0 && dz == 0) continue;
                int targetColumn = column + dx;
                int targetRow = row + dz;
                if (targetColumn < 0 || targetColumn >= Columns || targetRow < 0 || targetRow >= Rows)
                    continue;
                ref Cell target = ref _cells[targetColumn, targetRow];
                if (target.Fuel <= 0.08 || target.Wetness >= 0.72) continue;
                Vec3D direction = new Vec3D(dx, 0.0, dz).Normalized();
                double windFactor = 0.55 + Math.Max(0.0, direction.Dot(_windTo)) * 1.75;
                double slope = (target.ElevationM - cell.ElevationM) / (CellSizeM * Math.Sqrt(dx * dx + dz * dz));
                double slopeFactor = Math.Clamp(1.0 + slope * 4.0, 0.35, 2.2);
                double fuelFactor = target.FuelType switch { "O1" => 1.35, "C7" => 1.0, _ => 0.78 };
                additions[targetColumn, targetRow] += intensity * 0.011 * windFactor
                    * slopeFactor * fuelFactor * (1.0 - target.Wetness);
            }
        }

        for (int column = 0; column < Columns; column++)
        for (int row = 0; row < Rows; row++)
            _cells[column, row].Heat = Math.Clamp(_cells[column, row].Heat + additions[column, row], 0.0, 1.0);

        BurnedAreaHa = burnedCells * CellSizeM * CellSizeM / 10_000.0;
        PopulationExposed = double.IsFinite(nearestCommunityFire)
            ? (int)Math.Round(36_078.0 * Math.Clamp((4_800.0 - nearestCommunityFire) / 3_800.0, 0.0, 1.0))
            : 0;
    }

    Vec3D CellPosition(int column, int row) => new(
        _centre.X + (column - (Columns - 1) / 2.0) * CellSizeM,
        0.0,
        _centre.Z + (row - (Rows - 1) / 2.0) * CellSizeM);

    static double Intensity(in Cell cell) => Math.Clamp(cell.Heat * cell.Fuel
        * Math.Clamp((0.72 - cell.Wetness) / 0.53, 0.0, 1.0), 0.0, 1.0);
    static double HorizontalDistance(in Vec3D a, in Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }
    static uint Hash(uint value)
    {
        value ^= value >> 16;
        value *= 0x7feb352d;
        value ^= value >> 15;
        value *= 0x846ca68b;
        return value ^ (value >> 16);
    }
}
