#include "GunsOnlyHUD.h"
#include "GunsOnlyFlightPawn.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"

namespace
{
	void DrawDiamond(AHUD* Hud, float X, float Y, float R, const FLinearColor& Color, float Thickness)
	{
		Hud->DrawLine(X, Y - R, X + R, Y, Color, Thickness);
		Hud->DrawLine(X + R, Y, X, Y + R, Color, Thickness);
		Hud->DrawLine(X, Y + R, X - R, Y, Color, Thickness);
		Hud->DrawLine(X - R, Y, X, Y - R, Color, Thickness);
	}

	void DrawBoxOutline(AHUD* Hud, float X0, float Y0, float W, float H, const FLinearColor& Color, float Thickness)
	{
		Hud->DrawLine(X0, Y0, X0 + W, Y0, Color, Thickness);
		Hud->DrawLine(X0 + W, Y0, X0 + W, Y0 + H, Color, Thickness);
		Hud->DrawLine(X0 + W, Y0 + H, X0, Y0 + H, Color, Thickness);
		Hud->DrawLine(X0, Y0 + H, X0, Y0, Color, Thickness);
	}

	void DrawCirclePoly(AHUD* Hud, float CX, float CY, float Radius, int32 Segments, const FLinearColor& Color, float Thickness)
	{
		const float Step = 2.0f * PI / static_cast<float>(Segments);
		FVector2D Prev(CX + Radius, CY);
		for (int32 i = 1; i <= Segments; ++i)
		{
			const float A = i * Step;
			const FVector2D Next(CX + Radius * FMath::Cos(A), CY + Radius * FMath::Sin(A));
			Hud->DrawLine(Prev.X, Prev.Y, Next.X, Next.Y, Color, Thickness);
			Prev = Next;
		}
	}

	double WrapAngle180(double Deg)
	{
		double R = FMath::Fmod(Deg + 180.0, 360.0);
		if (R < 0.0) R += 360.0;
		return R - 180.0;
	}
}

