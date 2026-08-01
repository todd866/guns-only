using System.Reflection;
using System.Text.Json;

namespace GunsOnly.Sim;

/// <summary>
/// Runtime view of Rapier v2's canonical shape-first definition and deterministic engineering
/// artifact. No dimension, mass property, inlet area, or thermal limit is re-authored here: this
/// class only validates and exposes the embedded generated result used by the flight model.
/// </summary>
public static class RapierV2Design {
    const string DefinitionResource = "GunsOnly.Sim.Airframes.rapier.v2.json";
    const string EngineeringResource = "GunsOnly.Sim.Airframes.rapier.v2.engineering.json";
    const string RuntimeBinding = "FlightModel.RapierPublicDataSurrogate";

    static readonly Lazy<DesignData> Data = new(Load, isThreadSafe: true);

    public static string Id => Data.Value.Id;
    public static string Revision => Data.Value.Revision;
    public static string CanonicalSha256 => Data.Value.CanonicalSha256;
    public static double LengthM => Data.Value.LengthM;
    public static double SpanM => Data.Value.SpanM;
    public static double HeightM => Data.Value.HeightM;
    public static double ReferenceAreaM2 => Data.Value.ReferenceAreaM2;
    public static double MeanAerodynamicChordM => Data.Value.MeanAerodynamicChordM;
    public static double AspectRatio => Data.Value.AspectRatio;
    public static double WettedAreaM2 => Data.Value.WettedAreaM2;
    public static double EnclosedVolumeM3 => Data.Value.EnclosedVolumeM3;
    public static double FrontalAreaM2 => Data.Value.FrontalAreaM2;
    public static double InletCaptureAreaM2 => Data.Value.InletCaptureAreaM2;
    public static string FlowpathArchitectureKind =>
        Data.Value.PropulsionPackage.ArchitectureKind;
    public static double TurbineCoreDiameterM => Data.Value.PropulsionPackage.CoreDiameterM;
    public static double TurbineCoreLengthM => Data.Value.PropulsionPackage.CoreLengthM;
    public static double PropulsionEnvelopeDiameterM =>
        Data.Value.PropulsionPackage.EnvelopeDiameterM;
    public static double PropulsionEnvelopeLengthM =>
        Data.Value.PropulsionPackage.EnvelopeLengthM;
    public static double PropulsionPackageMassKg => Data.Value.PropulsionPackage.PackageMassKg;
    public static double PropulsionStructuralRadialClearanceM =>
        Data.Value.PropulsionPackage.StructuralRadialClearanceM;
    public static double PropulsionThermalRadialClearanceM =>
        Data.Value.PropulsionPackage.ThermalRadialClearanceM;
    public static double PropulsionTunnelMinimumRadialClearanceM =>
        Data.Value.PropulsionPackage.TunnelMinimumRadialClearanceM;
    public static double PropulsionClearCoannularAreaM2 =>
        Data.Value.PropulsionPackage.ClearCoannularAreaM2;
    public static double PropulsionRequiredChokedAreaM2 =>
        Data.Value.PropulsionPackage.RequiredChokedAreaM2;
    public static double PropulsionPressureRecoveryFloorFraction =>
        Data.Value.PropulsionPackage.PressureRecoveryFloorFraction;
    public static double PropulsionMinimumRecoveryRequiredFraction =>
        Data.Value.PropulsionPackage.MinimumRecoveryRequiredFraction;
    public static double PropulsionNozzleAreaM2 => Data.Value.PropulsionPackage.NozzleAreaM2;
    public static double PropulsionFireBulkheadGapM =>
        Data.Value.PropulsionPackage.FireBulkheadGapM;
    public static bool PropulsionPackageCollisionPass =>
        Data.Value.PropulsionPackage.CollisionPass;
    public static bool PropulsionFlowAreaPass => Data.Value.PropulsionPackage.FlowAreaPass;
    public static double InletDesignFlowIncidenceRad =>
        Data.Value.InletDesignFlowIncidenceRad;
    public static double InletRamRegimeStartMach => Data.Value.InletRamRegimeStartMach;
    public static double InletUnstartTripDeviationRad =>
        Data.Value.InletUnstartTripDeviationRad;
    public static double InletUnstartClearDeviationRad =>
        Data.Value.InletUnstartClearDeviationRad;
    public static double InletUnstartRecoveryFloor => Data.Value.InletUnstartRecoveryFloor;
    public static double InletCharacteristicAngleAtRamStartRad =>
        Data.Value.InletCharacteristicAngleAtRamStartRad;
    public static double InletCharacteristicAngleDecreaseRadPerMach =>
        Data.Value.InletCharacteristicAngleDecreaseRadPerMach;
    public static double InletMinimumCharacteristicAngleRad =>
        Data.Value.InletMinimumCharacteristicAngleRad;
    public static double InletRecoveryOnsetBlendMach =>
        Data.Value.InletRecoveryOnsetBlendMach;
    public static double InstalledThrustRetention => Data.Value.InstalledThrustRetention;
    public static double SeaLevelStaticDryThrustN => Data.Value.SeaLevelStaticDryThrustN;
    public static double MaximumAugmentedThrustRatio =>
        Data.Value.MaximumAugmentedThrustRatio;
    public static double TurbineFadeStartMach => Data.Value.TurbineFadeStartMach;
    public static double TurbineFadeCompleteMach => Data.Value.TurbineFadeCompleteMach;
    public static double IdleFuelFlowLbPerMinute => Data.Value.IdleFuelFlowLbPerMinute;
    public static double MilitaryFuelFlowLbPerMinute => Data.Value.MilitaryFuelFlowLbPerMinute;
    public static double AugmentedFuelFlowLbPerMinute => Data.Value.AugmentedFuelFlowLbPerMinute;
    public static double RamStreamAugmentationRatio => Data.Value.RamStreamAugmentationRatio;
    public static double CaptureEfficiency(double mach) =>
        InterpolateSchedule(Data.Value.CaptureEfficiencySchedule, mach);
    public static double SpecificThrustNPerKgS(double mach) =>
        InterpolateSchedule(Data.Value.SpecificThrustScheduleNPerKgS, mach);
    public static double EmptyMassKg => Data.Value.EmptyMassKg;
    public static double FuelCapacityKg => Data.Value.FuelCapacityKg;
    public static double GrossMassKg => Data.Value.GrossMassKg;
    /// FlightModel's historical Ixx field is roll P, i.e. physical body-z for this +z-aft frame.
    public static double RollInertiaKgM2 => Data.Value.RollInertiaKgM2;
    /// FlightModel's historical Iyy field is pitch Q, i.e. physical body-x for this frame.
    public static double PitchInertiaKgM2 => Data.Value.PitchInertiaKgM2;
    /// FlightModel's historical Izz field is yaw R, i.e. physical body-y for this frame.
    public static double YawInertiaKgM2 => Data.Value.YawInertiaKgM2;
    public static double DesignMach => Data.Value.DesignMach;
    public static double MinimumDashMach => Data.Value.MinimumDashMach;
    public static double DesignAltitudeM => Data.Value.DesignAltitudeM;
    public static double MaximumDynamicPressurePa => Data.Value.MaximumDynamicPressurePa;
    public static double DesignPointNetThrustN => Data.Value.DesignPointNetThrustN;
    public static double DesignPointRawRamThrustN => Data.Value.DesignPointRawRamThrustN;
    public static double DesignPointTrimAlphaRad => Data.Value.DesignPointTrimAlphaRad;
    public static double DesignPointInletOffDesignAngleRad =>
        Data.Value.DesignPointInletOffDesignAngleRad;
    public static double DesignPointInletRecovery => Data.Value.DesignPointInletRecovery;
    public static double DesignPointDragN => Data.Value.DesignPointDragN;
    public static double DesignPointDynamicPressurePa => Data.Value.DesignPointDynamicPressurePa;
    public static double DesignPointZeroLiftDragCoefficient =>
        Data.Value.DesignPointZeroLiftDragCoefficient;
    public static double ReducedOrderInducedDragK => Data.Value.ReducedOrderInducedDragK;
    public static double LowSpeedLiftCurveSlopePerRad =>
        2.0 * System.Math.PI * AspectRatio / (AspectRatio + 2.0);
    public static double DesignPointThermalMarginK => Data.Value.DesignPointThermalMarginK;
    public static double MaximumScreenedMach => Data.Value.MaximumScreenedMach;
    public static string BindingThermalZoneId => Data.Value.BindingThermalZoneId;
    public static double BindingThermalLimitK => Data.Value.BindingThermalLimitK;
    public static double BindingThermalRiseFraction => Data.Value.BindingThermalRiseFraction;
    public static AerothermalLimitReferenceKind BindingThermalReference =>
        Data.Value.BindingThermalReference;
    public static double CmcHotEdgeLimitK => Data.Value.CmcHotEdgeLimitK;
    public static double RunwayLengthM => Data.Value.RunwayLengthM;
    public static double ArrestorStationM => Data.Value.ArrestorStationM;

