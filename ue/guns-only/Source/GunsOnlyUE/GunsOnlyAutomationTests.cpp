#include "Misc/AutomationTest.h"
#include "GunsOnlySimBridge.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FGunsOnlyNativeBridgeTest,
	"GunsOnly.NativeBridge.FlightAndRtb",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGunsOnlyNativeBridgeTest::RunTest(const FString& Parameters)
{
	FGunsOnlySimBridge Bridge;
	TestTrue(TEXT("NativeAOT library initializes cleanly"), Bridge.InitializeLibrary());
	TestEqual(TEXT("NativeAOT ABI version matches header v4"), Bridge.GetLoadedAbiVersion(), GUNS_SIM_ABI_VERSION);
	TestTrue(TEXT("Beat 7 session creates cleanly"), Bridge.CreateSession(7, 1));

	GunsSimRunway Runway {};
	TestTrue(TEXT("Son conventional runway is exposed"), Bridge.ReadRunway(Runway));
	TestEqual(TEXT("Runway present flag is 1"), Runway.present, 1);
	TestTrue(TEXT("Runway dimensions are realistic"), Runway.length_m >= 600.0 && Runway.width_m >= 15.0);

	double SonGroundM = 0.0;
	TestTrue(TEXT("Ukraine/Son terrain sampled at runway threshold"),
		Bridge.SampleTerrainMeters(Runway.threshold_east_m, Runway.threshold_north_m, SonGroundM));
	TestTrue(TEXT("Son threshold terrain height matches atlas (~77.5m)"),
		SonGroundM > 60.0 && SonGroundM < 95.0);

	TArray<float> GridHeightsM;
	const int32 SampleCount = Bridge.SampleTerrainGrid(-12000.0, 4000.0, 1500.0, 16, 16, GridHeightsM);
	TestEqual(TEXT("Terrain grid returned 16x16 samples"), SampleCount, 256);
	float MinH = GridHeightsM[0];
	float MaxH = GridHeightsM[0];
	for (int32 i = 1; i < GridHeightsM.Num(); ++i)
	{
		MinH = FMath::Min(MinH, GridHeightsM[i]);
		MaxH = FMath::Max(MaxH, GridHeightsM[i]);
	}
	TestTrue(TEXT("Ukraine terrain grid exhibits > 10m relief"), (MaxH - MinH) > 10.0f);

	Bridge.SetWorldOriginMeters(Runway.threshold_east_m, Runway.threshold_north_m);
	Bridge.Begin();

	for (int32 i = 0; i < 120; ++i)
	{
		Bridge.Advance(1.0 / 120.0, 1);
	}

	GunsSimFrame Frame {};
	TestTrue(TEXT("Frame snapshot readable after 1s"), Bridge.ReadFrame(Frame));
	TestEqual(TEXT("Player alive after 1s"), Frame.player_alive, 1);
	TestTrue(TEXT("Speed exceeds 100 m/s"), Frame.speed_mps > 100.0);

	const FVector PlayerPos = Bridge.SimPosToUE(Frame.pos_east_m, Frame.pos_up_m, Frame.pos_north_m);
	const FQuat PlayerRot = FGunsOnlySimBridge::SimBasisToUEQuat(
		Frame.fwd_east, Frame.fwd_up, Frame.fwd_north,
		Frame.up_east, Frame.up_up, Frame.up_north);
	TestTrue(TEXT("UE position finite"), !PlayerPos.ContainsNaN());
	TestTrue(TEXT("UE rotation orthonormal"), FMath::IsNearlyEqual(PlayerRot.Size(), 1.0, 1e-4));

	TArray<GunsSimContact> Contacts;
	TestTrue(TEXT("At least one contact present"), Bridge.ReadContacts(Contacts) >= 1);

	GunsSimLeadCue Lead {};
	TestTrue(TEXT("Ballistic lead cue readable"), Bridge.ReadLeadCue(Lead));
	TestTrue(TEXT("Lead range is finite and positive"), FMath::IsFinite(Lead.range_m) && Lead.range_m > 100.0);
	TestTrue(TEXT("Lead pipper coordinates finite"),
		FMath::IsFinite(Lead.lead_east_m) && FMath::IsFinite(Lead.lead_up_m) && FMath::IsFinite(Lead.lead_north_m));

	Bridge.SetControls(0.0, 0.0, 0.0, 0.85, false, 1);
	for (int32 i = 0; i < 30; ++i)
	{
		Bridge.Advance(1.0 / 120.0, 1);
	}
	Bridge.SetControls(0.0, 0.0, 0.0, 0.85, false, 0);

	TArray<GunsSimTracer> Tracers;
	TestTrue(TEXT("Gun fire produces live tracers"), Bridge.ReadTracers(Tracers) >= 1);

	TestTrue(TEXT("RequestRtb accepted"), Bridge.RequestRtb());
	for (int32 i = 0; i < 15; ++i)
	{
		Bridge.Advance(1.0 / 120.0, 1);
	}

	TestTrue(TEXT("Frame readable after RTB"), Bridge.ReadFrame(Frame));
	TestEqual(TEXT("RTB active after RequestRtb"), Frame.player_rtb_active, 1);
	TestEqual(TEXT("Approach guidance active"), Frame.guidance_active, 1);

	TArray<GunsSimApproachGate> Gates;
	TestTrue(TEXT("Overhead approach gates populated"), Bridge.ReadGates(Gates) >= 1);

	GunsSimCourseState Course {};
	TestTrue(TEXT("Course state readable after RTB"), Bridge.ReadCourse(Course));
	TestEqual(TEXT("Course armed after RTB"), Course.armed, 1);
	TestEqual(TEXT("Course exposes 7 graded PAT gates"), Course.total_gates, 7);
	TestEqual(TEXT("7-second carrot active after RTB"), Course.carrot_valid, 1);
	TestTrue(TEXT("Carrot, predictor, and glideslope finite"),
		FMath::IsFinite(Course.carrot_east_m) && FMath::IsFinite(Course.predictor_east_m)
		&& FMath::IsFinite(Course.glideslope_deg));

	static const TCHAR* RequiredMeshes[] = {
		TEXT("/Game/GunsOnly/Meshes/SM_F22_Raptor.SM_F22_Raptor"),
		TEXT("/Game/GunsOnly/Meshes/SM_Su27_Flanker.SM_Su27_Flanker"),
		TEXT("/Game/GunsOnly/Meshes/SM_F22_Cockpit.SM_F22_Cockpit"),
		TEXT("/Game/GunsOnly/Meshes/SM_Afterburner_Plume.SM_Afterburner_Plume"),
		TEXT("/Game/GunsOnly/Meshes/SM_Son_ControlTower.SM_Son_ControlTower"),
		TEXT("/Game/GunsOnly/Meshes/SM_Son_Hangar.SM_Son_Hangar"),
		TEXT("/Game/GunsOnly/Meshes/SM_Son_RadarDome.SM_Son_RadarDome"),
		TEXT("/Game/GunsOnly/Meshes/SM_ApproachGate_Portal.SM_ApproachGate_Portal"),
		TEXT("/Game/GunsOnly/Meshes/SM_AH1G_Cobra.SM_AH1G_Cobra"),
		TEXT("/Game/GunsOnly/Meshes/SM_AH1G_MainRotor.SM_AH1G_MainRotor"),
		TEXT("/Game/GunsOnly/Meshes/SM_AH1G_Cockpit.SM_AH1G_Cockpit"),
		TEXT("/Game/GunsOnly/Meshes/SM_Cobra_Bunker.SM_Cobra_Bunker"),
		TEXT("/Game/GunsOnly/Meshes/SM_Cobra_Bridge.SM_Cobra_Bridge"),
		TEXT("/Game/GunsOnly/Meshes/SM_F14_Tomcat.SM_F14_Tomcat"),
		TEXT("/Game/GunsOnly/Meshes/SM_F14_Cockpit.SM_F14_Cockpit"),
		TEXT("/Game/GunsOnly/Meshes/SM_MiG28_Adversary.SM_MiG28_Adversary"),
		TEXT("/Game/GunsOnly/Meshes/SM_Rapier_Interceptor.SM_Rapier_Interceptor"),
		TEXT("/Game/GunsOnly/Meshes/SM_AT802F_FireBoss.SM_AT802F_FireBoss"),
		TEXT("/Game/GunsOnly/Meshes/SM_AT802F_Prop.SM_AT802F_Prop"),
		TEXT("/Game/GunsOnly/Meshes/SM_Carrier_Hull.SM_Carrier_Hull"),
		TEXT("/Game/GunsOnly/Meshes/SM_Balloon_Mine.SM_Balloon_Mine"),
		TEXT("/Game/GunsOnly/Meshes/SM_Cobra_PalmCluster.SM_Cobra_PalmCluster"),
		TEXT("/Game/GunsOnly/Meshes/SM_Cobra_PlantClump.SM_Cobra_PlantClump"),
		TEXT("/Game/GunsOnly/Meshes/SM_Pine_Tree.SM_Pine_Tree")
	};
	for (const TCHAR* MeshPath : RequiredMeshes)
	{
		UStaticMesh* MeshAsset = LoadObject<UStaticMesh>(nullptr, MeshPath);
		TestNotNull(FString::Printf(TEXT("StaticMesh asset loads: %s"), MeshPath), MeshAsset);
	}

	static const TCHAR* RequiredMaterials[] = {
		TEXT("/Game/GunsOnly/Materials/M_Volumetric_Clouds.M_Volumetric_Clouds"),
		TEXT("/Game/GunsOnly/Materials/M_Ukraine_Terrain.M_Ukraine_Terrain"),
		TEXT("/Game/GunsOnly/Materials/M_Cobra_Jungle_Terrain.M_Cobra_Jungle_Terrain"),
		TEXT("/Game/GunsOnly/Materials/M_Okanagan_Terrain.M_Okanagan_Terrain"),
		TEXT("/Game/GunsOnly/Materials/M_Ocean_Water.M_Ocean_Water"),
		TEXT("/Game/GunsOnly/Materials/M_Okanagan_Lake.M_Okanagan_Lake"),
		TEXT("/Game/GunsOnly/Materials/M_Palm_Leaves.M_Palm_Leaves"),
		TEXT("/Game/GunsOnly/Materials/M_Cobra_Plants.M_Cobra_Plants"),
		TEXT("/Game/GunsOnly/Materials/M_F22_RAM_Body.M_F22_RAM_Body"),
		TEXT("/Game/GunsOnly/Materials/M_F14_NavyGray.M_F14_NavyGray"),
		TEXT("/Game/GunsOnly/Materials/M_Su27_Splinter.M_Su27_Splinter"),
		TEXT("/Game/GunsOnly/Materials/M_AH1G_OliveDrab.M_AH1G_OliveDrab"),
		TEXT("/Game/GunsOnly/Materials/M_Papi_Lamp.M_Papi_Lamp"),
		TEXT("/Game/GunsOnly/Materials/M_Afterburner_Core.M_Afterburner_Core"),
		TEXT("/Game/GunsOnly/Materials/M_Rocket_Flare.M_Rocket_Flare")
	};
	for (const TCHAR* MatPath : RequiredMaterials)
	{
		UMaterialInterface* MatAsset = LoadObject<UMaterialInterface>(nullptr, MatPath);
		TestNotNull(FString::Printf(TEXT("Material asset loads: %s"), MatPath), MatAsset);
	}

	Bridge.DestroySession();

	// Beat 100: AH-1G Cobra Canyon hands-off SCAS stability, canyon relief, rockets & ground war
	TestTrue(TEXT("Beat 100 Cobra session creates cleanly"), Bridge.CreateSession(GUNS_SIM_BEAT_COBRA_CANYON, 1));
	TArray<float> CanyonGridM;
	const int32 CanyonSamples = Bridge.SampleTerrainGrid(-4500.0, -5000.0, 400.0, 16, 16, CanyonGridM);
	TestEqual(TEXT("Cobra Canyon grid returned 16x16 samples"), CanyonSamples, 256);
	float CMin = CanyonGridM[0];
	float CMax = CanyonGridM[0];
	for (int32 i = 1; i < CanyonGridM.Num(); ++i)
	{
		CMin = FMath::Min(CMin, CanyonGridM[i]);
		CMax = FMath::Max(CMax, CanyonGridM[i]);
	}
	TestTrue(TEXT("Cobra Canyon exhibits > 40m relief"), (CMax - CMin) > 40.0f);

	Bridge.Begin();
	for (int32 i = 0; i < 360; ++i)
	{
		Bridge.Advance(1.0 / 120.0, 1);
	}

	GunsSimFrame CobraFrame {};
	TestTrue(TEXT("Cobra frame readable after 3s hands-off"), Bridge.ReadFrame(CobraFrame));
	TestEqual(TEXT("Cobra airframe alive after 3s hands-off"), CobraFrame.player_alive, 1);

	GunsSimCobraState Cobra {};
	TestTrue(TEXT("Cobra state readable"), Bridge.ReadCobraState(Cobra));
	TestEqual(TEXT("Cobra active flag is 1"), Cobra.active, 1);
	TestEqual(TEXT("Cobra SCAS assist enabled by default"), Cobra.assisted_scas, 1);
	TestTrue(TEXT("Cobra maintains safe AGL > 15m hands-off"), Cobra.agl_m > 15.0);
	TestTrue(TEXT("Cobra main rotor RPM nominal > 250"), Cobra.main_rotor_rpm > 250.0);

	TestTrue(TEXT("CycleTarget selects a hostile unit"), Bridge.CycleTarget());
	TestTrue(TEXT("Cobra state shows locked target"), Bridge.ReadCobraState(Cobra) && Cobra.has_target == 1);

	TestEqual(TEXT("Cobra spawns with 38 Hydra-70 rockets"), Cobra.rockets_remaining, 38);
	TestTrue(TEXT("FireRocket succeeds"), Bridge.FireRocket());
	Bridge.Advance(1.0 / 120.0, 1);
	TestTrue(TEXT("FireRocket decrements pod count to 37"), Bridge.ReadCobraState(Cobra) && Cobra.rockets_remaining == 37);

	TArray<GunsSimTracer> CobraTracers;
	TestTrue(TEXT("Fired Hydra-70 rocket appears as tracer"), Bridge.ReadTracers(CobraTracers) >= 1);
	TArray<GunsSimContact> CobraContacts;
	TestTrue(TEXT("Cobra GroundWar exposes >= 4 ground units"), Bridge.ReadContacts(CobraContacts) >= 4);

	Bridge.DestroySession();

	// Beat 200 (Top Gun F-14 Carrier), Beat 12 (Rapier), Beat 300 (Okanagan Fire Boss), Beat 105 (First Run)
	{
		TestTrue(TEXT("Beat 200 Top Gun creates"), Bridge.CreateSession(GUNS_SIM_BEAT_TOPGUN_F14, 1));
		Bridge.Begin();
		Bridge.Advance(1.0 / 60.0, 2);
		GunsSimCarrierState Carrier {};
		TestTrue(TEXT("Top Gun exposes maritime carrier"), Bridge.ReadCarrier(Carrier) && Carrier.present == 1);
		GunsSimWeatherState Weather {};
		TestTrue(TEXT("Weather state valid"), Bridge.ReadWeather(Weather) && FMath::IsFinite(Weather.local_visibility_m));
		GunsSimGunFunnel Funnel {};
		TestTrue(TEXT("Gun funnel returns 9 samples"), Bridge.ReadGunFunnel(Funnel) && Funnel.valid == 1 && Funnel.sample_count == 9);
		Bridge.DestroySession();
	}
	{
		TestTrue(TEXT("Beat 12 Rapier creates"), Bridge.CreateSession(GUNS_SIM_BEAT_RAPIER_INTERCEPT, 1));
		Bridge.Begin();
		Bridge.Advance(1.0 / 60.0, 2);
		GunsSimFrame RF {};
		TestTrue(TEXT("Rapier frame readable and alive"), Bridge.ReadFrame(RF) && RF.player_alive == 1);
		GunsSimRunway RapierStrip {};
		TestTrue(TEXT("Rapier exposes 3km dispersed arresting strip"),
			Bridge.ReadRunway(RapierStrip) && RapierStrip.present == 1 && RapierStrip.length_m >= 3000.0);
		GunsSimWeatherState RW {};
		TestTrue(TEXT("Rapier weather exposes cloud layers"), Bridge.ReadWeather(RW) && RW.layer_count >= 1);
		Bridge.DestroySession();
	}
	{
		TestTrue(TEXT("Beat 300 Okanagan Fire Boss creates"), Bridge.CreateSession(GUNS_SIM_BEAT_OKANAGAN_FIREBOSS, 1));
		Bridge.Begin();
		Bridge.Advance(1.0 / 60.0, 2);
		GunsSimOkanaganState Ok {};
		TestTrue(TEXT("Okanagan active with water capacity and fire cells"),
			Bridge.ReadOkanagan(Ok) && Ok.active == 1 && Ok.water_capacity_kg > 1000.0 && Ok.fire_cell_count > 0);
		TArray<GunsSimFireCell> Cells;
		TestTrue(TEXT("Okanagan fire cells readable"), Bridge.ReadFireCells(Cells) > 0);
		Bridge.DestroySession();
	}
	return true;
}

#endif
