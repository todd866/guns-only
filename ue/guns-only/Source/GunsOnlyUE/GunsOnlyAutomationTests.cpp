#include "Misc/AutomationTest.h"
#include "GunsOnlySimBridge.h"

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
	FGunsOnlyNativeBridgeTest,
	"GunsOnly.NativeBridge.FlightAndRtb",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGunsOnlyNativeBridgeTest::RunTest(const FString& Parameters)
{
	FGunsOnlySimBridge Bridge;
	TestTrue(TEXT("NativeAOT library initializes cleanly"), Bridge.InitializeLibrary());
	TestTrue(TEXT("Beat 7 session creates cleanly"), Bridge.CreateSession(7, 1));

	GunsSimRunway Runway {};
	TestTrue(TEXT("Son conventional runway is exposed"), Bridge.ReadRunway(Runway));
	TestEqual(TEXT("Runway present flag is 1"), Runway.present, 1);
	TestTrue(TEXT("Runway dimensions are realistic"), Runway.length_m >= 600.0 && Runway.width_m >= 15.0);

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

	Bridge.DestroySession();
	return true;
}

#endif