    sealed record DesignData(
        string Id,
        string Revision,
        string CanonicalSha256,
        double LengthM,
        double SpanM,
        double HeightM,
        double ReferenceAreaM2,
        double MeanAerodynamicChordM,
        double AspectRatio,
        double WettedAreaM2,
        double EnclosedVolumeM3,
        double FrontalAreaM2,
        double InletCaptureAreaM2,
        PropulsionPackageData PropulsionPackage,
        double InletDesignFlowIncidenceRad,
        double InletRamRegimeStartMach,
        double InletUnstartTripDeviationRad,
        double InletUnstartClearDeviationRad,
        double InletUnstartRecoveryFloor,
        double InletCharacteristicAngleAtRamStartRad,
        double InletCharacteristicAngleDecreaseRadPerMach,
        double InletMinimumCharacteristicAngleRad,
        double InletRecoveryOnsetBlendMach,
        double InstalledThrustRetention,
        double SeaLevelStaticDryThrustN,
        double MaximumAugmentedThrustRatio,
        double TurbineFadeStartMach,
        double TurbineFadeCompleteMach,
        double IdleFuelFlowLbPerMinute,
        double MilitaryFuelFlowLbPerMinute,
        double AugmentedFuelFlowLbPerMinute,
        double RamStreamAugmentationRatio,
        SchedulePoint[] CaptureEfficiencySchedule,
        SchedulePoint[] SpecificThrustScheduleNPerKgS,
        double EmptyMassKg,
        double FuelCapacityKg,
        double GrossMassKg,
        double RollInertiaKgM2,
        double PitchInertiaKgM2,
        double YawInertiaKgM2,
        double DesignMach,
        double MinimumDashMach,
        double DesignAltitudeM,
        double MaximumDynamicPressurePa,
        double DesignPointNetThrustN,
        double DesignPointRawRamThrustN,
        double DesignPointTrimAlphaRad,
        double DesignPointInletOffDesignAngleRad,
        double DesignPointInletRecovery,
        double DesignPointDragN,
        double DesignPointDynamicPressurePa,
        double DesignPointZeroLiftDragCoefficient,
        double ReducedOrderInducedDragK,
        double DesignPointThermalMarginK,
        double MaximumScreenedMach,
        string BindingThermalZoneId,
        double BindingThermalLimitK,
        double BindingThermalRiseFraction,
        AerothermalLimitReferenceKind BindingThermalReference,
        double CmcHotEdgeLimitK,
        double RunwayLengthM,
        double ArrestorStationM);

