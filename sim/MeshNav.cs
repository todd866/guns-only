namespace GunsOnly.Sim;

/// <summary>
/// Routing Mesh navigation — Place roles, Open Segment vs mission-gated selectability, ActiveDest,
/// and dest→HomePlate reserve-on-return projection. Fiction: docs/nav-fabric-canon.md.
/// </summary>
public enum MeshPlaceRole {
    Home = 0,
    Destination = 1,
    Landmark = 2,
    SceneryAnchor = 3,
    ProcedureFix = 4,
}

public enum MeshNavTransitMode {
    MissionGated = 0,
    OpenSegment = 1,
}

public readonly record struct MeshPlace(
    string PlaceId,
    string DisplayName,
    double EastM,
    double NorthM,
    double? UpM,
    MeshPlaceRole Role);

public readonly record struct MeshFreeFix(
    double EastM,
    double NorthM,
    string? Label);

public readonly record struct MeshActiveDest(
    bool IsPlace,
    string? PlaceId,
    string DisplayName,
    double EastM,
    double NorthM,
    double? UpM) {
    public Vec3D Position => new(EastM, UpM ?? 0.0, NorthM);
}

/// <summary>
/// Current-condition solution toward ActiveDest plus a dest→HomePlate return-leg fuel estimate.
/// Dest-leg honesty matches <see cref="FuelModel.ProjectRecoveryTo"/>; return-leg fuel is priced
/// only when dest arrival fuel is known and current NM/MIN / LB/MIN are usable.
/// </summary>
public readonly record struct MeshNavSolution(
    RecoveryNavigationProjection DestLeg,
    double? FuelDestToHomeLb,
    double? FuelOnArrivalHomeViaDestLb,
    double? ReserveMarginViaDestLb);

public static class MeshSelectability {
    public static bool CanSelect(
        MeshPlaceRole role,
        MeshNavTransitMode mode,
        bool phaseAllows) {
        if (!phaseAllows) return false;
        // Catalog membership is the mission gate. Transit mode only unlocks Free Fixes
        // (Open Segment); it does not demote authored Destination Places already listed.
        _ = mode;
        return role switch {
            MeshPlaceRole.Home => true,
            MeshPlaceRole.Destination => true,
            _ => false,
        };
    }
}

public sealed class MeshNavDirector {
    public const double FreeFixClampM = 500_000.0;
    public const int MaxTourStops = 16;

    MeshNavTransitMode _mode = MeshNavTransitMode.MissionGated;
    MeshPlace? _homePlate;
    List<MeshPlace> _catalog = new();
    MeshActiveDest? _active;
    List<MeshActiveDest> _tour = new();

    public MeshNavTransitMode Mode => _mode;
    public MeshPlace? HomePlate => _homePlate;
    public MeshActiveDest? Active => _active;
    public IReadOnlyList<MeshPlace> Catalog => _catalog;
    public IReadOnlyList<MeshActiveDest> Tour => _tour;

    public void Reset() {
        _mode = MeshNavTransitMode.MissionGated;
        _homePlate = null;
        _catalog = new List<MeshPlace>();
        _active = null;
        _tour = new List<MeshActiveDest>();
    }

    public void Configure(
        MeshNavTransitMode mode,
        MeshPlace? homePlate,
        IReadOnlyList<MeshPlace> catalog) {
        _mode = mode;
        _homePlate = homePlate;
        var merged = new List<MeshPlace>();
        if (homePlate is { } home) {
            merged.Add(home);
        }
        foreach (MeshPlace place in catalog) {
            if (homePlate is { } existing
                && string.Equals(place.PlaceId, existing.PlaceId, StringComparison.Ordinal))
                continue;
            merged.Add(place);
        }
        _catalog = merged;
        _tour = new List<MeshActiveDest>();
        ClearActiveDestToHome();
    }

    /// <summary>Translate a moving HomePlate without clearing the pilot's route selection.</summary>
    public void UpdateHomePlate(in MeshPlace homePlate) {
        if (homePlate.Role != MeshPlaceRole.Home) return;
        bool activeWasHome = _active is { IsPlace: true } active
            && _homePlate is { } oldHome
            && string.Equals(active.PlaceId, oldHome.PlaceId, StringComparison.Ordinal);
        _homePlate = homePlate;
        string homePlaceId = homePlate.PlaceId;
        int catalogIndex = _catalog.FindIndex(place =>
            string.Equals(place.PlaceId, homePlaceId, StringComparison.Ordinal));
        if (catalogIndex >= 0) _catalog[catalogIndex] = homePlate;
        else _catalog.Insert(0, homePlate);
        if (activeWasHome) _active = ToActive(homePlate);
        for (int i = 0; i < _tour.Count; i++) {
            if (_tour[i].IsPlace
                && string.Equals(_tour[i].PlaceId, homePlate.PlaceId,
                    StringComparison.Ordinal))
                _tour[i] = ToActive(homePlate);
        }
    }