void AGunsOnlyHUD::DrawHUD()
{
	Super::DrawHUD();

	APlayerController* PC = GetOwningPlayerController();
	if (PC == nullptr || Canvas == nullptr)
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
	const GunsSimRunway& Runway = FlightPawn->GetLatestRunway();
	const GunsSimCourseState& Course = FlightPawn->GetLatestCourse();
	const GunsSimLeadCue& Lead = FlightPawn->GetLatestLeadCue();
	const GunsSimCobraState& Cobra = FlightPawn->GetLatestCobraState();
	const FGunsOnlySimBridge& Bridge = FlightPawn->GetBridge();

	const float W = static_cast<float>(Canvas->SizeX);
	const float H = static_cast<float>(Canvas->SizeY);
	const float CX = W * 0.5f;
	const float CY = H * 0.5f;

	const FLinearColor HudGreen(0.18f, 0.96f, 0.45f, 0.92f);
	const FLinearColor HudGreenDim(0.18f, 0.96f, 0.45f, 0.45f);
	const FLinearColor HudCyan(0.25f, 0.92f, 1.0f, 0.95f);
	const FLinearColor HudAmber(1.0f, 0.74f, 0.16f, 0.95f);
	const FLinearColor HudRed(1.0f, 0.24f, 0.20f, 0.95f);
	const FLinearColor PanelBg(0.03f, 0.05f, 0.08f, 0.68f);

	FVector CamLoc = FVector::ZeroVector;
	FRotator CamRot = FRotator::ZeroRotator;
	PC->GetPlayerViewPoint(CamLoc, CamRot);
	const FRotationMatrix CamMat(CamRot);
	const FVector CamFwd = CamMat.GetScaledAxis(EAxis::X);
	const FVector CamRight = CamMat.GetScaledAxis(EAxis::Y);
	const FVector CamUp = CamMat.GetScaledAxis(EAxis::Z);

	auto ProjectWorldClamped = [this, &CamLoc, &CamFwd, &CamRight, &CamUp, W, H, CX, CY](
		const FVector& TargetUE, bool& OutInFront, FVector2D& OutScreen)
	{
		const FVector Delta = TargetUE - CamLoc;
		const double FwdDot = FVector::DotProduct(Delta, CamFwd);
		if (FwdDot > 50.0)
		{
			const FVector P = Project(TargetUE, false);
			OutInFront = true;
			OutScreen = FVector2D(
				FMath::Clamp(static_cast<float>(P.X), 26.0f, W - 26.0f),
				FMath::Clamp(static_cast<float>(P.Y), 26.0f, H - 26.0f));
			return;
		}
		OutInFront = false;
		const double RightComp = FVector::DotProduct(Delta, CamRight);
		const double UpComp = FVector::DotProduct(Delta, CamUp);
		FVector2D Dir2D(static_cast<float>(RightComp), static_cast<float>(-UpComp));
		if (!Dir2D.Normalize())
		{
			Dir2D = FVector2D(0.0f, -1.0f);
		}
		OutScreen = FVector2D(
			FMath::Clamp(CX + Dir2D.X * (CX - 34.0f), 30.0f, W - 30.0f),
			FMath::Clamp(CY + Dir2D.Y * (CY - 34.0f), 30.0f, H - 30.0f));
	};

	// Mission Mode Switcher Badge (visible on both F-22 and Cobra theatres)
	{
		const bool bIsCobraMode = (Cobra.active != 0);
		const FString ModeText = FString::Printf(
			TEXT("%s [1] F-22A RAPTOR   %s [2] AH-1G COBRA   [U] ASSIST: %s   [C/F2] CAM"),
			bIsCobraMode ? TEXT(" ") : TEXT(">"),
			bIsCobraMode ? TEXT(">") : TEXT(" "),
			FlightPawn->IsAssistedFlight() ? TEXT("ON") : TEXT("RAW"));
		DrawRect(PanelBg, 16.0f, 10.0f, 520.0f, 22.0f);
		DrawText(ModeText, HudCyan, 24.0f, 13.0f, nullptr, 0.85f);
	}

	const FVector PlayerUE = Bridge.SimPosToUE(Frame.pos_east_m, Frame.pos_up_m, Frame.pos_north_m);
	const FVector FwdUE = FGunsOnlySimBridge::SimDirToUE(Frame.fwd_east, Frame.fwd_up, Frame.fwd_north);
	const FVector PlaneUpUE = FGunsOnlySimBridge::SimDirToUE(Frame.up_east, Frame.up_up, Frame.up_north);
	const FVector VelUE = FGunsOnlySimBridge::SimVelToUE(Frame.vel_east_mps, Frame.vel_up_mps, Frame.vel_north_mps);

	if (Cobra.active != 0)
	{
		// AH-1G Cobra Gunship Tactical HUD
		const float ColPct = static_cast<float>(Cobra.collective01 * 100.0);
		const float TrqPct = static_cast<float>(Cobra.torque_fraction * 100.0);
		const int32 Mins = FMath::Max(0, Cobra.time_remaining_s) / 60;
		const int32 Secs = FMath::Max(0, Cobra.time_remaining_s) % 60;

		static const TCHAR* GunnerLabels[6] = {
			TEXT("AWAIT TGT"), TEXT("ACQUIRING"), TEXT("TRACKING"),
			TEXT("MASKED"), TEXT("OUT OF LIMITS"), TEXT("INHIBITED")
		};
		const int32 GIdx = FMath::Clamp(Cobra.gunner_state, 0, 5);
		const FLinearColor GunCol = Cobra.gunner_fire_authorized != 0 ? HudAmber
			: (Cobra.gunner_state == 2 ? HudGreen : (Cobra.gunner_state >= 3 ? HudRed : HudCyan));

		// Center Hydra-70 rocket reticle & boresight cross
		DrawCirclePoly(this, CX, CY, 16.0f, 20, HudGreen, 1.5f);
		DrawLine(CX - 26.0f, CY, CX - 16.0f, CY, HudGreen, 1.5f);
		DrawLine(CX + 16.0f, CY, CX + 26.0f, CY, HudGreen, 1.5f);
		DrawLine(CX, CY - 26.0f, CX, CY - 16.0f, HudGreen, 1.5f);
		DrawLine(CX, CY + 16.0f, CX, CY + 26.0f, HudGreen, 1.5f);

		// Top Conquest Strip
		const float StripW = 470.0f;
		const float StripX = CX - StripW * 0.5f;
		DrawRect(PanelBg, StripX, 38.0f, StripW, 44.0f);
		DrawBoxOutline(this, StripX, 38.0f, StripW, 44.0f, HudCyan, 1.2f);
		DrawText(
			FString::Printf(TEXT("IRON BELL   PTS %d - %d   TKT %d / %d   T-%02d:%02d"),
				Cobra.friendly_points, Cobra.hostile_points,
				Cobra.friendly_tickets, Cobra.hostile_tickets,
				Mins, Secs),
			HudGreen, StripX + 14.0f, 43.0f, nullptr, 0.96f);
		DrawText(
			FString::Printf(TEXT("TURRET: %s%s   7.62 %d   RKTS %d/38"),
				GunnerLabels[GIdx],
				Cobra.gunner_fire_authorized != 0 ? TEXT(" [FIRING]") : TEXT(""),
				Frame.ammo_remaining,
				Cobra.rockets_remaining),
			GunCol, StripX + 14.0f, 63.0f, nullptr, 0.90f);

		// Left Rotorcraft Diagnostics
		DrawRect(PanelBg, 22.0f, CY - 62.0f, 165.0f, 118.0f);
		DrawText(FString::Printf(TEXT("RPM  %3.0f"), Cobra.main_rotor_rpm), HudGreen, 32.0f, CY - 52.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("TRQ  %3.0f%%"), TrqPct), TrqPct > 92.0f ? HudRed : HudGreen, 32.0f, CY - 30.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("COL  %3.0f%%"), ColPct), HudCyan, 32.0f, CY - 8.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("SCAS %s"), Cobra.assisted_scas != 0 ? TEXT("AUTO") : TEXT("RAW")),
			Cobra.assisted_scas != 0 ? HudCyan : HudAmber, 32.0f, CY + 14.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("KILLS %d"), Course.kills), HudGreen, 32.0f, CY + 36.0f, nullptr, 0.95f);

		// Right Flight Telemetry
		DrawRect(PanelBg, W - 188.0f, CY - 52.0f, 165.0f, 92.0f);
		DrawText(FString::Printf(TEXT("AGL  %4.0f M"), Cobra.agl_m), Cobra.agl_m < 10.0 ? HudAmber : HudGreen, W - 178.0f, CY - 42.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("VSI  %+5.1f"), Cobra.vertical_speed_mps), HudGreen, W - 178.0f, CY - 20.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("GS   %3.0f KT"), Frame.kcas), HudGreen, W - 178.0f, CY + 2.0f, nullptr, 1.0f);
		DrawText(FString::Printf(TEXT("HDG  %03d"), FMath::RoundToInt(FMath::RadiansToDegrees(FMath::Atan2(Frame.fwd_east, Frame.fwd_north)) + 360.0) % 360),
			HudCyan, W - 178.0f, CY + 24.0f, nullptr, 0.95f);

		// Nav Markers: Iron Bell Bridge & Camp Ember FOB
		auto DrawLandmarkMarker = [this, &Bridge, &PlayerUE, &ProjectWorldClamped, W](
			double E, double U, double N, const TCHAR* Label, const FLinearColor& Col)
		{
			bool bFront = false;
			FVector2D PosS;
			const FVector PosUE = Bridge.SimPosToUE(E, U + 10.0, N);
			ProjectWorldClamped(PosUE, bFront, PosS);
			DrawDiamond(this, PosS.X, PosS.Y, bFront ? 10.0f : 6.0f, Col, 1.5f);
			DrawText(FString::Printf(TEXT("%s %.1f KM"), Label, FVector::Dist(PlayerUE, PosUE) / 100000.0),
				Col, FMath::Clamp(static_cast<float>(PosS.X) + 12.0f, 12.0f, W - 140.0f), PosS.Y - 7.0f, nullptr, 0.85f);
		};
		DrawLandmarkMarker(Cobra.bridge_east_m, Cobra.bridge_up_m, Cobra.bridge_north_m, TEXT("IRON BELL"), HudAmber);
		DrawLandmarkMarker(Cobra.fob_east_m, Cobra.fob_up_m, Cobra.fob_north_m, TEXT("FOB EMBER"), HudCyan);

		// Ground War Units + Locked Target Health Box
		for (const GunsSimContact& Contact : Contacts)
		{
			if (Contact.alive == 0) continue;
			const FVector ContactUE = Bridge.SimPosToUE(Contact.pos_east_m, Contact.pos_up_m + 2.5, Contact.pos_north_m);
			const double DistM = FVector::Dist(PlayerUE, ContactUE) / 100.0;
			if (DistM > 3200.0) continue;
			bool bFront = false;
			FVector2D ScreenPos;
			ProjectWorldClamped(ContactUE, bFront, ScreenPos);
			if (!bFront) continue;
			const bool bHostile = (Contact.role < 14);
			const FLinearColor Col = bHostile ? HudRed : HudCyan;
			DrawDiamond(this, ScreenPos.X, ScreenPos.Y, bHostile ? 8.0f : 6.0f, Col, 1.4f);
		}
		if (Cobra.has_target != 0)
		{
			bool bTgtFront = false;
			FVector2D TgtS;
			const FVector TgtUE = Bridge.SimPosToUE(Cobra.target_east_m, Cobra.target_up_m, Cobra.target_north_m);
			ProjectWorldClamped(TgtUE, bTgtFront, TgtS);
			DrawBoxOutline(this, TgtS.X - 15.0f, TgtS.Y - 15.0f, 30.0f, 30.0f, HudAmber, 2.0f);
			DrawRect(FLinearColor(0.2f, 0.05f, 0.05f, 0.8f), TgtS.X - 16.0f, TgtS.Y + 18.0f, 32.0f, 4.0f);
			DrawRect(HudRed, TgtS.X - 16.0f, TgtS.Y + 18.0f, 32.0f * static_cast<float>(FMath::Clamp(Cobra.target_health01, 0.0, 1.0)), 4.0f);
			DrawText(FString::Printf(TEXT("LOCK %.0f M"), FVector::Dist(PlayerUE, TgtUE) / 100.0),
				HudAmber, TgtS.X + 18.0f, TgtS.Y - 8.0f, nullptr, 0.9f);
		}

		DrawText(
			TEXT("[W/S] CLIMB   [ARROWS] CYCLIC   [A/D] PEDALS   [TAB] TARGET   [SPACE/F] TURRET   [SHIFT/Q/LMB] ROCKETS   [U] SCAS"),
			HudGreen, 22.0f, H - 34.0f, nullptr, 0.84f);

		if (FlightPawn->IsPaused() || Frame.lifecycle == 3 || Frame.player_alive == 0)
		{
			FString Headline = TEXT("PAUSED");
			FLinearColor Accent = HudCyan;
			if (Frame.outcome == 1) { Headline = TEXT("IRON BELL HELD — VICTORY"); Accent = HudGreen; }
			else if (Frame.outcome == 2 || Frame.player_alive == 0) { Headline = TEXT("MISSION DEFEAT / AIRFRAME LOST"); Accent = HudRed; }
			const float CardW = 440.0f, CardH = 98.0f;
			const float CardX = CX - CardW * 0.5f, CardY = H - 175.0f;
			DrawRect(FLinearColor(0.03f, 0.05f, 0.08f, 0.86f), CardX, CardY, CardW, CardH);
			DrawBoxOutline(this, CardX, CardY, CardW, CardH, Accent, 1.8f);
			DrawText(Headline, Accent, CardX + 18.0f, CardY + 14.0f, nullptr, 1.2f);
			DrawText(FString::Printf(TEXT("KILLS %d   PTS %d-%d   TKT %d/%d"),
				Course.kills, Cobra.friendly_points, Cobra.hostile_points, Cobra.friendly_tickets, Cobra.hostile_tickets),
				HudGreen, CardX + 18.0f, CardY + 44.0f, nullptr, 0.96f);
			DrawText(TEXT("[P] RESUME   [R] RESTART   [1] F-22A RAPTOR   [2] AH-1G COBRA"),
				HudCyan, CardX + 18.0f, CardY + 70.0f, nullptr, 0.88f);
		}
		return;
	}

	// Center boresight cross (F-22A)
	DrawLine(CX - 12.0f, CY, CX - 4.0f, CY, HudGreen, 1.5f);
	DrawLine(CX + 4.0f, CY, CX + 12.0f, CY, HudGreen, 1.5f);
	DrawLine(CX, CY - 12.0f, CX, CY - 4.0f, HudGreen, 1.5f);
	DrawLine(CX, CY + 4.0f, CX, CY + 12.0f, HudGreen, 1.5f);

	// Conformal Horizon + 5-deg Pitch Ladder inside central HUD aperture
	const FVector HorizFwd = FVector(CamFwd.X, CamFwd.Y, 0.0).GetSafeNormal();
	if (!HorizFwd.IsNearlyZero())
	{
		const FVector HorizRight(-HorizFwd.Y, HorizFwd.X, 0.0);
		constexpr double FarRangeCm = 400000.0;
		const float ClipMinX = CX - 185.0f;
		const float ClipMaxX = CX + 185.0f;
		const float ClipMinY = 82.0f;
		const float ClipMaxY = H - 88.0f;

		auto DrawConformalBar = [this, &CamLoc, &CamFwd, &HorizFwd, &HorizRight, ClipMinX, ClipMaxX, ClipMinY, ClipMaxY](
			double PitchDeg, double HalfSpanCm, double InnerGapCm, const FLinearColor& Color, float Thickness, bool bTickLabel)
		{
			const double PitchRad = FMath::DegreesToRadians(PitchDeg);
			const FVector RayCenter = HorizFwd * FMath::Cos(PitchRad) + FVector::UpVector * FMath::Sin(PitchRad);
			if (FVector::DotProduct(RayCenter, CamFwd) < 0.25)
			{
				return;
			}
			const FVector CenterW = CamLoc + RayCenter * FarRangeCm;
			const auto DrawHalfSeg = [this, &CenterW, &HorizRight, &CamLoc, &CamFwd, ClipMinX, ClipMaxX, ClipMinY, ClipMaxY, PitchDeg, HalfSpanCm, InnerGapCm, &Color, Thickness, bTickLabel](double Sign)
			{
				const FVector PIn = CenterW + HorizRight * (Sign * InnerGapCm);
				const FVector POut = CenterW + HorizRight * (Sign * HalfSpanCm);
				if (FVector::DotProduct(PIn - CamLoc, CamFwd) <= 50.0 || FVector::DotProduct(POut - CamLoc, CamFwd) <= 50.0)
				{
					return;
				}
				const FVector SIn = Project(PIn, false);
				const FVector SOut = Project(POut, false);
				const bool bInClip =
					SIn.X >= ClipMinX && SIn.X <= ClipMaxX && SIn.Y >= ClipMinY && SIn.Y <= ClipMaxY &&
					SOut.X >= ClipMinX && SOut.X <= ClipMaxX && SOut.Y >= ClipMinY && SOut.Y <= ClipMaxY;
				if (!bInClip)
				{
					return;
				}
				DrawLine(static_cast<float>(SIn.X), static_cast<float>(SIn.Y),
					static_cast<float>(SOut.X), static_cast<float>(SOut.Y), Color, Thickness);
				if (bTickLabel)
				{
					const double TickDir = PitchDeg >= 0.0 ? -1.0 : 1.0;
					const FVector PTick = POut + FVector::UpVector * (TickDir * 4200.0);
					const FVector STick = Project(PTick, false);
					DrawLine(static_cast<float>(SOut.X), static_cast<float>(SOut.Y),
						static_cast<float>(STick.X), static_cast<float>(STick.Y), Color, Thickness);
					if (Sign > 0.0 && FMath::Abs(PitchDeg) >= 5.0)
					{
						DrawText(FString::Printf(TEXT("%+d"), FMath::RoundToInt(PitchDeg)),
							Color, static_cast<float>(SOut.X) + 5.0f, static_cast<float>(SOut.Y) - 7.0f, nullptr, 0.85f);
					}
				}
			};
			DrawHalfSeg(-1.0);
			DrawHalfSeg(+1.0);
		};

		DrawConformalBar(0.0, 95000.0, 14000.0, HudGreen, 1.5f, false);
		for (int32 Deg = -30; Deg <= 30; Deg += 5)
		{
			if (Deg == 0) continue;
			DrawConformalBar(static_cast<double>(Deg), 42000.0, 14000.0, HudGreenDim, 1.2f, true);
		}
	}

	// Flight-Path Marker (FPM) + 11.5 deg Landing AoA E-Bracket
	if (VelUE.SizeSquared() > 100.0)
	{
		bool bVelFront = false;
		FVector2D FpmScreen;
		ProjectWorldClamped(PlayerUE + VelUE.GetSafeNormal() * 400000.0, bVelFront, FpmScreen);
		if (bVelFront && FpmScreen.X > 150.0f && FpmScreen.X < W - 150.0f)
		{
			const float VX = FpmScreen.X;
			const float VY = FpmScreen.Y;
			DrawCirclePoly(this, VX, VY, 6.5f, 12, HudGreen, 1.6f);
			DrawLine(VX - 14.0f, VY, VX - 6.5f, VY, HudGreen, 1.6f);
			DrawLine(VX + 6.5f, VY, VX + 14.0f, VY, HudGreen, 1.6f);
			DrawLine(VX, VY - 12.0f, VX, VY - 6.5f, HudGreen, 1.6f);
		}
	}

	if ((Frame.gear_down01 > 0.25 || Course.armed != 0) && !FwdUE.IsNearlyZero() && !PlaneUpUE.IsNearlyZero())
	{
		constexpr double TargetLandingAoaRad = FMath::DegreesToRadians(11.5);
		const FVector BracketDir = (FwdUE * FMath::Cos(TargetLandingAoaRad) - PlaneUpUE * FMath::Sin(TargetLandingAoaRad)).GetSafeNormal();
		bool bBracketFront = false;
		FVector2D BS;
		ProjectWorldClamped(PlayerUE + BracketDir * 400000.0, bBracketFront, BS);
		if (bBracketFront)
		{
			const FLinearColor ECol = FMath::Abs(Frame.alpha_deg - 11.5) <= 2.0 ? HudGreen : HudCyan;
			const float EX = BS.X - 18.0f;
			DrawLine(EX, BS.Y - 14.0f, EX, BS.Y + 14.0f, ECol, 1.7f);
			DrawLine(EX, BS.Y - 14.0f, EX + 8.0f, BS.Y - 14.0f, ECol, 1.7f);
			DrawLine(EX, BS.Y, EX + 6.0f, BS.Y, ECol, 1.7f);
			DrawLine(EX, BS.Y + 14.0f, EX + 8.0f, BS.Y + 14.0f, ECol, 1.7f);
		}
	}

	// Scrolling KCAS Airspeed Tape (left)
	const float TapeHalfH = 108.0f;
	const float SpdX = CX - 220.0f;
	const double Kcas = Frame.kcas;
	DrawLine(SpdX, CY - TapeHalfH, SpdX, CY + TapeHalfH, HudGreenDim, 1.2f);
	constexpr float PxPerKt = 2.4f;
	const int32 BaseSpdTick = FMath::FloorToInt(Kcas / 10.0) * 10;
	for (int32 SpdTick = BaseSpdTick - 50; SpdTick <= BaseSpdTick + 50; SpdTick += 10)
	{
		if (SpdTick < 0) continue;
		const float TY = CY - static_cast<float>(SpdTick - Kcas) * PxPerKt;
		if (TY < CY - TapeHalfH || TY > CY + TapeHalfH) continue;
		const bool bMajor = (SpdTick % 50 == 0);
		DrawLine(SpdX - (bMajor ? 10.0f : 6.0f), TY, SpdX, TY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TY - CY) > 16.0f)
		{
			DrawText(FString::Printf(TEXT("%d"), SpdTick), HudGreen, SpdX - 44.0f, TY - 7.0f, nullptr, 0.85f);
		}
	}
	if (Course.armed != 0 && Course.next_gate_kcas > 1.0)
	{
		const float BugY = FMath::Clamp(CY - static_cast<float>(Course.next_gate_kcas - Kcas) * PxPerKt,
			CY - TapeHalfH, CY + TapeHalfH);
		DrawLine(SpdX + 2.0f, BugY, SpdX + 10.0f, BugY - 5.0f, HudCyan, 1.8f);
		DrawLine(SpdX + 2.0f, BugY, SpdX + 10.0f, BugY + 5.0f, HudCyan, 1.8f);
	}
	DrawRect(PanelBg, SpdX - 66.0f, CY - 13.0f, 62.0f, 26.0f);
	DrawBoxOutline(this, SpdX - 66.0f, CY - 13.0f, 62.0f, 26.0f, HudGreen, 1.3f);
	DrawText(FString::Printf(TEXT("%3d"), FMath::RoundToInt(Kcas)), HudGreen, SpdX - 58.0f, CY - 9.0f, nullptr, 1.15f);
	DrawText(FString::Printf(TEXT("M %.2f"), Frame.mach), HudGreen, SpdX - 64.0f, CY + TapeHalfH + 8.0f, nullptr, 0.9f);

	// Scrolling Altitude Tape (right)
	const float AltX = CX + 220.0f;
	const double AltFt = Frame.pos_up_m * 3.28084;
	DrawLine(AltX, CY - TapeHalfH, AltX, CY + TapeHalfH, HudGreenDim, 1.2f);
	constexpr float PxPer100Ft = 0.16f;
	const int32 BaseAltTick = FMath::FloorToInt(AltFt / 200.0) * 200;
	for (int32 AltTick = BaseAltTick - 800; AltTick <= BaseAltTick + 800; AltTick += 200)
	{
		if (AltTick < 0) continue;
		const float TY = CY - static_cast<float>(AltTick - AltFt) * PxPer100Ft;
		if (TY < CY - TapeHalfH || TY > CY + TapeHalfH) continue;
		const bool bMajor = (AltTick % 400 == 0);
		DrawLine(AltX, TY, AltX + (bMajor ? 10.0f : 6.0f), TY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TY - CY) > 16.0f)
		{
			DrawText(FString::Printf(TEXT("%d"), AltTick), HudGreen, AltX + 14.0f, TY - 7.0f, nullptr, 0.85f);
		}
	}
	if (Course.armed != 0 && Course.next_gate_alt_ft > 1.0)
	{
		const float BugY = FMath::Clamp(CY - static_cast<float>(Course.next_gate_alt_ft - AltFt) * PxPer100Ft,
			CY - TapeHalfH, CY + TapeHalfH);
		DrawLine(AltX - 2.0f, BugY, AltX - 10.0f, BugY - 5.0f, HudCyan, 1.8f);
		DrawLine(AltX - 2.0f, BugY, AltX - 10.0f, BugY + 5.0f, HudCyan, 1.8f);
	}
	DrawRect(PanelBg, AltX + 4.0f, CY - 13.0f, 74.0f, 26.0f);
	DrawBoxOutline(this, AltX + 4.0f, CY - 13.0f, 74.0f, 26.0f, HudGreen, 1.3f);
	DrawText(FString::Printf(TEXT("%5d"), FMath::RoundToInt(AltFt)), HudGreen, AltX + 10.0f, CY - 9.0f, nullptr, 1.15f);
	double TerrainM = 0.0;
	const double AglFt = Bridge.SampleTerrainMeters(Frame.pos_east_m, Frame.pos_north_m, TerrainM)
		? FMath::Max(0.0, (Frame.pos_up_m - TerrainM) * 3.28084)
		: FMath::Max(0.0, AltFt);
	DrawText(FString::Printf(TEXT("R %4d"), FMath::RoundToInt(AglFt)), HudGreen, AltX + 8.0f, CY + TapeHalfH + 8.0f, nullptr, 0.9f);

	// Top Heading Tape + Son Runway Bearing Caret
	double HdgDeg = FMath::RadiansToDegrees(FMath::Atan2(Frame.fwd_east, Frame.fwd_north));
	if (HdgDeg < 0.0) HdgDeg += 360.0;
	const float HdgTapeY = 46.0f;
	const float HdgHalfW = 140.0f;
	constexpr float PxPerDeg = 5.0f;
	DrawLine(CX - HdgHalfW, HdgTapeY, CX + HdgHalfW, HdgTapeY, HudGreenDim, 1.2f);
	const int32 BaseHdg = FMath::FloorToInt(HdgDeg / 5.0) * 5;
	for (int32 Step = -30; Step <= 30; Step += 5)
	{
		const int32 DegTick = BaseHdg + Step;
		const double Diff = WrapAngle180(static_cast<double>(DegTick) - HdgDeg);
		const float TX = CX + static_cast<float>(Diff) * PxPerDeg;
		if (TX < CX - HdgHalfW || TX > CX + HdgHalfW) continue;
		const bool bMajor = ((DegTick % 10 + 10) % 10 == 0);
		DrawLine(TX, HdgTapeY - (bMajor ? 9.0f : 5.0f), TX, HdgTapeY, HudGreen, 1.2f);
		if (bMajor && FMath::Abs(TX - CX) > 22.0f)
		{
			const int32 Mod360 = ((DegTick % 360) + 360) % 360;
			DrawText(FString::Printf(TEXT("%03d"), Mod360), HudGreen, TX - 12.0f, HdgTapeY - 22.0f, nullptr, 0.85f);
		}
	}
	if (Runway.present != 0)
	{
		const double BrgDeg = FMath::RadiansToDegrees(FMath::Atan2(
			Runway.threshold_east_m - Frame.pos_east_m,
			Runway.threshold_north_m - Frame.pos_north_m));
		const double RelBrg = WrapAngle180(BrgDeg - HdgDeg);
		const float CaretX = FMath::Clamp(CX + static_cast<float>(RelBrg) * PxPerDeg, CX - HdgHalfW, CX + HdgHalfW);
		DrawLine(CaretX, HdgTapeY + 2.0f, CaretX - 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
		DrawLine(CaretX, HdgTapeY + 2.0f, CaretX + 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
		DrawLine(CaretX - 6.0f, HdgTapeY + 10.0f, CaretX + 6.0f, HdgTapeY + 10.0f, HudCyan, 1.8f);
	}
	const int32 HdgInt = FMath::RoundToInt(HdgDeg) % 360;
	DrawRect(PanelBg, CX - 24.0f, HdgTapeY - 26.0f, 48.0f, 22.0f);
	DrawBoxOutline(this, CX - 24.0f, HdgTapeY - 26.0f, 48.0f, 22.0f, HudGreen, 1.2f);
	DrawText(FString::Printf(TEXT("%03d"), HdgInt), HudGreen, CX - 14.0f, HdgTapeY - 22.0f, nullptr, 1.05f);

	// 7-Second Cyan Overhead Carrot Box + Predictor Dot + PAT Gate Strip
	if (Course.armed != 0)
	{
		if (Course.carrot_valid != 0)
		{
			bool bCarrotFront = false;
			FVector2D CarrotS;
			ProjectWorldClamped(
				Bridge.SimPosToUE(Course.carrot_east_m, Course.carrot_up_m, Course.carrot_north_m),
				bCarrotFront, CarrotS);
			const FLinearColor CarrotCol = bCarrotFront ? HudCyan : HudAmber;
			DrawBoxOutline(this, CarrotS.X - 10.0f, CarrotS.Y - 10.0f, 20.0f, 20.0f, CarrotCol, 1.9f);

			bool bPredFront = false;
			FVector2D PredS;
			ProjectWorldClamped(
				Bridge.SimPosToUE(Course.predictor_east_m, Course.predictor_up_m, Course.predictor_north_m),
				bPredFront, PredS);
			if (bPredFront)
			{
				DrawCirclePoly(this, PredS.X, PredS.Y, 4.5f, 10, HudCyan, 1.6f);
				if (bCarrotFront)
				{
					DrawLine(PredS.X, PredS.Y, CarrotS.X, CarrotS.Y, FLinearColor(0.25f, 0.92f, 1.0f, 0.45f), 1.0f);
				}
			}
		}

		// Compact 7-gate PAT progress strip
		static const TCHAR* GateShortNames[7] = { TEXT("IP"), TEXT("INI"), TEXT("BRK"), TEXT("DWN"), TEXT("PCH"), TEXT("FNL"), TEXT("TD") };
		const float StripW = 350.0f;
		const float StripX = CX - StripW * 0.5f;
		const float StripY = 66.0f;
		DrawRect(PanelBg, StripX, StripY, StripW, 38.0f);
		DrawText(
			FString::Printf(TEXT("SON 015  %.1f NM  GS %.1f%s"),
				Course.runway_dist_nm,
				Course.glideslope_deg,
				Course.next_gate_needs_gear != 0 && Frame.gear_down01 < 0.8 ? TEXT("  [GEAR]") : TEXT("")),
			HudCyan, StripX + 8.0f, StripY + 3.0f, nullptr, 0.88f);

		for (int32 g = 0; g < 7; ++g)
		{
			const float GX = StripX + 8.0f + g * 48.0f;
			const float GY = StripY + 19.0f;
			const int32 Grade = Course.gate_grades[g];
			const bool bCurrent = (g == Course.next_gate_index && Course.complete == 0);
			FLinearColor GateCol = FLinearColor(0.45f, 0.54f, 0.60f, 0.85f);
			if (Grade == 1) GateCol = HudGreen;
			else if (Grade == 2) GateCol = HudRed;
			else if (bCurrent) GateCol = HudCyan;
			DrawBoxOutline(this, GX, GY, 44.0f, 15.0f, GateCol, bCurrent ? 1.7f : 1.0f);
			DrawText(GateShortNames[g], GateCol, GX + 9.0f, GY + 1.0f, nullptr, 0.78f);
		}
	}
	else if (Frame.rtb_available != 0)
	{
		DrawText(TEXT("[O] RTB TO SON 015 AVAILABLE"), HudAmber, CX - 110.0f, 68.0f, nullptr, 0.98f);
	}

	// Ballistic Lead Pipper + SHOOT Cue
	if (Lead.has_lead_solution != 0)
	{
		bool bLeadFront = false;
		FVector2D LeadS;
		ProjectWorldClamped(
			Bridge.SimPosToUE(Lead.lead_east_m, Lead.lead_up_m, Lead.lead_north_m),
			bLeadFront, LeadS);
		if (bLeadFront)
		{
			const bool bShoot = (Lead.gun_solution != 0 || Lead.in_gun_window != 0);
			const FLinearColor PipperCol = bShoot ? HudGreen : HudAmber;
			DrawCirclePoly(this, LeadS.X, LeadS.Y, 13.0f, 16, PipperCol, 1.8f);
			DrawLine(LeadS.X - 3.0f, LeadS.Y, LeadS.X + 3.0f, LeadS.Y, PipperCol, 1.5f);
			DrawLine(LeadS.X, LeadS.Y - 3.0f, LeadS.X, LeadS.Y + 3.0f, PipperCol, 1.5f);
			if (bShoot)
			{
				DrawText(TEXT("SHOOT"), HudGreen, LeadS.X - 20.0f, LeadS.Y + 16.0f, nullptr, 0.95f);
			}
		}
	}

	// Contact Diamonds
	for (const GunsSimContact& Contact : Contacts)
	{
		if (Contact.alive == 0) continue;
		const FVector ContactUE = Bridge.SimPosToUE(Contact.pos_east_m, Contact.pos_up_m, Contact.pos_north_m);
		const double DistNm = FVector::Dist(PlayerUE, ContactUE) / 185200.0;
		bool bInFront = false;
		FVector2D ScreenPos;
		ProjectWorldClamped(ContactUE, bInFront, ScreenPos);

		const FLinearColor Color = Contact.role == 3 ? HudCyan : HudRed;
		DrawDiamond(this, ScreenPos.X, ScreenPos.Y, bInFront ? 11.0f : 7.0f, Color, 1.6f);
		DrawText(
			FString::Printf(TEXT("%s %.1f NM"), Contact.role == 3 ? TEXT("RELIEF") : TEXT("SU-27"), DistNm),
			Color,
			FMath::Clamp(ScreenPos.X + 13.0f, 12.0f, W - 120.0f),
			FMath::Clamp(ScreenPos.Y - 8.0f, 12.0f, H - 24.0f),
			nullptr, 0.9f);
	}

	// Bottom Corner Aircraft Status Readouts
	DrawText(
		FString::Printf(TEXT("%.1f G   AoA %.1f   THR %.0f%%   SPD BRK %.0f%%"),
			Frame.nz_g, Frame.alpha_deg, Frame.throttle01 * 100.0, Frame.speedbrake01 * 100.0),
		HudGreen, 28.0f, H - 46.0f, nullptr, 1.0f);

	DrawText(
		FString::Printf(TEXT("GUN %d   FUEL %.0f LB   GEAR %s   %s"),
			Frame.ammo_remaining,
			Frame.fuel_lb,
			Frame.gear_down01 > 0.8 ? TEXT("DN") : (Frame.gear_down01 > 0.05 ? TEXT("TR") : TEXT("UP")),
			FlightPawn->IsChaseCameraActive() ? TEXT("CHASE [F2]") : TEXT("COCKPIT [F2]")),
		HudGreen, W - 475.0f, H - 46.0f, nullptr, 1.0f);

	// Compact Pause / Outcome Debrief Overlay Card
	const bool bShowCard = FlightPawn->IsPaused()
		|| Frame.lifecycle == 3
		|| Frame.player_alive == 0
		|| Course.touchdown_contact != 0;
	if (bShowCard)
	{
		FString Headline = TEXT("PAUSED");
		FLinearColor CardAccent = HudCyan;
		if (Frame.player_alive == 0)
		{
			Headline = TEXT("AIRCRAFT LOST");
			CardAccent = HudRed;
		}
		else if (Course.touchdown_contact != 0)
		{
			Headline = Course.touchdown_survivable != 0 ? TEXT("TOUCHDOWN — SAFE ON DECK") : TEXT("HARD LANDING");
			CardAccent = Course.touchdown_survivable != 0 ? HudGreen : HudRed;
		}
		else if (Frame.lifecycle == 3)
		{
			Headline = Course.combat_complete != 0 ? TEXT("SORTIE COMPLETE — VICTORY") : TEXT("SORTIE ENDED");
			CardAccent = HudGreen;
		}

		const float CardW = 430.0f;
		const float CardH = 104.0f;
		const float CardX = CX - CardW * 0.5f;
		const float CardY = H - 185.0f;
		DrawRect(FLinearColor(0.03f, 0.05f, 0.08f, 0.84f), CardX, CardY, CardW, CardH);
		DrawBoxOutline(this, CardX, CardY, CardW, CardH, CardAccent, 1.6f);
		DrawText(Headline, CardAccent, CardX + 18.0f, CardY + 14.0f, nullptr, 1.25f);
		DrawText(
			FString::Printf(TEXT("KILLS %d   HITS %d   GATES %d/%d   AMMO %d"),
				Course.kills, Course.sortie_hits, Course.passed_gates, Course.total_gates, Frame.ammo_remaining),
			HudGreen, CardX + 18.0f, CardY + 46.0f, nullptr, 0.98f);
		DrawText(TEXT("[P] RESUME   [R] RESTART   [O] RTB   [G] GEAR   [F2] CAM"),
			HudCyan, CardX + 18.0f, CardY + 74.0f, nullptr, 0.88f);
	}
}
