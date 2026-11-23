#include "GunsOnlyHUD.h"
#include "GunsOnlyFlightPawn.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"

void AGunsOnlyHUD::DrawHUD()
{
	Super::DrawHUD();

	APlayerController* PC = GetOwningPlayerController();
	if (PC == nullptr)
	{
		return;
	}
	const AGunsOnlyFlightPawn* FlightPawn = Cast<AGunsOnlyFlightPawn>(PC->GetPawn());
	if (FlightPawn == nullptr || !FlightPawn->GetBridge().HasSession())
	{
		return;
	}

	const GunsSimFrame& Frame = FlightPawn->GetLatestFrame();
	const TArray<GunsSimContact>& Contacts = FlightPawn->GetLatestContacts();
	const FGunsOnlySimBridge& Bridge = FlightPawn->GetBridge();

	const float W = static_cast<float>(Canvas->SizeX);
	const float H = static_cast<float>(Canvas->SizeY);
	const float CX = W * 0.5f;
	const float CY = H * 0.5f;

	const FLinearColor HudGreen(0.18f, 0.96f, 0.45f, 0.92f);
	const FLinearColor HudCyan(0.25f, 0.90f, 1.0f, 0.95f);
	const FLinearColor HudAmber(1.0f, 0.72f, 0.16f, 0.95f);
	const FLinearColor HudRed(1.0f, 0.24f, 0.20f, 0.95f);

	// Center bore-sight reticle
	DrawLine(CX - 14.0f, CY, CX - 4.0f, CY, HudGreen, 1.6f);
	DrawLine(CX + 4.0f, CY, CX + 14.0f, CY, HudGreen, 1.6f);
	DrawLine(CX, CY - 14.0f, CX, CY - 4.0f, HudGreen, 1.6f);
	DrawLine(CX, CY + 4.0f, CX, CY + 14.0f, HudGreen, 1.6f);

	// Flight-path velocity vector projected 2 km down velocity vector
	const FVector PlayerUE = Bridge.SimPosToUE(Frame.pos_east_m, Frame.pos_up_m, Frame.pos_north_m);
	const FVector VelUE = FGunsOnlySimBridge::SimVelToUE(Frame.vel_east_mps, Frame.vel_up_mps, Frame.vel_north_mps);
	if (VelUE.SizeSquared() > 100.0)
	{
		const FVector VelProj = Project(PlayerUE + VelUE.GetSafeNormal() * 200000.0);
		if (VelProj.Z > 0.0 && VelProj.X >= 0.0 && VelProj.X <= W && VelProj.Y >= 0.0 && VelProj.Y <= H)
		{
			const float VX = static_cast<float>(VelProj.X);
			const float VY = static_cast<float>(VelProj.Y);
			DrawLine(VX - 12.0f, VY, VX - 6.0f, VY, HudGreen, 1.6f);
			DrawLine(VX + 6.0f, VY, VX + 12.0f, VY, HudGreen, 1.6f);
			DrawLine(VX, VY - 12.0f, VX, VY - 6.0f, HudGreen, 1.6f);
			DrawLine(VX - 6.0f, VY - 6.0f, VX + 6.0f, VY - 6.0f, HudGreen, 1.4f);
			DrawLine(VX + 6.0f, VY - 6.0f, VX + 6.0f, VY + 6.0f, HudGreen, 1.4f);
			DrawLine(VX + 6.0f, VY + 6.0f, VX - 6.0f, VY + 6.0f, HudGreen, 1.4f);
			DrawLine(VX - 6.0f, VY + 6.0f, VX - 6.0f, VY - 6.0f, HudGreen, 1.4f);
		}
	}

	// Airspeed (left), Altitude (right), Heading (top)
	const int32 KcasInt = FMath::RoundToInt(Frame.kcas);
	const int32 AltFt = FMath::RoundToInt(Frame.pos_up_m * 3.28084);
	double HdgDeg = FMath::RadiansToDegrees(FMath::Atan2(Frame.fwd_east, Frame.fwd_north));
	if (HdgDeg < 0.0) HdgDeg += 360.0;
	const int32 HdgInt = FMath::RoundToInt(HdgDeg) % 360;

	DrawText(FString::Printf(TEXT("%d KT"), KcasInt), HudGreen, CX - 240.0f, CY - 12.0f, nullptr, 1.3f);
	DrawText(FString::Printf(TEXT("%d FT"), AltFt), HudGreen, CX + 175.0f, CY - 12.0f, nullptr, 1.3f);
	DrawText(FString::Printf(TEXT("HDG %03d"), HdgInt), HudGreen, CX - 36.0f, 38.0f, nullptr, 1.3f);

	DrawText(
		FString::Printf(TEXT("M %.2f  AoA %.1f  %.1fG  THR %.0f%%"),
			Frame.mach, Frame.alpha_deg, Frame.nz_g, Frame.throttle01 * 100.0),
		HudGreen, 32.0f, H - 52.0f, nullptr, 1.05f);

	DrawText(
		FString::Printf(TEXT("GUN %d   FUEL %.0f LB   GEAR %s   %s"),
			Frame.ammo_remaining,
			Frame.fuel_lb,
			Frame.gear_down01 > 0.8 ? TEXT("DN") : (Frame.gear_down01 > 0.05 ? TEXT("TR") : TEXT("UP")),
			FlightPawn->IsChaseCameraActive() ? TEXT("CHASE [F2]") : TEXT("COCKPIT [F2]")),
		HudGreen, W - 470.0f, H - 52.0f, nullptr, 1.05f);

	if (Frame.guidance_active != 0)
	{
		const int32 TargetFt = FMath::RoundToInt(Frame.guidance_next_alt_m * 3.28084);
		const int32 TargetKt = FMath::RoundToInt(Frame.guidance_next_tas_mps * 1.9438444924);
		const FLinearColor CueColor = Frame.guidance_in_groove != 0 ? HudGreen : HudCyan;
		DrawText(
			FString::Printf(TEXT("RTB  LEG %d  TGT %d FT · %d KT  GATES %d"),
				Frame.guidance_pattern_leg, TargetFt, TargetKt, Frame.guidance_gate_count),
			CueColor, CX - 190.0f, 70.0f, nullptr, 1.15f);
	}
	else if (Frame.rtb_available != 0)
	{
		DrawText(TEXT("[O] RTB AVAILABLE"), HudAmber, CX - 80.0f, 70.0f, nullptr, 1.0f);
	}

	// Project target diamonds for live aircraft contacts
	for (const GunsSimContact& Contact : Contacts)
	{
		if (Contact.alive == 0) continue;
		const FVector ContactUE = Bridge.SimPosToUE(Contact.pos_east_m, Contact.pos_up_m, Contact.pos_north_m);
		const double DistNm = FVector::Dist(PlayerUE, ContactUE) / 185200.0;
		const FVector Proj = Project(ContactUE);
		if (Proj.Z <= 0.0) continue;

		const float SX = FMath::Clamp(static_cast<float>(Proj.X), 24.0f, W - 24.0f);
		const float SY = FMath::Clamp(static_cast<float>(Proj.Y), 24.0f, H - 24.0f);
		const FLinearColor Color = Contact.role == 3 ? HudCyan : HudRed;
		const float R = 10.0f;
		DrawLine(SX, SY - R, SX + R, SY, Color, 1.6f);
		DrawLine(SX + R, SY, SX, SY + R, Color, 1.6f);
		DrawLine(SX, SY + R, SX - R, SY, Color, 1.6f);
		DrawLine(SX - R, SY, SX, SY - R, Color, 1.6f);
		DrawText(
			FString::Printf(TEXT("%s %.1f NM"), Contact.role == 3 ? TEXT("RELIEF") : TEXT("BANDIT"), DistNm),
			Color, SX + 14.0f, SY - 8.0f, nullptr, 0.95f);
	}
}