    public bool TrySelectPlace(string placeId, bool phaseAllows) {
        if (string.IsNullOrWhiteSpace(placeId)) return false;
        foreach (MeshPlace place in _catalog) {
            if (!string.Equals(place.PlaceId, placeId, StringComparison.Ordinal)) continue;
            if (!MeshSelectability.CanSelect(place.Role, _mode, phaseAllows)) return false;
            _active = ToActive(place);
            return true;
        }
        return false;
    }

    public bool TrySetFreeFix(double eastM, double northM, string? label) {
        if (_mode != MeshNavTransitMode.OpenSegment) return false;
        if (!TryBuildFreeFix(eastM, northM, label, out MeshActiveDest fix)) return false;
        _active = fix;
        return true;
    }

    public bool TryTourAppendPlace(string placeId, bool phaseAllows) {
        if (_tour.Count >= MaxTourStops) return false;
        if (string.IsNullOrWhiteSpace(placeId)) return false;
        foreach (MeshPlace place in _catalog) {
            if (!string.Equals(place.PlaceId, placeId, StringComparison.Ordinal)) continue;
            if (!MeshSelectability.CanSelect(place.Role, _mode, phaseAllows)) return false;
            MeshActiveDest stop = ToActive(place);
            _tour.Add(stop);
            _active = stop;
            return true;
        }
        return false;
    }

    public bool TryTourAppendFreeFix(double eastM, double northM, string? label) {
        if (_mode != MeshNavTransitMode.OpenSegment) return false;
        if (_tour.Count >= MaxTourStops) return false;
        if (!TryBuildFreeFix(eastM, northM, label, out MeshActiveDest fix)) return false;
        _tour.Add(fix);
        _active = fix;
        return true;
    }

    public void ClearTour() {
        _tour = new List<MeshActiveDest>();
    }

    public void ClearActiveDestToHome() {
        if (_homePlate is { } home) {
            _active = ToActive(home);
            return;
        }
        _active = null;
    }

    static bool TryBuildFreeFix(
        double eastM, double northM, string? label, out MeshActiveDest fix) {
        fix = default;
        if (!double.IsFinite(eastM) || !double.IsFinite(northM)) return false;
        if (Math.Abs(eastM) > FreeFixClampM || Math.Abs(northM) > FreeFixClampM) return false;
        string display = string.IsNullOrWhiteSpace(label)
            ? $"FIX {eastM:0}/{northM:0}"
            : label.Trim();
        fix = new MeshActiveDest(
            IsPlace: false,
            PlaceId: null,
            DisplayName: display,
            EastM: eastM,
            NorthM: northM,
            UpM: null);
        return true;
    }

    static MeshActiveDest ToActive(in MeshPlace place) => new(
        IsPlace: true,
        PlaceId: place.PlaceId,
        DisplayName: place.DisplayName,
        EastM: place.EastM,
        NorthM: place.NorthM,
        UpM: place.UpM);
}

public static class MeshNavProjection {
    public static MeshNavSolution ProjectSolution(
        FuelModel fuel,
        in Vec3D position,
        in Vec3D groundVelocity,
        double headingRad,
        in MeshActiveDest dest,
        in Vec3D home,
        double? reserveTargetLb) {
        Vec3D destPos = dest.Position;
        // Keep dest elevation coherent with the aircraft when the Place omitted upM.
        if (dest.UpM is null) {
            destPos = new Vec3D(dest.EastM, position.Y, dest.NorthM);
        }

        RecoveryNavigationProjection destLeg = fuel.ProjectRecoveryTo(
            position,
            groundVelocity,
            headingRad,
            destPos,
            requiredLandingReserveLb: null,
            active: true);

        double? fuelDestToHomeLb = null;
        double? fuelOnArrivalHomeViaDestLb = null;
        double? reserveMarginViaDestLb = null;

        if (destLeg.FuelOnArrivalEstimateLb is { } fuelOnArrivalDest
            && fuel.SmoothedBurnLbPerMinute > 1e-9) {
            double groundSpeedMps = Math.Sqrt(
                groundVelocity.X * groundVelocity.X + groundVelocity.Z * groundVelocity.Z);
            double nmPerMin = groundSpeedMps * AirData.MpsToKnots / 60.0;
            if (nmPerMin > 0.01) {
                double eastM = home.X - destPos.X;
                double northM = home.Z - destPos.Z;
                double rangeDestHomeM = Math.Sqrt(eastM * eastM + northM * northM);
                double rangeDestHomeNm = rangeDestHomeM / 1852.0;
                double lbPerMin = fuel.SmoothedBurnLbPerMinute;
                double lbPerNm = lbPerMin / nmPerMin;
                fuelDestToHomeLb = rangeDestHomeNm * lbPerNm;
                fuelOnArrivalHomeViaDestLb = fuelOnArrivalDest - fuelDestToHomeLb.Value;
                if (reserveTargetLb is { } reserve) {
                    reserveMarginViaDestLb = fuelOnArrivalHomeViaDestLb.Value - reserve;
                }
            }
        }

        return new MeshNavSolution(
            DestLeg: destLeg,
            FuelDestToHomeLb: fuelDestToHomeLb,
            FuelOnArrivalHomeViaDestLb: fuelOnArrivalHomeViaDestLb,
            ReserveMarginViaDestLb: reserveMarginViaDestLb);
    }
}
