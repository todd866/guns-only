using System.Text.Json;
using GunsOnly.Sim;
using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Web;

public static class OkanaganSnapshotProjection
{
    static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static string BuildStateJson(OkanaganFireMission mission)
    {
        OkanaganMissionSnapshot state = mission.Snapshot();
        FireBossTelemetry aircraft = state.Aircraft;
        (double latitude, double longitude) = OkanaganGeo.ToGeographic(aircraft.PositionWorldM);
        return JsonSerializer.Serialize(new {
            sortie = Token(state.Sortie),
            phase = Token(state.Phase),
            mission_s = state.MissionSeconds,
            position = Point(aircraft.PositionWorldM),
            latitude,
            longitude,
            velocity = Point(aircraft.GroundVelocityMps),
            attitude = new { w = aircraft.BodyAttitude.W, x = aircraft.BodyAttitude.X,
                y = aircraft.BodyAttitude.Y, z = aircraft.BodyAttitude.Z },
            heading_rad = aircraft.HeadingRad,
            pitch_rad = aircraft.PitchRad,
            roll_rad = aircraft.RollRad,
            aoa_rad = aircraft.AngleOfAttackRad,
            pitch_rate_radps = aircraft.PitchRateRadPerSecond,
            roll_rate_radps = aircraft.RollRateRadPerSecond,
            load_factor = aircraft.LoadFactor,
            engine_power_fraction = aircraft.EnginePowerFraction,
            tas_mps = aircraft.TrueAirspeedMps,
            vertical_speed_mps = aircraft.VerticalSpeedMps,
            throttle = aircraft.Throttle,
            water_kg = aircraft.WaterLoadKg,
            water_capacity_kg = FireBossDynamics.MaximumWaterKg,
            water_released_this_tick_kg = aircraft.WaterReleasedThisTickKg,
            fuel_kg = aircraft.FuelKg,
            gross_mass_kg = aircraft.GrossMassKg,
            surface = Token(aircraft.SurfaceMode),
            scoops_commanded = aircraft.ScoopsCommanded,
            scoop_valid = aircraft.ScoopValid,
            scoop_rate_kgps = aircraft.ScoopRateKgPerSecond,
            scoop_fault = aircraft.ScoopFault,
            flyable = aircraft.Flyable,
            route = state.Route.Select((gate, index) => new {
                id = gate.Id,
                label = gate.Label,
                position = Point(gate.PositionWorldM),
                radius_m = gate.RadiusM,
                target_speed_mps = gate.TargetSpeedMps,
                active = index == state.ActiveGateIndex,
                passed = index < state.ActiveGateIndex,
            }),
            active_gate = state.ActiveGateIndex,
            objective = state.Objective,
            radio = state.AirAttackCall,
            cue = state.Cue,
            completed_cycles = state.CompletedCycles,
            effective_drops = state.EffectiveDrops,
            effective_water_kg = state.EffectiveWaterKg,
            fire_intensity = state.FireIntensity,
            burned_area_ha = state.BurnedAreaHa,
            population_exposed = state.PopulationExposed,
            score = state.Score,
            fuel_plan = new {
                block_kg = state.FuelPlan.BlockFuelKg,
                taxi_out_kg = state.FuelPlan.TaxiOutKg,
                outbound_trip_kg = state.FuelPlan.OutboundTripKg,
                working_kg = state.FuelPlan.WorkingFuelKg,
                return_trip_kg = state.FuelPlan.ReturnTripKg,
                operational_reserve_kg = state.FuelPlan.OperationalReserveKg,
                final_reserve_kg = state.FuelPlan.FinalReserveKg,
                taxi_in_kg = state.FuelPlan.TaxiInKg,
                minimum_rtb_kg = state.FuelPlan.MinimumRtbFuelKg,
                above_minimum_kg = state.FuelPlan.FuelAboveMinimumKg,
                endurance_min = state.FuelPlan.EnduranceMinutes,
                state = state.FuelPlan.State,
            },
            fire_cells = state.FireCells.Select(cell => new {
                column = cell.Column,
                row = cell.Row,
                x = cell.X,
                y = cell.Y,
                z = cell.Z,
                intensity = cell.Intensity,
                fuel = cell.Fuel,
                wetness = cell.Wetness,
                fuel_type = cell.FuelType,
            }),
            traffic = state.Traffic.Select(track => new {
                callsign = track.Callsign,
                kind = track.Kind,
                position = Point(track.PositionWorldM),
                heading_rad = track.HeadingRad,
                altitude_m = track.AltitudeM,
                intent = track.Intent,
            }),
        }, JsonOptions);
    }

    static object Point(in Vec3D point) => new { x = point.X, y = point.Y, z = point.Z };
    static string Token<T>(T value) where T : struct, Enum
    {
        string source = value.ToString();
        var token = new System.Text.StringBuilder(source.Length + 4);
        for (int index = 0; index < source.Length; index++)
        {
            char character = source[index];
            if (index > 0 && char.IsUpper(character)) token.Append('-');
            token.Append(char.ToLowerInvariant(character));
        }
        return token.ToString();
    }
}