    sealed record PropulsionPackageData(
        string ArchitectureKind,
        double CoreDiameterM,
        double CoreLengthM,
        double EnvelopeDiameterM,
        double EnvelopeLengthM,
        double PackageMassKg,
        double StructuralRadialClearanceM,
        double ThermalRadialClearanceM,
        double TunnelMinimumRadialClearanceM,
        double ClearCoannularAreaM2,
        double RequiredChokedAreaM2,
        double PressureRecoveryFloorFraction,
        double MinimumRecoveryRequiredFraction,
        double NozzleAreaM2,
        double FireBulkheadGapM,
        bool CollisionPass,
        bool FlowAreaPass);

    readonly record struct SchedulePoint(double Mach, double Value);

    static DesignData Load() {
        using JsonDocument definition = ReadResource(DefinitionResource);
        using JsonDocument engineering = ReadResource(EngineeringResource);
        JsonElement def = definition.RootElement;
        JsonElement eng = engineering.RootElement;

        RequireString(def, "schema", "guns-only.shape-first-airframe-definition.v1");
        RequireString(eng, "schema", "guns-only.shape-derived-airframe-engineering.v1");
        JsonElement authority = def.GetProperty("authority");
        if (!authority.GetProperty("geometryIsCanonical").GetBoolean())
            throw new InvalidDataException("Rapier v2 geometry is not canonical");
        RequireString(authority, "runtimeBinding", RuntimeBinding);
        JsonElement source = eng.GetProperty("source");
        RequireString(source, "runtimeBinding", RuntimeBinding);
        string id = source.GetProperty("id").GetString()
            ?? throw new InvalidDataException("Rapier v2 source id is missing");
        string revision = source.GetProperty("revision").GetString()
            ?? throw new InvalidDataException("Rapier v2 revision is missing");
        string sha = source.GetProperty("canonicalSha256").GetString()
            ?? throw new InvalidDataException("Rapier v2 canonical hash is missing");
        if (sha.Length != 64)
            throw new InvalidDataException("Rapier v2 canonical hash is malformed");

        JsonElement reference = eng.GetProperty("referenceGeometry");
        JsonElement masses = eng.GetProperty("massProperties");
        JsonElement grossInertia = masses.GetProperty("grossInertiaKgM2");
        JsonElement propulsion = eng.GetProperty("propulsion");
        JsonElement packaging = propulsion.GetProperty("packaging");
        JsonElement packageArchitecture = packaging.GetProperty("architecture");
        RequireString(packageArchitecture, "kind",
            "single-inlet-coannular-variable-cycle-shared-nozzle");
        RequireString(packageArchitecture, "epistemic", "provisional-fictional-integration");
        JsonElement packageCore = packaging.GetProperty("core");
        JsonElement packageEnvelope = packaging.GetProperty("envelope");
        JsonElement packageFireBulkhead = packaging.GetProperty("fireBulkhead");
        JsonElement packageTunnel = packaging.GetProperty("tunnel");
        JsonElement packageFlow = packaging.GetProperty("flowCapacity");
        bool packageCollisionPass = packaging.GetProperty(
            "internalVolumeCollisionPass").GetBoolean();
        bool packageFlowPass = packageFlow.GetProperty("passes").GetBoolean();
        if (!packageCollisionPass || !packageFlowPass)
            throw new InvalidDataException("Rapier v2 propulsion package does not pass clearance");
        var propulsionPackage = new PropulsionPackageData(
            packageArchitecture.GetProperty("kind").GetString()!,
            Number(packageCore, "diameterM"),
            Number(packageCore, "lengthM"),
            Number(packageEnvelope, "diameterM"),
            Number(packageEnvelope, "lengthM"),
            Number(packageEnvelope, "massKg"),
            Number(packageEnvelope, "structuralRadialClearanceM"),
            Number(packageEnvelope, "thermalRadialClearanceM"),
            Number(packageTunnel, "minimumRadialClearanceM"),
            Number(packageTunnel, "minimumClearCoannularAreaM2"),
            Number(packageFlow, "requiredChokedAreaM2"),
            Number(packageFlow, "pressureRecoveryFloorFraction"),
            Number(packageFlow, "minimumRecoveryRequiredFraction"),
            Number(packageFlow, "nozzleAreaM2"),
            Number(packageFireBulkhead, "actualGapM"),
            packageCollisionPass,
            packageFlowPass);
        JsonElement inletFlow = propulsion.GetProperty("inletFlow");
        JsonElement inletFlowModel = inletFlow.GetProperty("offDesignFlowModel");
        JsonElement inletDesignPoint = inletFlow.GetProperty("designPoint");
        JsonElement turbineCore = propulsion.GetProperty("turbineCore");
        JsonElement fuelAnchors = turbineCore.GetProperty("fuelFlowAnchorsLbPerMinute");
        RequireString(turbineCore, "augmentationAppliesTo", "turbine-stream-only");
        if (System.Math.Abs(Number(turbineCore, "ramStreamAugmentationRatio") - 1.0) > 1e-12)
            throw new InvalidDataException("Rapier v2 ram stream must not inherit turbine augmentation");
        if (Number(turbineCore, "fadeCompleteMach")
            <= Number(turbineCore, "fadeStartMach"))
            throw new InvalidDataException("Rapier v2 turbine fade interval is not ascending");
        if (Number(inletFlowModel, "unstartClearDeviationRad")
            >= Number(inletFlowModel, "unstartTripDeviationRad"))
            throw new InvalidDataException("Rapier v2 inlet unstart hysteresis is not ordered");
        double inletDesignRecovery = Number(inletDesignPoint, "recovery");
        if (inletDesignRecovery <= 0.0 || inletDesignRecovery > 1.0)
            throw new InvalidDataException("Rapier v2 inlet design recovery is outside (0, 1]");
        JsonElement authoredPropulsion = def.GetProperty("propulsionModel");
        JsonElement designPoint = propulsion.GetProperty("designPoint");
        JsonElement dashEnvelope = propulsion.GetProperty("dashEnvelope");
        JsonElement dragBreakdown = designPoint.GetProperty("dragBreakdownN");
        JsonElement dragCorrelation = authoredPropulsion.GetProperty("dragCorrelation");
        JsonElement thermal = eng.GetProperty("thermal").GetProperty("designPoint");
        string bindingZoneId = thermal.GetProperty("bindingZone").GetString()
            ?? throw new InvalidDataException("Rapier v2 binding thermal zone is missing");
        JsonElement bindingZone = FindById(
            def.GetProperty("thermalModel").GetProperty("zones"), bindingZoneId);
        string bindingMaterialId = bindingZone.GetProperty("materialId").GetString()
            ?? throw new InvalidDataException("Rapier v2 binding material is missing");
        JsonElement bindingMaterial = FindById(def.GetProperty("materials"), bindingMaterialId);
        JsonElement cmc = FindById(def.GetProperty("materials"), "sic-sic-cmc");
        string temperatureBasis = bindingZone.GetProperty("temperatureBasis").GetString() ?? "";
        AerothermalLimitReferenceKind bindingReference = temperatureBasis switch {
            "recovery" => AerothermalLimitReferenceKind.RecoveryTemperature,
            "stagnation" => AerothermalLimitReferenceKind.StagnationTemperature,
            _ => throw new InvalidDataException(
                $"Rapier v2 thermal basis '{temperatureBasis}' is unsupported")
        };
        JsonElement requirements = eng.GetProperty("fixedRequirements");
        JsonElement dash = requirements.GetProperty("dash");
        JsonElement recovery = requirements.GetProperty("recoverySite");

        double referenceAreaM2 = Number(reference, "referenceAreaM2");
        double aspectRatio = Number(reference, "aspectRatio");
        double dynamicPressurePa = Number(designPoint, "dynamicPressurePa");
        double trimAndInterference = Number(dragCorrelation, "trimAndInterferenceFactor");
        double zeroLiftDragN = (
            Number(dragBreakdown, "friction")
            + Number(dragBreakdown, "wave")
            + Number(dragBreakdown, "base")) * trimAndInterference;
        double zeroLiftCd = zeroLiftDragN / (dynamicPressurePa * referenceAreaM2);
        double inducedK = trimAndInterference
            / (System.Math.PI * aspectRatio * Number(dragCorrelation, "oswaldEfficiency"));

        return new DesignData(
            id,
            revision,
            sha,
            Number(reference, "lengthM"),
            Number(reference, "spanM"),
            Number(reference, "heightM"),
            referenceAreaM2,
            Number(reference, "meanAerodynamicChordM"),
            aspectRatio,
            Number(reference, "wettedAreaM2"),
            Number(reference, "enclosedVolumeM3"),
            Number(reference, "frontalAreaM2"),
            Number(propulsion, "inletCaptureAreaM2"),
            propulsionPackage,
            Number(inletFlow, "designFlowIncidenceDeg") * System.Math.PI / 180.0,
            Number(inletFlowModel, "ramRegimeStartMach"),
            Number(inletFlowModel, "unstartTripDeviationRad"),
            Number(inletFlowModel, "unstartClearDeviationRad"),
            Number(inletFlowModel, "unstartRecoveryFloor"),
            Number(inletFlowModel, "characteristicAngleAtRamStartRad"),
            Number(inletFlowModel, "characteristicAngleDecreaseRadPerMach"),
            Number(inletFlowModel, "minimumCharacteristicAngleRad"),
            Number(inletFlowModel, "onsetBlendMach"),
            Number(authoredPropulsion, "installedThrustRetention"),
            Number(turbineCore, "seaLevelStaticDryThrustN"),
            Number(turbineCore, "maximumAugmentedThrustRatio"),
            Number(turbineCore, "fadeStartMach"),
            Number(turbineCore, "fadeCompleteMach"),
            Number(fuelAnchors, "idle"),
            Number(fuelAnchors, "military"),
            Number(fuelAnchors, "augmented"),
            Number(turbineCore, "ramStreamAugmentationRatio"),
            ReadSchedule(authoredPropulsion.GetProperty("captureEfficiencySchedule")),
            ReadSchedule(authoredPropulsion.GetProperty("specificThrustScheduleNPerKgS")),
            Number(masses, "emptyMassKg"),
            Number(masses, "fuelCapacityKg"),
            Number(masses, "grossMassKg"),
            Number(grossInertia, "zz"),
            Number(grossInertia, "xx"),
            Number(grossInertia, "yy"),
            Number(dash, "designMach"),
            Number(dash, "minimumMach"),
            Number(dash, "designAltitudeM"),
            Number(dash, "maximumDynamicPressurePa"),
            Number(designPoint, "netThrustN"),
            Number(designPoint, "rawRamStreamThrustN"),
            Number(inletDesignPoint, "trimAlphaRad"),
            Number(inletDesignPoint, "combinedOffDesignAngleRad"),
            inletDesignRecovery,
            Number(designPoint, "dragN"),
            dynamicPressurePa,
            zeroLiftCd,
            inducedK,
            Number(thermal, "minimumMarginK"),
            Number(dashEnvelope, "lastPassingMach"),
            bindingZoneId,
            Number(bindingMaterial, "maximumServiceTemperatureK"),
            Number(bindingZone, "adiabaticRiseFraction"),
            bindingReference,
            Number(cmc, "maximumServiceTemperatureK"),
            Number(recovery, "runwayLengthM"),
            Number(recovery, "arrestorStationM"));
    }

    static SchedulePoint[] ReadSchedule(JsonElement array) {
        SchedulePoint[] result = array.EnumerateArray()
            .Select(point => new SchedulePoint(
                Number(point, "mach"), Number(point, "value")))
            .OrderBy(point => point.Mach)
            .ToArray();
        if (result.Length < 2)
            throw new InvalidDataException("Rapier v2 propulsion schedule needs two points");
        for (int index = 1; index < result.Length; index++) {
            if (result[index].Mach <= result[index - 1].Mach)
                throw new InvalidDataException("Rapier v2 propulsion Mach schedule is not ascending");
        }
        return result;
    }

    static double InterpolateSchedule(SchedulePoint[] schedule, double mach) {
        if (!double.IsFinite(mach)) return 0.0;
        if (mach <= schedule[0].Mach) return schedule[0].Value;
        if (mach >= schedule[^1].Mach) return schedule[^1].Value;
        for (int index = 1; index < schedule.Length; index++) {
            SchedulePoint upper = schedule[index];
            if (mach > upper.Mach) continue;
            SchedulePoint lower = schedule[index - 1];
            double fraction = (mach - lower.Mach) / (upper.Mach - lower.Mach);
            return lower.Value + (upper.Value - lower.Value) * fraction;
        }
        return schedule[^1].Value;
    }

    static JsonDocument ReadResource(string name) {
        Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)
            ?? throw new InvalidDataException($"Missing embedded Rapier v2 resource {name}");
        using (stream) return JsonDocument.Parse(stream);
    }

    static JsonElement FindById(JsonElement array, string id) {
        foreach (JsonElement element in array.EnumerateArray()) {
            if (element.TryGetProperty("id", out JsonElement candidate)
                && candidate.GetString() == id)
                return element;
        }
        throw new InvalidDataException($"Rapier v2 definition has no '{id}' entry");
    }

    static double Number(JsonElement parent, string name) {
        double value = parent.GetProperty(name).GetDouble();
        if (!double.IsFinite(value))
            throw new InvalidDataException($"Rapier v2 {name} is not finite");
        return value;
    }

    static void RequireString(JsonElement parent, string name, string expected) {
        string? actual = parent.GetProperty(name).GetString();
        if (!string.Equals(actual, expected, StringComparison.Ordinal))
            throw new InvalidDataException(
                $"Rapier v2 {name} expected '{expected}', found '{actual}'");
    }
}
